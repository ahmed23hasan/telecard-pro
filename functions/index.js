// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (functions/index.js) - النسخة المدرعة للإنتاج V5
// 🎯 الوظيفة: معالجة الطلبات والإيداعات الآمنة سحابياً بنظام الحوسبة المتوازية اللانهائية
// 🌟 التحديث الأقصى: معرفات Base36 + حماية التكرار (Anti-Spam) + توجيه us-east1
// ============================================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { FinancialEngine } = require('./financialEngine.js'); 

// تهيئة الأدمن مرة واحدة فقط
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// ==========================================
// 🛡️ دوال مساعدة (Helper Functions)
// ==========================================

const isMasterAdmin = (context) => {
    if (!context.auth) return false;
    return context.auth.token.email === 'admin@telecard.pro' || context.auth.uid === 'e064MQJyn6dhU9mNXZvXItc7VYg2';
};

const safeAdd = (a, b) => Number((Number(a) + Number(b)).toFixed(4));
const safeSub = (a, b) => Math.max(0, Number((Number(a) - Number(b)).toFixed(4)));

// 🌟 [مُولد المعرفات الفاخر]: يعتمد على نظام Base36 الزمني ويمنع الـ Hotspotting نهائياً
const generateUniqueId = () => {
    const timeBase36 = Date.now().toString(36).toUpperCase();
    const randomSuffix = Math.floor(10 + Math.random() * 90); // رقمين عشوائيين للأمان المطلق
    return `${timeBase36}-${randomSuffix}`; // ينتج معرفات فخمة مثل: LPTW89-34
};

