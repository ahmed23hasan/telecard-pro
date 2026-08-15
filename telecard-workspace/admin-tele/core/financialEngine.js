// ============================================================================
// 💰 المحرك المالي المركزي (Admin Edition) - النسخة الموحدة V18.6 💎 (The Oracle)
// 🎯 الوظيفة: محاكاة أسعار السيرفر بدقة 100%، كشف الأرباح، وتشخيص الأخطاء بشفافية.
// 🚀 التحديثات (V18.6): 
// 1. Strict Option Validation: التنبيه الصارم (Throw Error) لأي Index غير صالح لمحاكاة رد فعل السيرفر.
// 2. Precision Sync: توحيد دالة التقريب المساعد مع المتغير المركزي للرياضيات.
// 3. Global Failsafe Cap: محاكاة شبكة الأمان (95%) ليتطابق حساب الإدارة مع السيرفر.
// 4. Advanced Oracle Firewall: كشف كسر حاجز الربح الآمن 5% بشفافية دون انهيار الواجهة.
// ============================================================================

export const FinancialEngine = {
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        PRECISION: 4,          
        INTERNAL_PRECISION: 8, 
        MAX_UI_QTY: 10000,
        MIN_SALE_PRICE: 0.01,
        // 🛡️ دروع الحماية المتطابقة مع السيرفر
        MIN_MARGIN_PERCENT: 5,        // يجب بقاء 5% ربح كحد أدنى فوق التكلفة
        MAX_GLOBAL_DISCOUNT_PCT: 95   // شبكة أمان تمنع أي خصم من تجاوز 95%
    }),

    // ========================================================================
    // 🧮 القسم الأول: محرك الرياضيات الموحد (Unified Core Math)
    // ========================================================================
    
    _preciseRound: function(num, decimals = this.CONFIG.PRECISION) {
        let n = Number(num);
        if (isNaN(n) || n === 0) return 0;
        const factor = Math.pow(10, decimals);
        return Math.round((n + Number.EPSILON) * factor) / factor;
    },

    _internalAdd: function(a, b) { return this._preciseRound((Number(a) || 0) + (Number(b) || 0), this.CONFIG.INTERNAL_PRECISION); },
    _internalSub: function(a, b) { return this._preciseRound((Number(a) || 0) - (Number(b) || 0), this.CONFIG.INTERNAL_PRECISION); },
    _internalMul: function(a, b) { return this._preciseRound((Number(a) || 0) * (Number(b) || 0), this.CONFIG.INTERNAL_PRECISION); },
    _internalDiv: function(a, b) {
        const numB = Number(b) || 0;
        // 🚨 Fail Fast: إيقاف محاكاة الإدارة فوراً لكشف الخطأ الهندسي 
        if (numB === 0) throw new Error("🚨 [Admin Finance Guard]: محاولة قسمة على صفر! يرجى مراجعة أسعار الصرف.");
        return this._preciseRound((Number(a) || 0) / numB, this.CONFIG.INTERNAL_PRECISION);
    },

    safeAdd: function(a, b) { return this._preciseRound(this._internalAdd(a, b)); },
    safeSub: function(a, b) { return this._preciseRound(this._internalSub(a, b)); },
    safeMul: function(a, b) { return this._preciseRound(this._internalMul(a, b)); },
    safeDiv: function(a, b) { return this._preciseRound(this._internalDiv(a, b)); },
    
    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '' || Array.isArray(val) || typeof val === 'object') return 0;
        const num = Number(val);
        if (isNaN(num) || num < 0) return 0;
        if (!allowZero && num === 0) return 1;
        return num;
    },
    
    normalizeRates: function(raw) {
        const ratesMap = {};
        ratesMap[this.CONFIG.BASE_CURRENCY] = { code: this.CONFIG.BASE_CURRENCY, symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true };
        
        if (Array.isArray(raw)) {
            for (const rate of raw) {
                if (rate && rate.code && rate.code !== this.CONFIG.BASE_CURRENCY) {
                    const code = String(rate.code).toUpperCase();
                    ratesMap[code] = { 
                        code: code, 
                        priceRate: this.extractNum(rate.priceRate || rate.value, false), 
                        depRate: this.extractNum(rate.depRate || rate.value, false) 
                    };
                }
            }
        } else if (raw && typeof raw === 'object') {
            const invalidKeys = ['ISBASE', 'PRICERATE', 'DEPRATE', 'CODE', 'VALUE', 'SYMBOL', 'NAME'];
            for (const [key, value] of Object.entries(raw)) {
                if (typeof value !== 'object' && !invalidKeys.includes(key.toUpperCase())) continue;
                
                const code = String(value.code || key).toUpperCase();
                if (code && code !== this.CONFIG.BASE_CURRENCY && !invalidKeys.includes(code)) {
                    ratesMap[code] = {
                        code: code,
                        priceRate: this.extractNum(value.priceRate || value.value, false),
                        depRate: this.extractNum(value.depRate || value.value, false)
                    };
                }
            }
        }
        return ratesMap;
    },
    
    convertViaUSD: function(amount, fromCode, toCode, ratesRaw, channel = 'pricing') {
        const amt = this.extractNum(amount);
        const fCode = String(fromCode || this.CONFIG.BASE_CURRENCY).toUpperCase();
        const tCode = String(toCode || this.CONFIG.BASE_CURRENCY).toUpperCase();
        if (amt === 0 || fCode === tCode) return amt;
        
        const ratesMap = this.normalizeRates(ratesRaw);
        if (!ratesMap[fCode] || !ratesMap[tCode]) {
            console.warn(`[Admin Simulator] Missing exchange rate for: ${fCode} or ${tCode}`);
            return 0;
        }
        
        const fRate = channel === 'deposit' ? ratesMap[fCode].depRate : ratesMap[fCode].priceRate;
        const tRate = channel === 'deposit' ? ratesMap[tCode].depRate : ratesMap[tCode].priceRate;
        
        if (fRate === 0 || tRate === 0) return 0;
        return this._preciseRound(this._internalMul(this._internalDiv(amt, fRate), tRate));
    },

    convertViaUSDHelper: function(amt, f, t, rates, rnd = 'round', c = 'pricing') {
        let v = this.convertViaUSD(amt, f, t, rates, c); 
        // 🛡️ التحديث 2: استخدام معامل التقريب المركزي بدلاً من الثابت (10000)
        const factor = Math.pow(10, this.CONFIG.PRECISION);
        if(rnd === 'floor') return Math.floor((v + Number.EPSILON) * factor) / factor;
        if(rnd === 'ceil')  return Math.ceil((v - Number.EPSILON) * factor) / factor;
        return Number(v.toFixed(this.CONFIG.PRECISION));
    },

    // ========================================================================
    // 💼 القسم الثاني: محاكاة التسعير والجدار الناري الصريح (Honest Simulator)
    // ========================================================================

    validateCoupon: function(code, prod, qty, optIdx, user, userTier, coupons = [], now = Date.now(), offer = null) {
        if (!code) return { valid: false, msg: 'لم يتم إدخال كود' };
        
        // 🛡️ درع منع الازدواجية (محاكاة دقيقة للسيرفر)
        if (offer && typeof offer === 'object' && offer.isActive !== false && offer.type !== 'fake') {
            return { valid: false, msg: 'عذراً، لا يمكن استخدام الكوبونات على المنتجات الخاضعة لعروض التخفيض' };
        }

        const cp = coupons.find(c => c.code.toUpperCase() === code.toUpperCase());
        if (!cp) return { valid: false, msg: 'كوبون غير صحيح' };
        if (cp.isActive === false) return { valid: false, msg: 'الكوبون غير مفعل' };
        
        // حماية المنتج المستثنى
        if (prod.disableCoupons === true || String(prod.disableCoupons).toLowerCase() === 'true') { 
            return { valid: false, msg: 'عذراً، هذا المنتج لا يدعم استخدام الكوبونات' }; 
        }
        
        const expiryMs = cp.expiryDate ? new Date(cp.expiryDate).getTime() : 0;
        if (expiryMs > 0 && now > expiryMs) return { valid: false, msg: 'انتهت صلاحية الكوبون' };
        
        if (Number(cp.maxUses) > 0 && Number(cp.usedCount || 0) >= Number(cp.maxUses)) return { valid: false, msg: 'استنفد الحد الأقصى للاستخدام' };
        if (cp.targetTiers?.length > 0 && !cp.targetTiers.includes(String(userTier?.id))) return { valid: false, msg: 'غير متاح لهذا المستوى' };
        if (cp.targetProds?.length > 0 && !cp.targetProds.includes(String(prod.id)) && !cp.targetProds.includes(String(prod.catId))) return { valid: false, msg: 'غير مخصص لهذا المنتج' };
        
        if (cp.allowedUsers?.length > 0 && !cp.allowedUsers.some(u => String(u) === String(user?.uid || user?.id))) {
            return { valid: false, msg: 'غير مسموح لهذا المستخدم' }; 
        }
        
        if (Number(cp.minOrder) > 0) {
            const tempPrice = this.calculateOrderTotal({ product: prod, tier: userTier, optIdx, offer: null }, qty);
            if (tempPrice.totalFinalPrice < Number(cp.minOrder)) return { valid: false, msg: `الحد الأدنى لاستخدام الكوبون هو ${cp.minOrder}$` };
        }
        
        return { valid: true, coupon: { code: cp.code, type: cp.type, value: cp.value, maxDiscount: cp.maxDiscount, isActive: cp.isActive } };
    },

    calculatePrice: function(params = {}) {
        const { product = {}, costPrice = 0, fixedPrice = 0, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        if (!product || typeof product !== 'object' || Object.keys(product).length === 0) {
            return { costUsd: 0, tierPrice: 0, originalPrice: 0, finalPrice: 0, tierName: 'غير محدد', offerDiscount: 0, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallViolated: true, rejectionReason: "بيانات المنتج مفقودة" };
        }

        let cost = this.extractNum(costPrice || product.costPrice || product.cost_price || 0);
        let isFixed = (fixedPrice > 0) || (String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);
        let activeOption = null;

        // 🛡️ التحديث 1: الإغلاق الأمني الصارم لمحاكاة رفض السيرفر لأي Index غير صالح
        if (product.type === 'select' && Array.isArray(product.options) && product.options.length > 0) {
            const index = Number(optIdx);
            if (Number.isInteger(index) && index >= 0 && index < product.options.length) {
                activeOption = product.options[index];
                cost = this.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
                if (activeOption.isFixedPrice !== undefined) isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
            } else {
                throw new Error(`🚨 [Admin Simulator]: الـ Index الممرر للخيارات (${optIdx}) غير صالح! السيرفر سيرفض هذا الطلب لحماية التسعير.`);
            }
        }
        
        let standardPrice = activeOption ? this.extractNum(activeOption.price || product.price) : this.extractNum(product.price);
        let currentPrice = standardPrice;
        let tierName = null;

        if (isFixed) {
            currentPrice = activeOption ? this.extractNum(activeOption.fixedPriceUsd || activeOption.price || product.price) : this.extractNum(fixedPrice || product.fixedPriceUsd || product.price);
            tierName = "سعر ثابت";
        } else if (tier && typeof tier === 'object') {
            tierName = tier.nameAr || tier.name || tier.id || 'عضو';
            const tierPriceField = activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id];
            
            if (tierPriceField !== undefined && tierPriceField !== null) {
                currentPrice = this.extractNum(tierPriceField);
            } else {
                const profitPercent = this.extractNum(tier.profitPercent || tier.profit_percent);
                const minProfitUsd = this.extractNum(tier.minProfitUsd || tier.min_profit_usd);
                
                if (cost > 0 && (profitPercent > 0 || minProfitUsd > 0)) {
                    let profitAdded = this._internalMul(cost, this._internalDiv(profitPercent, 100));
                    if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
                    currentPrice = this._internalAdd(cost, profitAdded);
                }
            }
        }

        const tierPrice = currentPrice;
        const originalPrice = tierPrice;
        const allowsDiscounts = !isFixed;

        // 1. تطبيق الخصم الترويجي (Offer)
        let offerName = null, offerDiscount = 0;
        if (allowsDiscounts && offer && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name;
            const val = this._preciseRound(this.extractNum(offer.value), this.CONFIG.INTERNAL_PRECISION);
            
            let calculatedOfferDiscount = 0;
            if (offer.type === 'percentage') {
                calculatedOfferDiscount = this._internalMul(originalPrice, this._internalDiv(val, 100));
            } else {
                calculatedOfferDiscount = val;
            }

            // 🛡️ تطبيق شبكة الأمان العالمية على العروض
            const maxGlobalOfferCap = this._internalMul(originalPrice, this._internalDiv(this.CONFIG.MAX_GLOBAL_DISCOUNT_PCT, 100));
            offerDiscount = Math.min(calculatedOfferDiscount, currentPrice, maxGlobalOfferCap);
            
            currentPrice = this._internalSub(currentPrice, offerDiscount);
        }

        // 2. تطبيق الكوبون (مع حماية الحد الأعلى ومنع الازدواجية)
        let couponCode = null, couponDiscount = 0;
        const isCouponDisabled = (product.disableCoupons === true || String(product.disableCoupons).toLowerCase() === 'true');
        const canUseCoupon = allowsDiscounts && !isCouponDisabled && offerDiscount === 0;

        if (canUseCoupon && coupon && coupon.isActive !== false) {
            couponCode = coupon.code;
            const coupVal = this._preciseRound(this.extractNum(coupon.value), this.CONFIG.INTERNAL_PRECISION);
            let calculatedDiscount = 0;

            if (coupon.type === 'percentage') {
                calculatedDiscount = this._internalMul(currentPrice, this._internalDiv(coupVal, 100));
            } else {
                calculatedDiscount = coupVal;
            }

            // 🛡️ تطبيق الحد الأعلى للخصم (Max Discount Cap) الخاص بالكوبون
            const maxCap = this.extractNum(coupon.maxDiscount);
            if (maxCap > 0) {
                calculatedDiscount = Math.min(calculatedDiscount, maxCap);
            }

            // 🛡️ تطبيق شبكة الأمان العالمية على الكوبون
            const maxGlobalCouponCap = this._internalMul(currentPrice, this._internalDiv(this.CONFIG.MAX_GLOBAL_DISCOUNT_PCT, 100));
            couponDiscount = Math.min(calculatedDiscount, currentPrice, maxGlobalCouponCap);
        }
        
        currentPrice = Math.max(this.CONFIG.MIN_SALE_PRICE, this._internalSub(currentPrice, couponDiscount));

        // 🛑 الشفافية المطلقة (The Oracle Vision): كشف كسر الجدار الناري للإدارة
        let isFirewallViolated = false;
        let rejectionReason = null;

        if (cost > 0) {
            const minRequiredProfit = this._internalMul(cost, this._internalDiv(this.CONFIG.MIN_MARGIN_PERCENT, 100));
            const safeMarginPrice = this._internalAdd(cost, minRequiredProfit);
            
            if (currentPrice < safeMarginPrice) {
                isFirewallViolated = true;
                rejectionReason = `السعر النهائي (${currentPrice}$) يكسر حاجز الربح الآمن (${safeMarginPrice}$). السيرفر سيرفض هذه العملية حمايةً للأرباح!`;
            }
        }

        const finalPrice = currentPrice;
        const totalDiscount = this._internalSub(originalPrice, finalPrice);
        
        const netProfitUsd = this._internalSub(finalPrice, cost); 
        let marginPct = 0;
        if (finalPrice > 0) {
            marginPct = this._internalMul(this._internalDiv(netProfitUsd, finalPrice), 100);
        }

        return {
            costUsd: this._preciseRound(cost),
            tierPrice: this._preciseRound(tierPrice), 
            originalPrice: this._preciseRound(originalPrice), 
            finalPrice: this._preciseRound(finalPrice), 
            tierName, 
            offerName, 
            offerDiscount: this._preciseRound(offerDiscount), 
            couponCode, 
            couponDiscount: this._preciseRound(couponDiscount), 
            totalDiscount: this._preciseRound(totalDiscount),
            netProfitUsd: this._preciseRound(netProfitUsd),
            marginPct: Number(marginPct.toFixed(2)), 
            isFirewallViolated,
            rejectionReason
        };
    },

    calculateOrderTotal: function(params = {}, rawQty = 1) {
        const safeQty = Math.min(this.CONFIG.MAX_UI_QTY, Math.max(1, Math.floor(this.extractNum(rawQty) || 1)));
        const unit = this.calculatePrice(params);
        
        return {
            ...unit,
            qty: safeQty,
            totalCostUsd: this.safeMul(unit.costUsd, safeQty),
            totalOriginalPrice: this.safeMul(unit.originalPrice, safeQty),
            totalFinalPrice: this.safeMul(unit.finalPrice, safeQty),
            totalNetProfitUsd: this.safeMul(unit.netProfitUsd, safeQty),
            totalDiscount: this.safeMul(unit.totalDiscount, safeQty)
        };
    }
};

Object.freeze(FinancialEngine);
