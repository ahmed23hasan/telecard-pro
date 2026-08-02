// ============================================================================
// 🧠 المحرك الرئيسي (functions/index.js) لـ TeleCard - النسخة المطلقة V20.6.1 👑
// 🎯 الوظيفة: المعاملات المالية الآمنة، حماية الثغرات، المزامنة الذكية، والربط
// 🚀 التحديثات المعمارية (V20.6.1):
// 1. Options Firewall: حماية المعاملات من تلاعب فهارس الخيارات (optIdx).
// 2. Exact Clock Sync: استخدام وقت Firestore الحقيقي لمنع تلاعب الثواني في العروض.
// 3. Strict TTL Enforcement: الاعتماد على سياسات Firebase TTL لحذف مفاتيح عدم التكرار.
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");

// 🌐 [السيادة الجغرافية - Sovereign Shield]
setGlobalOptions({ region: 'us-central1' });

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
    MAX_SAFE_AMOUNT: 100000000,
    MAX_URL_LENGTH: 1000
};

// ==========================================
// 🛡️ مصنع المزامنة النظيف (Data Sanitizer & Compiler)
// ==========================================
const generatePublicProductData = (prodData, tiersData) => {
    const publicData = { ...prodData };
    const hiddenKeys = ['costPrice', 'cost_price', 'providerId', 'apiToken', 'vaultPoolId', 'externalId', 'supplierId'];
    
    hiddenKeys.forEach(k => delete publicData[k]);
    
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
            const optClean = { ...opt };
            const optTierPrices = {};
            tiersData.forEach(tier => {
                try { 
                    optTierPrices[tier.id] = FinancialEngine.calculatePrice({ product: prodData, tier: tier, optIdx: idx }).finalPrice; 
                } catch(e) {
                    optTierPrices[tier.id] = SAFE_FALLBACK_PRICE; 
                }
            });
            optClean.tierPrices = optTierPrices;
            hiddenKeys.forEach(k => delete optClean[k]);
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
    if (request.auth?.token?.banned === true) throw new HttpsError('permission-denied', 'عذراً، هذا الحساب محظور من قبل الإدارة.');
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
    const { data } = request;
    const productId = String(data.productId || '');
    let requestedQty = Math.floor(Number(data.qty) || 1);
    const optIdx = data.optIdx !== null && data.optIdx !== undefined ? Number(data.optIdx) : null;
    const finalInputStr = String(data.finalInputStr || '---').substring(0, 500);
    const couponCode = data.couponCode ? String(data.couponCode).trim() : null;
    const idempotencyKey = data.idempotencyKey ? String(data.idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50) : null;
    
    if (!productId) throw new HttpsError('invalid-argument', 'رقم المنتج مفقود.');
    
    // استخدام وقت قاعدة البيانات لضمان دقة المعاملات والعروض
    const serverNow = admin.firestore.Timestamp.now().toMillis();

    try {
        const [offersSnap, tiersSnap] = await Promise.all([
            db.collection('telecard_offers').where('isActive', '==', true).where('targetProds', 'array-contains', productId).get(),
            db.collection('telecard_tiers').get()
        ]);
        const liveOffers = offersSnap.docs.map(d => d.data());
        const tiersData = tiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const cleanOrderId = generateUniqueId();
        const userRef = db.collection('telecard_users').doc(uid);
        const productRef = db.collection('telecard_prods').doc(productId);
        const orderRef = db.collection('telecard_orders').doc(cleanOrderId); 

        let deliveredCodeText = null, isAutoDelivered = false;

        await db.runTransaction(async (transaction) => {
            const [userSnap, productSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(productRef)
            ]);

            if (!userSnap.exists) throw new HttpsError('not-found', 'المستخدم غير موجود.');
            if (!productSnap.exists) throw new HttpsError('not-found', 'المنتج غير متوفر.');

            const userData = userSnap.data();
            const product = productSnap.data();

            if (userData.isBanned === true) throw new HttpsError('permission-denied', 'العملية مرفوضة.');
            if (product.isActive === false || String(product.isAvailable) === 'false') {
                throw new HttpsError('failed-precondition', 'عذراً، هذا المنتج غير متاح حالياً.');
            }

            // 🛡️ حماية ضد التلاعب بخيارات المنتج (Options Firewall)
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
        throw new HttpsError('internal', error.message);
    }
});

// ==========================================
// 💰 2. إرسال طلبات الإيداع
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
    
    if (isNaN(amount) || amount <= 0 || amount > SYSTEM_LIMITS.MAX_SAFE_AMOUNT) throw new HttpsError('out-of-range', 'المبلغ المدخل غير صالح.');

    const receiptUrl = data.receiptUrl ? String(data.receiptUrl).trim() : null;
    if (receiptUrl && receiptUrl.length > SYSTEM_LIMITS.MAX_URL_LENGTH) {
        throw new HttpsError('invalid-argument', 'رابط الإيصال غير صالح أو طويل جداً.');
    }

    try {
        const [ratesSnap, paymentsSnap] = await Promise.all([
            db.collection('telecard_rates').get(),
            db.collection('telecard_payments').get()
        ]);
        
        const liveRates = ratesSnap.docs.map(d => d.data());
        const livePayments = paymentsSnap.docs.map(d => d.data());

        const paymentMethod = livePayments.find(p => p.name === paymentMethodName);
        if (!paymentMethod) throw new HttpsError('not-found', 'طريقة الدفع غير متوفرة.');

        const userRef = db.collection('telecard_users').doc(uid);
        
        return await db.runTransaction(async (transaction) => {
            const userSnap = await transaction.get(userRef);

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

            return { success: true, message: 'تم استلام طلب الإيداع.' };
        });
    } catch (error) { 
        if (error instanceof HttpsError) throw error; 
        throw new HttpsError('internal', 'تعذر إرسال الطلب.'); 
    }
});

