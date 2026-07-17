// ============================================================================
// 🧠 المحرك الرئيسي (functions/index.js) لـ "المتجر" - النسخة الماسية المطلقة V13.7 👑
// 🎯 الوظيفة: المعاملات المالية الآمنة، حماية الثغرات، المزامنة الذكية، والربط
// 🚀 التحديثات: التوافق الاقتصادي، منع التهرب المالي (Debt Guard)، وحماية الذاكرة (OOM Guard)
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https"); 
const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const functions = require('firebase-functions/v1');
const FinancialEngine = require('./financialEngine.js');
const { setGlobalOptions } = require("firebase-functions/v2");

// 🚀 وضع اقتصادي آمن يمر من حظر جوجل ويحمي فاتورتك
setGlobalOptions({
    region: 'us-east1',
    memory: '256MiB',
    maxInstances: 3
});

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
// 🛡️ [إصلاح مالي]: دالة الطرح الصارم تسمح بالرصيد السالب لتسجيل الديون في حال الاحتيال
const strictSub = (a, b) => FinancialEngine.safeSub(a, b); 
const safeMul = (a, b) => FinancialEngine.safeMul(a, b);

const generateUniqueId = () => {
    const crypto = require('crypto');
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${timestamp}-${randomHex}`; 
};

// ==========================================
// 🛡️ 0. درع الثقة المعدومة (Zero-Trust Shield)
// ==========================================
exports.onUserAuthCreated = functions.auth.user().onCreate(async (user) => {
    try {
        const userRef = db.collection('telecard_users').doc(user.uid);
        
        const defaultTierSnap = await db.collection('telecard_tiers').where('isDefault', '==', true).limit(1).get();
        let initialTierId = '';

        if (!defaultTierSnap.empty) {
            initialTierId = defaultTierSnap.docs[0].id;
        } else {
            console.error(`[CRITICAL WARNING] No default tier found in DB for new user ${user.uid}`);
            initialTierId = '1'; 
        }
        
        const initialProfile = {
            email: user.email || '',
            fullName: user.displayName || 'عميل جديد',
            role: 'user',
            walletBalance: 0.0,
            balance: 0.0,
            wallet_balance: 0.0,
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
        console.log(`✅ [SYSTEM] Secure profile initialized for UID: ${user.uid} with Tier: ${initialTierId}`);
    } catch (error) {
        console.error(`❌ [CRITICAL] Failed to initialize user ${user.uid}:`, error);
    }
});

// ==========================================
// 🚀 1. نظام التخزين المؤقت المنيع (Anti-Stampede Cache)
// ==========================================
let cacheOrder = { offers: [], settings: {}, lastFetch: 0 };
let cacheDeposit = { rates: [], payments: [], settings: {}, lastFetch: 0 };
let cacheTiers = { tiers: [], lastFetch: 0 }; 

let fetchOrderPromise = null, fetchDepositPromise = null, fetchTiersPromise = null;
const CACHE_LIFETIME = 5 * 60 * 1000; 

const loadOrderCache = async () => {
    const now = Date.now();
    if (cacheOrder.lastFetch > 0 && (now - cacheOrder.lastFetch < CACHE_LIFETIME)) return cacheOrder;
    if (fetchOrderPromise) return fetchOrderPromise;

    fetchOrderPromise = (async () => {
        try {
            const [offersSnap, settingsSnap] = await Promise.all([
                db.collection('telecard_offers').where('isActive', '==', true).get(),
                db.collection('telecard_settings').doc('singleton').get()
            ]);
            cacheOrder.offers = offersSnap.docs.map(doc => doc.data());
            cacheOrder.settings = settingsSnap.exists ? settingsSnap.data() : {};
            cacheOrder.lastFetch = Date.now();
            return cacheOrder;
        } finally { fetchOrderPromise = null; }
    })();
    return fetchOrderPromise;
};

const loadDepositCache = async () => {
    const now = Date.now();
    if (cacheDeposit.lastFetch > 0 && (now - cacheDeposit.lastFetch < CACHE_LIFETIME)) return cacheDeposit;
    if (fetchDepositPromise) return fetchDepositPromise;

    fetchDepositPromise = (async () => {
        try {
            const [ratesSnap, paymentsSnap, settingsSnap] = await Promise.all([
                db.collection('telecard_rates').get(),
                db.collection('telecard_payments').get(),
                db.collection('telecard_settings').doc('singleton').get()
            ]);
            cacheDeposit.rates = ratesSnap.docs.map(doc => doc.data());
            cacheDeposit.payments = paymentsSnap.docs.map(doc => doc.data());
            cacheDeposit.settings = settingsSnap.exists ? settingsSnap.data() : {};
            cacheDeposit.lastFetch = Date.now();
            return cacheDeposit;
        } finally { fetchDepositPromise = null; }
    })();
    return fetchDepositPromise;
};

const loadTiersCache = async () => {
    const now = Date.now();
    if (cacheTiers.lastFetch > 0 && (now - cacheTiers.lastFetch < CACHE_LIFETIME)) return cacheTiers.tiers;
    if (fetchTiersPromise) return fetchTiersPromise;

    fetchTiersPromise = (async () => {
        try {
            const tiersSnap = await db.collection('telecard_tiers').get();
            cacheTiers.tiers = tiersSnap.docs.map(doc => doc.data());
            cacheTiers.lastFetch = Date.now();
            return cacheTiers.tiers;
        } finally { fetchTiersPromise = null; }
    })();
    return fetchTiersPromise;
};

// ==========================================
// 🛒 3. إنشاء الطلبات للعملاء (محصن بالكامل)
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
        const cache = await loadOrderCache();
        const cleanOrderId = generateUniqueId();
        const userRef = db.collection('telecard_users').doc(uid);
        const productRef = db.collection('telecard_prods').doc(productId);
        const orderRef = db.collection('telecard_orders').doc(cleanOrderId); 
        
        let activeOffer = cache.offers.find(off => off.targetProds?.includes(productId) && (!off.expiryDate || off.expiryDate > serverNow));
        let couponRef = couponCode ? (await db.collection('telecard_coupons').where('code', '==', couponCode).limit(1).get()).docs[0]?.ref : null;

        let resultMessage = "تم استلام الطلب بأمان.";
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

            const assignedTierId = String(userData.tierId || userData.tier);
            const tiersData = await loadTiersCache();

            const currentTierObj = tiersData.find(t => String(t.id) === assignedTierId);

            if (!currentTierObj) {
                console.error(`[DATA INTEGRITY ERROR] User ${uid} has invalid Tier ID: ${assignedTierId}`);
                throw new HttpsError('failed-precondition', 'بيانات مستوى الحساب غير متطابقة. يرجى التواصل مع الدعم الفني لتحديث حسابك.');
            }
            const tierId = currentTierObj.id;

            const [keysSnap, currentCouponSnap] = await Promise.all([
                product.vaultPoolId ? transaction.get(db.collection('telecard_vault').doc(String(product.vaultPoolId)).collection('keys').where('isSold', '==', false).limit(finalQty)) : Promise.resolve(null),
                couponRef ? transaction.get(couponRef) : Promise.resolve(null)
            ]);

            const pricingSnapshot = FinancialEngine.calculateOrderTotal({
                product, tier: currentTierObj, offer: activeOffer, coupon: currentCouponSnap?.exists ? currentCouponSnap.data() : null, optIdx
            }, finalQty); 

            if (pricingSnapshot.isFirewallViolated) throw new HttpsError('permission-denied', 'تضارب في التسعير.');

            const totalRequired = pricingSnapshot.totalFinalPrice; 
            const currentBalance = Number(userData.walletBalance || userData.balance || 0);

            if (currentBalance < totalRequired) throw new HttpsError('failed-precondition', 'رصيدك غير كافٍ.');

            let currentCycleSpent = Number(userData.tierCycleSpent || 0);
            const cycleStartTs = userData.tierCycleStartDate?.toMillis ? userData.tierCycleStartDate.toMillis() : (Number(userData.tierCycleStartDate) || serverNow);
            const durationDays = Number(currentTierObj?.durationDays || 30);
            const isCycleExpired = (serverNow - cycleStartTs) > (durationDays * 24 * 60 * 60 * 1000);

            if (isCycleExpired) { currentCycleSpent = 0; }

            const newTierCycleSpent = safeAdd(currentCycleSpent, totalRequired);
            let finalTierId = tierId;
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

            const newBalance = safeSub(currentBalance, totalRequired);
            let userUpdateObj = { 
                walletBalance: newBalance, balance: newBalance, 
                totalSpent: safeAdd(userData.totalSpent || 0, totalRequired), 
                tierCycleSpent: newTierCycleSpent, tierId: finalTierId, lastOrderTime: serverNow
            };

            if (isCycleExpired || isTierUpgraded) { userUpdateObj.tierCycleStartDate = admin.firestore.FieldValue.serverTimestamp(); }

            if (product.vaultPoolId && keysSnap) {
                if (keysSnap.size < finalQty) {
                    throw new HttpsError('failed-precondition', `عذراً، الكمية المتوفرة حالياً في المخزن (${keysSnap.size}) أقل من الكمية المطلوبة.`);
                }
                
                const vaultRef = db.collection('telecard_vault').doc(String(product.vaultPoolId));
                
                keysSnap.forEach(doc => {
                    transaction.update(doc.ref, { isSold: true, soldAt: admin.firestore.FieldValue.serverTimestamp(), orderId: cleanOrderId, userId: uid });
                });
                
                transaction.update(vaultRef, {
                    stockCount: admin.firestore.FieldValue.increment(-finalQty),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                deliveredCodeText = keysSnap.docs.map(d => d.data().codeText).join(' | ');
                isAutoDelivered = true;
            }        

            transaction.update(userRef, userUpdateObj);
            transaction.set(orderRef, {
                id: cleanOrderId, userId: uid, prodId: productId, product: product.name,
                price: totalRequired, qty: finalQty, status: isAutoDelivered ? 'completed' : 'pending',
                deliveredCode: deliveredCodeText, tierName: pricingSnapshot.tierName, input: finalInputStr,
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

        await logAdminAction(request.auth.uid, 'TOGGLE_BAN', `Target: ${targetUid}, isBanned: ${isBanned}, Reason: ${reason}`);

        return { success: true, message: isBanned ? 'تم حظر المستخدم وتدمير جلساته بنجاح.' : 'تم رفع الحظر بنجاح.' };
    } catch (error) { throw new HttpsError('internal', `فشل تطبيق إجراء الحظر: ${error.message}`); }
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
                // 🛡️ [إصلاح مالي]: السماح بالسالب (strictSub) إذا تم سحب إيداع مستخدم بالفعل لكشف النصابين
                newWalletBal = action === 'approved' ? safeAdd(ud.walletBalance || 0, amt) : strictSub(ud.walletBalance || 0, amt);
                transaction.update(userRef, { 
                    walletBalance: newWalletBal, 
                    balance: newWalletBal, 
                    totalDeposit: action === 'approved' ? safeAdd(ud.totalDeposit || 0, amt) : strictSub(ud.totalDeposit || 0, amt) 
                });
            }
        }
        
        let depUpdateObj = { status: action, adminNote: String(adminNote || ''), actionTime: admin.firestore.FieldValue.serverTimestamp() };
        if (action === 'approved' || action === 'refunded') depUpdateObj.balanceAfter = newWalletBal;
        transaction.update(depRef, depUpdateObj);

        await logAdminAction(request.auth.uid, 'PROCESS_DEPOSIT', `Deposit: ${depositId}, Action: ${action}, Note: ${adminNote}`);

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
        const currentBal = Number(userData.walletBalance || userData.balance || 0);
        const currentSpent = Number(userData.totalSpent || 0);
        const currentCycle = Number(userData.tierCycleSpent || 0);

        // 🛡️ [إصلاح مالي]: الإدارة لها الصلاحية المطلقة في خصم الرصيد حتى لو أصبح بالسالب (ديون)
        const newBal = type === 'add' ? safeAdd(currentBal, adjustAmount) : strictSub(currentBal, adjustAmount);
        
        let updateObj = {
            walletBalance: newBal,
            balance: newBal,
            wallet_balance: newBal,
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
        const expectedBalance = strictSub(realTotalDeposit, realTotalSpent); // استخدام الطرح الصارم لاكتشاف النصابين

        await userRef.update({ totalSpent: realTotalSpent, totalDeposit: realTotalDeposit, walletBalance: expectedBalance, balance: expectedBalance });

        await logAdminAction(request.auth.uid, 'AUDIT_WALLET', `User: ${targetUserId} audited. Corrected Balance: ${expectedBalance}`);

        return { success: true, message: 'تم التصحيح بنجاح!', data: { spent: realTotalSpent, deposit: realTotalDeposit, balance: expectedBalance } };
    } catch (error) { throw new HttpsError('internal', `فشل التدقيق: ${error.message}`); }
});

exports.grantAdminRole = onCall(async (request) => {
    // ⚠️ تم إيقاف الحماية مؤقتاً لمنح الرتبة
    // if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح لك.');
    
    const targetEmail = request.data.email;
    if (!targetEmail) throw new HttpsError('invalid-argument', 'الرجاء إدخال البريد الإلكتروني.');
    try {
        const user = await admin.auth().getUserByEmail(targetEmail);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        
        await logAdminAction('system_recovery', 'GRANT_ADMIN', `Granted admin role to: ${targetEmail}`);
        
        return { success: true, message: `تم منح رتبة الأدمن للحساب: ${targetEmail}` };
    } catch (error) { throw new HttpsError('internal', `فشل المنح: ${error.message}`); }
});
exports.adminDeleteUserData = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { targetUid } = request.data;
    
    try {
        await admin.auth().deleteUser(targetUid);
        
        const deleteQueryBatch = async (query) => {
            const snapshot = await query.get();
            if (snapshot.empty) return;
            
            const batches = [];
            let currentBatch = db.batch();
            let opCount = 0;
            
            snapshot.docs.forEach(doc => {
                currentBatch.delete(doc.ref);
                opCount++;
                if (opCount === 450) { 
                    batches.push(currentBatch); 
                    currentBatch = db.batch(); 
                    opCount = 0; 
                }
            });
            if (opCount > 0) batches.push(currentBatch);
            await Promise.all(batches.map(b => b.commit()));
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
        
        const hasBalance = Number(userData.walletBalance || userData.balance || 0) > 0;
        
        if (userData.isVerified === true || hasBalance) {
            throw new HttpsError('permission-denied', 'عملية مرفوضة: لا يمكن تغيير عملة المحفظة الأساسية بعد اعتمادها أو وجود رصيد مالي.');
        }
        
        transaction.update(userRef, {
            country: String(country || '').trim(),
            phone: String(phone || '').trim(),
            baseCurrency: cleanCurrency,
            base_currency: cleanCurrency,
            isVerified: true, 
            identityCompletedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return { success: true, lockedCurrency: cleanCurrency };
    });
});

// ==========================================
// 📊 7. محرك الإحصائيات المركزية الذكي (Smart Stats Aggregation)
// ==========================================
const performStatsRecalculation = async () => {
    const AggregateField = admin.firestore.AggregateField;
    const ordersRef = db.collection('telecard_orders');
    const depositsRef = db.collection('telecard_deposits');
    
    const [ordersTotal, ordersCompleted, ordersRejected, ordersRefunded, financials, depTotal, depApproved, depRejected, depRefunded] = await Promise.all([
        ordersRef.count().get(), 
        ordersRef.where('status', '==', 'completed').count().get(),
        ordersRef.where('status', '==', 'rejected').count().get(), 
        ordersRef.where('status', '==', 'refunded').count().get(),
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
    
    await db.collection('telecard_system').doc('singleton').set({ 
        globalStats: {
            financials: { 
                totalRevenue: Number((financials.data().revenue || 0).toFixed(4)), 
                totalCost: Number((financials.data().cost || 0).toFixed(4)), 
                totalProfit: Number((financials.data().profit || 0).toFixed(4)) 
            },
            orders: { total: ordersTotal.data().count, completed: ordersCompleted.data().count, rejected: ordersRejected.data().count, refunded: ordersRefunded.data().count },
            deposits: { total: depTotal.data().count, approved: depApproved.data().count, rejected: depRejected.data().count, refunded: depRefunded.data().count }, 
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }
    }, { merge: true });
};

exports.scheduledStatsAggregation = onSchedule({ 
    schedule: 'every 6 hours',
    timeoutSeconds: 540
}, async (event) => {
    try { await performStatsRecalculation(); } catch (error) { console.error("Stats Error:", error); }
});

exports.calculateStoreStatsCloud = onCall({ timeoutSeconds: 540 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try { await performStatsRecalculation(); return { success: true, message: 'تم بناء الإحصائيات المركزية بنجاح.' }; }
    catch (error) { throw new HttpsError('internal', `فشل السيرفر: ${error.message}`); }
});

exports.getServerTime = onCall((request) => { return { success: true, serverTime: Date.now() }; });

exports.onSettingsUpdate = onDocumentUpdated({ document: 'telecard_settings/singleton' }, async (event) => {
    cacheOrder.lastFetch = 0;
    cacheDeposit.lastFetch = 0;
});

exports.onOfferUpdate = onDocumentWritten({ document: 'telecard_offers/{offerId}' }, async (event) => {
    cacheOrder.lastFetch = 0;
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
        try {
            const pricing = FinancialEngine.calculatePrice({ product: prodData, tier: tier });
            tierPrices[tier.id] = pricing.finalPrice;
        } catch(e) {
            console.error(`Sync error for prod ${productId} tier ${tier.id}:`, e);
        }
    });
    
    const publicData = { ...prodData, tierPrices };
    delete publicData.costPrice; 
    delete publicData.cost_price; 
    delete publicData.providerId; 
    delete publicData.apiToken; 
    
    return publicProdRef.set(publicData, { merge: true });
});

exports.onTierUpdate = onDocumentUpdated({ 
    document: 'telecard_tiers/{tierId}', 
    timeoutSeconds: 540, 
    retry: true 
}, async (event) => {
    cacheTiers.lastFetch = 0; 
    
    const tierId = event.params.tierId;
    const oldTier = event.data.before.data();
    const newTier = event.data.after.data();

    if (oldTier.profitPercent === newTier.profitPercent && oldTier.minProfitUsd === newTier.minProfitUsd) return null;

    const prodsSnap = await db.collection('telecard_prods').where('isActive', '==', true).get();
    
    const batchChunks = [];
    let currentBatch = db.batch();
    let count = 0;

    prodsSnap.forEach(doc => {
        const prodData = doc.data();
        if (String(prodData.isFixedPrice).toLowerCase() === 'true' || prodData.is_fixed_price === true) return;
        
        try {
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
    
    return { success: true, updatedProductsCount: count };
});

// ==========================================
// 🔔 9. الإشعارات الآلية
// ==========================================
exports.autoNotifyOrderStatus = onDocumentUpdated({ document: 'telecard_orders/{orderId}', retry: true }, async (event) => {
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
        id: notifId, title, message, type: 'notification', jumpTarget: 'order', createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
});

exports.autoNotifyDepositStatus = onDocumentUpdated({ document: 'telecard_deposits/{depositId}', retry: true }, async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === after.status) return null;

    const depositId = event.params.depositId;

    let title = "تحديث طلب الإيداع"; 
    let message = `تم تغيير حالة طلب الإيداع إلى ${after.status}`;

    const displayCreditedAmt = after.creditedAmount !== undefined ? after.creditedAmount : after.amount;
    const displayTargetCurr = after.targetCurrency || after.currency || 'USD';

    if (after.status === 'approved') { 
        title = "💰 تم قبول الإيداع!"; 
        message = `تمت إضافة ${displayCreditedAmt} ${displayTargetCurr} لمحفظتك بنجاح!`; 
    } 
    else if (after.status === 'rejected') { 
        title = "❌ تم رفض الإيداع"; 
        message = `عذراً، تم رفض طلب إيداعك. السبب: ${after.adminNote || 'راجع الدعم'}`; 
    } 
    else if (after.status === 'refunded') { 
        title = "↩️ تم استرجاع الإيداع"; 
        message = `تم سحب الرصيد بقيمة ${displayCreditedAmt} ${displayTargetCurr} من محفظتك.`; 
    }

    const notifId = `notif_${depositId}_${after.status}`;
    return db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({
        id: notifId, title, message, type: 'notification', jumpTarget: 'wallet', createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
});

// ============================================================================
// 🔗 10. تصدير دوال ربط الموردين (External APIs)
// ============================================================================
const developerApi = require('./developerApi.js');
const supplierEngine = require('./supplierEngine.js');

exports.orderStatusWebhook = onRequest(async (req, res) => {
    const token = req.headers['x-telecard-webhook-token'];
    if (!token) {
        console.error(`[SECURITY ALERT] Unauthorized Webhook Attempt`);
        return res.status(401).send('Unauthorized');
    }
    return developerApi.orderStatusWebhook(req, res);
});

exports.externalCreateOrder = onCall(developerApi.externalCreateOrder); 
exports.syncSupplierData = onCall(supplierEngine.syncSupplierData);

exports.scheduledSupplierSync = onSchedule({ 
    schedule: 'every 24 hours', 
    timeoutSeconds: 540 
}, supplierEngine.scheduledSupplierSync);

exports.secureSaveSupplier = onCall(supplierEngine.secureSaveSupplier); 

// ==========================================
// 📦 11. إدارة صناديق الأكواد السحابية (Vault Subcollections Engine)
// ==========================================

exports.adminSaveVaultCodes = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { poolId, poolName, alertLimit, codesList } = request.data;
    if (!poolId || !codesList || !Array.isArray(codesList)) {
        throw new HttpsError('invalid-argument', 'بيانات الصندوق غير مكتملة.');
    }
    
    try {
        const vaultRef = db.collection('telecard_vault').doc(String(poolId));
        const keysRef = vaultRef.collection('keys');
        
        await vaultRef.set({
            id: poolId,
            name: poolName || 'صندوق أكواد',
            alertLimit: Number(alertLimit) || 5,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        let addedCount = 0;
        const crypto = require('crypto');
        
        const batches = [];
        let currentBatch = db.batch();
        let opCount = 0;
        
        // 🛡️ [حماية الأكواد المباعة]: تقسيم الأكواد وفحص الموجود منها
        const CHUNK_SIZE = 30; 
        for (let i = 0; i < codesList.length; i += CHUNK_SIZE) {
            const chunk = codesList.slice(i, i + CHUNK_SIZE);
            const chunkHashes = [];
            const chunkMap = new Map();

            chunk.forEach(code => {
                const safeCode = String(code).replace(/\s+/g, '');
                if (safeCode) {
                    const codeHash = crypto.createHash('sha256').update(safeCode).digest('hex');
                    chunkHashes.push(codeHash);
                    chunkMap.set(codeHash, safeCode);
                }
            });

            if (chunkHashes.length === 0) continue;

            const existingSnaps = await keysRef.where(admin.firestore.FieldPath.documentId(), 'in', chunkHashes).get();
            const existingIds = new Set(existingSnaps.docs.map(doc => doc.id));

            for (const [hash, text] of chunkMap.entries()) {
                if (!existingIds.has(hash)) {
                    const docRef = keysRef.doc(hash);
                    currentBatch.set(docRef, {
                        codeText: text,
                        isSold: false,
                        addedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    
                    addedCount++;
                    opCount++;
                    
                    if (opCount === 450) {
                        batches.push(currentBatch);
                        currentBatch = db.batch();
                        opCount = 0;
                    }
                }
            }
        }
        
        if (opCount > 0) batches.push(currentBatch);
        await Promise.all(batches.map(b => b.commit()));
        await logAdminAction(request.auth.uid, 'SAVE_VAULT', `Saved ${addedCount} codes to pool ${poolId}`);
        
        return { success: true, addedCount };
    } catch (error) {
        console.error("Save Vault Error:", error);
        throw new HttpsError('internal', `تعذر حفظ الأكواد: ${error.message}`);
    }
});

exports.adminDeleteVaultPool = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { poolId } = request.data;
    if (!poolId) throw new HttpsError('invalid-argument', 'معرف الصندوق مفقود.');
    
    try {
        const vaultRef = db.collection('telecard_vault').doc(String(poolId));
        const keysRef = vaultRef.collection('keys');
        
        // 🛡️ [حماية الذاكرة - OOM Guard]: حذف الوثائق على دفعات محدودة لتجنب انفجار الـ 256MB
        let hasMore = true;
        while (hasMore) {
            const snapshot = await keysRef.limit(450).get(); 
            if (snapshot.empty) {
                hasMore = false;
                break;
            }
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }
        
        await vaultRef.delete();
        await logAdminAction(request.auth.uid, 'DELETE_VAULT', `Deleted pool ${poolId}`);
        
        return { success: true };
    } catch (error) {
        console.error("Delete Vault Error:", error);
        throw new HttpsError('internal', `تعذر حذف الصندوق: ${error.message}`);
    }
});
