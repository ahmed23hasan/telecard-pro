// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (functions/index.js) - النسخة المدرعة للإنتاج V8.1 (Bank-Grade)
// 🎯 الوظيفة: معالجة الطلبات، الإيداعات، الإحصائيات، والإشعارات بنظام الحوسبة المتوازية
// 🌟 التحديث الأقصى: Custom Claims Security, Token Revocation, Subcollections & Caching
// ============================================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { defineSecret } = require('firebase-functions/params');
const { FinancialEngine } = require('./financialEngine.js'); 

const ROOT_OWNER_UID = defineSecret('ROOT_OWNER_UID');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// ==========================================
// 🚀 1. نظام التخزين المؤقت في الذاكرة (In-Memory Cache)
// ==========================================
let memoryCache = {
    rates: [],
    payments: [],
    offers: [],
    lastFetch: 0
};
const CACHE_LIFETIME = 5 * 60 * 1000; // 5 دقائق

const loadGlobalCache = async () => {
    const now = Date.now();
    if (memoryCache.lastFetch > 0 && (now - memoryCache.lastFetch < CACHE_LIFETIME)) {
        return memoryCache; 
    }

    const [ratesSnap, paymentsSnap, offersSnap] = await Promise.all([
        db.collection('telecard_rates').get(),
        db.collection('telecard_payments').get(),
        db.collection('telecard_offers').where('isActive', '==', true).get()
    ]);

    memoryCache.rates = ratesSnap.docs.map(doc => doc.data());
    memoryCache.payments = paymentsSnap.docs.map(doc => doc.data());
    memoryCache.offers = offersSnap.docs.map(doc => doc.data());
    memoryCache.lastFetch = now;

    return memoryCache;
};

// ==========================================
// 🛡️ 2. دوال مساعدة وتنظيف المدخلات والدروع الأمنية
// ==========================================

const isMasterAdmin = (context) => {
    if (!context.auth || !context.auth.token) return false;
    return context.auth.token.admin === true;
};

// 🛑 الدرع الأول: طرد لحظي للمحظورين بدون تكلفة قراءة (Zero-Cost Firewall)
const checkBanStatus = (context) => {
    if (context.auth && context.auth.token && context.auth.token.banned === true) {
        throw new functions.https.HttpsError('permission-denied', 'عذراً، هذا الحساب محظور من قبل الإدارة.');
    }
};

const safeAdd = (a, b) => Math.round(Number(a) * 10000 + Number(b) * 10000) / 10000;
const safeSub = (a, b) => Math.max(0, Math.round(Number(a) * 10000 - Number(b) * 10000) / 10000);

const generateUniqueId = () => {
    const timeBase36 = Date.now().toString(36).toUpperCase();
    const randomSuffix = Math.floor(10 + Math.random() * 90);
    return `${timeBase36}-${randomSuffix}`; 
};

