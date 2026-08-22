// ============================================================================
// 💰 المحرك المالي المركزي (Cloud & Server Edition) - النسخة الاستراتيجية V19.0.0 👑
// 🎯 الوظيفة: الحساب المالي السيادي، حماية الأرباح، وتطبيق سياسات التسويق بذكاء.
// 🚀 التحديثات (V19.0.0 - Enterprise Core): 
// 1. Custom Security Exceptions: فئة أخطاء مخصصة للتعامل الذكي مع الواجهة ومنع الـ Internal Errors.
// 2. Strict Option Validation: الرفض القاطع (Throw Error) لأي محاولة تلاعب بخيارات المنتجات.
// 3. Precision Sync: توحيد دالة التقريب مع المتغير المركزي لتتطابق مع الواجهة 100%.
// 4. Global Failsafe Cap: شبكة أمان تمنع وصول الخصم لـ 100% في حال أخطأت الإدارة.
// 5. Safe Margin Lock: حماية سعر التكلفة + 5% لضمان تغطية رسوم بوابات الدفع.
// ============================================================================

// 🛡️ فئة الأخطاء المخصصة لتتناغم مع مترجم الأخطاء في الخادم (index.js)
class FinancialSecurityError extends Error {
    constructor(message) {
        super(`[SECURITY] ${message}`);
        this.name = "FinancialSecurityError";
    }
}