// ==========================================
// 🛒 1. دالة إنشاء الطلبات الآمنة للعملاء (النسخة اللانهائية التوازي + المحصنة ضد التكرار والتصادم المالي)
// ==========================================
exports.createOrder = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

    const uid = context.auth.uid;
    const { productId, qty, optIdx, finalInputStr, couponCode } = data;
    const finalQty = Math.max(1, Math.floor(Number(qty) || 1));

    try {
        // 🛡️ [جدار الحماية ضد النقر المزدوج]: يمنع العميل من شراء نفس المنتج مرتين خلال 10 ثوانٍ
        const spamCheckQuery = await db.collection('telecard_orders')
            .where('userId', '==', uid)
            .where('prodId', '==', String(productId))
            .orderBy('time', 'desc')
            .limit(1).get();

        if (!spamCheckQuery.empty) {
            const lastOrder = spamCheckQuery.docs[0].data();
            
            // 🌟 [الدرع المعماري الاحترافي - Type Guard]: فك تشفير الوقت بمرونة فائقة 
            // يقبل الـ Timestamp السحابي أو الرقم الملي-ثاني للطلبات القديمة لمنع انهيار السيرفر 
            let lastOrderTime = 0;
            if (lastOrder.time) {
                if (typeof lastOrder.time.toDate === 'function') {
                    lastOrderTime = lastOrder.time.toDate().getTime();
                } else if (typeof lastOrder.time === 'number') {
                    lastOrderTime = lastOrder.time;
                } else {
                    const parsedDate = new Date(lastOrder.time);
                    lastOrderTime = isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime();
                }
            }
            
            const timeDifference = Date.now() - lastOrderTime;
            
            if (timeDifference < 10000) { // 10 ثوانٍ تبريد لمنع السبام
                throw new functions.https.HttpsError('already-exists', 'لقد قمت بطلب هذا المنتج للتو! يرجى الانتظار بضع ثوانٍ لمنع الشراء المزدوج بالخطأ.');
            }
        }

        // 🌟 توليد المعرف الرقمي الفخم خارج الـ Transaction ومسح العدادات تماماً لمنع الاختناق (No Hotspotting)
        const cleanOrderId = generateUniqueId();
        const userRef = db.collection('telecard_users').doc(uid);
        const productRef = db.collection('telecard_prods').doc(String(productId));
        const systemRef = db.collection('telecard_system').doc('singleton');
        const orderRef = db.collection('telecard_orders').doc(cleanOrderId); 
        
        let couponRef = null;
        if (couponCode) {
            const couponQuery = await db.collection('telecard_coupons').where('code', '==', couponCode).limit(1).get();
            if (!couponQuery.empty) couponRef = couponQuery.docs[0].ref;
        }

        const offersQuery = await db.collection('telecard_offers')
            .where('isActive', '==', true)
            .where('targetProds', 'array-contains', String(productId))
            .get();
        
        let activeOffer = null;
        const now = Date.now();
        offersQuery.forEach(doc => {
            const off = doc.data();
            if (!off.expiryDate || off.expiryDate > now) activeOffer = off;
        });

        let resultMessage = "تم استلام الطلب بأمان.";
        let deliveredCodeText = null;
        let isAutoDelivered = false;

        await db.runTransaction(async (transaction) => {
            const userSnap = await transaction.get(userRef);
            const productSnap = await transaction.get(productRef);
            let couponSnap = couponRef ? await transaction.get(couponRef) : null;

            if (!userSnap.exists) throw new functions.https.HttpsError('not-found', 'المستخدم غير موجود.');
            if (!productSnap.exists) throw new functions.https.HttpsError('not-found', 'المنتج غير متوفر.');

            const userData = userSnap.data();
            const product = productSnap.data();
            const couponData = (couponSnap && couponSnap.exists) ? couponSnap.data() : null;

            const tierId = String(userData.tierId || userData.tier || 1);
            const tierRef = db.collection('telecard_tiers').doc(tierId);
            const tierSnap = await transaction.get(tierRef);
            const userTier = tierSnap.exists ? tierSnap.data() : null;
            
            const serverNow = Date.now(); 
            
            if (activeOffer && activeOffer.expiryDate && activeOffer.expiryDate < serverNow) activeOffer = null; 
            if (couponData && couponData.expiryDate && couponData.expiryDate < serverNow) {
                throw new functions.https.HttpsError('failed-precondition', 'عذراً، انتهت صلاحية هذا الكوبون.');
            }

            let vaultSnap = null;
            let vaultRef = null;
            if (product.vaultPoolId) {
                vaultRef = db.collection('telecard_vault').doc(String(product.vaultPoolId));
                vaultSnap = await transaction.get(vaultRef); 
            }

            let rawUnitCost = Number(product.costPrice || product.unitCost || product.price || 0);
            if (product.type === 'select' && Array.isArray(product.options) && product.options[optIdx]) {
                rawUnitCost = Number(product.options[optIdx].price || product.options[optIdx].costPrice || 0);
            }
            
            const isFixed = (
                product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true' || 
                product.is_fixed_price === true || String(product.is_fixed_price).toLowerCase() === 'true'
            );

            if (isFixed) {
                const fixedUsd = Number(product.fixedPriceUsd || product.fixed_price_usd || 0);
                if (fixedUsd > 0) rawUnitCost = fixedUsd;
            }

            const pricingSnapshot = FinancialEngine.calculatePrice({
                costPrice: rawUnitCost, tier: isFixed ? null : userTier, offer: activeOffer, coupon: couponData
            });

            const totalRequired = Number((pricingSnapshot.finalPrice * finalQty).toFixed(4));
            const currentBalance = Number(userData.walletBalance || 0);

            if (pricingSnapshot.couponCode && couponRef && couponData) {
                if (couponData.maxUses > 0 && (couponData.usedCount || 0) >= couponData.maxUses) {
                    throw new functions.https.HttpsError('resource-exhausted', 'نفدت كمية استخدام هذا الكوبون.');
                }
            }

            if (currentBalance < totalRequired) {
                throw new functions.https.HttpsError('failed-precondition', 'رصيدك غير كافٍ لإتمام العملية.');
            }

            let remainingCodes = [];
            if (vaultSnap && vaultSnap.exists) {
                const vaultData = vaultSnap.data();
                if (vaultData.codes && vaultData.codes.length >= finalQty) {
                    remainingCodes = [...vaultData.codes];
                    const extractedCodes = remainingCodes.splice(0, finalQty);
                    deliveredCodeText = extractedCodes.map(c => typeof c === 'object' ? (c.text || c.code || '') : c).join(' | ');
                    isAutoDelivered = true;
                    resultMessage = "تم تنفيذ طلبك بنجاح وتسليم الكود.";
                } else {
                    throw new functions.https.HttpsError('resource-exhausted', 'المنتج نفد من المخزون حالياً.');
                }
            }

            const newBalance = safeSub(currentBalance, totalRequired);
            const newTotalSpent = safeAdd(userData.totalSpent || 0, totalRequired);
            const newCycleSpent = safeAdd(userData.tierCycleSpent || 0, totalRequired); 

            const newOrder = {
                id: cleanOrderId, displayId: cleanOrderId, 
                userId: uid, prodId: productId, product: product.name,
                price: totalRequired, qty: finalQty, input: finalInputStr || '---',
                status: isAutoDelivered ? 'completed' : 'pending', deliveredCode: deliveredCodeText,
                couponCode: pricingSnapshot.couponCode || null,
                couponDiscount: Number((pricingSnapshot.couponDiscount * finalQty).toFixed(4)),
                saleDiscount: Number((pricingSnapshot.offerDiscount * finalQty).toFixed(4)),
                pricingSnapshot: {
                    costUsd: Number((pricingSnapshot.cost * finalQty).toFixed(4)),
                    tierPriceUsd: Number((pricingSnapshot.tierPrice * finalQty).toFixed(4)),
                    originalPriceUsd: Number((pricingSnapshot.originalPrice * finalQty).toFixed(4)),
                    finalPriceUsd: totalRequired, tierName: pricingSnapshot.tierName,
                    offerName: pricingSnapshot.offerName, offerDiscount: Number((pricingSnapshot.offerDiscount * finalQty).toFixed(4)),
                    couponCode: pricingSnapshot.couponCode, couponDiscount: Number((pricingSnapshot.couponDiscount * finalQty).toFixed(4)),
                    totalDiscountVal: Number((pricingSnapshot.totalDiscountVal * finalQty).toFixed(4)),
                    netProfitUsd: Number((pricingSnapshot.profit * finalQty).toFixed(4)), marginPct: pricingSnapshot.marginPct,
                    isFirewallActive: pricingSnapshot.isFirewallActive
                },
                time: admin.firestore.FieldValue.serverTimestamp()
            };

            const statsUpdate = { 'globalStats.orders.total': admin.firestore.FieldValue.increment(1) };
            if (isAutoDelivered) {
                statsUpdate['globalStats.orders.completed'] = admin.firestore.FieldValue.increment(1);
                statsUpdate['globalStats.financials.totalRevenue'] = admin.firestore.FieldValue.increment(totalRequired);
                statsUpdate['globalStats.financials.totalCost'] = admin.firestore.FieldValue.increment(Number((pricingSnapshot.cost * finalQty).toFixed(4)));
                statsUpdate['globalStats.financials.totalProfit'] = admin.firestore.FieldValue.increment(Number((pricingSnapshot.profit * finalQty).toFixed(4)));
            }

            if (pricingSnapshot.couponCode && couponRef && couponData) {
                transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });
            }
            if (vaultSnap && vaultSnap.exists && isAutoDelivered) {
                transaction.update(vaultRef, { codes: remainingCodes });
            }
            transaction.update(userRef, { walletBalance: newBalance, balance: newBalance, totalSpent: newTotalSpent, tierCycleSpent: newCycleSpent });
            transaction.set(orderRef, newOrder);
            transaction.set(systemRef, statsUpdate, { merge: true }); 
        });

        return { success: true, message: resultMessage, isAutoDelivered: isAutoDelivered, deliveredCode: deliveredCodeText };
        
    } catch (error) {
        console.error("Order Error:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'حدث خطأ غير متوقع في السيرفر.');
    }
});
// ==========================================
// 💰 2. دالة إرسال طلب الإيداع للعملاء (توازي + حماية سبام + حماية تلاعب أرقام)
// ==========================================
exports.submitBalanceRequest = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

    const uid = context.auth.uid;
    const { amount, paymentMethodName, payCurr, receiptData } = data; // السيرفر يتجاهل netBase

    if (amount <= 0) throw new functions.https.HttpsError('invalid-argument', 'المبلغ المدخل غير صالح.');

    try {
        // 🛡️ [جدار الحماية ضد السبام]: التحقق من عدم وجود طلب معلق مسبقاً بنفس الطريقة
        const existingPending = await db.collection('telecard_deposits')
            .where('userId', '==', uid)
            .where('method', '==', paymentMethodName)
            .where('status', '==', 'pending')
            .limit(1).get();

        if (!existingPending.empty) {
            throw new functions.https.HttpsError('already-exists', 'عذراً، لديك طلب إيداع معلق مسبقاً بهذه الطريقة. يرجى الانتظار حتى تتم معالجته.');
        }

        const paymentsQuery = await db.collection('telecard_payments').where('name', '==', paymentMethodName).limit(1).get();
        if (paymentsQuery.empty) throw new functions.https.HttpsError('not-found', 'طريقة الدفع غير صالحة.');
        const paymentMethod = paymentsQuery.docs[0].data();

        const ratesSnap = await db.collection('telecard_rates').get();
        const rates = ratesSnap.docs.map(doc => doc.data());

        // 🌟 توليد معرّف الإيداع الزمني الخارق
        const cleanDepositId = generateUniqueId(); 
        const depositRef = db.collection('telecard_deposits').doc(cleanDepositId);
        const systemRef = db.collection('telecard_system').doc('singleton');
        const userRef = db.collection('telecard_users').doc(uid);

        await db.runTransaction(async (transaction) => {
            const userSnap = await transaction.get(userRef);

            if (!userSnap.exists) throw new Error("المستخدم غير موجود.");
            const baseCurr = (userSnap.data().baseCurrency || 'USD').toUpperCase();

            // 🧠 محرك الحساب السحابي الآمن لمنع التلاعب
            const payCurrUpper = (payCurr || 'USD').toUpperCase();
            let fee = parseFloat(paymentMethod.fee) || 0;
            let feeType = paymentMethod.feeType || 'fee';
            let feeUnit = paymentMethod.feeUnit || paymentMethod.unit || 'percent';

            if (paymentMethod.currencySettings && paymentMethod.currencySettings[payCurrUpper]) {
                const s = paymentMethod.currencySettings[payCurrUpper];
                fee = parseFloat(s.fee) || 0;
                feeType = s.feeType || 'fee';
                feeUnit = s.feeUnit || s.unit || 'percent';
            }

            let feeAmount = 0;
            if (feeUnit === 'fixed' || feeUnit === 'amount') {
                feeAmount = fee;
            } else {
                feeAmount = amount * (fee / 100);
            }

            let netPayCurr = amount;
            if (feeType === 'bonus') netPayCurr += feeAmount;
            else netPayCurr -= feeAmount;

            let safeNetBase = netPayCurr;
            if (payCurrUpper !== baseCurr) {
                 const fromRate = rates.find(c => c.code.toUpperCase() === payCurrUpper)?.depRate || 1;
                 const toRate = rates.find(c => c.code.toUpperCase() === baseCurr)?.depRate || 1;
                 safeNetBase = (netPayCurr / fromRate) * toRate;
            }
            
            safeNetBase = Math.floor(safeNetBase * 10000) / 10000; 
            if (isNaN(safeNetBase) || !isFinite(safeNetBase)) safeNetBase = 0;

            transaction.set(depositRef, {
                id: cleanDepositId, displayId: cleanDepositId,
                userId: uid, method: paymentMethodName,
                amount: Number(amount), currency: payCurr,
                creditedAmount: safeNetBase, // حفظ الحساب السحابي الموثوق
                status: 'pending',
                time: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                receipt: receiptData || null
            });

            transaction.set(systemRef, {
                'globalStats.deposits.total': admin.firestore.FieldValue.increment(1)
            }, { merge: true });
        });

        return { success: true, message: 'تم استلام طلب الإيداع وهو قيد المراجعة.' };
    } catch (error) {
        console.error("Deposit Error:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'تعذر إرسال طلب الإيداع.');
    }
});

