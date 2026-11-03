// ============================================================================
// 🛒 خدمة الطلبات المركزية (services/OrderService.js) - النسخة الماسية V16.2.0 💎
// 🎯 الوظيفة: معالجة الطلبات الموحدة (Retail & B2B API) لضمان اتساق الأمان وحماية رأس المال.
// 🚀 التحديث (V16.2.0 - Pure Single-Source Schema & Zero Redundancy): 
// 1. Zero-Redundancy Schema 🏛️: توحيد المعرفات القياسية (prodId, deliveredCode, originalPrice, categoryId) بدون أي تكرار.
// 2. Client-Currency PricingSnapshot 🧾: حفظ (originalPrice, finalPrice, couponDiscount, offerDiscount) بعملة محفظة العميل.
// 3. BalanceAfter Tracking 💰: تسجيل الرصيد المتبقي (balanceAfter) في وثيقة الطلب لدعم سجل المحفظة والتدقيق الإداري.
// 4. Strict Select QTY Lock 🛡️: الإغلاق المحكم على المنتجات الفرعية (select) بحد أدنى وأقصى (1 و 1) حصرياً من السيرفر.
// 5. Supplier Data Insulation & Network Healing 🛜: عزل supplierId للطلبات الحية فقط، واستعادة الكود عند انقطاع الشبكة.
// ============================================================================

const { HttpsError } = require("firebase-functions/v2/https");
const admin = require('firebase-admin');
const crypto = require('crypto');
const FinancialEngine = require('../financialEngine.js');
const SecurityEngine = require('../securityEngine.js');
const { FinancialSecurityError } = require('../financialEngine.js');
const UserBuilder = require('../utils/UserBuilder.js');

const SYSTEM_LIMITS = {
    MAX_QTY_PER_ORDER: 100, // 🛡️ الحد الأقصى الموحد للمنتجات العادية
    MAX_COUNTER_QTY_PER_ORDER: 5000000,
    MAX_VAULT_QTY_PER_ORDER: 100
};

// 🎮 تطهير كائن مدخلات اللاعب المتعددة (Player ID + Zone/Server ID) بأمان مع ترتيب المفاتيح أبجدياً لضمان ثبات الـ Hash
const sanitizePlayerInputs = (rawInputs) => {
    if (!rawInputs) return null;
    if (Array.isArray(rawInputs)) {
        const cleanedArr = rawInputs
            .slice(0, 5)
            .map(v => SecurityEngine.sanitizeText(String(v ?? ''), 150))
            .filter(Boolean);
        return cleanedArr.length > 0 ? cleanedArr : null;
    }
    if (typeof rawInputs === 'object') {
        const cleanedObj = {};
        const entries = Object.entries(rawInputs)
            .sort(([keyA], [keyB]) => String(keyA).localeCompare(String(keyB)))
            .slice(0, 5);
        for (const [k, v] of entries) {
            const cleanKey = String(k).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 30);
            const cleanVal = SecurityEngine.sanitizeText(String(v ?? ''), 150);
            if (cleanKey && cleanVal) {
                cleanedObj[cleanKey] = cleanVal;
            }
        }
        return Object.keys(cleanedObj).length > 0 ? cleanedObj : null;
    }
    return null;
};

// 🛡️ استعادة وفك تشفير نتيجة الطلب المكرر مع التنظيف الذاتي (Self-Healing Idempotency)
// يحترم قاعدة Firestore الصارمة (All Reads Before Writes) داخل المعاملات الذرية
const restoreIdempotencyResult = async (idempRef, idempData, db, transaction = null) => {
    const storedResult = idempData?.resultData;
    if (!storedResult || typeof storedResult !== 'object') return storedResult;
    const restored = { ...storedResult };

    if (restored._encryptedCode && typeof SecurityEngine.decryptOrderAudit === 'function') {
        const decObj = SecurityEngine.decryptOrderAudit(restored._encryptedCode);
        if (decObj && decObj.code !== undefined) {
            // 📌 [توحيد معماري - المتجر]: المعرف الوحيد لكود التسليم هو deliveredCode (يجب حذف deliveredCodeText من dataManager.js و uiFinance.js)
            restored.deliveredCode = decObj.code;
        }
    }
    delete restored._encryptedCode;

    // 🔄 إذا كان الطلب مخزناً بحالة غير نهائية، نقرأ حالته الحية من جدول الطلبات
    const isNonTerminal = (restored.status && ['pending', 'processing'].includes(restored.status)) || restored.isAutoDelivered === false;
    if (idempData?.orderId && db && isNonTerminal) {
        try {
            const ordRef = db.collection('telecard_orders').doc(String(idempData.orderId));
            const liveOrdSnap = transaction ? await transaction.get(ordRef) : await ordRef.get();
            if (liveOrdSnap.exists) {
                const liveOrd = liveOrdSnap.data();
                // 🛡️ إذا انتهى الطلب السابق بالرفض أو الاسترجاع، نحرر القفل ونعيد null للسماح بإنشاء طلب جديد فوراً
                if (['rejected', 'refunded', 'returned'].includes(liveOrd.status)) {
                    if (idempRef && !transaction) {
                        await idempRef.delete().catch(() => {});
                    }
                    return null;
                }
                if (restored.status !== undefined && liveOrd.status) {
                    restored.status = liveOrd.status;
                }
                if (liveOrd.status === 'completed' || liveOrd.isAutoDelivered === true) {
                    restored.isAutoDelivered = true;
                }
                if (liveOrd.deliveredCode) {
                    restored.deliveredCode = liveOrd.deliveredCode;
                }
            }
        } catch (e) {
            if (e instanceof HttpsError) throw e;
        }
    }

    return restored;
};

// 🛡️ تعطيل العروض أو الكوبونات التي تكسر رأس المال تلقائياً في الخلفية
const quarantineBrokenPromos = async (db, brokenOffersMap, brokenCouponInfo = null) => {
    try {
        if (brokenOffersMap && brokenOffersMap.size > 0) {
            for (const [offId, info] of brokenOffersMap.entries()) {
                const offRef = db.collection('telecard_offers').doc(String(offId));
                const wasDisabled = await db.runTransaction(async (tx) => {
                    const snap = await tx.get(offRef);
                    if (!snap.exists || snap.data().isActive === false) return false;
                    tx.update(offRef, {
                        isActive: false,
                        requiresAdminAttention: true,
                        syncNote: `⛔ تم إيقاف العرض آلياً أثناء الشراء لأنه يكسر رأس المال للمنتج (${info.prodName}).`
                    });
                    return true;
                }).catch(() => false);

                if (wasDisabled) {
                    SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                        '🚨 إيقاف عرض ترويجي خاسر تلقائياً!',
                        `تم إيقاف العرض (${info.offerName}) آلياً أثناء عملية شراء لأنه يكسر التكلفة الآمنة للمنتج (${info.prodName})، واستمر بيع المنتج بالسعر الطبيعي.`,
                        { target: 'offers', offerId: String(offId) }
                    ).catch(() => {});
                }
            }
        }

        if (brokenCouponInfo && brokenCouponInfo.ref) {
            const wasCouponDisabled = await db.runTransaction(async (tx) => {
                const snap = await tx.get(brokenCouponInfo.ref);
                if (!snap.exists || snap.data().isActive === false) return false;
                tx.update(brokenCouponInfo.ref, {
                    isActive: false,
                    requiresAdminAttention: true,
                    syncNote: `⛔ تم إيقاف الكوبون آلياً أثناء محاولة شراء لأنه يكسر رأس المال للمنتج (${brokenCouponInfo.prodName}).`
                });
                return true;
            }).catch(() => false);

            if (wasCouponDisabled) {
                SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                    '🚨 إيقاف كوبون خصم خاسر تلقائياً!',
                    `تم إيقاف الكوبون (${brokenCouponInfo.code}) آلياً لأن قيمته تكسر التكلفة الآمنة للمنتج (${brokenCouponInfo.prodName}).`,
                    { target: 'coupons', couponId: String(brokenCouponInfo.ref.id) }
                ).catch(() => {});
            }
        }
    } catch (e) {
        console.error('[Quarantine Broken Promos Error]:', e);
    }
};

