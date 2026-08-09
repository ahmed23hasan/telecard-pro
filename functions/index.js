// ============================================================================
// 🧠 المحرك الرئيسي (functions/index.js) لـ TeleCard - النسخة الآمنة V20.8.0 👑
// 🎯 الوظيفة: المعاملات المالية الآمنة، حماية الثغرات، المزامنة الذكية، والربط
// 🚀 التحديثات المعمارية الجديدة (V20.8.0):
// 1. Cron-based Analytics: إيقاف المزامنة اللحظية للإحصائيات واستبدالها بمهام مجدولة لخفض الفاتورة.
// 2. Strict Quantity Shield: حماية صارمة ضد الـ NaN والأرقام السالبة في الطلبات.
// 3. KYC Data Saver: إصلاح ثغرة حذف صور الهويات من التخزين عبر اعتماد فحص المسار المشفر.
// 4. Safe Batching: تخفيض حد المزامنة إلى 250 لضمان استقرار السيرفر ومنع الـ Timeouts.
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");

// 🌐 [السيادة الجغرافية والتحكم الذكي في الموارد - Infrastructure Shield]
setGlobalOptions({
    region: 'us-central1',
    maxInstances: 1, // تم التخفيض إلى 1 لتسريع الرفع التلقائي في فترة التطوير
    concurrency: 80
});
const admin = require('firebase-admin');
// يجب إبقاء استدعاء الجيل الأول لكي تعمل دالة التسجيل (onCreate)
const functions = require('firebase-functions/v1');
const crypto = require('crypto');
const FinancialEngine = require('./financialEngine.js');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// 🛡️ درع التيتانيوم الأمني والحدود العامة
const SYSTEM_LIMITS = {
    MAX_QTY_PER_ORDER: 10000,
    MAX_VAULT_QTY_PER_ORDER: 200,
    MAX_SAFE_AMOUNT: 100000000,
    MAX_URL_LENGTH: 1000,
    MAX_NOTE_LENGTH: 500
};// ==========================================
// 🛡️ مصنع المزامنة النظيف بالاعتماد على القائمة البيضاء (Allowlist)
// ==========================================
const generatePublicProductData = (prodData, tiersData) => {
    const publicData = {};
    
    // القائمة البيضاء: الحقول العامة المصرح بعرضها للمستخدمين فقط
    const ALLOWED_PRODUCT_KEYS = [
        'id', 'name', 'description', 'image', 'options', 'isActive', 'isAvailable',
        'category', 'sortOrder', 'type', 'isFixedPrice', 'minQty', 'maxQty', 'badge'
    ];
    
    ALLOWED_PRODUCT_KEYS.forEach(k => {
        if (prodData[k] !== undefined) {
            publicData[k] = JSON.parse(JSON.stringify(prodData[k])); 
        }
    });
    
    const SAFE_FALLBACK_PRICE = 9999999; 
    
    const baseTierPrices = {};
    tiersData.forEach(tier => {
        try { 
            baseTierPrices[tier.id] = FinancialEngine.calculatePrice({ product: prodData, tier: tier }).finalPrice; 
        } catch(e) {
            baseTierPrices[tier.id] = SAFE_FALLBACK_PRICE; 
        }
    });
    publicData.tierPrices = baseTierPrices;

    if (Array.isArray(publicData.options)) {
        publicData.options = publicData.options.map((opt, idx) => {
            const optClean = {};
            const ALLOWED_OPTION_KEYS = ['name', 'value', 'sortOrder', 'isActive', 'isAvailable', 'type', 'badge'];
            
            ALLOWED_OPTION_KEYS.forEach(k => {
                if (opt[k] !== undefined) optClean[k] = opt[k];
            });

            const optTierPrices = {};
            tiersData.forEach(tier => {
                try { 
                    optTierPrices[tier.id] = FinancialEngine.calculatePrice({ product: prodData, tier: tier, optIdx: idx }).finalPrice; 
                } catch(e) {
                    optTierPrices[tier.id] = SAFE_FALLBACK_PRICE; 
                }
            });
            optClean.tierPrices = optTierPrices;
            return optClean;
        });
    }
    
    return publicData;
};

const logAdminAction = async (adminUid, action, details) => {
    try { await db.collection('telecard_audit_logs').add({ adminUid, action, details, timestamp: admin.firestore.FieldValue.serverTimestamp() }); } 
    catch (e) { console.error("Audit Log Error:", e); }
};

const isMasterAdmin = (request) => request.auth?.token?.admin === true;

const checkBanStatus = (request) => {
    if (request.auth?.token?.banned === true) throw new HttpsError('permission-denied', 'عذراً، هذاا الحساب محظور من قبل الإدارة.');
};

const safeAdd = (a, b) => FinancialEngine.safeAdd(a, b);
const safeSub = (a, b) => Math.max(0, FinancialEngine.safeSub(a, b));
const strictSub = (a, b) => FinancialEngine.safeSub(a, b); 

const generateUniqueId = () => {
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
        let initialTierId = '1';
        const defaultTierSnap = await db.collection('telecard_tiers').where('isDefault', '==', true).limit(1).get();
        if (!defaultTierSnap.empty) initialTierId = defaultTierSnap.docs[0].id;
        
        const initialProfile = {
            email: user.email || '', fullName: user.displayName || 'عميل جديد', role: 'user',
            walletBalance: 0.0, totalSpent: 0.0, totalDeposit: 0.0,
            tierId: initialTierId, tierCycleSpent: 0.0, tierCycleStartDate: admin.firestore.FieldValue.serverTimestamp(),
            manualTierOverride: false, isBanned: false, isIpBanned: false, isVerified: false, kycStatus: 'none',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        try { await userRef.create(initialProfile); } 
        catch (e) { if (e.code !== 6 && e.code !== 'ALREADY_EXISTS') throw e; }
    } catch (error) { console.error(`❌ [CRITICAL] Failed to init user:`, error); }
});

