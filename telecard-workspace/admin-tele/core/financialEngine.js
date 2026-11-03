// ============================================================================
// 💰 المحرك المالي المركزي (Admin Edition) - النسخة الماسية V35.1.0 💎 (The Citadel)
// 🎯 الوظيفة: محاكاة أسعار السيرفر 100%، كشف الأرباح، وتشخيص الأخطاء بشفافية مطلقة للمدير.
// 🚀 التحديثات المعمارية (V35.1.0 - Full Server Parity, Counter Precision & Floor Maturity Shield):
// 1. Causal Tier Climbs Ledger 🪜: مطابقة processTierUpgrade و processTierRefund و getTierProgress مع السيرفر.
// 2. Counter Unit & Precision Shield 🔬: دقة 8 خانات لوحدة العداد، حماية totalCostUsd و sanitizedTotalOriginalPrice من التصفير، وتثبيت unit.finalPrice عند انعدام الخصم.
// 3. Strict Promo & Coupon Isolation 🛡️: منع قاطع للجمع بين الكوبون والعرض وفحص الصلاحية الزمنية لحظياً وتوحيد isFirewallViolated.
// 4. Order Margin Recalibration 📊: إعادة حساب هامش الربح (marginPct) بناءً على الإجمالي بعد تطبيق سقف الكوبون.
// 5. Unified Tier Overrides Context & Floor Maturity Parity 🔒: ربط customTierOverrides بالكتالوج العام حصراً، وتحصين نضج أرضية المستويات وتصفية الترقيات تحت الأرضية.
// ============================================================================

export class FinancialSecurityError extends Error {
    constructor(message) {
        const cleanMsg = String(message || '').replace(/^\[SECURITY\]\s*/g, '');
        super(`[SECURITY] ${cleanMsg}`);
        this.name = "FinancialSecurityError";
    }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const FinancialEngineDef = { 
    CONFIG: Object.freeze({ 
        BASE_CURRENCY: 'USD',
        MAX_QTY_LIMIT: 5000000, 
        MAX_PRICE_LIMIT: 5000, 
        PRECISION: 4,
        INTERNAL_PRECISION: 8, 
        MIN_SALE_PRICE: 0.01, 
        MIN_MARGIN_PERCENT: 0.5, // 🛡️ درع حماية رأس المال وامتصاص انزلاق العملات
        MAX_GLOBAL_DISCOUNT_PCT: 95
    }),

    // ========================================================================
    // 🧮 القسم الأول: محرك الرياضيات الدقيق (Precision Math Core - Server Synced)
    // ========================================================================

    sanitizeAmount: function(amount) {
        const num = Number(amount);
        if (isNaN(num) || !isFinite(num)) return 0;
        const absNum = Math.abs(num);
        if (absNum < 0.00005) return 0;
        if (absNum >= 1e15) return Math.round(num * 1e4) / 1e4;
        return Number(Math.round(num + 'e4') + 'e-4');
    },

    _internalSanitize: function(amount) {
        const num = Number(amount);
        if (isNaN(num) || !isFinite(num)) return 0;
        const absNum = Math.abs(num);
        if (absNum < 5e-9) return 0;
        if (absNum < 1e-6 || absNum >= 1e15) {
            return Math.round(num * 1e8) / 1e8;
        }
        return Number(Math.round(num + 'e8') + 'e-8');
    },

    _internalAdd: function(a, b) { return FinancialEngineDef._internalSanitize((Number(a) || 0) + (Number(b) || 0)); },
    _internalSub: function(a, b) { return FinancialEngineDef._internalSanitize((Number(a) || 0) - (Number(b) || 0)); },
    _internalMul: function(a, b) { return FinancialEngineDef._internalSanitize((Number(a) || 0) * (Number(b) || 0)); },
    
    _internalDiv: function(a, b) {
        const numA = Number(a) || 0;
        const numB = Number(b) || 0;
        if (numB === 0) return 0; 
        return FinancialEngineDef._internalSanitize(numA / numB);
    },

    safeAdd: function(a, b) { return FinancialEngineDef._internalAdd(a, b); },
    safeSub: function(a, b) { return FinancialEngineDef._internalSub(a, b); },
    safeMul: function(a, b) { return FinancialEngineDef._internalMul(a, b); },
    safeDiv: function(a, b) { return FinancialEngineDef._internalDiv(a, b); },

    extractNum: function(val, allowZero = true) {
        if (val === undefined || val === null || val === '' || typeof val === 'boolean' || Array.isArray(val) || typeof val === 'object') return 0;
        const num = Number(val);
        if (isNaN(num) || !isFinite(num) || num < 0) return 0;
        if (!allowZero && num === 0) return 0;
        return num;
    },

    parseSafeTime: function(val) {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return val;
        if (typeof val.toMillis === 'function') return val.toMillis();
        if (val.seconds !== undefined) return val.seconds * 1000;
        if (val._seconds !== undefined) return val._seconds * 1000;
        if (val instanceof Date) return val.getTime();
        if (typeof val === 'string') {
            let parsed = new Date(val).getTime();
            if (isNaN(parsed)) {
                parsed = new Date(val.replace(/-/g, '/')).getTime();
            }
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    },

    getStartOfUTCDay: function(timestampMs) {
        const d = new Date(timestampMs);
        d.setUTCHours(0, 0, 0, 0);
        return d.getTime();
    },

    // ========================================================================
    // 🏦 القسم الثاني: معالجة الإيداعات ورسوم البوابات
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
            const safePct = (feeType === 'fee' && feeVal > 75) ? 75 : feeVal;
            feeAmount = FinancialEngineDef.safeMul(amt, FinancialEngineDef.safeDiv(safePct, 100));
        }

        const minFee = FinancialEngineDef.extractNum(feeSettings.minFee);
        const maxFee = FinancialEngineDef.extractNum(feeSettings.maxFee);
        
        if (minFee > 0 && feeAmount < minFee) feeAmount = minFee;
        if (maxFee > 0 && feeAmount > maxFee) feeAmount = maxFee;

        if (feeType === 'bonus') {
            if (feeAmount > amt) {
                feeAmount = amt;
            }
            return FinancialEngineDef.safeAdd(amt, feeAmount);
        }

        return Math.max(0, FinancialEngineDef.safeSub(amt, feeAmount));
    },

    calculateDepositFee: function(amt, method, payCurr, baseCur = 'USD', rates = [], globalSettings = {}) {
        const cleanAmt = FinancialEngineDef.extractNum(amt, true);
        
        if (!method || typeof method !== 'object' || method.isActive === false) {
            return { isValid: false, msg: 'طريقة الدفع غير صالحة أو معطلة حالياً' };
        }
        if (cleanAmt <= 0) return { isValid: false, msg: 'مبلغ الإيداع غير صالح' };

        const curr = String(payCurr || 'USD').toUpperCase();
        
        const hasCurrSettingsMap = method.currencySettings && typeof method.currencySettings === 'object' && Object.keys(method.currencySettings).length > 0;
        
        if (hasCurrSettingsMap) {
            if (!method.currencySettings[curr]) {
                return { isValid: false, msg: `عملة الدفع (${curr}) غير مدعومة في هذه البوابة.` };
            }
        } else if (method.currency || method.curr) {
            const explicitGatewayCurr = String(method.currency || method.curr).trim().toUpperCase();
            if (curr !== explicitGatewayCurr) {
                return { isValid: false, msg: `عملة الدفع (${curr}) غير مدعومة في هذه البوابة.` };
            }
        } else {
            const rootFeeUnit = method.feeUnit || method.fee_unit || method.unit || 'percent';
            const rootMinFee = parseFloat(method.minFee) || 0;
            const rootMaxFee = parseFloat(method.maxFee) || 0;
            const rootMin = parseFloat(method.min || method.minVal) || 0;
            const rootMax = parseFloat(method.max || method.maxVal) || 0;
            
            if ((rootFeeUnit === 'fixed' && (parseFloat(method.fee || method.value) || 0) > 0) || 
                rootMinFee > 0 || rootMaxFee > 0 || rootMin > 0 || rootMax > 0) {
                return { isValid: false, msg: 'يرجى تحديد إعدادات العملة في هذه البوابة أولاً لتفعيل الحدود أو الرسوم الثابتة.' };
            }
        }
        
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

        if (s.min > 0 && cleanAmt < s.min) return { isValid: false, msg: `عذراً، أقل مبلغ للإيداع هو ${s.min} ${curr}`, adminMax: s.max, adminMin: s.min };

        if (s.max > 0) {
            if (cleanAmt > s.max) return { isValid: false, msg: `أقصى حد للإيداع بطريقة الدفع هذه هو ${s.max} ${curr}`, adminMax: s.max, adminMin: s.min };
        } else {
            if (cleanAmt > dynamicGlobalMax) {
                const displayLimit = Math.floor(dynamicGlobalMax); 
                return { isValid: false, msg: `أقصى حد للإيداع في المرة الواحدة هو ${displayLimit} ${curr}`, adminMax: s.max, adminMin: s.min };
            }
        }

        const netPayCurr = FinancialEngineDef.calculateDepositNet(cleanAmt, s);
        if (netPayCurr <= 0) {
            return { isValid: false, msg: 'المبلغ المودع صغير جداً ولا يغطي رسوم بوابة الدفع.', adminMax: s.max, adminMin: s.min };
        }

        const feeAmount = FinancialEngineDef.sanitizeAmount(Math.abs(FinancialEngineDef.safeSub(cleanAmt, netPayCurr)));
        let netBase = FinancialEngineDef.convertViaUSDHelper(netPayCurr, curr, baseCur, rates, 'floor', 'deposit');
        if (isNaN(netBase) || netBase <= 0) {
            return { isValid: false, msg: 'المبلغ الصافي بعد تحويل العملة صغير جداً ولا يمكن قيده.', adminMax: s.max, adminMin: s.min };
        }
        
        return { 
            isValid: true, 
            netBase: isNaN(netBase) ? 0 : netBase, 
            netPayCurr: FinancialEngineDef.sanitizeAmount(netPayCurr),
            feeAmount: feeAmount,
            feePct: s.fee, 
            feeType: s.feeType, 
            feeUnit: s.feeUnit, 
            adminMax: s.max, 
            adminMin: s.min 
        };
    },

