// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (functions/index.js) - النسخة المدرعة للإنتاج V6
// 🎯 الوظيفة: معالجة الطلبات والإيداعات الآمنة سحابياً بنظام الحوسبة المتوازية
// 🌟 التحديث الأقصى: معالجة الـ Hotspotting للإحصائيات، الحسابات المالية الدقيقة (Integer Math)، وإدارة الإشعارات
// ============================================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { defineSecret } = require('firebase-functions/params');
const { FinancialEngine } = require('./financialEngine.js'); 

// تعريف متغير سري لمالك النظام (يتم تعيينه عبر Firebase CLI)
const ROOT_OWNER_UID = defineSecret('ROOT_OWNER_UID');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// ==========================================
// 🛡️ دوال مساعدة (Helper Functions)
// ==========================================

const isMasterAdmin = (context) => {
    if (!context.auth || !context.auth.token) return false;
    return context.auth.token.admin === true;
};

// 🌟 الحساب الآمن للأموال: ضرب في 10000 لتحويلها لعدد صحيح لتفادي أخطاء جافاسكريبت العشرية
const safeAdd = (a, b) => Math.round(Number(a) * 10000 + Number(b) * 10000) / 10000;
const safeSub = (a, b) => Math.max(0, Math.round(Number(a) * 10000 - Number(b) * 10000) / 10000);

const generateUniqueId = () => {
    const timeBase36 = Date.now().toString(36).toUpperCase();
    const randomSuffix = Math.floor(10 + Math.random() * 90);
    return `${timeBase36}-${randomSuffix}`; 
};