// ==========================================
// 🛒 3. دالة إنشاء الطلبات الآمنة للعملاء 
// ==========================================
exports.createOrder = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    
    // 🛑 تشغيل حاجز الصد المبكر
    checkBanStatus(context);

    const uid = context.auth.uid;
    const productId = String(data.productId || '');
    const finalQty = Math.max(1, Math.min(1000, Math.floor(Number(data.qty) || 1)));
    const optIdx = data.optIdx !== null && data.optIdx !== undefined ? Number(data.optIdx) : null;
    const finalInputStr = String(data.finalInputStr || '---').substring(0, 500);
    const couponCode = data.couponCode ? String(data.couponCode).trim() : null;
    const idempotencyKey = data.idempotencyKey ? String(data.idempotencyKey) : null;
    
    if (!productId) throw new functions.https.HttpsError('invalid-argument', 'رقم المنتج مفقود.');

    const serverNow = Date.now();

    try {
        const cleanOrderId = generateUniqueId();
        const userRef = db.collection('telecard_users').doc(uid);
        const productRef = db.collection('telecard_prods').doc(productId);
        const orderRef = db.collection('telecard_orders').doc(cleanOrderId); 
        
        const cache = await loadGlobalCache();
        
        let activeOffer = null;
        cache.offers.forEach(off => {
            if (off.targetProds && off.targetProds.includes(productId) && (!off.expiryDate || off.expiryDate > serverNow)) {
                activeOffer = off;
            }
        });

        let couponRef = null;
        let fetchedCouponData = null;
        if (couponCode) {
            const couponQuery = await db.collection('telecard_coupons').where('code', '==', couponCode).limit(1).get();
            if (!couponQuery.empty) {
                couponRef = couponQuery.docs[0].ref;
                fetchedCouponData = couponQuery.docs[0].data();
            }
        }

        let resultMessage = "تم استلام الطلب بأمان.";
        let deliveredCodeText = null;
        let isAutoDelivered = false;

        await db.runTransaction(async (transaction) => {
            const [userSnap, productSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(productRef)
            ]);

            if (!userSnap.exists) throw new functions.https.HttpsError('not-found', 'المستخدم غير موجود.');
            if (!productSnap.exists) throw new functions.https.HttpsError('not-found', 'المنتج غير متوفر.');

            const userData = userSnap.data();
            const product = productSnap.data();

            // 🛑 الدرع الثاني المزدوج: التحقق العميق داخل المعاملة المالیة (Deep Verification)
            if (userData.isBanned === true || userData.isIpBanned === true) {
                throw new functions.https.HttpsError('permission-denied', 'العملية مرفوضة: الحساب أو الشبكة قيد الحظر.');
            }

            if (idempotencyKey) {
                const usedKeys = userData.usedIdempotencyKeys || [];
                if (usedKeys.includes(idempotencyKey)) throw new functions.https.HttpsError('already-exists', 'تم معالجة هذا الطلب مسبقاً.');
            } else if (serverNow - (userData.lastOrderTime || 0) < 5000) { 
                throw new functions.https.HttpsError('already-exists', 'الرجاء الانتظار بضع ثوانٍ لمنع الشراء المزدوج.');
            }

            const tierId = String(userData.tierId || userData.tier || 1);
            const tierRef = db.collection('telecard_tiers').doc(tierId);
            const vaultRef = product.vaultPoolId ? db.collection('telecard_vault').doc(String(product.vaultPoolId)) : null;

            const [tierSnap, vaultSnap, currentCouponSnap] = await Promise.all([
                transaction.get(tierRef),
                vaultRef ? transaction.get(vaultRef) : Promise.resolve(null),
                couponRef ? transaction.get(couponRef) : Promise.resolve(null)
            ]);

            const userTier = tierSnap.exists ? tierSnap.data() : null;
            const liveCouponData = currentCouponSnap?.exists ? currentCouponSnap.data() : fetchedCouponData;

            if (liveCouponData) {
                if (liveCouponData.expiryDate && liveCouponData.expiryDate < serverNow) throw new functions.https.HttpsError('failed-precondition', 'عذراً، انتهت صلاحية هذا الكوبون.');
                if (liveCouponData.maxUses > 0 && (liveCouponData.usedCount || 0) >= liveCouponData.maxUses) throw new functions.https.HttpsError('resource-exhausted', 'نفدت كمية استخدام هذا الكوبون.');
            }

            let rawUnitCost = Number(product.costPrice || product.unitCost || product.price || 0);
            if (product.type === 'select' && Array.isArray(product.options) && product.options[optIdx]) {
                rawUnitCost = Number(product.options[optIdx].price || product.options[optIdx].costPrice || 0);
            }
            
            const isFixed = (product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true');
            const fixedUsd = isFixed ? Number(product.fixedPriceUsd || product.fixed_price_usd || 0) : 0;

            const pricingSnapshot = FinancialEngine.calculatePrice({
                costPrice: rawUnitCost, fixedPrice: fixedUsd, tier: userTier,
                offer: activeOffer, coupon: liveCouponData
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
            
            if (pricingSnapshot.couponCode && couponRef && liveCouponData) {
                transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });
            }
            if (vaultSnap && vaultSnap.exists && isAutoDelivered) {
                transaction.update(vaultRef, { codes: remainingCodes });
            }

            let usedKeysUpdate = userData.usedIdempotencyKeys || [];
            if (idempotencyKey) {
                usedKeysUpdate.push(idempotencyKey);
                if (usedKeysUpdate.length > 10) usedKeysUpdate.shift();
            }

            const userUpdateObj = { 
                walletBalance: newBalance, balance: newBalance, 
                totalSpent: safeAdd(userData.totalSpent || 0, totalRequired), 
                tierCycleSpent: safeAdd(userData.tierCycleSpent || 0, totalRequired),
                lastOrderTime: serverNow,
                usedIdempotencyKeys: usedKeysUpdate
            };
            transaction.update(userRef, userUpdateObj);

            if (isAutoDelivered) {
                const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
                const notifRef = userRef.collection('notifications').doc(notifId);
                transaction.set(notifRef, {
                    id: notifId, title: "🎉 تم تسليم طلبك بنجاح!",
                    message: `تم إكمال طلبك لشراء ( ${product.name} ) بنجاح. تفضل باستلام الكود الآن.`,
                    type: 'notification', jumpTarget: 'order', createdAt: serverNow
                });
            }

            const newOrder = {
                id: cleanOrderId, displayId: cleanOrderId, userId: uid, prodId: productId, product: product.name,
                price: totalRequired, qty: finalQty, input: finalInputStr,
                status: isAutoDelivered ? 'completed' : 'pending', deliveredCode: deliveredCodeText,
                couponCode: pricingSnapshot.couponCode || null, couponDiscount: safeAdd(0, pricingSnapshot.couponDiscount * finalQty),
                saleDiscount: safeAdd(0, pricingSnapshot.offerDiscount * finalQty), balanceAfter: newBalance,
                pricingSnapshot: {
                    costUsd: safeAdd(0, pricingSnapshot.cost * finalQty), tierPriceUsd: safeAdd(0, pricingSnapshot.tierPrice * finalQty),
                    originalPriceUsd: safeAdd(0, pricingSnapshot.originalPrice * finalQty), finalPriceUsd: totalRequired, 
                    tierName: pricingSnapshot.tierName, offerName: pricingSnapshot.offerName, netProfitUsd: safeAdd(0, pricingSnapshot.profit * finalQty)
                },
                time: admin.firestore.FieldValue.serverTimestamp()
            };
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
// 💰 4. دالة إرسال طلب الإيداع للعملاء
// ==========================================
exports.submitBalanceRequest = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

    // 🛑 تشغيل حاجز الصد المبكر
    checkBanStatus(context);

    const uid = context.auth.uid;
    const amount = Number(data.amount);
    const paymentMethodName = String(data.paymentMethodName || '').trim();
    const payCurr = String(data.payCurr || 'USD').toUpperCase();
    const receiptData = data.receiptData || null;
    const serverNow = Date.now();

    if (isNaN(amount) || amount <= 0) throw new functions.https.HttpsError('invalid-argument', 'المبلغ المدخل غير صالح.');
    if (!paymentMethodName) throw new functions.https.HttpsError('invalid-argument', 'طريقة الدفع غير صالحة.');

    try {
        const cache = await loadGlobalCache();
        const paymentMethod = cache.payments.find(p => p.name === paymentMethodName);
        if (!paymentMethod) throw new functions.https.HttpsError('not-found', 'طريقة الدفع غير متوفرة.');

        const existingPendingSnap = await db.collection('telecard_deposits').where('userId', '==', uid).where('method', '==', paymentMethodName).where('status', '==', 'pending').limit(1).get();
        if (!existingPendingSnap.empty) throw new functions.https.HttpsError('already-exists', 'لديك طلب إيداع معلق مسبقاً لهذه الطريقة.');

        const userRef = db.collection('telecard_users').doc(uid);

        return await db.runTransaction(async (transaction) => {
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists) throw new functions.https.HttpsError('not-found', 'المستخدم غير موجود.');
            
            const userData = userSnap.data();

            // 🛑 الدرع الثاني: التحقق العميق للعميل أو الـ IP المحظور
            if (userData.isBanned === true || userData.isIpBanned === true) {
                throw new functions.https.HttpsError('permission-denied', 'العملية مرفوضة: الحساب أو الشبكة قيد الحظر.');
            }

            if (serverNow - (userData.lastDepositReqTime || 0) < 10000) {
                throw new functions.https.HttpsError('resource-exhausted', 'الرجاء الانتظار قليلاً قبل إرسال طلب جديد.');
            }

            const baseCurr = String(userData.baseCurrency || 'USD').toUpperCase();
            
            let fee = parseFloat(paymentMethod.fee) || 0;
            let feeType = paymentMethod.feeType || 'fee';
            let feeUnit = paymentMethod.feeUnit || paymentMethod.unit || 'percent';

            if (paymentMethod.currencySettings && paymentMethod.currencySettings[payCurr]) {
                const s = paymentMethod.currencySettings[payCurr];
                fee = parseFloat(s.fee) || 0; feeType = s.feeType || 'fee'; feeUnit = s.feeUnit || s.unit || 'percent';
            }

            let feeAmount = feeUnit === 'fixed' || feeUnit === 'amount' ? fee : amount * (fee / 100);
            let netPayCurr = feeType === 'bonus' ? amount + feeAmount : amount - feeAmount;

            let safeNetBase = netPayCurr;
            if (payCurr !== baseCurr) {
                 const fromRate = cache.rates.find(c => String(c.code).toUpperCase() === payCurr)?.depRate || 1;
                 const toRate = cache.rates.find(c => String(c.code).toUpperCase() === baseCurr)?.depRate || 1;
                 safeNetBase = (netPayCurr / fromRate) * toRate;
            }
            safeNetBase = Math.floor(safeNetBase * 10000) / 10000; 

            const cleanDepositId = generateUniqueId(); 
            const depositRef = db.collection('telecard_deposits').doc(cleanDepositId);

            transaction.update(userRef, { lastDepositReqTime: serverNow });
            transaction.set(depositRef, {
                id: cleanDepositId, displayId: cleanDepositId, userId: uid, method: paymentMethodName,
                amount: amount, currency: payCurr, creditedAmount: safeNetBase, status: 'pending',
                time: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp(), receipt: receiptData
            });

            return { success: true, message: 'تم استلام طلب الإيداع وهو قيد المراجعة.' };
        });
    } catch (error) {
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'تعذر إرسال طلب الإيداع.');
    }
});

