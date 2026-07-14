// ============================================================================
// 💰 المحرك المالي المركزي (core/financialEngine.js) - Admin Edition V12.3 👑
// 🎯 الوظيفة: محاكاة الأسعار، كشف الأرباح للمدير، وتشخيص تصادم الخصومات.
// 🌟 التحديث الأقصى: التجميد العميق (Deep Freeze) والتطابق التام مع جدار السيرفر.
// ============================================================================

export const FinancialEngine = Object.freeze({
    
    // 🛡️ 1. ثوابت النظام (مجمدة بعمق لمنع التلاعب العرضي في لوحة الإدارة)
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        PRECISION: 10000
    }),

    // 🛡️ 2. دوال الرياضيات الآمنة (محصنة ضد تسرب الكسور)
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
        const numB = Number(b) || 1;
        return Math.round(((Number(a) || 0) / numB) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },

    // 🛡️ 3. معقم الأرقام الصارم (متطابق مع السيرفر)
    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '') return 0;
        const num = Number(val);
        // 🛡️ التطابق الأمني: رفض القيم السالبة تماماً وتحويلها لصفر
        if (isNaN(num) || num < 0) return 0; 
        if (!allowZero && num === 0) return 1;
        return num;
    },
    
    // 🛡️ 4. إدارة أسعار الصرف بـ O(1)
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
    
    // 🛡️ 5. المحرك الرياضي التشخيصي للإدارة (يكشف التكلفة والأرباح)
    calculatePrice: function(params = {}) {
        const { product = {}, costPrice = 0, fixedPrice = 0, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        // 🛡️ [درع المؤسسات - Enterprise Shield]: حماية اللوحة من الانهيار
        if (!product || typeof product !== 'object' || Object.keys(product).length === 0) {
            console.warn("[Admin FinancialEngine] تم تمرير بيانات منتج تالفة للتسعير.");
            return {
                cost: 0, tierPrice: 0, originalPrice: 0, finalPrice: 0,
                tierName: 'غير محدد', offerName: null, offerDiscount: 0,
                couponCode: null, couponDiscount: 0, totalDiscountVal: 0,
                profit: 0, marginPct: 0, isFirewallActive: true, isFirewallViolated: true
            };
        }

        let cost = this.extractNum(costPrice || product.costPrice || product.cost_price || 0);
        let isFixed = (fixedPrice > 0) || (String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);
        let activeOption = null;
        
        // 🛡️ التدهور الآمن للخيارات
        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null) {
            activeOption = product.options[optIdx];
            if (activeOption) {
                cost = this.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
                if (activeOption.isFixedPrice !== undefined) {
                    isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
                }
            }
        }
        
        let currentPrice = cost;
        let tierName = null;
        
        if (isFixed) {
            currentPrice = activeOption ? this.extractNum(activeOption.fixedPriceUsd || activeOption.price) : this.extractNum(fixedPrice || product.fixedPriceUsd || product.price);
            tierName = "سعر ثابت";
        } else if (tier && typeof tier === 'object') {
            tierName = tier.nameAr || tier.name || tier.id || 'عضو';
            const tierPriceField = activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id];
            
            if (tierPriceField) {
                currentPrice = this.extractNum(tierPriceField);
            } else {
                const profitPercent = this.extractNum(tier.profitPercent || tier.profit_percent || tier.profitMargin);
                const minProfitUsd = this.extractNum(tier.minProfitUsd || tier.min_profit_usd || tier.minProfit);
                
                if (profitPercent > 0 || minProfitUsd > 0) {
                    let profitAdded = this.safeMul(cost, profitPercent / 100);
                    if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
                    currentPrice = this.safeAdd(cost, profitAdded);
                } else {
                    currentPrice = activeOption ? this.extractNum(activeOption.price) : this.extractNum(product.price);
                }
            }
        } else {
            currentPrice = activeOption ? this.extractNum(activeOption.price) : this.extractNum(product.price);
        }
        
        const tierPrice = currentPrice;
        const originalPrice = tierPrice;
        
        let offerName = null, offerDiscount = 0;
        if (offer && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name;
            const val = this.extractNum(offer.value);
            offerDiscount = offer.type === 'percentage' ? this.safeMul(originalPrice, val / 100) : val;
        }
        
        let couponCode = null, couponDiscount = 0, isFirewallActive = false;
        if (product.disableCoupons === true || isFixed) {
            isFirewallActive = true;
        } else if (coupon && coupon.isActive !== false) {
            couponCode = coupon.code;
            const val = this.extractNum(coupon.value);
            // الخصم يُحسب من السعر الأصلي للتطابق مع السيرفر
            couponDiscount = coupon.type === 'percentage' ? this.safeMul(originalPrice, val / 100) : val;
        }
        
        // تطبيق الخصومات لاستخراج السعر الحالي
        currentPrice = this.safeSub(currentPrice, this.safeAdd(offerDiscount, couponDiscount));
        
        let isFirewallViolated = false;

        // 🛑 الجدار الناري 1: اصطياد السعر السالب
        if (currentPrice < 0) {
            isFirewallViolated = true;
            isFirewallActive = true;
            currentPrice = 0;
        }
        
        // 🛑 الجدار الناري 2: كشف وتوثيق الخسارة (أقل من التكلفة) لتنبيه الأدمن
        if (cost > 0 && currentPrice < cost) {
            isFirewallViolated = true;
            isFirewallActive = true;
            currentPrice = cost;
        }
        
        const finalPrice = currentPrice;
        const totalDiscountVal = this.safeSub(originalPrice, finalPrice);
        
        // الأرباح والهوامش للإدارة فقط
        const profit = Math.max(0, this.safeSub(finalPrice, cost));
        const marginPct = cost > 0 ? this.safeMul(this.safeDiv(profit, cost), 100) : 0;
        
        return {
            cost, tierPrice, originalPrice, finalPrice,
            tierName, offerName, offerDiscount,
            couponCode, couponDiscount, totalDiscountVal,
            profit, marginPct: Number(marginPct.toFixed(2)),
            isFirewallActive, isFirewallViolated // 👈 مهمة جداً لطباعة تنبيه باللون الأحمر في لوحة الأدمن
        };
    }
});