// ==========================================
// 👑 3. [إدارة] دالة معالجة الإيداعات الآمنة
// ==========================================
exports.adminProcessDeposit = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك.');
    
    const { depositId, action, adminNote } = data;
    const validActions = ['approved', 'rejected', 'refunded'];
    
    if (!validActions.includes(action)) {
        throw new functions.https.HttpsError('invalid-argument', 'حالة الإيداع المطلوبة غير صالحة.');
    }
    
    try {
        return await db.runTransaction(async (transaction) => {
            const depRef = db.collection('telecard_deposits').doc(String(depositId));
            const depSnap = await transaction.get(depRef);
            const systemRef = db.collection('telecard_system').doc('singleton');
            
            if (!depSnap.exists) throw new functions.https.HttpsError('not-found', 'الإيداع غير موجود.');
            const depData = depSnap.data();
            
            if (depData.status === action) {
                throw new functions.https.HttpsError('failed-precondition', 'الإيداع يمتلك هذه الحالة بالفعل.');
            }
            if (action === 'refunded' && depData.status !== 'approved') {
                throw new functions.https.HttpsError('failed-precondition', 'لا يمكن استرجاع إيداع إلا إذا كان مقبولاً (مودعاً) مسبقاً.');
            }
            if ((action === 'approved' || action === 'rejected') && depData.status !== 'pending') {
                throw new functions.https.HttpsError('failed-precondition', 'تمت معالجة هذا الإيداع مسبقاً.');
            }
            
            let userRef = null;
            let userSnap = null;
            if (action === 'approved' || action === 'refunded') {
                userRef = db.collection('telecard_users').doc(String(depData.userId));
                userSnap = await transaction.get(userRef);
            }
            
            const statsUpdate = {};
            const amountToProcess = Number(depData.creditedAmount || depData.amount || 0);
            
            if (action === 'approved') {
                if (userSnap && userSnap.exists) {
                    const userData = userSnap.data();
                    transaction.update(userRef, {
                        walletBalance: safeAdd(userData.walletBalance || 0, amountToProcess),
                        balance: safeAdd(userData.balance || 0, amountToProcess),
                        totalDeposit: safeAdd(userData.totalDeposit || 0, amountToProcess)
                    });
                }
                statsUpdate['globalStats.deposits.approved'] = admin.firestore.FieldValue.increment(1);
            } else if (action === 'rejected') {
                statsUpdate['globalStats.deposits.rejected'] = admin.firestore.FieldValue.increment(1);
            } else if (action === 'refunded') {
                if (userSnap && userSnap.exists) {
                    const userData = userSnap.data();
                    const newWalletBal = Number((Number(userData.walletBalance || 0) - amountToProcess).toFixed(4));
                    const newBalance = Number((Number(userData.balance || 0) - amountToProcess).toFixed(4));
                    transaction.update(userRef, {
                        walletBalance: newWalletBal,
                        balance: newBalance,
                        totalDeposit: safeSub(userData.totalDeposit || 0, amountToProcess)
                    });
                }
                statsUpdate['globalStats.deposits.approved'] = admin.firestore.FieldValue.increment(-1);
                statsUpdate['globalStats.deposits.refunded'] = admin.firestore.FieldValue.increment(1);
            }
            
            transaction.update(depRef, {
                status: action,
                adminNote: adminNote || '',
                actionTime: admin.firestore.FieldValue.serverTimestamp()
            });
            
            if (Object.keys(statsUpdate).length > 0) {
                transaction.set(systemRef, statsUpdate, { merge: true });
            }
            
            return { success: true, message: `تم تحويل حالة الإيداع إلى ${action} بنجاح.` };
        });
    } catch (error) {
        console.error("Admin Deposit Error:", error);
        throw new functions.https.HttpsError('internal', error.message || 'فشلت عملية معالجة الإيداع.');
    }
});