// ==========================================
// 👑 5. دوال الإدارة والعمليات المالية
// ==========================================

// 🚨 NEW: دالة الإدارة لتفعيل/إلغاء الحظر وتدمير الجلسات فوراً
exports.adminToggleUserBan = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك.');

    const { targetUid, isBanned, reason } = data;
    if (!targetUid) throw new functions.https.HttpsError('invalid-argument', 'معرف المستخدم مفقود.');

    try {
        // 1. تحديث قاعدة البيانات
        await db.collection('telecard_users').doc(targetUid).update({
            isBanned: isBanned,
            banReason: reason || '',
            bannedAt: isBanned ? admin.firestore.FieldValue.serverTimestamp() : null
        });

        // 2. المحافظة على الصلاحيات السابقة للمستخدم وتحديث صلاحية الحظر
        const userRecord = await admin.auth().getUser(targetUid);
        const currentClaims = userRecord.customClaims || {};
        currentClaims.banned = isBanned;
        await admin.auth().setCustomUserClaims(targetUid, currentClaims);

        // 3. 💥 تدمير الجلسات החية (إنهاء جلسة العميل قسرياً من جميع أجهزته)
        if (isBanned) {
            await admin.auth().revokeRefreshTokens(targetUid);
        }

        return { success: true, message: isBanned ? 'تم حظر المستخدم وتدمير جلساته بنجاح.' : 'تم رفع الحظر بنجاح.' };
    } catch (error) {
        throw new functions.https.HttpsError('internal', `فشل تطبيق إجراء الحظر: ${error.message}`);
    }
});

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
            
            let depUpdateObj = { status: action, adminNote: String(adminNote || '').substring(0, 200), actionTime: admin.firestore.FieldValue.serverTimestamp() };
            if (action === 'approved' || action === 'refunded') depUpdateObj.balanceAfter = newWalletBal;
            
            transaction.update(depRef, depUpdateObj);
            return { success: true, message: `تم تحويل الحالة إلى ${action}.` };
        });
    } catch (error) { throw new functions.https.HttpsError('internal', error.message || 'فشلت معالجة الإيداع.'); }
});

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

            if (action === 'completed' && wasAlreadyRefunded) throw new functions.https.HttpsError('failed-precondition', 'لا يمكن إكمال طلب مسترجع.');

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
                if (couponRef) transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(-1) });
            }

            let orderUpdateObj = { status: action, adminNote: String(adminNote || '').substring(0, 200), actionTime: admin.firestore.FieldValue.serverTimestamp() };
            if (isRefundingAction && !wasAlreadyRefunded) orderUpdateObj.balanceAfter = newWalletBal;
            
            transaction.update(orderRef, orderUpdateObj);
            return { success: true, message: `تم تحديث الطلب إلى ${action}.` };
        });
    } catch (error) { throw new functions.https.HttpsError('internal', error.message || 'فشلت معالجة الطلب.'); }
});

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

            if (type === 'subtract' && adjustAmount > currentBal) throw new functions.https.HttpsError('failed-precondition', 'الرصيد غير كافٍ.');

            const cleanDepositId = generateUniqueId(); 
            const depositRef = db.collection('telecard_deposits').doc(cleanDepositId);

            const newBal = type === 'add' ? safeAdd(currentBal, adjustAmount) : safeSub(currentBal, adjustAmount);
            const newTotalDep = type === 'add' ? safeAdd(userData.totalDeposit || 0, adjustAmount) : Number(userData.totalDeposit || 0);
            const newTotalSpent = type === 'subtract' ? safeAdd(userData.totalSpent || 0, adjustAmount) : Number(userData.totalSpent || 0);
            const currency = (userData.baseCurrency || 'USD').toUpperCase();

            transaction.update(userRef, { walletBalance: newBal, balance: newBal, wallet_balance: newBal, totalDeposit: newTotalDep, totalSpent: newTotalSpent });
            transaction.set(depositRef, {
                id: cleanDepositId, displayId: cleanDepositId, userId: String(userId), userName: userData.name || userData.fullName || '---',
                amount: adjustAmount, currency: currency, creditedAmount: type === 'add' ? adjustAmount : -adjustAmount,
                method: type === 'add' ? 'إيداع إداري' : 'خصم إداري', status: 'approved', balanceAfter: newBal, 
                time: admin.firestore.FieldValue.serverTimestamp(), admin: String(adminName || 'النظام').substring(0, 100)
            });

            return { success: true, newBalance: newBal };
        });
    } catch (error) { throw new functions.https.HttpsError('internal', error.message || 'فشلت العملية المالية.'); }
});

