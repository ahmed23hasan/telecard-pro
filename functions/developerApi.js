// ============================================================================
// ☁️ بوابة الـ API ومستقبل الـ Webhooks (functions/developerApi.js) - النسخة الماسية V18.1.0 💎
// 🎯 الوظيفة: بوابة تجار الجملة المتكاملة (إنشاء طلب، فحص، رصيد، جلب المنتجات، وطابور Webhooks).
// 🚀 التحديثات المعمارية (V18.1.0 - Tier Pricing Parity, Strict QTY & Fail-Safe FX):
// 1. Tier Pricing Parity ⚖️: جلب قائمة المستويات (tiers) من الكاش واستخدام getUserTier لتسعير الـ API مطابقاً للمتجر.
// 2. Fail-Safe FX Guard 🛡️: منع تسرب سعر الدولار كعملة محلية عند فشل التحويل (إرجاع 0).
// 3. Counter 8-Decimal API Parity 🔬: حفظ دقة الـ 8 خانات لوحدة منتجات العداد لتجار الجملة.
// 4. Exact MaxQty 📦: توحيد سقف الشراء للمنتجات العادية إلى 100 كود كحد أقصى افتراضي.
// 5. Stale Signature Cleanup 🔐: تصفير توقيع الـ Webhook عند إزالة التاجر للمفتاح السري.
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const SecurityEngine = require('./securityEngine.js'); 
const FinancialEngine = require('./financialEngine.js');
const OrderService = require('./services/OrderService.js');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ==========================================
// 🛡️ الدرع المركزي للتقييد (In-Memory Global Rate Limiter) - Zero Cost
// ==========================================
const RATE_LIMIT_WINDOW_MS = 1000; 
const MAX_REQUESTS_PER_SEC = 5;    
const apiRateLimits = new Map();   

// ⚡ كاش الكتالوج الذكي المرتبط بـ cache_version لحماية قراءات Firestore على مقياس 1500+ منتج
let _apiCatalogCache = {
    catalogVersion: -1,
    configVersion: -1,
    fetchedAt: 0,
    prodsDocs: null,
    rates: [],
    tiers: [] // 🛡️ تمت إضافة المستويات لمطابقة التسعير
};

