const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { FinancialEngine } = require('./financialEngine.js');

// تأكد من تهيئة أدمن فايربيز إذا كان هذا الملف مستقلاً
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// ==========================================
// 🚀 1. مرسل الإشعارات السحابي (Webhook Dispatcher)
// يعمل تلقائياً عند أي تحديث على حالة الطلب في قاعدة البيانات
// ==========================================
exports.orderStatusWebhook = functions.firestore
    .document('telecard_orders/{orderId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();

        // 🛡️ إذا لم تتغير الحالة، لا داعي لإرسال إشعار (توفير موارد السيرفر)
        if (before.status === after.status) return null;

        const userId = after.userId;

        try {
            const userSnap = await db.collection('telecard_users').doc(String(userId)).get();
            if (!userSnap.exists) return null;

            const userData = userSnap.data();
            
            // تحقق من وجود رابط Webhook صالح للعميل
            if (!userData.webhookUrl || !userData.webhookUrl.startsWith('http')) return null;

            // 📦 تجهيز طرد البيانات (Payload)
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

            // 📡 إرسال الطلب لمتجر العميل
            // نستخدم دالة fetch القياسية في Node.js 18+
            const response = await fetch(userData.webhookUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'User-Agent': 'Telecard-Cloud-Engine/1.0'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.warn(`Webhook failed for User ${userId} with status ${response.status}`);
            }

            return true;
        } catch (error) {
            console.error("Webhook Dispatch Error:", error);
            return null; // لا نوقف النظام إذا فشل سيرفر العميل
        }
    });

// ==========================================
// 🔌 2. بوابة الـ API الخارجية (External API Gateway)
// نقطة وصول REST API عادية ليستقبل طلبات الشراء من سيرفرات التجار
// ==========================================
exports.externalCreateOrder = functions.https.onRequest(async (req, res) => {
    // 🛡️ السماح فقط بطلبات POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });
    }

    // 🔑 التحقق من المفتاح الأمني (tc_live_...)
    const apiKeyHeader = req.headers['x-api-key'] || req.headers['authorization'];
    if (!apiKeyHeader) {
        return res.status(401).json({ success: false, error: 'Unauthorized: API Key is missing.' });
    }

    // تنظيف المفتاح في حال إرساله بصيغة "Bearer tc_live_..."
    const cleanKey = apiKeyHeader.replace('Bearer ', '').trim();

    try {
        // البحث عن التاجر صاحب هذا المفتاح
        const usersQuery = await db.collection('telecard_users').where('apiKey', '==', cleanKey).limit(1).get();
        if (usersQuery.empty) {
            return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key.' });
        }

        const userDoc = usersQuery.docs[0];
        const userData = userDoc.data();
        const uid = userDoc.id;

        // 📦 جلب بيانات الطلب من الـ Body
        const { productId, qty, inputStr } = req.body;
        if (!productId) {
            return res.status(400).json({ success: false, error: 'Bad Request: productId is required.' });
        }

        const finalQty = Math.max(1, Math.floor(Number(qty) || 1));
        
        // 🔄 استدعاء المنطق المالي وعملية إنشاء الطلب (مبسطة ومحمية بـ Transaction)
        // [ملاحظة: هذا الهيكل يشبه دالتك الأساسية createOrder للحفاظ على تناسق الأمان المالي]
        
        let resultData = null;

        await db.runTransaction(async (transaction) => {
            const productRef = db.collection('telecard_prods').doc(String(productId));
            const productSnap = await transaction.get(productRef);
            
            if (!productSnap.exists) {
                throw new Error('Product not found.');
            }

            const product = productSnap.data();
            
            // جلب مستوى التاجر (Tier) للأسعار
            const tierId = String(userData.tierId || userData.tier || 1);
            const tierSnap = await transaction.get(db.collection('telecard_tiers').doc(tierId));
            const userTier = tierSnap.exists ? tierSnap.data() : null;

            // حساب السعر (باستخدام المحرك المالي)
            const rawUnitCost = Number(product.costPrice || product.price || 0);
            const pricingSnapshot = FinancialEngine.calculatePrice({
                costPrice: rawUnitCost,
                tier: userTier,
                offer: null, // العروض غالبًا لا تطبق على الـ API لتجنب التعارض، يمكن تعديلها حسب سياستك
                coupon: null
            });

            const totalRequired = Number((pricingSnapshot.finalPrice * finalQty).toFixed(4));
            
            // قراءة رصيد العميل الحالي (نقوم بجلب أحدث نسخة لضمان دقة الرصيد داخل الـ Transaction)
            const latestUserSnap = await transaction.get(userDoc.ref);
            const currentBalance = Number(latestUserSnap.data().walletBalance || 0);

            if (currentBalance < totalRequired) {
                throw new Error('Insufficient balance.');
            }

            // تسليم الأكواد الآلي
            let deliveredCodeText = null;
            let isAutoDelivered = false;

            if (product.vaultPoolId) {
                const vaultRef = db.collection('telecard_vault').doc(String(product.vaultPoolId));
                const vaultSnap = await transaction.get(vaultRef);
                if (vaultSnap.exists) {
                    const vaultData = vaultSnap.data();
                    if (vaultData.codes && vaultData.codes.length >= finalQty) {
                        const extractedCodes = vaultData.codes.splice(0, finalQty);
                        deliveredCodeText = extractedCodes.map(c => typeof c === 'object' ? (c.text || c.code || '') : c).join(' | ');
                        isAutoDelivered = true;
                        transaction.update(vaultRef, { codes: vaultData.codes });
                    } else {
                        throw new Error('Out of stock.');
                    }
                }
            }

            // خصم الرصيد وتسجيل الطلب
            const newBalance = Math.max(0, Number((currentBalance - totalRequired).toFixed(4)));
            const orderRef = db.collection('telecard_orders').doc();
            const shortId = Math.floor(100000 + Math.random() * 900000);

            const newOrder = {
                id: orderRef.id,
                displayId: shortId,
                userId: uid,
                prodId: productId,
                product: product.name,
                price: totalRequired,
                qty: finalQty,
                input: inputStr || 'API Request',
                status: isAutoDelivered ? 'completed' : 'pending',
                deliveredCode: deliveredCodeText,
                time: admin.firestore.FieldValue.serverTimestamp(),
                isApiOrder: true // 🎯 تمييز الطلبات القادمة من الـ API
            };

            transaction.update(userDoc.ref, {
                walletBalance: newBalance,
                balance: newBalance,
                totalSpent: admin.firestore.FieldValue.increment(totalRequired)
            });
            
            transaction.set(orderRef, newOrder);

            resultData = {
                orderId: shortId,
                status: newOrder.status,
                pricePaid: totalRequired,
                deliveredCode: deliveredCodeText
            };
        });

        // 🌟 إرسال استجابة نجاح للعميل
        return res.status(200).json({ success: true, data: resultData });

    } catch (error) {
        console.error("API Gateway Error:", error);
        
        // معالجة الأخطاء الشائعة وإرجاع كود مناسب
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
