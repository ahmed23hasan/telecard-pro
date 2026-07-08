// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (functions/index.js) - النسخة الماسية المحدثة 💎
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https"); 
const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { FinancialEngine } = require('./financialEngine.js'); 

// 🛡️ [تحديث ألماسي]: استيراد أداة التحكم بالموارد العالمية
const { setGlobalOptions } = require("firebase-functions/v2");

// 🛡️ [تعديل ذهبي]: موازنة المعالج والذاكرة ليتوافق مع قوانين جوجل us-east1
// هذا التعديل يضمن قبول جميع الدوال الـ 21 معاً دون تجاوز الحصة
setGlobalOptions({
    region: 'us-east1',
    memory: '256MiB', // تقليل الذاكرة لـ 256 لكي تسمح جوجل بمعالج صغير
    cpu: 0.17, // رفع المعالج إلى 0.17 (القيمة الذهبية المستقرة لهذا الحجم)
    maxInstances: 3 // تقليل عدد النسخ المتوازية لتوفير حصة المعالج الكلية
});
const ROOT_OWNER_UID = defineSecret('ROOT_OWNER_UID');
const SUPPLIER_WEBHOOK_TOKEN = defineSecret('SUPPLIER_WEBHOOK_TOKEN'); 

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// 🛡️ [درع التيتانيوم]
const SYSTEM_LIMITS = {
    MAX_QTY_PER_ORDER: 1000,
    MAX_SAFE_AMOUNT: 100000000 
};

// ... (باقي كود الـ Cache والدوال المساعدة كما هو) ...

// ==========================================
// 💰 4. إرسال طلبات الإيداع (محدث بـ سجلات احترافية)
// ==========================================
exports.submitBalanceRequest = onCall({ enforceAppCheck: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    checkBanStatus(request);

    const uid = request.auth.uid;
    const { data } = request;
    const amount = Number(data.amount);
    const paymentMethodName = String(data.paymentMethodName || '').trim();
    const payCurr = String(data.payCurr || 'USD').toUpperCase();
    
    if (isNaN(amount) || amount <= 0 || amount > SYSTEM_LIMITS.MAX_SAFE_AMOUNT) {
        throw new HttpsError('out-of-range', 'المبلغ المدخل غير صالح.');
    }

    try {
        const cache = await loadDepositCache();
        const clientIp = request.rawRequest?.headers?.['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
        
        const paymentMethod = cache.payments.find(p => p.name === paymentMethodName);
        if (!paymentMethod) throw new HttpsError('not-found', 'طريقة الدفع غير متوفرة.');

        const userRef = db.collection('telecard_users').doc(uid);
        return await db.runTransaction(async (transaction) => {
            const pendingSnap = await transaction.get(db.collection('telecard_deposits').where('userId', '==', uid).where('method', '==', paymentMethodName).where('status', '==', 'pending').limit(1));
            if (!pendingSnap.empty) throw new HttpsError('already-exists', 'لديك طلب إيداع معلق.');

            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');
            const userData = userSnap.data();

            const baseCurr = String(userData.baseCurrency || 'USD').toUpperCase();
            let fee = parseFloat(paymentMethod.fee) || 0;
            let feeType = paymentMethod.feeType || 'fee';
            let feeUnit = paymentMethod.feeUnit || 'percent';

            if (paymentMethod.currencySettings && paymentMethod.currencySettings[payCurr]) {
                const s = paymentMethod.currencySettings[payCurr];
                fee = parseFloat(s.fee) || 0; feeType = s.feeType || 'fee'; feeUnit = s.feeUnit || 'percent';
            }

            let feeAmount = (feeUnit === 'fixed' || feeUnit === 'amount') ? fee : amount * (fee / 100);
            let netPayCurr = feeType === 'bonus' ? amount + feeAmount : amount - feeAmount;

            let safeNetBase = netPayCurr;
            if (payCurr !== baseCurr) {
                 safeNetBase = FinancialEngine.convertViaUSD(netPayCurr, payCurr, baseCurr, cache.rates, 'deposit');
            }
            
            safeNetBase = Math.floor(safeNetBase * 10000) / 10000; 

            const cleanId = generateUniqueId(); 
            transaction.update(userRef, { lastDepositReqTime: Date.now() });
            transaction.set(db.collection('telecard_deposits').doc(cleanId), {
                id: cleanId, displayId: cleanId, userId: uid, method: paymentMethodName,
                amount, currency: payCurr, creditedAmount: safeNetBase, status: 'pending',
                time: admin.firestore.FieldValue.serverTimestamp(), receipt: data.receiptData || null
            });

            return { success: true, message: 'تم استلام طلب الإيداع وهو قيد المراجعة.' };
        });
    } catch (error) { 
        // 🚨 [تحديث أمني]: كشف "الجاني" في سجلات جوجل فوراً عند الانهيار
        console.error("DEPOSIT_PROCESS_CRASH:", error.message, error.stack);
        if (error instanceof HttpsError) throw error; 
        throw new HttpsError('internal', `تعذر إرسال الطلب: ${error.message}`); 
    }
});

// ... (باقي الملف وتصدير الدوال الأخرى كما هي) ...

// ==========================================
// 👑 5. دوال الإدارة والعمليات المالية
// ==========================================

exports.adminToggleUserBan = onCall({ region: 'us-east1' }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح لك.');
    const { targetUid, isBanned, reason } = request.data;
    if (!targetUid) throw new HttpsError('invalid-argument', 'معرف المستخدم مفقود.');
    try {
        await db.collection('telecard_users').doc(targetUid).update({
            isBanned: isBanned, banReason: reason || '', bannedAt: isBanned ? admin.firestore.FieldValue.serverTimestamp() : null
        });
        const userRecord = await admin.auth().getUser(targetUid);
        const currentClaims = userRecord.customClaims || {};
        currentClaims.banned = isBanned;
        await admin.auth().setCustomUserClaims(targetUid, currentClaims);
        if (isBanned) await admin.auth().revokeRefreshTokens(targetUid);

        await logAdminAction(request.auth.uid, 'TOGGLE_BAN', `Target: ${targetUid}, isBanned: ${isBanned}, Reason: ${reason}`);

        return { success: true, message: isBanned ? 'تم حظر المستخدم وتدمير جلساته بنجاح.' : 'تم رفع الحظر بنجاح.' };
    } catch (error) { throw new HttpsError('internal', `فشل تطبيق إجراء الحظر: ${error.message}`); }
});