const checkRateLimit = async (hashedKey) => {
    if (!hashedKey || hashedKey.length !== 64) return false;

    const now = Date.now();
    const record = apiRateLimits.get(hashedKey);

    if (apiRateLimits.size > 10000) {
        for (const [key, val] of apiRateLimits.entries()) {
            if (now > val.resetAt) apiRateLimits.delete(key);
        }

        if (apiRateLimits.size > 9000) {
            if (!record) {
                const oldestKey = apiRateLimits.keys().next().value;
                if (oldestKey) apiRateLimits.delete(oldestKey);
            }
        }
    }

    if (!record || now > record.resetAt) {
        apiRateLimits.set(hashedKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }

    if (record.count < MAX_REQUESTS_PER_SEC) {
        record.count += 1;
        return true;
    }

    return false;
};

// ==========================================
// 🛡️ دالة الاتصال الآمن للـ Webhooks (عبر المحرك المركزي)
// ==========================================
async function secureWebhookFetch(urlString, payload, preComputedSignature) {
    const headers = { 'Content-Type': 'application/json' };
    if (preComputedSignature) headers['X-Telecard-Signature'] = preComputedSignature;

    return await SecurityEngine.secureHttpsRequest(urlString, {
        method: 'POST',
        headers: headers,
        body: payload,
        timeout: 10000,
        maxResponseBytes: 1024 * 1024, // 1MB Maximum
        parseJson: false
    });
}

// 🛡️ [إلغاء الإشعارات القديمة العالقة لضمان تسليم أحدث البيانات دائماً عبر الفهرس المركب]
async function supersedeOldFailedWebhooks(userId, orderIdStr, currentStatus = null) {
    try {
        const TERMINAL_STATUSES = ['completed', 'rejected', 'refunded', 'returned'];
        const isCurrentTerminal = TERMINAL_STATUSES.includes(currentStatus);

        const oldFailedSnaps = await db.collection('telecard_failed_webhooks')
            .where('userId', '==', String(userId))
            .where('orderId', '==', String(orderIdStr))
            .where('status', '==', 'failed')
            .limit(25)
            .get();

        if (!oldFailedSnaps.empty) {
            const cancelBatch = db.batch();
            let hasUpdates = false;
            
            oldFailedSnaps.docs.forEach(d => {
                const docData = d.data();
                const docStatus = docData.payload?.status;
                if (!isCurrentTerminal && TERMINAL_STATUSES.includes(docStatus)) return;

                cancelBatch.update(d.ref, { 
                    status: 'superseded', 
                    supersededAt: admin.firestore.FieldValue.serverTimestamp(),
                    nextRetryAt: admin.firestore.FieldValue.delete()
                });
                hasUpdates = true;
            });
            
            if (hasUpdates) await cancelBatch.commit();
        }
    } catch (cleanupErr) { }
}

async function logFailedWebhook(payload, webhookUrl, errorMsg, userId, signature, orderDocId = null) {
    const nextRetryMs = Date.now() + (15 * 60 * 1000); 
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    
    const lowerErr = String(errorMsg || '').toLowerCase();
    const isSecurityBlocked = lowerErr.includes('security') || lowerErr.includes('blocked');

    let initialStatus = isSecurityBlocked ? 'permanently_failed' : 'failed';
    if (!isSecurityBlocked && orderDocId && payload && ['pending', 'processing'].includes(payload.status)) {
        try {
            const liveOrderSnap = await db.collection('telecard_orders').doc(String(orderDocId)).get();
            if (liveOrderSnap.exists && liveOrderSnap.data().status !== payload.status) {
                initialStatus = 'superseded';
            }
        } catch (e) { }
    }

    const safePayloadForStorage = payload ? { ...payload } : {};
    if (safePayloadForStorage.deliveredCode && typeof SecurityEngine.encryptOrderAudit === 'function') {
        const encryptedToken = SecurityEngine.encryptOrderAudit({ code: safePayloadForStorage.deliveredCode });
        if (encryptedToken) {
            safePayloadForStorage._encryptedCode = encryptedToken;
            safePayloadForStorage.deliveredCode = null;
        }
    }

    await db.collection('telecard_failed_webhooks').add({
        userId: String(userId), 
        orderId: payload?.orderId ? String(payload.orderId) : null,
        orderDocId: orderDocId ? String(orderDocId) : (payload?.orderId ? String(payload.orderId) : null),
        payload: safePayloadForStorage, 
        webhookUrl: webhookUrl, 
        attempts: 1,
        signature: signature || null, 
        status: initialStatus, 
        error: errorMsg || 'Unknown Connection Error', 
        lastAttempt: admin.firestore.FieldValue.serverTimestamp(),
        ...(initialStatus === 'failed' ? { nextRetryAt: admin.firestore.Timestamp.fromMillis(nextRetryMs) } : {}),
        ...(initialStatus === 'superseded' && { supersededAt: admin.firestore.FieldValue.serverTimestamp() }),
        expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + THIRTY_DAYS_MS)
    });
}

// ==========================================
// 🔔 1. مشغل إشعارات التجار (Webhooks)
// ==========================================
exports.orderStatusWebhook = onDocumentWritten({ 
    document: 'telecard_orders/{orderId}',
    region: 'us-east1' 
}, async (event) => {
    if (!event.data.after.exists) return null;
    const after = event.data.after.data();
    const before = event.data.before.exists ? event.data.before.data() : null;
    
    if (before && before.status === after.status && before.deliveredCode === after.deliveredCode) return null;
    if (!after.isApi && !after.isApiOrder && !after.merchantData) return null; 

    if (!before && after.status === 'processing') return null;
    const orderCreatedMs = FinancialEngine.parseSafeTime(after.time || after.createdAt || before?.time || before?.createdAt) || 0;
    const isImmediateSyncReject = orderCreatedMs > 0 && (Date.now() - orderCreatedMs) < 120000;
    if (before && before.status === 'processing' && after.status === 'rejected' && !before.actionTime && isImmediateSyncReject) return null;    
    
    try {
        const userDoc = await db.collection('telecard_users').doc(String(after.userId)).get();
        if (!userDoc.exists) return null;
        
        const userData = userDoc.data();
        const webhookUrl = userData.webhookUrl;
        const webhookSecret = userData.webhookSecret;
        
        if (!webhookUrl) return null; 
        
        const orderIdStr = String(after.displayId || after.id || event.params.orderId);
        const rawOrderDocId = String(event.params.orderId);

        await supersedeOldFailedWebhooks(after.userId, orderIdStr, after.status);

        const isInitialSupplierTransition = Boolean(before && before.status === 'processing' && after.supplierId);

        const payload = {
            eventId: event.id, 
            event: (!before || isInitialSupplierTransition) ? 'order_created' : 'order_status_changed',
            orderId: orderIdStr, 
            productId: after.prodId, 
            productName: after.product, 
            optIdx: after.optIdx !== undefined ? after.optIdx : null,
            optionName: after.optionName || null,
            status: after.status, 
            pricePaid: after.priceLocalDeducted ?? after.price,
            priceCurrency: after.priceCurrency || 'USD',
            qty: after.qty,
            deliveredCode: after.deliveredCode || null, 
            timestamp: new Date().toISOString()
        };
        
        const signature = SecurityEngine.generateHmacSignature(payload, webhookSecret);

        try {
            const response = await secureWebhookFetch(webhookUrl, payload, signature);
            if (!response.ok) {
                await logFailedWebhook(payload, webhookUrl, `HTTP Error: ${response.status}`, after.userId, signature, rawOrderDocId);
            }
            return true;
        } catch (fetchErr) {
            await logFailedWebhook(payload, webhookUrl, fetchErr.message, after.userId, signature, rawOrderDocId);
            return null;
        }
    } catch (error) { 
        console.error("Webhook Error:", error);
        return null; 
    }
});