    // ========================================================================
    // 💱 القسم الثالث: محول العملات المتعدد (مع إنذار الإدارة المبكر)
    // ========================================================================

    normalizeRates: function(raw) {
        const ratesMap = {};
        ratesMap[FinancialEngineDef.CONFIG.BASE_CURRENCY] = { 
            code: FinancialEngineDef.CONFIG.BASE_CURRENCY, 
            symbol: '$', 
            name: 'دولار أمريكي', 
            priceRate: 1, 
            depRate: 1, 
            isBase: true 
        };
        
        const processRateObj = (rawCode, priceR, depR, symbol, name) => {
            if (!rawCode) return;
            const code = String(rawCode).trim().toUpperCase();
            if (!code || code === FinancialEngineDef.CONFIG.BASE_CURRENCY) return;

            const numPrice = FinancialEngineDef.extractNum(priceR);
            const numDep = FinancialEngineDef.extractNum(depR);
            
            if (numPrice <= 0 || numDep <= 0) {
                console.warn(`🚨 [Admin UI Guard]: تم رصد سعر صرف صفري لعملة [${code}]. تم فرض القيمة (1) مؤقتاً لحين إصلاحه.`);
                
                if (typeof window !== 'undefined' && window.EventBus) {
                    window.EventBus.emit('critical-fx-alert', { code: code });
                }

                ratesMap[code] = { code: code, symbol: symbol || code, name: name || code, priceRate: numPrice || 1, depRate: numDep || 1 };
                return;
            }
            
            ratesMap[code] = { code, symbol: symbol || code, name: name || code, priceRate: numPrice, depRate: numDep };
        };

        if (!raw || typeof raw !== 'object') return ratesMap;

        if (Array.isArray(raw)) {
            for (const rate of raw) {
                if (rate && typeof rate === 'object') {
                    processRateObj(rate.code, rate.priceRate || rate.value, rate.depRate || rate.value, rate.symbol, rate.name);
                }
            }
        } else {
            const invalidKeys = new Set(['ISBASE', 'PRICERATE', 'DEPRATE', 'CODE', 'VALUE', 'SYMBOL', 'NAME']);
            for (const [key, value] of Object.entries(raw)) {
                if (!value || typeof value !== 'object') continue;
                const safeKey = String(key).trim().toUpperCase();
                if (invalidKeys.has(safeKey)) continue;
                const code = value.code || safeKey;
                processRateObj(code, value.priceRate || value.value, value.depRate || value.value, value.symbol, value.name);
            }
        }
        return ratesMap;
    },

    convertViaUSD: function(amount, fromCode, toCode, ratesRaw, channel = 'pricing', rawInternal = false) {
        const amt = FinancialEngineDef.extractNum(amount);
        const fCode = String(fromCode || FinancialEngineDef.CONFIG.BASE_CURRENCY).toUpperCase();
        const tCode = String(toCode || FinancialEngineDef.CONFIG.BASE_CURRENCY).toUpperCase();
        if (amt === 0 || fCode === tCode) return amt;
        
        const ratesMap = FinancialEngineDef.normalizeRates(ratesRaw);
        
        if (!ratesMap[fCode] || !ratesMap[tCode]) {
            return amt;
        }
        
        let fRate = channel === 'deposit' ? ratesMap[fCode].depRate : ratesMap[fCode].priceRate;
        let tRate = channel === 'deposit' ? ratesMap[tCode].depRate : ratesMap[tCode].priceRate;
        
        if (channel === 'deposit' && fCode !== tCode) {
            if (fCode !== FinancialEngineDef.CONFIG.BASE_CURRENCY) {
                fRate = Math.max(ratesMap[fCode].depRate, ratesMap[fCode].priceRate);
            }
            if (tCode !== FinancialEngineDef.CONFIG.BASE_CURRENCY) {
                tRate = Math.min(ratesMap[tCode].depRate, ratesMap[tCode].priceRate);
            }
        }
        
        if (fRate === 0 || tRate === 0) return 0; 
        
        const exactInternalVal = FinancialEngineDef._internalMul(FinancialEngineDef._internalDiv(amt, fRate), tRate);
        return rawInternal ? exactInternalVal : FinancialEngineDef.sanitizeAmount(exactInternalVal);
    },

    convertViaUSDHelper: function(amt, f, t, rates, rnd = 'round', c = 'pricing') {
        let v = FinancialEngineDef.convertViaUSD(amt, f, t, rates, c, true); 
        if (isNaN(v) || !isFinite(v)) return 0;

        const factor = Math.pow(10, FinancialEngineDef.CONFIG.PRECISION);
        let result = 0;

        if (rnd === 'floor') result = Math.floor((v + Number.EPSILON) * factor) / factor;
        else if (rnd === 'ceil') result = Math.ceil((v - Number.EPSILON) * factor) / factor;
        else result = Number(v.toFixed(FinancialEngineDef.CONFIG.PRECISION));

        return isNaN(result) ? 0 : result;
    },

    // ========================================================================
    // 💼 القسم الرابع: محاكاة التسعير والجدار الناري (النسخة التشخيصية للإدارة)
    // ========================================================================

    validateCoupon: function(code, prod, qty, optIdx, user, userTier, coupons = [], now = Date.now(), offer = null) {
        const safeCode = String(code || '').trim().toUpperCase();
        if (!safeCode) return { valid: false, msg: 'لم يتم تقديم كود خصم' };
        
        if (userTier && userTier.type === 'api') {
            return { valid: false, msg: 'عذراً، نظام الكوبونات غير متاح لعملاء ومستويات الجملة (API).' };
        }

        if (offer && typeof offer === 'object' && offer.isActive !== false && offer.type !== 'fake' && offer.type !== 'badge_only') {
            const offerCheck = FinancialEngineDef.calculatePrice({
                product: prod,
                tier: userTier,
                offer: offer,
                coupon: null,
                optIdx: optIdx,
                allowDefaultOption: true
            });
            if (offerCheck.offerName || offerCheck.offerDiscount > 0 || offerCheck._rawUnitOfferDiscount > 0) {
                return { valid: false, msg: 'لا يمكن استخدام الكوبونات مع العروض' };
            }
        }

        const cp = coupons.find(c => String(c.code).toUpperCase() === safeCode);
        if (!cp) return { valid: false, msg: 'كوبون غير صحيح' };
        if (cp.isActive === false) return { valid: false, msg: 'الكوبون غير مفعل' };
        
        const cpVal = FinancialEngineDef.extractNum(cp.value);
        if (cpVal <= 0 || (cp.type === 'percentage' && cpVal > 100)) {
            return { valid: false, msg: 'الكوبون غير صالح (قيمة معدومة أو تتجاوز 100%)' };
        }
        
        const isCouponDisabled = (prod.disableCoupons === true || String(prod.disableCoupons).toLowerCase() === 'true');
        if (isCouponDisabled) return { valid: false, msg: 'عذراً، هذا المنتج لا يدعم الكوبونات' }; 

        const activeOpt = (prod.type === 'select' && Array.isArray(prod.options) && optIdx !== null && optIdx !== undefined) ? prod.options[optIdx] : null;
        const isFixedProd = activeOpt && activeOpt.isFixedPrice !== undefined 
            ? (String(activeOpt.isFixedPrice).toLowerCase() === 'true') 
            : (String(prod.isFixedPrice).toLowerCase() === 'true' || prod.is_fixed_price === true);
        if (isFixedProd) return { valid: false, msg: 'لا يمكن استخدام كوبونات الخصم مع المنتجات ذات السعر الثابت.' };

        // 🛡️ ربط فحص customTierOverrides بشرط عدم وجود تكلفة (الكتالوج العام حصراً)
        const targetPricingObj = activeOpt || prod;
        const hasServerCost = FinancialEngineDef.extractNum(targetPricingObj.costPrice ?? targetPricingObj.cost_price ?? prod.costPrice ?? prod.cost_price ?? 0) > 0;
        const isPublicDoc = !hasServerCost && Array.isArray(targetPricingObj.customTierOverrides);
        const tierPriceField = targetPricingObj.tierPrices?.[userTier?.id];
        const isTrueOverride = isPublicDoc
            ? targetPricingObj.customTierOverrides.includes(String(userTier?.id))
            : (tierPriceField !== undefined && tierPriceField !== null);

        if (isTrueOverride && tierPriceField !== undefined && tierPriceField !== null) {
            const rawOverrideNum = typeof tierPriceField === 'object' ? FinancialEngineDef.extractNum(tierPriceField.price) : FinancialEngineDef.extractNum(tierPriceField);
            const publicExpMs = FinancialEngineDef.parseSafeTime(targetPricingObj.tierPriceExpiries?.[userTier?.id]?.expiresAt);
            const isExpiredOverride = (typeof tierPriceField === 'object' && tierPriceField.expiresAt) 
                ? (FinancialEngineDef.parseSafeTime(tierPriceField.expiresAt) > 0 && FinancialEngineDef.parseSafeTime(tierPriceField.expiresAt) <= now) 
                : (publicExpMs > 0 && publicExpMs <= now);
            if (!isExpiredOverride && rawOverrideNum > 0) {
                return { valid: false, msg: 'لا يمكن استخدام الكوبونات مع التسعير الخاص بالمستويات.' };
            }
        }

        if (cp.startDate) {
            const startMs = FinancialEngineDef.parseSafeTime(cp.startDate);
            if (startMs > 0 && now < startMs) return { valid: false, msg: 'هذا الكوبون لم تبدأ فترة صلاحيته بعد' };
        }

        if (cp.expiryDate) {
            const expiryMs = FinancialEngineDef.parseSafeTime(cp.expiryDate);
            if (expiryMs > 0 && now > expiryMs) return { valid: false, msg: 'انتهت صلاحية الكوبون' };
        }
        
        if (Number(cp.maxUses) > 0 && Math.max(0, Number(cp.usedCount || 0)) >= Number(cp.maxUses)) {
            return { valid: false, msg: 'استنفد الحد الأقصى للاستخدام العام' };
        }
        
        if (Number(cp.maxPerUser) > 0) {
            const userIdString = String(user?.uid || user?.id || user?.userId || '').trim();
            if (!userIdString || userIdString === 'undefined' || userIdString === 'null') {
                return { valid: false, msg: 'تعذر التحقق من هوية العميل لاستخدام هذا الكوبون.' };
            }
            const safeMapKey = safeCode.replace(/[.~*/\[\]]/g, '_');
            const rawUsageCount = Number(
                user?.usedCoupons?.[safeMapKey] ?? 
                user?.usedCoupons?.[safeCode] ?? 
                cp.usageHistory?.[userIdString] ?? 
                0
            );
            const userUsageCount = Math.max(0, rawUsageCount);
            if (userUsageCount >= Number(cp.maxPerUser)) {
                return { valid: false, msg: `لقد استنفدت الحد الأقصى المسموح لك لاستخدام هذا الكوبون (${cp.maxPerUser} مرات)` };
            }
        }
        
        if (Array.isArray(cp.targetTiers) && cp.targetTiers.length > 0 && !cp.targetTiers.map(String).includes(String(userTier?.id))) {
            return { valid: false, msg: 'غير متاح لمستوى عضويتك' };
        }
        
        const hasTargetProds = Array.isArray(cp.targetProds) && cp.targetProds.length > 0;
        const hasTargetCats = Array.isArray(cp.targetCategories) && cp.targetCategories.length > 0;

        let isProdMatched = false;
        let isCatMatched = false;

        if (hasTargetProds) {
            const prodIdStr = String(prod?.id || prod?.prodId || '').trim();
            isProdMatched = Boolean(prodIdStr && cp.targetProds.map(String).includes(prodIdStr));
        }

        if (hasTargetCats) {
            // 📌 [توحيد معماري]: المعرف القياسي للقسم هو categoryId (أو مصفوفة categoryIds)
            const prodCats = [].concat(prod.categoryId, prod.categoryIds).filter(Boolean).map(String);
            isCatMatched = cp.targetCategories.some(cid => prodCats.includes(String(cid)));
        }

        if (hasTargetProds || hasTargetCats) {
            if (!isProdMatched && !isCatMatched) return { valid: false, msg: 'عذراً، هذا الكوبون غير مخصص لهذا المنتج أو القسم.' };
        }

        if (Array.isArray(cp.allowedUsers) && cp.allowedUsers.length > 0) {
            const userIdString = String(user?.uid || user?.id || '').trim();
            if (!cp.allowedUsers.some(u => String(u) === userIdString)) return { valid: false, msg: 'غير مسموح لك باستخدامه' };
        } 
        
        if (Number(cp.minOrder) > 0) {
            const tempPrice = FinancialEngineDef.calculateOrderTotal({ product: prod, tier: userTier, optIdx, offer: null, allowDefaultOption: true }, qty);
            if (tempPrice.totalFinalPrice < Number(cp.minOrder)) return { valid: false, msg: `الحد الأدنى للطلب ${cp.minOrder}$` };
        }
        
        return { valid: true, coupon: { code: cp.code, type: cp.type, value: cp.value, maxDiscount: cp.maxDiscount, isActive: cp.isActive } };
    },

