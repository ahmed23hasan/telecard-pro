const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { FinancialEngine } = require('./financialEngine.js'); 

admin.initializeApp();
const db = admin.firestore();

// ==========================================
// 🛡️ دوال مساعدة (Helper Functions)
// ==========================================

// 1. التحقق من صلاحيات الإدارة العليا
const isMasterAdmin = (context) => {
    if (!context.auth) return false;
    // التحقق بناءً على الإيميل أو المعرف المعتمد في المتجر
    return context.auth.token.email === 'admin@telecard.pro' || context.auth.uid === 'e064MQJyn6dhU9mNXZvXItc7VYg2';
};

// 2. معالجة الأرقام العشرية بأمان لمنع أخطاء الجافاسكريبت (مثل 15.00000002)
const safeAdd = (a, b) => Number((Number(a) + Number(b)).toFixed(4));
const safeSub = (a, b) => Math.max(0, Number((Number(a) - Number(b)).toFixed(4)));

// ==========================================
// 🛒 1. دالة إنشاء الطلبات الآمنة للعملاء (المحرك المالي)
// ==========================================
exports.createOrder = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

    const uid = context.auth.uid;
    const { productId, qty, optIdx, finalInputStr, couponCode } = data;
    
    // حماية أمنية: إجبار الكمية على أن تكون رقماً صحيحاً وموجباً يبلغ 1 كحد أدنى
    const finalQty = Math.max(1, Math.floor(Number(qty) || 1));

    try {
        const userRef = db.collection('telecard_users').doc(uid);
        const orderRef = db.collection('telecard_orders').doc(); 
        const productRef = db.collection('telecard_prods').doc(String(productId));
        
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

            let rawUnitCost = Number(product.costPrice || product.unitCost || product.price || 0);
            if (product.type === 'select' && Array.isArray(product.options) && product.options[optIdx]) {
                rawUnitCost = Number(product.options[optIdx].price || product.options[optIdx].costPrice || 0);
            }
            const isFixed = !!(product.isFixedPrice || product.is_fixed_price);
            if (isFixed) {
                const fixedUsd = Number(product.fixedPriceUsd || product.fixed_price_usd || 0);
                if (fixedUsd > 0) rawUnitCost = fixedUsd;
            }

            const pricingSnapshot = FinancialEngine.calculatePrice({
                costPrice: rawUnitCost,
                tier: isFixed ? null : userTier, 
                offer: activeOffer,
                coupon: couponData
            });

            // حساب الإجمالي باستخدام الدالة الآمنة
            const totalRequired = Number((pricingSnapshot.finalPrice * finalQty).toFixed(4));
            const currentBalance = Number(userData.walletBalance || 0);

            if (pricingSnapshot.couponCode && couponRef && couponData) {
                if (couponData.maxUses > 0 && (couponData.usedCount || 0) >= couponData.maxUses) {
                    throw new functions.https.HttpsError('resource-exhausted', 'نفدت كمية استخدام هذا الكوبون.');
                }
                transaction.update(couponRef, {
                    usedCount: admin.firestore.FieldValue.increment(1)
                });
            }

            if (currentBalance < totalRequired) {
                throw new functions.https.HttpsError('failed-precondition', 'رصيدك غير كافٍ لإتمام العملية.');
            }

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
                        resultMessage = "تم تنفيذ طلبك بنجاح وتسليم الكود.";
                    } else {
                        throw new functions.https.HttpsError('resource-exhausted', 'المنتج نفد من المخزون حالياً.');
                    }
                }
            }

            const newBalance = safeSub(currentBalance, totalRequired);
            const newTotalSpent = safeAdd(userData.totalSpent || 0, totalRequired);
            const newCycleSpent = safeAdd(userData.tierCycleSpent || 0, totalRequired); 
            const shortId = Math.floor(100000 + Math.random() * 900000);

            const newOrder = {
                id: orderRef.id,
                displayId: shortId,
                userId: uid,
                prodId: productId,
                product: product.name,
                price: totalRequired,
                qty: finalQty,
                input: finalInputStr || '---',
                status: isAutoDelivered ? 'completed' : 'pending',
                deliveredCode: deliveredCodeText,
                couponCode: pricingSnapshot.couponCode || null,
                couponDiscount: Number((pricingSnapshot.couponDiscount * finalQty).toFixed(4)),
                saleDiscount: Number((pricingSnapshot.offerDiscount * finalQty).toFixed(4)),
                pricingSnapshot: {
                    costUsd: Number((pricingSnapshot.cost * finalQty).toFixed(4)),
                    tierPriceUsd: Number((pricingSnapshot.tierPrice * finalQty).toFixed(4)),
                    originalPriceUsd: Number((pricingSnapshot.originalPrice * finalQty).toFixed(4)),
                    finalPriceUsd: totalRequired,
                    tierName: pricingSnapshot.tierName,
                    offerName: pricingSnapshot.offerName,
                    offerDiscount: Number((pricingSnapshot.offerDiscount * finalQty).toFixed(4)),
                    couponCode: pricingSnapshot.couponCode,
                    couponDiscount: Number((pricingSnapshot.couponDiscount * finalQty).toFixed(4)),
                    totalDiscountVal: Number((pricingSnapshot.totalDiscountVal * finalQty).toFixed(4)),
                    netProfitUsd: Number((pricingSnapshot.profit * finalQty).toFixed(4)),
                    marginPct: pricingSnapshot.marginPct,
                    isFirewallActive: pricingSnapshot.isFirewallActive
                },
                time: admin.firestore.FieldValue.serverTimestamp()
            };

            transaction.update(userRef, {
                walletBalance: newBalance,
                balance: newBalance, 
                totalSpent: newTotalSpent,
                tierCycleSpent: newCycleSpent
            });
            transaction.set(orderRef, newOrder);
        });

        return { success: true, message: resultMessage, isAutoDelivered: isAutoDelivered, deliveredCode: deliveredCodeText };

    } catch (error) {
        console.error("Order Error:", error);
        throw new functions.https.HttpsError('internal', error.message || 'حدث خطأ أثناء المعالجة.');
    }
});

