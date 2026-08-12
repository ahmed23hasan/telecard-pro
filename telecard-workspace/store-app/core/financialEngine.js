// ============================================================================
// 💰 المحرك المالي للواجهة الأمامية (Store Frontend Version) - V18.1 🛒
// 🎯 الوظيفة: محاكاة فورية ودقيقة 100% لأسعار السيرفر وتخفيضات الكوبونات للعميل
// 🚀 التحديثات المعمارية النهائية (V18.1):
// 1. التطابق التام: دمج نفس محول العملات (normalizeRates) الموجود في السيرفر لضمان تطابق السنتات.
// 2. Shock Absorbers: الحفاظ على بيئة آمنة للمستخدم (لا يوجد Throw Error، تفادي الـ NaN بصمت).
// 3. Zero Trust: التأكد من إخفاء أي بيانات تخص سعر التكلفة (Cost) أو الأرباح عن المتصفح.
// ============================================================================

import { parseSafeTime } from '../utils.js';

const FinancialEngineDef = {
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        MAX_QTY_LIMIT: 10000,
        MAX_PRICE_LIMIT: 100000,
        PRECISION: 4,          
        INTERNAL_PRECISION: 8, 
        MIN_SALE_PRICE: 0.01   
    }),

    // ========================================================================
    // 🧮 القسم الأول: الدوال الرياضية الأساسية (Core Math) - مطابقة للسيرفر
    // ========================================================================
    
    _preciseRound: function(num, decimals = FinancialEngineDef.CONFIG.PRECISION) {
        let n = Number(num);
        if (isNaN(n) || n === 0) return 0;
        const factor = Math.pow(10, decimals);
        return Math.round((n + Number.EPSILON) * factor) / factor;
    },

    _internalAdd: function(a, b) { return FinancialEngineDef._preciseRound((Number(a) || 0) + (Number(b) || 0), FinancialEngineDef.CONFIG.INTERNAL_PRECISION); },
    _internalSub: function(a, b) { return FinancialEngineDef._preciseRound((Number(a) || 0) - (Number(b) || 0), FinancialEngineDef.CONFIG.INTERNAL_PRECISION); },
    _internalMul: function(a, b) { return FinancialEngineDef._preciseRound((Number(a) || 0) * (Number(b) || 0), FinancialEngineDef.CONFIG.INTERNAL_PRECISION); },
    _internalDiv: function(a, b) {
        const numB = Number(b) || 0;
        // 🛡️ حماية الواجهة: القسمة على صفر تعيد 0 بدلاً من تحطيم الموقع
        return numB === 0 ? 0 : FinancialEngineDef._preciseRound((Number(a) || 0) / numB, FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
    },

    safeAdd: function(a, b) { return FinancialEngineDef._preciseRound(FinancialEngineDef._internalAdd(a, b)); },
    // 🛡️ حماية الواجهة: منع الأسعار من أن تصبح بالسالب في الشاشة
    safeSub: function(a, b) { return Math.max(0, FinancialEngineDef._preciseRound(FinancialEngineDef._internalSub(a, b))); },
    safeMul: function(a, b) { return FinancialEngineDef._preciseRound(FinancialEngineDef._internalMul(a, b)); },
    safeDiv: function(a, b) { return FinancialEngineDef._preciseRound(FinancialEngineDef._internalDiv(a, b)); },
    
    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '' || Array.isArray(val) || typeof val === 'object') return 0;
        const num = Number(val);
        if (isNaN(num) || num < 0) return 0;
        if (!allowZero && num === 0) return 1;
        return num;
    },
    
    // 🔄 تم التحديث: محول العملات القوي مطابق للسيرفر ولكن مع "تجاهل الأخطاء بصمت"
    normalizeRates: function(raw) {
        const ratesMap = {};
        ratesMap[FinancialEngineDef.CONFIG.BASE_CURRENCY] = { code: FinancialEngineDef.CONFIG.BASE_CURRENCY, priceRate: 1, depRate: 1, isBase: true };
        
        const processRateObj = (code, priceR, depR) => {
            const numPrice = FinancialEngineDef.extractNum(priceR);
            const numDep = FinancialEngineDef.extractNum(depR);
            if (numPrice > 0 && numDep > 0) {
                ratesMap[code] = { code: code, priceRate: numPrice, depRate: numDep };
            }
        };

        if (Array.isArray(raw)) {
            for (const rate of raw) {
                if (rate && rate.code && rate.code !== FinancialEngineDef.CONFIG.BASE_CURRENCY) {
                    processRateObj(String(rate.code).toUpperCase(), rate.priceRate || rate.value, rate.depRate || rate.value);
                }
            }
        } else if (raw && typeof raw === 'object') {
            if (raw.priceRate !== undefined || raw.depRate !== undefined || raw.code !== undefined) {
                const code = String(raw.code || '').toUpperCase();
                if (code && code !== FinancialEngineDef.CONFIG.BASE_CURRENCY) {
                    processRateObj(code, raw.priceRate || raw.value, raw.depRate || raw.value);
                }
            } else {
                const invalidKeys = ['ISBASE', 'PRICERATE', 'DEPRATE', 'CODE', 'VALUE', 'SYMBOL', 'NAME'];
                for (const [key, value] of Object.entries(raw)) {
                    const code = String(key).toUpperCase();
                    if (code !== FinancialEngineDef.CONFIG.BASE_CURRENCY && !invalidKeys.includes(code)) {
                        if (typeof value === 'object' && value !== null) {
                            processRateObj(code, value.priceRate || value.value, value.depRate || value.value);
                        } else {
                            processRateObj(code, value, value);
                        }
                    }
                }
            }
        }
        return ratesMap;
    },
    
    convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel = 'pricing') {
        const amt = FinancialEngineDef.extractNum(amount);
        const fCode = String(fromCode || FinancialEngineDef.CONFIG.BASE_CURRENCY).toUpperCase();
        const tCode = String(toCode || FinancialEngineDef.CONFIG.BASE_CURRENCY).toUpperCase();
        if (amt === 0 || fCode === tCode) return amt;
        
        const ratesMap = FinancialEngineDef.normalizeRates(ratesArray);
        if (!ratesMap[fCode] || !ratesMap[tCode]) return amt; 
        
        const fRate = channel === 'deposit' ? ratesMap[fCode].depRate : ratesMap[fCode].priceRate;
        const tRate = channel === 'deposit' ? ratesMap[tCode].depRate : ratesMap[tCode].priceRate;

        if (fRate === 0 || tRate === 0) return amt;
        
        const usdAmount = FinancialEngineDef._internalDiv(amt, fRate);
        const finalAmount = FinancialEngineDef._internalMul(usdAmount, tRate);
        
        return FinancialEngineDef._preciseRound(finalAmount);
    },

    convertViaUSDHelper: function(amt, f, t, rates, rnd = 'round', c = 'pricing') {
        let v = FinancialEngineDef.convertViaUSD(amt, f, t, rates, c);
        if(rnd === 'floor') return Math.floor(v * 10000) / 10000;
        if(rnd === 'ceil')  return Math.ceil(v * 10000) / 10000;
        return Number(v.toFixed(4));
    },

    // ========================================================================
    // 💼 القسم الثاني: منطق أعمال المتجر (Business Logic & Pricing) 
    // ========================================================================

    getUserTier: function(user, tiers = []) {
        if (!tiers || !tiers.length) return { profit_percent: 0, min_profit_usd: 0 }; 
        const code = String(user?.tierId ?? user?.tier ?? '1');
        return tiers.find(t => String(t.id) === code) || tiers.find(t => t.isDefault) || tiers[0];
    },

    getTierProgress: function(user, tiers = [], now = Date.now()) {
        if (!user) return null;
        const currentTier = FinancialEngineDef.getUserTier(user, tiers);
        if (!currentTier || !tiers.length) return null;

        const sorted = [...tiers].sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0));
        const spent = Number(user.tierCycleSpent || 0);
        const durationMs = Number(currentTier.durationDays || 30) * 86400000;
        
        const safeStartDateMs = parseSafeTime(user.tierCycleStartDate) || now;
        const remainingDays = Math.max(0, Math.ceil((durationMs - (now - safeStartDateMs)) / 86400000)); 

        const nextTier = sorted.find(t => Number(t.threshold || 0) > Number(currentTier.threshold || 0));
        let target = nextTier ? Number(nextTier.threshold) : (Number(currentTier.threshold || 0) > 0 ? Number(currentTier.threshold) : 500);
        
        return {
            currentTier, nextTier, targetNameDisplay: nextTier ? nextTier.name : "للحفاظ على المميزات", 
            targetThreshold: target, spent, remainingAmt: Math.max(0, target - spent), 
            percent: Math.min(100, Math.max(0, (spent / target) * 100)), remainingDays, 
            isMaxTier: !nextTier, isGoalReached: !nextTier && spent >= target, isAutoAdvanceEnabled: currentTier.autoAdvance !== false
        };
    },
    
    calculatePrice: function(params) {
        const { product, tier, offer, coupon, optIdx } = params || {};
        if (!product || typeof product !== 'object') return null;

        let isFixed = (String(product.isFixedPrice).toLowerCase() === 'true');
        let activeOption = null;

        if (product.type === 'select' && Array.isArray(product.options) && Number.isInteger(optIdx) && optIdx >= 0 && optIdx < product.options.length) {
            activeOption = product.options[optIdx];
            if (activeOption.isFixedPrice !== undefined) isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
        }
        
        let baseSellingPrice = isFixed 
            ? FinancialEngineDef.extractNum(activeOption ? (activeOption.fixedPriceUsd || activeOption.price) : (product.fixedPriceUsd || product.fixed_price_usd))
            : FinancialEngineDef.extractNum(tier ? (activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id]) : null) || FinancialEngineDef.extractNum(activeOption?.price || product.price);

        const originalPrice = baseSellingPrice;
        let currentPrice = originalPrice;
        const allowsDiscounts = !isFixed; 

        let offerName = null, offerDiscount = 0;
        if (allowsDiscounts && offer && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name || null;
            const offerVal = FinancialEngineDef._preciseRound(FinancialEngineDef.extractNum(offer.value), FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
            offerDiscount = offer.type === 'percentage' ? FinancialEngineDef._internalMul(originalPrice, FinancialEngineDef._internalDiv(offerVal, 100)) : Math.min(offerVal, currentPrice);
        }
        currentPrice = FinancialEngineDef._internalSub(currentPrice, offerDiscount);

        let couponCode = null, couponDiscount = 0;
        if (allowsDiscounts && product.disableCoupons !== true && coupon && coupon.isActive !== false) {
            couponCode = coupon.code || null;
            const coupVal = FinancialEngineDef._preciseRound(FinancialEngineDef.extractNum(coupon.value), FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
            couponDiscount = coupon.type === 'percentage' ? FinancialEngineDef._internalMul(currentPrice, FinancialEngineDef._internalDiv(coupVal, 100)) : Math.min(coupVal, currentPrice);
        }
        
        currentPrice = Math.max(
            FinancialEngineDef.CONFIG.MIN_SALE_PRICE, 
            FinancialEngineDef._internalSub(currentPrice, couponDiscount)
        );
        
        return {
            originalPrice: FinancialEngineDef._preciseRound(originalPrice),
            finalPrice: FinancialEngineDef._preciseRound(currentPrice),
            offerName: offerName, 
            offerDiscount: FinancialEngineDef._preciseRound(offerDiscount),
            couponCode: couponCode, 
            couponDiscount: FinancialEngineDef._preciseRound(couponDiscount),
            totalDiscount: FinancialEngineDef._preciseRound(FinancialEngineDef._internalSub(originalPrice, currentPrice)),
            tierName: tier?.name || (isFixed ? 'سعر ثابت' : 'أساسي')
        };
    },
    
    calculateOrderTotal: function(params, rawQty) {
        let qty = Math.max(1, Math.min(Math.floor(FinancialEngineDef.extractNum(rawQty)), FinancialEngineDef.CONFIG.MAX_QTY_LIMIT));
        const unit = FinancialEngineDef.calculatePrice(params);
        if (!unit) return null;

        return {
            ...unit, qty,
            totalOriginalPrice: FinancialEngineDef.safeMul(unit.originalPrice, qty),
            totalFinalPrice: FinancialEngineDef.safeMul(unit.finalPrice, qty),
            totalDiscount: FinancialEngineDef.safeMul(unit.totalDiscount, qty)
        };
    },

    getPricingLocal: function(prod, user, qty, optIdx, appliedCoupon, activeOffer, userTier, rates, baseCur, dispCur) {
        if (!prod) return null;
        let q = Math.max(1, Math.floor(Number(qty)) || 1);
        if (prod.type === 'select') q = 1; 

        const orderSnap = FinancialEngineDef.calculateOrderTotal({ product: prod, tier: userTier, offer: activeOffer, coupon: appliedCoupon, optIdx }, q);
        
        const oldPriceUsd = (activeOffer?.type === 'fake') ? Number(activeOffer.value || 0) : null;
        const displayOldTotalUsd = oldPriceUsd ? FinancialEngineDef.safeMul(oldPriceUsd, q) : orderSnap.totalOriginalPrice;

        return {
            totalUsd: orderSnap.totalFinalPrice, 
            totalLocalBase: FinancialEngineDef.convertViaUSD(orderSnap.totalFinalPrice, 'USD', baseCur, rates, 'pricing'), 
            displayCurrency: dispCur,
            unitText: FinancialEngineDef.convertViaUSD(orderSnap.finalPrice, 'USD', dispCur, rates, 'pricing').toFixed(2) + (dispCur === 'USD' ? ' $' : ' ' + dispCur),
            totalText: FinancialEngineDef.convertViaUSD(orderSnap.totalFinalPrice, 'USD', dispCur, rates, 'pricing').toFixed(2) + (dispCur === 'USD' ? ' $' : ' ' + dispCur),
            hasDiscount: Boolean(oldPriceUsd || orderSnap.couponDiscount > 0 || orderSnap.offerDiscount > 0),
            oldTotalLocalBase: displayOldTotalUsd ? FinancialEngineDef.convertViaUSD(displayOldTotalUsd, 'USD', dispCur, rates, 'pricing') : 0, 
            pricingSnapshot: { ...orderSnap, saleDiscountUsd: FinancialEngineDef.safeMul(orderSnap.offerDiscount, q), couponDiscountUsd: FinancialEngineDef.safeMul(orderSnap.couponDiscount, q), oldPriceUsd, displayOldTotalUsd }
        };
    },

    validateCoupon: function(code, prod, qty, optIdx, user, userTier, coupons = [], now = Date.now(), offer = null) {
        if (!code) return { valid: false, msg: 'يرجى إدخال الكود' };
        const cp = coupons.find(c => c.code.toUpperCase() === code.toUpperCase());
        if (!cp) return { valid: false, msg: 'الكود غير صحيح' };
        if (cp.isActive === false) return { valid: false, msg: 'هذا الكوبون غير فعال' };
        
        const expiryMs = parseSafeTime(cp.expiryDate);
        if (expiryMs > 0 && now > expiryMs) return { valid: false, msg: 'انتهت صلاحية الكوبون' };
        
        if (Number(cp.maxUses) > 0 && Number(cp.usedCount || 0) >= Number(cp.maxUses)) return { valid: false, msg: 'نفذت كمية الاستخدام' };
        
        if (cp.targetTiers?.length > 0 && !cp.targetTiers.includes(String(userTier?.id))) return { valid: false, msg: 'غير متاح لمستوى عضويتك' };
        if (cp.targetProds?.length > 0 && !cp.targetProds.includes(String(prod.id)) && !cp.targetProds.includes(String(prod.catId))) return { valid: false, msg: 'غير مخصص لهذا المنتج' };
        if (cp.allowedUsers?.length > 0 && !cp.allowedUsers.map(String).includes(String(user?.uid || user?.id))) return { valid: false, msg: 'مخصص لعملاء محددين' };
        
        if (Number(cp.minOrder) > 0) {
            const p = FinancialEngineDef.calculateOrderTotal({ product: prod, tier: userTier, optIdx, offer }, qty);
            if (p.totalFinalPrice < Number(cp.minOrder)) return { valid: false, msg: `الحد الأدنى للاستخدام ${cp.minOrder}$` };
        }
        
        return { valid: true, coupon: { code: cp.code, type: cp.type, value: cp.value, isActive: cp.isActive } };
    },

    calculateDepositFee: function(amt, method, payCurr, baseCur = 'USD', rates = []) {
        const cleanAmt = Number(amt);
        if (!method || isNaN(cleanAmt) || cleanAmt <= 0) return { isValid: false, msg: 'بيانات غير صالحة', netBase: 0, feePct: 0, feeType: 'fee', feeUnit: 'percent' };
        
        const curr = String(payCurr || 'USD').toUpperCase();
        
        let s = method.currencySettings?.[curr] 
            ? { fee: parseFloat(method.currencySettings[curr].fee)||0, min: parseFloat(method.currencySettings[curr].min)||0, max: parseFloat(method.currencySettings[curr].max)||0, feeType: method.currencySettings[curr].feeType||'fee', feeUnit: method.currencySettings[curr].feeUnit||method.currencySettings[curr].unit||'percent' }
            : { fee: parseFloat(method.fee)||0, min: parseFloat(method.min)||0, max: parseFloat(method.max)||0, feeType: method.feeType||'fee', feeUnit: method.feeUnit||method.unit||'percent' };
        
        if (s.min > 0 && cleanAmt < s.min) return { isValid: false, msg: `أقل مبلغ: ${s.min} ${curr}`, ...s };
        if (s.max > 0 && cleanAmt > s.max) return { isValid: false, msg: `أقصى مبلغ: ${s.max} ${curr}`, ...s };

        let feeAmt = ['fixed', 'amount'].includes(s.feeUnit) ? s.fee : FinancialEngineDef.safeMul(cleanAmt, FinancialEngineDef.safeDiv(s.fee, 100));
        let net = Math.max(0, s.feeType === 'bonus' ? FinancialEngineDef.safeAdd(cleanAmt, feeAmt) : FinancialEngineDef.safeSub(cleanAmt, feeAmt));
        let netBase = FinancialEngineDef.convertViaUSDHelper(net, curr, baseCur, rates, 'floor', 'deposit');
        
        return { isValid: true, netBase: isNaN(netBase) ? 0 : netBase, feePct: s.fee, feeType: s.feeType, feeUnit: s.feeUnit, feeAmount: feeAmt };
    }
};

export const FinancialEngine = Object.freeze(FinancialEngineDef);

if (typeof window !== 'undefined') {
    window.FinancialEngine = FinancialEngine;
}