    calculatePrice: function(params = {}) {
        let { 
            product = {}, 
            costPrice = 0, 
            fixedPrice = 0, 
            tier = null, 
            offer = null, 
            coupon = null, 
            optIdx = null,
            allowDefaultOption = true 
        } = params;
        
        const explicitCostParam = FinancialEngineDef.extractNum(costPrice);
        const explicitFixedParam = FinancialEngineDef.extractNum(fixedPrice);

        if ((!product || typeof product !== 'object' || Object.keys(product).length === 0) && explicitCostParam <= 0 && explicitFixedParam <= 0) {
            return { costUsd: 0, tierPrice: 0, originalPrice: 0, finalPrice: 0, tierName: 'غير محدد', offerDiscount: 0, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallViolated: true, rejectionReason: "بيانات المنتج مفقودة" };
        }

        const isCounterProd = (product?.type === 'counter');
        const sanitizeUnit = isCounterProd ? FinancialEngineDef._internalSanitize : FinancialEngineDef.sanitizeAmount;
        const nowMs = Date.now();

        let cost = explicitCostParam > 0 ? explicitCostParam : FinancialEngineDef.extractNum(product?.costPrice ?? product?.cost_price ?? 0);
        let isFixed = (explicitFixedParam > 0) || (String(product?.isFixedPrice).toLowerCase() === 'true' || product?.is_fixed_price === true);
        let activeOption = null;

        if (product?.type === 'select' && Array.isArray(product.options) && product.options.length > 0) {
            let index = (optIdx !== null && optIdx !== undefined && optIdx !== '') ? Number(optIdx) : NaN;
            
            if (isNaN(index) && allowDefaultOption !== false) {
                const firstAvailIdx = product.options.findIndex(o => o && o.isActive !== false && String(o.isAvailable) !== 'false');
                if (firstAvailIdx >= 0) {
                    index = firstAvailIdx;
                } else {
                    const firstActiveOnlyIdx = product.options.findIndex(o => o && o.isActive !== false);
                    index = firstActiveOnlyIdx >= 0 ? firstActiveOnlyIdx : 0;
                }
            }
            
            if (Number.isInteger(index) && index >= 0 && index < product.options.length && product.options[index]) {
                activeOption = product.options[index];
                cost = explicitCostParam > 0 ?
                    explicitCostParam :
                    FinancialEngineDef.extractNum(activeOption.costPrice ?? activeOption.cost_price ?? 0);
                if (explicitFixedParam > 0) {
                    isFixed = true;
                } else if (activeOption.isFixedPrice !== undefined) {
                    isFixed = (String(activeOption.isFixedPrice).toLowerCase() === 'true');
                }
            } else {
                return { costUsd: 0, tierPrice: 0, originalPrice: 0, finalPrice: 0, tierName: 'خطأ', offerDiscount: 0, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallViolated: true, rejectionReason: `الخيار المحدد (${optIdx}) غير صالح!` };
            }
        }
        
        const targetPricingObj = activeOption || product;
        const isPublicCatalogDoc = cost <= 0 && targetPricingObj.costPrice === undefined && targetPricingObj.cost_price === undefined && Array.isArray(targetPricingObj.customTierOverrides);
        
        if (cost <= 0 && !isPublicCatalogDoc) {
            return { costUsd: 0, tierPrice: 0, originalPrice: 0, finalPrice: 0, tierName: 'خطأ تكلفة', offerDiscount: 0, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallViolated: true, rejectionReason: "لا يمكن بيع منتج أو باقة تكلفتها صفر (0). يرجى تحديد تكلفة حقيقية." };
        }
        
        if (cost > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) {
            return { costUsd: cost, tierPrice: 0, originalPrice: 0, finalPrice: 0, tierName: 'خطأ سقف', offerDiscount: 0, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallViolated: true, rejectionReason: "تجاوز سعر التكلفة الحد الأقصى الآمن." };
        }

        let currentPrice = activeOption 
            ? FinancialEngineDef.extractNum(activeOption.price) 
            : FinancialEngineDef.extractNum(product.price);
        let tierName = "عضو";
        let hasValidTierOverride = false;
        let rejectionReason = null;

        const isApiTier = Boolean(tier && tier.type === 'api');

        if (tier && typeof tier === 'object') {
            tierName = tier.nameAr || tier.name || tier.id || 'عضو';
            let tierPriceField = targetPricingObj.tierPrices?.[tier.id];
            
            // 🛡️ ربط فحص customTierOverrides بالكتالوج العام حصراً (isPublicCatalogDoc)
            if (!isFixed && tierPriceField !== undefined && tierPriceField !== null) {
                const isManualOverride = isPublicCatalogDoc
                    ? targetPricingObj.customTierOverrides.includes(String(tier.id))
                    : true;
                const publicExpiryInfo = targetPricingObj.tierPriceExpiries?.[tier.id];
                const publicExpMs = publicExpiryInfo ? FinancialEngineDef.parseSafeTime(publicExpiryInfo.expiresAt) : 0;

                if (typeof tierPriceField === 'object' && tierPriceField.price !== undefined) {
                    const expiry = FinancialEngineDef.parseSafeTime(tierPriceField.expiresAt);
                    const extractedObjPrice = FinancialEngineDef.extractNum(tierPriceField.price);
                    if ((expiry === 0 || expiry > nowMs) && extractedObjPrice > 0) {
                        currentPrice = extractedObjPrice;
                        hasValidTierOverride = isManualOverride;
                    }
                } else if (publicExpMs > 0 && publicExpMs <= nowMs) {
                    const fallbackVal = FinancialEngineDef.extractNum(publicExpiryInfo.fallbackPrice);
                    if (fallbackVal > 0) {
                        currentPrice = fallbackVal;
                    }
                    hasValidTierOverride = false;
                } else {
                    const extractedValPrice = FinancialEngineDef.extractNum(tierPriceField);
                    if (extractedValPrice > 0) {
                        currentPrice = extractedValPrice;
                        hasValidTierOverride = isManualOverride;
                    }
                }
            }
        }

        if (isApiTier) {
            tierName = `${tierName} (API)`;
            offer = null;
            if (coupon && coupon.isActive !== false) {
                rejectionReason = "تجار ومستويات الـ API لا يستفيدون من نظام الكوبونات والعروض.";
            }
        }

        if (isFixed) {
            currentPrice = explicitFixedParam > 0 ?
                explicitFixedParam :
                (activeOption ?
                    FinancialEngineDef.extractNum(activeOption.fixedPriceUsd || activeOption.price) :
                    FinancialEngineDef.extractNum(product?.fixedPriceUsd || product?.price || currentPrice));            
            tierName = isApiTier ? `${tierName} - ثابت` : "سعر ثابت";
            offer = null; 
            if (coupon && coupon.isActive !== false) rejectionReason = "لا يمكن استخدام كوبونات الخصم مع المنتجات ذات السعر الثابت.";
        } else if (hasValidTierOverride) {
            tierName = isApiTier ? `${tierName} - مخصص` : "سعر مخصص";
            offer = null; 
            if (coupon && coupon.isActive !== false) rejectionReason = "لا يمكن استخدام الكوبونات مع التسعير الخاص بالمستويات.";
        } else if (!isPublicCatalogDoc && tier && typeof tier === 'object') {
            let profitPercent = FinancialEngineDef.extractNum(tier.profitPercent || tier.profit_percent);
            if (profitPercent > 200) profitPercent = 200;

            const minProfitUsd = FinancialEngineDef.extractNum(tier.minProfitUsd || tier.min_profit_usd);
            if (cost > 0 && (profitPercent > 0 || minProfitUsd > 0)) {
                let profitAdded = FinancialEngineDef._internalMul(cost, FinancialEngineDef._internalDiv(profitPercent, 100));
                currentPrice = FinancialEngineDef._internalAdd(cost, Math.max(profitAdded, minProfitUsd));
            }
        }

        if (currentPrice > FinancialEngineDef.CONFIG.MAX_PRICE_LIMIT) {
            return { costUsd: cost, tierPrice: currentPrice, originalPrice: currentPrice, finalPrice: 0, tierName: 'خطأ سقف', offerDiscount: 0, couponDiscount: 0, totalDiscount: 0, netProfitUsd: 0, marginPct: 0, isFirewallViolated: true, rejectionReason: "تجاوز سعر البيع الحد الأقصى الآمن." };
        }

        const tierPrice = currentPrice;
        const originalPrice = currentPrice;

        let offerName = null, offerDiscount = 0, couponCode = null, couponDiscount = 0;
        let rawOfferDiscForCap = 0, rawCouponDiscForCap = 0;
        const absoluteMaxDiscountAllowable = FinancialEngineDef._internalMul(originalPrice, FinancialEngineDef._internalDiv(FinancialEngineDef.CONFIG.MAX_GLOBAL_DISCOUNT_PCT, 100));
        
        const absoluteMinMargin = cost > 0 ? FinancialEngineDef._internalMul(cost, FinancialEngineDef._internalDiv(FinancialEngineDef.CONFIG.MIN_MARGIN_PERCENT, 100)) : 0;
        const rawSafeMarginPrice = cost > 0 
            ? FinancialEngineDef._internalAdd(cost, absoluteMinMargin) 
            : FinancialEngineDef.extractNum(targetPricingObj.minSafePrice ?? product.minSafePrice ?? 0);
        const safeMarginPrice = sanitizeUnit(rawSafeMarginPrice);
        const hasMarginFloor = safeMarginPrice > 0;

        let accumulatedDiscount = 0;

        const offerStartMs = offer?.startDate ? FinancialEngineDef.parseSafeTime(offer.startDate) : 0;
        const offerExpMs = offer?.expiryDate ? FinancialEngineDef.parseSafeTime(offer.expiryDate) : 0;
        const isOfferOutOfTime = Boolean((offerStartMs > 0 && nowMs < offerStartMs) || (offerExpMs > 0 && nowMs >= offerExpMs));
        const isOfferTierMatched = !offer || !Array.isArray(offer.targetTiers) || offer.targetTiers.length === 0 || (tier?.id && offer.targetTiers.map(String).includes(String(tier.id)));

        if (!isApiTier && !hasValidTierOverride && !isFixed && offer && !isOfferOutOfTime && isOfferTierMatched && offer.type !== 'fake' && offer.type !== 'badge_only' && offer.isActive !== false) {
            let offerVal = FinancialEngineDef.extractNum(offer.value);
            const isPctOffer = (offer.type === 'percentage' || offer.type === 'real');
            if (isPctOffer && offerVal > 100) offerVal = 100;
            
            if (isPctOffer) {
                rawOfferDiscForCap = FinancialEngineDef._internalMul(originalPrice, FinancialEngineDef._internalDiv(offerVal, 100));
            } else {
                rawOfferDiscForCap = offerVal;
            }
            const offerMaxCap = FinancialEngineDef.extractNum(offer.maxDiscount);
            if (offerMaxCap > 0) rawOfferDiscForCap = Math.min(rawOfferDiscForCap, offerMaxCap);
            
            offerDiscount = Math.min(rawOfferDiscForCap, absoluteMaxDiscountAllowable);
            if (offerDiscount > 0) {
                offerName = offer.name || 'عرض ترويجي';
                accumulatedDiscount = FinancialEngineDef._internalAdd(accumulatedDiscount, offerDiscount);
            } else {
                rawOfferDiscForCap = 0;
            }
        }

        const isCouponDisabled = (product.disableCoupons === true || String(product.disableCoupons).toLowerCase() === 'true');
        const couponStartMs = coupon?.startDate ? FinancialEngineDef.parseSafeTime(coupon.startDate) : 0;
        const couponExpMs = coupon?.expiryDate ? FinancialEngineDef.parseSafeTime(coupon.expiryDate) : 0;
        const isCouponOutOfTime = Boolean((couponStartMs > 0 && nowMs < couponStartMs) || (couponExpMs > 0 && nowMs > couponExpMs));
        const isCouponTierMatched = !coupon || !Array.isArray(coupon.targetTiers) || coupon.targetTiers.length === 0 || (tier?.id && coupon.targetTiers.map(String).includes(String(tier.id)));

        if (coupon && coupon.isActive !== false && !rejectionReason) {
            if (isCouponDisabled) {
                rejectionReason = "المنتج لا يدعم الكوبونات.";
            } else if (offerName) {
                rejectionReason = "لا يمكن استخدام الكوبونات مع العروض.";
            } else if (isCouponOutOfTime) {
                rejectionReason = "انتهت صلاحية الكوبون أو لم تبدأ بعد.";
            } else if (!isCouponTierMatched) {
                rejectionReason = "غير متاح لمستوى عضويتك.";
            }
        }

        if (!isApiTier && !hasValidTierOverride && !isFixed && !isCouponDisabled && !offerName && !isCouponOutOfTime && isCouponTierMatched && coupon && coupon.isActive !== false) {
            couponCode = coupon.code || null;
            let coupVal = FinancialEngineDef.extractNum(coupon.value);
            if (coupon.type === 'percentage' && coupVal > 100) coupVal = 100;
            
            if (coupon.type === 'percentage') {
                rawCouponDiscForCap = FinancialEngineDef._internalMul(originalPrice, FinancialEngineDef._internalDiv(coupVal, 100));
            } else {
                rawCouponDiscForCap = coupVal;
            }
            const couponMaxCap = FinancialEngineDef.extractNum(coupon.maxDiscount);
            if (couponMaxCap > 0) rawCouponDiscForCap = Math.min(rawCouponDiscForCap, couponMaxCap);

            const remainingDiscountCapacity = Math.max(0, FinancialEngineDef._internalSub(absoluteMaxDiscountAllowable, accumulatedDiscount));
            couponDiscount = Math.min(rawCouponDiscForCap, remainingDiscountCapacity);
            accumulatedDiscount = FinancialEngineDef._internalAdd(accumulatedDiscount, couponDiscount);
        }
        
        const minUnitPriceFloor = isCounterProd ? 0.000001 : FinancialEngineDef.CONFIG.MIN_SALE_PRICE;
        currentPrice = originalPrice > 0 ?
            Math.max(minUnitPriceFloor, FinancialEngineDef._internalSub(originalPrice, accumulatedDiscount)) :
            0;
        const sanitizedOriginalPrice = sanitizeUnit(originalPrice);
        const sanitizedCurrentPrice = sanitizeUnit(currentPrice);
        let isFirewallViolated = false;

        if (Boolean(rejectionReason)) {
            isFirewallViolated = true;
        } else if (sanitizedOriginalPrice <= 0 || sanitizedCurrentPrice <= 0) {
            isFirewallViolated = true;
            rejectionReason = rejectionReason || "سعر البيع النهائي يساوي صفراً أو غير محدد.";
        } else if (hasMarginFloor && sanitizedCurrentPrice < safeMarginPrice) {
            isFirewallViolated = true;
            rejectionReason = rejectionReason || `السعر النهائي (${sanitizedCurrentPrice}$) يكسر حاجز الربح الآمن (${safeMarginPrice}$).`;
        }

        const profit = cost > 0 ? Math.max(0, FinancialEngineDef._internalSub(sanitizedCurrentPrice, cost)) : 0; 
        let marginPct = (cost > 0 && sanitizedCurrentPrice > 0) ? FinancialEngineDef._internalMul(FinancialEngineDef._internalDiv(profit, sanitizedCurrentPrice), 100) : 0;

        return {
            costUsd: sanitizeUnit(cost),
            tierPrice: sanitizeUnit(tierPrice),
            originalPrice: sanitizedOriginalPrice, 
            finalPrice: sanitizedCurrentPrice, 
            tierName, 
            offerName, 
            
            _rawUnitOfferDiscount: rawOfferDiscForCap,
            _rawUnitCouponDiscount: rawCouponDiscForCap,
            _maxAllowableDiscountPct: FinancialEngineDef.CONFIG.MAX_GLOBAL_DISCOUNT_PCT,
            _unitSafeMarginPrice: safeMarginPrice,

            offerDiscount: sanitizeUnit(offerDiscount), 
            couponCode, 
            couponDiscount: sanitizeUnit(couponDiscount), 
            totalDiscount: sanitizeUnit(accumulatedDiscount),
            netProfitUsd: sanitizeUnit(profit),
            marginPct: Number(marginPct.toFixed(2)), 
            isFirewallViolated, 
            rejectionReason
        };
    },