exports.adminProcessOrder = onCall({ region: 'us-east1' }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { orderId, action, adminNote } = request.data;
    const validActions = ['completed', 'rejected', 'refunded', 'returned', 'processing'];
    if (!validActions.includes(action)) throw new HttpsError('invalid-argument', 'حالة الطلب غير صالحة.');
    
    return await db.runTransaction(async (transaction) => {
        const orderRef = db.collection('telecard_orders').doc(String(orderId));
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
        
        const orderData = orderSnap.data();
        if (orderData.status === action) throw new HttpsError('failed-precondition', 'الحالة مطابقة.');
        
        const isRefundingAction = ['rejected', 'refunded', 'returned'].includes(action);
        const wasAlreadyRefunded = ['rejected', 'refunded', 'returned'].includes(orderData.status);
        if (action === 'completed' && wasAlreadyRefunded) throw new HttpsError('failed-precondition', 'لا يمكن إكمال طلب مسترجع.');

        let userRef = db.collection('telecard_users').doc(String(orderData.userId));
        let newWalletBal = 0; 
        
        if (isRefundingAction && !wasAlreadyRefunded) {
            const userSnap = await transaction.get(userRef);
            if (userSnap.exists) {
                const ud = userSnap.data();
                newWalletBal = safeAdd(ud.walletBalance || 0, Number(orderData.price || 0));
                transaction.update(userRef, { walletBalance: newWalletBal, balance: newWalletBal, totalSpent: safeSub(ud.totalSpent || 0, Number(orderData.price || 0)), tierCycleSpent: safeSub(ud.tierCycleSpent || 0, Number(orderData.price || 0)) });
            }
            if (orderData.couponCode) {
                const cQuery = await db.collection('telecard_coupons').where('code', '==', orderData.couponCode).limit(1).get();
                if (!cQuery.empty) transaction.update(cQuery.docs[0].ref, { usedCount: admin.firestore.FieldValue.increment(-1) });
            }
        }
        
        let orderUpdateObj = { status: action, adminNote: String(adminNote || ''), actionTime: admin.firestore.FieldValue.serverTimestamp() };
        if (isRefundingAction && !wasAlreadyRefunded) orderUpdateObj.balanceAfter = newWalletBal;
        transaction.update(orderRef, orderUpdateObj);

        await logAdminAction(request.auth.uid, 'PROCESS_ORDER', `Order: ${orderId}, Action: ${action}, Note: ${adminNote}`);

        return { success: true, message: `تم تحديث الطلب إلى ${action}.` };
    });
});

