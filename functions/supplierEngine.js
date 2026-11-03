// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة الماسية V38.1.0 💎
// 🎯 الوظيفة: المزامنة الانتقائية الذكية، الشراء المباشر (POST/GET)، درع التسعير اللحظي، والمطابقة المالية.
// 🚀 التحديث (V38.1.0 - Atomic Sync, Causal Tier Climbs & Counter Precision):
// 1. Atomic Transactional Sync 🧱: استخدام commitTransactionalProductSync لدمج التعديلات الإدارية دون مسح أثناء مزامنة الكتالوج.
// 2. Causal Tier Climbs Sync 🪜: حفظ دفتر الترقيات (tierClimbs) وفصل shouldLockFloorTier عن shouldUpdateStreakStart.
// 3. Zero Silent Quarantine 🚨: كشف أخطاء تسعير المستويات ووسمها وإشعار الإدمن فوراً مع تجميد المنتج الخاسر.
// 4. Counter FX Precision 🔬: دعم دقة الـ 8 خانات لوحدة منتجات العداد عند المزامنة والفحص اللحظي للتكلفة.
// 5. Custom B2B & Fail-Closed Webhook 🔒: دعم مسارات custom_b2b والتحقق الحي الإلزامي قبل إنهاء طلبات الـ Webhook.
// ============================================================================

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { PubSub } = require('@google-cloud/pubsub');
const crypto = require('crypto');
const admin = require('firebase-admin');
const FinancialEngine = require('./financialEngine.js');
const SecurityEngine = require('./securityEngine.js');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const pubsub = new PubSub();

const isMasterAdmin = (request) => SecurityEngine.isMasterAdmin(request);
const logAdminAction = (adminUid, action, details) => SecurityEngine.logAdminAction(db, admin, adminUid, action, details);
const notifyAdminOfCriticalError = (title, body, payload = { target: 'system_alerts' }) => SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts', title, body, payload);

const logCloudError = async (action, error, supplierId = 'system') => {
    console.error(`🚨 [${action}] Supplier: ${supplierId}`, error);
    try {
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        await db.collection('telecard_system_errors').add({
            action,
            supplierId,
            errorMsg: error?.message || 'Unknown Error',
            time: admin.firestore.FieldValue.serverTimestamp(),
            expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + THIRTY_DAYS_MS)
        });
    } catch (e) {}
};

// ==========================================
// 🌐 محرك الاتصال الشبكي الآمن بالموردين (مع سقف حجم ومهلة مخصصة)
// ==========================================
async function secureSupplierRequest(urlString, token, method = 'GET', bodyPayload = null, timeoutMs = 12000, maxBytes = 10 * 1024 * 1024) {
    const cleanUrl = String(urlString || '').trim();
    const cleanToken = String(token || '').replace(/[\r\n]/g, '').trim();

    const headers = {
        'api-token': cleanToken,
        'Authorization': `Bearer ${cleanToken}`,
        'x-api-key': cleanToken,
        'Accept': 'application/json'
    };
    if (bodyPayload) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await SecurityEngine.secureHttpsRequest(cleanUrl, {
        method: method,
        headers: headers,
        body: bodyPayload,
        timeout: timeoutMs,
        maxResponseBytes: maxBytes,
        parseJson: true
    });
    return res.data;
}

const extractBaseOrigin = (urlStr) => {
    const u = new URL(String(urlStr).trim());
    return u.origin;
};

// 🧹 فك ترميز كيانات HTML قبل إرسال البيانات لسيرفر المورد الخارجي
const unescapeForSupplier = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&amp;/g, '&')
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
};
// 🎮 معالج الحقول المتعددة لمدخلات الألعاب والخدمات (يزيل تسميات الحقول Label: ويستخرج القيم الصافية للمورد)
const parsePlayerInputFields = (inputData) => {
    if (!inputData) return { primary: '---', secondary: null, raw: '---' };
    
    if (typeof inputData === 'object' && !Array.isArray(inputData)) {
        const primary = unescapeForSupplier(inputData.playerId || inputData.id || inputData.account || inputData.primary || '---') || '---';
        const rawSec = inputData.server || inputData.zoneId || inputData.zone || inputData.secondary || null;
        const secondary = rawSec ? unescapeForSupplier(rawSec) : null;
        const rawCombined = Object.entries(inputData).map(([k, v]) => `${k}: ${unescapeForSupplier(v)}`).join(' | ');
        return { primary, secondary: secondary || null, raw: rawCombined };
    }
    
    if (Array.isArray(inputData)) {
        const cleanArr = inputData.map(v => unescapeForSupplier(v)).filter(Boolean);
        const primary = cleanArr[0] || '---';
        const secondary = cleanArr[1] || null;
        return { primary, secondary, raw: cleanArr.join(' | ') || '---' };
    }
    
    const rawStr = unescapeForSupplier(inputData);
    if (!rawStr || rawStr === '---') {
        return { primary: '---', secondary: null, raw: '---' };
    }
    
    // 🛡️ تجريد تسمية الحقل (مثل "أدخل رقم اللاعب: 12345" -> "12345") مع حماية الروابط (https://)
    const stripFieldLabel = (seg) => {
        const s = String(seg || '').trim();
        if (!s || /^https?:\/\//i.test(s)) return s;
        const colonIdx = s.indexOf(':');
        if (colonIdx > 0 && colonIdx < s.length - 1) {
            return s.substring(colonIdx + 1).trim();
        }
        return s;
    };
    
    // 1. إذا كان المدخل يحتوي على عدة حقول مفصولة بـ | (مثل حقلين: يوزر + سيرفر/باسورد)
    if (rawStr.includes('|')) {
        const pipeParts = rawStr.split('|').map(stripFieldLabel).filter(Boolean);
        if (pipeParts.length >= 2) {
            return { primary: pipeParts[0], secondary: pipeParts[1], raw: rawStr };
        }
        if (pipeParts.length === 1) {
            return { primary: pipeParts[0], secondary: null, raw: rawStr };
        }
    }
    
    const cleanedSingle = stripFieldLabel(rawStr);
    if (!cleanedSingle || cleanedSingle === '---') {
        return { primary: '---', secondary: null, raw: rawStr };
    }
    
    const parenMatch = cleanedSingle.match(/^([^\s()]+)\s*\(([^)]+)\)$/);
    if (parenMatch) {
        return { primary: parenMatch[1].trim(), secondary: parenMatch[2].trim(), raw: rawStr };
    }
    
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedSingle);
    const isUrl = /^https?:\/\//i.test(cleanedSingle);
    if (isEmail || isUrl) {
        return { primary: cleanedSingle, secondary: null, raw: rawStr };
    }
    
    const parts = cleanedSingle.split(/[:,]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
        return { primary: parts[0], secondary: parts[1], raw: rawStr };
    }
    
    return { primary: cleanedSingle, secondary: null, raw: rawStr };
};

const extractDeliveredCodeFromResponse = (root) => {
    if (!root || typeof root !== 'object') return null;
    if (root.deliveredCode || root.code || root.pin || root.serial) {
        return String(root.deliveredCode || root.code || root.pin || root.serial).trim();
    }
    if (Array.isArray(root.replay_api) && root.replay_api.length > 0) {
        const extracted = [];
        root.replay_api.forEach(item => {
            if (typeof item === 'string') extracted.push(item.trim());
            else if (item && Array.isArray(item.replay)) extracted.push(...item.replay.map(r => String(r).trim()));
            else if (item && item.replay) extracted.push(String(item.replay).trim());
            else if (item && item.code) extracted.push(String(item.code).trim());
        });
        const joined = extracted.filter(Boolean).join(' | ');
        if (joined) return joined;
    }
    if (Array.isArray(root.codes) && root.codes.length > 0) {
        return root.codes.map(c => (typeof c === 'object' ? (c.code || c.pin || c.text) : String(c))).filter(Boolean).join(' | ');
    }
    if (Array.isArray(root.keys) && root.keys.length > 0) {
        return root.keys.map(k => (typeof k === 'object' ? (k.code || k.key || k.text) : String(k))).filter(Boolean).join(' | ');
    }
    return null;
};

const normalizeCatalogItems = (rawProducts) => {
    if (!Array.isArray(rawProducts)) {
        throw new Error('البيانات المستلمة من المورد لا تحتوي على قائمة منتجات صالحة.');
    }
    return rawProducts.map(item => {
        const rawStock = item.quantity ?? item.available_quantity ?? item.stock ?? item.qty;
        const isExplicitlyAvailable = item.isAvailable !== false && item.available !== false && item.in_stock !== false;
        const explicitMaxQty = FinancialEngine.extractNum(item.max_qty ?? item.maxQty ?? item.max ?? 0);
        const defaultAvailableStock = explicitMaxQty > 999 ? explicitMaxQty : 5000000;
        const extractedRawStock = FinancialEngine.extractNum(rawStock);
        const parsedStock = (rawStock !== undefined && rawStock !== null) ?
            (extractedRawStock > 0 ? Math.max(extractedRawStock, explicitMaxQty) : 0) :
            (isExplicitlyAvailable ? defaultAvailableStock : 0);
        return {
            externalId: String(item.id ?? item.prodId ?? item.product_id ?? item.item_id ?? '').trim(),
            name: String(item.name || item.product || item.title || item.product_name || 'منتج بدون اسم').trim(),
            categoryName: String(item.category_name || '').trim(),
            paramsPrompt: Array.isArray(item.params) ? item.params : [],
            cost: FinancialEngine.extractNum(item.price ?? item.wholesale_price ?? item.cost),
            stock: isExplicitlyAvailable ? parsedStock : 0
        };
    }).filter(i => i.externalId !== '');
};const parseSupplierOrderResponse = (resData) => {
    if (!resData || typeof resData !== 'object') {
        const invalidErr = new Error('SUPPLIER_INVALID_RESPONSE: استجابة غير مفهومة من سيرفر المورد.');
        invalidErr.isExplicitSupplierReject = false;
        throw invalidErr;
    }

    if (String(resData.status).toUpperCase() === 'ERROR' || resData.success === false || resData.status === 'error' || resData.status === 'failed') {
        const errCode = resData.code ? Number(resData.code) : null;
        const errMsg = String(resData.message || resData.error || 'رفض المورد تنفيذ الطلب');
        const errObj = new Error(errMsg);
        errObj.supplierErrorCode = errCode;
        errObj.supplierRawError = errMsg;
        errObj.isExplicitSupplierReject = true; 
        throw errObj;
    }

    const root = resData.data || resData.order || resData;
    const rawOrderStatus = String(root.status || resData.status || '').toLowerCase();

    if (['reject', 'rejected', 'failed', 'canceled', 'cancelled'].includes(rawOrderStatus)) {
        const rejectReason = extractDeliveredCodeFromResponse(root) || String(root.message || resData.message || 'تم رفض الطلب من المورد');
        const errObj = new Error(rejectReason);
        errObj.supplierRawError = rejectReason;
        errObj.isExplicitSupplierReject = true; 
        throw errObj;
    }

    const deliveredCode = extractDeliveredCodeFromResponse(root);
    const isCompleted = ['accept', 'completed', 'success', 'delivered', 'done'].includes(rawOrderStatus) || (Boolean(deliveredCode) && rawOrderStatus !== 'wait' && rawOrderStatus !== 'pending');
    const externalOrderId = String(root.order_id || root.orderId || root.id || root.reference_id || '').trim() || null;
    const actualCostRaw = FinancialEngine.extractNum(root.price ?? root.cost ?? root.price_paid ?? root.total_cost ?? 0);

    return {
        status: isCompleted ? 'completed' : 'processing',
        deliveredCode: isCompleted ? (deliveredCode || 'تم التنفيذ بنجاح عبر المزود المباشر') : null,
        externalOrderId: externalOrderId,
        actualCostRaw: actualCostRaw > 0 ? actualCostRaw : null
    };
};

// ==========================================
// 🔌 محولات المنصات (Client-API & Custom B2B)
// ==========================================

const isCustomB2BEndpoint = (urlStr, supplierType = '') => {
    const clean = String(urlStr || '').trim();
    return supplierType === 'custom_b2b' || (!clean.includes('/client/api') && clean.includes('externalCreateOrder'));
};

