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
            return null; 
        }
    });

// ==========================================
// 🔌 2. بوابة الـ API الخارجية (External API Gateway - Turbo Version)
// ==========================================
exports.externalCreateOrder = functions.region('us-east1').https.onRequest(async (req, res) => {
    // 🛡️ السماح فقط بطلبات POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });
    }

    // 🔑 التحقق من المفتاح الأمني
    const apiKeyHeader = req.headers['x-api-key'] || req.headers['authorization'];
    if (!apiKeyHeader) {
        return res.status(401).json({ success: false, error: 'Unauthorized: API Key is missing.' });
    }

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

        // 🔄 محرك التحويلات الجبار والمسرع
        await db.runTransaction(async (transaction) => {
            const productRef = db.collection('telecard_prods').doc(String(productId));
            const countersRef = db.collection('telecard_system').doc('counters'); 

            // 🚀 1. القراءة المتزامنة الحقيقية (يوفر ثانية كاملة)
            const [productSnap, countersSnap, latestUserSnap] = await Promise.all([
                transaction.get(productRef),
                transaction.get(countersRef),
                transaction.get(userDoc.ref)
            ]);

            if (!productSnap.exists) throw new Error('Product not found.');
            const product = productSnap.data();
            const userData = latestUserSnap.data();

            // استخراج الـ ID المتسلسل (العداد)
            let currentOrderCount = 100001; 
            if (countersSnap.exists && countersSnap.data().orders_counter) {
                currentOrderCount = countersSnap.data().orders_counter + 1;
            }
            const cleanOrderId = String(currentOrderCount);
            const orderRef = db.collection('telecard_orders').doc(cleanOrderId);

            // 🚀 2. جلب المستوى والمخزن معاً
            const tierId = String(userData.tierId || userData.tier || 1);
            const tierRef = db.collection('telecard_tiers').doc(tierId);
            const vaultRef = product.vaultPoolId ? db.collection('telecard_vault').doc(String(product.vaultPoolId)) : null;

            const [tierSnap, vaultSnap] = await Promise.all([
                transaction.get(tierRef),
                vaultRef ? transaction.get(vaultRef) : Promise.resolve(null)
            ]);

            const userTier = tierSnap.exists ? tierSnap.data() : null;

            // حساب التكلفة
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

            // تحديثات القيود والترتيب 
            const costPriceVal = Number((pricingSnapshot.cost * finalQty).toFixed(4));
            const netProfit = Number((pricingSnapshot.profit * finalQty).toFixed(4));
            
            // التعديل الآمن للأرصدة
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
                balanceAfter: newBalance, // 🌟 إضافة الرصيد التراكمي
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

            // تطبيق التغييرات (بدون update للـ singleton لمنع الدبلة والاختناق)
            transaction.update(userDoc.ref, {
                walletBalance: newBalance, balance: newBalance,
                totalSpent: newTotalSpent, tierCycleSpent: newCycleSpent
            });
            
            transaction.set(orderRef, newOrder);
            transaction.set(countersRef, { orders_counter: currentOrderCount }, { merge: true });

            resultData = {
                orderId: cleanOrderId,
                status: newOrder.status,
                pricePaid: exactPrice,
                deliveredCode: deliveredCodeText
            };
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