// ==========================================
// 👑 4. [إدارة] دالة معالجة الطلبات الآمنة
// ==========================================
exports.adminProcessOrder = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك.');

    const { orderId, action, adminNote } = data;
    const validActions = ['completed', 'rejected', 'refunded', 'returned', 'processing'];
    if (!validActions.includes(action)) throw new functions.https.HttpsError('invalid-argument', 'حالة الطلب غير صالحة.');

    try {
        return await db.runTransaction(async (transaction) => {
            const orderRef = db.collection('telecard_orders').doc(String(orderId));
            const orderSnap = await transaction.get(orderRef);
            const systemRef = db.collection('telecard_system').doc('singleton');
            
            if (!orderSnap.exists) throw new functions.https.HttpsError('not-found', 'الطلب غير موجود.');
            const orderData = orderSnap.data();

            if (orderData.status === action) throw new functions.https.HttpsError('failed-precondition', 'الطلب يمتلك هذه الحالة بالفعل.');

            const isRefundingAction = ['rejected', 'refunded', 'returned'].includes(action);
            const wasAlreadyRefunded = ['rejected', 'refunded', 'returned'].includes(orderData.status);

            if (action === 'completed' && wasAlreadyRefunded) {
                throw new functions.https.HttpsError('failed-precondition', 'لا يمكن إكمال طلب تم رفضه أو استرجاع أمواله مسبقاً.');
            }

            let userRef = null;
            let userSnap = null;
            let couponRef = null;

            if (isRefundingAction && !wasAlreadyRefunded) {
                userRef = db.collection('telecard_users').doc(String(orderData.userId));
                userSnap = await transaction.get(userRef);

                if (orderData.couponCode) {
                    const couponQuery = await db.collection('telecard_coupons').where('code', '==', orderData.couponCode).limit(1).get();
                    if (!couponQuery.empty) couponRef = couponQuery.docs[0].ref;
                }
            }

            const statsUpdate = {};
            const exactPriceUsd = Number(orderData.price || 0);
            const costUsd = orderData.pricingSnapshot ? Number(orderData.pricingSnapshot.costUsd || 0) : 0;
            const profitUsd = orderData.pricingSnapshot ? Number(orderData.pricingSnapshot.netProfitUsd || 0) : 0;

            if (orderData.status === 'pending' || orderData.status === 'processing') {
                if (action === 'completed') {
                    statsUpdate['globalStats.orders.completed'] = admin.firestore.FieldValue.increment(1);
                    statsUpdate['globalStats.financials.totalRevenue'] = admin.firestore.FieldValue.increment(exactPriceUsd);
                    statsUpdate['globalStats.financials.totalCost'] = admin.firestore.FieldValue.increment(costUsd);
                    statsUpdate['globalStats.financials.totalProfit'] = admin.firestore.FieldValue.increment(profitUsd);
                } else if (action === 'rejected') {
                    statsUpdate['globalStats.orders.rejected'] = admin.firestore.FieldValue.increment(1);
                }
            } else if (orderData.status === 'completed' && ['refunded', 'returned'].includes(action)) {
                statsUpdate['globalStats.orders.refunded'] = admin.firestore.FieldValue.increment(1);
                statsUpdate['globalStats.financials.totalRevenue'] = admin.firestore.FieldValue.increment(-exactPriceUsd);
                statsUpdate['globalStats.financials.totalCost'] = admin.firestore.FieldValue.increment(-costUsd);
                statsUpdate['globalStats.financials.totalProfit'] = admin.firestore.FieldValue.increment(-profitUsd);
            }

            if (isRefundingAction && !wasAlreadyRefunded) {
                if (userSnap && userSnap.exists) {
                    const userData = userSnap.data();
                    transaction.update(userRef, {
                        walletBalance: safeAdd(userData.walletBalance || 0, exactPriceUsd),
                        balance: safeAdd(userData.balance || 0, exactPriceUsd),
                        totalSpent: safeSub(userData.totalSpent || 0, exactPriceUsd),
                        tierCycleSpent: safeSub(userData.tierCycleSpent || 0, exactPriceUsd)
                    });
                }
                if (couponRef) {
                    transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(-1) });
                }
            }

            transaction.update(orderRef, { status: action, adminNote: adminNote || '', actionTime: admin.firestore.FieldValue.serverTimestamp() });
            
            if (Object.keys(statsUpdate).length > 0) {
                transaction.set(systemRef, statsUpdate, { merge: true });
            }

            return { success: true, message: `تم تحديث حالة الطلب إلى ${action} بنجاح.` };
        });
    } catch (error) {
        console.error("Admin Order Error:", error);
        throw new functions.https.HttpsError('internal', error.message || 'فشلت عملية معالجة الطلب.');
    }
});

