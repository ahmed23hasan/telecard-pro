// ============================================================================
// 💰 المحرك المالي المركزي (Admin Edition) - الإصدار الألماسي V30.4.0 💎 (The Oracle)
// 🎯 الوظيفة: محاكاة أسعار السيرفر، كشف الأرباح، وتشخيص الأخطاء بشفافية مطلقة للمدير.
// 🚀 التحديثات المعمارية (V30.4.0 - Server Sync Patch): 
// 1. Math Core Sync 🧮: توحيد خوارزمية التقريب (e4) لتطابق السيرفر بنسبة 100% ومنع الفروقات الكسرية.
// 2. Firewall Alignment 🛡️: توحيد هامش الحماية (0.5%) لمنع تضارب الرفض والقبول بين الأدمن والسيرفر.
// 3. Absolute Transparency 👁️: عدم إيقاف الكود عند كسر الحماية، بل إرجاع السبب بالأرقام لتلوين الواجهة للأدمن.
// 4. Upgrade Simulator 👑: إضافة محرك الترقيات لتمكين الأدمن من محاكاة مسار إنفاق العملاء.
// ============================================================================

const FinancialEngineDef = { 
    CONFIG: Object.freeze({ 
        BASE_CURRENCY: 'USD',
        MAX_QTY_LIMIT: 10000, 
        MAX_PRICE_LIMIT: 1000000, 
        PRECISION: 4,
        INTERNAL_PRECISION: 8, 
        MIN_SALE_PRICE: 0.01, 
        // 🛡️ تم التوحيد مع السيرفر: 0.5% (رسوم بوابات الدفع التشغيلية كحد أدنى قطعي)
        MIN_MARGIN_PERCENT: 0.5,
        MAX_GLOBAL_DISCOUNT_PCT: 95
    }),

    // ========================================================================
    // 🧮 القسم الأول: محرك الرياضيات الدقيق (Identical to Server Math Core)
    // ========================================================================

    sanitizeAmount: function(amount) {
        const num = Number(amount);
        // 🛡️ حماية جداول الإدارة من قيم الـ NaN والـ Infinity
        if (isNaN(num) || !isFinite(num)) return 0;
        // خوارزمية التقريب المتطابقة مع السيرفر
        return Number(Math.round(num + 'e4') + 'e-4');
    },

    _internalAdd: function(a, b) { return FinancialEngineDef.sanitizeAmount((Number(a) || 0) + (Number(b) || 0)); },
    _internalSub: function(a, b) { return FinancialEngineDef.sanitizeAmount((Number(a) || 0) - (Number(b) || 0)); },
    _internalMul: function(a, b) { return FinancialEngineDef.sanitizeAmount((Number(a) || 0) * (Number(b) || 0)); },
    
    _internalDiv: function(a, b) {
        const numA = Number(a) || 0;
        const numB = Number(b) || 0;
        
        if (numB === 0) { 
            console.error("🚨 [Admin Math Guard]: منع قسمة على صفر! يرجى مراجعة أسعار الصرف."); 
            return numA; 
        }
        return FinancialEngineDef.sanitizeAmount(numA / numB);
    },

    safeAdd: function(a, b) { return FinancialEngineDef._internalAdd(a, b); },
    safeSub: function(a, b) { return FinancialEngineDef._internalSub(a, b); },
    safeMul: function(a, b) { return FinancialEngineDef._internalMul(a, b); },
    safeDiv: function(a, b) { return FinancialEngineDef._internalDiv(a, b); },

    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '' || Array.isArray(val) || typeof val === 'object') return 0;
        const num = Number(val);
        if (isNaN(num) || !isFinite(num) || num < 0) return 0;
        if (!allowZero && num === 0) return 1;
        return num;
    },

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

    // 🚀 [توحيد الزمن]: حساب منتصف الليل بناءً على التوقيت العالمي (Pure UTC)
