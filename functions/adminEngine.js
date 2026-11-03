// ============================================================================
// 👑 محرك الإدارة والـ BI والتدقيق المالي (functions/adminEngine.js) - V37.7.0 💎
// 🎯 الوظيفة: معالجة الطلبات والإيداعات إدارياً، تقارير الـ BI، التدقيق المالي، وإدارة العملاء.
// 🚀 التحديث (V37.7.0 - Deleted Accounts Paging, Ban Guard, Strict Limits & Schema Unification):
// 1. Deleted Accounts Paging 🔍: استكمال عدد الصفحة عند جلب العملاء وتخطي الحسابات المحذوفة بذكاء دون فهارس.
// 2. Ban Status Guard 🛡️: منع تعديل حالة الحظر لحساب محذوف نهائياً لحماية عدادات لوحة القيادة.
// 3. Deleted User Sanitization 🧹: تصفير tierClimbs و devicePrints عند حذف حساب العميل (Soft Delete).
// 4. Strict Limits 📦: توحيد الحد الأقصى للمنتجات العادية (MAX_QTY_PER_ORDER) إلى 100 كود.
// 5. Schema Unification 🔗: توحيد حقول الإيداعات (currency, balanceAfter, creditedBaseUsd, actionTime, admin) وإحصائيات الأجهزة المحظورة (bannedDevices).
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const crypto = require('crypto');
const FinancialEngine = require('./financialEngine.js');
const SecurityEngine = require('./securityEngine.js');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const SYSTEM_LIMITS = {
    MAX_QTY_PER_ORDER: 100, // 🛡️ تم التوحيد إلى 100 بدلاً من 200
    MAX_COUNTER_QTY_PER_ORDER: 5000000,
    MAX_VAULT_QTY_PER_ORDER: 100,
    MAX_SAFE_AMOUNT: 20000,
    MAX_URL_LENGTH: 1000,
    MAX_NOTE_LENGTH: 500
};
const sanitizeAmount = (amount) => FinancialEngine.sanitizeAmount(amount);
const safeAdd = (a, b) => FinancialEngine.safeAdd(a, b);
const safeSub = (a, b) => Math.max(0, FinancialEngine.safeSub(a, b));
const strictSub = (a, b) => FinancialEngine.safeSub(a, b);
const isMasterAdmin = (request) => SecurityEngine.isMasterAdmin(request);
const logAdminAction = (adminUid, action, details) => SecurityEngine.logAdminAction(db, admin, adminUid, action, details);

// ==========================================
// 🛡️ دالة التدقيق المالي المركزية (Helper Function)
// ==========================================
const performWalletAudit = async (userId, dbInstance, preloadedUserData = null) => {
    let userData = preloadedUserData;
    if (!userData) {
        const userRef = dbInstance.collection('telecard_users').doc(String(userId));
        const userSnap = await userRef.get();
        if (!userSnap.exists) return { isValid: true, status: 'not_found' };
        userData = userSnap.data();
    }
    const currentWalletBal = Number(userData.walletBalance || 0);

    const AggregateField = admin.firestore.AggregateField;

    // 1. حساب إجمالي الإيداعات
    const depositsAgg = await dbInstance.collection('telecard_deposits')
        .where('userId', '==', String(userId))
        .where('status', 'in', ['approved', 'deducted'])
        .aggregate({ totalDepositsLocal: AggregateField.sum('creditedAmount') })
        .get();

    // 2. حساب إجمالي المشتريات
    const ordersAgg = await dbInstance.collection('telecard_orders')
        .where('userId', '==', String(userId))
        .where('status', 'in', ['completed', 'pending', 'processing'])
        .aggregate({ totalSpentLocal: AggregateField.sum('priceLocalDeducted') })
        .get();

    const realDeposits = sanitizeAmount(depositsAgg.data().totalDepositsLocal || 0);
    const realSpent = sanitizeAmount(ordersAgg.data().totalSpentLocal || 0);

    // 🛡️ استخدام strictSub لإظهار الأرصدة المكشوفة بالسالب واكتشاف التلاعب
    const expectedBalance = sanitizeAmount(strictSub(realDeposits, realSpent));
    const difference = Math.abs(currentWalletBal - expectedBalance);
    const isValid = difference <= 0.01 && expectedBalance >= -0.01;

    return {
        isValid,
        userId: userId,
        status: 'ok',
        currentWalletBal,
        expectedBalance,
        realDeposits,
        realSpent,
        difference: sanitizeAmount(difference),
        userDataSnapshot: { email: userData.email, phone: userData.phone, name: userData.fullName }
    };
};

// ==========================================
// 👑 1. دوال الإدارة والعمليات المالية
// ==========================================

exports.adminUpdateUserTier = onCall({ enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { userId, newTierId, manualOverride } = request.data || {};
    if (!userId || !newTierId) throw new HttpsError('invalid-argument', 'بيانات العميل أو المستوى مفقودة.');
    
    try {
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('telecard_users').doc(String(userId));
            const tierRef = db.collection('telecard_tiers').doc(String(newTierId));
            
            const [userSnap, tierSnap] = await Promise.all([transaction.get(userRef), transaction.get(tierRef)]);
            if (!userSnap.exists) throw new HttpsError('not-found', 'العميل غير موجود.');
            if (userSnap.data().isDeleted === true) {
                throw new HttpsError('failed-precondition', 'لا يمكن تعديل مستوى حساب محذوف نهائياً.');
            }
            if (!tierSnap.exists) throw new HttpsError('not-found', 'المستوى المحدد غير موجود في قاعدة البيانات.');
            
            const tierData = tierSnap.data();
            const isApiTier = tierData.type === 'api';
            
            transaction.update(userRef, {
                tierId: String(newTierId),
                cycleStartTierId: String(newTierId),
                tierClimbs: [],
                manualTierOverride: Boolean(manualOverride),
                isApiMerchant: isApiTier,
                tierCycleStartDate: admin.firestore.FieldValue.serverTimestamp(),
                tierStreakStartDate: admin.firestore.FieldValue.serverTimestamp(),
                tierCycleSpent: 0
            });
        });
        await logAdminAction(request.auth.uid, 'CHANGE_TIER', `User: ${userId}, New Tier: ${newTierId}`);
        return { success: true, message: 'تم تحديث المستوى بأمان.' };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `فشل التحديث: ${error.message}`);
    }
});

