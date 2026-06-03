const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto'); // 🌟 توليد المعرفات السريعة والتوقيع الرقمي
const { FinancialEngine } = require('./financialEngine.js');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// ==========================================
// 🛠️ دوال مساعدة (Helpers)
// ==========================================

// دالة لحفظ المحاولات الفاشلة في طابور المهام (Queue) لإعادة إرسالها
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

// دالة لتوليد توقيع رقمي أمني (HMAC) للتأكد من هوية المرسل
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
        
        // منع إرسال إشعار إذا لم تتغير الحالة
        if (before.status === after.status) return null;
        
        const userId = after.userId;
        
        try {
            const userSnap = await db.collection('telecard_users').doc(String(userId)).get();
            if (!userSnap.exists) return null;
            
            const userData = userSnap.data();
            
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

            // 🌟 توليد توقيع أمني إذا كان العميل يمتلك Secret Key
            const signature = generateHmacSignature(payload, userData.webhookSecret || 'default_telecard_secret');
            
            // 🌟 الجدار الناري: تحديد مهلة 10 ثوانٍ للاتصال
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            try {
                const response = await fetch(userData.webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Telecard-Cloud-Engine/2.0',
                        'X-Telecard-Signature': signature // توقيع الأمان
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
                    return doc.ref.update({ 
                        status: 'success', 
                        attempts: currentAttempt, 
                        lastAttempt: admin.firestore.FieldValue.serverTimestamp() 
                    });
                } else {
                    return doc.ref.update({ 
                        status: isLastAttempt ? 'permanently_failed' : 'failed',
                        attempts: currentAttempt, 
                        error: `HTTP ${response.status}`, 
                        lastAttempt: admin.firestore.FieldValue.serverTimestamp() 
                    });
                }
            } catch (err) {
                clearTimeout(timeoutId);
                const errorMsg = err.name === 'AbortError' ? 'Connection Timeout (10s)' : err.message;
                
                return doc.ref.update({ 
                    status: isLastAttempt ? 'permanently_failed' : 'failed',
                    attempts: currentAttempt, 
                    error: errorMsg, 
                    lastAttempt: admin.firestore.FieldValue.serverTimestamp() 
                });
            }
        });

        // 🌟 حماية السلسلة من الانهيار إذا فشل مستند واحد
        await Promise.allSettled(promises);
        return true;
    });

