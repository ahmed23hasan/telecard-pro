// ============================================================================
// ☁️ بوابة الـ API ومستقبل الـ Webhooks (functions/developerApi.js) - النسخة الماسية V12.14.0 💎
// 🎯 الوظيفة: معالجة طلبات التجار الخارجية، طابور الـ Webhooks، والتوقيع الرقمي
// 🚀 التحديثات (V12.14.0 - Dynamic Resolution & IPv6 Patch):
// 1. Dynamic Webhook 🔄: جلب رابط الإشعار لحظياً من ملف التاجر بدلاً من الاعتماد على بيانات الطلب القديمة.
// 2. IPv6 Support 🌐: فحص نوع الـ IP ديناميكياً (4 أو 6) لمنع انهيار الاتصال بالمتاجر التي لا تدعم IPv4.
// 3. User Snapshot 📸: تضمين بيانات المستخدم (Snapshot) داخل الطلب لتقليل الاستعلامات ورفع الأداء.
// 4. Strict Idempotency 🛡️: تضمين أسعار المنتج (Base & Display) في البصمة لمنع التلاعب بالتسعير.
// 5. Centralized Validation 🌐: فحص روابط التجار مركزياً لمنع ثغرات (SSRF).
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const https = require('https'); 
const net = require('net'); // 🛡️ استدعاء مكتبة الشبكات لدعم IPv6
const FinancialEngine = require('./financialEngine.js');
const SecurityEngine = require('./securityEngine.js'); 

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const SYSTEM_LIMITS = { MAX_QTY_PER_ORDER: 10000, MAX_VAULT_QTY_PER_ORDER: 100 };
const sanitizeAmount = (amount) => FinancialEngine.sanitizeAmount(amount);
const safeSub = (a, b) => Math.max(0, FinancialEngine.safeSub(a, b));
const getStartOfUTCDay = (ms) => FinancialEngine.getStartOfUTCDay(ms);
const MATH_EPSILON = 0.0001; 

// ==========================================
// 🛡️ دالة الاتصال الآمن للـ Webhooks
// ==========================================
async function secureWebhookFetch(urlString, payload, preComputedSignature) {
    const urlCheck = await SecurityEngine.isSafeUrlAsync(urlString);
    if (!urlCheck.isSafe) {
        throw new Error(`Webhook blocked for security reasons: ${urlCheck.reason}`);
    }

    const { parsedUrl, ip: resolvedIp } = urlCheck;
    const bodyData = JSON.stringify(payload);

    const options = {
        hostname: parsedUrl.hostname, 
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'identity', 
            'User-Agent': 'Telecard-Cloud-Engine/6.1', 
            'Content-Length': Buffer.byteLength(bodyData)
        },
        lookup: (host, opts, cb) => {
            // 🛡️ [إصلاح ثغرة IPv6]: تحديد نوع الـ IP ديناميكياً لتفادي الانهيار مع خوادم IPv6
            const ipFamily = net.isIPv6(resolvedIp) ? 6 : 4;
            cb(null, resolvedIp, ipFamily); 
        },
        timeout: 10000 
    };

    if (preComputedSignature) options.headers['X-Telecard-Signature'] = preComputedSignature;

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            res.on('data', () => {}); 
            res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
        });

        req.on('error', (e) => reject(e));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Connection Timeout'));
        });

        req.write(bodyData);
        req.end();
    });
}

async function logFailedWebhook(payload, webhookUrl, errorMsg, userId, signature) {
    const nextRetryMs = Date.now() + (15 * 60 * 1000); 
    
    await db.collection('telecard_failed_webhooks').add({
        userId: userId, payload: payload, webhookUrl: webhookUrl, attempts: 1,
        signature: signature || null, 
        status: 'failed', error: errorMsg || 'Unknown Connection Error', 
        lastAttempt: admin.firestore.FieldValue.serverTimestamp(),
        nextRetryAt: admin.firestore.Timestamp.fromMillis(nextRetryMs) 
    });
}