// ==========================================
// 👑 2. معالجة الطلبات الإدارية (All-Reads-First Architecture)
// ==========================================
exports.adminProcessOrder = onCall({ enforceAppCheck: false }, async (request) => {
    try {
        if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
        const data = request.data || {};
        
        let { orderId, action, adminNote, deliveredCode: manualDeliveredCode } = data;
        const safeAdminNote = SecurityEngine.sanitizeText(String(adminNote || ''), SYSTEM_LIMITS.MAX_NOTE_LENGTH);
        const validActions = ['completed', 'rejected', 'refunded', 'returned', 'processing'];
        if (!validActions.includes(action)) throw new HttpsError('invalid-argument', 'حالة غير صالحة.');
        
        const orderRef = db.collection('telecard_orders').doc(String(orderId));
        let keysBurnedCount = 0, keysRestoredCount = 0;
        let finalMsg = `تم تحديث الطلب إلى ${action}`;

        try {
            await SecurityEngine.withCollisionRetry(2, 'AdminProcessOrder', async () => {
                const initialOrderSnap = await orderRef.get();
                const initialStatusOutside = initialOrderSnap.exists ? initialOrderSnap.data().status : null;
                
                if (initialOrderSnap.exists) {
                    const ord = initialOrderSnap.data();

                    // 🛡️ درع الفحص الاستباقي + اليد العليا للإدمن (Two-Step Soft Lock) لطلبات الموردين:
                    if (['rejected', 'refunded', 'returned', 'completed'].includes(action) && ord.supplierId && ['pending', 'processing'].includes(ord.status)) {
                        const nowMs = Date.now();
                        const orderCreatedMs = FinancialEngine.parseSafeTime(ord.time || ord.createdAt) || 0;

                        // 1. حماية أول دقيقتين فقط أثناء الاتصال المباشر الحي (processing)
                        if (ord.status === 'processing' && orderCreatedMs > 0 && (nowMs - orderCreatedMs) < 120000) {
                            throw new HttpsError(
                                'failed-precondition',
                                '⏳ هذا الطلب قيد الاتصال المباشر مع سيرفر المورد في هذه اللحظة. يرجى الانتظار دقيقتين قبل التدخل اليدوي.'
                            );
                        }

                        // 2. فحص استباقي حي من سيرفر المورد قبل تنفيذ قرار الإدمن
                        if (ord.externalOrderId) {
                            const SupplierEngine = require('./supplierEngine.js');
                            const liveCheck = await SupplierEngine.checkSingleSupplierOrderLive(ord.supplierId, ord.externalOrderId);                           
                            
                            // أ. إذا كان المورد قد نفّذ الطلب بالفعل -> نعتمد كود المورد فوراً سواء كان الإدمن يريد قبوله أو إنقاذه من الرفض
                            if (liveCheck && liveCheck.status === 'completed') {
                                const resolvedSupplierCode = liveCheck.deliveredCode || manualDeliveredCode || 'تم التنفيذ بنجاح عبر المزود المباشر';
                                await SupplierEngine.finalizeDeferredSupplierOrder(orderId, {
                                    status: 'completed',
                                    deliveredCode: resolvedSupplierCode,
                                    externalOrderId: ord.externalOrderId,
                                    actualCostRaw: liveCheck.actualCostRaw
                                }, db);

                                if (['rejected', 'refunded', 'returned'].includes(action)) {
                                    finalMsg = '🎉 تنبيه هام: عند فحص المورد الآن تبيّن أن المورد قد أكمل هذا الطلب بالفعل! تم إنقاذ الطلب واعتماده للعميل تلقائياً بدلاً من رفضه.';
                                    action = 'rescued_completed';
                                } else {
                                    finalMsg = `🎉 تم التحقق من المورد بنجاح: تم تنفيذ الطلب وتسليم الكود (${resolvedSupplierCode}) للعميل.`;
                                }
                                return;
                            }

                            // ب. إذا كان الإدمن يريد رفضه والمورد رافضه فعلاً -> نسمح بالرفض الفوري من أول نقرة دون تحذير!
                            const isSupplierAlreadyRejected = Boolean(liveCheck && liveCheck.status === 'rejected' && ['rejected', 'refunded', 'returned'].includes(action));
// ج. إذا كان ما زال معلقاً عند المورد (أو مرفوضاً عند المورد والإدمن يحاول قبوله) -> نطبق نظام النقرتين
if (!isSupplierAlreadyRejected) {
    const lastWarnedMs = Number(ord.adminRejectWarnedAt || 0);
    const isConfirmedSecondClick = (lastWarnedMs > 0 && (nowMs - lastWarnedMs) < 5 * 60 * 1000) || safeAdminNote.includes('تأكيد');
    
    if (!isConfirmedSecondClick) {
        await orderRef.update({ adminRejectWarnedAt: nowMs });
        const actionLabel = action === 'completed' ? 'قبول' : 'رفض';
        const supplierStateDesc = (liveCheck && liveCheck.status === 'rejected') ?
            'وهو (مرفوض ❌) هناك حالياً!' :
            'وما زال (معلقاً ⏳) هناك!';
        throw new HttpsError(
            'failed-precondition',
            `⚠️ تنبيه للإدمن: هذا الطلب مرتبط بمورد (رقم الطلب عند المورد: #${ord.externalOrderId}) ${supplierStateDesc} ${actionLabel} الطلب هنا لا يغير حالته عند المورد. يرجى تفقد حالة الطلب عند المورد أولاً، وإذا أردت فرض الـ (${actionLabel}) اضغط على الزر مرة ثانية الآن.`
        );
    }
}
} else {
    // د. طلب مورد معلق بدون رقم مرجعي خارجي (انقطع الاتصال لحظة الشراء): نطبق نظام النقرتين الإلزامي
    const lastWarnedMs = Number(ord.adminRejectWarnedAt || 0);
    const isConfirmedSecondClick = (lastWarnedMs > 0 && (nowMs - lastWarnedMs) < 5 * 60 * 1000) || safeAdminNote.includes('تأكيد');
    
    if (!isConfirmedSecondClick) {
        await orderRef.update({ adminRejectWarnedAt: nowMs });
        const actionLabel = action === 'completed' ? 'قبول' : 'رفض';
        throw new HttpsError(
            'failed-precondition',
            `⚠️ تحذير مالي للإدمن: هذا الطلب مرتبط بمورد ولكن انقطع الاتصال لحظة الشراء (لا يوجد رقم مرجعي للمورد). يرجى مراجعة سجل الطلبات في موقع المورد يدوياً أولاً، وإذا أردت فرض الـ (${actionLabel}) اضغط على الزر مرة ثانية الآن.`
        );
    }
}
}                }

                await db.runTransaction(async (transaction) => {
                    keysBurnedCount = 0; keysRestoredCount = 0;
                    
                    const liveOrderSnap = await transaction.get(orderRef);
                    if (!liveOrderSnap.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
                    const liveOrder = liveOrderSnap.data();
                    const previousStatus = liveOrder.status;

                    const orderAudit = SecurityEngine.decryptOrderAudit(liveOrder._auditToken);
                    const auditedProfitUsd = Number(orderAudit.netProfitUsd ?? liveOrder.pricingSnapshot?.netProfitUsd ?? liveOrder.pricingSnapshot?.profit ?? 0);
                    const auditedCostUsd = Number(orderAudit.costUsd ?? liveOrder.pricingSnapshot?.costUsd ?? 0);
                    const auditedSupplierId = orderAudit.supplierId || liveOrder.supplierId || null;

                    const priceToRefundLocal = Number(liveOrder.priceLocalDeducted ?? liveOrder.price ?? 0);
                    const priceToDeductTierUsd = Number(liveOrder.priceBaseUsd ?? liveOrder.price ?? 0);
                    const serverNowMs = admin.firestore.Timestamp.now().toMillis();

                    const userRef = db.collection('telecard_users').doc(String(liveOrder.userId));
                    const pricingCacheRef = db.collection('telecard_system').doc('active_pricing');
                    
                    // 🛡️ الاعتماد الحصري على vaultPoolId المسجل في وثيقة الطلب نفسها عند الاسترجاع
                    const poolId = liveOrder.vaultPoolId || null;
                    const vRef = (poolId && ['rejected', 'refunded', 'returned'].includes(action)) ? db.collection('telecard_vault').doc(String(poolId)) : null;
                    const prodRefForRefund = liveOrder.prodId ? db.collection('telecard_prods').doc(String(liveOrder.prodId)) : null;

                    const [userSnap, pricingSnap, vSnap, prodSnap] = await Promise.all([
                        transaction.get(userRef),
                        transaction.get(pricingCacheRef),
                        vRef ? transaction.get(vRef) : Promise.resolve(null),
                        prodRefForRefund ? transaction.get(prodRefForRefund) : Promise.resolve(null)
                    ]);

                    let tiersData = [];
                    if (pricingSnap && pricingSnap.exists && Array.isArray(pricingSnap.data().tiers)) {
                        tiersData = pricingSnap.data().tiers;
                    } else {
                        const tiersSnap = await transaction.get(db.collection('telecard_tiers'));
                        tiersData = tiersSnap.docs.map(t => ({ id: t.id, ...t.data() }));
                    }

                    let keysToHandle = [];
                    if (['rejected', 'refunded', 'returned'].includes(action) && poolId && vSnap && vSnap.exists) {
                        const kQuerySnap = await transaction.get(vRef.collection('keys').where('orderId', '==', String(orderId)));
                        keysToHandle = kQuerySnap.docs;
                    }

                    let couponSnap = null;
                    const couponCodeToRestore = String(liveOrder.pricingSnapshot?.couponCode || liveOrder.couponCode || '').trim().toUpperCase();
                    if (couponCodeToRestore && ['rejected', 'refunded', 'returned'].includes(action)) {
                        couponSnap = await transaction.get(db.collection('telecard_coupons').where('code', '==', couponCodeToRestore).limit(1));
                    }

                    if (action === 'completed') {
                        if (['completed', 'rejected', 'refunded', 'returned'].includes(previousStatus)) {
                            throw new HttpsError('failed-precondition', 'لا يمكن إكمال طلب تمت معالجته بالفعل.');
                        }
                        const isCounterProd = prodSnap && prodSnap.exists && prodSnap.data()?.type === 'counter';
                        const maxCompletionQty = isCounterProd ? SYSTEM_LIMITS.MAX_COUNTER_QTY_PER_ORDER : SYSTEM_LIMITS.MAX_QTY_PER_ORDER;                
                        if ((liveOrder.qty || 1) > maxCompletionQty) {
                            throw new HttpsError('failed-precondition', 'تجاوز الحد المسموح للكمية.');
                        }

                        const deliveredCodeText = liveOrder.deliveredCode || manualDeliveredCode || null;

                        if (userSnap.exists) {
                            const udBefore = userSnap.data();
                            const upgradeResult = FinancialEngine.processTierUpgrade(udBefore, tiersData, priceToDeductTierUsd, serverNowMs);
                            
                            let userUpdateObj = {
                                totalSpent: upgradeResult.newTotalSpentUsd,
                                tierCycleSpent: upgradeResult.newTierCycleSpentUsd,
                                tierId: upgradeResult.finalTierId,
                                tierClimbs: upgradeResult.tierClimbs,
                                totalOrdersCount: admin.firestore.FieldValue.increment(1)
                            };
                            
                            if (upgradeResult.shouldUpdateCycleStart) {
                                userUpdateObj.tierCycleStartDate = admin.firestore.FieldValue.serverTimestamp();
                            }
                            if (upgradeResult.shouldLockFloorTier) {
                                userUpdateObj.cycleStartTierId = upgradeResult.lockedFloorTierId;
                            }
                            if (upgradeResult.shouldUpdateStreakStart) {
                                userUpdateObj.tierStreakStartDate = admin.firestore.FieldValue.serverTimestamp();
                            }
                            transaction.update(userRef, userUpdateObj);

                            const orderDate = new Date(serverNowMs);
                            const monthKey = `${orderDate.getUTCFullYear()}_${String(orderDate.getUTCMonth() + 1).padStart(2, '0')}`;
                            const statsRef = db.collection('telecard_user_stats').doc(`${liveOrder.userId}_${monthKey}`);
                            transaction.set(statsRef, {
                                userId: liveOrder.userId, 
                                monthKey: monthKey,
                                spentThisMonth: admin.firestore.FieldValue.increment(priceToDeductTierUsd),
                                ordersThisMonth: admin.firestore.FieldValue.increment(1),
                                userName: udBefore.fullName || udBefore.username || 'عميل',
                                userDisplayId: udBefore.displayId || String(liveOrder.userId).substring(0, 8),
                                lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });
                        }

             let orderUpdateObj = {
    status: action,
    isPendingSupplierCheck: admin.firestore.FieldValue.delete(),
    requiresAdminAttention: admin.firestore.FieldValue.delete(),
    adminRejectWarnedAt: admin.firestore.FieldValue.delete(),
    adminNote: safeAdminNote,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    actionTime: admin.firestore.FieldValue.serverTimestamp()
};                        if (manualDeliveredCode) orderUpdateObj.deliveredCode = deliveredCodeText;
                        transaction.update(orderRef, orderUpdateObj);

                    } else if (['rejected', 'refunded', 'returned'].includes(action)) {
                        if (initialStatusOutside !== 'completed' && previousStatus === 'completed' && liveOrder.isAutoDelivered === true && liveOrder.supplierId) {
                            finalMsg = '🎉 تنبيه هام: عند فحص المورد الآن تبيّن أن المورد قد أكمل هذا الطلب بالفعل! تم إنقاذ الطلب واعتماده للعميل تلقائياً بدلاً من رفضه.';
                            return;
                        }
                        if (['rejected', 'refunded', 'returned'].includes(previousStatus)) {
                            throw new HttpsError('failed-precondition', 'تم استرجاع هذا الطلب بالفعل.');
                        }

                        if (poolId && (liveOrder.deliveredCode || keysToHandle.length > 0)) {
                            if (vSnap && vSnap.exists && keysToHandle.length > 0) {
                                keysToHandle.forEach(keyDoc => {
                                    if (previousStatus === 'pending' || previousStatus === 'processing') {
                                        transaction.update(keyDoc.ref, { 
                                            isSold: false, 
                                            orderId: admin.firestore.FieldValue.delete(), 
                                            userId: admin.firestore.FieldValue.delete(), 
                                            soldAt: admin.firestore.FieldValue.delete() 
                                        });
                                        keysRestoredCount++;
                                    } else {
                                        transaction.update(keyDoc.ref, { 
                                            isSold: true, 
                                            isBurned: true, 
                                            refundedAt: admin.firestore.FieldValue.serverTimestamp(), 
                                            refundedOrderId: orderId, 
                                            reason: action, 
                                            originalPoolId: poolId, 
                                            collectionMarker: 'telecard_vault_returned' 
                                        });
                                        keysBurnedCount++;
                                    }
                                });

                                let vaultUpdates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
                                if (previousStatus === 'completed') {
                                    const profitToDeduct = auditedProfitUsd;
                                    vaultUpdates.totalProfit = admin.firestore.FieldValue.increment(-profitToDeduct);
                                    vaultUpdates.totalRevenue = admin.firestore.FieldValue.increment(-priceToDeductTierUsd);
                                }
                                if (keysBurnedCount > 0) vaultUpdates.burnedCount = admin.firestore.FieldValue.increment(keysBurnedCount);
                                if (keysRestoredCount > 0) vaultUpdates.stockCount = admin.firestore.FieldValue.increment(keysRestoredCount);
                                transaction.update(vRef, vaultUpdates);
                            }
                        }

                        if (liveOrder.deliveredCode && previousStatus === 'completed') {
                            const resolvedSupplierId = auditedSupplierId || (prodSnap && prodSnap.exists ? prodSnap.data().supplierId : null);
                            if (resolvedSupplierId || (!poolId && (liveOrder.isApi || liveOrder.source === 'api'))) {
                                const finalSuppId = resolvedSupplierId || 'API_UNKNOWN';
                                const defectRef = db.collection('telecard_supplier_defects').doc();
                                transaction.set(defectRef, {
                                    orderId: String(orderId),
                                    supplierId: finalSuppId,
                                    productName: liveOrder.product,
                                    codeText: liveOrder.deliveredCode,
                                    costUsd: auditedCostUsd,
                                    reportedAt: admin.firestore.FieldValue.serverTimestamp(),
                                    status: 'pending_compensation'
                                });
                                if (!poolId) keysBurnedCount++;
                            }
                        }

                        if (prodSnap && prodSnap.exists) {
                            const prodData = prodSnap.data();
                            const optObj = (prodData.type === 'select' && Array.isArray(prodData.options) && liveOrder.optIdx !== null && liveOrder.optIdx !== undefined) ?
                                prodData.options[liveOrder.optIdx] : null;
                            const isProductCurrentlyLinkedToVault = Boolean((optObj && optObj.vaultPoolId) || prodData.vaultPoolId);

                            let qtyToRestore = 0;
                            const orderQty = liveOrder.qty || 1;
                            
                            if (poolId) {
                                qtyToRestore = keysRestoredCount;
                            } else if (liveOrder.supplierId || liveOrder.externalProdId || isProductCurrentlyLinkedToVault) {
                                qtyToRestore = 0;
                            } else {
                                if (previousStatus === 'completed') {
                                    qtyToRestore = 0;
                                } else {
                                    qtyToRestore = orderQty;
                                }
                            }                       
                            if (qtyToRestore > 0) {
                                let prodUpdates = {};
                                const hasOptStock = optObj && optObj.stockCount !== undefined && optObj.stockCount !== null;
                                const hasDedicatedOptVault = Boolean(optObj && optObj.vaultPoolId && optObj.vaultPoolId !== prodData.vaultPoolId);
                                
                                const isFrozenProd = Boolean(prodData.isAutoFrozen === true || prodData.requiresAdminAttention === true);
                                const isSameOptVault = !liveOrder.vaultPoolId || (optObj && (optObj.vaultPoolId || prodData.vaultPoolId) === poolId);
                                const isSameParentVault = !liveOrder.vaultPoolId || prodData.vaultPoolId === poolId;

                                if (hasOptStock && isSameOptVault) {
                                    const newOptions = [...prodData.options];
                                    newOptions.forEach((opt, idx) => {
                                        if (opt && (idx === liveOrder.optIdx || (poolId && opt.vaultPoolId === poolId))) {
                                            newOptions[idx] = {
                                                ...opt,
                                                stockCount: Number(opt.stockCount || 0) + qtyToRestore,
                                                isAvailable: !isFrozenProd && (opt.isActive !== false)
                                            };
                                        }
                                    });
                                    prodUpdates.options = newOptions;
                                    if (!isFrozenProd) {
                                        prodUpdates.isAvailable = newOptions.some(o => o && o.isActive !== false && String(o.isAvailable) !== 'false' && (o.stockCount === undefined || o.stockCount === null || Number(o.stockCount) > 0));
                                    }
                                } else if (!hasDedicatedOptVault && isSameParentVault && prodData.stockCount !== undefined && prodData.stockCount !== null) {
                                    prodUpdates.stockCount = admin.firestore.FieldValue.increment(qtyToRestore);
                                    if (!isFrozenProd) prodUpdates.isAvailable = true;
                                }                 
                                if (Object.keys(prodUpdates).length > 0) {
                                    transaction.update(prodRefForRefund, prodUpdates);
                                }
                            }
                        }
                        
                        let newWalletBal = 0;            
                        if (userSnap.exists) {
                            const ud = userSnap.data();
                            newWalletBal = sanitizeAmount(safeAdd(ud.walletBalance || 0, priceToRefundLocal)); 
                            let updateObj = { walletBalance: newWalletBal };

                            if (previousStatus === 'completed') {
                                const orderTime = FinancialEngine.parseSafeTime(liveOrder.completedAt || liveOrder.actionTime || liveOrder.time || liveOrder.createdAt) || serverNowMs;
                                const refundTierResult = FinancialEngine.processTierRefund(ud, tiersData, priceToDeductTierUsd, orderTime, serverNowMs);
                                
                                updateObj.totalSpent = refundTierResult.newTotalSpentUsd;
                                updateObj.tierCycleSpent = refundTierResult.newTierCycleSpentUsd;
                                updateObj.tierId = refundTierResult.finalTierId;
                                updateObj.cycleStartTierId = refundTierResult.lockedFloorTierId;
                                updateObj.tierClimbs = refundTierResult.tierClimbs;
                                updateObj.totalOrdersCount = Math.max(0, Number(ud.totalOrdersCount || 0) - 1);
                                if (refundTierResult.restoredCycleStartMs) {
                                    updateObj.tierCycleStartDate = admin.firestore.Timestamp.fromMillis(refundTierResult.restoredCycleStartMs);
                                }
                                if (refundTierResult.restoredStreakStartMs) {
                                    updateObj.tierStreakStartDate = admin.firestore.Timestamp.fromMillis(refundTierResult.restoredStreakStartMs);
                                }
                                const orderDateObj = new Date(orderTime);
                                const monthKey = `${orderDateObj.getUTCFullYear()}_${String(orderDateObj.getUTCMonth() + 1).padStart(2, '0')}`;
                                const statsRef = db.collection('telecard_user_stats').doc(`${liveOrder.userId}_${monthKey}`);
                                transaction.set(statsRef, { 
                                    userId: liveOrder.userId,
                                    monthKey: monthKey,
                                    userName: ud.fullName || ud.username || 'عميل',
                                    userDisplayId: ud.displayId || String(liveOrder.userId).substring(0, 8),
                                    spentThisMonth: admin.firestore.FieldValue.increment(-priceToDeductTierUsd), 
                                    ordersThisMonth: admin.firestore.FieldValue.increment(-1), 
                                    lastUpdate: admin.firestore.FieldValue.serverTimestamp() 
                                }, { merge: true });
                            }

                            const safeRestoreKey = couponCodeToRestore ? couponCodeToRestore.replace(/[.~*/\[\]]/g, '_') : null;
                            if (safeRestoreKey) {
                                const curUserUsed = Number(ud?.usedCoupons?.[safeRestoreKey] ?? ud?.usedCoupons?.[couponCodeToRestore] ?? 0);
                                const nextUserUsed = Math.max(0, curUserUsed - 1);
                                updateObj[`usedCoupons.${safeRestoreKey}`] = nextUserUsed > 0 ?
                                    nextUserUsed :
                                    admin.firestore.FieldValue.delete();
                            }
                            transaction.update(userRef, updateObj);
                        }
                        
                        if (couponSnap && !couponSnap.empty) {
                            const cDoc = couponSnap.docs[0];
                            const curGlobalUsed = Number(cDoc.data().usedCount || 0);
                            transaction.update(cDoc.ref, {
                                usedCount: Math.max(0, curGlobalUsed - 1)
                            });
                        }

     transaction.update(orderRef, {
    status: action,
    isPendingSupplierCheck: admin.firestore.FieldValue.delete(),
    requiresAdminAttention: admin.firestore.FieldValue.delete(),
    adminRejectWarnedAt: admin.firestore.FieldValue.delete(),
    adminNote: safeAdminNote,
    actionTime: admin.firestore.FieldValue.serverTimestamp(),
    balanceAfter: newWalletBal
});
                    } else if (action === 'processing') {
                        if (['completed', 'rejected', 'refunded', 'returned'].includes(previousStatus)) {
                            throw new HttpsError('failed-precondition', 'لا يمكن إعادة معالجة طلب منتهي.');
                        }
                        transaction.update(orderRef, { 
                            status: action, 
                            adminNote: safeAdminNote, 
                            actionTime: admin.firestore.FieldValue.serverTimestamp() 
                        });
                    }
                });
            });
        } catch (err) {
            if (err.message && err.message.includes('HIGH_TRAFFIC_COLLISION')) {
                throw new HttpsError('resource-exhausted', 'هناك عمليات متزامنة في نفس اللحظة، حاول مرة أخرى بعد قليل.');
            } else {
                throw err;
            }
        }

        if (keysBurnedCount > 0) finalMsg += ` (وتم توثيق ${keysBurnedCount} كود تالف بأمان).`;
        if (keysRestoredCount > 0) finalMsg += ` (وتم استرجاع ${keysRestoredCount} كود للخزنة ليتم بيعها مجدداً).`;
        
        await logAdminAction(request.auth.uid, 'PROCESS_ORDER', `Order: ${orderId}, Action: ${action}`);
        return { success: true, message: finalMsg };

    } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `خطأ برمجي في السيرفر: ${error.message}`);
    }
});// ==========================================
// 📦 3. دالة الرفض الجماعي للطلبات (المحصنة مع تحرير الخزنة واسترجاع المخزون وحماية طلبات الموردين)
// ==========================================
exports.adminBulkRejectOrders = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { orderIds } = request.data || {};
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return { success: true, processedCount: 0 };
    }
    
    const uniqueOrderIds = [...new Set(orderIds.map(id => String(id).trim()).filter(Boolean))];
    if (uniqueOrderIds.length === 0) {
        return { success: true, processedCount: 0 };
    }
    if (uniqueOrderIds.length > 500) {
        throw new HttpsError('out-of-range', 'الحد الأقصى هو 500 طلب في الدفعة الواحدة.');
    }
    
    const adminNote = 'تم الرفض إدارياً من قبل النظام (رفض جماعي)';
    let processedCount = 0;
    const affectedUserIds = new Set();
    
    try {
        const orderRefs = uniqueOrderIds.map(id => db.collection('telecard_orders').doc(id));
        const orderSnaps = await db.getAll(...orderRefs);
        
        const userOrdersMap = new Map();
        
        for (const snap of orderSnaps) {
            if (!snap.exists) continue;
            const o = snap.data();
            
            // 🛡️ استثناء جميع طلبات الموردين من الرفض الجماعي العشوائي لضمان فحصها فردياً لدى المورد أولاً
            const isLiveAtSupplier = Boolean(o.supplierId || o.isPendingSupplierCheck === true);
            if ((o.status === 'pending' || o.status === 'processing') && !isLiveAtSupplier) {
                const userIdStr = String(o.userId);
                if (!userOrdersMap.has(userIdStr)) userOrdersMap.set(userIdStr, []);
                userOrdersMap.get(userIdStr).push({ ref: snap.ref, data: o });
            }
        }
        
        for (const [userIdStr, userOrders] of userOrdersMap.entries()) {
            const chunks = [];
            const SAFE_CHUNK_SIZE = 20;
            for (let i = 0; i < userOrders.length; i += SAFE_CHUNK_SIZE) {
                chunks.push(userOrders.slice(i, i + SAFE_CHUNK_SIZE));
            }
            
            for (const chunk of chunks) {
                const chunkValidCount = await db.runTransaction(async (transaction) => {
                    const userRef = db.collection('telecard_users').doc(userIdStr);
                    const userSnap = await transaction.get(userRef);
                    
                    let currentWalletBal = userSnap.exists ? (userSnap.data().walletBalance || 0) : 0;
                    let totalRefundForUser = 0;
                    let validOrdersCount = 0;
                    
                    const couponDocsMap = new Map();
                    for (const orderItem of chunk) {
                        const cCode = String(orderItem.data.pricingSnapshot?.couponCode || orderItem.data.couponCode || '').trim().toUpperCase();
                        if (cCode && !couponDocsMap.has(cCode)) {
                            const couponSnap = await transaction.get(db.collection('telecard_coupons').where('code', '==', cCode).limit(1));
                            if (!couponSnap.empty) couponDocsMap.set(cCode, couponSnap.docs[0]);
                        }
                    }
                    
                    const liveOrderSnaps = await transaction.getAll(...chunk.map(o => o.ref));
                    
                    const vaultKeysToFree = [];
                    const uniqueVaultIds = new Set();
                    const orderRestoredKeysCount = new Map();
                    
                    for (const liveSnap of liveOrderSnaps) {
                        if (!liveSnap.exists) continue;
                        const o = liveSnap.data();
                        if ((o.status === 'pending' || o.status === 'processing') && o.vaultPoolId) {
                            const vId = String(o.vaultPoolId);
                            uniqueVaultIds.add(vId);
                            
                            const kQuerySnap = await transaction.get(
                                db.collection('telecard_vault').doc(vId).collection('keys').where('orderId', '==', String(liveSnap.id))
                            );
                            orderRestoredKeysCount.set(liveSnap.id, kQuerySnap.size);
                            kQuerySnap.docs.forEach(kDoc => {
                                vaultKeysToFree.push({ ref: kDoc.ref, vaultId: vId });
                            });
                        }
                    }
                    
                    const rawProductStockToRestore = new Map();
                    for (const liveSnap of liveOrderSnaps) {
                        if (!liveSnap.exists) continue;
                        const o = liveSnap.data();
                        if ((o.status === 'pending' || o.status === 'processing') && o.prodId && !o.supplierId && !o.externalProdId) {
                            const pIdStr = String(o.prodId);
                            const qty = o.vaultPoolId ? Number(orderRestoredKeysCount.get(liveSnap.id) || 0) : Number(o.qty || 1);
                            if (qty <= 0) continue;
                            
                            if (!rawProductStockToRestore.has(pIdStr)) {
                                rawProductStockToRestore.set(pIdStr, { parentQty: 0, optionsQty: {} });
                            }
                            
                            const stockData = rawProductStockToRestore.get(pIdStr);
                            if (o.optIdx !== null && o.optIdx !== undefined) {
                                stockData.optionsQty[o.optIdx] = (stockData.optionsQty[o.optIdx] || 0) + qty;
                            } else {
                                stockData.parentQty += qty;
                            }
                        }
                    }
                    
                    const uniqueProdIds = Array.from(rawProductStockToRestore.keys());
                    const prodRefs = uniqueProdIds.map(pId => db.collection('telecard_prods').doc(pId));
                    const prodSnaps = prodRefs.length > 0 ? await transaction.getAll(...prodRefs) : [];
                    
                    const existingProdsMap = new Map();
                    prodSnaps.forEach(pSnap => {
                        if (pSnap.exists) existingProdsMap.set(pSnap.id, pSnap);
                    });
                    
                    const vaultRefs = Array.from(uniqueVaultIds).map(vId => db.collection('telecard_vault').doc(vId));
                    const vaultSnaps = vaultRefs.length > 0 ? await transaction.getAll(...vaultRefs) : [];
                    const existingVaultsMap = new Map();
                    vaultSnaps.forEach(vSnap => {
                        if (vSnap.exists) existingVaultsMap.set(vSnap.id, vSnap);
                    });
                    
                    const couponUsageToRefund = new Map();
                    
                    for (const liveSnap of liveOrderSnaps) {
                        if (!liveSnap.exists) continue;
                        const o = liveSnap.data();
                        
                        const isStillLiveAtSupplier = Boolean(o.supplierId || o.isPendingSupplierCheck === true);
                        if ((o.status === 'pending' || o.status === 'processing') && !isStillLiveAtSupplier) {
                            const exactPrice = Number(o.priceLocalDeducted ?? o.price ?? 0);
                            
                            totalRefundForUser = safeAdd(totalRefundForUser, exactPrice);
                            currentWalletBal = sanitizeAmount(safeAdd(currentWalletBal, exactPrice));
                            
                            transaction.update(liveSnap.ref, {
                                status: 'rejected',
                                isPendingSupplierCheck: admin.firestore.FieldValue.delete(),
                                adminNote: adminNote,
                                balanceAfter: currentWalletBal,
                                actionTime: admin.firestore.FieldValue.serverTimestamp(),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            
                            const cCode = String(o.pricingSnapshot?.couponCode || o.couponCode || '').trim().toUpperCase();
                            if (cCode) {
                                couponUsageToRefund.set(cCode, (couponUsageToRefund.get(cCode) || 0) + 1);
                            }
                            
                            validOrdersCount++;
                        }
                    }
                    
                    const userCouponUpdates = {};
                    const ud = userSnap.exists ? userSnap.data() : {};
                    
                    for (const [cCode, refundCount] of couponUsageToRefund.entries()) {
                        const cDoc = couponDocsMap.get(cCode);
                        if (cDoc) {
                            const curGlobalUsed = Number(cDoc.data().usedCount || 0);
                            transaction.update(cDoc.ref, {
                                usedCount: Math.max(0, curGlobalUsed - refundCount)
                            });
                        }
                        if (userSnap.exists) {
                            const safeRestoreKey = cCode.replace(/[.~*/\[\]]/g, '_');
                            const curUserUsed = Number(ud?.usedCoupons?.[safeRestoreKey] ?? ud?.usedCoupons?.[cCode] ?? 0);
                            const nextUserUsed = Math.max(0, curUserUsed - refundCount);
                            userCouponUpdates[`usedCoupons.${safeRestoreKey}`] = nextUserUsed > 0 ?
                                nextUserUsed :
                                admin.firestore.FieldValue.delete();
                        }
                    }
                    
                    for (const [pId, stockData] of rawProductStockToRestore.entries()) {
                        if (existingProdsMap.has(pId)) {
                            const prodRef = existingProdsMap.get(pId).ref;
                            const prodData = existingProdsMap.get(pId).data();
                            let prodUpdates = {};
                            let hasUpdates = false;
                            const isFrozenProd = Boolean(prodData.isAutoFrozen === true || prodData.requiresAdminAttention === true);
                            
                            if (Object.keys(stockData.optionsQty).length > 0 && prodData.type === 'select' && Array.isArray(prodData.options)) {
                                const newOptions = [...prodData.options];
                                let optionsModified = false;
                                
                                for (const optIdxStr in stockData.optionsQty) {
                                    const idx = parseInt(optIdxStr, 10);
                                    const qtyToAdd = stockData.optionsQty[optIdxStr];
                                    const targetOpt = newOptions[idx];
                                    const hasDedicatedOptVault = Boolean(targetOpt && targetOpt.vaultPoolId && targetOpt.vaultPoolId !== prodData.vaultPoolId);
                                    
                                    if (targetOpt && targetOpt.stockCount !== undefined && targetOpt.stockCount !== null) {
                                        const restoredOptStock = Number(targetOpt.stockCount || 0) + qtyToAdd;
                                        const sharedOptPoolId = targetOpt.vaultPoolId || null;
                                        newOptions.forEach((optItem, sIdx) => {
                                            if (optItem && (sIdx === idx || (sharedOptPoolId && optItem.vaultPoolId === sharedOptPoolId))) {
                                                newOptions[sIdx] = {
                                                    ...optItem,
                                                    stockCount: restoredOptStock,
                                                    isAvailable: !isFrozenProd && (optItem.isActive !== false) && (restoredOptStock > 0)
                                                };
                                            }
                                        });
                                        optionsModified = true;
                                    } else if (!hasDedicatedOptVault && prodData.stockCount !== undefined && prodData.stockCount !== null) {
                                        stockData.parentQty += qtyToAdd;
                                    }
                                }
                                
                                if (optionsModified) {
                                    prodUpdates.options = newOptions;
                                    if (!isFrozenProd) {
                                        prodUpdates.isAvailable = newOptions.some(o => o && o.isActive !== false && String(o.isAvailable) !== 'false' && (o.stockCount === undefined || o.stockCount === null || Number(o.stockCount) > 0));
                                    }
                                    hasUpdates = true;
                                }
                            }
                            
                            if (stockData.parentQty > 0 && prodData.stockCount !== undefined && prodData.stockCount !== null) {
                                prodUpdates.stockCount = admin.firestore.FieldValue.increment(stockData.parentQty);
                                if (!isFrozenProd) prodUpdates.isAvailable = true;
                                hasUpdates = true;
                            }
                            
                            if (hasUpdates) {
                                transaction.update(prodRef, prodUpdates);
                            }
                        }
                    }
                    
                    const vaultRestoredCounts = new Map();
                    vaultKeysToFree.forEach(k => {
                        transaction.update(k.ref, {
                            isSold: false,
                            orderId: admin.firestore.FieldValue.delete(),
                            userId: admin.firestore.FieldValue.delete(),
                            soldAt: admin.firestore.FieldValue.delete()
                        });
                        vaultRestoredCounts.set(k.vaultId, (vaultRestoredCounts.get(k.vaultId) || 0) + 1);
                    });
                    
                    for (const [vId, count] of vaultRestoredCounts.entries()) {
                        if (existingVaultsMap.has(vId)) {
                            transaction.update(existingVaultsMap.get(vId).ref, {
                                stockCount: admin.firestore.FieldValue.increment(count),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                        }
                    }
                    
                    if (validOrdersCount > 0 && userSnap.exists) {
                        transaction.update(userRef, {
                            walletBalance: currentWalletBal,
                            ...userCouponUpdates
                        });
                    }
                    return validOrdersCount;
                });
                
                if (chunkValidCount > 0) {
                    affectedUserIds.add(userIdStr);
                    processedCount += chunkValidCount;
                }
            }
        }
        
        if (processedCount > 0) {
            await logAdminAction(
                request.auth.uid,
                'BULK_REJECT',
                `تم رفض ${processedCount} طلب يدوياً وإعادة الأرصدة والمخزون وتحرير أكواد الخزنة بنجاح.`
            );
        }
        
        return { success: true, processedCount, affectedUserIds: Array.from(affectedUserIds) };
        
    } catch (error) {
        console.error("🚨 adminBulkRejectOrders Error:", error);
        throw new HttpsError('internal', 'حدث خطأ أثناء معالجة الرفض الجماعي.');
    }
});

exports.adminProcessDeposit = onCall({ enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const data = request.data || {};
    let { depositId, action, adminNote } = data;
    const safeAdminNote = SecurityEngine.sanitizeText(String(adminNote || ''), SYSTEM_LIMITS.MAX_NOTE_LENGTH);
    
    const validActions = ['approved', 'rejected', 'refunded'];
    if (!validActions.includes(action)) {
        throw new HttpsError('invalid-argument', 'الحالة المطلوبة غير صالحة.');
    }
    
    await db.runTransaction(async (transaction) => {
        const depRef = db.collection('telecard_deposits').doc(String(depositId));
        const depSnap = await transaction.get(depRef);
        if (!depSnap.exists) throw new HttpsError('not-found', 'الإيداع غير موجود.');
        
        const depData = depSnap.data();
        
        if (depData.method === 'إيداع إداري' || depData.method === 'خصم إداري') {
            throw new HttpsError('failed-precondition', 'لا يمكن تعديل العمليات الإدارية من هنا. استخدم دالة التعديل الإداري adminAdjustBalance.');
        }
        
        if (depData.status === action) throw new HttpsError('failed-precondition', 'هذه هي الحالة الحالية.');
        
        if (action === 'approved' && depData.status !== 'pending') {
            throw new HttpsError('failed-precondition', 'لا يمكن قبول إيداع تمت معالجته مسبقاً (يجب أن يكون قيد الانتظار).');
        }
        if (action === 'rejected' && depData.status !== 'pending') {
            throw new HttpsError('failed-precondition', 'لا يمكن رفض إيداع تمت معالجته مسبقاً. استخدم الاسترجاع (refunded) للإيداعات المقبولة.');
        }
        if (action === 'refunded' && depData.status !== 'approved') {
            throw new HttpsError('failed-precondition', 'لا يمكن استرجاع إيداع لم يتم قبوله وإضافته للمحفظة مسبقاً.');
        }
        if ((action === 'refunded' || action === 'rejected') && ['refunded', 'rejected'].includes(depData.status)) {
            throw new HttpsError('failed-precondition', 'لا يمكن التراجع عن إيداع تم رفضه أو استرجاعه بالفعل.');
        }
        
        let userRef = db.collection('telecard_users').doc(String(depData.userId));
        let newWalletBal = 0;
        const wasApproved = depData.status === 'approved';
        
        const amtLocal = Number(depData.creditedAmount || depData.amount || 0);
        const amtUsd = Number(depData.creditedBaseUsd || amtLocal);
        
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists && action === 'approved') {
            throw new HttpsError('not-found', 'لا يمكن قبول الإيداع: حساب العميل غير موجود.');
        }
        
        if (userSnap.exists) {
            const ud = userSnap.data();
            if (ud.isDeleted === true && action === 'approved') {
                throw new HttpsError('failed-precondition', 'لا يمكن قبول الإيداع: تم حذف حساب هذا العميل مسبقاً.');
            }
            if (action === 'approved') {
                newWalletBal = sanitizeAmount(safeAdd(ud.walletBalance || 0, amtLocal));
                const newTotalDepositUsd = sanitizeAmount(safeAdd(ud.totalDeposit || 0, amtUsd));
                transaction.update(userRef, { walletBalance: newWalletBal, totalDeposit: newTotalDepositUsd });
            } else if ((action === 'refunded' || action === 'rejected') && wasApproved) {
                if ((ud.walletBalance || 0) < amtLocal) {
                    throw new HttpsError('failed-precondition', 'لا يمكن التراجع عن الإيداع: رصيد العميل الحالي لا يغطي قيمة السحب.');
                }
                newWalletBal = sanitizeAmount((ud.walletBalance || 0) - amtLocal);
                const newTotalDepositUsd = Math.max(0, sanitizeAmount((ud.totalDeposit || 0) - amtUsd));
                transaction.update(userRef, { walletBalance: newWalletBal, totalDeposit: newTotalDepositUsd });
            } else {
                newWalletBal = ud.walletBalance || 0;
            }
        }
        
        let depUpdateObj = { status: action, adminNote: safeAdminNote, actionTime: admin.firestore.FieldValue.serverTimestamp() };
        if (action === 'approved' || (wasApproved && (action === 'refunded' || action === 'rejected'))) depUpdateObj.balanceAfter = newWalletBal;
        transaction.update(depRef, depUpdateObj);
    });
    
    await logAdminAction(request.auth.uid, 'PROCESS_DEPOSIT', `Deposit: ${depositId}, Action: ${action}`);
    return { success: true };
});

exports.adminAdjustBalance = onCall({ enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { userId, type, amount, idempotencyKey } = request.data || {};
    if (!userId) throw new HttpsError('invalid-argument', 'معرف العميل مفقود.');
    
    if (!type || !['add', 'deduct'].includes(type)) {
        throw new HttpsError('invalid-argument', 'نوع العملية غير صالح. يجب أن يكون إضافة أو خصم.');
    }

    const adjustAmount = Number(amount);
    const safeAdminName = SecurityEngine.sanitizeText(String(request.data?.adminName || 'النظام'), 50);
    
    if (idempotencyKey && String(idempotencyKey).length > 200) throw new HttpsError('invalid-argument', 'المفتاح طويل جداً ومرفوض أمنياً.');
    const cleanIdempotencyKey = idempotencyKey ? String(idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50) : null;
    if (isNaN(adjustAmount) || adjustAmount <= 0) throw new HttpsError('out-of-range', 'المبلغ المدخل غير صالح (يجب أن يكون رقماً أكبر من صفر).');
    
    const cleanUserId = String(userId).trim();
    const userRef = db.collection('telecard_users').doc(cleanUserId);
    let idempotencyRef = null;
    
    if (cleanIdempotencyKey) {
        idempotencyRef = db.collection('telecard_idempotency_keys').doc(`admin_bal_${cleanUserId}_${cleanIdempotencyKey}`);
    }
    
    const transactionResult = await db.runTransaction(async (transaction) => {
        if (idempotencyRef) {
            const idempSnap = await transaction.get(idempotencyRef);
            if (idempSnap.exists) throw new HttpsError('already-exists', 'تم تنفيذ هذه العملية مسبقاً.');
        }
        
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');
        const userData = userDoc.data();

        if (userData.isDeleted === true) {
            throw new HttpsError('failed-precondition', 'لا يمكن تعديل رصيد حساب محذوف نهائياً.');
        }
        if (userData.isVerified !== true && type === 'add') {
            throw new HttpsError('failed-precondition', 'لا يمكن تعديل الرصيد! العميل لم يكمل إعداد بيانات الحساب.');
        }        
        
        const currentBal = Number(userData.walletBalance || 0);
        if (type === 'deduct' && currentBal < adjustAmount) {
            throw new HttpsError('failed-precondition', 'الرصيد الحالي لا يكفي لإتمام عملية الخصم الإداري.');
        }
        const newBal = sanitizeAmount(type === 'add' ? safeAdd(currentBal, adjustAmount) : (currentBal - adjustAmount));
        
        const { ratesData } = await FinancialEngine.fetchSystemData(transaction, db, { onlyConfigs: true });
        const userCurrency = String(userData.baseCurrency || 'USD').toUpperCase();
        let adjustAmountUsd = adjustAmount;
        
        if (userCurrency !== 'USD') {
            try {
                adjustAmountUsd = FinancialEngine.convertViaUSDHelper(adjustAmount, userCurrency, 'USD', ratesData, 'round', 'deposit');
            } catch (e) {
                throw new HttpsError('invalid-argument', `العملية مرفوضة: فشل تحويل العملة (${userCurrency}). يرجى إصلاح أسعار الصرف أولاً. ${e.message.replace('[SECURITY] ', '')}`);
            }
        }
        
        if (adjustAmountUsd > 5000) {
            throw new HttpsError('out-of-range', `المبلغ يتجاوز الحد الأقصى المسموح للعملية الواحدة (ما يعادل 5,000$).`);
        }
        
        const newTotalDepositUsd = sanitizeAmount(type === 'add' ? safeAdd(userData.totalDeposit || 0, adjustAmountUsd) : Math.max(0, (userData.totalDeposit || 0) - adjustAmountUsd));
        
        transaction.update(userRef, { walletBalance: newBal, totalDeposit: newTotalDepositUsd });
        
        const depId = SecurityEngine.generateUniqueId('ADMBAL');
        const serverTs = admin.firestore.FieldValue.serverTimestamp();
        
        // 📌 [توحيد معماري - وثيقة الإيداع (telecard_deposits)]:
        // المعرفات القياسية الموحدة: (currency, targetCurrency, amount, creditedAmount, creditedBaseUsd, feeAmount, feePct, feeType, feeUnit, fxRate, balanceAfter)
        const depositDoc = {
            id: depId,
            displayId: depId,
            userId: cleanUserId,
            userDataSnapshot: {
                fullName: SecurityEngine.sanitizeText(userData.fullName || 'مستخدم', 100),
                email: userData.email || '',
                phone: userData.phone || '',
                tierId: userData.tierId || 'TIER_DEFAULT',
                baseCurrency: userCurrency
            },
            amount: adjustAmount,
            currency: userCurrency,
            targetCurrency: userCurrency,
            creditedAmount: type === 'add' ? adjustAmount : -adjustAmount,
            creditedBaseUsd: type === 'add' ? adjustAmountUsd : -adjustAmountUsd,
            feeAmount: 0,
            feePct: 0,
            feeType: 'fee',
            feeUnit: 'percent',
            fxRate: 1,
            status: type === 'add' ? 'approved' : 'deducted',
            method: type === 'add' ? 'إيداع إداري' : 'خصم إداري',
            admin: safeAdminName,
            balanceAfter: newBal,
            time: serverTs,
            actionTime: serverTs,
            createdAt: serverTs
        };
        transaction.set(db.collection('telecard_deposits').doc(depId), depositDoc);
        
        if (idempotencyRef) {
            const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
            transaction.set(idempotencyRef, {
                createdAt: serverTs,
                expiresAt: admin.firestore.Timestamp.fromDate(new Date(admin.firestore.Timestamp.now().toMillis() + thirtyDaysInMs)),
                depositId: depId
            });
        }
        
        const nowMs = Date.now();
        return {
            depositDoc: { ...depositDoc, time: nowMs, actionTime: nowMs, createdAt: nowMs },
            newBal
        };
    });
    
    await logAdminAction(request.auth.uid, 'ADJUST_BALANCE', `User: ${cleanUserId}, Type: ${type}, Amount: ${amount}`);
    return { success: true, newBalance: transactionResult.newBal, newDeposit: transactionResult.depositDoc };
});

exports.grantAdminRole = onCall(async (request) => {
    const SUPER_ADMIN_UID = process.env.SUPER_ADMIN_UID;
    
    if (!SUPER_ADMIN_UID || request.auth?.uid !== SUPER_ADMIN_UID) {
        throw new HttpsError('permission-denied', 'هذه الصلاحية محصورة لمالك النظام فقط.');
    }
    
    const targetEmail = request.data?.email;
    if (!targetEmail) throw new HttpsError('invalid-argument', 'البريد مفقود.');
    try {
        const user = await admin.auth().getUserByEmail(targetEmail);
        const currentClaims = user.customClaims || {};
        await admin.auth().setCustomUserClaims(user.uid, { ...currentClaims, admin: true });
        await logAdminAction(request.auth?.uid, 'GRANT_ADMIN', `Granted admin to: ${targetEmail}`);
        return { success: true };
    } catch (error) { throw new HttpsError('internal', `فشل المنح: ${error.message}`); }
});

exports.adminDeleteTier = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { tierId } = request.data || {};
    if (!tierId) throw new HttpsError('invalid-argument', 'معرف المستوى مفقود.');
    if (tierId === 'TIER_DEFAULT') throw new HttpsError('permission-denied', 'إجراء أمني مرفوض: لا يمكن حذف المستوى الافتراضي الخالد.');
    
    try {
        const tierRef = db.collection('telecard_tiers').doc(String(tierId));
        const tierSnap = await tierRef.get();
        if (!tierSnap.exists) throw new HttpsError('not-found', 'المستوى غير موجود في قاعدة البيانات.');
        if (tierSnap.data().isDefault) throw new HttpsError('permission-denied', 'لا يمكن حذف المستوى الافتراضي الحالي. قم بتعيين مستوى آخر كافتراضي أولاً.');
        
        const fallbackTierId = 'TIER_DEFAULT';
        
        const [usersSnap, cycleUsersSnap] = await Promise.all([
            db.collection('telecard_users').where('tierId', '==', String(tierId)).get(),
            db.collection('telecard_users').where('cycleStartTierId', '==', String(tierId)).get()
        ]);
        const migratedCount = usersSnap.size;
        
        if (!usersSnap.empty || !cycleUsersSnap.empty) {
            const bulkWriter = db.bulkWriter();
            const updatedCurrentTierIds = new Set();
            usersSnap.forEach((docSnap) => {
                updatedCurrentTierIds.add(docSnap.id);
                bulkWriter.update(docSnap.ref, {
                    tierId: fallbackTierId,
                    cycleStartTierId: fallbackTierId,
                    tierClimbs: [],
                    tierCycleSpent: 0,
                    tierCycleStartDate: admin.firestore.FieldValue.serverTimestamp(),
                    tierStreakStartDate: admin.firestore.FieldValue.serverTimestamp(),
                    isApiMerchant: false,
                    manualTierOverride: false
                });
            });
            cycleUsersSnap.forEach((docSnap) => {
                if (!updatedCurrentTierIds.has(docSnap.id)) {
                    bulkWriter.update(docSnap.ref, {
                        cycleStartTierId: fallbackTierId,
                        tierClimbs: [],
                        tierStreakStartDate: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            });
            await bulkWriter.close();
        }
        
        await tierRef.delete();
        
        await logAdminAction(request.auth.uid, 'DELETE_TIER', `Deleted tier: ${tierId}. Migrated ${migratedCount} users to ${fallbackTierId}`);
        return { success: true, migratedCount, fallbackTierId };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `فشل حذف المستوى: ${error.message}`);
    }
});

// ==========================================
// 📊 4. محركات الذكاء التجاري ولوحة القيادة (Cloud BI Engines)
// ==========================================
exports.adminGetWalletsLiquidity = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    try {
        const dbInstance = admin.firestore();
        const configCache = await dbInstance.collection('telecard_system').doc('active_configs').get();
        
        let rates = [];
        if (configCache.exists && configCache.data().rates) {
            rates = configCache.data().rates;
        } else {
            const ratesSnap = await dbInstance.collection('telecard_rates').get();
            rates = ratesSnap.docs.map(d => d.data());
        }
        
        const currencies = [...new Set(rates.map(r => String(r.code).toUpperCase()).concat('USD'))];
        
        let totalUsd = 0;
        const details = {};
        const uncalculatedCurrencies = [];
        
        await Promise.all(currencies.map(async (currency) => {
            const aggSnap = await dbInstance.collection('telecard_users')
                .where('baseCurrency', '==', currency)
                .where('walletBalance', '>', 0)
                .aggregate({ sum: admin.firestore.AggregateField.sum('walletBalance') })
                .get();
            
            const sum = aggSnap.data().sum || 0;
            
            if (sum > 0) {
                details[currency] = sanitizeAmount(sum);
                
                if (currency === 'USD') {
                    totalUsd = safeAdd(totalUsd, sum);
                } else {
                    try {
                        const convertedUsd = FinancialEngine.convertViaUSDHelper(sum, currency, 'USD', rates, 'round', 'pricing');
                        totalUsd = safeAdd(totalUsd, convertedUsd);
                    } catch (e) {
                        uncalculatedCurrencies.push({
                            currency: currency,
                            stuckLocalBalance: sanitizeAmount(sum),
                            reason: e.message.replace('[SECURITY] ', '')
                        });
                    }
                }
            }
        }));
        
        return {
            success: true,
            data: {
                totalUsd: sanitizeAmount(totalUsd),
                details: details,
                hasUncalculated: uncalculatedCurrencies.length > 0,
                uncalculatedCurrencies: uncalculatedCurrencies,
                warningMessage: uncalculatedCurrencies.length > 0 ?
                    'تنبيه: توجد أموال في محافظ العملاء لم يتم احتساب قيمتها الإجمالية بالدولار بسبب غياب أو خطأ في أسعار الصرف لبعض العملات.' : null
            }
        };
    } catch (error) {
        throw new HttpsError('internal', 'فشل السيرفر في تجميع المحافظ بشكل دقيق.');
    }
});

