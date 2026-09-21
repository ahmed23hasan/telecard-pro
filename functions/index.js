// ============================================================================
// 🧠 المحرك الرئيسي (functions/index.js) لـ TeleCard - النسخة الماسية V30.22.0 👑
// 🎯 تم تصميم هذا النظام ليكون "محصناً" ضد ثغرات التزامن (Concurrency) وتلاعب البيانات.
// 🚀 التحديثات المعمارية (V30.22.0 - The Ultimate Architecture Patch):
// 1. Point-Reads BI Aggregator 📊: محرك إحصائيات متزامن فائق السرعة يمنع استنزاف القراءات.
// 2. Orphaned Codes Rescue 🛡️: تفكيك الأكواد وإنقاذها للأرشيف عند حذف الصندوق الأصلي.
// 3. Stateless Pagination 📄: تصفح لوحة التحكم يعتمد على (time+id) لمنع انهيار الـ Cursors.
// 4. FCM Critical Logging 🚨: رصد أخطاء تصاريح الإشعارات السحابية دون إزعاج بالتوكنز المنتهية.
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { setGlobalOptions } = require("firebase-functions/v2");

// 🌐 [السيادة الجغرافية والتحكم الذكي في الموارد]
setGlobalOptions({
    region: 'us-central1',
    maxInstances: 20, 
    concurrency: 80
});

const admin = require('firebase-admin');
const functions = require('firebase-functions/v1');
const { FinancialSecurityError, ...FinancialEngine } = require('./financialEngine.js');
const SecurityEngine = require('./securityEngine.js'); 

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const SYSTEM_LIMITS = {
    MAX_QTY_PER_ORDER: 10000,
    MAX_VAULT_QTY_PER_ORDER: 100, 
    MAX_SAFE_AMOUNT: 100000000,
    MAX_URL_LENGTH: 1000,
    MAX_NOTE_LENGTH: 500
};

const MATH_EPSILON = 0.0001;

// ==========================================
// 🛡️ دوال المساعدة الشاملة والرياضيات الآمنة 
// ==========================================

const sanitizeAmount = (amount) => FinancialEngine.sanitizeAmount(amount);
const safeAdd = (a, b) => FinancialEngine.safeAdd(a, b);
const safeSub = (a, b) => Math.max(0, FinancialEngine.safeSub(a, b));
const strictSub = (a, b) => FinancialEngine.safeSub(a, b); 
const getStartOfUTCDay = (timestampMs) => FinancialEngine.getStartOfUTCDay(timestampMs);