// ==========================================
// 💳 5. دالة الإدارة المالية (خصم/إضافة رصيد آمن) سحابياً
// ==========================================
exports.adminAdjustBalance = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) {
        throw new functions.https.HttpsError('permission-denied', 'عملية غير مصرح بها.');
    }

    const { userId, type, amount, adminName } = data;
    const adjustAmount = Number(amount);
    if (isNaN(adjustAmount) || adjustAmount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'المبلغ غير صالح.');
    }

    const userRef = db.collection('telecard_users').doc(String(userId));
    const systemRef = db.collection('telecard_system').doc('singleton');

    try {
        return await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new functions.https.HttpsError('not-found', 'العميل غير موجود.');

            const userData = userDoc.data();
            const currentBal = Number(userData.walletBalance || userData.balance || 0);

            if (type === 'subtract' && adjustAmount > currentBal) {
                throw new functions.https.HttpsError('failed-precondition', 'رصيد العميل غير كافٍ لإتمام الخصم.');
            }

            const cleanDepositId = generateUniqueId(); 
            const depositRef = db.collection('telecard_deposits').doc(cleanDepositId);

            const newBal = type === 'add' ? currentBal + adjustAmount : currentBal - adjustAmount;
            const currentTotalDep = Number(userData.totalDeposit || 0);
            const newTotalDep = type === 'add' ? currentTotalDep + adjustAmount : currentTotalDep;
            const currentTotalSpent = Number(userData.totalSpent || 0);
            const newTotalSpent = type === 'subtract' ? currentTotalSpent + adjustAmount : currentTotalSpent;

            const currency = (userData.baseCurrency || 'USD').toUpperCase();

            transaction.update(userRef, {
                walletBalance: newBal,
                balance: newBal,
                wallet_balance: newBal,
                totalDeposit: newTotalDep,
                totalSpent: newTotalSpent
            });

            transaction.set(depositRef, {
                id: cleanDepositId,
                displayId: cleanDepositId,
                userId: String(userId),
                userName: userData.name || userData.fullName || '---',
                amount: adjustAmount,
                currency: currency,
                creditedAmount: type === 'add' ? adjustAmount : -adjustAmount,
                targetCurrency: currency,
                method: type === 'add' ? 'إيداع من الإدارة' : 'خصم من الإدارة',
                status: 'approved',
                time: admin.firestore.FieldValue.serverTimestamp(),
                admin: adminName || 'النظام المركزي'
            });

            const statsUpdate = { 'globalStats.deposits.total': admin.firestore.FieldValue.increment(1) };
            if (type === 'add') {
                statsUpdate['globalStats.deposits.approved'] = admin.firestore.FieldValue.increment(1);
            }
            transaction.set(systemRef, statsUpdate, { merge: true });

            return { 
                success: true, 
                newBalance: newBal, 
                newDeposit: { id: cleanDepositId, amount: adjustAmount, creditedAmount: type === 'add' ? adjustAmount : -adjustAmount } 
            };
        });
    } catch (error) {
        console.error("Transaction Error:", error);
        throw new functions.https.HttpsError('internal', error.message || 'فشلت العملية المالية.');
    }
});

