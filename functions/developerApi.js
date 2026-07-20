// ============================================================================
// ☁️ بوابة الـ API ومستقبل الـ Webhooks (functions/developerApi.js) - Bank Grade 🏦
// 🎯 الوظيفة: معالجة طلبات التجار الخارجية، طابور الـ Webhooks، والتوقيع الرقمي
// 🚀 التحديث الأخير: ترقية Gen 2 بالكامل + دمج منطق الإشعارات والتسعير الدقيق
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const crypto = require('crypto'); 
const { FinancialEngine } = require('./financialEngine.js');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const SYSTEM_LIMITS = {
    MAX_QTY_PER_ORDER: 10000, 
    MAX_VAULT_QTY_PER_ORDER: 200 
};

// ==========================================
// 🛡️ دوال مساعدة ورياضيات آمنة 
// ==========================================
const safeAdd = (a, b) => Math.round(Number(a) * 10000 + Number(b) * 10000) / 10000;
const safeSub = (a, b) => Math.max(0, Math.round(Number(a) * 10000 - Number(b) * 10000) / 10000);

function isSafeWebhookUrl(urlString) {
    try {
        const parsedUrl = new URL(urlString);
        if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') return false;
        const hostname = parsedUrl.hostname.toLowerCase();
        if (hostname.includes('[') || hostname.includes('::') || /^0\.0\.0\.0$/.test(hostname) || /^\d+$/.test(hostname)) return false;
        const blockedPatterns = [ /^localhost$/, /^127\.\d+\.\d+\.\d+$/, /^10\.\d+\.\d+\.\d+$/, /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/, /^192\.168\.\d+\.\d+$/, /^169\.254\.\d+\.\d+$/ ];
        return !blockedPatterns.some(pattern => pattern.test(hostname));
    } catch (e) { return false; }
}

async function logFailedWebhook(payload, webhookUrl, errorMsg, userId) {
    await db.collection('telecard_failed_webhooks').add({
        userId: userId, payload: payload, webhookUrl: webhookUrl, attempts: 1,
        status: 'failed', error: errorMsg || 'Unknown Connection Error',
        lastAttempt: admin.firestore.FieldValue.serverTimestamp()
    });
}

function generateHmacSignature(payload, secret) {
    if (!secret) return '';
    return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

// ==========================================
// 🚀 1. مرسل الإشعارات السحابي (Webhook Dispatcher - Gen 2)
// ==========================================
exports.orderStatusWebhook = onDocumentWritten({
    document: 'telecard_orders/{orderId}',
    region: 'us-east1'
}, async (event) => {
    
    if (!event.data.after.exists) return null;

    const after = event.data.after.data();
    const before = event.data.before.exists ? event.data.before.data() : null;
    
    if (before && before.status === after.status) return null;
    
    const webhookUrl = after.merchantData?.webhookUrl;
    const webhookSecret = after.merchantData?.webhookSecret;
    const userId = after.userId;

    if (!webhookUrl || !isSafeWebhookUrl(webhookUrl)) return null; 
    
    try {
        const payload = {
            eventId: event.id, // استخدام معرف الحدث الخاص بـ Gen 2
            event: before ? 'order_status_changed' : 'order_created',
            orderId: after.displayId || after.id, productId: after.prodId,
            productName: after.product, status: after.status,
            pricePaid: after.price, qty: after.qty,
            deliveredCode: after.deliveredCode || null,
            timestamp: new Date().toISOString()
        };

        const signature = generateHmacSignature(payload, webhookSecret || 'default_telecard_secret');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': 'Telecard-Cloud-Engine/4.0', 'X-Telecard-Signature': signature },
                body: JSON.stringify(payload), signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) await logFailedWebhook(payload, webhookUrl, `HTTP Error: ${response.status}`, userId);
            return true;
        } catch (fetchErr) {
            clearTimeout(timeoutId);
            await logFailedWebhook(payload, webhookUrl, fetchErr.name === 'AbortError' ? 'Connection Timeout (10s)' : fetchErr.message, userId);
            return null;
        }
    } catch (error) { return null; }
});

