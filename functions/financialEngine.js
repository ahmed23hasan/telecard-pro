// ============================================================================
// 💰 المحرك المالي المركزي (Server Edition) - النسخة V30.5.0 👑 (The Fortress)
// 🎯 الوظيفة: الحساب المالي السيادي، حماية الأرباح، تسعير البوابات والـ VIP.
// 🚀 التحديثات المعمارية الجديدة (V30.5.0 - Flexible Floor Patch):
// 1. Flexible Floor 🛡️: الكوبونات تقتطع بحد أقصى 50% من هامش ربح المستوى ولا تمسه بالكامل.
// 2. Strict Conversion 💱: منع التجاهل الصامت لأخطاء تحويل العملات لحماية الإيداعات.
// 3. Separation of Powers ⚖️: فصل سلطة التسعير (المستويات) عن سلطة الحماية (الجدار الناري).
// 4. Absolute Tier Respect 👑: احترام مطلق للحد الأدنى للربح (minProfitUsd) الخاص بالمستويات.
// ============================================================================

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
        MAX_PRICE_LIMIT: 1000000, 
        PRECISION: 4,          
        INTERNAL_PRECISION: 8, 
        MIN_SALE_PRICE: 0.01,         
        // 🛡️ الجدار الناري التشغيلي يحمي التكلفة مضافاً إليها رسوم بوابات الدفع (0.5%) كحد أدنى قطعي.
        MIN_MARGIN_PERCENT: 0.5,        
        MAX_GLOBAL_DISCOUNT_PCT: 95   
    }),

    // ========================================================================
    // 🧮 القسم الأول: محرك الرياضيات الدقيق (Precision Math Core)
    // ========================================================================

    sanitizeAmount: function(amount) {
        const num = Number(amount);
        if (isNaN(num) || !isFinite(num)) return 0;
        return Number(Math.round(num + 'e4') + 'e-4');
    },

    _internalAdd: function(a, b) { return FinancialEngineDef.sanitizeAmount((Number(a) || 0) + (Number(b) || 0)); },
    _internalSub: function(a, b) { return FinancialEngineDef.sanitizeAmount((Number(a) || 0) - (Number(b) || 0)); },
    _internalMul: function(a, b) { return FinancialEngineDef.sanitizeAmount((Number(a) || 0) * (Number(b) || 0)); },
    
    _internalDiv: function(a, b) {
        const numA = Number(a) || 0;
        const numB = Number(b) || 0;
        
        if (numB === 0) {
            throw new FinancialSecurityError("عملية حسابية غير صالحة (قسمة على صفر). يرجى مراجعة إعدادات أسعار الصرف ونسب الخصم.");
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
        if (!allowZero && num === 0) return 0; 
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
},
    // ========================================================================
    // 🗄️ القسم الثاني: مزود بيانات النظام (Dependency Injection Helper)
    // ========================================================================
    
    fetchSystemData: async function(transaction, db) {
        const configCacheRef = db.collection('telecard_system').doc('active_configs');
        const pricingCacheRef = db.collection('telecard_system').doc('active_pricing');

        const [configSnap, pricingSnap] = await Promise.all([
            transaction.get(configCacheRef),
            transaction.get(pricingCacheRef)
        ]);

        let ratesData = [], paymentsData = [], tiersData = [], liveOffers = [];

        if (configSnap.exists && Array.isArray(configSnap.data().rates)) {
            const cacheData = configSnap.data();
            ratesData = cacheData.rates || [];
            paymentsData = cacheData.payments || [];
        } else {
            const [ratesQuery, paymentsQuery] = await Promise.all([
                transaction.get(db.collection('telecard_rates')),
                transaction.get(db.collection('telecard_payments'))
            ]);
            ratesData = ratesQuery.docs.map(d => d.data());
            paymentsData = paymentsQuery.docs.map(d => d.data());
        }

        if (pricingSnap.exists && Array.isArray(pricingSnap.data().tiers)) {
            const cacheData = pricingSnap.data();
            tiersData = cacheData.tiers || [];
            liveOffers = cacheData.offers || [];
        } else {
            const [tiersQuery, offersQuery] = await Promise.all([
                transaction.get(db.collection('telecard_tiers')),
                transaction.get(db.collection('telecard_offers').where('isActive', '==', true))
            ]);
            tiersData = tiersQuery.docs.map(d => ({ id: d.id, ...d.data() }));
            liveOffers = offersQuery.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        return { ratesData, paymentsData, tiersData, liveOffers };
    },

    // ========================================================================
    // 🏦 القسم الثالث: معالجة الإيداعات ورسوم البوابات
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
        
        if (!method || typeof method !== 'object') return { isValid: false, msg: 'طريقة الدفع غير صالحة أو مفقودة' };
        if (cleanAmt <= 0) return { isValid: false, msg: 'مبلغ الإيداع غير صالح' };

        const curr = String(payCurr || 'USD').toUpperCase();
        
        let s = method.currencySettings?.[curr] 
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
                fee: parseFloat(method.fee || method.value) || 0, 
                min: parseFloat(method.min || method.minVal) || 0, 
                max: parseFloat(method.max || method.maxVal) || 0, 
                minFee: parseFloat(method.minFee) || 0, 
                maxFee: parseFloat(method.maxFee) || 0,
                feeType: method.feeType || method.type || 'fee', 
                feeUnit: method.feeUnit || method.fee_unit || method.unit || 'percent' 
              };

        let rawGlobalMaxUsd = parseFloat(globalSettings?.globalMaxDepositUsd || globalSettings?.maxDeposit);
        let globalMaxUsd = (isNaN(rawGlobalMaxUsd) || rawGlobalMaxUsd <= 0) ? 5000 : rawGlobalMaxUsd;
        
        let dynamicGlobalMax = globalMaxUsd;
        if (curr !== 'USD') {
            dynamicGlobalMax = FinancialEngineDef.convertViaUSD(globalMaxUsd, 'USD', curr, rates, 'deposit');
        }

        if (s.min > 0 && cleanAmt < s.min) return { isValid: false, msg: 'أقل من الحد الأدنى المسموح' };

        if (s.max > 0) {
            if (cleanAmt > s.max) return { isValid: false, msg: 'تجاوز الحد الأقصى للمحفظة' };
        } else {
            if (cleanAmt > dynamicGlobalMax) return { isValid: false, msg: 'تجاوز الحد العام للإيداعات' };
        }

        const netPayCurr = FinancialEngineDef.calculateDepositNet(cleanAmt, s);
        let netBase = FinancialEngineDef.convertViaUSDHelper(netPayCurr, curr, baseCur, rates, 'floor', 'deposit');
        
        return { isValid: true, netBase: isNaN(netBase) ? 0 : netBase, feePct: s.fee, feeType: s.feeType, feeUnit: s.feeUnit };
    },

    // ========================================================================
    // 💱 القسم الثالث: محول العملات المتعدد
    // ========================================================================

    normalizeRates: function(raw) {
        const ratesMap = {};
        
        ratesMap[FinancialEngineDef.CONFIG.BASE_CURRENCY] = { 
            code: FinancialEngineDef.CONFIG.BASE_CURRENCY, 
            priceRate: 1, 
            depRate: 1, 
            isBase: true 
        };
        
        const processRateObj = (rawCode, priceR, depR) => {
            if (!rawCode) return;
            const code = String(rawCode).trim().toUpperCase();
            if (!code || code === FinancialEngineDef.CONFIG.BASE_CURRENCY) return;
            const numPrice = FinancialEngineDef.extractNum(priceR);
            const numDep = FinancialEngineDef.extractNum(depR);
            
            if (numPrice === 0 || numDep === 0) {
                throw new FinancialSecurityError(`سعر صرف صفري أو مفقود للعملة [${code}]. تم إيقاف التسعير لحماية المتجر.`);
            }
            ratesMap[code] = { code, priceRate: numPrice, depRate: numDep };
        };

        if (!raw || typeof raw !== 'object') return ratesMap; 

        if (Array.isArray(raw)) {
            for (const rate of raw) {
                if (rate && typeof rate === 'object') {
                    processRateObj(rate.code, rate.priceRate || rate.value, rate.depRate || rate.value);
                }
            }
        } else {
            const invalidKeys = new Set(['ISBASE', 'PRICERATE', 'DEPRATE', 'CODE', 'VALUE', 'SYMBOL', 'NAME']);
            for (const [key, value] of Object.entries(raw)) {
                if (!value || typeof value !== 'object') continue;
                const safeKey = String(key).trim().toUpperCase();
                if (invalidKeys.has(safeKey)) continue;
                const code = value.code || safeKey;
                processRateObj(code, value.priceRate || value.value, value.depRate || value.value);
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
            throw new FinancialSecurityError(`فشل التحويل المالي من ${fCode} إلى ${tCode}. إحدى العملات غير مسجلة في أسعار الصرف.`);
        }
        
        const fRate = channel === 'deposit' ? ratesMap[fCode].depRate : ratesMap[fCode].priceRate;
        const tRate = channel === 'deposit' ? ratesMap[tCode].depRate : ratesMap[tCode].priceRate;
        
        if (fRate === 0 || tRate === 0) throw new FinancialSecurityError(`انعدام في قيمة سعر الصرف. العملية مرفوضة.`);

        return FinancialEngineDef.sanitizeAmount(FinancialEngineDef._internalMul(FinancialEngineDef._internalDiv(amt, fRate), tRate));
    },

    // 🚨 تحذير للمطورين: هذه الدالة ترمي خطأ (Error) في حال فشل التحويل. 
    // يُمنع استخدام catch(e){} فارغة عند استدعاء هذه الدالة في الملفات الأخرى (مثل index.js)
    convertViaUSDHelper: function(amt, f, t, rates, rnd = 'round', c = 'pricing') {
        try {
            let v = FinancialEngineDef.convertViaUSD(amt, f, t, rates, c);
            if (isNaN(v) || !isFinite(v)) throw new FinancialSecurityError(`تحويل العملة أنتج قيمة رياضية غير صالحة.`);
            
            const factor = Math.pow(10, FinancialEngineDef.CONFIG.PRECISION);
            let result = 0;
            
            if(rnd === 'floor') result = Math.floor((v + Number.EPSILON) * factor) / factor;
            else if(rnd === 'ceil') result = Math.ceil((v - Number.EPSILON) * factor) / factor;
            else result = Number(v.toFixed(FinancialEngineDef.CONFIG.PRECISION));
            
            if (isNaN(result)) throw new FinancialSecurityError(`نتيجة التقريب غير صالحة.`);
            return result;
        } catch (e) {
            throw new FinancialSecurityError(`[محول العملات]: ${e.message}`);
        }
    },

    // ========================================================================
    // 💼 القسم الرابع: محاكاة التسعير والجدار الناري (Business Logic & Firewall)
    // ========================================================================

    validateCoupon: function(code, prod, qty, optIdx, user, userTier, coupons = [], now = Date.now(), offer = null) {
        const safeCode = String(code || '').trim().toUpperCase();
        if (!safeCode) return { valid: false, msg: 'لم يتم تقديم كود خصم' };
        
        if (offer && typeof offer === 'object' && offer.isActive !== false && offer.type !== 'fake') {
            return { valid: false, msg: 'لا يمكن استخدام الكوبونات مع العروض' };
        }

        const cp = coupons.find(c => String(c.code).toUpperCase() === safeCode);
        if (!cp) return { valid: false, msg: 'كوبون غير صحيح' };
        if (cp.isActive === false) return { valid: false, msg: 'الكوبون غير مفعل' };
        
        if (FinancialEngineDef.extractNum(cp.value) <= 0) return { valid: false, msg: 'الكوبون غير صالح' };
        
        const isCouponDisabled = (prod.disableCoupons === true || String(prod.disableCoupons).toLowerCase() === 'true');
        if (isCouponDisabled) return { valid: false, msg: 'المنتج لا يدعم الكوبونات' }; 

        if (cp.startDate) {
            const startMs = FinancialEngineDef.parseSafeTime(cp.startDate);
            if (startMs > 0 && now < startMs) return { valid: false, msg: 'لم تبدأ الصلاحية' };
        }

        if (cp.expiryDate) {
            const expiryMs = FinancialEngineDef.parseSafeTime(cp.expiryDate);
            if (expiryMs > 0 && now > expiryMs) return { valid: false, msg: 'انتهت الصلاحية' };
        }
        
        if (Number(cp.maxUses) > 0 && Number(cp.usedCount || 0) >= Number(cp.maxUses)) return { valid: false, msg: 'استنفد الحد الأقصى' };
        
        if (Array.isArray(cp.targetTiers) && cp.targetTiers.length > 0 && !cp.targetTiers.includes(String(userTier?.id))) {
            return { valid: false, msg: 'غير متاح لمستوى عضويتك' };
        }
        
        const isProdMatched = (Array.isArray(cp.targetProds) && cp.targetProds.length > 0) ? cp.targetProds.includes(String(prod.id)) : true;
        let isCatMatched = true;

        if (Array.isArray(cp.targetCategories) && cp.targetCategories.length > 0) {
            const prodCats = [].concat(prod.catId, prod.categoryIds, prod.categoryId, prod.category_id).filter(Boolean).map(String);
            isCatMatched = cp.targetCategories.some(cid => prodCats.includes(String(cid)));
        }

        const hasTargetProds = Array.isArray(cp.targetProds) && cp.targetProds.length > 0;
        const hasTargetCats = Array.isArray(cp.targetCategories) && cp.targetCategories.length > 0;

        if (hasTargetProds || hasTargetCats) {
            if (!isProdMatched && !isCatMatched) return { valid: false, msg: 'غير مخصص لهذا المنتج' };
        }

        if (Array.isArray(cp.allowedUsers) && cp.allowedUsers.length > 0) {
            const userIdString = String(user?.uid || user?.id);
            if (!cp.allowedUsers.some(u => String(u) === userIdString)) return { valid: false, msg: 'غير مسموح لك باستخدامه' };
        } 
        
        if (Number(cp.minOrder) > 0) {
            const tempPrice = FinancialEngineDef.calculateOrderTotal({ product: prod, tier: userTier, optIdx, offer: null }, qty);
            if (tempPrice.totalFinalPrice < Number(cp.minOrder)) return { valid: false, msg: `الحد الأدنى ${cp.minOrder}$` };
        }
        
        return { valid: true, coupon: { code: cp.code, type: cp.type, value: cp.value, maxDiscount: cp.maxDiscount, isActive: cp.isActive } };
    },

    calculatePrice: function(params = {}) {
        const { product = {}, costPrice = 0, fixedPrice = 0, tier = null, offer = null, coupon = null, optIdx = null } = params;
        
        if (!product || typeof product !== 'object' || Object.keys(product).length === 0) throw new FinancialSecurityError("بيانات المنتج مفقودة.");

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
                throw new FinancialSecurityError(`الخيار المحدد غير صالح للمنتج (${product.id}).`);
            }
        }
        
        if (cost > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) throw new FinancialSecurityError("سعر التكلفة يتجاوز الحد الآمن.");

        let currentPrice = activeOption ? FinancialEngineDef.extractNum(activeOption.price || product.price) : FinancialEngineDef.extractNum(product.price);
        let tierName = "عضو";

        // 🧮 1. سلطة التسعير: احترام إعدادات المستوى (Tier) بشكل مطلق
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
        
        if (currentPrice > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) throw new FinancialSecurityError("سعر البيع يتجاوز الحد الآمن.");

        const originalPrice = currentPrice;
        const allowsDiscounts = !isFixed; 

        // 🏷️ 2. تطبيق الخصومات والكوبونات (مع نظام الحد الأدنى المرن)
        let offerName = null, offerDiscount = 0, couponCode = null, couponDiscount = 0;
        
        const absoluteMaxDiscountAllowable = FinancialEngineDef._internalMul(originalPrice, FinancialEngineDef._internalDiv(FinancialEngineDef.CONFIG.MAX_GLOBAL_DISCOUNT_PCT, 100));
        let accumulatedDiscount = 0;