const FinancialEngineDef = {
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        MAX_QTY_LIMIT: 10000,
        MAX_PRICE_LIMIT: 1000000, // سقف آمن لمنع التلاعب الرياضي (Overflow)
        PRECISION: 4,          
        INTERNAL_PRECISION: 8, 
        MIN_SALE_PRICE: 0.01,
        
        // 🛡️ دروع حماية رأس المال والأخطاء البشرية
        MIN_MARGIN_PERCENT: 5,        // يجب بقاء 5% ربح كحد أدنى فوق التكلفة
        MAX_GLOBAL_DISCOUNT_PCT: 95   // شبكة أمان: يمنع أي خصم من تجاوز 95% 
    }),

    // ========================================================================
    // 🧮 القسم الأول: محرك الرياضيات الدقيق (Precision Math Core)
    // ========================================================================

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
        if (numB === 0) throw new FinancialSecurityError("Division by zero detected! محاولة قسمة على صفر.");
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
            if (numPrice === 0 || numDep === 0) throw new FinancialSecurityError(`Invalid exchange rate (Zero) for currency: ${code}`);
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
                if (code && code !== FinancialEngineDef.CONFIG.BASE_CURRENCY) processRateObj(code, raw.priceRate || raw.value, raw.depRate || raw.value);
            } else {
                const invalidKeys = ['ISBASE', 'PRICERATE', 'DEPRATE', 'CODE', 'VALUE', 'SYMBOL', 'NAME'];
                for (const [key, value] of Object.entries(raw)) {
                    const code = String(key).toUpperCase();
                    if (code !== FinancialEngineDef.CONFIG.BASE_CURRENCY && !invalidKeys.includes(code)) {
                        if (typeof value === 'object' && value !== null) processRateObj(code, value.priceRate || value.value, value.depRate || value.value);
                        else processRateObj(code, value, value);
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
        if (!ratesMap[fCode] || !ratesMap[tCode]) throw new FinancialSecurityError("Missing exchange rate for conversion.");
        
        const fRate = channel === 'deposit' ? ratesMap[fCode].depRate : ratesMap[fCode].priceRate;
        const tRate = channel === 'deposit' ? ratesMap[tCode].depRate : ratesMap[tCode].priceRate;
        if (fRate === 0 || tRate === 0) throw new FinancialSecurityError("Invalid exchange rate (Zero) detected during conversion.");

        return FinancialEngineDef._preciseRound(FinancialEngineDef._internalMul(FinancialEngineDef._internalDiv(amt, fRate), tRate));
    },

    convertViaUSDHelper: function(amt, f, t, rates, rnd = 'round', c = 'pricing') {
        let v = FinancialEngineDef.convertViaUSD(amt, f, t, rates, c);
        const factor = Math.pow(10, FinancialEngineDef.CONFIG.PRECISION);
        if(rnd === 'floor') return Math.floor((v + Number.EPSILON) * factor) / factor;
        if(rnd === 'ceil')  return Math.ceil((v - Number.EPSILON) * factor) / factor;
        return Number(v.toFixed(FinancialEngineDef.CONFIG.PRECISION));
    },

    // ========================================================================
    // 💼 القسم الثاني: محاكاة التسعير والجدار الناري (Business Logic & Firewall)
    // ========================================================================

    validateCoupon: function(code, prod, qty, optIdx, user, userTier, coupons = [], now = Date.now(), offer = null) {
        if (!code) return { valid: false, msg: 'لم يتم تقديم كود خصم' };
        
        // 🛡️ درع منع الازدواجية (Anti-Stacking Policy)
        if (offer && typeof offer === 'object' && offer.isActive !== false && offer.type !== 'fake') {
            return { valid: false, msg: 'عذراً، لا يمكن استخدام الكوبونات على المنتجات الخاضعة لعروض التخفيض' };
        }

        const cp = coupons.find(c => c.code.toUpperCase() === code.toUpperCase());
        if (!cp) return { valid: false, msg: 'كوبون غير صحيح' };
        if (cp.isActive === false) return { valid: false, msg: 'الكوبون غير مفعل' };
        
        // 🛡️ حماية المنتجات المستثناة
        const isCouponDisabled = (prod.disableCoupons === true || String(prod.disableCoupons).toLowerCase() === 'true');
        if (isCouponDisabled) return { valid: false, msg: 'عذراً، هذا المنتج لا يدعم استخدام الكوبونات' }; 

        const expiryMs = cp.expiryDate ? new Date(cp.expiryDate).getTime() : 0;
        if (expiryMs > 0 && now > expiryMs) return { valid: false, msg: 'انتهت صلاحية الكوبون' };
        if (Number(cp.maxUses) > 0 && Number(cp.usedCount || 0) >= Number(cp.maxUses)) return { valid: false, msg: 'استنفد الكوبون الحد الأقصى للاستخدام' };
        if (cp.targetTiers?.length > 0 && !cp.targetTiers.includes(String(userTier?.id))) return { valid: false, msg: 'الكوبون غير متاح لمستوى حسابك' };
        if (cp.targetProds?.length > 0) {
    const isProdMatched = cp.targetProds.includes(String(prod.id));
    let isCatMatched = false;
    
    if (Array.isArray(prod.catId)) {
        isCatMatched = prod.catId.some(cid => cp.targetProds.includes(String(cid)));
    } else if (Array.isArray(prod.categoryIds)) {
        isCatMatched = prod.categoryIds.some(cid => cp.targetProds.includes(String(cid)));
    } else {
        isCatMatched = cp.targetProds.includes(String(prod.catId)) || cp.targetProds.includes(String(prod.categoryId)) || cp.targetProds.includes(String(prod.category_id));
    }
    
    if (!isProdMatched && !isCatMatched) {
        return { valid: false, msg: 'الكوبون غير مخصص لهذا المنتج' };
    }
}

if (cp.allowedUsers?.length > 0 && !cp.allowedUsers.some(u => String(u) === String(user?.uid || user?.id))) {
    return { valid: false, msg: 'غير مسموح لك باستخدام هذا الكوبون' };
}        
        // 🛡️ الحد الأدنى للطلب (Minimum Order Value)
        if (Number(cp.minOrder) > 0) {
            const tempPrice = FinancialEngineDef.calculateOrderTotal({ product: prod, tier: userTier, optIdx, offer: null }, qty);
            if (tempPrice.totalFinalPrice < Number(cp.minOrder)) return { valid: false, msg: `الحد الأدنى لاستخدام الكوبون هو ${cp.minOrder}$` };
        }
        
        return { valid: true, coupon: { code: cp.code, type: cp.type, value: cp.value, maxDiscount: cp.maxDiscount, isActive: cp.isActive } };
    },

    calculatePrice: function(rawParams) {
        const params = rawParams || {};
        const { product, tier, offer, coupon, optIdx } = params;
        if (!product || typeof product !== 'object') throw new FinancialSecurityError("Missing Product Data.");

        let cost = FinancialEngineDef.extractNum(product.costPrice || product.cost_price || 0);
        let isFixed = (String(product.isFixedPrice).toLowerCase() === 'true');
        let activeOption = null;

        // 🛡️ الإغلاق الأمني الصارم لخيارات المنتجات
        if (product.type === 'select' && Array.isArray(product.options) && product.options.length > 0) {
            const index = Number(optIdx);
            if (Number.isInteger(index) && index >= 0 && index < product.options.length) {
                activeOption = product.options[index];
                cost = FinancialEngineDef.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
                if (activeOption.isFixedPrice !== undefined) isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
            } else {
                throw new FinancialSecurityError(`الخيار المحدد غير صالح للمنتج (${product.id}).`);
            }
        }
        
        if (cost > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) throw new FinancialSecurityError("Cost exceeds maximum safety limit.");

        let baseSellingPrice = 0;
        let standardPrice = activeOption ? FinancialEngineDef.extractNum(activeOption.price || product.price) : FinancialEngineDef.extractNum(product.price);

        if (isFixed) {
            baseSellingPrice = activeOption ? FinancialEngineDef.extractNum(activeOption.fixedPriceUsd || activeOption.price || product.fixedPriceUsd || product.price) : FinancialEngineDef.extractNum(product.fixedPriceUsd || product.fixed_price_usd || product.price);
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

        if (baseSellingPrice > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) throw new FinancialSecurityError("Selling price exceeds maximum safety limit.");

        const originalPrice = baseSellingPrice;
        let currentPrice = originalPrice;
        const allowsDiscounts = !isFixed; 

        // 1. تطبيق الخصم الترويجي (Offer)
        let offerName = null, offerDiscount = 0;
        if (allowsDiscounts && offer && typeof offer === 'object' && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name || null;
            const offerVal = FinancialEngineDef._preciseRound(FinancialEngineDef.extractNum(offer.value), FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
            
            let calculatedOfferDiscount = 0;
            if (offer.type === 'percentage') {
                const offerValDec = FinancialEngineDef._internalDiv(offerVal, 100);
                calculatedOfferDiscount = FinancialEngineDef._internalMul(originalPrice, offerValDec);
            } else {
                calculatedOfferDiscount = offerVal;
            }

            // 🛡️ Failsafe: لا تسمح للعرض بتجاوز نسبة الأمان العالمية
            const maxGlobalOfferCap = FinancialEngineDef._internalMul(originalPrice, FinancialEngineDef._internalDiv(FinancialEngineDef.CONFIG.MAX_GLOBAL_DISCOUNT_PCT, 100));
            offerDiscount = Math.min(calculatedOfferDiscount, currentPrice, maxGlobalOfferCap);
            
            currentPrice = FinancialEngineDef._internalSub(currentPrice, offerDiscount);
        }

        // 2. تطبيق الكوبون بذكاء تجاري (Max Discount Cap)
        let couponCode = null, couponDiscount = 0;
        const isCouponDisabled = (product.disableCoupons === true || String(product.disableCoupons).toLowerCase() === 'true');
        
        // 🛡️ درع الـ Anti-Stacking
        const canUseCoupon = allowsDiscounts && !isCouponDisabled && offerDiscount === 0; 
        
        if (canUseCoupon && coupon && typeof coupon === 'object' && coupon.isActive !== false) {
            couponCode = coupon.code || null;
            const coupVal = FinancialEngineDef._preciseRound(FinancialEngineDef.extractNum(coupon.value), FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
            let calculatedDiscount = 0;

            if (coupon.type === 'percentage') {
                const coupValDec = FinancialEngineDef._internalDiv(coupVal, 100);
                calculatedDiscount = FinancialEngineDef._internalMul(currentPrice, coupValDec);
            } else {
                calculatedDiscount = coupVal;
            }
            
            const maxCap = FinancialEngineDef.extractNum(coupon.maxDiscount);
            if (maxCap > 0) calculatedDiscount = Math.min(calculatedDiscount, maxCap);

            // 🛡️ Failsafe: شبكة الأمان العالمية للكوبونات
            const maxGlobalCouponCap = FinancialEngineDef._internalMul(currentPrice, FinancialEngineDef._internalDiv(FinancialEngineDef.CONFIG.MAX_GLOBAL_DISCOUNT_PCT, 100));
            couponDiscount = Math.min(calculatedDiscount, currentPrice, maxGlobalCouponCap);
        }
        
        currentPrice = Math.max(FinancialEngineDef.CONFIG.MIN_SALE_PRICE, FinancialEngineDef._internalSub(currentPrice, couponDiscount));
        
        // 🛑 الجدار الناري المتقدم (Graceful Firewall)
        let isFirewallViolated = false;
        let rejectionReason = null;

        if (cost > 0) {
            const minRequiredProfit = FinancialEngineDef._internalMul(cost, FinancialEngineDef._internalDiv(FinancialEngineDef.CONFIG.MIN_MARGIN_PERCENT, 100));
            const safeMarginPrice = FinancialEngineDef._internalAdd(cost, minRequiredProfit);
            
            if (currentPrice < safeMarginPrice) {
                isFirewallViolated = true;
                rejectionReason = `السعر النهائي (${currentPrice}$) يكسر حاجز الربح الآمن (${safeMarginPrice}$). العملية مرفوضة لحماية رأس المال!`;
            }
        }

        const profit = Math.max(0, FinancialEngineDef._internalSub(currentPrice, cost));
        let marginPct = currentPrice > 0 ? FinancialEngineDef._internalMul(FinancialEngineDef._internalDiv(profit, currentPrice), 100) : 0;

        return {
            costUsd: FinancialEngineDef._preciseRound(cost), originalPrice: FinancialEngineDef._preciseRound(originalPrice),
            finalPrice: FinancialEngineDef._preciseRound(currentPrice), offerName: offerName || null,
            offerDiscount: FinancialEngineDef._preciseRound(offerDiscount), couponCode: couponCode || null,
            couponDiscount: FinancialEngineDef._preciseRound(couponDiscount),
            totalDiscount: FinancialEngineDef._preciseRound(FinancialEngineDef._internalSub(originalPrice, currentPrice)),
            netProfitUsd: FinancialEngineDef._preciseRound(profit), marginPct: Number(marginPct.toFixed(2)),
            isFirewallViolated, rejectionReason, tierName: tier?.name || (isFixed ? 'Fixed Price' : 'Standard')
        };
    },
    
    calculateOrderTotal: function(params, rawQty) {
        let qty = Math.floor(FinancialEngineDef.extractNum(rawQty));
        if (qty <= 0) qty = 1;
        if (qty > FinancialEngineDef.CONFIG.MAX_QTY_LIMIT) throw new FinancialSecurityError("الكمية المطلوبة تتجاوز الحد الأقصى المسموح به.");
        
        const unit = FinancialEngineDef.calculatePrice(params);
        return {
            ...unit, qty, totalCostUsd: FinancialEngineDef.safeMul(unit.costUsd, qty),
            totalOriginalPrice: FinancialEngineDef.safeMul(unit.originalPrice, qty),
            totalFinalPrice: FinancialEngineDef.safeMul(unit.finalPrice, qty),
            totalNetProfitUsd: FinancialEngineDef.safeMul(unit.netProfitUsd, qty),
            totalDiscount: FinancialEngineDef.safeMul(unit.totalDiscount, qty)
        };
    }
};

// 🛡️ تجميد الكائن بالكامل لحمايته من أي تعديل خارجي أثناء التشغيل
module.exports = Object.freeze(FinancialEngineDef);