    calculateOrderTotal: function(params = {}, rawQty = 1) {
        let qty = Math.floor(FinancialEngineDef.extractNum(rawQty));
        if (qty <= 0) qty = 1;
        if (qty > FinancialEngineDef.CONFIG.MAX_QTY_LIMIT) {
            return { qty: 0, isFirewallViolated: true, rejectionReason: "الكمية المطلوبة تتجاوز الحد الأقصى المسموح به." };
        }

        const isCounterProd = (params?.product?.type === 'counter');
        const sanitizeUnit = isCounterProd ? FinancialEngineDef._internalSanitize : FinancialEngineDef.sanitizeAmount;

        let unit = FinancialEngineDef.calculatePrice(params);
        
        const isStructuralRejection = (unit.rejectionReason && !unit.rejectionReason.includes("يكسر حاجز الربح الآمن") && !unit.rejectionReason.includes("تتجاوز الحد الأقصى المسموح به")) || unit.originalPrice <= 0;
        if (isStructuralRejection) {
            return {
                ...unit,
                qty: 0,
                isFirewallViolated: true,
                totalFinalPrice: 0,
                totalCostUsd: 0,
                totalOriginalPrice: 0,
                totalNetProfitUsd: 0
            };
        }

        const totalOriginalPrice = FinancialEngineDef.safeMul(unit.originalPrice, qty);
        const totalCostUsd = FinancialEngineDef.safeMul(unit.costUsd, qty);
        const absoluteMaxDiscountAllowable = FinancialEngineDef._internalMul(totalOriginalPrice, FinancialEngineDef._internalDiv(unit._maxAllowableDiscountPct || 95, 100));
        
        const absoluteTotalMinMargin = totalCostUsd > 0 ? FinancialEngineDef._internalMul(totalCostUsd, FinancialEngineDef._internalDiv(FinancialEngineDef.CONFIG.MIN_MARGIN_PERCENT, 100)) : 0;
        const rawSafeTotalMarginPrice = totalCostUsd > 0 
            ? FinancialEngineDef.safeAdd(totalCostUsd, absoluteTotalMinMargin) 
            : FinancialEngineDef.safeMul(unit._unitSafeMarginPrice || 0, qty);
        const safeTotalMarginPrice = FinancialEngineDef.sanitizeAmount(rawSafeTotalMarginPrice);
        const hasTotalMarginFloor = safeTotalMarginPrice > 0;

        let finalTotalOfferDiscount = 0;
        let finalTotalCouponDiscount = 0;
        let totalAccumulatedDiscount = 0;
        
        if (unit.offerName) {
            let totalRawOfferDisc;
            const isPctOffer = (params.offer?.type === 'percentage' || params.offer?.type === 'real');
            if (isPctOffer || params.offer?.isPerUnit === true) {               
                totalRawOfferDisc = FinancialEngineDef.safeMul(unit._rawUnitOfferDiscount || 0, qty);
            } else {
                totalRawOfferDisc = unit._rawUnitOfferDiscount || 0;
            }
            
            const offerMaxCap = FinancialEngineDef.extractNum(params.offer?.maxDiscount);
            if (offerMaxCap > 0) totalRawOfferDisc = Math.min(totalRawOfferDisc, offerMaxCap);
            
            finalTotalOfferDiscount = Math.min(totalRawOfferDisc, absoluteMaxDiscountAllowable);
            if (finalTotalOfferDiscount > 0) {
                totalAccumulatedDiscount = FinancialEngineDef.safeAdd(totalAccumulatedDiscount, finalTotalOfferDiscount);
            } else {
                unit.offerName = null;
                finalTotalOfferDiscount = 0;
            }
        }
        
        if (unit.couponCode) {
            let totalRawCouponDisc;
            if (params.coupon?.type === 'percentage') {
                totalRawCouponDisc = FinancialEngineDef.safeMul(unit._rawUnitCouponDiscount || 0, qty);
            } else {
                totalRawCouponDisc = unit._rawUnitCouponDiscount || 0;
            }
            
            const couponMaxCap = FinancialEngineDef.extractNum(params.coupon?.maxDiscount);
            if (couponMaxCap > 0) totalRawCouponDisc = Math.min(totalRawCouponDisc, couponMaxCap);
            
            const remainingCapacity = Math.max(0, FinancialEngineDef.safeSub(absoluteMaxDiscountAllowable, totalAccumulatedDiscount));
            finalTotalCouponDiscount = Math.min(totalRawCouponDisc, remainingCapacity);
            totalAccumulatedDiscount = FinancialEngineDef.safeAdd(totalAccumulatedDiscount, finalTotalCouponDiscount);
        }

        const rawDiscountedTotal = totalOriginalPrice > 0 ?
    Math.max(0, FinancialEngineDef.safeSub(totalOriginalPrice, totalAccumulatedDiscount)) :
    0;
let totalFinalPrice = totalOriginalPrice > 0 ?
    Math.max(FinancialEngineDef.CONFIG.MIN_SALE_PRICE, rawDiscountedTotal) :
    0;

// 🛡️ حماية sanitizedTotalOriginalPrice لمنتجات العداد من التصفير
const sanitizedTotalOriginalPrice = FinancialEngineDef.sanitizeAmount(totalOriginalPrice) || (isCounterProd ? FinancialEngineDef._internalSanitize(totalOriginalPrice) : 0);
const sanitizedTotalFinalPrice = FinancialEngineDef.sanitizeAmount(totalFinalPrice);
let isFirewallViolated = false;
let rejectionReason = null;

if (sanitizedTotalOriginalPrice <= 0 || sanitizedTotalFinalPrice <= 0 || (hasTotalMarginFloor && sanitizedTotalFinalPrice < safeTotalMarginPrice)) {
    isFirewallViolated = true;
    rejectionReason = `إجمالي السعر بعد الخصم (${sanitizedTotalFinalPrice}$) أقل من الحد الأدنى الآمن لحماية رأس المال (${safeTotalMarginPrice}$).`;
}

const totalNetProfitUsd = totalCostUsd > 0 ? Math.max(0, FinancialEngineDef.safeSub(sanitizedTotalFinalPrice, totalCostUsd)) : 0;

// 🛡️ حساب سعر الوحدة الدقيق حتى مع وجود العروض والكوبونات
const minUnitPriceFloor = isCounterProd ? 0.000001 : FinancialEngineDef.CONFIG.MIN_SALE_PRICE;
unit.finalPrice = isCounterProd ?
    sanitizeUnit(Math.max(minUnitPriceFloor, FinancialEngineDef.safeDiv(rawDiscountedTotal, qty))) :
    sanitizeUnit(FinancialEngineDef.safeDiv(sanitizedTotalFinalPrice, qty));        unit.offerDiscount = sanitizeUnit(FinancialEngineDef.safeDiv(finalTotalOfferDiscount, qty));
        unit.couponDiscount = sanitizeUnit(FinancialEngineDef.safeDiv(finalTotalCouponDiscount, qty));
        unit.totalDiscount = sanitizeUnit(FinancialEngineDef.safeDiv(totalAccumulatedDiscount, qty));
        unit.netProfitUsd = sanitizeUnit(FinancialEngineDef.safeDiv(totalNetProfitUsd, qty));
        
        const recalcMarginPct = (totalCostUsd > 0 && sanitizedTotalFinalPrice > 0)
            ? FinancialEngineDef._internalMul(FinancialEngineDef._internalDiv(totalNetProfitUsd, sanitizedTotalFinalPrice), 100)
            : 0;
        unit.marginPct = Number(recalcMarginPct.toFixed(2));

        const safeTotalCostOut = totalCostUsd > 0
            ? (FinancialEngineDef.sanitizeAmount(totalCostUsd) || FinancialEngineDef._internalSanitize(totalCostUsd))
            : 0;

        return {
            ...unit,
            qty,
            totalCostUsd: safeTotalCostOut,
            totalOriginalPrice: sanitizedTotalOriginalPrice,
            totalFinalPrice: sanitizedTotalFinalPrice,
            totalNetProfitUsd: FinancialEngineDef.sanitizeAmount(totalNetProfitUsd),
            totalOfferDiscount: FinancialEngineDef.sanitizeAmount(finalTotalOfferDiscount),
            totalCouponDiscount: FinancialEngineDef.sanitizeAmount(finalTotalCouponDiscount),
            totalDiscount: FinancialEngineDef.sanitizeAmount(totalAccumulatedDiscount),
            isFirewallViolated,
            rejectionReason
        };
    },