exports.adminProcessDeposit = onCall({ region: 'us-east1' }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { depositId, action, adminNote } = request.data;
    const validActions = ['approved', 'rejected', 'refunded'];
    if (!validActions.includes(action)) throw new HttpsError('invalid-argument', 'إجراء غير صالح.');

    return await db.runTransaction(async (transaction) => {
        const depRef = db.collection('telecard_deposits').doc(String(depositId));
        const depSnap = await transaction.get(depRef);
        if (!depSnap.exists) throw new HttpsError('not-found', 'الإيداع غير موجود.');
        
        const depData = depSnap.data();
        if (depData.status === action) throw new HttpsError('failed-precondition', 'هذه هي الحالة الحالية.');
        if (action === 'refunded' && depData.status !== 'approved') throw new HttpsError('failed-precondition', 'يجب أن يكون مقبولاً أولاً.');
        if ((action === 'approved' || action === 'rejected') && depData.status !== 'pending') throw new HttpsError('failed-precondition', 'تمت المعالجة مسبقاً.');
        
        let userRef = db.collection('telecard_users').doc(String(depData.userId));
        let newWalletBal = 0; 
        
        if (action === 'approved' || action === 'refunded') {
            const userSnap = await transaction.get(userRef);
            if (userSnap.exists) {
                const ud = userSnap.data();
                const amt = Number(depData.creditedAmount || depData.amount || 0);
                newWalletBal = action === 'approved' ? safeAdd(ud.walletBalance || 0, amt) : safeSub(ud.walletBalance || 0, amt);
                transaction.update(userRef, { walletBalance: newWalletBal, balance: newWalletBal, totalDeposit: action === 'approved' ? safeAdd(ud.totalDeposit || 0, amt) : safeSub(ud.totalDeposit || 0, amt) });
            }
        }
        
        let depUpdateObj = { status: action, adminNote: String(adminNote || ''), actionTime: admin.firestore.FieldValue.serverTimestamp() };
        if (action === 'approved' || action === 'refunded') depUpdateObj.balanceAfter = newWalletBal;
        transaction.update(depRef, depUpdateObj);

        await logAdminAction(request.auth.uid, 'PROCESS_DEPOSIT', `Deposit: ${depositId}, Action: ${action}, Note: ${adminNote}`);

        return { success: true, message: `تم تحويل الحالة إلى ${action}.` };
    });
});

exports.adminAdjustBalance = onCall({ region: 'us-east1' }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'عملية غير مصرح بها.');
    const { userId, type, amount, adminName } = request.data;
    const adjustAmount = Number(amount);
    
    if (isNaN(adjustAmount) || adjustAmount <= 0 || adjustAmount > SYSTEM_LIMITS.MAX_SAFE_AMOUNT) {
        throw new HttpsError('out-of-range', 'مبلغ غير صالح أو يتجاوز السقف الآمن المسموح به للإدارة.');
    }

    const userRef = db.collection('telecard_users').doc(String(userId));
    try {
        return await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new HttpsError('not-found', 'العميل غير موجود.');

            const userData = userDoc.data();
            const currentBal = Number(userData.walletBalance || userData.balance || 0);

            if (type === 'subtract' && adjustAmount > currentBal) throw new HttpsError('failed-precondition', 'الرصيد غير كافٍ.');

            const cleanDepositId = generateUniqueId(); 
            const depositRef = db.collection('telecard_deposits').doc(cleanDepositId);

            const newBal = type === 'add' ? safeAdd(currentBal, adjustAmount) : safeSub(currentBal, adjustAmount);
            const newTotalDep = type === 'add' ? safeAdd(userData.totalDeposit || 0, adjustAmount) : Number(userData.totalDeposit || 0);
            const newTotalSpent = Number(userData.totalSpent || 0); 
            const currency = (userData.baseCurrency || 'USD').toUpperCase();

            transaction.update(userRef, { walletBalance: newBal, balance: newBal, wallet_balance: newBal, totalDeposit: newTotalDep, totalSpent: newTotalSpent });
            transaction.set(depositRef, {
                id: cleanDepositId, displayId: cleanDepositId, userId: String(userId), userName: userData.name || userData.fullName || '---',
                amount: adjustAmount, currency: currency, creditedAmount: type === 'add' ? adjustAmount : -adjustAmount,
                method: type === 'add' ? 'إيداع إداري' : 'خصم إداري', status: 'approved', balanceAfter: newBal, 
                time: admin.firestore.FieldValue.serverTimestamp(), admin: String(adminName || 'النظام').substring(0, 100)
            });

            await logAdminAction(request.auth.uid, 'ADJUST_BALANCE', `User: ${userId}, Type: ${type}, Amount: ${amount}`);

            return { success: true, newBalance: newBal };
        });
    } catch (error) { throw new HttpsError('internal', error.message || 'فشلت العملية المالية.'); }
});