exports.adminGetSalesBI = onCall({ timeoutSeconds: 60, memory: "256MiB" }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const range = request.data?.range || '30days';
    const now = new Date();
    
    try {
        const createEmptyStats = () => ({
            revenue: 0, cost: 0, profit: 0, count: 0,
            completed_count: 0, rejected_count: 0, refunded_count: 0,
            api_profit: 0, api_count: 0, api_rejected: 0, api_refunded: 0,
            retail_profit: 0, retail_count: 0, retail_rejected: 0, retail_refunded: 0,
            vault_profit: 0, vault_completed: 0, vault_rejected: 0, vault_refunded: 0,
            manual_profit: 0, manual_completed: 0, manual_rejected: 0, manual_refunded: 0,
            supplier_profit: 0, supplier_completed: 0, supplier_rejected: 0, supplier_refunded: 0,
            suppliers_data: {},
            products: {},
            tiers: {},
            categories: {},
            daily: {},
            sources: { api: 0, vault: 0, supplier: 0, manual: 0 }
        });

        const mergeStats = (target, source, dayKey = null) => {
            if (!source) return;

            const directKeysToSum = [
                'revenue', 'cost', 'profit', 
                'completed_count', 'rejected_count', 'refunded_count',
                'api_profit', 'api_count', 'api_rejected', 'api_refunded',
                'retail_rejected', 'retail_refunded',
                'vault_profit', 'manual_profit', 'supplier_profit',
                'vault_rejected', 'manual_rejected', 'supplier_rejected',
                'vault_refunded', 'manual_refunded', 'supplier_refunded'
            ];
            
            directKeysToSum.forEach(k => {
                target[k] += (Number(source[k]) || 0);
            });

            if (source.retail_count !== undefined) {
                target.retail_count += (Number(source.retail_count) || 0);
            } else {
                const legacyCompleted = Number(source.completed_count || 0);
                const legacyApiCount = Number(source.api_count || 0);
                target.retail_count += Math.max(0, legacyCompleted - legacyApiCount);
            }

            if (source.retail_profit !== undefined) {
                target.retail_profit += (Number(source.retail_profit) || 0);
            } else {
                const legacyProfit = Number(source.profit || 0);
                const legacyApiProfit = Number(source.api_profit || 0);
                target.retail_profit += Math.max(0, legacyProfit - legacyApiProfit);
            }

            target.vault_completed += (Number(source.vault_completed) || Number(source.vault_count) || 0);
            target.manual_completed += (Number(source.manual_completed) || Number(source.manual_count) || 0);
            target.supplier_completed += (Number(source.supplier_completed) || Number(source.supplier_count) || 0);

            if (dayKey) {
                if (!target.daily[dayKey]) target.daily[dayKey] = { revenue: 0, profit: 0 };
                target.daily[dayKey].revenue += (Number(source.revenue) || 0);
                target.daily[dayKey].profit += (Number(source.profit) || 0);
            }

            if (source.suppliers_data && typeof source.suppliers_data === 'object') {
                for (const [suppId, sData] of Object.entries(source.suppliers_data)) {
                    if (!target.suppliers_data[suppId]) {
                        target.suppliers_data[suppId] = { profit: 0, completed: 0, rejected: 0, refunded: 0 };
                    }
                    target.suppliers_data[suppId].profit += (Number(sData.profit) || 0);
                    target.suppliers_data[suppId].completed += (Number(sData.completed) || 0);
                    target.suppliers_data[suppId].rejected += (Number(sData.rejected) || 0);
                    target.suppliers_data[suppId].refunded += (Number(sData.refunded) || 0);
                }
            }

            if (source.products_data && typeof source.products_data === 'object') {
                for (const [pKey, pData] of Object.entries(source.products_data)) {
                    const realProdId = pData.id || pKey;
                    if (!target.products[realProdId]) {
                        target.products[realProdId] = { id: realProdId, name: pData.name || 'منتج', count: 0, revenue: 0, cost: 0, profit: 0 };
                    }
                    target.products[realProdId].count += (Number(pData.count) || 0);
                    target.products[realProdId].revenue += (Number(pData.revenue) || 0);
                    target.products[realProdId].cost += (Number(pData.cost) || 0);
                    target.products[realProdId].profit += (Number(pData.profit) || 0);
                }
            }

            if (source.tiers_data && typeof source.tiers_data === 'object') {
                for (const [tKey, tData] of Object.entries(source.tiers_data)) {
                    const realTierId = tData.id || tKey;
                    if (!target.tiers[realTierId]) {
                        target.tiers[realTierId] = { id: realTierId, name: tData.name || realTierId, count: 0, revenue: 0, profit: 0 };
                    }
                    target.tiers[realTierId].count += (Number(tData.count) || 0);
                    target.tiers[realTierId].revenue += (Number(tData.revenue) || 0);
                    target.tiers[realTierId].profit += (Number(tData.profit) || 0);
                }
            }
        };

        let resultStats = createEmptyStats();
        let prevStats = createEmptyStats();

        const buildDayKey = (daysAgo) => {
            const d = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        };

        if (range === 'all') {
            const dayKeys30 = Array.from({ length: 30 }, (_, i) => buildDayKey(i));
            const dayRefs30 = dayKeys30.map(k => db.collection('telecard_statistics').doc(`daily_${k}`));
            const [allTimeSnap, ...daySnaps] = await db.getAll(
                db.collection('telecard_statistics').doc('all_time'),
                ...dayRefs30
            );
            if (allTimeSnap && allTimeSnap.exists) mergeStats(resultStats, allTimeSnap.data());
            daySnaps.forEach((doc, idx) => {
                if (doc.exists) {
                    const dKey = dayKeys30[idx];
                    resultStats.daily[dKey] = {
                        revenue: Number(doc.data().revenue || 0),
                        profit: Number(doc.data().profit || 0)
                    };
                }
            });
        } else if (['today', '7days', '30days', '90days'].includes(range)) {
            const daysCount = range === 'today' ? 1 : (range === '7days' ? 7 : (range === '30days' ? 30 : 90));
            const totalDaysToFetch = daysCount * 2;
            const allDayKeys = Array.from({ length: totalDaysToFetch }, (_, i) => buildDayKey(i));
            const allDayRefs = allDayKeys.map(k => db.collection('telecard_statistics').doc(`daily_${k}`));
            const snaps = await db.getAll(...allDayRefs);

            snaps.forEach((doc, index) => {
                if (!doc.exists) return;
                if (index < daysCount) {
                    mergeStats(resultStats, doc.data(), allDayKeys[index]);
                } else {
                    mergeStats(prevStats, doc.data());
                }
            });
        } else {
            let monthsToFetch = 1;
            let startMonthOffset = 0;

            if (range === 'this_month') { monthsToFetch = 1; startMonthOffset = 0; }
            else if (range === 'last_month') { monthsToFetch = 1; startMonthOffset = 1; }
            else if (range === 'last_3_months') { monthsToFetch = 3; startMonthOffset = 0; }
            else if (range === 'last_6_months' || range === '180days') { monthsToFetch = 6; startMonthOffset = 0; }

            const monthKeys = [];
            const prevMonthKeys = [];
            for (let i = 0; i < monthsToFetch; i++) {
                const dCurr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - startMonthOffset - i, 1));
                monthKeys.push(`monthly_${dCurr.getUTCFullYear()}-${String(dCurr.getUTCMonth() + 1).padStart(2, '0')}`);

                const dPrev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - startMonthOffset - monthsToFetch - i, 1));
                prevMonthKeys.push(`monthly_${dPrev.getUTCFullYear()}-${String(dPrev.getUTCMonth() + 1).padStart(2, '0')}`);
            }

            const dayKeys30 = Array.from({ length: 30 }, (_, i) => buildDayKey(i));
            const [currSnaps, prevSnaps, daySnaps30] = await Promise.all([
                monthKeys.length > 0 ? db.getAll(...monthKeys.map(k => db.collection('telecard_statistics').doc(k))) : Promise.resolve([]),
                prevMonthKeys.length > 0 ? db.getAll(...prevMonthKeys.map(k => db.collection('telecard_statistics').doc(k))) : Promise.resolve([]),
                db.getAll(...dayKeys30.map(k => db.collection('telecard_statistics').doc(`daily_${k}`)))
            ]);
            currSnaps.forEach(doc => { if (doc.exists) mergeStats(resultStats, doc.data()); });
            prevSnaps.forEach(doc => { if (doc.exists) mergeStats(prevStats, doc.data()); });
            daySnaps30.forEach((doc, idx) => {
                if (doc.exists) {
                    const dKey = dayKeys30[idx];
                    resultStats.daily[dKey] = {
                        revenue: Number(doc.data().revenue || 0),
                        profit: Number(doc.data().profit || 0)
                    };
                }
            });
        }        
        
        const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

        // 🚀 جلب تفصيل المنتجات والمستويات والأقسام لصفحة المبيعات حسب الفترة المختارة
        const useAllTimeFallback = (range === 'all') || (resultStats.completed_count > 0 && Object.keys(resultStats.products).length === 0);
        const [prodsStatsSnap, tiersStatsSnap] = await Promise.all([
            useAllTimeFallback ? db.collection('telecard_statistics').doc('all_time').collection('products').get() : Promise.resolve(null),
            useAllTimeFallback ? db.collection('telecard_statistics').doc('all_time').collection('tiers').get() : Promise.resolve(null)
        ]);

        if (prodsStatsSnap) {
            resultStats.products = {};
            prodsStatsSnap.forEach(doc => {
                const d = doc.data();
                resultStats.products[doc.id] = {
                    id: doc.id,
                    name: d.name || 'منتج',
                    count: Number(d.count || 0),
                    revenue: Number(d.revenue || 0),
                    cost: Number(d.cost || 0),
                    profit: Number(d.profit || 0)
                };
            });
        }

        const finalProductsMap = {};
        for (const [pId, pObj] of Object.entries(resultStats.products)) {
            const cnt = Number(pObj.count || 0);
            const rev = round(pObj.revenue);
            const prof = round(pObj.profit);
            const cst = round(pObj.cost);
            if (cnt <= 0 && rev <= 0 && prof <= 0) continue;
            
            finalProductsMap[pId] = {
                id: pId,
                name: pObj.name || 'منتج',
                count: cnt,
                revenue: rev,
                cost: cst,
                profit: prof
            };
        }
        resultStats.products = finalProductsMap;

        if (tiersStatsSnap) {
            resultStats.tiers = {};
            tiersStatsSnap.forEach(doc => {
                const d = doc.data();
                resultStats.tiers[doc.id] = {
                    id: doc.id,
                    name: d.name || doc.id,
                    count: Number(d.count || 0),
                    revenue: Number(d.revenue || 0),
                    profit: Number(d.profit || 0)
                };
            });
        }

        const finalTiersMap = {};
        for (const [tId, tObj] of Object.entries(resultStats.tiers)) {
            const cnt = Number(tObj.count || 0);
            const rev = round(tObj.revenue);
            const prof = round(tObj.profit);
            if (cnt <= 0 && rev <= 0 && prof <= 0) continue;
            finalTiersMap[tId] = { id: tId, name: tObj.name || tId, count: cnt, revenue: rev, profit: prof };
        }
        resultStats.tiers = finalTiersMap;        
        
        resultStats.revenue = round(resultStats.revenue);
        resultStats.profit = round(resultStats.profit);
        resultStats.cost = round(resultStats.cost);
        resultStats.count = resultStats.completed_count;

        prevStats.revenue = round(prevStats.revenue);
        prevStats.profit = round(prevStats.profit);
        prevStats.cost = round(prevStats.cost);
        prevStats.count = prevStats.completed_count;
        
        resultStats.api_profit = round(resultStats.api_profit);
        resultStats.retail_profit = round(resultStats.retail_profit);
        
        resultStats.vault_profit = round(resultStats.vault_profit);
        resultStats.manual_profit = round(resultStats.manual_profit);
        resultStats.supplier_profit = round(resultStats.supplier_profit);
        
        resultStats.sources = {
            api: resultStats.api_profit,
            vault: resultStats.vault_profit,
            supplier: resultStats.supplier_profit,
            manual: resultStats.manual_profit
        };

        for (const suppId in resultStats.suppliers_data) {
            resultStats.suppliers_data[suppId].profit = round(resultStats.suppliers_data[suppId].profit);
        }

        const responseData = { range, curr: resultStats, prev: prevStats };
        return { success: true, range: range, curr: resultStats, prev: prevStats, data: responseData };

    } catch (error) { 
        throw new HttpsError('internal', `فشل تحليل الـ BI: ${error.message}`); 
    }
});

