// ============================================================================
// 💰 المحرك المالي المركزي (Cloud & Server Version) - النسخة الماسية المطلقة V15.1 👑
// 🎯 الوظيفة: الحساب المالي السيادي، حماية الأرباح، التطابق مع الواجهة
// 🚀 التحديثات المعمارية:
// 1. إصلاح ثغرة القسمة على صفر (Zero-Division Forex Exploit).
// 2. تحجيم الخصومات (Discount Capping) لمنع الخصم السلبي المحاسبي.
// 3. تصحيح معادلة هامش الربح (Margin vs Markup).
// 4. [جديد] التسوية المحاسبية (Clawback) لاسترداد الخصومات الوهمية عند تدخل الجدار الناري.
// 5. [جديد] توحيد منطق تسعير المستويات (Tier Pricing) مع الإدارة.
// ============================================================================

const FinancialEngineDef = {
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        MAX_QTY_LIMIT: 10000,
        MAX_PRICE_LIMIT: 100000,
        PRECISION: 10000,
        MIN_SALE_PRICE: 0.01
    }),

    safeAdd: function(a, b) {
        return Math.round(((Number(a) || 0) + (Number(b) || 0) + Number.EPSILON) * FinancialEngineDef.CONFIG.PRECISION) / FinancialEngineDef.CONFIG.PRECISION;
    },
    safeSub: function(a, b) {
        return Math.round(((Number(a) || 0) - (Number(b) || 0) + Number.EPSILON) * FinancialEngineDef.CONFIG.PRECISION) / FinancialEngineDef.CONFIG.PRECISION;
    },
    safeMul: function(a, b) {
        return Math.round(((Number(a) || 0) * (Number(b) || 0) + Number.EPSILON) * FinancialEngineDef.CONFIG.PRECISION) / FinancialEngineDef.CONFIG.PRECISION;
    },
    safeDiv: function(a, b) {
        const numA = Number(a) || 0;
        const numB = Number(b) || 0;
        if (numB === 0) return 0;
        return Math.round(((numA / numB) + Number.EPSILON) * FinancialEngineDef.CONFIG.PRECISION) / FinancialEngineDef.CONFIG.PRECISION;
    },
    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '' || Array.isArray(val) || typeof val === 'object') return 0;
        const num = Number(val);
        if (isNaN(num) || num < 0) return 0;
        if (!allowZero && num === 0) return 1;
        return num;
    },
        normalizeRates: function(raw) {
        const ratesMap = {};
        ratesMap[FinancialEngineDef.CONFIG.BASE_CURRENCY] = { code: FinancialEngineDef.CONFIG.BASE_CURRENCY, priceRate: 1, depRate: 1, isBase: true };
        
        if (Array.isArray(raw)) {
            for (const rate of raw) {
                if (rate && rate.code && rate.code !== FinancialEngineDef.CONFIG.BASE_CURRENCY) {
                    const code = String(rate.code).toUpperCase();
                    ratesMap[code] = {
                        code: code,
                        priceRate: FinancialEngineDef.extractNum(rate.priceRate || rate.value, false),
                        depRate: FinancialEngineDef.extractNum(rate.depRate || rate.value, false)
                    };
                }
            }
        } 
        // 🛡️ دعم الكائنات المسطحة لحماية السيرفر من أي تنسيق مختلف
        else if (raw && typeof raw === 'object') {
            for (const [key, value] of Object.entries(raw)) {
                const code = String(key).toUpperCase();
                if (code !== FinancialEngineDef.CONFIG.BASE_CURRENCY && code !== 'ISBASE') {
                    const numVal = FinancialEngineDef.extractNum(value, false);
                    ratesMap[code] = { code: code, priceRate: numVal, depRate: numVal };
                }
            }
        }
        return ratesMap;
    },
    convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel = 'pricing') {
        const amt = FinancialEngineDef.extractNum(amount);
        const fCode = String(fromCode || FinancialEngineDef.CONFIG.BASE_CURRENCY).toUpperCase();
        const tCode = String(toCode || FinancialEngineDef.CONFIG.BASE_CURRENCY).toUpperCase();
        if (amt === 0 || fCode === tCode) return amt;
        
        const ratesMap = FinancialEngineDef.normalizeRates(ratesArray);
        if (!ratesMap[fCode]) throw new Error(`[SECURITY] Missing exchange rate for currency: ${fCode}`);
        if (!ratesMap[tCode]) throw new Error(`[SECURITY] Missing exchange rate for currency: ${tCode}`);
        
        const from = ratesMap[fCode];
        const to = ratesMap[tCode];
        const fRate = channel === 'deposit' ? from.depRate : from.priceRate;
        const tRate = channel === 'deposit' ? to.depRate : to.priceRate;

        if (fRate === 0 || tRate === 0) throw new Error(`[SECURITY] Invalid exchange rate (Zero) detected.`);

        return FinancialEngineDef.safeMul(FinancialEngineDef.safeDiv(amt, fRate), tRate);
    },
    calculatePrice: function(rawParams) {
        const params = rawParams || {};
        const { product, tier, offer, coupon, optIdx } = params;
        if (!product || typeof product !== 'object') throw new Error("FinancialEngine: Missing Product Data");

        let cost = FinancialEngineDef.extractNum(product.costPrice || product.cost_price || 0);
        let isFixed = (String(product.isFixedPrice).toLowerCase() === 'true');
        let activeOption = null;

        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null && optIdx !== undefined) {
            const index = Number(optIdx);
            // 🛡️ حماية ضد التلاعب بالفهرس (Index Injection)
            if (Number.isInteger(index) && index >= 0 && index < product.options.length) {
                activeOption = product.options[index];
                cost = FinancialEngineDef.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
                if (activeOption.isFixedPrice !== undefined) isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
            } else {
                throw new Error(`[SECURITY] Invalid option index detected.`);
            }
        }
        if (cost > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) throw new Error(`[SECURITY] Cost exceeds limits.`);

        let baseSellingPrice = 0;
        let standardPrice = FinancialEngineDef.extractNum(activeOption?.price || product.price);

        if (isFixed) {
            baseSellingPrice = activeOption ? FinancialEngineDef.extractNum(activeOption.fixedPriceUsd || activeOption.price) : FinancialEngineDef.extractNum(product.fixedPriceUsd || product.fixed_price_usd);
        } else if (tier && typeof tier === 'object') {
            const tierPriceField = activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id];
            if (tierPriceField !== undefined && tierPriceField !== null) {
                baseSellingPrice = FinancialEngineDef.extractNum(tierPriceField);
            } else {
                const profitPercent = FinancialEngineDef.extractNum(tier.profitPercent || tier.profit_percent);
                const minProfitUsd = FinancialEngineDef.extractNum(tier.minProfitUsd || tier.min_profit_usd);
                
                // 🛑 توحيد الشرط مع الإدارة لضمان تطابق الأرقام
                if (cost > 0 && (profitPercent > 0 || minProfitUsd > 0)) {
                    let profitAdded = FinancialEngineDef.safeMul(cost, FinancialEngineDef.safeDiv(profitPercent, 100));
                    if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
                    baseSellingPrice = FinancialEngineDef.safeAdd(cost, profitAdded);
                } else {
                    baseSellingPrice = standardPrice;
                }
            }
        } else {
            baseSellingPrice = standardPrice;
        }

        if (baseSellingPrice > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) throw new Error(`[SECURITY] Selling price exceeds limits.`);

        const originalPrice = baseSellingPrice;
        let currentPrice = originalPrice;
        const allowsDiscounts = !isFixed;

        let offerName = null, offerDiscount = 0;
        if (allowsDiscounts && offer && typeof offer === 'object' && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name || null;
            const offerVal = FinancialEngineDef.extractNum(offer.value);
            if (offer.type === 'percentage') {
                const offerValDec = FinancialEngineDef.safeDiv(offerVal, 100);
                offerDiscount = FinancialEngineDef.safeMul(originalPrice, offerValDec);
            } else {
                offerDiscount = Math.min(offerVal, currentPrice);
            }
        }
        currentPrice = FinancialEngineDef.safeSub(currentPrice, offerDiscount);

        let couponCode = null, couponDiscount = 0;
        const canUseCoupon = allowsDiscounts && product.disableCoupons !== true;
        if (canUseCoupon && coupon && typeof coupon === 'object' && coupon.isActive !== false) {
            couponCode = coupon.code || null;
            const coupVal = FinancialEngineDef.extractNum(coupon.value);
            if (coupon.type === 'percentage') {
                const coupValDec = FinancialEngineDef.safeDiv(coupVal, 100);
                couponDiscount = FinancialEngineDef.safeMul(currentPrice, coupValDec);
            } else {
                couponDiscount = Math.min(coupVal, currentPrice);
            }
        }
        currentPrice = FinancialEngineDef.safeSub(currentPrice, couponDiscount);

        let isFirewallViolated = false;
        let preFirewallPrice = currentPrice;

        // 🛑 الجدار الناري المطور
        if (currentPrice < 0) {
            isFirewallViolated = true;
            currentPrice = 0;
        }
        if (originalPrice > 0 && currentPrice < FinancialEngineDef.CONFIG.MIN_SALE_PRICE) {
            isFirewallViolated = true;
            currentPrice = Math.max(cost, FinancialEngineDef.CONFIG.MIN_SALE_PRICE);
        } else if (cost > 0 && currentPrice < cost) {
            isFirewallViolated = true;
            currentPrice = cost;
        }

        // ⚖️ التسوية المحاسبية (Accounting Reconciliation - Clawback)
        if (currentPrice > preFirewallPrice) {
            let clawback = FinancialEngineDef.safeSub(currentPrice, preFirewallPrice);
            if (couponDiscount >= clawback) {
                couponDiscount = FinancialEngineDef.safeSub(couponDiscount, clawback);
                clawback = 0;
            } else {
                clawback = FinancialEngineDef.safeSub(clawback, couponDiscount);
                couponDiscount = 0;
                offerDiscount = FinancialEngineDef.safeSub(offerDiscount, clawback);
                if (offerDiscount < 0) offerDiscount = 0;
            }
        }

        const profit = Math.max(0, FinancialEngineDef.safeSub(currentPrice, cost));
        let marginPct = 0;
        if (currentPrice > 0) {
            marginPct = FinancialEngineDef.safeMul(FinancialEngineDef.safeDiv(profit, currentPrice), 100);
        }

        return {
            costUsd: cost,
            originalPrice,
            finalPrice: currentPrice,
            offerName: offerName || null,
            offerDiscount,
            couponCode: couponCode || null,
            couponDiscount,
            totalDiscount: FinancialEngineDef.safeSub(originalPrice, currentPrice),
            netProfitUsd: profit,
            marginPct: Number(marginPct.toFixed(2)),
            isFirewallViolated,
            tierName: tier?.name || (isFixed ? 'Fixed Price' : 'Standard')
        };
    },
    calculateOrderTotal: function(params, rawQty) {
        let qty = Math.floor(FinancialEngineDef.extractNum(rawQty));
        if (qty <= 0) qty = 1;
        if (qty > FinancialEngineDef.CONFIG.MAX_QTY_LIMIT) throw new Error(`[SECURITY] Requested quantity exceeds max limit.`);
        
        const unit = FinancialEngineDef.calculatePrice(params);
        return {
            ...unit,
            qty,
            totalCostUsd: FinancialEngineDef.safeMul(unit.costUsd, qty),
            totalOriginalPrice: FinancialEngineDef.safeMul(unit.originalPrice, qty),
            totalFinalPrice: FinancialEngineDef.safeMul(unit.finalPrice, qty),
            totalNetProfitUsd: FinancialEngineDef.safeMul(unit.netProfitUsd, qty),
            totalDiscount: FinancialEngineDef.safeMul(unit.totalDiscount, qty)
        };
    }
};

module.exports = Object.freeze(FinancialEngineDef);