// ==========================================
// 🛒 1. إنشاء الطلبات للعملاء
// ==========================================
exports.createOrder = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    checkBanStatus(request);

    const uid = request.auth.uid;
    const data = request.data || {};
    const productId = String(data.productId || '');
    
    // 🛡️ الحماية الصارمة ضد اختراق الكميات السالبة والـ NaN
    let rawQty = Number(data.qty);
    if (isNaN(rawQty) || rawQty <= 0) {
        throw new HttpsError('invalid-argument', 'الكمية المدخلة غير صالحة.');
    }
    let requestedQty = Math.floor(rawQty);
    
    // تأمين فهارس الخيارات ضد قيم NaN والتجاوزات الأمنية
    let optIdx = null;
    if (data.optIdx !== null && data.optIdx !== undefined) {
        const parsedOptIdx = Number(data.optIdx);
        if (!Number.isNaN(parsedOptIdx) && parsedOptIdx >= 0) {
            optIdx = Math.floor(parsedOptIdx);
        } else {
            throw new HttpsError('invalid-argument', 'مؤشر الخيار المحدد غير صالح.');
        }
    }
    
    const finalInputStr = String(data.finalInputStr || '---').substring(0, 500);
    const couponCode = data.couponCode ? String(data.couponCode).trim() : null;
    const idempotencyKey = data.idempotencyKey ? String(data.idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50) : null;
    
    if (!productId) throw new HttpsError('invalid-argument', 'رقم المنتج مفقود.');
    
    const serverNow = admin.firestore.Timestamp.now().toMillis();
    const cleanOrderId = generateUniqueId();

    try {
        let deliveredCodeText = null, isAutoDelivered = false;

        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('telecard_users').doc(uid);
            const productRef = db.collection('telecard_prods').doc(productId);

            const [userSnap, productSnap, tiersSnap, offersSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(productRef),
                transaction.get(db.collection('telecard_tiers')),
                transaction.get(db.collection('telecard_offers').where('isActive', '==', true).where('targetProds', 'array-contains', productId))
            ]);

            if (!userSnap.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');
            if (!productSnap.exists) throw new HttpsError('not-found', 'المنتج غير متوفر.');

            const userData = userSnap.data();
            const product = productSnap.data();
            const tiersData = tiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const liveOffers = offersSnap.docs.map(d => d.data());

            if (userData.isBanned === true) throw new HttpsError('permission-denied', 'العملية مرفوضة.');
            if (product.isActive === false || String(product.isAvailable) === 'false') {
                throw new HttpsError('failed-precondition', 'عذراً، هذا المنتج غير متاح حالياً.');
            }

            if (optIdx !== null) {
                if (!product.options || !Array.isArray(product.options) || optIdx < 0 || optIdx >= product.options.length) {
                    throw new HttpsError('invalid-argument', 'الخيار المحدد غير صالح أو غير موجود في هذا المنتج.');
                }
            }

            let activeOffer = liveOffers.find(off => (!off.expiryDate || off.expiryDate > serverNow));

            let currentCouponData = null;
            let couponRef = null;
            if (couponCode) {
                const couponQuerySnap = await transaction.get(db.collection('telecard_coupons').where('code', '==', couponCode).limit(1));
                if (!couponQuerySnap.empty) {
                    couponRef = couponQuerySnap.docs[0].ref;
                    currentCouponData = couponQuerySnap.docs[0].data();
                    if (currentCouponData.isActive === false) throw new HttpsError('failed-precondition', 'الكوبون غير فعال.');
                    if (currentCouponData.maxUses && (currentCouponData.usedCount || 0) >= currentCouponData.maxUses) {
                        throw new HttpsError('failed-precondition', 'تجاوز الكوبون الحد الأقصى للاستخدام.');
                    }
                }
            }

            let finalQty = Math.max(1, Math.min(SYSTEM_LIMITS.MAX_QTY_PER_ORDER, requestedQty));
            if (product.vaultPoolId) {
                finalQty = Math.min(finalQty, SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER);
            }

            let idempotencyRef = null;
            if (idempotencyKey) {
                idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
                if ((await transaction.get(idempotencyRef)).exists) throw new HttpsError('already-exists', 'تم معالجة الطلب مسبقاً.');
            }

            const assignedTierId = String(userData.tierId || userData.tier || '1');
            let currentTierObj = tiersData.find(t => t.id === assignedTierId);
            if (!currentTierObj) throw new HttpsError('failed-precondition', 'مستوى الحساب غير موجود.');
            
            let currentCycleSpent = Number(userData.tierCycleSpent || 0);
            const cycleStartTs = userData.tierCycleStartDate?.toMillis ? userData.tierCycleStartDate.toMillis() : (Number(userData.tierCycleStartDate) || serverNow);
            const durationDays = Number(currentTierObj?.durationDays || 30);
            const isCycleExpired = (serverNow - cycleStartTs) > (durationDays * 24 * 60 * 60 * 1000);

            let activeTierObj = currentTierObj;
            if (isCycleExpired) { 
                currentCycleSpent = 0; 
                if (userData.manualTierOverride !== true) {
                    const defaultTier = tiersData.find(t => t.isDefault) || tiersData[0];
                    activeTierObj = defaultTier || currentTierObj;
                }
            }
            
            const pricingSnapshot = FinancialEngine.calculateOrderTotal({ product, tier: activeTierObj, offer: activeOffer, coupon: currentCouponData, optIdx }, finalQty); 
            if (pricingSnapshot.isFirewallViolated) throw new HttpsError('permission-denied', 'تضارب في التسعير.');

            const totalRequired = pricingSnapshot.totalFinalPrice; 

            if (totalRequired <= 0) {
                throw new HttpsError('permission-denied', 'غير مسموح بشراء منتجات مجانية أو بسعر صفر.');
            }

            const currentBalance = Number(userData.walletBalance || 0);
            if (currentBalance < totalRequired) throw new HttpsError('failed-precondition', 'رصيدك غير كافٍ.');

            const newTierCycleSpent = safeAdd(currentCycleSpent, totalRequired);
            let finalTierId = activeTierObj.id;
            let isTierUpgraded = false;

            if (userData.manualTierOverride !== true && activeTierObj?.autoAdvance !== false) {
                const getThreshold = (t) => Number(t.threshold || t.condition_amount || 0);
                const earnedTiers = tiersData.filter(t => (t.autoAdvance !== false) && getThreshold(t) <= newTierCycleSpent && getThreshold(t) > getThreshold(activeTierObj)).sort((a, b) => getThreshold(b) - getThreshold(a));
                if (earnedTiers.length > 0) { finalTierId = earnedTiers[0].id; isTierUpgraded = true; }
            }

            let selectedDocs = [];
            let vaultRef = null;
            if (product.vaultPoolId) {
                vaultRef = db.collection('telecard_vault').doc(String(product.vaultPoolId));
                const keysQuerySnap = await transaction.get(vaultRef.collection('keys').where('isSold', '==', false).limit(finalQty));
                if (keysQuerySnap.size < finalQty) throw new HttpsError('failed-precondition', `الأكواد المتوفرة حالياً أقل من المطلوب.`);
                
                keysQuerySnap.forEach(docSnap => selectedDocs.push(docSnap));
                deliveredCodeText = selectedDocs.map(d => d.data().codeText).join(' | ');
                isAutoDelivered = true;
            }        

            // ==================
            // الكتابات (WRITES)
            // ==================
            if (selectedDocs.length > 0 && vaultRef) {
                selectedDocs.forEach(docSnap => {
                    transaction.update(docSnap.ref, { isSold: true, soldAt: admin.firestore.FieldValue.serverTimestamp(), orderId: cleanOrderId, userId: uid });
                });
                transaction.update(vaultRef, { stockCount: admin.firestore.FieldValue.increment(-finalQty), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            }

            if (currentCouponData && couponRef) transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });

            const newBalance = safeSub(currentBalance, totalRequired);
            let userUpdateObj = { 
                walletBalance: newBalance, totalSpent: safeAdd(userData.totalSpent || 0, totalRequired), 
                tierCycleSpent: newTierCycleSpent, tierId: finalTierId, lastOrderTime: serverNow
            };

            if (isCycleExpired || isTierUpgraded) { userUpdateObj.tierCycleStartDate = admin.firestore.FieldValue.serverTimestamp(); }
            transaction.update(userRef, userUpdateObj);

            const orderRef = db.collection('telecard_orders').doc(cleanOrderId);
            transaction.set(orderRef, {
                id: cleanOrderId, userId: uid, prodId: productId, product: product.name,
                vaultPoolId: product.vaultPoolId || null,
                price: totalRequired, qty: finalQty, status: isAutoDelivered ? 'completed' : 'pending',
                deliveredCode: deliveredCodeText, tierName: pricingSnapshot.tierName, input: finalInputStr,
                pricingSnapshot: { costUsd: pricingSnapshot.totalCostUsd || 0, netProfitUsd: pricingSnapshot.totalNetProfitUsd || 0 },
                time: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            if (idempotencyRef) {
                transaction.set(idempotencyRef, { createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: admin.firestore.Timestamp.fromDate(new Date(serverNow + 48 * 60 * 60 * 1000)), orderId: cleanOrderId });
            }
        });

        return { success: true, isAutoDelivered, deliveredCode: deliveredCodeText };
    } catch (error) {
    if (error instanceof HttpsError) throw error;
    // 🚨 السماح للخطأ بالمرور للمتصفح للتشخيص
    throw new HttpsError('aborted', `[SERVER_DEBUG]: ${error.message}`);
}
});