    // ========================================================================
    // 👑 القسم الخامس: محرك مستويات العضوية والعملات المحلية (Server Synced V35.1.0)
    // ========================================================================

    _getDurationDays: function(tierObj, fallback = 30) {
        const raw = tierObj?.durationDays;
        if (raw === undefined || raw === null || raw === '') return fallback;
        const num = Number(raw);
        return (Number.isFinite(num) && num >= 0) ? num : fallback;
    },

    _sortTrackTiers: function(tiers, trackType = 'retail') {
        const getThreshold = (t) => Number(t?.threshold ?? t?.condition_amount ?? 0);
        return (Array.isArray(tiers) ? tiers : [])
            .filter(t => (t?.type === 'api' ? 'api' : 'retail') === trackType)
            .sort((a, b) => {
                const aDef = (String(a.id) === 'TIER_DEFAULT' || a.isDefault === true) ? 1 : 0;
                const bDef = (String(b.id) === 'TIER_DEFAULT' || b.isDefault === true) ? 1 : 0;
                if (aDef !== bDef) return bDef - aDef;
                const diff = getThreshold(a) - getThreshold(b);
                if (diff !== 0) return diff;
                const orderDiff = Number(a.sortOrder ?? a.order ?? 0) - Number(b.sortOrder ?? b.order ?? 0);
                if (orderDiff !== 0) return orderDiff;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });
    },

