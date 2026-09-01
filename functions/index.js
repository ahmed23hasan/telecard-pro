// ============================================================================
// 🧠 المحرك الرئيسي (functions/index.js) لـ TeleCard - النسخة الاستراتيجية V28.2.0 👑
// 🎯 الوظيفة: المعاملات المالية، حماية الثغرات، التشافي الذاتي، والأرشفة الآمنة.
// 🚀 التحديثات المعمارية (V28.2.0 - The Pinnacle Refined):
// 1. Server Validation Firewall: إجبار الخادم على فحص حدود الإيداع (min/max) لمنع اختراق الـ API.
// 2. Cursor Pagination Fix: إضافة orderBy إجباري لمنع انهيار استعلامات الدفعات في Firestore.
// 3. Precision Sanitizer: تقريب الأرصدة لـ 4 أصفار عشرية لمنع أخطاء (Floating-Point).
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");

// 🌐 [السيادة الجغرافية والتحكم الذكي في الموارد]
setGlobalOptions({
    region: 'us-central1',
    maxInstances: 20, 
    concurrency: 80
});

const admin = require('firebase-admin');
const functions = require('firebase-functions/v1');
const crypto = require('crypto');
const { FinancialSecurityError, ...FinancialEngine } = require('./financialEngine.js');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const SYSTEM_LIMITS = {
    MAX_QTY_PER_ORDER: 10000,
    MAX_VAULT_QTY_PER_ORDER: 200, 
    MAX_SAFE_AMOUNT: 100000000,
    MAX_URL_LENGTH: 1000,
    MAX_NOTE_LENGTH: 500
};

// ==========================================
// 🛡️ دوال المساعدة الشاملة والرياضيات الآمنة
// ==========================================

const sanitizeAmount = (amount) => Number(Math.round(amount + 'e4') + 'e-4');

const safeClone = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof admin.firestore.Timestamp) return new admin.firestore.Timestamp(obj.seconds, obj.nanoseconds);
    if (obj instanceof admin.firestore.GeoPoint) return new admin.firestore.GeoPoint(obj.latitude, obj.longitude);
    if (Array.isArray(obj)) return obj.map(safeClone);
    
    const cloned = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            cloned[key] = safeClone(obj[key]);
        }
    }
    return cloned;
};

const getStartOfUTCDay = (timestampMs) => {
    const d = new Date(timestampMs);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
};

const generatePublicProductData = (prodData, tiersData) => {
    const publicData = {};
    const ALLOWED_PRODUCT_KEYS = [
        'id', 'name', 'description', 'image', 'options', 'isActive', 'isAvailable',
        'category', 'sortOrder', 'type', 'isFixedPrice', 'minQty', 'maxQty', 'badge'
    ];
    
    ALLOWED_PRODUCT_KEYS.forEach(k => { 
        if (prodData[k] !== undefined) {
            publicData[k] = safeClone(prodData[k]);
        } 
    });
    
    const SAFE_FALLBACK_PRICE = 9999999; 
    const baseTierPrices = {};
    tiersData.forEach(tier => {
        try { baseTierPrices[tier.id] = FinancialEngine.calculatePrice({ product: prodData, tier: tier }).finalPrice; } 
        catch(e) { baseTierPrices[tier.id] = SAFE_FALLBACK_PRICE; }
    });
    publicData.tierPrices = baseTierPrices;

    if (Array.isArray(publicData.options)) {
        publicData.options = publicData.options.map((opt, idx) => {
            const optClean = {};
            const ALLOWED_OPTION_KEYS = ['name', 'value', 'sortOrder', 'isActive', 'isAvailable', 'type', 'badge'];
            ALLOWED_OPTION_KEYS.forEach(k => { 
                if (opt[k] !== undefined) {
                    optClean[k] = safeClone(opt[k]);
                }
            });
            const optTierPrices = {};
            tiersData.forEach(tier => {
                try { optTierPrices[tier.id] = FinancialEngine.calculatePrice({ product: prodData, tier: tier, optIdx: idx }).finalPrice; } 
                catch(e) { optTierPrices[tier.id] = SAFE_FALLBACK_PRICE; }
            });
            optClean.tierPrices = optTierPrices;
            return optClean;
        });
    }
    return publicData;
};

const buildPricingCache = async (transactionOrBatch = null) => {
    const [tiersSnap, offersSnap] = await Promise.all([
        db.collection('telecard_tiers').get(),
        db.collection('telecard_offers').where('isActive', '==', true).get()
    ]);
    
    const tiers = tiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const offers = offersSnap.docs.map(d => {
        const data = d.data();
        return {
            id: d.id, name: data.name, type: data.type, value: data.value,
            targetProds: data.targetProds || [], expiryDate: data.expiryDate || null, startDate: data.startDate || null
        };
    });

    const payload = { tiers, offers, lastUpdated: admin.firestore.FieldValue.serverTimestamp() };
    const cacheRef = db.collection('telecard_system').doc('active_pricing');
    
    if (transactionOrBatch && typeof transactionOrBatch.set === 'function') transactionOrBatch.set(cacheRef, payload);
    else await cacheRef.set(payload);
    
    return { tiers, offers };
};

const buildConfigCache = async (transactionOrBatch = null) => {
    const [ratesSnap, paymentsSnap] = await Promise.all([
        db.collection('telecard_rates').get(),
        db.collection('telecard_payments').get()
    ]);
    
    const rates = ratesSnap.docs.map(d => d.data());
    const payments = paymentsSnap.docs.map(d => d.data());

    const payload = { rates, payments, lastUpdated: admin.firestore.FieldValue.serverTimestamp() };
    const cacheRef = db.collection('telecard_system').doc('active_configs');
    
    if (transactionOrBatch && typeof transactionOrBatch.set === 'function') transactionOrBatch.set(cacheRef, payload);
    else await cacheRef.set(payload);
    
    return { rates, payments };
};

const logAdminAction = async (adminUid, action, details) => {
    try { await db.collection('telecard_audit_logs').add({ adminUid, action, details, timestamp: admin.firestore.FieldValue.serverTimestamp() }); } 
    catch (e) { console.error("Audit Log Error:", e); }
};