// ==========================================
// 🔔 1. مشغل إشعارات التجار (Webhooks)
// ==========================================
exports.orderStatusWebhook = onDocumentWritten({ 
    document: 'telecard_orders/{orderId}',
    region: 'us-east1' // 🛡️ توجيه جغرافي صريح
}, async (event) => {
    if (!event.data.after.exists) return null;
    const after = event.data.after.data();
    const before = event.data.before.exists ? event.data.before.data() : null;
    
    if (before && before.status === after.status) return null;
    
    // تأكيد أن الطلب تابع لـ API قبل الاستمرار لتوفير القراءات
    if (!after.isApiOrder && !after.merchantData) return null; 
    
    try {
        // 🚀 [الحل الاحترافي - Dynamic Resolution]: قراءة الرابط اللحظي المحدث من ملف التاجر
        const userDoc = await db.collection('telecard_users').doc(String(after.userId)).get();
        if (!userDoc.exists) return null;
        
        const userData = userDoc.data();
        const webhookUrl = userData.webhookUrl;
        const webhookSecret = userData.webhookSecret;
        
        if (!webhookUrl) return null; 
        
        const payload = {
            eventId: event.id, event: before ? 'order_status_changed' : 'order_created',
            orderId: after.displayId || after.id, productId: after.prodId, productName: after.product, 
            status: after.status, 
            pricePaid: after.priceLocalDeducted ?? after.price,
            priceCurrency: after.priceCurrency || 'USD',
            qty: after.qty,
            deliveredCode: after.deliveredCode || null, timestamp: new Date().toISOString()
        };
        
        const signature = SecurityEngine.generateHmacSignature(payload, webhookSecret);

        try {
            const response = await secureWebhookFetch(webhookUrl, payload, signature);
            if (!response.ok) await logFailedWebhook(payload, webhookUrl, `HTTP Error: ${response.status}`, after.userId, signature);
            return true;
        } catch (fetchErr) {
            await logFailedWebhook(payload, webhookUrl, fetchErr.message, after.userId, signature);
            return null;
        }
    } catch (error) { 
        console.error("Webhook Error:", error);
        return null; 
    }
});

// ==========================================
// 🔄 2. نظام المحاولات الذاتي (Retry Cron)
// ==========================================
exports.cronRetryWebhooks = onSchedule({
            region: 'us-east1', // 🛡️ توجيه جغرافي صريح
            schedule: 'every 15 minutes',
            timeZone: 'UTC', // ✅ تم التوحيد مع المعمارية الجديدة
            timeoutSeconds: 540,
            memory: '512MiB',
            maxInstances: 1,
            concurrency: 1
        }, async (event) => {    const now = admin.firestore.Timestamp.now();
    
    const failedSnaps = await db.collection('telecard_failed_webhooks')
        .where('status', '==', 'failed')
        .where('nextRetryAt', '<=', now)
        .limit(300)
        .get();
        
    if (failedSnaps.empty) return null;
    
    const docs = failedSnaps.docs;
    const CONCURRENCY_LIMIT = 20; 
    
    for (let i = 0; i < docs.length; i += CONCURRENCY_LIMIT) {
        const chunk = docs.slice(i, i + CONCURRENCY_LIMIT);
        
        const promises = chunk.map(async (doc) => {
            const data = doc.data(); 
            const currentAttempt = data.attempts + 1; 
            const isLastAttempt = currentAttempt >= 5;
            
            let delayMs = 15 * 60 * 1000; 
            if (currentAttempt === 3) delayMs = 60 * 60 * 1000; 
            if (currentAttempt === 4) delayMs = 6 * 60 * 60 * 1000; 
            
            const nextRetryMs = Date.now() + delayMs;
            const nextRetryTimestamp = admin.firestore.Timestamp.fromMillis(nextRetryMs);
            
            try {
                const response = await secureWebhookFetch(data.webhookUrl, data.payload, data.signature); 
                
                if (response.ok) {
                    return doc.ref.update({ status: 'success', attempts: currentAttempt, lastAttempt: admin.firestore.FieldValue.serverTimestamp() });
                } else {
                    return doc.ref.update({ 
                        status: isLastAttempt ? 'permanently_failed' : 'failed', 
                        attempts: currentAttempt, 
                        error: `HTTP ${response.status}`, 
                        lastAttempt: admin.firestore.FieldValue.serverTimestamp(),
                        nextRetryAt: nextRetryTimestamp
                    });
                }
            } catch (err) {
                const errorNote = err.message || 'Unknown Error';
                const isSecurityBlock = errorNote.includes('blocked') || errorNote.includes('security');
                return doc.ref.update({ 
                    status: (isLastAttempt || isSecurityBlock) ? 'permanently_failed' : 'failed', 
                    attempts: currentAttempt, 
                    error: errorNote, 
                    lastAttempt: admin.firestore.FieldValue.serverTimestamp(),
                    nextRetryAt: nextRetryTimestamp
                });
            }
        });
        
        await Promise.allSettled(promises);
    }
    
    return true;
});