exports.adminGetDashboardStats = onCall({ memory: "512MiB", timeoutSeconds: 60 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const dbInstance = admin.firestore();
    const { leaderboardPeriod = 'all' } = request.data || {};
    
    // 🛡️ مغلف آمن يمنع انهيار اللوحة إذا كان أحد الفهارس لا يزال قيد الإنشاء في فايربيز
    const safeAgg = async (aggPromise, fallbackObj = { total: 0 }) => {
        try {
            const snap = await aggPromise.get();
            return snap.data() || fallbackObj;
        } catch (e) {
            console.warn("[Dashboard Stats SafeAgg Warning]:", e.message);
            return fallbackObj;
        }
    };

    try {
        const AggregateField = admin.firestore.AggregateField;
        
        const [statsDoc, settingsDoc, firewallDoc, sysErrorsSnap] = await Promise.all([
            dbInstance.collection('telecard_statistics').doc('all_time').get(),
            dbInstance.collection('telecard_settings').doc('singleton').get(),
            dbInstance.collection('telecard_system').doc('active_configs').get(),
            dbInstance.collection('telecard_system_errors').orderBy('time', 'desc').limit(8).get().catch(() => ({ empty: true, docs: [] }))
        ]);
        
        const allTimeStats = statsDoc.exists ? statsDoc.data() : {};
        const sysSettings = settingsDoc.exists ? settingsDoc.data() : {};
        const firewallData = firewallDoc.exists ? firewallDoc.data() : {};
        // 📌 [توحيد معماري - الجدار الناري]: قراءة bannedIps و bannedDevices من active_configs
        const activeBannedIps = Array.isArray(firewallData.bannedIps) ? firewallData.bannedIps : (Array.isArray(sysSettings.bannedIps) ? sysSettings.bannedIps : []);
        const activeBannedDevices = Array.isArray(firewallData.bannedDevices) ? firewallData.bannedDevices : (Array.isArray(sysSettings.bannedDevices) ? sysSettings.bannedDevices : []);
        const bannedIpsCount = activeBannedIps.length;
        const bannedDevicesCount = activeBannedDevices.length;

        // 🔔 جلب أحدث إنذارات النظام لعرضها في جرس الإدارة وصندوق الرادار
        const recentSystemAlerts = (sysErrorsSnap && !sysErrorsSnap.empty)
            ? sysErrorsSnap.docs.map(doc => {
                const d = doc.data();
                return {
                    id: doc.id,
                    action: d.action || 'SYSTEM_ERROR',
                    title: d.title || d.action || 'تنبيه نظام',
                    details: d.details || d.errorMsg || '',
                    target: d.target || null,
                    orderId: d.orderId || null,
                    prodId: d.prodId || null,
                    userId: d.userId || null,
                    time: d.time ? (typeof d.time.toMillis === 'function' ? d.time.toMillis() : d.time) : Date.now()
                };
            })
            : [];
        
        const [
            pOrd, ordRej, ordRef,
            pDep, depAppr, depDeducted, depRej, depRef, depAdmin,
            pKyc, pComp, tUsr, bUsr, delUsr, activeVaultsSnap
        ] = await Promise.all([
            safeAgg(dbInstance.collection('telecard_orders').where('status', 'in', ['pending', 'processing']).aggregate({ total: AggregateField.count() })),
            safeAgg(dbInstance.collection('telecard_orders').where('status', '==', 'rejected').aggregate({ total: AggregateField.count() })),
            safeAgg(dbInstance.collection('telecard_orders').where('status', 'in', ['refunded', 'returned']).aggregate({ total: AggregateField.count() })),
            
            safeAgg(dbInstance.collection('telecard_deposits').where('status', '==', 'pending').aggregate({ total: AggregateField.count() })),
            safeAgg(dbInstance.collection('telecard_deposits').where('status', '==', 'approved').aggregate({ totalAmount: AggregateField.sum('creditedBaseUsd'), count: AggregateField.count() }), { totalAmount: 0, count: 0 }),
            safeAgg(dbInstance.collection('telecard_deposits').where('status', '==', 'deducted').aggregate({ totalDeducted: AggregateField.sum('creditedBaseUsd') }), { totalDeducted: 0 }),
            safeAgg(dbInstance.collection('telecard_deposits').where('status', '==', 'rejected').aggregate({ total: AggregateField.count() })),
            safeAgg(dbInstance.collection('telecard_deposits').where('status', '==', 'refunded').aggregate({ total: AggregateField.count() })),
            safeAgg(dbInstance.collection('telecard_deposits').where('status', '==', 'approved').where('method', '==', 'إيداع إداري').aggregate({ total: AggregateField.count() })),
            
            safeAgg(dbInstance.collection('telecard_users').where('kycStatus', '==', 'pending').aggregate({ total: AggregateField.count() })),
            safeAgg(dbInstance.collection('telecard_reviews').where('status', '==', 'pending').where('rating', '<=', 2).aggregate({ total: AggregateField.count() })),
            safeAgg(dbInstance.collection('telecard_users').aggregate({ total: AggregateField.count() })),
            safeAgg(dbInstance.collection('telecard_users').where('isBanned', '==', true).aggregate({ total: AggregateField.count() })),
            safeAgg(dbInstance.collection('telecard_users').where('isDeleted', '==', true).aggregate({ total: AggregateField.count() })),
            dbInstance.collection('telecard_vault').where('stockCount', '>', 0).get().catch(() => ({ forEach: () => {} }))
        ]);

        let liveFrozenAssetsUsd = 0;
        let hasVaultUnitCostConfigured = false;
        activeVaultsSnap.forEach(vDoc => {
            const vData = vDoc.data();
            const stock = Number(vData.stockCount || 0);
            const unitCost = Number(vData.unitCostUsd ?? vData.costPrice ?? 0);
            if (stock > 0 && unitCost > 0) {
                hasVaultUnitCostConfigured = true;
                liveFrozenAssetsUsd = safeAdd(liveFrozenAssetsUsd, FinancialEngine.safeMul(stock, unitCost));
            }
        });
        const resolvedFrozenAssetsUsd = hasVaultUnitCostConfigured
            ? sanitizeAmount(liveFrozenAssetsUsd)
            : sanitizeAmount(allTimeStats.frozenAssetsUsd || 0);
        
        let topHeroes = [];
        let mostActiveUsers = [];
        let activeUsrMonthCount = 0;
        
        const nowObj = new Date();
        const currentMonthKey = `${nowObj.getUTCFullYear()}_${String(nowObj.getUTCMonth() + 1).padStart(2, '0')}`;
        
        const activeMonthData = await safeAgg(
            dbInstance.collection('telecard_user_stats').where('monthKey', '==', currentMonthKey).where('ordersThisMonth', '>', 0).aggregate({ total: AggregateField.count() })
        );
        activeUsrMonthCount = activeMonthData.total || 0;
        
        if (leaderboardPeriod === 'all') {
            const [topSpendersSnap, topActiveSnap] = await Promise.all([
                dbInstance.collection('telecard_users').orderBy('totalSpent', 'desc').limit(5).get().catch(() => ({ docs: [] })),
                dbInstance.collection('telecard_users').orderBy('totalOrdersCount', 'desc').limit(5).get().catch(() => ({ docs: [] }))
            ]);
            // 🛡️ استبعاد الحسابات المحذوفة والعملاء الذين إنفاقهم = 0$
            topHeroes = topSpendersSnap.docs
                .filter(d => d.data().isDeleted !== true && Number(d.data().totalSpent || 0) > 0)
                .slice(0, 3)
                .map(d => ({ id: d.id, displayId: d.data().displayId || String(d.id).substring(0, 8), name: d.data().fullName || d.data().username || 'عميل', img: d.data().profileImage || null, spent: sanitizeAmount(d.data().totalSpent || 0) }));
            mostActiveUsers = topActiveSnap.docs
                .filter(d => d.data().isDeleted !== true && Number(d.data().totalOrdersCount || 0) > 0)
                .slice(0, 3)
                .map(d => ({ id: d.id, displayId: d.data().displayId || String(d.id).substring(0, 8), name: d.data().fullName || d.data().username || 'عميل', count: d.data().totalOrdersCount || 0 }));
        } else {
            let targetMonthKey = currentMonthKey;
            if (leaderboardPeriod === 'last_month') {
                const lastMonth = new Date(Date.UTC(nowObj.getUTCFullYear(), nowObj.getUTCMonth() - 1, 1));
                targetMonthKey = `${lastMonth.getUTCFullYear()}_${String(lastMonth.getUTCMonth() + 1).padStart(2, '0')}`;
            }
            const [topSpendersSnap, topActiveSnap] = await Promise.all([
                dbInstance.collection('telecard_user_stats').where('monthKey', '==', targetMonthKey).orderBy('spentThisMonth', 'desc').limit(5).get().catch(() => ({ docs: [] })),
                dbInstance.collection('telecard_user_stats').where('monthKey', '==', targetMonthKey).orderBy('ordersThisMonth', 'desc').limit(5).get().catch(() => ({ docs: [] }))
            ]);
            topHeroes = topSpendersSnap.docs
                .filter(d => Number(d.data().spentThisMonth || 0) > 0)
                .slice(0, 3)
                .map(d => ({ id: d.data().userId, displayId: d.data().userDisplayId || String(d.data().userId).substring(0, 8), name: d.data().userName || 'عميل', img: null, spent: sanitizeAmount(d.data().spentThisMonth || 0) }));
            mostActiveUsers = topActiveSnap.docs
                .filter(d => Number(d.data().ordersThisMonth || 0) > 0)
                .slice(0, 3)
                .map(d => ({ id: d.data().userId, displayId: d.data().userDisplayId || String(d.data().userId).substring(0, 8), name: d.data().userName || 'عميل', count: d.data().ordersThisMonth || 0 }));
        }
        
        const deletedUsersCount = delUsr.total || 0;
        
        return {
            success: true,
            data: {
                financials: {
                    totalRevenue: sanitizeAmount(allTimeStats.revenue || 0),
                    totalProfit: sanitizeAmount(allTimeStats.profit || 0),
                    totalCost: sanitizeAmount(allTimeStats.cost || 0),
                    frozenAssetsUsd: resolvedFrozenAssetsUsd,
                    apiProfit: sanitizeAmount(allTimeStats.api_profit || 0),
                    retailProfit: sanitizeAmount(
                        allTimeStats.retail_profit !== undefined ?
                        allTimeStats.retail_profit :
                        Math.max(0, FinancialEngine.safeSub(allTimeStats.profit || 0, allTimeStats.api_profit || 0))
                    ),
                    vaultProfit: sanitizeAmount(allTimeStats.vault_profit || 0),
                    manualProfit: sanitizeAmount(allTimeStats.manual_profit || 0),
                    supplierProfit: sanitizeAmount(allTimeStats.supplier_profit || 0)
                },
                orders: {
                    total: (allTimeStats.completed_count || 0) + (pOrd.total || 0) + (ordRej.total || 0) + (ordRef.total || 0),
                    completed: allTimeStats.completed_count || 0,
                    pending: pOrd.total || 0,
                    rejected: ordRej.total || 0,
                    refunded: ordRef.total || 0,
                    apiCount: allTimeStats.api_count || 0,
                    retailCount: allTimeStats.retail_count !== undefined ?
                        allTimeStats.retail_count :
                        Math.max(0, (allTimeStats.completed_count || 0) - (allTimeStats.api_count || 0))
                },
                deposits: {
                    totalAmount: FinancialEngine.sanitizeAmount(FinancialEngine.safeSub(depAppr.totalAmount || 0, Math.abs(depDeducted.totalDeducted || 0))),
                    approvedCount: depAppr.count || 0,
                    pending: pDep.total || 0,
                    rejected: depRej.total || 0,
                    refunded: depRef.total || 0,
                    adminCount: depAdmin.total || 0
                },
                users: {
                    total: Math.max(0, (tUsr.total || 0) - deletedUsersCount),
                    banned: Math.max(0, (bUsr.total || 0) - deletedUsersCount),
                    activeMonth: activeUsrMonthCount,
                    topThree: topHeroes,
                    mostActiveUsers: mostActiveUsers,
                    bannedIps: bannedIpsCount,
                    bannedDevices: bannedDevicesCount
                },
                pendingCounts: {
                    orders: pOrd.total || 0,
                    deposits: pDep.total || 0,
                    kyc: pKyc.total || 0,
                    complaints: pComp.total || 0
                },
                systemAlerts: recentSystemAlerts
            }
        };
    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        throw new HttpsError('internal', 'فشل جلب إحصائيات لوحة القيادة.');
    }
});