// ==========================================
// 📊 6. محرك التدقيق والإحصاء المبني على (Aggregation)
// ==========================================
exports.adminAuditUserWallet = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك.');

    const targetUserId = String(data.userId);
    if (!targetUserId) throw new functions.https.HttpsError('invalid-argument', 'يرجى تمرير ID العميل.');

    try {
        const userRef = db.collection('telecard_users').doc(targetUserId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) throw new functions.https.HttpsError('not-found', 'العميل غير موجود.');

        const AggregateField = admin.firestore.AggregateField;
        
        const [ordersAgg, depApprovedAgg, depRefundedAgg] = await Promise.all([
            db.collection('telecard_orders').where('userId', '==', targetUserId).where('status', '==', 'completed')
              .aggregate({ totalSpent: AggregateField.sum('price') }).get(),
            db.collection('telecard_deposits').where('userId', '==', targetUserId).where('status', '==', 'approved')
              .aggregate({ totalDep: AggregateField.sum('creditedAmount') }).get(),
            db.collection('telecard_deposits').where('userId', '==', targetUserId).where('status', '==', 'refunded')
              .aggregate({ totalRefund: AggregateField.sum('creditedAmount') }).get() 
        ]);

        const totalSpentRaw = ordersAgg.data().totalSpent || 0;
        const totalApprovedRaw = depApprovedAgg.data().totalDep || 0;
        const totalRefundedRaw = depRefundedAgg.data().totalRefund || 0;

        const realTotalDeposit = Math.max(0, safeSub(totalApprovedRaw, totalRefundedRaw));
        const realTotalSpent = totalSpentRaw;
        const expectedBalance = Math.max(0, safeSub(realTotalDeposit, realTotalSpent));

        await userRef.update({ 
            totalSpent: realTotalSpent, 
            totalDeposit: realTotalDeposit, 
            walletBalance: expectedBalance, 
            balance: expectedBalance 
        });

        return { success: true, message: 'تم التصحيح بنجاح!', data: { spent: realTotalSpent, deposit: realTotalDeposit, balance: expectedBalance } };
    } catch (error) { 
        throw new functions.https.HttpsError('internal', `فشل التدقيق: ${error.message}`); 
    }
});

