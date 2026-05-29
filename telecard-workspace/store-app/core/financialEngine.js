// ============================================================================
// 💰 المحرك المالي للمتجر (store-app/core/financialEngine.js) - Client Safe Engine
// 🎯 الوظيفة: حساب الأسعار، الخصومات، وتحويل العملات بذكاء وأمان تام (لا يحتوي على التكلفة)
// ============================================================================

export const FinancialEngine = Object.freeze({

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
        const finalAmount = inUSD * (toRate || 1);
        return Number(finalAmount.toFixed(4));
    },

    // 🚀 المحرك المالي النظيف والآمن (لا يقرأ ولا يحتوي على أي إشارة لسعر التكلفة)
    calculatePrice: function(params) {
        // نمرر كائن المنتج بالكامل بدلاً من سعر التكلفة
        const { product = {}, tier = null, offer = null, coupon = null } = params;

        // 1. استخراج السعر المخصص لمستوى العميل (المحسوب مسبقاً والمُرسل من السيرفر)
        let baseSellingPrice = 0;
        
        // التحقق مما إذا كان المنتج له سعر ثابت
        const isFixed = (product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);

        if (isFixed) {
            baseSellingPrice = Number(product.fixedPriceUsd || product.fixed_price_usd || 0);
        } else if (tier && product.tierPrices && product.tierPrices[tier.id]) {
            // إذا كان للعميل مستوى، نأخذ سعره الجاهز فوراً!
            baseSellingPrice = Number(product.tierPrices[tier.id]);
        } else {
            // سعر احتياطي في حال لم يتم تحديد مستوى للعميل
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

        // 2. تطبيق خصومات العروض النشطة (محلياً وبسرعة البرق)
        let offerName = null;
        let offerDiscount = 0;
        if (offer && offer.type !== 'fake') {
            offerName = offer.name;
            const val = extractNum(offer.value);
            if (offer.type === 'percentage') {
                offerDiscount = originalPrice * (val / 100);
            } else if (offer.type === 'fixed' || offer.type === 'amount') {
                offerDiscount = val;
            }
            currentPrice -= offerDiscount;
        }

        // 3. تطبيق خصومات الكوبونات (محلياً وبسرعة البرق)
        let couponCode = null;
        let couponDiscount = 0;
        if (coupon) {
            couponCode = coupon.code;
            const val = extractNum(coupon.value);
            if (coupon.type === 'percentage') {
                couponDiscount = currentPrice * (val / 100);
            } else if (coupon.type === 'fixed' || coupon.type === 'amount') {
                couponDiscount = val;
            }
            currentPrice -= couponDiscount;
        }

        // 4. الحماية المحلية الظاهرية (لا يمكن أن يكون السعر بالسالب)
        if (currentPrice < 0) currentPrice = 0;

        const finalPrice = currentPrice;
        const totalDiscountVal = offerDiscount + couponDiscount;

        // 🌟 إرجاع البيانات النظيفة فقط للواجهة (تم حجب كل ما يخص الربح أو التكلفة تماماً)
        return {
            originalPrice: Number(originalPrice.toFixed(4)),
            finalPrice: Number(finalPrice.toFixed(4)),
            tierName: tier ? (tier.nameAr || tier.name || tier.id) : null,
            offerName: offerName,
            offerDiscount: Number(offerDiscount.toFixed(4)),
            couponCode: couponCode,
            couponDiscount: Number(couponDiscount.toFixed(4)),
            totalDiscountVal: Number(totalDiscountVal.toFixed(4))
        };
    }
});