// ==========================================
// 🔄 2. نظام المحاولات الذاتي (Index-Powered Retry Cron - المهمة المجدولة 2 من 3)
// ==========================================
exports.cronRetryWebhooks = onSchedule({
    region: 'us-east1', 
    schedule: 'every 15 minutes', 
    timeZone: 'UTC', 
    timeoutSeconds: 540,
    memory: '512MiB',
    maxInstances: 1,
    concurrency: 1
}, async () => {    
    const nowMs = Date.now();
    const nowTimestamp = admin.firestore.Timestamp.fromMillis(nowMs);
    
    const dueSnaps = await db.collection('telecard_failed_webhooks')
        .where('status', '==', 'failed')
        .where('nextRetryAt', '<=', nowTimestamp)
        .orderBy('nextRetryAt', 'asc')
        .limit(100)
        .get();
        
    if (dueSnaps.empty) return null;
    
    const dueDocs = dueSnaps.docs;
    const CONCURRENCY_LIMIT = 20; 
    
    for (let i = 0; i < dueDocs.length; i += CONCURRENCY_LIMIT) {
        const chunk = dueDocs.slice(i, i + CONCURRENCY_LIMIT);
        
        const promises = chunk.map(async (doc) => {
            const data = doc.data(); 
            const currentAttempt = data.attempts + 1; 
            const isLastAttempt = currentAttempt >= 5;
            
            let delayMs = 15 * 60 * 1000; 
            if (currentAttempt === 3) delayMs = 60 * 60 * 1000; 
            if (currentAttempt === 4) delayMs = 6 * 60 * 60 * 1000; 
            
            const nextRetryMs = Date.now() + delayMs;
            const nextRetryTimestamp = admin.firestore.Timestamp.fromMillis(nextRetryMs);
            
            const storedPayload = data.payload ? { ...data.payload } : {};
            const outboundPayload = { ...storedPayload };

            if (outboundPayload._encryptedCode && typeof SecurityEngine.decryptOrderAudit === 'function') {
                const decObj = SecurityEngine.decryptOrderAudit(outboundPayload._encryptedCode);
                if (decObj && decObj.code !== undefined) {
                    outboundPayload.deliveredCode = decObj.code;
                }
            }
            delete outboundPayload._encryptedCode;

            let currentSignature = data.signature;

            try {
                const targetOrderDocId = data.orderDocId || outboundPayload.orderId;
                if (targetOrderDocId && ['pending', 'processing'].includes(outboundPayload.status)) {
                    const liveOrdSnap = await db.collection('telecard_orders').doc(String(targetOrderDocId)).get();
                    if (liveOrdSnap.exists && liveOrdSnap.data().status !== outboundPayload.status) {
                        return doc.ref.update({
                            status: 'superseded',
                            supersededAt: admin.firestore.FieldValue.serverTimestamp(),
                            error: 'Superseded by newer order status',
                            nextRetryAt: admin.firestore.FieldValue.delete()
                        });
                    }
                }

                const userSnap = await db.collection('telecard_users').doc(String(data.userId)).get();
const userData = userSnap.exists ? userSnap.data() : {};

if (
    !userSnap.exists ||
    userData.isDeleted === true ||
    userData.isBanned === true ||
    userData.isIpBanned === true ||
    userData.isRestricted === true ||
    userData.isApiMerchant !== true
) {
    return doc.ref.update({
        status: 'permanently_failed',
        error: 'Merchant account is suspended, restricted, or no longer an API merchant',
        lastAttempt: admin.firestore.FieldValue.serverTimestamp(),
        nextRetryAt: admin.firestore.FieldValue.delete()
    });
}

const currentSecret = userData.webhookSecret ? String(userData.webhookSecret).trim() : null;
const targetWebhookUrl = userData.webhookUrl ? String(userData.webhookUrl).trim() : null;

if (!targetWebhookUrl) {
    return doc.ref.update({
        status: 'permanently_failed',
        error: 'Webhook URL was removed by merchant',
        lastAttempt: admin.firestore.FieldValue.serverTimestamp(),
        nextRetryAt: admin.firestore.FieldValue.delete()
    });
}
                if (currentSecret) {
                    const newIsoTime = new Date().toISOString();
                    outboundPayload.timestamp = newIsoTime;
                    storedPayload.timestamp = newIsoTime;
                    currentSignature = SecurityEngine.generateHmacSignature(outboundPayload, currentSecret); 
                } else {
                    currentSignature = null;
                }

                const response = await secureWebhookFetch(targetWebhookUrl, outboundPayload, currentSignature); 
                
                if (response.ok) {
                    return doc.ref.update({ 
                        status: 'success', 
                        attempts: currentAttempt, 
                        lastAttempt: admin.firestore.FieldValue.serverTimestamp(),
                        payload: storedPayload, 
                        signature: currentSignature,
                        nextRetryAt: admin.firestore.FieldValue.delete()
                    });
                } else {
                    return doc.ref.update({ 
                        status: isLastAttempt ? 'permanently_failed' : 'failed', 
                        attempts: currentAttempt, 
                        error: `HTTP ${response.status}`, 
                        lastAttempt: admin.firestore.FieldValue.serverTimestamp(),
                        ...(isLastAttempt ? { nextRetryAt: admin.firestore.FieldValue.delete() } : { nextRetryAt: nextRetryTimestamp }),
                        payload: storedPayload,
                        signature: currentSignature
                    });
                }
            } catch (err) {
                const errorNote = err.message || 'Unknown Error';
                const lowerErrorNote = errorNote.toLowerCase();
                const isSecurityBlock = lowerErrorNote.includes('blocked') || lowerErrorNote.includes('security');
                const isTerminalFail = isLastAttempt || isSecurityBlock;
                
                return doc.ref.update({ 
                    status: isTerminalFail ? 'permanently_failed' : 'failed', 
                    attempts: currentAttempt, 
                    error: errorNote, 
                    lastAttempt: admin.firestore.FieldValue.serverTimestamp(),
                    ...(isTerminalFail ? { nextRetryAt: admin.firestore.FieldValue.delete() } : { nextRetryAt: nextRetryTimestamp }),
                    payload: storedPayload,
                    signature: currentSignature
                });
            }
        });
        
        await Promise.allSettled(promises);
    }
    
    return true;
});

