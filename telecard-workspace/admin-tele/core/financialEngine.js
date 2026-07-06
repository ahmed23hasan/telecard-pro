// ============================================================================
// 💰 المحرك المالي المركزي (core/financialEngine.js) - Admin Edition V10.4 👑
// 🎯 الوظيفة: محاكاة أسعار البيع، الخصومات، وكشف التكلفة والأرباح لمدير النظام
// 🌟 التحديث الأقصى: توحيد (O(1))، سد ثغرة السوالب، ودعم الباقات (Options)
// ============================================================================

export const FinancialEngine = Object.freeze({
    
    // 🛡️ دوال الرياضيات الآمنة (محصنة ضد تسرب الفواصل العشرية - Floating Point Leak)
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
        if (isNaN(numB) || numB === 0) numB = 1;
        return Math.round((numA / numB) * 10000) / 10000;
    },
    
    // 🚀 [تحسين الأداء]: تحويل المصفوفة إلى Hash Map لسرعة بحث O(1) (مطابق للسيرفر)
    normalizeRates: function(raw) {
        const ratesArray = Array.isArray(raw) ? raw : [];
        const ratesMap = {};
        let hasBase = false;
        
        for (const rate of ratesArray) {
            if (rate && rate.code) {
                ratesMap[String(rate.code).toUpperCase()] = rate;
                if (rate.isBase) hasBase = true;
            }
        }
        
        if (!hasBase) {
            ratesMap['USD'] = { code: 'USD', symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true };
        }
        return ratesMap;
    },
    
    convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel = 'pricing') {
        const amt = Number(amount) || 0;
        
        if (amt === 0 || !fromCode || !toCode || String(fromCode).toUpperCase() === String(toCode).toUpperCase()) return amt;
        
        const ratesMap = this.normalizeRates(ratesArray);
        
        const fromCurr = ratesMap[String(fromCode).toUpperCase()] || { priceRate: 1, depRate: 1 };
        const toCurr = ratesMap[String(toCode).toUpperCase()] || { priceRate: 1, depRate: 1 };
        
        const fromRate = channel === 'deposit' ? fromCurr.depRate : fromCurr.priceRate;
        const toRate = channel === 'deposit' ? toCurr.depRate : toCurr.priceRate;
        
        const inUSD = this.safeDiv(amt, fromRate);
        const finalAmount = this.safeMul(inUSD, (toRate || 1));
        
        return finalAmount;
    },
    
    // 🛡️ المحرك الرياضي المكتمل للأدمن (مع دعم الباقات، وإظهار الأرباح)
    calculatePrice: function(params = {}) {
        // دعم التمرير المباشر (Legacy) أو تمرير كائن الـ Product بالكامل (للباقات)
        const { product = {}, costPrice = 0, fixedPrice = 0, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        let cost = Number(costPrice) || Number(product.costPrice) || Number(product.cost_price) || 0;
        let isFixed = (fixedPrice > 0) || (product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true');
        let activeOption = null;
        
        // 🌟 استخراج سعر الباقة والتكلفة إذا كان المنتج من نوع select
        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null && product.options[optIdx]) {
            activeOption = product.options[optIdx];
            cost = Number(activeOption.costPrice) || Number(activeOption.cost_price) || cost;
            if (activeOption.isFixedPrice !== undefined) {
                isFixed = (activeOption.isFixedPrice === true || String(activeOption.isFixedPrice).toLowerCase() === 'true');
            }
        }
        
        let currentPrice = cost;
        let tierName = null;
        
        // 🛡️ [سد الثغرة]: إجبار القيم على أن تكون موجبة باستخدام Math.abs
        const extractNum = (val) => {
            if (val === undefined || val === null || val === '') return 0;
            const num = Number(val);
            return isNaN(num) ? 0 : Math.abs(num);
        };
        
        // 1. حساب سعر البيع الأساسي بناءً على مستوى العميل أو السعر الثابت
        if (isFixed) {
            currentPrice = activeOption ? Number(activeOption.fixedPriceUsd || activeOption.price || 0) : (Number(fixedPrice) || Number(product.fixedPriceUsd) || Number(product.price) || 0);
            tierName = "سعر ثابت";
        } else if (tier && typeof tier === 'object') {
            tierName = tier.nameAr || tier.name || tier.id || 'عضو';
            
            // قراءة الأسعار المخصصة للمستويات (إن وجدت)
            if (activeOption && activeOption.tierPrices && activeOption.tierPrices[tier.id]) {
                currentPrice = Number(activeOption.tierPrices[tier.id]);
            } else if (!activeOption && product.tierPrices && product.tierPrices[tier.id]) {
                currentPrice = Number(product.tierPrices[tier.id]);
            } else {
                // الحساب الديناميكي للربح
                const profitPercent = extractNum(
                    tier.profitPercent ?? tier.profit_percent ??
                    tier.profitMargin ?? tier.profit_margin ??
                    tier.profit ?? tier.margin ?? tier.percentage ?? 0
                );
                const minProfitUsd = extractNum(
                    tier.minProfitUsd ?? tier.min_profit_usd ??
                    tier.minProfit ?? tier.min_profit ?? tier.minUsd ?? 0
                );
                
                if (profitPercent > 0 || minProfitUsd > 0) {
                    let profitAdded = this.safeMul(cost, profitPercent / 100);
                    if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
                    currentPrice = this.safeAdd(cost, profitAdded);
                } else {
                    currentPrice = activeOption ? Number(activeOption.price || 0) : Number(product.price || 0);
                }
            }
        } else {
            currentPrice = activeOption ? Number(activeOption.price || 0) : Number(product.price || 0);
        }
        
        const tierPrice = currentPrice;
        const originalPrice = tierPrice;
        
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
        
        if (product.disableCoupons === true || isFixed) {
            isFirewallActive = true;
        } else if (coupon) {
            couponCode = coupon.code;
            const val = extractNum(coupon.value);
            if (coupon.type === 'percentage') {
                couponDiscount = this.safeMul(currentPrice, val / 100);
            } else if (coupon.type === 'fixed' || coupon.type === 'amount') {
                couponDiscount = val;
            }
            currentPrice = Math.max(0, this.safeSub(currentPrice, couponDiscount));
        }
        
        // 4. 🛡️ جدار الحماية المالي (النسبي) لمنع الخسارة
        let isFirewallViolated = false;
        if (currentPrice < cost) {
            isFirewallActive = true;
            isFirewallViolated = true;
            currentPrice = cost;
            
            const maxAllowedDiscount = Math.max(0, this.safeSub(originalPrice, cost));
            const totalRequestedDiscount = this.safeAdd(offerDiscount, couponDiscount);
            
            if (totalRequestedDiscount > 0) {
                const ratio = this.safeDiv(maxAllowedDiscount, totalRequestedDiscount);
                offerDiscount = this.safeMul(offerDiscount, ratio);
                couponDiscount = this.safeMul(couponDiscount, ratio);
            }
        }
        
        const finalPrice = currentPrice;
        const totalDiscountVal = this.safeAdd(offerDiscount, couponDiscount);
        const profit = Math.max(0, this.safeSub(finalPrice, cost));
        const marginPct = cost > 0 ? this.safeMul(this.safeDiv(profit, cost), 100) : 0;
        
        return {
            cost: cost,
            tierPrice: tierPrice,
            originalPrice: originalPrice,
            finalPrice: finalPrice,
            tierName: tierName,
            offerName: offerName,
            offerDiscount: offerDiscount,
            couponCode: couponCode,
            couponDiscount: couponDiscount,
            totalDiscountVal: totalDiscountVal,
            profit: profit,
            marginPct: Number(marginPct.toFixed(2)),
            isFirewallActive: isFirewallActive,
            isFirewallViolated: isFirewallViolated
        };
    }
});