// ==========================================
// 💰 2. إرسال طلبات الإيداع
// ==========================================
exports.submitBalanceRequest = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    checkBanStatus(request);

    const uid = request.auth.uid;
    const data = request.data || {};
    const amount = Number(data.amount);
    const paymentMethodName = String(data.paymentMethodName || '').trim();
    const payCurr = String(data.payCurr || 'USD').toUpperCase();
    const idempotencyKey = data.idempotencyKey ? String(data.idempotencyKey) : null;
    
    if (isNaN(amount) || amount <= 0 || amount > SYSTEM_LIMITS.MAX_SAFE_AMOUNT) throw new HttpsError('out-of-range', 'المبلغ المدخل غير صالح.');

    const receiptUrl = data.receiptUrl ? String(data.receiptUrl).trim() : null;
    if (receiptUrl && receiptUrl.length > SYSTEM_LIMITS.MAX_URL_LENGTH) {
        throw new HttpsError('invalid-argument', 'رابط الإيصال غير صالح أو طويل جداً.');
    }

    try {
        return await db.runTransaction(async (transaction) => {
            const userRef = db.collection('telecard_users').doc(uid);

            const [userSnap, ratesSnap, paymentsSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(db.collection('telecard_rates')),
                transaction.get(db.collection('telecard_payments'))
            ]);

            const liveRates = ratesSnap.docs.map(d => d.data());
            const livePayments = paymentsSnap.docs.map(d => d.data());

            const paymentMethod = livePayments.find(p => p.name === paymentMethodName);
            if (!paymentMethod) throw new HttpsError('not-found', 'طريقة الدفع غير متوفرة.');

            let idempotencyRef = null;
            if (idempotencyKey) {
                idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
                if ((await transaction.get(idempotencyRef)).exists) throw new HttpsError('already-exists', 'تم إرسال الطلب مسبقاً.');
            }

            if (!userSnap.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');
            const userData = userSnap.data();
            if (userData.isBanned === true) throw new HttpsError('permission-denied', 'العملية مرفوضة.');

            const baseCurr = String(userData.baseCurrency || 'USD').toUpperCase();
            
            let fee = parseFloat(paymentMethod.fee) || 0;
            let feeType = paymentMethod.feeType || 'fee';
            let feeUnit = paymentMethod.feeUnit || paymentMethod.unit || 'percent';
            
            let feeAmount = ['fixed', 'amount'].includes(feeUnit) ? fee : FinancialEngine.safeMul(amount, FinancialEngine.safeDiv(fee, 100));
            
            if (feeType !== 'bonus' && amount <= feeAmount) throw new HttpsError('invalid-argument', 'المبلغ المودع أقل من عمولة البوابة!');
            
            let netPayCurr = feeType === 'bonus' ? FinancialEngine.safeAdd(amount, feeAmount) : Math.max(0, FinancialEngine.safeSub(amount, feeAmount));
            let safeNetBase = netPayCurr;
            
            if (payCurr !== baseCurr) safeNetBase = FinancialEngine.convertViaUSD(netPayCurr, payCurr, baseCurr, liveRates, 'deposit');
            
            const cleanId = generateUniqueId(); 
            const serverNow = admin.firestore.Timestamp.now().toMillis();
            
            transaction.update(userRef, { lastDepositReqTime: serverNow });
            
            transaction.set(db.collection('telecard_deposits').doc(cleanId), {
                id: cleanId, displayId: cleanId, userId: uid, method: paymentMethodName, amount, currency: payCurr, 
                creditedAmount: safeNetBase, status: 'pending', time: admin.firestore.FieldValue.serverTimestamp(), 
                createdAt: admin.firestore.FieldValue.serverTimestamp(), receiptUrl: receiptUrl 
            });

            if (idempotencyRef) {
                transaction.set(idempotencyRef, { createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: admin.firestore.Timestamp.fromDate(new Date(serverNow + 48 * 60 * 60 * 1000)), depositId: cleanId });
            }
            
            // 🛡️ الإصلاح هنا: إرجاع رسالة نجاح واضحة للمتصفح بعد اكتمال ה- transaction
            return { success: true, message: 'تم إرسال طلب الإيداع بنجاح' };
        });
    } catch (error) { 
        if (error instanceof HttpsError) throw error; 
        throw new HttpsError('internal', 'تعذر إرسال الطلب.'); 
    }
});// ==========================================
// 👑 3. دوال الإدارة والعمليات المالية
// ==========================================
exports.adminToggleUserBan = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح لك.');
    const data = request.data || {};
    const { targetUid, isBanned, reason } = data;
    if (!targetUid) throw new HttpsError('invalid-argument', 'المعرف مفقود.');
    try {
        await db.collection('telecard_users').doc(targetUid).update({ isBanned: isBanned, banReason: reason || '', bannedAt: isBanned ? admin.firestore.FieldValue.serverTimestamp() : null });
        const userRecord = await admin.auth().getUser(targetUid);
        const currentClaims = userRecord.customClaims || {};
        currentClaims.banned = isBanned;
        await admin.auth().setCustomUserClaims(targetUid, currentClaims);
        if (isBanned) await admin.auth().revokeRefreshTokens(targetUid);

        await logAdminAction(request.auth.uid, 'TOGGLE_BAN', `Target: ${targetUid}, isBanned: ${isBanned}`);
        return { success: true };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

exports.adminProcessOrder = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const data = request.data || {};
    let { orderId, action, adminNote } = data;
    
    const safeAdminNote = String(adminNote || '').substring(0, SYSTEM_LIMITS.MAX_NOTE_LENGTH);
    const validActions = ['completed', 'rejected', 'refunded', 'returned', 'processing'];
    if (!validActions.includes(action)) throw new HttpsError('invalid-argument', 'حالة غير صالحة.');
    
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
        let userSnap = null;
        if (isRefundingAction && !wasAlreadyRefunded) {
            userSnap = await transaction.get(userRef);
        }

        let couponSnap = null;
        if (isRefundingAction && !wasAlreadyRefunded && orderData.couponCode) {
            couponSnap = await transaction.get(db.collection('telecard_coupons').where('code', '==', orderData.couponCode).limit(1));
        }
        
        const tiersSnap = await transaction.get(db.collection('telecard_tiers'));
        const tiersData = tiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        let keysBurnedCount = 0;
        if (isRefundingAction && !wasAlreadyRefunded && orderData.deliveredCode) {
            let poolId = orderData.vaultPoolId;
            if (!poolId) {
                const prodSnap = await transaction.get(db.collection('telecard_prods').doc(String(orderData.prodId)));
                if (prodSnap.exists) poolId = prodSnap.data().vaultPoolId;
            }

            if (poolId) {
                const vaultRef = db.collection('telecard_vault').doc(String(poolId));
                const keysQuerySnap = await transaction.get(vaultRef.collection('keys').where('orderId', '==', String(orderId)));
                
                keysQuerySnap.forEach(keyDoc => {
                    const keyData = keyDoc.data();
                    
                    const burnedKeyRef = db.collection('telecard_vault_returned').doc(keyDoc.id);
                    transaction.set(burnedKeyRef, {
                        ...keyData,
                        isBurned: true,
                        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
                        refundedOrderId: orderId,
                        reason: action,
                        originalPoolId: poolId
                    });

                    transaction.delete(keyDoc.ref);
                    keysBurnedCount++;
                });
            }
        }

        let deliveredCodeText = orderData.deliveredCode || null;
        let keysAssignedCount = 0;
        if (action === 'completed' && !wasAlreadyRefunded && !orderData.deliveredCode) {
             const prodSnap = await transaction.get(db.collection('telecard_prods').doc(String(orderData.prodId)));
             const prodData = prodSnap.exists ? prodSnap.data() : null;
             if (prodData && prodData.vaultPoolId) {
                 const vaultRef = db.collection('telecard_vault').doc(String(prodData.vaultPoolId));
                 const keysQuerySnap = await transaction.get(vaultRef.collection('keys').where('isSold', '==', false).limit(orderData.qty || 1));
                 
                 if (keysQuerySnap.size < (orderData.qty || 1)) throw new HttpsError('failed-precondition', 'لا توجد أكواد كافية في الخزنة لإكمال الطلب يدوياً.');

                 let selectedDocs = [];
                 keysQuerySnap.forEach(docSnap => selectedDocs.push(docSnap));
                 deliveredCodeText = selectedDocs.map(d => d.data().codeText).join(' | ');

                 selectedDocs.forEach(docSnap => {
                     transaction.update(docSnap.ref, { isSold: true, soldAt: admin.firestore.FieldValue.serverTimestamp(), orderId: orderId, userId: orderData.userId });
                     keysAssignedCount++;
                 });
                 transaction.update(vaultRef, { stockCount: admin.firestore.FieldValue.increment(-keysAssignedCount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
             }
        }

        let newWalletBal = 0; 
        if (isRefundingAction && !wasAlreadyRefunded) {
            if (userSnap && userSnap.exists) {
                const ud = userSnap.data();
                newWalletBal = safeAdd(ud.walletBalance || 0, Number(orderData.price || 0));
                
                let newCycleSpent = ud.tierCycleSpent || 0;
                let newTierId = ud.tierId;
                const orderTime = orderData.createdAt ? orderData.createdAt.toMillis() : 0;
                const cycleStart = ud.tierCycleStartDate ? ud.tierCycleStartDate.toMillis() : 0;

                if (orderTime >= cycleStart) {
                    newCycleSpent = safeSub(newCycleSpent, Number(orderData.price || 0));
                    
                    if (ud.manualTierOverride !== true) {
                        const getThreshold = (t) => Number(t.threshold || t.condition_amount || 0);
                        const validTiers = tiersData.filter(t => t.autoAdvance !== false && getThreshold(t) <= newCycleSpent).sort((a,b) => getThreshold(b) - getThreshold(a));
                        if (validTiers.length > 0) newTierId = validTiers[0].id;
                        else {
                           const defaultTier = tiersData.find(t => t.isDefault) || tiersData[0];
                           newTierId = defaultTier ? defaultTier.id : '1';
                        }
                    }
                }
                
                transaction.update(userRef, { 
                    walletBalance: newWalletBal, 
                    totalSpent: safeSub(ud.totalSpent || 0, Number(orderData.price || 0)), 
                    tierCycleSpent: newCycleSpent,
                    tierId: newTierId 
                });
            }
            if (couponSnap && !couponSnap.empty) {
                transaction.update(couponSnap.docs[0].ref, { usedCount: admin.firestore.FieldValue.increment(-1) });
            }
        }
        
        let orderUpdateObj = { status: action, adminNote: safeAdminNote, actionTime: admin.firestore.FieldValue.serverTimestamp() };
        if (isRefundingAction && !wasAlreadyRefunded) orderUpdateObj.balanceAfter = newWalletBal;
        if (keysAssignedCount > 0) orderUpdateObj.deliveredCode = deliveredCodeText;
        
        transaction.update(orderRef, orderUpdateObj);

        await logAdminAction(request.auth.uid, 'PROCESS_ORDER', `Order: ${orderId}, Action: ${action}`);
        let finalMsg = `تم تحديث الطلب إلى ${action}`;
        if (keysBurnedCount > 0) finalMsg += ` (وتم سحب ${keysBurnedCount} كود إلى خزنة التوالف).`;
        if (keysAssignedCount > 0) finalMsg += ` (وتم سحب ${keysAssignedCount} كود وتسليمه).`;
        
        return { success: true, message: finalMsg };
    });
});