    _findNextGateInTrack: function(sortedTrackTiers, fromTier) {
        if (!Array.isArray(sortedTrackTiers) || sortedTrackTiers.length === 0 || !fromTier) return null;
        const getThreshold = (t) => Number(t?.threshold ?? t?.condition_amount ?? 0);
        const fromIdx = sortedTrackTiers.findIndex(t => String(t.id) === String(fromTier.id));
        if (fromIdx >= 0) {
            for (let i = fromIdx + 1; i < sortedTrackTiers.length; i++) {
                const candidate = sortedTrackTiers[i];
                if (candidate && candidate.autoAdvance !== false && getThreshold(candidate) > 0) {
                    return candidate;
                }
            }
            return null;
        }
        return sortedTrackTiers.find(t => t.autoAdvance !== false && getThreshold(t) > getThreshold(fromTier)) || null;
    },

    getUserTier: function(user, tiers) {
        if (!tiers || !Array.isArray(tiers) || tiers.length === 0) return null;
        
        const safeUser = user || {};
        const userTierId = String(safeUser.tierId || safeUser.tier || 'TIER_DEFAULT');
        let foundTier = tiers.find(t => String(t.id) === userTierId);

        if (!foundTier) {
            foundTier = tiers.find(t => String(t.id) === 'TIER_DEFAULT')
                || tiers.find(t => t.isDefault === true && t.type !== 'api')
                || tiers.find(t => t.isDefault === true);
            if (!foundTier) {
                const sortedBySafety = FinancialEngineDef._sortTrackTiers(tiers, 'retail');
                foundTier = sortedBySafety[0] || tiers[0];
            }
        }

        // 🛡️ ثبات المستوى: العميل يحتفظ بمستواه دائماً
        return foundTier;
    },

    processTierUpgrade: function(userData, tiersData, newOrderUsdAmount, serverNowMs = Date.now()) {
        const safeAdd = FinancialEngineDef.safeAdd;
        const safeSub = FinancialEngineDef.safeSub;
        const safeUser = userData || {};
        const safeTiers = Array.isArray(tiersData) ? tiersData : [];
        
        const fallbackTierObj = {
            id: String(safeUser.tierId || safeUser.tier || 'TIER_DEFAULT'),
            durationDays: 0,
            type: safeUser.isApiMerchant === true ? 'api' : 'retail',
            threshold: 0,
            autoAdvance: false
        };

        let currentTierObj = FinancialEngineDef.getUserTier(safeUser, safeTiers) || fallbackTierObj;
        const initialTierId = String(currentTierObj.id);
        const trackType = currentTierObj?.type === 'api' ? 'api' : 'retail';
        const isForceFrozenApi = (trackType === 'api');
        const getThreshold = (t) => Number(t?.threshold ?? t?.condition_amount ?? 0);

        const sortedTrackTiers = FinancialEngineDef._sortTrackTiers(safeTiers, trackType);
        const findNextGate = (fromTier) => FinancialEngineDef._findNextGateInTrack(sortedTrackTiers, fromTier);

        const parsedCycleStartMs = FinancialEngineDef.parseSafeTime(safeUser.tierCycleStartDate);
        const rawCycleStartMs = (parsedCycleStartMs > 0 && parsedCycleStartMs <= serverNowMs + 60000) ? parsedCycleStartMs : 0;
        const parsedStreakStartMs = FinancialEngineDef.parseSafeTime(safeUser.tierStreakStartDate);
        const rawStreakStartMs = (parsedStreakStartMs > 0 && parsedStreakStartMs <= serverNowMs + 60000) ? parsedStreakStartMs : rawCycleStartMs;
        const isFirstInit = (!rawCycleStartMs || !safeUser.tierId);

        let lockedFloorTierId = String(safeUser.cycleStartTierId || sortedTrackTiers[0]?.id || initialTierId);
        let floorIdx = sortedTrackTiers.findIndex(t => String(t.id) === lockedFloorTierId);
        if (floorIdx < 0) floorIdx = 0;
        let currentIdx = sortedTrackTiers.findIndex(t => String(t.id) === initialTierId);
        if (currentIdx < 0) currentIdx = 0;

        let activeClimbs = Array.isArray(safeUser.tierClimbs) ? safeUser.tierClimbs.map(c => ({ ...c })) : [];
        if (activeClimbs.length === 0 && currentIdx > floorIdx && !isForceFrozenApi && safeUser.manualTierOverride !== true) {
            for (let idx = floorIdx + 1; idx <= currentIdx; idx++) {
                const stepTier = sortedTrackTiers[idx];
                const prevTier = sortedTrackTiers[idx - 1];
                if (stepTier && prevTier) {
                    activeClimbs.push({
                        fromTierId: String(prevTier.id),
                        toTierId: String(stepTier.id),
                        costPaid: FinancialEngineDef.sanitizeAmount(getThreshold(stepTier)),
                        atMs: rawCycleStartMs || serverNowMs,
                        spendStartMs: rawStreakStartMs || rawCycleStartMs || serverNowMs,
                        lockDays: FinancialEngineDef._getDurationDays(stepTier, 30)
                    });
                }
            }
        }

        // 🛡️ تحصين نضج أرضية المستويات وتصفية الترقيات التي أصبحت تحت الأرضية المقفلة
        let didFloorAdvanceByMaturity = false;
        const rawUnmaturedClimbs = [];
        for (const climb of activeClimbs) {
            const climbAtMs = FinancialEngineDef.parseSafeTime(climb.atMs);
            const climbLockDays = FinancialEngineDef._getDurationDays({ durationDays: climb.lockDays }, 30);
            const climbElapsedDays = climbAtMs > 0 ? Math.max(0, (serverNowMs - climbAtMs) / MS_PER_DAY) : 0;
            if (climbAtMs > 0 && (climbLockDays === 0 || climbElapsedDays >= climbLockDays)) {
                const maturedIdx = sortedTrackTiers.findIndex(t => String(t.id) === String(climb.toTierId));
                if (maturedIdx > floorIdx) {
                    floorIdx = maturedIdx;
                    lockedFloorTierId = String(climb.toTierId);
                    didFloorAdvanceByMaturity = true;
                }
            } else {
                rawUnmaturedClimbs.push(climb);
            }
        }
        const remainingUnmaturedClimbs = rawUnmaturedClimbs.filter(c => {
            const toIdx = sortedTrackTiers.findIndex(t => String(t.id) === String(c.toTierId));
            return toIdx > floorIdx;
        });

        let nextTierGate = findNextGate(currentTierObj);
        const gateDurationDays = nextTierGate ? FinancialEngineDef._getDurationDays(nextTierGate, 30) : 0;
        const stageElapsedDays = rawCycleStartMs > 0 ? Math.max(0, (serverNowMs - rawCycleStartMs) / MS_PER_DAY) : 0;

        const isCycleExpired = (safeUser.manualTierOverride === true || safeUser.isApiMerchant === true || isForceFrozenApi || !nextTierGate) 
            ? false 
            : (rawCycleStartMs > 0 && gateDurationDays > 0 && stageElapsedDays >= gateDurationDays);

        let currentCycleSpentUsd = isCycleExpired ? 0 : Number(safeUser.tierCycleSpent || 0);
        const hadUnexpiredStageBalance = (currentCycleSpentUsd > 0 && !isCycleExpired);
        let stageSpendStartMs = hadUnexpiredStageBalance ? (rawStreakStartMs || rawCycleStartMs || serverNowMs) : serverNowMs;
        let poolFromPreviousOrders = currentCycleSpentUsd;

        let newTierCycleSpentUsd = FinancialEngineDef.sanitizeAmount(safeAdd(currentCycleSpentUsd, newOrderUsdAmount));
        const newTotalSpentUsd = FinancialEngineDef.sanitizeAmount(safeAdd(Number(safeUser.totalSpent || 0), newOrderUsdAmount));
        
        if (safeUser.manualTierOverride !== true && currentTierObj?.autoAdvance !== false && !isForceFrozenApi && sortedTrackTiers.length > 0) {
            while (nextTierGate) {
                const gateCost = getThreshold(nextTierGate);
                if (gateCost > 0 && newTierCycleSpentUsd >= gateCost) {
                    newTierCycleSpentUsd = FinancialEngineDef.sanitizeAmount(Math.max(0, safeSub(newTierCycleSpentUsd, gateCost)));
                    const nextLockDays = FinancialEngineDef._getDurationDays(nextTierGate, 30);
                    const climbSpendStartMs = poolFromPreviousOrders > 0 ? stageSpendStartMs : serverNowMs;
                    poolFromPreviousOrders = 0;
                    stageSpendStartMs = serverNowMs;

                    if (nextLockDays === 0) {
                        lockedFloorTierId = String(nextTierGate.id);
                        didFloorAdvanceByMaturity = true;
                        remainingUnmaturedClimbs.length = 0;
                    } else {
                        remainingUnmaturedClimbs.push({
                            fromTierId: String(currentTierObj.id),
                            toTierId: String(nextTierGate.id),
                            costPaid: FinancialEngineDef.sanitizeAmount(gateCost),
                            atMs: serverNowMs,
                            spendStartMs: climbSpendStartMs,
                            lockDays: nextLockDays
                        });
                    }

                    currentTierObj = nextTierGate;
                    if (currentTierObj.autoAdvance === false) break;
                    nextTierGate = findNextGate(currentTierObj);
                } else {
                    break;
                }
            }
        }
        
        const finalTierId = String(currentTierObj?.id || fallbackTierObj.id);
        const isUpgradedNow = finalTierId !== initialTierId;

        const isFreshPiggyBankStart = (!hadUnexpiredStageBalance || isUpgradedNow);
        const shouldUpdateCycleStart = (isCycleExpired || isFirstInit || isUpgradedNow || !hadUnexpiredStageBalance);
        const shouldUpdateStreakStart = (isFirstInit || isFreshPiggyBankStart);
        const shouldLockFloorTier = (
            isFirstInit ||
            !safeUser.cycleStartTierId ||
            didFloorAdvanceByMaturity ||
            shouldUpdateStreakStart
        );

        return {
            activeTierId: initialTierId,
            finalTierId: finalTierId,
            newTierCycleSpentUsd: newTierCycleSpentUsd,
            newTotalSpentUsd: newTotalSpentUsd,
            shouldUpdateCycleStart: shouldUpdateCycleStart,
            shouldLockFloorTier: shouldLockFloorTier,
            shouldUpdateStreakStart: shouldUpdateStreakStart,
            lockedFloorTierId: lockedFloorTierId,
            tierClimbs: remainingUnmaturedClimbs.slice(-20)
        };
    },

