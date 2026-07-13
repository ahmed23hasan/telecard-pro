// ============================================================================
// 💻 المحاكي المالي للواجهة الأمامية (Client-Side Simulator) - النسخة الماسية V12.2 💎
// 🎯 الوظيفة: محاكاة الأسعار، عرض الخصومات للعميل، وتنسيق العملات.
// 🔒 الأمان: خالي تماماً من أسرار التكلفة (Cost)، ومحمي ضد التلاعب بالأسعار السالبة.
// ============================================================================

export const FinancialEngine = Object.freeze({
    
    CONFIG: {
        BASE_CURRENCY: 'USD',
        PRECISION: 10000,
        MAX_UI_QTY: 10000 // الحد الأقصى للكمية المسموح للعميل باختيارها في الواجهة
    },

    // 🛡️ 1. دوال الرياضيات الآمنة (محصنة ضد أخطاء الجافاسكربت العشرية)
    safeAdd: function(a, b) {
        return Math.round((Number(a) || 0) * this.CONFIG.PRECISION + (Number(b) || 0) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },
    
    safeSub: function(a, b) {
        return Math.round((Number(a) || 0) * this.CONFIG.PRECISION - (Number(b) || 0) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },
    
    safeMul: function(a, b) {
        const valA = Math.round((Number(a) || 0) * this.CONFIG.PRECISION);
        const valB = Math.round((Number(b) || 0) * this.CONFIG.PRECISION);
        return Math.round((valA * valB) / this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },    
    
    safeDiv: function(a, b) {
        const numA = Number(a) || 0;
        let numB = Number(b);
        if (isNaN(numB) || numB === 0) numB = 1; // حماية ضد القسمة على صفر
        return Math.round((numA / numB) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },

    // 🛡️ 2. تنقية المدخلات (التطابق التام مع السيرفر برفض السالب)
    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '') return 0;
        const num = Number(val);
        // التطابق الأمني: رفض القيم السالبة أو التالفة وتحويلها لصفر
        if (isNaN(num) || num < 0) return 0; 
        if (!allowZero && num === 0) return 1;
        return num;
    },
    
    normalizeRates: function(rawArray) {
        const ratesMap = {};
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
    
    // 🚀 3. المحرك المالي النظيف للعميل (Client-Side Pure Logic)
    calculatePrice: function(params = {}) {
        const { product = {}, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        // 🛡️ [درع المؤسسات - Enterprise Shield]: الفشل الآمن للواجهة في حال تشوه البيانات
        if (!product || typeof product !== 'object' || Object.keys(product).length === 0) {
            console.error("[FinancialEngine] حماية الواجهة: تم تمرير كائن منتج فارغ أو تالف.");
            return {
                originalPrice: 0, finalPrice: 0, totalDiscountVal: 0, 
                offerName: null, couponCode: null, isFirewallActive: true, isPricingFirewallViolated: true
            };
        }

        let baseSellingPrice = 0;
        let isFixed = (String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);
        let activeOption = null;
        
        // 🛡️ [تدهور آمن]: التحقق من حدود الخيارات (Bounds Checking)
        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null) {
            activeOption = product.options[optIdx];
            if (activeOption && activeOption.isFixedPrice !== undefined) {
                isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
            }
        }
        
        // جلب السعر حسب حالة المنتج (ثابت أو ديناميكي حسب المستوى)
        if (isFixed) {
            baseSellingPrice = activeOption ? this.extractNum(activeOption.fixedPriceUsd || activeOption.price) : this.extractNum(product.fixedPriceUsd || product.fixed_price_usd || product.price);
        } else if (tier) {
            const tierPriceField = activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id];
            if (tierPriceField) {
                baseSellingPrice = this.extractNum(tierPriceField);
            } else {
                // خط دفاع بديل: إذا تأخرت أسعار المستويات من السيرفر
                baseSellingPrice = activeOption ? this.extractNum(activeOption.price || activeOption.basePriceUsd) : this.extractNum(product.price || product.basePriceUsd);
            }
        } else {
            baseSellingPrice = activeOption ? this.extractNum(activeOption.price) : this.extractNum(product.price);
        }
        
        let currentPrice = baseSellingPrice;
        const originalPrice = currentPrice;
        
        // حساب التخفيضات (العروض الترويجية)
        let offerName = null;
        let offerDiscount = 0;
        if (offer && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name;
            const val = this.extractNum(offer.value);
            offerDiscount = offer.type === 'percentage' ? this.safeMul(originalPrice, val / 100) : val;
        }
        
        // حساب خصومات الكوبونات (من السعر الأصلي للتطابق مع السيرفر)
        let couponCode = null;
        let couponDiscount = 0;
        let isFirewallActive = false; // يستخدم في الواجهة لتعطيل إدخال الكوبون
        let isPricingFirewallViolated = false; 
        
        if (product.disableCoupons === true || isFixed) {
            isFirewallActive = true;
        } else if (coupon && coupon.isActive !== false) {
            couponCode = coupon.code;
            const val = this.extractNum(coupon.value);
            couponDiscount = coupon.type === 'percentage' ? this.safeMul(originalPrice, val / 100) : val;
        }

        // تطبيق الخصومات
        currentPrice = this.safeSub(currentPrice, this.safeAdd(offerDiscount, couponDiscount));

        // 🛑 الجدار الناري الأمامي: يمنع السعر السالب فقط. (تجاوز التكلفة متروك لسيرفر الحماية)
        if (currentPrice < 0) {
            isPricingFirewallViolated = true;
            currentPrice = 0;
        }
        
        return {
            originalPrice,
            finalPrice: currentPrice,
            tierName: tier ? (tier.nameAr || tier.name || tier.id) : null,
            offerName,
            offerDiscount,
            couponCode,
            couponDiscount,
            totalDiscountVal: this.safeSub(originalPrice, currentPrice),
            isFirewallActive,
            isPricingFirewallViolated 
        };
    },
    
    // 🛒 4. حساب إجمالي الطلب للواجهة (UI Total)
    calculateOrderTotalUi: function(params = {}, rawQty = 1) {
        // 🛡️ حماية ضد الكسور وتحديد سقف آمن لحماية المتصفح من التجمد
        const safeQty = Math.min(this.CONFIG.MAX_UI_QTY, Math.max(1, Math.floor(this.extractNum(rawQty) || 1)));
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