exports.adminProcessDeposit = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const data = request.data || {};
    let { depositId, action, adminNote } = data;
    const safeAdminNote = String(adminNote || '').substring(0, SYSTEM_LIMITS.MAX_NOTE_LENGTH);
    
    return await db.runTransaction(async (transaction) => {
        const depRef = db.collection('telecard_deposits').doc(String(depositId));
        const depSnap = await transaction.get(depRef);
        if (!depSnap.exists) throw new HttpsError('not-found', 'الإيداع غير موجود.');
        
        const depData = depSnap.data();
        if (depData.status === action) throw new HttpsError('failed-precondition', 'هذه هي الحالة الحالية.');
        
        let userRef = db.collection('telecard_users').doc(String(depData.userId));
        let newWalletBal = 0; 
        const wasApproved = depData.status === 'approved';
        const amt = Number(depData.creditedAmount || depData.amount || 0);

        const userSnap = await transaction.get(userRef);
        if (userSnap.exists) {
            const ud = userSnap.data();

            if (action === 'approved') {
                newWalletBal = safeAdd(ud.walletBalance || 0, amt);
                transaction.update(userRef, { 
                    walletBalance: newWalletBal, 
                    totalDeposit: safeAdd(ud.totalDeposit || 0, amt) 
                });
            } else if ((action === 'refunded' || action === 'rejected') && wasApproved) {
                newWalletBal = strictSub(ud.walletBalance || 0, amt);
                transaction.update(userRef, { 
                    walletBalance: newWalletBal, 
                    totalDeposit: strictSub(ud.totalDeposit || 0, amt) 
                });
            } else {
                newWalletBal = ud.walletBalance || 0; 
            }
        }
        
        let depUpdateObj = { status: action, adminNote: safeAdminNote, actionTime: admin.firestore.FieldValue.serverTimestamp() };
        if (action === 'approved' || (wasApproved && (action === 'refunded' || action === 'rejected'))) {
            depUpdateObj.balanceAfter = newWalletBal;
        }
        transaction.update(depRef, depUpdateObj);

        await logAdminAction(request.auth.uid, 'PROCESS_DEPOSIT', `Deposit: ${depositId}, Action: ${action}`);
        return { success: true };
    });
});

