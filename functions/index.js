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
    return context.auth.token.email === 'admin@telecard.pro' || context.auth.uid === 'e064MQJyn6dhU9mNXZvXItc7VYg2';
};

// 2. معالجة الأرقام العشرية بأمان لمنع أخطاء الجافاسكريبت (مثل 15.00000002)
const safeAdd = (a, b) => Number((Number(a) + Number(b)).toFixed(4));
const safeSub = (a, b) => Math.max(0, Number((Number(a) - Number(b)).toFixed(4)));

// ==========================================
// 🛒 1. دالة إنشاء الطلبات الآمنة للعملاء (المحرك المالي + العدادات التراكمية)
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
        const systemRef = db.collection('system').doc('singleton'); // 🌟 مرجع الإحصائيات المركزية
        
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

            // 🌟 تحديث الإحصائيات المركزية (التحديث التراكمي الفوري)
            const statsUpdate = {
                'globalStats.orders.total': admin.firestore.FieldValue.increment(1)
            };
            
            // إذا كان التسليم فورياً، نضيف الأرباح مباشرة للإحصائيات
            if (isAutoDelivered) {
                statsUpdate['globalStats.orders.completed'] = admin.firestore.FieldValue.increment(1);
                statsUpdate['globalStats.financials.totalRevenue'] = admin.firestore.FieldValue.increment(totalRequired);
                statsUpdate['globalStats.financials.totalCost'] = admin.firestore.FieldValue.increment(Number((pricingSnapshot.cost * finalQty).toFixed(4)));
                statsUpdate['globalStats.financials.totalProfit'] = admin.firestore.FieldValue.increment(Number((pricingSnapshot.profit * finalQty).toFixed(4)));
            }

            transaction.update(userRef, {
                walletBalance: newBalance,
                balance: newBalance, 
                totalSpent: newTotalSpent,
                tierCycleSpent: newCycleSpent
            });
            transaction.set(orderRef, newOrder);
            transaction.update(systemRef, statsUpdate); // 🌟 إرسال التحديث للإحصائيات
        });

        return { success: true, message: resultMessage, isAutoDelivered: isAutoDelivered, deliveredCode: deliveredCodeText };
        
    } catch (error) {
        console.error("Order Error:", error);
        
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'حدث خطأ غير متوقع في السيرفر.');
    }
});

// ==========================================
// 💰 2. دالة إرسال طلب الإيداع للعملاء (مع تحديث العدادات)
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

        // 🌟 زيادة عداد إجمالي الإيداعات
        await db.collection('system').doc('singleton').update({
            'globalStats.deposits.total': admin.firestore.FieldValue.increment(1)
        });

        return { success: true, message: 'تم استلام طلب الإيداع وهو قيد المراجعة.' };
    } catch (error) {
        console.error("Deposit Error:", error);
        throw new functions.https.HttpsError('internal', 'تعذر إرسال طلب الإيداع.');
    }
});

// ==========================================
// 👑 3. [إدارة] دالة معالجة الإيداعات الآمنة (مع تحديث العدادات)
// ==========================================
exports.adminProcessDeposit = functions.https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك.');

    const { depositId, action, adminNote } = data; 

    try {
        return await db.runTransaction(async (transaction) => {
            const depRef = db.collection('telecard_deposits').doc(String(depositId));
            const depSnap = await transaction.get(depRef);
            const systemRef = db.collection('system').doc('singleton'); // 🌟 مرجع الإحصائيات
            
            if (!depSnap.exists) throw new functions.https.HttpsError('not-found', 'الإيداع غير موجود.');
            const depData = depSnap.data();

            if (depData.status !== 'pending') {
                throw new functions.https.HttpsError('failed-precondition', 'تمت معالجة هذا الإيداع مسبقاً.');
            }

            const statsUpdate = {};

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
                statsUpdate['globalStats.deposits.approved'] = admin.firestore.FieldValue.increment(1);
            } else if (action === 'rejected') {
                statsUpdate['globalStats.deposits.rejected'] = admin.firestore.FieldValue.increment(1);
            }

            transaction.update(depRef, {
                status: action,
                adminNote: adminNote || '',
                actionTime: admin.firestore.FieldValue.serverTimestamp()
            });

            if (Object.keys(statsUpdate).length > 0) {
                transaction.update(systemRef, statsUpdate); // 🌟 إرسال التحديث للإحصائيات
            }

            return { success: true, message: `تم تحويل حالة الإيداع إلى ${action} بنجاح.` };
        });
    } catch (error) {
        console.error("Admin Deposit Error:", error);
        throw new functions.https.HttpsError('internal', error.message || 'فشلت عملية معالجة الإيداع.');
    }
});