const generatePublicProductData = (prodData, tiersData) => {
    const publicData = {};
    const ALLOWED_PRODUCT_KEYS = [
        'id', 'name', 'description', 'image', 'options', 'isActive', 'isAvailable',
        'category', 'sortOrder', 'type', 'isFixedPrice', 'minQty', 'maxQty', 'badge'
    ];
    
    ALLOWED_PRODUCT_KEYS.forEach(k => { 
        if (prodData[k] !== undefined) {
            const val = prodData[k];
            publicData[k] = (val === null || typeof val !== 'object') ? val : SecurityEngine.safeClone(val); 
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
                    const val = opt[k];
                    optClean[k] = (val === null || typeof val !== 'object') ? val : SecurityEngine.safeClone(val);
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

// ==========================================
// 🛡️ 0. إنشاء الحساب
// ==========================================
exports.onUserAuthCreated = functions
    .runWith({ failurePolicy: true })
    .auth.user().onCreate(async (user) => {
        try {
            const userRef = db.collection('telecard_users').doc(user.uid);
            
            let initialTierId = 'TIER_DEFAULT'; 
            let durationDays = 3650;
            
            const defaultTierSnap = await db.collection('telecard_tiers').where('isDefault', '==', true).limit(1).get();
            
            if (!defaultTierSnap.empty) {
                initialTierId = defaultTierSnap.docs[0].id;
                durationDays = defaultTierSnap.docs[0].data().durationDays || 30;
            } else {
                const fallbackTierRef = db.collection('telecard_tiers').doc(initialTierId);
                const fallbackTierCheck = await fallbackTierRef.get();
                if (!fallbackTierCheck.exists) {
                    await fallbackTierRef.set({
                        id: initialTierId, name: 'عضو جديد', isDefault: true, threshold: 0,
                        durationDays: 3650, profitPercent: 5, autoAdvance: true,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    durationDays = fallbackTierCheck.data().durationDays || 3650;
                }
            }
            
            const emailPrefix = user.email ? user.email.split('@')[0] : 'user';
            const rawName = user.displayName || emailPrefix;
            const firstName = rawName.split(' ')[0];
            const fallbackUsername = firstName.toLowerCase().replace(/\s+/g, '') + user.uid.substring(0, 4);
            
            const initialProfile = {
                id: user.uid, uid: user.uid, email: user.email || '', fullName: rawName,
                firstName: firstName, username: fallbackUsername, role: 'user',
                walletBalance: 0.0, totalSpent: 0.0, totalDeposit: 0.0, tierId: initialTierId,
                tierCycleSpent: 0.0, manualTierOverride: false, isBanned: false, isIpBanned: false,
                baseCurrency: 'USD', isVerified: false, kycStatus: 'none',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                tierCycleStartDate: admin.firestore.FieldValue.serverTimestamp(),
                tierExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + durationDays * 24 * 60 * 60 * 1000)
            };
            
            try {
                await userRef.create(initialProfile);
            } catch (writeError) {
                if (writeError.code === 6 || String(writeError.message).includes('ALREADY_EXISTS')) {
                    await userRef.set({ role: 'user', walletBalance: 0.0, isBanned: false }, { merge: true });
                } else { throw writeError; }
            }
        } catch (error) { console.error("Auth Trigger Error:", error); return null; }
    });

// ==========================================
// 🛒 1. إنشاء الطلبات للعملاء (Concurrency Shield + B2C Retry Loop)
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
    let finalQty = Math.max(1, Math.min(SYSTEM_LIMITS.MAX_QTY_PER_ORDER, requestedQty)); 
    
    let optIdx = null;
    if (data.optIdx !== null && data.optIdx !== undefined && String(data.optIdx).trim() !== '') {
        const parsedOptIdx = Number(data.optIdx);
        if (!Number.isNaN(parsedOptIdx) && parsedOptIdx >= 0) optIdx = Math.floor(parsedOptIdx);
        else throw new HttpsError('invalid-argument', 'الخيار غير صالح.');
    }
    
    const finalInputStr = SecurityEngine.sanitizeText(String(data.finalInputStr || '---'), 500);
    const couponCode = data.couponCode ? String(data.couponCode).trim() : null;
    const idempotencyKey = data.idempotencyKey ? String(data.idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50) : null;
    
    if (data.expectedBasePrice === undefined || isNaN(Number(data.expectedBasePrice))) {
        throw new HttpsError('invalid-argument', 'بيانات التسعيير الأساسية مفقودة أو تم التلاعب بها.');
    }
    const expectedBasePrice = Number(data.expectedBasePrice);

    if (data.expectedDisplayPrice === undefined || isNaN(Number(data.expectedDisplayPrice))) {
        throw new HttpsError('invalid-argument', 'بيانات التسعير المرئي مفقودة أو تم التلاعب بها.');
    }
    const expectedDisplayPrice = Number(data.expectedDisplayPrice);

    if (!productId) throw new HttpsError('invalid-argument', 'رقم المنتج مفقود.');
    
    const cleanOrderId = SecurityEngine.generateUniqueId();
    
    const requestPayloadString = `${productId}|${finalQty}|${optIdx}|${finalInputStr}|${expectedBasePrice}|${expectedDisplayPrice}`;
    const requestHash = SecurityEngine.generateSha256Hash(requestPayloadString);

    let finalResultData = null;

    try {
        finalResultData = await SecurityEngine.withCollisionRetry(3, 'CreateOrder', async () => {
            const productRef = db.collection('telecard_prods').doc(productId);
            const productOutSnap = await productRef.get();
            
            if (!productOutSnap.exists) throw new HttpsError('not-found', 'المنتج غير متوفر.');
            const productOut = productOutSnap.data();

            if (productOut.isActive === false || String(productOut.isAvailable) === 'false') {
                throw new HttpsError('failed-precondition', 'المنتج غير متاح حالياً.');
            }

            if (productOut.vaultPoolId) finalQty = Math.min(finalQty, SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER);

            let candidateKeyDocs = [];
            let vaultRef = null;

            if (productOut.vaultPoolId) {
                vaultRef = db.collection('telecard_vault').doc(String(productOut.vaultPoolId));
                
                const poolLimit = finalQty + 100; 
                const keysQuerySnap = await vaultRef.collection('keys')
                    .where('isSold', '==', false)
                    .limit(poolLimit)
                    .get();

                if (keysQuerySnap.size < finalQty) {
                    throw new HttpsError('failed-precondition', 'الأكواد المتوفرة حالياً أقل من المطلوب.');
                }
                
                const shuffledDocs = keysQuerySnap.docs.sort(() => 0.5 - Math.random());
                candidateKeyDocs = shuffledDocs.slice(0, finalQty);
            }

            return await db.runTransaction(async (transaction) => {
                const serverNow = admin.firestore.Timestamp.now().toMillis();

                let idempotencyRef = null;
                if (idempotencyKey) {
                    idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
                    const idempSnap = await transaction.get(idempotencyRef);
                    
                    if (idempSnap.exists) {
                        const expMs = idempSnap.data().expiresAt?.toMillis ? idempSnap.data().expiresAt.toMillis() : 0;
                        
                        if (expMs > serverNow) {
                            if (idempSnap.data().requestHash !== requestHash) {
                                throw new HttpsError('already-exists', 'تضارب في مفتاح منع التكرار: تفاصيل الطلب مختلفة.');
                            }
                            return idempSnap.data().resultData; 
                        }
                    }
                }

                const userRef = db.collection('telecard_users').doc(uid);
                
                const [userSnap, liveProdSnap] = await Promise.all([
                    transaction.get(userRef),
                    transaction.get(productRef)
                ]);

                if (!liveProdSnap.exists) throw new HttpsError('not-found', 'المنتج غير متوفر.');
                const product = liveProdSnap.data();

                const { ratesData, tiersData, liveOffers } = await FinancialEngine.fetchSystemData(transaction, db);

                let verifiedKeyDocs = [];
                if (vaultRef && candidateKeyDocs.length > 0) {
                    const keyRefs = candidateKeyDocs.map(doc => doc.ref);
                    const keySnaps = await transaction.getAll(...keyRefs); 
                    
                    const hasCollision = keySnaps.some(k => !k.exists || k.data().isSold === true);
                    if (hasCollision) throw new Error('CONTENTION_COLLISION_RETRY');
                    
                    verifiedKeyDocs = keySnaps;
                }

                let userData = userSnap.exists ? userSnap.data() : {
                    email: request.auth.token.email || '', fullName: request.auth.token.name || 'عميل جديد', role: 'user',
                    walletBalance: 0.0, totalSpent: 0.0, tierId: tiersData.find(t => t.isDefault)?.id || 'TIER_DEFAULT', tierCycleSpent: 0.0, 
                    manualTierOverride: false, isBanned: false, isVerified: false, kycStatus: 'none', baseCurrency: 'USD'
                };

                if (userData.isBanned === true) throw new HttpsError('permission-denied', 'العملية مرفوضة.');
                if (userData.isVerified !== true) throw new HttpsError('failed-precondition', 'يجب استكمال إعداد حسابك أولاً.');

                const safeExpiry = (exp) => exp ? (typeof exp.toMillis === 'function' ? exp.toMillis() : new Date(exp).getTime()) : 0;
                let activeOffer = liveOffers.find(off => 
                    (safeExpiry(off.expiryDate) === 0 || safeExpiry(off.expiryDate) > serverNow) &&
                    (!off.targetProds || off.targetProds.length === 0 || off.targetProds.includes(productId))
                );
                
                let currentCouponData = null, couponRef = null; 
                let pricingSnapshot = null; 

                let activeTierObj = FinancialEngine.getUserTier(userData, tiersData);
                const cycleStartMs = FinancialEngine.parseSafeTime(userData.tierCycleStartDate || serverNow);
                const daysPassed = (getStartOfUTCDay(serverNow) - getStartOfUTCDay(cycleStartMs)) / (24 * 60 * 60 * 1000);
                
                if (daysPassed > Number(activeTierObj?.durationDays || 30) && userData.manualTierOverride !== true) { 
                    activeTierObj = tiersData.find(t => t.isDefault) || activeTierObj; 
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

                if (pricingSnapshot.isFirewallViolated) throw new HttpsError('permission-denied', pricingSnapshot.rejectionReason || 'العملية مرفوضة لحماية رأس المال.');

                const exactBaseUsdPrice = pricingSnapshot.totalFinalPrice; 
                if (exactBaseUsdPrice <= 0) throw new HttpsError('permission-denied', 'غير مسموح بشراء منتجات بصفر.');

                if (Math.abs(exactBaseUsdPrice - expectedBasePrice) > MATH_EPSILON) {
                    throw new HttpsError('failed-precondition', 'هناك عدم تطابق في تسعير المنتج الأساسي.');
                }

                const userWalletCurrency = String(userData.baseCurrency || 'USD').toUpperCase();
                let exactLocalPrice = exactBaseUsdPrice;

                if (userWalletCurrency !== 'USD') {
                    exactLocalPrice = FinancialEngine.convertViaUSDHelper(exactBaseUsdPrice, 'USD', userWalletCurrency, ratesData, 'round', 'pricing');
                }

                const displayDifference = Math.abs(exactLocalPrice - expectedDisplayPrice);
                const toleranceMargin = exactLocalPrice * 0.005;
                if (displayDifference > toleranceMargin) {
                    throw new HttpsError('aborted', 'عذراً، تغيرت أسعار الصرف، يرجى تحديث الصفحة لمراجعة السعر الجديد.');
                }

                const currentLocalBalance = Number(userData.walletBalance || 0);
                if (exactLocalPrice < 0 || currentLocalBalance < exactLocalPrice) throw new HttpsError('failed-precondition', 'رصيدك غير كافٍ.');

                let deliveredCodeText = null, isAutoDelivered = false;

                if (vaultRef && verifiedKeyDocs.length > 0) {
                    verifiedKeyDocs.forEach(docSnap => {
                        transaction.update(docSnap.ref, { isSold: true, soldAt: admin.firestore.FieldValue.serverTimestamp(), orderId: cleanOrderId, userId: uid });
                    });
                    transaction.update(vaultRef, { stockCount: admin.firestore.FieldValue.increment(-finalQty), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                    deliveredCodeText = verifiedKeyDocs.map(d => d.data().codeText).join(' | ');
                    isAutoDelivered = true;
                }

                if (currentCouponData && couponRef) transaction.update(couponRef, { usedCount: admin.firestore.FieldValue.increment(1) });

                const newLocalBalance = sanitizeAmount(safeSub(currentLocalBalance, exactLocalPrice));
                
                let userUpdateObj = { 
                    walletBalance: newLocalBalance,
                    lastOrderTime: serverNow
                };

                if (isAutoDelivered) {
                    const upgradeResult = FinancialEngine.processTierUpgrade(userData, tiersData, exactBaseUsdPrice, serverNow);
                    
                    userUpdateObj.totalSpent = upgradeResult.newTotalSpentUsd;
                    userUpdateObj.tierCycleSpent = upgradeResult.newTierCycleSpentUsd;
                    userUpdateObj.tierId = upgradeResult.finalTierId;
                    
                    if (upgradeResult.shouldUpdateCycleStart) {
                        userUpdateObj.tierCycleStartDate = admin.firestore.FieldValue.serverTimestamp();
                        const newTier = tiersData.find(t => t.id === upgradeResult.finalTierId) || activeTierObj;
                        const durationDays = newTier?.durationDays || 30;
                        userUpdateObj.tierExpiresAt = admin.firestore.Timestamp.fromMillis(serverNow + durationDays * 24 * 60 * 60 * 1000);
                    }
                }
                
                if (userSnap.exists) transaction.update(userRef, userUpdateObj);
                else transaction.set(userRef, { ...userData, ...userUpdateObj });

                const orderDocData = {
                    id: cleanOrderId, displayId: cleanOrderId, userId: uid, 
                    userDataSnapshot: {
                        fullName: SecurityEngine.sanitizeText(userData.fullName || 'عميل', 100),
                        email: userData.email || '',
                        phone: userData.phone || '',
                        tierId: activeTierObj.id || 'TIER_DEFAULT',
                        baseCurrency: userWalletCurrency
                    },
                    prodId: productId, product: product.name,
                    vaultPoolId: product.vaultPoolId || null,
                    price: sanitizeAmount(exactLocalPrice), 
                    priceLocalDeducted: sanitizeAmount(exactLocalPrice), 
                    priceBaseUsd: sanitizeAmount(exactBaseUsdPrice),
                    priceCurrency: userWalletCurrency,
                    qty: finalQty, status: isAutoDelivered ? 'completed' : 'pending',
                    deliveredCode: deliveredCodeText, tierName: pricingSnapshot.tierName, input: finalInputStr,
                    pricingSnapshot: { costUsd: pricingSnapshot.totalCostUsd || 0, netProfitUsd: pricingSnapshot.totalNetProfitUsd || 0, couponCode: pricingSnapshot.couponCode || null, offerName: pricingSnapshot.offerName || null },
                    time: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp()
                };

                transaction.set(db.collection('telecard_orders').doc(cleanOrderId), orderDocData);
                
                const txResultData = { success: true, isAutoDelivered, deliveredCode: deliveredCodeText };

                if (idempotencyRef) {
                    transaction.set(idempotencyRef, { 
                        createdAt: admin.firestore.FieldValue.serverTimestamp(), 
                        expiresAt: admin.firestore.Timestamp.fromDate(new Date(serverNow + 48 * 60 * 60 * 1000)), 
                        orderId: cleanOrderId,
                        requestHash: requestHash, 
                        resultData: txResultData 
                    });
                }
                return txResultData;
            });
        });

    } catch (error) {
        if (error.message && error.message.includes('HIGH_TRAFFIC_COLLISION')) {
            throw new HttpsError('resource-exhausted', 'يوجد ضغط شديد على شراء هذا المنتج حالياً، يرجى المحاولة بعد قليل.');
        } else if (error instanceof HttpsError) {
            throw error;
        } else {
            console.error("🚨 [CRITICAL_ORDER_ERROR]:", error); 
            throw new HttpsError('internal', 'حدث خطأ غير متوقع في الخادم، يرجى المحاولة لاحقاً.'); 
        }
    }

    if (finalResultData) return finalResultData;
    throw new HttpsError('resource-exhausted', 'النظام مشغول جداً، يرجى المحاولة لاحقاً.');
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
    const idempotencyKey = data.idempotencyKey ? String(data.idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50) : null;
    
    if (isNaN(amount) || amount <= 0 || amount > SYSTEM_LIMITS.MAX_SAFE_AMOUNT) throw new HttpsError('out-of-range', 'المبلغ المدخل غير صالح.');
    const receiptUrl = data.receiptUrl ? String(data.receiptUrl).trim() : null;
    if (receiptUrl && receiptUrl.length > SYSTEM_LIMITS.MAX_URL_LENGTH) throw new HttpsError('invalid-argument', 'الرابط طويل جداً.');

    let idempotencyRef = null;
    if (idempotencyKey) {
        idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
    }

    try {
        return await db.runTransaction(async (transaction) => {
            const serverNow = admin.firestore.Timestamp.now().toMillis();

            if (idempotencyRef) {
                const idempSnap = await transaction.get(idempotencyRef);
                if (idempSnap.exists) throw new HttpsError('already-exists', 'تم إرسال الطلب مسبقاً.');
            }

            const userRef = db.collection('telecard_users').doc(uid);
            const settingsRef = db.collection('telecard_settings').doc('singleton');

            const [userSnap, settingsSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(settingsRef)
            ]);

            const { ratesData, paymentsData } = await FinancialEngine.fetchSystemData(transaction, db);

            const paymentMethod = paymentsData.find(p => p.name === paymentMethodName);
            if (!paymentMethod) throw new HttpsError('not-found', 'طريقة الدفع غير متوفرة.');

            let userData = userSnap.exists ? userSnap.data() : {
                email: request.auth.token.email || '', fullName: request.auth.token.name || 'عميل جديد', role: 'user',
                walletBalance: 0.0, baseCurrency: 'USD', isBanned: false, isVerified: false
            };

            if (userData.isBanned === true) throw new HttpsError('permission-denied', 'العملية مرفوضة.');
            if (userData.isVerified !== true) throw new HttpsError('failed-precondition', 'يجب استكمال إعداد حسابك أولاً.');
            
            const targetWalletCurrency = String(userData.baseCurrency || 'USD').toUpperCase();
            const globalSettings = settingsSnap.exists ? settingsSnap.data() : {};
            
            const depositValidation = FinancialEngine.calculateDepositFee(amount, paymentMethod, payCurr, targetWalletCurrency, ratesData, globalSettings);
            
            if (!depositValidation.isValid) throw new HttpsError('out-of-range', depositValidation.msg);
            
            const safeNetLocal = depositValidation.netBase; 
            
            let safeNetBaseUsd = safeNetLocal;
            if (targetWalletCurrency !== 'USD') {
                safeNetBaseUsd = FinancialEngine.convertViaUSDHelper(safeNetLocal, targetWalletCurrency, 'USD', ratesData, 'round', 'deposit');
            }
            
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
            if (payCurr !== targetWalletCurrency && netPayCurrTemp > 0) {
                fxRateUsed = FinancialEngine.safeDiv(safeNetLocal, netPayCurrTemp);
            }

            const cleanId = SecurityEngine.generateUniqueId(); 
            
            if (userSnap.exists) transaction.update(userRef, { lastDepositReqTime: serverNow });
            else transaction.set(userRef, { ...userData, lastDepositReqTime: serverNow });
            
            transaction.set(db.collection('telecard_deposits').doc(cleanId), {
                id: cleanId, displayId: cleanId, userId: uid, method: paymentMethodName, amount, currency: payCurr, 
                creditedAmount: sanitizeAmount(safeNetLocal), 
                creditedBaseUsd: sanitizeAmount(safeNetBaseUsd), 
                targetCurrency: targetWalletCurrency, fxRate: fxRateUsed, status: 'pending', 
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
            
            const durationDays = tierSnap.exists ? (tierSnap.data().durationDays || 30) : 30;
            
            transaction.update(userRef, { 
                tierId: String(newTierId), 
                manualTierOverride: Boolean(manualOverride), 
                tierCycleStartDate: admin.firestore.FieldValue.serverTimestamp(), 
                tierExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + durationDays * 24 * 60 * 60 * 1000),
                tierCycleSpent: 0 
            });
        });
        await logAdminAction(request.auth.uid, 'CHANGE_TIER', `User: ${userId}, New Tier: ${newTierId}`);
        return { success: true, message: 'تم تحديث المستوى بأمان.' };
    } catch (error) { throw new HttpsError('internal', `فشل التحديث: ${error.message}`); }
});

exports.adminProcessOrder = onCall({ enforceAppCheck: false }, async (request) => {
    try {
        if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
        const data = request.data || {};
        let { orderId, action, adminNote } = data;
        
        const safeAdminNote = SecurityEngine.sanitizeText(String(adminNote || ''), SYSTEM_LIMITS.MAX_NOTE_LENGTH);
        
        const validActions = ['completed', 'rejected', 'refunded', 'returned', 'processing'];
        if (!validActions.includes(action)) throw new HttpsError('invalid-argument', 'حالة غير صالحة.');
        
        const orderRef = db.collection('telecard_orders').doc(String(orderId));
        let keysAssignedCount = 0, keysBurnedCount = 0, keysRestoredCount = 0;
        let finalMsg = `تم تحديث الطلب إلى ${action}`;

        try {
            await SecurityEngine.withCollisionRetry(2, 'AdminProcessOrder', async () => {
                let candidateKeyDocs = [];
                let vaultRef = null;
                const initialOrderSnap = await orderRef.get();
                
                if (initialOrderSnap.exists) {
                    const ord = initialOrderSnap.data();
                    if (action === 'completed' && !ord.deliveredCode && !['completed', 'rejected', 'refunded', 'returned'].includes(ord.status)) {
                        let poolId = ord.vaultPoolId;
                        if (!poolId) {
                            const pSnap = await db.collection('telecard_prods').doc(String(ord.prodId)).get();
                            if (pSnap.exists) poolId = pSnap.data().vaultPoolId;
                        }
                        if (poolId) {
                            vaultRef = db.collection('telecard_vault').doc(String(poolId));
                            const limitToFetch = (ord.qty || 1) + 100; 
                            const keysQuerySnap = await vaultRef.collection('keys').where('isSold', '==', false).limit(limitToFetch).get();
                            
                            if (keysQuerySnap.size < (ord.qty || 1)) {
                                throw new HttpsError('failed-precondition', 'لا توجد أكواد كافية في الخزنة حالياً لتلبية الطلب.');
                            }
                            const shuffledDocs = keysQuerySnap.docs.sort(() => 0.5 - Math.random());
                            candidateKeyDocs = shuffledDocs.slice(0, ord.qty || 1);
                        }
                    }
                }

                await db.runTransaction(async (transaction) => {
                    keysAssignedCount = 0; keysBurnedCount = 0; keysRestoredCount = 0;
                    
                    const liveOrderSnap = await transaction.get(orderRef);
                    if (!liveOrderSnap.exists) throw new HttpsError('not-found', 'الطلب غير موجود.');
                    const liveOrder = liveOrderSnap.data();
                    const previousStatus = liveOrder.status;

                    const priceToRefundLocal = Number(liveOrder.priceLocalDeducted ?? liveOrder.price ?? 0);
                    const priceToDeductTierUsd = Number(liveOrder.priceBaseUsd ?? liveOrder.price ?? 0);
                    const serverNowMs = admin.firestore.Timestamp.now().toMillis();

                    if (action === 'completed') {
                        if (['completed', 'rejected', 'refunded', 'returned'].includes(previousStatus)) throw new HttpsError('failed-precondition', 'لا يمكن إكمال طلب تمت معالجته بالفعل.');
                        if ((liveOrder.qty || 1) > SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER) throw new HttpsError('failed-precondition', 'تجاوز الحد المسموح للأكواد.');

                        let deliveredCodeText = liveOrder.deliveredCode || null;
                        
                        if (!liveOrder.deliveredCode && vaultRef && candidateKeyDocs.length > 0) {
                            const keyRefs = candidateKeyDocs.map(d => d.ref);
                            const keySnaps = await transaction.getAll(...keyRefs);
                            
                            const hasCollision = keySnaps.some(k => !k.exists || k.data().isSold === true);
                            if (hasCollision) throw new Error('CONTENTION_COLLISION_RETRY');
                            
                            deliveredCodeText = keySnaps.map(d => d.data().codeText).join(' | ');

                            keySnaps.forEach(docSnap => {
                                transaction.update(docSnap.ref, { isSold: true, soldAt: admin.firestore.FieldValue.serverTimestamp(), orderId: orderId, userId: liveOrder.userId });
                                keysAssignedCount++;
                            });
                            
                            transaction.update(vaultRef, { stockCount: admin.firestore.FieldValue.increment(-keysAssignedCount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                        }

                        const userRef = db.collection('telecard_users').doc(String(liveOrder.userId));
                        const userSnap = await transaction.get(userRef);
                        
                        if (userSnap.exists) {
                            const tiersSnap = await transaction.get(db.collection('telecard_tiers'));
                            const tiersData = tiersSnap.docs.map(t => ({ id: t.id, ...t.data() }));

                            const upgradeResult = FinancialEngine.processTierUpgrade(userSnap.data(), tiersData, priceToDeductTierUsd, serverNowMs);
                            
                            let userUpdateObj = { 
                                totalSpent: upgradeResult.newTotalSpentUsd, 
                                tierCycleSpent: upgradeResult.newTierCycleSpentUsd, 
                                tierId: upgradeResult.finalTierId 
                            };
                            if (upgradeResult.shouldUpdateCycleStart) {
                                userUpdateObj.tierCycleStartDate = admin.firestore.FieldValue.serverTimestamp();
                                const newTier = tiersData.find(t => t.id === upgradeResult.finalTierId) || {durationDays: 30};
                                const durationDays = newTier.durationDays || 30;
                                userUpdateObj.tierExpiresAt = admin.firestore.Timestamp.fromMillis(serverNowMs + durationDays * 24 * 60 * 60 * 1000);
                            }
                            
                            transaction.update(userRef, userUpdateObj);
                        }

                        let orderUpdateObj = { status: action, adminNote: safeAdminNote, actionTime: admin.firestore.FieldValue.serverTimestamp() };
                        if (keysAssignedCount > 0) orderUpdateObj.deliveredCode = deliveredCodeText;
                        transaction.update(orderRef, orderUpdateObj);

                    } else if (['rejected', 'refunded', 'returned'].includes(action)) {
                        if (['rejected', 'refunded', 'returned'].includes(previousStatus)) throw new HttpsError('failed-precondition', 'تم استرجاع هذا الطلب بالفعل.');

                        const poolId = liveOrder.vaultPoolId;
                        let keysToHandle = [];
                        let vaultExists = false;
                        let vRef = null;

                        // 1. التحقق من وجود الخزنة وجلب الأكواد
                        if (poolId && liveOrder.deliveredCode) {
                            vRef = db.collection('telecard_vault').doc(String(poolId));
                            const vSnap = await transaction.get(vRef);
                            vaultExists = vSnap.exists;

                            if (vaultExists) {
                                const kQuerySnap = await transaction.get(vRef.collection('keys').where('orderId', '==', String(orderId)));
                                keysToHandle = kQuerySnap.docs;
                            }
                        } 
                        // 2. معالجة أكواد الـ API المباشر (التالفة)
                        else if (!poolId && liveOrder.deliveredCode && (liveOrder.supplierId || liveOrder.isApi || liveOrder.source === 'api')) {
                            const defectRef = db.collection('telecard_supplier_defects').doc();
                            transaction.set(defectRef, {
                                orderId: String(orderId),
                                supplierId: liveOrder.supplierId || 'API_UNKNOWN',
                                productName: liveOrder.product,
                                codeText: liveOrder.deliveredCode,
                                costUsd: Number(liveOrder.pricingSnapshot?.costUsd || 0),
                                reportedAt: admin.firestore.FieldValue.serverTimestamp(),
                                status: 'pending_compensation' 
                            });
                            keysBurnedCount++; 
                        }

                        // 3. معالجة أكواد الخزنة (السليمة أو اليتيمة)
                        if (poolId && liveOrder.deliveredCode) {
                            if (vaultExists && keysToHandle.length > 0) {
                                // الخزنة والأكواد موجودة بشكل طبيعي
                                keysToHandle.forEach(keyDoc => {
                                    if (previousStatus === 'pending' || previousStatus === 'processing') {
                                        transaction.update(keyDoc.ref, { 
                                            isSold: false, orderId: admin.firestore.FieldValue.delete(), userId: admin.firestore.FieldValue.delete(), soldAt: admin.firestore.FieldValue.delete()
                                        });
                                        keysRestoredCount++;
                                    } else {
                                        transaction.update(keyDoc.ref, { 
                                            isSold: true, isBurned: true, refundedAt: admin.firestore.FieldValue.serverTimestamp(), 
                                            refundedOrderId: orderId, reason: action, originalPoolId: poolId, collectionMarker: 'telecard_vault_returned'
                                        });
                                        keysBurnedCount++;
                                    }
                                });

                                // تحديث إحصائيات الخزنة بكفاءة
                                let vaultUpdates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
                                if (keysBurnedCount > 0) vaultUpdates.burnedCount = admin.firestore.FieldValue.increment(keysBurnedCount);
                                if (keysRestoredCount > 0) vaultUpdates.stockCount = admin.firestore.FieldValue.increment(keysRestoredCount);
                                transaction.update(vRef, vaultUpdates);
                                
                            } else {
                                // 🚀 [الحل الاحترافي]: الخزنة محذوفة، نقوم بإنقاذ الأكواد وتوثيقها في الأرشيف
                                const codesArray = liveOrder.deliveredCode.split(' | ').filter(c => c.trim() !== '');
                                const archiveRef = db.collection('telecard_vault_archived');
                                
                                codesArray.forEach(codeText => {
                                    const newArchiveDoc = archiveRef.doc();
                                    transaction.set(newArchiveDoc, {
                                        codeText: codeText.trim(),
                                        isSold: true,
                                        isBurned: true, 
                                        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
                                        refundedOrderId: orderId,
                                        reason: `Orphaned after vault deletion - ${action}`,
                                        originalPoolId: poolId,
                                        collectionMarker: 'telecard_vault_archived'
                                    });
                                    keysBurnedCount++; 
                                });
                            }
                        }

                        // 4. استكمال استرجاع رصيد العميل وتحديث مستوياته
                        const userRef = db.collection('telecard_users').doc(String(liveOrder.userId));
                        const userSnap = await transaction.get(userRef);
                        
                        let couponSnap = null;
                        if (liveOrder.couponCode) {
                            couponSnap = await transaction.get(db.collection('telecard_coupons').where('code', '==', liveOrder.couponCode).limit(1));
                        }
                        
                        const tiersSnap = await transaction.get(db.collection('telecard_tiers'));
                        const tiersData = tiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                        let newWalletBal = 0;            
                        if (userSnap.exists) {
                            const ud = userSnap.data();
                            newWalletBal = sanitizeAmount(safeAdd(ud.walletBalance || 0, priceToRefundLocal)); 
                            let updateObj = { walletBalance: newWalletBal };

                            if (previousStatus === 'completed') {
                                updateObj.totalSpent = sanitizeAmount(safeSub(ud.totalSpent || 0, priceToDeductTierUsd));
                                let newCycleSpentUsd = ud.tierCycleSpent || 0;
                                let newTierId = ud.tierId;
                                
                                const orderTime = FinancialEngine.parseSafeTime(liveOrder.createdAt);
                                const cycleStart = FinancialEngine.parseSafeTime(ud.tierCycleStartDate);
                                if (orderTime >= cycleStart) {
                                    newCycleSpentUsd = sanitizeAmount(safeSub(newCycleSpentUsd, priceToDeductTierUsd));
                                    if (ud.manualTierOverride !== true) {
                                        const getThreshold = (t) => Number(t.threshold || t.condition_amount || 0);
                                        const validTiers = tiersData.filter(t => t.autoAdvance !== false && getThreshold(t) <= newCycleSpentUsd).sort((a,b) => getThreshold(b) - getThreshold(a));
                                        if (validTiers.length > 0) newTierId = validTiers[0].id;
                                        else {
                                           const defaultTier = tiersData.find(t => t.isDefault) || tiersData[0];
                                           newTierId = defaultTier ? defaultTier.id : 'TIER_DEFAULT';
                                        }
                                    }
                                }
                                updateObj.tierCycleSpent = newCycleSpentUsd;
                                updateObj.tierId = newTierId;

                                if (newTierId !== ud.tierId) {
                                    const newTierObj = tiersData.find(t => t.id === newTierId) || { durationDays: 30 };
                                    const durationDays = newTierObj.durationDays || 30;
                                    const cycleStartMs = FinancialEngine.parseSafeTime(ud.tierCycleStartDate);
                                    updateObj.tierExpiresAt = admin.firestore.Timestamp.fromMillis(cycleStartMs + (durationDays * 24 * 60 * 60 * 1000));
                                }
                            }

                            transaction.update(userRef, updateObj);
                        }
                        
                        if (couponSnap && !couponSnap.empty) transaction.update(couponSnap.docs[0].ref, { usedCount: admin.firestore.FieldValue.increment(-1) });
                        transaction.update(orderRef, { status: action, adminNote: safeAdminNote, actionTime: admin.firestore.FieldValue.serverTimestamp(), balanceAfter: newWalletBal });
                    } else if (action === 'processing') {
                        if (['completed', 'rejected', 'refunded', 'returned'].includes(previousStatus)) throw new HttpsError('failed-precondition', 'لا يمكن إعادة معالجة طلب منتهي.');
                        transaction.update(orderRef, { status: action, adminNote: safeAdminNote, actionTime: admin.firestore.FieldValue.serverTimestamp() });
                    }
                });
            });
        } catch (err) {
            if (err.message && err.message.includes('HIGH_TRAFFIC_COLLISION')) {
                throw new HttpsError('resource-exhausted', 'هناك سحوبات كثيرة على هذا المنتج في نفس اللحظة، حاول قبول الطلب بعد قليل.');
            } else {
                throw err;
            }
        }

        if (keysAssignedCount > 0) finalMsg += ` (وتم تسليم ${keysAssignedCount} كود للعميل).`;
        if (keysBurnedCount > 0) finalMsg += ` (وتم توثيق ${keysBurnedCount} كود تالف بأمان).`;
        if (keysRestoredCount > 0) finalMsg += ` (وتم استرجاع ${keysRestoredCount} كود للخزنة ليتم بيعها مجدداً).`;
        
        await logAdminAction(request.auth.uid, 'PROCESS_ORDER', `Order: ${orderId}, Action: ${action}`);
        return { success: true, message: finalMsg };

    } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `خطأ برمجي في السيرفر: ${error.message}`);
    }
});

exports.adminProcessDeposit = onCall({ enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const data = request.data || {};
    let { depositId, action, adminNote } = data;
    
    const safeAdminNote = SecurityEngine.sanitizeText(String(adminNote || ''), SYSTEM_LIMITS.MAX_NOTE_LENGTH);
    
    await db.runTransaction(async (transaction) => {
        const depRef = db.collection('telecard_deposits').doc(String(depositId));
        const depSnap = await transaction.get(depRef);
        if (!depSnap.exists) throw new HttpsError('not-found', 'الإيداع غير موجود.');
        
        const depData = depSnap.data();
        if (depData.status === action) throw new HttpsError('failed-precondition', 'هذه هي الحالة الحالية.');
        
        let userRef = db.collection('telecard_users').doc(String(depData.userId));
        let newWalletBal = 0; 
        const wasApproved = depData.status === 'approved';
        
        const amtLocal = Number(depData.creditedAmount || depData.amount || 0);
        const amtUsd = Number(depData.creditedBaseUsd || amtLocal);

        const userSnap = await transaction.get(userRef);
        if (userSnap.exists) {
            const ud = userSnap.data();
            if (action === 'approved') {
                newWalletBal = sanitizeAmount(safeAdd(ud.walletBalance || 0, amtLocal));
                const newTotalDepositUsd = sanitizeAmount(safeAdd(ud.totalDeposit || 0, amtUsd));
                transaction.update(userRef, { walletBalance: newWalletBal, totalDeposit: newTotalDepositUsd });
            } else if ((action === 'refunded' || action === 'rejected') && wasApproved) {
                newWalletBal = sanitizeAmount(strictSub(ud.walletBalance || 0, amtLocal));
                const newTotalDepositUsd = sanitizeAmount(strictSub(ud.totalDeposit || 0, amtUsd));
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
    const adjustAmount = Number(amount);
    
    const safeAdminName = SecurityEngine.sanitizeText(String(request.data?.adminName || 'النظام'), 50);
    
    if (isNaN(adjustAmount) || adjustAmount <= 0 || adjustAmount > SYSTEM_LIMITS.MAX_SAFE_AMOUNT) {
        throw new HttpsError('out-of-range', 'المبلغ المدخل غير صالح.');
    }

    const userRef = db.collection('telecard_users').doc(String(userId));
    let idempotencyRef = null;
    if (idempotencyKey) idempotencyRef = db.collection('telecard_idempotency_keys').doc(`admin_bal_${userId}_${idempotencyKey}`);
    
    const transactionResult = await db.runTransaction(async (transaction) => {
        if (idempotencyRef) {
            const idempSnap = await transaction.get(idempotencyRef);
            if (idempSnap.exists) throw new HttpsError('already-exists', 'تم تنفيذ هذه العملية مسبقاً.');
        }

        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');
        const userData = userDoc.data();
        if (userData.isVerified !== true) throw new HttpsError('failed-precondition', 'لا يمكن تعديل الرصيد! العميل لم يكمل إعداد بيانات الحساب.');

        const currentBal = Number(userData.walletBalance || 0);
        const newBal = sanitizeAmount(type === 'add' ? safeAdd(currentBal, adjustAmount) : Math.max(0, strictSub(currentBal, adjustAmount)));
        
        const { ratesData } = await FinancialEngine.fetchSystemData(transaction, db);
        
        const userCurrency = String(userData.baseCurrency || 'USD').toUpperCase();
        let adjustAmountUsd = adjustAmount;
        
        if (userCurrency !== 'USD') {
            try { 
                adjustAmountUsd = FinancialEngine.convertViaUSDHelper(adjustAmount, userCurrency, 'USD', ratesData, 'round', 'deposit'); 
            } catch(e) {
                if (type === 'add') { 
                    throw new HttpsError('invalid-argument', `فشل تحويل العملة: ${e.message.replace('[SECURITY] ', '')}`);
                } else {
                    adjustAmountUsd = 0; 
                }
            }
        }

        if (type === 'add' && adjustAmountUsd > 5000) throw new HttpsError('out-of-range', `المبلغ يتجاوز الحد الأقصى المسموح للعملية الواحدة (5000$).`);

        const newTotalDepositUsd = sanitizeAmount(type === 'add' ? safeAdd(userData.totalDeposit || 0, adjustAmountUsd) : Math.max(0, strictSub(userData.totalDeposit || 0, adjustAmountUsd)));
        transaction.update(userRef, { walletBalance: newBal, totalDeposit: newTotalDepositUsd });
        
        const depId = SecurityEngine.generateUniqueId('ADMBAL');
        
        const depositDoc = {
            id: depId, 
            userId: userId, 
            userDataSnapshot: {
                fullName: SecurityEngine.sanitizeText(userData.fullName || 'مستخدم', 100),
                email: userData.email || '',
                phone: userData.phone || '',
                tierId: userData.tierId || 'TIER_DEFAULT',
                baseCurrency: userCurrency
            },
            amount: adjustAmount, 
            creditedAmount: type === 'add' ? adjustAmount : -adjustAmount, 
            creditedBaseUsd: type === 'add' ? adjustAmountUsd : -adjustAmountUsd, 
            targetCurrency: userCurrency,
            status: 'approved', 
            method: type === 'add' ? 'إيداع إداري' : 'خصم إداري',
            time: admin.firestore.FieldValue.serverTimestamp(), 
            admin: safeAdminName, 
            createdAt: admin.firestore.FieldValue.serverTimestamp(), 
            balanceAfter: newBal
        };

        transaction.set(db.collection('telecard_deposits').doc(depId), depositDoc);
        
        if (idempotencyRef) {
            transaction.set(idempotencyRef, { createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: admin.firestore.Timestamp.fromDate(new Date(admin.firestore.Timestamp.now().toMillis() + 24 * 60 * 60 * 1000)), depositId: depId });
        }
        return { depositDoc, newBal }; 
    });

    await logAdminAction(request.auth.uid, 'ADJUST_BALANCE', `User: ${userId}, Type: ${type}, Amount: ${amount}`);
    return { success: true, newBalance: transactionResult.newBal, newDeposit: transactionResult.depositDoc };
});

exports.grantAdminRole = onCall(async (request) => {
    if (!isMasterAdmin(request)) {
        throw new HttpsError('permission-denied', 'غير مصرح لك.');
    }

    const targetEmail = request.data?.email;
    if (!targetEmail) throw new HttpsError('invalid-argument', 'البريد مفقود.');
    try {
        const user = await admin.auth().getUserByEmail(targetEmail);
        
        // 🛡️ [إصلاح دمج الصلاحيات]: جلب الصلاحيات السابقة ودمجها لمنع ضياع حالة الحظر أو أي رتب أخرى
        const currentClaims = user.customClaims || {};
        await admin.auth().setCustomUserClaims(user.uid, { ...currentClaims, admin: true });
        
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
    const safeCountry = SecurityEngine.sanitizeText(String(country || ''), 100);
    const safePhone = SecurityEngine.sanitizeText(String(phone || ''), 50);
    const cleanCurrency = SecurityEngine.sanitizeText(String(currency || ''), 10).toUpperCase();
    
    if (!/^\+?[0-9]{7,15}$/.test(safePhone)) throw new HttpsError('invalid-argument', 'رقم الهاتف غير صالح.');
    
    try {
        return await db.runTransaction(async (transaction) => {
            const userRef = db.collection('telecard_users').doc(uid);
            
            const configCache = await transaction.get(db.collection('telecard_system').doc('active_configs'));
            let isValidCurr = cleanCurrency === 'USD'; 
            
            if (!isValidCurr) {
                if (configCache.exists && configCache.data().rates) {
                    isValidCurr = configCache.data().rates.some(r => r.code === cleanCurrency);
                } else {
                    const ratesSnap = await transaction.get(db.collection('telecard_rates'));
                    isValidCurr = ratesSnap.docs.some(d => d.data().code === cleanCurrency);
                }
            }
            if (!isValidCurr) {
                throw new HttpsError('invalid-argument', 'العملة المدخلة غير مدعومة في النظام.');
            }

            const userSnap = await transaction.get(userRef);
            
            let userData = userSnap.exists ? userSnap.data() : {
                email: request.auth.token.email || '', fullName: request.auth.token.name || 'عميل جديد', role: 'user',
                walletBalance: 0.0, totalSpent: 0.0, totalDeposit: 0.0, tierId: '1', tierCycleSpent: 0.0,
                tierCycleStartDate: admin.firestore.FieldValue.serverTimestamp(), manualTierOverride: false,
                isBanned: false, isIpBanned: false, createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            if (userData.isVerified === true) throw new HttpsError('permission-denied', 'تم إعداد المحفظة مسبقاً.');
            
            const payload = { country: safeCountry, phone: safePhone, baseCurrency: cleanCurrency, isVerified: true, identityCompletedAt: admin.firestore.FieldValue.serverTimestamp() };
            if (userSnap.exists) transaction.update(userRef, payload);
            else transaction.set(userRef, { ...userData, ...payload });
            
            return { success: true, lockedCurrency: cleanCurrency };
        });
    } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('internal', error.message); }
});

// ==========================================
// 📊 5. محركات الذكاء التجاري (Cloud BI Engines)
// ==========================================
exports.adminGetWalletsLiquidity = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');

    try {
        const db = admin.firestore();
        
        const ratesSnap = await db.collection('telecard_rates').get();
        const ratesDataArr = ratesSnap.docs.map(d => d.data()); 

        const usersSnap = await db.collection('telecard_users').get();
        let liquidity = { totalUsd: 0, details: {} };
        
        usersSnap.forEach(doc => {
            const u = doc.data();
            const bal = Number(u.walletBalance ?? u.balance ?? 0);
            
            if (bal > 0) {
                const curr = String(u.baseCurrency || u.base_currency || 'USD').toUpperCase();
                
                if (!liquidity.details[curr]) {
                    liquidity.details[curr] = { sum: 0, count: 0 };
                }
                
                liquidity.details[curr].sum = FinancialEngine.safeAdd(liquidity.details[curr].sum, bal);
                liquidity.details[curr].count++;
            }
        });

        Object.keys(liquidity.details).forEach(curr => {
            const sum = liquidity.details[curr].sum;
            if (curr === 'USD') {
                liquidity.totalUsd = FinancialEngine.safeAdd(liquidity.totalUsd, sum);
            } else {
                try {
                    const balInUsd = FinancialEngine.convertViaUSDHelper(sum, curr, 'USD', ratesDataArr, 'round', 'deposit');
                    liquidity.totalUsd = FinancialEngine.safeAdd(liquidity.totalUsd, balInUsd);
                } catch(e) {
                    console.warn(`تخطي عملة ${curr} لعدم وجود سعر صرف صالح.`);
                }
            }
        });
        
        return { success: true, data: liquidity };
        
    } catch (error) {
        console.error("Wallets Liquidity Error:", error);
        throw new HttpsError('internal', 'فشل السيرفر في تجميع المحافظ.');
    }
});

// ==========================================
// 📊 محرك التجميع اللحظي للإحصائيات (Background Aggregator)
// ==========================================
exports.aggregateDailyStats = onDocumentWritten({ 
    document: 'telecard_orders/{orderId}', 
    retry: true,
    memory: '256MiB'
}, async (event) => {
    const after = event.data.after.exists ? event.data.after.data() : null;
    const before = event.data.before.exists ? event.data.before.data() : null;

    if (before && after && before.status === after.status) return null;

    let revenueChange = 0, profitChange = 0, costChange = 0, orderCountChange = 0;
    let apiProfitChange = 0, autoProfitChange = 0, manualProfitChange = 0;

    const order = (after && after.status === 'completed') ? after : before;
    const isApi = (order?.isApi || order?.source === 'api');
    const isAuto = (!isApi && order?.deliveredCode && order?.deliveredCode.length > 0);

    if (after && after.status === 'completed' && (!before || before.status !== 'completed')) {
        revenueChange = Number(after.priceBaseUsd || 0);
        profitChange = Number(after.pricingSnapshot?.netProfitUsd || 0);
        costChange = Number(after.pricingSnapshot?.costUsd || 0);
        orderCountChange = 1;
    }
    else if (before && before.status === 'completed' && after && ['refunded', 'rejected', 'returned'].includes(after.status)) {
        revenueChange = -Number(before.priceBaseUsd || 0);
        profitChange = -Number(before.pricingSnapshot?.netProfitUsd || 0);
        costChange = -Number(before.pricingSnapshot?.costUsd || 0);
        orderCountChange = -1;
    }

    if (revenueChange === 0 && orderCountChange === 0) return null;

    if (isApi) apiProfitChange = profitChange;
    else if (isAuto) autoProfitChange = profitChange;
    else manualProfitChange = profitChange;

    const timeMs = order ? (order.time?.toMillis ? order.time.toMillis() : Date.now()) : Date.now();
    const dateObj = new Date(timeMs);
    const dayKey = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
    
    const inc = (val) => admin.firestore.FieldValue.increment(val);
    
    const payload = {
        date: dayKey,
        revenue: inc(revenueChange),
        profit: inc(profitChange),
        cost: inc(costChange),
        count: inc(orderCountChange),
        api_profit: inc(apiProfitChange),
        auto_profit: inc(autoProfitChange),
        manual_profit: inc(manualProfitChange),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    const batch = db.batch();
    batch.set(db.collection('telecard_statistics').doc(`daily_${dayKey}`), payload, { merge: true });
    batch.set(db.collection('telecard_statistics').doc('all_time'), payload, { merge: true });
    
    await batch.commit();
    return null;
});

// ==========================================
// 📊 دالة جلب الإحصائيات للإدارة (أداء فائق - Point Reads)
// ==========================================
exports.adminGetSalesBI = onCall({ timeoutSeconds: 60, memory: "256MiB" }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const range = request.data?.range || '30days';
    const now = Date.now();
    let daysToFetch = 30;
    
    if (range === '7days') daysToFetch = 7;
    else if (range === '90days') daysToFetch = 90;

    try {
        let stats = {
            curr: { revenue: 0, cost: 0, profit: 0, count: 0, sources: { api: 0, auto: 0, manual: 0 }, daily: {} },
            prev: { revenue: 0, cost: 0, profit: 0, count: 0 }
        };

        if (range === 'all') {
            const allTimeSnap = await db.collection('telecard_statistics').doc('all_time').get();
            if (allTimeSnap.exists) {
                const d = allTimeSnap.data();
                stats.curr.revenue = d.revenue || 0;
                stats.curr.cost = d.cost || 0;
                stats.curr.profit = d.profit || 0;
                stats.curr.count = d.count || 0;
                stats.curr.sources.api = d.api_profit || 0;
                stats.curr.sources.auto = d.auto_profit || 0;
                stats.curr.sources.manual = d.manual_profit || 0;
            }
        } else {
            const dailyRefs = [];
            const totalDaysToFetch = daysToFetch * 2; 
            
            for (let i = 0; i < totalDaysToFetch; i++) {
                const d = new Date(now - i * 86400000);
                const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
                dailyRefs.push(db.collection('telecard_statistics').doc(`daily_${dayKey}`));
            }

            const chunks = [];
            for(let i = 0; i < dailyRefs.length; i += 100) chunks.push(dailyRefs.slice(i, i + 100));

            let currentIndex = 0; 
            
            for (const chunk of chunks) {
                const snaps = await db.getAll(...chunk);
                snaps.forEach(doc => {
                    const isCurr = currentIndex < daysToFetch; 
                    
                    if (doc.exists) {
                        const d = doc.data();
                        
                        if (isCurr) {
                            const dateStr = doc.id.replace('daily_', '');
                            stats.curr.daily[dateStr] = { revenue: d.revenue || 0, profit: d.profit || 0 };
                            stats.curr.revenue += d.revenue || 0;
                            stats.curr.cost += d.cost || 0;
                            stats.curr.profit += d.profit || 0;
                            stats.curr.count += d.count || 0;
                            stats.curr.sources.api += d.api_profit || 0;
                            stats.curr.sources.auto += d.auto_profit || 0;
                            stats.curr.sources.manual += d.manual_profit || 0;
                        } else {
                            stats.prev.revenue += d.revenue || 0;
                            stats.prev.cost += d.cost || 0;
                            stats.prev.profit += d.profit || 0;
                            stats.prev.count += d.count || 0;
                        }
                    }
                    currentIndex++;
                });
            }
        }

        const round = (n) => Math.round(n * 100) / 100;
        stats.curr.revenue = round(stats.curr.revenue); 
        stats.curr.profit = round(stats.curr.profit);
        stats.curr.cost = round(stats.curr.cost);
        stats.prev.revenue = round(stats.prev.revenue); 
        stats.prev.profit = round(stats.prev.profit);
        stats.prev.cost = round(stats.prev.cost);

        return { success: true, data: stats };
    } catch (error) {
        throw new HttpsError('internal', `فشل تحليل الـ BI: ${error.message}`);
    }
});

// ==========================================
// 📄 دالة جلب الطلبات للإدارة بنظام الصفحات (Pagination محصن)
// ==========================================
exports.adminGetOrdersList = onCall({ memory: "256MiB", timeoutSeconds: 60 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');

    const { 
        limit = 50,           
        lastTimeMs = null,     
        lastDocId = null,      
        status = null,        
        startDateMs = null,   
        endDateMs = null      
    } = request.data || {};

    const fetchLimit = Math.min(Number(limit) || 50, 100);

    try {
        let query = db.collection('telecard_orders');

        if (status && status !== 'all') {
            query = query.where('status', '==', String(status));
        }
        if (startDateMs) {
            query = query.where('time', '>=', admin.firestore.Timestamp.fromMillis(startDateMs));
        }
        if (endDateMs) {
            query = query.where('time', '<=', admin.firestore.Timestamp.fromMillis(endDateMs));
        }

        // 🛡️ ترتيب زمني مع ترتيب ثانوي بالمعرف لمنع تخطي الطلبات المتزامنة
        query = query.orderBy('time', 'desc').orderBy(admin.firestore.FieldPath.documentId(), 'desc');

        // 🚀 [الحل الاحترافي]: التمرير المباشر بالقيم بدلاً من استعلام المستند
        if (lastTimeMs && lastDocId) {
            query = query.startAfter(admin.firestore.Timestamp.fromMillis(lastTimeMs), String(lastDocId));
        }

        query = query.limit(fetchLimit);
        const snapshot = await query.get();

        const orders = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            orders.push({
                id: doc.id,
                displayId: data.displayId,
                product: data.product,
                priceBaseUsd: data.priceBaseUsd,
                priceLocalDeducted: data.priceLocalDeducted,
                priceCurrency: data.priceCurrency,
                status: data.status,
                time: data.time ? data.time.toMillis() : null,
                userDataSnapshot: data.userDataSnapshot || {}
            });
        });

        const hasMore = snapshot.docs.length === fetchLimit;
        const newLastTimeMs = orders.length > 0 ? orders[orders.length - 1].time : null;
        const newLastDocId = orders.length > 0 ? orders[orders.length - 1].id : null;

        return { 
            success: true, 
            data: orders, 
            pagination: {
                lastTimeMs: newLastTimeMs,
                lastDocId: newLastDocId,
                hasMore: hasMore
            }
        };

    } catch (error) {
        console.error("Admin Get Orders Error:", error);
        throw new HttpsError('internal', 'فشل جلب قائمة الطلبات.');
    }
});

// ==========================================
// 🧹 6. محرك الكنس الذكي (Smart Tier Sweeper)
// ==========================================
exports.dailyTierDowngradeSweep = onSchedule({
            schedule: "0 0 * * *",
            timeZone: "UTC", 
            timeoutSeconds: 540,
            memory: "512MiB",
            concurrency: 1,
            maxInstances: 1
        }, async (event) => {    try {
        const now = Date.now();
        const nowTimestamp = admin.firestore.Timestamp.fromMillis(now);
        
        const tiersSnap = await db.collection('telecard_tiers').get();
        if (tiersSnap.empty) return null;

        const tiersMap = {};
        let defaultTier = null;

        tiersSnap.forEach(doc => {
            const t = doc.data();
            tiersMap[doc.id] = t;
            if (t.isDefault === true || doc.id === 'TIER_DEFAULT') { defaultTier = { id: doc.id, ...t }; }
        });

        if (!defaultTier) defaultTier = { id: tiersSnap.docs[0].id };

        const expiredUsersQuery = db.collection('telecard_users')
            .where('tierExpiresAt', '<=', nowTimestamp);

        const stream = expiredUsersQuery.stream();

        const batchArray = [db.batch()];
        let operationCounter = 0;
        let batchIndex = 0;
        let updatedUsersCount = 0;

        for await (const doc of stream) {
            const u = doc.data();
            
            if (u.manualTierOverride === true) continue;

            const spentInCycle = Number(u.tierCycleSpent || 0);
            const sortedTiers = Object.values(tiersMap).sort((a,b) => Number(b.threshold || 0) - Number(a.threshold || 0));
            
            const earnedTier = sortedTiers.find(t => 
                t.autoAdvance !== false && 
                spentInCycle >= Number(t.threshold || t.condition_amount || 0)
            );

            const newTier = earnedTier || defaultTier;
            const durationDays = newTier.durationDays || 30;

            const userRef = db.collection('telecard_users').doc(doc.id);

            batchArray[batchIndex].update(userRef, {
                tierCycleSpent: 0, 
                tierCycleStartDate: admin.firestore.FieldValue.serverTimestamp(), 
                tierExpiresAt: admin.firestore.Timestamp.fromMillis(now + (durationDays * 24 * 60 * 60 * 1000)),
                tierId: newTier.id 
            });

            updatedUsersCount++;
            operationCounter++;

            if (operationCounter === 400) {
                batchArray.push(db.batch());
                batchIndex++;
                operationCounter = 0;
            }
        }

        for (let i = 0; i <= batchIndex; i++) {
            if (i === batchIndex && operationCounter === 0 && batchIndex > 0) continue;
            await batchArray[i].commit();
        }

        console.log(`🧹 [Tier Sweeper]: تم إجراء هبوط رحيم لـ ${updatedUsersCount} عميل.`);
        return { success: true, resetCount: updatedUsersCount };

    } catch (error) {
        console.error("🚨 [Tier Sweeper Error]:", error);
        return null;
    }
});

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
        for (let i = 0; i < cleanCodes.length; i += 200) chunks.push(cleanCodes.slice(i, i + 200));

        for (const chunk of chunks) {
            const batch = db.batch();
            chunk.forEach(codeText => batch.set(vaultRef.collection('keys').doc(), { codeText, isSold: false, addedAt: admin.firestore.FieldValue.serverTimestamp() }));
            batch.set(vaultRef, { stockCount: admin.firestore.FieldValue.increment(chunk.length), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            await batch.commit();
        }
        await vaultRef.set({ id: poolId, name: poolName || 'صندوق أكواد', alertLimit: Number(alertLimit) || 5 }, { merge: true });
        return { success: true, addedCount: cleanCodes.length };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

exports.trackNewKycUploads = onObjectFinalized({ 
    memory: "128MiB",
    timeoutSeconds: 60
}, async (event) => {
    const filePath = event.data.name;     
    const contentType = event.data.contentType;

    if (!filePath || !filePath.startsWith('kyc_docs/')) return null;
    if (filePath.endsWith('/') || event.data.size === 0) return null;

    const fileName = filePath.split('/').pop();
    const userId = fileName.includes('_') ? fileName.split('_')[1] : 'unknown';

    try {
        await db.collection('telecard_pending_uploads').doc(fileName).set({
            filePath: filePath, userId: userId && userId.length > 5 ? userId : 'unknown',
            contentType: contentType, uploadedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return true;
    } catch (error) { return null; }
});

exports.cleanupOrphanedKycDocs = onSchedule({
    schedule: "0 3 * * 0", timeZone: "UTC", timeoutSeconds: 540, memory: "256MiB", concurrency: 1, maxInstances: 1 
}, async () => {
    const now = admin.firestore.Timestamp.now().toMillis();
    const cutoff = now - (24 * 60 * 60 * 1000); 

    const isFileInObject = (obj, fileName) => {
        if (!obj || typeof obj !== 'object') return false;
        for (const key in obj) {
            const val = obj[key];
            if (typeof val === 'string' && val.includes(fileName)) return true;
            if (typeof val === 'object' && isFileInObject(val, fileName)) return true;
        }
        return false;
    };

    try {
        const pendingSnap = await db.collection('telecard_pending_uploads')
            .where('uploadedAt', '<', admin.firestore.Timestamp.fromMillis(cutoff))
            .limit(200)
            .get();

        if (pendingSnap.empty) return;

        const bucket = admin.storage().bucket();
        const batch = db.batch();

        for (const doc of pendingSnap.docs) {
            const data = doc.data();
            let isSafeToDelete = true;

            if (data.userId && data.userId !== 'unknown') {
                const userSnap = await db.collection('telecard_users').doc(String(data.userId)).get();
                if (userSnap.exists) {
                    const userData = userSnap.data();
                    const fileName = data.filePath ? data.filePath.split('/').pop() : 'UNKNOWN_FILE';
                    
                    if (isFileInObject(userData, fileName)) {
                        isSafeToDelete = false;
                    }
                }
            }

            if (isSafeToDelete && data.filePath) {
                try { await bucket.file(data.filePath).delete(); } 
                catch (e) { if (e.code !== 404) console.error("Error deleting file:", e); }
            }
            batch.delete(doc.ref);
        }
        await batch.commit();
    } catch (error) { console.error("[Storage Cleanup Error]:", error); }
});

// ==========================================
// 🔗 11. المزامنة والتريجرات (Cache Auto-Sync)
// ==========================================
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
        if (opCount >= 400) { await currentBatch.commit(); currentBatch = db.batch(); opCount = 0; }
    }
    if (opCount > 0) await currentBatch.commit();
    return { success: true, updatedProductsCount: totalUpdated };
});

exports.onSettingsUpdate = onDocumentUpdated({ document: 'telecard_settings/singleton', memory: "256MiB", concurrency: 1 }, async () => { await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true }); });
exports.onOfferUpdate = onDocumentWritten({ document: 'telecard_offers/{offerId}', memory: "256MiB", concurrency: 1 }, async () => { await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true }); await buildPricingCache(); });
exports.onRateUpdate = onDocumentWritten({ document: 'telecard_rates/{rateId}', memory: "256MiB", concurrency: 1 }, async () => { await buildConfigCache(); });
exports.onPaymentUpdate = onDocumentWritten({ document: 'telecard_payments/{paymentId}', memory: "256MiB", concurrency: 1 }, async () => { await buildConfigCache(); });

exports.secureProductSync = onDocumentWritten({ document: 'telecard_prods/{productId}', retry: true }, async (event) => {
    const publicProdRef = db.collection('telecard_prods_public').doc(event.params.productId);
    if (!event.data.after.exists) return publicProdRef.delete(); 
    const prodData = event.data.after.data();
    if (prodData.isActive === false || String(prodData.isAvailable) === 'false') return publicProdRef.delete();
    const tiersSnap = await db.collection('telecard_tiers').get();
    const tiersData = tiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    return publicProdRef.set(generatePublicProductData(prodData, tiersData), { merge: true });
});

// ==========================================
// 🚨 مشغلات الرادار الذكية (Smart FCM Triggers)
// ==========================================
const sendFCMToUser = async (userId, title, body, payloadData = {}) => {
    try {
        const userDoc = await db.collection('telecard_users').doc(String(userId)).get();
        if (!userDoc.exists) return;
        const tokens = userDoc.data().fcmTokens || [];
        if (!Array.isArray(tokens) || tokens.length === 0) return;
        
        let safeTokens = tokens;
        if (tokens.length > 20) {
            safeTokens = tokens.slice(-20);
            await userDoc.ref.update({ fcmTokens: safeTokens }).catch(err => console.error("FCM Token Array Slice Error:", err));
        }
        
        const response = await admin.messaging().sendEachForMulticast({ notification: { title, body }, data: payloadData, tokens: safeTokens });
        if (response.failureCount > 0) {
            const failedTokens = response.responses.map((r, i) => (!r.success && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(r.error?.code)) ? safeTokens[i] : null).filter(Boolean);
            if (failedTokens.length > 0) {
                await userDoc.ref.update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens) }).catch(err => console.error("FCM Token Cleanup Error:", err));
            }
        }
    } catch (e) {
        if (e.code !== 'messaging/invalid-registration-token' && e.code !== 'messaging/registration-token-not-registered') {
            console.error(`🚨 [FCM Critical Error - User ${userId}]:`, e);
        }
    }
};

const sendFCMToAdmin = async (alertType, title, body, payloadData = {}) => {
    try {
        const adminSnap = await db.collection('telecard_admin').doc('singleton').get();
        if (!adminSnap.exists) return;
        const adminData = adminSnap.data();
        if ((adminData.pushPrefs || {})[alertType] === false) return;
        const tokens = adminData.fcmTokens || [];
        if (!Array.isArray(tokens) || tokens.length === 0) return;
        
        let safeTokens = tokens;
        if (tokens.length > 20) {
            safeTokens = tokens.slice(-20);
            await adminSnap.ref.update({ fcmTokens: safeTokens }).catch(err => console.error("FCM Admin Token Array Slice Error:", err));
        }
        
        const response = await admin.messaging().sendEachForMulticast({ notification: { title, body }, data: payloadData, tokens: safeTokens });
        if (response.failureCount > 0) {
            const failedTokens = response.responses.map((r, i) => (!r.success && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(r.error?.code)) ? safeTokens[i] : null).filter(Boolean);
            if (failedTokens.length > 0) {
                await adminSnap.ref.update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens) }).catch(err => console.error("FCM Admin Token Cleanup Error:", err));
            }
        }
    } catch (e) {
        if (e.code !== 'messaging/invalid-registration-token' && e.code !== 'messaging/registration-token-not-registered') {
            console.error(`🚨 [FCM Critical Error - Admin]:`, e);
        }
    }
};

