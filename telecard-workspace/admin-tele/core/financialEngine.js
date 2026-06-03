// ============================================================================
// 💰 المحرك المالي المركزي (core/financialEngine.js) - Agnostic Core (Admin Simulator)
// 🎯 الوظيفة: حساب الأسعار، الخصومات، تحويل العملات، والضرائب (للمتجر والإدارة)
// 🌟 التحديث الأقصى: توحيد الحسابات بنظام (Integer Math) لمطابقة السيرفر والعميل
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

    // 🚀 المحرك الرياضي المكتمل لحساب الأسعار وجدار الحماية (يعتمد على الرياضيات الآمنة)
    calculatePrice: function(params) {
        const { costPrice = 0, fixedPrice = 0, tier = null, offer = null, coupon = null } = params;
        const cost = Number(costPrice) || 0;
        const fixed = Number(fixedPrice) || 0;

        let currentPrice = cost;
        let tierName = null;

        // 🛡️ دالة مساعدة لانتزاع الأرقام الصافية بقوة من أي نص
        const extractNum = (val) => {
            if (val === undefined || val === null || val === '') return 0;
            const cleanStr = String(val).replace(/[^0-9.-]/g, '');
            const num = parseFloat(cleanStr);
            return isNaN(num) ? 0 : num;
        };

        // 1. حساب سعر البيع الأساسي بناءً على مستوى العميل أو السعر الثابت
        if (fixed > 0) {
            currentPrice = fixed;
            tierName = "سعر ثابت";
        } else if (tier && typeof tier === 'object') {
            tierName = tier.nameAr || tier.name || tier.id || 'عضو';
            
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
                // حساب الربح بالضرب الآمن
                let profitAdded = this.safeMul(cost, profitPercent / 100);
                
                if (profitAdded < minProfitUsd) {
                    profitAdded = minProfitUsd;
                }
                currentPrice = this.safeAdd(currentPrice, profitAdded);
            } else {
                console.warn(`⚠️ المحرك المالي: مستوى العميل [${tierName}] قرأ نسبة الربح كـ 0.`);
            }
        }

        const tierPrice = currentPrice;
        const originalPrice = tierPrice;

        // 2. تطبيق خصومات العروض النشطة بالرياضيات الآمنة
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

        // 3. تطبيق خصومات الكوبونات بالرياضيات الآمنة
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

        // 4. 🛡️ جدار الحماية المالي (Financial Firewall) بالطرح الآمن
        let isFirewallActive = false;
        if (currentPrice < cost) {
            isFirewallActive = true;
            currentPrice = cost; 
            
            const maxAllowedDiscount = Math.max(0, this.safeSub(originalPrice, cost));
            const totalRequestedDiscount = this.safeAdd(offerDiscount, couponDiscount);
            
            if (totalRequestedDiscount > 0) {
                const ratio = maxAllowedDiscount / totalRequestedDiscount;
                offerDiscount = this.safeMul(offerDiscount, ratio);
                couponDiscount = this.safeMul(couponDiscount, ratio);
            }
        }

        const finalPrice = currentPrice;
        const totalDiscountVal = this.safeAdd(offerDiscount, couponDiscount);
        const profit = Math.max(0, this.safeSub(finalPrice, cost));
        const marginPct = cost > 0 ? (profit / cost) * 100 : 0;

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
            isFirewallActive: isFirewallActive
        };
    }
});