// ==========================================
// 🔍 المحرك الذكي الموحد لإيجاد العملاء (بالكود القصير، الطويل، الإيميل، الهاتف، اليوزر، أو الاسم)
// ==========================================
const findMatchingUserDocs = async (dbInstance, rawQueryStr, fetchLimit = 10, filterByTier = null) => {
    const cleanQuery = String(rawQueryStr || '').trim();
    if (!cleanQuery) return [];

    let query = dbInstance.collection('telecard_users');
    const lowerQuery = cleanQuery.toLowerCase();
    const cleanUsername = lowerQuery.replace(/^@/, '');
    const cleanDisplayId = cleanQuery.replace(/^(#|USR-|ID:?)\s*/i, '').toUpperCase();
    const cleanPhoneDigits = cleanQuery.replace(/[^0-9]/g, '');

    let resultDocs = [];

    // 1. إذا كان بريداً إلكترونياً حقيقياً
    if (cleanQuery.includes('@') && !cleanQuery.startsWith('@')) {
        const { docs } = await SecurityEngine.paginateFirestore(query.where('email', '==', lowerQuery), fetchLimit);
        resultDocs = docs;
    }
    // 2. إذا بدأ ببادئة الكود القصير (USR- أو #)
    else if (/^(#|USR-)/i.test(cleanQuery) && cleanDisplayId.length >= 2) {
        const { docs } = await SecurityEngine.paginateFirestore(
            query.where('displayId', '>=', cleanDisplayId).where('displayId', '<=', cleanDisplayId + '\uf8ff'),
            fetchLimit
        );
        resultDocs = docs;
    }
    // 3. إذا كان UID طويلاً (20 خانة فأكثر) -> نفحص الـ UID مع الاحتفاظ ببحث احتياطي لليوزرنيم الطويل
    else if (cleanQuery.length >= 20 && !cleanQuery.startsWith('@') && /^[a-zA-Z0-9_-]+$/.test(cleanQuery)) {
        const [byUid, byLongUser] = await Promise.all([
            SecurityEngine.paginateFirestore(query.where(admin.firestore.FieldPath.documentId(), '==', cleanQuery), fetchLimit),
            SecurityEngine.paginateFirestore(query.where('username', '==', lowerQuery), fetchLimit)
        ]);
        resultDocs = [...byUid.docs, ...byLongUser.docs];
    }
    // 4. إذا كان رقم هاتف (7 أرقام فأكثر)
    else if (/^\+?[0-9\s-]{7,18}$/.test(cleanQuery) && cleanPhoneDigits.length >= 7) {
        const queriesToRun = [
            SecurityEngine.paginateFirestore(query.where('phone', '==', cleanQuery), fetchLimit),
            SecurityEngine.paginateFirestore(query.where('phone', '==', `+${cleanPhoneDigits}`), fetchLimit),
            SecurityEngine.paginateFirestore(query.where('phone', '==', cleanPhoneDigits), fetchLimit)
        ];
        if (cleanDisplayId.length >= 4 && cleanDisplayId.length <= 8) {
            queriesToRun.push(
                SecurityEngine.paginateFirestore(
                    query.where('displayId', '>=', cleanDisplayId).where('displayId', '<=', cleanDisplayId + '\uf8ff'),
                    fetchLimit
                )
            );
        }
        const snaps = await Promise.all(queriesToRun);
        const map = new Map();
        snaps.forEach(s => s.docs.forEach(d => map.set(d.id, d)));
        resultDocs = Array.from(map.values());
    }
    // 5. البحث الشامل (بالاسم الكامل، أو اليوزرنيم، أو الكود القصير displayId كاملاً أو جزئياً)
    else {
        const parallelSearches = [
            SecurityEngine.paginateFirestore(query.where('username', '==', cleanUsername), fetchLimit),
            SecurityEngine.paginateFirestore(query.where('fullName', '>=', cleanQuery).where('fullName', '<=', cleanQuery + '\uf8ff'), fetchLimit)
        ];
        // دعم البحث بالاسم الإنجليزي حتى لو كُتب الحرف الأول صغيراً (ahmed -> Ahmed)
        const capitalizedQuery = cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1);
        if (capitalizedQuery !== cleanQuery) {
            parallelSearches.push(
                SecurityEngine.paginateFirestore(query.where('fullName', '>=', capitalizedQuery).where('fullName', '<=', capitalizedQuery + '\uf8ff'), fetchLimit)
            );
        }
        if (cleanDisplayId.length >= 2 && /^[A-Z0-9]+$/.test(cleanDisplayId)) {
            parallelSearches.push(
                SecurityEngine.paginateFirestore(
                    query.where('displayId', '>=', cleanDisplayId).where('displayId', '<=', cleanDisplayId + '\uf8ff'),
                    fetchLimit
                )
            );
        }
        const resultsArr = await Promise.all(parallelSearches);
        const mergedMap = new Map();
        resultsArr.forEach(resObj => resObj.docs.forEach(d => mergedMap.set(d.id, d)));
        resultDocs = Array.from(mergedMap.values());
    }

    const uniqueMap = new Map();
    resultDocs.forEach(d => uniqueMap.set(d.id, d));

    return Array.from(uniqueMap.values())
        .filter(doc => doc.data().isDeleted !== true)
        .filter(doc => !filterByTier || doc.data().tierId === String(filterByTier));
};

// ==========================================
// 📄 5. دوال جلب القوائم للإدارة بنظام الصفحات والبحث الذكي 360° (Orders, Deposits, Users, Logs)
// ==========================================

exports.adminGetOrdersList = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { limit = 50, lastTimeMs = null, lastDocId = null, status = null, startDateMs = null, endDateMs = null, searchQuery = null } = request.data || {};
    const fetchLimit = Math.min(Number(limit) || 50, 250);
    const cleanSearch = searchQuery ? String(searchQuery).trim() : '';
    
    try {
        let docs = [], hasMore = false, lastDoc = null;

        if (cleanSearch && !lastTimeMs) {
            const cleanOrderId = cleanSearch.replace(/^(#|ORD-)\s*/i, '').trim();
            const upperOrderId = cleanOrderId.toUpperCase();
            const prefixOrderId = upperOrderId.startsWith('TC-') ? upperOrderId : `TC-${upperOrderId}`;

            // المرحلة 1: البحث المباشر في الطلبات (بالرقم الكامل كبيراً/صغيراً، أو البادئة، أو الـ UID، أو رقم المورد، أو آيدي اللاعب)
            const [exactUpperSnap, exactRawSnap, byPrefixSnap, byDirectUidSnap, byExtSnap, byInputSnap] = await Promise.all([
                db.collection('telecard_orders').doc(prefixOrderId).get(),
                (cleanOrderId !== prefixOrderId) ? db.collection('telecard_orders').doc(cleanOrderId).get() : Promise.resolve({ exists: false }),
                (upperOrderId.length >= 2 && /^[A-Z0-9_-]+$/.test(upperOrderId))
                    ? db.collection('telecard_orders').where('displayId', '>=', prefixOrderId).where('displayId', '<=', prefixOrderId + '\uf8ff').limit(fetchLimit).get()
                    : Promise.resolve({ empty: true, docs: [] }),
                (cleanSearch.length >= 15 && /^[a-zA-Z0-9_-]+$/.test(cleanSearch))
                    ? db.collection('telecard_orders').where('userId', '==', cleanSearch).orderBy('time', 'desc').limit(fetchLimit).get()
                    : Promise.resolve({ empty: true, docs: [] }),
                db.collection('telecard_orders').where('externalOrderId', '==', cleanOrderId).limit(fetchLimit).get(),
                db.collection('telecard_orders').where('input', '==', cleanSearch).limit(fetchLimit).get()
            ]);

            const mergedOrdersMap = new Map();
            if (exactUpperSnap.exists) mergedOrdersMap.set(exactUpperSnap.id, exactUpperSnap);
            if (exactRawSnap.exists) mergedOrdersMap.set(exactRawSnap.id, exactRawSnap);
            byPrefixSnap.docs.forEach(d => mergedOrdersMap.set(d.id, d));
            byDirectUidSnap.docs.forEach(d => mergedOrdersMap.set(d.id, d));
            byExtSnap.docs.forEach(d => mergedOrdersMap.set(d.id, d));
            byInputSnap.docs.forEach(d => mergedOrdersMap.set(d.id, d));

            // المرحلة 2: إذا لم يكن رقم طلب مباشر، نبحث عن العميل في telecard_users (بالكود القصير، الإيميل، الاسم، الهاتف، أو اليوزر) ونجلب طلباته!
            if (mergedOrdersMap.size === 0) {
                const matchedUserDocs = await findMatchingUserDocs(db, cleanSearch, 5);
                if (matchedUserDocs.length > 0) {
                    const userOrdersSnaps = await Promise.all(
                        matchedUserDocs.slice(0, 5).map(uDoc =>
                            db.collection('telecard_orders').where('userId', '==', uDoc.id).orderBy('time', 'desc').limit(fetchLimit).get()
                        )
                    );
                    userOrdersSnaps.forEach(s => s.docs.forEach(d => mergedOrdersMap.set(d.id, d)));
                }
            }

            const rawEnd = endDateMs ? Number(endDateMs) : null;
            const effectiveEndMs = rawEnd ? ((rawEnd % 86400000 === 0) ? (rawEnd + 86399999) : rawEnd) : null;

            docs = Array.from(mergedOrdersMap.values())
                .filter(d => {
                    const o = d.data();
                    if (status && status !== 'all') {
                        if (status === 'pending' && !['pending', 'processing'].includes(o.status)) return false;
                        else if (status === 'refunded' && !['refunded', 'returned'].includes(o.status)) return false;
                        else if (status !== 'pending' && status !== 'refunded' && o.status !== status) return false;
                    }
                    const tMs = FinancialEngine.parseSafeTime(o.time);
                    if (startDateMs && tMs < Number(startDateMs)) return false;
                    if (effectiveEndMs && tMs > effectiveEndMs) return false;
                    return true;
                })
                .sort((a, b) => FinancialEngine.parseSafeTime(b.data().time) - FinancialEngine.parseSafeTime(a.data().time))
                .slice(0, fetchLimit);
        }

        if (docs.length === 0 && !cleanSearch) {
            let query = db.collection('telecard_orders');
            if (status && status !== 'all') {
                if (status === 'pending') {
                    query = query.where('status', 'in', ['pending', 'processing']);
                } else if (status === 'refunded') {
                    query = query.where('status', 'in', ['refunded', 'returned']);
                } else {
                    query = query.where('status', '==', String(status));
                }
            }
            if (startDateMs) query = query.where('time', '>=', admin.firestore.Timestamp.fromMillis(Number(startDateMs)));
            if (endDateMs) {
                const rawEnd = Number(endDateMs);
                const effectiveEndMs = (rawEnd % 86400000 === 0) ? (rawEnd + 86399999) : rawEnd;
                query = query.where('time', '<=', admin.firestore.Timestamp.fromMillis(effectiveEndMs));
            }
            
            query = query.orderBy('time', 'desc').orderBy(admin.firestore.FieldPath.documentId(), 'desc');
            if (lastTimeMs && lastDocId) query = query.startAfter(admin.firestore.Timestamp.fromMillis(Number(lastTimeMs)), String(lastDocId));
            
            const pageRes = await SecurityEngine.paginateFirestore(query, fetchLimit);
            docs = pageRes.docs;
            hasMore = pageRes.hasMore;
            lastDoc = pageRes.lastDoc;
        }        
        
        const orders = docs.map(doc => {
            const data = doc.data();
            const audit = SecurityEngine.decryptOrderAudit(data._auditToken);
            return {
                id: doc.id, displayId: data.displayId, product: data.product, prodId: data.prodId || null, 
                optIdx: data.optIdx !== undefined ? data.optIdx : null, optionName: data.optionName || null,
                price: data.price ?? data.priceLocalDeducted,
                priceBaseUsd: data.priceBaseUsd, priceLocalDeducted: data.priceLocalDeducted, priceCurrency: data.priceCurrency,
                pricingSnapshot: {
                    ...(data.pricingSnapshot || {}),
                    costUsd: audit.costUsd ?? data.pricingSnapshot?.costUsd ?? 0,
                    netProfitUsd: audit.netProfitUsd ?? data.pricingSnapshot?.netProfitUsd ?? 0
                },
                supplierId: audit.supplierId || data.supplierId || null,
                externalOrderId: data.externalOrderId || null,
                lateSupplierCode: data.lateSupplierCode || null,
                isPendingSupplierCheck: Boolean(data.isPendingSupplierCheck),
                requiresAdminAttention: Boolean(data.requiresAdminAttention),
                tierName: data.tierName || 'عضو', isApi: data.isApi || false, 
                source: data.source || null, status: data.status,
                userId: data.userId || null,
                qty: data.qty || 1,
                input: data.input || '---',
                ...(data.playerInputs && { playerInputs: data.playerInputs }),
                adminNote: data.adminNote || null,
                balanceAfter: data.balanceAfter !== undefined ? data.balanceAfter : null,
                vaultPoolId: data.vaultPoolId || null,
                deliveredCode: data.deliveredCode || null,
                time: data.time ? (typeof data.time.toMillis === 'function' ? data.time.toMillis() : data.time) : null,
                actionTime: data.actionTime ? (typeof data.actionTime.toMillis === 'function' ? data.actionTime.toMillis() : data.actionTime) : null,
                userDataSnapshot: data.userDataSnapshot || {}
            };
        });

        const newLastTimeMs = lastDoc && lastDoc.data().time ? (typeof lastDoc.data().time.toMillis === 'function' ? lastDoc.data().time.toMillis() : lastDoc.data().time) : null;
        const newLastDocId = lastDoc ? lastDoc.id : null;
        
        return { success: true, data: orders, pagination: { lastTimeMs: newLastTimeMs, lastDocId: newLastDocId, hasMore } };
    } catch (error) { throw new HttpsError('internal', 'فشل جلب قائمة الطلبات.'); }
});

exports.adminGetDepositsList = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { limit = 50, status = null, startDateMs = null, endDateMs = null, lastTimeMs = null, lastDocId = null, searchQuery = null } = request.data || {};
    const fetchLimit = Math.min(Number(limit) || 50, 250);
    const cleanSearch = searchQuery ? String(searchQuery).trim() : '';
    
    try {
        let docs = [], hasMore = false, lastDoc = null;

        if (cleanSearch && !lastTimeMs) {
            const cleanDepId = cleanSearch.replace(/^(#|DEP-)\s*/i, '').trim();
            const upperDepId = cleanDepId.toUpperCase();
            const hasExplicitPrefix = upperDepId.startsWith('TC-') || upperDepId.startsWith('ADMBAL-');
            const prefixDepId = hasExplicitPrefix ? upperDepId : `TC-${upperDepId}`;
            const admPrefixDepId = hasExplicitPrefix ? null : `ADMBAL-${upperDepId}`;
            const isValidPrefixChars = upperDepId.length >= 2 && /^[A-Z0-9_-]+$/.test(upperDepId);

            const [exactUpperSnap, exactRawSnap, byPrefixSnap, byAdmPrefixSnap, byDirectUidSnap] = await Promise.all([
                db.collection('telecard_deposits').doc(prefixDepId).get(),
                (cleanDepId !== prefixDepId) ? db.collection('telecard_deposits').doc(cleanDepId).get() : Promise.resolve({ exists: false }),
                isValidPrefixChars ?
                db.collection('telecard_deposits').where('displayId', '>=', prefixDepId).where('displayId', '<=', prefixDepId + '\uf8ff').limit(fetchLimit).get() :
                Promise.resolve({ empty: true, docs: [] }),
                (isValidPrefixChars && admPrefixDepId) ?
                db.collection('telecard_deposits').where('displayId', '>=', admPrefixDepId).where('displayId', '<=', admPrefixDepId + '\uf8ff').limit(fetchLimit).get() :
                Promise.resolve({ empty: true, docs: [] }),
                (cleanSearch.length >= 15 && /^[a-zA-Z0-9_-]+$/.test(cleanSearch)) ?
                db.collection('telecard_deposits').where('userId', '==', cleanSearch).orderBy('time', 'desc').limit(fetchLimit).get():
                Promise.resolve({ empty: true, docs: [] })
            ]);

            const mergedDepsMap = new Map();
            if (exactUpperSnap.exists) mergedDepsMap.set(exactUpperSnap.id, exactUpperSnap);
            if (exactRawSnap.exists) mergedDepsMap.set(exactRawSnap.id, exactRawSnap);
            byPrefixSnap.docs.forEach(d => mergedDepsMap.set(d.id, d));
            byAdmPrefixSnap.docs.forEach(d => mergedDepsMap.set(d.id, d));
            byDirectUidSnap.docs.forEach(d => mergedDepsMap.set(d.id, d));

            // إذا لم يكن رقم إيداع مباشر، نبحث عن العميل في telecard_users (بالكود القصير، الإيميل، الاسم، الهاتف، أو اليوزر) ونجلب إيداعاته!
            if (mergedDepsMap.size === 0) {
                const matchedUserDocs = await findMatchingUserDocs(db, cleanSearch, 5);
                if (matchedUserDocs.length > 0) {
                    const userDepSnaps = await Promise.all(
                        matchedUserDocs.slice(0, 5).map(uDoc =>
                            db.collection('telecard_deposits').where('userId', '==', uDoc.id).orderBy('time', 'desc').limit(fetchLimit).get()
                        )
                    );
                    userDepSnaps.forEach(s => s.docs.forEach(d => mergedDepsMap.set(d.id, d)));
                }
            }           
            const rawEnd = endDateMs ? Number(endDateMs) : null;
            const effectiveEndMs = rawEnd ? ((rawEnd % 86400000 === 0) ? (rawEnd + 86399999) : rawEnd) : null;

            docs = Array.from(mergedDepsMap.values())
                .filter(d => {
                    const dep = d.data();
                    if (status && status !== 'all' && dep.status !== status) return false;
                    const tMs = FinancialEngine.parseSafeTime(dep.time);
                    if (startDateMs && tMs < Number(startDateMs)) return false;
                    if (effectiveEndMs && tMs > effectiveEndMs) return false;
                    return true;
                })
                .sort((a, b) => FinancialEngine.parseSafeTime(b.data().time) - FinancialEngine.parseSafeTime(a.data().time))
                .slice(0, fetchLimit);
        }

        if (docs.length === 0 && !cleanSearch) {
            let query = db.collection('telecard_deposits');
            if (status && status !== 'all') query = query.where('status', '==', String(status));
            if (startDateMs) query = query.where('time', '>=', admin.firestore.Timestamp.fromMillis(Number(startDateMs)));
            if (endDateMs) {
                const rawEnd = Number(endDateMs);
                const effectiveEndMs = (rawEnd % 86400000 === 0) ? (rawEnd + 86399999) : rawEnd;
                query = query.where('time', '<=', admin.firestore.Timestamp.fromMillis(effectiveEndMs));
            }
            
            query = query.orderBy('time', 'desc').orderBy(admin.firestore.FieldPath.documentId(), 'desc');
            if (lastTimeMs && lastDocId) query = query.startAfter(admin.firestore.Timestamp.fromMillis(Number(lastTimeMs)), String(lastDocId));
            
            const pageRes = await SecurityEngine.paginateFirestore(query, fetchLimit);
            docs = pageRes.docs;
            hasMore = pageRes.hasMore;
            lastDoc = pageRes.lastDoc;
        }
        
        // 📌 [توحيد معماري - سجل الإيداعات]: إرجاع الحقول القياسية الموحدة بدون أسماء مكررة
        const deposits = docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                displayId: data.displayId,
                userId: data.userId,
                userName: data.userDataSnapshot?.fullName || null,
                method: data.method || 'إيداع رصيد',
                amount: data.amount,
                creditedAmount: data.creditedAmount,
                creditedBaseUsd: data.creditedBaseUsd ?? null,
                feeAmount: data.feeAmount || 0,
                feePct: data.feePct || 0,
                feeType: data.feeType || 'fee',
                feeUnit: data.feeUnit || 'percent',
                currency: data.currency || data.targetCurrency || 'USD',
                targetCurrency: data.targetCurrency || 'USD',
                fxRate: data.fxRate || 1,
                balanceAfter: data.balanceAfter !== undefined ? data.balanceAfter : null,
                status: data.status,
                receipt: data.receipt || null,
                admin: data.admin || null,
                adminNote: data.adminNote || null,
                time: data.time ? (typeof data.time.toMillis === 'function' ? data.time.toMillis() : data.time) : null,
                actionTime: data.actionTime ? (typeof data.actionTime.toMillis === 'function' ? data.actionTime.toMillis() : data.actionTime) : null,
                userDataSnapshot: data.userDataSnapshot || {}
            };
        });
        
        const newLastTimeMs = lastDoc && lastDoc.data().time ? (typeof lastDoc.data().time.toMillis === 'function' ? lastDoc.data().time.toMillis() : lastDoc.data().time) : null;
        const newLastDocId = lastDoc ? lastDoc.id : null;
        
        return { success: true, data: deposits, pagination: { lastTimeMs: newLastTimeMs, lastDocId: newLastDocId, hasMore } };
    } catch (error) { throw new HttpsError('internal', 'فشل جلب قائمة الإيداعات.'); }
});

