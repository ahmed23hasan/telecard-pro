// ============================================================================
// 💻 المحاكي المالي للواجهة الأمامية (Client-Side Simulator) - النسخة الماسية V11.0 💎
// 🎯 الوظيفة: محاكاة الأسعار للعميل، عرض الخصومات، وإخفاء الأسرار (التكلفة والأرباح)
// 🌟 التحديث الأقصى: تطبيق التطابق التام مع معايير السيرفر (Guardian V11)
// ============================================================================

export const FinancialEngine = Object.freeze({
    
    CONFIG: {
        BASE_CURRENCY: 'USD',
        PRECISION: 10000
    },

    // 🛡️ دوال الرياضيات الآمنة (محصنة ضد NaN للحفاظ على استقرار الواجهة)
    safeAdd: function(a, b) {
        return Math.round((Number(a) || 0) * this.CONFIG.PRECISION + (Number(b) || 0) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },
    
    safeSub: function(a, b) {
        return Math.round((Number(a) || 0) * this.CONFIG.PRECISION - (Number(b) || 0) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },
    
    safeMul: function(a, b) {
    // تحويل الأرقام إلى أعداد صحيحة تماماً قبل الضرب لمنع أي تسرب للكسور الوهمية
    const valA = Math.round((Number(a) || 0) * this.CONFIG.PRECISION);
    const valB = Math.round((Number(b) || 0) * this.CONFIG.PRECISION);
    // القسمة على مربع معامل الدقة لإعادة الرقم لشكله الأصلي
    return (valA * valB) / (this.CONFIG.PRECISION * this.CONFIG.PRECISION);
},    
    safeDiv: function(a, b) {
        const numA = Number(a) || 0;
        let numB = Number(b);
        if (isNaN(numB) || numB === 0) numB = 1;
        return Math.round((numA / numB) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },

    // 🛡️ معقم الأرقام الصارم (متطابق مع السيرفر)
    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '') return 0;
        const num = Number(val);
        if (isNaN(num)) return 0;
        const absNum = Math.abs(num); // منع السوالب
        if (!allowZero && absNum === 0) return 1;
        return absNum;
    },
    
    // 🛡️ [تحديث الأداء]: تحويل المصفوفة إلى Dictionary لسرعة بحث O(1)
    normalizeRates: function(rawArray) {
        const ratesMap = {};
        
        // تأمين وجود الدولار كقاعدة ارتكاز
        ratesMap[this.CONFIG.BASE_CURRENCY] = { 
            code: this.CONFIG.BASE_CURRENCY, symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true 
        };

        if (Array.isArray(rawArray)) {
            for (const rate of rawArray) {
                if (rate && rate.code && rate.code !== this.CONFIG.BASE_CURRENCY) {
                    const code = String(rate.code).toUpperCase();
                    ratesMap[code] = {
                        code: code,
                        priceRate: this.extractNum(rate.priceRate, false),
                        depRate: this.extractNum(rate.depRate, false)
                    };
                }
            }
        }
        return ratesMap;
    },
    
    convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel = 'pricing') {
        const amt = this.extractNum(amount);
        const fCode = String(fromCode || this.CONFIG.BASE_CURRENCY).toUpperCase();
        const tCode = String(toCode || this.CONFIG.BASE_CURRENCY).toUpperCase();

        if (amt === 0 || fCode === tCode) return amt;

        const ratesMap = this.normalizeRates(ratesArray);
        
        const from = ratesMap[fCode] || { priceRate: 1, depRate: 1 };
        const to = ratesMap[tCode] || { priceRate: 1, depRate: 1 };
        
        const fRate = channel === 'deposit' ? from.depRate : from.priceRate;
        const tRate = channel === 'deposit' ? to.depRate : to.priceRate;
        
        return this.safeMul(this.safeDiv(amt, fRate), tRate);
    },
    
    // 🚀 المحرك المالي النظيف والآمن لحساب "القطعة الواحدة" (خالي من الأسرار التجارية)
    calculatePrice: function(params = {}) {
        const { product = {}, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        let baseSellingPrice = 0;
        let isFixed = (String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);
        let activeOption = null;
        
        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null && product.options[optIdx]) {
            activeOption = product.options[optIdx];
            if (activeOption.isFixedPrice !== undefined) {
                isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
            }
        }
        
        if (isFixed) {
            baseSellingPrice = activeOption ? this.extractNum(activeOption.fixedPriceUsd || activeOption.price) : this.extractNum(product.fixedPriceUsd || product.fixed_price_usd);
        } else if (tier) {
            const tierPriceField = activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id];
            if (tierPriceField) {
                baseSellingPrice = this.extractNum(tierPriceField);
            } else {
                baseSellingPrice = activeOption ? this.extractNum(activeOption.price) : this.extractNum(product.price);
            }
        } else {
            baseSellingPrice = activeOption ? this.extractNum(activeOption.price) : this.extractNum(product.price);
        }
        
        let currentPrice = baseSellingPrice;
        const originalPrice = currentPrice;
        
        let offerName = null;
        let offerDiscount = 0;
        if (offer && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name;
            const val = this.extractNum(offer.value);
            offerDiscount = offer.type === 'percentage' ? this.safeMul(originalPrice, val / 100) : val;
            currentPrice = Math.max(0, this.safeSub(currentPrice, offerDiscount));
        }
        
        let couponCode = null;
        let couponDiscount = 0;
        let isFirewallActive = false;
        
        if (product.disableCoupons === true || isFixed) {
            isFirewallActive = true;
        } else if (coupon && coupon.isActive !== false) {
            couponCode = coupon.code;
            const val = this.extractNum(coupon.value);
            couponDiscount = coupon.type === 'percentage' ? this.safeMul(currentPrice, val / 100) : val;
            currentPrice = Math.max(0, this.safeSub(currentPrice, couponDiscount));
        }
        
        return {
            originalPrice,
            finalPrice: currentPrice,
            tierName: tier ? (tier.nameAr || tier.name || tier.id) : null,
            offerName,
            offerDiscount,
            couponCode,
            couponDiscount,
            totalDiscountVal: this.safeAdd(offerDiscount, couponDiscount),
            isFirewallActive
        };
    },
    
    // 🛡️ الدالة التي يجب استدعاؤها لحساب إجمالي السلة في الواجهة
    calculateOrderTotalUi: function(params = {}, rawQty = 1) {
        const safeQty = Math.max(1, Math.floor(this.extractNum(rawQty) || 1));
        const unitMath = this.calculatePrice(params);
        
        return {
            ...unitMath,
            qty: safeQty,
            totalOriginalPrice: this.safeMul(unitMath.originalPrice, safeQty),
            totalFinalPrice: this.safeMul(unitMath.finalPrice, safeQty),
            totalDiscountVal: this.safeMul(unitMath.totalDiscountVal, safeQty)
        };
    }
});