// ==========================================
// 👑 4. [إدارة] دالة معالجة الطلبات الآمنة (مع استرجاع الرصيد والكوبونات وتحديث العدادات)
// ==========================================
exports.adminProcessOrder = functions.https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك.');

    const { orderId, action, adminNote } = data;

    const validActions = ['completed', 'rejected', 'refunded', 'returned', 'processing'];
    if (!validActions.includes(action)) {
        throw new functions.https.HttpsError('invalid-argument', 'حالة الطلب غير صالحة.');
    }

    try {
        return await db.runTransaction(async (transaction) => {
            const orderRef = db.collection('telecard_orders').doc(String(orderId));
            const orderSnap = await transaction.get(orderRef);
            const systemRef = db.collection('system').doc('singleton'); // 🌟 مرجع الإحصائيات
            
            if (!orderSnap.exists) throw new functions.https.HttpsError('not-found', 'الطلب غير موجود.');
            const orderData = orderSnap.data();

            if (orderData.status === action) {
                throw new functions.https.HttpsError('failed-precondition', 'الطلب يمتلك هذه الحالة بالفعل.');
            }

            const isRefundingAction = ['rejected', 'refunded', 'returned'].includes(action);
            const wasAlreadyRefunded = ['rejected', 'refunded', 'returned'].includes(orderData.status);

            if (action === 'completed' && wasAlreadyRefunded) {
                throw new functions.https.HttpsError('failed-precondition', 'لا يمكن إكمال طلب تم رفضه أو استرجاع أمواله مسبقاً.');
            }

            // 🌟 تجهيز تحديث الإحصائيات التراكمية
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
                statsUpdate['globalStats.financials.totalRevenue'] = admin.firestore.FieldValue.increment(-exactPriceUsd); // خصم الأرباح والمبيعات
                statsUpdate['globalStats.financials.totalCost'] = admin.firestore.FieldValue.increment(-costUsd);
                statsUpdate['globalStats.financials.totalProfit'] = admin.firestore.FieldValue.increment(-profitUsd);
            }

            // --- معالجة الاسترجاع المالي واسترجاع الكوبون ---
            if (isRefundingAction && !wasAlreadyRefunded) {
                const userRef = db.collection('telecard_users').doc(String(orderData.userId));
                const userSnap = await transaction.get(userRef);
                
                if (userSnap.exists) {
                    const userData = userSnap.data();
                    transaction.update(userRef, {
                        walletBalance: safeAdd(userData.walletBalance || 0, exactPriceUsd),
                        balance: safeAdd(userData.balance || 0, exactPriceUsd),
                        totalSpent: safeSub(userData.totalSpent || 0, exactPriceUsd),
                        tierCycleSpent: safeSub(userData.tierCycleSpent || 0, exactPriceUsd)
                    });
                }

                if (orderData.couponCode) {
                    const couponQuery = await db.collection('telecard_coupons').where('code', '==', orderData.couponCode).limit(1).get();
                    if (!couponQuery.empty) {
                        transaction.update(couponQuery.docs[0].ref, {
                            usedCount: admin.firestore.FieldValue.increment(-1)
                        });
                    }
                }
            }

            transaction.update(orderRef, {
                status: action,
                adminNote: adminNote || '',
                actionTime: admin.firestore.FieldValue.serverTimestamp()
            });

            if (Object.keys(statsUpdate).length > 0) {
                transaction.update(systemRef, statsUpdate); // 🌟 إرسال التحديث للإحصائيات
            }

            return { success: true, message: `تم تحديث حالة الطلب إلى ${action} بنجاح.` };
        });
    } catch (error) {
        console.error("Admin Order Error:", error);
        throw new functions.https.HttpsError('internal', error.message || 'فشلت عملية معالجة الطلب.');
    }
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

// ==========================================
// 📊 دالة الصيانة الشاملة (تُستخدم يدوياً لضبط العدادات عند الحاجة)
// ==========================================
exports.calculateStoreStatsCloud = functions.https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) {
        throw new functions.https.HttpsError('permission-denied', 'غير مصرح لك بإعادة حساب إحصائيات المتجر.');
    }

    try {
        console.log("جاري إجراء الحساب الشامل للإحصائيات السحابية...");
        
        const [ordersSnap, depositsSnap] = await Promise.all([
            db.collection('telecard_orders').get(),
            db.collection('telecard_deposits').get()
        ]);

        const globalStats = {
            financials: { totalRevenue: 0, totalProfit: 0, totalCost: 0 },
            orders: { total: 0, completed: 0, rejected: 0, refunded: 0 },
            deposits: { total: 0, approved: 0, rejected: 0, refunded: 0 }
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

        await db.collection('system').doc('singleton').set({ 
            globalStats: globalStats 
        }, { merge: true });

        return { success: true, message: 'تم إعادة بناء وضبط الإحصائيات المركزية بنجاح.' };

    } catch (error) {
        console.error("Stats Calculation Error:", error);
        throw new functions.https.HttpsError('internal', 'فشل السيرفر في حساب الإحصائيات.');
    }
});