// ==========================================
// 🛒 1. دالة إنشاء الطلبات الآمنة للعملاء
// ==========================================
exports.createOrder = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

    const uid = context.auth.uid;
    const { productId, qty, optIdx, finalInputStr, couponCode } = data;
    const finalQty = Math.max(1, Math.floor(Number(qty) || 1));

    try {
        const cleanOrderId = generateUniqueId();
        const userRef = db.collection('telecard_users').doc(uid);
        const productRef = db.collection('telecard_prods').doc(String(productId));
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
            const [userSnap, productSnap, couponSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(productRef),
                couponRef ? transaction.get(couponRef) : Promise.resolve(null)
            ]);

            if (!userSnap.exists) throw new functions.https.HttpsError('not-found', 'المستخدم غير موجود.');
            if (!productSnap.exists) throw new functions.https.HttpsError('not-found', 'المنتج غير متوفر.');

            const userData = userSnap.data();
            const product = productSnap.data();
            const couponData = (couponSnap && couponSnap.exists) ? couponSnap.data() : null;
            const serverNow = Date.now(); 

            const lastOrderTime = userData.lastOrderTime || 0;
            if (serverNow - lastOrderTime < 10000) { 
                throw new functions.https.HttpsError('already-exists', 'لقد قمت بطلب للتو! يرجى الانتظار بضع ثوانٍ لمنع الشراء المزدوج.');
            }

            const tierId = String(userData.tierId || userData.tier || 1);
            const tierRef = db.collection('telecard_tiers').doc(tierId);
            const vaultRef = product.vaultPoolId ? db.collection('telecard_vault').doc(String(product.vaultPoolId)) : null;

            const [tierSnap, vaultSnap] = await Promise.all([
                transaction.get(tierRef),
                vaultRef ? transaction.get(vaultRef) : Promise.resolve(null)
            ]);

            const userTier = tierSnap.exists ? tierSnap.data() : null;

            if (activeOffer && activeOffer.expiryDate && activeOffer.expiryDate < serverNow) activeOffer = null; 
            if (couponData && couponData.expiryDate && couponData.expiryDate < serverNow) {
                throw new functions.https.HttpsError('failed-precondition', 'عذراً، انتهت صلاحية هذا الكوبون.');
            }

            // 🛡️ الفحص الصارم للكوبون داخل الـ Transaction حصرياً
            if (couponData) {
                if (couponData.maxUses > 0 && (couponData.usedCount || 0) >= couponData.maxUses) {
                    throw new functions.https.HttpsError('resource-exhausted', 'نفدت كمية استخدام هذا الكوبون.');
                }
            }

            let rawUnitCost = Number(product.costPrice || product.unitCost || product.price || 0);
            if (product.type === 'select' && Array.isArray(product.options) && product.options[optIdx]) {
                rawUnitCost = Number(product.options[optIdx].price || product.options[optIdx].costPrice || 0);
            }
            
            const isFixed = (product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);
            const fixedUsd = isFixed ? Number(product.fixedPriceUsd || product.fixed_price_usd || 0) : 0;

            const pricingSnapshot = FinancialEngine.calculatePrice({
                costPrice: rawUnitCost, 
                fixedPrice: fixedUsd, 
                tier: userTier,
                offer: activeOffer,
                coupon: couponData
            });

            const totalRequired = safeAdd(0, pricingSnapshot.finalPrice * finalQty);
            const currentBalance = Number(userData.walletBalance || 0);

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
                couponDiscount: safeAdd(0, pricingSnapshot.couponDiscount * finalQty),
                saleDiscount: safeAdd(0, pricingSnapshot.offerDiscount * finalQty),
                balanceAfter: newBalance,
                pricingSnapshot: {
                    costUsd: safeAdd(0, pricingSnapshot.cost * finalQty),
                    tierPriceUsd: safeAdd(0, pricingSnapshot.tierPrice * finalQty),
                    originalPriceUsd: safeAdd(0, pricingSnapshot.originalPrice * finalQty),
                    finalPriceUsd: totalRequired, tierName: pricingSnapshot.tierName,
                    offerName: pricingSnapshot.offerName, offerDiscount: safeAdd(0, pricingSnapshot.offerDiscount * finalQty),
                    couponCode: pricingSnapshot.couponCode, couponDiscount: safeAdd(0, pricingSnapshot.couponDiscount * finalQty),
                    totalDiscountVal: safeAdd(0, pricingSnapshot.totalDiscountVal * finalQty),
                    netProfitUsd: safeAdd(0, pricingSnapshot.profit * finalQty), marginPct: pricingSnapshot.marginPct,
                    isFirewallActive: pricingSnapshot.isFirewallActive
                },
                time: admin.firestore.FieldValue.serverTimestamp()
            };

            if (pricingSnapshot.couponCode && couponRef && couponData) {
                transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });
            }
            if (vaultSnap && vaultSnap.exists && isAutoDelivered) {
                transaction.update(vaultRef, { codes: remainingCodes });
            }

            const userUpdateObj = { 
                walletBalance: newBalance, 
                balance: newBalance, 
                totalSpent: newTotalSpent, 
                tierCycleSpent: newCycleSpent,
                lastOrderTime: serverNow 
            };

            if (isAutoDelivered) {
                const instantNotification = {
                    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
                    title: "🎉 تم تسليم طلبك بنجاح!",
                    message: `تم إكمال طلبك لشراء ( ${product.name} ) بنجاح. تفضل باستلام الكود الآن.`,
                    type: 'notification', jumpTarget: 'order', createdAt: Date.now()
                };
                let currentInbox = userData.inbox || [];
                currentInbox.push(instantNotification);
                if (currentInbox.length > 50) currentInbox = currentInbox.slice(-50); // الحماية من التضخم
                userUpdateObj.inbox = currentInbox;
            }

            transaction.update(userRef, userUpdateObj);
            transaction.set(orderRef, newOrder);
        });

        return { success: true, message: resultMessage, isAutoDelivered: isAutoDelivered, deliveredCode: deliveredCodeText };
        
    } catch (error) {
        console.error("Order Error:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'حدث خطأ غير متوقع في السيرفر.');
    }
});

