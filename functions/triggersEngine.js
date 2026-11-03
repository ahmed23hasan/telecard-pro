// ============================================================================
// ⚡ محرك الكتالوج والخزنة والتريجرات الذكية (functions/triggersEngine.js) - V38.1.0 💎
// 🎯 الوظيفة: مزامنة الكتالوج العام، إدارة الخزنة، رادار الإشعارات، تجميع الـ BI، وكاسحة التخزين.
// 🚀 التحديث (V38.1.0 - Strict QTY, Stock Privacy, Loop Guard & Schema Unification):
// 1. Stock Privacy Guard 🛡️: إخفاء المخزون الفعلي عن العميل تماماً وإلغاء تقييد الـ 5 أكواد.
// 2. Strict QTY Limits 📦: توحيد الحد الأقصى MAX_QTY_PER_ORDER إلى 100 وتطبيقه على الكتالوج العام.
// 3. Sync Loop Guard 🧱: تحصين onTierUpdate ضد حلقات المزامنة المزدوجة ومشاكل الـ NaN.
// 4. Full Promo & Coupon Guard 🛡️: فحص وإيقاف العروض الخاسرة آلياً عند تغير تكلفة المنتج أو نسب المستويات.
// 5. Schema Unification 🔗: توحيد شارات المنتجات (badgeText/badgeColor)، أيقونات وألوان المستويات (icon/color)، توجيه الإشعارات (targetType/targetId)، وسبب رفض التوثيق (kycReviewNote).
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten, onDocumentUpdated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const admin = require('firebase-admin');
const FinancialEngine = require('./financialEngine.js');
const SecurityEngine = require('./securityEngine.js');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const SYSTEM_LIMITS = {
    MAX_QTY_PER_ORDER: 100, // 🛡️ تم التوحيد إلى 100 كحد أقصى للمنتج العادي
    MAX_VAULT_QTY_PER_ORDER: 100,
    MAX_SAFE_AMOUNT: 20000,
    MAX_URL_LENGTH: 1000,
    MAX_NOTE_LENGTH: 500
};

const isMasterAdmin = (request) => SecurityEngine.isMasterAdmin(request);
const logAdminAction = (adminUid, action, details) => SecurityEngine.logAdminAction(db, admin, adminUid, action, details);

const isPricingOnlyAttention = (prodData) => {
    if (!prodData || prodData.requiresAdminAttention !== true) return false;
    const note = String(prodData.syncNote || '');
    if (note.includes('خزنة') || note.includes('مورد')) return false;
    return true;
};

// ==========================================
// 🛡️ دواول بناء الكتالوج العام والكاش المركزي
// ==========================================
const generatePublicProductData = (prodData, tiersData) => {
    const publicData = {};
    // 📌 [توحيد معماري - المتجر والأدمن]:
    // المعرفات القياسية للمنتج العام: (categoryId, categoryIds, img, badgeText, badgeColor)
    const ALLOWED_PRODUCT_KEYS = [
        'id', 'name', 'description', 'img', 'isActive', 'isAvailable',
        'categoryId', 'categoryIds', 'sortOrder', 'order', 'type', 'isFixedPrice', 'disableCoupons',
        'minQty', 'maxQty', 'allowQty', 'simpleMax', 'hideGridPrice', 'input1Label', 'input2Label',
        'badgeText', 'badgeColor', 'price', 'fixedPriceUsd'
    ];
    ALLOWED_PRODUCT_KEYS.forEach(k => {
        if (prodData[k] !== undefined) {
            const val = prodData[k];
            publicData[k] = (val === null || typeof val !== 'object') ? val : SecurityEngine.safeClone(val);
        }
    });
    
    const nowMs = Date.now();
    const validTierIdsSet = new Set(Array.isArray(tiersData) ? tiersData.map(t => String(t.id)) : []);
    
    const extractValidOverrideKeys = (tpObj) => {
        if (!tpObj || typeof tpObj !== 'object') return [];
        return Object.keys(tpObj).filter(k => {
            if (validTierIdsSet.size > 0 && !validTierIdsSet.has(String(k))) return false;
            const val = tpObj[k];
            if (val === null || val === undefined || val === '') return false;
            if (typeof val === 'object' && val.expiresAt) {
                const exp = FinancialEngine.parseSafeTime(val.expiresAt);
                if (exp > 0 && exp <= nowMs) return false;
            }
            const num = typeof val === 'object' ? Number(val.price) : Number(val);
            return Number.isFinite(num) && num > 0;
        });
    };
    
    const getFutureExpiryMs = (tpObj, tierId) => {
        const entry = tpObj?.[tierId];
        if (!entry || typeof entry !== 'object' || !entry.expiresAt) return 0;
        const expMs = FinancialEngine.parseSafeTime(entry.expiresAt);
        return expMs > nowMs ? expMs : 0;
    };
    
    const buildProdWithoutTierOverride = (sourceProd, tierId, targetOptIdx = null) => {
        const cloned = SecurityEngine.safeClone(sourceProd);
        if (targetOptIdx !== null && Array.isArray(cloned.options) && cloned.options[targetOptIdx]) {
            if (cloned.options[targetOptIdx].tierPrices) {
                delete cloned.options[targetOptIdx].tierPrices[tierId];
            }
            if (Array.isArray(cloned.options[targetOptIdx].customTierOverrides)) {
                cloned.options[targetOptIdx].customTierOverrides = cloned.options[targetOptIdx].customTierOverrides.filter(id => String(id) !== String(tierId));
            }
        } else {
            if (cloned.tierPrices) {
                delete cloned.tierPrices[tierId];
            }
            if (Array.isArray(cloned.customTierOverrides)) {
                cloned.customTierOverrides = cloned.customTierOverrides.filter(id => String(id) !== String(tierId));
            }
        }
        return cloned;
    };
    
    publicData.customTierOverrides = extractValidOverrideKeys(prodData.tierPrices);
    
    let resolvedDefaultOptIdx = 0;
    if (prodData.type === 'select' && Array.isArray(prodData.options) && prodData.options.length > 0) {
        const availIdx = prodData.options.findIndex(o => o && o.isActive !== false && String(o.isAvailable) !== 'false');
        if (availIdx >= 0) {
            resolvedDefaultOptIdx = availIdx;
        } else {
            const firstActiveOnlyIdx = prodData.options.findIndex(o => o && o.isActive !== false);
            if (firstActiveOnlyIdx >= 0) resolvedDefaultOptIdx = firstActiveOnlyIdx;
        }
    }
    
    const SAFE_FALLBACK_PRICE = 9999999;
    const safeTiersList = Array.isArray(tiersData) ? tiersData : [];
    const defaultTierObj = safeTiersList.find(t => t.isDefault && t.type !== 'api') || safeTiersList.find(t => t.isDefault) || safeTiersList[0];
    
    const baseTierPrices = {};
    const baseTierPriceExpiries = {};
    const defaultTargetTpObj = (prodData.type === 'select' && Array.isArray(prodData.options) && prodData.options[resolvedDefaultOptIdx]) ?
        prodData.options[resolvedDefaultOptIdx].tierPrices :
        prodData.tierPrices;
    
    safeTiersList.forEach(tier => {
        try {
            const priceCalc = FinancialEngine.calculatePrice({
                product: prodData,
                tier: tier,
                allowDefaultOption: true,
                optIdx: resolvedDefaultOptIdx,
                requireServerCost: true
            });
            baseTierPrices[tier.id] = priceCalc.isFirewallViolated ? SAFE_FALLBACK_PRICE : priceCalc.finalPrice;
            
            const expMs = getFutureExpiryMs(defaultTargetTpObj, tier.id);
            if (expMs > 0) {
                const strippedProd = buildProdWithoutTierOverride(prodData, tier.id, prodData.type === 'select' ? resolvedDefaultOptIdx : null);
                const fallbackCalc = FinancialEngine.calculatePrice({
                    product: strippedProd,
                    tier: tier,
                    allowDefaultOption: true,
                    optIdx: resolvedDefaultOptIdx,
                    requireServerCost: true
                });
                baseTierPriceExpiries[tier.id] = {
                    expiresAt: expMs,
                    fallbackPrice: fallbackCalc.isFirewallViolated ? SAFE_FALLBACK_PRICE : fallbackCalc.finalPrice
                };
            }
        } catch (e) {
            baseTierPrices[tier.id] = SAFE_FALLBACK_PRICE;
        }
    });
    publicData.tierPrices = baseTierPrices;
    if (Object.keys(baseTierPriceExpiries).length > 0) {
        publicData.tierPriceExpiries = baseTierPriceExpiries;
    }
    
    if ((!publicData.price || Number(publicData.price) <= 0) && defaultTierObj && baseTierPrices[defaultTierObj.id] && baseTierPrices[defaultTierObj.id] !== SAFE_FALLBACK_PRICE) {
        publicData.price = baseTierPrices[defaultTierObj.id];
    }
    
    if (prodData.type !== 'counter') {
    if (Number(publicData.maxQty) > SYSTEM_LIMITS.MAX_QTY_PER_ORDER) {
        publicData.maxQty = SYSTEM_LIMITS.MAX_QTY_PER_ORDER;
    }
    if (Number(publicData.simpleMax) > SYSTEM_LIMITS.MAX_QTY_PER_ORDER) {
        publicData.simpleMax = SYSTEM_LIMITS.MAX_QTY_PER_ORDER;
    }
}    if (prodData.type === 'select' && Array.isArray(prodData.options)) {
        publicData.options = prodData.options.map((opt, idx) => {
            if (!opt) return null;
            const optClean = {};
            const ALLOWED_OPTION_KEYS = [
                'name', 'value', 'sortOrder', 'order', 'isActive', 'isAvailable',
                'type', 'badgeText', 'badgeColor', 'isFixedPrice', 'price', 'fixedPriceUsd'
            ];
            ALLOWED_OPTION_KEYS.forEach(k => {
                if (opt[k] !== undefined) {
                    const val = opt[k];
                    optClean[k] = (val === null || typeof val !== 'object') ? val : SecurityEngine.safeClone(val);
                }
            });
            
            optClean.customTierOverrides = extractValidOverrideKeys(opt.tierPrices);
            const optTierPrices = {};
            const optTierPriceExpiries = {};
            safeTiersList.forEach(tier => {
                try {
                    const optCalc = FinancialEngine.calculatePrice({
                        product: prodData,
                        tier: tier,
                        optIdx: idx,
                        requireServerCost: true
                    });
                    optTierPrices[tier.id] = optCalc.isFirewallViolated ? SAFE_FALLBACK_PRICE : optCalc.finalPrice;
                    
                    const optExpMs = getFutureExpiryMs(opt.tierPrices, tier.id);
                    if (optExpMs > 0) {
                        const strippedOptProd = buildProdWithoutTierOverride(prodData, tier.id, idx);
                        const optFallbackCalc = FinancialEngine.calculatePrice({
                            product: strippedOptProd,
                            tier: tier,
                            optIdx: idx,
                            requireServerCost: true
                        });
                        optTierPriceExpiries[tier.id] = {
                            expiresAt: optExpMs,
                            fallbackPrice: optFallbackCalc.isFirewallViolated ? SAFE_FALLBACK_PRICE : optFallbackCalc.finalPrice
                        };
                    }
                } catch (e) {
                    optTierPrices[tier.id] = SAFE_FALLBACK_PRICE;
                }
            });
            optClean.tierPrices = optTierPrices;
            if (Object.keys(optTierPriceExpiries).length > 0) {
                optClean.tierPriceExpiries = optTierPriceExpiries;
            }
            
            if ((!optClean.price || Number(optClean.price) <= 0) && defaultTierObj && optTierPrices[defaultTierObj.id] && optTierPrices[defaultTierObj.id] !== SAFE_FALLBACK_PRICE) {
                optClean.price = optTierPrices[defaultTierObj.id];
            }
            
            return optClean;
        });
    }
    
    const hasTierFallbackError = (tpObj) => !tpObj || Object.keys(tpObj).length === 0 || Object.values(tpObj).some(v => v === SAFE_FALLBACK_PRICE || Number(v) <= 0);
    const hasBasePriceError = hasTierFallbackError(publicData.tierPrices);
    let hasActiveOptError = false;
    
    if (publicData.type === 'select') {
        const hasAnyActiveOpt = Array.isArray(publicData.options) && publicData.options.some(o => o && o.isActive !== false);
        if (!hasAnyActiveOpt) {
            hasActiveOptError = true;
        } else {
            publicData.options = publicData.options.map(opt => {
                if (!opt) return null;
                if (hasTierFallbackError(opt.tierPrices)) {
                    opt.isAvailable = false;
                    if (opt.isActive !== false) hasActiveOptError = true;
                }
                return opt;
            });
        }
    }
    
    const hasPricingError = Boolean(hasBasePriceError || hasActiveOptError);
    if (hasPricingError) {
        publicData._hasPricingError = true;
    }
    
    if (hasPricingError || prodData.isAutoFrozen === true) {
        publicData.isAvailable = false;
        if (Array.isArray(publicData.options)) {
            publicData.options = publicData.options.map(opt => opt ? { ...opt, isAvailable: false } : null);
        }
    }
    
    return publicData;
};

const buildPricingCache = async (transactionOrBatch = null) => {
    const [tiersSnap, offersSnap, couponsSnap] = await Promise.all([
        db.collection('telecard_tiers').get(),
        db.collection('telecard_offers').where('isActive', '==', true).get(),
        db.collection('telecard_coupons').where('isActive', '==', true).get()
    ]);
    
    const tiers = tiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const offers = offersSnap.docs.map(d => {
        const data = d.data();
        return {
            id: d.id, name: data.name, type: data.type, value: data.value,
            targetProds: data.targetProds || [], targetCategories: data.targetCategories || [], targetTiers: data.targetTiers || [], 
            expiryDate: data.expiryDate || null, startDate: data.startDate || null,
            maxDiscount: data.maxDiscount || null,
            isPerUnit: Boolean(data.isPerUnit),
            visualConfig: data.visualConfig || null,
            isActive: true
        };
    });    const coupons = couponsSnap.docs.map(d => {
        const data = d.data();
        return {
            id: d.id, code: data.code, type: data.type, value: data.value,
            maxDiscount: data.maxDiscount || null, minOrder: data.minOrder || 0,
            targetProds: data.targetProds || [], targetCategories: data.targetCategories || [], targetTiers: data.targetTiers || [],
            startDate: data.startDate || null, expiryDate: data.expiryDate || null,
            isActive: true
        };
    });

    const payload = { tiers, offers, coupons, lastUpdated: admin.firestore.FieldValue.serverTimestamp() };
    const cacheRef = db.collection('telecard_system').doc('active_pricing');
    
    if (transactionOrBatch && typeof transactionOrBatch.set === 'function') transactionOrBatch.set(cacheRef, payload);
    else await cacheRef.set(payload);
    
    return { tiers, offers, coupons };
};const buildConfigCache = async (transactionOrBatch = null) => {
    const [ratesSnap, paymentsSnap, existingCacheSnap] = await Promise.all([
        db.collection('telecard_rates').get(),
        db.collection('telecard_payments').get(),
        db.collection('telecard_system').doc('active_configs').get()
    ]);
    const rates = ratesSnap.docs.map(d => d.data());
    const payments = paymentsSnap.docs.map(d => d.data());
    const existingData = existingCacheSnap.exists ? existingCacheSnap.data() : {};
    
    const payload = {
        rates,
        payments,
        ...(Array.isArray(existingData.bannedIps) && { bannedIps: existingData.bannedIps }),
        ...(Array.isArray(existingData.bannedDevices) && { bannedDevices: existingData.bannedDevices }),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };
    const cacheRef = db.collection('telecard_system').doc('active_configs');
    
    if (transactionOrBatch && typeof transactionOrBatch.set === 'function') transactionOrBatch.set(cacheRef, payload, { merge: true });
    else await cacheRef.set(payload, { merge: true });
    
    return { rates, payments };
};