exports.adminAuditUserWallet = onCall({ region: 'us-east1' }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح لك.');
    const targetUserId = String(request.data.userId);
    if (!targetUserId) throw new HttpsError('invalid-argument', 'يرجى تمرير ID العميل.');

    try {
        const userRef = db.collection('telecard_users').doc(targetUserId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) throw new HttpsError('not-found', 'العميل غير موجود.');

        const AggregateField = admin.firestore.AggregateField;
        const [ordersAgg, depApprovedAgg, depRefundedAgg] = await Promise.all([
            db.collection('telecard_orders').where('userId', '==', targetUserId).where('status', '==', 'completed').aggregate({ totalSpent: AggregateField.sum('price') }).get(),
            db.collection('telecard_deposits').where('userId', '==', targetUserId).where('status', '==', 'approved').aggregate({ totalDep: AggregateField.sum('creditedAmount') }).get(),
            db.collection('telecard_deposits').where('userId', '==', targetUserId).where('status', '==', 'refunded').aggregate({ totalRefund: AggregateField.sum('creditedAmount') }).get() 
        ]);

        const realTotalDeposit = Math.max(0, safeSub(depApprovedAgg.data().totalDep || 0, depRefundedAgg.data().totalRefund || 0));
        const realTotalSpent = ordersAgg.data().totalSpent || 0;
        const expectedBalance = Math.max(0, safeSub(realTotalDeposit, realTotalSpent));

        await userRef.update({ totalSpent: realTotalSpent, totalDeposit: realTotalDeposit, walletBalance: expectedBalance, balance: expectedBalance });

        await logAdminAction(request.auth.uid, 'AUDIT_WALLET', `User: ${targetUserId} audited. Corrected Balance: ${expectedBalance}`);

        return { success: true, message: 'تم التصحيح بنجاح!', data: { spent: realTotalSpent, deposit: realTotalDeposit, balance: expectedBalance } };
    } catch (error) { throw new HttpsError('internal', `فشل التدقيق: ${error.message}`); }
});

exports.grantAdminRole = onCall({ region: 'us-east1', secrets: [ROOT_OWNER_UID] }, async (request) => {
    if (!request.auth || request.auth.uid !== ROOT_OWNER_UID.value()) throw new HttpsError('permission-denied', 'غير مصرح لك.');
    const targetEmail = request.data.email;
    if (!targetEmail) throw new HttpsError('invalid-argument', 'الرجاء إدخال البريد الإلكتروني.');
    try {
        const user = await admin.auth().getUserByEmail(targetEmail);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });

        await logAdminAction(request.auth.uid, 'GRANT_ADMIN', `Granted admin role to: ${targetEmail}`);

        return { success: true, message: `تم منح رتبة الأدمن للحساب: ${targetEmail}` };
    } catch (error) { throw new HttpsError('internal', `فشل المنح: ${error.message}`); }
});