// ==========================================
// 💰 2. دالة إرسال طلب الإيداع للعملاء
// ==========================================
exports.submitBalanceRequest = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

    const uid = context.auth.uid;
    const { amount, paymentMethodName, payCurr, netBase, receiptData } = data;

    if (amount <= 0) throw new functions.https.HttpsError('invalid-argument', 'المبلغ المدخل غير صالح.');

    try {
        const depositRef = db.collection('telecard_deposits').doc();
        const shortId = Math.floor(100000 + Math.random() * 900000);

        await depositRef.set({
            id: depositRef.id,
            displayId: shortId,
            userId: uid,
            method: paymentMethodName,
            amount: Number(amount),
            currency: payCurr,
            creditedAmount: Number(netBase),
            status: 'pending', 
            time: admin.firestore.FieldValue.serverTimestamp(),
            receipt: receiptData || null
        });

        return { success: true, message: 'تم استلام طلب الإيداع وهو قيد المراجعة.' };
    } catch (error) {
        console.error("Deposit Error:", error);
        throw new functions.https.HttpsError('internal', 'تعذر إرسال طلب الإيداع.');
    }
});

// ==========================================
// 👑 3. [إدارة] دالة معالجة الإيداعات الآمنة
// ==========================================
exports.adminProcessDeposit = functions.https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك.');

    const { depositId, action, adminNote } = data; 

    try {
        return await db.runTransaction(async (transaction) => {
            const depRef = db.collection('telecard_deposits').doc(String(depositId));
            const depSnap = await transaction.get(depRef);
            
            if (!depSnap.exists) throw new functions.https.HttpsError('not-found', 'الإيداع غير موجود.');
            const depData = depSnap.data();

            if (depData.status !== 'pending') {
                throw new functions.https.HttpsError('failed-precondition', 'تمت معالجة هذا الإيداع مسبقاً.');
            }

            if (action === 'approved') {
                const userRef = db.collection('telecard_users').doc(String(depData.userId));
                const userSnap = await transaction.get(userRef);
                
                if (userSnap.exists) {
                    const userData = userSnap.data();
                    const amountToAdd = Number(depData.creditedAmount || depData.amount || 0);

                    transaction.update(userRef, {
                        walletBalance: safeAdd(userData.walletBalance || 0, amountToAdd),
                        balance: safeAdd(userData.balance || 0, amountToAdd),
                        totalDeposit: safeAdd(userData.totalDeposit || 0, amountToAdd)
                    });
                }
            }

            transaction.update(depRef, {
                status: action,
                adminNote: adminNote || '',
                actionTime: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, message: `تم تحويل حالة الإيداع إلى ${action} بنجاح.` };
        });
    } catch (error) {
        console.error("Admin Deposit Error:", error);
        throw new functions.https.HttpsError('internal', error.message || 'فشلت عملية معالجة الإيداع.');
    }
});