class OrderService {
    /**
     * @param {string} uid معرف المستخدم
     * @param {object} requestData بيانات الطلب
     * @param {object} db كائن قاعدة البيانات
     * @param {object} authData بيانات التوثيق (تكون null في حالة الـ API)
     * @param {object} context سياق الطلب (يحدد ما إذا كان من المتجر أو من الـ API)
     */
    static async processNewOrder(uid, requestData, db, authData = null, context = { isApi: false }) {
        const data = requestData || {};
        // 📌 [توحيد معماري - المتجر]: المعرف القياسي للمنتج هو prodId (ويقبل productId من بوابة API الخارجية)
        const prodId = String(data.prodId || data.productId || '').trim();
        
        if (data.idempotencyKey && String(data.idempotencyKey).length > 200) {
            throw new HttpsError('invalid-argument', 'المفتاح طويل جداً ومرفوض أمنياً.');
        }
        
        let rawQty = Number(data.qty);
        if (isNaN(rawQty) || rawQty <= 0) throw new HttpsError('invalid-argument', 'الكمية المدخلة غير صالحة.');
        let finalQty = Math.floor(rawQty);
        if (finalQty > SYSTEM_LIMITS.MAX_COUNTER_QTY_PER_ORDER) {
            throw new HttpsError('invalid-argument', `الحد الأقصى المسموح به في الطلب الواحد هو ${SYSTEM_LIMITS.MAX_COUNTER_QTY_PER_ORDER}.`);
        }    
        let optIdx = null;
        if (data.optIdx !== null && data.optIdx !== undefined && String(data.optIdx).trim() !== '') {
            const parsedOptIdx = Number(data.optIdx);
            if (!Number.isNaN(parsedOptIdx) && parsedOptIdx >= 0) optIdx = Math.floor(parsedOptIdx);
            else throw new HttpsError('invalid-argument', 'الخيار المحدد غير صالح.');
        }
        
        const finalInputStr = SecurityEngine.sanitizeText(String(data.finalInputStr || data.input || '---'), 500);
        const sanitizedPlayerInputs = sanitizePlayerInputs(data.playerInputs);
        
        const couponCode = (context.isApi || !data.couponCode) ? null : String(data.couponCode).trim().toUpperCase();
        const safeCouponMapKey = couponCode ? couponCode.replace(/[.~*/\[\]]/g, '_') : null;
        
        const explicitIdempotencyKey = data.idempotencyKey ? String(data.idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50) : null;
        
        // 🛡️ [قفل الانزلاق السعري المزدوج - Dual Price Slippage Lock]
        const hasExpectedBase = data.expectedBasePrice !== undefined && data.expectedBasePrice !== null && String(data.expectedBasePrice).trim() !== '';
        const hasExpectedDisplay = data.expectedDisplayPrice !== undefined && data.expectedDisplayPrice !== null && String(data.expectedDisplayPrice).trim() !== '';
        if (!context.isApi && (!hasExpectedBase || !hasExpectedDisplay)) {
            throw new HttpsError('invalid-argument', 'بيانات التسعير المتوقعة (بالدولار وبالعملة المحلية) مفقودة. يرجى تحديث الصفحة والمحاولة مجدداً.');
        }
        const expectedBasePrice = hasExpectedBase ? Number(data.expectedBasePrice) : null;
        const expectedDisplayPrice = hasExpectedDisplay ? Number(data.expectedDisplayPrice) : null;

        if ((expectedBasePrice !== null && (!Number.isFinite(expectedBasePrice) || expectedBasePrice <= 0)) ||
            (expectedDisplayPrice !== null && (!Number.isFinite(expectedDisplayPrice) || expectedDisplayPrice <= 0))) {
            throw new HttpsError('invalid-argument', 'قيمة السعر المتوقع غير صالحة.');
        }
        const hasExpectedPrice = (expectedBasePrice !== null || expectedDisplayPrice !== null);
        
        if (!prodId) throw new HttpsError('invalid-argument', 'رقم المنتج مفقود.');
        
        const cleanOrderId = SecurityEngine.generateUniqueId('TC');
        const safeCouponCode = couponCode || 'NO_COUPON';
        const playerInputsHashPart = sanitizedPlayerInputs ? JSON.stringify(sanitizedPlayerInputs) : '';
        const requestPayloadString = `${prodId}|${finalQty}|${optIdx}|${finalInputStr}|${playerInputsHashPart}|${expectedBasePrice}|${expectedDisplayPrice}|${safeCouponCode}`;
        const requestHash = SecurityEngine.generateSha256Hash(requestPayloadString);

        const currentGlobalMs = admin.firestore.Timestamp.now().toMillis();

        // 🛡️ لعملاء المتجر: قفل موحد حسب بصمة الطلب لمدة 60 ثانية لمنع تكرار نفس الطلب في نفس الدقيقة، مع دعم استعادة النتيجة عند انقطاع الشبكة
        // لتجار الـ API: استخدام مفتاح الـ Idempotency-Key الصريح بصلاحية 30 يوماً
        const idempotencyKey = context.isApi
            ? (explicitIdempotencyKey || `api_${requestHash.substring(0, 24)}`)
            : `retail_1m_${requestHash.substring(0, 24)}`;
        const idempotencyTtlMs = context.isApi ? (30 * 24 * 60 * 60 * 1000) : (60 * 1000);

        // 🛡️ فحص مبكر لمفتاح منع التكرار
        let idempotencyRef = null;
        if (idempotencyKey) {
            idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
            const idempSnap = await idempotencyRef.get();
            if (idempSnap.exists) {
                const storedIdempData = idempSnap.data();
                const expMs = storedIdempData.expiresAt?.toMillis ? storedIdempData.expiresAt.toMillis() : 0;
                if (expMs > currentGlobalMs) {
                    if (storedIdempData.requestHash !== requestHash) {
                        throw new HttpsError('already-exists', 'تضارب في مفتاح منع التكرار: تفاصيل الطلب مختلفة.');
                    }
                    const restoredEarly = await restoreIdempotencyResult(idempotencyRef, storedIdempData, db, null);
                    if (restoredEarly) {
                        const isSameAttemptRetry = Boolean(
                            explicitIdempotencyKey &&
                            storedIdempData.clientAttemptKey &&
                            storedIdempData.clientAttemptKey === explicitIdempotencyKey
                        );
                        if (!context.isApi && !isSameAttemptRetry) {
                            throw new HttpsError('already-exists', 'لا يمكن تكرار نفس الطلب خلال نفس الدقيقة، يرجى المحاولة بعد دقيقة.');
                        }
                        return restoredEarly;
                    }
                }
            }
        }

        const brokenOffersToDisable = new Map();
        let brokenCouponToDisable = null;

        try {
            return await SecurityEngine.withCollisionRetry(3, 'CreateOrder', async () => {
                const productRef = db.collection('telecard_prods').doc(prodId);
                const productOutSnap = await productRef.get();
                
                if (!productOutSnap.exists) throw new HttpsError('not-found', 'المنتج غير متوفر.');
                const productOut = productOutSnap.data();

                // 🛡️ [قفل الأمان الصارم للمنتج الأب]: يرفض البيع إذا كان المنتج معطلاً أو غير متاح أو مجمداً أمنياً
                if (
                    productOut.isActive === false ||
                    String(productOut.isAvailable) === 'false' ||
                    productOut.isAutoFrozen === true ||
                    productOut.requiresAdminAttention === true
                ) {
                    throw new HttpsError('failed-precondition', context.isApi ? 'Product is currently unavailable.' : 'المنتج غير متاح حالياً.');
                }

                const parentSupplierIdOut = productOut.supplierId ? String(productOut.supplierId).trim() : null;

                let activeOptionOut = null;
                if (productOut.type === 'select') {
                    if (optIdx === null || !Array.isArray(productOut.options) || !productOut.options[optIdx]) {
                        throw new HttpsError('invalid-argument', 'يرجى تحديد باقة أو فئة صالحة للمنتج.');
                    }

                    // 🛡️ [قاعدة الأمان الموحدة]: إذا كان هناك تضارب موردين أو باقة نشطة بتكلفة صفرية يتوقف المنتج الأب بالكامل
                    const hasAnyCorruptedActiveOpt = productOut.options.some(opt => {
                        if (!opt || opt.isActive === false) return false;
                        const optCost = Number(opt.costPrice ?? opt.cost_price ?? 0);
                        const optSupp = opt.supplierId ? String(opt.supplierId).trim() : null;
                        const hasSupplierMismatch = Boolean(parentSupplierIdOut && optSupp && optSupp !== parentSupplierIdOut);
                        return optCost <= 0 || hasSupplierMismatch;
                    });
                    if (hasAnyCorruptedActiveOpt) {
                        throw new HttpsError('failed-precondition', context.isApi ? 'Product is currently unavailable due to pricing/supplier lock.' : 'المنتج غير متاح حالياً للمراجعة الإدارية.');
                    }

                    activeOptionOut = productOut.options[optIdx];
                    if (activeOptionOut.isActive === false || String(activeOptionOut.isAvailable) === 'false') {
                        throw new HttpsError('failed-precondition', context.isApi 
                            ? 'Selected option is currently unavailable.' 
                            : `عذراً، الباقة المحددة (${activeOptionOut.name || 'الخيار'}) غير متوفرة حالياً.`);
                    }
                }

                // 🛡️ الاعتماد على خزنة الخيار الفرعي إذا وجدت، وإلا نستخدم خزنة المنتج الأب
                const targetVaultPoolIdOut = (activeOptionOut && activeOptionOut.vaultPoolId) ? activeOptionOut.vaultPoolId : productOut.vaultPoolId;

                // 🔗 وحدة المورد الصارمة: المورد يؤخذ من المنتج الأب الموحد
                const resolvedSupplierIdOut = parentSupplierIdOut || (activeOptionOut && activeOptionOut.supplierId ? String(activeOptionOut.supplierId).trim() : null);
                const rawExtIdOut = activeOptionOut ? activeOptionOut.externalId : productOut.externalId;
                const resolvedExtProdIdOut = rawExtIdOut ? String(rawExtIdOut).trim() : null;
                const isLiveSupplierOrderOut = Boolean(!targetVaultPoolIdOut && resolvedSupplierIdOut && resolvedExtProdIdOut);

                if (productOut.type === 'select' && finalQty !== 1) {
                    throw new HttpsError('failed-precondition', 'الحد الأقصى لشراء هذا المنتج هو 1.');
                }
                if (targetVaultPoolIdOut && finalQty > SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER) {
                    throw new HttpsError('invalid-argument', `الحد الأقصى لشراء الأكواد الفورية في الطلب الواحد هو ${SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER}.`);
                }
                if (productOut.type !== 'counter' && finalQty > SYSTEM_LIMITS.MAX_QTY_PER_ORDER) {
                    throw new HttpsError('invalid-argument', `الحد الأقصى المسموح به في الطلب الواحد هو ${SYSTEM_LIMITS.MAX_QTY_PER_ORDER}.`);
                }

                let candidateKeyDocs = [];
                let vaultRef = null;

                if (targetVaultPoolIdOut) {
                    vaultRef = db.collection('telecard_vault').doc(String(targetVaultPoolIdOut));
                    
                    const randomHex = crypto.randomBytes(8).toString('hex'); 
                    const randomMarker = `key_${randomHex}`;
                    
                  let keysQuerySnap = await vaultRef.collection('keys')
    .where('isSold', '==', false)
    .where(admin.firestore.FieldPath.documentId(), '>=', randomMarker)
    .limit(finalQty + 4)
    .get();

if (keysQuerySnap.size < finalQty) {
    const remainingQty = finalQty - keysQuerySnap.size;
    const wrapSnap = await vaultRef.collection('keys')
        .where('isSold', '==', false)
        .where(admin.firestore.FieldPath.documentId(), '<', randomMarker)
        .limit(remainingQty + 6)
        .get();                        const uniqueMap = new Map();
                        keysQuerySnap.docs.forEach(doc => uniqueMap.set(doc.id, doc));
                        wrapSnap.docs.forEach(doc => uniqueMap.set(doc.id, doc));

                        const allAvailableDocs = Array.from(uniqueMap.values());
                        if (allAvailableDocs.length < finalQty) {
                            throw new HttpsError('failed-precondition', context.isApi ? 'Product out of stock.' : 'عذراً، الكمية المختارة غير متوفرة حالياً، يرجى اختيار كمية أقل.');
                        }
                        candidateKeyDocs = allAvailableDocs.sort(() => 0.5 - Math.random()).slice(0, finalQty);
                    } else {
                        candidateKeyDocs = keysQuerySnap.docs.sort(() => 0.5 - Math.random()).slice(0, finalQty);
                    }
                } else if (!isLiveSupplierOrderOut) {
                    const hasOptionStock = activeOptionOut && activeOptionOut.stockCount !== undefined && activeOptionOut.stockCount !== null;
                    const hasParentStock = productOut.stockCount !== undefined && productOut.stockCount !== null;
                    if (hasOptionStock || hasParentStock) {
                        const currentStock = hasOptionStock ? Number(activeOptionOut.stockCount) : Number(productOut.stockCount);
                        if (currentStock < finalQty) {
                            throw new HttpsError('failed-precondition', context.isApi ? 'Product out of stock.' : 'عذراً، الكمية المختارة غير متوفرة حالياً، يرجى اختيار كمية أقل.');
                        }
                    }
                }

                return await db.runTransaction(async (transaction) => {
                    const serverNow = admin.firestore.Timestamp.now().toMillis();

                    if (idempotencyRef) {
                        const idempSnap = await transaction.get(idempotencyRef);
                        if (idempSnap.exists) {
                            const storedIdempData = idempSnap.data();
                            const expMs = storedIdempData.expiresAt?.toMillis ? storedIdempData.expiresAt.toMillis() : 0;
                            if (expMs > serverNow) {
                                if (storedIdempData.requestHash !== requestHash) {
                                    throw new HttpsError('already-exists', 'تضارب في مفتاح منع التكرار: تفاصيل الطلب مختلفة.');
                                }
                                const restoredTx = await restoreIdempotencyResult(idempotencyRef, storedIdempData, db, transaction);
                                if (restoredTx) {
                                    const isSameAttemptRetry = Boolean(
                                        explicitIdempotencyKey &&
                                        storedIdempData.clientAttemptKey &&
                                        storedIdempData.clientAttemptKey === explicitIdempotencyKey
                                    );
                                    if (!context.isApi && !isSameAttemptRetry) {
                                        throw new HttpsError('already-exists', 'لا يمكن تكرار نفس الطلب خلال نفس الدقيقة، يرجى المحاولة بعد دقيقة.');
                                    }
                                    return restoredTx;
                                }
                            }
                        }
                    }

                    // 📌 [توحيد معماري - المتجر (dataManager.js & script.js & uiCore.js)]:
                    // وثيقة حالة النظام هي telecard_system/singleton وتحتوي حصراً على (maint, msg, freeze, freezeMsg)
                    const userRef = db.collection('telecard_users').doc(uid);
                    const sysRef = db.collection('telecard_system').doc('singleton');
                    const settingsRef = db.collection('telecard_settings').doc('singleton');
                    const [userSnap, liveProdSnap, sysSnap, settingsSnap] = await Promise.all([
                        transaction.get(userRef),
                        transaction.get(productRef),
                        transaction.get(sysRef),
                        transaction.get(settingsRef)
                    ]);

                    const sysState = sysSnap.exists ? sysSnap.data() : {};
                    if (sysState.maint === true) {
                        throw new HttpsError('unavailable', context.isApi ? 'Store is currently under maintenance.' : (sysState.msg || 'المتجر في وضع الصيانة حالياً.'));
                    }
                    if (sysState.freeze === true) {
                        throw new HttpsError('failed-precondition', context.isApi ? 'Financial operations are temporarily frozen.' : (sysState.freezeMsg || 'العمليات المالية مجمدة مؤقتاً.'));
                    }

                    if (!liveProdSnap.exists) throw new HttpsError('not-found', 'المنتج غير متوفر.');
                    const product = { ...liveProdSnap.data(), id: liveProdSnap.id };

                    // 🛡️ [قفل الأمان الذري الصارم للمنتج الأب داخل المعاملة]
                    if (
                        product.isActive === false ||
                        String(product.isAvailable) === 'false' ||
                        product.isAutoFrozen === true ||
                        product.requiresAdminAttention === true
                    ) {
                        throw new HttpsError('failed-precondition', context.isApi ? 'Product is currently unavailable.' : 'المنتج غير متاح حالياً.');
                    }

                    const parentSupplierId = product.supplierId ? String(product.supplierId).trim() : null;
                    
                    let activeOption = null;
                    if (product.type === 'select') {
                        if (optIdx === null || !Array.isArray(product.options) || !product.options[optIdx]) {
                            throw new HttpsError('invalid-argument', 'يرجى تحديد باقة أو فئة صالحة للمنتج.');
                        }

                        const hasLiveCorruptedActiveOpt = product.options.some(opt => {
                            if (!opt || opt.isActive === false) return false;
                            const optCost = Number(opt.costPrice ?? opt.cost_price ?? 0);
                            const optSupp = opt.supplierId ? String(opt.supplierId).trim() : null;
                            const hasSupplierMismatch = Boolean(parentSupplierId && optSupp && optSupp !== parentSupplierId);
                            return optCost <= 0 || hasSupplierMismatch;
                        });
                        if (hasLiveCorruptedActiveOpt) {
                            throw new HttpsError('failed-precondition', context.isApi ? 'Product is currently unavailable due to pricing/supplier lock.' : 'المنتج غير متاح حالياً للمراجعة الإدارية.');
                        }

                        activeOption = product.options[optIdx];
                        if (activeOption.isActive === false || String(activeOption.isAvailable) === 'false') {
                            throw new HttpsError('failed-precondition', context.isApi 
                                ? 'Selected option is currently unavailable.' 
                                : `عذراً، الباقة المحددة (${activeOption.name || 'الخيار'}) غير متوفرة حالياً.`);
                        }
                    }

                    const targetVaultPoolId = (activeOption && activeOption.vaultPoolId) ? activeOption.vaultPoolId : product.vaultPoolId;

                    if (String(targetVaultPoolId || '') !== String(targetVaultPoolIdOut || '')) {
                        throw new Error('CONTENTION_COLLISION_RETRY');
                    }

                    const resolvedSupplierId = parentSupplierId || (activeOption && activeOption.supplierId ? String(activeOption.supplierId).trim() : null);
                    const rawExternalId = activeOption ? activeOption.externalId : product.externalId;
                    const resolvedExternalProdId = rawExternalId ? String(rawExternalId).trim() : null;
                    const isLiveSupplierOrder = Boolean(!targetVaultPoolId && resolvedSupplierId && resolvedExternalProdId);

                    // 🛡️ عزل صارم لمعرف المورد: لا يُسجل على الطلب إلا إذا كان طلباً موجهاً للمورد فعلياً
                    const effectiveSupplierId = isLiveSupplierOrder ? resolvedSupplierId : null;
                    const effectiveExternalProdId = isLiveSupplierOrder ? resolvedExternalProdId : null;

                    // 🛡️ الإغلاق المحكم على المنتجات الفرعية (select) بحد أدنى وأقصى (1 و 1) حصرياً
                    const prodMinQty = product.type === 'select' ? 1 : Math.max(1, Number(product.minQty) || 1);
                    const maxAllowedForType = product.type === 'select' ? 1 : (
                        targetVaultPoolId ?
                        SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER :
                        (product.type === 'counter' ? SYSTEM_LIMITS.MAX_COUNTER_QTY_PER_ORDER : SYSTEM_LIMITS.MAX_QTY_PER_ORDER)
                    );
                    const adminMaxLimit = Number(product.type === 'simple' ? (product.simpleMax || product.maxQty) : product.maxQty) || 0;
                    const prodMaxQty = product.type === 'select' ? 1 : (
                        adminMaxLimit > 0 ?
                        Math.min(adminMaxLimit, maxAllowedForType) :
                        maxAllowedForType
                    );

                    if (finalQty < prodMinQty) throw new HttpsError('failed-precondition', `الحد الأدنى لشراء هذا المنتج هو ${prodMinQty}.`);
                    if (finalQty > prodMaxQty) throw new HttpsError('failed-precondition', `الحد الأقصى لشراء هذا المنتج هو ${prodMaxQty}.`);             

                    if (!targetVaultPoolId && !isLiveSupplierOrder) {
                        const hasLiveOptionStock = activeOption && activeOption.stockCount !== undefined && activeOption.stockCount !== null;
                        const hasLiveParentStock = product.stockCount !== undefined && product.stockCount !== null;
                        if (hasLiveOptionStock || hasLiveParentStock) {
                            const liveStock = hasLiveOptionStock ? Number(activeOption.stockCount) : Number(product.stockCount);
                            if (liveStock < finalQty) {
                                throw new HttpsError('failed-precondition', context.isApi ? 'Product out of stock.' : 'عذراً، الكمية المختارة غير متوفرة حالياً، يرجى اختيار كمية أقل.');
                            }
                        }
                    }

                    // 🚀 استدعاء النظام المالي مع بيانات الجدار الناري المخبأة لتوفير عمليات القراءة
                    const { ratesData, tiersData, liveOffers, bannedIps: cachedBannedIps, bannedDevices: cachedBannedDevices } = await FinancialEngine.fetchSystemData(transaction, db);

                    let verifiedKeyDocs = [];
                    if (vaultRef && candidateKeyDocs.length > 0) {
                        const keyRefs = candidateKeyDocs.map(doc => doc.ref);
                        const keySnaps = await transaction.getAll(...keyRefs); 
                        const hasCollision = keySnaps.some(k => !k.exists || k.data().isSold === true);
                        if (hasCollision) throw new Error('CONTENTION_COLLISION_RETRY');
                        verifiedKeyDocs = keySnaps;
                    }

                    if (context.isApi && !userSnap.exists) {
                        throw new HttpsError('permission-denied', 'Account not found.');
                    }

                    const defaultRetailTier = tiersData.find(t => t.isDefault && t.type !== 'api') || tiersData.find(t => t.isDefault) || tiersData[0];
                    let userData = userSnap.exists ? userSnap.data() : UserBuilder.buildInitialProfile({ 
                        uid: uid, 
                        email: authData?.email, 
                        name: authData?.name, 
                        tierId: defaultRetailTier?.id || 'TIER_DEFAULT'
                    });

                    if (context.isApi && userData.isApiMerchant !== true) {
                        throw new HttpsError('permission-denied', 'Unauthorized: Account is not configured as an API Merchant.');
                    }

                    // 🚀 [إصلاح أمني صارم]: دمج فحص الحذف والحظر، حظر الـ IP، والتقييد من active_configs بـ 0 قراءات إضافية
                    const globalSettings = settingsSnap.exists ? settingsSnap.data() : {};
                    const bannedIps = cachedBannedIps?.length > 0 ? cachedBannedIps : (Array.isArray(globalSettings.bannedIps) ? globalSettings.bannedIps : []);
                    const bannedDevices = cachedBannedDevices?.length > 0 ? cachedBannedDevices : (Array.isArray(globalSettings.bannedDevices) ? globalSettings.bannedDevices : []);
                    
                    const effectiveIp = context.clientIp || userData.lastIp || '';
                    const userDevices = Array.isArray(userData.devicePrints) ? userData.devicePrints : [];

                    if (
                        userData.isDeleted ||
                        userData.isBanned ||
                        userData.isIpBanned ||
                        userData.isRestricted ||
                        (effectiveIp && bannedIps.includes(effectiveIp)) ||
                        userDevices.some(dev => bannedDevices.includes(dev))
                    ) {
                        throw new HttpsError('permission-denied', context.isApi ? 'Account or IP is restricted/banned.' : 'العملية مرفوضة: الحساب مقيد أو محظور.');
                    }
                    
                    if (userData.isVerified !== true) throw new HttpsError('failed-precondition', 'يجب استكمال إعداد حسابك أولاً (KYC).');

                    // 🚀 [فرض الـ KYC على المشتريات]: مطابقة قفل التوثيق السحابي مع الإيداعات ولوحة الإدارة
                    const kycConfig = globalSettings.kycConfig || { mode: 'off', targetedTiers: [] };
                    const userTierIdStr = String(userData.tierId || 'TIER_DEFAULT');
                    const isTierTargetedForKyc = Array.isArray(kycConfig.targetedTiers) && kycConfig.targetedTiers.map(String).includes(userTierIdStr);
                    const isKycRequiredForOrder = kycConfig.mode === 'all' ||
                        ((kycConfig.mode === 'specific' || kycConfig.mode === 'spec') && isTierTargetedForKyc);
                    
                    if (isKycRequiredForOrder && userData.kycStatus !== 'approved' && userData.kycStatus !== 'verified') {
                        throw new HttpsError('failed-precondition', context.isApi ? 'Merchant KYC verification is required for this tier.' : 'يرجى توثيق هويتك (KYC) أولاً لإتمام عملية الشراء.');
                    }

                    const activeTierObj = FinancialEngine.getUserTier(userData, tiersData);
                    const finalProductName = activeOption ? `${product.name} (${activeOption.name})` : product.name;

                    // 🛡️ فحص سلامة تسعير المنتج الأساسي أولاً (بدون أي عرض أو كوبون)
                    let baseOrderSim = null;
                    try {
                        baseOrderSim = FinancialEngine.calculateOrderTotal({
                            product: product,
                            tier: activeTierObj,
                            offer: null,
                            coupon: null,
                            optIdx: optIdx,
                            requireServerCost: true
                        }, finalQty);
                    } catch (baseErr) {
                        if (baseErr instanceof FinancialSecurityError) throw new HttpsError('invalid-argument', baseErr.message.replace('[SECURITY] ', ''));
                        throw baseErr;
                    }

                    const isBaseProductHealthy = Boolean(baseOrderSim && !baseOrderSim.isFirewallViolated && baseOrderSim.totalFinalPrice > 0);

                    let activeOffer = null;
                    if (!context.isApi && isBaseProductHealthy) {
                        const matchingOffers = liveOffers.filter(off => {
                            if (off.type === 'fake' || off.type === 'badge_only') return false;             
                            const expMs = off.expiryDate ? FinancialEngine.parseSafeTime(off.expiryDate) : 0;
                            const startMs = off.startDate ? FinancialEngine.parseSafeTime(off.startDate) : 0;
                        
                            // 📌 [توحيد معماري - المتجر والأدمن]: المعرف القياسي للقسم في المنتج هو categoryId (أو مصفوفة categoryIds)
                            const prodCats = [].concat(product.categoryId, product.categoryIds).filter(Boolean).map(String);
                            const hasProds = Array.isArray(off.targetProds) && off.targetProds.length > 0;
                            const hasCats = Array.isArray(off.targetCategories) && off.targetCategories.length > 0;
                            const isProdMatch = hasProds ? off.targetProds.map(String).includes(prodId) : false;
                            const isCatMatch = hasCats ? off.targetCategories.some(cid => prodCats.includes(String(cid))) : false;

                            return (expMs === 0 || expMs > serverNow) &&
                                   (startMs === 0 || startMs <= serverNow) &&
                                   (!off.targetTiers || off.targetTiers.length === 0 || off.targetTiers.includes(String(activeTierObj.id))) &&
                                   ((!hasProds && !hasCats) || isProdMatch || isCatMatch);
                        });

                        if (matchingOffers.length > 0) {
                            const safeOffersWithDiscount = [];
                            for (const off of matchingOffers) {
                                try {
                                    const sim = FinancialEngine.calculateOrderTotal({
                                        product: product,
                                        tier: activeTierObj,
                                        offer: off,
                                        coupon: null,
                                        optIdx: optIdx,
                                        requireServerCost: true
                                    }, finalQty);
                                    if (!sim.isFirewallViolated && (Number(sim.totalOfferDiscount || 0) > 0 || Boolean(sim.offerName))) {
                                        safeOffersWithDiscount.push({
                                            offer: off,
                                            discountUsd: Number(sim.totalOfferDiscount || 0),
                                            specificity: (Array.isArray(off.targetProds) && off.targetProds.map(String).includes(prodId)) ? 2 : ((Array.isArray(off.targetCategories) && off.targetCategories.length > 0) ? 1 : 0)
                                        });
                                    } else if (sim.isFirewallViolated && off.id) {
                                        // 🛡️ العرض يكسر رأس المال: يتم استبعاده فوراً ليستمر بيع المنتج، ويُسجل لتعطيله آلياً
                                        brokenOffersToDisable.set(String(off.id), {
                                            offerName: off.name || off.id,
                                            prodName: finalProductName
                                        });
                                    }
                                } catch (e) {}
                            }
                            
                            if (safeOffersWithDiscount.length > 0) {
                                safeOffersWithDiscount.sort((a, b) => {
                                    if (b.specificity !== a.specificity) return b.specificity - a.specificity;
                                    return b.discountUsd - a.discountUsd;
                                });
                                activeOffer = safeOffersWithDiscount[0].offer;
                            }
                        }              
                    }
                    
                    let verifiedCouponData = null; 
                    let couponRef = null;
                    let pricingSnapshot = null;

                    try {
                        if (couponCode && !context.isApi) {
                            const couponQuerySnap = await transaction.get(db.collection('telecard_coupons').where('code', '==', couponCode).limit(1));
                            if (couponQuerySnap.empty) throw new FinancialSecurityError('كوبون الخصم غير صالح أو منتهي الصلاحية.');
                            couponRef = couponQuerySnap.docs[0].ref;
                            
                            verifiedCouponData = couponQuerySnap.docs[0].data();
                            
                            const validationResult = FinancialEngine.validateCoupon(couponCode, product, finalQty, optIdx, { ...userData, uid: uid, id: uid }, activeTierObj, [verifiedCouponData], serverNow, activeOffer);
                            if (!validationResult.valid) throw new FinancialSecurityError(validationResult.msg);
                        }
                        
                        pricingSnapshot = FinancialEngine.calculateOrderTotal({
                            product: product,
                            tier: activeTierObj,
                            offer: activeOffer,
                            coupon: verifiedCouponData,
                            optIdx: optIdx,
                            requireServerCost: true
                        }, finalQty);
                        
                    } catch (err) {
                        if (err instanceof FinancialSecurityError) throw new HttpsError('invalid-argument', err.message.replace('[SECURITY] ', ''));
                        throw err;
                    }
                    
                    if (!pricingSnapshot || pricingSnapshot.isFirewallViolated || pricingSnapshot.rejectionReason) {
                        // 🛡️ إذا كان المنتج الأساسي سليماً ولكن الكوبون كسر التكلفة الآمنة، نوقف الكوبون فوراً في قاعدة البيانات
                        if (isBaseProductHealthy && verifiedCouponData && couponRef && pricingSnapshot?.isFirewallViolated) {
                            brokenCouponToDisable = {
                                ref: couponRef,
                                code: couponCode,
                                prodName: finalProductName
                            };
                            const couponFirewallErr = new Error('COUPON_MARGIN_VIOLATION');
                            couponFirewallErr.userMsg = 'عذراً، هذا الكوبون لم يعد متاحاً لهذا المنتج لحماية السعر الأساسي. يرجى إزالة الكوبون وإتمام الشراء.';
                            throw couponFirewallErr;
                        }

                        if (pricingSnapshot?.isFirewallViolated && !couponCode) {
                            SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                                '🚨 الجدار الناري أوقف عملية بيع!',
                                `المنتج (${finalProductName}) تم منع بيعه لأن التسعير الأساسي يكسر رأس المال.`,
                                { target: 'products', prodId: prodId }
                            ).catch(() => {});
                        }
                        throw new HttpsError('permission-denied', pricingSnapshot?.rejectionReason || 'العملية مرفوضة لحماية رأس المال.');
                    }

                    if (!Number.isFinite(pricingSnapshot.costUsd) || pricingSnapshot.costUsd <= 0 || !Number.isFinite(pricingSnapshot.totalCostUsd) || pricingSnapshot.totalCostUsd <= 0) {
                        throw new HttpsError('permission-denied', 'العملية مرفوضة أمنياً: تكلفة المنتج أو الباقة تساوي صفراً.');
                    }

                    const exactBaseUsdPrice = Number(pricingSnapshot.totalFinalPrice);
                    if (!Number.isFinite(exactBaseUsdPrice) || exactBaseUsdPrice <= 0) {
                        throw new HttpsError('permission-denied', 'غير مسموح بشراء منتجات بصفر أو بسعر غير صالح.');
                    }

                    const userWalletCurrency = String(userData.baseCurrency || 'USD').toUpperCase();
                    const toWalletCurr = (usdVal) => {
                        const num = Number(usdVal || 0);
                        if (num <= 0) return 0;
                        if (userWalletCurrency === 'USD') return FinancialEngine.sanitizeAmount(num);
                        return FinancialEngine.convertViaUSDHelper(num, 'USD', userWalletCurrency, ratesData, 'round', 'pricing');
                    };

                    const exactLocalPrice = Number(toWalletCurr(exactBaseUsdPrice));
                    const exactLocalOriginalPrice = Number(toWalletCurr(pricingSnapshot.totalOriginalPrice));
                    const exactLocalCouponDiscount = Number(toWalletCurr(pricingSnapshot.totalCouponDiscount));
                    const exactLocalOfferDiscount = Number(toWalletCurr(pricingSnapshot.totalOfferDiscount));

                    if (hasExpectedPrice) {
                        const MAX_ROUNDING_TOLERANCE = 0.05;
                        const localRoundingTolerance = Math.max(MAX_ROUNDING_TOLERANCE, exactLocalPrice * 0.001);
                        
                        if (expectedBasePrice !== null && expectedBasePrice < (exactBaseUsdPrice - MAX_ROUNDING_TOLERANCE)) {
                            throw new HttpsError('aborted', context.isApi ? `Price Mismatch: Expected ${expectedBasePrice} but actual is ${exactBaseUsdPrice}` : 'عدم تطابق في تسعير المنتج الأساسي.');
                        }
                        
                        if (expectedDisplayPrice !== null && expectedDisplayPrice < (exactLocalPrice - localRoundingTolerance)) {
                            throw new HttpsError('aborted', context.isApi ?
                                `Price Slippage: Current price (${exactLocalPrice}) is higher than expected (${expectedDisplayPrice}). Please sync your rates.` :
                                'تغيرت أسعار الصرف (السعر الحالي أعلى)، يرجى تحديث الصفحة وإعادة المحاولة.');
                        }
                    }

                    const currentLocalBalance = Number(userData.walletBalance || 0);
                    if (!Number.isFinite(exactLocalPrice) || exactLocalPrice <= 0 || currentLocalBalance < exactLocalPrice) {
                        throw new HttpsError('failed-precondition', context.isApi ? 'Insufficient balance.' : 'رصيدك غير كافٍ.');
                    }

                    let deliveredCodeText = null, isAutoDelivered = false;

                    if (vaultRef && verifiedKeyDocs.length > 0) {
                        verifiedKeyDocs.forEach(docSnap => {
                            transaction.update(docSnap.ref, {
                                isSold: true,
                                soldAt: admin.firestore.FieldValue.serverTimestamp(),
                                orderId: cleanOrderId,
                                userId: uid
                            });
                        });
                        
                        transaction.update(vaultRef, {
                            stockCount: admin.firestore.FieldValue.increment(-finalQty),
                            totalProfit: admin.firestore.FieldValue.increment(Number(pricingSnapshot.totalNetProfitUsd || 0)),
                            totalRevenue: admin.firestore.FieldValue.increment(Number(exactBaseUsdPrice || 0)),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        
                        deliveredCodeText = verifiedKeyDocs.map(d => d.data().codeText).join(' | ');
                        isAutoDelivered = true;
                    }
                    
                    // 🛡️ قفل حماية الكوبون: لا يُخصم الكوبون إلا إذا طُبّق فعلياً في الفاتورة النهائية
                    const isCouponActuallyApplied = Boolean(
                        !context.isApi &&
                        verifiedCouponData &&
                        couponRef &&
                        pricingSnapshot.couponCode &&
                        Number(pricingSnapshot.totalCouponDiscount) > 0
                    );

                    if (isCouponActuallyApplied) {
                        const currentGlobalUsed = Number(verifiedCouponData.usedCount || 0);
                        transaction.update(couponRef, {
                            usedCount: currentGlobalUsed < 0 ? 1 : admin.firestore.FieldValue.increment(1)
                        });
                    }

                    let prodUpdates = {};
                    const isFrozenProd = Boolean(product.isAutoFrozen === true || product.requiresAdminAttention === true);
                    
                    if (!isLiveSupplierOrder) {
                        if (activeOption) {
                            const newOptions = [...product.options];
                            const hasLiveOptionStock = activeOption.stockCount !== undefined && activeOption.stockCount !== null;
                            const hasDedicatedOptionVault = Boolean(activeOption.vaultPoolId && activeOption.vaultPoolId !== product.vaultPoolId);
                            
                            if (hasLiveOptionStock) {
                                const currentOptStock = Number(newOptions[optIdx].stockCount || 0);
                                const remOptStock = Math.max(0, currentOptStock - finalQty);
                                newOptions.forEach((opt, idx) => {
                                    if (opt && (idx === optIdx || (targetVaultPoolId && opt.vaultPoolId === targetVaultPoolId))) {
                                        newOptions[idx] = {
                                            ...opt,
                                            stockCount: remOptStock,
                                            isAvailable: !isFrozenProd && (opt.isActive !== false) && (remOptStock > 0)
                                        };
                                    }
                                });
                                prodUpdates.options = newOptions;
                                if (!product.vaultPoolId) {
                                    const hasAnyAvailableOpt = !isFrozenProd && newOptions.some(o => o && o.isActive !== false && String(o.isAvailable) !== 'false');
                                    prodUpdates.isAvailable = hasAnyAvailableOpt;
                                }
                            } else if (!hasDedicatedOptionVault && product.stockCount !== undefined && product.stockCount !== null) {
                                const remainingStock = Math.max(0, Number(product.stockCount || 0) - finalQty);
                                prodUpdates.stockCount = admin.firestore.FieldValue.increment(-finalQty);
                                prodUpdates.isAvailable = !isFrozenProd && (remainingStock > 0);
                            }
                        } else if (product.stockCount !== undefined && product.stockCount !== null) {
                            const remainingStock = Math.max(0, Number(product.stockCount || 0) - finalQty);
                            prodUpdates.stockCount = admin.firestore.FieldValue.increment(-finalQty);
                            prodUpdates.isAvailable = !isFrozenProd && (remainingStock > 0);
                        }
                    }
                    
                    if (Object.keys(prodUpdates).length > 0) {
                        transaction.update(productRef, prodUpdates);
                    }
                    
                    const newLocalBalance = FinancialEngine.sanitizeAmount(FinancialEngine.safeSub(currentLocalBalance, exactLocalPrice));
                    
                    // 🚀 [حفظ البصمة]: حفظ الـ IP الحقيقي المستخدم أثناء الشراء
                    let userUpdateObj = {
                        walletBalance: newLocalBalance,
                        lastOrderTime: serverNow,
                        isDormant: false,
                        ...(context.clientIp && { lastIp: context.clientIp })
                    };
                    
                    if (isAutoDelivered) {
                        const upgradeResult = FinancialEngine.processTierUpgrade(userData, tiersData, exactBaseUsdPrice, serverNow);
                        
                        userUpdateObj.totalSpent = upgradeResult.newTotalSpentUsd;
                        userUpdateObj.tierCycleSpent = upgradeResult.newTierCycleSpentUsd;
                        userUpdateObj.tierId = upgradeResult.finalTierId;
                        userUpdateObj.tierClimbs = upgradeResult.tierClimbs;
                        userUpdateObj.totalOrdersCount = admin.firestore.FieldValue.increment(1);
                        
                        if (upgradeResult.shouldUpdateCycleStart) {
                            userUpdateObj.tierCycleStartDate = admin.firestore.FieldValue.serverTimestamp();
                        }
                        if (upgradeResult.shouldLockFloorTier) {
                            userUpdateObj.cycleStartTierId = upgradeResult.lockedFloorTierId;
                        }
                        if (upgradeResult.shouldUpdateStreakStart) {
                            userUpdateObj.tierStreakStartDate = admin.firestore.FieldValue.serverTimestamp();
                        }

                        const orderDate = new Date(serverNow);
                        const monthKey = `${orderDate.getUTCFullYear()}_${String(orderDate.getUTCMonth() + 1).padStart(2, '0')}`;
                        const statsRef = db.collection('telecard_user_stats').doc(`${uid}_${monthKey}`);
                        
                        transaction.set(statsRef, {
                            userId: uid,
                            monthKey: monthKey,
                            spentThisMonth: admin.firestore.FieldValue.increment(exactBaseUsdPrice),
                            ordersThisMonth: admin.firestore.FieldValue.increment(1),
                            userName: userData.fullName || userData.username || (context.isApi ? 'تاجر API' : 'عميل'),
                            userDisplayId: userData.displayId || uid.substring(0, 8),
                            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                    }
                    
                    if (userSnap.exists) {
                        let finalUpdateObj = { ...userUpdateObj };
                        if (isCouponActuallyApplied && safeCouponMapKey) {
                            const prevUserUsed = Math.max(0, Number(userData?.usedCoupons?.[safeCouponMapKey] ?? userData?.usedCoupons?.[couponCode] ?? 0));
                            finalUpdateObj[`usedCoupons.${safeCouponMapKey}`] = prevUserUsed + 1;
                        }
                        transaction.update(userRef, finalUpdateObj);
                    } else {
                        let finalSetObj = { ...userData, ...userUpdateObj };
                        if (isCouponActuallyApplied && safeCouponMapKey) {
                            finalSetObj.usedCoupons = {
                                [safeCouponMapKey]: 1
                            };
                        }
                        transaction.set(userRef, finalSetObj, { merge: true });
                    }

                    // 🔒 تشفير التكلفة وصافي الربح داخل _auditToken حصرياً لعدم كشفها للعميل
                    const encryptedAudit = typeof SecurityEngine.encryptOrderAudit === 'function'
                        ? SecurityEngine.encryptOrderAudit({
                            costUsd: pricingSnapshot.totalCostUsd || 0,
                            netProfitUsd: pricingSnapshot.totalNetProfitUsd || 0,
                            supplierId: effectiveSupplierId
                        })
                        : null;

                    const initialOrderStatus = isAutoDelivered ? 'completed' : (isLiveSupplierOrder ? 'processing' : 'pending');

                    // 📌 [توحيد معماري - وثيقة الطلب في Firestore (telecard_orders)]:
                    // 1. prodId: المعرف القياسي الوحيد للمنتج (يجب توحيده في dataManager.js بالمتجر).
                    // 2. balanceAfter: الرصيد المتبقي بعد الشراء.
                    // 3. pricingSnapshot: يعتمد الحقول القياسية (originalPrice, finalPrice, couponDiscount, offerDiscount, couponCode, offerName) فقط بدون تكرار.
                    let orderDocData = {
                        id: cleanOrderId,
                        displayId: cleanOrderId,
                        userId: uid,
                        userDataSnapshot: {
                            fullName: SecurityEngine.sanitizeText(userData.fullName || (context.isApi ? 'تاجر API' : 'عميل'), 100), 
                            email: userData.email || '',
                            phone: userData.phone || '',
                            tierId: activeTierObj.id || 'TIER_DEFAULT',
                            baseCurrency: userWalletCurrency,
                            ...(context.isApi && { isApiMerchant: true })
                        },
                        prodId: prodId,
                        product: finalProductName,
                        optIdx: optIdx !== null ? optIdx : null,
                        optionName: activeOption ? activeOption.name : null,
                        vaultPoolId: targetVaultPoolId || null,
                        supplierId: effectiveSupplierId,
                        externalProdId: effectiveExternalProdId,
                        price: FinancialEngine.sanitizeAmount(exactLocalPrice), 
                        priceLocalDeducted: FinancialEngine.sanitizeAmount(exactLocalPrice), 
                        priceBaseUsd: FinancialEngine.sanitizeAmount(exactBaseUsdPrice),
                        priceCurrency: userWalletCurrency,
                        balanceAfter: newLocalBalance,
                        qty: finalQty, 
                        status: initialOrderStatus,
                        isAutoDelivered: isAutoDelivered,
                        deliveredCode: deliveredCodeText, 
                        tierName: pricingSnapshot.tierName, 
                        input: finalInputStr,
                        ...(sanitizedPlayerInputs && { playerInputs: sanitizedPlayerInputs }),
                        pricingSnapshot: { 
                            originalPrice: FinancialEngine.sanitizeAmount(exactLocalOriginalPrice),
                            finalPrice: FinancialEngine.sanitizeAmount(exactLocalPrice),
                            couponDiscount: isCouponActuallyApplied ? FinancialEngine.sanitizeAmount(exactLocalCouponDiscount) : 0,
                            offerDiscount: FinancialEngine.sanitizeAmount(exactLocalOfferDiscount),
                            couponCode: isCouponActuallyApplied ? pricingSnapshot.couponCode : null, 
                            offerName: pricingSnapshot.offerName || null 
                        },
                        _auditToken: encryptedAudit,
                        ...(isAutoDelivered && { completedAt: admin.firestore.FieldValue.serverTimestamp() }),
                        time: admin.firestore.FieldValue.serverTimestamp(), 
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    };

                    if (context.isApi) {
                        orderDocData.isApi = true;
                        orderDocData.source = 'api';
                        orderDocData.isApiOrder = true;
                        orderDocData.merchantData = { webhookUrl: context.merchantData?.webhookUrl || null };
                    }

                    transaction.set(db.collection('telecard_orders').doc(cleanOrderId), orderDocData);
                    
                    // 📌 [توحيد معماري - استجابة الدالة]:
                    // المعرف القياسي الوحيد لكود التسليم هو deliveredCode (يجب توحيده في dataManager.js و uiFinance.js بالمتجر)
                    const txResultData = context.isApi ? {
                        success: true,
                        orderId: cleanOrderId,
                        status: initialOrderStatus,
                        pricePaid: exactLocalPrice,
                        priceCurrency: userWalletCurrency,
                        deliveredCode: deliveredCodeText
                    } : { 
                        success: true, 
                        orderId: cleanOrderId,
                        status: initialOrderStatus,
                        isAutoDelivered, 
                        deliveredCode: deliveredCodeText
                    };

                    if (idempotencyRef) {
                        const idempResultForStorage = { ...txResultData };
                        if (idempResultForStorage.deliveredCode && typeof SecurityEngine.decryptOrderAudit === 'function') {
                            const encCodeToken = SecurityEngine.encryptOrderAudit({ code: idempResultForStorage.deliveredCode });
                            if (encCodeToken) {
                                idempResultForStorage._encryptedCode = encCodeToken;
                                idempResultForStorage.deliveredCode = null;
                            }
                        }

                        transaction.set(idempotencyRef, { 
                            createdAt: admin.firestore.FieldValue.serverTimestamp(), 
                            expiresAt: admin.firestore.Timestamp.fromDate(new Date(serverNow + idempotencyTtlMs)),
                            orderId: cleanOrderId, 
                            requestHash: requestHash,
                            clientAttemptKey: explicitIdempotencyKey || null,
                            resultData: idempResultForStorage 
                        });
                    }
                    return { txResultData, shouldFulfillViaSupplier: isLiveSupplierOrder };
                });
            }).then(async (outcome) => {
                if (brokenOffersToDisable.size > 0) {
                    await quarantineBrokenPromos(db, brokenOffersToDisable, null);
                }

                if (!outcome || outcome.txResultData === undefined) {
                    return outcome;
                }

                const finalResponse = { ...outcome.txResultData };
                const activeOrderId = finalResponse.orderId || cleanOrderId;

                if (outcome.shouldFulfillViaSupplier) {
                    const SupplierEngine = require('../supplierEngine.js');
                    let suppExec = null;
                    try {
                        suppExec = await SupplierEngine.fulfillOrderWithSupplier(activeOrderId, db);
                    } catch (unexpectedSuppErr) {
                        console.error("🚨 Unexpected Supplier Execution Error:", unexpectedSuppErr);
                        const ordRef = db.collection('telecard_orders').doc(activeOrderId);
                        await db.runTransaction(async (tx) => {
                            const latestSnap = await tx.get(ordRef);
                            if (latestSnap.exists && !['completed', 'rejected', 'refunded', 'returned'].includes(latestSnap.data().status)) {
                                tx.update(ordRef, {
                                    status: 'pending',
                                    adminNote: '⚠️ تنبيه للإدمن: حدث خطأ طارئ أثناء الاتصال بالمورد. يرجى مراجعة حالة الطلب يدوياً.',
                                    actionTime: admin.firestore.FieldValue.serverTimestamp()
                                });
                            }
                        }).catch(() => {});
                        SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                            '🚨 خطأ طارئ أثناء تنفيذ طلب مورد!',
                            `الطلب (${activeOrderId}) تحول إلى قيد الانتظار للمراجعة اليدوية بسبب خطأ غير متوقع: ${unexpectedSuppErr.message}`,
                            { target: 'orders', orderId: activeOrderId }
                        ).catch(() => {});
                        finalResponse.status = 'pending';
                        return finalResponse;
                    }

                    if (suppExec) {
                        if (suppExec.status === 'rejected') {
                            if (idempotencyRef) {
                                await idempotencyRef.delete().catch(() => {});
                            }
                            throw new HttpsError('failed-precondition', suppExec.rejectedReason || 'تعذر تنفيذ الطلب لدى المزود وتم إرجاع الرصيد لمحفظتك فوراً.');
                        }

                        if (suppExec.status === 'completed') {
                            finalResponse.status = 'completed';
                            finalResponse.isAutoDelivered = true;
                            finalResponse.deliveredCode = suppExec.deliveredCode;
                        } else if (suppExec.status) {
                            finalResponse.status = suppExec.status;
                        }
                    }
                }

                return finalResponse;
            });
        } catch (err) {
            if (brokenOffersToDisable.size > 0 || brokenCouponToDisable) {
                await quarantineBrokenPromos(db, brokenOffersToDisable, brokenCouponToDisable);
            }
            if (err && err.code === 'aborted') {
                const { runExpiredPromosAndOverridesSweeper } = require('../triggersEngine.js');
                runExpiredPromosAndOverridesSweeper().catch(() => {});
            }
            if (err && err.message === 'COUPON_MARGIN_VIOLATION') {
                throw new HttpsError('failed-precondition', err.userMsg);
            }
            throw err;
        }
    }
}

module.exports = OrderService;