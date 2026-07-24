// ============================================================================
// 💻 المحاكي المالي للواجهة الأمامية (Client-Side Simulator) - النسخة الماسية المطلقة V14.1 💎
// 🎯 الوظيفة: محاكاة الأسعار، عرض الخصومات للعميل، وتنسيق العملات.
// 🚀 التحديثات:
// 1. التطابق المعماري التام مع السيرفر (Number.EPSILON) لمنع فوارق السنتات.
// 2. إزالة this لمنع انهيار الواجهة الأمامية (White Screen of Death).
// 3. تطبيق الجدار الناري الصفري (MIN_SALE_PRICE) في الواجهة لمنع الأوهام البصرية.
// ============================================================================

export const FinancialEngine = {

    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        PRECISION: 10000,
        MAX_UI_QTY: 10000,
        MIN_SALE_PRICE: 0.01 // 🛡️ التطابق مع السيرفر لمنع استغلال الكوبونات بنسبة 100%
    }),

    // ==========================================
    // 🛡️ 1. دوال الرياضيات الآمنة (Bank-Grade)
    // ==========================================
    safeAdd: function(a, b) {
        return Math.round(( (Number(a) || 0) + (Number(b) || 0) + Number.EPSILON ) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION;
    },
    
    safeSub: function(a, b) {
        return Math.round(( (Number(a) || 0) - (Number(b) || 0) + Number.EPSILON ) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION;
    },
    
    safeMul: function(a, b) {
        return Math.round(( (Number(a) || 0) * (Number(b) || 0) + Number.EPSILON ) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION;
    },
    
    safeDiv: function(a, b) {
        const numA = Number(a) || 0;
        let numB = Number(b);
        if (isNaN(numB) || numB === 0) numB = 1; 
        return Math.round(( (numA / numB) + Number.EPSILON ) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION;
    },

    // ==========================================
    // 🛡️ 2. تنقية المدخلات وتنسيق العملات
    // ==========================================
    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '' || Array.isArray(val) || typeof val === 'object') return 0;
        const num = Number(val);
        if (isNaN(num) || num < 0) return 0;
        if (!allowZero && num === 0) return 1;
        return num;
    },

    normalizeRates: function(rawArray) {
        const ratesMap = {};
        ratesMap[FinancialEngine.CONFIG.BASE_CURRENCY] = { 
            code: FinancialEngine.CONFIG.BASE_CURRENCY, symbol: '$', name: 'دولار أمريكي', 
            priceRate: 1, depRate: 1, isBase: true 
        };

        if (Array.isArray(rawArray)) {
            for (const rate of rawArray) {
                if (rate && rate.code && rate.code !== FinancialEngine.CONFIG.BASE_CURRENCY) {
                    const code = String(rate.code).toUpperCase();
                    ratesMap[code] = { 
                        code: code, 
                        priceRate: FinancialEngine.extractNum(rate.priceRate, false), 
                        depRate: FinancialEngine.extractNum(rate.depRate, false) 
                    };
                }
            }
        }
        return ratesMap;
    },

    convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel = 'pricing') {
        const amt = FinancialEngine.extractNum(amount);
        const fCode = String(fromCode || FinancialEngine.CONFIG.BASE_CURRENCY).toUpperCase();
        const tCode = String(toCode || FinancialEngine.CONFIG.BASE_CURRENCY).toUpperCase();
        
        if (amt === 0 || fCode === tCode) return amt;
        
        const ratesMap = FinancialEngine.normalizeRates(ratesArray);
        
        // 🛡️ في الواجهة: نمنع الانهيار (Crash) ونعيد 0 إذا اختفت العملة لحماية تصميم الـ UI
        if (!ratesMap[fCode] || !ratesMap[tCode]) return 0; 
        
        const from = ratesMap[fCode];
        const to = ratesMap[tCode];
        
        const fRate = channel === 'deposit' ? from.depRate : from.priceRate;
        const tRate = channel === 'deposit' ? to.depRate : to.priceRate;
        
        return FinancialEngine.safeMul(FinancialEngine.safeDiv(amt, fRate), tRate);
    },

    // ==========================================
    // 🚀 3. المحرك المالي النظيف للعميل
    // ==========================================
    calculatePrice: function(params = {}) {
        const { product = {}, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        if (!product || typeof product !== 'object' || Object.keys(product).length === 0) {
            return { 
                originalPrice: 0, finalPrice: 0, totalDiscountVal: 0, 
                offerName: null, couponCode: null, 
                isFirewallActive: true, isPricingFirewallViolated: true 
            };
        }

        let baseSellingPrice = 0;
        let isFixed = (String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);
        let activeOption = null;

        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null && optIdx !== undefined) {
            activeOption = product.options[optIdx];
            if (activeOption && activeOption.isFixedPrice !== undefined) {
                isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
            }
        }

        if (isFixed) {
            baseSellingPrice = activeOption 
                ? FinancialEngine.extractNum(activeOption.fixedPriceUsd || activeOption.price) 
                : FinancialEngine.extractNum(product.fixedPriceUsd || product.fixed_price_usd || product.price);
        } else if (tier) {
            const tierPriceField = activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id];
            if (tierPriceField !== undefined && tierPriceField !== null) {
                baseSellingPrice = FinancialEngine.extractNum(tierPriceField);
            } else {
                baseSellingPrice = activeOption 
                    ? FinancialEngine.extractNum(activeOption.price || activeOption.basePriceUsd) 
                    : FinancialEngine.extractNum(product.price || product.basePriceUsd);
            }
        } else {
            baseSellingPrice = activeOption 
                ? FinancialEngine.extractNum(activeOption.price) 
                : FinancialEngine.extractNum(product.price);
        }

        let currentPrice = baseSellingPrice;
        const originalPrice = currentPrice;

        // 🛡️ الحماية الكسرية للخصومات (العروض)
        let offerName = null;
        let offerDiscount = 0;
        if (offer && typeof offer === 'object' && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name;
            const val = FinancialEngine.extractNum(offer.value);
            const valDec = FinancialEngine.safeDiv(val, 100); 
            offerDiscount = offer.type === 'percentage' ? FinancialEngine.safeMul(originalPrice, valDec) : val;
        }

        currentPrice = FinancialEngine.safeSub(currentPrice, offerDiscount);

        // 🛡️ الحماية الكسرية للكوبونات
        let couponCode = null;
        let couponDiscount = 0;
        let isFirewallActive = false;
        let isPricingFirewallViolated = false;

        if (product.disableCoupons === true || isFixed) {
            isFirewallActive = true;
        } else if (coupon && typeof coupon === 'object' && coupon.isActive !== false) {
            couponCode = coupon.code;
            const val = FinancialEngine.extractNum(coupon.value);
            const valDec = FinancialEngine.safeDiv(val, 100); 
            couponDiscount = coupon.type === 'percentage' ? FinancialEngine.safeMul(currentPrice, valDec) : val;
        }

        currentPrice = FinancialEngine.safeSub(currentPrice, couponDiscount);

        // 🛑 الجدار الناري المطور (مطابق للسيرفر 100%)
        if (currentPrice < 0) {
            isPricingFirewallViolated = true;
            currentPrice = 0;
        }

        if (originalPrice > 0 && currentPrice < FinancialEngine.CONFIG.MIN_SALE_PRICE) {
            isPricingFirewallViolated = true;
            currentPrice = FinancialEngine.CONFIG.MIN_SALE_PRICE; // الواجهة ستعرض للعميل الحد الأدنى ولن تخدعه بصفر
        }

        return {
            originalPrice,
            finalPrice: currentPrice,
            tierName: tier ? (tier.nameAr || tier.name || tier.id) : null,
            offerName,
            offerDiscount,
            couponCode,
            couponDiscount,
            totalDiscountVal: FinancialEngine.safeSub(originalPrice, currentPrice),
            isFirewallActive,
            isPricingFirewallViolated
        };
    },

    // ==========================================
    // 🛒 4. حساب إجمالي الطلب للواجهة
    // ==========================================
    calculateOrderTotalUi: function(params = {}, rawQty = 1) {
        const safeQty = Math.min(FinancialEngine.CONFIG.MAX_UI_QTY, Math.max(1, Math.floor(FinancialEngine.extractNum(rawQty) || 1)));
        const unitMath = FinancialEngine.calculatePrice(params);
        
        return { 
            ...unitMath, 
            qty: safeQty, 
            totalOriginalPrice: FinancialEngine.safeMul(unitMath.originalPrice, safeQty), 
            totalFinalPrice: FinancialEngine.safeMul(unitMath.finalPrice, safeQty), 
            totalDiscountVal: FinancialEngine.safeMul(unitMath.totalDiscountVal, safeQty) 
        };
    }
};

// 🔒 تجميد الكائن كاملاً لضمان عدم تلاعب أي إضافة بالمتصفح بأسعارك
Object.freeze(FinancialEngine);