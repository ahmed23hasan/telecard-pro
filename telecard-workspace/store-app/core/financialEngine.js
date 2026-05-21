// ============================================================================
// 💰 المحرك المالي المركزي (core/financialEngine.js) - Agnostic Core
// 🎯 الوظيفة: حساب الأسعار، الخصومات، تحويل العملات، والضرائب (للمتجر والإدارة)
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

    // 🚀 المحرك الرياضي المكتمل لحساب الأسعار وجدار الحماية
    calculatePrice: function(params) {
        const { costPrice = 0, tier = null, offer = null, coupon = null } = params;
        const cost = Number(costPrice) || 0;

        let currentPrice = cost;
        let tierName = null;

        // 1. حساب سعر البيع الأساسي بناءً على مستوى العميل (Tier Profit Margin)
        if (tier) {
            tierName = tier.nameAr || tier.name || 'عضو';
            const profitPercent = Number(tier.profitPercent || tier.profit_percent || 0);
            const minProfitUsd = Number(tier.minProfitUsd || tier.min_profit_usd || 0);

            // حساب الربح كنسبة مئوية من التكلفة
            let profitAdded = cost * (profitPercent / 100);
            
            // تطبيق الحد الأدنى للربح إذا كانت النسبة المئوية أقل منه
            if (profitAdded < minProfitUsd) {
                profitAdded = minProfitUsd;
            }
            currentPrice += profitAdded;
        }

        const tierPrice = currentPrice;
        const originalPrice = tierPrice;

        // 2. تطبيق خصومات العروض النشطة (Sales & Offers)
        let offerName = null;
        let offerDiscount = 0;
        if (offer && offer.type !== 'fake') {
            offerName = offer.name;
            const val = Number(offer.value || 0);
            if (offer.type === 'percentage') {
                offerDiscount = originalPrice * (val / 100);
            } else if (offer.type === 'fixed' || offer.type === 'amount') {
                offerDiscount = val;
            }
            currentPrice -= offerDiscount;
        }

        // 3. تطبيق خصومات الكوبونات (Coupons)
        let couponCode = null;
        let couponDiscount = 0;
        if (coupon) {
            couponCode = coupon.code;
            const val = Number(coupon.value || 0);
            if (coupon.type === 'percentage') {
                couponDiscount = currentPrice * (val / 100);
            } else if (coupon.type === 'fixed' || coupon.type === 'amount') {
                couponDiscount = val;
            }
            currentPrice -= couponDiscount;
        }

        // 4. 🛡️ جدار الحماية المالي (Financial Firewall)
        // يمنع بيع المنتج بخسارة إذا تجاوزت الخصومات سعر التكلفة
        let isFirewallActive = false;
        if (currentPrice < cost) {
            isFirewallActive = true;
            currentPrice = cost; // إعادة السعر ليكون مساوياً للتكلفة على الأقل
            
            // إعادة ضبط قيم الخصومات الظاهرية لكي لا تعطي أرقاماً وهمية للعميل
            const maxAllowedDiscount = originalPrice - cost;
            const totalRequestedDiscount = offerDiscount + couponDiscount;
            
            if (totalRequestedDiscount > 0) {
                const ratio = maxAllowedDiscount / totalRequestedDiscount;
                offerDiscount *= ratio;
                couponDiscount *= ratio;
            }
        }

        const finalPrice = currentPrice;
        const totalDiscountVal = offerDiscount + couponDiscount;
        const profit = finalPrice - cost;
        const marginPct = cost > 0 ? (profit / cost) * 100 : 0;

        // إرجاع كائن التطابق الكامل الذي تحتاجه واجهات المتجر (Snapshot)
        return {
            cost: Number(cost.toFixed(4)),
            tierPrice: Number(tierPrice.toFixed(4)),
            originalPrice: Number(originalPrice.toFixed(4)),
            finalPrice: Number(finalPrice.toFixed(4)),
            tierName: tierName,
            offerName: offerName,
            offerDiscount: Number(offerDiscount.toFixed(4)),
            couponCode: couponCode,
            couponDiscount: Number(couponDiscount.toFixed(4)),
            totalDiscountVal: Number(totalDiscountVal.toFixed(4)),
            profit: Number(profit.toFixed(4)),
            marginPct: Number(marginPct.toFixed(2)),
            isFirewallActive: isFirewallActive
        };
    }
});