const performStatsRecalculation = async () => {
    const AggregateField = admin.firestore.AggregateField;
    const ordersRef = db.collection('telecard_orders');
    const depositsRef = db.collection('telecard_deposits');
    
    const [ordersTotal, ordersCompleted, ordersRejected, ordersRefunded, financials, depTotal, depApproved, depRejected, depRefunded] = await Promise.all([
        ordersRef.count().get(), ordersRef.where('status', '==', 'completed').count().get(),
        ordersRef.where('status', '==', 'rejected').count().get(), ordersRef.where('status', '==', 'refunded').count().get(),
        ordersRef.where('status', '==', 'completed').aggregate({ revenue: AggregateField.sum('price'), cost: AggregateField.sum('pricingSnapshot.costUsd'), profit: AggregateField.sum('pricingSnapshot.netProfitUsd') }).get(),
        depositsRef.count().get(), depositsRef.where('status', '==', 'approved').count().get(),
        depositsRef.where('status', '==', 'rejected').count().get(), depositsRef.where('status', '==', 'refunded').count().get()
    ]);
    
    const globalStats = {
        financials: { totalRevenue: Number((financials.data().revenue || 0).toFixed(4)), totalCost: Number((financials.data().cost || 0).toFixed(4)), totalProfit: Number((financials.data().profit || 0).toFixed(4)) },
        orders: { total: ordersTotal.data().count, completed: ordersCompleted.data().count, rejected: ordersRejected.data().count, refunded: ordersRefunded.data().count },
        deposits: { total: depTotal.data().count, approved: depApproved.data().count, rejected: depRejected.data().count, refunded: depRefunded.data().count }, daily: {}
    };
    
    await db.collection('telecard_system').doc('singleton').set({ globalStats: globalStats }, { merge: true });
};

