// ============================================================================
// ☁️ بوابة الـ API ومستقبل الـ Webhooks (functions/developerApi.js) - النسخة الماسية V7.2 💎
// 🎯 الوظيفة: معالجة طلبات التجار الخارجية، طابور الـ Webhooks، والتوقيع الرقمي
// 🚀 التحديث الأخير: بناء خوارزمية (Pre-fetch & Shuffle Retry Backoff) لمنع اختناق المعاملات.
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const crypto = require('crypto'); 
const FinancialEngine = require('./financialEngine.js');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const SYSTEM_LIMITS = { MAX_QTY_PER_ORDER: 10000, MAX_VAULT_QTY_PER_ORDER: 200 };
const safeAdd = (a, b) => FinancialEngine.safeAdd(a, b);
const safeSub = (a, b) => FinancialEngine.safeSub(a, b);

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
        status: 'failed', error: errorMsg || 'Unknown Connection Error', lastAttempt: admin.firestore.FieldValue.serverTimestamp()
    });
}

function generateHmacSignature(payload, secret) {
    if (!secret) return '';
    return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

exports.orderStatusWebhook = onDocumentWritten({ document: 'telecard_orders/{orderId}', region: 'us-east1' }, async (event) => {
    if (!event.data.after.exists) return null;
    const after = event.data.after.data();
    const before = event.data.before.exists ? event.data.before.data() : null;
    if (before && before.status === after.status) return null;
    
    const webhookUrl = after.merchantData?.webhookUrl;
    const webhookSecret = after.merchantData?.webhookSecret;
    if (!webhookUrl || !isSafeWebhookUrl(webhookUrl)) return null; 
    
    try {
        const payload = {
            eventId: event.id, event: before ? 'order_status_changed' : 'order_created',
            orderId: after.displayId || after.id, productId: after.prodId, productName: after.product, 
            status: after.status, pricePaid: after.price, qty: after.qty,
            deliveredCode: after.deliveredCode || null, timestamp: new Date().toISOString()
        };
        const signature = generateHmacSignature(payload, webhookSecret || 'default_telecard_secret');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Telecard-Cloud-Engine/4.0', 'X-Telecard-Signature': signature }, body: JSON.stringify(payload), signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) await logFailedWebhook(payload, webhookUrl, `HTTP Error: ${response.status}`, after.userId);
            return true;
        } catch (fetchErr) {
            clearTimeout(timeoutId);
            await logFailedWebhook(payload, webhookUrl, fetchErr.name === 'AbortError' ? 'Connection Timeout' : fetchErr.message, after.userId);
            return null;
        }
    } catch (error) { return null; }
});

