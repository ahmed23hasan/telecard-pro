// ============================================================================
// ☁️ بوابة الـ API ومستقبل الـ Webhooks (functions/developerApi.js) - Bank Grade 🏦
// 🎯 الوظيفة: معالجة طلبات التجار الخارجية، طابور الـ Webhooks، والتوقيع الرقمي
// 🌟 التحديث: دمج جدار حماية الحظر (Ban Firewall)، الرياضيات الآمنة، والأداء العالي
// ============================================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto'); 
const { FinancialEngine } = require('./financialEngine.js');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// ==========================================
// 🛡️ دوال مساعدة ورياضيات آمنة (Safe Math & Helpers)
// ==========================================
const safeAdd = (a, b) => Math.round(Number(a) * 10000 + Number(b) * 10000) / 10000;
const safeSub = (a, b) => Math.max(0, Math.round(Number(a) * 10000 - Number(b) * 10000) / 10000);

async function logFailedWebhook(payload, webhookUrl, errorMsg, userId) {
    await db.collection('telecard_failed_webhooks').add({
        userId: userId,
        payload: payload,
        webhookUrl: webhookUrl,
        attempts: 1,
        status: 'failed',
        error: errorMsg || 'Unknown Connection Error',
        lastAttempt: admin.firestore.FieldValue.serverTimestamp()
    });
}

function generateHmacSignature(payload, secret) {
    if (!secret) return '';
    return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

// ==========================================
// 🚀 1. مرسل الإشعارات السحابي (Webhook Dispatcher - Secure)
// ==========================================
exports.orderStatusWebhook = functions.region('us-east1').firestore
    .document('telecard_orders/{orderId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        
        if (before.status === after.status) return null;
        
        const userId = after.userId;
        
        try {
            const userSnap = await db.collection('telecard_users').doc(String(userId)).get();
            if (!userSnap.exists) return null;
            
            const userData = userSnap.data();
            
            // 🛑 [درع توفير الموارد]: عدم إرسال إشعارات Webhook لحساب محظور لتخفيف الحمل على السيرفر
            if (userData.isBanned === true) {
                console.log(`Webhook blocked for banned user: ${userId}`);
                return null;
            }
            
            if (!userData.webhookUrl || !userData.webhookUrl.startsWith('http')) return null;
            
            const payload = {
                event: 'order_status_changed',
                orderId: after.displayId || after.id,
                productId: after.prodId,
                productName: after.product,
                status: after.status,
                pricePaid: after.price,
                qty: after.qty,
                deliveredCode: after.deliveredCode || null,
                timestamp: new Date().toISOString()
            };

            const signature = generateHmacSignature(payload, userData.webhookSecret || 'default_telecard_secret');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            try {
                const response = await fetch(userData.webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Telecard-Cloud-Engine/2.0',
                        'X-Telecard-Signature': signature 
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.warn(`Webhook failed for User ${userId} with status ${response.status}`);
                    await logFailedWebhook(payload, userData.webhookUrl, `HTTP Error: ${response.status}`, userId);
                }
                return true;
            } catch (fetchErr) {
                clearTimeout(timeoutId);
                const errorMsg = fetchErr.name === 'AbortError' ? 'Connection Timeout (10s)' : fetchErr.message;
                console.error("Fetch Webhook Error:", errorMsg);
                await logFailedWebhook(payload, userData.webhookUrl, errorMsg, userId);
                return null;
            }
        } catch (error) {
            console.error("Webhook Dispatch Error:", error);
            return null; 
        }
    });

