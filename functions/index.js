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
    // التأكد التام من السماح لأهم الحسابات التشغيلية
    return context.auth.token.email === 'admin@telecard.pro' || context.auth.uid === 'e064MQJyn6dhU9mNXZvXItc7VYg2';
};

// عمليات حسابية حذرة للمحافظة على أمان فواصل الأعشار للأموال (Fintech Safety)
const safeAdd = (a, b) => Number((Number(a) + Number(b)).toFixed(4));
const safeSub = (a, b) => Math.max(0, Number((Number(a) - Number(b)).toFixed(4)));

// ==========================================
// 🛒 1. دالة إنشاء الطلبات الآمنة للعملاء (النسخة المعمارية الخالية من أخطاء التزامن)
// ==========================================
exports.createOrder = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول.');

    const uid = context.auth.uid;
    const { productId, qty, optIdx, finalInputStr, couponCode } = data;
    const finalQty = Math.max(1, Math.floor(Number(qty) || 1));

    try {
        const userRef = db.collection('telecard_users').doc(uid);
        const productRef = db.collection('telecard_prods').doc(String(productId));
        
        // 🌟 استبدال (system) بمسارها الحقيقي بالمشروع (telecard_system)
        const systemRef = db.collection('telecard_system').doc('singleton');
        const countersRef = db.collection('telecard_system').doc('counters'); 
        
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
            // ----------------------------------------------------
            // 📥 1. منطقة القراءة فقط (READS ZONE)
            // ----------------------------------------------------
            const userSnap = await transaction.get(userRef);
            const productSnap = await transaction.get(productRef);
            const countersSnap = await transaction.get(countersRef);
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
            
            if (activeOffer && activeOffer.expiryDate && activeOffer.expiryDate < serverNow) {
                activeOffer = null; 
            }

            if (couponData && couponData.expiryDate && couponData.expiryDate < serverNow) {
                throw new functions.https.HttpsError('failed-precondition', 'عذراً، انتهت صلاحية هذا الكوبون.');
            }

            let vaultSnap = null;
            let vaultRef = null;
            if (product.vaultPoolId) {
                vaultRef = db.collection('telecard_vault').doc(String(product.vaultPoolId));
                vaultSnap = await transaction.get(vaultRef); 
            }

            // 🌟 استخراج وتوليد الرقم التسلسلي النقي للطلب
            let currentOrderCount = 100001; 
            if (countersSnap.exists && countersSnap.data().orders_counter) {
                currentOrderCount = countersSnap.data().orders_counter + 1;
            }
            const cleanOrderId = String(currentOrderCount);
            const orderRef = db.collection('telecard_orders').doc(cleanOrderId); 

            // ----------------------------------------------------
            // 🧠 2. منطقة الحسابات والمنطق (LOGIC ZONE)
            // ----------------------------------------------------
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

            // ----------------------------------------------------
            // 💾 3. منطقة الكتابة فقط (WRITES ZONE)
            // ----------------------------------------------------
            if (pricingSnapshot.couponCode && couponRef && couponData) {
                transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });
            }
            if (vaultSnap && vaultSnap.exists && isAutoDelivered) {
                transaction.update(vaultRef, { codes: remainingCodes });
            }
            transaction.update(userRef, { walletBalance: newBalance, balance: newBalance, totalSpent: newTotalSpent, tierCycleSpent: newCycleSpent });
            transaction.set(orderRef, newOrder);
            transaction.set(systemRef, statsUpdate, { merge: true }); 
            transaction.set(countersRef, { orders_counter: currentOrderCount }, { merge: true });
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
    const { amount, paymentMethodName, payCurr, netBase, receiptData } = data;

    if (amount <= 0) throw new functions.https.HttpsError('invalid-argument', 'المبلغ المدخل غير صالح.');

    try {
        const countersRef = db.collection('telecard_system').doc('counters');
        const systemRef = db.collection('telecard_system').doc('singleton');
        
        await db.runTransaction(async (transaction) => {
            const countersSnap = await transaction.get(countersRef);
            
            let currentDepositCount = 500001; 
            if (countersSnap.exists && countersSnap.data().deposits_counter) {
                currentDepositCount = countersSnap.data().deposits_counter + 1;
            }
            const cleanDepositId = String(currentDepositCount);
            const depositRef = db.collection('telecard_deposits').doc(cleanDepositId);

            transaction.set(countersRef, { deposits_counter: currentDepositCount }, { merge: true });

            transaction.set(depositRef, {
                id: cleanDepositId, displayId: cleanDepositId, 
                userId: uid, method: paymentMethodName,
                amount: Number(amount), currency: payCurr, creditedAmount: Number(netBase),
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
    const countersRef = db.collection('telecard_system').doc('counters');
    const systemRef = db.collection('telecard_system').doc('singleton');

    try {
        return await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const countersSnap = await transaction.get(countersRef);

            if (!userDoc.exists) throw new functions.https.HttpsError('not-found', 'العميل غير موجود.');

            const userData = userDoc.data();
            const currentBal = Number(userData.walletBalance || userData.balance || 0);

            if (type === 'subtract' && adjustAmount > currentBal) {
                throw new functions.https.HttpsError('failed-precondition', 'رصيد العميل غير كافٍ لإتمام الخصم.');
            }

            let currentDepositCount = 500001;
            if (countersSnap.exists && countersSnap.data().deposits_counter) {
                currentDepositCount = countersSnap.data().deposits_counter + 1;
            }
            const cleanDepositId = String(currentDepositCount);
            const depositRef = db.collection('telecard_deposits').doc(cleanDepositId);

            const newBal = type === 'add' ? currentBal + adjustAmount : currentBal - adjustAmount;
            
            const currentTotalDep = Number(userData.totalDeposit || 0);
            const newTotalDep = type === 'add' ? currentTotalDep + adjustAmount : currentTotalDep;
            
            const currentTotalSpent = Number(userData.totalSpent || 0);
            const newTotalSpent = type === 'subtract' ? currentTotalSpent + adjustAmount : currentTotalSpent;

            const currency = (userData.baseCurrency || 'USD').toUpperCase();

            transaction.set(countersRef, { deposits_counter: currentDepositCount }, { merge: true });
            
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
                newDeposit: { 
                    id: cleanDepositId, 
                    amount: adjustAmount, 
                    creditedAmount: type === 'add' ? adjustAmount : -adjustAmount 
                } 
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
    return {
        success: true,
        serverTime: Date.now() 
    };
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