const isMasterAdmin = (request) => request.auth?.token?.admin === true;
const checkBanStatus = (request) => { if (request.auth?.token?.banned === true) throw new HttpsError('permission-denied', 'عذراً، هذا الحساب محظور.'); };
const safeAdd = (a, b) => FinancialEngine.safeAdd(a, b);
const safeSub = (a, b) => Math.max(0, FinancialEngine.safeSub(a, b));
const strictSub = (a, b) => FinancialEngine.safeSub(a, b); 
const generateUniqueId = () => `${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; 

// ==========================================
// 🛡️ 0. إنشاء الحساب (مع حل ثغرة التزامن - Race Condition Fix)
// ==========================================
exports.onUserAuthCreated = functions
    .runWith({ failurePolicy: true }) 
    .auth.user().onCreate(async (user) => {
    try {
        const userRef = db.collection('telecard_users').doc(user.uid);
        
        // 🚀 الحل السحري: إعطاء مهلة 3 ثوانٍ لمتصفح العميل (signup.html) ليكتب البيانات الغنية أولاً
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // فحص ما إذا كان العميل قد نجح في كتابة البيانات المنسقة
        const snap = await userRef.get();
        if (snap.exists) return null; // ممتاز! العميل تفوق وكتب البيانات الصحيحة (الاسم واسم المستخدم)، السيرفر سينسحب بصمت.

        // 🛡️ في حال فشل العميل (انقطاع نت أو إغلاق التطبيق فجأة)، يتدخل السيرفر كحارس احتياطي:
        let initialTierId = '1';
        const defaultTierSnap = await db.collection('telecard_tiers').where('isDefault', '==', true).limit(1).get();
        if (!defaultTierSnap.empty) initialTierId = defaultTierSnap.docs[0].id;
        
        // 🚀 توليد اسم ذكي من البريد الإلكتروني بدلاً من العبارة المزعجة "عميل جديد"
        const emailPrefix = user.email ? user.email.split('@')[0] : 'user';
        const rawName = user.displayName || emailPrefix;
        const firstName = rawName.split(' ')[0];
        
        // 🚀 توليد اسم مستخدم احتياطي لضمان عدم بقاء الحقل فارغاً
        const fallbackUsername = firstName.toLowerCase().replace(/\s+/g, '') + user.uid.substring(0, 4);

        const initialProfile = {
            id: user.uid, uid: user.uid,
            email: user.email || '', fullName: rawName, firstName: firstName, 
            username: fallbackUsername, // تم سد ثغرة اختفاء اسم المستخدم
            baseCurrency: 'USD', role: 'user', walletBalance: 0.0, totalSpent: 0.0, totalDeposit: 0.0,
            tierId: initialTierId, tierCycleSpent: 0.0, tierCycleStartDate: admin.firestore.FieldValue.serverTimestamp(),
            manualTierOverride: false, isBanned: false, isIpBanned: false, isVerified: false, kycStatus: 'none',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // نستخدم set بدلاً من create لضمان التغلب على أي تضارب
        await userRef.set(initialProfile, { merge: true }); 
    } catch (error) { 
        console.error("Auth Trigger Error:", error);
        return null;
    }
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
    
    let rawQty = Number(data.qty);
    if (isNaN(rawQty) || rawQty <= 0) throw new HttpsError('invalid-argument', 'الكمية المدخلة غير صالحة.');
    let requestedQty = Math.floor(rawQty);
    
    let optIdx = null;
    if (data.optIdx !== null && data.optIdx !== undefined) {
        const parsedOptIdx = Number(data.optIdx);
        if (!Number.isNaN(parsedOptIdx) && parsedOptIdx >= 0) optIdx = Math.floor(parsedOptIdx);
        else throw new HttpsError('invalid-argument', 'الخيار غير صالح.');
    }
    
    const finalInputStr = String(data.finalInputStr || '---').substring(0, 500);
    const couponCode = data.couponCode ? String(data.couponCode).trim() : null;
    const idempotencyKey = data.idempotencyKey ? String(data.idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50) : null;
    if (!productId) throw new HttpsError('invalid-argument', 'رقم المنتج مفقود.');
    
    const cleanOrderId = generateUniqueId();

    let idempotencyRef = null;
    if (idempotencyKey) {
        idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
        const preCheck = await idempotencyRef.get();
        if (preCheck.exists) throw new HttpsError('already-exists', 'تم معالجة هذا الطلب مسبقاً.');
    }

    let deliveredCodeText = null, isAutoDelivered = false;

    try {
        await db.runTransaction(async (transaction) => {
            const serverNow = admin.firestore.Timestamp.now().toMillis();

            if (idempotencyRef) {
                const idempSnap = await transaction.get(idempotencyRef);
                if (idempSnap.exists) throw new HttpsError('already-exists', 'تم معالجة هذا الطلب مسبقاً.');
            }

            const userRef = db.collection('telecard_users').doc(uid);
            const productRef = db.collection('telecard_prods').doc(productId);
            const cacheRef = db.collection('telecard_system').doc('active_pricing');

            const [userSnap, productSnap, cacheSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(productRef),
                transaction.get(cacheRef)
            ]);

            if (!productSnap.exists) throw new HttpsError('not-found', 'المنتج غير متوفر.');
            const product = productSnap.data();

            let tiersData = [];
            let liveOffers = [];

            if (cacheSnap.exists && Array.isArray(cacheSnap.data().tiers)) {
                const cacheData = cacheSnap.data();
                tiersData = cacheData.tiers;
                liveOffers = cacheData.offers || [];
            } else {
                console.warn(`[Auto-Fallback] Cache missing for order ${cleanOrderId}. Reading directly from original collections...`);
                const [fallbackTiersSnap, fallbackOffersSnap] = await Promise.all([
                    transaction.get(db.collection('telecard_tiers')),
                    transaction.get(db.collection('telecard_offers').where('isActive', '==', true))
                ]);
                
                tiersData = fallbackTiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                liveOffers = fallbackOffersSnap.docs.map(d => d.data());
            }

            let userData = userSnap.exists ? userSnap.data() : {
                email: request.auth.token.email || '', fullName: request.auth.token.name || 'عميل جديد', role: 'user',
                walletBalance: 0.0, totalSpent: 0.0, tierId: tiersData.find(t => t.isDefault)?.id || '1', tierCycleSpent: 0.0, 
                manualTierOverride: false, isBanned: false, isVerified: false, kycStatus: 'none'
            };

            if (userData.isBanned === true) throw new HttpsError('permission-denied', 'العملية مرفوضة.');
            if (userData.isVerified !== true) throw new HttpsError('failed-precondition', 'يجب استكمال إعداد حسابك من نافذة البيانات أولاً.');
            if (product.isActive === false || String(product.isAvailable) === 'false') throw new HttpsError('failed-precondition', 'المنتج غير متاح حالياً.');

            const safeExpiry = (exp) => exp ? (typeof exp.toMillis === 'function' ? exp.toMillis() : new Date(exp).getTime()) : 0;
            let activeOffer = liveOffers.find(off => 
                (safeExpiry(off.expiryDate) === 0 || safeExpiry(off.expiryDate) > serverNow) &&
                (!off.targetProds || off.targetProds.length === 0 || off.targetProds.includes(productId))
            );
            
            let currentCouponData = null, couponRef = null; 
            let finalQty = Math.max(1, Math.min(SYSTEM_LIMITS.MAX_QTY_PER_ORDER, requestedQty)); 
            let pricingSnapshot = null; 

            if (product.vaultPoolId) finalQty = Math.min(finalQty, SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER);

            const assignedTierId = String(userData.tierId || userData.tier || '1');
            let currentTierObj = tiersData.find(t => String(t.id) === assignedTierId);
            if (!currentTierObj) throw new HttpsError('failed-precondition', 'مستوى الحساب غير موجود.');

            let currentCycleSpent = Number(userData.tierCycleSpent || 0);
            
            const cycleStartMs = userData.tierCycleStartDate?.toMillis ? userData.tierCycleStartDate.toMillis() : serverNow;
            const cycleStartDay = getStartOfUTCDay(cycleStartMs);
            const todayDay = getStartOfUTCDay(serverNow);
            const daysPassed = (todayDay - cycleStartDay) / (24 * 60 * 60 * 1000);
            const isCycleExpired = daysPassed > Number(currentTierObj?.durationDays || 30);

            let activeTierObj = currentTierObj;
            if (isCycleExpired) { 
                currentCycleSpent = 0; 
                if (userData.manualTierOverride !== true) { activeTierObj = tiersData.find(t => t.isDefault) || currentTierObj; }
            }

            try {
                if (couponCode) {
                    const couponQuerySnap = await transaction.get(db.collection('telecard_coupons').where('code', '==', couponCode).limit(1));
                    if (couponQuerySnap.empty) throw new FinancialSecurityError('الكود غير صحيح.');
                    couponRef = couponQuerySnap.docs[0].ref;
                    currentCouponData = couponQuerySnap.docs[0].data();
                    
                    const validationResult = FinancialEngine.validateCoupon(couponCode, product, finalQty, optIdx, userData, activeTierObj, [currentCouponData], serverNow, activeOffer);
                    if (!validationResult.valid) throw new FinancialSecurityError(validationResult.msg); 
                }            

                pricingSnapshot = FinancialEngine.calculateOrderTotal({ product, tier: activeTierObj, offer: activeOffer, coupon: currentCouponData, optIdx }, finalQty); 
            } catch (err) {
                if (err instanceof FinancialSecurityError) throw new HttpsError('invalid-argument', err.message.replace('[SECURITY] ', ''));
                throw err;
            }

            if (pricingSnapshot.isFirewallViolated) throw new HttpsError('permission-denied', pricingSnapshot.rejectionReason || 'العملية مرفوضة.');

            const totalRequired = pricingSnapshot.totalFinalPrice; 
            if (totalRequired <= 0) throw new HttpsError('permission-denied', 'غير مسموح بشراء منتجات بصفر.');

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
                
                const vaultSnap = await transaction.get(vaultRef);
                if (!vaultSnap.exists || (vaultSnap.data().stockCount || 0) < finalQty) {
                    throw new HttpsError('failed-precondition', 'الأكواد المتوفرة حالياً أقل من المطلوب.');
                }

                const keysQuerySnap = await transaction.get(vaultRef.collection('keys').where('isSold', '==', false).limit(finalQty));
                if (keysQuerySnap.size < finalQty) {
                    throw new HttpsError('failed-precondition', 'حدث ضغط على الخزنة، يرجى المحاولة مرة أخرى.');
                }
                
                keysQuerySnap.forEach(docSnap => selectedDocs.push(docSnap));
                deliveredCodeText = selectedDocs.map(d => d.data().codeText).join(' | ');
                isAutoDelivered = true;
            }        

            if (selectedDocs.length > 0 && vaultRef) {
                selectedDocs.forEach(docSnap => {
                    transaction.update(docSnap.ref, { isSold: true, soldAt: admin.firestore.FieldValue.serverTimestamp(), orderId: cleanOrderId, userId: uid });
                });
                transaction.update(vaultRef, { stockCount: admin.firestore.FieldValue.increment(-finalQty), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            }

            if (currentCouponData && couponRef) transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });

            const newBalance = sanitizeAmount(safeSub(currentBalance, totalRequired));
            const newTotalSpent = sanitizeAmount(safeAdd(userData.totalSpent || 0, totalRequired));
            const cleanTierCycleSpent = sanitizeAmount(newTierCycleSpent);

            let userUpdateObj = { 
                walletBalance: newBalance, 
                totalSpent: newTotalSpent, 
                tierCycleSpent: cleanTierCycleSpent, 
                tierId: finalTierId, 
                lastOrderTime: serverNow
            };
            if (isCycleExpired || isTierUpgraded) { userUpdateObj.tierCycleStartDate = admin.firestore.FieldValue.serverTimestamp(); }
            
            transaction.set(userRef, { ...userData, ...userUpdateObj }, { merge: true });

            const orderRef = db.collection('telecard_orders').doc(cleanOrderId);
            transaction.set(orderRef, {
                id: cleanOrderId, userId: uid, prodId: productId, product: product.name,
                vaultPoolId: product.vaultPoolId || null,
                price: sanitizeAmount(totalRequired), qty: finalQty, status: isAutoDelivered ? 'completed' : 'pending',
                deliveredCode: deliveredCodeText, tierName: pricingSnapshot.tierName, input: finalInputStr,
                pricingSnapshot: { costUsd: pricingSnapshot.costUsd || 0, netProfitUsd: pricingSnapshot.totalNetProfitUsd || 0 },
                time: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            if (idempotencyRef) {
                transaction.set(idempotencyRef, { createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: admin.firestore.Timestamp.fromDate(new Date(serverNow + 48 * 60 * 60 * 1000)), orderId: cleanOrderId });
            }
        });

        return { success: true, isAutoDelivered, deliveredCode: deliveredCodeText };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error("🚨 [CRITICAL_ORDER_ERROR]:", error); 
        throw new HttpsError('internal', 'حدث خطأ غير متوقع في الخادم، يرجى المحاولة لاحقاً.'); 
    }
});

// ==========================================
// 💰 2. إرسال طلبات الإيداع (Server Validation Firewall)
// ==========================================
exports.submitBalanceRequest = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    checkBanStatus(request);

    const uid = request.auth.uid;
    const data = request.data || {};
    const amount = Number(data.amount);
    const paymentMethodName = String(data.paymentMethodName || '').trim();
    const payCurr = String(data.payCurr || 'USD').toUpperCase();
    const idempotencyKey = data.idempotencyKey ? String(data.idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50) : null;
    
    if (isNaN(amount) || amount <= 0 || amount > SYSTEM_LIMITS.MAX_SAFE_AMOUNT) throw new HttpsError('out-of-range', 'المبلغ المدخل غير صالح.');
    const receiptUrl = data.receiptUrl ? String(data.receiptUrl).trim() : null;
    if (receiptUrl && receiptUrl.length > SYSTEM_LIMITS.MAX_URL_LENGTH) throw new HttpsError('invalid-argument', 'الرابط طويل جداً.');

    let idempotencyRef = null;
    if (idempotencyKey) {
        idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
        const preCheck = await idempotencyRef.get();
        if (preCheck.exists) throw new HttpsError('already-exists', 'تم إرسال الطلب مسبقاً.');
    }

    try {
        return await db.runTransaction(async (transaction) => {
            const serverNow = admin.firestore.Timestamp.now().toMillis();

            if (idempotencyRef) {
                const idempSnap = await transaction.get(idempotencyRef);
                if (idempSnap.exists) throw new HttpsError('already-exists', 'تم إرسال الطلب مسبقاً.');
            }

            const userRef = db.collection('telecard_users').doc(uid);
            const configCacheRef = db.collection('telecard_system').doc('active_configs');
            const settingsRef = db.collection('telecard_settings').doc('singleton');

            const [userSnap, configSnap, settingsSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(configCacheRef),
                transaction.get(settingsRef)
            ]);

            let ratesData = [];
            let paymentsData = [];

            if (configSnap.exists && Array.isArray(configSnap.data().payments)) {
                const cacheData = configSnap.data();
                ratesData = cacheData.rates || [];
                paymentsData = cacheData.payments || [];
            } else {
                const [fallbackRatesSnap, fallbackPaymentsSnap] = await Promise.all([
                    transaction.get(db.collection('telecard_rates')),
                    transaction.get(db.collection('telecard_payments'))
                ]);
                ratesData = fallbackRatesSnap.docs.map(d => d.data());
                paymentsData = fallbackPaymentsSnap.docs.map(d => d.data());
            }

            const paymentMethod = paymentsData.find(p => p.name === paymentMethodName);
            if (!paymentMethod) throw new HttpsError('not-found', 'طريقة الدفع غير متوفرة.');

            let userData = userSnap.exists ? userSnap.data() : {
                email: request.auth.token.email || '', fullName: request.auth.token.name || 'عميل جديد', role: 'user',
                walletBalance: 0.0, baseCurrency: 'USD', isBanned: false, isVerified: false
            };

            if (userData.isBanned === true) throw new HttpsError('permission-denied', 'العملية مرفوضة.');
            if (userData.isVerified !== true) throw new HttpsError('failed-precondition', 'يجب استكمال إعداد حسابك من نافذة البيانات قبل طلب الإيداع.');
            
            const baseCurr = String(userData.baseCurrency || 'USD').toUpperCase();
            const globalSettings = settingsSnap.exists ? settingsSnap.data() : {};
            
            // 🚀 [التحديث الماسي]: تمرير الفحص للمحرك المالي لمنع اختراق الخادم وتجاوز الحدود
            const depositValidation = FinancialEngine.calculateDepositFee(amount, paymentMethod, payCurr, baseCurr, ratesData, globalSettings);
            
            if (!depositValidation.isValid) {
                throw new HttpsError('out-of-range', depositValidation.msg);
            }
            
            const safeNetBase = depositValidation.netBase;
            
            // حساب معدل الصرف للحفظ كمرجع بصري (fxRate)
            let fxRateUsed = 1;
            const feeSettings = paymentMethod.currencySettings?.[payCurr] ? {
                fee: parseFloat(paymentMethod.currencySettings[payCurr].fee || paymentMethod.currencySettings[payCurr].value) || 0,
                minFee: parseFloat(paymentMethod.currencySettings[payCurr].minFee) || 0,
                maxFee: parseFloat(paymentMethod.currencySettings[payCurr].maxFee) || 0,
                feeType: paymentMethod.currencySettings[payCurr].feeType || paymentMethod.currencySettings[payCurr].type || 'fee',
                feeUnit: paymentMethod.currencySettings[payCurr].feeUnit || paymentMethod.currencySettings[payCurr].unit || 'percent'
            } : {
                fee: parseFloat(paymentMethod.fee || paymentMethod.value) || 0,
                minFee: parseFloat(paymentMethod.minFee) || 0,
                maxFee: parseFloat(paymentMethod.maxFee) || 0,
                feeType: paymentMethod.feeType || paymentMethod.type || 'fee',
                feeUnit: paymentMethod.feeUnit || paymentMethod.unit || 'percent'
            };
            
            const netPayCurrTemp = FinancialEngine.calculateDepositNet(amount, feeSettings);
            if (payCurr !== baseCurr && netPayCurrTemp > 0) {
                fxRateUsed = FinancialEngine.safeDiv(safeNetBase, netPayCurrTemp);
            }

            const cleanId = generateUniqueId(); 
            
            transaction.set(userRef, { ...userData, lastDepositReqTime: serverNow }, { merge: true });
            
            transaction.set(db.collection('telecard_deposits').doc(cleanId), {
                id: cleanId, displayId: cleanId, userId: uid, method: paymentMethodName, amount, currency: payCurr, 
                creditedAmount: sanitizeAmount(safeNetBase), targetCurrency: baseCurr, fxRate: fxRateUsed, status: 'pending', 
                time: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp(), receiptUrl: receiptUrl 
            });

            if (idempotencyRef) transaction.set(idempotencyRef, { createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: admin.firestore.Timestamp.fromDate(new Date(serverNow + 48 * 60 * 60 * 1000)), depositId: cleanId });
            
            return { success: true, message: 'تم إرسال طلب الإيداع بنجاح' };
        });
    } catch (error) { 
        if (error instanceof HttpsError) throw error; 
        console.error("🚨 [CRITICAL_DEPOSIT_ERROR]:", error);
        throw new HttpsError('internal', 'تعذر إرسال الطلب في الوقت الحالي.'); 
    }
});

// ==========================================
// 👑 3. دوال الإدارة والعمليات المالية 
// ==========================================
exports.adminProcessOrder = onCall({ enforceAppCheck: false }, async (request) => {
    try {
        if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
        const data = request.data || {};
        let { orderId, action, adminNote } = data;
        const safeAdminNote = String(adminNote || '').substring(0, SYSTEM_LIMITS.MAX_NOTE_LENGTH);
        const validActions = ['completed', 'rejected', 'refunded', 'returned', 'processing'];
        if (!validActions.includes(action)) throw new HttpsError('invalid-argument', 'حالة غير صالحة.');
        
        const orderRef = db.collection('telecard_orders').doc(String(orderId));
        let keysAssignedCount = 0;
        let keysBurnedCount = 0;
        let finalMsg = `تم تحديث الطلب إلى ${action}`;

        if (action === 'completed') {
            await db.runTransaction(async (transaction) => {
                const liveOrder = (await transaction.get(orderRef)).data();
                if (!liveOrder) throw new HttpsError('not-found', 'الطلب غير موجود.');
                if (['completed', 'rejected', 'refunded', 'returned'].includes(liveOrder.status)) throw new HttpsError('failed-precondition', 'لا يمكن إكمال طلب تمت معالجته بالفعل.');
                if ((liveOrder.qty || 1) > SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER) throw new HttpsError('failed-precondition', 'تجاوز الحد المسموح للأكواد.');

                let deliveredCodeText = liveOrder.deliveredCode || null;

                if (!liveOrder.deliveredCode) {
                    const prodSnap = await transaction.get(db.collection('telecard_prods').doc(String(liveOrder.prodId)));
                    const prodData = prodSnap.exists ? prodSnap.data() : null;
                    if (prodData && prodData.vaultPoolId) {
                        const vaultRef = db.collection('telecard_vault').doc(String(prodData.vaultPoolId));
                        
                        const vaultSnap = await transaction.get(vaultRef);
                        if (!vaultSnap.exists || (vaultSnap.data().stockCount || 0) < (liveOrder.qty || 1)) {
                            throw new HttpsError('failed-precondition', 'لا توجد أكواد كافية في الخزنة.');
                        }

                        const keysQuerySnap = await transaction.get(vaultRef.collection('keys').where('isSold', '==', false).limit(liveOrder.qty || 1));
                        if (keysQuerySnap.size < (liveOrder.qty || 1)) throw new HttpsError('failed-precondition', 'الرصيد الفعلي للأكواد غير كافٍ الآن.');

                        let selectedDocs = [];
                        keysQuerySnap.forEach(docSnap => selectedDocs.push(docSnap));
                        deliveredCodeText = selectedDocs.map(d => d.data().codeText).join(' | ');

                        selectedDocs.forEach(docSnap => {
                            transaction.update(docSnap.ref, { isSold: true, soldAt: admin.firestore.FieldValue.serverTimestamp(), orderId: orderId, userId: liveOrder.userId });
                            keysAssignedCount++;
                        });
                        transaction.update(vaultRef, { stockCount: admin.firestore.FieldValue.increment(-keysAssignedCount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                    }
                }
                let orderUpdateObj = { status: action, adminNote: safeAdminNote, actionTime: admin.firestore.FieldValue.serverTimestamp() };
                if (keysAssignedCount > 0) orderUpdateObj.deliveredCode = deliveredCodeText;
                transaction.update(orderRef, orderUpdateObj);
            });
            if (keysAssignedCount > 0) finalMsg += ` (وتم تسليم ${keysAssignedCount} كود للعميل).`;

        } else if (['rejected', 'refunded', 'returned'].includes(action)) {
            await db.runTransaction(async (transaction) => {
                const liveOrderSnap = await transaction.get(orderRef);
                if (!liveOrderSnap.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
                const orderData = liveOrderSnap.data();

                if (['rejected', 'refunded', 'returned'].includes(orderData.status)) {
                    throw new HttpsError('failed-precondition', 'تم استرجاع هذا الطلب بالفعل.');
                }

                let poolId = orderData.vaultPoolId;
                let keysToBurn = [];
                
                if (!poolId) {
                    const prodSnap = await transaction.get(db.collection('telecard_prods').doc(String(orderData.prodId)));
                    if (prodSnap.exists) poolId = prodSnap.data().vaultPoolId;
                }

                if (poolId && orderData.deliveredCode) {
                    const vaultRef = db.collection('telecard_vault').doc(String(poolId));
                    const keysQuerySnap = await transaction.get(vaultRef.collection('keys').where('orderId', '==', String(orderId)));
                    keysToBurn = keysQuerySnap.docs;
                }

                const userRef = db.collection('telecard_users').doc(String(orderData.userId));
                const userSnap = await transaction.get(userRef);
                
                let couponSnap = null;
                if (orderData.couponCode) {
                    couponSnap = await transaction.get(db.collection('telecard_coupons').where('code', '==', orderData.couponCode).limit(1));
                }
                
                const tiersSnap = await transaction.get(db.collection('telecard_tiers'));
                const tiersData = tiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                keysToBurn.forEach(keyDoc => {
                    const keyData = keyDoc.data();
                    const burnedKeyRef = db.collection('telecard_vault_returned').doc(keyDoc.id);
                    transaction.set(burnedKeyRef, { ...keyData, isBurned: true, refundedAt: admin.firestore.FieldValue.serverTimestamp(), refundedOrderId: orderId, reason: action, originalPoolId: poolId });
                    transaction.delete(keyDoc.ref);
                    keysBurnedCount++;
                });

                if (poolId && keysBurnedCount > 0) {
                    const vaultRef = db.collection('telecard_vault').doc(String(poolId));
                    transaction.set(vaultRef, { burnedCount: admin.firestore.FieldValue.increment(keysBurnedCount), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                }

                let newWalletBal = 0;            
                if (userSnap.exists) {
                    const ud = userSnap.data();
                    newWalletBal = sanitizeAmount(safeAdd(ud.walletBalance || 0, Number(orderData.price || 0)));
                    let newCycleSpent = ud.tierCycleSpent || 0;
                    let newTierId = ud.tierId;
                    
                    const getMs = (val) => (val && typeof val.toMillis === 'function') ? val.toMillis() : (val instanceof Date ? val.getTime() : 0);
                    const orderTime = getMs(orderData.createdAt);
                    const cycleStart = getMs(ud.tierCycleStartDate);

                    if (orderTime >= cycleStart) {
                        newCycleSpent = sanitizeAmount(safeSub(newCycleSpent, Number(orderData.price || 0)));
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
                    const newTotalSpent = sanitizeAmount(safeSub(ud.totalSpent || 0, Number(orderData.price || 0)));
                    transaction.update(userRef, { walletBalance: newWalletBal, totalSpent: newTotalSpent, tierCycleSpent: newCycleSpent, tierId: newTierId });
                }
                
                if (couponSnap && !couponSnap.empty) transaction.update(couponSnap.docs[0].ref, { usedCount: admin.firestore.FieldValue.increment(-1) });
                transaction.update(orderRef, { status: action, adminNote: safeAdminNote, actionTime: admin.firestore.FieldValue.serverTimestamp(), balanceAfter: newWalletBal });
            });
            
            if (keysBurnedCount > 0) finalMsg += ` (وتم سحب ${keysBurnedCount} كود إلى خزنة التوالف بأمان).`;
        }

        await logAdminAction(request.auth.uid, 'PROCESS_ORDER', `Order: ${orderId}, Action: ${action}`);
        return { success: true, message: finalMsg };

    } catch (error) {
        console.error("🚨 [ADMIN_PROCESS_ORDER_CRASH]:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `خطأ برمجي في السيرفر: ${error.message}`);
    }
});

exports.adminProcessDeposit = onCall({ enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const data = request.data || {};
    let { depositId, action, adminNote } = data;
    const safeAdminNote = String(adminNote || '').substring(0, SYSTEM_LIMITS.MAX_NOTE_LENGTH);
    
    await db.runTransaction(async (transaction) => {
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
                newWalletBal = sanitizeAmount(safeAdd(ud.walletBalance || 0, amt));
                const newTotalDeposit = sanitizeAmount(safeAdd(ud.totalDeposit || 0, amt));
                transaction.set(userRef, { walletBalance: newWalletBal, totalDeposit: newTotalDeposit }, { merge: true });
            } else if ((action === 'refunded' || action === 'rejected') && wasApproved) {
                newWalletBal = sanitizeAmount(strictSub(ud.walletBalance || 0, amt));
                const newTotalDeposit = sanitizeAmount(strictSub(ud.totalDeposit || 0, amt));
                transaction.set(userRef, { walletBalance: newWalletBal, totalDeposit: newTotalDeposit }, { merge: true });
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
    const { userId, type, amount, adminName } = request.data || {};
    const adjustAmount = Number(amount);
    if (isNaN(adjustAmount) || adjustAmount <= 0) throw new HttpsError('invalid-argument', 'المبلغ غير صالح.');

    const userRef = db.collection('telecard_users').doc(String(userId));
    
    const transactionResult = await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');

        const userData = userDoc.data();
        if (userData.isVerified !== true) {
            throw new HttpsError('failed-precondition', 'لا يمكن تعديل الرصيد! العميل لم يكمل إعداد بيانات الحساب وعملة المحفظة الأساسية بعد.');
        }

        const currentBal = Number(userData.walletBalance || 0);
        const newBal = sanitizeAmount(type === 'add' ? safeAdd(currentBal, adjustAmount) : strictSub(currentBal, adjustAmount));
        const newTotalDeposit = sanitizeAmount(type === 'add' ? safeAdd(userData.totalDeposit || 0, adjustAmount) : Math.max(0, strictSub(userData.totalDeposit || 0, adjustAmount)));
        
        let updateObj = { walletBalance: newBal, totalDeposit: newTotalDeposit };
            
        transaction.update(userRef, updateObj);
        
        const depId = generateUniqueId();
        const depositDoc = {
            id: depId, userId, amount: adjustAmount, creditedAmount: type === 'add' ? adjustAmount : -adjustAmount, 
            status: 'approved', method: type === 'add' ? 'إيداع إداري' : 'خصم إداري',
            time: admin.firestore.FieldValue.serverTimestamp(), admin: adminName || 'النظام',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        transaction.set(db.collection('telecard_deposits').doc(depId), depositDoc);
        
        return { depositDoc, newBal }; 
    });

    await logAdminAction(request.auth.uid, 'ADJUST_BALANCE', `User: ${userId}, Type: ${type}, Amount: ${amount}`);
    return { success: true, newBalance: transactionResult.newBal, newDeposit: transactionResult.depositDoc };
});

exports.grantAdminRole = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح لك.');
    const targetEmail = request.data?.email;
    if (!targetEmail) throw new HttpsError('invalid-argument', 'البريد مفقود.');
    try {
        const user = await admin.auth().getUserByEmail(targetEmail);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        await logAdminAction(request.auth?.uid, 'GRANT_ADMIN', `Granted admin to: ${targetEmail}`);
        return { success: true };
    } catch (error) { throw new HttpsError('internal', `فشل المنح: ${error.message}`); }
});

// ==========================================
// 🪪 4. استكمال بيانات الحساب (KYC)
// ==========================================
exports.completeUserIdentity = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    checkBanStatus(request);
    
    const uid = request.auth.uid;
    const { country, phone, currency } = request.data || {};
    
    const safeCountry = String(country || '').trim().substring(0, 100);
    const safePhone = String(phone || '').trim().substring(0, 50);
    const cleanCurrency = String(currency || '').trim().toUpperCase().substring(0, 10);
    
    if (!/^\+?[0-9]{7,15}$/.test(safePhone)) throw new HttpsError('invalid-argument', 'رقم الهاتف غير صالح.');
    
    try {
        return await db.runTransaction(async (transaction) => {
            const userRef = db.collection('telecard_users').doc(uid);
            const userSnap = await transaction.get(userRef);
            
            let userData = userSnap.exists ? userSnap.data() : {
                email: request.auth.token.email || '', fullName: request.auth.token.name || 'عميل جديد', role: 'user',
                walletBalance: 0.0, totalSpent: 0.0, totalDeposit: 0.0, tierId: '1', tierCycleSpent: 0.0,
                tierCycleStartDate: admin.firestore.FieldValue.serverTimestamp(), manualTierOverride: false,
                isBanned: false, isIpBanned: false, createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            if (userData.isVerified === true) throw new HttpsError('permission-denied', 'تم إعداد المحفظة مسبقاً.');
            
            transaction.set(userRef, { 
                ...userData, country: safeCountry, phone: safePhone, baseCurrency: cleanCurrency, 
                isVerified: true, identityCompletedAt: admin.firestore.FieldValue.serverTimestamp() 
            }, { merge: true });
            
            return { success: true, lockedCurrency: cleanCurrency };
        });
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `خطأ في الخادم: ${error.message}`);
    }
});

// ============================================================================
// 📊 5. التوقيت السحابي
// ============================================================================
exports.getServerTime = onCall(() => { return { success: true, serverTime: admin.firestore.Timestamp.now().toMillis() }; });

// ==========================================
// 📦 9. إدارة صناديق الأكواد والتنظيف
// ==========================================
exports.adminSaveVaultCodes = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { poolId, poolName, alertLimit, codesList } = request.data || {};
    if (!Array.isArray(codesList)) throw new HttpsError('invalid-argument', 'قائمة الأكواد غير صالحة.');

    try {
        const vaultRef = db.collection('telecard_vault').doc(String(poolId));
        const rawCodes = codesList.map(c => String(c).trim()).filter(c => c.length > 0);
        const cleanCodes = [...new Set(rawCodes)];
        if (cleanCodes.length === 0) return { success: true, addedCount: 0 };

        const chunks = [];
        for (let i = 0; i < cleanCodes.length; i += 400) chunks.push(cleanCodes.slice(i, i + 400));

        for (const chunk of chunks) {
            const batch = db.batch();
            chunk.forEach(codeText => {
                const keyRef = vaultRef.collection('keys').doc(); 
                batch.set(keyRef, { codeText, isSold: false, addedAt: admin.firestore.FieldValue.serverTimestamp() });
            });
            await batch.commit();
        }

        await vaultRef.set({ 
            id: poolId, name: poolName || 'صندوق أكواد', alertLimit: Number(alertLimit) || 5, 
            stockCount: admin.firestore.FieldValue.increment(cleanCodes.length), updatedAt: admin.firestore.FieldValue.serverTimestamp() 
        }, { merge: true });

        return { success: true, addedCount: cleanCodes.length };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

exports.cleanupOrphanedKycDocs = onSchedule({
    schedule: "0 3 * * 0", timeZone: "UTC", timeoutSeconds: 540, memory: "256MiB", concurrency: 1, maxInstances: 1 
}, async (event) => {
    const bucket = admin.storage().bucket();
    const prefix = 'kyc_docs/';
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    const TIME_LIMIT = 450 * 1000; 

    try {
        let deletedCount = 0, hasMore = true;
        let query = { prefix, maxResults: 150 }; 
        const startTime = Date.now();

        while (hasMore) {
            if (Date.now() - startTime > TIME_LIMIT) break;
            const [files, nextQuery] = await bucket.getFiles(query);
            const deletePromises = files.map(async (file) => {
                if (file.name === prefix) return;
                const [metadata] = await file.getMetadata();
                if (now - new Date(metadata.timeCreated).getTime() > TWENTY_FOUR_HOURS) {
                    const userId = file.name.replace(prefix, '').split('_')[0];
                    if (!userId || userId === 'unknown') { await file.delete(); deletedCount++; return; }
                    
                    const userDoc = await db.collection('telecard_users').doc(userId).get();
                    let isOrphan = true;
                    if (userDoc.exists) {
                        const kData = userDoc.data().kycData || {};
                        const pName = decodeURIComponent(file.name.split('/').pop());
                        if ((kData.frontImg && decodeURIComponent(kData.frontImg).includes(pName)) || 
                            (kData.backImg && decodeURIComponent(kData.backImg).includes(pName)) || 
                            (kData.selfieImg && decodeURIComponent(kData.selfieImg).includes(pName))) isOrphan = false; 
                    }
                    if (isOrphan) { await file.delete(); deletedCount++; }
                }
            });
            await Promise.all(deletePromises);
            if (nextQuery) query = nextQuery; else hasMore = false;
        }
        console.log(`[Storage Cleanup] Deleted ${deletedCount} files.`);
    } catch (error) { console.error("[Storage Cleanup Error]:", error); }
});

// ==========================================
// 🔗 11. المزامنة والتريجرات الخاصة بالكاش (Cache Auto-Sync)
// ==========================================
exports.onSettingsUpdate = onDocumentUpdated({ document: 'telecard_settings/singleton', memory: "256MiB", concurrency: 1 }, async () => { await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true }); });

exports.onOfferUpdate = onDocumentWritten({ document: 'telecard_offers/{offerId}', memory: "256MiB", concurrency: 1 }, async () => { 
    await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true }); 
    await buildPricingCache();
});

exports.onRateUpdate = onDocumentWritten({ document: 'telecard_rates/{rateId}', memory: "256MiB", concurrency: 1 }, async () => { 
    await buildConfigCache();
});
exports.onPaymentUpdate = onDocumentWritten({ document: 'telecard_payments/{paymentId}', memory: "256MiB", concurrency: 1 }, async () => { 
    await buildConfigCache();
});

exports.secureProductSync = onDocumentWritten({ document: 'telecard_prods/{productId}', retry: true }, async (event) => {
    const publicProdRef = db.collection('telecard_prods_public').doc(event.params.productId);
    if (!event.data.after.exists) return publicProdRef.delete(); 
    const prodData = event.data.after.data();
    if (prodData.isActive === false || String(prodData.isAvailable) === 'false') return publicProdRef.delete();
    const tiersSnap = await db.collection('telecard_tiers').get();
    const tiersData = tiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    return publicProdRef.set(generatePublicProductData(prodData, tiersData), { merge: true });
});

exports.onTierUpdate = onDocumentUpdated({ document: 'telecard_tiers/{tierId}', timeoutSeconds: 540 }, async (event) => {
    await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true });
    
    const fallback = await buildPricingCache(); 
    
    const oldTier = event.data.before.data(); 
    const newTier = event.data.after.data();
    if ((oldTier.profit_percent ?? oldTier.profitPercent) === (newTier.profit_percent ?? newTier.profitPercent) && 
        (oldTier.min_profit_usd ?? oldTier.minProfitUsd) === (newTier.min_profit_usd ?? newTier.minProfitUsd)) return null;
    
    const activeProdsStream = db.collection('telecard_prods').where('isActive', '==', true).stream();
    let currentBatch = db.batch(), opCount = 0, totalUpdated = 0;
    
    for await (const doc of activeProdsStream) {
        const prodData = doc.data();
        if (String(prodData.isFixedPrice).toLowerCase() === 'true') continue;
        currentBatch.set(db.collection('telecard_prods_public').doc(doc.id), generatePublicProductData(prodData, fallback.tiers), { merge: true });
        totalUpdated++; opCount++;
        
        if (opCount >= 400) { 
            await currentBatch.commit(); 
            currentBatch = db.batch(); 
            opCount = 0; 
        }
    }
    if (opCount > 0) await currentBatch.commit();
    return { success: true, updatedProductsCount: totalUpdated };
});

exports.autoNotifyOrderStatus = onDocumentWritten({ document: 'telecard_orders/{orderId}', retry: true }, async (event) => {
    if (!event.data.after.exists) return null;
    const after = event.data.after.data();
    const before = event.data.before.exists ? event.data.before.data() : null;
    if (before && before.status === after.status) return null;
    if (!before && (after.status === 'pending' || after.status === 'processing')) return null;

    let title = "تحديث طلب", message = `تم تغيير حالة الطلب إلى ${after.status}`;
    if (after.status === 'completed') { title = "🎉 طلبك جاهز!"; message = `تم تسليم ( ${after.product} ).`; } 
    else if (after.status === 'rejected') { title = "❌ طلب مرفوض"; message = `رفض الطلب: ${after.adminNote || 'راجع الدعم'}`; } 
    else if (after.status === 'refunded') { title = "↩️ استرجاع قيمة"; message = `تم استرجاع الرصيد بنجاح.`; }

    const notifId = `notif_${event.params.orderId}_${after.status}`;
    return db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({ id: notifId, title, message, type: 'notification', jumpTarget: 'order', createdAt: admin.firestore.FieldValue.serverTimestamp() });
});

exports.autoNotifyDepositStatus = onDocumentWritten({ document: 'telecard_deposits/{depositId}', retry: true }, async (event) => {
    if (!event.data.after.exists) return null;
    const after = event.data.after.data();
    const before = event.data.before.exists ? event.data.before.data() : null;
    if (before && before.status === after.status) return null;
    if (!before && after.status === 'pending') return null;

    let title = "تحديث الإيداع", message = `الحالة: ${after.status}`;
    const displayAmt = after.creditedAmount !== undefined ? after.creditedAmount : after.amount;
    
    if (after.status === 'approved') { title = "💰 رصيد جديد"; message = `تم إضافة ${displayAmt} لمحفظتك.`; } 
    else if (after.status === 'rejected') { title = "❌ إيداع مرفوض"; message = `السبب: ${after.adminNote || 'تواصل معنا'}`; } 
    else if (after.status === 'refunded') { title = "↩️ إيداع مسترجع"; message = `تم سحب ${displayAmt} من محفظتك.`; }

    const notifId = `notif_${event.params.depositId}_${after.status}`;
    return db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({ id: notifId, title, message, type: 'notification', jumpTarget: 'wallet', createdAt: admin.firestore.FieldValue.serverTimestamp() });
});

// ==========================================
// 🛠️ 12. دوال مساندة للوحة التحكم (المسترجعة للواجهة)
// ==========================================

exports.adminForceSyncPricing = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try {
        await buildPricingCache();
        await buildConfigCache(); 
        await logAdminAction(request.auth.uid, 'FORCE_SYNC_PRICING', `Admin forced cache rebuild.`);
        return { success: true, message: 'تم إعادة بناء الكاش بنجاح.' };
    } catch (error) { throw new HttpsError('internal', `فشل الترميم اليدوي: ${error.message}`); }
});

// 🚀 التحديث 2: Cursor Pagination Fix (إضافة orderBy لمنع انهيار Firestore)
exports.adminForceSyncCatalog = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try {
        const fallback = await buildPricingCache();
        let lastDoc = null;
        let syncCount = 0;
        let hasMore = true;

        while (hasMore) {
            let query = db.collection('telecard_prods')
                .where('isActive', '==', true)
                .orderBy(admin.firestore.FieldPath.documentId()) 
                .limit(300);
                
            if (lastDoc) query = query.startAfter(lastDoc);

            const snapshot = await query.get();
            if (snapshot.empty) {
                hasMore = false;
                break;
            }

            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                const prodData = doc.data();
                if (String(prodData.isAvailable) !== 'false') {
                    const publicRef = db.collection('telecard_prods_public').doc(doc.id);
                    batch.set(publicRef, generatePublicProductData(prodData, fallback.tiers), { merge: true });
                    syncCount++;
                }
                lastDoc = doc; 
            });

            await batch.commit(); 
            
            await new Promise(resolve => setTimeout(resolve, 50)); 
        }

        await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true });
        return { success: true, message: `تمت مزامنة ${syncCount} منتج باحترافية وبدون ضغط على السيرفر!` };
    } catch (error) { throw new HttpsError('internal', `فشل المزامنة: ${error.message}`); }
});

exports.adminDeleteVaultPool = onCall({ timeoutSeconds: 540 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const poolId = String(request.data?.poolId || '');
    if (!poolId) throw new HttpsError('invalid-argument', 'رقم الخزنة مفقود.');
    
    try {
        const vaultRef = db.collection('telecard_vault').doc(poolId);
        const soldKeysSnap = await vaultRef.collection('keys').where('isSold', '==', true).limit(1).get();
        if (!soldKeysSnap.empty) throw new HttpsError('failed-precondition', 'لا يمكن حذف الخزنة! توجد أكواد تم بيعها.');

        const keysRef = vaultRef.collection('keys');
        const archiveRef = db.collection('telecard_vault_archived');
        let hasMore = true, archivedCount = 0;

        while (hasMore) {
            const snapshot = await keysRef.limit(200).get(); 
            if (snapshot.empty) { hasMore = false; break; }
            const batch = db.batch();
            
            snapshot.docs.forEach(doc => {
                batch.set(archiveRef.doc(doc.id), { ...doc.data(), archivedAt: admin.firestore.FieldValue.serverTimestamp(), originalPoolId: poolId, reason: 'pool_deleted_by_admin' });
                batch.delete(doc.ref);
                archivedCount++;
            });
            await batch.commit();
        }
        await vaultRef.delete();
        await logAdminAction(request.auth.uid, 'DELETE_VAULT_POOL', `Deleted Pool: ${poolId}`);
        return { success: true, archivedKeys: archivedCount };
    } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('internal', error.message); }
});

exports.adminToggleUserBan = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { targetUid, isBanned, reason } = request.data || {};
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

exports.adminDeleteUserData = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { targetUid } = request.data || {};
    if (!targetUid) throw new HttpsError('invalid-argument', 'المعرف مفقود.');
    try {
        try { await admin.auth().deleteUser(targetUid); } 
        catch (authError) { if (authError.code !== 'auth/user-not-found') throw new HttpsError('internal', authError.message); }
        
        await db.collection('telecard_users').doc(targetUid).update({
            email: `deleted_${targetUid.substring(0, 5)}@system.local`, fullName: 'حساب محذوف', firstName: 'محذوف', lastName: '', 
            phone: '---', country: '---', isDeleted: true, isBanned: true, banReason: 'Deleted by Admin', 
            manualTierOverride: true, deletedAt: admin.firestore.FieldValue.serverTimestamp()
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

exports.adminAuditUserWallet = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const targetUserId = String(request.data?.userId || '');
    if (!targetUserId) throw new HttpsError('invalid-argument', 'رقم العميل مفقود.');
    
    try {
        const userRef = db.collection('telecard_users').doc(targetUserId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) throw new HttpsError('not-found', 'العميل غير موجود.');

        const AggregateField = admin.firestore.AggregateField;
        const [ordersAgg, depApprovedAgg] = await Promise.all([
            db.collection('telecard_orders').where('userId', '==', targetUserId).where('status', 'in', ['completed', 'pending', 'processing']).aggregate({ totalSpent: AggregateField.sum('price') }).get(),
            db.collection('telecard_deposits').where('userId', '==', targetUserId).where('status', '==', 'approved').aggregate({ totalDep: AggregateField.sum('creditedAmount') }).get()
        ]);

        const realTotalDeposit = sanitizeAmount(depApprovedAgg.data().totalDep || 0); 
        const realTotalSpent = sanitizeAmount(ordersAgg.data().totalSpent || 0);
        const expectedBalance = sanitizeAmount(strictSub(realTotalDeposit, realTotalSpent)); 

        await userRef.update({ totalSpent: realTotalSpent, totalDeposit: realTotalDeposit, walletBalance: expectedBalance });
        return { success: true, data: { spent: realTotalSpent, deposit: realTotalDeposit, balance: expectedBalance } };
    } catch (error) { throw new HttpsError('internal', `فشل التدقيق: ${error.message}`); }
});

// ==========================================
// 🔌 13. الروابط الخارجية للواجهات البرمجية (APIs)
// ==========================================
Object.defineProperty(exports, "orderStatusWebhook", { enumerable: true, get: () => require('./developerApi.js').orderStatusWebhook });
Object.defineProperty(exports, "cronRetryWebhooks", { enumerable: true, get: () => require('./developerApi.js').cronRetryWebhooks });
Object.defineProperty(exports, "externalCreateOrder", { enumerable: true, get: () => require('./developerApi.js').externalCreateOrder });
Object.defineProperty(exports, "syncSupplierData", { enumerable: true, get: () => require('./supplierEngine.js').syncSupplierData });
Object.defineProperty(exports, "scheduledSupplierSync", { enumerable: true, get: () => require('./supplierEngine.js').scheduledSupplierSync });
Object.defineProperty(exports, "secureSaveSupplier", { enumerable: true, get: () => require('./supplierEngine.js').secureSaveSupplier });