const buildCustomB2BUrl = (rawUrlStr, action = null) => {
    const u = new URL(String(rawUrlStr || '').trim());
    u.pathname = u.pathname.replace(/\/(products|balance|profile|check)\/?$/i, '');
    u.searchParams.delete('action');
    u.searchParams.delete('products_id');
    u.searchParams.delete('orders');
    u.searchParams.delete('orderId');
    if (action) {
        u.searchParams.set('action', action);
    }
    return u.toString();
};

const ClientApiStandardAdapter = {
        fetchCatalog: async (baseUrl, token, specificExternalIds = [], customConfig = {}) => {
            const cleanBase = String(baseUrl || '').trim();
            const timeoutMs = customConfig.timeoutMs || 12000;
            const maxBytes = customConfig.maxBytes || 10 * 1024 * 1024;
            const isCustomB2B = isCustomB2BEndpoint(cleanBase, customConfig.supplierType);
            
            let baseTargetUrl;
            if (isCustomB2B) {
                baseTargetUrl = cleanBase.includes('products_id=') ? cleanBase : buildCustomB2BUrl(cleanBase, 'products');
            } else {
                baseTargetUrl = cleanBase.includes('/client/api/products') ? cleanBase : `${extractBaseOrigin(cleanBase)}/client/api/products`;
            }
            
            if (!Array.isArray(specificExternalIds) || specificExternalIds.length === 0 || baseTargetUrl.includes('products_id=')) {
                const data = await secureSupplierRequest(baseTargetUrl, token, 'GET', null, timeoutMs, maxBytes);
                const list = Array.isArray(data) ? data : (data.data || data.products || data.items || []);
                return normalizeCatalogItems(list);
            }
            const cleanIds = [...new Set(specificExternalIds.map(id => String(id).trim()).filter(Boolean))];
            const chunks = [];
            for (let i = 0; i < cleanIds.length; i += 100) {
                chunks.push(cleanIds.slice(i, i + 100));
            }
            
            const mergedItemsMap = new Map();
            const sep = baseTargetUrl.includes('?') ? '&' : '?';
            
            for (let idx = 0; idx < chunks.length; idx++) {
                const chunk = chunks[idx];
                const chunkUrl = `${baseTargetUrl}${sep}products_id=${chunk.map(encodeURIComponent).join(',')}`;
                const data = await secureSupplierRequest(chunkUrl, token, 'GET', null, timeoutMs, maxBytes);
                const list = Array.isArray(data) ? data : (data.data || data.products || data.items || []);
                const normalized = normalizeCatalogItems(list);
                
                normalized.forEach(item => mergedItemsMap.set(String(item.externalId), item));
                
                if (idx === 0 && chunks.length > 1 && normalized.length > chunk.length) {
                    const allNeededFound = cleanIds.every(id => mergedItemsMap.has(id));
                    if (allNeededFound || normalized.length > 150) {
                        break;
                    }
                }
            }
            
            return Array.from(mergedItemsMap.values());
        },
        
        createOrder: async (baseUrl, token, payload) => {
            const cleanBase = String(baseUrl || '').trim();
            const parsedInputs = parsePlayerInputFields(payload.playerInputs || payload.input);
            const isCustomB2B = isCustomB2BEndpoint(cleanBase, payload.supplierType);
            const isClientApiGetStyle = !isCustomB2B && (
                cleanBase.includes('/client/api') ||
                cleanBase.includes('star-store') ||
                cleanBase.includes('newOrder') ||
                payload.supplierType === 'standard_api'
            );
            if (isClientApiGetStyle && !cleanBase.endsWith('/orders')) {
                const origin = extractBaseOrigin(cleanBase);
                const encodedProdId = encodeURIComponent(String(payload.externalProdId).trim());
                
                const queryParams = new URLSearchParams({
                    qty: String(payload.qty || 1),
                    playerId: parsedInputs.primary,
                    order_uuid: String(payload.orderId)
                });
                
                if (parsedInputs.secondary) {
                    queryParams.set('server', parsedInputs.secondary);
                    queryParams.set('zoneId', parsedInputs.secondary);
                }
                
                const newOrderUrl = `${origin}/client/api/newOrder/${encodedProdId}/params?${queryParams.toString()}`;
                const data = await secureSupplierRequest(newOrderUrl, token, 'GET', null, 15000);
                return parseSupplierOrderResponse(data);
            }
            
            const postBody = {
                productId: payload.externalProdId,
                product_id: payload.externalProdId,
                qty: payload.qty,
                playerId: parsedInputs.primary,
                input: parsedInputs.raw,
                order_uuid: payload.orderId,
                idempotencyKey: payload.orderId
            };
            if (parsedInputs.secondary) {
                postBody.server = parsedInputs.secondary;
                postBody.zoneId = parsedInputs.secondary;
            }
            
            const targetPostUrl = isCustomB2B ? buildCustomB2BUrl(cleanBase, null) : cleanBase;
            const data = await secureSupplierRequest(targetPostUrl, token, 'POST', postBody, 15000);
            return parseSupplierOrderResponse(data);
        },
        
        checkOrdersStatus: async (baseUrl, token, externalOrderIds = [], supplierType = 'standard_api') => {
                if (!Array.isArray(externalOrderIds) || externalOrderIds.length === 0) return [];
                const cleanBase = String(baseUrl || '').trim();
                const formattedArray = `[${externalOrderIds.map(id => String(id).trim()).join(',')}]`;
                
                let checkUrl;
                if (isCustomB2BEndpoint(cleanBase, supplierType)) {
                    const baseCheckUrl = buildCustomB2BUrl(cleanBase, 'check');
                    checkUrl = `${baseCheckUrl}&orders=${encodeURIComponent(formattedArray)}`;
                } else {
                    const origin = extractBaseOrigin(cleanBase);
                    checkUrl = `${origin}/client/api/check?orders=${encodeURIComponent(formattedArray)}`;
                }
        const res = await secureSupplierRequest(checkUrl, token, 'GET', null, 10000);
        const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.orders) ? res.orders : (Array.isArray(res) ? res : []));
        
        return list.map(item => {
            const st = String(item.clientApiStatus || item.status || '').toLowerCase();
            const code = extractDeliveredCodeFromResponse(item);
            return {
                externalOrderId: String(item.order_id || item.orderId || item.id || '').trim(),
                status: ['accept', 'completed', 'success', 'done'].includes(st)
                    ? 'completed'
                    : (['reject', 'rejected', 'failed', 'cancelled', 'canceled'].includes(st) ? 'rejected' : 'processing'),
                deliveredCode: code,
                actualCostRaw: FinancialEngine.extractNum(item.price ?? item.cost ?? 0)
            };
        });
    }
};

const ProviderAdapters = {
    standard_api: ClientApiStandardAdapter,
    custom_b2b: ClientApiStandardAdapter,
    salla: ClientApiStandardAdapter,
    zid: ClientApiStandardAdapter
};

// 🔒 درع التصنيف المالي (Fail-Closed Whitelist)
const classifySupplierFailure = (error) => {
    const EXPLICIT_REJECT_HTTP_CODES = [400, 401, 402, 403, 404, 409, 422];
    if (error?.isExplicitSupplierReject !== true && EXPLICIT_REJECT_HTTP_CODES.includes(error?.httpStatus) && error?.responseJson) {
        const rJson = error.responseJson;
        if (rJson.status === 'error' || rJson.status === 'failed' || rJson.success === false || rJson.message || rJson.error) {
            error.isExplicitSupplierReject = true;
            error.supplierErrorCode = rJson.code || error.httpStatus;
            error.supplierRawError = String(rJson.message || rJson.error || error.message);
        }
    }
    const code = Number(error?.supplierErrorCode || 0);
    const msg = String(error?.supplierRawError || error?.message || '').toLowerCase();

    if (error?.isExplicitSupplierReject !== true) {
        return {
            category: 'NETWORK_TIMEOUT',
            shouldAutoRefund: false,
            clientNote: 'طلبك قيد المراجعة والتأكيد مع المزود.',
            adminAlert: `حالة اتصال غير مؤكدة مع المورد (${error?.message || 'Timeout / Gateway Error'}). تم تعليق الطلب للمراجعة ومنع الإرجاع العشوائي لحماية رأس المال.`
        };
    }

    if (
        code === 107 || code === 106 ||
        msg.includes('player') || msg.includes('blocked') || msg.includes('invalid id') ||
        msg.includes('account not found') || msg.includes('wrong id') ||
        msg.includes('لاعب') || msg.includes('آيدي') || msg.includes('ايدي') || msg.includes('محظور') || msg.includes('خاطئ')
    ) {
        return {
            category: 'USER_INPUT_ERROR',
            shouldAutoRefund: true,
            clientNote: 'تعذر تنفيذ الطلب: رقم المعرف (ID) المدخل غير صحيح أو محظور من الشحن. تم إرجاع المبلغ لمحفظتك فوراً.',
            adminAlert: null
        };
    }

    return {
        category: 'SUPPLIER_REJECT',
        shouldAutoRefund: true,
        clientNote: 'عذراً، تعذر تنفيذ هذا الطلب عبر المزود حالياً. تم إرجاع المبلغ لمحفظتك فوراً.',
        adminAlert: `رفض المورد تنفيذ الطلب صراحةً (كود: ${code || 'N/A'} - السبب: ${error?.supplierRawError || error?.message || 'رصيد غير كافٍ أو خلل بالمورد'}). تم إرجاع مال العميل فوراً.`
    };
};