getStartOfUTCDay: function(timestampMs) {
    const d = new Date(timestampMs);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
},    // ========================================================================
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

        const minFee = FinancialEngineDef.extractNum(feeSettings.minFee);
        const maxFee = FinancialEngineDef.extractNum(feeSettings.maxFee);
        
        if (minFee > 0 && feeAmount < minFee) feeAmount = minFee;
        if (maxFee > 0 && feeAmount > maxFee) feeAmount = maxFee;

        return feeType === 'bonus' 
            ? FinancialEngineDef.safeAdd(amt, feeAmount) 
            : Math.max(0, FinancialEngineDef.safeSub(amt, feeAmount));
    },

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
                const displayLimit = Math.floor(dynamicGlobalMax); 
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
            if (numPrice === 0 || numDep === 0) {
                console.warn(`🚨 [Admin System]: سعر صرف غير صالح للعملة ${code}. سيتم اعتبارها 1 للحماية.`);
                ratesMap[code] = { code: code, priceRate: numPrice || 1, depRate: numDep || 1 };
                return;
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
        
        if (!ratesMap[fCode] || !ratesMap[tCode]) {
            console.error(`🚨 [Admin System]: فشل التحويل من ${fCode} إلى ${tCode}. العملة مفقودة!`);
            return amt;
        }
        
        const fRate = channel === 'deposit' ? ratesMap[fCode].depRate : ratesMap[fCode].priceRate;
        const tRate = channel === 'deposit' ? ratesMap[tCode].depRate : ratesMap[tCode].priceRate;
        
        if (fRate === 0 || tRate === 0) return amt; 
        
        return FinancialEngineDef.sanitizeAmount(FinancialEngineDef._internalMul(FinancialEngineDef._internalDiv(amt, fRate), tRate));
    },

    convertViaUSDHelper: function(amt, f, t, rates, rnd = 'round', c = 'pricing') {
        let v = FinancialEngineDef.convertViaUSD(amt, f, t, rates, c); 
        if (isNaN(v) || !isFinite(v)) return 0;

        const factor = Math.pow(10, FinancialEngineDef.CONFIG.PRECISION);
        let result = 0;

        if(rnd === 'floor') result = Math.floor((v + Number.EPSILON) * factor) / factor;
        else if(rnd === 'ceil') result = Math.ceil((v - Number.EPSILON) * factor) / factor;
        else result = Number(v.toFixed(FinancialEngineDef.CONFIG.PRECISION));

        return isNaN(result) ? 0 : result;
    },

    // ========================================================================
    // 💼 القسم الرابع: محاكاة التسعير والجدار الناري الصريح (Honest Simulator)
    // ========================================================================

    validateCoupon: function(code, prod, qty, optIdx, user, userTier, coupons = [], now = Date.now(), offer = null) {
        if (!code) return { valid: false, msg: 'لم يتم تقديم كود خصم' };
        
        if (offer && typeof offer === 'object' && offer.isActive !== false && offer.type !== 'fake') {
            return { valid: false, msg: 'عذراً، لا يمكن استخدام الكوبونات مع العروض الترويجية' };
        }

        const cp = coupons.find(c => String(c.code).toUpperCase() === String(code).toUpperCase());
        if (!cp) return { valid: false, msg: 'كوبون غير صحيح' };
        if (cp.isActive === false) return { valid: false, msg: 'الكوبون غير مفعل' };
        
        if (FinancialEngineDef.extractNum(cp.value) <= 0) {
            return { valid: false, msg: 'الكوبون غير صالح للاستخدام (قيمة معدومة)' };
        }
        
        const isCouponDisabled = (prod.disableCoupons === true || String(prod.disableCoupons).toLowerCase() === 'true');
        if (isCouponDisabled) return { valid: false, msg: 'عذراً، هذا المنتج لا يدعم الكوبونات' }; 

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

        // 🧮 1. سلطة التسعير (مطابقة السيرفر)
        if (isFixed) {
            currentPrice = activeOption ? FinancialEngineDef.extractNum(activeOption.fixedPriceUsd || activeOption.price || product.price) : FinancialEngineDef.extractNum(fixedPrice || product.fixedPriceUsd || product.price);
            tierName = "سعر ثابت";
        } else if (tier && typeof tier === 'object') {
            tierName = tier.nameAr || tier.name || tier.id || 'عضو';
            // 🛡️ التحديث الأمني: منع وراثة السعر الخاطئ من المنتج الأساسي للخيار
let tierPriceField;
if (activeOption) {
    // إذا كان العميل يشتري خياراً، ابحث في أسعار الخيار فقط
    tierPriceField = activeOption.tierPrices?.[tier.id];
} else {
    // إذا كان يشتري المنتج الأساسي، ابحث في أسعار المنتج الأساسي
    tierPriceField = product.tierPrices?.[tier.id];
}
            
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

        // 🏷️ 2. الخصومات
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

        // 🧱 3. سلطة الحماية (الجدار الناري - مطابقة السيرفر)
        let isFirewallViolated = false;
        let rejectionReason = null;

        if (cost > 0) {
            const absoluteMinMargin = FinancialEngineDef._internalMul(cost, FinancialEngineDef._internalDiv(FinancialEngineDef.CONFIG.MIN_MARGIN_PERCENT, 100));
            const safeMarginPrice = FinancialEngineDef._internalAdd(cost, absoluteMinMargin);
            
            if (currentPrice < safeMarginPrice) {
                isFirewallViolated = true;
                // 👁️ الشفافية المطلقة للأدمن: إرجاع السبب بدون إيقاف الكود (Throw Error)
                rejectionReason = `السعر النهائي (${currentPrice}$) يكسر حاجز الربح الآمن (${safeMarginPrice}$). السيرفر سيرفض هذه العملية حمايةً للأرباح!`;
            }
        }

        const finalPrice = currentPrice;
        const netProfitUsd = Math.max(0, FinancialEngineDef._internalSub(finalPrice, cost)); 
        let marginPct = finalPrice > 0 ? FinancialEngineDef._internalMul(FinancialEngineDef._internalDiv(netProfitUsd, finalPrice), 100) : 0;

        return {
            costUsd: FinancialEngineDef.sanitizeAmount(cost),
            tierPrice: FinancialEngineDef.sanitizeAmount(tierPrice), 
            originalPrice: FinancialEngineDef.sanitizeAmount(originalPrice), 
            finalPrice: FinancialEngineDef.sanitizeAmount(finalPrice), 
            tierName, offerName, 
            offerDiscount: FinancialEngineDef.sanitizeAmount(offerDiscount), 
            couponCode, 
            couponDiscount: FinancialEngineDef.sanitizeAmount(couponDiscount), 
            totalDiscount: FinancialEngineDef.sanitizeAmount(accumulatedDiscount),
            netProfitUsd: FinancialEngineDef.sanitizeAmount(netProfitUsd),
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
    },

    // ========================================================================
    // 👑 القسم الخامس: محرك مستويات العضوية والـ VIP (Tiers Engine)
    // ========================================================================
    
    getUserTier: function(user, tiers) {
        if (!tiers || !Array.isArray(tiers) || tiers.length === 0) return null;
        
        const safeUser = user || {};
        const userTierId = String(safeUser.tierId || safeUser.tier || 'TIER_DEFAULT');
        let foundTier = tiers.find(t => String(t.id) === userTierId);

        if (!foundTier) {
            foundTier = tiers.find(t => t.isDefault === true);
            if (!foundTier) foundTier = tiers.find(t => String(t.id) === 'TIER_DEFAULT');
            if (!foundTier) {
                const getThresh = (t) => Number(t.threshold || t.condition_amount || 0);
                const sortedBySafety = [...tiers].sort((a, b) => getThresh(a) - getThresh(b));
                foundTier = sortedBySafety[0];
            }
        }
        return foundTier;
    },

    // 🛡️ تمت إضافتها للأدمن لمحاكاة مسار إنفاق العملاء والترقيات
    processTierUpgrade: function(userData, tiersData, newOrderUsdAmount, serverNowMs = Date.now()) {
        const safeAdd = FinancialEngineDef.safeAdd;
        let currentTierObj = FinancialEngineDef.getUserTier(userData, tiersData);
        
        let currentCycleSpentUsd = Number(userData.tierCycleSpent || 0);
        const cycleStartMs = FinancialEngineDef.parseSafeTime(userData.tierCycleStartDate || serverNowMs);
        
        const daysPassed = (FinancialEngineDef.getStartOfUTCDay(serverNowMs) - FinancialEngineDef.getStartOfUTCDay(cycleStartMs)) / (24 * 60 * 60 * 1000);
        const isCycleExpired = daysPassed > Number(currentTierObj?.durationDays || 30);

        let activeTierObj = currentTierObj;
        
        if (isCycleExpired) { 
            currentCycleSpentUsd = 0; 
            if (userData.manualTierOverride !== true) { 
                activeTierObj = tiersData.find(t => t.isDefault) || currentTierObj; 
            }
        }

        const newTierCycleSpentUsd = FinancialEngineDef.sanitizeAmount(safeAdd(currentCycleSpentUsd, newOrderUsdAmount));
        const newTotalSpentUsd = FinancialEngineDef.sanitizeAmount(safeAdd(Number(userData.totalSpent || 0), newOrderUsdAmount));

        let finalTierId = activeTierObj.id;
        
        if (userData.manualTierOverride !== true && activeTierObj?.autoAdvance !== false) {
            const getThreshold = (t) => Number(t.threshold || t.condition_amount || 0);
            const earnedTiers = tiersData
                .filter(t => (t.autoAdvance !== false) && getThreshold(t) <= newTierCycleSpentUsd && getThreshold(t) > getThreshold(activeTierObj))
                .sort((a, b) => getThreshold(b) - getThreshold(a));
            
            if (earnedTiers.length > 0) finalTierId = earnedTiers[0].id;
        }

        const shouldUpdateCycleStart = (isCycleExpired || finalTierId !== activeTierObj.id || !userData.tierId);

        return {
            activeTierId: activeTierObj.id, 
            finalTierId: finalTierId,       
            newTierCycleSpentUsd: newTierCycleSpentUsd,
            newTotalSpentUsd: newTotalSpentUsd,
            shouldUpdateCycleStart: shouldUpdateCycleStart
        };
    },

    getTierProgress: function(user, tiers, nowTime) {
        if (!user || !tiers || !Array.isArray(tiers) || tiers.length === 0) return null;
        
        const sortedTiers = [...tiers].sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0));
        const currentTier = FinancialEngineDef.getUserTier(user, sortedTiers);
        
        if (!currentTier) return null;
        
        const spent = Number(user.tierCycleSpent || 0);
        const now = nowTime || Date.now();
        const cycleStart = FinancialEngineDef.parseSafeTime(user.tierCycleStartDate || now);
        
        const CYCLE_DAYS = Number(currentTier.durationDays || 30);
        const msPerDay = 1000 * 60 * 60 * 24;
        // حساب الأيام بناءً على منتصف الليل (تطابق السيرفر 100%)
const startOfNow = FinancialEngineDef.getStartOfUTCDay(now);
const startOfCycle = FinancialEngineDef.getStartOfUTCDay(cycleStart);
const daysPassed = Math.floor(Math.max(0, startOfNow - startOfCycle) / msPerDay);
        const remainingDays = Math.max(0, CYCLE_DAYS - daysPassed);

        let nextTier = null;
        for (const t of sortedTiers) {
            if (Number(t.threshold || 0) > Number(currentTier.threshold || 0)) {
                nextTier = t;
                break;
            }
        }
        
        const isMaxTier = !nextTier;
        const targetThreshold = isMaxTier ? Number(currentTier.threshold || 0) : Number(nextTier.threshold || 0);
        const targetNameDisplay = isMaxTier ? (currentTier.nameAr || currentTier.name) : (nextTier.nameAr || nextTier.name);
        
        let remainingAmt = Math.max(0, targetThreshold - spent);
        let percent = targetThreshold > 0 ? Math.min(100, (spent / targetThreshold) * 100) : 100;
        
        if (isMaxTier) { percent = 100; remainingAmt = 0; }

        if (user && user.manualTierOverride === true) {
            percent = 100;
            remainingAmt = 0;
        }

        return {
            currentTier,
            nextTier,
            isMaxTier,
            targetNameDisplay,
            targetThreshold,
            spent,
            remainingAmt,
            percent,
            remainingDays,
            isGoalReached: spent >= targetThreshold,
            isAutoAdvanceEnabled: true
        };
    },

    // 🛡️ جسر واجهة الإدارة: مخصصة حصرياً لكشف الأسرار للوحة الإدارة بالعملة المحددة
    getPricingLocal: function(prod, user, qty, optIdx, coupon, offer, tier, rates, baseCur, displayCur) {
        const params = {
            product: prod,
            tier: tier,
            offer: offer,
            coupon: coupon,
            optIdx: optIdx
        };

        const result = FinancialEngineDef.calculateOrderTotal(params, qty);

        const convert = (amt) => {
            return FinancialEngineDef.convertViaUSDHelper(
                amt, 
                FinancialEngineDef.CONFIG.BASE_CURRENCY, 
                displayCur, 
                rates, 
                'round', 
                'pricing'
            );
        };

        const unitFinalLocal = convert(result.finalPrice);
        const totalFinalLocal = convert(result.totalFinalPrice);
        const totalOriginalLocal = convert(result.totalOriginalPrice);

        return {
            unitText: `${unitFinalLocal.toFixed(2)} ${displayCur}`,
            totalText: `${totalFinalLocal.toFixed(2)} ${displayCur}`,
            displayCurrency: displayCur,
            totalDisplayNum: totalFinalLocal,
            totalLocalBase: result.totalFinalPrice,
            oldTotalDisplayNum: totalOriginalLocal,
            oldTotalLocalBase: result.totalOriginalPrice,
            hasDiscount: result.totalDiscount > 0,
            pricingSnapshot: {
                totalOriginalPrice: result.totalOriginalPrice,
                finalPrice: result.totalFinalPrice,
                couponDiscount: result.couponDiscount,
                offerDiscount: result.offerDiscount,
                couponCode: result.couponCode,
                offerName: result.offerName,
                isFirewallViolated: result.isFirewallViolated,
                rejectionReason: result.rejectionReason,
                
                // 👁️ الشفافية المطلقة للإدارة: تصدير التكلفة والربح ليعرض في الواجهة
                totalCostUsd: result.totalCostUsd,
                totalNetProfitUsd: result.totalNetProfitUsd,
                marginPct: result.marginPct
            }
        };
    }
};

export const FinancialEngine = Object.freeze(FinancialEngineDef);
if (typeof window !== 'undefined') { window.FinancialEngine = FinancialEngine; }