if (allowsDiscounts && offer && offer.type !== 'fake' && offer.isActive !== false) {
    offerName = offer.name || null;
    const offerVal = FinancialEngineDef.extractNum(offer.value);
    let rawOfferDisc = offer.type === 'percentage' ? FinancialEngineDef._internalMul(originalPrice, FinancialEngineDef._internalDiv(offerVal, 100)) : offerVal;
    
    // العروض تخضع للحد الأقصى العام (95%)
    offerDiscount = Math.min(rawOfferDisc, absoluteMaxDiscountAllowable);
    accumulatedDiscount = FinancialEngineDef._internalAdd(accumulatedDiscount, offerDiscount);
}

const isCouponDisabled = (product.disableCoupons === true || String(product.disableCoupons).toLowerCase() === 'true');

if (allowsDiscounts && !isCouponDisabled && offerDiscount === 0 && coupon && coupon.isActive !== false) {
    couponCode = coupon.code || null;
    const coupVal = FinancialEngineDef.extractNum(coupon.value);
    
    let rawCouponDisc = coupon.type === 'percentage' ? FinancialEngineDef._internalMul(originalPrice, FinancialEngineDef._internalDiv(coupVal, 100)) : coupVal;
    
    const maxCap = FinancialEngineDef.extractNum(coupon.maxDiscount);
    if (maxCap > 0) rawCouponDisc = Math.min(rawCouponDisc, maxCap);
    
    // حساب القدرة المتبقية للخصم بناءً على الحد العام (95%)
    const remainingDiscountCapacity = Math.max(0, FinancialEngineDef._internalSub(absoluteMaxDiscountAllowable, accumulatedDiscount));
    
    couponDiscount = Math.min(rawCouponDisc, remainingDiscountCapacity);
    accumulatedDiscount = FinancialEngineDef._internalAdd(accumulatedDiscount, couponDiscount);
}