// ==========================================
// 💰 2. دالة إرسال طلب الإيداع للعملاء
// ==========================================
exports.submitBalanceRequest = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

    const uid = context.auth.uid;
    const { amount, paymentMethodName, payCurr, receiptData } = data; 

    if (amount <= 0) throw new functions.https.HttpsError('invalid-argument', 'المبلغ المدخل غير صالح.');

    try {
        const [existingPendingSnap, paymentsSnap, ratesSnap] = await Promise.all([
            db.collection('telecard_deposits').where('userId', '==', uid).where('method', '==', paymentMethodName).where('status', '==', 'pending').limit(1).get(),
            db.collection('telecard_payments').where('name', '==', paymentMethodName).limit(1).get(),
            db.collection('telecard_rates').get()
        ]);

        if (!existingPendingSnap.empty) throw new functions.https.HttpsError('already-exists', 'لديك طلب إيداع معلق مسبقاً.');
        if (paymentsSnap.empty) throw new functions.https.HttpsError('not-found', 'طريقة الدفع غير صالحة.');
        
        const paymentMethod = paymentsSnap.docs[0].data();
        const rates = ratesSnap.docs.map(doc => doc.data());
        const cleanDepositId = generateUniqueId(); 
        const depositRef = db.collection('telecard_deposits').doc(cleanDepositId);
        const userRef = db.collection('telecard_users').doc(uid);

        await db.runTransaction(async (transaction) => {
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists) throw new Error("المستخدم غير موجود.");
            
            const baseCurr = (userSnap.data().baseCurrency || 'USD').toUpperCase();
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

            let feeAmount = feeUnit === 'fixed' || feeUnit === 'amount' ? fee : amount * (fee / 100);
            let netPayCurr = feeType === 'bonus' ? amount + feeAmount : amount - feeAmount;

            let safeNetBase = netPayCurr;
            if (payCurrUpper !== baseCurr) {
                 const fromRate = rates.find(c => c.code.toUpperCase() === payCurrUpper)?.depRate || 1;
                 const toRate = rates.find(c => c.code.toUpperCase() === baseCurr)?.depRate || 1;
                 safeNetBase = (netPayCurr / fromRate) * toRate;
            }
            
            safeNetBase = Math.floor(safeNetBase * 10000) / 10000; 

            transaction.set(depositRef, {
                id: cleanDepositId, displayId: cleanDepositId,
                userId: uid, method: paymentMethodName,
                amount: Number(amount), currency: payCurr,
                creditedAmount: safeNetBase, status: 'pending',
                time: admin.firestore.FieldValue.serverTimestamp(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                receipt: receiptData || null
            });
        });

        return { success: true, message: 'تم استلام طلب الإيداع وهو قيد المراجعة.' };
    } catch (error) {
        console.error("Deposit Error:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'تعذر إرسال طلب الإيداع.');
    }
});

// ==========================================
// 👑 3. [إدارة] معالجة الإيداعات الآمنة
// ==========================================
exports.adminProcessDeposit = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك.');
    
    const { depositId, action, adminNote } = data;
    const validActions = ['approved', 'rejected', 'refunded'];
    if (!validActions.includes(action)) throw new functions.https.HttpsError('invalid-argument', 'إجراء غير صالح.');
    
    try {
        return await db.runTransaction(async (transaction) => {
            const depRef = db.collection('telecard_deposits').doc(String(depositId));
            const depSnap = await transaction.get(depRef);
            if (!depSnap.exists) throw new functions.https.HttpsError('not-found', 'الإيداع غير موجود.');
            
            const depData = depSnap.data();
            if (depData.status === action) throw new functions.https.HttpsError('failed-precondition', 'هذه هي الحالة الحالية.');
            if (action === 'refunded' && depData.status !== 'approved') throw new functions.https.HttpsError('failed-precondition', 'يجب أن يكون مقبولاً أولاً.');
            if ((action === 'approved' || action === 'rejected') && depData.status !== 'pending') throw new functions.https.HttpsError('failed-precondition', 'تمت المعالجة مسبقاً.');
            
            let userRef = null, userSnap = null;
            if (action === 'approved' || action === 'refunded') {
                userRef = db.collection('telecard_users').doc(String(depData.userId));
                userSnap = await transaction.get(userRef);
            }
            
            const amountToProcess = Number(depData.creditedAmount || depData.amount || 0);
            let newWalletBal = 0; 
            
            if (action === 'approved' && userSnap && userSnap.exists) {
                const userData = userSnap.data();
                newWalletBal = safeAdd(userData.walletBalance || 0, amountToProcess);
                transaction.update(userRef, {
                    walletBalance: newWalletBal, balance: newWalletBal,
                    totalDeposit: safeAdd(userData.totalDeposit || 0, amountToProcess)
                });
            } else if (action === 'refunded' && userSnap && userSnap.exists) {
                const userData = userSnap.data();
                newWalletBal = safeSub(userData.walletBalance || 0, amountToProcess);
                transaction.update(userRef, {
                    walletBalance: newWalletBal, balance: newWalletBal,
                    totalDeposit: safeSub(userData.totalDeposit || 0, amountToProcess)
                });
            }
            
            let depUpdateObj = { status: action, adminNote: adminNote || '', actionTime: admin.firestore.FieldValue.serverTimestamp() };
            if (action === 'approved' || action === 'refunded') depUpdateObj.balanceAfter = newWalletBal;
            
            transaction.update(depRef, depUpdateObj);
            // ملاحظة: الإحصائيات لم تعد تُحدث هنا لرفع الأداء، المحرك المجدول سيتكفل بها.
            return { success: true, message: `تم تحويل الحالة إلى ${action}.` };
        });
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message || 'فشلت معالجة الإيداع.');
    }
});

