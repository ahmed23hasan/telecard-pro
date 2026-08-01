// ============================================================================
// 💰 المحرك المالي المركزي (Cloud & Server Version) - النسخة الماسية V16.5 👑 (Iron Bank)
// 🎯 الوظيفة: الحساب المالي السيادي، حماية الأرباح، التطابق التام مع الواجهة
// 🚀 التحديثات المعمارية (V16.5):
// 1. Math-Safe Rounding: حل ثغرة Scientific Notation (NaN) للأرقام الصغيرة جداً.
// 2. Absolute Zero-Rate Fix: منع اختراق "1:1" في العملات.
// 3. Price Floor Sync: مطابقة إجبار الحد الأدنى للسعر (0.01) مع الواجهة الأمامية لمنع الرفض الوهمي للطلبات.
// 4. Loss-Prevention Firewall: السيرفر يرفض صراحة أي طلب ينزل سعره عن سعر التكلفة الفعلي.
// ============================================================================

const FinancialEngineDef = {
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        MAX_QTY_LIMIT: 10000,
        MAX_PRICE_LIMIT: 100000,
        PRECISION: 4,          
        INTERNAL_PRECISION: 8, 
        MIN_SALE_PRICE: 0.01   // الحد الأدنى الإجباري للسعر
    }),

    _preciseRound: function(num, decimals = FinancialEngineDef.CONFIG.PRECISION) {
        let n = Number(num);
        if (isNaN(n) || n === 0) return 0;
        const factor = Math.pow(10, decimals);
        return Math.round((n + Number.EPSILON) * factor) / factor;
    },

    _internalAdd: function(a, b) { return FinancialEngineDef._preciseRound((Number(a) || 0) + (Number(b) || 0), FinancialEngineDef.CONFIG.INTERNAL_PRECISION); },
    _internalSub: function(a, b) { return FinancialEngineDef._preciseRound((Number(a) || 0) - (Number(b) || 0), FinancialEngineDef.CONFIG.INTERNAL_PRECISION); },
    _internalMul: function(a, b) { return FinancialEngineDef._preciseRound((Number(a) || 0) * (Number(b) || 0), FinancialEngineDef.CONFIG.INTERNAL_PRECISION); },
    _internalDiv: function(a, b) {
        const numB = Number(b) || 0;
        // السيرفر يرفض القسمة على صفر بشكل صريح (عكس الواجهة التي تتجاهله بصمت)
        if (numB === 0) throw new Error("[SECURITY - Finance Guard]: Division by zero detected! Transaction aborted.");
        return FinancialEngineDef._preciseRound((Number(a) || 0) / numB, FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
    },

    safeAdd: function(a, b) { return FinancialEngineDef._preciseRound(FinancialEngineDef._internalAdd(a, b)); },
    safeSub: function(a, b) { return FinancialEngineDef._preciseRound(FinancialEngineDef._internalSub(a, b)); },
    safeMul: function(a, b) { return FinancialEngineDef._preciseRound(FinancialEngineDef._internalMul(a, b)); },
    safeDiv: function(a, b) { return FinancialEngineDef._preciseRound(FinancialEngineDef._internalDiv(a, b)); },
    
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
        
        const processRateObj = (code, priceR, depR) => {
            const numPrice = FinancialEngineDef.extractNum(priceR);
            const numDep = FinancialEngineDef.extractNum(depR);
            if (numPrice === 0 || numDep === 0) {
                throw new Error(`[SECURITY] Invalid or Zero exchange rate detected for currency: ${code}`);
            }
            ratesMap[code] = { code: code, priceRate: numPrice, depRate: numDep };
        };

        if (Array.isArray(raw)) {
            for (const rate of raw) {
                if (rate && rate.code && rate.code !== FinancialEngineDef.CONFIG.BASE_CURRENCY) {
                    processRateObj(String(rate.code).toUpperCase(), rate.priceRate || rate.value, rate.depRate || rate.value);
                }
            }
        } else if (raw && typeof raw === 'object') {
            if (raw.priceRate !== undefined || raw.depRate !== undefined || raw.code !== undefined) {
                const code = String(raw.code || '').toUpperCase();
                if (code && code !== FinancialEngineDef.CONFIG.BASE_CURRENCY) {
                    processRateObj(code, raw.priceRate || raw.value, raw.depRate || raw.value);
                }
            } else {
                const invalidKeys = ['ISBASE', 'PRICERATE', 'DEPRATE', 'CODE', 'VALUE', 'SYMBOL', 'NAME'];
                for (const [key, value] of Object.entries(raw)) {
                    const code = String(key).toUpperCase();
                    if (code !== FinancialEngineDef.CONFIG.BASE_CURRENCY && !invalidKeys.includes(code)) {
                        if (typeof value === 'object' && value !== null) {
                            processRateObj(code, value.priceRate || value.value, value.depRate || value.value);
                        } else {
                            processRateObj(code, value, value);
                        }
                    }
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

        const usdAmount = FinancialEngineDef._internalDiv(amt, fRate);
        const finalAmount = FinancialEngineDef._internalMul(usdAmount, tRate);
        
        return FinancialEngineDef._preciseRound(finalAmount);
    },
    
    calculatePrice: function(rawParams) {
        const params = rawParams || {};
        const { product, tier, offer, coupon, optIdx } = params;
        if (!product || typeof product !== 'object') throw new Error("FinancialEngine: Missing Product Data");

        let cost = FinancialEngineDef.extractNum(product.costPrice || product.cost_price || 0);
        let isFixed = (String(product.isFixedPrice).toLowerCase() === 'true');
        let activeOption = null;

        if (product.type === 'select' && Array.isArray(product.options)) {
            if (typeof optIdx === 'number' && Number.isInteger(optIdx)) {
                if (optIdx >= 0 && optIdx < product.options.length) {
                    activeOption = product.options[optIdx];
                    cost = FinancialEngineDef.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
                    if (activeOption.isFixedPrice !== undefined) isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
                } else {
                    throw new Error(`[SECURITY] Out of bounds option index detected.`);
                }
            } else if (optIdx !== null && optIdx !== undefined) {
                throw new Error(`[SECURITY] Invalid option index type detected.`);
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
                
                if (cost > 0 && (profitPercent > 0 || minProfitUsd > 0)) {
                    let profitAdded = FinancialEngineDef._internalMul(cost, FinancialEngineDef._internalDiv(profitPercent, 100));
                    if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
                    baseSellingPrice = FinancialEngineDef._internalAdd(cost, profitAdded);
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
            const offerVal = FinancialEngineDef._preciseRound(FinancialEngineDef.extractNum(offer.value), FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
            
            if (offer.type === 'percentage') {
                const offerValDec = FinancialEngineDef._internalDiv(offerVal, 100);
                offerDiscount = FinancialEngineDef._internalMul(originalPrice, offerValDec);
            } else {
                offerDiscount = Math.min(offerVal, currentPrice);
            }
        }
        currentPrice = FinancialEngineDef._internalSub(currentPrice, offerDiscount);

        let couponCode = null, couponDiscount = 0;
        const canUseCoupon = allowsDiscounts && product.disableCoupons !== true;
        if (canUseCoupon && coupon && typeof coupon === 'object' && coupon.isActive !== false) {
            couponCode = coupon.code || null;
            const coupVal = FinancialEngineDef._preciseRound(FinancialEngineDef.extractNum(coupon.value), FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
            
            if (coupon.type === 'percentage') {
                const coupValDec = FinancialEngineDef._internalDiv(coupVal, 100);
                couponDiscount = FinancialEngineDef._internalMul(currentPrice, coupValDec);
            } else {
                couponDiscount = Math.min(coupVal, currentPrice);
            }
        }
        
        // 🛡️ التحديث 3: مطابقة السعر مع الواجهة الأمامية ليقف عند الحد الأدنى
        currentPrice = Math.max(
            FinancialEngineDef.CONFIG.MIN_SALE_PRICE, 
            FinancialEngineDef._internalSub(currentPrice, couponDiscount)
        );

        // 🛑 التحديث 4: الجدار الناري لحماية التاجر (يمنع البيع بخسارة حتى لو وصل السعر للحد الأدنى المسموح به)
        if (cost > 0 && currentPrice < cost) {
            throw new Error(`[FIREWALL_REJECT] Transaction blocked: Selling price (${currentPrice}) fell below cost price (${cost}).`);
        }

        const profit = Math.max(0, FinancialEngineDef._internalSub(currentPrice, cost));
        let marginPct = 0;
        if (currentPrice > 0) {
            marginPct = FinancialEngineDef._internalMul(FinancialEngineDef._internalDiv(profit, currentPrice), 100);
        }

        return {
            costUsd: FinancialEngineDef._preciseRound(cost),
            originalPrice: FinancialEngineDef._preciseRound(originalPrice),
            finalPrice: FinancialEngineDef._preciseRound(currentPrice),
            offerName: offerName || null,
            offerDiscount: FinancialEngineDef._preciseRound(offerDiscount),
            couponCode: couponCode || null,
            couponDiscount: FinancialEngineDef._preciseRound(couponDiscount),
            totalDiscount: FinancialEngineDef._preciseRound(FinancialEngineDef._internalSub(originalPrice, currentPrice)),
            netProfitUsd: FinancialEngineDef._preciseRound(profit),
            marginPct: Number(marginPct.toFixed(2)),
            isFirewallViolated: false, 
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

// التصدير الخاص ببيئة السيرفر (Node.js) 
module.exports = Object.freeze(FinancialEngineDef);