// ==========================================
// 📊 دالة الصيانة الشاملة للإحصائيات 
// ==========================================
exports.calculateStoreStatsCloud = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) {
        throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك بإعادة حساب إحصائيات المتجر.');
    }

    try {
        const [ordersSnap, depositsSnap] = await Promise.all([
            db.collection('telecard_orders').get(),
            db.collection('telecard_deposits').get()
        ]);

        const globalStats = {
            financials: { totalRevenue: 0, totalProfit: 0, totalCost: 0 },
            orders: { total: 0, completed: 0, rejected: 0, refunded: 0 },
            deposits: { total: 0, approved: 0, rejected: 0, refunded: 0 },
            daily: {} 
        };

        ordersSnap.forEach(doc => {
            const o = doc.data();
            globalStats.orders.total++;
            if (o.status === 'completed') {
                globalStats.orders.completed++;
                const exactPriceUsd = Number(o.price || 0);
                const costUsd = o.pricingSnapshot ? Number(o.pricingSnapshot.costUsd || 0) : 0;
                const profitUsd = o.pricingSnapshot ? Number(o.pricingSnapshot.netProfitUsd || 0) : 0;

                globalStats.financials.totalRevenue = safeAdd(globalStats.financials.totalRevenue, exactPriceUsd);
                globalStats.financials.totalCost = safeAdd(globalStats.financials.totalCost, costUsd);
                globalStats.financials.totalProfit = safeAdd(globalStats.financials.totalProfit, profitUsd);
            } else if (o.status === 'rejected') {
                globalStats.orders.rejected++;
            } else if (o.status === 'refunded' || o.status === 'returned') {
                globalStats.orders.refunded++;
            }
        });

        depositsSnap.forEach(doc => {
            const d = doc.data();
            globalStats.deposits.total++;
            if (d.status === 'approved') globalStats.deposits.approved++;
            else if (d.status === 'rejected') globalStats.deposits.rejected++;
            else if (d.status === 'refunded') globalStats.deposits.refunded++;
        });

        await db.collection('telecard_system').doc('singleton').set({ globalStats: globalStats }, { merge: true });
        return { success: true, message: 'تم إعادة بناء وضبط الإحصائيات المركزية بنجاح.' };

    } catch (error) {
        console.error("Stats Calculation Error:", error);
        throw new functions.https.HttpsError('internal', 'فشل السيرفر في حساب الإحصائيات.');
    }
});