exports.adminGetUsersList = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { limit = 50, lastDocId = null, sortCategory = 'newest', sortDir = 'desc', searchQuery = '', filterByTier = null } = request.data || {};
    const fetchLimit = Math.min(Number(limit) || 50, 1000);
    
    const sanitizeUserForAdminList = (doc) => {
        const data = doc.data();
        const { passwordChangeHistory, webhookSecret, apiKeyHash, fcmTokens, ...safeData } = data;
        return {
            id: doc.id,
            ...safeData,
            ...(apiKeyHash ? { apiKeyHash: '[ACTIVE]' } : {}),
            hasWebhookSecret: Boolean(webhookSecret)
        };
    };
    
    try {
        const dbInstance = admin.firestore();
        const queryStr = String(searchQuery).trim();
        
        if (queryStr) {
            const matchedDocs = await findMatchingUserDocs(dbInstance, queryStr, fetchLimit, filterByTier);
            const users = matchedDocs.map(sanitizeUserForAdminList);
            return { success: true, data: users, pagination: { hasMore: false, lastDocId: null } };
        }
        let query = dbInstance.collection('telecard_users');
if (filterByTier) {
    query = query.where('tierId', '==', String(filterByTier));
}

let orderField = 'createdAt';
if (sortCategory === 'spend_all') orderField = 'totalSpent';
else if (sortCategory === 'orders_all') orderField = 'totalOrdersCount';
const direction = (!filterByTier && sortDir === 'asc') ? 'asc' : 'desc';

query = query.orderBy(orderField, direction).orderBy(admin.firestore.FieldPath.documentId(), direction);        
        let cursorDocSnap = null;
        if (lastDocId) {
            const lastDocSnap = await dbInstance.collection('telecard_users').doc(String(lastDocId)).get();
            if (lastDocSnap.exists) cursorDocSnap = lastDocSnap;
        }
        
        const users = [];
        let hasMore = false;
        let newLastDocId = null;
        let safetyHops = 0;

        // 🛡️ حلقة الاستكمال: نستمر في جلب الوثائق وتخطي المحذوفة حتى نجمع العدد المطلوب (fetchLimit) أو تنتهي القاعدة
        while (users.length < fetchLimit && safetyHops < 3) {
            safetyHops++;
            let pageQuery = query;
            if (cursorDocSnap) {
                pageQuery = pageQuery.startAfter(cursorDocSnap);
            }

            const remainingNeeded = fetchLimit - users.length;
            const stepFetchSize = safetyHops === 1 ? fetchLimit : Math.min(250, Math.max(remainingNeeded * 2, 50));
            const pageRes = await SecurityEngine.paginateFirestore(pageQuery, stepFetchSize);

            if (pageRes.docs.length === 0) {
                hasMore = false;
                break;
            }

            for (const doc of pageRes.docs) {
                cursorDocSnap = doc;
                newLastDocId = doc.id;
                if (doc.data().isDeleted !== true) {
                    users.push(sanitizeUserForAdminList(doc));
                    if (users.length >= fetchLimit) break;
                }
            }

            const stoppedMidPage = pageRes.docs[pageRes.docs.length - 1].id !== newLastDocId;
            hasMore = pageRes.hasMore || stoppedMidPage;
            if (!pageRes.hasMore) break;
        }
        
        return { success: true, data: users, pagination: { hasMore, lastDocId: newLastDocId } };
    } catch (error) {
        console.error("🚨 adminGetUsersList Error:", error);
        throw new HttpsError('internal', 'فشل جلب قائمة العملاء من السحابة.');
    }
});