// ==========================================
// 🔌 3. البوابة الموحدة لتجار الجملة (B2B API Endpoint)
// ==========================================
exports.externalCreateOrder = onRequest({
    region: 'us-east1',
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 10,
    concurrency: 30
}, async (req, res) => {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST or GET.' });
    }

    // 🔗 دعم كافة صيغ إرسال المفتاح السري (x-api-key و Authorization و api-token الخاص بأنظمة المتاجر)
    const apiKeyHeader = req.headers['x-api-key'] || req.headers['authorization'] || req.headers['api-token'];
    if (!apiKeyHeader) return res.status(401).json({ success: false, error: 'Unauthorized: API Key is missing.' });

    const cleanKey = String(apiKeyHeader).replace(/^Bearer\s+/i, '').trim();
    if (cleanKey.length < 20 || cleanKey.length > 200) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key format.' });
    }

    try {
        // 1. 🛡️ استخراج وفحص الـ IP الحقيقي أولاً لحماية ذاكرة السيرفر ومنع التزوير
        const extractedIp = SecurityEngine.extractClientIp(req);
        const clientIp = extractedIp || 'unknown_ip';
        const hashedIp = SecurityEngine.generateSha256Hash(`ip_${clientIp}`);

        const isIpAllowed = await checkRateLimit(hashedIp);
        if (!isIpAllowed) {
            res.set('Retry-After', '1');
            return res.status(429).json({ success: false, error: 'Too Many Requests from this IP. Please slow down.' });
        }

        // 2. 🛡️ فحص معدل طلبات مفتاح التاجر
        const hashedIncomingKey = SecurityEngine.generateSha256Hash(cleanKey);
        const isKeyAllowed = await checkRateLimit(hashedIncomingKey);
        if (!isKeyAllowed) {
            res.set('Retry-After', '1');
            return res.status(429).json({ success: false, error: 'Too Many Requests for this API Key. (Max 5 req/sec)' });
        }

        // 3. 🛡️ التحقق من هوية وصلاحية حساب التاجر
        const usersQuery = await db.collection('telecard_users').where('apiKeyHash', '==', hashedIncomingKey).limit(1).get();
        if (usersQuery.empty) return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key.' });

        const userDoc = usersQuery.docs[0];
        const userData = userDoc.data();

        // 🚀 [التحديث الأمني الصارم]: إضافة isRestricted لصد أي استدعاء API من حساب مقيد فوراً
        if (userData.isDeleted === true || userData.isBanned === true || userData.isIpBanned === true || userData.isRestricted === true) {
            return res.status(403).json({ success: false, code: 'ACCOUNT_BANNED', error: 'Merchant account is suspended, restricted, or banned.' });
        }
        
        if (userData.isApiMerchant !== true) {
            return res.status(403).json({ success: false, error: 'Unauthorized: Account is not configured as an API Merchant.' });
        }
        if (userData.isVerified !== true) {
            return res.status(403).json({ success: false, code: 'ACCOUNT_UNVERIFIED', error: 'Merchant verification (KYC) is required before using API.' });
        }

        const reqPath = String(req.path || '').toLowerCase();
        const queryAction = String(req.query?.action || '').toLowerCase();

        // ====================================================================
        // 💰 أ. خدمة الاستعلام عن الرصيد وملف التاجر (GET ?action=balance أو /profile)
        // ====================================================================
        if (req.method === 'GET' && (queryAction === 'balance' || queryAction === 'profile' || reqPath.endsWith('/profile') || reqPath.endsWith('/balance'))) {
            const walletBal = Number(userData.walletBalance || 0);
            const walletCurr = String(userData.baseCurrency || 'USD').toUpperCase();
            return res.status(200).json({
                success: true,
                balance: walletBal,
                currency: walletCurr,
                email: userData.email || null,
                data: {
                    balance: walletBal,
                    wallet: walletBal,
                    currency: walletCurr,
                    email: userData.email || null
                }
            });
        }

        // ====================================================================
        // 📦 أ-2. خدمة جلب المنتجات والأسعار لتجار الجملة (GET ?action=products أو /products)
        // 💱 تدعم التحويل الديناميكي للعملات + الكاش الذكي المرتبط بـ cache_version
        // ====================================================================
        if (req.method === 'GET' && (queryAction === 'products' || reqPath.endsWith('/products'))) {
    const merchantCurr = String(userData.baseCurrency || 'USD').toUpperCase();
    const merchantTierId = String(userData.tierId || 'TIER_DEFAULT');
    
    const versionSnap = await db.collection('telecard_system').doc('cache_version').get();
    const vData = versionSnap.exists ? versionSnap.data() : {};
    const liveCatVer = Number(vData.catalogVersion || 0);
    const liveConfVer = Number(vData.configVersion || 0);
    const nowMs = Date.now();
    // 🛡️ التحديث المعماري: جلب قائمة المستويات (tiers) مع المنتجات (تحديث فوري مع cache_version أو كل 30 دقيقة)
if (
    !_apiCatalogCache.prodsDocs ||
    _apiCatalogCache.catalogVersion !== liveCatVer ||
    _apiCatalogCache.configVersion !== liveConfVer ||
    (nowMs - _apiCatalogCache.fetchedAt) > 1800000
) {        const [prodsSnap, configSnap, pricingSnap] = await Promise.all([
            db.collection('telecard_prods_public').where('isActive', '==', true).get(),
            db.collection('telecard_system').doc('active_configs').get(),
            db.collection('telecard_system').doc('active_pricing').get()
        ]);
        _apiCatalogCache = {
            catalogVersion: liveCatVer,
            configVersion: liveConfVer,
            fetchedAt: nowMs,
            prodsDocs: prodsSnap.docs.map(d => ({ id: d.id, data: d.data() })),
            rates: (configSnap && configSnap.exists && Array.isArray(configSnap.data().rates)) ? configSnap.data().rates : [],
            tiers: (pricingSnap && pricingSnap.exists && Array.isArray(pricingSnap.data().tiers)) ? pricingSnap.data().tiers : []
        };
    }
    
    const rates = _apiCatalogCache.rates;
    
    // 🛡️ استخدام المحرك المالي لتحديد المستوى الفعلي للتاجر بدقة تطابق الشراء تماماً
    const activeTierObj = FinancialEngine.getUserTier(userData, _apiCatalogCache.tiers);
    const resolvedTierId = String(activeTierObj?.id || merchantTierId);
    
    // 🛡️ دالة التحويل الذكية المعتمدة على الـ FinancialEngine (إرجاع 0 عند فشل التحويل لمنع تسرب سعر الدولار كعملة محلية)
    const toMerchantCurr = (usdPrice, isCounter = false) => {
        if (usdPrice <= 0) return 0;
        if (merchantCurr === 'USD') return isCounter ? FinancialEngine._internalSanitize(usdPrice) : FinancialEngine.sanitizeAmount(usdPrice);
        try {
            if (isCounter) {
                return FinancialEngine.convertViaUSD(usdPrice, 'USD', merchantCurr, rates, 'pricing', true);
            }
            return FinancialEngine.convertViaUSDHelper(usdPrice, 'USD', merchantCurr, rates, 'round', 'pricing');
        } catch (e) {
            return 0; // 🛡️ حماية ضد تسريب السعر غير المحول
        }
    };
    
    const rawFilterIds = req.query?.products_id ? String(req.query.products_id).trim() : '';
const filterIdsSet = rawFilterIds ?
    new Set(rawFilterIds.split(',').map(s => s.trim()).filter(Boolean)) :
    null;

const resolveEffectiveTierPriceUsd = (targetObj) => {
    const expInfo = targetObj.tierPriceExpiries?.[resolvedTierId];
    if (expInfo && expInfo.expiresAt > 0 && expInfo.expiresAt <= nowMs) {
        return Number(expInfo.fallbackPrice || 0);
    }
    return Number(targetObj.tierPrices?.[resolvedTierId] ?? (resolvedTierId === 'TIER_DEFAULT' ? targetObj.price : 0) ?? 0);
};

const catalogList = [];

_apiCatalogCache.prodsDocs.forEach(doc => {
    const p = doc.data;
    const isCounterProd = (p.type === 'counter');
    // 🛡️ توحيد الحد الأقصى// 🛡️ توحيد الحد الأقصى للمنتجات العادية إلى 100 مع دعم simpleMax
const defaultMaxForType = isCounterProd ? 5000000 : 100;
const configuredMaxQty = Number(p.type === 'simple' ? (p.simpleMax || p.maxQty) : p.maxQty) || 0;
const parentMaxQty = configuredMaxQty > 0 ? Math.min(configuredMaxQty, defaultMaxForType) : defaultMaxForType;    if (p.type === 'select' && Array.isArray(p.options)) {
        p.options.forEach((opt, idx) => {
            if (!opt || opt.isActive === false) return;
            const compositeOptId = `${doc.id}__${idx}`;
            if (filterIdsSet && !filterIdsSet.has(compositeOptId) && !filterIdsSet.has(doc.id)) return;
            
            const optPriceUsd = resolveEffectiveTierPriceUsd(opt);
            
            // 🛡️ فحص سلامة السعر الأساسي بالدولار قبل تحويل العملة
            if (optPriceUsd > 0 && optPriceUsd < 9999999) {
                const convertedOptPrice = toMerchantCurr(optPriceUsd, false);
                if (convertedOptPrice > 0) {
                    catalogList.push({
                        id: compositeOptId,
                        product_id: compositeOptId,
                        name: `${p.name} - ${opt.name}`,
                        price: convertedOptPrice,
                        currency: merchantCurr,
                        isAvailable: Boolean(p.isAvailable && opt.isAvailable),
                        quantity: (p.isAvailable && opt.isAvailable) ? 1 : 0
                    });
                }
            }
        });
    } else {
        if (filterIdsSet && !filterIdsSet.has(doc.id)) return;
        const prodPriceUsd = resolveEffectiveTierPriceUsd(p);
        
        // 🛡️ فحص سلامة السعر الأساسي بالدولار قبل تحويل العملة
        if (prodPriceUsd > 0 && prodPriceUsd < 9999999) {
            const convertedProdPrice = toMerchantCurr(prodPriceUsd, isCounterProd);
            if (convertedProdPrice > 0) {
                catalogList.push({
                    id: doc.id,
                    product_id: doc.id,
                    name: p.name,
                    price: convertedProdPrice,
                    currency: merchantCurr,
                    isAvailable: Boolean(p.isAvailable),
                    quantity: p.isAvailable ? parentMaxQty : 0
                });
            }
        }
    }
});    
    return res.status(200).json({
        success: true,
        currency: merchantCurr,
        data: catalogList
    });
}
        // ====================================================================
        // 🔍 ب. خدمة فحص حالة الطلبات (GET ?action=check&orders=[...] أو ?orderId=...)
        // ====================================================================
        if (req.method === 'GET' && (queryAction === 'check' || req.query?.orders || req.query?.orderId || reqPath.endsWith('/check'))) {
            let rawOrderIds = [];
            if (req.query.orders) {
                const rawStr = String(req.query.orders).trim().replace(/^\[|\]$/g, '');
                rawOrderIds = rawStr.split(',').map(s => s.replace(/['"]/g, '').trim()).filter(Boolean);
            } else if (req.query.orderId) {
                rawOrderIds = [String(req.query.orderId).trim()];
            }

            const cleanOrderIds = rawOrderIds.map(id => String(id).replace(/[^a-zA-Z0-9_-]/g, '').trim()).filter(Boolean);
            const uniqueIds = [...new Set(cleanOrderIds)].slice(0, 50);
            if (uniqueIds.length === 0) {
                return res.status(400).json({ success: false, error: 'Bad Request: Provide valid orderId or orders parameter.' });
            }
            const orderRefs = uniqueIds.map(id => db.collection('telecard_orders').doc(String(id)));
            const orderSnaps = await db.getAll(...orderRefs);

            const results = [];
            orderSnaps.forEach(snap => {
                if (!snap.exists) return;
                const ord = snap.data();
                // 🔒 قفل الملكية الصارم
                if (String(ord.userId) !== String(userDoc.id)) return;

                const clientApiStatus = ord.status === 'completed'
                    ? 'accept'
                    : (['rejected', 'refunded', 'returned'].includes(ord.status) ? 'reject' : 'wait');

                results.push({
                    orderId: snap.id,
                    order_id: snap.id,
                    status: ord.status,
                    clientApiStatus: clientApiStatus,
                    productName: ord.product,
                    qty: ord.qty || 1,
                    price: ord.priceLocalDeducted ?? ord.price,
                    currency: ord.priceCurrency || 'USD',
                    deliveredCode: ord.deliveredCode || null,
                    code: ord.deliveredCode || null,
                    replay_api: ord.deliveredCode ? [ord.deliveredCode] : []
                });
            });

            return res.status(200).json({
                success: true,
                data: results
            });
        }

        if (req.method !== 'POST') {
            return res.status(400).json({ success: false, error: 'Bad Request: Specify ?action=balance, ?action=products, or ?action=check&orderId=... for GET, or use POST to create an order.' });
        }

        // ====================================================================
        // 🛒 ج. خدمة إنشاء الطلب (POST Create Order)
        // ====================================================================
        let bodyData = req.body;
        if (typeof bodyData === 'string') {
            try { 
                bodyData = JSON.parse(bodyData); 
            } catch(e) { 
                return res.status(400).json({ success: false, error: 'Bad Request: Invalid JSON payload format.' }); 
            }
        }
        if (!bodyData || typeof bodyData !== 'object' || Array.isArray(bodyData)) {
            return res.status(400).json({ success: false, error: 'Bad Request: Request body must be a valid JSON object.' });
        }

        const rawIdempotencyKey = req.headers['idempotency-key'] || bodyData.idempotencyKey || bodyData.order_uuid;
        if (!rawIdempotencyKey || String(rawIdempotencyKey).length > 200) {
            return res.status(400).json({ success: false, error: 'Bad Request: Idempotency-Key header (or order_uuid in body) is missing or too long (max 200 chars).' });
        }

        const cleanIdempotencyKey = String(rawIdempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
        if (cleanIdempotencyKey.length < 6) {
            return res.status(400).json({ success: false, error: 'Bad Request: Idempotency-Key must contain at least 6 valid alphanumeric characters.' });
        }
        
        const extractedPlayerInput = bodyData.finalInputStr || bodyData.input || bodyData.playerId || bodyData.accountId || bodyData.target || bodyData.account || bodyData.playerTag || '---';
        const extractedSecondaryInput = bodyData.server || bodyData.zoneId || bodyData.zone || bodyData.serverId || null;
        let extractedPlayerInputs = bodyData.playerInputs || null;
        if (!extractedPlayerInputs && extractedSecondaryInput) {
            extractedPlayerInputs = {
                playerId: String(extractedPlayerInput).trim(),
                server: String(extractedSecondaryInput).trim()
            };
        }

        let rawProductId = String(bodyData.productId || bodyData.prodId || bodyData.product_id || '').trim();
        let extractedOptIdx = bodyData.optIdx ?? bodyData.optionIdx ?? bodyData.optionIndex ?? null;

        // 🔗 إذا اشترى التاجر باقة فرعية بصيغة (prodId__1) نقوم بفصل رقم المنتج عن رقم الباقة تلقائياً
        if (rawProductId.includes('__') && (extractedOptIdx === null || extractedOptIdx === undefined || extractedOptIdx === '')) {
            const [baseProdId, parsedIdx] = rawProductId.split('__');
            rawProductId = baseProdId;
            extractedOptIdx = Number(parsedIdx);
        }

        const merchantCurr = String(userData.baseCurrency || 'USD').toUpperCase();
        const genericExpectedPrice = bodyData.expectedPrice ?? bodyData.price ?? null;
        const resolvedExpectedBasePrice = bodyData.expectedBasePrice ?? (merchantCurr === 'USD' ? genericExpectedPrice : null);
        const resolvedExpectedDisplayPrice = bodyData.expectedDisplayPrice ?? (merchantCurr !== 'USD' ? genericExpectedPrice : null);

        const requestData = {
            ...bodyData,
            productId: rawProductId,
            qty: bodyData.qty ?? bodyData.quantity ?? 1,
            optIdx: extractedOptIdx,
            finalInputStr: extractedPlayerInput,
            ...(extractedPlayerInputs && { playerInputs: extractedPlayerInputs }),
            expectedBasePrice: resolvedExpectedBasePrice,
            expectedDisplayPrice: resolvedExpectedDisplayPrice,
            idempotencyKey: cleanIdempotencyKey,
            couponCode: null
        };

        // 🚀 تمرير الـ IP الموثوق للجدار الناري في OrderService
        const context = {
            isApi: true,
            clientIp: clientIp !== 'unknown_ip' ? clientIp : null,
            merchantData: { webhookUrl: userData.webhookUrl || null }
        };

        const resultData = await OrderService.processNewOrder(userDoc.id, requestData, db, null, context);

        return res.status(200).json({ success: true, data: resultData });

    } catch (error) {
        let errMsg = error.message || '';
        const lowerErrMsg = errMsg.toLowerCase();

        // 🚀 استجابة مخصصة بحال ارتد الخطأ من محرك الطلبات بسبب التقييد
        if (errMsg.includes('الحساب مقيد') || lowerErrMsg.includes('account is restricted') || lowerErrMsg.includes('restricted/banned')) {
            return res.status(403).json({ success: false, code: 'ACCOUNT_RESTRICTED', error: 'Merchant account is currently restricted.' });
        }

        if (errMsg.includes('رصيدك غير كاف') || lowerErrMsg.includes('insufficient balance') || errMsg.includes('رصيد غير كاف')) {
            return res.status(402).json({ success: false, code: 'INSUFFICIENT_BALANCE', error: 'Insufficient wallet balance to complete order.' });
        }
        if (
            errMsg.includes('الكمية المتوفرة') ||
            errMsg.includes('الكمية المختارة غير متوفرة') ||
            errMsg.includes('الأكواد المتوفرة') ||
            errMsg.includes('لا توجد أكواد كافية') ||
            errMsg.includes('نفدت') ||
            errMsg.includes('نفد المخزون') ||
            errMsg.includes('المورد معطل مؤقتاً') ||
            errMsg.includes('غير متاح حالياً') ||
            errMsg.includes('غير متوفرة حالياً') ||
            lowerErrMsg.includes('out of stock') ||
            lowerErrMsg.includes('currently unavailable')
        ) {
            return res.status(409).json({ success: false, code: 'OUT_OF_STOCK', error: 'Product or option is currently out of stock.' });
        }
        if (errMsg.includes('الحساب محظور') || lowerErrMsg.includes('account is banned') || errMsg.includes('الحساب محظور.')) {
            return res.status(403).json({ success: false, code: 'ACCOUNT_BANNED', error: 'Merchant account is suspended or banned.' });
        }
        if (errMsg.includes('KYC') || errMsg.includes('إعداد حسابك')) {
            return res.status(403).json({ success: false, code: 'ACCOUNT_UNVERIFIED', error: 'Merchant verification (KYC) is required before placing orders.' });
        }

        // 🚀 استجابة لخطأ الصيانة (unavailable 503) وبقية أخطاء HttpsError
        if (error.code) {
            if (error.code === 'unavailable') return res.status(503).json({ success: false, error: error.message });
            if (error.code === 'invalid-argument') return res.status(400).json({ success: false, error: error.message });
            if (error.code === 'permission-denied') return res.status(403).json({ success: false, error: error.message });
            if (error.code === 'failed-precondition') return res.status(400).json({ success: false, error: error.message });
            if (error.code === 'not-found') return res.status(404).json({ success: false, error: error.message });
            if (error.code === 'already-exists' || error.code === 'aborted') return res.status(409).json({ success: false, error: error.message });
        }

        if (errMsg.includes('not configured as an API Merchant')) return res.status(403).json({ success: false, error: errMsg });
        if (errMsg.startsWith('SECURITY_REJECT:')) return res.status(400).json({ success: false, error: errMsg.replace('SECURITY_REJECT: ', '') });
        
        if (errMsg.includes('HIGH_TRAFFIC_COLLISION') || errMsg === 'System Overloaded') {
            res.set('Retry-After', '2');
            return res.status(503).json({ success: false, error: 'System is highly loaded, please try again in a few seconds.' });
        }

        console.error('API Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});
