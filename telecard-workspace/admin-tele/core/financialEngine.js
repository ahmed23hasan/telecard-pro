// ============================================================================
// 💰 المحرك المالي المركزي (Admin Edition) - النسخة الموحدة V24.0.0 💎 (The Oracle)
// 🎯 الوظيفة: محاكاة أسعار السيرفر بدقة 100%، كشف الأرباح، وتشخيص الأخطاء بشفافية للمدير.
// 🚀 التحديثات: مطابقة تامة لمعمارية السيرفر (Math Parity, Type Safety, Absolute Discount Cap).
// ============================================================================

export class FinancialSecurityError extends Error { 
    constructor(message) {
        super(`[SECURITY] ${message}`); 
        this.name = "FinancialSecurityError"; 
    } 
}

const FinancialEngineDef = { 
    CONFIG: Object.freeze({ 
        BASE_CURRENCY: 'USD',
        MAX_QTY_LIMIT: 10000, 
        MAX_PRICE_LIMIT: 1000000, 
        PRECISION: 4,
        INTERNAL_PRECISION: 8, 
        MIN_SALE_PRICE: 0.01, 
        MIN_MARGIN_PERCENT: 5,
        MAX_GLOBAL_DISCOUNT_PCT: 95
    }),

    // ========================================================================
    // 🧮 القسم الأول: محرك الرياضيات الموحد (Unified Core Math)
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
        if (numB === 0) throw new FinancialSecurityError("محاولة قسمة على صفر! يرجى مراجعة أسعار الصرف.");
        return FinancialEngineDef._preciseRound((Number(a) || 0) / numB, FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
    },

    safeAdd: function(a, b) { return FinancialEngineDef._preciseRound(FinancialEngineDef._internalAdd(a, b)); },
    // 🛠️ تم التوحيد الرياضي: إرجاع القيمة الحقيقية (حتى لو سالبة) للمطابقة مع السيرفر
    safeSub: function(a, b) { return FinancialEngineDef._preciseRound(FinancialEngineDef._internalSub(a, b)); },
    safeMul: function(a, b) { return FinancialEngineDef._preciseRound(FinancialEngineDef._internalMul(a, b)); },
    safeDiv: function(a, b) { return FinancialEngineDef._preciseRound(FinancialEngineDef._internalDiv(a, b)); },

    // 🛠️ الصرامة المطلقة في استخراج الأرقام (Type Safety)
    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '' || Array.isArray(val) || typeof val === 'object') return 0;
        const num = Number(val);
        if (isNaN(num) || num < 0) return 0;
        if (!allowZero && num === 0) return 1;
        return num;
    },

    normalizeRates: function(raw) {
        const ratesMap = {};
        ratesMap[FinancialEngineDef.CONFIG.BASE_CURRENCY] = { code: FinancialEngineDef.CONFIG.BASE_CURRENCY, symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true };
        
        const processRateObj = (code, priceR, depR) => {
            const numPrice = FinancialEngineDef.extractNum(priceR);
            const numDep = FinancialEngineDef.extractNum(depR);
            if (numPrice === 0 || numDep === 0) throw new FinancialSecurityError(`سعر الصرف معدوم (Zero) للعملة: ${code}`);
            ratesMap[code] = { code: code, priceRate: numPrice, depRate: numDep };
        };

        if (Array.isArray(raw)) {
            for (const rate of raw) {
                if (rate && rate.code && rate.code !== FinancialEngineDef.CONFIG.BASE_CURRENCY) {
                    processRateObj(String(rate.code).toUpperCase(), rate.priceRate || rate.value, rate.depRate || rate.value);
                }
            }
        } else if (raw && typeof raw === 'object') {
            const invalidKeys = ['ISBASE', 'PRICERATE', 'DEPRATE', 'CODE', 'VALUE', 'SYMBOL', 'NAME'];
            for (const [key, value] of Object.entries(raw)) {
                if (typeof value !== 'object' && !invalidKeys.includes(key.toUpperCase())) continue;
                const code = String(value.code || key).toUpperCase();
                if (code && code !== FinancialEngineDef.CONFIG.BASE_CURRENCY && !invalidKeys.includes(code)) {
                    processRateObj(code, value.priceRate || value.value, value.depRate || value.value);
                }
            }
        }
        return ratesMap;
    },

    convertViaUSD: function(amount, fromCode, toCode, ratesRaw, channel = 'pricing') {
        const amt = FinancialEngineDef.extractNum(amount);
        const fCode = String(fromCode || FinancialEngineDef.CONFIG.BASE_CURRENCY).toUpperCase();
        const tCode = String(toCode || FinancialEngineDef.CONFIG.BASE_CURRENCY).toUpperCase();
        if (amt === 0 || fCode === tCode) return amt;
        
        const ratesMap = FinancialEngineDef.normalizeRates(ratesRaw);
        if (!ratesMap[fCode] || !ratesMap[tCode]) throw new FinancialSecurityError(`سعر الصرف مفقود للتحويل بين ${fCode} و ${tCode}`);
        
        const fRate = channel === 'deposit' ? ratesMap[fCode].depRate : ratesMap[fCode].priceRate;
        const tRate = channel === 'deposit' ? ratesMap[tCode].depRate : ratesMap[tCode].priceRate;
        
        if (fRate === 0 || tRate === 0) throw new FinancialSecurityError("تم اكتشاف سعر صرف بقيمة صفر أثناء التحويل.");
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
    // 💼 القسم الثاني: محاكاة التسعير والجدار الناري الصريح (Honest Simulator)
    // ========================================================================

    validateCoupon: function(code, prod, qty, optIdx, user, userTier, coupons = [], now = Date.now(), offer = null) {
        if (!code) return { valid: false, msg: 'لم يتم إدخال كود' };
        
        if (offer && typeof offer === 'object' && offer.isActive !== false && offer.type !== 'fake') {
            return { valid: false, msg: 'عذراً، لا يمكن استخدام الكوبونات مع العروض الترويجية' };
        }

        const cp = coupons.find(c => c.code.toUpperCase() === code.toUpperCase());
        if (!cp) return { valid: false, msg: 'كوبون غير صحيح' };
        if (cp.isActive === false) return { valid: false, msg: 'الكوبون غير مفعل' };
        
        if (prod.disableCoupons === true || String(prod.disableCoupons).toLowerCase() === 'true') { 
            return { valid: false, msg: 'عذراً، هذا المنتج لا يدعم استخدام الكوبونات' }; 
        }
        
        let expiryMs = 0;
        if (cp.expiryDate) {
            expiryMs = typeof cp.expiryDate.toMillis === 'function' 
                ? cp.expiryDate.toMillis() 
                : new Date(cp.expiryDate).getTime();
        }

        if (expiryMs > 0 && now > expiryMs) return { valid: false, msg: 'انتهت صلاحية الكوبون' };
        
        if (Number(cp.maxUses) > 0 && Number(cp.usedCount || 0) >= Number(cp.maxUses)) return { valid: false, msg: 'استنفد الحد الأقصى للاستخدام' };
        if (cp.targetTiers?.length > 0 && !cp.targetTiers.includes(String(userTier?.id))) return { valid: false, msg: 'غير متاح لهذا المستوى' };
        
        const isProdMatched = cp.targetProds?.length > 0 ? cp.targetProds.includes(String(prod.id)) : true;
        let isCatMatched = true;

        if (cp.targetCategories?.length > 0) {
            const prodCats = [].concat(prod.catId, prod.categoryIds, prod.categoryId, prod.category_id).filter(Boolean).map(String);
            isCatMatched = cp.targetCategories.some(cid => prodCats.includes(cid));
        }

        if (cp.targetProds?.length > 0 || cp.targetCategories?.length > 0) {
            if (!isProdMatched && !isCatMatched) return { valid: false, msg: 'الكوبون غير مخصص لهذا المنتج أو القسم' };
        }

        if (cp.allowedUsers?.length > 0 && !cp.allowedUsers.some(u => String(u) === String(user?.uid || user?.id))) {
            return { valid: false, msg: 'غير مسموح لهذا المستخدم' };
        }        
        
        if (Number(cp.minOrder) > 0) {
            const tempPrice = FinancialEngineDef.calculateOrderTotal({ product: prod, tier: userTier, optIdx, offer: null }, qty);
            if (tempPrice.totalFinalPrice < Number(cp.minOrder)) return { valid: false, msg: `الحد الأدنى لاستخدام الكوبون هو ${cp.minOrder}$` };
        }
        
        return { valid: true, coupon: { code: cp.code, type: cp.type, value: cp.value, maxDiscount: cp.maxDiscount, isActive: cp.isActive } };
    },

    calculatePrice: function(params = {}) {
        const { product = {}, costPrice = 0, fixedPrice = 0, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        if (!product || typeof product !== 'object' || Object.keys(product).length === 0) {
            return { costUsd: 0, tierPrice: 0, originalPrice: 0, finalPrice: 0, tierName: 'غير محدد', offerDiscount: 0, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallViolated: true, rejectionReason: "بيانات المنتج مفقودة" };
        }

        let cost = FinancialEngineDef.extractNum(costPrice || product.costPrice || product.cost_price || 0);
        let isFixed = (fixedPrice > 0) || (String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);
        let activeOption = null;

        if (product.type === 'select' && Array.isArray(product.options) && product.options.length > 0) {
            const index = Number(optIdx);
            if (Number.isInteger(index) && index >= 0 && index < product.options.length) {
                activeOption = product.options[index];
                cost = FinancialEngineDef.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
                if (activeOption.isFixedPrice !== undefined) isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
            } else {
                throw new FinancialSecurityError(`الـ Index الممرر للخيارات (${optIdx}) غير صالح! السيرفر سيرفض هذا الطلب.`);
            }
        }
        
        if (cost > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) throw new FinancialSecurityError("تجاوز سعر التكلفة الحد الأقصى الآمن.");

        let currentPrice = activeOption ? FinancialEngineDef.extractNum(activeOption.price || product.price) : FinancialEngineDef.extractNum(product.price);
        let tierName = "عضو";

        if (isFixed) {
            currentPrice = activeOption ? FinancialEngineDef.extractNum(activeOption.fixedPriceUsd || activeOption.price || product.price) : FinancialEngineDef.extractNum(fixedPrice || product.fixedPriceUsd || product.price);
            tierName = "سعر ثابت";
        } else if (tier && typeof tier === 'object') {
            tierName = tier.nameAr || tier.name || tier.id || 'عضو';
            const tierPriceField = activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id];
            
            if (tierPriceField !== undefined && tierPriceField !== null) {
                currentPrice = FinancialEngineDef.extractNum(tierPriceField);
            } else {
                const profitPercent = FinancialEngineDef.extractNum(tier.profitPercent || tier.profit_percent);
                const minProfitUsd = FinancialEngineDef.extractNum(tier.minProfitUsd || tier.min_profit_usd);
                if (cost > 0 && (profitPercent > 0 || minProfitUsd > 0)) {
                    let profitAdded = FinancialEngineDef._internalMul(cost, FinancialEngineDef._internalDiv(profitPercent, 100));
                    currentPrice = FinancialEngineDef._internalAdd(cost, Math.max(profitAdded, minProfitUsd));
                }
            }
        }

        if (currentPrice > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) throw new FinancialSecurityError("تجاوز سعر البيع الحد الأقصى الآمن.");

        const tierPrice = currentPrice;
        const originalPrice = tierPrice;
        const allowsDiscounts = !isFixed;

        let offerName = null, offerDiscount = 0, couponCode = null, couponDiscount = 0;
        
        const absoluteMaxDiscountAllowable = FinancialEngineDef._internalMul(originalPrice, FinancialEngineDef._internalDiv(FinancialEngineDef.CONFIG.MAX_GLOBAL_DISCOUNT_PCT, 100));
        let accumulatedDiscount = 0;

        if (allowsDiscounts && offer && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name;
            const offerVal = FinancialEngineDef.extractNum(offer.value);
            let rawOfferDisc = offer.type === 'percentage' ? FinancialEngineDef._internalMul(originalPrice, FinancialEngineDef._internalDiv(offerVal, 100)) : offerVal;
            
            offerDiscount = Math.min(rawOfferDisc, absoluteMaxDiscountAllowable);
            accumulatedDiscount = FinancialEngineDef._internalAdd(accumulatedDiscount, offerDiscount);
        }

        const isCouponDisabled = (product.disableCoupons === true || String(product.disableCoupons).toLowerCase() === 'true');
        if (allowsDiscounts && !isCouponDisabled && offerDiscount === 0 && coupon && coupon.isActive !== false) {
            couponCode = coupon.code;
            const coupVal = FinancialEngineDef.extractNum(coupon.value);
            
            let rawCouponDisc = coupon.type === 'percentage' ? FinancialEngineDef._internalMul(originalPrice, FinancialEngineDef._internalDiv(coupVal, 100)) : coupVal;
            const maxCap = FinancialEngineDef.extractNum(coupon.maxDiscount);
            if (maxCap > 0) rawCouponDisc = Math.min(rawCouponDisc, maxCap);

            const remainingDiscountCapacity = Math.max(0, FinancialEngineDef._internalSub(absoluteMaxDiscountAllowable, accumulatedDiscount));
            couponDiscount = Math.min(rawCouponDisc, remainingDiscountCapacity);
            accumulatedDiscount = FinancialEngineDef._internalAdd(accumulatedDiscount, couponDiscount);
        }
        
        currentPrice = Math.max(FinancialEngineDef.CONFIG.MIN_SALE_PRICE, FinancialEngineDef._internalSub(originalPrice, accumulatedDiscount));

        let isFirewallViolated = false;
        let rejectionReason = null;

        if (cost > 0) {
            const safeMarginPrice = FinancialEngineDef._internalAdd(cost, FinancialEngineDef._internalMul(cost, FinancialEngineDef._internalDiv(FinancialEngineDef.CONFIG.MIN_MARGIN_PERCENT, 100)));
            if (currentPrice < safeMarginPrice) {
                isFirewallViolated = true;
                rejectionReason = `السعر النهائي (${currentPrice}$) يكسر حاجز الربح الآمن (${safeMarginPrice}$). السيرفر سيرفض هذه العملية حمايةً للأرباح!`;
            }
        }

        const finalPrice = currentPrice;
        // هنا نستخدم Math.max لمنع أن تكون الأرباح بالسالب (لأن الطرح الرياضي الأساسي تم توحيده)
        const netProfitUsd = Math.max(0, FinancialEngineDef._internalSub(finalPrice, cost)); 
        let marginPct = finalPrice > 0 ? FinancialEngineDef._internalMul(FinancialEngineDef._internalDiv(netProfitUsd, finalPrice), 100) : 0;

        return {
            costUsd: FinancialEngineDef._preciseRound(cost),
            tierPrice: FinancialEngineDef._preciseRound(tierPrice), 
            originalPrice: FinancialEngineDef._preciseRound(originalPrice), 
            finalPrice: FinancialEngineDef._preciseRound(finalPrice), 
            tierName, offerName, 
            offerDiscount: FinancialEngineDef._preciseRound(offerDiscount), 
            couponCode, 
            couponDiscount: FinancialEngineDef._preciseRound(couponDiscount), 
            totalDiscount: FinancialEngineDef._preciseRound(accumulatedDiscount),
            netProfitUsd: FinancialEngineDef._preciseRound(netProfitUsd),
            marginPct: Number(marginPct.toFixed(2)), 
            isFirewallViolated, rejectionReason
        };
    },

    calculateOrderTotal: function(params = {}, rawQty = 1) {
        const safeQty = Math.floor(FinancialEngineDef.extractNum(rawQty) || 1);
        if (safeQty > FinancialEngineDef.CONFIG.MAX_QTY_LIMIT) throw new FinancialSecurityError("الكمية المطلوبة تتجاوز الحد الأقصى المسموح به.");
        if (safeQty <= 0) throw new FinancialSecurityError("الكمية غير صالحة.");

        const unit = FinancialEngineDef.calculatePrice(params);
        
        return {
            ...unit,
            qty: safeQty,
            totalCostUsd: FinancialEngineDef.safeMul(unit.costUsd, safeQty),
            totalOriginalPrice: FinancialEngineDef.safeMul(unit.originalPrice, safeQty),
            totalFinalPrice: FinancialEngineDef.safeMul(unit.finalPrice, safeQty),
            totalNetProfitUsd: FinancialEngineDef.safeMul(unit.netProfitUsd, safeQty),
            totalDiscount: FinancialEngineDef.safeMul(unit.totalDiscount, safeQty)
        };
    }
};

export const FinancialEngine = Object.freeze(FinancialEngineDef);
