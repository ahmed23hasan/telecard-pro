// ============================================================================
// 💻 المحاكي المالي للواجهة الأمامية (Client-Side Simulator) - V15.2 💎
// 🎯 الوظيفة: محاكاة الأسعار، عرض الخصومات للعميل، وتنسيق العملات.
// 🚀 التحديثات: توحيد مفاتيح المخرجات مع الخادم (totalDiscount) ومزامنة الفواتير.
// ============================================================================

export const FinancialEngine = {
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        PRECISION: 10000,
        MAX_UI_QTY: 10000,
        MIN_SALE_PRICE: 0.01 
    }),

    safeAdd: function(a, b) { return Math.round(((Number(a) || 0) + (Number(b) || 0) + Number.EPSILON) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION; },
    safeSub: function(a, b) { return Math.round(((Number(a) || 0) - (Number(b) || 0) + Number.EPSILON) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION; },
    safeMul: function(a, b) { return Math.round(((Number(a) || 0) * (Number(b) || 0) + Number.EPSILON) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION; },
    safeDiv: function(a, b) {
        const numA = Number(a) || 0;
        const numB = Number(b) || 0;
        if (numB === 0) return 0;
        return Math.round(((numA / numB) + Number.EPSILON) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION;
    },
    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '' || Array.isArray(val) || typeof val === 'object') return 0;
        const num = Number(val);
        if (isNaN(num) || num < 0) return 0;
        if (!allowZero && num === 0) return 1;
        return num;
    },
        normalizeRates: function(raw) {
        const ratesMap = {};
        ratesMap[FinancialEngine.CONFIG.BASE_CURRENCY] = { code: FinancialEngine.CONFIG.BASE_CURRENCY, symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true };
        
        // 1. إذا كانت البيانات مصفوفة (قادمة من Firebase مباشرة)
        if (Array.isArray(raw)) {
            for (const rate of raw) {
                if (rate && rate.code && rate.code !== FinancialEngine.CONFIG.BASE_CURRENCY) {
                    const code = String(rate.code).toUpperCase();
                    ratesMap[code] = { 
                        code: code, 
                        priceRate: FinancialEngine.extractNum(rate.priceRate || rate.value, false), 
                        depRate: FinancialEngine.extractNum(rate.depRate || rate.value, false) 
                    };
                }
            }
        } 
        // 2. 🛡️ التوافق مع DataManager: إذا كانت البيانات كائن مسطح (من الكاش)
        else if (raw && typeof raw === 'object') {
            for (const [key, value] of Object.entries(raw)) {
                const code = String(key).toUpperCase();
                if (code !== FinancialEngine.CONFIG.BASE_CURRENCY && code !== 'ISBASE') {
                    const numVal = FinancialEngine.extractNum(value, false);
                    ratesMap[code] = { code: code, priceRate: numVal, depRate: numVal };
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
        if (!ratesMap[fCode] || !ratesMap[tCode]) return 0;
        
        const from = ratesMap[fCode];
        const to = ratesMap[tCode];
        const fRate = channel === 'deposit' ? from.depRate : from.priceRate;
        const tRate = channel === 'deposit' ? to.depRate : to.priceRate;

        if (fRate === 0 || tRate === 0) return 0;

        return FinancialEngine.safeMul(FinancialEngine.safeDiv(amt, fRate), tRate);
    },
    calculatePrice: function(params = {}) {
        const { product = {}, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        // 🛡️ المواءمة المعمارية 1: توحيد مفاتيح الفشل مع الخادم
        if (!product || typeof product !== 'object' || Object.keys(product).length === 0) {
            return { originalPrice: 0, finalPrice: 0, totalDiscount: 0, offerName: null, couponCode: null, isFirewallViolated: true };
        }

        let baseSellingPrice = 0;
        let isFixed = (String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);
        let activeOption = null;

        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null && optIdx !== undefined) {
            const index = Number(optIdx);
            if (Number.isInteger(index) && index >= 0 && index < product.options.length) {
                activeOption = product.options[index];
                if (activeOption && activeOption.isFixedPrice !== undefined) {
                    isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
                }
            }
        }

        if (isFixed) {
            baseSellingPrice = activeOption ? FinancialEngine.extractNum(activeOption.fixedPriceUsd || activeOption.price) : FinancialEngine.extractNum(product.fixedPriceUsd || product.fixed_price_usd || product.price);
        } else if (tier) {
            // 🛡️ هذا السطر عبقري: يعتمد على ما حسبه الخادم (secureProductSync) مسبقاً
            const tierPriceField = activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id];
            if (tierPriceField !== undefined && tierPriceField !== null) {
                baseSellingPrice = FinancialEngine.extractNum(tierPriceField);
            } else {
                baseSellingPrice = activeOption ? FinancialEngine.extractNum(activeOption.price || activeOption.basePriceUsd) : FinancialEngine.extractNum(product.price || product.basePriceUsd);
            }
        } else {
            baseSellingPrice = activeOption ? FinancialEngine.extractNum(activeOption.price) : FinancialEngine.extractNum(product.price);
        }

        let currentPrice = baseSellingPrice;
        const originalPrice = currentPrice;

        let offerName = null, offerDiscount = 0;
        if (offer && typeof offer === 'object' && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name;
            const val = FinancialEngine.extractNum(offer.value);
            if (offer.type === 'percentage') {
                const valDec = FinancialEngine.safeDiv(val, 100);
                offerDiscount = FinancialEngine.safeMul(originalPrice, valDec);
            } else {
                offerDiscount = Math.min(val, currentPrice);
            }
        }
        currentPrice = FinancialEngine.safeSub(currentPrice, offerDiscount);

        let couponCode = null, couponDiscount = 0, isFirewallViolated = false;
        
        if (product.disableCoupons === true || isFixed) {
            // لا خصومات
        } else if (coupon && typeof coupon === 'object' && coupon.isActive !== false) {
            couponCode = coupon.code;
            const val = FinancialEngine.extractNum(coupon.value);
            if (coupon.type === 'percentage') {
                const valDec = FinancialEngine.safeDiv(val, 100);
                couponDiscount = FinancialEngine.safeMul(currentPrice, valDec);
            } else {
                couponDiscount = Math.min(val, currentPrice);
            }
        }
        currentPrice = FinancialEngine.safeSub(currentPrice, couponDiscount);

        let preFirewallPrice = currentPrice;

        // 🛑 توحيد الجدار الناري بالكامل مع السيرفر
        if (currentPrice < 0) {
            isFirewallViolated = true;
            currentPrice = 0;
        }
        if (originalPrice > 0 && currentPrice < FinancialEngine.CONFIG.MIN_SALE_PRICE) {
            isFirewallViolated = true;
            currentPrice = FinancialEngine.CONFIG.MIN_SALE_PRICE; 
        }

        // ⚖️ التسوية المحاسبية
        if (currentPrice > preFirewallPrice) {
            let clawback = FinancialEngine.safeSub(currentPrice, preFirewallPrice);
            if (couponDiscount >= clawback) {
                couponDiscount = FinancialEngine.safeSub(couponDiscount, clawback);
                clawback = 0;
            } else {
                clawback = FinancialEngine.safeSub(clawback, couponDiscount);
                couponDiscount = 0;
                offerDiscount = FinancialEngine.safeSub(offerDiscount, clawback);
                if (offerDiscount < 0) offerDiscount = 0;
            }
        }

        // 🛡️ المواءمة المعمارية 2: توحيد مفتاح totalDiscount
        return {
            originalPrice,
            finalPrice: currentPrice,
            tierName: tier ? (tier.nameAr || tier.name || tier.id) : null,
            offerName,
            offerDiscount,
            couponCode,
            couponDiscount,
            totalDiscount: FinancialEngine.safeSub(originalPrice, currentPrice),
            isFirewallViolated
        };
    },
    
    // 🛡️ المواءمة المعمارية 3: تغيير اسم الدالة لتطابق الخادم وتمكين Re-usability
    calculateOrderTotal: function(params = {}, rawQty = 1) {
        const safeQty = Math.min(FinancialEngine.CONFIG.MAX_UI_QTY, Math.max(1, Math.floor(FinancialEngine.extractNum(rawQty) || 1)));
        const unitMath = FinancialEngine.calculatePrice(params);
        return {
            ...unitMath,
            qty: safeQty,
            totalOriginalPrice: FinancialEngine.safeMul(unitMath.originalPrice, safeQty),
            totalFinalPrice: FinancialEngine.safeMul(unitMath.finalPrice, safeQty),
            totalDiscount: FinancialEngine.safeMul(unitMath.totalDiscount, safeQty)
        };
    }
};

Object.freeze(FinancialEngine);