exports.scheduledStatsAggregation = functions.region('us-east1').pubsub.schedule('every 1 hours').onRun(async (context) => {
    try { await performStatsRecalculation(); } catch (error) { console.error("Scheduled Stats Error:", error); }
});

exports.getServerTime = functions.region('us-east1').https.onCall((data, context) => { return { success: true, serverTime: Date.now() }; });

exports.calculateStoreStatsCloud = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح.');
    try {
        await performStatsRecalculation();
        return { success: true, message: 'تم بناء الإحصائيات المركزية بنجاح.' };
    } catch (error) { throw new functions.https.HttpsError('internal', `فشل السيرفر: ${error.message}`); }
});

// ==========================================
// 🛡️ 7. المزامنة الآمنة للمنتجات والمشرفين
// ==========================================
exports.secureProductSync = functions.region('us-east1').firestore.document('telecard_prods/{productId}').onWrite(async (change, context) => {
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
    delete publicData.costPrice; delete publicData.cost_price; delete publicData.providerId; delete publicData.apiToken; 
    publicData.tierPrices = tierPrices;
    return publicProdRef.set(publicData, { merge: true });
});

exports.grantAdminRole = functions.region('us-east1').runWith({ secrets: [ROOT_OWNER_UID] }).https.onCall(async (data, context) => {
    if (!context.auth || context.auth.uid !== ROOT_OWNER_UID.value()) throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك.');
    const targetEmail = data.email;
    if (!targetEmail) throw new functions.https.HttpsError('invalid-argument', 'الرجاء إدخال البريد الإلكتروني.');
    try {
        const user = await admin.auth().getUserByEmail(targetEmail);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        return { success: true, message: `تم منح رتبة الأدمن للحساب: ${targetEmail}` };
    } catch (error) { throw new functions.https.HttpsError('internal', `فشل المنح: ${error.message}`); }
});