// ==========================================
// 👑 4. [إدارة] معالجة الطلبات الآمنة
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
            
            if (!orderSnap.exists) throw new functions.https.HttpsError('not-found', 'الطلب غير موجود.');
            const orderData = orderSnap.data();

            if (orderData.status === action) throw new functions.https.HttpsError('failed-precondition', 'الحالة مطابقة.');

            const isRefundingAction = ['rejected', 'refunded', 'returned'].includes(action);
            const wasAlreadyRefunded = ['rejected', 'refunded', 'returned'].includes(orderData.status);

            if (action === 'completed' && wasAlreadyRefunded) {
                throw new functions.https.HttpsError('failed-precondition', 'لا يمكن إكمال طلب مسترجع.');
            }

            let userRef = null, userSnap = null, couponRef = null;

            if (isRefundingAction && !wasAlreadyRefunded) {
                userRef = db.collection('telecard_users').doc(String(orderData.userId));
                userSnap = await transaction.get(userRef);

                if (orderData.couponCode) {
                    const couponQuery = await db.collection('telecard_coupons').where('code', '==', orderData.couponCode).limit(1).get();
                    if (!couponQuery.empty) couponRef = couponQuery.docs[0].ref;
                }
            }

            const exactPriceUsd = Number(orderData.price || 0);
            let newWalletBal = 0; 

            if (isRefundingAction && !wasAlreadyRefunded) {
                if (userSnap && userSnap.exists) {
                    const userData = userSnap.data();
                    newWalletBal = safeAdd(userData.walletBalance || 0, exactPriceUsd);
                    transaction.update(userRef, {
                        walletBalance: newWalletBal, balance: newWalletBal,
                        totalSpent: safeSub(userData.totalSpent || 0, exactPriceUsd),
                        tierCycleSpent: safeSub(userData.tierCycleSpent || 0, exactPriceUsd)
                    });
                }
                if (couponRef) {
                    transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(-1) });
                }
            }

            let orderUpdateObj = { status: action, adminNote: adminNote || '', actionTime: admin.firestore.FieldValue.serverTimestamp() };
            if (isRefundingAction && !wasAlreadyRefunded) orderUpdateObj.balanceAfter = newWalletBal;
            
            transaction.update(orderRef, orderUpdateObj);
            // الإحصائيات تُركت للمحرك المجدول لتفادي الاختناقات.
            
            return { success: true, message: `تم تحديث الطلب إلى ${action}.` };
        });
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message || 'فشلت معالجة الطلب.');
    }
});