// ==========================================
// ♻️ 2. طابور المهام الذكي (Dead Letter Queue Retry)
// ==========================================
exports.cronRetryWebhooks = functions.region('us-east1').pubsub.schedule('every 1 hours')
    .timeZone('Asia/Riyadh')
    .onRun(async (context) => {
        const failedSnaps = await db.collection('telecard_failed_webhooks')
            .where('status', '==', 'failed')
            .where('attempts', '<', 5)
            .limit(50)
            .get();

        if (failedSnaps.empty) return null;

        const promises = failedSnaps.docs.map(async (doc) => {
            const data = doc.data();
            const currentAttempt = data.attempts + 1;
            const isLastAttempt = currentAttempt >= 5;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            try {
                const response = await fetch(data.webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Telecard-Cloud-Engine-Retry/2.0'
                    },
                    body: JSON.stringify(data.payload),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                if (response.ok) {
                    return doc.ref.update({ status: 'success', attempts: currentAttempt, lastAttempt: admin.firestore.FieldValue.serverTimestamp() });
                } else {
                    return doc.ref.update({ status: isLastAttempt ? 'permanently_failed' : 'failed', attempts: currentAttempt, error: `HTTP ${response.status}`, lastAttempt: admin.firestore.FieldValue.serverTimestamp() });
                }
            } catch (err) {
                clearTimeout(timeoutId);
                const errorMsg = err.name === 'AbortError' ? 'Connection Timeout (10s)' : err.message;
                return doc.ref.update({ status: isLastAttempt ? 'permanently_failed' : 'failed', attempts: currentAttempt, error: errorMsg, lastAttempt: admin.firestore.FieldValue.serverTimestamp() });
            }
        });

        await Promise.allSettled(promises);
        return true;
    });