exports.cronRetryWebhooks = onSchedule({ schedule: 'every 1 hours', timeZone: 'Asia/Riyadh', region: 'us-east1' }, async (event) => {
    const failedSnaps = await db.collection('telecard_failed_webhooks').where('status', '==', 'failed').where('attempts', '<', 5).limit(50).get();
    if (failedSnaps.empty) return null;
    const promises = failedSnaps.docs.map(async (doc) => {
        const data = doc.data(); const currentAttempt = data.attempts + 1; const isLastAttempt = currentAttempt >= 5;
        const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(data.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Telecard-Cloud-Engine-Retry/4.0' }, body: JSON.stringify(data.payload), signal: controller.signal });
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

exports.externalCreateOrder = onRequest({ region: 'us-east1' }, async (req, res) => {
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
        if (finalQty > SYSTEM_LIMITS.MAX_QTY_PER_ORDER) return res.status(400).json({ success: false, error: `Quantity limit exceeded.` });

        let resultData = null;
        const cleanOrderId = 'TC-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
        const requestPayload = JSON.stringify({ productId, finalQty, inputStr });
        const requestHash = crypto.createHash('sha256').update(requestPayload).digest('hex');

        // 🛡️ آلية المحاولة المتكررة لتخطي اختناق المعاملات (Retry Backoff Loop)
        let attempt = 0;
        let success = false;
        
        while (attempt < 5 && !success) {
            attempt++;
            try {
                // 1. مرحلة الجلب الاستباقي (Pre-fetch & Shuffle) - خارج الـ Transaction لتقليل وقت القفل
                const productRef = db.collection('telecard_prods').doc(String(productId));
                const productSnap = await productRef.get();
                if (!productSnap.exists) throw new Error('Product not found.');
                const product = productSnap.data();

                if (product.vaultPoolId && finalQty > SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER) throw new Error(`Vault limit exceeded.`);
                
                let candidateKeyDocs = [];
                let vaultRef = null;

                if (product.vaultPoolId) {
                    vaultRef = db.collection('telecard_vault').doc(String(product.vaultPoolId));
                    // سحب شريحة واسعة عشوائياً (Pool Limit)
                    // سحب شريحة واسعة عشوائياً بحد أقصى 500 مستند أو ضعف الكمية المطلوبة (أيهما أكبر)
const poolLimit = Math.max(finalQty * 3, Math.min(finalQty * 10, 500)); 
                    const keysQuerySnap = await vaultRef.collection('keys').where('isSold', '==', false).limit(poolLimit).get();
                    
                    if (keysQuerySnap.size < finalQty) throw new Error('Out of stock.');
                    
                    // Shuffle Array لتجنب اصطدام الطلبات المتزامنة
                    const shuffledDocs = keysQuerySnap.docs.sort(() => 0.5 - Math.random());
                    candidateKeyDocs = shuffledDocs.slice(0, finalQty);
                }

                // 2. مرحلة المعاملة والتخصيص (Transaction)
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

                    const latestUserSnap = await transaction.get(userDoc.ref);
                    const userData = latestUserSnap.data();
                    if (userData.isBanned || userData.isIpBanned) throw new Error('Unauthorized: Account Banned');

                    // فحص الأكواد المحددة حصراً (Verify Claim)
                    let verifiedKeyDocs = [];
                    if (vaultRef && candidateKeyDocs.length > 0) {
                        const keySnaps = await Promise.all(candidateKeyDocs.map(doc => transaction.get(doc.ref)));
                        
                        // إذا تم بيع أي كود منها لجلسة أخرى، نلغي هذه المعاملة ونعيد المحاولة
                        const hasCollision = keySnaps.some(k => !k.exists || k.data().isSold === true);
                        if (hasCollision) throw new Error('CONTENTION_COLLISION_RETRY');
                        
                        verifiedKeyDocs = keySnaps;
                    }

                    const tierId = String(userData.tierId || userData.tier || 1);
                    const tierSnap = await transaction.get(db.collection('telecard_tiers').doc(tierId));
                    const pricingSnapshot = FinancialEngine.calculateOrderTotal({ product: product, tier: tierSnap.exists ? { id: tierSnap.id, ...tierSnap.data() } : null }, finalQty); 

                    if (pricingSnapshot.isFirewallViolated) throw new Error('Firewall Violation');
                    const exactPrice = pricingSnapshot.totalFinalPrice;
                    const currentBalance = Number(userData.walletBalance || 0);

                    if (exactPrice < 0 || currentBalance < exactPrice) throw new Error('Insufficient balance.');

                    let deliveredCodeText = null, isAutoDelivered = false;

                    // تحديثات الداتابيز (Writes)
                    if (vaultRef && verifiedKeyDocs.length > 0) {
                        verifiedKeyDocs.forEach(docSnap => {
                            transaction.update(docSnap.ref, { isSold: true, soldAt: admin.firestore.FieldValue.serverTimestamp(), orderId: cleanOrderId, userId: uid });
                        });
                        transaction.update(vaultRef, { stockCount: admin.firestore.FieldValue.increment(-finalQty), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                        deliveredCodeText = verifiedKeyDocs.map(d => d.data().codeText).join(' | ');
                        isAutoDelivered = true;
                    }

                    const newBalance = safeSub(currentBalance, exactPrice);
                    const newOrder = {
                        id: cleanOrderId, displayId: cleanOrderId, userId: uid, prodId: productId, product: product.name,
                        price: exactPrice, qty: finalQty, input: inputStr || 'API Request',
                        status: isAutoDelivered ? 'completed' : 'pending', deliveredCode: deliveredCodeText, balanceAfter: newBalance,
                        merchantData: { webhookUrl: userData.webhookUrl || null, webhookSecret: userData.webhookSecret || null },
                        pricingSnapshot: { costUsd: pricingSnapshot.totalCostUsd || 0, netProfitUsd: pricingSnapshot.totalNetProfitUsd || 0 },
                        time: admin.firestore.FieldValue.serverTimestamp(), isApiOrder: true
                    };

                    resultData = { orderId: cleanOrderId, status: newOrder.status, pricePaid: exactPrice, deliveredCode: deliveredCodeText };
                    
                    transaction.update(userDoc.ref, { walletBalance: newBalance, totalSpent: safeAdd(userData.totalSpent || 0, exactPrice), tierCycleSpent: safeAdd(userData.tierCycleSpent || 0, exactPrice) });
                    transaction.set(db.collection('telecard_orders').doc(cleanOrderId), newOrder);
                    
                    if (isAutoDelivered) {
                        const notifId = `notif_api_${cleanOrderId}`;
                        transaction.set(userDoc.ref.collection('notifications').doc(notifId), { id: notifId, title: "🔌 تسليم API بنجاح", message: `تم تسليم ( ${product.name} ).`, type: 'notification', jumpTarget: 'order', createdAt: admin.firestore.FieldValue.serverTimestamp() });
                    }
                    if (idempotencyRef) {
                        transaction.set(idempotencyRef, { createdAt: admin.firestore.FieldValue.serverTimestamp(), resultData: resultData, orderId: cleanOrderId, requestHash: requestHash });        
                    }
                });
                success = true; // اكتملت المعاملة بدون اصطدام

            } catch (err) {
                if (err.message === 'CONTENTION_COLLISION_RETRY') {
                    if (attempt >= 5) throw new Error('High Traffic Collision');
                    // انتظار عشوائي بين 100ms إلى 600ms لفك الاختناق (Jitter Backoff)
                    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 500) + 100));
                } else {
                    throw err; 
                }
            }
        }

        if (!success && !resultData) throw new Error('System Overloaded');
        return res.status(200).json({ success: true, data: resultData });

    } catch (error) {
        if (error.message === 'Unauthorized: Account Banned') return res.status(403).json({ success: false, error: 'Account is banned.' });
        if (error.message === 'Insufficient balance.') return res.status(402).json({ success: false, error: 'Insufficient balance.' });
        if (error.message === 'Out of stock.') return res.status(409).json({ success: false, error: 'Product out of stock.' });
        if (error.message === 'Product not found.') return res.status(404).json({ success: false, error: 'Product not found.' });
        if (error.message === 'High Traffic Collision' || error.message === 'System Overloaded') return res.status(503).json({ success: false, error: 'System is highly loaded, please try again in a few seconds.' });
        if (error.message.includes('Vault limit exceeded')) return res.status(400).json({ success: false, error: error.message });
        if (error.message.includes('Firewall Violation')) return res.status(400).json({ success: false, error: 'Order rejected by security policy.' });
        if (error.message.includes('Idempotency Conflict')) return res.status(409).json({ success: false, error: 'Conflict: Please retry the request with the same idempotency key.' });
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});