// ==========================================
// 👑 4. [إدارة] دالة معالجة الطلبات الآمنة (مع استرجاع الرصيد والكوبونات)
// ==========================================
exports.adminProcessOrder = functions.https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك.');

    const { orderId, action, adminNote } = data;

    // حماية المدخلات
    const validActions = ['completed', 'rejected', 'refunded', 'returned', 'processing'];
    if (!validActions.includes(action)) {
        throw new functions.https.HttpsError('invalid-argument', 'حالة الطلب غير صالحة.');
    }

    try {
        return await db.runTransaction(async (transaction) => {
            const orderRef = db.collection('telecard_orders').doc(String(orderId));
            const orderSnap = await transaction.get(orderRef);
            
            if (!orderSnap.exists) throw new functions.https.HttpsError('not-found', 'الطلب غير موجود.');
            const orderData = orderSnap.data();

            if (orderData.status === action) {
                throw new functions.https.HttpsError('failed-precondition', 'الطلب يمتلك هذه الحالة بالفعل.');
            }

            const isRefundingAction = ['rejected', 'refunded', 'returned'].includes(action);
            const wasAlreadyRefunded = ['rejected', 'refunded', 'returned'].includes(orderData.status);

            // منع تحويل طلب مسترجع إلى مكتمل مرة أخرى
            if (action === 'completed' && wasAlreadyRefunded) {
                throw new functions.https.HttpsError('failed-precondition', 'لا يمكن إكمال طلب تم رفضه أو استرجاع أمواله مسبقاً. يرجى إنشاء طلب جديد.');
            }

            // --- معالجة الاسترجاع المالي واسترجاع الكوبون ---
            if (isRefundingAction && !wasAlreadyRefunded) {
                const userRef = db.collection('telecard_users').doc(String(orderData.userId));
                const userSnap = await transaction.get(userRef);
                
                if (userSnap.exists) {
                    const userData = userSnap.data();
                    const amountToRefund = Number(orderData.price || 0);

                    transaction.update(userRef, {
                        walletBalance: safeAdd(userData.walletBalance || 0, amountToRefund),
                        balance: safeAdd(userData.balance || 0, amountToRefund),
                        totalSpent: safeSub(userData.totalSpent || 0, amountToRefund),
                        tierCycleSpent: safeSub(userData.tierCycleSpent || 0, amountToRefund)
                    });
                }

                // استرجاع استخدام الكوبون للعميل
                if (orderData.couponCode) {
                    const couponQuery = await db.collection('telecard_coupons').where('code', '==', orderData.couponCode).limit(1).get();
                    if (!couponQuery.empty) {
                        const couponRef = couponQuery.docs[0].ref;
                        transaction.update(couponRef, {
                            usedCount: admin.firestore.FieldValue.increment(-1)
                        });
                    }
                }
            }

            // تحديث حالة الطلب
            transaction.update(orderRef, {
                status: action,
                adminNote: adminNote || '',
                actionTime: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, message: `تم تحديث حالة الطلب إلى ${action} بنجاح.` };
        });
    } catch (error) {
        console.error("Admin Order Error:", error);
        throw new functions.https.HttpsError('internal', error.message || 'فشلت عملية معالجة الطلب.');
    }
});
// ==========================================
// 🔗 ربط وتصدير دوال المطورين والموردين (التحديث الجديد)
// ==========================================
const developerApi = require('./developerApi.js');
const supplierEngine = require('./supplierEngine.js');

// تصدير دوال المطورين (API & Webhooks)
exports.orderStatusWebhook = developerApi.orderStatusWebhook;
exports.externalCreateOrder = developerApi.externalCreateOrder;

// تصدير دوال الموردين السحابية
exports.syncSupplierData = supplierEngine.syncSupplierData;
exports.scheduledSupplierSync = supplierEngine.scheduledSupplierSync;
exports.secureSaveSupplier = supplierEngine.secureSaveSupplier;