// ==========================================
// 🔌 3. بوابة الـ API الخارجية (External API Gateway - Bank Grade Security)
// ==========================================
exports.externalCreateOrder = functions.region('us-east1').https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });
    }

    const apiKeyHeader = req.headers['x-api-key'] || req.headers['authorization'];
    if (!apiKeyHeader) return res.status(401).json({ success: false, error: 'Unauthorized: API Key is missing.' });

    const idempotencyKey = req.headers['idempotency-key'];
    const cleanKey = apiKeyHeader.replace('Bearer ', '').trim();

    try {
        const usersQuery = await db.collection('telecard_users').where('apiKey', '==', cleanKey).limit(1).get();
        if (usersQuery.empty) return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key.' });

        const userDoc = usersQuery.docs[0];
        const uid = userDoc.id;
        const { productId, qty, inputStr } = req.body;
        
        if (!productId) return res.status(400).json({ success: false, error: 'Bad Request: productId is required.' });

        const finalQty = Math.max(1, Math.floor(Number(qty) || 1));
        let resultData = null;
        const cleanOrderId = 'TC-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();

        await db.runTransaction(async (transaction) => {
            
            let idempotencyRef = null;
            if (idempotencyKey) {
                idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
                const existingReq = await transaction.get(idempotencyRef);
                if (existingReq.exists) {
                    resultData = existingReq.data().resultData;
                    return; 
                }
            }

            const productRef = db.collection('telecard_prods').doc(String(productId));

            const [productSnap, latestUserSnap] = await Promise.all([
                transaction.get(productRef),
                transaction.get(userDoc.ref)
            ]);

            if (!productSnap.exists) throw new Error('Product not found.');
            const product = productSnap.data();
            const userData = latestUserSnap.data();

            // 🛑 [الدرع الأمني المباشر]: منع التاجر المحظور من إكمال العملية عبر الـ API
            if (userData.isBanned === true || userData.isIpBanned === true) {
                throw new Error('Unauthorized: Account Banned');
            }

            const orderRef = db.collection('telecard_orders').doc(cleanOrderId);
            const tierId = String(userData.tierId || userData.tier || 1);
            const tierRef = db.collection('telecard_tiers').doc(tierId);
            const vaultRef = product.vaultPoolId ? db.collection('telecard_vault').doc(String(product.vaultPoolId)) : null;

            const [tierSnap, vaultSnap] = await Promise.all([
                transaction.get(tierRef),
                vaultRef ? transaction.get(vaultRef) : Promise.resolve(null)
            ]);

            const userTier = tierSnap.exists ? tierSnap.data() : null;

            const rawUnitCost = Number(product.costPrice || product.price || 0);
            const isFixed = (product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true');
            const fixedUsd = isFixed ? Number(product.fixedPriceUsd || product.fixed_price_usd || 0) : 0;

            const pricingSnapshot = FinancialEngine.calculatePrice({
                costPrice: rawUnitCost, fixedPrice: fixedUsd, tier: userTier, offer: null, coupon: null
            });

            // 🌟 استخدام الرياضيات الآمنة (Integer Math) لتجنب أخطاء الفواصل العشرية
            const exactPrice = safeAdd(0, pricingSnapshot.finalPrice * finalQty);
            const currentBalance = Number(userData.walletBalance || 0);

            if (currentBalance < exactPrice) throw new Error('Insufficient balance.');

            let deliveredCodeText = null;
            let isAutoDelivered = false;

            if (vaultSnap && vaultSnap.exists) {
                const vaultData = vaultSnap.data();
                if (vaultData.codes && vaultData.codes.length >= finalQty) {
                    const remainingCodes = [...vaultData.codes];
                    const extractedCodes = remainingCodes.splice(0, finalQty);
                    deliveredCodeText = extractedCodes.map(c => typeof c === 'object' ? (c.text || c.code || '') : c).join(' | ');
                    isAutoDelivered = true;
                    transaction.update(vaultRef, { codes: remainingCodes });
                } else {
                    throw new Error('Out of stock.');
                }
            }

            const costPriceVal = safeAdd(0, pricingSnapshot.cost * finalQty);
            const netProfit = safeAdd(0, pricingSnapshot.profit * finalQty);
            const newBalance = safeSub(currentBalance, exactPrice);
            const newTotalSpent = safeAdd(userData.totalSpent || 0, exactPrice);
            const newCycleSpent = safeAdd(userData.tierCycleSpent || 0, exactPrice);

            const newOrder = {
                id: cleanOrderId, displayId: cleanOrderId, userId: uid, prodId: productId, product: product.name,
                price: exactPrice, qty: finalQty, input: inputStr || 'API Request',
                status: isAutoDelivered ? 'completed' : 'pending', deliveredCode: deliveredCodeText,
                balanceAfter: newBalance, idempotencyKey: idempotencyKey || null, 
                pricingSnapshot: { 
                    costUsd: costPriceVal, tierPriceUsd: safeAdd(0, pricingSnapshot.tierPrice * finalQty),
                    originalPriceUsd: safeAdd(0, pricingSnapshot.originalPrice * finalQty), finalPriceUsd: exactPrice,
                    tierName: pricingSnapshot.tierName, netProfitUsd: netProfit, marginPct: pricingSnapshot.marginPct,
                    isFirewallActive: pricingSnapshot.isFirewallActive
                },
                time: admin.firestore.FieldValue.serverTimestamp(),
                isApiOrder: true
            };

            resultData = { orderId: cleanOrderId, status: newOrder.status, pricePaid: exactPrice, deliveredCode: deliveredCodeText };

            transaction.update(userDoc.ref, {
                walletBalance: newBalance, balance: newBalance, totalSpent: newTotalSpent, tierCycleSpent: newCycleSpent
            });
            
            // 🌟 إرسال إشعار للمشترى عبر الـ Subcollection لكي يراه في المتجر أيضاً!
            if (isAutoDelivered) {
                const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
                const notifRef = userDoc.ref.collection('notifications').doc(notifId);
                transaction.set(notifRef, {
                    id: notifId, title: "🔌 تم تسليم طلب API بنجاح!",
                    message: `تم إكمال طلبك الخارجي لشراء ( ${product.name} ) بنجاح.`,
                    type: 'notification', jumpTarget: 'order', createdAt: Date.now()
                });
            }

            transaction.set(orderRef, newOrder);

            if (idempotencyRef) {
                transaction.set(idempotencyRef, {
                    createdAt: admin.firestore.FieldValue.serverTimestamp(), resultData: resultData, orderId: cleanOrderId
                });
            }
        });

        return res.status(200).json({ success: true, data: resultData });

    } catch (error) {
        console.error("API Gateway Error:", error);
        
        // 🛑 التقاط خطأ الحظر وإرسال استجابة 403 Forbidden
        if (error.message === 'Unauthorized: Account Banned') {
            return res.status(403).json({ success: false, error: 'Account is banned or restricted.' });
        }
        
        if (error.message === 'Insufficient balance.') return res.status(402).json({ success: false, error: 'Insufficient balance' });
        else if (error.message === 'Out of stock.') return res.status(409).json({ success: false, error: 'Product out of stock' });
        else if (error.message === 'Product not found.') return res.status(404).json({ success: false, error: 'Product not found' });
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});