// ============================================================================
// ⚠️ تحذير معماري شديد الأهمية (Architecture Manifesto - High Concurrency Shield):
// يُمنع منعاً باتاً نقل استعلام جلب الأكواد (where isSold == false) إلى داخل الـ Transaction.
// وضع الاستعلام داخل الـ Transaction سيؤدي إلى تطبيق "قفل قراءة" (Read Lock) على نفس المستندات لجميع العملاء
// في أوقات الذروة (Flash Sales)، مما يسبب تصادماً حتمياً (Contention) ويدخل السيرفر في دوامة إعادة المحاولة
// (Retry Loop of Death) ويسقط النظام.
// ✅ التصميم الصحيح المُطبق هنا:
// 1. جلب بحر من الأكواد (الكمية المطلوبة + 500) *خارج* الـ Transaction بدون قفل.
// 2. خلط الأكواد عشوائياً (Shuffle) واختيار مرشحين (Candidates) مختلفين لكل عميل.
// 3. داخل الـ Transaction: استخدام `transaction.getAll()` للقراءة الآمنة والتحقق من التوفر، 
//    مما يضمن نجاح المعاملات المتزامنة بدون تصادم.
// ============================================================================

// ==========================================
// 🔌 3. نقطة الدخول  للتجار (B2B API Endpoint)
// ==========================================
exports.externalCreateOrder = onRequest({
    region: 'us-east1', // 🛡️ توجيه جغرافي صريح
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 2 // 🚨 تم تعديل هذا الرقم من 100 إلى 2 لإنقاذ حصة الـ CPU
}, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });

    const apiKeyHeader = req.headers['x-api-key'] || req.headers['authorization'];
    if (!apiKeyHeader) return res.status(401).json({ success: false, error: 'Unauthorized: API Key is missing.' });

    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey || String(idempotencyKey).trim().length < 10) {
        return res.status(400).json({ success: false, error: 'Bad Request: Idempotency-Key header is strictly required and must be valid.' });
    }

    const cleanKey = apiKeyHeader.replace('Bearer ', '').trim();
    if (cleanKey.length < 20) return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key format.' });

    try {
        const hashedIncomingKey = SecurityEngine.generateSha256Hash(cleanKey);

        const usersQuery = await db.collection('telecard_users').where('apiKeyHash', '==', hashedIncomingKey).limit(1).get();
        if (usersQuery.empty) return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key.' });

        const userDoc = usersQuery.docs[0];
        const uid = userDoc.id;
        
        const { productId, qty, inputStr, optIdx } = req.body;
        
        if (req.body.expectedBasePrice === undefined || req.body.expectedBasePrice === null || isNaN(Number(req.body.expectedBasePrice))) {
            return res.status(400).json({ success: false, error: 'Bad Request: expectedBasePrice is missing or invalid.' });
        }
        const expectedBasePrice = Number(req.body.expectedBasePrice);

        if (req.body.expectedDisplayPrice === undefined || req.body.expectedDisplayPrice === null || isNaN(Number(req.body.expectedDisplayPrice))) {
            return res.status(400).json({ success: false, error: 'Bad Request: expectedDisplayPrice is missing or invalid.' });
        }
        const expectedDisplayPrice = Number(req.body.expectedDisplayPrice);

        if (!productId) return res.status(400).json({ success: false, error: 'Bad Request: productId is required.' });

        const finalQty = Math.max(1, Math.floor(Number(qty) || 1));
        if (finalQty > SYSTEM_LIMITS.MAX_QTY_PER_ORDER) return res.status(400).json({ success: false, error: `Quantity limit exceeded.` });

        let parsedOptIdx = null;
        if (optIdx !== undefined && optIdx !== null) {
            if (String(optIdx).trim() === '') {
                return res.status(400).json({ success: false, error: 'Invalid option index. Cannot be empty.' });
            }
            parsedOptIdx = Number(optIdx);
            if (Number.isNaN(parsedOptIdx) || parsedOptIdx < 0) {
                return res.status(400).json({ success: false, error: 'Invalid option index.' });
            }
        }

        const safeInputStr = SecurityEngine.sanitizeText(String(inputStr || '---'), 500);
        const cleanOrderId = SecurityEngine.generateUniqueId('TC');
        
        // 🛡️ تحديث البصمة الرقمية لتشمل التسعير المتوقع لمنع التلاعب
        const requestPayloadString = `${productId}|${finalQty}|${parsedOptIdx}|${safeInputStr}|${expectedBasePrice}|${expectedDisplayPrice}`;
        const requestHash = SecurityEngine.generateSha256Hash(requestPayloadString);

        const resultData = await SecurityEngine.withCollisionRetry(3, 'ExternalCreateOrder', async () => {
            const productRef = db.collection('telecard_prods').doc(String(productId));
            const productSnap = await productRef.get();
            if (!productSnap.exists) throw new Error('Product not found.');
            const productOut = productSnap.data();

            if (productOut.vaultPoolId && finalQty > SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER) throw new Error(`Vault limit exceeded.`);
            
            let candidateKeyDocs = [];
            let vaultRef = null;

            // 🛡️ درع التزامن العالي: سحب بحر الأكواد وخلطها خارج الـ Transaction لمنع الاختناق والتصادم
            if (productOut.vaultPoolId) {
                vaultRef = db.collection('telecard_vault').doc(String(productOut.vaultPoolId));
                
                const poolLimit = finalQty + 100; 
                const keysQuerySnap = await vaultRef.collection('keys').where('isSold', '==', false).limit(poolLimit).get();
                
                if (keysQuerySnap.size < finalQty) throw new Error('Out of stock.');
                
                const shuffledDocs = keysQuerySnap.docs.sort(() => 0.5 - Math.random());
                candidateKeyDocs = shuffledDocs.slice(0, finalQty);
            }

            let transactionResult = null; 

            await db.runTransaction(async (transaction) => {
                const serverNow = admin.firestore.Timestamp.now().toMillis();
                
                let idempotencyRef = null;
                if (idempotencyKey) {
                    idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
                    const existingReq = await transaction.get(idempotencyRef);
                    
                    if (existingReq.exists) {
                        const expMs = existingReq.data().expiresAt?.toMillis ? existingReq.data().expiresAt.toMillis() : 0;
                        if (expMs > serverNow) {
                            if (existingReq.data().requestHash !== requestHash) throw new Error('Idempotency Conflict');
                            transactionResult = existingReq.data().resultData;
                            return; 
                        }
                    }      
                }

                const latestUserSnap = await transaction.get(userDoc.ref);
                const userData = latestUserSnap.data();
                if (userData.isBanned || userData.isIpBanned) throw new Error('Unauthorized: Account Banned');
                if (userData.isVerified !== true) throw new Error('Unauthorized: Account Not Verified (KYC Required)');

                const liveProdSnap = await transaction.get(productRef);
                if (!liveProdSnap.exists) throw new Error('Product not found.');
                const liveProduct = liveProdSnap.data();
                if (liveProduct.isActive === false || String(liveProduct.isAvailable) === 'false') throw new Error('Product is currently disabled.');

                const { ratesData, tiersData } = await FinancialEngine.fetchSystemData(transaction, db);

                let verifiedKeyDocs = [];
                // 🛡️ القفل النهائي داخل الـ Transaction باستخدام getAll لتأمين الأكواد المرشحة
                if (vaultRef && candidateKeyDocs.length > 0) {
                    const keyRefs = candidateKeyDocs.map(doc => doc.ref);
                    const keySnaps = await transaction.getAll(...keyRefs); 
                    
                    const hasCollision = keySnaps.some(k => !k.exists || k.data().isSold === true);
                    if (hasCollision) throw new Error('CONTENTION_COLLISION_RETRY');
                    
                    verifiedKeyDocs = keySnaps;
                }

                let activeTierObj = FinancialEngine.getUserTier(userData, tiersData);
                const cycleStartMs = FinancialEngine.parseSafeTime(userData.tierCycleStartDate || serverNow);
                const daysPassed = (getStartOfUTCDay(serverNow) - getStartOfUTCDay(cycleStartMs)) / (24 * 60 * 60 * 1000);
                
                if (daysPassed > Number(activeTierObj?.durationDays || 30) && userData.manualTierOverride !== true) { 
                    activeTierObj = tiersData.find(t => t.isDefault) || activeTierObj; 
                }

                let pricingSnapshot;
                try {
                    pricingSnapshot = FinancialEngine.calculateOrderTotal({ 
                        product: liveProduct, 
                        tier: activeTierObj,
                        optIdx: parsedOptIdx
                    }, finalQty); 
                } catch (err) {
                    throw new Error(`SECURITY_REJECT: ${err.message}`);
                }

                if (pricingSnapshot.isFirewallViolated) throw new Error('Firewall Violation');
                
                const exactBaseUsdPrice = pricingSnapshot.totalFinalPrice; 
                if (exactBaseUsdPrice <= 0) throw new Error('Price cannot be zero.');

                if (Math.abs(exactBaseUsdPrice - expectedBasePrice) > MATH_EPSILON) {
                    throw new Error('Price Mismatch: Base pricing validation failed.');
                }

                const userWalletCurrency = String(userData.baseCurrency || 'USD').toUpperCase();
                let exactLocalPrice = exactBaseUsdPrice;

                if (userWalletCurrency !== 'USD') {
                    exactLocalPrice = FinancialEngine.convertViaUSDHelper(exactBaseUsdPrice, 'USD', userWalletCurrency, ratesData, 'round', 'pricing');
                }

                const displayDifference = Math.abs(exactLocalPrice - expectedDisplayPrice);
                const toleranceMargin = exactLocalPrice * 0.005;
                if (displayDifference > toleranceMargin) {
                    throw new Error('Price Slippage: Exchange rates have changed. Please refetch pricing.');
                }

                const currentLocalBalance = Number(userData.walletBalance || 0);
                if (exactLocalPrice < 0 || currentLocalBalance < exactLocalPrice) throw new Error('Insufficient balance.');

                let deliveredCodeText = null, isAutoDelivered = false;
                if (vaultRef && verifiedKeyDocs.length > 0) {
                    verifiedKeyDocs.forEach(docSnap => {
                        transaction.update(docSnap.ref, { isSold: true, soldAt: admin.firestore.FieldValue.serverTimestamp(), orderId: cleanOrderId, userId: uid });
                    });
                    transaction.update(vaultRef, { stockCount: admin.firestore.FieldValue.increment(-finalQty), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                    deliveredCodeText = verifiedKeyDocs.map(d => d.data().codeText).join(' | ');
                    isAutoDelivered = true;
                }

                const newLocalBalance = sanitizeAmount(safeSub(currentLocalBalance, exactLocalPrice));
                
                let userUpdateObj = { 
                    walletBalance: newLocalBalance,
                    lastOrderTime: serverNow
                };

                if (isAutoDelivered) {
                    const upgradeResult = FinancialEngine.processTierUpgrade(userData, tiersData, exactBaseUsdPrice, serverNow);
                    
                    userUpdateObj.totalSpent = upgradeResult.newTotalSpentUsd;
                    userUpdateObj.tierCycleSpent = upgradeResult.newTierCycleSpentUsd;
                    userUpdateObj.tierId = upgradeResult.finalTierId;
                    
                    if (upgradeResult.shouldUpdateCycleStart) {
                        userUpdateObj.tierCycleStartDate = admin.firestore.FieldValue.serverTimestamp();
                        // 🚀 [إصلاح استنزاف القراءات]: إضافة تاريخ الانتهاء لتجار الـ API
                        const newTier = tiersData.find(t => t.id === upgradeResult.finalTierId) || activeTierObj;
                        const durationDays = newTier?.durationDays || 30;
                        userUpdateObj.tierExpiresAt = admin.firestore.Timestamp.fromMillis(serverNow + durationDays * 24 * 60 * 60 * 1000);
                    }
                }
                
                if (latestUserSnap.exists) transaction.update(userDoc.ref, userUpdateObj);
                else transaction.set(userDoc.ref, { ...userData, ...userUpdateObj });

                // ⬇️ تم التحديث هنا: إضافة لقطة بيانات المستخدم (userDataSnapshot) للطلب
                const newOrder = {
                    id: cleanOrderId, 
                    displayId: cleanOrderId, 
                    userId: uid, 
                    
                    userDataSnapshot: {
                        fullName: SecurityEngine.sanitizeText(userData.fullName || 'تاجر API', 100),
                        email: userData.email || '',
                        phone: userData.phone || '',
                        tierId: activeTierObj.id || 'TIER_DEFAULT',
                        baseCurrency: userWalletCurrency
                    },

                    prodId: productId, 
                    product: liveProduct.name,
                    vaultPoolId: productOut.vaultPoolId || null,
                    price: sanitizeAmount(exactLocalPrice), 
                    priceLocalDeducted: sanitizeAmount(exactLocalPrice), 
                    priceBaseUsd: sanitizeAmount(exactBaseUsdPrice),
                    priceCurrency: userWalletCurrency,
                    qty: finalQty, 
                    status: isAutoDelivered ? 'completed' : 'pending',
                    deliveredCode: deliveredCodeText, 
                    tierName: pricingSnapshot.tierName, 
                    input: safeInputStr, 
                    merchantData: { webhookUrl: userData.webhookUrl || null, webhookSecret: userData.webhookSecret || null },
                    pricingSnapshot: { costUsd: pricingSnapshot.totalCostUsd || 0, netProfitUsd: pricingSnapshot.totalNetProfitUsd || 0 },
                    time: admin.firestore.FieldValue.serverTimestamp(), 
                    isApiOrder: true
                };
                // ⬆️ نهاية التحديث

                transactionResult = { 
                    orderId: cleanOrderId, 
                    status: newOrder.status, 
                    pricePaid: exactLocalPrice, 
                    priceCurrency: userWalletCurrency,
                    deliveredCode: deliveredCodeText 
                };
                
                transaction.set(db.collection('telecard_orders').doc(cleanOrderId), newOrder);
                
                if (isAutoDelivered) {
                    const notifId = `notif_api_${cleanOrderId}`;
                    transaction.set(userDoc.ref.collection('notifications').doc(notifId), { id: notifId, title: "🔌 تسليم API بنجاح", message: `تم تسليم ( ${liveProduct.name} ).`, type: 'notification', jumpTarget: 'order', createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                }
                
                if (idempotencyRef) {
                    transaction.set(idempotencyRef, { 
                        createdAt: admin.firestore.FieldValue.serverTimestamp(), 
                        expiresAt: admin.firestore.Timestamp.fromDate(new Date(serverNow + 48 * 60 * 60 * 1000)),
                        resultData: transactionResult, orderId: cleanOrderId, requestHash: requestHash 
                    });        
                }
            });
            
            return transactionResult;
        });

        if (!resultData) throw new Error('System Overloaded');
        return res.status(200).json({ success: true, data: resultData });

    } catch (error) {
        let errMsg = error.message;
        if (errMsg.includes('[SECURITY]')) errMsg = `SECURITY_REJECT: ${errMsg.replace('[SECURITY] ', '')}`;

        if (errMsg.startsWith('SECURITY_REJECT:')) return res.status(400).json({ success: false, error: errMsg.replace('SECURITY_REJECT: ', '') });
        if (errMsg === 'Unauthorized: Account Banned') return res.status(403).json({ success: false, error: 'Account is banned.' });
        if (errMsg === 'Unauthorized: Account Not Verified (KYC Required)') return res.status(403).json({ success: false, error: 'Account KYC verification is required.' });
        if (errMsg === 'Insufficient balance.') return res.status(402).json({ success: false, error: 'Insufficient balance.' });
        if (errMsg === 'Out of stock.') return res.status(409).json({ success: false, error: 'Product out of stock.' });
        if (errMsg === 'Product not found.' || errMsg === 'Product is currently disabled.') return res.status(404).json({ success: false, error: 'Product not found or disabled.' });
        if (errMsg.includes('HIGH_TRAFFIC_COLLISION') || errMsg === 'System Overloaded') return res.status(503).json({ success: false, error: 'System is highly loaded, please try again in a few seconds.' });
        if (errMsg.includes('Vault limit exceeded')) return res.status(400).json({ success: false, error: errMsg });
        if (errMsg.includes('Firewall Violation')) return res.status(400).json({ success: false, error: 'Order rejected by security policy.' });
        if (errMsg.includes('Idempotency Conflict')) return res.status(409).json({ success: false, error: 'Conflict: Please retry the request with the same idempotency key.' });
        if (errMsg.includes('Price Slippage') || errMsg.includes('Price Mismatch')) return res.status(409).json({ success: false, error: errMsg });
        
        console.error('API Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});