// ==========================================
// ⏱️ دالة جلب توقيت السيرفر المركزي 
// ==========================================
exports.getServerTime = functions.region('us-east1').https.onCall((data, context) => {
    return { success: true, serverTime: Date.now() };
});
// ==========================================
// 🛡️ 6. دالة المزامنة الآمنة للمنتجات (Data Sanitizer - Public Splitter)
// ==========================================
// تعمل تلقائياً (Trigger) في الخلفية عندما يضيف أو يعدل الإدمن أي منتج
exports.secureProductSync = functions.region('us-east1').firestore
    .document('telecard_prods/{productId}')
    .onWrite(async (change, context) => {
        const productId = context.params.productId;
        const publicProdRef = db.collection('telecard_prods_public').doc(productId);
        
        // إذا قام الإدمن بحذف المنتج، نحذفه من الواجهة العامة للعملاء أيضاً
        if (!change.after.exists) {
            return publicProdRef.delete();
        }
        
        const prodData = change.after.data();
        const costPrice = Number(prodData.costPrice || prodData.cost_price || 0);
        
        // 1. جلب المستويات لحساب الأسعار مسبقاً
        const tiersSnap = await db.collection('telecard_tiers').get();
        const tierPrices = {};
        
        // 2. حساب السعر المخصص لكل مستوى (بدون عروض أو كوبونات، السعر الأساسي فقط)
        tiersSnap.forEach(doc => {
            const tier = doc.data();
            const profitPercent = Number(tier.profitPercent || tier.profit_percent || 0);
            const minProfitUsd = Number(tier.minProfitUsd || tier.min_profit_usd || 0);
            
            let profitAdded = costPrice * (profitPercent / 100);
            if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
            
            tierPrices[tier.id] = Number((costPrice + profitAdded).toFixed(4));
        });
        
        // 3. إنشاء النسخة النظيفة (حذف التكلفة وأي بيانات سرية للموردين)
        const publicData = { ...prodData };
        delete publicData.costPrice;
        delete publicData.cost_price;
        delete publicData.providerId; // أسرار الموردين
        delete publicData.apiToken; // أسرار الموردين
        
        // إضافة الأسعار المحسوبة مسبقاً للنسخة العامة
        publicData.tierPrices = tierPrices;
        
        // 4. حفظ النسخة الآمنة في المجموعة العامة ليقرأها المتجر
        return publicProdRef.set(publicData, { merge: true });
    });
// ==========================================
// 🔗 ربط وتصدير دوال المطورين والموردين
// ==========================================
const developerApi = require('./developerApi.js');
const supplierEngine = require('./supplierEngine.js');

exports.orderStatusWebhook = developerApi.orderStatusWebhook;
exports.externalCreateOrder = developerApi.externalCreateOrder;
exports.syncSupplierData = supplierEngine.syncSupplierData;
exports.scheduledSupplierSync = supplierEngine.scheduledSupplierSync;
exports.secureSaveSupplier = supplierEngine.secureSaveSupplier;