exports.adminAdjustBalance = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const data = request.data || {};
    const { userId, type, amount, adminName } = data;
    const adjustAmount = Number(amount);
    if (isNaN(adjustAmount) || adjustAmount <= 0) throw new HttpsError('invalid-argument', 'المبلغ غير صالح.');

    const userRef = db.collection('telecard_users').doc(String(userId));
    return await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');

        const userData = userDoc.data();
        const currentBal = Number(userData.walletBalance || 0);

        const newBal = type === 'add' ? safeAdd(currentBal, adjustAmount) : strictSub(currentBal, adjustAmount);
        
        let updateObj = { walletBalance: newBal };
        updateObj.totalDeposit = type === 'add' 
            ? safeAdd(userData.totalDeposit || 0, adjustAmount) 
            : Math.max(0, strictSub(userData.totalDeposit || 0, adjustAmount));
            
        transaction.update(userRef, updateObj);
        
        const depId = generateUniqueId();
        const finalCreditedAmount = type === 'add' ? adjustAmount : -adjustAmount;

        transaction.set(db.collection('telecard_deposits').doc(depId), {
            id: depId, userId, amount: adjustAmount, 
            creditedAmount: finalCreditedAmount, 
            status: 'approved', method: type === 'add' ? 'إيداع إداري' : 'خصم إداري',
            time: admin.firestore.FieldValue.serverTimestamp(), admin: adminName || 'النظام',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await logAdminAction(request.auth.uid, 'ADJUST_BALANCE', `User: ${userId}, Type: ${type}, Amount: ${amount}`);
        return { success: true, newBalance: newBal };
    });
});

exports.adminAuditUserWallet = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح لك.');
    const data = request.data || {};
    const targetUserId = String(data.userId || '');
    if (!targetUserId) throw new HttpsError('invalid-argument', 'رقم العميل مفقود.');
    
    try {
        const userRef = db.collection('telecard_users').doc(targetUserId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) throw new HttpsError('not-found', 'العميل غير موجود.');

        const AggregateField = admin.firestore.AggregateField;
        const [ordersAgg, depApprovedAgg] = await Promise.all([
            db.collection('telecard_orders')
              .where('userId', '==', targetUserId)
              .where('status', 'in', ['completed', 'pending', 'processing'])
              .aggregate({ totalSpent: AggregateField.sum('price') }).get(),
              
            db.collection('telecard_deposits')
              .where('userId', '==', targetUserId)
              .where('status', '==', 'approved')
              .aggregate({ totalDep: AggregateField.sum('creditedAmount') }).get()
        ]);

        const realTotalDeposit = depApprovedAgg.data().totalDep || 0; 
        const realTotalSpent = ordersAgg.data().totalSpent || 0;
        const expectedBalance = strictSub(realTotalDeposit, realTotalSpent); 

        await userRef.update({ totalSpent: realTotalSpent, totalDeposit: realTotalDeposit, walletBalance: expectedBalance });
        return { success: true, data: { spent: realTotalSpent, deposit: realTotalDeposit, balance: expectedBalance } };
    } catch (error) { throw new HttpsError('internal', `فشل التدقيق: ${error.message}`); }
});

exports.grantAdminRole = onCall(async (request) => {
    const data = request.data || {};
    const targetEmail = data.email;
    const setupKey = data.setupKey;
    const MASTER_SETUP_KEY = process.env.ADMIN_SETUP_KEY; 

    if (!MASTER_SETUP_KEY) throw new HttpsError('internal', 'النظام غير مهيأ أمنياً.');
    if (!isMasterAdmin(request) && setupKey !== MASTER_SETUP_KEY) throw new HttpsError('permission-denied', 'غير مصرح لك.');
    if (!targetEmail) throw new HttpsError('invalid-argument', 'البريد الإلكتروني مفقود.');
    
    try {
        const user = await admin.auth().getUserByEmail(targetEmail);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        await logAdminAction(request.auth?.uid || 'system_recovery', 'GRANT_ADMIN', `Granted admin to: ${targetEmail}`);
        return { success: true };
    } catch (error) { throw new HttpsError('internal', `فشل المنح: ${error.message}`); }
});

