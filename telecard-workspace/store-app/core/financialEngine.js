// ============================================================================
// 💰 المحرك المالي المركزي (Admin Edition) - النسخة الموحدة V25.3.1 💎 (The Oracle)
// 🎯 الوظيفة: محاكاة أسعار السيرفر بدقة 100%، كشف الأرباح، وتشخيص الأخطاء بشفافية للمدير.
// 🚀 التحديثات المعمارية (V25.3.1 - Master Patch): 
// 1. Full Synchronization: إضافة calculateDepositFee لمطابقة السيرفر والواجهة.
// 2. Variable Collision Fix: فصل حدود الإيداع عن حدود العمولة.
// 3. Time Safety: إضافة parseSafeTime المركزية لحماية محاكي الكوبونات من الانهيار.
// 4. Zero-Division Shield 🛡️: إرجاع القيمة الأصلية عند القسمة على صفر لمنع ثغرة المشتريات المجانية.
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
    
    // 🛡️ الترقيع الأمني الصارم: منع المشتريات المجانية عند القسمة على صفر
    _internalDiv: function(a, b) {
        const numA = Number(a) || 0;
        const numB = Number(b) || 0;
        
        if (numB === 0) { 
            console.error("🚨 [Critical Math Error]: Division by zero prevented!"); 
            // إرجاع السعر الأصلي بدلاً من الصفر لحماية المتجر من الخسارة
            return numA; 
        }
        return FinancialEngineDef._preciseRound(numA / numB, FinancialEngineDef.CONFIG.INTERNAL_PRECISION);
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

    // 🚀 أداة الوقت الآمنة لتوحيد قراءة كائنات التاريخ من قاعدة البيانات
    parseSafeTime: function(val) {
        if (val === null || val === undefined || val === '') return Date.now();
        if (typeof val === 'number') return val;
        if (typeof val.toMillis === 'function') return val.toMillis();
        if (val.seconds !== undefined) return val.seconds * 1000;
        if (val._seconds !== undefined) return val._seconds * 1000;
        if (val instanceof Date) return val.getTime();
        if (typeof val === 'string') {
            const parsed = new Date(val.includes('T') ? val : val.replace(/-/g, '/')).getTime();
            return isNaN(parsed) ? Date.now() : parsed;
        }
        return Date.now();
    },

    // ========================================================================
    // 🏦 القسم الثاني: معالجة الإيداعات ورسوم البوابات (Gateway Engine)
    // ========================================================================
    
    calculateDepositNet: function(amount, feeSettings = {}) {
        const amt = FinancialEngineDef.extractNum(amount);
        if (amt === 0) return 0;
        if (!feeSettings || Object.keys(feeSettings).length === 0) return amt;

        const feeType = feeSettings.feeType || 'fee'; 
        const feeUnit = feeSettings.feeUnit || 'percent'; 
        const feeVal = FinancialEngineDef.extractNum(feeSettings.fee);

        if (feeVal === 0) return amt;

        let feeAmount = 0;
        if (feeUnit === 'fixed') {
            feeAmount = feeVal;
        } else {
            feeAmount = FinancialEngineDef.safeMul(amt, FinancialEngineDef.safeDiv(feeVal, 100));
        }

        // 🚀 الإصلاح: استخدام minFee / maxFee لمنع التضارب مع حدود الإيداع
        const minFee = FinancialEngineDef.extractNum(feeSettings.minFee);
        const maxFee = FinancialEngineDef.extractNum(feeSettings.maxFee);
        
        if (minFee > 0 && feeAmount < minFee) feeAmount = minFee;
        if (maxFee > 0 && feeAmount > maxFee) feeAmount = maxFee;

        return feeType === 'bonus' 
            ? FinancialEngineDef.safeAdd(amt, feeAmount) 
            : Math.max(0, FinancialEngineDef.safeSub(amt, feeAmount));
    },

    // 🚀 إضافة دالة محاكاة الإيداعات الشاملة لنسخة الإدارة (لمطابقة السيرفر والواجهة)
    calculateDepositFee: function(amt, method, payCurr, baseCur = 'USD', rates = [], globalSettings = {}) {
        const cleanAmt = FinancialEngineDef.extractNum(amt, true);
        const curr = String(payCurr || 'USD').toUpperCase();
        
        let s = method?.currencySettings?.[curr] 
            ? { 
                fee: parseFloat(method.currencySettings[curr].fee || method.currencySettings[curr].value) || 0, 
                min: parseFloat(method.currencySettings[curr].min || method.currencySettings[curr].minVal) || 0, 
                max: parseFloat(method.currencySettings[curr].max || method.currencySettings[curr].maxVal) || 0, 
                minFee: parseFloat(method.currencySettings[curr].minFee) || 0, 
                maxFee: parseFloat(method.currencySettings[curr].maxFee) || 0,
                feeType: method.currencySettings[curr].feeType || method.currencySettings[curr].type || 'fee', 
                feeUnit: method.currencySettings[curr].feeUnit || method.currencySettings[curr].fee_unit || method.currencySettings[curr].unit || 'percent' 
              }
            : { 
                fee: parseFloat(method?.fee || method?.value) || 0, 
                min: parseFloat(method?.min || method?.minVal) || 0, 
                max: parseFloat(method?.max || method?.maxVal) || 0, 
                minFee: parseFloat(method?.minFee) || 0, 
                maxFee: parseFloat(method?.maxFee) || 0,
                feeType: method?.feeType || method?.type || 'fee', 
                feeUnit: method?.feeUnit || method?.fee_unit || method?.unit || 'percent' 
              };

        let rawGlobalMaxUsd = parseFloat(globalSettings?.globalMaxDepositUsd || globalSettings?.maxDeposit);
        let globalMaxUsd = (isNaN(rawGlobalMaxUsd) || rawGlobalMaxUsd <= 0) ? 5000 : rawGlobalMaxUsd;
        
        let dynamicGlobalMax = globalMaxUsd;
        if (curr !== 'USD') {
            dynamicGlobalMax = FinancialEngineDef.convertViaUSD(globalMaxUsd, 'USD', curr, rates, 'deposit');
        }

        if (!method || cleanAmt <= 0) return { isValid: false, msg: 'مبلغ غير صالح' };
        if (s.min > 0 && cleanAmt < s.min) return { isValid: false, msg: `عذراً، أقل مبلغ للإيداع هو ${s.min} ${curr}` };

        if (s.max > 0) {
            if (cleanAmt > s.max) return { isValid: false, msg: `أقصى حد للإيداع بطريقة الدفع هذه هو ${s.max} ${curr}` };
        } else {
            if (cleanAmt > dynamicGlobalMax) {
                const displayLimit = FinancialEngineDef._preciseRound(dynamicGlobalMax, 0); 
                return { isValid: false, msg: `أقصى حد للإيداع في المرة الواحدة هو ${displayLimit} ${curr}` };
            }
        }

        const netPayCurr = FinancialEngineDef.calculateDepositNet(cleanAmt, s);
        let netBase = FinancialEngineDef.convertViaUSDHelper(netPayCurr, curr, baseCur, rates, 'floor', 'deposit');
        
        return { isValid: true, netBase: isNaN(netBase) ? 0 : netBase, feePct: s.fee, feeType: s.feeType, feeUnit: s.feeUnit, adminMax: s.max, adminMin: s.min };
    },

    // ========================================================================
    // 💱 القسم الثالث: محول العملات المتعدد (Currency Exchange)
    // ========================================================================

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
    // 💼 القسم الرابع: محاكاة التسعير والجدار الناري الصريح (Honest Simulator)
    // ========================================================================

    validateCoupon: function(code, prod, qty, optIdx, user, userTier, coupons = [], now = Date.now(), offer = null) {
        if (!code) return { valid: false, msg: 'لم يتم تقديم كود خصم' };
        
        if (offer && typeof offer === 'object' && offer.isActive !== false && offer.type !== 'fake') {
            return { valid: false, msg: 'عذراً، لا يمكن استخدام الكوبونات مع العروض الترويجية' };
        }

        const cp = coupons.find(c => c.code.toUpperCase() === code.toUpperCase());
        if (!cp) return { valid: false, msg: 'كوبون غير صحيح' };
        if (cp.isActive === false) return { valid: false, msg: 'الكوبون غير مفعل' };
        
        if (FinancialEngineDef.extractNum(cp.value) <= 0) {
            return { valid: false, msg: 'الكوبون غير صالح للاستخدام (قيمة معدومة)' };
        }
        
        const isCouponDisabled = (prod.disableCoupons === true || String(prod.disableCoupons).toLowerCase() === 'true');
        if (isCouponDisabled) return { valid: false, msg: 'عذراً، هذا المنتج لا يدعم الكوبونات' }; 

        // 🚀 الإصلاح: ربط فحص التواريخ بالمحرك الزمني المركزي 
        if (cp.startDate) {
            const startMs = FinancialEngineDef.parseSafeTime(cp.startDate);
            if (startMs > 0 && now < startMs) return { valid: false, msg: 'هذا الكوبون لم تبدأ فترة صلاحيته بعد' };
        }

        if (cp.expiryDate) {
            const expiryMs = FinancialEngineDef.parseSafeTime(cp.expiryDate);
            if (expiryMs > 0 && now > expiryMs) return { valid: false, msg: 'انتهت صلاحية الكوبون' };
        }
        
        if (Number(cp.maxUses) > 0 && Number(cp.usedCount || 0) >= Number(cp.maxUses)) return { valid: false, msg: 'استنفد الكوبون الحد الأقصى للاستخدام' };
        if (cp.targetTiers?.length > 0 && !cp.targetTiers.includes(String(userTier?.id))) return { valid: false, msg: 'الكوبون غير متاح لمستوى حسابك' };
        
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
            return { valid: false, msg: 'غير مسموح لك باستخدام هذا الكوبون' };
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
                return { costUsd: 0, tierPrice: 0, originalPrice: 0, finalPrice: 0, tierName: 'خطأ', offerDiscount: 0, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallViolated: true, rejectionReason: `الـ Index الممرر للخيارات (${optIdx}) غير صالح!` };
            }
        }
        
        if (cost > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) {
            return { costUsd: cost, tierPrice: 0, originalPrice: 0, finalPrice: 0, tierName: 'خطأ', offerDiscount: 0, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallViolated: true, rejectionReason: "تجاوز سعر التكلفة الحد الأقصى الآمن." };
        }

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

        if (currentPrice > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) {
            return { costUsd: cost, tierPrice: currentPrice, originalPrice: currentPrice, finalPrice: 0, tierName: 'خطأ', offerDiscount: 0, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallViolated: true, rejectionReason: "تجاوز سعر البيع الحد الأقصى الآمن." };
        }

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
                // 💡 التميز هنا: الإدمن لا يُلقي خطأ يكسر الواجهة، بل يرجع السبب لكي يعرضه كرسالة تحذير في لوحة التحكم
                rejectionReason = `السعر النهائي (${currentPrice}$) يكسر حاجز الربح الآمن (${safeMarginPrice}$). السيرفر سيرفض هذه العملية حمايةً للأرباح!`;
            }
        }

        const finalPrice = currentPrice;
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
        let qty = Math.floor(FinancialEngineDef.extractNum(rawQty));
        if (qty <= 0) qty = 1;
        if (qty > FinancialEngineDef.CONFIG.MAX_QTY_LIMIT) {
             return { costUsd: 0, tierPrice: 0, originalPrice: 0, finalPrice: 0, tierName: 'خطأ', offerDiscount: 0, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallViolated: true, rejectionReason: "الكمية المطلوبة تتجاوز الحد الأقصى المسموح به." };
        }

        const unit = FinancialEngineDef.calculatePrice(params);
        
        return {
            ...unit,
            qty: qty,
            totalCostUsd: FinancialEngineDef.safeMul(unit.costUsd, qty),
            totalOriginalPrice: FinancialEngineDef.safeMul(unit.originalPrice, qty),
            totalFinalPrice: FinancialEngineDef.safeMul(unit.finalPrice, qty),
            totalNetProfitUsd: FinancialEngineDef.safeMul(unit.netProfitUsd, qty),
            totalDiscount: FinancialEngineDef.safeMul(unit.totalDiscount, qty)
        };
    }
};

export const FinancialEngine = Object.freeze(FinancialEngineDef);
if (typeof window !== 'undefined') { window.FinancialEngine = FinancialEngine; }
