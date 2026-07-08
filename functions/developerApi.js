// ============================================================================
// ☁️ بوابة الـ API ومستقبل الـ Webhooks (functions/developerApi.js) - Bank Grade 🏦
// 🎯 الوظيفة: معالجة طلبات التجار الخارجية، طابور الـ Webhooks، والتوقيع الرقمي
// 🌟 التحديث الأقصى: استدعاء calculateOrderTotal، ترقيع SSRF عسكري، وتفعيل onWrite
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

// 🛡️ [ترقيع أمني عسكري]: منع SSRF (بما في ذلك IPv6 و Decimal IPs)
function isSafeWebhookUrl(urlString) {
    try {
        const parsedUrl = new URL(urlString);
        if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') return false;
        
        const hostname = parsedUrl.hostname.toLowerCase();
        
        // منع IPv6 Localhost والـ Decimal IPs و 0.0.0.0
        if (hostname.includes('[') || hostname.includes('::') || /^0\.0\.0\.0$/.test(hostname) || /^\d+$/.test(hostname)) {
            return false;
        }

        const blockedPatterns = [
            /^localhost$/,
            /^127\.\d+\.\d+\.\d+$/,
            /^10\.\d+\.\d+\.\d+$/,
            /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
            /^192\.168\.\d+\.\d+$/,
            /^169\.254\.\d+\.\d+$/ // GCP / AWS Metadata IP
        ];
        return !blockedPatterns.some(pattern => pattern.test(hostname));
    } catch (e) {
        return false;
    }
}

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
// 🌟 [إصلاح الخلل المعماري]: استخدام onWrite لالتقاط الطلبات المنشأة حديثاً عبر الـ API والتحديثات معاً
exports.orderStatusWebhook = functions.region('us-east1').firestore
    .document('telecard_orders/{orderId}')
    .onWrite(async (change, context) => {
        
        // إذا تم حذف الطلب، نتجاهله
        if (!change.after.exists) return null;

        const after = change.after.data();
        const before = change.before.exists ? change.before.data() : null;
        
        // إذا كان تحديثاً ولم تتغير الحالة، نتجاهله
        if (before && before.status === after.status) return null;
        
        const userId = after.userId;
        
        try {
            const userSnap = await db.collection('telecard_users').doc(String(userId)).get();
            if (!userSnap.exists) return null;
            
            const userData = userSnap.data();
            
            if (userData.isBanned === true) {
                console.log(`Webhook blocked for banned user: ${userId}`);
                return null;
            }
            
            if (!userData.webhookUrl || !isSafeWebhookUrl(userData.webhookUrl)) {
                return null;
            }
            
            const payload = {
                // 🛡️ إضافة eventId لمنع تكرار معالجة الإشعار من طرف التاجر (Idempotency)
                eventId: context.eventId, 
                event: before ? 'order_status_changed' : 'order_created',
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
                        'User-Agent': 'Telecard-Cloud-Engine/2.1',
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
                        'User-Agent': 'Telecard-Cloud-Engine-Retry/2.1'
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

    // 🛡️ [ترقيع أمني]: منع مفاتيح فارغة من تخطي المصادقة
    if (cleanKey.length < 20) return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key format.' });

    try {
        const usersQuery = await db.collection('telecard_users').where('apiKey', '==', cleanKey).limit(1).get();
        if (usersQuery.empty) return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key.' });

        const userDoc = usersQuery.docs[0];
        const uid = userDoc.id;
        const { productId, qty, inputStr } = req.body;
        
        if (!productId) return res.status(400).json({ success: false, error: 'Bad Request: productId is required.' });

        const finalQty = Math.max(1, Math.floor(Number(qty) || 1));
        let resultData = null;

// 🛡️ [تحديث أمني]: استخدام crypto لمنع ثغرات التصادم
const cleanOrderId = 'TC-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

// 🛡️ [ترقيع أمني]: إنشاء بصمة مشفرة لبيانات الطلب لمنع استغلال الـ Idempotency
const requestPayload = JSON.stringify({ productId, finalQty, inputStr });
const requestHash = crypto.createHash('sha256').update(requestPayload).digest('hex');
        await db.runTransaction(async (transaction) => {
            
            let idempotencyRef = null;
            if (idempotencyKey) {
                idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
                const existingReq = await transaction.get(idempotencyRef);
               if (existingReq.exists) {
    const savedData = existingReq.data();
    // 🚨 🚨 [إغلاق الثغرة]: التحقق من أن الطلب المكرر يحمل نفس البيانات بالضبط!
    if (savedData.requestHash !== requestHash) {
        throw new Error('Idempotency Conflict: Key already used with different payload.');
    }
    resultData = savedData.resultData;
    return; // إرجاع النتيجة المحفوظة بأمان تام
}      }

            const productRef = db.collection('telecard_prods').doc(String(productId));
            const [productSnap, latestUserSnap] = await Promise.all([
                transaction.get(productRef),
                transaction.get(userDoc.ref)
            ]);

            if (!productSnap.exists) throw new Error('Product not found.');
            const product = productSnap.data();
            const userData = latestUserSnap.data();

            if (userData.isBanned === true || userData.isIpBanned === true) {
                throw new Error('Unauthorized: Account Banned');
            }

            const orderRef = db.collection('telecard_orders').doc(cleanOrderId);
            const tierId = String(userData.tierId || userData.tier || 1);
            
            // 🏗️ [التوافق المعماري]: استخدام الـ Subcollections لقراءة المخزون بدلاً من المصفوفات القديمة
            let vaultKeysQuery = null;
            if (product.vaultPoolId) {
                 vaultKeysQuery = db.collection('telecard_vault').doc(String(product.vaultPoolId))
                                    .collection('keys')
                                    .where('isSold', '==', false)
                                    .limit(finalQty);
            }

            const [tierSnap, keysSnap] = await Promise.all([
                transaction.get(db.collection('telecard_tiers').doc(tierId)),
                vaultKeysQuery ? transaction.get(vaultKeysQuery) : Promise.resolve(null)
            ]);

            const userTier = tierSnap.exists ? tierSnap.data() : null;

            // 🛡️ [تحديث أمني 💎]: استدعاء المحرك المالي وتمرير الكمية له ليحسب الإجماليات
            const pricingSnapshot = FinancialEngine.calculateOrderTotal({
                product: product, 
                tier: userTier, 
                offer: null, 
                coupon: null
            }, finalQty); // تمرير الكمية هنا

            // 🚨 🚨 [إغلاق الثغرة]: تفعيل الجدار الناري هنا أيضاً لحماية أرباح المورد!
            if (pricingSnapshot.isFirewallViolated) {
                console.error(`[API SECURITY ALERT] Firewall blocked API order! User: ${uid}, Product: ${productId}`);
                throw new Error('Firewall Violation: Price consistency error.');
            }

            // 💡 سحب السعر الإجمالي جاهزاً من المحرك المالي
            const exactPrice = pricingSnapshot.totalFinalPrice;
            const currentBalance = Number(userData.walletBalance || userData.balance || 0);

            if (exactPrice <= 0 || currentBalance < exactPrice) throw new Error('Insufficient balance.');

            let deliveredCodeText = null;
            let isAutoDelivered = false;
            let extractedCodes = [];

            // 🏗️ سحب الأكواد من الـ Subcollections وقفلها فوراً 
            if (vaultKeysQuery) {
                if (!keysSnap || keysSnap.size < finalQty) {
                    throw new Error('Out of stock.');
                }
                
                keysSnap.forEach(doc => {
                    const codeData = doc.data();
                    extractedCodes.push(codeData.codeText);
                    // قفل الكود وربطه بطلب الـ API
                    transaction.update(doc.ref, {
                        isSold: true,
                        soldAt: admin.firestore.FieldValue.serverTimestamp(),
                        orderId: cleanOrderId,
                        userId: uid
                    });
                });
                
                deliveredCodeText = extractedCodes.join(' | ');
                isAutoDelivered = true;
            }

            const newBalance = safeSub(currentBalance, exactPrice);
            const newTotalSpent = safeAdd(userData.totalSpent || 0, exactPrice);
            const newCycleSpent = safeAdd(userData.tierCycleSpent || 0, exactPrice);

            const newOrder = {
                id: cleanOrderId, displayId: cleanOrderId, userId: uid, prodId: productId, product: product.name,
                price: exactPrice, qty: finalQty, input: inputStr || 'API Request',
                status: isAutoDelivered ? 'completed' : 'pending', deliveredCode: deliveredCodeText,
                balanceAfter: newBalance, idempotencyKey: idempotencyKey || null, 
                pricingSnapshot: { 
                    costUsd: pricingSnapshot.totalCost, // من المحرك مباشرة
                    originalPriceUsd: pricingSnapshot.totalOriginalPrice, // من المحرك مباشرة
                    finalPriceUsd: exactPrice,
                    tierName: pricingSnapshot.tierName, 
                    netProfitUsd: pricingSnapshot.totalProfit, // الاعتماد التام على المحرك المالي
                    isFirewallActive: pricingSnapshot.isFirewallActive
                },
                time: admin.firestore.FieldValue.serverTimestamp(),
                isApiOrder: true
            };

            resultData = { orderId: cleanOrderId, status: newOrder.status, pricePaid: exactPrice, deliveredCode: deliveredCodeText };

            transaction.update(userDoc.ref, {
                walletBalance: newBalance, balance: newBalance, totalSpent: newTotalSpent, tierCycleSpent: newCycleSpent
            });
            
            if (isAutoDelivered) {
                const notifId = `notif_api_${cleanOrderId}`;
                transaction.set(userDoc.ref.collection('notifications').doc(notifId), {
                    id: notifId, title: "🔌 تم تسليم طلب API بنجاح!",
                    message: `تم إكمال طلبك الخارجي لشراء ( ${product.name} ) بنجاح.`,
                    type: 'notification', jumpTarget: 'order', createdAt: Date.now()
                });
            }

            transaction.set(orderRef, newOrder);

            if (idempotencyRef) {
    transaction.set(idempotencyRef, {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        resultData: resultData,
        orderId: cleanOrderId,
        requestHash: requestHash // 🛡️ حفظ البصمة لمقارنتها في المستقبل
    });
}        });

        return res.status(200).json({ success: true, data: resultData });

    } catch (error) {
        console.error("API Gateway Error:", error);
        
        if (error.message === 'Unauthorized: Account Banned') return res.status(403).json({ success: false, error: 'Account is banned.' });
        if (error.message === 'Insufficient balance.') return res.status(402).json({ success: false, error: 'Insufficient balance.' });
        if (error.message === 'Out of stock.') return res.status(409).json({ success: false, error: 'Product out of stock.' });
        if (error.message === 'Product not found.') return res.status(404).json({ success: false, error: 'Product not found.' });
        if (error.message.includes('Firewall')) return res.status(400).json({ success: false, error: 'Order rejected by security policy.' });
        
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});