exports.adminDeleteUserData = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const data = request.data || {};
    const { targetUid } = data;
    if (!targetUid) throw new HttpsError('invalid-argument', 'المعرف مفقود.');
    try {
        try {
            await admin.auth().deleteUser(targetUid);
        } catch (authError) {
            if (authError.code !== 'auth/user-not-found') {
                throw new HttpsError('internal', authError.message);
            }
        }
        
        await db.collection('telecard_users').doc(targetUid).update({
            email: `deleted_${targetUid.substring(0, 5)}@system.local`,
            fullName: 'حساب محذوف',
            phone: '---',
            country: '---',
            isDeleted: true,
            isBanned: true,
            banReason: 'Deleted by Admin',
            manualTierOverride: true,
            deletedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const notifsRef = db.collection('telecard_users').doc(targetUid).collection('notifications');
        let hasMore = true;
        while (hasMore) {
            const snapshot = await notifsRef.limit(400).get();
            if (snapshot.empty) { hasMore = false; break; }
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }

        await logAdminAction(request.auth?.uid, 'DELETE_USER', `Soft deleted user: ${targetUid}`);
        return { success: true };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

// ==========================================
// 🪪 4. استكمال هوية الحساب (KYC)
// ==========================================
exports.completeUserIdentity = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    checkBanStatus(request);
    
    const uid = request.auth.uid;
    const data = request.data || {};
    const { country, phone, currency } = data;
    
    const safeCountry = String(country || '').trim().substring(0, 100);
    const safePhone = String(phone || '').trim().substring(0, 50);
    const cleanCurrency = String(currency || '').trim().toUpperCase().substring(0, 10);
    
    const phoneRegex = /^\+?[0-9]{7,15}$/;
    if (!phoneRegex.test(safePhone)) {
        throw new HttpsError('invalid-argument', 'رقم الهاتف غير صالح. يرجى إدخال أرقام صحيحة (يمكن أن يبدأ برمز النداء الدولي +).');
    }
    
    try {
        let initialTierId = '1';
        const defaultTierSnap = await db.collection('telecard_tiers').where('isDefault', '==', true).limit(1).get();
        if (!defaultTierSnap.empty) {
            initialTierId = defaultTierSnap.docs[0].id;
        }
        
        return await db.runTransaction(async (transaction) => {
            const userRef = db.collection('telecard_users').doc(uid);
            const userSnap = await transaction.get(userRef);
            
            let userData = {};
            
            if (!userSnap.exists) {
                userData = {
                    email: request.auth.token.email || '', fullName: request.auth.token.name || 'عميل جديد', role: 'user',
                    walletBalance: 0.0, totalSpent: 0.0, totalDeposit: 0.0, tierId: initialTierId, tierCycleSpent: 0.0,
                    tierCycleStartDate: admin.firestore.FieldValue.serverTimestamp(), manualTierOverride: false,
                    isBanned: false, isIpBanned: false, createdAt: admin.firestore.FieldValue.serverTimestamp()
                };
            } else {
                userData = userSnap.data();
            }
            
            const hasBalance = Number(userData.walletBalance || 0) > 0;
            if (userData.isVerified === true || hasBalance) {
                throw new HttpsError('permission-denied', 'تم إعداد المحفظة مسبقاً ولا يمكن تعديلها.');
            }
            
            const finalProfile = {
                ...userData, country: safeCountry, phone: safePhone, baseCurrency: cleanCurrency,
                isVerified: true, identityCompletedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            transaction.set(userRef, finalProfile, { merge: true });
            return { success: true, lockedCurrency: cleanCurrency };
        });
        
    } catch (error) {
        console.error("KYC Internal Error: ", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `خطأ في الخادم: ${error.message}`);
    }
});

// ==========================================
// 📊 5. التحديث اليدوي للإحصائيات (زر الإدارة)
// ==========================================
exports.calculateStoreStatsCloud = onCall({ timeoutSeconds: 540 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const AggregateField = admin.firestore.AggregateField;
    
    const [ordersTotal, ordersCompleted, ordersRejected, ordersRefunded, financials, depTotal, depApproved, depRejected, depRefunded] = await Promise.all([
        db.collection('telecard_orders').count().get(), db.collection('telecard_orders').where('status', '==', 'completed').count().get(),
        db.collection('telecard_orders').where('status', '==', 'rejected').count().get(), db.collection('telecard_orders').where('status', '==', 'refunded').count().get(),
        db.collection('telecard_orders').where('status', '==', 'completed').aggregate({ revenue: AggregateField.sum('price'), cost: AggregateField.sum('pricingSnapshot.costUsd'), profit: AggregateField.sum('pricingSnapshot.netProfitUsd') }).get(),
        db.collection('telecard_deposits').count().get(), db.collection('telecard_deposits').where('status', '==', 'approved').count().get(),
        db.collection('telecard_deposits').where('status', '==', 'rejected').count().get(), db.collection('telecard_deposits').where('status', '==', 'refunded').count().get()
    ]);
    
    await db.collection('telecard_system').doc('globalStats').set({ 
        financials: { totalRevenue: Number((financials.data().revenue || 0).toFixed(4)), totalCost: Number((financials.data().cost || 0).toFixed(4)), totalProfit: Number((financials.data().profit || 0).toFixed(4)) },
        orders: { total: ordersTotal.data().count, completed: ordersCompleted.data().count, rejected: ordersRejected.data().count, refunded: ordersRefunded.data().count },
        deposits: { total: depTotal.data().count, approved: depApproved.data().count, rejected: depRejected.data().count, refunded: depRefunded.data().count }, lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    return { success: true };
});

exports.getServerTime = onCall(() => { return { success: true, serverTime: admin.firestore.Timestamp.now().toMillis() }; });

exports.onSettingsUpdate = onDocumentUpdated({ document: 'telecard_settings/singleton' }, async () => { await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true }); });
exports.onOfferUpdate = onDocumentWritten({ document: 'telecard_offers/{offerId}' }, async () => { await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true }); });

