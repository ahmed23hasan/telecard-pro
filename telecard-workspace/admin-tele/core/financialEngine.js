// ============================================================================
// 💰 المحرك المالي المركزي (Admin Edition) - V15.2 💎
// 🎯 الوظيفة: محاكاة الأسعار، كشف الأرباح للمدير، وتشخيص تصادم الخصومات.
// 🚀 التحديثات: تطابق 100% مع السيرفر، دعم كائنات العملات، ومحاكاة الفواتير.
// ============================================================================

export const FinancialEngine = {
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        PRECISION: 10000,
        MAX_UI_QTY: 10000,
        MIN_SALE_PRICE: 0.01 
    }),

    safeAdd: function(a, b) { return Math.round(((Number(a) || 0) + (Number(b) || 0) + Number.EPSILON) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION; },
    safeSub: function(a, b) { return Math.round(((Number(a) || 0) - (Number(b) || 0) + Number.EPSILON) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION; },
    safeMul: function(a, b) { return Math.round(((Number(a) || 0) * (Number(b) || 0) + Number.EPSILON) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION; },
    safeDiv: function(a, b) {
        const numA = Number(a) || 0;
        const numB = Number(b) || 0;
        if (numB === 0) return 0;
        return Math.round(((numA / numB) + Number.EPSILON) * FinancialEngine.CONFIG.PRECISION) / FinancialEngine.CONFIG.PRECISION;
    },
    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '' || Array.isArray(val) || typeof val === 'object') return 0;
        const num = Number(val);
        if (isNaN(num) || num < 0) return 0;
        if (!allowZero && num === 0) return 1;
        return num;
    },
       // 🛡️ التحديث 1 (الذكي): دعم المصفوفات والكائنات مع فلترة صارمة لمنع تسرب الكلمات المفتاحية
    normalizeRates: function(raw) {
        const ratesMap = {};
        // 1. إضافة العملة الأساسية دائماً
        ratesMap[FinancialEngine.CONFIG.BASE_CURRENCY] = { code: FinancialEngine.CONFIG.BASE_CURRENCY, symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true };
        
        // 2. إذا كانت البيانات مصفوفة (الوضع الطبيعي)
        if (Array.isArray(raw)) {
            for (const rate of raw) {
                if (rate && rate.code && rate.code !== FinancialEngine.CONFIG.BASE_CURRENCY) {
                    const code = String(rate.code).toUpperCase();
                    ratesMap[code] = { 
                        code: code, 
                        priceRate: FinancialEngine.extractNum(rate.priceRate || rate.value, false), 
                        depRate: FinancialEngine.extractNum(rate.depRate || rate.value, false) 
                    };
                }
            }
        } 
        // 3. 🛡️ التوافق الذكي (الحل الجذري لمشكلة العملات الوهمية)
        else if (raw && typeof raw === 'object') {
            // أ: إذا تم تمرير كائن عملة واحد بالخطأ
            if (raw.priceRate !== undefined || raw.depRate !== undefined || raw.code !== undefined) {
                const code = String(raw.code || '').toUpperCase();
                if (code && code !== FinancialEngine.CONFIG.BASE_CURRENCY) {
                    ratesMap[code] = {
                        code: code,
                        priceRate: FinancialEngine.extractNum(raw.priceRate || raw.value, false),
                        depRate: FinancialEngine.extractNum(raw.depRate || raw.value, false)
                    };
                }
            } else {
                // ب: حظر الكلمات المفتاحية لمنعها من الظهور كعملات في القائمة!
                const invalidKeys = ['ISBASE', 'PRICERATE', 'DEPRATE', 'CODE', 'VALUE', 'SYMBOL', 'NAME'];
                
                for (const [key, value] of Object.entries(raw)) {
                    const code = String(key).toUpperCase();
                    
                    if (code !== FinancialEngine.CONFIG.BASE_CURRENCY && !invalidKeys.includes(code)) {
                        if (typeof value === 'object' && value !== null) {
                            // الكاش يحتوي على كائن متداخل
                            ratesMap[code] = { 
                                code: code, 
                                priceRate: FinancialEngine.extractNum(value.priceRate || value.value, false), 
                                depRate: FinancialEngine.extractNum(value.depRate || value.value, false) 
                            };
                        } else {
                            // الكاش يحتوي على رقم مسطح
                            const numVal = FinancialEngine.extractNum(value, false);
                            ratesMap[code] = { code: code, priceRate: numVal, depRate: numVal };
                        }
                    }
                }
            }
        }
        return ratesMap;
    },
  convertViaUSD: function(amount, fromCode, toCode, ratesRaw, channel = 'pricing') {
        const amt = FinancialEngine.extractNum(amount);
        const fCode = String(fromCode || FinancialEngine.CONFIG.BASE_CURRENCY).toUpperCase();
        const tCode = String(toCode || FinancialEngine.CONFIG.BASE_CURRENCY).toUpperCase();
        if (amt === 0 || fCode === tCode) return amt;
        
        const ratesMap = FinancialEngine.normalizeRates(ratesRaw);
        if (!ratesMap[fCode] || !ratesMap[tCode]) {
            console.warn(`[Admin Simulator] Missing exchange rate for: ${fCode} or ${tCode}`);
            return 0;
        }
        
        const from = ratesMap[fCode];
        const to = ratesMap[tCode];
        const fRate = channel === 'deposit' ? from.depRate : from.priceRate;
        const tRate = channel === 'deposit' ? to.depRate : to.priceRate;
        
        if (fRate === 0 || tRate === 0) return 0;

        return FinancialEngine.safeMul(FinancialEngine.safeDiv(amt, fRate), tRate);
    },

    calculatePrice: function(params = {}) {
        const { product = {}, costPrice = 0, fixedPrice = 0, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        if (!product || typeof product !== 'object' || Object.keys(product).length === 0) {
            console.warn("[Admin Simulator] تم تمرير بيانات منتج تالفة للتسعير.");
            return { costUsd: 0, tierPrice: 0, originalPrice: 0, finalPrice: 0, tierName: 'غير محدد', offerName: null, offerDiscount: 0, couponCode: null, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallActive: true, isFirewallViolated: true };
        }

        let cost = FinancialEngine.extractNum(costPrice || product.costPrice || product.cost_price || 0);
        let isFixed = (fixedPrice > 0) || (String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);
        let activeOption = null;

        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null && optIdx !== undefined) {
            const index = Number(optIdx);
            if (Number.isInteger(index) && index >= 0 && index < product.options.length) {
                activeOption = product.options[index];
                cost = FinancialEngine.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
                if (activeOption.isFixedPrice !== undefined) isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
            }
        }
        
        let currentPrice = cost;
        let standardPrice = activeOption ? FinancialEngine.extractNum(activeOption.price) : FinancialEngine.extractNum(product.price);
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
                
                if (cost > 0 && (profitPercent > 0 || minProfitUsd > 0)) {
                    let profitAdded = FinancialEngine.safeMul(cost, FinancialEngine.safeDiv(profitPercent, 100));
                    if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
                    currentPrice = FinancialEngine.safeAdd(cost, profitAdded);
                } else {
                    currentPrice = standardPrice;
                }
            }
        } else {
            currentPrice = standardPrice;
        }

        const tierPrice = currentPrice;
        const originalPrice = tierPrice;

        let offerName = null, offerDiscount = 0;
        if (offer && typeof offer === 'object' && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name;
            const val = FinancialEngine.extractNum(offer.value);
            if (offer.type === 'percentage') {
                const valDec = FinancialEngine.safeDiv(val, 100);
                offerDiscount = FinancialEngine.safeMul(originalPrice, valDec);
            } else {
                offerDiscount = Math.min(val, currentPrice);
            }
        }
        currentPrice = FinancialEngine.safeSub(currentPrice, offerDiscount);

        let couponCode = null, couponDiscount = 0, isFirewallActive = false;
        if (product.disableCoupons === true || isFixed) {
            isFirewallActive = true;
        } else if (coupon && typeof coupon === 'object' && coupon.isActive !== false) {
            couponCode = coupon.code;
            const val = FinancialEngine.extractNum(coupon.value);
            if (coupon.type === 'percentage') {
                const valDec = FinancialEngine.safeDiv(val, 100);
                couponDiscount = FinancialEngine.safeMul(currentPrice, valDec);
            } else {
                couponDiscount = Math.min(val, currentPrice);
            }
        }
        currentPrice = FinancialEngine.safeSub(currentPrice, couponDiscount);

        let isFirewallViolated = false;
        let preFirewallPrice = currentPrice;

        if (currentPrice < 0) {
            isFirewallViolated = true;
            isFirewallActive = true;
            currentPrice = 0;
        }

        if (originalPrice > 0 && currentPrice < FinancialEngine.CONFIG.MIN_SALE_PRICE) {
            isFirewallViolated = true;
            isFirewallActive = true;
            currentPrice = Math.max(cost, FinancialEngine.CONFIG.MIN_SALE_PRICE);
        } else if (cost > 0 && currentPrice < cost) {
            isFirewallViolated = true;
            isFirewallActive = true;
            currentPrice = cost;
        }

        // ⚖️ التسوية المحاسبية (Clawback)
        if (currentPrice > preFirewallPrice) {
            let clawback = FinancialEngine.safeSub(currentPrice, preFirewallPrice);
            if (couponDiscount >= clawback) {
                couponDiscount = FinancialEngine.safeSub(couponDiscount, clawback);
                clawback = 0;
            } else {
                clawback = FinancialEngine.safeSub(clawback, couponDiscount);
                couponDiscount = 0;
                offerDiscount = FinancialEngine.safeSub(offerDiscount, clawback);
                if (offerDiscount < 0) offerDiscount = 0;
            }
        }

        const finalPrice = currentPrice;
        
        const totalDiscount = FinancialEngine.safeSub(originalPrice, finalPrice);
        const netProfitUsd = Math.max(0, FinancialEngine.safeSub(finalPrice, cost));
        
        let marginPct = 0;
        if (finalPrice > 0) {
            marginPct = FinancialEngine.safeMul(FinancialEngine.safeDiv(netProfitUsd, finalPrice), 100);
        }

        return {
            costUsd: cost,
            tierPrice, 
            originalPrice, 
            finalPrice, 
            tierName, 
            offerName, 
            offerDiscount, 
            couponCode, 
            couponDiscount, 
            totalDiscount,
            netProfitUsd,
            marginPct: Number(marginPct.toFixed(2)), 
            isFirewallActive, 
            isFirewallViolated
        };
    },

    // 🛡️ التحديث 2: إضافة الدالة الشاملة لحساب الفواتير (للتطابق مع الباك إند)
    calculateOrderTotal: function(params = {}, rawQty = 1) {
        const safeQty = Math.min(FinancialEngine.CONFIG.MAX_UI_QTY, Math.max(1, Math.floor(FinancialEngine.extractNum(rawQty) || 1)));
        const unit = FinancialEngine.calculatePrice(params);
        
        return {
            ...unit,
            qty: safeQty,
            totalCostUsd: FinancialEngine.safeMul(unit.costUsd, safeQty),
            totalOriginalPrice: FinancialEngine.safeMul(unit.originalPrice, safeQty),
            totalFinalPrice: FinancialEngine.safeMul(unit.finalPrice, safeQty),
            totalNetProfitUsd: FinancialEngine.safeMul(unit.netProfitUsd, safeQty),
            totalDiscount: FinancialEngine.safeMul(unit.totalDiscount, safeQty)
        };
    }
};

Object.freeze(FinancialEngine);
