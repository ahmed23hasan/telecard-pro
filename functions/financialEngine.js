// ============================================================================
// 💰 المحرك المالي المركزي (Cloud Version - Node.js) - النسخة الصارمة V11.5 🛡️
// 🎯 الوظيفة: الحساب المالي السيادي، حماية الأرباح، ومنع التلاعب بالمدخلات
// 🚀 التحديث الأقصى: تطبيق مبدأ (Fail-Fast)، إضافة دالة القسمة الآمنة
// ============================================================================

const FinancialEngineDef = {
    
    // 🛡️ 1. ثوابت النظام المحمية
    CONFIG: {
        BASE_CURRENCY: 'USD',
        MAX_QTY_LIMIT: 10000, // 🛡️ [تحديث]: مطابق لواجهة المستخدم (10000) لمنع تعارض الرفض
        MAX_PRICE_LIMIT: 10000,
        PRECISION: 10000
    },
    
    // 🛡️ 2. دوال الرياضيات السيادية (تمنع أخطاء JavaScript الحسابية)
    safeAdd: function(a, b) {
        return Math.round((Number(a) || 0) * this.CONFIG.PRECISION + (Number(b) || 0) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },
    safeSub: function(a, b) {
        return Math.round((Number(a) || 0) * this.CONFIG.PRECISION - (Number(b) || 0) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },
    safeMul: function(a, b) {
        const valA = Math.round((Number(a) || 0) * this.CONFIG.PRECISION);
        const valB = Math.round((Number(b) || 0) * this.CONFIG.PRECISION);
        return Math.round((valA * valB) / this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },
    // ✅ [الترقيع الأول]: إضافة دالة القسمة لمنع انهيار السيرفر
    safeDiv: function(a, b) {
        const numA = Number(a) || 0;
        let numB = Number(b);
        if (isNaN(numB) || numB === 0) numB = 1;
        return Math.round((numA / numB) * this.CONFIG.PRECISION) / this.CONFIG.PRECISION;
    },
    
    // 🛡️ 3. معقم الأرقام الصارم (Strict Sanitizer)
    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '') return 0;
        const num = Number(val);
        if (isNaN(num) || num < 0) return 0;
        if (!allowZero && num === 0) return 1;
        return num;
    },
    
    // 🛡️ 4. إدارة أسعار الصرف
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
    
    // 🛡️ 5. المحرك الرئيسي لحساب سعر المنتج
    calculatePrice: function(params = {}) {
        const { product, tier, offer, coupon, optIdx } = params;
        
        if (!product) throw new Error("FinancialEngine: Missing Product Data");
        
        let cost = this.extractNum(product.costPrice || product.cost_price || 0);
        let isFixed = (String(product.isFixedPrice).toLowerCase() === 'true');
        let activeOption = null;
        
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
        
        let offerDiscount = 0;
        if (offer && offer.type !== 'fake' && offer.isActive !== false) {
            const offerVal = this.extractNum(offer.value);
            offerDiscount = offer.type === 'percentage' ? this.safeMul(originalPrice, offerVal / 100) : offerVal;
        }
        
        let couponDiscount = 0;
        const canUseCoupon = !isFixed && product.disableCoupons !== true;
        if (canUseCoupon && coupon && coupon.isActive !== false) {
            const coupVal = this.extractNum(coupon.value);
            // ✅ [الترقيع الثاني]: حساب الكوبون من السعر الأصلي وليس الحالي (تطابق تام مع الواجهة الأمامية)
            couponDiscount = coupon.type === 'percentage' ? this.safeMul(originalPrice, coupVal / 100) : coupVal;
        }
        
        currentPrice = Math.max(0, this.safeSub(currentPrice, this.safeAdd(offerDiscount, couponDiscount)));
        
        // 🛡️ الجدار الناري (Firewall) المبسط والمحاسبي
        let isFirewallViolated = false;
        if (currentPrice < cost) {
            isFirewallViolated = true;
            currentPrice = cost; // منع البيع بالخسارة فوراً دون تشويه قيم الكوبونات في الفاتورة
        }
        
        const profit = Math.max(0, this.safeSub(currentPrice, cost));
        const marginPct = cost > 0 ? (profit / cost) * 100 : 0;
        
        return {
            cost,
            originalPrice,
            finalPrice: currentPrice,
            offerDiscount,
            couponDiscount,
            // ✅ الخصم الفعلي هو (السعر الأصلي - ما سيدفعه العميل حقاً)
            totalDiscount: this.safeSub(originalPrice, currentPrice),
            profit,
            marginPct: Number(marginPct.toFixed(2)),
            isFirewallViolated,
            tierName: tier?.name || (isFixed ? 'Fixed' : 'Standard')
        };
    },
    
    // 🛡️ 6. حساب إجمالي الطلب مع حماية الكمية
    calculateOrderTotal: function(params, rawQty) {
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