// ==========================================
// 🛡️ 6. المزامنة الآمنة للمنتجات والمستويات (مع حماية Timeouts)
// ==========================================
exports.secureProductSync = onDocumentWritten({ document: 'telecard_prods/{productId}', retry: true }, async (event) => {
    const publicProdRef = db.collection('telecard_prods_public').doc(event.params.productId);
    if (!event.data.after.exists) return publicProdRef.delete(); 
    const prodData = event.data.after.data();
    if (prodData.isActive === false || String(prodData.isAvailable) === 'false') return publicProdRef.delete();
    
    const tiersSnap = await db.collection('telecard_tiers').get();
    const tiersData = tiersSnap.docs.map(d => { return { id: d.id, ...d.data() }; });
    
    return publicProdRef.set(generatePublicProductData(prodData, tiersData), { merge: true });
});

exports.adminForceSyncCatalog = onCall({ timeoutSeconds: 540 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try {
        const tiersSnap = await db.collection('telecard_tiers').get();
        const tiersData = tiersSnap.docs.map(d => { return { id: d.id, ...d.data() }; });
        
        const prodsStream = db.collection('telecard_prods').stream();
        let syncCount = 0, currentBatch = db.batch(), opCount = 0;
        
        for await (const doc of prodsStream) {
            const prodData = doc.data();
            const publicRef = db.collection('telecard_prods_public').doc(doc.id);

            if (prodData.isActive === false || String(prodData.isAvailable) === 'false') {
                currentBatch.delete(publicRef);
            } else {
                currentBatch.set(publicRef, generatePublicProductData(prodData, tiersData), { merge: true });
                syncCount++;
            }
            opCount++;
            
            // 🛡️ تم التخفيض إلى 250 لضمان استقرار السيرفر
            if (opCount >= 250) { 
                await currentBatch.commit(); 
                currentBatch = db.batch(); 
                opCount = 0; 
            }
        }
        if (opCount > 0) await currentBatch.commit();
        
        await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true });
        return { success: true, message: `تمت مزامنة ${syncCount} منتج بنجاح!` };
    } catch (error) { throw new HttpsError('internal', `فشل المزامنة: ${error.message}`); }
});

// إبطال تفعيل retry لتفادي حلقة لانهائية من تكلفة الاستعلامات ومضاعفة الكتابة عند الاستدعاءات الضخمة
exports.onTierUpdate = onDocumentUpdated({ document: 'telecard_tiers/{tierId}', timeoutSeconds: 540 }, async (event) => {
    await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true });
    
    const oldTier = event.data.before.data(); const newTier = event.data.after.data();
    if (oldTier.profitPercent === newTier.profitPercent && oldTier.minProfitUsd === newTier.minProfitUsd) return null;

    const tiersSnap = await db.collection('telecard_tiers').get();
    const allTiers = tiersSnap.docs.map(d => { return { id: d.id, ...d.data() }; }); 

    const activeProdsStream = db.collection('telecard_prods').where('isActive', '==', true).stream();
    let currentBatch = db.batch(), opCount = 0, totalUpdated = 0;
    
    for await (const doc of activeProdsStream) {
        const prodData = doc.data();
        if (String(prodData.isFixedPrice).toLowerCase() === 'true') continue;
        
        currentBatch.set(db.collection('telecard_prods_public').doc(doc.id), generatePublicProductData(prodData, allTiers), { merge: true });
        totalUpdated++;
        opCount++;
        
        // 🛡️ تم التخفيض إلى 250 لضمان استقرار السيرفر
        if (opCount >= 250) { 
            await currentBatch.commit(); 
            currentBatch = db.batch(); 
            opCount = 0; 
        }
    }
    if (opCount > 0) await currentBatch.commit();
    
    return { success: true, updatedProductsCount: totalUpdated };
});

// ==========================================
// 🔔 7. الإشعارات الآلية
// ==========================================
exports.autoNotifyOrderStatus = onDocumentUpdated({ document: 'telecard_orders/{orderId}', retry: true }, async (event) => {
    const after = event.data.after.data();
    if (event.data.before.data().status === after.status) return null;
    
    let title = "تحديث طلب", message = `تم تغيير حالة الطلب إلى ${after.status}`;
    if (after.status === 'completed') { title = "🎉 طلبك جاهز!"; message = `تم تسليم ( ${after.product} ).`; } 
    else if (after.status === 'rejected') { title = "❌ طلب مرفوض"; message = `رفض الطلب: ${after.adminNote || 'راجع الدعم'}`; } 
    else if (after.status === 'refunded') { title = "↩️ استرجاع قيمة"; message = `تم استرجاع الرصيد بنجاح.`; }

    const notifId = `notif_${event.params.orderId}_${after.status}`;
    return db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({ id: notifId, title, message, type: 'notification', jumpTarget: 'order', createdAt: admin.firestore.FieldValue.serverTimestamp() });
});

exports.autoNotifyDepositStatus = onDocumentUpdated({ document: 'telecard_deposits/{depositId}', retry: true }, async (event) => {
    const after = event.data.after.data();
    if (event.data.before.data().status === after.status) return null;

    let title = "تحديث الإيداع", message = `الحالة: ${after.status}`;
    const displayAmt = after.creditedAmount !== undefined ? after.creditedAmount : after.amount;
    
    if (after.status === 'approved') { title = "💰 إيداع مقبول"; message = `تم إضافة ${displayAmt} لمحفظتك.`; } 
    else if (after.status === 'rejected') { title = "❌ إيداع مرفوض"; message = `السبب: ${after.adminNote || 'تواصل معنا'}`; } 
    else if (after.status === 'refunded') { title = "↩️ إيداع مسترجع"; message = `تم سحب ${displayAmt} من محفظتك.`; }

    const notifId = `notif_${event.params.depositId}_${after.status}`;
    return db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({ id: notifId, title, message, type: 'notification', jumpTarget: 'wallet', createdAt: admin.firestore.FieldValue.serverTimestamp() });
});

