// ============================================================================
// 💰 المحرك المالي المركزي (core/financialEngine.js) - Admin Edition V14.2 💎
// 🎯 الوظيفة: محاكاة الأسعار، كشف الأرباح للمدير، وتشخيص تصادم الخصومات.
// 🚀 التحديثات:
// 1. التطابق المعماري مع السيرفر (Sequential Discounts) لمنع خداع أرقام الإدارة.
// 2. الجدار الناري المزدوج (MIN_SALE_PRICE) لكشف استغلال الكوبونات.
// 3. التقريب البنكي (Number.EPSILON) لمنع فوارق السنتات.
// 4. الحماية من الانهيار (Destructuring-Safe).
// ============================================================================

export const FinancialEngine = {
    
    // 🛡️ 1. ثوابت النظام المتطابقة مع السيرفر
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        PRECISION: 10000,
        MIN_SALE_PRICE: 0.01 // 🛡️ الحد الأدنى لمنع الاستغلال الصفري
    }),

    // 🛡️ 2. دوال الرياضيات الآمنة (محصنة بـ Number.EPSILON)
    safeAdd: function(a, b) {
        return Math.round(( (Number(a) || 0) + (Number(b) || 0) + Number.EPSILON ) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION;
    },
    
    safeSub: function(a, b) {
        return Math.round(( (Number(a) || 0) - (Number(b) || 0) + Number.EPSILON ) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION;
    },
    
    safeMul: function(a, b) {
        return Math.round(( (Number(a) || 0) * (Number(b) || 0) + Number.EPSILON ) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION;
    },    
    
    safeDiv: function(a, b) {
        const numA = Number(a) || 0;
        let numB = Number(b);
        if (isNaN(numB) || numB === 0) numB = 1;
        return Math.round(( (numA / numB) + Number.EPSILON ) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION;
    },

    // 🛡️ 3. معقم الأرقام الصارم
    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '' || Array.isArray(val) || typeof val === 'object') return 0;
        const num = Number(val);
        if (isNaN(num) || num < 0) return 0; // رفض القيم السالبة تماماً
        if (!allowZero && num === 0) return 1;
        return num;
    },
    
    // 🛡️ 4. إدارة أسعار الصرف بـ O(1)
    normalizeRates: function(rawArray) {
        const ratesMap = {};
        
        ratesMap[FinancialEngine.CONFIG.BASE_CURRENCY] = { 
            code: FinancialEngine.CONFIG.BASE_CURRENCY, symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true 
        };

        if (Array.isArray(rawArray)) {
            for (const rate of rawArray) {
                if (rate && rate.code && rate.code !== FinancialEngine.CONFIG.BASE_CURRENCY) {
                    const code = String(rate.code).toUpperCase();
                    ratesMap[code] = {
                        code: code,
                        priceRate: FinancialEngine.extractNum(rate.priceRate, false),
                        depRate: FinancialEngine.extractNum(rate.depRate, false)
                    };
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
        
        // 🛡️ حماية لوحة الإدارة من الانهيار عند فقدان عملة، مع إرجاع 0 للفت انتباه المدير
        if (!ratesMap[fCode] || !ratesMap[tCode]) {
            console.error(`[Admin Simulator] Missing exchange rate for: ${fCode} or ${tCode}`);
            return 0;
        }

        const from = ratesMap[fCode];
        const to = ratesMap[tCode];

        const fRate = channel === 'deposit' ? from.depRate : from.priceRate;
        const tRate = channel === 'deposit' ? to.depRate : to.priceRate;

        return FinancialEngine.safeMul(FinancialEngine.safeDiv(amt, fRate), tRate);
    },
    
    // 🛡️ 5. المحرك الرياضي التشخيصي (يطابق السيرفر 100% ويكشف الأرباح)
    calculatePrice: function(params = {}) {
        const { product = {}, costPrice = 0, fixedPrice = 0, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        // 🛡️ [درع المؤسسات]: حماية اللوحة من الانهيار
        if (!product || typeof product !== 'object' || Object.keys(product).length === 0) {
            console.warn("[Admin FinancialEngine] تم تمرير بيانات منتج تالفة للتسعير.");
            return {
                cost: 0, tierPrice: 0, originalPrice: 0, finalPrice: 0,
                tierName: 'غير محدد', offerName: null, offerDiscount: 0,
                couponCode: null, couponDiscount: 0, totalDiscountVal: 0,
                profit: 0, marginPct: 0, isFirewallActive: true, isFirewallViolated: true
            };
        }

        let cost = FinancialEngine.extractNum(costPrice || product.costPrice || product.cost_price || 0);
        let isFixed = (fixedPrice > 0) || (String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);
        let activeOption = null;
        
        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null && optIdx !== undefined) {
            activeOption = product.options[optIdx];
            if (activeOption) {
                cost = FinancialEngine.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
                if (activeOption.isFixedPrice !== undefined) {
                    isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
                }
            }
        }
        
        let currentPrice = cost;
        let tierName = null;
        
        if (isFixed) {
            currentPrice = activeOption ? FinancialEngine.extractNum(activeOption.fixedPriceUsd || activeOption.price) : FinancialEngine.extractNum(fixedPrice || product.fixedPriceUsd || product.price);
            tierName = "سعر ثابت";
        } else if (tier && typeof tier === 'object') {
            tierName = tier.nameAr || tier.name || tier.id || 'عضو';
            const tierPriceField = activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id];
            
            if (tierPriceField !== undefined && tierPriceField !== null) {
                currentPrice = FinancialEngine.extractNum(tierPriceField);
            } else {
                const profitPercent = FinancialEngine.extractNum(tier.profitPercent || tier.profit_percent || tier.profitMargin);
                const minProfitUsd = FinancialEngine.extractNum(tier.minProfitUsd || tier.min_profit_usd || tier.minProfit);
                
                if (profitPercent > 0 || minProfitUsd > 0) {
                    let profitAdded = FinancialEngine.safeMul(cost, FinancialEngine.safeDiv(profitPercent, 100));
                    if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
                    currentPrice = FinancialEngine.safeAdd(cost, profitAdded);
                } else {
                    currentPrice = activeOption ? FinancialEngine.extractNum(activeOption.price) : FinancialEngine.extractNum(product.price);
                }
            }
        } else {
            currentPrice = activeOption ? FinancialEngine.extractNum(activeOption.price) : FinancialEngine.extractNum(product.price);
        }
        
        const tierPrice = currentPrice;
        const originalPrice = tierPrice;
        
        // ========================================================
        // 🚀 الخصم المتسلسل (التطابق التام مع السيرفر)
        // ========================================================
        let offerName = null, offerDiscount = 0;
        if (offer && typeof offer === 'object' && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name;
            const val = FinancialEngine.extractNum(offer.value);
            const valDec = FinancialEngine.safeDiv(val, 100);
            offerDiscount = offer.type === 'percentage' ? FinancialEngine.safeMul(originalPrice, valDec) : val;
        }
        
        currentPrice = FinancialEngine.safeSub(currentPrice, offerDiscount); // 👈 تطبيق خصم العرض أولاً
        
        let couponCode = null, couponDiscount = 0, isFirewallActive = false;
        if (product.disableCoupons === true || isFixed) {
            isFirewallActive = true;
        } else if (coupon && typeof coupon === 'object' && coupon.isActive !== false) {
            couponCode = coupon.code;
            const val = FinancialEngine.extractNum(coupon.value);
            const valDec = FinancialEngine.safeDiv(val, 100);
            // 👈 تطبيق خصم الكوبون على السعر (بعد العرض) وليس السعر الأصلي!
            couponDiscount = coupon.type === 'percentage' ? FinancialEngine.safeMul(currentPrice, valDec) : val; 
        }
        
        currentPrice = FinancialEngine.safeSub(currentPrice, couponDiscount); // 👈 استخراج السعر النهائي
        
        let isFirewallViolated = false;

        // 🛑 الجدار الناري المتطابق
        if (currentPrice < 0) {
            isFirewallViolated = true;
            isFirewallActive = true;
            currentPrice = 0;
        }

        // كشف محاولة استغلال الكوبونات للحصول على منتج مجاني
        if (originalPrice > 0 && currentPrice < FinancialEngine.CONFIG.MIN_SALE_PRICE) {
            isFirewallViolated = true;
            isFirewallActive = true;
            currentPrice = Math.max(cost, FinancialEngine.CONFIG.MIN_SALE_PRICE);
        }
        // كشف البيع بخسارة
        else if (cost > 0 && currentPrice < cost) {
            isFirewallViolated = true;
            isFirewallActive = true;
            currentPrice = cost;
        }
        
        const finalPrice = currentPrice;
        const totalDiscountVal = FinancialEngine.safeSub(originalPrice, finalPrice);
        
        // الأرباح والهوامش الحقيقية (التي ستدخل جيبك)
        const profit = Math.max(0, FinancialEngine.safeSub(finalPrice, cost));
        const marginPct = cost > 0 ? FinancialEngine.safeMul(FinancialEngine.safeDiv(profit, cost), 100) : 0;
        
        return {
            cost, tierPrice, originalPrice, finalPrice,
            tierName, offerName, offerDiscount,
            couponCode, couponDiscount, totalDiscountVal,
            profit, marginPct: Number(marginPct.toFixed(2)),
            isFirewallActive, isFirewallViolated 
        };
    }
};

// 🔒 تجميد الكائن كاملاً
Object.freeze(FinancialEngine);