// ==========================================
// 📊 1. تريجر الإحصائيات اليومية والتراكمية (Enterprise BI Engine)
// ==========================================
exports.aggregateDailyStats = onDocumentWritten({ 
    document: 'telecard_orders/{orderId}', 
    retry: true, 
    memory: '256MiB' 
}, async (event) => {
    const after = event.data.after.exists ? event.data.after.data() : null;
    const before = event.data.before.exists ? event.data.before.data() : null;

    if (before && after && before.status === after.status) return null;

    const order = after || before;
    if (!order) return null;

    const isApi = Boolean(order.isApi || order.source === 'api');
    const isRetail = !isApi;

    const isVault = Boolean(order.vaultPoolId && !order.supplierId);
    const isSupplier = Boolean(order.supplierId);
    const isManual = (!isVault && !isSupplier);
    const cleanSuppId = isSupplier ? String(order.supplierId).replace(/[^a-zA-Z0-9_-]/g, '') : null;

    const orderAudit = SecurityEngine.decryptOrderAudit(order._auditToken);
    const auditedProfit = Number(orderAudit.netProfitUsd ?? order.pricingSnapshot?.netProfitUsd ?? 0);
    const auditedCost = Number(orderAudit.costUsd ?? order.pricingSnapshot?.costUsd ?? 0);
    const revenue = Number(order.priceBaseUsd || 0);

    let revDelta = 0, profitDelta = 0, costDelta = 0;
    let completedDelta = 0, rejectedDelta = 0, refundedDelta = 0;

    const statusBefore = before ? before.status : null;
    const statusAfter = after ? after.status : null;

    if (statusBefore === 'completed') {
        revDelta -= revenue; 
        profitDelta -= auditedProfit; 
        costDelta -= auditedCost;
        completedDelta -= 1;
    } else if (statusBefore === 'rejected') {
        rejectedDelta -= 1;
    } else if (['refunded', 'returned'].includes(statusBefore)) {
        refundedDelta -= 1;
    }

    if (statusAfter === 'completed') {
        revDelta += revenue; 
        profitDelta += auditedProfit; 
        costDelta += auditedCost;
        completedDelta += 1;
    } else if (statusAfter === 'rejected') {
        rejectedDelta += 1;
    } else if (['refunded', 'returned'].includes(statusAfter)) {
        refundedDelta += 1;
    }

    if (revDelta === 0 && completedDelta === 0 && rejectedDelta === 0 && refundedDelta === 0) return null;

    const inc = (val) => admin.firestore.FieldValue.increment(val);

    const basePayload = {
        revenue: inc(revDelta),
        profit: inc(profitDelta),
        cost: inc(costDelta),
        completed_count: inc(completedDelta),
        rejected_count: inc(rejectedDelta),
        refunded_count: inc(refundedDelta),
        
        api_profit: inc(isApi ? profitDelta : 0),
        api_count: inc(isApi ? completedDelta : 0),
        api_rejected: inc(isApi ? rejectedDelta : 0),
        api_refunded: inc(isApi ? refundedDelta : 0),

        retail_profit: inc(isRetail ? profitDelta : 0),
        retail_count: inc(isRetail ? completedDelta : 0),
        retail_rejected: inc(isRetail ? rejectedDelta : 0),
        retail_refunded: inc(isRetail ? refundedDelta : 0),
        
        vault_profit: inc(isVault ? profitDelta : 0),
        vault_completed: inc(isVault ? completedDelta : 0),
        vault_count: inc(isVault ? completedDelta : 0),
        vault_rejected: inc(isVault ? rejectedDelta : 0),
        vault_refunded: inc(isVault ? refundedDelta : 0),
        
        manual_profit: inc(isManual ? profitDelta : 0),
        manual_completed: inc(isManual ? completedDelta : 0),
        manual_count: inc(isManual ? completedDelta : 0),
        manual_rejected: inc(isManual ? rejectedDelta : 0),
        manual_refunded: inc(isManual ? refundedDelta : 0),
        
        supplier_profit: inc(isSupplier ? profitDelta : 0),
        supplier_completed: inc(isSupplier ? completedDelta : 0),
        supplier_count: inc(isSupplier ? completedDelta : 0),
        supplier_rejected: inc(isSupplier ? rejectedDelta : 0),
        supplier_refunded: inc(isSupplier ? refundedDelta : 0),

        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    if (isSupplier && cleanSuppId) {
        basePayload.suppliers_data = {
            [cleanSuppId]: {
                profit: inc(profitDelta),
                completed: inc(completedDelta),
                rejected: inc(rejectedDelta),
                refunded: inc(refundedDelta)
            }
        };
    }

    const cleanProdId = String(order.prodId || 'unknown_prod').replace(/[.~*/\[\]]/g, '_');
    const cleanTierId = String(order.userDataSnapshot?.tierId || 'TIER_DEFAULT').replace(/[.~*/\[\]]/g, '_');

    const periodPayload = { ...basePayload };

    if (revDelta !== 0 || profitDelta !== 0 || costDelta !== 0 || completedDelta !== 0) {
        periodPayload.products_data = {
            [cleanProdId]: {
                id: String(order.prodId || 'unknown_prod'),
                name: order.product || 'منتج',
                revenue: inc(revDelta),
                profit: inc(profitDelta),
                cost: inc(costDelta),
                count: inc(completedDelta)
            }
        };
        periodPayload.tiers_data = {
            [cleanTierId]: {
                id: String(order.userDataSnapshot?.tierId || 'TIER_DEFAULT'),
                name: order.tierName || 'مستوى',
                revenue: inc(revDelta),
                profit: inc(profitDelta),
                count: inc(completedDelta)
            }
        };
    }

    const effectiveOrderTime = order.completedAt || order.actionTime || order.time;
    const timeMs = effectiveOrderTime?.toMillis ? effectiveOrderTime.toMillis() : (FinancialEngine.parseSafeTime(effectiveOrderTime) || Date.now());
    const dateObj = new Date(timeMs);
    
    const dayKey = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
    const monthKey = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}`;
    
    const batch = db.batch();
    
    const eventAuditRef = db.collection('telecard_bi_events').doc(String(event.id));
    batch.create(eventAuditRef, { 
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + (7 * 24 * 60 * 60 * 1000))
    });

    batch.set(db.collection('telecard_statistics').doc(`daily_${dayKey}`), periodPayload, { merge: true });
    batch.set(db.collection('telecard_statistics').doc(`monthly_${monthKey}`), periodPayload, { merge: true });
    batch.set(db.collection('telecard_statistics').doc('all_time'), basePayload, { merge: true });
    
    const pId = order.prodId || 'unknown_prod';
    batch.set(db.collection('telecard_statistics').doc('all_time').collection('products').doc(String(pId)), { 
        revenue: inc(revDelta), 
        profit: inc(profitDelta), 
        cost: inc(costDelta), 
        count: inc(completedDelta), 
        name: order.product || 'منتج' 
    }, { merge: true });

    const tId = order.userDataSnapshot?.tierId || 'TIER_DEFAULT';
    batch.set(db.collection('telecard_statistics').doc('all_time').collection('tiers').doc(String(tId)), { 
        revenue: inc(revDelta), 
        profit: inc(profitDelta), 
        count: inc(completedDelta), 
        name: order.tierName || 'مستوى' 
    }, { merge: true });

    try {
        await batch.commit();
    } catch (commitErr) {
        if (commitErr.code === 6 || String(commitErr.message).includes('ALREADY_EXISTS')) return null;
        throw commitErr;
    }
    return null;
});

// ==========================================
// 📦 2. إدارة صناديق الأكواد والمزامنة مع المنتجات (Vault & Accountant Guard)
// ==========================================
const syncLinkedProductsWithVault = async (poolId, stockDeltaOrZero, isExhausted = false, isPoolDeleted = false) => {
    const pIdStr = String(poolId);
    
    const [directSnap, subOptSnap, vaultSnap] = await Promise.all([
        db.collection('telecard_prods').where('vaultPoolId', '==', pIdStr).get(),
        db.collection('telecard_prods').where('linkedVaultIds', 'array-contains', pIdStr).get(),
        !isPoolDeleted ? db.collection('telecard_vault').doc(pIdStr).get() : Promise.resolve(null)
    ]);
    
    const docsMap = new Map();
    directSnap.forEach(d => docsMap.set(d.id, d));
    subOptSnap.forEach(d => docsMap.set(d.id, d));
    
    if (docsMap.size === 0) return;
    
    const exactVaultStock = (!isPoolDeleted && !isExhausted && vaultSnap && vaultSnap.exists) ?
        Math.max(0, Number(vaultSnap.data().stockCount || 0)) :
        0;
    
    await SecurityEngine.processInBatches(db, Array.from(docsMap.values()), async (batch, doc) => {
        const pData = doc.data();
        const updates = {};
        let modified = false;
        const isFrozenBySecurity = Boolean(pData.isAutoFrozen === true || pData.requiresAdminAttention === true || pData.isManuallyPaused === true);

if (pData.vaultPoolId === pIdStr) {
    if (isPoolDeleted) {
        updates.vaultPoolId = null;
        updates.isAvailable = false;
        updates.stockCount = 0;
        updates.syncNote = 'تنبيه أمني: تم حذف الخزنة المرتبطة بالمنتج.';
        modified = true;
    } else if (isExhausted || exactVaultStock <= 0) {
    if (pData.stockCount !== 0 || pData.isAvailable !== false || !pData.syncNote) {
        updates.stockCount = 0;
        updates.isAvailable = false;
        updates.syncNote = 'تنبيه: نفدت الأكواد من الخزنة المرتبطة.';
        modified = true;
    }
} else if (exactVaultStock > 0) {
        const targetAvail = !isFrozenBySecurity;
        if (pData.stockCount !== exactVaultStock || pData.isAvailable !== targetAvail || (targetAvail && pData.syncNote && pData.syncNote.includes('خزنة'))) {
            updates.stockCount = exactVaultStock;
            updates.isAvailable = targetAvail;
            if (targetAvail && pData.syncNote && pData.syncNote.includes('خزنة')) {
                updates.syncNote = admin.firestore.FieldValue.delete();
            }
            modified = true;
        }
    }
}

if (pData.type === 'select' && Array.isArray(pData.options)) {
    let optChanged = false;
    const newOptions = pData.options.map(opt => {
        if (opt && opt.vaultPoolId === pIdStr) {
            const updatedOpt = { ...opt };
            const optCost = Number(updatedOpt.costPrice ?? updatedOpt.cost_price ?? 0);
            if (isPoolDeleted) {
                updatedOpt.vaultPoolId = null;
                updatedOpt.isAvailable = false;
                updatedOpt.stockCount = 0;
                optChanged = true;
            } else if (isExhausted || exactVaultStock <= 0) {
                if (updatedOpt.stockCount !== 0 || updatedOpt.isAvailable !== false) {
                    updatedOpt.stockCount = 0;
                    updatedOpt.isAvailable = false;
                    optChanged = true;
                }
            } else if (exactVaultStock > 0) {
                const targetOptAvail = !isFrozenBySecurity && (updatedOpt.isManuallyPaused !== true) && (updatedOpt.isActive !== false) && (optCost > 0);
                if (updatedOpt.stockCount !== exactVaultStock || updatedOpt.isAvailable !== targetOptAvail) {
                    updatedOpt.stockCount = exactVaultStock;
                    updatedOpt.isAvailable = targetOptAvail;
                    optChanged = true;
                }
            }
            return updatedOpt;
        }
        return opt;
    });
    if (optChanged) {
        updates.options = newOptions;
        modified = true;
        
        if (!pData.vaultPoolId) {
            const hasAnyAvailableOption = !isFrozenBySecurity && newOptions.some(o => o && o.isActive !== false && o.isManuallyPaused !== true && String(o.isAvailable) !== 'false');
            updates.isAvailable = hasAnyAvailableOption;
        }
                if (isPoolDeleted && !updates.syncNote) {
                    updates.syncNote = 'تنبيه أمني: تم حذف الخزنة المرتبطة بأحد الخيارات الفرعية.';
                } else if ((isExhausted || exactVaultStock <= 0) && !updates.syncNote) {
                    updates.syncNote = 'تنبيه: نفدت أكواد الخزنة المرتبطة بأحد الخيارات الفرعية.';
                } else if (exactVaultStock > 0 && !isFrozenBySecurity && pData.syncNote && pData.syncNote.includes('خزنة')) {
                    updates.syncNote = admin.firestore.FieldValue.delete();
                }
            }
        }
        
        if (isPoolDeleted && modified) {
            const remainingVaultIds = [...new Set([
                updates.vaultPoolId !== undefined ? updates.vaultPoolId : pData.vaultPoolId,
                ...(Array.isArray(updates.options || pData.options) ? (updates.options || pData.options).map(o => o?.vaultPoolId) : [])
            ].filter(Boolean).map(String))];
            
            updates.linkedVaultIds = remainingVaultIds;
        }
        
        if (modified) {
            batch.update(doc.ref, updates);
        }
    }, 400);
};

exports.adminSaveVaultCodes = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const { poolId, poolName, alertLimit, codesList, unitCostUsd, costPrice } = request.data || {};
    if (!poolId) throw new HttpsError('invalid-argument', 'معرف الخزنة مفقود.');
    if (codesList !== undefined && !Array.isArray(codesList)) throw new HttpsError('invalid-argument', 'قائمة الأكواد غير صالحة.');

    const safeCodesList = Array.isArray(codesList) ? codesList : [];
    if (safeCodesList.length > 20000) throw new HttpsError('out-of-range', 'الحد الأقصى للدفعة الواحدة هو 20,000 كود.');

    const cleanUnitCost = FinancialEngine.extractNum(unitCostUsd ?? costPrice ?? 0);

    try {
        const vaultRef = db.collection('telecard_vault').doc(String(poolId));
        const keysCollection = vaultRef.collection('keys');
        const manifestRef = db.collection('telecard_vault_manifest').doc(String(poolId));
        
        const rawCodes = safeCodesList.map(c => String(c).trim()).filter(c => c.length > 0);
        const cleanCodes = [...new Set(rawCodes)];

        if (cleanCodes.length === 0) {
            await vaultRef.set({
                id: poolId,
                ...(poolName && { name: SecurityEngine.sanitizeText(String(poolName), 100) }),
                ...(alertLimit !== undefined && { alertLimit: Number(alertLimit) || 5 }),
                ...(cleanUnitCost > 0 && { unitCostUsd: FinancialEngine.sanitizeAmount(cleanUnitCost) }),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return { success: true, addedCount: 0, skippedDuplicates: 0, message: 'تم تحديث بيانات الخزنة بنجاح.' };
        }

        const codesWithHashes = cleanCodes.map(codeText => ({
            codeText,
            hash: SecurityEngine.generateSha256Hash(codeText)
        }));

        let trulyNewCodesCount = 0;
        let hashesToManifest = [];

        for (let i = 0; i < codesWithHashes.length; i += 400) {
            const chunk = codesWithHashes.slice(i, i + 400);
            const refs = chunk.map(item => keysCollection.doc(`key_${item.hash}`));
            const snaps = await db.getAll(...refs);
            
            const batch = db.batch();
            let chunkAddedCount = 0;
            
            snaps.forEach((snap, idx) => {
                if (!snap.exists) {
                    batch.set(snap.ref, { 
                        codeText: chunk[idx].codeText, 
                        isSold: false, 
                        source: 'manual_admin',
                        addedAt: admin.firestore.FieldValue.serverTimestamp() 
                    });
                    chunkAddedCount++;
                    trulyNewCodesCount++;
                    hashesToManifest.push(chunk[idx].hash);
                }
            });
            if (chunkAddedCount > 0) {
                batch.set(vaultRef, { 
                    id: poolId, 
                    name: poolName ? SecurityEngine.sanitizeText(String(poolName), 100) : 'صندوق أكواد', 
                    alertLimit: Number(alertLimit) || 5, 
                    ...(cleanUnitCost > 0 && { unitCostUsd: FinancialEngine.sanitizeAmount(cleanUnitCost) }),
                    stockCount: admin.firestore.FieldValue.increment(chunkAddedCount), 
                    updatedAt: admin.firestore.FieldValue.serverTimestamp() 
                }, { merge: true });
                await batch.commit();
            }
        }

        if (trulyNewCodesCount === 0 && cleanUnitCost > 0) {
            await vaultRef.set({
                unitCostUsd: FinancialEngine.sanitizeAmount(cleanUnitCost),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        if (trulyNewCodesCount > 0) {
            await syncLinkedProductsWithVault(poolId, trulyNewCodesCount, false, false);

            const manualBatchTime = Date.now();
            const manifestBatch = db.batch();
            let manualChunkIdx = 0;
            for (let j = 0; j < hashesToManifest.length; j += 2000) {
                const chunkDocRef = manifestRef.collection('chunks').doc(`chunk_manual_${manualBatchTime}_${manualChunkIdx++}`);
                manifestBatch.set(chunkDocRef, {
                    hashes: hashesToManifest.slice(j, j + 2000)
                });
            }
            manifestBatch.set(manifestRef, {
                hasManualUploads: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            await manifestBatch.commit();
        }
        
        return { 
            success: trulyNewCodesCount > 0, 
            addedCount: trulyNewCodesCount,
            skippedDuplicates: cleanCodes.length - trulyNewCodesCount,
            message: `تمت إضافة ${trulyNewCodesCount} كود جديد بنجاح، وتجاهل ${cleanCodes.length - trulyNewCodesCount} كود مكرر.`
        };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

exports.adminDeleteVaultPool = onCall({ timeoutSeconds: 540 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    const poolId = String(request.data?.poolId || '');
    if (!poolId) throw new HttpsError('invalid-argument', 'رقم الخزنة مفقود.');
    
    try {
        const vaultRef = db.collection('telecard_vault').doc(poolId);
        const activeOrdersSnap = await db.collection('telecard_orders')
            .where('vaultPoolId', '==', poolId)
            .where('status', 'in', ['pending', 'processing'])
            .limit(1)
            .get();
        if (!activeOrdersSnap.empty) {
            throw new HttpsError('failed-precondition', 'لا يمكن حذف الخزنة حالياً! توجد طلبات قيد الانتظار أو المعالجة مرتبطة بها.');
        }
        
        const keysRef = vaultRef.collection('keys');
        const archiveRef = db.collection('telecard_vault_archived');
        let hasMore = true,
            archivedCount = 0;
        
        while (hasMore) {
            const snapshot = await keysRef.limit(200).get();
            if (snapshot.empty) { hasMore = false; break; }

            const count = await SecurityEngine.processInBatches(db, snapshot.docs, async (batch, doc) => {
                batch.set(archiveRef.doc(doc.id), { ...doc.data(), archivedAt: admin.firestore.FieldValue.serverTimestamp(), originalPoolId: poolId, reason: 'pool_deleted_by_admin' });
                batch.delete(doc.ref);
            }, 200);
            archivedCount += count;
        }
        
        await syncLinkedProductsWithVault(poolId, 0, false, true);
        
        await vaultRef.delete();
        
        try {
            const manifestRef = db.collection('telecard_vault_manifest').doc(poolId);
            const chunksSnap = await manifestRef.collection('chunks').get();
            if (!chunksSnap.empty) {
                await SecurityEngine.processInBatches(db, chunksSnap.docs, async (batch, doc) => { batch.delete(doc.ref); }, 400);
            }
            await manifestRef.delete();
        } catch (manifestErr) {}
        
        await logAdminAction(request.auth.uid, 'DELETE_VAULT_POOL', `Deleted Pool: ${poolId}`);
        return { success: true, archivedKeys: archivedCount };
    } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('internal', error.message); }
});

// ==========================================
// 🧹 3. كاسحة التخزين الشاملة (تُستدعى من الكرون المركزي)
// ==========================================
exports.trackNewStorageUploads = onObjectFinalized({ memory: "128MiB", timeoutSeconds: 60 }, async (event) => {
    const filePath = event.data.name;     
    const contentType = event.data.contentType;

    if (!filePath) return null;
    
    const isKyc = filePath.startsWith('kyc_docs/');
    const isReceipt = filePath.startsWith('receipts/');
    const isAvatar = filePath.startsWith('avatars/');

    if (!isKyc && !isReceipt && !isAvatar) return null;
    if (filePath.endsWith('/') || event.data.size === 0) return null;

    const fileName = filePath.split('/').pop();
    
    let userId = event.data.metadata?.uid || event.data.metadata?.userId || 'unknown';
    if (userId === 'unknown') {
        const cleanName = isAvatar ? fileName.replace(/^avatar_/, '') : fileName;
        const parts = cleanName.split('_');
        if (parts.length > 0 && parts[0].length >= 10) {
            userId = parts[0];
        }
    }
    try {
        if (isReceipt) {
            const cleanReceiptPath = `receipts/${fileName}`;
            const existingDep = await db.collection('telecard_deposits').where('receiptPath', '==', cleanReceiptPath).limit(1).get();
            if (!existingDep.empty) return null;
        } else if (isKyc && userId !== 'unknown') {
            const kycSnap = await db.collection('telecard_kyc').where('userId', '==', String(userId)).limit(5).get();
            const alreadyLinked = kycSnap.docs.some(d => JSON.stringify(d.data()).includes(fileName));
            if (alreadyLinked) return null;
        } else if (isAvatar && userId !== 'unknown') {
            const uSnap = await db.collection('telecard_users').doc(String(userId)).get();
            if (uSnap.exists && String(uSnap.data().profileImage || '').includes(fileName)) return null;
        }

        await db.collection('telecard_pending_uploads').doc(fileName).set({
            filePath: filePath, 
            userId: userId && userId.length >= 4 ? userId : 'unknown',
            type: isKyc ? 'kyc' : (isReceipt ? 'receipt' : 'avatar'),
            contentType: contentType, 
            uploadedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return true;
    } catch (error) { 
        console.error("[Track Upload Error]:", error);
        return null; 
    }
});

exports.runCloudStorageGarbageCollector = async () => {
    const now = admin.firestore.Timestamp.now().toMillis();
    const cutoff = now - (24 * 60 * 60 * 1000); 

    const safeDecode = (str) => {
        if (!str || typeof str !== 'string') return '';
        try {
            return decodeURIComponent(str);
        } catch (e) {
            return str;
        }
    };

    const isFileInObject = (obj, rawFileName) => {
        if (!obj || typeof obj !== 'object') return false;
        const decodedFileName = safeDecode(rawFileName);
        for (const key in obj) {
            const val = obj[key];
            if (typeof val === 'string') {
                if (val.includes(rawFileName) || val.includes(decodedFileName) || safeDecode(val).includes(decodedFileName)) return true;
            }
            if (typeof val === 'object' && isFileInObject(val, rawFileName)) return true;
        }
        return false;
    };

    try {
        const pendingSnap = await db.collection('telecard_pending_uploads')
            .where('uploadedAt', '<', admin.firestore.Timestamp.fromMillis(cutoff))
            .limit(200).get();
            
        if (pendingSnap.empty) return;

        const bucket = admin.storage().bucket();
        await SecurityEngine.processInBatches(db, pendingSnap.docs, async (batch, doc) => {
            const data = doc.data();
            let isSafeToDelete = true;
            const targetFileName = data.filePath ? data.filePath.split('/').pop() : 'UNKNOWN';

            if (data.type === 'receipt' && data.filePath) {
                const exactDepSnap = await db.collection('telecard_deposits')
                    .where('receiptPath', '==', String(data.filePath))
                    .limit(1)
                    .get();
                if (!exactDepSnap.empty) {
                    isSafeToDelete = false;
                }
            }

            if (isSafeToDelete && data.userId && data.userId !== 'unknown') {
                if (data.type === 'kyc' || data.type === 'avatar') {
                    const userSnap = await db.collection('telecard_users').doc(String(data.userId)).get();
                    if (userSnap.exists && isFileInObject(userSnap.data(), targetFileName)) {
                        isSafeToDelete = false;
                        if (data.type === 'avatar') {
                            try {
                                const [userAvatars] = await bucket.getFiles({ prefix: `avatars/avatar_${data.userId}_` });
                                for (const oldFile of userAvatars) {
                                    if (oldFile.name !== data.filePath && !oldFile.name.endsWith(targetFileName)) {
                                        await oldFile.delete().catch(() => {});
                                    }
                                }
                            } catch (avatarCleanErr) {}
                        }
                    }
                }

                if (isSafeToDelete && data.type === 'kyc') {
                    const kycSnap = await db.collection('telecard_kyc').where('userId', '==', String(data.userId)).get();
                    if (!kycSnap.empty) {
                        for (const kDoc of kycSnap.docs) {
                            if (isFileInObject(kDoc.data(), targetFileName)) {
                                isSafeToDelete = false;
                                break;
                            }
                        }
                    }
                }

                if (isSafeToDelete && data.type === 'receipt') {
                    const depSnap = await db.collection('telecard_deposits')
                        .where('userId', '==', String(data.userId))
                        .limit(30)
                        .get();
                        
                    if (!depSnap.empty) {
                        for (const dDoc of depSnap.docs) {
                            if (isFileInObject(dDoc.data(), targetFileName)) {
                                isSafeToDelete = false;
                                break;
                            }
                        }
                    }
                }
            } else if (isSafeToDelete && (!data.userId || data.userId === 'unknown') && data.type !== 'receipt') {
                isSafeToDelete = false;
            }

            if (isSafeToDelete && data.filePath) {
                try { await bucket.file(data.filePath).delete(); } catch (e) { }
            }
            
            batch.delete(doc.ref);
        }, 200);
    } catch (error) { console.error("[Storage Cleanup Error]:", error); }
};

// ==========================================
// 🔗 4. المزامنة وتريجرات الكتالوج والتسعير (Cache Auto-Sync & Quarantine)
// ==========================================
exports.onSettingsUpdate = onDocumentWritten({ document: 'telecard_settings/singleton', memory: "256MiB", concurrency: 1, retry: true }, async (event) => {
    if (!event.data.after.exists) return null;
    const beforeData = event.data.before.exists ? event.data.before.data() : null;
    const afterData = event.data.after.data() || {};
    
    const hasPublicBannedIps = Array.isArray(afterData.bannedIps);
    const hasPublicBannedDevices = Array.isArray(afterData.bannedDevices);
    
    // 🛡️ منع التريجر المزدوج الناتج عن التنظيف الآلي لحقول الحظر
    if (beforeData && !hasPublicBannedIps && !hasPublicBannedDevices && (Array.isArray(beforeData.bannedIps) || Array.isArray(beforeData.bannedDevices))) {
        const { bannedIps: _bIps, bannedDevices: _bDevs, ...restBefore } = beforeData;
        const { bannedIps: _aIps, bannedDevices: _aDevs, ...restAfter } = afterData;
        if (JSON.stringify(restBefore) === JSON.stringify(restAfter)) {
            return null;
        }
    }
    
    const batch = db.batch();
    
    // 🛡️ عزل قوائم الحظر تلقائياً في وثيقة active_configs السرية ومسحها من الوثيقة العامة (0 قراءات إضافية وقت الشراء)
    if (hasPublicBannedIps || hasPublicBannedDevices) {
        const configCacheRef = db.collection('telecard_system').doc('active_configs');
        const firewallPayload = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        const cleanupPublicPayload = {};
        
        if (hasPublicBannedIps) {
            firewallPayload.bannedIps = afterData.bannedIps;
            cleanupPublicPayload.bannedIps = admin.firestore.FieldValue.delete();
        }
        if (hasPublicBannedDevices) {
            firewallPayload.bannedDevices = afterData.bannedDevices;
            cleanupPublicPayload.bannedDevices = admin.firestore.FieldValue.delete();
        }
        
        batch.set(configCacheRef, firewallPayload, { merge: true });
        batch.update(event.data.after.ref, cleanupPublicPayload);
    }
    
    batch.set(db.collection('telecard_system').doc('cache_version'), {
        configVersion: admin.firestore.FieldValue.increment(1)
    }, { merge: true });
    
    await batch.commit();
    return null;
});
exports.onRateUpdate = onDocumentWritten({ document: 'telecard_rates/{rateId}', memory: "256MiB", concurrency: 1, retry: true }, async () => { 
    await buildConfigCache(); 
    await db.collection('telecard_system').doc('cache_version').set({ configVersion: admin.firestore.FieldValue.increment(1) }, { merge: true });
});

exports.onPaymentUpdate = onDocumentWritten({ document: 'telecard_payments/{paymentId}', memory: "256MiB", concurrency: 1, retry: true }, async () => { 
    await buildConfigCache(); 
    await db.collection('telecard_system').doc('cache_version').set({ configVersion: admin.firestore.FieldValue.increment(1) }, { merge: true });
});

// 🛡️ فحص ما إذا كان عرض أو كوبون معين يكسر رأس المال على منتج محدد
const testPromoAgainstSingleProduct = (promoData, isCoupon, prod, retailTiers, nowMs = Date.now()) => {
    if (!prod || prod.isActive === false || prod.isAutoFrozen === true || prod.requiresAdminAttention === true) {
        return { isBroken: false };
    }
    if (isCoupon && (prod.disableCoupons === true || String(prod.disableCoupons).toLowerCase() === 'true')) {
        return { isBroken: false };
    }
    
    const targetTiersStr = Array.isArray(promoData.targetTiers) ? promoData.targetTiers.filter(Boolean).map(String) : [];
    const applicableTiers = targetTiersStr.length > 0 ?
        retailTiers.filter(t => targetTiersStr.includes(String(t.id))) :
        retailTiers;
    
    if (applicableTiers.length === 0) return { isBroken: false };
    
    const optionIndices = (prod.type === 'select' && Array.isArray(prod.options) && prod.options.length > 0) ?
        prod.options.map((o, idx) => (o && o.isActive !== false ? idx : -1)).filter(idx => idx >= 0) :
        [null];
    
    for (const optIdx of optionIndices) {
        const activeOpt = optIdx !== null ? prod.options[optIdx] : null;
        const isFixed = activeOpt && activeOpt.isFixedPrice !== undefined ?
            (String(activeOpt.isFixedPrice).toLowerCase() === 'true') :
            (String(prod.isFixedPrice).toLowerCase() === 'true' || prod.is_fixed_price === true);
        if (isFixed) continue;
        
        for (const tier of applicableTiers) {
            const targetPricingObj = activeOpt || prod;
            const rawTierOverride = targetPricingObj.tierPrices?.[tier.id];
            if (rawTierOverride !== undefined && rawTierOverride !== null && rawTierOverride !== '') {
                const overridePriceNum = typeof rawTierOverride === 'object' ?
                    FinancialEngine.extractNum(rawTierOverride.price) :
                    FinancialEngine.extractNum(rawTierOverride);
                const overrideExpMs = (typeof rawTierOverride === 'object' && rawTierOverride.expiresAt) ?
                    FinancialEngine.parseSafeTime(rawTierOverride.expiresAt) :
                    0;
                if (overridePriceNum > 0 && (overrideExpMs === 0 || overrideExpMs > nowMs)) {
                    continue;
                }
            }
            
            try {
                const baseUnitCalc = FinancialEngine.calculatePrice({
                    product: prod,
                    tier: tier,
                    optIdx: optIdx,
                    allowDefaultOption: optIdx === null,
                    requireServerCost: true
                });
                if (baseUnitCalc.isFirewallViolated || baseUnitCalc.finalPrice <= 0) continue;
                
                const targetVault = (activeOpt && activeOpt.vaultPoolId) ? activeOpt.vaultPoolId : prod.vaultPoolId;
                const defaultMaxQty = prod.type === 'select' ?
                    1 :
                    (targetVault ?
                        SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER :
                        (prod.type === 'counter' ? 5000000 : SYSTEM_LIMITS.MAX_QTY_PER_ORDER));
                const rawProdMax = Number(prod.type === 'simple' ? (prod.simpleMax || prod.maxQty) : prod.maxQty) || 0;
const prodMaxQty = prod.type === 'select' ?
    1 :
    Math.min(defaultMaxQty, rawProdMax > 0 ? rawProdMax : defaultMaxQty);        let testQty = prod.type === 'select' ? 1 : Math.max(1, Number(prod.minQty) || 1);
                if (prod.type === 'counter' && baseUnitCalc.finalPrice < 0.02) {
                    const counterScaleQty = Math.min(prodMaxQty, Math.max(testQty, Math.ceil(1 / baseUnitCalc.finalPrice)));
                    testQty = counterScaleQty;
                }
                if (isCoupon && Number(promoData.minOrder) > 0) {
                    const neededQtyForMinOrder = Math.ceil(Number(promoData.minOrder) / baseUnitCalc.finalPrice);
                    if (neededQtyForMinOrder > prodMaxQty) continue;
                    testQty = Math.max(testQty, neededQtyForMinOrder);
                }
                
                const promoCalc = FinancialEngine.calculateOrderTotal({
                    product: prod,
                    tier: tier,
                    offer: isCoupon ? null : promoData,
                    coupon: isCoupon ? promoData : null,
                    optIdx: optIdx,
                    allowDefaultOption: optIdx === null,
                    requireServerCost: true
                }, testQty);
                
                if (promoCalc.isFirewallViolated) {
                    const optLabel = activeOpt ? ` (${activeOpt.name})` : '';
                    const tierLabel = tier.nameAr || tier.name || tier.id;
                    return {
                        isBroken: true,
                        reason: `يتسبب بكسر رأس المال في المنتج [${prod.name}${optLabel}] عند مستوى [${tierLabel}] (سعر البيع بعد الخصم ${promoCalc.totalFinalPrice}$ بينما الحد الأدنى الآمن ${(promoCalc.totalCostUsd * 1.005).toFixed(4)}$).`
                    };
                }
            } catch (e) {
                continue;
            }
        }
    }
    
    return { isBroken: false };
};

const validatePromoSafetyOnServer = async (promoData, isCoupon = false, preloadedProds = null, preloadedRetailTiers = null) => {
    if (!promoData || promoData.isActive === false) return { isSafe: true };
    if (!isCoupon && (promoData.type === 'fake' || promoData.type === 'badge_only')) return { isSafe: true };

    const val = FinancialEngine.extractNum(promoData.value);
    const isPctPromo = (promoData.type === 'percentage' || promoData.type === 'real');
    if (val <= 0 || (isPctPromo && val > 100)) {     
        return { isSafe: false, reason: 'قيمة أو نسبة الخصم غير صالحة.' };
    }

    let retailTiers = preloadedRetailTiers;
    if (!retailTiers) {
        const cacheDoc = await db.collection('telecard_system').doc('active_pricing').get();
        const allTiers = (cacheDoc.exists && Array.isArray(cacheDoc.data().tiers))
            ? cacheDoc.data().tiers
            : (await buildPricingCache()).tiers;
        retailTiers = allTiers.filter(t => t.type !== 'api');
    }

    if (retailTiers.length === 0) return { isSafe: true };

    let targetProdsDocs = [];
    const targetProdsStr = Array.isArray(promoData.targetProds) ? promoData.targetProds.filter(Boolean).map(String) : [];
    const targetCatsStr = Array.isArray(promoData.targetCategories) ? promoData.targetCategories.filter(Boolean).map(String) : [];
    const hasTargetProds = targetProdsStr.length > 0;
    const hasTargetCats = targetCatsStr.length > 0;

    if (Array.isArray(preloadedProds)) {
        targetProdsDocs = preloadedProds.filter(p => {
            if (!p || p.isActive === false) return false;
            if (!hasTargetProds && !hasTargetCats) return true;
            const pIdStr = String(p.id || '').trim();
            const pCats = [].concat(p.categoryId, p.categoryIds).filter(Boolean).map(String);
            return (hasTargetProds && targetProdsStr.includes(pIdStr)) ||
                   (hasTargetCats && targetCatsStr.some(cid => pCats.includes(cid)));
        });
    } else if (hasTargetProds) {
        const SAFE_CHUNK_SIZE = 200;
        for (let i = 0; i < targetProdsStr.length; i += SAFE_CHUNK_SIZE) {
            const chunkIds = targetProdsStr.slice(i, i + SAFE_CHUNK_SIZE);
            const refs = chunkIds.map(id => db.collection('telecard_prods').doc(String(id)));
            const snaps = await db.getAll(...refs);
            const validDocs = snaps
                .filter(s => s.exists && s.data().isActive !== false)
                .map(s => ({ id: s.id, ...s.data() }));
            targetProdsDocs.push(...validDocs);
        }
    } else if (hasTargetCats) {
        const prodsSnap = await db.collection('telecard_prods').get();
        targetProdsDocs = prodsSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => {
                if (p.isActive === false) return false;
                const pCats = [].concat(p.categoryId, p.categoryIds).filter(Boolean).map(String);
                return targetCatsStr.some(cid => pCats.includes(cid));
            });
    } else {
        const prodsSnap = await db.collection('telecard_prods').get();
        targetProdsDocs = prodsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.isActive !== false);
    }

    const nowMs = Date.now();
    for (const prod of targetProdsDocs) {
        const checkRes = testPromoAgainstSingleProduct(promoData, isCoupon, prod, retailTiers, nowMs);
        if (checkRes.isBroken) {
            return { isSafe: false, reason: checkRes.reason };
        }
    }

    return { isSafe: true };
};
const auditAndQuarantineUnsafePromosForProduct = async (prodId, prodData, tiersData, cachedOffers = [], cachedCoupons = null) => {
    try {
        const prodIdStr = String(prodId).trim();
        const prodWithId = { id: prodIdStr, ...prodData };
        const prodCats = [].concat(prodData.categoryId, prodData.categoryIds).filter(Boolean).map(String);
        const retailTiers = (tiersData || []).filter(t => t.type !== 'api');
        if (retailTiers.length === 0) return;
        const nowMs = Date.now();

        const doesPromoApplyToProd = (promo) => {
            const targetProdsStr = Array.isArray(promo.targetProds) ? promo.targetProds.filter(Boolean).map(String) : [];
            const targetCatsStr = Array.isArray(promo.targetCategories) ? promo.targetCategories.filter(Boolean).map(String) : [];
            const hasProds = targetProdsStr.length > 0;
            const hasCats = targetCatsStr.length > 0;
            return (!hasProds && !hasCats) ||
                (hasProds && targetProdsStr.includes(prodIdStr)) ||
                (hasCats && targetCatsStr.some(cid => prodCats.includes(cid)));
        };

        // 1. فحص العروض الترويجية النشطة (0 قراءات إضافية)
        for (const off of cachedOffers) {
            if (!off || off.type === 'fake' || off.type === 'badge_only' || off.isActive === false) continue;
            const offExpMs = off.expiryDate ? FinancialEngine.parseSafeTime(off.expiryDate) : 0;
            if (offExpMs > 0 && offExpMs <= nowMs) continue;
            if (!doesPromoApplyToProd(off)) continue;

            const offerTest = testPromoAgainstSingleProduct(off, false, prodWithId, retailTiers, nowMs);
            if (offerTest.isBroken) {
                const offRef = db.collection('telecard_offers').doc(String(off.id));
                const wasDisabledNow = await db.runTransaction(async (tx) => {
                    const liveOffSnap = await tx.get(offRef);
                    if (!liveOffSnap.exists || liveOffSnap.data().isActive === false) return false;
                    tx.update(offRef, {
                        isActive: false,
                        requiresAdminAttention: true,
                        syncNote: `⛔ تم إيقاف العرض آلياً بعد تحديث تكلفة/سعر المنتج (${prodData.name}): ${offerTest.reason}`
                    });
                    return true;
                }).catch(() => false);

                if (wasDisabledNow) {
                    SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                        '🚨 إيقاف عرض ترويجي لحماية رأس المال!',
                        `تم إيقاف العرض (${off.name || off.id}) تلقائياً لأن تسعير/تكلفة المنتج (${prodData.name}) لم تعد تغطي خصم العرض.`,
                        { action: 'OFFER_AUTO_QUARANTINED', target: 'offers', offerId: String(off.id), prodId: prodIdStr }
                    ).catch(() => {});
                }
            }
        }

        // 2. فحص الكوبونات النشطة من الكاش مباشرة (0 قراءات إضافية)
        const couponsList = Array.isArray(cachedCoupons)
            ? cachedCoupons
            : (await db.collection('telecard_coupons').where('isActive', '==', true).get()).docs.map(d => ({ id: d.id, ...d.data() }));

        for (const cp of couponsList) {
            if (!cp || cp.isActive === false) continue;
            const cpExpMs = cp.expiryDate ? FinancialEngine.parseSafeTime(cp.expiryDate) : 0;
            if (cpExpMs > 0 && cpExpMs <= nowMs) continue;
            if (!doesPromoApplyToProd(cp)) continue;

            const couponTest = testPromoAgainstSingleProduct(cp, true, prodWithId, retailTiers, nowMs);
            if (couponTest.isBroken) {
                const cpRef = db.collection('telecard_coupons').doc(String(cp.id));
                const wasCpDisabled = await db.runTransaction(async (tx) => {
                    const liveCpSnap = await tx.get(cpRef);
                    if (!liveCpSnap.exists || liveCpSnap.data().isActive === false) return false;
                    tx.update(cpRef, {
                        isActive: false,
                        requiresAdminAttention: true,
                        syncNote: `⛔ تم إيقاف الكوبون آلياً بعد تحديث تكلفة/سعر المنتج (${prodData.name}): ${couponTest.reason}`
                    });
                    return true;
                }).catch(() => false);

                if (wasCpDisabled) {
                    SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                        '🚨 إيقاف كوبون خصم لحماية رأس المال!',
                        `تم إيقاف الكوبون (${cp.code || cp.id}) تلقائياً لأن تسعير/تكلفة المنتج (${prodData.name}) لم تعد تغطي قيمة الكوبون.`,
                        { action: 'COUPON_AUTO_QUARANTINED', target: 'coupons', couponId: String(cp.id), prodId: prodIdStr }
                    ).catch(() => {});
                }
            }
        }
    } catch (err) {
        console.error('[Audit Promos For Product Error]:', err);
    }
};
const hasPromoFinancialRulesChanged = (before, after) => {
    if (!before || !after) return true;
    return (
        Boolean(before.isActive) !== Boolean(after.isActive) ||
        before.type !== after.type ||
        Number(before.value || 0) !== Number(after.value || 0) ||
        Number(before.maxDiscount || 0) !== Number(after.maxDiscount || 0) ||
        Number(before.minOrder || 0) !== Number(after.minOrder || 0) ||
        Boolean(before.isPerUnit) !== Boolean(after.isPerUnit) ||
        JSON.stringify(before.targetProds || []) !== JSON.stringify(after.targetProds || []) ||
        JSON.stringify(before.targetCategories || []) !== JSON.stringify(after.targetCategories || []) ||
        JSON.stringify(before.targetTiers || []) !== JSON.stringify(after.targetTiers || [])
    );
};

exports.onOfferUpdate = onDocumentWritten({ document: 'telecard_offers/{offerId}', memory: "256MiB", concurrency: 1, retry: true }, async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;

    if ((!before || before.isActive === false) && (!after || after.isActive === false)) {
        return null;
    }

    if (after && after.isActive !== false && after.type !== 'fake' && after.type !== 'badge_only' && hasPromoFinancialRulesChanged(before, after)) {
        const safetyCheck = await validatePromoSafetyOnServer({ id: event.params.offerId, ...after }, false);
        if (!safetyCheck.isSafe) {
            await event.data.after.ref.update({
                isActive: false,
                requiresAdminAttention: true,
                syncNote: `⛔ تم إيقاف العرض آلياً: ${safetyCheck.reason}`
            });
            await SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                '🚨 تم منع عرض ترويجي خاسر!',
                `تم إيقاف العرض (${after.name || event.params.offerId}) تلقائياً لأن نسبته تكسر رأس المال: ${safetyCheck.reason}`,
                { action: 'OFFER_BLOCKED_ON_SAVE', target: 'offers', offerId: event.params.offerId }
            ).catch(() => {});
            return null;
        }
    }
    await buildPricingCache();
    await db.collection('telecard_system').doc('cache_version').set({ catalogVersion: admin.firestore.FieldValue.increment(1) }, { merge: true });
});

exports.onCouponUpdate = onDocumentWritten({ document: 'telecard_coupons/{couponId}', memory: "256MiB", concurrency: 1, retry: true }, async (event) => {
    const beforeData = event.data.before.exists ? event.data.before.data() : null;
    const couponData = event.data.after.exists ? event.data.after.data() : null;

    if ((!beforeData || beforeData.isActive === false) && (!couponData || couponData.isActive === false)) {
        return null;
    }

    if (!hasPromoFinancialRulesChanged(beforeData, couponData)) {
        return null;
    }

    if (couponData && couponData.isActive !== false) {
        const safetyCheck = await validatePromoSafetyOnServer({ id: event.params.couponId, ...couponData }, true);
        if (!safetyCheck.isSafe) {
            await event.data.after.ref.update({
                isActive: false,
                requiresAdminAttention: true,
                syncNote: `⛔ تم إيقاف الكوبون آلياً: ${safetyCheck.reason}`
            });
            await SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                '🚨 تم منع كوبون خصم خاسر!',
                `تم إيقاف الكوبون (${couponData.code || event.params.couponId}) تلقائياً لأن قيمته تكسر رأس المال: ${safetyCheck.reason}`,
                { action: 'COUPON_BLOCKED_ON_SAVE', target: 'coupons', couponId: event.params.couponId }
            ).catch(() => {});
            return null;
        }
    }

    await buildPricingCache();
    return null;
});
exports.onTierUpdate = onDocumentWritten({
    document: 'telecard_tiers/{tierId}',
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
    concurrency: 1,
    retry: true
}, 
async (event) => {
    const tierId = event.params.tierId;
    const isMasterDefaultTier = (String(tierId) === 'TIER_DEFAULT');
    const publicTierRef = db.collection('telecard_tiers_public').doc(tierId);
    
    if (!event.data.after.exists) {
        if (!isMasterDefaultTier) {
            await publicTierRef.delete().catch(() => {});
        }
    } else {
        const newTierData = event.data.after.data();
        
        const enforcedIsDefault = isMasterDefaultTier ? true : false;
        const enforcedThreshold = isMasterDefaultTier ? 0 : FinancialEngine.extractNum(newTierData.threshold ?? newTierData.condition_amount ?? 0);
        const enforcedDuration = isMasterDefaultTier ? 0 : FinancialEngine._getDurationDays(newTierData, 30);
        const enforcedType = isMasterDefaultTier ? 'retail' : (newTierData.type === 'api' ? 'api' : 'retail');
        // 📌 [توحيد معماري - المتجر والأدمن]: المعرف القياسي لأيقونة ولون المستوى هو (icon و color)
        const enforcedIcon = newTierData.icon || newTierData.badge || 'fa-user';
        const enforcedColor = newTierData.color || '#FFD700';
        
        const rawThreshold = Number(newTierData.threshold);
        const rawDuration = Number(newTierData.durationDays);

        if (
            typeof newTierData.isDefault !== 'boolean' ||
            newTierData.isDefault !== enforcedIsDefault ||
            !Number.isFinite(rawThreshold) ||
            rawThreshold !== enforcedThreshold ||
            !Number.isFinite(rawDuration) ||
            rawDuration !== enforcedDuration ||
            (newTierData.type || '') !== enforcedType ||
            !newTierData.icon
        ) {            
            await event.data.after.ref.set({
                isDefault: enforcedIsDefault,
                threshold: enforcedThreshold,
                durationDays: enforcedDuration,
                type: enforcedType,
                icon: enforcedIcon,
                color: enforcedColor
            }, { merge: true });
        }
        
        await publicTierRef.set({
            id: tierId,
            name: newTierData.name || '',
            nameAr: newTierData.nameAr || newTierData.name || '',
            threshold: enforcedThreshold,
            durationDays: enforcedDuration,
            isDefault: enforcedIsDefault,
            type: enforcedType,
            icon: enforcedIcon,
            color: enforcedColor,
            autoAdvance: newTierData.autoAdvance !== false,
            ...(newTierData.sortOrder !== undefined && { sortOrder: Number(newTierData.sortOrder) || 0 }),
            ...(newTierData.order !== undefined && { order: Number(newTierData.order) || 0 })
        });
    }    

    const fallback = await buildPricingCache();
    const newTier = event.data.after.exists ? event.data.after.data() : null;
    const oldTier = event.data.before.exists ? event.data.before.data() : null;
    
    const oldProfitPct = FinancialEngine.extractNum(oldTier?.profitPercent ?? oldTier?.profit_percent);
    const newProfitPct = FinancialEngine.extractNum(newTier?.profitPercent ?? newTier?.profit_percent);
    const oldMinProfit = FinancialEngine.extractNum(oldTier?.minProfitUsd ?? oldTier?.min_profit_usd);
    const newMinProfit = FinancialEngine.extractNum(newTier?.minProfitUsd ?? newTier?.min_profit_usd);

    if (!event.data.after.exists) {
        const [couponsWithTier, offersWithTier] = await Promise.all([
            db.collection('telecard_coupons').where('targetTiers', 'array-contains', String(tierId)).get(),
            db.collection('telecard_offers').where('targetTiers', 'array-contains', String(tierId)).get()
        ]);
        const docsToClean = [...couponsWithTier.docs, ...offersWithTier.docs];
        if (docsToClean.length > 0) {
            await SecurityEngine.processInBatches(db, docsToClean, async (batch, docSnap) => {
                const d = docSnap.data();
                const updatedTiers = (d.targetTiers || []).filter(id => String(id) !== String(tierId));
                const payload = { targetTiers: updatedTiers };
                if (updatedTiers.length === 0) payload.isActive = false;
                batch.update(docSnap.ref, payload);
            }, 400);
            await buildPricingCache();
        }
    }

    const oldEnforcedType = isMasterDefaultTier ? 'retail' : (oldTier?.type === 'api' ? 'api' : 'retail');
    const newEnforcedType = isMasterDefaultTier ? 'retail' : (newTier?.type === 'api' ? 'api' : 'retail');
    const oldEnforcedIsDefault = isMasterDefaultTier ? true : false;
    const newEnforcedIsDefault = isMasterDefaultTier ? true : false;

    if (
        oldTier &&
        newTier &&
        oldProfitPct === newProfitPct &&
        oldMinProfit === newMinProfit &&
        oldEnforcedType === newEnforcedType &&
        oldEnforcedIsDefault === newEnforcedIsDefault
    ) {        
        await db.collection('telecard_system').doc('cache_version').set({
            catalogVersion: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
        return null;
    }
    
    const activeProdsSnap = await db.collection('telecard_prods').get();
    const newlyQuarantinedProds = [];
    
    const totalUpdated = await SecurityEngine.processInBatches(db, activeProdsSnap.docs, async (batch, doc) => {
        const prodData = doc.data();
        const publicDocRef = db.collection('telecard_prods_public').doc(doc.id);
        
        if (prodData.isActive === false) {
            batch.delete(publicDocRef);
            return;
        }
        const generatedPublic = generatePublicProductData(prodData, fallback.tiers);
        const hasNonPricingBlock = Boolean(prodData.isAutoFrozen === true || (prodData.requiresAdminAttention === true && !isPricingOnlyAttention(prodData)));

        if (generatedPublic._hasPricingError || hasNonPricingBlock) {
            batch.delete(publicDocRef);
            if (generatedPublic._hasPricingError && prodData.requiresAdminAttention !== true) {
                batch.update(doc.ref, {
                    requiresAdminAttention: true,
                    syncNote: 'تحذير أمني: بعد تحديث المستويات، أصبح هذا المنتج أو إحدى باقاته يحتوي على تسعير يكسر رأس المال. تم عزله لحين المراجعة.'
                });
                newlyQuarantinedProds.push({ id: doc.id, name: prodData.name || doc.id });
            }
            return;
        }
        if (prodData.requiresAdminAttention === true && isPricingOnlyAttention(prodData)) {
            batch.update(doc.ref, {
                requiresAdminAttention: false,
                syncNote: admin.firestore.FieldValue.delete()
            });
        }
        delete generatedPublic._hasPricingError;
        batch.set(publicDocRef, generatedPublic);
    }, 200);

    if (newlyQuarantinedProds.length > 0) {
        const sampleNames = newlyQuarantinedProds.slice(0, 3).map(p => p.name).join('، ');
        SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
            '🚨 عزل منتجات بعد تحديث المستويات!',
            `تم عزل (${newlyQuarantinedProds.length}) منتج (منها: ${sampleNames}) لأن نسب المستوى المحدثة لا تغطي التكلفة.`,
            { action: 'TIER_UPDATE_PRODUCT_QUARANTINE', target: 'products' }
        ).catch(() => {});
    }

    const isMarginLoweredOrNewTier = Boolean(newTier && (newTier.type || 'retail') !== 'api' && (!oldTier || newProfitPct < oldProfitPct || newMinProfit < oldMinProfit));
    if (isMarginLoweredOrNewTier) {
        try {
            const allProdsData = activeProdsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const retailTiers = fallback.tiers.filter(t => t.type !== 'api');
            const [activeOffersSnap, activeCouponsSnap] = await Promise.all([
                db.collection('telecard_offers').where('isActive', '==', true).get(),
                db.collection('telecard_coupons').where('isActive', '==', true).get()
            ]);

            let offerDisabled = false;
            for (const oDoc of activeOffersSnap.docs) {
                const oData = { id: oDoc.id, ...oDoc.data() };
                if (oData.type === 'fake' || oData.type === 'badge_only') continue;
                const check = await validatePromoSafetyOnServer(oData, false, allProdsData, retailTiers);
                if (!check.isSafe) {
                    await oDoc.ref.update({
                        isActive: false,
                        requiresAdminAttention: true,
                        syncNote: `⛔ تم إيقاف العرض آلياً بعد تعديل المستوى (${newTier.nameAr || newTier.name || tierId}): ${check.reason}`
                    });
                    offerDisabled = true;
                    SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                        '🚨 إيقاف عرض بعد تعديل المستوى!',
                        `تم إيقاف العرض (${oData.name || oDoc.id}) تلقائياً لحماية رأس المال: ${check.reason}`,
                        { action: 'TIER_UPDATE_OFFER_QUARANTINE', target: 'offers', offerId: oDoc.id }
                    ).catch(() => {});
                }
            }

            for (const cDoc of activeCouponsSnap.docs) {
                const cData = { id: cDoc.id, ...cDoc.data() };
                const check = await validatePromoSafetyOnServer(cData, true, allProdsData, retailTiers);
                if (!check.isSafe) {
                    await cDoc.ref.update({
                        isActive: false,
                        requiresAdminAttention: true,
                        syncNote: `⛔ تم إيقاف الكوبون آلياً بعد تعديل المستوى (${newTier.nameAr || newTier.name || tierId}): ${check.reason}`
                    });
                    SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                        '🚨 إيقاف كوبون بعد تعديل المستوى!',
                        `تم إيقاف الكوبون (${cData.code || cDoc.id}) تلقائياً لحماية رأس المال: ${check.reason}`,
                        { action: 'TIER_UPDATE_COUPON_QUARANTINE', target: 'coupons', couponId: cDoc.id }
                    ).catch(() => {});
                }
            }

            if (offerDisabled) await buildPricingCache();
        } catch (promoAuditErr) {
            console.error('[Tier Update Promo Audit Error]:', promoAuditErr);
        }
    }
    
    await db.collection('telecard_system').doc('cache_version').set({
        catalogVersion: admin.firestore.FieldValue.increment(1)
    }, { merge: true });
    
    return { success: true, updatedProductsCount: totalUpdated };
});

exports.secureProductSync = onDocumentWritten({ document: 'telecard_prods/{productId}', retry: true }, async (event) => {
    const publicProdRef = db.collection('telecard_prods_public').doc(event.params.productId);
    const cacheVersionRef = db.collection('telecard_system').doc('cache_version');
    const batch = db.batch();
    
    if (!event.data.after.exists) {
        batch.delete(publicProdRef);
        batch.set(cacheVersionRef, { catalogVersion: admin.firestore.FieldValue.increment(1) }, { merge: true });
        return batch.commit();
    }
    
    const prodData = event.data.after.data();
    const beforeData = event.data.before.exists ? event.data.before.data() : null;

    const rawAssignedVaultIds = [
        prodData.vaultPoolId,
        ...(Array.isArray(prodData.options) ? prodData.options.map(o => o?.vaultPoolId) : [])
    ].filter(Boolean).map(String);
    const computedVaultIds = [...new Set(rawAssignedVaultIds)];

    const needsVaultLinksUpdate = JSON.stringify(prodData.linkedVaultIds || []) !== JSON.stringify(computedVaultIds);
    const parentVaultChanged = !beforeData || (prodData.vaultPoolId || null) !== (beforeData.vaultPoolId || null);
    const optionVaultsChanged = !beforeData || JSON.stringify((prodData.options || []).map(o => o?.vaultPoolId || null)) !== JSON.stringify((beforeData.options || []).map(o => o?.vaultPoolId || null));
    const needsVaultStockSync = needsVaultLinksUpdate || parentVaultChanged || optionVaultsChanged;

    const selfUpdates = {};
    if (needsVaultLinksUpdate) {
        selfUpdates.linkedVaultIds = computedVaultIds;
    }
    
    // 🛡️ وسم المنتجات التي تحتوي على تسعير مؤقت
    const checkMapHasFutureExpiry = (tpObj) => { 
        if (!tpObj || typeof tpObj !== 'object') return false; 
        const nowMs = Date.now(); 
        return Object.values(tpObj).some(v => v && typeof v === 'object' && v.expiresAt && FinancialEngine.parseSafeTime(v.expiresAt) > nowMs); 
    }; 
    
    const computedHasExpiringOverrides = Boolean( 
        checkMapHasFutureExpiry(prodData.tierPrices) || 
        (prodData.type === 'select' && Array.isArray(prodData.options) && prodData.options.some(o => o && checkMapHasFutureExpiry(o.tierPrices))) 
    ); 
    
    if (Boolean(prodData.hasExpiringTierOverrides) !== computedHasExpiringOverrides) { 
        selfUpdates.hasExpiringTierOverrides = computedHasExpiringOverrides; 
        prodData.hasExpiringTierOverrides = computedHasExpiringOverrides; 
    }

    const hadPreviousSupplierConflict = Boolean(
        prodData.requiresAdminAttention === true &&
        String(prodData.syncNote || '').includes('أكثر من مورد مختلف')
    );

    let hasSupplierSharingConflict = false;
    let supplierConflictNote = '';

    if (prodData.type === 'select' && Array.isArray(prodData.options)) {
        const parentWasUnlinkedByAdmin = Boolean(beforeData?.supplierId && !prodData.supplierId);
        if (parentWasUnlinkedByAdmin) {
            let cleanedAnyOpt = false;
            const cleanedOpts = prodData.options.map(o => {
                if (o && o.supplierId) {
                    cleanedAnyOpt = true;
                    return { ...o, supplierId: null };
                }
                return o;
            });
            if (cleanedAnyOpt) {
                prodData.options = cleanedOpts;
                selfUpdates.options = cleanedOpts;
            }
        } else {
            const parentSuppId = prodData.supplierId ? String(prodData.supplierId).trim() : null;
            if (parentSuppId) {
                let unifiedAnyOpt = false;
                const unifiedOpts = prodData.options.map(o => {
                    if (o && o.supplierId && String(o.supplierId).trim() !== parentSuppId) {
                        unifiedAnyOpt = true;
                        return { ...o, supplierId: parentSuppId };
                    }
                    return o;
                });
                if (unifiedAnyOpt) {
                    prodData.options = unifiedOpts;
                    selfUpdates.options = unifiedOpts;
                }
            } else {
                const uniqueOptSuppliers = [...new Set(
                    prodData.options
                        .map(o => (!o?.vaultPoolId && o?.supplierId && o?.externalId) ? String(o.supplierId).trim() : null)
                        .filter(Boolean)
                )];
                if (uniqueOptSuppliers.length === 1) {
                    prodData.supplierId = uniqueOptSuppliers[0];
                    prodData.isExternal = true;
                    selfUpdates.supplierId = uniqueOptSuppliers[0];
                    selfUpdates.isExternal = true;
                } else if (uniqueOptSuppliers.length > 1) {
                    hasSupplierSharingConflict = true;
                    supplierConflictNote = 'تحذير أمني: يمنع ربط الباقات الفرعية بأكثر من مورد مختلف داخل نفس المنتج.';
                    if (prodData.isAvailable !== false) selfUpdates.isAvailable = false;
                    if (prodData.requiresAdminAttention !== true) selfUpdates.requiresAdminAttention = true;
                    if (prodData.syncNote !== supplierConflictNote) selfUpdates.syncNote = supplierConflictNote;
                    prodData.isAvailable = false;
                    prodData.requiresAdminAttention = true;
                    prodData.syncNote = supplierConflictNote;

                    if (!hadPreviousSupplierConflict) {
                        SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                            '🚨 تعارض في ربط الموردين!',
                            `تم إيقاف توفر المنتج (${prodData.name}): ${supplierConflictNote}`,
                            { action: 'SUPPLIER_SHARING_CONFLICT', target: 'products', prodId: event.params.productId }
                        ).catch(() => {});
                    }
                }
            }
        }
    }

    if (!hasSupplierSharingConflict && hadPreviousSupplierConflict) {
        selfUpdates.requiresAdminAttention = false;
        selfUpdates.syncNote = admin.firestore.FieldValue.delete();
        prodData.requiresAdminAttention = false;
        delete prodData.syncNote;
    }

    const hadPreviousVaultConflict = Boolean(
        prodData.requiresAdminAttention === true &&
        (String(prodData.syncNote || '').includes('نفس الخزنة') || String(prodData.syncNote || '').includes('مشاركة الخزنة'))
    );
    
    const isOwnSupplierVault = Boolean(
        prodData.isExternal === true &&
        rawAssignedVaultIds.length === 1 &&
        computedVaultIds.length === 1 &&
        computedVaultIds[0] === `vault_${event.params.productId}`
    );

    let hasVaultSharingConflict = false;
    let vaultConflictNote = '';

    if ((needsVaultStockSync || hadPreviousVaultConflict) && computedVaultIds.length > 0 && !isOwnSupplierVault) {
        if (rawAssignedVaultIds.length !== computedVaultIds.length) {
            hasVaultSharingConflict = true;
            vaultConflictNote = 'تحذير أمني: لا يمكن ربط نفس الخزنة بأكثر من باقة فرعية داخل نفس المنتج.';
        } else {
            const conflictSnap = await db.collection('telecard_prods')
                .where('linkedVaultIds', 'array-contains-any', computedVaultIds.slice(0, 30))
                .limit(5)
                .get();
            const otherProdDoc = conflictSnap.docs.find(d => d.id !== event.params.productId);
            if (otherProdDoc) {
                hasVaultSharingConflict = true;
                const otherName = otherProdDoc.data().name || otherProdDoc.id;
                vaultConflictNote = `تحذير أمني: الخزنة المحددة مرتبطة مسبقاً بمنتج آخر (${otherName}). يمنع مشاركة الخزنة بين منتجين.`;
            }
        }
    }

    if (hasVaultSharingConflict) {
        if (prodData.isAvailable !== false) {
            selfUpdates.isAvailable = false;
        }
        prodData.isAvailable = false;
        if (!hadPreviousVaultConflict || prodData.syncNote !== vaultConflictNote) {
            if (prodData.requiresAdminAttention !== true) selfUpdates.requiresAdminAttention = true;
            if (prodData.syncNote !== vaultConflictNote) selfUpdates.syncNote = vaultConflictNote;
            prodData.requiresAdminAttention = true;
            prodData.syncNote = vaultConflictNote;
            SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                '🚨 تعارض في ربط الخزنة!',
                `تم إيقاف توفر المنتج (${prodData.name}): ${vaultConflictNote}`,
                { action: 'VAULT_SHARING_CONFLICT', target: 'products', prodId: event.params.productId }
            ).catch(() => {});
        }
    } else if (hadPreviousVaultConflict) {
        selfUpdates.requiresAdminAttention = false;
        selfUpdates.syncNote = admin.firestore.FieldValue.delete();
        prodData.requiresAdminAttention = false;
        delete prodData.syncNote;
    }

    const isFrozenBySecurity = Boolean(prodData.isAutoFrozen === true || prodData.isManuallyPaused === true || hasVaultSharingConflict || hasSupplierSharingConflict);

if (needsVaultStockSync && computedVaultIds.length > 0 && !hasVaultSharingConflict) {
    const vaultSnaps = await Promise.all(computedVaultIds.map(vId => db.collection('telecard_vault').doc(vId).get()));
    const vaultStockMap = new Map();
    vaultSnaps.forEach(snap => {
        if (snap.exists) vaultStockMap.set(snap.id, Number(snap.data().stockCount || 0));
    });
    
    if (prodData.vaultPoolId) {
        const targetStock = vaultStockMap.get(prodData.vaultPoolId) || 0;
        const targetAvail = isFrozenBySecurity ? false : (targetStock > 0);
        if (prodData.stockCount !== targetStock) {
            prodData.stockCount = targetStock;
            selfUpdates.stockCount = targetStock;
        }
        if (prodData.isAvailable !== targetAvail) {
            prodData.isAvailable = targetAvail;
            selfUpdates.isAvailable = targetAvail;
        }
    }
    
    if (prodData.type === 'select' && Array.isArray(prodData.options)) {
        let optsChanged = false;
        const newOpts = prodData.options.map(opt => {
            if (opt && opt.vaultPoolId && vaultStockMap.has(opt.vaultPoolId)) {
                const targetOptStock = vaultStockMap.get(opt.vaultPoolId);
                const optCost = Number(opt.costPrice ?? opt.cost_price ?? 0);
                const targetOptAvail = !isFrozenBySecurity && (opt.isManuallyPaused !== true) && (opt.isActive !== false) && (optCost > 0) && (targetOptStock > 0);
                if (opt.stockCount !== targetOptStock || opt.isAvailable !== targetOptAvail) {
                    optsChanged = true;
                    return { ...opt, stockCount: targetOptStock, isAvailable: targetOptAvail };
                }
            }
            return opt;
        });
        if (optsChanged) {
            selfUpdates.options = newOpts;
            prodData.options = newOpts;
            if (!prodData.vaultPoolId) {
                const parentAvail = !isFrozenBySecurity && newOpts.some(o => o && o.isActive !== false && o.isManuallyPaused !== true && o.isAvailable);
                    if (prodData.isAvailable !== parentAvail) {
                        prodData.isAvailable = parentAvail;
                        selfUpdates.isAvailable = parentAvail;
                    }
                }
            }
        }
    }
    
    // 🛡️ التحديث الخاص بمنع كشف المخزون
    const getLowStockMarker = (s) => {
        if (s === undefined || s === null) return 'NONE';
        return Number(s) <= 0 ? 'ZERO' : 'AVAILABLE';
    };
    
    const stripInternalOptFields = (opts) => (opts || []).map(o => o ? ({
        name: o.name, value: o.value, sortOrder: o.sortOrder, order: o.order, isActive: o.isActive,
        isAvailable: o.isAvailable, type: o.type, badgeText: o.badgeText, badgeColor: o.badgeColor,
        costPrice: o.costPrice, price: o.price, isFixedPrice: o.isFixedPrice, 
        fixedPriceUsd: o.fixedPriceUsd, tierPrices: o.tierPrices,
        lowStockMarker: getLowStockMarker(o.stockCount)
    }) : null);
    
    const conflictStateUnchanged = (
        Boolean(prodData.requiresAdminAttention) === Boolean(beforeData?.requiresAdminAttention) &&
        String(prodData.syncNote || '') === String(beforeData?.syncNote || '')
    );

    if (beforeData && conflictStateUnchanged) {
        const isContentSame = (
            prodData.price === beforeData.price &&
            getLowStockMarker(prodData.stockCount) === getLowStockMarker(beforeData.stockCount) &&
            prodData.costPrice === beforeData.costPrice &&
            prodData.isActive === beforeData.isActive &&
            prodData.isAvailable === beforeData.isAvailable &&
            Boolean(prodData.isAutoFrozen) === Boolean(beforeData.isAutoFrozen) &&
            prodData.name === beforeData.name &&
            prodData.description === beforeData.description &&
            prodData.image === beforeData.image &&
            prodData.img === beforeData.img &&
            prodData.categoryId === beforeData.categoryId &&
            prodData.sortOrder === beforeData.sortOrder &&
            prodData.order === beforeData.order &&
            prodData.badgeText === beforeData.badgeText &&
            prodData.badgeColor === beforeData.badgeColor &&
            prodData.minQty === beforeData.minQty &&
            prodData.maxQty === beforeData.maxQty &&
            prodData.allowQty === beforeData.allowQty &&
            prodData.simpleMax === beforeData.simpleMax &&
            prodData.hideGridPrice === beforeData.hideGridPrice &&
            prodData.input1Label === beforeData.input1Label &&
            prodData.input2Label === beforeData.input2Label &&
            prodData.type === beforeData.type &&
            prodData.isFixedPrice === beforeData.isFixedPrice &&
            prodData.fixedPriceUsd === beforeData.fixedPriceUsd &&
            Boolean(prodData.disableCoupons) === Boolean(beforeData.disableCoupons) &&
            JSON.stringify(prodData.categoryIds || []) === JSON.stringify(beforeData.categoryIds || []) &&
            JSON.stringify(stripInternalOptFields(prodData.options)) === JSON.stringify(stripInternalOptFields(beforeData.options)) &&
            JSON.stringify(prodData.tierPrices || {}) === JSON.stringify(beforeData.tierPrices || {}) &&
            Boolean(prodData.hasExpiringTierOverrides) === Boolean(beforeData.hasExpiringTierOverrides)
        );
        if (isContentSame) {
            if (Object.keys(selfUpdates).length > 0) {
                await event.data.after.ref.update(selfUpdates);
            }
            return null;
        }
    }
    
    const isSupplierBulkSync = Boolean(
    prodData.isExternal &&
    prodData.syncSessionId &&
    (!beforeData || prodData.syncSessionId !== beforeData.syncSessionId)
);

const pricingOrCostChanged = !beforeData ||
    Number(prodData.costPrice || 0) !== Number(beforeData.costPrice || 0) ||
    Number(prodData.price || 0) !== Number(beforeData.price || 0) ||
    JSON.stringify(prodData.tierPrices || {}) !== JSON.stringify(beforeData.tierPrices || {}) ||
    JSON.stringify((prodData.options || []).map(o => ({ c: o?.costPrice, p: o?.price, tp: o?.tierPrices }))) !==
    JSON.stringify((beforeData?.options || []).map(o => ({ c: o?.costPrice, p: o?.price, tp: o?.tierPrices })));

if (isSupplierBulkSync && !pricingOrCostChanged && !hasVaultSharingConflict && !hasSupplierSharingConflict) {
    if (Object.keys(selfUpdates).length > 0) {
        await event.data.after.ref.update(selfUpdates);
    }
    return null;
}

if (prodData.isActive === false) {
    if (Object.keys(selfUpdates).length > 0) batch.update(event.data.after.ref, selfUpdates);
    batch.delete(publicProdRef);
    if (!isSupplierBulkSync) {
        batch.set(cacheVersionRef, { catalogVersion: admin.firestore.FieldValue.increment(1) }, { merge: true });
    }
    return batch.commit();
}

const cacheDoc = await db.collection('telecard_system').doc('active_pricing').get();
const rebuiltCache = (!cacheDoc.exists || !Array.isArray(cacheDoc.data().tiers)) ? await buildPricingCache() : null;
const tiersData = rebuiltCache ? rebuiltCache.tiers : cacheDoc.data().tiers;
const cachedOffers = rebuiltCache ? rebuiltCache.offers : (Array.isArray(cacheDoc.data().offers) ? cacheDoc.data().offers : []);
const cachedCoupons = rebuiltCache ? rebuiltCache.coupons : (Array.isArray(cacheDoc.data().coupons) ? cacheDoc.data().coupons : null);

const generatedPublicData = isSupplierBulkSync ? { _hasPricingError: false } : generatePublicProductData(prodData, tiersData);
const hasPricingError = Boolean(generatedPublicData._hasPricingError);
delete generatedPublicData._hasPricingError;

const isQuarantinedProduct = Boolean(
    hasPricingError ||
    prodData.isAutoFrozen === true ||
    hasVaultSharingConflict ||
    hasSupplierSharingConflict
);

// 🛡️ إذا تغيرت التكلفة أو الأسعار، نفحص العروض والكوبونات النشطة من الكاش مباشرة (بـ 0 استعلامات خارجية)
if (!isQuarantinedProduct && pricingOrCostChanged && prodData.isActive !== false) {
    await auditAndQuarantineUnsafePromosForProduct(event.params.productId, prodData, tiersData, cachedOffers, cachedCoupons);
}

if (isSupplierBulkSync && !hasVaultSharingConflict && !hasSupplierSharingConflict) {
    if (Object.keys(selfUpdates).length > 0) {
        await event.data.after.ref.update(selfUpdates);
    }
    return null;
}    if (isQuarantinedProduct) {
        generatedPublicData.isAvailable = false;

        if (hasPricingError && prodData.requiresAdminAttention !== true) {
            selfUpdates.requiresAdminAttention = true;
            selfUpdates.syncNote = 'تحذير أمني: هذا المنتج أو إحدى باقاته يحتوي على تكلفة (0) أو تسعير يكسر رأس المال. تم سحبه مؤقتاً من واجهة العملاء لحين إصلاحه.';

            SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts', 
                '🚨 تم عزل منتج غير مسعر!', 
                `المنتج (${prodData.name}) يحتوي على خطأ في التكلفة أو التسعير. السيرفر سحبه من جدول العملاء لحين إصلاحه.`, 
                { action: 'PRODUCT_PRICING_QUARANTINE', target: 'products', prodId: event.params.productId }
            ).catch(() => {});
        }

        if (Object.keys(selfUpdates).length > 0) {
            batch.update(event.data.after.ref, selfUpdates);
        }
        batch.delete(publicProdRef);
    } else {
        if (prodData.requiresAdminAttention === true && isPricingOnlyAttention(prodData) && prodData.isAutoFrozen !== true) {
            selfUpdates.requiresAdminAttention = false;
            selfUpdates.syncNote = admin.firestore.FieldValue.delete();
        }

        if (Object.keys(selfUpdates).length > 0) {
            batch.update(event.data.after.ref, selfUpdates);
        }
        batch.set(publicProdRef, generatedPublicData);
    }

    const isLowStockCountOnlyChange = Boolean(
        beforeData &&
        conflictStateUnchanged &&
        !isQuarantinedProduct &&
        prodData.isActive === beforeData.isActive &&
        prodData.isAvailable === beforeData.isAvailable &&
        prodData.price === beforeData.price &&
        prodData.costPrice === beforeData.costPrice &&
        prodData.name === beforeData.name &&
        prodData.description === beforeData.description &&
        prodData.image === beforeData.image &&
        prodData.img === beforeData.img &&
        prodData.categoryId === beforeData.categoryId &&
        prodData.sortOrder === beforeData.sortOrder &&
        prodData.order === beforeData.order &&
        prodData.badgeText === beforeData.badgeText &&
        prodData.badgeColor === beforeData.badgeColor &&
        prodData.minQty === beforeData.minQty &&
        prodData.maxQty === beforeData.maxQty &&
        prodData.allowQty === beforeData.allowQty &&
        prodData.simpleMax === beforeData.simpleMax &&
        prodData.hideGridPrice === beforeData.hideGridPrice &&
        prodData.input1Label === beforeData.input1Label &&
        prodData.input2Label === beforeData.input2Label &&
        prodData.type === beforeData.type &&
        prodData.isFixedPrice === beforeData.isFixedPrice &&
        prodData.fixedPriceUsd === beforeData.fixedPriceUsd &&
        Boolean(prodData.disableCoupons) === Boolean(beforeData.disableCoupons) &&
        JSON.stringify(prodData.categoryIds || []) === JSON.stringify(beforeData.categoryIds || []) &&
        JSON.stringify(stripInternalOptFields(prodData.options)) === JSON.stringify(stripInternalOptFields(beforeData.options)) &&
        JSON.stringify(prodData.tierPrices || {}) === JSON.stringify(beforeData.tierPrices || {}) &&
        Boolean(prodData.hasExpiringTierOverrides) === Boolean(beforeData.hasExpiringTierOverrides)
    );
    if (!isSupplierBulkSync && !isLowStockCountOnlyChange) {
        batch.set(cacheVersionRef, { catalogVersion: admin.firestore.FieldValue.increment(1) }, { merge: true });
    }

    return batch.commit();
});

const cleanupMarketingOrphans = async (deletedId, isCategory = false) => {
    const fieldName = isCategory ? 'targetCategories' : 'targetProds';
    
    const couponsSnap = await db.collection('telecard_coupons').where(fieldName, 'array-contains', String(deletedId)).get();
    const offersSnap = await db.collection('telecard_offers').where(fieldName, 'array-contains', String(deletedId)).get();
    
    if (couponsSnap.empty && offersSnap.empty) return null;
    
    await db.runTransaction(async (transaction) => {
        const allRefs = [...couponsSnap.docs, ...offersSnap.docs].map(d => d.ref);
        const liveDocs = await transaction.getAll(...allRefs);
        
        liveDocs.forEach(docSnap => {
            if (!docSnap.exists) return;
            const data = docSnap.data();
            let isModified = false;
            let updatePayload = {};
            
            if (data[fieldName] && Array.isArray(data[fieldName])) {
                const newArray = data[fieldName].filter(id => String(id) !== String(deletedId));
                if (newArray.length !== data[fieldName].length) {
                    updatePayload[fieldName] = newArray;
                    isModified = true;
                    data[fieldName] = newArray;
                }
            }
            
            const hasProds = Array.isArray(data.targetProds) && data.targetProds.length > 0;
            const hasCats = Array.isArray(data.targetCategories) && data.targetCategories.length > 0;
            
            if (isModified && !hasProds && !hasCats) {
                updatePayload.isActive = false;
            }
            
            if (isModified) {
                transaction.update(docSnap.ref, updatePayload);
            }
        });
    });
    
    await db.collection('telecard_system').doc('cache_version').set({ catalogVersion: admin.firestore.FieldValue.increment(1) }, { merge: true });
    await buildPricingCache();
};

exports.onProductDeletedCleanup = onDocumentDeleted({ document: 'telecard_prods/{productId}', retry: true }, async (event) => {
    await cleanupMarketingOrphans(event.params.productId, false);
});

exports.onCategoryDeletedCleanup = onDocumentDeleted({ document: 'telecard_cats/{catId}', retry: true }, async (event) => {
    await cleanupMarketingOrphans(event.params.catId, true);
});

// ==========================================
// 🚨 5. مشغلات الرادار الذكية للإشعارات (Smart FCM Triggers)
// ==========================================
const sendFCMToUser = async (userId, title, body, payloadData = {}) => {
    try {
        const userDoc = await db.collection('telecard_users').doc(String(userId)).get();
        if (!userDoc.exists) return;
        const tokens = userDoc.data().fcmTokens || [];
        if (!Array.isArray(tokens) || tokens.length === 0) return;
        
        let safeTokens = tokens;
        if (tokens.length > 20) safeTokens = tokens.slice(-20);
        
        const response = await admin.messaging().sendEachForMulticast({ notification: { title, body }, data: payloadData, tokens: safeTokens });
        if (response.failureCount > 0) {
            const failedTokens = response.responses.map((r, i) => (!r.success && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(r.error?.code)) ? safeTokens[i] : null).filter(Boolean);
            if (failedTokens.length > 0) await userDoc.ref.update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens) }).catch(() => {});
        }
    } catch (e) { }
};

const sendFCMToAdmin = (alertType, title, body, payloadData = {}) => SecurityEngine.sendFCMToAdmin(db, admin, alertType, title, body, payloadData);

exports.autoNotifyOrderStatus = onDocumentWritten({ document: 'telecard_orders/{orderId}', retry: true }, async (event) => {
    if (!event.data.after.exists) return null;
    const after = event.data.after.data();
    const before = event.data.before.exists ? event.data.before.data() : null;
    
    if (!after.userId) return null;
    
    const prodName = after.product || 'المنتج';
    const orderRefId = String(after.id || event.params.orderId);
    
    if (!before && after.status === 'pending') {
        await sendFCMToAdmin('orders', '🛒 طلب جديد بانتظارك!', `طلب جديد لـ (${prodName}) يحتاج للتسليم اليدوي.`, { target: 'orders' });
    }
    
    if (before && before.status === after.status) return null;
    if (!before && (after.status === 'pending' || after.status === 'processing')) return null;
    if (before && before.status === 'processing' && after.status === 'pending') return null;
    const orderCreatedMs = FinancialEngine.parseSafeTime(after.time || after.createdAt || before?.time || before?.createdAt) || 0;
    const isImmediateSyncReject = orderCreatedMs > 0 && (Date.now() - orderCreatedMs) < 120000;
    if (before && before.status === 'processing' && after.status === 'rejected' && !before.actionTime && isImmediateSyncReject) return null;
    
    let title = "تحديث طلب";
    let message = `تم تغيير حالة طلبك إلى: ${after.status}`;
    
    if (after.status === 'completed') {
        title = "🎉 طلبك جاهز!";
        message = `تم تسليم ( ${prodName} ) بنجاح.`;
    }
    else if (after.status === 'processing') {
        title = "⏳ طلبك قيد التنفيذ";
        message = `جاري تجهيز ومعالجة طلبك ( ${prodName} ) حالياً.`;
    }
    else if (after.status === 'returned') {
        title = "↩️ تم إرجاع الطلب";
        message = `تم إرجاع طلبك ( ${prodName} ) واسترداد الرصيد إلى محفظتك.`;
    }
    else if (after.status === 'rejected') {
        title = "❌ طلب غير مكتمل";
        
        const note = String(after.adminNote || '').toLowerCase();
        const isBalanceIssue = note.includes('رصيد غير كاف') || note.includes('نفاد رصيد') || note.includes('رصيد المورد') || note.includes('insufficient') || note.includes('low balance') || note.includes('no balance') || note.includes('not enough balance');
        
        if (isBalanceIssue) {
            await sendFCMToAdmin('system_alerts', '🚨 رصيد المورد نفد!', `تم رفض طلب للعميل بسبب نفاد رصيدك أو مشكلة في الـ API. راجع الطلب: ${orderRefId}`, { action: 'SUPPLIER_BALANCE_ALERT', target: 'orders', orderId: orderRefId });
            message = `تعذر تنفيذ طلبك حالياً، يرجى المحاولة لاحقاً.`;
        } else {
            message = `تعذر تنفيذ الطلب: ${after.adminNote || 'يرجى مراجعة الدعم الفني.'} (تم استرجاع المبلغ).`;
        }
    }
    else if (after.status === 'refunded') {
        title = "💰 تم استرجاع الرصيد";
        message = `تم استرجاع قيمة ( ${prodName} ) بنجاح إلى محفظتك.`;
    }
    
    if (after.isApi || after.isApiOrder) return null;
    
    const notifId = `notif_${event.params.orderId}_${after.status}`;
    
    // 📌 [توحيد معماري - الإشعارات]: اعتماد (targetType و targetId) كمعرفات قياسية وحيدة للتوجيه في القاعدة و FCM
    await db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({
        id: notifId,
        title,
        message,
        type: 'notification',
        targetType: 'order',
        targetId: orderRefId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    await sendFCMToUser(after.userId, title, message, {
        targetType: 'order',
        targetId: orderRefId
    });
    
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
    else if (after.status === 'deducted') { title = "📉 خصم إداري"; message = `تم خصم ${Math.abs(displayAmt)} من محفظتك.`; } 
    else if (after.status === 'rejected') { title = "❌ إيداع مرفوض"; message = `السبب: ${after.adminNote || 'تواصل معنا'}`; } 
    else if (after.status === 'refunded') { title = "↩️ إيداع مسترجع"; message = `تم سحب ${displayAmt} من محفظتك.`; }

    const depositRefId = String(after.id || event.params.depositId);
    const notifId = `notif_${event.params.depositId}_${after.status}`;

    // 📌 [توحيد معماري - الإشعارات]: توحيد targetType على 'deposit' (ليطابق openDetail في المتجر) مع targetId
    await db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({
        id: notifId,
        title,
        message,
        type: 'notification',
        targetType: 'deposit',
        targetId: depositRefId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await sendFCMToUser(after.userId, title, message, {
        targetType: 'deposit',
        targetId: depositRefId
    });
    return null;
});

exports.autoNotifyVaultStatus = onDocumentUpdated({ document: 'telecard_vault/{poolId}', retry: true }, async (event) => {
    const after = event.data.after.data(), before = event.data.before.data();
    const currentStock = Number(after.stockCount || 0), previousStock = Number(before.stockCount || 0), limit = Number(after.alertLimit || 5);
    const poolId = event.params.poolId;
    
    if (currentStock !== previousStock && (currentStock <= 0 || previousStock <= 0)) {
        await syncLinkedProductsWithVault(poolId, currentStock, currentStock <= 0, false);
    }

    if (currentStock <= 0 && previousStock > 0) {
        await sendFCMToAdmin('vault', '📦 مخزون حرج!', `صندوق الأكواد (${after.name}) أصبح فارغاً تماماً.`, { target: 'vault' });
    } else if (currentStock <= limit && previousStock > limit) {
        await sendFCMToAdmin('vault', '⚠️ انخفاض المخزون', `تبقى ${currentStock} أكواد فقط في صندوق (${after.name}).`, { target: 'vault' });
    }    
    return null;
});

exports.autoNotifyComplaints = onDocumentWritten({ document: 'telecard_reviews/{reviewId}', retry: true }, async (event) => {
    if (!event.data.after.exists) return null;
    const after = event.data.after.data(), before = event.data.before.exists ? event.data.before.data() : null;
    
    if (!before && Number(after.rating) <= 2) {
        await sendFCMToAdmin('complaints', '🚨 عميل غاضب!', `تلقيت تقييماً بـ ${after.rating} نجوم يحتاج لتدخلك.`, { target: 'complaints' });
    }
    
    if (after.userId && after.adminReply && (!before || before.adminReply !== after.adminReply)) {
        const notifId = `notif_review_reply_${event.params.reviewId}`;
        const title = '💬 رد من إدارة المتجر على تقييمك';
        const message = String(after.adminReply).trim();
        
        await db.collection('telecard_users').doc(String(after.userId)).collection('notifications').doc(notifId).set({
            id: notifId,
            title,
            message,
            type: 'notification',
            targetType: 'notification',
            targetId: notifId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        await sendFCMToUser(after.userId, title, message, {
            targetType: 'notification',
            targetId: notifId
        });
    }
    return null;
});

exports.onKycStatusChange = onDocumentWritten({
    document: 'telecard_kyc/{docId}',
    retry: true
}, async (event) => {
    if (!event.data.after.exists) return null;
    
    const after = event.data.after.data();
    const before = event.data.before.exists ? event.data.before.data() : null;
    const userId = String(after.userId || '').trim();
    
    if (!userId || String(event.params.docId).trim() !== userId) return null;
    
    const userRef = db.collection('telecard_users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists || userSnap.data().isDeleted === true) return null;
    const currentUserData = userSnap.data();
    
    if (after.status === 'pending' && (!before || before.status !== 'pending')) {
        if (['approved', 'verified'].includes(currentUserData.kycStatus)) {
            return null;
        }
        
        try {
            const candidateUrls = [
                after.documentUrl, after.selfieUrl,
                after.frontImg, after.backImg, after.selfieImg,
                after.kycData?.frontImg, after.kycData?.backImg, after.kycData?.selfieImg
            ].filter(u => u && typeof u === 'string' && u.includes('/o/'));
            
            const uniqueFiles = [...new Set(candidateUrls.map(u => {
                try { return decodeURIComponent(u.split('/o/')[1].split('?')[0]).split('/').pop(); }
                catch (err) { return null; }
            }).filter(Boolean))];
            
            if (uniqueFiles.length > 0) {
                await Promise.allSettled(
                    uniqueFiles.map(fName => db.collection('telecard_pending_uploads').doc(fName).delete())
                );
            }
        } catch (e) {}
        
        const isSafeStorageKycLink = (urlVal) => {
            if (!urlVal || typeof urlVal !== 'string') return false;
            return urlVal.startsWith('https://firebasestorage.googleapis.com/') &&
                (urlVal.includes(`kyc_docs%2F${userId}_`) || urlVal.includes(`kyc_docs/${userId}_`));
        };
        const pickSafeKycUrl = (...urls) => urls.find(u => isSafeStorageKycLink(u)) || null;
        
        const syncedKycData = {
            fullName: SecurityEngine.sanitizeText(String(after.fullName || after.kycData?.fullName || ''), 100),
            idNumber: SecurityEngine.sanitizeText(String(after.idNumber || after.kycData?.idNumber || ''), 100),
            frontImg: pickSafeKycUrl(after.frontImg, after.documentUrl, after.kycData?.frontImg, after.kycData?.documentUrl),
            backImg: pickSafeKycUrl(after.backImg, after.kycData?.backImg),
            selfieImg: pickSafeKycUrl(after.selfieImg, after.selfieUrl, after.kycData?.selfieImg, after.kycData?.selfieUrl),
            notes: SecurityEngine.sanitizeText(String(after.notes || after.kycData?.notes || ''), 500)
        };
        
        await userRef.set({
            kycStatus: 'pending',
            kycDocId: event.params.docId,
            kycData: syncedKycData,
            kycSubmittedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        const alertTitle = !before ? '📄 طلب توثيق هوية جديد!' : '🔄 إعادة رفع توثيق هوية!';
        await sendFCMToAdmin('kyc', alertTitle, `تلقيت طلب توثيق من العميل (${after.fullName || userId.substring(0,8)}).`, { target: 'kyc' });
        return null;
    }
    
    if (before && before.status !== after.status && after.status !== 'pending') {
        const isApproved = after.status === 'approved' || after.status === 'verified';
        const rawRejectNote = String(after.kycReviewNote || after.adminNote || '').trim();
        
        // 📌 [توحيد معماري - المتجر (uiAuth.js)]: المعرف القياسي لملاحظة مراجعة التوثيق هو kycReviewNote
        let updatePayload = {
            kycStatus: after.status,
            kycReviewNote: (!isApproved && rawRejectNote) ? SecurityEngine.sanitizeText(rawRejectNote, 500) : admin.firestore.FieldValue.delete(),
            kycReviewedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        if (isApproved && after.fullName && String(after.fullName).trim() !== '') {
            updatePayload.fullName = SecurityEngine.sanitizeText(after.fullName, 100);
        }
        
        await userRef.set(updatePayload, { merge: true });
        
        const rejectReason = rawRejectNote ? `السبب: ${rawRejectNote}` : "يرجى مراجعة الدعم الفني أو إعادة رفع المستندات.";
        const title = isApproved ? "🎉 تم توثيق حسابك بنجاح!" : "❌ تم رفض طلب التوثيق";
        const message = isApproved ? "تمت ترقية حسابك إلى حساب موثق بالكامل." : `تعذر قبول المستندات. ${rejectReason}`;
        
        const notifId = `notif_kyc_${event.params.docId}_${after.status}`;
        await userRef.collection('notifications').doc(notifId).set({
            id: notifId,
            title,
            message,
            type: 'notification',
            targetType: 'profile',
            targetId: userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        await sendFCMToUser(userId, title, message, { targetType: 'profile', targetId: userId });
    }
    
    return null;
});

// ==========================================
// 🛠️ 6. دوال المزامنة القسرية للكتالوج والتسعير
// ==========================================
exports.adminForceSyncPricing = onCall(async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try { await buildPricingCache(); await buildConfigCache(); return { success: true, message: 'تم إعادة بناء الكاش بنجاح.' }; } 
    catch (error) { throw new HttpsError('internal', `فشل الترميم: ${error.message}`); }
});

exports.adminForceSyncCatalog = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try {
        const fallback = await buildPricingCache();
        const allProdsSnap = await db.collection('telecard_prods').get();
        const newlyQuarantinedProds = [];
        
        const syncCount = await SecurityEngine.processInBatches(db, allProdsSnap.docs, async (batch, doc) => {
            const prodData = doc.data();
            const publicDocRef = db.collection('telecard_prods_public').doc(doc.id);
            if (prodData.isActive === false) {
                batch.delete(publicDocRef);
                return;
            }
            const generatedPublic = generatePublicProductData(prodData, fallback.tiers);
            const hasNonPricingBlock = Boolean(prodData.isAutoFrozen === true || (prodData.requiresAdminAttention === true && !isPricingOnlyAttention(prodData)));

            if (generatedPublic._hasPricingError || hasNonPricingBlock) {
                batch.delete(publicDocRef);
                if (generatedPublic._hasPricingError && prodData.requiresAdminAttention !== true) {
                    batch.update(doc.ref, {
                        requiresAdminAttention: true,
                        syncNote: 'تحذير أمني: أثناء المزامنة القسرية، تبيّن أن هذا المنتج أو إحدى باقاته يحتوي على تكلفة (0) أو تسعير يكسر رأس المال. تم عزله للمراجعة.'
                    });
                    newlyQuarantinedProds.push({ id: doc.id, name: prodData.name || doc.id });
                }
                return;
            }
            if (prodData.requiresAdminAttention === true && isPricingOnlyAttention(prodData)) {
                batch.update(doc.ref, {
                    requiresAdminAttention: false,
                    syncNote: admin.firestore.FieldValue.delete()
                });
            }
            delete generatedPublic._hasPricingError;
            batch.set(publicDocRef, generatedPublic);
        }, 200);

        if (newlyQuarantinedProds.length > 0) {
            const sampleNames = newlyQuarantinedProds.slice(0, 3).map(p => p.name).join('، ');
            SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                '🚨 عزل منتجات أثناء المزامنة الشاملة!',
                `تم عزل (${newlyQuarantinedProds.length}) منتج (منها: ${sampleNames}) لوجود خطأ في التكلفة أو كسر هامش الأمان.`,
                { action: 'FORCE_SYNC_PRODUCT_QUARANTINE', target: 'products' }
            ).catch(() => {});
        }
        
        const tiersSnap = await db.collection('telecard_tiers').get();
        if (!tiersSnap.empty) {
            await SecurityEngine.processInBatches(db, tiersSnap.docs, async (batch, tDoc) => {
                const tData = tDoc.data();
                const isMasterDef = (String(tDoc.id) === 'TIER_DEFAULT');
                
                // 📌 [توحيد معماري - المتجر والأدمن]: نسخ icon و color إلى telecard_tiers_public
                const publicTierPayload = {
                    id: tDoc.id,
                    name: tData.name || '',
                    nameAr: tData.nameAr || tData.name || '',
                    threshold: isMasterDef ? 0 : Number(tData.threshold ?? tData.condition_amount ?? 0),
                    durationDays: isMasterDef ? 0 : Number(tData.durationDays ?? 30),
                    isDefault: isMasterDef ? true : false,
                    type: isMasterDef ? 'retail' : (tData.type === 'api' ? 'api' : 'retail'),
                    icon: tData.icon || tData.badge || 'fa-user',
                    color: tData.color || '#FFD700',
                    autoAdvance: tData.autoAdvance !== false,
                    ...(tData.sortOrder !== undefined && { sortOrder: Number(tData.sortOrder) || 0 }),
                    ...(tData.order !== undefined && { order: Number(tData.order) || 0 })
                };       
                batch.set(db.collection('telecard_tiers_public').doc(tDoc.id), publicTierPayload);
            }, 400);
        }        
        
        const batch = db.batch();
        batch.set(db.collection('telecard_system').doc('cache_version'), {
            catalogVersion: admin.firestore.FieldValue.increment(1)
        }, { merge: true });

        batch.set(db.collection('telecard_system').doc('active_configs'), {
            lastCatalogSyncedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        await batch.commit();
        
        return { success: true, message: `تمت مزامنة ${syncCount} منتج و ${tiersSnap.size} مستوى عام بنجاح وبأمان تام!` };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

let _lastSweeperRunMs = 0;

exports.runExpiredPromosAndOverridesSweeper = async () => {
    const nowMs = Date.now();
    if (nowMs - _lastSweeperRunMs < 60000) return;
    _lastSweeperRunMs = nowMs;

    try {
        let pricingCacheNeedsRebuild = false;
        let catalogNeedsVersionBump = false;
        
        // 1. تعطيل العروض الترويجية التي انتهت صلاحيتها وما زالت مسجلة كـ isActive: true
        const activeOffersSnap = await db.collection('telecard_offers').where('isActive', '==', true).get();
        if (!activeOffersSnap.empty) {
            const expiredOfferDocs = activeOffersSnap.docs.filter(d => {
                const expMs = FinancialEngine.parseSafeTime(d.data().expiryDate);
                return expMs > 0 && expMs <= nowMs;
            });
            if (expiredOfferDocs.length > 0) {
                await SecurityEngine.processInBatches(db, expiredOfferDocs, async (batch, doc) => {
                    batch.update(doc.ref, { isActive: false });
                }, 400);
                pricingCacheNeedsRebuild = true;
                catalogNeedsVersionBump = true;
            }
        }
        
        // 2. استعلام موجه بـ 0 هدر قراءات: يجلب فقط المنتجات التي تحتوي فعلاً على تسعير مستوى مؤقت
        const expiringProdsSnap = await db.collection('telecard_prods')
            .where('hasExpiringTierOverrides', '==', true)
            .get();
            
        if (!expiringProdsSnap.empty) {
            const cacheDoc = pricingCacheNeedsRebuild ? null : await db.collection('telecard_system').doc('active_pricing').get();
            const tiersData = (cacheDoc && cacheDoc.exists && Array.isArray(cacheDoc.data().tiers)) ? cacheDoc.data().tiers : (await buildPricingCache()).tiers;
            
            const hasActiveFutureExpiry = (tpObj) => {
                if (!tpObj || typeof tpObj !== 'object') return false;
                return Object.values(tpObj).some(v => v && typeof v === 'object' && v.expiresAt && FinancialEngine.parseSafeTime(v.expiresAt) > nowMs);
            };
            
            const newlyQuarantinedInSweeper = [];

            await SecurityEngine.processInBatches(db, expiringProdsSnap.docs, async (batch, doc) => {
                const prodData = doc.data();
                
                const stillHasFuture = Boolean(
                    hasActiveFutureExpiry(prodData.tierPrices) ||
                    (prodData.type === 'select' && Array.isArray(prodData.options) && prodData.options.some(o => o && hasActiveFutureExpiry(o.tierPrices)))
                );
                
                if (!stillHasFuture) {
                    batch.update(doc.ref, { hasExpiringTierOverrides: false });
                }
                
                if (prodData.isActive !== false) {
                    const publicDocRef = db.collection('telecard_prods_public').doc(doc.id);
                    const generatedPublic = generatePublicProductData(prodData, tiersData);
                    const hasNonPricingBlock = Boolean(prodData.isAutoFrozen === true || (prodData.requiresAdminAttention === true && !isPricingOnlyAttention(prodData)));
                    
                    if (generatedPublic._hasPricingError || hasNonPricingBlock) {
                        batch.delete(publicDocRef);
                        if (generatedPublic._hasPricingError && prodData.requiresAdminAttention !== true) {
                            batch.update(doc.ref, {
                                requiresAdminAttention: true,
                                syncNote: 'تحذير أمني: بعد انتهاء صلاحية السعر المؤقت، أصبح السعر الأساسي للمنتج يكسر رأس المال. تم عزله لحين المراجعة.'
                            });
                            newlyQuarantinedInSweeper.push({ id: doc.id, name: prodData.name || doc.id });
                        }
                    } else {
                        delete generatedPublic._hasPricingError;
                        batch.set(publicDocRef, generatedPublic);
                    }
                    catalogNeedsVersionBump = true;
                }
            }, 200);

            if (newlyQuarantinedInSweeper.length > 0) {
                const sampleNames = newlyQuarantinedInSweeper.slice(0, 3).map(p => p.name).join('، ');
                SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts',
                    '🚨 عزل منتج بعد انتهاء التسعير المؤقت!',
                    `تم عزل (${newlyQuarantinedInSweeper.length}) منتج (منها: ${sampleNames}) لأن السعر الأساسي بعد انتهاء السعر المؤقت لا يغطي التكلفة.`,
                    { action: 'SWEEPER_PRODUCT_QUARANTINE', target: 'products' }
                ).catch(() => {});
            }
        } else if (pricingCacheNeedsRebuild) {
            await buildPricingCache();
        }
        
        if (catalogNeedsVersionBump) {
            await db.collection('telecard_system').doc('cache_version').set({
                catalogVersion: admin.firestore.FieldValue.increment(1)
            }, { merge: true });
        }
    } catch (e) {
        _lastSweeperRunMs = 0;
        console.error("[Expired Promos & Overrides Sweeper Error]:", e);
    }
};
exports.generatePublicProductData = generatePublicProductData;
