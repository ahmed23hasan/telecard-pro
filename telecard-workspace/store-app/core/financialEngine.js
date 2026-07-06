// ============================================================================
// 💻 المحاكي المالي للواجهة الأمامية (Client-Side Simulator) - النسخة الماسية 💎
// 🎯 الوظيفة: محاكاة الأسعار للعميل، عرض الخصومات، إخفاء التكلفة، وتأمين الـ UI
// 🌟 التحديث الأقصى: توحيد المنطق الرياضي مع السيرفر، إضافة حاسبة الإجماليات
// ============================================================================

export const FinancialEngine = {
    
    // 🛡️ دوال الرياضيات الآمنة (محصنة ضد NaN للحفاظ على استقرار الواجهة)
    safeAdd: function(a, b) {
        return Math.round((Number(a) || 0) * 10000 + (Number(b) || 0) * 10000) / 10000;
    },
    
    safeSub: function(a, b) {
        return Math.round((Number(a) || 0) * 10000 - (Number(b) || 0) * 10000) / 10000;
    },
    
    safeMul: function(a, b) {
        return Math.round((Number(a) || 0) * (Number(b) || 0) * 10000) / 10000;
    },
    
    safeDiv: function(a, b) {
        const numA = Number(a) || 0;
        let numB = Number(b);
        // منع القسمة على صفر أو على قيم فاسدة لضمان عدم ظهور (Infinity)
        if (isNaN(numB) || numB === 0) numB = 1;
        return Math.round((numA / numB) * 10000) / 10000;
    },
    
    // 🛡️ [ترقيع State Mutation]: أخذ نسخة جديدة (Clone) لمنع تدمير البيانات الأصلية
    normalizeRates: function(raw) {
        let rates = Array.isArray(raw) ? [...raw] : [];
        if (!rates.find(c => c.isBase)) {
            rates.unshift({ code: 'USD', symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true });
        }
        return rates;
    },
    
    convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel = 'pricing') {
        const rates = this.normalizeRates(ratesArray);
        const amt = Number(amount) || 0;
        if (!fromCode || !toCode || String(fromCode).toUpperCase() === String(toCode).toUpperCase()) return amt;
        
        const fromCurr = rates.find(c => String(c.code).toUpperCase() === String(fromCode).toUpperCase()) || { priceRate: 1, depRate: 1 };
        const toCurr = rates.find(c => String(c.code).toUpperCase() === String(toCode).toUpperCase()) || { priceRate: 1, depRate: 1 };
        
        const fromRate = channel === 'deposit' ? fromCurr.depRate : fromCurr.priceRate;
        const toRate = channel === 'deposit' ? toCurr.depRate : toCurr.priceRate;
        
        const inUSD = this.safeDiv(amt, fromRate);
        const finalAmount = this.safeMul(inUSD, (toRate || 1));
        
        return finalAmount;
    },
    
    // 🚀 المحرك المالي النظيف والآمن لحساب "القطعة الواحدة" (خالي من الأسرار التجارية)
    calculatePrice: function(params = {}) {
        const { product = {}, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        // 🛡️ 1. تحديد السعر الأساسي بناءً على نوع المنتج (منتج عادي أو باقات)
        let baseSellingPrice = 0;
        let isFixed = (product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);
        let activeOption = null;
        
        // 🌟 استخراج سعر الباقة إذا كان المنتج من نوع select
        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null && product.options[optIdx]) {
            activeOption = product.options[optIdx];
            // الباقة قد تمتلك إعداد (السعر الثابت) الخاص بها منفصلاً عن المنتج الأب
            if (activeOption.isFixedPrice !== undefined) {
                isFixed = (activeOption.isFixedPrice === true || String(activeOption.isFixedPrice).toLowerCase() === 'true');
            }
        }
        
        // حساب السعر النهائي للقطعة (سواء كانت منتجاً عادياً أو باقة)
        if (isFixed) {
            baseSellingPrice = activeOption ? Number(activeOption.fixedPriceUsd || activeOption.price || 0) : Number(product.fixedPriceUsd || product.fixed_price_usd || 0);
        } else if (tier) {
            // الأولوية لسعر الباقة الخاص بالمستوى، ثم سعر المنتج الخاص بالمستوى، ثم السعر العادي
            if (activeOption && activeOption.tierPrices && activeOption.tierPrices[tier.id]) {
                baseSellingPrice = Number(activeOption.tierPrices[tier.id]);
            } else if (!activeOption && product.tierPrices && product.tierPrices[tier.id]) {
                baseSellingPrice = Number(product.tierPrices[tier.id]);
            } else {
                baseSellingPrice = activeOption ? Number(activeOption.price || 0) : Number(product.price || 0);
            }
        } else {
            baseSellingPrice = activeOption ? Number(activeOption.price || 0) : Number(product.price || 0);
        }
        
        // منع أي سعر من أن يكون NaN
        let currentPrice = Number(baseSellingPrice) || 0;
        const originalPrice = currentPrice;
        
        // 🛡️ [تحديث أمني]: دالة مساعدة لانتزاع الأرقام بقواعد صارمة (Absolute Math) متطابقة مع السيرفر
        const extractNum = (val) => {
            if (val === undefined || val === null || val === '') return 0;
            const num = Number(val);
            return isNaN(num) ? 0 : Math.abs(num);
        };
        
        // 2. تطبيق خصومات العروض النشطة
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
        
        // 3. تطبيق خصومات الكوبونات
        let couponCode = null;
        let couponDiscount = 0;
        let isFirewallActive = false;
        
        // 🛡️ تفعيل الجدار الناري: المنتجات الثابتة السعر أو التي يمنع فيها الكوبون لا تتأثر بالخصم
        if (product.disableCoupons === true || isFixed) {
            isFirewallActive = true;
        } else if (coupon) {
            couponCode = coupon.code;
            const val = extractNum(coupon.value);
            if (coupon.type === 'percentage') {
                // الكوبون يطبق على السعر (بعد) العرض، لحماية أرباح التاجر (Compound Discounting Guard)
                couponDiscount = this.safeMul(currentPrice, val / 100);
            } else if (coupon.type === 'fixed' || coupon.type === 'amount') {
                couponDiscount = val;
            }
            currentPrice = Math.max(0, this.safeSub(currentPrice, couponDiscount));
        }
        
        const finalPrice = currentPrice;
        const totalDiscountVal = this.safeAdd(offerDiscount, couponDiscount);
        
        // 🌟 إرجاع البيانات النظيفة والمفصلة للواجهة الأمامية
        return {
            originalPrice: originalPrice,
            finalPrice: finalPrice,
            tierName: tier ? (tier.nameAr || tier.name || tier.id) : null,
            offerName: offerName,
            offerDiscount: offerDiscount,
            couponCode: couponCode,
            couponDiscount: couponDiscount,
            totalDiscountVal: totalDiscountVal,
            isFirewallActive: isFirewallActive
        };
    },
    
    // ==========================================
    // 🛡️ [الدرع الجديد]: الدالة التي يجب استدعاؤها لحساب إجمالي السلة في الواجهة
    // ==========================================
    calculateOrderTotalUi: function(params = {}, rawQty = 1) {
        // 1. فلترة الكمية لمنع إدخال نصوص أو سوالب في الواجهة الأمامية
        const safeQty = Math.max(1, Math.floor(Number(rawQty) || 1));
        
        // 2. استدعاء سعر القطعة الواحدة
        const unitMath = this.calculatePrice(params);
        
        // 3. إرجاع النتيجة مضروبة في الكمية لعرضها للعميل
        return {
            ...unitMath,
            qty: safeQty,
            totalOriginalPrice: this.safeMul(unitMath.originalPrice, safeQty),
            totalFinalPrice: this.safeMul(unitMath.finalPrice, safeQty),
            totalDiscountVal: this.safeMul(unitMath.totalDiscountVal, safeQty)
        };
    }
};