// ==========================================
// 🔌 3. بوابة الـ API الخارجية (External API Gateway - Turbo & Idempotency)
// ==========================================
exports.externalCreateOrder = functions.region('us-east1').https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });
    }

    const apiKeyHeader = req.headers['x-api-key'] || req.headers['authorization'];
    if (!apiKeyHeader) {
        return res.status(401).json({ success: false, error: 'Unauthorized: API Key is missing.' });
    }

    // 🌟 Idempotency Key: مفتاح الحماية من الطلبات المكررة
    const idempotencyKey = req.headers['idempotency-key'];
    const cleanKey = apiKeyHeader.replace('Bearer ', '').trim();

    try {
        const usersQuery = await db.collection('telecard_users').where('apiKey', '==', cleanKey).limit(1).get();
        if (usersQuery.empty) {
            return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key.' });
        }

        const userDoc = usersQuery.docs[0];
        const uid = userDoc.id;

        const { productId, qty, inputStr } = req.body;
        if (!productId) {
            return res.status(400).json({ success: false, error: 'Bad Request: productId is required.' });
        }

        const finalQty = Math.max(1, Math.floor(Number(qty) || 1));
        let resultData = null;

        // 🌟 إنشاء معرف طلب سريع جداً وخالٍ من الاختناقات (Contention-Free)
        // صيغة: TC-TIMESTAMP-RANDOM
        const cleanOrderId = 'TC-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();

        await db.runTransaction(async (transaction) => {
            
            // 🌟 حماية الـ Idempotency داخل الـ Transaction
            let idempotencyRef = null;
            if (idempotencyKey) {
                idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
                const existingReq = await transaction.get(idempotencyRef);
                if (existingReq.exists) {
                    // إذا وجدنا الطلب سابقاً، نعيد نتيجته المخزنة ولا ننفذ أي خصم!
                    resultData = existingReq.data().resultData;
                    return; 
                }
            }

            const productRef = db.collection('telecard_prods').doc(String(productId));

            // قراءة متوازية
            const [productSnap, latestUserSnap] = await Promise.all([
                transaction.get(productRef),
                transaction.get(userDoc.ref)
            ]);

            if (!productSnap.exists) throw new Error('Product not found.');
            const product = productSnap.data();
            const userData = latestUserSnap.data();

            const orderRef = db.collection('telecard_orders').doc(cleanOrderId);

            const tierId = String(userData.tierId || userData.tier || 1);
            const tierRef = db.collection('telecard_tiers').doc(tierId);
            const vaultRef = product.vaultPoolId ? db.collection('telecard_vault').doc(String(product.vaultPoolId)) : null;

            const [tierSnap, vaultSnap] = await Promise.all([
                transaction.get(tierRef),
                vaultRef ? transaction.get(vaultRef) : Promise.resolve(null)
            ]);

            const userTier = tierSnap.exists ? tierSnap.data() : null;

            let rawUnitCost = Number(product.costPrice || product.price || 0);
            const isFixed = (product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true');

            if (isFixed) {
                const fixedUsd = Number(product.fixedPriceUsd || product.fixed_price_usd || 0);
                if (fixedUsd > 0) rawUnitCost = fixedUsd;
            }

            const pricingSnapshot = FinancialEngine.calculatePrice({
                costPrice: rawUnitCost,
                tier: isFixed ? null : userTier,
                offer: null, 
                coupon: null
            });

            const exactPrice = Number((pricingSnapshot.finalPrice * finalQty).toFixed(4));
            const currentBalance = Number(userData.walletBalance || 0);

            if (currentBalance < exactPrice) {
                throw new Error('Insufficient balance.');
            }

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

            const costPriceVal = Number((pricingSnapshot.cost * finalQty).toFixed(4));
            const netProfit = Number((pricingSnapshot.profit * finalQty).toFixed(4));
            
            const newBalance = Number(Math.max(0, currentBalance - exactPrice).toFixed(4));
            const newTotalSpent = Number((Number(userData.totalSpent || 0) + exactPrice).toFixed(4));
            const newCycleSpent = Number((Number(userData.tierCycleSpent || 0) + exactPrice).toFixed(4));

            const newOrder = {
                id: cleanOrderId,
                displayId: cleanOrderId, 
                userId: uid,
                prodId: productId,
                product: product.name,
                price: exactPrice,
                qty: finalQty,
                input: inputStr || 'API Request',
                status: isAutoDelivered ? 'completed' : 'pending',
                deliveredCode: deliveredCodeText,
                balanceAfter: newBalance,
                idempotencyKey: idempotencyKey || null, // حفظ المفتاح كمرجع إضافي
                pricingSnapshot: { 
                    costUsd: costPriceVal,
                    tierPriceUsd: Number((pricingSnapshot.tierPrice * finalQty).toFixed(4)),
                    originalPriceUsd: Number((pricingSnapshot.originalPrice * finalQty).toFixed(4)),
                    finalPriceUsd: exactPrice,
                    tierName: pricingSnapshot.tierName,
                    netProfitUsd: netProfit,
                    marginPct: pricingSnapshot.marginPct,
                    isFirewallActive: pricingSnapshot.isFirewallActive
                },
                time: admin.firestore.FieldValue.serverTimestamp(),
                isApiOrder: true
            };

            resultData = {
                orderId: cleanOrderId,
                status: newOrder.status,
                pricePaid: exactPrice,
                deliveredCode: deliveredCodeText
            };

            transaction.update(userDoc.ref, {
                walletBalance: newBalance, balance: newBalance,
                totalSpent: newTotalSpent, tierCycleSpent: newCycleSpent
            });
            
            transaction.set(orderRef, newOrder);

            // 🌟 توثيق العملية لضمان عدم تكرارها مستقبلاً
            if (idempotencyRef) {
                transaction.set(idempotencyRef, {
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    resultData: resultData,
                    orderId: cleanOrderId
                });
            }
        });

        return res.status(200).json({ success: true, data: resultData });

    } catch (error) {
        console.error("API Gateway Error:", error);
        
        if (error.message === 'Insufficient balance.') {
            return res.status(402).json({ success: false, error: 'Insufficient balance' });
        } else if (error.message === 'Out of stock.') {
            return res.status(409).json({ success: false, error: 'Product out of stock' });
        } else if (error.message === 'Product not found.') {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }
        
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});