// ==========================================
// ♻️ 2. طابور المهام الذكي (Dead Letter Queue Retry - Gen 2)
// ==========================================
exports.cronRetryWebhooks = onSchedule({
    schedule: 'every 1 hours',
    timeZone: 'Asia/Riyadh',
    region: 'us-east1'
}, async (event) => {
    const failedSnaps = await db.collection('telecard_failed_webhooks').where('status', '==', 'failed').where('attempts', '<', 5).limit(50).get();
    if (failedSnaps.empty) return null;

    const promises = failedSnaps.docs.map(async (doc) => {
        const data = doc.data();
        const currentAttempt = data.attempts + 1;
        const isLastAttempt = currentAttempt >= 5;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(data.webhookUrl, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Telecard-Cloud-Engine-Retry/4.0' },
                body: JSON.stringify(data.payload), signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (response.ok) return doc.ref.update({ status: 'success', attempts: currentAttempt, lastAttempt: admin.firestore.FieldValue.serverTimestamp() });
            else return doc.ref.update({ status: isLastAttempt ? 'permanently_failed' : 'failed', attempts: currentAttempt, error: `HTTP ${response.status}`, lastAttempt: admin.firestore.FieldValue.serverTimestamp() });
        } catch (err) {
            clearTimeout(timeoutId);
            return doc.ref.update({ status: isLastAttempt ? 'permanently_failed' : 'failed', attempts: currentAttempt, error: err.name === 'AbortError' ? 'Connection Timeout' : err.message, lastAttempt: admin.firestore.FieldValue.serverTimestamp() });
        }
    });

    await Promise.allSettled(promises);
    return true;
});

