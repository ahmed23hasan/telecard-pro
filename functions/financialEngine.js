// ============================================================================
// 💰 المحرك المالي المركزي (Cloud Version - Node.js) - النسخة المطلقة V12.5 🛡️
// 🎯 الوظيفة: الحساب المالي السيادي، حماية الأرباح، التطابق مع الواجهة (Sequential Discount)
// 🚀 التحديث الأخير: إصلاح ثغرة (Integer Overflow) وحماية الأسعار الثابتة الشاملة
// ============================================================================

const FinancialEngineDef = {

    // 🔒 [إغلاق ثغرة التجميد السطحي]: تجميد الكائن الداخلي لحماية الدقة الرياضية
    CONFIG: Object.freeze({
        BASE_CURRENCY: 'USD',
        MAX_QTY_LIMIT: 10000,    
        MAX_PRICE_LIMIT: 10000,  
        PRECISION: 10000         
    }),

    safeAdd: function(a, b) {
        return Math.round((Number(a) || 0) * this.CONFIG.PRECISION + (Number(b) || 0) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },
    safeSub: function(a, b) {
        return Math.round((Number(a) || 0) * this.CONFIG.PRECISION - (Number(b) || 0) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },
    
    // 🛡️ [إصلاح ماسي]: منع تضخم الذاكرة الرقمية (Integer Overflow Limit Exceeded)
    safeMul: function(a, b) {
        const rawResult = (Number(a) || 0) * (Number(b) || 0);
        return Math.round(rawResult * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },
    
    safeDiv: function(a, b) {
        const numA = Number(a) || 0;
        let numB = Number(b);
        if (isNaN(numB) || numB === 0) numB = 1;
        return Math.round((numA / numB) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },

    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '') return 0;
        const num = Number(val);
        if (isNaN(num) || num < 0) return 0;
        if (!allowZero && num === 0) return 1;
        return num;
    },

    normalizeRates: function(rawArray) {
        const ratesMap = {};
        ratesMap[this.CONFIG.BASE_CURRENCY] = { code: this.CONFIG.BASE_CURRENCY, priceRate: 1, depRate: 1, isBase: true };

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

    calculatePrice: function(params = {}) {
        const { product, tier, offer, coupon, optIdx } = params;

        if (!product) throw new Error("FinancialEngine: Missing Product Data");

        let cost = this.extractNum(product.costPrice || product.cost_price || 0);
        let isFixed = (String(product.isFixedPrice).toLowerCase() === 'true');
        let activeOption = null;

        // 🛡️ التدهور الآمن: جلب الخيار فقط إذا كان الـ Index صالحاً (Bounds Checking)
        if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null) {
            activeOption = product.options[optIdx];
            if (activeOption) {
                cost = this.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
                if (activeOption.isFixedPrice !== undefined) isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
            }
        }

        if (cost > this.CONFIG.MAX_PRICE_LIMIT) {
            throw new Error(`[SECURITY] Cost price exceeds system limits (${this.CONFIG.MAX_PRICE_LIMIT}). Operation aborted.`);
        }

        let baseSellingPrice = 0;

        if (isFixed) {
            baseSellingPrice = activeOption ? this.extractNum(activeOption.fixedPriceUsd || activeOption.price) : this.extractNum(product.fixedPriceUsd || product.fixed_price_usd);
        } else if (tier && typeof tier === 'object') {
            const tierPriceField = activeOption?.tierPrices?.[tier.id] || product.tierPrices?.[tier.id];
            if (tierPriceField) {
                baseSellingPrice = this.extractNum(tierPriceField);
            } else {
                const costForMath = cost > 0 ? cost : this.extractNum(activeOption?.price || product.price);
                const profitPercent = this.extractNum(tier.profitPercent || tier.profit_percent);
                const minProfitUsd = this.extractNum(tier.minProfitUsd || tier.min_profit_usd);
                
                let profitAdded = this.safeMul(costForMath, profitPercent / 100);
                if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
                baseSellingPrice = this.safeAdd(costForMath, profitAdded);
            }
        } else {
            baseSellingPrice = this.extractNum(activeOption?.price || product.price);
        }

        if (baseSellingPrice > this.CONFIG.MAX_PRICE_LIMIT) {
            throw new Error(`[SECURITY] Selling price exceeds system limits (${this.CONFIG.MAX_PRICE_LIMIT}). Operation aborted.`);
        }

        const originalPrice = baseSellingPrice;
        let currentPrice = originalPrice;
        
        // ========================================================
        // 🚀 [التحديث الماسي]: تطبيق الخصم المتسلسل وحماية السعر الثابت
        // ========================================================

        // 🛡️ إذا كان السعر ثابتاً، يتم تعطيل العروض والكوبونات لحماية رأس المال
        const allowsDiscounts = !isFixed; 

        // 1. حساب خصم العرض الترويجي (من السعر الأصلي)
        let offerName = null, offerDiscount = 0;
        if (allowsDiscounts && offer && offer.type !== 'fake' && offer.isActive !== false) {
            offerName = offer.name || null; 
            const offerVal = this.extractNum(offer.value);
            offerDiscount = offer.type === 'percentage' ? this.safeMul(originalPrice, offerVal / 100) : offerVal;
        }

        // تطبيق خصم العرض أولاً
        currentPrice = this.safeSub(currentPrice, offerDiscount);

        // 2. حساب خصم الكوبون (من السعر المتبقي currentPrice)
        let couponCode = null, couponDiscount = 0;
        const canUseCoupon = allowsDiscounts && product.disableCoupons !== true;
        
        if (canUseCoupon && coupon && coupon.isActive !== false) {
            couponCode = coupon.code || null; 
            const coupVal = this.extractNum(coupon.value);
            // 👈 تطبيق النسبة المئوية على السعر بعد عرض التخفيض (Sequential)
            couponDiscount = coupon.type === 'percentage' ? this.safeMul(currentPrice, coupVal / 100) : coupVal;
        }

        // تطبيق خصم الكوبون النهائي
        currentPrice = this.safeSub(currentPrice, couponDiscount);

        let isFirewallViolated = false;

        // 🛑 الجدار الناري 1: منع الخصومات التي تجعل السعر بالسالب
        if (currentPrice < 0) {
            isFirewallViolated = true;
            currentPrice = 0;
        }

        // 🛑 الجدار الناري 2: حماية رأس المال (السيرفر فقط يعلم هذا الرقم)
        // يمنع بيع المنتج بأقل من تكلفته حتى لو أخطأ الأدمن في وضع نسبة الخصم
        if (cost > 0 && currentPrice < cost) {
            isFirewallViolated = true;
            currentPrice = cost; 
        }

        const profit = Math.max(0, this.safeSub(currentPrice, cost));
        const marginPct = cost > 0 ? (profit / cost) * 100 : 0;

        return {
            cost,
            originalPrice,
            finalPrice: currentPrice,
            offerName: offerName || null,
            offerDiscount,
            couponCode: couponCode || null,
            couponDiscount,
            totalDiscount: this.safeSub(originalPrice, currentPrice),
            profit,
            marginPct: Number(marginPct.toFixed(2)),
            isFirewallViolated,
            tierName: tier?.name || (isFixed ? 'Fixed' : 'Standard')
        };
    },

    calculateOrderTotal: function(params, rawQty) {
        // 🛡️ استخدام Math.floor لمنع الثغرات الكسرية (Fractional Exploits)
        let qty = Math.floor(Number(rawQty) || 1);
        
        if (qty <= 0 || qty > this.CONFIG.MAX_QTY_LIMIT) {
            throw new Error(`[SECURITY] Invalid quantity (${qty}). Exceeds limit or is negative. Operation aborted.`);
        }

        const unit = this.calculatePrice(params);
        
        return {
            ...unit,
            qty,
            totalCost: this.safeMul(unit.cost, qty),
            totalFinalPrice: this.safeMul(unit.finalPrice, qty),
            totalProfit: this.safeMul(unit.profit, qty),
            totalDiscount: this.safeMul(unit.totalDiscount, qty)
        };
    }
};

module.exports = Object.freeze(FinancialEngineDef);