// ==========================================
// 💳 5. الإدارة المالية (خصم/إضافة) 
// ==========================================
exports.adminAdjustBalance = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'عملية غير مصرح بها.');

    const { userId, type, amount, adminName } = data;
    const adjustAmount = Number(amount);
    if (isNaN(adjustAmount) || adjustAmount <= 0) throw new functions.https.HttpsError('invalid-argument', 'مبلغ غير صالح.');

    const userRef = db.collection('telecard_users').doc(String(userId));

    try {
        return await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new functions.https.HttpsError('not-found', 'العميل غير موجود.');

            const userData = userDoc.data();
            const currentBal = Number(userData.walletBalance || userData.balance || 0);

            if (type === 'subtract' && adjustAmount > currentBal) {
                throw new functions.https.HttpsError('failed-precondition', 'الرصيد غير كافٍ.');
            }

            const cleanDepositId = generateUniqueId(); 
            const depositRef = db.collection('telecard_deposits').doc(cleanDepositId);

            const newBal = type === 'add' ? safeAdd(currentBal, adjustAmount) : safeSub(currentBal, adjustAmount);
            const newTotalDep = type === 'add' ? safeAdd(userData.totalDeposit || 0, adjustAmount) : Number(userData.totalDeposit || 0);
            const newTotalSpent = type === 'subtract' ? safeAdd(userData.totalSpent || 0, adjustAmount) : Number(userData.totalSpent || 0);

            const currency = (userData.baseCurrency || 'USD').toUpperCase();

            transaction.update(userRef, {
                walletBalance: newBal, balance: newBal, wallet_balance: newBal,
                totalDeposit: newTotalDep, totalSpent: newTotalSpent
            });

            transaction.set(depositRef, {
                id: cleanDepositId, displayId: cleanDepositId,
                userId: String(userId), userName: userData.name || userData.fullName || '---',
                amount: adjustAmount, currency: currency,
                creditedAmount: type === 'add' ? adjustAmount : -adjustAmount,
                method: type === 'add' ? 'إيداع إداري' : 'خصم إداري',
                status: 'approved', balanceAfter: newBal, 
                time: admin.firestore.FieldValue.serverTimestamp(), admin: adminName || 'النظام'
            });

            return { success: true, newBalance: newBal };
        });
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message || 'فشلت العملية المالية.');
    }
});

// ==========================================
// 📊 المحرك المركزي لحساب الإحصائيات الشاملة 
// ==========================================
const performStatsRecalculation = async () => {
    // 🚀 استخدام تقنية التجميع السحابية (تستهلك 0% من الذاكرة وتكلف قراءة واحدة فقط)
    const AggregateField = admin.firestore.AggregateField;
    
    const ordersRef = db.collection('telecard_orders');
    const depositsRef = db.collection('telecard_deposits');
    
    // تنفيذ جميع العمليات الحسابية بشكل متوازي (صاروخي) داخل محرك قاعدة البيانات
    const [
        ordersTotal, ordersCompleted, ordersRejected, ordersRefunded,
        financials,
        depTotal, depApproved, depRejected, depRefunded
    ] = await Promise.all([
        ordersRef.count().get(),
        ordersRef.where('status', '==', 'completed').count().get(),
        ordersRef.where('status', '==', 'rejected').count().get(),
        ordersRef.where('status', '==', 'refunded').count().get(),
        
        // 💰 جمع الأموال مباشرة داخل قاعدة البيانات بدون جلبها للسيرفر
        ordersRef.where('status', '==', 'completed').aggregate({
            revenue: AggregateField.sum('price'),
            cost: AggregateField.sum('pricingSnapshot.costUsd'),
            profit: AggregateField.sum('pricingSnapshot.netProfitUsd')
        }).get(),
        
        depositsRef.count().get(),
        depositsRef.where('status', '==', 'approved').count().get(),
        depositsRef.where('status', '==', 'rejected').count().get(),
        depositsRef.where('status', '==', 'refunded').count().get()
    ]);
    
    const globalStats = {
        financials: {
            totalRevenue: Number((financials.data().revenue || 0).toFixed(4)),
            totalCost: Number((financials.data().cost || 0).toFixed(4)),
            totalProfit: Number((financials.data().profit || 0).toFixed(4))
        },
        orders: {
            total: ordersTotal.data().count,
            completed: ordersCompleted.data().count,
            rejected: ordersRejected.data().count,
            refunded: ordersRefunded.data().count
        },
        deposits: {
            total: depTotal.data().count,
            approved: depApproved.data().count,
            rejected: depRejected.data().count,
            refunded: depRefunded.data().count
        },
        daily: {}
    };
    
    await db.collection('telecard_system').doc('singleton').set({ globalStats: globalStats }, { merge: true });
};
// ⏳ المحرك الآلي (Cron Job) - يحل مشكلة الـ Hotspotting تماماً
exports.scheduledStatsAggregation = functions.region('us-east1').pubsub.schedule('every 1 hours').onRun(async (context) => {
    try {
        await performStatsRecalculation();
        console.log("Stats aggregated successfully via Cron.");
    } catch (error) {
        console.error("Scheduled Stats Error:", error);
    }
});