// ==========================================
// 🔌 3. بوابة الـ API الخارجية (External API Gateway - Gen 2)
// ==========================================
exports.externalCreateOrder = onRequest({
    region: 'us-east1'
}, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });

    const apiKeyHeader = req.headers['x-api-key'] || req.headers['authorization'];
    if (!apiKeyHeader) return res.status(401).json({ success: false, error: 'Unauthorized: API Key is missing.' });

    const idempotencyKey = req.headers['idempotency-key'];
    const cleanKey = apiKeyHeader.replace('Bearer ', '').trim();

    if (cleanKey.length < 20) return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key format.' });

    try {
        const usersQuery = await db.collection('telecard_users').where('apiKey', '==', cleanKey).limit(1).get();
        if (usersQuery.empty) return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key.' });

        const userDoc = usersQuery.docs[0];
        const uid = userDoc.id;
        const { productId, qty, inputStr } = req.body;
        
        if (!productId) return res.status(400).json({ success: false, error: 'Bad Request: productId is required.' });

        const finalQty = Math.max(1, Math.floor(Number(qty) || 1));
        if (finalQty > SYSTEM_LIMITS.MAX_QTY_PER_ORDER) return res.status(400).json({ success: false, error: `Bad Request: Quantity exceeds maximum allowed (${SYSTEM_LIMITS.MAX_QTY_PER_ORDER}).` });

        let resultData = null;
        const cleanOrderId = 'TC-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
        const requestPayload = JSON.stringify({ productId, finalQty, inputStr });
        const requestHash = crypto.createHash('sha256').update(requestPayload).digest('hex');

        await db.runTransaction(async (transaction) => {
            let idempotencyRef = null;
            if (idempotencyKey) {
                idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
                const existingReq = await transaction.get(idempotencyRef);
                if (existingReq.exists) {
                    if (existingReq.data().requestHash !== requestHash) throw new Error('Idempotency Conflict');
                    resultData = existingReq.data().resultData;
                    return; 
                }      
            }

            const productRef = db.collection('telecard_prods').doc(String(productId));
            const [productSnap, latestUserSnap] = await Promise.all([ transaction.get(productRef), transaction.get(userDoc.ref) ]);

            if (!productSnap.exists) throw new Error('Product not found.');
            const product = productSnap.data();
            const userData = latestUserSnap.data();

            if (userData.isBanned || userData.isIpBanned) throw new Error('Unauthorized: Account Banned');
            if (product.vaultPoolId && finalQty > SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER) throw new Error(`Vault limit exceeded.`);

            const orderRef = db.collection('telecard_orders').doc(cleanOrderId);
            const tierId = String(userData.tierId || userData.tier || 1);
            
            let vaultKeysQuery = null;
            if (product.vaultPoolId) {
                 vaultKeysQuery = db.collection('telecard_vault').doc(String(product.vaultPoolId)).collection('keys').where('isSold', '==', false).limit(finalQty + 20);
            }

            const [tierSnap, keysSnap] = await Promise.all([
                transaction.get(db.collection('telecard_tiers').doc(tierId)),
                vaultKeysQuery ? transaction.get(vaultKeysQuery) : Promise.resolve(null)
            ]);

            const pricingSnapshot = FinancialEngine.calculateOrderTotal({
                product: product, tier: tierSnap.exists ? tierSnap.data() : null, offer: null, coupon: null
            }, finalQty); 

            if (pricingSnapshot.isFirewallViolated) throw new HttpsError('Firewall Violation');
            const exactPrice = pricingSnapshot.totalFinalPrice;
            const currentBalance = Number(userData.walletBalance || userData.balance || 0);

            if (exactPrice <= 0 || currentBalance < exactPrice) throw new Error('Insufficient balance.');

            let deliveredCodeText = null, isAutoDelivered = false, extractedCodes = [];

            if (vaultKeysQuery) {
                if (!keysSnap || keysSnap.size < finalQty) throw new Error('Out of stock.');
                let docsArray = keysSnap.docs;
                docsArray.sort(() => 0.5 - Math.random()); 
                let selectedDocs = docsArray.slice(0, finalQty);
                
                selectedDocs.forEach(doc => {
                    extractedCodes.push(doc.data().codeText);
                    transaction.update(doc.ref, { isSold: true, soldAt: admin.firestore.FieldValue.serverTimestamp(), orderId: cleanOrderId, userId: uid });
                });
                transaction.update(db.collection('telecard_vault').doc(String(product.vaultPoolId)), { stockCount: admin.firestore.FieldValue.increment(-finalQty) });
                deliveredCodeText = extractedCodes.join(' | ');
                isAutoDelivered = true;
            }

            const newBalance = safeSub(currentBalance, exactPrice);
            
            // 💎 تم دمج التسجيل الشامل لتسعير الطلب
            const newOrder = {
                id: cleanOrderId, displayId: cleanOrderId, userId: uid, prodId: productId, product: product.name,
                price: exactPrice, qty: finalQty, input: inputStr || 'API Request',
                status: isAutoDelivered ? 'completed' : 'pending', deliveredCode: deliveredCodeText, balanceAfter: newBalance,
                merchantData: { webhookUrl: userData.webhookUrl || null, webhookSecret: userData.webhookSecret || null },
                pricingSnapshot: { 
                    costUsd: pricingSnapshot.totalCost, 
                    originalPriceUsd: pricingSnapshot.totalOriginalPrice, 
                    finalPriceUsd: exactPrice,
                    tierName: pricingSnapshot.tierName, 
                    netProfitUsd: pricingSnapshot.totalProfit, 
                    isFirewallActive: pricingSnapshot.isFirewallActive
                },
                time: admin.firestore.FieldValue.serverTimestamp(), isApiOrder: true
            };

            resultData = { orderId: cleanOrderId, status: newOrder.status, pricePaid: exactPrice, deliveredCode: deliveredCodeText };
            transaction.update(userDoc.ref, { walletBalance: newBalance, balance: newBalance, totalSpent: safeAdd(userData.totalSpent || 0, exactPrice), tierCycleSpent: safeAdd(userData.tierCycleSpent || 0, exactPrice) });
            
            // 💎 تم دمج توليد الإشعار للعميل مباشرة في حال تسليم الـ API
            if (isAutoDelivered) {
                const notifId = `notif_api_${cleanOrderId}`;
                transaction.set(userDoc.ref.collection('notifications').doc(notifId), {
                    id: notifId, title: "🔌 تم تسليم طلب API بنجاح!",
                    message: `تم إكمال طلبك الخارجي لشراء ( ${product.name} ) بنجاح.`,
                    type: 'notification', jumpTarget: 'order', createdAt: Date.now()
                });
            }

            transaction.set(orderRef, newOrder);

            if (idempotencyRef) transaction.set(idempotencyRef, { createdAt: admin.firestore.FieldValue.serverTimestamp(), resultData: resultData, orderId: cleanOrderId, requestHash: requestHash });        
        });

        return res.status(200).json({ success: true, data: resultData });
    } catch (error) {
        // 💎 تم دمج معالجة الأخطاء الدقيقة لتوجيه التاجر لسبب المشكلة الفعلي
        if (error.message === 'Unauthorized: Account Banned') return res.status(403).json({ success: false, error: 'Account is banned.' });
        if (error.message === 'Insufficient balance.') return res.status(402).json({ success: false, error: 'Insufficient balance.' });
        if (error.message === 'Out of stock.') return res.status(409).json({ success: false, error: 'Product out of stock.' });
        if (error.message === 'Product not found.') return res.status(404).json({ success: false, error: 'Product not found.' });
        if (error.message.includes('Vault limit exceeded')) return res.status(400).json({ success: false, error: error.message });
        if (error.message.includes('Firewall')) return res.status(400).json({ success: false, error: 'Order rejected by security policy.' });
        if (error.message.includes('Idempotency Conflict')) return res.status(409).json({ success: false, error: error.message });
        
        return res.status(500).json({ success: false, error: 'Internal Server Errorr' });
    }
});