exports.adminGetLogsList = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { limit = 50, lastTimeMs = null, lastDocId = null } = request.data || {};
    const fetchLimit = Math.min(Number(limit) || 50, 1000);
    
    try {
        const dbInstance = admin.firestore();
        let query = dbInstance.collection('telecard_audit_logs')
            .orderBy('timestamp', 'desc')
            .orderBy(admin.firestore.FieldPath.documentId(), 'desc');
        if (lastTimeMs && lastDocId) {
            query = query.startAfter(admin.firestore.Timestamp.fromMillis(Number(lastTimeMs)), String(lastDocId));
        }
        
        const [auditRes, errorsSnap] = await Promise.all([
            SecurityEngine.paginateFirestore(query, fetchLimit),
            dbInstance.collection('telecard_system_errors').orderBy('time', 'desc').limit(100).get().catch(() => ({ docs: [] }))
        ]);
        
        const toMs = (val) => val ? (typeof val.toMillis === 'function' ? val.toMillis() : Number(val) || 0) : null;
        
        const logs = auditRes.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                adminUid: data.adminUid || 'غير معروف',
                action: data.action || 'عملية غير مسجلة',
                details: data.details || '',
                timestamp: toMs(data.timestamp)
            };
        });
        
        const systemErrors = (errorsSnap.docs || []).map(doc => {
            const data = doc.data();
            let detailsTxt = data.details || data.errorMsg || '';
            if (Array.isArray(data.discrepancies) && data.discrepancies.length > 0) {
                const discSummary = data.discrepancies
                    .slice(0, 5)
                    .map(d => `#${d.orderId || ''}: ${d.details || ''}`)
                    .join(' | ');
                detailsTxt = `${detailsTxt} (${discSummary})`.trim();
            }
            const firstDiscOrderId = (Array.isArray(data.discrepancies) && data.discrepancies[0]?.orderId) ? data.discrepancies[0].orderId : null;
            
            return {
                id: doc.id,
                action: data.action || 'SYSTEM_ERROR',
                title: data.title || data.action || 'خطأ نظام',
                supplierId: data.supplierId || null,
                details: detailsTxt,
                target: data.target || null,
                orderId: data.orderId || firstDiscOrderId || null,
                prodId: data.prodId || null,
                userId: data.userId || null,
                timestamp: toMs(data.time)
            };
        });
        
        const lastDoc = auditRes.lastDoc;
        const newLastTimeMs = lastDoc && lastDoc.data().timestamp ? toMs(lastDoc.data().timestamp) : null;
        const newLastDocId = lastDoc ? lastDoc.id : null;
        
        return {
            success: true,
            data: logs,
            systemErrors: systemErrors,
            pagination: { lastTimeMs: newLastTimeMs, lastDocId: newLastDocId, hasMore: auditRes.hasMore }
        };
    } catch (error) {
        throw new HttpsError('internal', 'فشل جلب السجلات الجنائية من السحابة.');
    }
});// ==========================================
// 🧹 6. محرك الصيانة الليلي الموحد (المهمة المجدولة المجانية 1 من 3)
// ==========================================
const runWeeklyLedgerReconciliation = async () => {
    try {
        const sevenDaysAgoMs = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const cursorRef = db.collection('telecard_system').doc('audit_cursor');
        const cursorSnap = await cursorRef.get();
        const lastAuditedDocId = cursorSnap.exists ? cursorSnap.data()?.lastUserId : null;

        let roundRobinQuery = db.collection('telecard_users')
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(300);
        if (lastAuditedDocId) {
            roundRobinQuery = roundRobinQuery.startAfter(String(lastAuditedDocId));
        }

        const [activeWeekSnap, topWalletsSnap, roundRobinSnap] = await Promise.all([
            db.collection('telecard_users').where('lastOrderTime', '>=', sevenDaysAgoMs).orderBy('lastOrderTime', 'desc').limit(500).get(),
            db.collection('telecard_users').where('walletBalance', '>', 0).orderBy('walletBalance', 'desc').limit(200).get(),
            roundRobinQuery.get()
        ]);

        const nextCursorId = (!roundRobinSnap.empty && roundRobinSnap.size === 300)
            ? roundRobinSnap.docs[roundRobinSnap.docs.length - 1].id
            : null;
        await cursorRef.set({
            lastUserId: nextCursorId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        const uniqueUserDocsMap = new Map();
        activeWeekSnap.docs.forEach(d => { if (d.data().isDeleted !== true) uniqueUserDocsMap.set(d.id, d); });
        topWalletsSnap.docs.forEach(d => { if (d.data().isDeleted !== true) uniqueUserDocsMap.set(d.id, d); });
        roundRobinSnap.docs.forEach(d => { if (d.data().isDeleted !== true) uniqueUserDocsMap.set(d.id, d); });

        const userDocs = Array.from(uniqueUserDocsMap.values());
        if (userDocs.length === 0) return null;
        const discrepancies = [];

        const CONCURRENCY_LIMIT = 20;
        for (let i = 0; i < userDocs.length; i += CONCURRENCY_LIMIT) {
            const chunk = userDocs.slice(i, i + CONCURRENCY_LIMIT);
            await Promise.all(chunk.map(async (doc) => {
                let auditResult = await performWalletAudit(doc.id, db, doc.data());
                
                if (!auditResult.isValid && auditResult.status !== 'not_found') {
                    // 🛡️ إعادة التحقق بقراءة حية لوثيقة العميل لمنع الإنذارات الكاذبة إذا أجرى العميل عملية أثناء عمل الكرون
                    auditResult = await performWalletAudit(doc.id, db, null);
                }

                if (!auditResult.isValid && auditResult.status !== 'not_found') {
                    discrepancies.push(auditResult);
                    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
                    await db.collection('telecard_system_errors').add({
                        action: 'WALLET_AUDIT_DISCREPANCY',
                        userId: doc.id,
                        details: `تضارب مالي! مسجل: ${auditResult.currentWalletBal}، مفترض: ${auditResult.expectedBalance}`,
                        auditData: auditResult,
                        time: admin.firestore.FieldValue.serverTimestamp(),
                        expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + THIRTY_DAYS_MS)
                    });
                }
            }));
        }

        if (discrepancies.length > 0) {
            await SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                '🚨 اكتشاف تضارب في التدقيق المالي الأسبوعي!',
                `تم رصد (${discrepancies.length}) حساب غير متطابق مالياً خلال الفحص الدوري. يرجى مراجعة سجلات الأخطاء.`,
                { target: 'users' }
            ).catch(() => {});
        }

        console.log(`[Ledger Audit] Completed. Checked ${userDocs.length} users. Discrepancies found: ${discrepancies.length}`);
        return null;
    } catch (error) {
        console.error("[Ledger Audit Error]", error);
        return null;
    }
};

const runMonthlyInactiveSweeper = async () => {
    try {
        const ninetyDaysAgoMs = Date.now() - (90 * 24 * 60 * 60 * 1000);
        let hasMore = true;
        let totalSwept = 0;
        
        while (hasMore) {
            const inactiveUsersSnap = await db.collection('telecard_users')
                .where('isDormant', '==', false)
                .where('lastOrderTime', '>', 0)
                .where('lastOrderTime', '<', ninetyDaysAgoMs)
                .limit(500)
                .get();
            
            if (inactiveUsersSnap.empty) {
                hasMore = false;
                break;
            }
            
            await SecurityEngine.processInBatches(db, inactiveUsersSnap.docs, async (batch, doc) => {
                batch.update(doc.ref, {
                    isDormant: true,
                    dormantSince: admin.firestore.FieldValue.serverTimestamp()
                });
            }, 400);
            
            totalSwept += inactiveUsersSnap.size;
        }
        
        if (totalSwept > 0) {
            console.log(`[Inactive Sweeper] تم وسم ${totalSwept} عميل كحسابات خاملة بنجاح.`);
        }
    } catch (error) {
        console.error("[Inactive Sweeper Error]", error);
    }
};