exports.getServerTime = functions.region('us-east1').https.onCall((data, context) => {
    return { success: true, serverTime: Date.now() };
});
// ⏱️ دالة الاستدعاء اليدوي من الإدارة (تمت استعادتها وتحديثها)
exports.calculateStoreStatsCloud = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح.');
    try {
        await performStatsRecalculation();
        return { success: true, message: 'تم إعادة بناء الإحصائيات المركزية بنجاح.' };
    } catch (error) {
        // طباعة الخطأ الحقيقي في سيرفرات جوجل وإرساله للواجهة
        console.error("🔥 CRITICAL STATS ERROR:", error);
        throw new functions.https.HttpsError('internal', `فشل السيرفر: ${error.message}`);
    }
});
// ==========================================
// 🛡️ 6. المزامنة الآمنة للمنتجات (Data Sanitizer)
// ==========================================
exports.secureProductSync = functions.region('us-east1').firestore
    .document('telecard_prods/{productId}')
    .onWrite(async (change, context) => {
        const productId = context.params.productId;
        const publicProdRef = db.collection('telecard_prods_public').doc(productId);
        
        if (!change.after.exists) return publicProdRef.delete();
        
        const prodData = change.after.data();
        const costPrice = Number(prodData.costPrice || prodData.cost_price || 0);
        
        const tiersSnap = await db.collection('telecard_tiers').get();
        const tierPrices = {};
        
        tiersSnap.forEach(doc => {
            const tier = doc.data();
            const profitPercent = Number(tier.profitPercent || tier.profit_percent || 0);
            const minProfitUsd = Number(tier.minProfitUsd || tier.min_profit_usd || 0);
            
            let profitAdded = costPrice * (profitPercent / 100);
            if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
            
            tierPrices[tier.id] = safeAdd(costPrice, profitAdded);
        });
        
        const publicData = { ...prodData };
        delete publicData.costPrice; delete publicData.cost_price;
        delete publicData.providerId; delete publicData.apiToken; 
        
        publicData.tierPrices = tierPrices;
        return publicProdRef.set(publicData, { merge: true });
    });

// 🔐 حماية فائقة لمنح رتب الأدمن تعتمد على Secret Manager بدلاً من النصوص الصريحة
exports.grantAdminRole = functions.region('us-east1')
    .runWith({ secrets: [ROOT_OWNER_UID] })
    .https.onCall(async (data, context) => {
        // نستخدم قيمة المتغير السري من بيئة جوجل السحابية
        if (!context.auth || context.auth.uid !== ROOT_OWNER_UID.value()) {
            throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك.');
        }
        
        const targetEmail = data.email;
        if (!targetEmail) throw new functions.https.HttpsError('invalid-argument', 'الرجاء إدخال البريد الإلكتروني.');
        
        try {
            const user = await admin.auth().getUserByEmail(targetEmail);
            await admin.auth().setCustomUserClaims(user.uid, { admin: true });
            return { success: true, message: `تم منح رتبة الأدمن للحساب: ${targetEmail}` };
        } catch (error) {
            throw new functions.https.HttpsError('internal', `فشل المنح: ${error.message}`);
        }
});

// ==========================================
// 📊 معالجات الإشعارات الآلية (بميزة حماية حجم المستند)
// ==========================================

exports.autoNotifyOrderStatus = functions.region('us-east1').firestore
    .document('telecard_orders/{orderId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        if (before.status === after.status) return null;

        const userRef = db.collection('telecard_users').doc(String(after.userId));
        const userSnap = await userRef.get();
        if(!userSnap.exists) return null;

        let title = "تحديث حالة الطلب", message = `تم تغيير حالة طلبك رقم ${after.displayId || after.id} إلى ${after.status}`;

        if (after.status === 'completed') {
            title = "🎉 تم تسليم طلبك بنجاح!"; message = `تم إكمال طلبك لشراء ( ${after.product} ) بنجاح.`;
        } else if (after.status === 'rejected') {
            title = "❌ تم رفض طلب الشراء"; message = `عذراً، تعذر إكمال طلبك لشراء ( ${after.product} ). السبب: ${after.adminNote || 'راجع الدعم'}`;
        } else if (after.status === 'refunded') {
            title = "↩️ تم استرجاع الطلب"; message = `تم استرجاع قيمة طلبك لشراء ( ${after.product} ) للمحفظة.`;
        }

        const newNotif = { id: 'notif_' + Date.now(), title, message, type: 'notification', jumpTarget: 'order', createdAt: Date.now() };
        
        let currentInbox = userSnap.data().inbox || [];
        currentInbox.push(newNotif);
        if(currentInbox.length > 50) currentInbox = currentInbox.slice(-50);

        return userRef.update({ inbox: currentInbox });
    });