// ==========================================
// 📈 8. المعالجات المجدولة للإحصائيات (Anti-Hotspotting Cron)
// ⚠️ تم إيقاف המزامنة اللحظية بالكامل واستبدالها بهذه المهمة لخفض فاتورة الكتابات والقراءات
// ==========================================
exports.autoUpdateGlobalStats = onSchedule({
    schedule: "every 15 minutes",
    timeZone: "UTC",
    timeoutSeconds: 540,
    memory: "512MiB"
}, async (event) => {
    const AggregateField = admin.firestore.AggregateField;
    
    try {
        const [ordersTotal, ordersCompleted, ordersRejected, ordersRefunded, financials, depTotal, depApproved, depRejected, depRefunded] = await Promise.all([
            db.collection('telecard_orders').count().get(),
            db.collection('telecard_orders').where('status', '==', 'completed').count().get(),
            db.collection('telecard_orders').where('status', '==', 'rejected').count().get(),
            db.collection('telecard_orders').where('status', '==', 'refunded').count().get(),
            db.collection('telecard_orders').where('status', '==', 'completed').aggregate({ revenue: AggregateField.sum('price'), cost: AggregateField.sum('pricingSnapshot.costUsd'), profit: AggregateField.sum('pricingSnapshot.netProfitUsd') }).get(),
            db.collection('telecard_deposits').count().get(),
            db.collection('telecard_deposits').where('status', '==', 'approved').count().get(),
            db.collection('telecard_deposits').where('status', '==', 'rejected').count().get(),
            db.collection('telecard_deposits').where('status', '==', 'refunded').count().get()
        ]);
        
        await db.collection('telecard_system').doc('globalStats').set({ 
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
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log("[Stats Cron] Successfully updated global statistics without hotspotting.");
    } catch (error) {
        console.error("[Stats Cron Error]:", error);
    }
});

// ==========================================
// 📦 9. إدارة صناديق الأكواد (Vault Batching)
// ==========================================
exports.adminSaveVaultCodes = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const data = request.data || {};
    const { poolId, poolName, alertLimit, codesList } = data;
    
    if (!Array.isArray(codesList)) throw new HttpsError('invalid-argument', 'قائمة الأكواد غير صالحة.');

    try {
        const vaultRef = db.collection('telecard_vault').doc(String(poolId));
        
        const rawCodes = codesList.map(c => String(c).trim()).filter(c => c.length > 0);
        const cleanCodes = [...new Set(rawCodes)];
        
        if (cleanCodes.length === 0) return { success: true, addedCount: 0 };

        const chunks = [];
        for (let i = 0; i < cleanCodes.length; i += 450) {
            chunks.push(cleanCodes.slice(i, i + 450));
        }

        for (const chunk of chunks) {
            const batch = db.batch();
            chunk.forEach(codeText => {
                const keyRef = vaultRef.collection('keys').doc(`key_${crypto.randomBytes(8).toString('hex')}`);
                batch.set(keyRef, { codeText, isSold: false, addedAt: admin.firestore.FieldValue.serverTimestamp() });
            });
            await batch.commit();
        }

        await vaultRef.set({ 
            id: poolId, name: poolName || 'صندوق أكواد', alertLimit: Number(alertLimit) || 5, 
            stockCount: admin.firestore.FieldValue.increment(cleanCodes.length), 
            updatedAt: admin.firestore.FieldValue.serverTimestamp() 
        }, { merge: true });

        return { success: true, addedCount: cleanCodes.length };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

exports.adminDeleteVaultPool = onCall({ timeoutSeconds: 540 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const data = request.data || {};
    const poolId = String(data.poolId || '');
    if (!poolId) throw new HttpsError('invalid-argument', 'رقم الخزنة مفقود.');
    
    try {
        const vaultRef = db.collection('telecard_vault').doc(poolId);
        
        const soldKeysSnap = await vaultRef.collection('keys').where('isSold', '==', true).limit(1).get();
        if (!soldKeysSnap.empty) {
            throw new HttpsError('failed-precondition', 'لا يمكن حذف هذه الخزنة! توجد أكواد تم بيعها للعملاء ويجب الاحتفاظ بها لضمان التدقيق المالي وحل المنازعات.');
        }

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
        return { success: true };
    } catch (error) { 
        if (error instanceof HttpsError) throw error; 
        throw new HttpsError('internal', error.message); 
    }
});

// ==========================================
// 🔗 10. تصدير دوال الموردين بنظام الاستيراد المتأخر (Dynamic Lazy Loading)
// (يتم تعريف التصدير كـ Getters لتجنب استهلاك الذاكرة وإبطاء التشغيل البارد للمحرك العام)
// ==========================================
Object.defineProperty(exports, "orderStatusWebhook", {
    get: () => require('./developerApi.js').orderStatusWebhook
});
Object.defineProperty(exports, "cronRetryWebhooks", {
    get: () => require('./developerApi.js').cronRetryWebhooks
});
Object.defineProperty(exports, "externalCreateOrder", {
    get: () => require('./developerApi.js').externalCreateOrder
});
Object.defineProperty(exports, "syncSupplierData", {
    get: () => require('./supplierEngine.js').syncSupplierData
});
Object.defineProperty(exports, "scheduledSupplierSync", {
    get: () => require('./supplierEngine.js').scheduledSupplierSync
});
Object.defineProperty(exports, "secureSaveSupplier", {
    get: () => require('./supplierEngine.js').secureSaveSupplier
});

// 🧹 مهمة مجدولة لتنظيف التخزين من الصور اليتيمة (تعمل كل يوم أحد الساعة 3 فجراً)
exports.cleanupOrphanedKycDocs = onSchedule({
    schedule: "0 3 * * 0", 
    timeZone: "UTC",
    timeoutSeconds: 540,
    memory: "512MiB"
}, async (event) => {
    const bucket = admin.storage().bucket();
    const prefix = 'kyc_docs/';
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    try {
        const [files] = await bucket.getFiles({ prefix });
        let deletedCount = 0;

        for (const file of files) {
            if (file.name === prefix) continue;

            const [metadata] = await file.getMetadata();
            const timeCreated = new Date(metadata.timeCreated).getTime();

            if (now - timeCreated > TWENTY_FOUR_HOURS) {
                const fileNameParts = file.name.replace(prefix, '').split('_');
                const userId = fileNameParts[0];

                if (!userId || userId === 'unknown') {
                    await file.delete();
                    deletedCount++;
                    continue;
                }

                const userDoc = await db.collection('telecard_users').doc(userId).get();
                
                let isOrphan = true;
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const kycData = userData.kycData || {};
                    
                    // 🛡️ الإصلاح الجذري: التحقق من وجود مسار الملف داخل الرابط المحفوظ بدلاً من التطابق الحرفي
                    const safePath = encodeURIComponent(file.name);
                    
                    const isFrontMatch = kycData.frontImg && String(kycData.frontImg).includes(safePath);
                    const isBackMatch = kycData.backImg && String(kycData.backImg).includes(safePath);
                    const isSelfieMatch = kycData.selfieImg && String(kycData.selfieImg).includes(safePath);
                    
                    if (isFrontMatch || isBackMatch || isSelfieMatch) {
                        isOrphan = false; // الملف مستخدم برابط يحتوي على توكن، اتركه بأمان
                    }
                }

                if (isOrphan) {
                    await file.delete();
                    deletedCount++;
                }
            }
        }
        console.log(`[Storage Cleanup] Successfully deleted ${deletedCount} orphaned KYC files.`);
    } catch (error) {
        console.error("[Storage Cleanup Error]:", error);
    }
});