    processTierRefund: function(userData, tiersData, refundOrderUsdAmount, orderCreatedAtMs = 0, serverNowMs = Date.now()) {
        const safeAdd = FinancialEngineDef.safeAdd;
        const safeSub = FinancialEngineDef.safeSub;
        const safeUser = userData || {};
        const safeTiers = Array.isArray(tiersData) ? tiersData : [];
        const refundAmt = FinancialEngineDef.extractNum(refundOrderUsdAmount);
        
        const activeTierObj = FinancialEngineDef.getUserTier(safeUser, safeTiers);
        const initialTierId = String(activeTierObj?.id || safeUser.tierId || 'TIER_DEFAULT');
        const newTotalSpentUsd = FinancialEngineDef.sanitizeAmount(Math.max(0, safeSub(Number(safeUser.totalSpent || 0), refundAmt)));
        
        if (!activeTierObj || safeUser.manualTierOverride === true || safeUser.isApiMerchant === true || activeTierObj.type === 'api' || activeTierObj.autoAdvance === false || refundAmt <= 0) {
            return {
                finalTierId: initialTierId,
                lockedFloorTierId: String(safeUser.cycleStartTierId || initialTierId),
                newTierCycleSpentUsd: FinancialEngineDef.sanitizeAmount(safeUser.tierCycleSpent || 0),
                newTotalSpentUsd: newTotalSpentUsd,
                isDowngraded: false,
                tierClimbs: Array.isArray(safeUser.tierClimbs) ? safeUser.tierClimbs : [],
                restoredCycleStartMs: null,
                restoredStreakStartMs: null
            };
        }
        
        const getThreshold = (t) => Number(t?.threshold ?? t?.condition_amount ?? 0);
        const sortedTrackTiers = FinancialEngineDef._sortTrackTiers(safeTiers, 'retail');
        
        let currentIdx = sortedTrackTiers.findIndex(t => String(t.id) === initialTierId);
        if (currentIdx < 0) currentIdx = 0;
        
        let lockedFloorTierId = String(safeUser.cycleStartTierId || sortedTrackTiers[0]?.id || initialTierId);
        let floorIdx = sortedTrackTiers.findIndex(t => String(t.id) === lockedFloorTierId);
        if (floorIdx < 0) floorIdx = 0;
        
        const parsedRefundCycleStartMs = FinancialEngineDef.parseSafeTime(safeUser.tierCycleStartDate);
        const rawCycleStartMs = (parsedRefundCycleStartMs > 0 && parsedRefundCycleStartMs <= serverNowMs + 60000) ? parsedRefundCycleStartMs : 0;
        const parsedStreakStartMs = FinancialEngineDef.parseSafeTime(safeUser.tierStreakStartDate);
        const rawStreakStartMs = (parsedStreakStartMs > 0 && parsedStreakStartMs <= serverNowMs + 60000) ? parsedStreakStartMs : rawCycleStartMs;
        
        let activeClimbs = Array.isArray(safeUser.tierClimbs) ? safeUser.tierClimbs.map(c => ({ ...c })) : [];
        if (activeClimbs.length === 0 && currentIdx > floorIdx) {
            for (let idx = floorIdx + 1; idx <= currentIdx; idx++) {
                const stepTier = sortedTrackTiers[idx];
                const prevTier = sortedTrackTiers[idx - 1];
                if (stepTier && prevTier) {
                    activeClimbs.push({
                        fromTierId: String(prevTier.id),
                        toTierId: String(stepTier.id),
                        costPaid: FinancialEngineDef.sanitizeAmount(getThreshold(stepTier)),
                        atMs: rawCycleStartMs || serverNowMs,
                        spendStartMs: rawStreakStartMs || rawCycleStartMs || serverNowMs,
                        lockDays: FinancialEngineDef._getDurationDays(stepTier, 30)
                    });
                }
            }
        }
        
        // 🛡️ تحصين نضج أرضية المستويات وتصفية الترقيات أثناء الاسترجاع
        const rawUnmaturedClimbs = [];
        for (const climb of activeClimbs) {
            const climbAtMs = FinancialEngineDef.parseSafeTime(climb.atMs);
            const climbLockDays = FinancialEngineDef._getDurationDays({ durationDays: climb.lockDays }, 30);
            const climbElapsedDays = climbAtMs > 0 ? Math.max(0, (serverNowMs - climbAtMs) / MS_PER_DAY) : 0;
            if (climbAtMs > 0 && (climbLockDays === 0 || climbElapsedDays >= climbLockDays)) {
                const maturedIdx = sortedTrackTiers.findIndex(t => String(t.id) === String(climb.toTierId));
                if (maturedIdx > floorIdx) {
                    floorIdx = maturedIdx;
                    lockedFloorTierId = String(climb.toTierId);
                }
            } else {
                rawUnmaturedClimbs.push(climb);
            }
        }
        const remainingUnmaturedClimbs = rawUnmaturedClimbs.filter(c => {
            const toIdx = sortedTrackTiers.findIndex(t => String(t.id) === String(c.toTierId));
            return toIdx > floorIdx;
        });
        
        const nextTierGate = FinancialEngineDef._findNextGateInTrack(sortedTrackTiers, activeTierObj);
        const gateDurationDays = nextTierGate ? FinancialEngineDef._getDurationDays(nextTierGate, 30) : 0;
        const stageElapsedDays = rawCycleStartMs > 0 ? Math.max(0, (serverNowMs - rawCycleStartMs) / MS_PER_DAY) : 0;
        const isCurrentStageExpired = Boolean(nextTierGate && rawCycleStartMs > 0 && gateDurationDays > 0 && stageElapsedDays >= gateDurationDays);
        
        let balance = isCurrentStageExpired ? 0 : Number(safeUser.tierCycleSpent || 0);
        const orderTimeMs = FinancialEngineDef.parseSafeTime(orderCreatedAtMs);
        const CLOCK_DRIFT_TOLERANCE_MS = 60000;
        
        const piggyBankStartMs = rawStreakStartMs || rawCycleStartMs;
        const isOrderInCurrentPiggyBank = !isCurrentStageExpired && (orderTimeMs === 0 || piggyBankStartMs === 0 || orderTimeMs + CLOCK_DRIFT_TOLERANCE_MS >= piggyBankStartMs);
        
        const didOrderFundAnyUnmaturedClimb = remainingUnmaturedClimbs.some(c => {
            const cStart = FinancialEngineDef.parseSafeTime(c.spendStartMs) || 0;
            const cAt = FinancialEngineDef.parseSafeTime(c.atMs) || 0;
            return (orderTimeMs === 0) || ((cStart === 0 || orderTimeMs + CLOCK_DRIFT_TOLERANCE_MS >= cStart) && (cAt === 0 || orderTimeMs <= cAt + CLOCK_DRIFT_TOLERANCE_MS));
        });
        
        let restoredCycleStartMs = null;
        let restoredStreakStartMs = null;
        
        if (isOrderInCurrentPiggyBank || didOrderFundAnyUnmaturedClimb) {
            const balanceBeforeRefund = balance;
            balance = safeSub(balance, refundAmt);
            let maxPoppedAtMs = 0;
            
            while (balance < 0 && remainingUnmaturedClimbs.length > 0 && currentIdx > floorIdx) {
                const topClimb = remainingUnmaturedClimbs[remainingUnmaturedClimbs.length - 1];
                const topClimbAtMs = FinancialEngineDef.parseSafeTime(topClimb.atMs) || 0;
                
                if (!didOrderFundAnyUnmaturedClimb && orderTimeMs > 0 && topClimbAtMs > 0 && orderTimeMs > topClimbAtMs + CLOCK_DRIFT_TOLERANCE_MS) {
                    balance = 0;
                    break;
                }
                
                const poppedClimb = remainingUnmaturedClimbs.pop();
                const restoredGateCost = FinancialEngineDef.extractNum(poppedClimb.costPaid) || getThreshold(sortedTrackTiers[currentIdx]);
                balance = safeAdd(balance, restoredGateCost);
                
                const poppedSpendStartMs = FinancialEngineDef.parseSafeTime(poppedClimb.spendStartMs) || FinancialEngineDef.parseSafeTime(poppedClimb.atMs) || 0;
                const poppedAtMs = FinancialEngineDef.parseSafeTime(poppedClimb.atMs) || poppedSpendStartMs;
                if (poppedAtMs > maxPoppedAtMs) maxPoppedAtMs = poppedAtMs;
                if (poppedSpendStartMs > 0) {
                    restoredStreakStartMs = poppedSpendStartMs;
                    const isRefundOfTriggeringOrder = (orderTimeMs === 0) || (poppedAtMs > 0 && orderTimeMs + CLOCK_DRIFT_TOLERANCE_MS >= poppedAtMs);
                    restoredCycleStartMs = isRefundOfTriggeringOrder ? poppedSpendStartMs : (poppedAtMs || poppedSpendStartMs);
                }
                
                const prevIdx = sortedTrackTiers.findIndex(t => String(t.id) === String(poppedClimb.fromTierId));
                currentIdx = prevIdx >= 0 ? Math.max(floorIdx, prevIdx) : Math.max(floorIdx, currentIdx - 1);
            }

            if (didOrderFundAnyUnmaturedClimb && remainingUnmaturedClimbs.length > 0) {
                const piggyBankFundingMs = (balanceBeforeRefund > 0) ? (rawCycleStartMs || serverNowMs) : 0;
                const replacementFundingAtMs = Math.max(maxPoppedAtMs, piggyBankFundingMs);
                if (replacementFundingAtMs > 0) {
                    remainingUnmaturedClimbs.forEach(c => {
                        const cAt = FinancialEngineDef.parseSafeTime(c.atMs) || 0;
                        if (orderTimeMs === 0 || cAt === 0 || orderTimeMs <= cAt + CLOCK_DRIFT_TOLERANCE_MS) {
                            c.atMs = Math.max(cAt, replacementFundingAtMs);
                        }
                    });
                }
            }
        }
        
        const finalTierObj = sortedTrackTiers[currentIdx] || activeTierObj;
        const finalTierId = String(finalTierObj.id);
        const updatedFloorIdx = Math.min(floorIdx, currentIdx);
        const updatedFloorTierId = String(sortedTrackTiers[updatedFloorIdx]?.id || finalTierId);
        
        if (restoredCycleStartMs && balance > 0) {
            const restoredNextGate = FinancialEngineDef._findNextGateInTrack(sortedTrackTiers, finalTierObj);
            const restoredGateDays = restoredNextGate ? FinancialEngineDef._getDurationDays(restoredNextGate, 30) : 0;
            const restoredElapsedDays = Math.max(0, (serverNowMs - restoredCycleStartMs) / MS_PER_DAY);
            if (restoredNextGate && restoredGateDays > 0 && restoredElapsedDays >= restoredGateDays) {
                balance = 0;
                restoredCycleStartMs = serverNowMs;
                restoredStreakStartMs = serverNowMs;
            }
        }
        
        return {
            finalTierId: finalTierId,
            lockedFloorTierId: updatedFloorTierId,
            newTierCycleSpentUsd: FinancialEngineDef.sanitizeAmount(Math.max(0, balance)),
            newTotalSpentUsd: newTotalSpentUsd,
            isDowngraded: finalTierId !== initialTierId,
            tierClimbs: remainingUnmaturedClimbs,
            restoredCycleStartMs: restoredCycleStartMs,
            restoredStreakStartMs: restoredStreakStartMs
        };
    },    