// ==========================================
// 🪪 6. استكمال هوية الحساب (KYC) - مصفح بالكامل
// ==========================================
exports.completeUserIdentity = onCall({ region: 'us-east1', enforceAppCheck: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    checkBanStatus(request);
    
    const uid = request.auth.uid;
    const { country, phone, currency } = request.data;
    const cleanCurrency = String(currency || '').trim().toUpperCase();
    
    return await db.runTransaction(async (transaction) => {
        const userRef = db.collection('telecard_users').doc(uid);
        const userSnap = await transaction.get(userRef);
        const userData = userSnap.data();
        
        // 🛑 [الدرع المزدوج العبقري]: يمنع تغيير العملة إذا كان الحساب موثقاً، أو إذا كان يمتلك أي رصيد!
        const hasBalance = Number(userData.walletBalance || userData.balance || 0) > 0;
        
        if (userData.isVerified === true || hasBalance) {
            throw new HttpsError('permission-denied', 'عملية مرفوضة: لا يمكن تغيير عملة المحفظة الأساسية بعد اعتمادها أو وجود رصيد مالي.');
        }
        
        transaction.update(userRef, {
            country: String(country || '').trim(),
            phone: String(phone || '').trim(),
            baseCurrency: cleanCurrency,
            base_currency: cleanCurrency,
            isVerified: true, // 🔒 قفل الحساب للأبد
            identityCompletedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, lockedCurrency: cleanCurrency };
    });
});
// ==========================================
// 📊 7. محرك الإحصائيات (العودة لبر الأمان عبر Aggregation)
// ==========================================
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
    
    await db.collection('telecard_system').doc('singleton').set({ 
        globalStats: {
            financials: { totalRevenue: Number((financials.data().revenue || 0).toFixed(4)), totalCost: Number((financials.data().cost || 0).toFixed(4)), totalProfit: Number((financials.data().profit || 0).toFixed(4)) },
            orders: { total: ordersTotal.data().count, completed: ordersCompleted.data().count, rejected: ordersRejected.data().count, refunded: ordersRefunded.data().count },
            deposits: { total: depTotal.data().count, approved: depApproved.data().count, rejected: depRejected.data().count, refunded: depRefunded.data().count }, daily: {}
        }
    }, { merge: true });
};

exports.scheduledStatsAggregation = onSchedule({ schedule: 'every 6 hours', region: 'us-east1' }, async (event) => {
    try { await performStatsRecalculation(); } catch (error) { console.error("Stats Error:", error); }
});

exports.calculateStoreStatsCloud = onCall({ region: 'us-east1' }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try { await performStatsRecalculation(); return { success: true, message: 'تم بناء الإحصائيات المركزية بنجاح.' }; }
    catch (error) { throw new HttpsError('internal', `فشل السيرفر: ${error.message}`); }
});

exports.getServerTime = onCall({ region: 'us-east1' }, (request) => { return { success: true, serverTime: Date.now() }; });

exports.onSettingsUpdate = onDocumentUpdated({ document: 'telecard_settings/singleton', region: 'us-east1' }, async (event) => {
    cacheOrder.lastFetch = 0;
    cacheDeposit.lastFetch = 0;
    console.log("[SECURITY ALERT] Cache purged due to settings update.");
});

// ==========================================
// 🛡️ 8. المزامنة الآمنة (Product & Tier Sync)
// ==========================================
exports.secureProductSync = onDocumentWritten({ document: 'telecard_prods/{productId}', region: 'us-east1', retry: true }, async (event) => {
    const productId = event.params.productId;
    const publicProdRef = db.collection('telecard_prods_public').doc(productId);
    
    if (!event.data.after.exists) return publicProdRef.delete(); 
    
    const prodData = event.data.after.data();
    const tiersData = await loadTiersCache(); 
    const tierPrices = {};
    
    // 🌟 [تحديث أمني V4.4]: إجبار المزامنة على استخدام المحرك المالي
    tiersData.forEach(tier => {
        try {
            const pricing = FinancialEngine.calculatePrice({ product: prodData, tier: tier });
            tierPrices[tier.id] = pricing.finalPrice;
        } catch(e) {
            console.error(`Sync error for prod ${productId} tier ${tier.id}:`, e);
        }
    });
    
    const publicData = { ...prodData, tierPrices };
    delete publicData.costPrice; delete publicData.cost_price; delete publicData.providerId; delete publicData.apiToken; 
    return publicProdRef.set(publicData, { merge: true });
});

