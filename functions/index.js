// ============================================================================
// 🧠 المحرك الرئيسي (functions/index.js) لـ MaliMor - النسخة الماسية النهائية V16 👑
// 🎯 الوظيفة: المعاملات المالية الآمنة، حماية الثغرات، المزامنة الذكية، والربط
// 🚀 التحديثات المعمارية: 
// 1. Vault Zero-Contention (بيع بلا اختناق)
// 2. Event-Driven Stats (إحصائيات لحظية بتكلفة 0$)
// 3. Auto-Tier Creation (تأمين الحسابات الجديدة)
// 4. دمج كافة دوال الإدارة والإشعارات والمزامنة بنجاح
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require('firebase-admin');
const functions = require('firebase-functions/v1'); 
const crypto = require('crypto');

const FinancialEngine = require('./financialEngine.js');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// 🛡️ درع التيتانيوم الأمني
const SYSTEM_LIMITS = {
    MAX_QTY_PER_ORDER: 10000, 
    MAX_VAULT_QTY_PER_ORDER: 200, 
    MAX_SAFE_AMOUNT: 100000000 
};

// ==========================================
// 🛡️ نظام التدوين الجنائي والمساعدات الأمنية
// ==========================================
const logAdminAction = async (adminUid, action, details) => {
    try {
        await db.collection('telecard_audit_logs').add({
            adminUid, action, details, timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.error("Audit Log Error:", e); }
};

const isMasterAdmin = (request) => request.auth?.token?.admin === true;

const checkBanStatus = (request) => {
    if (request.auth?.token?.banned === true) {
        throw new HttpsError('permission-denied', 'عذراً، هذا الحساب محظور من قبل الإدارة.');
    }
};

const safeAdd = (a, b) => FinancialEngine.safeAdd(a, b);
const safeSub = (a, b) => Math.max(0, FinancialEngine.safeSub(a, b));
const strictSub = (a, b) => FinancialEngine.safeSub(a, b); 

const generateUniqueId = () => {
    const crypto = require('crypto');
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${timestamp}-${randomHex}`; 
};

// ==========================================
// 🛡️ 0. درع الثقة المعدومة (Zero-Trust Shield & Auto-Init)
// ==========================================
exports.onUserAuthCreated = functions.auth.user().onCreate(async (user) => {
    try {
        const userRef = db.collection('telecard_users').doc(user.uid);
        
        let initialTierId = '1';
        const defaultTierSnap = await db.collection('telecard_tiers').where('isDefault', '==', true).limit(1).get();
        
        if (defaultTierSnap.empty) {
            // 🛡️ معالجة الثغرة: إذا لم يوجد مستوى افتراضي، نقوم بإنشائه حتى لا يتعطل التسجيل
            const tierRef = db.collection('telecard_tiers').doc('1');
            await tierRef.set({
                name: 'عضو جديد',
                isDefault: true,
                profitPercent: 5,
                minProfitUsd: 0.1,
                autoAdvance: true,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            initialTierId = defaultTierSnap.docs[0].id;
        }
        
        const initialProfile = {
            email: user.email || '',
            fullName: user.displayName || 'عميل جديد',
            role: 'user',
            walletBalance: 0.0, 
            totalSpent: 0.0,
            totalDeposit: 0.0,
            tierId: initialTierId, 
            tierCycleSpent: 0.0,
            tierCycleStartDate: admin.firestore.FieldValue.serverTimestamp(),
            manualTierOverride: false,
            isBanned: false,
            isIpBanned: false,
            isVerified: false,
            kycStatus: 'none',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await userRef.set(initialProfile, { merge: true });
    } catch (error) {
        console.error(`❌ [CRITICAL] Failed to initialize user ${user.uid}:`, error);
    }
});

// ==========================================
// 🚀 1. نظام التخزين المؤقت الذكي المتزامن (Micro-TTL)
// ==========================================
let localCache = { order: { data: null, version: 0 }, deposit: { data: null, version: 0 }, tiers: { data: null, version: 0 } };
let lastVersionFetchTime = 0;
let cachedGlobalVersion = 1;
let fetchOrderPromise = null, fetchDepositPromise = null, fetchTiersPromise = null, fetchVersionPromise = null;

const getGlobalCacheVersion = async () => {
    const now = Date.now();
    if (now - lastVersionFetchTime < 15000) return cachedGlobalVersion;
    if (fetchVersionPromise) return fetchVersionPromise;
    
    fetchVersionPromise = (async () => {
        try {
            const vSnap = await db.collection('telecard_system').doc('cache_version').get();
            cachedGlobalVersion = vSnap.exists ? (vSnap.data().version || 1) : 1;
            lastVersionFetchTime = Date.now();
            return cachedGlobalVersion;
        } finally { fetchVersionPromise = null; }
    })();
    return fetchVersionPromise;
};

const loadOrderCache = async () => {
    const v = await getGlobalCacheVersion();
    if (localCache.order.data && localCache.order.version === v) return localCache.order.data;
    if (fetchOrderPromise) return fetchOrderPromise;
    
    fetchOrderPromise = (async () => {
        try {
            const [offersSnap, settingsSnap] = await Promise.all([
                db.collection('telecard_offers').where('isActive', '==', true).get(),
                db.collection('telecard_settings').doc('singleton').get()
            ]);
            localCache.order.data = { offers: offersSnap.docs.map(d => d.data()), settings: settingsSnap.exists ? settingsSnap.data() : {} };
            localCache.order.version = v;
            return localCache.order.data;
        } finally { fetchOrderPromise = null; }
    })();
    return fetchOrderPromise;
};

const loadDepositCache = async () => {
    const v = await getGlobalCacheVersion();
    if (localCache.deposit.data && localCache.deposit.version === v) return localCache.deposit.data;
    if (fetchDepositPromise) return fetchDepositPromise;
    
    fetchDepositPromise = (async () => {
        try {
            const [ratesSnap, paymentsSnap, settingsSnap] = await Promise.all([
                db.collection('telecard_rates').get(), db.collection('telecard_payments').get(), db.collection('telecard_settings').doc('singleton').get()
            ]);
            localCache.deposit.data = { rates: ratesSnap.docs.map(d => d.data()), payments: paymentsSnap.docs.map(d => d.data()), settings: settingsSnap.exists ? settingsSnap.data() : {} };
            localCache.deposit.version = v;
            return localCache.deposit.data;
        } finally { fetchDepositPromise = null; }
    })();
    return fetchDepositPromise;
};

const loadTiersCache = async () => {
    const v = await getGlobalCacheVersion();
    if (localCache.tiers.data && localCache.tiers.version === v) return localCache.tiers.data;
    if (fetchTiersPromise) return fetchTiersPromise;
    
    fetchTiersPromise = (async () => {
        try {
            const tiersSnap = await db.collection('telecard_tiers').get();
            localCache.tiers.data = tiersSnap.docs.map(d => d.data());
            localCache.tiers.version = v;
            return localCache.tiers.data;
        } finally { fetchTiersPromise = null; }
    })();
    return fetchTiersPromise;
};

// ==========================================
// 🛒 3. إنشاء الطلبات للعملاء (النسخة المعمارية الخالية من الاختناق)
// ==========================================
exports.createOrder = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    checkBanStatus(request);

    const uid = request.auth.uid;
    const { data } = request;
    const productId = String(data.productId || '');
    let requestedQty = Math.floor(Number(data.qty) || 1);
    const optIdx = data.optIdx !== null && data.optIdx !== undefined ? Number(data.optIdx) : null;
    const finalInputStr = String(data.finalInputStr || '---').substring(0, 500);
    const couponCode = data.couponCode ? String(data.couponCode).trim() : null;
    const idempotencyKey = data.idempotencyKey ? String(data.idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50) : null;
    
    if (!productId) throw new HttpsError('invalid-argument', 'رقم المنتج مفقود.');
    const serverNow = Date.now();

    try {
        const [cache, tiersData] = await Promise.all([
            loadOrderCache(),
            loadTiersCache()
        ]);
        
        const cleanOrderId = generateUniqueId();
        const userRef = db.collection('telecard_users').doc(uid);
        const productRef = db.collection('telecard_prods').doc(productId);
        const orderRef = db.collection('telecard_orders').doc(cleanOrderId); 
        
        let activeOffer = cache.offers.find(off => off.targetProds?.includes(productId) && (!off.expiryDate || off.expiryDate > serverNow));
        let couponRef = couponCode ? (await db.collection('telecard_coupons').where('code', '==', couponCode).limit(1).get()).docs[0]?.ref : null;

        let deliveredCodeText = null, isAutoDelivered = false;

        await db.runTransaction(async (transaction) => {
            const [userSnap, productSnap] = await Promise.all([transaction.get(userRef), transaction.get(productRef)]);
            if (!userSnap.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');
            if (!productSnap.exists) throw new HttpsError('not-found', 'المنتج غير متوفر.');

            const userData = userSnap.data();
            const product = productSnap.data();

            if (userData.isBanned === true) throw new HttpsError('permission-denied', 'العملية مرفوضة.');

            let finalQty = Math.max(1, Math.min(SYSTEM_LIMITS.MAX_QTY_PER_ORDER, requestedQty));
            if (product.vaultPoolId) {
                finalQty = Math.min(finalQty, SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER);
            }

            let idempotencyRef = null;
            if (idempotencyKey) {
                idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
                if ((await transaction.get(idempotencyRef)).exists) throw new HttpsError('already-exists', 'تم معالجة هذا الطلب مسبقاً.');
            }

            let currentCouponData = null;
            if (couponRef) {
                const couponSnap = await transaction.get(couponRef);
                if (couponSnap.exists) {
                    currentCouponData = couponSnap.data();
                    if (currentCouponData.isActive === false) throw new HttpsError('failed-precondition', 'الكوبون غير فعال.');
                    if (currentCouponData.maxUses && (currentCouponData.usedCount || 0) >= currentCouponData.maxUses) {
                        throw new HttpsError('failed-precondition', 'تم تجاوز الحد الأقصى لاستخدام هذا الكوبون.');
                    }
                }
            }

            const assignedTierId = String(userData.tierId || userData.tier);
            const tierRef = db.collection('telecard_tiers').doc(assignedTierId);
            const tierSnap = await transaction.get(tierRef);

            if (!tierSnap.exists) {
                throw new HttpsError('failed-precondition', 'بيانات مستوى الحساب غير موجودة، يرجى تحديث الصفحة.');
            }
            const currentTierObj = { id: tierSnap.id, ...tierSnap.data() };
            
            const pricingSnapshot = FinancialEngine.calculateOrderTotal({
                product, tier: currentTierObj, offer: activeOffer, coupon: currentCouponData, optIdx
            }, finalQty); 

            if (pricingSnapshot.isFirewallViolated) throw new HttpsError('permission-denied', 'تضارب في التسعير.');

            const totalRequired = pricingSnapshot.totalFinalPrice; 
            const currentBalance = Number(userData.walletBalance || 0);

            if (currentBalance < totalRequired) throw new HttpsError('failed-precondition', 'رصيدك غير كافٍ.');

            // معالجة الترقية التلقائية
            let currentCycleSpent = Number(userData.tierCycleSpent || 0);
            const cycleStartTs = userData.tierCycleStartDate?.toMillis ? userData.tierCycleStartDate.toMillis() : (Number(userData.tierCycleStartDate) || serverNow);
            const durationDays = Number(currentTierObj?.durationDays || 30);
            const isCycleExpired = (serverNow - cycleStartTs) > (durationDays * 24 * 60 * 60 * 1000);

            if (isCycleExpired) { currentCycleSpent = 0; }

            const newTierCycleSpent = safeAdd(currentCycleSpent, totalRequired);
            let finalTierId = currentTierObj.id;
            let isTierUpgraded = false;

            if (userData.manualTierOverride !== true && currentTierObj?.autoAdvance !== false) {
                const getThreshold = (t) => Number(t.threshold || t.condition_amount || 0);
                const earnedTiers = tiersData.filter(t => 
                    (t.autoAdvance !== false) && getThreshold(t) <= newTierCycleSpent && getThreshold(t) > getThreshold(currentTierObj)
                ).sort((a, b) => getThreshold(b) - getThreshold(a));

                if (earnedTiers.length > 0) {
                    finalTierId = earnedTiers[0].id;
                    isTierUpgraded = true;
                }
            }

            // 🛡️ الحل المعماري لاختناق الأكواد (Zero Contention Architecture)
            let selectedDocs = [];
            if (product.vaultPoolId) {
                const vaultRef = db.collection('telecard_vault').doc(String(product.vaultPoolId));
                
                // جلب الأكواد غير المباعة مباشرة بدلاً من الاعتماد على nextSaleIndex المغلق
                const keysQuerySnap = await transaction.get(
                    vaultRef.collection('keys').where('isSold', '==', false).limit(finalQty)
                );

                if (keysQuerySnap.size < finalQty) {
                    throw new HttpsError('failed-precondition', `عذراً، الأكواد المتوفرة حالياً (${keysQuerySnap.size}) أقل من المطلوب.`);
                }
                
                keysQuerySnap.forEach(docSnap => {
                    selectedDocs.push(docSnap);
                    transaction.update(docSnap.ref, { 
                        isSold: true, soldAt: admin.firestore.FieldValue.serverTimestamp(), orderId: cleanOrderId, userId: uid 
                    });
                });
                
                // تحديث العداد فقط (لا يحتاج قفل قراءة صارم)
                transaction.update(vaultRef, {
                    stockCount: admin.firestore.FieldValue.increment(-finalQty),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                deliveredCodeText = selectedDocs.map(d => d.data().codeText).join(' | ');
                isAutoDelivered = true;
            }        

            // تحديثات المستخدم والخصومات
            if (currentCouponData && couponRef) {
                transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });
            }

            const newBalance = safeSub(currentBalance, totalRequired);
            let userUpdateObj = { 
                walletBalance: newBalance, 
                totalSpent: safeAdd(userData.totalSpent || 0, totalRequired), 
                tierCycleSpent: newTierCycleSpent, tierId: finalTierId, lastOrderTime: serverNow
            };

            if (isCycleExpired || isTierUpgraded) { userUpdateObj.tierCycleStartDate = admin.firestore.FieldValue.serverTimestamp(); }
            transaction.update(userRef, userUpdateObj);

            // 🛡️ حفظ pricingSnapshot للاستفادة منها في الإحصائيات (الأرباح والتكلفة)
            transaction.set(orderRef, {
                id: cleanOrderId, userId: uid, prodId: productId, product: product.name,
                price: totalRequired, qty: finalQty, status: isAutoDelivered ? 'completed' : 'pending',
                deliveredCode: deliveredCodeText, tierName: pricingSnapshot.tierName, input: finalInputStr,
                pricingSnapshot: {
                    costUsd: pricingSnapshot.totalCostUsd || 0,
                    netProfitUsd: pricingSnapshot.totalNetProfitUsd || 0
                },
                time: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            if (idempotencyRef) {
                transaction.set(idempotencyRef, {
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000)),
                    orderId: cleanOrderId
                });
            }
        });

        return { success: true, isAutoDelivered, deliveredCode: deliveredCodeText };
    } catch (error) {
        if (error instanceof HttpsError) throw error; 
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// 💰 4. إرسال طلبات الإيداع
// ==========================================
exports.submitBalanceRequest = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    checkBanStatus(request);

    const uid = request.auth.uid;
    const { data } = request;
    const amount = Number(data.amount);
    const paymentMethodName = String(data.paymentMethodName || '').trim();
    const payCurr = String(data.payCurr || 'USD').toUpperCase();
    const idempotencyKey = data.idempotencyKey ? String(data.idempotencyKey) : null;
    
    if (isNaN(amount) || amount <= 0 || amount > SYSTEM_LIMITS.MAX_SAFE_AMOUNT) {
        throw new HttpsError('out-of-range', 'المبلغ المدخل غير صالح.');
    }

    try {
        const cache = await loadDepositCache();
        const paymentMethod = cache.payments.find(p => p.name === paymentMethodName);
        if (!paymentMethod) throw new HttpsError('not-found', 'طريقة الدفع غير متوفرة.');

        const userRef = db.collection('telecard_users').doc(uid);
        
        return await db.runTransaction(async (transaction) => {
            let idempotencyRef = null;
            if (idempotencyKey) {
                idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
                if ((await transaction.get(idempotencyRef)).exists) {
                    throw new HttpsError('already-exists', 'تم إرسال هذا الطلب مسبقاً وجاري معالجته.');
                }
            }

            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');
            const userData = userSnap.data();
            if (userData.isBanned === true) throw new HttpsError('permission-denied', 'العملية مرفوضة.');

            const baseCurr = String(userData.baseCurrency || 'USD').toUpperCase();
            let fee = parseFloat(paymentMethod.fee) || 0;
            let feeType = paymentMethod.feeType || 'fee';
            let feeUnit = paymentMethod.feeUnit || paymentMethod.unit || 'percent';
            let feeAmount = feeUnit === 'fixed' || feeUnit === 'amount' ? fee : amount * (fee / 100);
            
            if (feeType !== 'bonus' && amount <= feeAmount) {
                throw new HttpsError('invalid-argument', 'المبلغ المودع أقل من أو يساوي عمولة البوابة!');
            }
            
            let netPayCurr = feeType === 'bonus' ? amount + feeAmount : amount - feeAmount;
            let safeNetBase = netPayCurr;
            if (payCurr !== baseCurr) {
                 safeNetBase = FinancialEngine.convertViaUSD(netPayCurr, payCurr, baseCurr, cache.rates, 'deposit');
            }
            
            const cleanId = generateUniqueId(); 
            transaction.update(userRef, { lastDepositReqTime: Date.now() });
            
            transaction.set(db.collection('telecard_deposits').doc(cleanId), {
                id: cleanId, displayId: cleanId, userId: uid, method: paymentMethodName,
                amount, currency: payCurr, creditedAmount: safeNetBase, status: 'pending',
                time: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp(), receipt: data.receiptData || null
            });

            if (idempotencyRef) {
                transaction.set(idempotencyRef, {
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000)),
                    depositId: cleanId
                });
            }

            return { success: true, message: 'تم استلام طلب الإيداع وهو قيد المراجعة.' };
        });
    } catch (error) { 
        if (error instanceof HttpsError) throw error; 
        throw new HttpsError('internal', 'تعذر إرسال الطلب.'); 
    }
});

// ==========================================
// 👑 5. دوال الإدارة والعمليات المالية
// ==========================================
exports.adminToggleUserBan = onCall(async (request) => {
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

        await logAdminAction(request.auth.uid, 'TOGGLE_BAN', `Target: ${targetUid}, isBanned: ${isBanned}`);

        return { success: true, message: isBanned ? 'تم حظر المستخدم بنجاح.' : 'تم رفع الحظر.' };
    } catch (error) { throw new HttpsError('internal', `فشل تطبيق الإجراء: ${error.message}`); }
});

exports.adminProcessOrder = onCall(async (request) => {
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
                transaction.update(userRef, { 
                    walletBalance: newWalletBal, 
                    totalSpent: safeSub(ud.totalSpent || 0, Number(orderData.price || 0)), 
                    tierCycleSpent: safeSub(ud.tierCycleSpent || 0, Number(orderData.price || 0)) 
                });
            }
            if (orderData.couponCode) {
                const cQuery = await db.collection('telecard_coupons').where('code', '==', orderData.couponCode).limit(1).get();
                if (!cQuery.empty) transaction.update(cQuery.docs[0].ref, { usedCount: admin.firestore.FieldValue.increment(-1) });
            }
        }
        
        let orderUpdateObj = { status: action, adminNote: String(adminNote || ''), actionTime: admin.firestore.FieldValue.serverTimestamp() };
        if (isRefundingAction && !wasAlreadyRefunded) orderUpdateObj.balanceAfter = newWalletBal;
        transaction.update(orderRef, orderUpdateObj);

        await logAdminAction(request.auth.uid, 'PROCESS_ORDER', `Order: ${orderId}, Action: ${action}`);

        return { success: true, message: `تم تحديث الطلب إلى ${action}.` };
    });
});

exports.adminProcessDeposit = onCall(async (request) => {
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
                newWalletBal = action === 'approved' ? safeAdd(ud.walletBalance || 0, amt) : strictSub(ud.walletBalance || 0, amt);
                transaction.update(userRef, { 
                    walletBalance: newWalletBal, 
                    totalDeposit: action === 'approved' ? safeAdd(ud.totalDeposit || 0, amt) : strictSub(ud.totalDeposit || 0, amt) 
                });
            }
        }
        
        let depUpdateObj = { status: action, adminNote: String(adminNote || ''), actionTime: admin.firestore.FieldValue.serverTimestamp() };
        if (action === 'approved' || action === 'refunded') depUpdateObj.balanceAfter = newWalletBal;
        transaction.update(depRef, depUpdateObj);

        await logAdminAction(request.auth.uid, 'PROCESS_DEPOSIT', `Deposit: ${depositId}, Action: ${action}`);

        return { success: true, message: `تم تحويل الحالة إلى ${action}.` };
    });
});

exports.adminAdjustBalance = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { userId, type, amount, adminName } = request.data;
    const adjustAmount = Number(amount);
    
    if (isNaN(adjustAmount) || adjustAmount <= 0) throw new HttpsError('invalid-argument', 'المبلغ غير صالح.');

    const userRef = db.collection('telecard_users').doc(String(userId));
    return await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');

        const userData = userDoc.data();
        const currentBal = Number(userData.walletBalance || 0);
        const currentSpent = Number(userData.totalSpent || 0);
        const currentCycle = Number(userData.tierCycleSpent || 0);

        const newBal = type === 'add' ? safeAdd(currentBal, adjustAmount) : strictSub(currentBal, adjustAmount);
        
        let updateObj = {
            walletBalance: newBal,
            totalDeposit: type === 'add' ? safeAdd(userData.totalDeposit || 0, adjustAmount) : Number(userData.totalDeposit || 0)
        };

        if (type === 'subtract') {
            updateObj.totalSpent = Math.max(0, safeSub(currentSpent, adjustAmount));
            updateObj.tierCycleSpent = Math.max(0, safeSub(currentCycle, adjustAmount));
        }

        transaction.update(userRef, updateObj);
        
        const depId = generateUniqueId();
        transaction.set(db.collection('telecard_deposits').doc(depId), {
            id: depId, userId, amount: adjustAmount, status: 'approved',
            method: type === 'add' ? 'إيداع إداري' : 'خصم إداري',
            time: admin.firestore.FieldValue.serverTimestamp(),
            admin: adminName || 'النظام'
        });

        await logAdminAction(request.auth.uid, 'ADJUST_BALANCE', `User: ${userId}, Type: ${type}, Amount: ${amount}`);
        return { success: true, newBalance: newBal };
    });
});

exports.adminAuditUserWallet = onCall(async (request) => {
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
        const expectedBalance = strictSub(realTotalDeposit, realTotalSpent); 

        await userRef.update({ totalSpent: realTotalSpent, totalDeposit: realTotalDeposit, walletBalance: expectedBalance });

        await logAdminAction(request.auth.uid, 'AUDIT_WALLET', `User: ${targetUserId} audited. Corrected Balance: ${expectedBalance}`);

        return { success: true, message: 'تم التصحيح بنجاح!', data: { spent: realTotalSpent, deposit: realTotalDeposit, balance: expectedBalance } };
    } catch (error) { throw new HttpsError('internal', `فشل التدقيق: ${error.message}`); }
});

// 🛡️ [تحديث أمني]: منع الاختراق وتخزين المفتاح في البيئة السحابية وليس كود المصدر
exports.grantAdminRole = onCall(async (request) => {
    const targetEmail = request.data.email;
    const setupKey = request.data.setupKey;
    
    const MASTER_SETUP_KEY = process.env.ADMIN_SETUP_KEY; 

    if (!MASTER_SETUP_KEY) {
        throw new HttpsError('internal', 'النظام غير مهيأ أمنياً. تأكد من إعداد متغيرات البيئة.');
    }

    if (!isMasterAdmin(request) && setupKey !== MASTER_SETUP_KEY) {
        throw new HttpsError('permission-denied', 'مفتاح الأمان غير صحيح أو غير مصرح لك.');
    }

    if (!targetEmail) throw new HttpsError('invalid-argument', 'الرجاء إدخال البريد الإلكتروني.');
    
    try {
        const user = await admin.auth().getUserByEmail(targetEmail);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        
        await logAdminAction(request.auth?.uid || 'system_recovery', 'GRANT_ADMIN', `Granted admin role to: ${targetEmail}`);
        
        return { success: true, message: `تم منح رتبة الأدمن للحساب: ${targetEmail}` };
    } catch (error) { throw new HttpsError('internal', `فشل المنح: ${error.message}`); }
});

// 🛡️ إصلاح مشكلة الحذف للبيانات الضخمة (Safe Deletion Cursor)
exports.adminDeleteUserData = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { targetUid } = request.data;
    
    try {
        await admin.auth().deleteUser(targetUid);
        
        const deleteQueryBatch = async (queryRef) => {
            let hasMore = true;
            while (hasMore) {
                // استخدام الاستعلام المباشر في كل لفة بدلاً من حفظ lastDoc لتجنب مشاكل حذف الوثائق النشطة
                const snapshot = await queryRef.limit(400).get();
                if (snapshot.empty) { hasMore = false; break; }
                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
        };

        await Promise.all([
            deleteQueryBatch(db.collection('telecard_orders').where('userId', '==', targetUid)),
            deleteQueryBatch(db.collection('telecard_deposits').where('userId', '==', targetUid)),
            deleteQueryBatch(db.collection('telecard_users').doc(targetUid).collection('notifications'))
        ]);

        await db.collection('telecard_users').doc(targetUid).delete();
        await logAdminAction(request.auth.uid, 'DELETE_USER', `Deleted entire data for UID: ${targetUid}`);
        return { success: true };
    } catch (error) { 
        throw new HttpsError('internal', error.message); 
    }
});

// ==========================================
// 🪪 6. استكمال هوية الحساب (KYC)
// ==========================================
exports.completeUserIdentity = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    checkBanStatus(request);
    
    const uid = request.auth.uid;
    const { country, phone, currency } = request.data;
    const cleanCurrency = String(currency || '').trim().toUpperCase();
    
    return await db.runTransaction(async (transaction) => {
        const userRef = db.collection('telecard_users').doc(uid);
        const userSnap = await transaction.get(userRef);
        const userData = userSnap.data();
        
        const hasBalance = Number(userData.walletBalance || 0) > 0;
        
        if (userData.isVerified === true || hasBalance) {
            throw new HttpsError('permission-denied', 'عملية مرفوضة: لا يمكن تغيير العملة بعد اعتمادها أو وجود رصيد.');
        }
        
        transaction.update(userRef, {
            country: String(country || '').trim(),
            phone: String(phone || '').trim(),
            baseCurrency: cleanCurrency,
            isVerified: true, identityCompletedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, lockedCurrency: cleanCurrency };
    });
});

// ==========================================
// 📊 7. محرك الإحصائيات المركزية (Event-Driven & $0 Cost)
// ==========================================
// 🛡️ الإحصائيات الآن تتحدث لحظياً مع كل عملية بدلاً من الجدولة المكلفة

const updateGlobalStats = async (updatesObj) => {
    const statsRef = db.collection('telecard_system').doc('globalStats');
    await statsRef.set(updatesObj, { merge: true });
};

exports.onOrderStatsUpdate = onDocumentWritten({ document: 'telecard_orders/{orderId}', retry: true }, async (event) => {
    const before = event.data.before?.data();
    const after = event.data.after?.data();
    
    let updates = { 'lastUpdated': admin.firestore.FieldValue.serverTimestamp() };
    const inc = (amount) => admin.firestore.FieldValue.increment(amount);
    
    if (!before && after) { // 🟢 طلب جديد
        updates['orders.total'] = inc(1);
        if (after.status === 'completed') {
            updates['orders.completed'] = inc(1);
            updates['financials.totalRevenue'] = inc(Number(after.price || 0));
            updates['financials.totalCost'] = inc(Number(after.pricingSnapshot?.costUsd || 0));
            updates['financials.totalProfit'] = inc(Number(after.pricingSnapshot?.netProfitUsd || 0));
        }
    } else if (before && after && before.status !== after.status) { // 🟡 تحديث حالة الطلب
        if (after.status === 'completed') {
            updates['orders.completed'] = inc(1);
            updates['financials.totalRevenue'] = inc(Number(after.price || 0));
            updates['financials.totalCost'] = inc(Number(after.pricingSnapshot?.costUsd || 0));
            updates['financials.totalProfit'] = inc(Number(after.pricingSnapshot?.netProfitUsd || 0));
        } else if (before.status === 'completed' && ['refunded', 'rejected', 'returned'].includes(after.status)) {
            updates['orders.completed'] = inc(-1);
            updates['financials.totalRevenue'] = inc(-Number(before.price || 0));
            updates['financials.totalCost'] = inc(-Number(before.pricingSnapshot?.costUsd || 0));
            updates['financials.totalProfit'] = inc(-Number(before.pricingSnapshot?.netProfitUsd || 0));
            updates[`orders.${after.status}`] = inc(1);
        } else {
            updates[`orders.${after.status}`] = inc(1);
        }
        if (before.status !== 'pending' && before.status !== 'completed') {
            updates[`orders.${before.status}`] = inc(-1);
        }
    } else if (before && !after) { // 🔴 تم حذف الطلب نهائياً (درع البيانات الشبحية)
        updates['orders.total'] = inc(-1);
        if (before.status === 'completed') {
            updates['orders.completed'] = inc(-1);
            updates['financials.totalRevenue'] = inc(-Number(before.price || 0));
            updates['financials.totalCost'] = inc(-Number(before.pricingSnapshot?.costUsd || 0));
            updates['financials.totalProfit'] = inc(-Number(before.pricingSnapshot?.netProfitUsd || 0));
        } else {
            updates[`orders.${before.status}`] = inc(-1);
        }
    }
    
    if (Object.keys(updates).length > 1) await updateGlobalStats(updates);
});

exports.onDepositStatsUpdate = onDocumentWritten({ document: 'telecard_deposits/{depositId}', retry: true }, async (event) => {
    const before = event.data.before?.data();
    const after = event.data.after?.data();
    
    let updates = { 'lastUpdated': admin.firestore.FieldValue.serverTimestamp() };
    const inc = (amount) => admin.firestore.FieldValue.increment(amount);
    
    if (!before && after) { // 🟢 إيداع جديد
        updates['deposits.total'] = inc(1);
    } else if (before && after && before.status !== after.status) { // 🟡 تحديث إيداع
        updates[`deposits.${after.status}`] = inc(1);
        if (before.status !== 'pending') {
            updates[`deposits.${before.status}`] = inc(-1);
        }
    } else if (before && !after) { // 🔴 تم حذف الإيداع نهائياً
        updates['deposits.total'] = inc(-1);
        updates[`deposits.${before.status}`] = inc(-1);
    }
    
    if (Object.keys(updates).length > 1) await updateGlobalStats(updates);
});// إبقاء الدالة كأداة يدوية (Recalculate) في حال أراد المدير تصفير أو تدقيق الإحصائيات
exports.calculateStoreStatsCloud = onCall({ timeoutSeconds: 540 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
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
    
    await db.collection('telecard_system').doc('globalStats').set({ 
        financials: { totalRevenue: Number((financials.data().revenue || 0).toFixed(4)), totalCost: Number((financials.data().cost || 0).toFixed(4)), totalProfit: Number((financials.data().profit || 0).toFixed(4)) },
        orders: { total: ordersTotal.data().count, completed: ordersCompleted.data().count, rejected: ordersRejected.data().count, refunded: ordersRefunded.data().count },
        deposits: { total: depTotal.data().count, approved: depApproved.data().count, rejected: depRejected.data().count, refunded: depRefunded.data().count }, 
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { success: true };
});

exports.getServerTime = onCall(() => { return { success: true, serverTime: Date.now() }; });

exports.onSettingsUpdate = onDocumentUpdated({ document: 'telecard_settings/singleton' }, async () => { 
    await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true }); 
});

exports.onOfferUpdate = onDocumentWritten({ document: 'telecard_offers/{offerId}' }, async () => { 
    await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true }); 
});

// ==========================================
// 🛡️ 8. المزامنة الآمنة (Product & Tier Sync) 
// ==========================================
exports.secureProductSync = onDocumentWritten({ document: 'telecard_prods/{productId}', retry: true }, async (event) => {
    const productId = event.params.productId;
    const publicProdRef = db.collection('telecard_prods_public').doc(productId);
    
    if (!event.data.after.exists) return publicProdRef.delete(); 
    
    const prodData = event.data.after.data();
    const tiersData = await loadTiersCache(); 
    const tierPrices = {};
    
    tiersData.forEach(tier => {
        try { tierPrices[tier.id] = FinancialEngine.calculatePrice({ product: prodData, tier: tier }).finalPrice; } catch(e) {}
    });
    
    const publicData = { ...prodData, tierPrices };
    delete publicData.costPrice; delete publicData.providerId; delete publicData.apiToken; 
    
    return publicProdRef.set(publicData, { merge: true });
});

// 🛡️ [تحديث]: استخدام Pagination لتفادي تجاوز الذاكرة عند تحديث الأسعار
exports.onTierUpdate = onDocumentUpdated({ document: 'telecard_tiers/{tierId}', timeoutSeconds: 540, retry: true }, async (event) => {
    await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true });
    
    const tierId = event.params.tierId;
    const oldTier = event.data.before.data();
    const newTier = event.data.after.data();

    if (oldTier.profitPercent === newTier.profitPercent && oldTier.minProfitUsd === newTier.minProfitUsd) return null;

    let hasMore = true;
    let lastDoc = null;
    let totalUpdated = 0;

    while (hasMore) {
        let query = db.collection('telecard_prods').where('isActive', '==', true).limit(400);
        if (lastDoc) query = query.startAfter(lastDoc);
        
        const prodsSnap = await query.get();
        if (prodsSnap.empty) { hasMore = false; break; }

        lastDoc = prodsSnap.docs[prodsSnap.docs.length - 1];
        const batch = db.batch();
        
        prodsSnap.forEach(doc => {
            const prodData = doc.data();
            if (String(prodData.isFixedPrice).toLowerCase() === 'true') return;
            try {
                const pricing = FinancialEngine.calculatePrice({ product: prodData, tier: newTier });
                batch.set(db.collection('telecard_prods_public').doc(doc.id), { tierPrices: { [tierId]: pricing.finalPrice } }, { merge: true });
                totalUpdated++;
            } catch(e) {}
        });

        await batch.commit();
    }
    
    return { success: true, updatedProductsCount: totalUpdated };
});

// ==========================================
// 🔔 9. الإشعارات الآلية
// ==========================================
exports.autoNotifyOrderStatus = onDocumentUpdated({ document: 'telecard_orders/{orderId}', retry: true }, async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === after.status) return null;
    
    let title = "تحديث حالة الطلب", message = `تم تغيير حالة طلبك رقم ${after.displayId || after.id} إلى ${after.status}`;
    if (after.status === 'completed') { title = "🎉 تم تسليم طلبك بنجاح!"; message = `تم إكمال طلبك لشراء ( ${after.product} ) بنجاح.`; } 
    else if (after.status === 'rejected') { title = "❌ تم رفض طلب الشراء"; message = `عذراً، تعذر إكمال طلبك لشراء ( ${after.product} ). السبب: ${after.adminNote || 'راجع الدعم'}`; } 
    else if (after.status === 'refunded') { title = "↩️ تم استرجاع الطلب"; message = `تم استرجاع قيمة طلبك لشراء ( ${after.product} ) للمحفظة.`; }

    const notifId = `notif_${event.params.orderId}_${after.status}`;
    return db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({
        id: notifId, title, message, type: 'notification', jumpTarget: 'order', createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
});

exports.autoNotifyDepositStatus = onDocumentUpdated({ document: 'telecard_deposits/{depositId}', retry: true }, async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === after.status) return null;

    let title = "تحديث طلب الإيداع"; let message = `تم تغيير حالة طلب الإيداع إلى ${after.status}`;
    const displayAmt = after.creditedAmount !== undefined ? after.creditedAmount : after.amount;
    const displayCurr = after.targetCurrency || after.currency || 'USD';

    if (after.status === 'approved') { title = "💰 تم قبول الإيداع!"; message = `تمت إضافة ${displayAmt} ${displayCurr} لمحفظتك بنجاح!`; } 
    else if (after.status === 'rejected') { title = "❌ تم رفض الإيداع"; message = `عذراً، تم رفض طلب إيداعك. السبب: ${after.adminNote || 'راجع الدعم'}`; } 
    else if (after.status === 'refunded') { title = "↩️ تم استرجاع الإيداع"; message = `تم سحب الرصيد بقيمة ${displayAmt} ${displayCurr} من محفظتك.`; }

    const notifId = `notif_${event.params.depositId}_${after.status}`;
    return db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({
        id: notifId, title, message, type: 'notification', jumpTarget: 'wallet', createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
});

// ============================================================================
// 🔗 10. تصدير دوال ربط الموردين والـ API
// ============================================================================
const developerApi = require('./developerApi.js');
const supplierEngine = require('./supplierEngine.js');

exports.orderStatusWebhook = developerApi.orderStatusWebhook;
exports.cronRetryWebhooks = developerApi.cronRetryWebhooks;
exports.externalCreateOrder = developerApi.externalCreateOrder;
exports.syncSupplierData = supplierEngine.syncSupplierData;
exports.scheduledSupplierSync = supplierEngine.scheduledSupplierSync;
exports.secureSaveSupplier = supplierEngine.secureSaveSupplier;

// ==========================================
// 📦 11. إدارة صناديق الأكواد السحابية (Optimized for Zero-Contention)
// ==========================================
exports.adminSaveVaultCodes = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { poolId, poolName, alertLimit, codesList } = request.data;
    if (!poolId || !codesList || !Array.isArray(codesList)) throw new HttpsError('invalid-argument', 'بيانات غير مكتملة.');
    
    try {
        const vaultRef = db.collection('telecard_vault').doc(String(poolId));
        const keysRef = vaultRef.collection('keys');
        
        return await db.runTransaction(async (transaction) => {
            const vaultSnap = await transaction.get(vaultRef);
            let currentStock = vaultSnap.exists ? (vaultSnap.data().stockCount || 0) : 0;
            
            const cleanCodes = codesList.map(c => String(c).trim()).filter(c => c.length > 0);
            if (cleanCodes.length === 0) throw new HttpsError('invalid-argument', 'لا توجد أكواد صالحة.');
            if (cleanCodes.length > 400) throw new HttpsError('out-of-range', 'يرجى رفع 400 كود كحد أقصى في كل دفعة.');
            
            // استخدام UUID فريد بدلاً من index لتفادي التصادم وتكرار الأرقام
            const crypto = require('crypto');
            for (let i = 0; i < cleanCodes.length; i++) {
                const keyId = crypto.randomBytes(8).toString('hex');
                const keyDocRef = keysRef.doc(`key_${keyId}`);
                transaction.set(keyDocRef, { codeText: cleanCodes[i], isSold: false, addedAt: admin.firestore.FieldValue.serverTimestamp() });
            }
            
            transaction.set(vaultRef, {
                id: poolId, name: poolName || 'صندوق أكواد', alertLimit: Number(alertLimit) || 5,
                stockCount: currentStock + cleanCodes.length,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            await logAdminAction(request.auth.uid, 'SAVE_VAULT', `Saved ${cleanCodes.length} codes to pool ${poolId}`);
            return { success: true, addedCount: cleanCodes.length };
        });
    } catch (error) { throw new HttpsError('internal', `تعذر حفظ الأكواد: ${error.message}`); }
});

exports.adminDeleteVaultPool = onCall({ timeoutSeconds: 540 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { poolId } = request.data;
    if (!poolId) throw new HttpsError('invalid-argument', 'معرف الصندوق مفقود.');
    
    try {
        const vaultRef = db.collection('telecard_vault').doc(String(poolId));
        const keysRef = vaultRef.collection('keys');
        
        let hasMore = true;
        while (hasMore) {
            const snapshot = await keysRef.limit(400).get(); 
            if (snapshot.empty) { hasMore = false; break; }
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
        
        await vaultRef.delete();
        await logAdminAction(request.auth.uid, 'DELETE_VAULT', `Deleted pool ${poolId}`);
        return { success: true };
    } catch (error) { throw new HttpsError('internal', `تعذر حذف الصندوق: ${error.message}`); }
});
