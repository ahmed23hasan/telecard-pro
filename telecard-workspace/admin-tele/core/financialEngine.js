// ============================================================================
// 💰 المحرك المالي المركزي (Admin Edition) - النسخة الموحدة V17.3 💎 (The Oracle)
// 🎯 الوظيفة: محاكاة أسعار السيرفر بدقة 100%، كشف الأرباح، وتشخيص الأخطاء بشفافية.
// 🚀 التحديثات المعمارية (V17.3):
// 1. Unified Math Engine: دمج خوارزمية (EPSILON + 8 Precision) لتتطابق أرباح الإدارة مع السيرفر تماماً.
// 2. Honest Firewall: إلغاء (التسوية التلقائية). المحرك الآن يظهر الخسارة بالسالب ويحذر المدير بأن السيرفر سيرفض العملية.
// 3. Fail-Fast Division: الحفاظ على جدار حماية القسمة على صفر لمنع الحسابات الوهمية.
// ============================================================================

export const FinancialEngine = {
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        PRECISION: 4,          // دقة العرض النهائية
        INTERNAL_PRECISION: 8, // دقة الحسابات المعقدة الداخلية (نفس السيرفر)
        MAX_UI_QTY: 10000,
        MIN_SALE_PRICE: 0.01 
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
        if(rnd === 'floor') return Math.floor(v * 100) / 100;
        if(rnd === 'ceil')  return Math.ceil(v * 100) / 100;
        return Number(v.toFixed(2));
    },

    // ========================================================================
    // 💼 القسم الثاني: محاكاة التسعير والجدار الناري الصريح (Honest Simulator)
    // ========================================================================

    calculatePrice: function(params = {}) {
        const { product = {}, costPrice = 0, fixedPrice = 0, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        if (!product || typeof product !== 'object' || Object.keys(product).length === 0) {
            return { costUsd: 0, tierPrice: 0, originalPrice: 0, finalPrice: 0, tierName: 'غير محدد', offerDiscount: 0, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallViolated: true, rejectionReason: "بيانات المنتج مفقودة" };
        }

        let cost = this.extractNum(costPrice || product.costPrice || product.cost_price || 0);
        let isFixed = (fixedPrice > 0) || (String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true);
        let activeOption = null;

        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null && optIdx !== undefined) {
            const index = Number(optIdx);
            if (Number.isInteger(index) && index >= 0 && index < product.options.length) {
                activeOption = product.options[index];
                cost = this.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
                if (activeOption.isFixedPrice !== undefined) isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
            } else {
                throw new Error(`🚨 [Admin Simulator Error]: Invalid option index detected.`);
            }
        }
        
        let standardPrice = activeOption ? this.extractNum(activeOption.price) : this.extractNum(product.price);
        let currentPrice = standardPrice;
        let tierName = null;

        if (isFixed) {
            currentPrice = activeOption ? this.extractNum(activeOption.fixedPriceUsd || activeOption.price) : this.extractNum(fixedPrice || product.fixedPriceUsd || product.price);
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

        let offerName = null, offerDiscount = 0;
        if (allowsDiscounts && offer && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name;
            const val = this._preciseRound(this.extractNum(offer.value), this.CONFIG.INTERNAL_PRECISION);
            offerDiscount = offer.type === 'percentage' ? this._internalMul(originalPrice, this._internalDiv(val, 100)) : Math.min(val, currentPrice);
        }
        currentPrice = this._internalSub(currentPrice, offerDiscount);

        let couponCode = null, couponDiscount = 0;
        if (allowsDiscounts && product.disableCoupons !== true && coupon && coupon.isActive !== false) {
            couponCode = coupon.code;
            const val = this._preciseRound(this.extractNum(coupon.value), this.CONFIG.INTERNAL_PRECISION);
            couponDiscount = coupon.type === 'percentage' ? this._internalMul(currentPrice, this._internalDiv(val, 100)) : Math.min(val, currentPrice);
        }
        
        // تطبيق الحد الأدنى للسعر
        currentPrice = Math.max(this.CONFIG.MIN_SALE_PRICE, this._internalSub(currentPrice, couponDiscount));

        let isFirewallViolated = false;
        let rejectionReason = null;

        // 🛑 الشفافية المطلقة: إذا نزل السعر عن التكلفة، لا تخفيها. أظهرها وافضحها ليتدخل المدير!
        if (cost > 0 && currentPrice < cost) {
            isFirewallViolated = true;
            rejectionReason = `السعر النهائي (${currentPrice}$) أقل من التكلفة (${cost}$). السيرفر سيرفض هذه العملية حمايةً للأرباح!`;
        }

        const finalPrice = currentPrice;
        const totalDiscount = this._internalSub(originalPrice, finalPrice);
        
        // الأرباح قد تظهر بالسالب إذا تم كسر الجدار الناري (لكي يعلم المدير مدى الكارثة)
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