// ==========================================
// 👑 3. دوال الإدارة والعمليات المالية
// ==========================================
exports.adminToggleUserBan = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح لك.');
    const { targetUid, isBanned, reason } = request.data;
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
    const { orderId, action, adminNote } = request.data;
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

        let keysRestoredCount = 0;
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
                    transaction.update(keyDoc.ref, { 
                        isSold: false, soldAt: admin.firestore.FieldValue.delete(), 
                        orderId: admin.firestore.FieldValue.delete(), userId: admin.firestore.FieldValue.delete() 
                    });
                    keysRestoredCount++;
                });

                if (keysRestoredCount > 0) {
                    transaction.update(vaultRef, { stockCount: admin.firestore.FieldValue.increment(keysRestoredCount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                }
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
        
        let orderUpdateObj = { status: action, adminNote: String(adminNote || ''), actionTime: admin.firestore.FieldValue.serverTimestamp() };
        if (isRefundingAction && !wasAlreadyRefunded) orderUpdateObj.balanceAfter = newWalletBal;
        if (keysRestoredCount > 0) orderUpdateObj.deliveredCode = admin.firestore.FieldValue.delete();
        if (keysAssignedCount > 0) orderUpdateObj.deliveredCode = deliveredCodeText;
        
        transaction.update(orderRef, orderUpdateObj);

        await logAdminAction(request.auth.uid, 'PROCESS_ORDER', `Order: ${orderId}, Action: ${action}`);
        let finalMsg = `تم تحديث الطلب إلى ${action}`;
        if (keysRestoredCount > 0) finalMsg += ` (وتم استرجاع ${keysRestoredCount} كود للخزنة).`;
        if (keysAssignedCount > 0) finalMsg += ` (وتم سحب ${keysAssignedCount} كود وتسليمه).`;
        
        return { success: true, message: finalMsg };
    });
});

exports.adminProcessDeposit = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { depositId, action, adminNote } = request.data;
    
    return await db.runTransaction(async (transaction) => {
        const depRef = db.collection('telecard_deposits').doc(String(depositId));
        const depSnap = await transaction.get(depRef);
        if (!depSnap.exists) throw new HttpsError('not-found', 'الإيداع غير موجود.');
        
        const depData = depSnap.data();
        if (depData.status === action) throw new HttpsError('failed-precondition', 'هذه هي الحالة الحالية.');
        
        let userRef = db.collection('telecard_users').doc(String(depData.userId));
        let newWalletBal = 0; 
        const wasApproved = depData.status === 'approved';

        const userSnap = await transaction.get(userRef);
        if (userSnap.exists) {
            const ud = userSnap.data();
            const amt = Number(depData.creditedAmount || depData.amount || 0);

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
        
        let depUpdateObj = { status: action, adminNote: String(adminNote || ''), actionTime: admin.firestore.FieldValue.serverTimestamp() };
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
    const { userId, type, amount, adminName } = request.data;
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
    const targetUserId = String(request.data.userId);
    
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
    const targetEmail = request.data.email;
    const setupKey = request.data.setupKey;
    const MASTER_SETUP_KEY = process.env.ADMIN_SETUP_KEY; 

    if (!MASTER_SETUP_KEY) throw new HttpsError('internal', 'النظام غير مهيأ أمنياً.');
    if (!isMasterAdmin(request) && setupKey !== MASTER_SETUP_KEY) throw new HttpsError('permission-denied', 'غير مصرح لك.');
    
    try {
        const user = await admin.auth().getUserByEmail(targetEmail);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        await logAdminAction(request.auth?.uid || 'system_recovery', 'GRANT_ADMIN', `Granted admin to: ${targetEmail}`);
        return { success: true };
    } catch (error) { throw new HttpsError('internal', `فشل المنح: ${error.message}`); }
});

exports.adminDeleteUserData = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { targetUid } = request.data;
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
    const { country, phone, currency } = request.data;
    
    const safeCountry = String(country || '').trim().substring(0, 100);
    const safePhone = String(phone || '').trim().substring(0, 50);
    const cleanCurrency = String(currency || '').trim().toUpperCase().substring(0, 10);
    
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
// 📊 5. محرك الإحصائيات المركزية (On-Demand)
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
// 🛡️ 6. المزامنة الآمنة للمنتجات والمستويات
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
            if (opCount >= 400) { 
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

exports.onTierUpdate = onDocumentUpdated({ document: 'telecard_tiers/{tierId}', timeoutSeconds: 540, retry: true }, async (event) => {
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
        
        if (opCount >= 400) { 
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
// 🔗 8. تصدير دوال الموردين
// ==========================================
const developerApi = require('./developerApi.js');
const supplierEngine = require('./supplierEngine.js');

exports.orderStatusWebhook = developerApi.orderStatusWebhook;
exports.cronRetryWebhooks = developerApi.cronRetryWebhooks;
exports.externalCreateOrder = developerApi.externalCreateOrder;
exports.syncSupplierData = supplierEngine.syncSupplierData;
exports.scheduledSupplierSync = supplierEngine.scheduledSupplierSync;
exports.secureSaveSupplier = supplierEngine.secureSaveSupplier;

// ==========================================
// 📦 9. إدارة صناديق الأكواد (Vault Batching)
// ==========================================
exports.adminSaveVaultCodes = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { poolId, poolName, alertLimit, codesList } = request.data;
    
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
    try {
        const vaultRef = db.collection('telecard_vault').doc(String(request.data.poolId));
        
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