    getTierProgress: function(user, tiers, nowTime) {
        if (!user || !tiers || !Array.isArray(tiers) || tiers.length === 0) return null;
        
        const now = nowTime || Date.now();
        const currentTier = FinancialEngineDef.getUserTier(user, tiers);
        if (!currentTier) return null;
        
        const getThreshold = (t) => Number(t?.threshold ?? t?.condition_amount ?? 0);
        const currentTrackType = currentTier.type === 'api' ? 'api' : 'retail';
        const sortedTiers = FinancialEngineDef._sortTrackTiers(tiers, currentTrackType);
        
        let nextTier = null;
        if (currentTier.autoAdvance !== false) {
            nextTier = FinancialEngineDef._findNextGateInTrack(sortedTiers, currentTier);
        }
        const isMaxTier = !nextTier;

        const CYCLE_DAYS = isMaxTier ? 0 : FinancialEngineDef._getDurationDays(nextTier, 30);
        const isUnlimitedDuration = Boolean(!isMaxTier && CYCLE_DAYS <= 0);
        const parsedCycleStart = FinancialEngineDef.parseSafeTime(user.tierCycleStartDate);
        const rawCycleStart = (parsedCycleStart > 0 && parsedCycleStart <= now + 60000) ? parsedCycleStart : 0;
        const exactDaysPassed = rawCycleStart > 0 ? Math.max(0, (now - rawCycleStart) / MS_PER_DAY) : 0;
        const daysPassedFloor = Math.floor(exactDaysPassed);
        
        const isCycleAlreadyExpired = Boolean(
            !isMaxTier &&
            !isUnlimitedDuration &&
            user.manualTierOverride !== true &&
            user.isApiMerchant !== true &&
            currentTrackType !== 'api' &&
            rawCycleStart > 0 &&
            CYCLE_DAYS > 0 &&
            exactDaysPassed >= CYCLE_DAYS
        );
        
        const spent = isCycleAlreadyExpired ? 0 : FinancialEngineDef.sanitizeAmount(user.tierCycleSpent || 0);
        
        let remainingDays = 0;
        if (isMaxTier || isUnlimitedDuration || user.manualTierOverride === true || currentTrackType === 'api') {
            remainingDays = 0;
        } else if (isCycleAlreadyExpired || spent === 0) {
            remainingDays = CYCLE_DAYS;
        } else {
            remainingDays = Math.max(0, CYCLE_DAYS - daysPassedFloor);
        }
        
        const targetThreshold = isMaxTier ? getThreshold(currentTier) : getThreshold(nextTier);
        const targetNameDisplay = isMaxTier ? (currentTier.nameAr || currentTier.name) : (nextTier.nameAr || nextTier.name);
        
        let remainingAmt = isMaxTier ? 0 : FinancialEngineDef.sanitizeAmount(Math.max(0, FinancialEngineDef.safeSub(targetThreshold, spent)));
        let percent = isMaxTier ? 100 : (targetThreshold > 0 ? Math.min(100, Number(((spent / targetThreshold) * 100).toFixed(2))) : 100);
        
        if (user && user.manualTierOverride === true) {
            percent = 100;
            remainingAmt = 0;
        }
        
        return {
            currentTier,
            nextTier,
            isMaxTier,
            isUnlimitedDuration,
            targetNameDisplay,
            targetThreshold,
            spent,
            remainingAmt,
            percent,
            remainingDays,
            isGoalReached: isMaxTier || spent >= targetThreshold,
            isAutoAdvanceEnabled: !user.manualTierOverride && currentTier.autoAdvance !== false,
            trackType: currentTrackType
        };
    },

    getPricingLocal: function(prod, user, qty, optIdx, coupon, offer, tier, rates, baseCur, displayCur) {
        const params = {
            product: prod,
            tier: tier,
            offer: offer,
            coupon: coupon,
            optIdx: optIdx,
            allowDefaultOption: true
        };
        
        const result = FinancialEngineDef.calculateOrderTotal(params, qty);
        const isCounterProd = (prod?.type === 'counter');
        
        const convert = (amt, isUnit = false) => {
            if (isUnit && isCounterProd) {
                const rawV = FinancialEngineDef.convertViaUSD(amt, FinancialEngineDef.CONFIG.BASE_CURRENCY, displayCur, rates, 'pricing', true);
                return FinancialEngineDef._internalSanitize(rawV);
            }
            return FinancialEngineDef.convertViaUSDHelper(
                amt,
                FinancialEngineDef.CONFIG.BASE_CURRENCY,
                displayCur,
                rates,
                'round',
                'pricing'
            );
        };
        
        const unitFinalLocal = convert(result.finalPrice, true);
        const totalFinalLocal = convert(result.totalFinalPrice, false);
        const totalOriginalLocal = convert(result.totalOriginalPrice, false);
        const totalCouponDiscLocal = convert(result.totalCouponDiscount, false);
        const totalOfferDiscLocal = convert(result.totalOfferDiscount, false);
        const unitDecimals = (unitFinalLocal > 0 && unitFinalLocal < 0.00001) ?
            8 :
            ((unitFinalLocal > 0 && unitFinalLocal < 0.0001) ? 6 : ((unitFinalLocal > 0 && unitFinalLocal < 0.01) ? 4 : 2));
        
        return {
            unitText: `${unitFinalLocal.toFixed(unitDecimals)} ${displayCur}`,
            totalText: `${totalFinalLocal.toFixed(2)} ${displayCur}`,
            displayCurrency: displayCur,
            totalDisplayNum: totalFinalLocal,
            totalLocalBase: result.totalFinalPrice,
            oldTotalDisplayNum: totalOriginalLocal,
            oldTotalLocalBase: result.totalOriginalPrice,
            hasDiscount: result.totalDiscount > 0,
            pricingSnapshot: {
                originalPrice: totalOriginalLocal,
                finalPrice: totalFinalLocal,
                couponDiscount: totalCouponDiscLocal,
                offerDiscount: totalOfferDiscLocal,
                couponCode: result.couponCode,
                offerName: result.offerName,
                isFirewallViolated: result.isFirewallViolated,
                rejectionReason: result.rejectionReason,
                
                totalCostUsd: result.totalCostUsd,
                totalNetProfitUsd: result.totalNetProfitUsd,
                marginPct: result.marginPct
            }
        };
    }
};

export const FinancialEngine = Object.freeze(FinancialEngineDef);
if (typeof window !== 'undefined') { 
    window.FinancialEngine = FinancialEngine; 
    window.EventBus = window.EventBus || { emit: () => {} }; 
}