exports.autoNotifyDepositStatus = functions.region('us-east1').firestore
    .document('telecard_deposits/{depositId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        if (before.status === after.status) return null;

        const userRef = db.collection('telecard_users').doc(String(after.userId));
        const userSnap = await userRef.get();
        if(!userSnap.exists) return null;
        
        let title = "تحديث طلب الإيداع", message = `تم تغيير حالة طلب الإيداع إلى ${after.status}`;

        if (after.status === 'approved') {
            title = "💰 تم قبول الإيداع!"; message = `تم شحن ${after.amount} ${after.currency || 'USD'} بمحفظتك!`;
        } else if (after.status === 'rejected') {
            title = "❌ تم رفض الإيداع"; message = `عذراً، تم رفض طلبك. السبب: ${after.adminNote || 'راجع الدعم'}`;
        } else if (after.status === 'refunded') {
            title = "↩️ تم استرجاع الإيداع"; message = `تم سحب إيداع بقيمة ${after.amount} ${after.currency || 'USD'}.`;
        }

        const newNotif = { id: 'notif_' + Date.now(), title, message, type: 'notification', jumpTarget: 'wallet', createdAt: Date.now() };
        
        let currentInbox = userSnap.data().inbox || [];
        currentInbox.push(newNotif);
        if(currentInbox.length > 50) currentInbox = currentInbox.slice(-50);

        return userRef.update({ inbox: currentInbox });
    });

// ==========================================
// 🔗 تصدير الدوال والدقيق المالي
// ==========================================
const developerApi = require('./developerApi.js');
const supplierEngine = require('./supplierEngine.js');

exports.orderStatusWebhook = developerApi.orderStatusWebhook;
exports.externalCreateOrder = developerApi.externalCreateOrder;
exports.syncSupplierData = supplierEngine.syncSupplierData;
exports.scheduledSupplierSync = supplierEngine.scheduledSupplierSync;
exports.secureSaveSupplier = supplierEngine.secureSaveSupplier;

exports.adminAuditUserWallet = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك.');

    const targetUserId = String(data.userId);
    if (!targetUserId) throw new functions.https.HttpsError('invalid-argument', 'يرجى تمرير ID العميل.');

    try {
        const userRef = db.collection('telecard_users').doc(targetUserId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) throw new functions.https.HttpsError('not-found', 'العميل غير موجود.');

        let realTotalSpent = 0, realTotalDeposit = 0;

        const ordersSnap = await db.collection('telecard_orders').where('userId', '==', targetUserId).where('status', '==', 'completed').get();
        ordersSnap.forEach(doc => realTotalSpent = safeAdd(realTotalSpent, doc.data().price || 0));

        const depositsSnap = await db.collection('telecard_deposits').where('userId', '==', targetUserId).where('status', '==', 'approved').get();
        depositsSnap.forEach(doc => {
            const amount = Number(doc.data().creditedAmount || doc.data().amount || 0);
            if (amount > 0) realTotalDeposit = safeAdd(realTotalDeposit, amount); 
            else realTotalSpent = safeAdd(realTotalSpent, Math.abs(amount)); 
        });

        const expectedBalance = Math.max(0, safeSub(realTotalDeposit, realTotalSpent));

        await userRef.update({
            totalSpent: realTotalSpent, totalDeposit: realTotalDeposit,
            walletBalance: expectedBalance, balance: expectedBalance
        });

        return { success: true, message: 'تم التصحيح بنجاح!', data: { spent: realTotalSpent, deposit: realTotalDeposit, balance: expectedBalance } };
    } catch (error) {
        throw new functions.https.HttpsError('internal', `فشل التدقيق: ${error.message}`);
    }
});
