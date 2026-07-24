// ============================================================================
// 💰 المحرك المالي المركزي (Cloud & Client Version) - النسخة الماسية المطلقة V14 👑
// 🎯 الوظيفة: الحساب المالي السيادي، حماية الأرباح، التطابق مع الواجهة
// 🚀 التحديثات المعمارية: 
// 1. Destructuring-Safe (إزالة this لمنع انهيار السيرفر)
// 2. Bank-Grade Precision (إضافة Number.EPSILON للتقريب البنكي)
// 3. Null-Pointer Protection (حماية المدخلات من الانهيار)
// 4. [جديد] Zero-Cost Exploit Protection (حماية الكوبونات للمنتجات الصفرية التكلفة)
// 5. [جديد] Missing Currency Firewall (حظر التحويل عند غياب سعر الصرف)
// ============================================================================

const FinancialEngineDef = {

    // 🔒 تجميد الكائن الداخلي لحماية الدقة الرياضية
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        MAX_QTY_LIMIT: 10000,    
        MAX_PRICE_LIMIT: 100000, 
        PRECISION: 10000,        // 4 خانات عشرية للدقة المطلقة
        MIN_SALE_PRICE: 0.01     // الحد الأدنى للبيع (يمنع سرقة المنتجات بـ 0$ عبر الكوبونات)
    }),

    // 🛡️ تقريب بنكي دقيق مع Number.EPSILON
    safeAdd: function(a, b) {
        return Math.round(( (Number(a) || 0) + (Number(b) || 0) + Number.EPSILON ) * FinancialEngineDef.CONFIG.PRECISION) / FinancialEngineDef.CONFIG.PRECISION;
    },
    safeSub: function(a, b) {
        return Math.round(( (Number(a) || 0) - (Number(b) || 0) + Number.EPSILON ) * FinancialEngineDef.CONFIG.PRECISION) / FinancialEngineDef.CONFIG.PRECISION;
    },
    safeMul: function(a, b) {
        return Math.round(( (Number(a) || 0) * (Number(b) || 0) + Number.EPSILON ) * FinancialEngineDef.CONFIG.PRECISION) / FinancialEngineDef.CONFIG.PRECISION;
    },
    safeDiv: function(a, b) {
        const numA = Number(a) || 0;
        let numB = Number(b);
        if (isNaN(numB) || numB === 0) numB = 1;
        return Math.round(( (numA / numB) + Number.EPSILON ) * FinancialEngineDef.CONFIG.PRECISION) / FinancialEngineDef.CONFIG.PRECISION;
    },

    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '' || Array.isArray(val) || typeof val === 'object') return 0;
        const num = Number(val);
        if (isNaN(num) || num < 0) return 0; // 🛡️ منع الأسعار والخصومات السالبة تماماً
        if (!allowZero && num === 0) return 1;
        return num;
    },

    normalizeRates: function(rawArray) {
        const ratesMap = {};
        ratesMap[FinancialEngineDef.CONFIG.BASE_CURRENCY] = { code: FinancialEngineDef.CONFIG.BASE_CURRENCY, priceRate: 1, depRate: 1, isBase: true };

        if (Array.isArray(rawArray)) {
            for (const rate of rawArray) {
                if (rate && rate.code && rate.code !== FinancialEngineDef.CONFIG.BASE_CURRENCY) {
                    const code = String(rate.code).toUpperCase();
                    ratesMap[code] = {
                        code: code,
                        priceRate: FinancialEngineDef.extractNum(rate.priceRate, false),
                        depRate: FinancialEngineDef.extractNum(rate.depRate, false)
                    };
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
        
        // 🛡️ [إصلاح أمني]: حظر العملية فوراً إذا كانت العملة غير موجودة في قاعدة البيانات (منع البيع الوهمي)
        if (!ratesMap[fCode]) throw new Error(`[SECURITY] Missing exchange rate for currency: ${fCode}`);
        if (!ratesMap[tCode]) throw new Error(`[SECURITY] Missing exchange rate for currency: ${tCode}`);

        const from = ratesMap[fCode];
        const to = ratesMap[tCode];

        const fRate = channel === 'deposit' ? from.depRate : from.priceRate;
        const tRate = channel === 'deposit' ? to.depRate : to.priceRate;

        return FinancialEngineDef.safeMul(FinancialEngineDef.safeDiv(amt, fRate), tRate);
    },

    calculatePrice: function(rawParams) {
        // 🛡️ حماية ضد الـ Null Pointer
        const params = rawParams || {};
        const { product, tier, offer, coupon, optIdx } = params;

        if (!product || typeof product !== 'object') throw new Error("FinancialEngine: Missing Product Data");

        let cost = FinancialEngineDef.extractNum(product.costPrice || product.cost_price || 0);
        let isFixed = (String(product.isFixedPrice).toLowerCase() === 'true');
        let activeOption = null;

        // 🛡️ استخراج سعر الخيار إن وجد
        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null && optIdx !== undefined) {
            activeOption = product.options[optIdx];
            if (activeOption) {
                cost = FinancialEngineDef.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
                if (activeOption.isFixedPrice !== undefined) isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
            }
        }

        if (cost > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) {
            throw new Error(`[SECURITY] Cost price exceeds system limits. Operation aborted.`);
        }

        let baseSellingPrice = 0;

        // 🧮 حساب السعر الأساسي
        if (isFixed) {
            baseSellingPrice = activeOption ? FinancialEngineDef.extractNum(activeOption.fixedPriceUsd || activeOption.price) : FinancialEngineDef.extractNum(product.fixedPriceUsd || product.fixed_price_usd);
        } else if (tier && typeof tier === 'object') {
            const tierPriceField = activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id];
            if (tierPriceField !== undefined && tierPriceField !== null) {
                baseSellingPrice = FinancialEngineDef.extractNum(tierPriceField);
            } else {
                const costForMath = cost > 0 ? cost : FinancialEngineDef.extractNum(activeOption?.price || product.price);
                const profitPercent = FinancialEngineDef.extractNum(tier.profitPercent || tier.profit_percent);
                const minProfitUsd = FinancialEngineDef.extractNum(tier.minProfitUsd || tier.min_profit_usd);
                
                const profitPercentDec = FinancialEngineDef.safeDiv(profitPercent, 100);
                let profitAdded = FinancialEngineDef.safeMul(costForMath, profitPercentDec);
                
                if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
                baseSellingPrice = FinancialEngineDef.safeAdd(costForMath, profitAdded);
            }
        } else {
            baseSellingPrice = FinancialEngineDef.extractNum(activeOption?.price || product.price);
        }

        if (baseSellingPrice > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) {
            throw new Error(`[SECURITY] Selling price exceeds system limits. Operation aborted.`);
        }

        const originalPrice = baseSellingPrice;
        let currentPrice = originalPrice;
        
        // ========================================================
        // 🚀 تطبيق الخصم المتسلسل (العروض ثم الكوبونات)
        // ========================================================
        const allowsDiscounts = !isFixed; 

        // 1. خصم العرض الترويجي
        let offerName = null, offerDiscount = 0;
        if (allowsDiscounts && offer && typeof offer === 'object' && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name || null; 
            const offerVal = FinancialEngineDef.extractNum(offer.value);
            const offerValDec = FinancialEngineDef.safeDiv(offerVal, 100);
            offerDiscount = offer.type === 'percentage' ? FinancialEngineDef.safeMul(originalPrice, offerValDec) : offerVal;
        }

        currentPrice = FinancialEngineDef.safeSub(currentPrice, offerDiscount);

        // 2. خصم الكوبون
        let couponCode = null, couponDiscount = 0;
        const canUseCoupon = allowsDiscounts && product.disableCoupons !== true;
        
        if (canUseCoupon && coupon && typeof coupon === 'object' && coupon.isActive !== false) {
            couponCode = coupon.code || null; 
            const coupVal = FinancialEngineDef.extractNum(coupon.value);
            const coupValDec = FinancialEngineDef.safeDiv(coupVal, 100);
            couponDiscount = coupon.type === 'percentage' ? FinancialEngineDef.safeMul(currentPrice, coupValDec) : coupVal;
        }

        currentPrice = FinancialEngineDef.safeSub(currentPrice, couponDiscount);

        let isFirewallViolated = false;

        // 🛑 الجدار الناري المطور:
        if (currentPrice < 0) {
            isFirewallViolated = true;
            currentPrice = 0;
        }

        // 🛡️ [إصلاح أمني]: منع سرقة المنتجات صفرية التكلفة (Zero-Cost Exploit)
        // إذا كان سعر المنتج الأساسي أكبر من 0، لا يمكن للكوبونات أن تجعله 0 (إلا إذا كان مجانياً بالأصل)
        if (originalPrice > 0 && currentPrice < FinancialEngineDef.CONFIG.MIN_SALE_PRICE) {
            isFirewallViolated = true;
            currentPrice = Math.max(cost, FinancialEngineDef.CONFIG.MIN_SALE_PRICE);
        } 
        // حماية رأس المال للمنتجات التي لها تكلفة فعلية
        else if (cost > 0 && currentPrice < cost) {
            isFirewallViolated = true;
            currentPrice = cost; 
        }

        const profit = Math.max(0, FinancialEngineDef.safeSub(currentPrice, cost));
        const marginPct = cost > 0 ? FinancialEngineDef.safeMul(FinancialEngineDef.safeDiv(profit, cost), 100) : 0;

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
        
        if (qty > FinancialEngineDef.CONFIG.MAX_QTY_LIMIT) {
            throw new Error(`[SECURITY] Requested quantity (${qty}) exceeds maximum allowed per order.`);
        }
        
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

// تجميد الكائن كاملاً لمنع التلاعب به أثناء الـ Runtime
module.exports = Object.freeze(FinancialEngineDef);