// 🆓 المهمة المجدولة المجانية (1 من 3) - الصيانة الليلية الشاملة للمتجر
exports.dailyStoreMaintenance = onSchedule({
    schedule: "0 2 * * *",
    timeZone: "UTC",
    timeoutSeconds: 540,
    memory: "512MiB",
    concurrency: 1,
    maxInstances: 1
}, async () => {
    const { runCloudStorageGarbageCollector, runExpiredPromosAndOverridesSweeper } = require('./triggersEngine.js');
    const { runSupplierOrdersReconciliation } = require('./supplierEngine.js');
    const nowUtc = new Date();

    // 1. المهام اليومية (تنظيف الصور اليتيمة + مطابقة طلبات الموردين + تطهير الأسعار والعروض المنتهية)
    await Promise.allSettled([
        runCloudStorageGarbageCollector(),
        runSupplierOrdersReconciliation(48),
        runExpiredPromosAndOverridesSweeper()
    ]);
    
    // 2. المهمة الأسبوعية (تعمل كل يوم جمعة: getUTCDay() === 5)
    if (nowUtc.getUTCDay() === 5) {
        await runWeeklyLedgerReconciliation();
    }

    // 3. المهمة الشهرية (تعمل يوم 1 من كل شهر: getUTCDate() === 1)
    if (nowUtc.getUTCDate() === 1) {
        await runMonthlyInactiveSweeper();
    }

    return true;
});

exports.adminAuditUserWallet = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const targetUserId = String(request.data?.userId || '');
    if (!targetUserId) throw new HttpsError('invalid-argument', 'رقم العميل مفقود.');
    
    try {
        const auditResult = await performWalletAudit(targetUserId, db);
        
        if (auditResult.status === 'not_found') {
            throw new HttpsError('not-found', 'العميل غير موجود.');
        }
        
        if (auditResult.isValid) {
            return {
                success: true,
                message: 'البيانات المالية متطابقة تماماً. لا يوجد أي تشوه.',
                data: auditResult
            };
        }
        
        if (request.data.forceCorrect === true) {
            const userRef = db.collection('telecard_users').doc(targetUserId);
            
            await db.runTransaction(async (transaction) => {
                const liveUserSnap = await transaction.get(userRef);
                if (!liveUserSnap.exists) throw new HttpsError('not-found', 'تعذر العثور على وثيقة العميل أثناء التصحيح.');
                
                const liveUserData = liveUserSnap.data();
                const liveWalletBal = Number(liveUserData.walletBalance || 0);
                
                const balanceShift = Math.abs(liveWalletBal - auditResult.currentWalletBal);
                if (balanceShift > 0.001) {
                    throw new HttpsError('aborted', 'تم إلغاء التصحيح بأمان: أجرى العميل حركة مالية في نفس اللحظة وتغير رصيده. يرجى إعادة التدقيق أولاً.');
                }
                
                transaction.update(userRef, {
                    walletBalance: auditResult.expectedBalance
                });
            });
            
            await logAdminAction(request.auth.uid, 'AUDIT_WALLET_CORRECTED', `تم تصحيح التشوه للعميل ${targetUserId}. الرصيد الجديد: ${auditResult.expectedBalance}`);
            return { success: true, message: 'تم اكتشاف تشوه مالي وتصحيحه بنجاح دون أي تضارب!', data: auditResult };
        }
        
        return {
            success: false,
            message: 'تم اكتشاف تشوه مالي! الرصيد مسجل بشكل خاطئ.',
            data: auditResult,
            requiresCorrection: true
        };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `فشل التدقيق المالي: ${error.message}`);
    }
});

exports.adminToggleUserBan = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { targetUid, isBanned, reason } = request.data || {};
    if (!targetUid) throw new HttpsError('invalid-argument', 'المعرف مفقود.');

    // 🛡️ حماية حساب المالك الأساسي للنظام ومنع المدير من حظر حسابه الشخصي بالخطأ
    if (
        (process.env.SUPER_ADMIN_UID && String(targetUid).trim() === String(process.env.SUPER_ADMIN_UID).trim()) ||
        String(targetUid).trim() === String(request.auth?.uid || '').trim()
    ) {
        throw new HttpsError('permission-denied', 'إجراء محظور أمنياً: لا يمكن حظر حساب المالك الأساسي للنظام أو حظر حسابك الشخصي.');
    }

    const safeReason = SecurityEngine.sanitizeText(String(reason || ''), 250);

    try {
        const userRef = db.collection('telecard_users').doc(String(targetUid));
        const userSnap = await userRef.get();
        
        if (!userSnap.exists) throw new HttpsError('not-found', 'العميل غير موجود.');
        // 🛡️ الحماية الإضافية: منع تعديل حالة الحظر لحساب محذوف
        if (userSnap.data().isDeleted === true) {
            throw new HttpsError('failed-precondition', 'لا يمكن تعديل حالة الحظر لحساب محذوف نهائياً.');
        }

        await userRef.update({
            isBanned: Boolean(isBanned),
            banReason: safeReason,
            bannedAt: isBanned ? admin.firestore.FieldValue.serverTimestamp() : null
        });
        
        try {
            const userRecord = await admin.auth().getUser(String(targetUid));
            const currentClaims = userRecord.customClaims || {};
            currentClaims.banned = Boolean(isBanned);
            await admin.auth().setCustomUserClaims(String(targetUid), currentClaims);
            if (isBanned) await admin.auth().revokeRefreshTokens(String(targetUid));
        } catch (authError) { }
        
        await logAdminAction(request.auth.uid, 'TOGGLE_BAN', `Target: ${targetUid}, isBanned: ${Boolean(isBanned)}`);
        return { success: true };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message);
    }
});

exports.adminUpdateUserProfile = onCall({ enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { targetUid, fullName, email, phone, country } = request.data || {};
    const cleanUid = String(targetUid || '').trim();
    if (!cleanUid) throw new HttpsError('invalid-argument', 'معرف العميل مفقود.');
    
    // 🛡️ حماية حساب المالك الأساسي من تعديل بياناته بواسطة مشرف آخر
    if (
        process.env.SUPER_ADMIN_UID &&
        cleanUid === String(process.env.SUPER_ADMIN_UID).trim() &&
        String(request.auth?.uid || '').trim() !== String(process.env.SUPER_ADMIN_UID).trim()
    ) {
        throw new HttpsError('permission-denied', 'لا يمكن تعديل بيانات حساب المالك الأساسي للنظام.');
    }
    
    const safeName = SecurityEngine.sanitizeText(String(fullName || '').trim(), 100);
    if (!safeName) throw new HttpsError('invalid-argument', 'يجب إدخال الاسم الكامل للعميل.');
    
    const safeCountry = SecurityEngine.sanitizeText(String(country || '').trim(), 100);
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        throw new HttpsError('invalid-argument', 'صيغة البريد الإلكتروني غير صالحة.');
    }
    
    const rawPhone = String(phone || '').trim();
    let safePhone = '';
    if (rawPhone && rawPhone !== '---') {
        const cleanDigits = rawPhone.replace(/[\s()-]/g, '').replace(/^(\+|00)/, '');
        if (!/^[1-9][0-9]{6,14}$/.test(cleanDigits)) {
            throw new HttpsError('invalid-argument', 'صيغة رقم الهاتف غير صالحة (يجب أن يبدأ بمفتاح الدولة مثل +966).');
        }
        safePhone = `+${cleanDigits}`;
    }
    
    try {
        const userRef = db.collection('telecard_users').doc(cleanUid);
        const userSnap = await userRef.get();
        if (!userSnap.exists) throw new HttpsError('not-found', 'العميل غير موجود في قاعدة البيانات.');
        
        const currentData = userSnap.data();
        if (currentData.isDeleted === true) {
            throw new HttpsError('failed-precondition', 'لا يمكن تعديل بيانات حساب محذوف نهائياً.');
        }
        
        const oldEmail = String(currentData.email || '').trim().toLowerCase();
        const oldPhone = String(currentData.phone || '').trim();
        const emailChanged = cleanEmail !== oldEmail;
        const phoneChanged = Boolean(safePhone && safePhone !== oldPhone);
        
        // 1. 🔍 فحص عدم تكرار البريد الإلكتروني في Firestore وفي Firebase Auth
        if (emailChanged) {
            const emailDupSnap = await db.collection('telecard_users').where('email', '==', cleanEmail).limit(2).get();
            const hasFirestoreEmailDup = !emailDupSnap.empty && emailDupSnap.docs.some(d => d.id !== cleanUid && d.data().isDeleted !== true);
            if (hasFirestoreEmailDup) {
                throw new HttpsError('already-exists', 'البريد الإلكتروني الجديد مرتبط بحساب عميل آخر في المتجر.');
            }
            
            try {
                const existingAuthUser = await admin.auth().getUserByEmail(cleanEmail);
                if (existingAuthUser && existingAuthUser.uid !== cleanUid) {
                    throw new HttpsError('already-exists', 'البريد الإلكتروني الجديد مستخدم بالفعل في نظام المصادقة (Firebase Auth) لحساب آخر.');
                }
            } catch (authLookupErr) {
                if (authLookupErr instanceof HttpsError) throw authLookupErr;
                if (authLookupErr.code && authLookupErr.code !== 'auth/user-not-found') {
                    throw new HttpsError('internal', `فشل التحقق من البريد في نظام المصادقة: ${authLookupErr.message}`);
                }
            }
        }
        
        // 2. 🔍 فحص عدم تكرار رقم الهاتف في Firestore
        if (phoneChanged) {
            const phoneDupSnap = await db.collection('telecard_users').where('phone', '==', safePhone).limit(2).get();
            const hasPhoneDup = !phoneDupSnap.empty && phoneDupSnap.docs.some(d => d.id !== cleanUid && d.data().isDeleted !== true);
            if (hasPhoneDup) {
                throw new HttpsError('already-exists', 'رقم الهاتف المدخل مرتبط بحساب عميل آخر في المتجر.');
            }
        }
        
        // 3. 🔐 تحديث Firebase Authentication أولاً لضمان التطابق التام
        try {
            const authUpdatePayload = { displayName: safeName };
            if (emailChanged) authUpdatePayload.email = cleanEmail;
            await admin.auth().updateUser(cleanUid, authUpdatePayload);
        } catch (authUpdateErr) {
            if (authUpdateErr.code === 'auth/email-already-exists') {
                throw new HttpsError('already-exists', 'البريد الإلكتروني الجديد مستخدم بالفعل لحساب آخر.');
            }
            if (authUpdateErr.code === 'auth/invalid-email') {
                throw new HttpsError('invalid-argument', 'صيغة البريد الإلكتروني مرفوضة من نظام المصادقة.');
            }
            if (authUpdateErr.code !== 'auth/user-not-found') {
                throw new HttpsError('internal', `تعذر تحديث نظام المصادقة: ${authUpdateErr.message}`);
            }
        }
        
        // 4. 🗄️ تحديث وثيقة العميل في Firestore
        const nameParts = safeName.split(' ');
        const firstName = nameParts[0] || safeName;
        const lastName = nameParts.slice(1).join(' ') || '';
        
        const firestoreUpdates = {
            fullName: safeName,
            firstName: firstName,
            lastName: lastName,
            email: cleanEmail,
            phone: safePhone,
            country: safeCountry,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await userRef.update(firestoreUpdates);
        
        await logAdminAction(
            request.auth.uid,
            'EDIT_USER_PROFILE',
            `User: ${cleanUid}, Name: ${safeName}${emailChanged ? `, Email: ${oldEmail} -> ${cleanEmail}` : ''}${phoneChanged ? `, Phone: ${oldPhone} -> ${safePhone}` : ''}`
        );
        
        return {
            success: true,
            emailChanged,
            updatedData: {
                fullName: safeName,
                firstName,
                lastName,
                email: cleanEmail,
                phone: safePhone,
                country: safeCountry
            }
        };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || 'فشل تحديث بيانات العميل سحابياً.');
    }
});

exports.adminDeleteUserData = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const targetUid = String(request.data?.targetUid || '').trim();
    if (!targetUid) throw new HttpsError('invalid-argument', 'المعرف مفقود.');

    // 🛡️ حماية حساب المالك الأساسي للنظام ومنع المدير من حذف حسابه الشخصي بالخطأ
    if (
        (process.env.SUPER_ADMIN_UID && targetUid === String(process.env.SUPER_ADMIN_UID).trim()) ||
        targetUid === String(request.auth?.uid || '').trim()
    ) {
        throw new HttpsError('permission-denied', 'إجراء محظور أمنياً: لا يمكن حذف حساب المالك الأساسي للنظام أو حذف حسابك الشخصي.');
    }
    
    try {
        const userSnap = await db.collection('telecard_users').doc(targetUid).get();
        if (userSnap.exists && Number(userSnap.data().walletBalance || 0) > 0) {
            throw new HttpsError('failed-precondition', 'لا يمكن حذف العميل: يوجد رصيد متبقٍ في محفظته. قم بتصفير الرصيد أولاً عبر الخصم الإداري.');
        }
        
        const [activeOrdersSnap, pendingDepositsSnap] = await Promise.all([
            db.collection('telecard_orders')
                .where('userId', '==', targetUid)
                .where('status', 'in', ['pending', 'processing'])
                .limit(1).get(),
            db.collection('telecard_deposits')
                .where('userId', '==', targetUid)
                .where('status', '==', 'pending')
                .limit(1).get()
        ]);
        
        if (!activeOrdersSnap.empty) {
            throw new HttpsError('failed-precondition', 'لا يمكن حذف العميل: توجد طلبات قيد الانتظار أو المعالجة. قم بإنهاء أو رفض طلباته أولاً.');
        }
        if (!pendingDepositsSnap.empty) {
            throw new HttpsError('failed-precondition', 'لا يمكن حذف العميل: توجد طلبات إيداع قيد الانتظار. قم برفض أو معالجة إيداعاته أولاً.');
        }
        
        try {
            await admin.auth().deleteUser(targetUid);
        } catch (authError) {
            if (authError.code !== 'auth/user-not-found') throw new HttpsError('internal', authError.message);
        }
        
        const bucket = admin.storage().bucket();
        try {
            await Promise.allSettled([
                bucket.deleteFiles({ prefix: `kyc_docs/${targetUid}_` }),
                bucket.deleteFiles({ prefix: `avatars/avatar_${targetUid}_` })
            ]);
        } catch (storageError) {}        
        
        try {
            const kycDocsSnap = await db.collection('telecard_kyc').where('userId', '==', targetUid).get();
            if (!kycDocsSnap.empty) {
                const kycBatch = db.batch();
                kycDocsSnap.docs.forEach(kDoc => kycBatch.delete(kDoc.ref));
                await kycBatch.commit();
            }
        } catch (kycErr) {}
        
        if (userSnap.exists) {
            await db.collection('telecard_users').doc(targetUid).update({
                email: `deleted_${targetUid.substring(0, 5)}@system.local`,
                fullName: 'حساب محذوف',
                firstName: 'محذوف',
                lastName: '',
                phone: '---',
                country: '---',
                isDeleted: true,
                isVerified: false,
                isBanned: true,
                isDormant: true,
                lastOrderTime: 0,
                totalSpent: 0,
                totalOrdersCount: 0,
                archivedTotalSpent: admin.firestore.FieldValue.increment(Number(userSnap.data().totalSpent || 0)),
                banReason: 'Deleted by Admin',
                tierId: 'DELETED',
                cycleStartTierId: 'DELETED',
                tierClimbs: [], // 🛡️ تصفير قائمة الترقيات
                devicePrints: [], // 🛡️ تصفير بصمات الأجهزة
                tierCycleSpent: 0,
                manualTierOverride: true,
                kycStatus: 'none',
                kycData: admin.firestore.FieldValue.delete(),
                profileImage: admin.firestore.FieldValue.delete(),
                apiKeyHash: admin.firestore.FieldValue.delete(),
                webhookUrl: admin.firestore.FieldValue.delete(),
                webhookSecret: admin.firestore.FieldValue.delete(),
                fcmTokens: [],
                deletedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        
        const notifsRef = db.collection('telecard_users').doc(targetUid).collection('notifications');
        let hasMore = true;
        while (hasMore) {
            const snapshot = await notifsRef.limit(400).get();
            if (snapshot.empty) { hasMore = false; break; }
            await SecurityEngine.processInBatches(db, snapshot.docs, async (batch, doc) => { batch.delete(doc.ref); }, 400);
        }
        
        try {
            const userStatsSnap = await db.collection('telecard_user_stats').where('userId', '==', targetUid).get();
            if (!userStatsSnap.empty) {
                await SecurityEngine.processInBatches(db, userStatsSnap.docs, async (batch, doc) => { batch.delete(doc.ref); }, 400);
            }
        } catch (statsErr) {}
        
        await logAdminAction(request.auth?.uid, 'DELETE_USER', `Soft deleted user & purged KYC for: ${targetUid}`);
        
        return { success: true };
        
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message);
    }
});