exports.autoNotifyOrderStatus = onDocumentWritten({ document: 'telecard_orders/{orderId}', retry: true }, async (event) => {
    if (!event.data.after.exists) return null;
    const after = event.data.after.data();
    const before = event.data.before.exists ? event.data.before.data() : null;
    if (!before && after.status === 'pending') await sendFCMToAdmin('orders', '🛒 طلب جديد بانتظارك!', `طلب يحتاج للتسليم اليدوي.`, { target: 'orders' });
    if (before && before.status === after.status) return null;
    if (!before && (after.status === 'pending' || after.status === 'processing')) return null;

    let title = "تحديث طلب", message = `تم تغيير حالة الطلب إلى ${after.status}`;
    if (after.status === 'completed') { title = "🎉 طلبك جاهز!"; message = `تم تسليم ( ${after.product} ).`; } 
    else if (after.status === 'rejected') { title = "❌ طلب مرفوض"; message = `رفض الطلب: ${after.adminNote || 'راجع الدعم'}`; } 
    else if (after.status === 'refunded') { title = "↩️ استرجاع قيمة"; message = `تم استرجاع الرصيد بنجاح.`; }

    const notifId = `notif_${event.params.orderId}_${after.status}`;
    await db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({ id: notifId, title, message, type: 'notification', jumpTarget: 'order', createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await sendFCMToUser(after.userId, title, message, { targetType: 'order', targetId: String(after.id) });
    return null;
});

exports.autoNotifyDepositStatus = onDocumentWritten({ document: 'telecard_deposits/{depositId}', retry: true }, async (event) => {
    if (!event.data.after.exists) return null;
    const after = event.data.after.data();
    const before = event.data.before.exists ? event.data.before.data() : null;
    if (!before && after.status === 'pending') await sendFCMToAdmin('deposits', '💰 إيداع رصيد جديد', `تم استلام طلب إيداع بقيمة ${after.amount} ${after.currency}.`, { target: 'deposits' });
    if (before && before.status === after.status) return null;
    if (!before && after.status === 'pending') return null;

    let title = "تحديث الإيداع", message = `الحالة: ${after.status}`;
    const displayAmt = after.creditedAmount !== undefined ? after.creditedAmount : after.amount;
    if (after.status === 'approved') { title = "💰 رصيد جديد"; message = `تم إضافة ${displayAmt} لمحفظتك.`; } 
    else if (after.status === 'rejected') { title = "❌ إيداع مرفوض"; message = `السبب: ${after.adminNote || 'تواصل معنا'}`; } 
    else if (after.status === 'refunded') { title = "↩️ إيداع مسترجع"; message = `تم سحب ${displayAmt} من محفظتك.`; }

    const notifId = `notif_${event.params.depositId}_${after.status}`;
    await db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({ id: notifId, title, message, type: 'notification', jumpTarget: 'wallet', createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await sendFCMToUser(after.userId, title, message, { targetType: 'wallet', targetId: String(after.id) });
    return null;
});

exports.autoNotifyVaultStatus = onDocumentUpdated({ document: 'telecard_vault/{poolId}', retry: true }, async (event) => {
    const after = event.data.after.data(), before = event.data.before.data();
    const currentStock = Number(after.stockCount || 0), previousStock = Number(before.stockCount || 0), limit = Number(after.alertLimit || 5);
    if (currentStock === 0 && previousStock > 0) await sendFCMToAdmin('vault', '📦 مخزون حرج!', `صندوق الأكواد (${after.name}) أصبح فارغاً تماماً.`, { target: 'vault' });
    else if (currentStock <= limit && previousStock > limit) await sendFCMToAdmin('vault', '⚠️ انخفاض المخزون', `تبقى ${currentStock} أكواد فقط في صندوق (${after.name}).`, { target: 'vault' });
    return null;
});

exports.autoNotifyComplaints = onDocumentWritten({ document: 'telecard_reviews/{reviewId}', retry: true }, async (event) => {
    if (!event.data.after.exists) return null;
    const after = event.data.after.data(), before = event.data.before.exists ? event.data.before.data() : null;
    if (!before && Number(after.rating) <= 2) await sendFCMToAdmin('complaints', '🚨 عميل غاضب!', `تلقيت تقييماً بـ ${after.rating} نجوم يحتاج لتدخلك.`, { target: 'complaints' });
    return null;
});

// ==========================================
// 🛠️ 12. دوال مساندة للوحة التحكم
// ==========================================

exports.adminForceSyncPricing = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try { await buildPricingCache(); await buildConfigCache(); return { success: true, message: 'تم إعادة بناء الكاش بنجاح.' }; } 
    catch (error) { throw new HttpsError('internal', `فشل الترميم: ${error.message}`); }
});

exports.adminForceSyncCatalog = onCall({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try {
        const fallback = await buildPricingCache();
        let lastDoc = null, syncCount = 0, hasMore = true;

        while (hasMore) {
            let query = db.collection('telecard_prods').where('isActive', '==', true).orderBy(admin.firestore.FieldPath.documentId()).limit(300);
            if (lastDoc) query = query.startAfter(lastDoc);
            const snapshot = await query.get();
            if (snapshot.empty) { hasMore = false; break; }

            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                const prodData = doc.data();
                if (String(prodData.isAvailable) !== 'false') {
                    batch.set(db.collection('telecard_prods_public').doc(doc.id), generatePublicProductData(prodData, fallback.tiers), { merge: true });
                    syncCount++;
                }
                lastDoc = doc; 
            });
            await batch.commit(); 
            await new Promise(resolve => setTimeout(resolve, 50)); 
        }
        await db.collection('telecard_system').doc('cache_version').set({ version: admin.firestore.FieldValue.increment(1) }, { merge: true });
        return { success: true, message: `تمت مزامنة ${syncCount} منتج بنجاح!` };
    } catch (error) { throw new HttpsError('internal', error.message); }
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
        
        // 🚀 [إصلاح المستندات الميتة]: تنظيف الـ Manifest والـ Chunks الخاصة بالصندوق المحذوف
        try {
            const manifestRef = db.collection('telecard_vault_manifest').doc(poolId);
            const chunksSnap = await manifestRef.collection('chunks').get();
            if (!chunksSnap.empty) {
                const chunkBatch = db.batch();
                chunksSnap.docs.forEach(doc => chunkBatch.delete(doc.ref));
                await chunkBatch.commit();
            }
            await manifestRef.delete();
        } catch (manifestErr) {
            console.error("Manifest Cleanup Error:", manifestErr);
        }

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
        
        try {
            const userRecord = await admin.auth().getUser(targetUid);
            const currentClaims = userRecord.customClaims || {};
            currentClaims.banned = isBanned;
            await admin.auth().setCustomUserClaims(targetUid, currentClaims);
            if (isBanned) await admin.auth().revokeRefreshTokens(targetUid);
        } catch (authError) {
            console.warn(`[Auth Warning]: User ${targetUid} not found in Auth, but Firestore was updated.`);
        }
        
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
        
        const bucket = admin.storage().bucket();
        try {
            await bucket.deleteFiles({ prefix: `kyc_docs/${targetUid}_` });
            
            // 🚀 [إصلاح تسرب التخزين]: حذف الصورة الشخصية للعميل إن وجدت
            const userSnap = await db.collection('telecard_users').doc(targetUid).get();
            if (userSnap.exists) {
                const ud = userSnap.data();
                if (ud.profileImage && typeof ud.profileImage === 'string' && ud.profileImage.includes('firebasestorage')) {
                    const fileUrl = new URL(ud.profileImage);
                    const filePath = decodeURIComponent(fileUrl.pathname.split('/o/')[1].split('?')[0]);
                    await bucket.file(filePath).delete();
                }
            }
        } catch (storageError) {
            console.error("Storage Deletion Error:", storageError);
        }
        
        await db.collection('telecard_users').doc(targetUid).update({
            email: `deleted_${targetUid.substring(0, 5)}@system.local`, fullName: 'حساب محذوف', firstName: 'محذوف', lastName: '', 
            phone: '---', country: '---', isDeleted: true, isBanned: true, banReason: 'Deleted by Admin', 
            manualTierOverride: true, kycStatus: 'none',
            kycData: admin.firestore.FieldValue.delete(), 
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
        await logAdminAction(request.auth?.uid, 'DELETE_USER', `Soft deleted user & purged KYC for: ${targetUid}`);
        return { success: true };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

// ==========================================
// 🔌 13. الروابط الخارجية للواجهات البرمجية (APIs)
// ==========================================
Object.defineProperty(exports, "getServerTime", { enumerable: true, get: () => onCall(() => { return { success: true, serverTime: admin.firestore.Timestamp.now().toMillis() }; }) });

// دوال الـ API الخارجية
Object.defineProperty(exports, "orderStatusWebhook", { enumerable: true, get: () => require('./developerApi.js').orderStatusWebhook });
Object.defineProperty(exports, "cronRetryWebhooks", { enumerable: true, get: () => require('./developerApi.js').cronRetryWebhooks });
Object.defineProperty(exports, "externalCreateOrder", { enumerable: true, get: () => require('./developerApi.js').externalCreateOrder });

// دوال محرك الموردين
Object.defineProperty(exports, "syncSupplierData", { enumerable: true, get: () => require('./supplierEngine.js').syncSupplierData });
Object.defineProperty(exports, "scheduledSupplierSync", { enumerable: true, get: () => require('./supplierEngine.js').scheduledSupplierSync });
Object.defineProperty(exports, "secureSaveSupplier", { enumerable: true, get: () => require('./supplierEngine.js').secureSaveSupplier });

// 🛡️ دالة العامل المستقلة (Pub/Sub Worker) لمزامنة الموردين
Object.defineProperty(exports, "onSupplierSyncWorker", { enumerable: true, get: () => require('./supplierEngine.js').onSupplierSyncWorker });

// ==========================================
// 🔍 7. المحقق المالي (Ledger Reconciliation)
// ==========================================
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
            db.collection('telecard_orders')
            .where('userId', '==', targetUserId)
            .where('status', '==', 'completed')
            .aggregate({
                realTotalSpentUsd: AggregateField.sum('priceBaseUsd')
            }).get(),
            
            db.collection('telecard_deposits')
            .where('userId', '==', targetUserId)
            .where('status', '==', 'approved')
            .aggregate({
                realTotalDepUsd: AggregateField.sum('creditedBaseUsd')
            }).get()
        ]);
        
        const realTotalSpentUsd = sanitizeAmount(ordersAgg.data().realTotalSpentUsd || 0);
        const realTotalDepositUsd = sanitizeAmount(depApprovedAgg.data().realTotalDepUsd || 0);
        
        const userData = userSnap.data();
        const currentSpent = Number(userData.totalSpent || 0);
        const currentDep = Number(userData.totalDeposit || 0);
        
        if (realTotalSpentUsd === currentSpent && realTotalDepositUsd === currentDep) {
            return {
                success: true,
                message: 'البيانات المالية متطابقة تماماً. لا يوجد أي تشوه.',
                data: { spentUsd: realTotalSpentUsd, depositUsd: realTotalDepositUsd }
            };
        }
        
        await userRef.update({
            totalSpent: realTotalSpentUsd,
            totalDeposit: realTotalDepositUsd
        });
        
        await logAdminAction(
            request.auth.uid,
            'AUDIT_WALLET',
            `تم تصحيح التشوه المالي للعميل ${targetUserId}. الصرف: ${currentSpent} -> ${realTotalSpentUsd} | الإيداع: ${currentDep} -> ${realTotalDepositUsd}`
        );
        
        return {
            success: true,
            message: 'تم اكتشاف تشوه مالي وتصحيحه بنجاح!',
            data: { spentUsd: realTotalSpentUsd, depositUsd: realTotalDepositUsd }
        };
        
    } catch (error) {
        throw new HttpsError('internal', `فشل التدقيق المالي: ${error.message}`);
    }
});