// ==========================================
// 🔄 دالة موحدة لإنهاء الطلبات المؤجلة (مع درع التكلفة الاحتياطي وحماية الأكواد)
// ==========================================
const finalizeDeferredSupplierOrder = async (orderDocId, resolution = {}, dbInstance = db) => {
    const status = resolution?.status || 'processing';
    const reason = resolution?.reason || 'تعذر تنفيذ الطلب من المزود وتم إرجاع الرصيد لمحفظتك بالكامل.';
    const actualCostRaw = FinancialEngine.extractNum(resolution?.actualCostRaw || 0);
    const verifiedLiveCostUsd = FinancialEngine.extractNum(resolution?.verifiedLiveCostUsd || 0);
    const deliveredCode = resolution?.deliveredCode || 'تم التنفيذ بنجاح عبر المزود المباشر';
    const externalOrderId = resolution?.externalOrderId || null;

    const orderRef = dbInstance.collection('telecard_orders').doc(String(orderDocId));

    if (status === 'completed') {
        let wasAlreadyRejected = false;
        let rejectedOrderDisplayId = orderDocId;

        await dbInstance.runTransaction(async (transaction) => {
            const liveOrderSnap = await transaction.get(orderRef);
            if (!liveOrderSnap.exists) return;
            const liveOrder = liveOrderSnap.data();

            // 🛡️ [إنقاذ الكود المتأخر للإدمن فقط]
            if (['rejected', 'refunded', 'returned'].includes(liveOrder.status)) {
                wasAlreadyRejected = true;
                rejectedOrderDisplayId = liveOrder.displayId || orderDocId;
                transaction.update(orderRef, {
                    lateSupplierCode: deliveredCode,
                    requiresAdminAttention: true,
                    reconciliationAlerted: true,
                    lateSupplierUpdateAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return;
            }
            if (liveOrder.status === 'completed') return;

            const userRef = dbInstance.collection('telecard_users').doc(String(liveOrder.userId));
            const pricingCacheRef = dbInstance.collection('telecard_system').doc('active_pricing');
            const configCacheRef = dbInstance.collection('telecard_system').doc('active_configs');
            const suppRef = liveOrder.supplierId ? dbInstance.collection('telecard_suppliers').doc(String(liveOrder.supplierId)) : null;

            const [userSnap, pricingSnap, configSnap, suppSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(pricingCacheRef),
                transaction.get(configCacheRef),
                suppRef ? transaction.get(suppRef) : Promise.resolve(null)
            ]);

            let tiersData = [];
            if (pricingSnap.exists && Array.isArray(pricingSnap.data().tiers)) {
                tiersData = pricingSnap.data().tiers;
            } else {
                const tiersQuerySnap = await transaction.get(dbInstance.collection('telecard_tiers'));
                tiersData = tiersQuerySnap.docs.map(t => ({ id: t.id, ...t.data() }));
            }

            const serverNowMs = admin.firestore.Timestamp.now().toMillis();
            const currentAudit = SecurityEngine.decryptOrderAudit(liveOrder._auditToken);
            const orderQty = Math.max(1, Number(liveOrder.qty || 1));
            const baselineTotalCostUsd = Number(verifiedLiveCostUsd || currentAudit.costUsd || 0);
            let finalCostUsd = baselineTotalCostUsd;

            if (actualCostRaw > 0 && suppSnap && suppSnap.exists) {
                const suppCurr = String(suppSnap.data().currency || 'USD').toUpperCase();
                let convertedCostUsd = actualCostRaw;
                if (suppCurr === 'USD') {
                    convertedCostUsd = FinancialEngine._internalSanitize(actualCostRaw);
                } else {
                    const rates = (configSnap.exists && Array.isArray(configSnap.data().rates)) ? configSnap.data().rates : [];
                    try {
                        const rawActualCostUsd = FinancialEngine.convertViaUSD(actualCostRaw, suppCurr, 'USD', rates, 'pricing', true);
                        convertedCostUsd = (orderQty > 1 && rawActualCostUsd < 0.05)
                            ? rawActualCostUsd
                            : FinancialEngine.convertViaUSDHelper(actualCostRaw, suppCurr, 'USD', rates, 'ceil', 'pricing');
                    } catch (e) {
                        convertedCostUsd = baselineTotalCostUsd;
                    }
                }

                if (convertedCostUsd > 0) {
                    if (orderQty > 1 && baselineTotalCostUsd > 0 && convertedCostUsd < (baselineTotalCostUsd * 0.65)) {
                        convertedCostUsd = FinancialEngine.safeMul(convertedCostUsd, orderQty);
                    }
                    convertedCostUsd = FinancialEngine.sanitizeAmount(convertedCostUsd);
                    
                    // 🛡️ درع الحماية الاحتياطي ضد القيم الشاذة أو الخاطئة في رد المورد لحماية إحصائيات الـ BI
                    const maxSafeOrderCostUsd = FinancialEngine.safeMul(FinancialEngine.CONFIG.MAX_PRICE_LIMIT, orderQty);
                    const isAnomalousSupplierCost = convertedCostUsd > maxSafeOrderCostUsd ||
                        (baselineTotalCostUsd > 0 && convertedCostUsd > FinancialEngine.safeMul(baselineTotalCostUsd, 1.5));

                    if (!isAnomalousSupplierCost) {
                        finalCostUsd = baselineTotalCostUsd > 0 ? Math.max(convertedCostUsd, baselineTotalCostUsd) : convertedCostUsd;
                    }
                }
            }

            const priceBaseUsd = Number(liveOrder.priceBaseUsd || 0);
            const finalNetProfitUsd = FinancialEngine.sanitizeAmount(FinancialEngine.safeSub(priceBaseUsd, finalCostUsd));
            const updatedAuditToken = SecurityEngine.encryptOrderAudit({
                costUsd: finalCostUsd,
                netProfitUsd: finalNetProfitUsd,
                supplierId: liveOrder.supplierId || null
            });

            if (userSnap.exists) {
                const udBefore = userSnap.data();
                const upgradeResult = FinancialEngine.processTierUpgrade(udBefore, tiersData, priceBaseUsd, serverNowMs);

                const userUpdateObj = {
                    totalSpent: upgradeResult.newTotalSpentUsd,
                    tierCycleSpent: upgradeResult.newTierCycleSpentUsd,
                    tierId: upgradeResult.finalTierId,
                    tierClimbs: upgradeResult.tierClimbs,
                    totalOrdersCount: admin.firestore.FieldValue.increment(1)
                };

                // 🚀 متوافق مع Causal Tier Climbs Sync: ربط دفتر الترقيات وفصل قفل الأرضية عن تاريخ الحصالة
                if (upgradeResult.shouldUpdateCycleStart) {
                    userUpdateObj.tierCycleStartDate = admin.firestore.FieldValue.serverTimestamp();
                }
                if (upgradeResult.shouldLockFloorTier) {
                    userUpdateObj.cycleStartTierId = upgradeResult.lockedFloorTierId;
                }
                if (upgradeResult.shouldUpdateStreakStart) {
                    userUpdateObj.tierStreakStartDate = admin.firestore.FieldValue.serverTimestamp();
                }

                transaction.update(userRef, userUpdateObj);

                const orderDate = new Date(serverNowMs);
                const monthKey = `${orderDate.getUTCFullYear()}_${String(orderDate.getUTCMonth() + 1).padStart(2, '0')}`;
                const statsRef = dbInstance.collection('telecard_user_stats').doc(`${liveOrder.userId}_${monthKey}`);
                transaction.set(statsRef, {
                    userId: liveOrder.userId,
                    monthKey: monthKey,
                    spentThisMonth: admin.firestore.FieldValue.increment(priceBaseUsd),
                    ordersThisMonth: admin.firestore.FieldValue.increment(1),
                    userName: udBefore.fullName || udBefore.username || 'عميل',
                    userDisplayId: udBefore.displayId || String(liveOrder.userId).substring(0, 8),
                    lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            transaction.update(orderRef, {
                status: 'completed',
                isAutoDelivered: true,
                isPendingSupplierCheck: admin.firestore.FieldValue.delete(),
                adminRejectWarnedAt: admin.firestore.FieldValue.delete(),
                deliveredCode: deliveredCode,
                ...(externalOrderId && { externalOrderId: String(externalOrderId) }),
                _auditToken: updatedAuditToken,
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
                actionTime: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        if (wasAlreadyRejected) {
            await notifyAdminOfCriticalError(
                '🚨 تنبيه مالي هام: مورد نفذ طلباً مرفوضاً!',
                `الطلب (#${rejectedOrderDisplayId}) المرفوض مسبقاً أرسل المورد كوده الآن: [${deliveredCode}]. تم حفظه في lateSupplierCode دون إظهاره للعميل.`,
                { target: 'orders', orderId: String(orderDocId) }
            ).catch(() => {});
        }      
        return true;
    }

    if (status === 'rejected') {
        let wasAlreadyCompleted = false;
        let completedOrderDisplayId = orderDocId;

        await dbInstance.runTransaction(async (transaction) => {
            const liveOrderSnap = await transaction.get(orderRef);
            if (!liveOrderSnap.exists) return;
            const liveOrder = liveOrderSnap.data();

            if (liveOrder.status === 'completed') {
                wasAlreadyCompleted = true;
                completedOrderDisplayId = liveOrder.displayId || orderDocId;
                transaction.update(orderRef, {
                    requiresAdminAttention: true,
                    reconciliationAlerted: true,
                    adminNote: `${liveOrder.adminNote || ''} | ⚠️ [تضارب عكسي: أرسل المورد رفضاً لهذا الطلب بعد أن سُجل كمكتمل!]`.trim()
                });
                return;
            }
            if (['rejected', 'refunded', 'returned'].includes(liveOrder.status)) return;

            const userRef = dbInstance.collection('telecard_users').doc(String(liveOrder.userId));
            const couponCodeToRestore = String(liveOrder.pricingSnapshot?.couponCode || liveOrder.couponCode || '').trim().toUpperCase();

            const [userSnap, couponSnap] = await Promise.all([
                transaction.get(userRef),
                couponCodeToRestore ? transaction.get(dbInstance.collection('telecard_coupons').where('code', '==', couponCodeToRestore).limit(1)) : Promise.resolve(null)
            ]);

            const refundAmtLocal = Number(liveOrder.priceLocalDeducted ?? liveOrder.price ?? 0);
            let newWalletBal = 0;

            if (userSnap.exists) {
                const ud = userSnap.data();
                newWalletBal = FinancialEngine.sanitizeAmount(FinancialEngine.safeAdd(ud.walletBalance || 0, refundAmtLocal));
                const userUpdates = { walletBalance: newWalletBal };

                if (couponCodeToRestore) {
                    const safeKey = couponCodeToRestore.replace(/[.~*/\[\]]/g, '_');
                    const curUsed = Number(ud?.usedCoupons?.[safeKey] ?? ud?.usedCoupons?.[couponCodeToRestore] ?? 0);
                    const nextUsed = Math.max(0, curUsed - 1);
                    userUpdates[`usedCoupons.${safeKey}`] = nextUsed > 0 ? nextUsed : admin.firestore.FieldValue.delete();
                }
                transaction.update(userRef, userUpdates);
            }

            if (couponSnap && !couponSnap.empty) {
                const cDoc = couponSnap.docs[0];
                transaction.update(cDoc.ref, { usedCount: Math.max(0, Number(cDoc.data().usedCount || 0) - 1) });
            }

            transaction.update(orderRef, {
                status: 'rejected',
                isPendingSupplierCheck: admin.firestore.FieldValue.delete(),
                adminRejectWarnedAt: admin.firestore.FieldValue.delete(),
                adminNote: reason,
                balanceAfter: newWalletBal,
                actionTime: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        if (wasAlreadyCompleted) {
            await notifyAdminOfCriticalError(
                '⚠️ تضارب عكسي في طلب مورد!',
                `الطلب (#${completedOrderDisplayId}) المسجل كمكتمل للعميل أرسل المورد الآن إشعاراً برفضه! يرجى مراجعة الطلب.`,
                { target: 'orders', orderId: String(orderDocId) }
            ).catch(() => {});
        }
        return true;
    }

    return false;
};

// ==========================================
// 🧠 النواة المركزية للمزامنة الانتقائية الذرية (Atomic Selective Sync Engine)
// ==========================================
const coreSyncLogic = async (supplierId) => {
    const suppRef = db.collection('telecard_suppliers').doc(String(supplierId));

    const supplier = await db.runTransaction(async (transaction) => {
        const suppSnap = await transaction.get(suppRef);
        if (!suppSnap.exists) throw new Error('المورد غير موجود.');
        const suppData = suppSnap.data();

        const LOCK_TIMEOUT_MS = 10 * 60 * 1000;
        const isStaleLock = suppData.isSyncing && suppData.lastSyncAttempt && (Date.now() - suppData.lastSyncAttempt.toMillis()) > LOCK_TIMEOUT_MS;

        if (suppData.isSyncing && !isStaleLock) throw new Error('توجد عملية مزامنة قيد التنفيذ حالياً.');
        if (!suppData.isActive) throw new Error('المورد معطل حالياً.');

        transaction.update(suppRef, { isSyncing: true, lastSyncAttempt: admin.firestore.FieldValue.serverTimestamp() });
        return suppData;
    });

    try {
        const linkedProdsSnap = await db.collection('telecard_prods').where('supplierId', '==', String(supplierId)).get();
        if (linkedProdsSnap.empty) {
            await suppRef.update({
                lastSync: admin.firestore.FieldValue.serverTimestamp(),
                lastUpdatedProductsCount: 0
            });
            return { linkedCount: 0, updatedProductsCount: 0 };
        }

        const secretSnap = await suppRef.collection('secrets').doc('api').get();
        const token = secretSnap.exists ? secretSnap.data().token : null;
        if (!token) throw new Error('لا يوجد مفتاح ربط سري للمورد.');

        const adapterObj = ProviderAdapters[supplier.type] || ClientApiStandardAdapter;

        const neededExternalIdsSet = new Set();
        linkedProdsSnap.docs.forEach(d => {
            const p = d.data();
            if (p.externalId) neededExternalIdsSet.add(String(p.externalId).trim());
            if (p.type === 'select' && Array.isArray(p.options)) {
                p.options.forEach(o => { if (o && o.externalId) neededExternalIdsSet.add(String(o.externalId).trim()); });
            }
        });

        const normalizedProducts = await adapterObj.fetchCatalog(supplier.baseUrl, token, Array.from(neededExternalIdsSet), { supplierType: supplier.type });
        if (!normalizedProducts || normalizedProducts.length === 0) {
            throw new Error('API المورد أرجع قائمة منتجات فارغة.');
        }

        const supplierCatalogMap = new Map();
        normalizedProducts.forEach(item => supplierCatalogMap.set(String(item.externalId), item));

        const dummyReadOnlyTx = { get: (ref) => ref.get() };
        const { ratesData, tiersData } = await FinancialEngine.fetchSystemData(dummyReadOnlyTx, db);
        const { generatePublicProductData } = require('./triggersEngine.js');

        const suppCurrency = String(supplier.currency || 'USD').toUpperCase();
        const syncSessionId = Date.now();
        const defaultMargin = FinancialEngine.extractNum(supplier.defaultMargin || 0);
        const defaultVirtualTier = { id: 'virtual_default', profitPercent: defaultMargin, minProfitUsd: 0 };

        let updatedProductsCount = 0;
        let newlyFrozenCount = 0;

        const evaluateSupplierCost = (rawCostLocal, previousCostUsd, isCounter = false) => {
            const sanitizeUnit = isCounter ? FinancialEngine._internalSanitize : FinancialEngine.sanitizeAmount;
            let costUsd = sanitizeUnit(rawCostLocal);
            let freezeReason = null;

            if (suppCurrency !== 'USD') {
                try {
                    costUsd = isCounter
                        ? FinancialEngine.convertViaUSD(rawCostLocal, suppCurrency, 'USD', ratesData, 'pricing', true)
                        : FinancialEngine.convertViaUSDHelper(rawCostLocal, suppCurrency, 'USD', ratesData, 'ceil', 'pricing');
                } catch (err) {
                    return { isFrozen: true, safeCostUsd: previousCostUsd > 0 ? previousCostUsd : 0, reason: `فشل تحويل عملة المورد (${suppCurrency})` };
                }
            }

            if (costUsd <= 0 || costUsd > FinancialEngine.CONFIG.MAX_PRICE_LIMIT) {
                freezeReason = `تكلفة غير صالحة من المورد (${costUsd}$)`;
            } else if (previousCostUsd > 0) {
                if (costUsd < (previousCostUsd * 0.2)) {
                    freezeReason = `هبوط مريب جداً في تكلفة المورد (من ${previousCostUsd}$ إلى ${costUsd}$)`;
                } else if (costUsd > (previousCostUsd * 3.0)) {
                    freezeReason = `قفزة جنونية في تكلفة المورد (من ${previousCostUsd}$ إلى ${costUsd}$)`;
                }
            }

            if (freezeReason) {
                return { isFrozen: true, safeCostUsd: previousCostUsd > 0 ? previousCostUsd : 0, reason: freezeReason };
            }
            return { isFrozen: false, safeCostUsd: Math.min(sanitizeUnit(costUsd), FinancialEngine.CONFIG.MAX_PRICE_LIMIT), reason: null };
        };

        const computeSafePricingAndOverrides = (costUsd, currentObj, isDeleteAllowed = true, prodType = 'simple') => {
            const isFixed = String(currentObj?.isFixedPrice).toLowerCase() === 'true';
            const isCounter = (prodType === 'counter' || currentObj?.type === 'counter');
            const sanitizeUnit = isCounter ? FinancialEngine._internalSanitize : FinancialEngine.sanitizeAmount;
            let calcPrice = Number(currentObj?.price || 0);

            if (!isFixed && costUsd > 0) {
                try {
                    const baseCalc = FinancialEngine.calculatePrice({
                        product: { type: isCounter ? 'counter' : 'simple', costPrice: costUsd, price: costUsd },
                        costPrice: costUsd,
                        tier: defaultVirtualTier,
                        allowDefaultOption: true
                    });
                    calcPrice = baseCalc.isFirewallViolated
                        ? sanitizeUnit(FinancialEngine.safeAdd(costUsd, FinancialEngine.safeMul(costUsd, 0.05)))
                        : baseCalc.finalPrice;
                } catch (e) {
                    calcPrice = sanitizeUnit(FinancialEngine.safeAdd(costUsd, FinancialEngine.safeMul(costUsd, 0.05)));
                }
            } else if (isFixed) {
                calcPrice = FinancialEngine.extractNum(currentObj?.fixedPriceUsd || currentObj?.price);
            }

            const minSafePrice = costUsd > 0
                ? sanitizeUnit(FinancialEngine.safeAdd(costUsd, FinancialEngine.safeMul(costUsd, FinancialEngine.safeDiv(FinancialEngine.CONFIG.MIN_MARGIN_PERCENT, 100))))
                : 0;
            const isFixedViolated = isFixed && (calcPrice <= 0 || calcPrice < minSafePrice);

            let cleanedTierPrices = currentObj?.tierPrices || null;
            let staleOverrideRemoved = false;

            if (currentObj?.tierPrices && typeof currentObj.tierPrices === 'object') {
                const updatedMap = {};
                let hasKeys = false;
                for (const [tKey, tVal] of Object.entries(currentObj.tierPrices)) {
                    hasKeys = true;
                    const tNum = typeof tVal === 'object' ? FinancialEngine.extractNum(tVal?.price) : FinancialEngine.extractNum(tVal);
                    if (tNum >= minSafePrice && minSafePrice > 0) {
                        updatedMap[tKey] = tVal;
                    } else {
                        staleOverrideRemoved = true;
                        if (isDeleteAllowed) updatedMap[tKey] = admin.firestore.FieldValue.delete();
                    }
                }
                cleanedTierPrices = hasKeys ? updatedMap : null;
            }

            return { finalPrice: calcPrice, isFixedViolated, cleanedTierPrices, staleOverrideRemoved };
        };

        // 🛡️ دالة حساب التحديثات لنسخة المنتج (تُستخدم للفحص السريع أولاً ثم داخل المعاملة الذرية على النسخة الحية)
        const buildProductSyncDecision = (existingData) => {
            if (!existingData) return null;
            const isCounterProd = (existingData.type === 'counter');

            if (existingData.type === 'select' && Array.isArray(existingData.options) && existingData.options.length > 0) {
                let optionsModified = false;
                let anyOptionFrozenAlert = null;
                let isCustomOverridesCleared = false;

                const newOptions = existingData.options.map((opt) => {
                    if (!opt) return opt;

                    let cleanedOpt = opt;
                    if (opt.supplierId && String(opt.supplierId) !== String(supplierId)) {
                        optionsModified = true;
                        cleanedOpt = { ...opt, supplierId: String(supplierId) };
                    }

                    if (!cleanedOpt.externalId) return cleanedOpt;
                    const suppItem = supplierCatalogMap.get(String(cleanedOpt.externalId).trim());

                    if (!suppItem) {
                        if (cleanedOpt.isAvailable !== false) {
                            optionsModified = true;
                            return { ...cleanedOpt, isAvailable: false };
                        }
                        return cleanedOpt;
                    }

                    const prevOptCost = Number(cleanedOpt.costPrice ?? cleanedOpt.cost_price ?? 0);
                    const costEval = evaluateSupplierCost(suppItem.cost, prevOptCost, false);
                    const pricingEval = computeSafePricingAndOverrides(costEval.safeCostUsd, cleanedOpt, false, 'simple');

                    const isOptFrozen = costEval.isFrozen || pricingEval.isFixedViolated;
                    if (isOptFrozen && cleanedOpt.isActive !== false) {
                        anyOptionFrozenAlert = costEval.reason || `السعر الثابت للباقة (${cleanedOpt.name}) أقل من تكلفة المورد الجديدة`;
                    }

                    const targetOptAvail = !isOptFrozen && (cleanedOpt.isManuallyPaused !== true) && (cleanedOpt.isActive !== false) && (suppItem.stock > 0);

                    const hasOptChanged =
                        Number(cleanedOpt.costPrice || 0) !== costEval.safeCostUsd ||
                        Number(cleanedOpt.price || 0) !== pricingEval.finalPrice ||
                        Boolean(cleanedOpt.isAvailable) !== targetOptAvail ||
                        pricingEval.staleOverrideRemoved;

                    if (!hasOptChanged) return cleanedOpt;

                    optionsModified = true;
                    if (pricingEval.staleOverrideRemoved) isCustomOverridesCleared = true;

                    return {
                        ...cleanedOpt,
                        costPrice: costEval.safeCostUsd,
                        price: pricingEval.finalPrice,
                        tierPrices: pricingEval.cleanedTierPrices || {},
                        isAvailable: targetOptAvail
                    };
                });

                const parentShouldBeAvailable = !anyOptionFrozenAlert &&
    (existingData.isManuallyPaused !== true) &&
    (existingData.isActive !== false) &&
    newOptions.some(o => o && o.isActive !== false && o.isManuallyPaused !== true && o.isAvailable === true);
                if (
                    !optionsModified &&
                    Boolean(existingData.isAvailable) === parentShouldBeAvailable &&
                    Boolean(existingData.isAutoFrozen) === Boolean(anyOptionFrozenAlert)
                ) {
                    return null;
                }

                const optUpdates = {
                    options: newOptions,
                    isAvailable: parentShouldBeAvailable,
                    isAutoFrozen: Boolean(anyOptionFrozenAlert),
                    requiresAdminAttention: Boolean(anyOptionFrozenAlert),
                    syncNote: anyOptionFrozenAlert ? `⛔ مجمد آلياً: ${anyOptionFrozenAlert}` : admin.firestore.FieldValue.delete(),
                    isExternal: true,
                    syncSessionId: syncSessionId,
                    lastSync: admin.firestore.FieldValue.serverTimestamp()
                };

                if (isCustomOverridesCleared && Array.isArray(existingData.customTierOverrides)) {
                    optUpdates.customTierOverrides = admin.firestore.FieldValue.delete();
                }

                return {
                    adminUpdates: optUpdates,
                    isFrozen: Boolean(anyOptionFrozenAlert),
                    becameFrozen: Boolean(anyOptionFrozenAlert && !existingData.isAutoFrozen)
                };
            }

            const extIdStr = String(existingData.externalId || '').trim();
            if (!extIdStr) return null;

            const suppItem = supplierCatalogMap.get(extIdStr);
            if (!suppItem) {
                if (existingData.isAvailable === true) {
                    return {
                        adminUpdates: {
                            isAvailable: false,
                            isExternal: true,
                            syncSessionId: syncSessionId,
                            syncNote: 'غير متوفر حالياً لدى المورد'
                        },
                        isFrozen: false,
                        becameFrozen: false
                    };
                }
                return null;
            }

            const prevCost = Number(existingData.costPrice ?? existingData.cost_price ?? 0);
            const costEval = evaluateSupplierCost(suppItem.cost, prevCost, isCounterProd);
            const pricingEval = computeSafePricingAndOverrides(costEval.safeCostUsd, existingData, true, existingData.type || 'simple');

            const isProdFrozen = costEval.isFrozen || pricingEval.isFixedViolated;
            const freezeNote = isProdFrozen
                ? `⛔ مجمد آلياً: ${costEval.reason || 'السعر الثابت أقل من تكلفة المورد الجديدة'}`
                : '';

            const targetAvail = !isProdFrozen && (existingData.isManuallyPaused !== true) && (existingData.isActive !== false) && (suppItem.stock > 0);

            const hasChanged =
                Number(existingData.costPrice || 0) !== costEval.safeCostUsd ||
                Number(existingData.price || 0) !== pricingEval.finalPrice ||
                Boolean(existingData.isAvailable) !== targetAvail ||
                Boolean(existingData.isAutoFrozen) !== isProdFrozen ||
                (existingData.syncNote || '') !== freezeNote ||
                pricingEval.staleOverrideRemoved;

            if (!hasChanged) return null;

            const baseUpdates = {
                costPrice: costEval.safeCostUsd,
                price: pricingEval.finalPrice,
                tierPrices: pricingEval.cleanedTierPrices,
                isAvailable: targetAvail,
                isAutoFrozen: isProdFrozen,
                requiresAdminAttention: isProdFrozen,
                syncNote: isProdFrozen ? freezeNote : admin.firestore.FieldValue.delete(),
                isExternal: true,
                syncSessionId: syncSessionId,
                lastSync: admin.firestore.FieldValue.serverTimestamp()
            };

            if (pricingEval.staleOverrideRemoved && Array.isArray(existingData.customTierOverrides)) {
                baseUpdates.customTierOverrides = admin.firestore.FieldValue.delete();
            }

            return {
                adminUpdates: baseUpdates,
                isFrozen: isProdFrozen,
                becameFrozen: Boolean(isProdFrozen && !existingData.isAutoFrozen)
            };
        };

        // 🛡️ كاتب ذري مزدوج داخل معاملة (Transaction) يقرأ أحدث نسخة حية من المنتج لمنع مسح التعديلات المتزامنة
        const commitTransactionalProductSync = async (prodRef, prodId) => {
            const publicProdRef = db.collection('telecard_prods_public').doc(String(prodId));

            return await db.runTransaction(async (tx) => {
                const freshSnap = await tx.get(prodRef);
                if (!freshSnap.exists) return { updated: false, frozeNow: false };
                const liveProdData = freshSnap.data();

                if (String(liveProdData.supplierId || '') !== String(supplierId)) {
                    return { updated: false, frozeNow: false };
                }

                const decision = buildProductSyncDecision(liveProdData);
                if (!decision) return { updated: false, frozeNow: false };

                const { adminUpdates, isFrozen, becameFrozen } = decision;
                let frozeNow = becameFrozen;

                const fullMergedProd = { id: liveProdData.id || String(prodId), ...liveProdData, ...adminUpdates };
                if (adminUpdates.tierPrices && typeof adminUpdates.tierPrices === 'object') {
                    const cleanTp = {};
                    for (const [k, v] of Object.entries(adminUpdates.tierPrices)) {
                        if (v && typeof v === 'object' && (typeof v.isEqual === 'function' || v.price === undefined)) continue;
                        cleanTp[k] = v;
                    }
                    fullMergedProd.tierPrices = cleanTp;
                }

                const hasNonPricingBlock = Boolean(
                    fullMergedProd.isActive === false ||
                    isFrozen ||
                    fullMergedProd.isAutoFrozen === true ||
                    fullMergedProd.requiresAdminAttention === true
                );

                if (hasNonPricingBlock) {
                    tx.set(prodRef, adminUpdates, { merge: true });
                    tx.delete(publicProdRef);
                } else {
                    const publicData = generatePublicProductData(fullMergedProd, tiersData);
                    const hasPricingError = Boolean(publicData._hasPricingError);
                    delete publicData._hasPricingError;

                    if (hasPricingError) {
                        adminUpdates.isAvailable = false;
                        adminUpdates.requiresAdminAttention = true;
                        adminUpdates.syncNote = '⛔ عزل آلي أثناء مزامنة المورد: تسعير أحد المستويات لا يغطي التكلفة الجديدة للمورد.';
                        if (!liveProdData.requiresAdminAttention) frozeNow = true;
                        tx.set(prodRef, adminUpdates, { merge: true });
                        tx.delete(publicProdRef);
                    } else {
                        tx.set(prodRef, adminUpdates, { merge: true });
                        tx.set(publicProdRef, publicData);
                    }
                }

                return { updated: true, frozeNow };
            });
        };

        const SYNC_CONCURRENCY = 10;
        const linkedDocs = linkedProdsSnap.docs;

        for (let i = 0; i < linkedDocs.length; i += SYNC_CONCURRENCY) {
            const chunk = linkedDocs.slice(i, i + SYNC_CONCURRENCY);
            await Promise.all(chunk.map(async (prodDoc) => {
                // ⚡ فحص مبدئي في الذاكرة: إذا لم يتغير شيء لدى المورد نتخطى المنتج بـ 0 قراءات إضافية
                const preCheckDecision = buildProductSyncDecision(prodDoc.data());
                if (!preCheckDecision) return;

                const syncOutcome = await commitTransactionalProductSync(prodDoc.ref, prodDoc.id);
                if (syncOutcome.updated) updatedProductsCount++;
                if (syncOutcome.frozeNow) newlyFrozenCount++;
            }));
        }

        if (newlyFrozenCount > 0) {
            await notifyAdminOfCriticalError(
                '🚨 تجميد آلي لمنتجات مورد!',
                `تم تجميد (${newlyFrozenCount}) منتج للمورد (${supplier.name || supplierId}) بسبب قفزة أو خلل في التكلفة.`
            );
        }

        // 🚀 ترقية الكاش اللحظية
        if (updatedProductsCount > 0) {
            await db.collection('telecard_system').doc('cache_version').set({
                catalogVersion: admin.firestore.FieldValue.increment(1)
            }, { merge: true });
        }

        await suppRef.update({
            lastSync: admin.firestore.FieldValue.serverTimestamp(),
            linkedProductsCount: linkedDocs.length,
            lastUpdatedProductsCount: updatedProductsCount
        });

        return { linkedCount: linkedDocs.length, updatedProductsCount };

    } catch (error) {
        await logCloudError('SUPPLIER_SYNC_LOGIC_ERROR', error, supplierId);
        throw error;
    } finally {
        await suppRef.update({ isSyncing: false }).catch(() => {});
    }
};

// ==========================================
// ⚡ ررع التسعير اللحظي الخاطف الصارم (Fail-Closed) + التنفيذ الفوري
// ==========================================
const fulfillOrderWithSupplier = async (orderId, dbInstance = db) => {
    const orderRef = dbInstance.collection('telecard_orders').doc(String(orderId));
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return null;

    const orderData = orderSnap.data();
    const supplierId = orderData.supplierId;
    const externalProdId = orderData.externalProdId;

    if (!supplierId || !externalProdId || orderData.status === 'completed') {
        return null;
    }

    const suppRef = dbInstance.collection('telecard_suppliers').doc(String(supplierId));
    const configCacheRef = dbInstance.collection('telecard_system').doc('active_configs');

    const [suppSnap, secretSnap, configCacheSnap] = await Promise.all([
        suppRef.get(),
        suppRef.collection('secrets').doc('api').get(),
        configCacheRef.get()
    ]);

    const supplier = suppSnap.exists ? suppSnap.data() : null;
    const token = secretSnap.exists ? secretSnap.data().token : null;

    if (!supplier || supplier.isActive === false || !token) {
        await finalizeDeferredSupplierOrder(orderId, {
            status: 'rejected',
            reason: 'عذراً، المزود غير متاح حالياً. تم إرجاع المبلغ لمحفظتك فوراً.'
        }, dbInstance);
        return { status: 'rejected', isAutoDelivered: false, deliveredCode: null, rejectedReason: 'المورد معطل مؤقتاً وتم إرجاع الرصيد.' };
    }

    const adapterObj = ProviderAdapters[supplier.type] || ClientApiStandardAdapter;
    const suppCurrency = String(supplier.currency || 'USD').toUpperCase();
    const rates = (configCacheSnap.exists && Array.isArray(configCacheSnap.data().rates)) ? configCacheSnap.data().rates : [];

    let verifiedLiveCostUsd = null;
    let liveCheckFailedReason = null;
    let shouldTriggerCatalogSync = false;

    try {
        const liveCatalog = await adapterObj.fetchCatalog(supplier.baseUrl, token, [externalProdId], {
            timeoutMs: 8000, 
            maxBytes: 8 * 1024 * 1024,
            supplierType: supplier.type
        });

        if (Array.isArray(liveCatalog) && liveCatalog.length > 0) {
            const liveItem = liveCatalog.find(item => String(item.externalId).trim() === String(externalProdId).trim());
            const orderQty = Math.max(1, Number(orderData.qty || 1));

   const isCounterBooleanStock = liveItem.stock === 1 && orderQty > 1 && liveItem.cost > 0 && liveItem.cost < 0.05;

if (!liveItem) {
    liveCheckFailedReason = 'عذراً، هذه الباقة غير متوفرة حالياً، يرجى تحديث الصفحة.';
    shouldTriggerCatalogSync = true;
} else if (liveItem.stock <= 0 || (!isCounterBooleanStock && liveItem.stock < orderQty)) {
    liveCheckFailedReason = 'عذراً، الكمية المطلوبة غير متوفرة حالياً لدى المزود، يرجى تحديث الصفحة.';
    shouldTriggerCatalogSync = true;
} else if (liveItem.cost <= 0) {                liveCheckFailedReason = 'عذراً، تسعير هذه الباقة غير متاح حالياً، يرجى تحديث الصفحة.';
                shouldTriggerCatalogSync = true;
            } else {
                let unitRealTimeCostUsd = liveItem.cost;

                if (suppCurrency !== 'USD') {
                    const rawUnitCostUsd = FinancialEngine.convertViaUSD(liveItem.cost, suppCurrency, 'USD', rates, 'pricing', true);
                    unitRealTimeCostUsd = (orderQty > 1 && rawUnitCostUsd < 0.05)
                        ? rawUnitCostUsd
                        : FinancialEngine.convertViaUSDHelper(liveItem.cost, suppCurrency, 'USD', rates, 'ceil', 'pricing');
                } else {
                    unitRealTimeCostUsd = FinancialEngine._internalSanitize(liveItem.cost);
                }

                const totalRealTimeCostUsd = FinancialEngine.sanitizeAmount(FinancialEngine.safeMul(unitRealTimeCostUsd, orderQty));

                if (totalRealTimeCostUsd > 0) {
                    const customerPaidUsd = Number(orderData.priceBaseUsd || 0);
                    const absoluteMinMarginUsd = FinancialEngine.safeMul(totalRealTimeCostUsd, FinancialEngine.safeDiv(FinancialEngine.CONFIG.MIN_MARGIN_PERCENT, 100));
                    const absoluteSafePrice = FinancialEngine.sanitizeAmount(FinancialEngine.safeAdd(totalRealTimeCostUsd, absoluteMinMarginUsd));

                    if (customerPaidUsd < absoluteSafePrice) {
                        liveCheckFailedReason = 'تم تحديث سعر هذا المنتج، يرجى تحديث الصفحة للاطلاع على السعر الجديد والمحاولة مجدداً.';
                        shouldTriggerCatalogSync = true;
                        notifyAdminOfCriticalError(
                            '🛡️ درع التسعير أوقف بيعة خاسرة!',
                            `الطلب (${orderId}): ارتفعت تكلفة المورد إلى ${totalRealTimeCostUsd}$ بينما دفع العميل ${customerPaidUsd}$. تم رفض الطلب وحماية رأس المال.`,
                            { target: 'orders', orderId: String(orderId) }
                        ).catch(() => {});
                    } else {
                        verifiedLiveCostUsd = totalRealTimeCostUsd;
                    }
                } else {
                    liveCheckFailedReason = 'عذراً، حدث تحديث في تسعير المنتج، يرجى تحديث الصفحة والمحاولة لاحقاً.';
                }
            }
        } else {
            liveCheckFailedReason = 'عذراً، حدث تحديث في بيانات المنتج، يرجى تحديث الصفحة والمحاولة لاحقاً.';
        }
    } catch (shieldErr) {
        liveCheckFailedReason = 'عذراً، حدث تحديث في بيانات المنتج، يرجى تحديث الصفحة والمحاولة لاحقاً.';
        console.warn(`[Live Price Shield Blocked]: ${shieldErr.message}`);
    }

    if (liveCheckFailedReason || !verifiedLiveCostUsd) {
        const clientRejectMsg = `${liveCheckFailedReason} تم استرجاع المبلغ لمحفظتك فوراً.`;
        
        await finalizeDeferredSupplierOrder(orderId, {
            status: 'rejected',
            reason: clientRejectMsg
        }, dbInstance);

        if (shouldTriggerCatalogSync) {
            pubsub.topic('telecard-sync-supplier-topic').publishMessage({ json: { supplierId } }).catch(() => {});
        }
        return {
            status: 'rejected',
            isAutoDelivered: false,
            deliveredCode: null,
            rejectedReason: clientRejectMsg
        };
    }

    let executionResult = null;
    let executionError = null;
    const targetOrderUrl = supplier.orderUrl || supplier.baseUrl;

    try {
        executionResult = await adapterObj.createOrder(targetOrderUrl, token, {
            orderId: String(orderId),
            externalProdId: String(externalProdId),
            qty: Number(orderData.qty || 1),
            input: String(orderData.input || '---'),
            playerInputs: orderData.playerInputs || null,
            supplierType: supplier.type || 'standard_api'
        });
    } catch (err) {
        executionError = err;
    }

    if (executionResult && !executionError) {
        if (executionResult.status === 'processing' || executionResult.status === 'pending') {
            const deferredUpdates = {
                status: 'pending',
                externalOrderId: executionResult.externalOrderId || null,
                isPendingSupplierCheck: Boolean(executionResult.externalOrderId),
                actionTime: admin.firestore.FieldValue.serverTimestamp()
            };

            if (verifiedLiveCostUsd && verifiedLiveCostUsd > 0) {
                const priceBaseUsd = Number(orderData.priceBaseUsd || 0);
                const liveNetProfitUsd = FinancialEngine.sanitizeAmount(Math.max(0, FinancialEngine.safeSub(priceBaseUsd, verifiedLiveCostUsd)));
                deferredUpdates._auditToken = SecurityEngine.encryptOrderAudit({
                    costUsd: verifiedLiveCostUsd,
                    netProfitUsd: liveNetProfitUsd,
                    supplierId: String(supplierId)
                });
            }

            return await dbInstance.runTransaction(async (tx) => {
                const latestSnap = await tx.get(orderRef);
                if (!latestSnap.exists) return { status: 'pending', isAutoDelivered: false, deliveredCode: null };
                const latestData = latestSnap.data();
                if (latestData.status === 'completed') {
                    return { status: 'completed', isAutoDelivered: true, deliveredCode: latestData.deliveredCode || null };
                }
                if (['rejected', 'refunded', 'returned'].includes(latestData.status)) {
                    return { status: 'rejected', isAutoDelivered: false, deliveredCode: null, rejectedReason: latestData.adminNote || null };
                }
                tx.update(orderRef, deferredUpdates);
                return { status: 'pending', isAutoDelivered: false, deliveredCode: null };
            });
        }

        await finalizeDeferredSupplierOrder(orderId, {
            status: 'completed',
            deliveredCode: executionResult.deliveredCode,
            externalOrderId: executionResult.externalOrderId,
            actualCostRaw: executionResult.actualCostRaw,
            verifiedLiveCostUsd: verifiedLiveCostUsd
        }, dbInstance);

        return {
            status: 'completed',
            isAutoDelivered: true,
            deliveredCode: executionResult.deliveredCode
        };
    }

    const failureInfo = classifySupplierFailure(executionError);
    await logCloudError(`SUPPLIER_ORDER_${failureInfo.category}`, executionError, supplierId);

    if (!failureInfo.shouldAutoRefund) {
        const timeoutUpdates = {
            status: 'pending',
            adminNote: '⚠️ تحذير مالي للإدمن: انقطع الاتصال مع المورد أثناء الشراء (حالة غير مؤكدة). تأكد من سجل المورد قبل رفض الطلب!',
            actionTime: admin.firestore.FieldValue.serverTimestamp()
        };
        if (verifiedLiveCostUsd && verifiedLiveCostUsd > 0) {
            const priceBaseUsd = Number(orderData.priceBaseUsd || 0);
            const liveNetProfitUsd = FinancialEngine.sanitizeAmount(Math.max(0, FinancialEngine.safeSub(priceBaseUsd, verifiedLiveCostUsd)));
            timeoutUpdates._auditToken = SecurityEngine.encryptOrderAudit({
                costUsd: verifiedLiveCostUsd,
                netProfitUsd: liveNetProfitUsd,
                supplierId: String(supplierId)
            });
        }
        
        await dbInstance.runTransaction(async (tx) => {
            const latestSnap = await tx.get(orderRef);
            if (latestSnap.exists && !['completed', 'rejected', 'refunded', 'returned'].includes(latestSnap.data().status)) {
                tx.update(orderRef, timeoutUpdates);
            }
        });

        if (failureInfo.adminAlert) {
            await notifyAdminOfCriticalError(
                '⚠️ طلب مورد معلق لحماية رأس المال!',
                `المنتج (${orderData.product}): ${failureInfo.adminAlert}`,
                { target: 'orders', orderId: String(orderId) }
            );
        }
        return { status: 'pending', isAutoDelivered: false, deliveredCode: null };
    }

    await finalizeDeferredSupplierOrder(orderId, {
        status: 'rejected',
        reason: failureInfo.clientNote
    }, dbInstance);

    if (failureInfo.adminAlert) {
        await notifyAdminOfCriticalError(
            '🚨 تنبيه من المورد أثناء طلب عميل!',
            `المنتج (${orderData.product}): ${failureInfo.adminAlert}`,
            { target: 'orders', orderId: String(orderId) }
        );
    }

    return {
        status: 'rejected',
        isAutoDelivered: false,
        deliveredCode: null,
        rejectedReason: failureInfo.clientNote
    };
};

// ==========================================
// 🔔 مستقبل الـ Webhook المحصن (Fail-Closed)
// ==========================================
exports.supplierOrderWebhook = onRequest({
    region: 'us-east1',
    memory: '256MiB',
    timeoutSeconds: 60
}, async (req, res) => {
    try {
        const configuredSecret = String(process.env.SUPPLIER_WEBHOOK_SECRET || '').trim();
        const incomingSecret = String(req.query.secret || req.headers['x-webhook-secret'] || '').trim();

        if (!configuredSecret || configuredSecret.length < 12 || !incomingSecret) {
            return res.status(403).json({ ok: false, error: 'Unauthorized: Webhook secret not configured or missing' });
        }

        const bufA = Buffer.from(configuredSecret, 'utf8');
        const bufB = Buffer.from(incomingSecret, 'utf8');
        if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
            return res.status(403).json({ ok: false, error: 'Unauthorized: Invalid webhook secret' });
        }

        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const root = body.data || body.order || body;

        const incomingExternalId = String(root.order_id || root.orderId || root.id || '').trim();
        const incomingOrderUuid = String(root.order_uuid || root.reference_id || root.referenceId || '').trim();

        if (!incomingExternalId && !incomingOrderUuid) {
            return res.status(400).json({ ok: false, error: 'Missing order identifier' });
        }

        let targetOrderDoc = null;
        if (incomingOrderUuid) {
            const byUuidSnap = await db.collection('telecard_orders').doc(incomingOrderUuid).get();
            if (byUuidSnap.exists) targetOrderDoc = byUuidSnap;
        }
        if (!targetOrderDoc && incomingExternalId) {
            const byExtSnap = await db.collection('telecard_orders').where('externalOrderId', '==', incomingExternalId).limit(1).get();
            if (!byExtSnap.empty) targetOrderDoc = byExtSnap.docs[0];
        }

        if (!targetOrderDoc) {
            return res.status(200).json({ ok: true, msg: 'Order not found or ignored' });
        }

        const ordData = targetOrderDoc.data();

        // 🛡️ 1. قفل الأمان: رفض معالجة أي طلب غير مرتبط بمورد خارجي
        if (!ordData.supplierId) {
            return res.status(403).json({ ok: false, error: 'Target order is not a supplier order' });
        }

        // 🛡️ 2. منع تضارب المعرفات الخارجية إذا كان المعرف مسجلاً مسبقاً على الطلب
        if (ordData.externalOrderId && incomingExternalId && String(ordData.externalOrderId).trim() !== incomingExternalId) {
            return res.status(409).json({ ok: false, error: 'External order ID mismatch' });
        }

        const effectiveExtId = ordData.externalOrderId || incomingExternalId;
        if (!effectiveExtId) {
            return res.status(400).json({ ok: false, error: 'Cannot verify order without externalOrderId' });
        }

        // 🛡️ 3. التحقق الإلزامي المغلق (Fail-Closed Live Verification) من سيرفر المورد مباشرة
        let verifiedResultFromSupplier = null;
        try {
            const suppRef = db.collection('telecard_suppliers').doc(String(ordData.supplierId));
            const [suppSnap, secSnap] = await Promise.all([suppRef.get(), suppRef.collection('secrets').doc('api').get()]);
            if (suppSnap.exists && secSnap.exists) {
                const suppData = suppSnap.data();
                const token = secSnap.data().token;
                const adapter = ProviderAdapters[suppData.type] || ClientApiStandardAdapter;
                const checkResult = await adapter.checkOrdersStatus(suppData.baseUrl, token, [effectiveExtId], suppData.type);
                if (Array.isArray(checkResult) && checkResult.length > 0) {
                    verifiedResultFromSupplier = checkResult.find(item => String(item.externalOrderId).trim() === String(effectiveExtId).trim()) || checkResult[0];
                }
            }
        } catch (vErr) {
            verifiedResultFromSupplier = null;
        }

        // إذا تعذر التحقق المباشر من سيرفر المورد لحظتها، نفعّل علامة الفحص الدوري ليتولاها الكرون بأمان دون مخاطرة مالية
        if (!verifiedResultFromSupplier) {
            if (['pending', 'processing'].includes(ordData.status)) {
                await targetOrderDoc.ref.update({
                    ...(incomingExternalId && !ordData.externalOrderId ? { externalOrderId: incomingExternalId } : {}),
                    isPendingSupplierCheck: true
                }).catch(() => {});
            }
            return res.status(200).json({ ok: false, msg: 'Live verification unavailable; queued for scheduled reconciliation' });
        }

        if (verifiedResultFromSupplier.status === 'completed') {
            await finalizeDeferredSupplierOrder(targetOrderDoc.id, {
                status: 'completed',
                deliveredCode: verifiedResultFromSupplier.deliveredCode || extractDeliveredCodeFromResponse(root) || 'تم التنفيذ بنجاح',
                externalOrderId: effectiveExtId,
                actualCostRaw: verifiedResultFromSupplier.actualCostRaw || FinancialEngine.extractNum(root.price ?? root.cost ?? 0)
            }, db);
            return res.status(200).json({ ok: true });
        }

        if (verifiedResultFromSupplier.status === 'rejected') {
            await finalizeDeferredSupplierOrder(targetOrderDoc.id, {
                status: 'rejected',
                reason: 'تعذر تنفيذ الطلب من المزود وتم إرجاع المبلغ لمحفظتك بالكامل.'
            }, db);
            return res.status(200).json({ ok: true });
        }

        return res.status(200).json({ ok: true, status: 'still_processing' });
    } catch (error) {
        console.error('Supplier Webhook Error:', error);
        return res.status(200).json({ ok: false });
    }
});

// ==========================================
// ⏱️ المهمة المجدولة الموحدة للموردين (كل 10 دقائق)
// ==========================================
const runCheckPendingSupplierOrders = async () => {
    try {
        const pendingSuppOrdersSnap = await db.collection('telecard_orders')
            .where('isPendingSupplierCheck', '==', true)
            .limit(100)
            .get();

        if (pendingSuppOrdersSnap.empty) return null;

        const nowMs = Date.now();
        const MAX_POLLING_AGE_MS = 24 * 60 * 60 * 1000;
        const ordersBySupplier = new Map();

        for (const doc of pendingSuppOrdersSnap.docs) {
            const d = doc.data();

            if (!['pending', 'processing'].includes(d.status) || d.isAutoDelivered) {
                doc.ref.update({ isPendingSupplierCheck: admin.firestore.FieldValue.delete() }).catch(() => {});
                continue;
            }

            const orderCreatedMs = FinancialEngine.parseSafeTime(d.time || d.createdAt);
            if (orderCreatedMs > 0 && (nowMs - orderCreatedMs) > MAX_POLLING_AGE_MS) {
                await doc.ref.update({
                    status: 'pending',
                    isPendingSupplierCheck: admin.firestore.FieldValue.delete(),
                    requiresAdminAttention: true,
                    adminNote: '⚠️ تنبيه للإدمن: تجاوز الطلب 24 ساعة لدى المورد دون رد نهائي. تم تحويله للمراجعة اليدوية.'
                }).catch(() => {});
                await notifyAdminOfCriticalError(
                    '⏳ طلب مورد تجاوز 24 ساعة دون رد!',
                    `الطلب (#${d.displayId || doc.id}) للمنتج (${d.product || 'منتج'}) لم يحسمه المورد خلال 24 ساعة وتم تحويله للمراجعة اليدوية.`,
                    { target: 'orders', orderId: String(doc.id) }
                ).catch(() => {});
                continue;
            }
            if (d.supplierId && d.externalOrderId) {
                const sId = String(d.supplierId);
                if (!ordersBySupplier.has(sId)) ordersBySupplier.set(sId, []);
                ordersBySupplier.get(sId).push({ docId: doc.id, externalOrderId: String(d.externalOrderId) });
            }
        }

        if (ordersBySupplier.size === 0) return null;

        for (const [supplierId, ordersList] of ordersBySupplier.entries()) {
            try {
                const suppRef = db.collection('telecard_suppliers').doc(supplierId);
                const [suppSnap, secretSnap] = await Promise.all([
                    suppRef.get(),
                    suppRef.collection('secrets').doc('api').get()
                ]);
                if (!suppSnap.exists || !secretSnap.exists) continue;

                const supplier = suppSnap.data();
                const token = secretSnap.data().token;
                const adapterObj = ProviderAdapters[supplier.type] || ClientApiStandardAdapter;
                if (typeof adapterObj.checkOrdersStatus !== 'function') continue;

                const extIds = ordersList.map(o => o.externalOrderId);
                const checkResults = await adapterObj.checkOrdersStatus(supplier.baseUrl, token, extIds, supplier.type);

                for (const resItem of checkResults) {
                    const matchedOrder = ordersList.find(o => o.externalOrderId === resItem.externalOrderId);
                    if (!matchedOrder) continue;

                    if (resItem.status === 'completed') {
                        await finalizeDeferredSupplierOrder(matchedOrder.docId, {
                            status: 'completed',
                            deliveredCode: resItem.deliveredCode || 'تم التنفيذ بنجاح',
                            externalOrderId: resItem.externalOrderId,
                            actualCostRaw: resItem.actualCostRaw
                        }, db);
                    } else if (resItem.status === 'rejected') {
                        await finalizeDeferredSupplierOrder(matchedOrder.docId, {
                            status: 'rejected',
                            reason: 'تعذر تنفيذ الطلب من المزود وتم إرجاع المبلغ لمحفظتك بالكامل.'
                        }, db);
                    }
                }
            } catch (suppCheckErr) {}
        }
        return true;
    } catch (error) {
        return null;
    }
};

const runScheduledSupplierSync = async () => {
    try {
        const suppliersSnap = await db.collection('telecard_suppliers')
            .where('isActive', '==', true)
            .where('autoSync', '==', true)
            .get();

        if (suppliersSnap.empty) return null;

        const nowMs = Date.now();
        const TOPIC_NAME = 'telecard-sync-supplier-topic';
        const promises = [];

        suppliersSnap.docs.forEach(doc => {
            const data = doc.data();
            const intervalMinutes = Math.max(10, Number(data.syncIntervalMinutes || 120));
            const intervalMs = intervalMinutes * 60 * 1000;
            const lastSyncMs = data.lastSync?.toMillis ? data.lastSync.toMillis() : 0;

            if ((nowMs - lastSyncMs) >= intervalMs) {
                promises.push(
                    pubsub.topic(TOPIC_NAME).publishMessage({ json: { supplierId: doc.id } })
                );
            }
        });

        if (promises.length > 0) {
            await Promise.allSettled(promises);
        }
        return true;
    } catch (error) {
        await logCloudError('SCHEDULED_SYNC_DISPATCHER_CRASH', error);
        return null;
    }
};

// 🆓 المهمة المجدولة المجانية (3 من 3) - كل 10 دقائق
exports.scheduledSupplierSync = onSchedule({
    region: 'us-east1',
    schedule: 'every 10 minutes',
    timeZone: 'Asia/Riyadh',
    memory: '256MiB',
    timeoutSeconds: 120,
    maxInstances: 1,
    concurrency: 1
}, async () => {
    await Promise.allSettled([
        runCheckPendingSupplierOrders(),
        runScheduledSupplierSync()
    ]);
    return true;
});

// ==========================================
// 💰 جلب رصيد حسابك المباشر لدى المورد لعرضه في لوحة الإدارة
// ==========================================
exports.adminGetSupplierBalance = onCall({
    region: 'us-east1',
    memory: '256MiB',
    timeoutSeconds: 30,
    enforceAppCheck: false
}, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const supplierId = String(request.data?.supplierId || '').trim();
    if (!supplierId) throw new HttpsError('invalid-argument', 'معرف المورد مفقود.');

    try {
        const suppRef = db.collection('telecard_suppliers').doc(supplierId);
        const [suppSnap, secretSnap, configSnap] = await Promise.all([
            suppRef.get(),
            suppRef.collection('secrets').doc('api').get(),
            db.collection('telecard_system').doc('active_configs').get()
        ]);

        if (!suppSnap.exists) throw new HttpsError('not-found', 'المورد غير موجود.');
        const supplier = suppSnap.data();
        const token = secretSnap.exists ? secretSnap.data().token : null;
        if (!token) throw new HttpsError('failed-precondition', 'المفتاح السري للمورد غير موجود.');

        const cleanSuppUrl = String(supplier.baseUrl || '').trim();
let profileUrl;
if (isCustomB2BEndpoint(cleanSuppUrl, supplier.type)) {
    profileUrl = buildCustomB2BUrl(cleanSuppUrl, 'balance');
} else {
    const origin = extractBaseOrigin(cleanSuppUrl);
    profileUrl = `${origin}/client/api/profile`;
}
        const profileData = await secureSupplierRequest(profileUrl, token, 'GET', null, 10000);
        const root = profileData?.data || profileData || {};

        const rawBalance = FinancialEngine.extractNum(root.balance ?? root.wallet ?? root.credit ?? 0);
        const suppCurrency = String(supplier.currency || 'USD').toUpperCase();
        const rates = (configSnap.exists && Array.isArray(configSnap.data().rates)) ? configSnap.data().rates : [];

        let balanceUsd = rawBalance;
        if (suppCurrency !== 'USD' && rawBalance > 0) {
            try {
                balanceUsd = FinancialEngine.convertViaUSDHelper(rawBalance, suppCurrency, 'USD', rates, 'round', 'deposit');
            } catch (e) {}
        }

        return {
            success: true,
            supplierId,
            supplierName: supplier.name,
            currency: suppCurrency,
            rawBalance: FinancialEngine.sanitizeAmount(rawBalance),
            balanceUsd: FinancialEngine.sanitizeAmount(balanceUsd),
            accountEmail: root.email || null,
            isLowBalance: balanceUsd < 20
        };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `فشل جلب رصيد المورد: ${error.message}`);
    }
});

// ==========================================
// 🔍 جلب كتالوج المورد في الذاكرة للبحث والربط
// ==========================================
exports.adminFetchSupplierCatalog = onCall({
    region: 'us-east1',
    memory: '256MiB',
    timeoutSeconds: 60,
    enforceAppCheck: false
}, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const supplierId = String(request.data?.supplierId || '').trim();
    if (!supplierId) throw new HttpsError('invalid-argument', 'معرف المورد مفقود.');

    try {
        const suppRef = db.collection('telecard_suppliers').doc(supplierId);
        const [suppSnap, secretSnap] = await Promise.all([
            suppRef.get(),
            suppRef.collection('secrets').doc('api').get()
        ]);

        if (!suppSnap.exists) throw new HttpsError('not-found', 'المورد غير موجود.');
        const supplier = suppSnap.data();
        const token = secretSnap.exists ? secretSnap.data().token : null;
        if (!token) throw new HttpsError('failed-precondition', 'المفتاح السري للمورد غير موجود.');

        const adapterObj = ProviderAdapters[supplier.type] || ClientApiStandardAdapter;
        const rawItems = await adapterObj.fetchCatalog(supplier.baseUrl, token, [], { supplierType: supplier.type });
        const dummyReadOnlyTx = { get: (ref) => ref.get() };
        const { ratesData } = await FinancialEngine.fetchSystemData(dummyReadOnlyTx, db, { onlyConfigs: true });
        const suppCurrency = String(supplier.currency || 'USD').toUpperCase();

        const catalogPreview = rawItems.map(item => {
            let costUsd = item.cost;
            if (suppCurrency !== 'USD' && item.cost > 0) {
                try {
                    const rawCostUsd = FinancialEngine.convertViaUSD(item.cost, suppCurrency, 'USD', ratesData, 'pricing', true);
                    costUsd = rawCostUsd < 0.05
                        ? rawCostUsd
                        : FinancialEngine.convertViaUSDHelper(item.cost, suppCurrency, 'USD', ratesData, 'ceil', 'pricing');
                } catch (e) {}
            }
            return {
                externalId: item.externalId,
                name: item.name,
                categoryName: item.categoryName || '',
                costRaw: item.cost,
                currency: suppCurrency,
                costUsd: costUsd < 0.05 ? FinancialEngine._internalSanitize(costUsd) : FinancialEngine.sanitizeAmount(costUsd),
                stock: item.stock,
                paramsPrompt: item.paramsPrompt || []
            };
        });

        return {
            success: true,
            supplierName: supplier.name,
            currency: suppCurrency,
            totalItems: catalogPreview.length,
            items: catalogPreview
        };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `فشل جلب كتالوج المورد: ${error.message}`);
    }
});

// ==========================================
// 🚀 المزامنة اليدوية الانتقائية
// ==========================================
exports.syncSupplierData = onCall({
    region: 'us-east1',
    memory: '512MiB',
    timeoutSeconds: 540,
    enforceAppCheck: false
}, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try {
        const result = await coreSyncLogic(request.data.supplierId);
        await logAdminAction(request.auth.uid, 'MANUAL_SYNC_SUPPLIER', `مزامنة انتقائية للمورد: ${request.data.supplierId}`);
        return {
            success: true,
            message: `تم فحص ${result.linkedCount} منتج مربوط بهذا المورد، وتحديث أسعار وتوفر ${result.updatedProductsCount} منتج فعلياً.`,
            ...result
        };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// ⚙️ منفذ المزامنة المحمي ضد استنزاف الذاكرة
// ==========================================
exports.onSupplierSyncWorker = onMessagePublished({
    region: 'us-east1',
    topic: 'telecard-sync-supplier-topic',
    memory: '512MiB',
    concurrency: 1,
    maxInstances: 5,
    timeoutSeconds: 540
}, async (event) => {
    const supplierId = event.data.message.json.supplierId;
    if (!supplierId) return;

    try {
        await coreSyncLogic(supplierId);
    } catch (e) {
        await logCloudError('AUTO_SYNC_WORKER_FAILED', e, supplierId);
    }
});

// ==========================================
// 🛡️ حفظ بيانات المورد من الإدارة
// ==========================================
exports.secureSaveSupplier = onCall({
    region: 'us-east1',
    enforceAppCheck: false
}, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');

    const { id, name, type, baseUrl, orderUrl, token, defaultMargin, autoSync, syncIntervalMinutes, currency, isActive } = request.data || {};

    const urlCheck = await SecurityEngine.isSafeUrlAsync(baseUrl);
    if (!baseUrl || !urlCheck.isSafe) {
        throw new HttpsError('invalid-argument', 'رابط المورد غير صالح أو غير آمن.');
    }

    if (orderUrl && String(orderUrl).trim() !== '') {
        const orderUrlCheck = await SecurityEngine.isSafeUrlAsync(String(orderUrl).trim());
        if (!orderUrlCheck.isSafe) {
            throw new HttpsError('invalid-argument', 'رابط تنفيذ الطلبات غير صالح أو غير آمن.');
        }
    }

    const suppId = id || SecurityEngine.generateUniqueId('supp');
    const suppCurrency = String(currency || 'USD').toUpperCase();
    const safeName = SecurityEngine.sanitizeText(String(name || ''), 100);

    try {
        const suppRef = db.collection('telecard_suppliers').doc(suppId);
        const existingSnap = id ? await suppRef.get() : null;
        const isExisting = Boolean(existingSnap && existingSnap.exists);
        const existingData = isExisting ? existingSnap.data() : {};

        const LOCK_TIMEOUT_MS = 10 * 60 * 1000;
        const isStaleLock = existingData.isSyncing && existingData.lastSyncAttempt && (Date.now() - existingData.lastSyncAttempt.toMillis()) > LOCK_TIMEOUT_MS;

        const supplierPayload = {
            id: suppId,
            name: safeName,
            type: type || 'standard_api',
            baseUrl: String(baseUrl).trim(),
            orderUrl: orderUrl && String(orderUrl).trim() !== '' ? String(orderUrl).trim() : String(baseUrl).trim(),
            currency: suppCurrency,
            defaultMargin: FinancialEngine.extractNum(defaultMargin),
            autoSync: Boolean(autoSync),
            syncIntervalMinutes: Math.max(10, Number(syncIntervalMinutes || 120)),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (!isExisting) {
            supplierPayload.isActive = isActive !== undefined ? Boolean(isActive) : true;
            supplierPayload.isSyncing = false;
            supplierPayload.createdAt = admin.firestore.FieldValue.serverTimestamp();
        } else {
            if (isActive !== undefined) supplierPayload.isActive = Boolean(isActive);
            if (isStaleLock) supplierPayload.isSyncing = false;
        }

        const batch = db.batch();
        batch.set(suppRef, supplierPayload, { merge: true });

        if (token && token.trim() !== '') {
            batch.set(suppRef.collection('secrets').doc('api'), { token: token.trim() }, { merge: true });
        }

        await batch.commit();
        await logAdminAction(request.auth.uid, 'SAVE_SUPPLIER', `تم حفظ المورد: ${safeName}`);

        return { success: true, id: suppId };
    } catch (error) {
        throw new HttpsError('internal', 'فشل حفظ بيانات المورد في النظام.');
    }
});

// ==========================================
// 🗑️ حذف المورد بأمان وفك ارتباط المنتجات
// ==========================================
exports.adminDeleteSupplier = onCall({
    region: 'us-east1',
    memory: '256MiB',
    timeoutSeconds: 120,
    enforceAppCheck: false
}, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const supplierId = String(request.data?.supplierId || '').trim();
    if (!supplierId) throw new HttpsError('invalid-argument', 'معرف المورد مفقود.');

    try {
        const suppRef = db.collection('telecard_suppliers').doc(supplierId);
        const suppSnap = await suppRef.get();
        if (!suppSnap.exists) throw new HttpsError('not-found', 'المورد غير موجود.');

        // 🛡️ فحص مباشر لطلبات المورد النشطة بـ 2 قراءة فقط دون الحاجة لفهرس مركب أو قراءة 200 طلب عام
        const [pendingSuppSnap, procSuppSnap] = await Promise.all([
            db.collection('telecard_orders').where('supplierId', '==', supplierId).where('status', '==', 'pending').limit(1).get(),
            db.collection('telecard_orders').where('supplierId', '==', supplierId).where('status', '==', 'processing').limit(1).get()
        ]);

        const hasActiveSupplierOrder = !pendingSuppSnap.empty || !procSuppSnap.empty;
        if (hasActiveSupplierOrder) {
            throw new HttpsError('failed-precondition', 'لا يمكن حذف المورد حالياً! توجد طلبات قيد الانتظار أو المعالجة مرتبطة به.');
        }

        const linkedProdsSnap = await db.collection('telecard_prods').where('supplierId', '==', supplierId).get();
        let unlinkedCount = 0;

        if (!linkedProdsSnap.empty) {
            unlinkedCount = await SecurityEngine.processInBatches(db, linkedProdsSnap.docs, async (batch, doc) => {
                const pData = doc.data();
                const updates = {
                    supplierId: null,
                    externalId: null,
                    isExternal: false,
                    isAvailable: false,
                    syncNote: 'تنبيه أمني: تم حذف المورد المرتبط بهذا المنتج.'
                };
                if (pData.type === 'select' && Array.isArray(pData.options)) {
                    updates.options = pData.options.map(opt => {
                        if (!opt) return opt;
                        return { ...opt, supplierId: null, externalId: null, isAvailable: false };
                    });
                }
                batch.update(doc.ref, updates);
            }, 400);
        }

        await suppRef.collection('secrets').doc('api').delete().catch(() => {});
        await suppRef.delete();

        await logAdminAction(request.auth.uid, 'DELETE_SUPPLIER', `تم حذف المورد (${supplierId}) وفك ارتباط ${unlinkedCount} منتج.`);
        return { success: true, unlinkedProductsCount: unlinkedCount };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `فشل حذف المورد: ${error.message}`);
    }
});

// ==========================================
// ⚡ فحص استباقي حي لطلب واحد عند المورد قبل تدخل الإدمن
// ==========================================
const checkSingleSupplierOrderLive = async (supplierId, externalOrderId) => {
    if (!supplierId || !externalOrderId) return null;
    try {
        const suppRef = db.collection('telecard_suppliers').doc(String(supplierId));
        const [suppSnap, secSnap] = await Promise.all([suppRef.get(), suppRef.collection('secrets').doc('api').get()]);
        if (!suppSnap.exists || !secSnap.exists) return null;
        const adapter = ProviderAdapters[suppSnap.data().type] || ClientApiStandardAdapter;
        if (typeof adapter.checkOrdersStatus !== 'function') return null;
        const results = await adapter.checkOrdersStatus(suppSnap.data().baseUrl, secSnap.data().token, [String(externalOrderId)], suppSnap.data().type);
        return (Array.isArray(results) && results.length > 0) ? results[0] : null;
    } catch (e) {
        return null;
    }
};

// ==========================================
// 🔍 محرك المطابقة والتسوية المالية مع الموردين لآخر 48 ساعة (T+1 Reconciliation Engine)
// ==========================================
const runSupplierOrdersReconciliation = async (hoursLookback = 48) => {
    try {
        const cutoffMs = Date.now() - (hoursLookback * 60 * 60 * 1000);
        const cutoffTimestamp = admin.firestore.Timestamp.fromMillis(cutoffMs);

        const recentOrderDocs = [];
        let lastCursorDoc = null;
        const PAGE_SIZE = 500;
        const MAX_ORDERS_TO_SCAN = 2500;

        while (recentOrderDocs.length < MAX_ORDERS_TO_SCAN) {
            let pageQuery = db.collection('telecard_orders')
                .where('time', '>=', cutoffTimestamp)
                .orderBy('time', 'desc')
                .limit(PAGE_SIZE);

            if (lastCursorDoc) {
                pageQuery = pageQuery.startAfter(lastCursorDoc);
            }

            const pageSnap = await pageQuery.get();
            if (pageSnap.empty) break;

            recentOrderDocs.push(...pageSnap.docs);
            if (pageSnap.size < PAGE_SIZE) break;
            lastCursorDoc = pageSnap.docs[pageSnap.docs.length - 1];
        }

        if (recentOrderDocs.length === 0) return { checkedCount: 0, discrepanciesCount: 0, autoHealedCount: 0 };

        const ordersBySupplier = new Map();
        const ghostOrders = [];
        const nowMs = Date.now();

        for (const doc of recentOrderDocs) {
            const d = doc.data();
            if (!d.supplierId) continue;
            if (d.reconciliationAlerted === true) continue;

            const createdMs = FinancialEngine.parseSafeTime(d.time || d.createdAt) || 0;
            if (!d.externalOrderId) {
                if (['pending', 'processing'].includes(d.status) && createdMs > 0 && (nowMs - createdMs) > 15 * 60 * 1000) {
                    ghostOrders.push({ ref: doc.ref, orderId: d.displayId || doc.id, product: d.product, status: d.status });
                }
                continue;
            }

            const sId = String(d.supplierId);
            if (!ordersBySupplier.has(sId)) ordersBySupplier.set(sId, []);
            ordersBySupplier.get(sId).push({
                docId: doc.id,
                displayId: d.displayId || doc.id,
                ref: doc.ref,
                localStatus: d.status,
                externalOrderId: String(d.externalOrderId),
                product: d.product,
                adminNote: d.adminNote || ''
            });
        }

        const discrepancies = [];
        let autoHealedCount = 0;
        let totalChecked = 0;

        for (const [supplierId, ordersList] of ordersBySupplier.entries()) {
            try {
                const suppRef = db.collection('telecard_suppliers').doc(supplierId);
                const [suppSnap, secretSnap] = await Promise.all([
                    suppRef.get(),
                    suppRef.collection('secrets').doc('api').get()
                ]);
                if (!suppSnap.exists || !secretSnap.exists) continue;

                const supplier = suppSnap.data();
                const token = secretSnap.data().token;
                const adapterObj = ProviderAdapters[supplier.type] || ClientApiStandardAdapter;
                if (typeof adapterObj.checkOrdersStatus !== 'function') continue;

                for (let i = 0; i < ordersList.length; i += 50) {
                    const batchOrders = ordersList.slice(i, i + 50);
                    const extIds = batchOrders.map(o => o.externalOrderId);
                    const checkResults = await adapterObj.checkOrdersStatus(supplier.baseUrl, token, extIds, supplier.type);
                    totalChecked += batchOrders.length;

                    for (const resItem of checkResults) {
                        const localOrd = batchOrders.find(o => o.externalOrderId === resItem.externalOrderId);
                        if (!localOrd) continue;

                        const suppStatus = resItem.status;
                        const locStatus = localOrd.localStatus;

                        if (suppStatus === 'completed' && ['rejected', 'refunded', 'returned'].includes(locStatus)) {
                            const rescuedCode = resItem.deliveredCode || 'تم التنفيذ لدى المورد';
                            await localOrd.ref.update({
                                lateSupplierCode: rescuedCode,
                                requiresAdminAttention: true,
                                reconciliationAlerted: true
                            }).catch(() => {});
                            discrepancies.push({
                                type: 'PAID_AT_SUPPLIER_BUT_REFUNDED_LOCALLY',
                                severity: 'CRITICAL',
                                orderId: localOrd.displayId,
                                externalOrderId: localOrd.externalOrderId,
                                product: localOrd.product,
                                details: `تم تنفيذه وخصمه عند المورد (${supplier.name}) بينما هو مرفوض ومسترد للعميل في متجرك!`
                            });
                        }

                        else if (suppStatus === 'rejected' && locStatus === 'completed') {
                            await localOrd.ref.update({
                                requiresAdminAttention: true,
                                reconciliationAlerted: true,
                                adminNote: `${localOrd.adminNote} | ⚠️ [تضارب عكسي: مكتمل عند العميل ولكنه مرفوض لدى المورد!]`.trim()
                            }).catch(() => {});

                            discrepancies.push({
                                type: 'COMPLETED_LOCALLY_BUT_REJECTED_AT_SUPPLIER',
                                severity: 'HIGH',
                                orderId: localOrd.displayId,
                                externalOrderId: localOrd.externalOrderId,
                                product: localOrd.product,
                                details: `مسجل كمكتمل للعميل في متجرك ولكن حالته عند المورد (${supplier.name}) مرفوض!`
                            });
                        }

                        else if (['pending', 'processing'].includes(locStatus) && (suppStatus === 'completed' || suppStatus === 'rejected')) {
                            await finalizeDeferredSupplierOrder(localOrd.docId, {
                                status: suppStatus,
                                deliveredCode: resItem.deliveredCode || 'تم التنفيذ بنجاح عبر المزود المباشر',
                                externalOrderId: localOrd.externalOrderId,
                                actualCostRaw: resItem.actualCostRaw,
                                reason: 'تعذر تنفيذ الطلب من المزود وتم إرجاع المبلغ لمحفظتك بالكامل.'
                            }, db);
                            autoHealedCount++;
                        }
                    }
                }
            } catch (suppErr) {}
        }

        for (const g of ghostOrders) {
            await g.ref.update({ reconciliationAlerted: true }).catch(() => {});
            discrepancies.push({
                type: 'GHOST_ORDER_MISSING_EXT_ID',
                severity: 'MEDIUM',
                orderId: g.orderId,
                externalOrderId: 'غير مسجل',
                product: g.product,
                details: 'طلب معلق بدون رقم مرجعي من المورد (انقطع الاتصال لحظة الشراء)، يرجى مراجعته في موقع المورد.'
            });
        }

        if (discrepancies.length > 0) {
            const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
            await db.collection('telecard_system_errors').add({
                action: 'SUPPLIER_RECONCILIATION_MISMATCH',
                details: `تم اكتشاف (${discrepancies.length}) طلب غير متطابق مع الموردين خلال آخر ${hoursLookback} ساعة.`,
                discrepancies: discrepancies,
                autoHealedCount: autoHealedCount,
                time: admin.firestore.FieldValue.serverTimestamp(),
                expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + THIRTY_DAYS_MS)
            });

            const sampleIds = discrepancies.slice(0, 3).map(d => `#${d.orderId}`).join('، ');
            await notifyAdminOfCriticalError(
                `🚨 اكتشاف (${discrepancies.length}) خلل في مطابقة طلبات الموردين!`,
                `يوجد (${discrepancies.length}) طلب غير متطابق بين متجرك والمورد (منها: ${sampleIds}). يرجى مراجعة الطلبات وسجل الأخطاء فوراً!`,
                { target: 'orders' }
            );
        }

        return { checkedCount: totalChecked, discrepanciesCount: discrepancies.length, autoHealedCount, discrepancies };
    } catch (error) {
        await logCloudError('SUPPLIER_RECONCILIATION_CRASH', error);
        return null;
    }
};

exports.fulfillOrderWithSupplier = fulfillOrderWithSupplier;
exports.checkSingleSupplierOrderLive = checkSingleSupplierOrderLive;
exports.finalizeDeferredSupplierOrder = finalizeDeferredSupplierOrder;
exports.runSupplierOrdersReconciliation = runSupplierOrdersReconciliation;