exports.onTierUpdate = onDocumentUpdated({ document: 'telecard_tiers/{tierId}', region: 'us-east1', retry: true }, async (event) => {
    const tierId = event.params.tierId;
    const oldTier = event.data.before.data();
    const newTier = event.data.after.data();

    if (oldTier.profitPercent === newTier.profitPercent && oldTier.minProfitUsd === newTier.minProfitUsd) return null;

    const prodsSnap = await db.collection('telecard_prods').get();
    const batchChunks = [];
    let currentBatch = db.batch();
    let count = 0;

    prodsSnap.forEach(doc => {
        const prodData = doc.data();
        try {
            // 🌟 [تحديث أمني V4.4]: إجبار تحديث المستويات على استخدام المحرك المالي
            const pricing = FinancialEngine.calculatePrice({ product: prodData, tier: newTier });
            currentBatch.set(db.collection('telecard_prods_public').doc(doc.id), { tierPrices: { [tierId]: pricing.finalPrice } }, { merge: true });
            count++;
        } catch(e) {
            console.error(`Tier Update error for prod ${doc.id}:`, e);
        }
        if (count === 450) { batchChunks.push(currentBatch); currentBatch = db.batch(); count = 0; }
    });

    if (count > 0) batchChunks.push(currentBatch);
    for (let batch of batchChunks) await batch.commit();
    return { success: true };
});

// ==========================================
// 🔔 9. الإشعارات الآلية (Idempotent)
// ==========================================
exports.autoNotifyOrderStatus = onDocumentUpdated({ document: 'telecard_orders/{orderId}', region: 'us-east1', retry: true }, async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === after.status) return null;
    
    const orderId = event.params.orderId;

    let title = "تحديث حالة الطلب", message = `تم تغيير حالة طلبك رقم ${after.displayId || after.id} إلى ${after.status}`;
    if (after.status === 'completed') { title = "🎉 تم تسليم طلبك بنجاح!"; message = `تم إكمال طلبك لشراء ( ${after.product} ) بنجاح.`; } 
    else if (after.status === 'rejected') { title = "❌ تم رفض طلب الشراء"; message = `عذراً، تعذر إكمال طلبك لشراء ( ${after.product} ). السبب: ${after.adminNote || 'راجع الدعم'}`; } 
    else if (after.status === 'refunded') { title = "↩️ تم استرجاع الطلب"; message = `تم استرجاع قيمة طلبك لشراء ( ${after.product} ) للمحفظة.`; }

    const notifId = `notif_${orderId}_${after.status}`;
    return db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({
        id: notifId, title, message, type: 'notification', jumpTarget: 'order', createdAt: Date.now()
    });
});

exports.autoNotifyDepositStatus = onDocumentUpdated({ document: 'telecard_deposits/{depositId}', region: 'us-east1', retry: true }, async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === after.status) return null;

    const depositId = event.params.depositId;

    let title = "تحديث طلب الإيداع", message = `تم تغيير حالة طلب الإيداع إلى ${after.status}`;
    if (after.status === 'approved') { title = "💰 تم قبول الإيداع!"; message = `تم شحن ${after.amount} ${after.currency || 'USD'} بمحفظتك!`; } 
    else if (after.status === 'rejected') { title = "❌ تم رفض الإيداع"; message = `عذراً، تم رفض طلبك. السبب: ${after.adminNote || 'راجع الدعم'}`; } 
    else if (after.status === 'refunded') { title = "↩️ تم استرجاع الإيداع"; message = `تم سحب إيداع بقيمة ${after.amount} ${after.currency || 'USD'}.`; }

    const notifId = `notif_${depositId}_${after.status}`;
    return db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({
        id: notifId, title, message, type: 'notification', jumpTarget: 'wallet', createdAt: Date.now()
    });
});

// ==========================================
// 🔗 10. تصدير دوال ربط الموردين
// ==========================================
const developerApi = require('./developerApi.js');
const supplierEngine = require('./supplierEngine.js');

exports.orderStatusWebhook = onRequest({ region: 'us-east1', secrets: [SUPPLIER_WEBHOOK_TOKEN] }, async (req, res) => {
    const token = req.headers['x-telecard-webhook-token'];
    
    if (!token || token !== SUPPLIER_WEBHOOK_TOKEN.value()) {
        console.error(`[SECURITY ALERT] Unauthorized Webhook Attempt from IP: ${req.ip}`);
        return res.status(401).send('Unauthorized: Invalid Security Token');
    }

    return developerApi.orderStatusWebhook(req, res);
});

exports.externalCreateOrder = developerApi.externalCreateOrder;
exports.syncSupplierData = supplierEngine.syncSupplierData;
exports.scheduledSupplierSync = supplierEngine.scheduledSupplierSync;
exports.secureSaveSupplier = supplierEngine.secureSaveSupplier;