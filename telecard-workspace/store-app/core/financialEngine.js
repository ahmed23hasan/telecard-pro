// ============================================================================
// 💰 المحرك المالي للواجهة الأمامية (Store Frontend Version) - V16.5 🛒
// 🎯 الوظيفة: محاكاة فورية ودقيقة 100% لأسعار السيرفر وتخفيضات الكوبونات للعميل
// 🚀 التحديثات المعمارية النهائية:
// 1. ES6 Pure Export: التصدير الحديث والمتوافق مع استيرادات المتجر.
// 2. Clean Architecture: إزالة التجميد المعقد المكرر والاعتماد على ذكاء الهيكلة الأصلية.
// 3. UX Price Floor: إجبار الواجهة على احترام الحد الأدنى (0.01).
// ============================================================================

const FinancialEngineDef = {
    // 🛡️ التجميد الداخلي المسبق (بصمتك المعمارية الممتازة)
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        MAX_QTY_LIMIT: 10000,
        MAX_PRICE_LIMIT: 100000,
        PRECISION: 4,          
        INTERNAL_PRECISION: 8, 
        MIN_SALE_PRICE: 0.01   
    }),

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
        if (numB === 0) return 0; 
        return FinancialEngineDef._preciseRound((Number(a) || 0) / numB, FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
    },

    safeAdd: function(a, b) { return FinancialEngineDef._preciseRound(FinancialEngineDef._internalAdd(a, b)); },
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
    
    normalizeRates: function(raw) {
        const ratesMap = {};
        ratesMap[FinancialEngineDef.CONFIG.BASE_CURRENCY] = { code: FinancialEngineDef.CONFIG.BASE_CURRENCY, priceRate: 1, depRate: 1, isBase: true };
        
        const processRateObj = (code, priceR, depR) => {
            const numPrice = FinancialEngineDef.extractNum(priceR);
            const numDep = FinancialEngineDef.extractNum(depR);
            if (numPrice === 0 || numDep === 0) return; 
            ratesMap[code] = { code: code, priceRate: numPrice, depRate: numDep };
        };

        if (Array.isArray(raw)) {
            for (const rate of raw) {
                if (rate && rate.code && rate.code !== FinancialEngineDef.CONFIG.BASE_CURRENCY) {
                    processRateObj(String(rate.code).toUpperCase(), rate.priceRate || rate.value, rate.depRate || rate.value);
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
        
        const from = ratesMap[fCode];
        const to = ratesMap[tCode];
        const fRate = channel === 'deposit' ? from.depRate : from.priceRate;
        const tRate = channel === 'deposit' ? to.depRate : to.priceRate;

        if (fRate === 0 || tRate === 0) return amt;

        const usdAmount = FinancialEngineDef._internalDiv(amt, fRate);
        const finalAmount = FinancialEngineDef._internalMul(usdAmount, tRate);
        
        return FinancialEngineDef._preciseRound(finalAmount);
    },
    
    calculatePrice: function(rawParams) {
        const params = rawParams || {};
        const { product, tier, offer, coupon, optIdx } = params;
        if (!product || typeof product !== 'object') return null;

        let isFixed = (String(product.isFixedPrice).toLowerCase() === 'true');
        let activeOption = null;

        if (product.type === 'select' && Array.isArray(product.options)) {
            if (typeof optIdx === 'number' && Number.isInteger(optIdx) && optIdx >= 0 && optIdx < product.options.length) {
                activeOption = product.options[optIdx];
                if (activeOption.isFixedPrice !== undefined) isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
            }
        }
        
        let baseSellingPrice = 0;
        let standardPrice = FinancialEngineDef.extractNum(activeOption?.price || product.price);

        if (isFixed) {
            baseSellingPrice = activeOption ? FinancialEngineDef.extractNum(activeOption.fixedPriceUsd || activeOption.price) : FinancialEngineDef.extractNum(product.fixedPriceUsd || product.fixed_price_usd);
        } else if (tier && typeof tier === 'object') {
            const tierPriceField = activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id];
            if (tierPriceField !== undefined && tierPriceField !== null) {
                baseSellingPrice = FinancialEngineDef.extractNum(tierPriceField);
            } else {
                baseSellingPrice = standardPrice;
            }
        } else {
            baseSellingPrice = standardPrice;
        }

        const originalPrice = baseSellingPrice;
        let currentPrice = originalPrice;
        const allowsDiscounts = !isFixed; 

        let offerName = null, offerDiscount = 0;
        if (allowsDiscounts && offer && typeof offer === 'object' && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name || null;
            const offerVal = FinancialEngineDef._preciseRound(FinancialEngineDef.extractNum(offer.value), FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
            
            if (offer.type === 'percentage') {
                const offerValDec = FinancialEngineDef._internalDiv(offerVal, 100);
                offerDiscount = FinancialEngineDef._internalMul(originalPrice, offerValDec);
            } else {
                offerDiscount = Math.min(offerVal, currentPrice);
            }
        }
        currentPrice = FinancialEngineDef._internalSub(currentPrice, offerDiscount);

        let couponCode = null, couponDiscount = 0;
        const canUseCoupon = allowsDiscounts && product.disableCoupons !== true;
        if (canUseCoupon && coupon && typeof coupon === 'object' && coupon.isActive !== false) {
            couponCode = coupon.code || null;
            const coupVal = FinancialEngineDef._preciseRound(FinancialEngineDef.extractNum(coupon.value), FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
            
            if (coupon.type === 'percentage') {
                const coupValDec = FinancialEngineDef._internalDiv(coupVal, 100);
                couponDiscount = FinancialEngineDef._internalMul(currentPrice, coupValDec);
            } else {
                couponDiscount = Math.min(coupVal, currentPrice);
            }
        }
        
        currentPrice = Math.max(
            FinancialEngineDef.CONFIG.MIN_SALE_PRICE, 
            FinancialEngineDef._internalSub(currentPrice, couponDiscount)
        );

        return {
            originalPrice: FinancialEngineDef._preciseRound(originalPrice),
            finalPrice: FinancialEngineDef._preciseRound(currentPrice),
            offerName: offerName || null,
            offerDiscount: FinancialEngineDef._preciseRound(offerDiscount),
            couponCode: couponCode || null,
            couponDiscount: FinancialEngineDef._preciseRound(couponDiscount),
            totalDiscount: FinancialEngineDef._preciseRound(FinancialEngineDef._internalSub(originalPrice, currentPrice)),
            tierName: tier?.name || (isFixed ? 'سعر ثابت' : 'أساسي')
        };
    },
    
    calculateOrderTotal: function(params, rawQty) {
        let qty = Math.floor(FinancialEngineDef.extractNum(rawQty));
        if (qty <= 0) qty = 1;
        if (qty > FinancialEngineDef.CONFIG.MAX_QTY_LIMIT) qty = FinancialEngineDef.CONFIG.MAX_QTY_LIMIT;
        
        const unit = FinancialEngineDef.calculatePrice(params);
        if (!unit) return null;

        return {
            ...unit,
            qty,
            totalOriginalPrice: FinancialEngineDef.safeMul(unit.originalPrice, qty),
            totalFinalPrice: FinancialEngineDef.safeMul(unit.finalPrice, qty),
            totalDiscount: FinancialEngineDef.safeMul(unit.totalDiscount, qty)
        };
    }
};

// 🛡️ التجميد السطحي للأب (الداخلي مجمد مسبقاً) - الطريقة الأسرع والأكثر احترافية
export const FinancialEngine = Object.freeze(FinancialEngineDef);

// توافقية عامة (Global scope fallback) لمنع أي انهيار في ملفات لا تستخدم الاستيراد المباشر
if (typeof window !== 'undefined') {
    window.FinancialEngine = FinancialEngine;
}