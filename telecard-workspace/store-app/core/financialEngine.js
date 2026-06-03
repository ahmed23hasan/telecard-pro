// ============================================================================
// 💰 المحرك المالي للمتجر (store-app/core/financialEngine.js) - Client Safe Engine
// 🎯 الوظيفة: حساب الأسعار، الخصومات، وتحويل العملات بذكاء وأمان تام (لا يحتوي على التكلفة)
// 🌟 التحديث الأقصى: توحيد الحسابات بنظام (Integer Math) لمطابقة السيرفر ومنع أخطاء الرفض
// ============================================================================

export const FinancialEngine = Object.freeze({

    // 🛡️ دوال الرياضيات الآمنة الداخلية (Integer Math) لمطابقة دقة السيرفر 100%
    safeAdd: function(a, b) {
        return Math.round(Number(a) * 10000 + Number(b) * 10000) / 10000;
    },
    
    safeSub: function(a, b) {
        return Math.round(Number(a) * 10000 - Number(b) * 10000) / 10000;
    },
    
    safeMul: function(a, b) {
        return Math.round(Number(a) * Number(b) * 10000) / 10000;
    },

    normalizeRates: function(raw) {
        let rates = Array.isArray(raw) ? raw : [];
        if (!rates.find(c => c.isBase)) {
            rates.unshift({ code: 'USD', symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true });
        }
        return rates;
    },

    convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel='pricing') {
        const rates = this.normalizeRates(ratesArray);
        const amt = Number(amount) || 0;
        if (!fromCode || !toCode || fromCode === toCode) return amt;
        
        const fromCurr = rates.find(c => String(c.code).toUpperCase() === String(fromCode).toUpperCase()) || { priceRate: 1, depRate: 1 };
        const toCurr = rates.find(c => String(c.code).toUpperCase() === String(toCode).toUpperCase()) || { priceRate: 1, depRate: 1 };
        
        const fromRate = channel === 'deposit' ? fromCurr.depRate : fromCurr.priceRate;
        const toRate   = channel === 'deposit' ? toCurr.depRate : toCurr.priceRate;
        
        const inUSD = amt / (fromRate || 1);
        const finalAmount = this.safeMul(inUSD, (toRate || 1));
        return finalAmount;
    },

    // 🚀 المحرك المالي النظيف والآمن (لا يقرأ ولا يحتوي على أي إشارة لسعر التكلفة)
    calculatePrice: function(params) {
        const { product = {}, tier = null, offer = null, coupon = null } = params;

        // 1. استخراج السعر المخصص لمستوى العميل (المحسوب مسبقاً والمُرسل من السيرفر)
        let baseSellingPrice = 0;
        
        const isFixed = (product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);

        if (isFixed) {
            baseSellingPrice = Number(product.fixedPriceUsd || product.fixed_price_usd || 0);
        } else if (tier && product.tierPrices && product.tierPrices[tier.id]) {
            baseSellingPrice = Number(product.tierPrices[tier.id]);
        } else {
            baseSellingPrice = Number(product.price || 0); 
        }

        let currentPrice = baseSellingPrice;
        const originalPrice = currentPrice;

        // 🛡️ دالة مساعدة لانتزاع الأرقام الصافية بقوة
        const extractNum = (val) => {
            if (val === undefined || val === null || val === '') return 0;
            const cleanStr = String(val).replace(/[^0-9.-]/g, '');
            const num = parseFloat(cleanStr);
            return isNaN(num) ? 0 : num;
        };

        // 2. تطبيق خصومات العروض النشطة (بالرياضيات الآمنة)
        let offerName = null;
        let offerDiscount = 0;
        if (offer && offer.type !== 'fake') {
            offerName = offer.name;
            const val = extractNum(offer.value);
            if (offer.type === 'percentage') {
                offerDiscount = this.safeMul(originalPrice, val / 100);
            } else if (offer.type === 'fixed' || offer.type === 'amount') {
                offerDiscount = val;
            }
            currentPrice = Math.max(0, this.safeSub(currentPrice, offerDiscount));
        }

        // 3. تطبيق خصومات الكوبونات (بالرياضيات الآمنة)
        let couponCode = null;
        let couponDiscount = 0;
        if (coupon) {
            couponCode = coupon.code;
            const val = extractNum(coupon.value);
            if (coupon.type === 'percentage') {
                couponDiscount = this.safeMul(currentPrice, val / 100);
            } else if (coupon.type === 'fixed' || coupon.type === 'amount') {
                couponDiscount = val;
            }
            currentPrice = Math.max(0, this.safeSub(currentPrice, couponDiscount));
        }

        const finalPrice = currentPrice;
        const totalDiscountVal = this.safeAdd(offerDiscount, couponDiscount);

        // 🌟 إرجاع البيانات النظيفة فقط للواجهة
        return {
            originalPrice: originalPrice,
            finalPrice: finalPrice,
            tierName: tier ? (tier.nameAr || tier.name || tier.id) : null,
            offerName: offerName,
            offerDiscount: offerDiscount,
            couponCode: couponCode,
            couponDiscount: couponDiscount,
            totalDiscountVal: totalDiscountVal
        };
    }
});