currentPrice = Math.max(FinancialEngineDef.CONFIG.MIN_SALE_PRICE, FinancialEngineDef._internalSub(originalPrice, accumulatedDiscount));

// 🧱 3. سلطة الحماية (الجدار الناري التشغيلي): خط الدفاع الأخير لحماية رأس المال ورسوم البوابات
let isFirewallViolated = false;
let rejectionReason = null;

if (cost > 0) {
    const absoluteMinMargin = FinancialEngineDef._internalMul(cost, FinancialEngineDef._internalDiv(FinancialEngineDef.CONFIG.MIN_MARGIN_PERCENT, 100));
    const safeMarginPrice = FinancialEngineDef._internalAdd(cost, absoluteMinMargin);
    
    if (currentPrice < safeMarginPrice) {
        isFirewallViolated = true;
        rejectionReason = `السعر النهائي أقل من الحد الأدنى المسموح به. العملية مرفوضة!`;
        throw new FinancialSecurityError(rejectionReason);
    }
}
        const profit = Math.max(0, FinancialEngineDef._internalSub(currentPrice, cost));
        let marginPct = currentPrice > 0 ? FinancialEngineDef._internalMul(FinancialEngineDef._internalDiv(profit, currentPrice), 100) : 0;

        return {
            costUsd: FinancialEngineDef.sanitizeAmount(cost), 
            originalPrice: FinancialEngineDef.sanitizeAmount(originalPrice),
            finalPrice: FinancialEngineDef.sanitizeAmount(currentPrice), 
            tierName, 
            offerName,
            offerDiscount: FinancialEngineDef.sanitizeAmount(offerDiscount), 
            couponCode,
            couponDiscount: FinancialEngineDef.sanitizeAmount(couponDiscount),
            totalDiscount: FinancialEngineDef.sanitizeAmount(accumulatedDiscount),
            netProfitUsd: FinancialEngineDef.sanitizeAmount(profit), 
            marginPct: Number(marginPct.toFixed(2)),
            isFirewallViolated, 
            rejectionReason
        };
    },
    
    calculateOrderTotal: function(params = {}, rawQty = 1) {
        let qty = Math.floor(FinancialEngineDef.extractNum(rawQty));
        if (qty <= 0) qty = 1;
        if (qty > FinancialEngineDef.CONFIG.MAX_QTY_LIMIT) throw new FinancialSecurityError("الكمية المطلوبة تتجاوز الحد المسموح.");
        
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
    },

    // ========================================================================
    // 👑 القسم السادس: محرك مستويات العضوية (الترقيات المحصنة)
    // ========================================================================

    getUserTier: function(user, tiers) {
        if (!tiers || !Array.isArray(tiers) || tiers.length === 0) return null;
        
        const safeUser = user || {};
        const userTierId = String(safeUser.tierId || safeUser.tier || 'TIER_DEFAULT');
        let foundTier = tiers.find(t => String(t.id) === userTierId);
        
        if (!foundTier) {
            foundTier = tiers.find(t => t.isDefault === true) || tiers.find(t => String(t.id) === 'TIER_DEFAULT');
            if (!foundTier) {
                const getThresh = (t) => Number(t.threshold || t.condition_amount || 0);
                const sortedBySafety = [...tiers].sort((a, b) => getThresh(a) - getThresh(b));
                foundTier = sortedBySafety[0];
            }
        }
        return foundTier;
    },

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
        
        const spent = Number(user.tierCycleSpent || 0);
        const now = nowTime || Date.now();
        const cycleStart = FinancialEngineDef.parseSafeTime(user.tierCycleStartDate || now);
        
        const CYCLE_DAYS = Number(currentTier.durationDays || 30);
        const msPerDay = 1000 * 60 * 60 * 24;
        // توحيد حساب الأيام ليعتمد على منتصف الليل (Calendar Days) بدلاً من 24 ساعة
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
    }
};

module.exports = Object.freeze({
    ...FinancialEngineDef,
    FinancialSecurityError
});