// ==========================================
// 🔔 8. معالجات الإشعارات الآلية
// ==========================================

exports.autoNotifyOrderStatus = functions.region('us-east1').firestore.document('telecard_orders/{orderId}').onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === after.status) return null;

    let title = "تحديث حالة الطلب", message = `تم تغيير حالة طلبك رقم ${after.displayId || after.id} إلى ${after.status}`;

    if (after.status === 'completed') {
        title = "🎉 تم تسليم طلبك بنجاح!"; message = `تم إكمال طلبك لشراء ( ${after.product} ) بنجاح.`;
    } else if (after.status === 'rejected') {
        title = "❌ تم رفض طلب الشراء"; message = `عذراً، تعذر إكمال طلبك لشراء ( ${after.product} ). السبب: ${after.adminNote || 'راجع الدعم'}`;
    } else if (after.status === 'refunded') {
        title = "↩️ تم استرجاع الطلب"; message = `تم استرجاع قيمة طلبك لشراء ( ${after.product} ) للمحفظة.`;
    }

    const notifId = 'notif_' + Date.now();
    return db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({
        id: notifId, title, message, type: 'notification', jumpTarget: 'order', createdAt: Date.now()
    });
});

exports.autoNotifyDepositStatus = functions.region('us-east1').firestore.document('telecard_deposits/{depositId}').onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === after.status) return null;

    let title = "تحديث طلب الإيداع", message = `تم تغيير حالة طلب الإيداع إلى ${after.status}`;

    if (after.status === 'approved') {
        title = "💰 تم قبول الإيداع!"; message = `تم شحن ${after.amount} ${after.currency || 'USD'} بمحفظتك!`;
    } else if (after.status === 'rejected') {
        title = "❌ تم رفض الإيداع"; message = `عذراً، تم رفض طلبك. السبب: ${after.adminNote || 'راجع الدعم'}`;
    } else if (after.status === 'refunded') {
        title = "↩️ تم استرجاع الإيداع"; message = `تم سحب إيداع بقيمة ${after.amount} ${after.currency || 'USD'}.`;
    }

    const notifId = 'notif_' + Date.now();
    return db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({
        id: notifId, title, message, type: 'notification', jumpTarget: 'wallet', createdAt: Date.now()
    });
});

// ==========================================
// 🔗 9. تصدير دوال ربط الموردين الخارجية
// ==========================================
const developerApi = require('./developerApi.js');
const supplierEngine = require('./supplierEngine.js');

exports.orderStatusWebhook = developerApi.orderStatusWebhook;
exports.externalCreateOrder = developerApi.externalCreateOrder;
exports.syncSupplierData = supplierEngine.syncSupplierData;
exports.scheduledSupplierSync = supplierEngine.scheduledSupplierSync;
exports.secureSaveSupplier = supplierEngine.secureSaveSupplier;
