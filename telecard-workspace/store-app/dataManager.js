// ============================================================================
// 🗄️ مدير البيانات والعمليات الحسابية (dataManager.js) - ES6 Module (Cloud Secured)
// 🎯 الوظيفة: معالجة البيانات، الحسابات المعقدة، والاتصال المباشر بالسحابة (Firebase)
// 🚀 التحديث: دمج التوقيت السحابي المتزامن، وتوحيد المترجم الزمني المركزي (SSOT)
// ============================================================================

import { getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

import { DB_KEYS, ACTIVE_USER_KEY } from './config.js';
import { Utils } from './utils.js';
import { FirebaseAdapter } from './core/firebaseAdapter.js';
import { RenderHelpers } from './core/renderHelpers.js'; // 🌟 النواة المركزية للرسم والوقت

// ============================================================================
// 🌐 1. البنية التحتية لقاعدة البيانات (Cloud Gateway)
// ============================================================================
export const StoreDB = FirebaseAdapter;

// ============================================================================
// 🧠 2. الذاكرة الحية للمتجر (RAM State) لسرعة التصفح
// ============================================================================
export const LiveStoreData = {
    cats: [], 
    prods: [], 
    settings: {}, 
    banners: [],
    users: [], 
    orders: [], 
    deposits: [], 
    payments: [], 
    tiers: [], 
    rates: [],
    vault: [], 
    coupons: [], 
    offers: [], 
    alerts: [] 
};

// ============================================================================
// 👑 3. الكائن الرئيسي لمدير البيانات (Single Source of Truth)
// ============================================================================
export const DataManager = {
    // ⏱️ مزامن التوقيت السحابي
    serverTimeOffset: 0,
    getNow: function() {
        return Date.now() + this.serverTimeOffset;
    },

    user: null,
    prefs: { sound: true, theme: 'dark', security2fa: false, favs: [] },
    favs: new Set(),
    selectedCurr: 'USD',
    
    currentProd: null,
    currentPayment: null,
    currentPayCurrency: null,
    currentReceiptData: null,
    appliedCoupon: null,

    _getCloudFunction: function(functionName) {
    const app = getApp();
    // 🌟 التأكد من وجود 'us-east1' هنا أمر حتمي لكي تعمل دوال الشراء والإيداع الموجودة بالأسفل!
    const functions = getFunctions(app, 'us-east1');
    return httpsCallable(functions, functionName);
},
    saveUserLocal: function() {
        if (!this.user) return;
        try {
            const liteUser = { ...this.user };
            delete liteUser.img;       
            delete liteUser.kycData;   
            localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(liteUser));
        } catch (e) { console.error('Storage Quota Error in saveUserLocal:', e); }
    },

    updateUserProfile: async function(newData) {
        const uid = this.user?.id || this.user?.uid || localStorage.getItem('telecard_active_user_uid');
        if (!uid) {
            console.error("🚨 DataManager: تعذّر العثور على المعرّف الفريد للمستخدم.");
            return false;
        }

        this.user = { ...this.user, ...newData };
        
        if (LiveStoreData.users && Array.isArray(LiveStoreData.users)) {
            LiveStoreData.users = Object.freeze(
                LiveStoreData.users.map(u => 
                    (String(u.id) === String(uid) || String(u.uid) === String(uid)) 
                    ? { ...u, ...newData } 
                    : u
                )
            );
        }

        try {
            const success = await StoreDB.set(DB_KEYS.USERS, uid, newData);
            if (success) {
                return true;
            } else {
                throw new Error("Firebase returned false during setDoc");
            }
        } catch (error) {
            console.error("🚨 DataManager: فشل تحديث بيانات الملف الشخصي:", error);
            return false;
        }
    },

    loadPrefs: function() {
        try {
            const saved = JSON.parse(localStorage.getItem(DB_KEYS.PREFS) || '{}');
            this.prefs = { 
                sound: saved.sound !== false, 
                theme: saved.theme || localStorage.getItem('telecard_theme') || 'dark', 
                security2fa: saved.security2fa === true, 
                favs: Array.isArray(saved.favs) ? saved.favs : [] 
            };
            const favIds = (this.prefs.favs || []).map(Number).filter(n => !isNaN(n));
            this.favs = new Set(favIds);
        } catch(e) {
            this.prefs = { sound: true, theme: 'dark', security2fa: false, favs: [] };
            this.favs = new Set();
        }
    },
    
    savePrefs: function() {
        try {
            if(this.favs) this.prefs.favs = Array.from(this.favs);
            localStorage.setItem(DB_KEYS.PREFS, JSON.stringify(this.prefs || {}));
        } catch(e) { console.warn('pref save error', e); }
    },

    getTiers: function() { return LiveStoreData.tiers || []; },

    getUserTier: function(user) {
        const tiers = this.getTiers();
        if (!tiers || tiers.length === 0) return { profit_percent: 0, min_profit_usd: 0 }; 

        const code = (user?.tierId ?? user?.tier);
        const byId = tiers.find(t => String(t.id) === String(code));
        if (byId) return byId;
        
        return tiers.find(t => t.isDefault) || tiers[0];
    },

    getTierProgress: function() {
        if (!this.user) return null;
        
        const currentTier = this.getUserTier(this.user);
        const tiers = this.getTiers();
        if (!currentTier || tiers.length === 0) return null;

        const sortedTiers = [...tiers].sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0));
        const spent = Number(this.user.tierCycleSpent || 0);
        
        const durationDays = Number(currentTier.durationDays || currentTier.duration_days || 30);
        const durationMs = durationDays * 24 * 60 * 60 * 1000;
        const cycleStart = Number(this.user.tierCycleStartDate || this.getNow()); // 🌟 تطبيق التوقيت المتزامن
        const remainingDays = Math.max(0, Math.ceil((durationMs - (this.getNow() - cycleStart)) / (1000 * 60 * 60 * 24))); // 🌟 التوقيت المتزامن

        const nextTier = sortedTiers.find(t => Number(t.threshold || 0) > Number(currentTier.threshold || 0));
        
        let targetThreshold = 0;
        let targetNameDisplay = "";
        let isGoalReached = false;

        if (nextTier) {
            targetThreshold = Number(nextTier.threshold);
            targetNameDisplay = nextTier.name;
        } else {
            targetThreshold = Number(currentTier.threshold || 0) > 0 ? Number(currentTier.threshold) : 500;
            targetNameDisplay = "للحفاظ على المميزات";
            if (spent >= targetThreshold) isGoalReached = true;
        }

        const percent = Math.min(100, Math.max(0, (spent / targetThreshold) * 100));
        const remainingAmt = Math.max(0, targetThreshold - spent);

        return {
            currentTier, nextTier, targetNameDisplay, targetThreshold, spent,
            remainingAmt, percent, remainingDays, isMaxTier: !nextTier,
            isGoalReached, isAutoAdvanceEnabled: currentTier.autoAdvance !== false
        };
    },

    getActiveOffer: function(prodId) {
        const offers = LiveStoreData.offers || [];
        const now = this.getNow(); // 🌟 تطبيق التوقيت المتزامن
        return offers.find(o => 
            o.isActive && (!o.expiryDate || o.expiryDate > now) && 
            o.targetProds && o.targetProds.includes(String(prodId))
        );
    },

    // ============================================================================
    // 🧮 4. المحرك الموحد للتسعير (يُستخدم لعرض الأسعار للعميل قبل الشراء فقط)
    // ============================================================================
    calculateFinalPrice: function(prod, user, qty, optIdx, appliedCoupon) {
        let q = Math.max(1, Number(qty) || 1);
        if (prod.type === 'select') q = 1; 

        let rawUnitCost = 0;
        if (prod.type === 'select' && Array.isArray(prod.options) && prod.options[optIdx]) {
            const opt = prod.options[optIdx];
            rawUnitCost = Number(opt.costPrice || opt.price || 0);
        } else {
            rawUnitCost = Number(prod.costPrice || prod.price || 0);
        }

        const tier = this.getUserTier(user);
        
        // 🌟 الإصلاح الدفاعي
        const isFixed = (prod.isFixedPrice === true || String(prod.isFixedPrice).toLowerCase() === 'true' || 
                         prod.is_fixed_price === true || String(prod.is_fixed_price).toLowerCase() === 'true');
                         
        const fixedUsd = Number(prod.fixedPriceUsd || prod.fixed_price_usd || 0);
        
        let appliedTier = tier;
        if (isFixed && fixedUsd > 0) {
            rawUnitCost = fixedUsd; 
            appliedTier = null; 
        }

        const activeOffer = this.getActiveOffer(prod.id);

        let unitSnapshot = {
            cost: rawUnitCost, tierPrice: rawUnitCost, originalPrice: rawUnitCost, finalPrice: rawUnitCost,
            tierName: null, offerName: null, offerDiscount: 0, couponCode: null, couponDiscount: 0,
            totalDiscountVal: 0, profit: 0, marginPct: 0, isFirewallActive: false
        };

        if (Utils.TelecardPricingEngine && typeof Utils.TelecardPricingEngine.calculate === 'function') {
            unitSnapshot = Utils.TelecardPricingEngine.calculate({
                costPrice: rawUnitCost, 
                tier: appliedTier, 
                offer: activeOffer, 
                coupon: appliedCoupon
            });
        } else {
            console.error("🚨 المحرك المالي غير متاح! تم استخدام التسعير الافتراضي (سعر التكلفة).");
            unitSnapshot.profit = -1; 
        }

        let oldPriceUsd = null;
        if (activeOffer && activeOffer.type === 'fake') {
            oldPriceUsd = Number(activeOffer.value || 0);
        }

        return {
            unitSnapshot: unitSnapshot, 
            totalUsd: unitSnapshot.finalPrice * q,
            unitUsd: unitSnapshot.finalPrice,
            originalTotalUsd: unitSnapshot.originalPrice * q, 
            rawTotalCost: unitSnapshot.cost * q,
            unitCost: unitSnapshot.cost,
            saleDiscountUsd: unitSnapshot.offerDiscount * q,
            couponDiscountUsd: unitSnapshot.couponDiscount * q,
            oldPriceUsd: oldPriceUsd, 
            displayOldTotalUsd: oldPriceUsd ? (oldPriceUsd * q) : (unitSnapshot.originalPrice * q)
        };
    },
    computeSellingUsd: function(prod, user, qty=1, optIndex=null) {
        const pricing = this.calculateFinalPrice(prod, user, qty, optIndex, null);
        return pricing.totalUsd;
    },

    _safeConvert: function(amount, fromCurr, toCurr, rates, channel) {
        if (typeof Utils.convertViaUSD === 'function') {
            return Utils.convertViaUSD(amount, fromCurr, toCurr, rates, channel);
        }
        return amount; 
    },

    getPricingLocal: function(prod, qty, optIdx, appliedCoupon) {
        if (!prod) return null;
        
        const adminDefaultCurrency = (LiveStoreData.settings && LiveStoreData.settings.defaultCurrency) ? LiveStoreData.settings.defaultCurrency : 'USD';
        const baseCurrency = this.user ? (this.user.baseCurrency || this.user.base_currency || 'USD').toUpperCase() : adminDefaultCurrency;
        const displayCurrency = (this.selectedCurr || baseCurrency).toUpperCase();
        
        const rates = this.getRates();
        const pricing = this.calculateFinalPrice(prod, this.user, qty, optIdx, appliedCoupon);

        const totalLocalBase = Math.ceil(this._safeConvert(pricing.totalUsd, 'USD', baseCurrency, rates, 'pricing') * 100) / 100;
        const unitPriceLocal = Math.ceil(this._safeConvert(pricing.unitUsd, 'USD', baseCurrency, rates, 'pricing') * 100) / 100;
        
        const valUnit = (displayCurrency === baseCurrency) ? unitPriceLocal : this._safeConvert(unitPriceLocal, baseCurrency, displayCurrency, rates, 'pricing');
        const valTotal = (displayCurrency === baseCurrency) ? totalLocalBase : this._safeConvert(totalLocalBase, baseCurrency, displayCurrency, rates, 'pricing');
        
        let oldTotalLocal = 0;
        if (pricing.displayOldTotalUsd) {
             oldTotalLocal = this._safeConvert(pricing.displayOldTotalUsd, 'USD', displayCurrency, rates, 'pricing');
        }

         return {
            totalUsd: pricing.totalUsd,
            totalLocalBase: totalLocalBase, 
            displayCurrency: displayCurrency,
            unitText: valUnit.toFixed(2) + (displayCurrency === 'USD' ? ' $' : ' ' + displayCurrency),
            totalText: valTotal.toFixed(2) + (displayCurrency === 'USD' ? ' $' : ' ' + displayCurrency),
            hasDiscount: (pricing.oldPriceUsd || pricing.couponDiscountUsd > 0 || pricing.saleDiscountUsd > 0),
            oldTotalLocalBase: oldTotalLocal,
            pricingSnapshot: pricing
        };
    },

    validateCoupon: function(code, prod, qty, optIdx) {
        if (!code) return { valid: false, msg: 'يرجى إدخال الكود' };
        
        const coupons = LiveStoreData.coupons || [];
        const coupon = coupons.find(c => c.code.toUpperCase() === code.toUpperCase());
        const now = this.getNow(); // 🌟 تطبيق التوقيت المتزامن
        
        if (!coupon) return { valid: false, msg: 'الكود غير صحيح أو غير موجود' };
        if (coupon.isActive === false || String(coupon.isActive) === 'false') return { valid: false, msg: 'عذراً، هذا الكوبون غير فعال حالياً' };
        if (coupon.expiryDate && now > coupon.expiryDate) return { valid: false, msg: 'عذراً، انتهت صلاحية هذا الكوبون' };
        if (Number(coupon.maxUses) > 0 && Number(coupon.usedCount || 0) >= Number(coupon.maxUses)) return { valid: false, msg: 'عذراً، لقد نفذت كمية الاستخدام المسموحة لهذا الكوبون' };
        
        if (coupon.targetTiers && Array.isArray(coupon.targetTiers) && coupon.targetTiers.length > 0) {
            const userTier = this.getUserTier(this.user);
            if (!userTier || !coupon.targetTiers.includes(String(userTier.id))) return { valid: false, msg: 'عذراً، هذا الكوبون غير متاح لمستوى عضويتك الحالي' };
        }
        
        if (coupon.targetProds && Array.isArray(coupon.targetProds) && coupon.targetProds.length > 0) {
            const currentProdId = String(prod.id);
            const currentCatId = String(prod.catId);
            if (!coupon.targetProds.includes(currentProdId) && !coupon.targetProds.includes(currentCatId)) {
                return { valid: false, msg: 'الكوبون غير صحيح أو تأكد من صلاحية الاستخدام' };
            }
        }
        if (coupon.allowedUsers && Array.isArray(coupon.allowedUsers) && coupon.allowedUsers.length > 0) {
            if (!coupon.allowedUsers.includes(Number(this.user.id))) return { valid: false, msg: 'عذراً، هذا الكوبون مخصص لعملاء محددين' };
        }
        
        if (Number(coupon.maxPerUser) > 0) {
            const userKey = `user_${this.user.id}`;
            const userUsageCount = (coupon.usageHistory && coupon.usageHistory[userKey]) ? coupon.usageHistory[userKey] : 0;
            if (userUsageCount >= Number(coupon.maxPerUser)) return { valid: false, msg: `لقد استنفدت الحد الأقصى لاستخدام هذا الكوبون (${coupon.maxPerUser} مرات)` };
        }
        
        if (Number(coupon.minOrder) > 0) {
            const pricing = this.calculateFinalPrice(prod, this.user, qty, optIdx, null);
            if (pricing.totalUsd < Number(coupon.minOrder)) return { valid: false, msg: `عذراً، الحد الأدنى لاستخدام هذا الكوبون هو ${coupon.minOrder}$` };
        }

        return { valid: true, coupon: coupon };
    },

    getRates: function() {
        const rates = LiveStoreData.rates || {};
        return Utils.normalizeRates(rates);
    },

    convertViaUSDHelper: function(amount, fromCurr, toCurr, rounding='round', channel='pricing') {
        const rates = this.getRates();
        let val = this._safeConvert(amount, (fromCurr||'USD').toUpperCase(), (toCurr||'USD').toUpperCase(), rates, channel);
        if(rounding === 'floor') return Math.floor(val * 10000) / 10000;
        if(rounding === 'ceil')  return Math.ceil(val * 10000) / 10000;
        return Number(val.toFixed(4));
    },

    // ============================================================================
    // 👤 5. دوال العميل وإدارة المحفظة والطلبات (Cloud Secured)
    // ============================================================================
    logout: function() {
        try {
            localStorage.removeItem('telecard_active_user_uid');
            localStorage.removeItem(ACTIVE_USER_KEY);
            localStorage.removeItem('telecard_display_currency');
        } catch(e) { console.warn('logout cleanup error', e); }
        
        window.location.replace('login.html');
    },

    syncUser: function() { 
        const users = LiveStoreData.users || [];
        const activeUid = localStorage.getItem('telecard_active_user_uid'); 
        
        let me = null;
        if(activeUid) {
            const foundUser = users.find(u => String(u.id) === String(activeUid));
            if (foundUser) me = { ...foundUser };
        }
        
        const isSystemBooted = window.ClientSystem && window.ClientSystem.isReady;
        
        if (activeUid && !me) {
            if (users.length > 0 && isSystemBooted) {
                console.warn("⚠️ الحساب لم يعد موجوداً في قاعدة البيانات المركزية. جاري تسجيل الخروج...");
                this.logout();
                return false;
            } else {
                return true; 
            }
        }
        
        if(me) {
            me.baseCurrency = me.baseCurrency || me.base_currency || 'USD';
            const bal = me.walletBalance ?? me.wallet_balance ?? me.balance ?? 0;
            me.walletBalance = bal;
            me.inbox = me.inbox || []; 

            if (me.tierCycleStartDate === undefined) {
                me.tierCycleStartDate = this.getNow(); // 🌟 تطبيق التوقيت المتزامن
                me.tierCycleSpent = 0;
            }

            if (me.inbox && me.inbox.length > 30) {
                me.inbox = [...me.inbox].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 30);
            }

            this.user = me; 
            this.saveUserLocal(); 
        } else {
            this.user = null;
        }
        
        const adminDefaultCurrency = (LiveStoreData.settings && LiveStoreData.settings.defaultCurrency) ? LiveStoreData.settings.defaultCurrency : 'USD';
        let savedCurr = localStorage.getItem('telecard_display_currency') || (this.user?.baseCurrency) || adminDefaultCurrency;

        const settings = LiveStoreData.settings || {};
        const isToggleAllowed = settings.showCurrencyToggle !== false;

        if (!isToggleAllowed && this.user && savedCurr !== this.user.baseCurrency) {
            savedCurr = this.user.baseCurrency; 
            localStorage.setItem('telecard_display_currency', savedCurr); 
        }

        this.selectedCurr = savedCurr;
        return true;
    },

    ackAdminMessage: async function() {
        if (!this.user || !this.user.id) return;
        try {
            this.updateUserProfile({ adminMessage: '' });
        } catch(e) { console.error("Failed to acknowledge message", e); }
    },

        updateWalletStats: function() {
    if (!this.user) return;
    
    const allOrders = LiveStoreData.orders || [];
    const allDeposits = LiveStoreData.deposits || [];
    
    // 1. حساب الأموال الصادرة (المشتريات الفعلية)
    let mySpent = allOrders
        .filter(o => String(o.userId) === String(this.user.id) && o.status !== 'rejected' && o.status !== 'refunded' && o.status !== 'returned')
        .reduce((sum, order) => sum + Number(order.price || 0), 0);
    
    // 2. حساب الأموال الواردة (والخصومات الإدارية)
    let myDeposits = 0;
    
    allDeposits
        .filter(d => String(d.userId) === String(this.user.id) && d.status === 'approved')
        .forEach(dep => {
            const val = dep.creditedAmount !== undefined ? Number(dep.creditedAmount) : Number(dep.amount || 0);
            
            if (val > 0) {
                // إذا كان إيداعاً حقيقياً أو إضافة رصيد من الإدارة (أموال واردة)
                myDeposits += val;
            } else if (val < 0) {
                // 🚨 الحل المحاسبي: "خصم الرصيد من الإدارة" (قيمة سالبة) يُعتبر "أموال صادرة"
                // لذا نضيفه بقيمته المطلقة إلى خانة (المشتريات / المسحوبات) ليتوازن الميزان!
                mySpent += Math.abs(val);
            }
        });
    
    // 3. تحديث بيانات العرض للعميل لكي تتطابق الكبسولات الثلاث بشكل مثالي
    this.user.totalSpent = mySpent;
    this.user.totalDeposit = myDeposits;
},
submitPasswordChange: function(currentVal, newVal, confirmVal) {
        if(!newVal || newVal.length < 4) return { success: false, msg: 'الرجاء إدخال كلمة مرور لا تقل عن 4 أحرف.' };
        if(newVal !== confirmVal) return { success: false, msg: 'كلمتا المرور غير متطابقتين.' };
        
        const currentStored = this.user?.pass || '';
        if(currentStored && currentVal !== currentStored) return { success: false, msg: 'كلمة المرور الحالية غير صحيحة.' };

        try {
            this.updateUserProfile({ pass: newVal });
            return { success: true, msg: 'تم تحديث كلمة المرور بنجاح.' };
        } catch(e) {
            console.error('submitPasswordChange error', e);
            return { success: false, msg: 'تعذر تحديث كلمة المرور.' };
        }
    },

    confirmPurchase: async function(prod, qty, optIdx, finalInputStr, appliedCoupon) {
        if (!prod || !this.user) return { success: false, msg: 'بيانات مفقودة' };

        const pricingCheck = this.calculateFinalPrice(prod, this.user, qty, optIdx, appliedCoupon);
        
        const isFixed = (prod.isFixedPrice === true || String(prod.isFixedPrice).toLowerCase() === 'true' || 
                         prod.is_fixed_price === true || String(prod.is_fixed_price).toLowerCase() === 'true');

        if (!isFixed && pricingCheck.unitSnapshot.profit <= 0) {
            console.error("🚨 تم حظر البيع: النظام حاول البيع بدون تطبيق نسبة ربح المستوى.");
            return { 
                success: false, 
                msg: 'عذراً، تعذر إتمام الطلب لعدم توفر تسعيرة المستوى الخاص بك لهذا المنتج. يرجى التواصل مع الإدارة.' 
            };
        }

        try {
            const createOrderFn = this._getCloudFunction('createOrder');
            
            const requestData = {
                productId: String(prod.id),
                qty: Number(qty) || 1,
                optIdx: optIdx !== null && optIdx !== undefined ? Number(optIdx) : null,
                finalInputStr: finalInputStr || '---',
                couponCode: appliedCoupon ? appliedCoupon.code : null
            };

            const result = await createOrderFn(requestData);
            const responseData = result.data;

            return {
                success: true,
                msg: responseData.message || 'تم إتمام الطلب بنجاح',
                isAutoDelivered: responseData.isAutoDelivered,
                deliveredCodeText: responseData.deliveredCode
            };

        } catch (error) {
            console.error("Cloud Function Error (createOrder):", error);
            
            let finalUserMessage = 'حدث خطأ أثناء معالجة الطلب، يرجى المحاولة لاحقاً.';
            
            if (error.details) {
                finalUserMessage = error.details;
            } else if (error.message) {
                if (error.message.toLowerCase().includes('internal') || error.message.toLowerCase().includes('functions/')) {
                    finalUserMessage = 'رصيدك غير كافٍ ، يرجى إيداع رصيد أولاً لإتمام العملية.';
                } else {
                    finalUserMessage = error.message;
                }
            }

            return { 
                success: false, 
                msg: finalUserMessage 
            };
        }
    },

    calculateDepositFee: function(amount, paymentMethod, payCurr) {
        if (!paymentMethod) return { isValid: false, msg: 'طريقة دفع مفقودة', netBase: 0, feePct: 0, feeType: 'fee', feeUnit: 'percent' };
        
        const payCurrUpper = (payCurr || '').toUpperCase();
        
        let settings = {
            fee: parseFloat(paymentMethod.fee) || 0,
            min: parseFloat(paymentMethod.min) || 0,
            max: parseFloat(paymentMethod.max) || 0,
            feeType: paymentMethod.feeType || 'fee',
            feeUnit: paymentMethod.feeUnit || paymentMethod.unit || 'percent' 
        };

        if (paymentMethod.currencySettings && paymentMethod.currencySettings[payCurrUpper]) {
            const s = paymentMethod.currencySettings[payCurrUpper];
            settings.fee = parseFloat(s.fee) || 0;
            settings.min = parseFloat(s.min) || 0;
            settings.max = parseFloat(s.max) || 0;
            settings.feeType = s.feeType || 'fee';
            settings.feeUnit = s.feeUnit || s.unit || 'percent'; 
        } 

        const baseCurr = ((this.user.baseCurrency || this.user.base_currency || 'USD') || '').toUpperCase();
        
        if (amount > 0) {
            if (settings.min > 0 && amount < settings.min) return { isValid: false, msg: `أقل مبلغ هو ${settings.min} ${payCurrUpper}`, netBase: 0, feePct: settings.fee, feeType: settings.feeType, feeUnit: settings.feeUnit };
            if (settings.max > 0 && amount > settings.max) return { isValid: false, msg: `أقصى مبلغ هو ${settings.max} ${payCurrUpper}`, netBase: 0, feePct: settings.fee, feeType: settings.feeType, feeUnit: settings.feeUnit };
        } else {
            return { isValid: false, msg: 'مبلغ غير صالح', netBase: 0, feePct: settings.fee, feeType: settings.feeType, feeUnit: settings.feeUnit };
        }

        let feeAmount = 0;
        if (settings.feeUnit === 'fixed' || settings.feeUnit === 'amount') {
            feeAmount = settings.fee; 
        } else {
            feeAmount = amount * (settings.fee / 100); 
        }

        let netPayCurr = amount;
        if (settings.feeType === 'bonus') netPayCurr += feeAmount;
        else netPayCurr -= feeAmount;

        let netBase = this.convertViaUSDHelper(netPayCurr, payCurrUpper, baseCurr, 'floor', 'deposit');
        if (isNaN(netBase) || !isFinite(netBase)) netBase = 0;

        return { 
            isValid: true, 
            netBase: netBase, 
            feePct: settings.fee, 
            feeType: settings.feeType, 
            feeUnit: settings.feeUnit, 
            feeAmount: feeAmount 
        };
    },

    submitBalanceRequest: async function(amount, paymentMethod, payCurr, netBase, receiptData) {
        if (!paymentMethod) return { success: false, msg: 'حدث خطأ: لم يتم تحديد طريقة الدفع' };
        if (amount <= 0) return { success: false, msg: 'يرجى إدخال مبلغ صحيح ضمن الحدود المسموحة' };
        if (paymentMethod.reqProof !== false && !receiptData) return { success: false, msg: 'يرجى إرفاق صورة إشعار الدفع أولاً', errType: 'receipt' };

        try {
            const submitDepositFn = this._getCloudFunction('submitBalanceRequest');
            
            const requestData = {
                amount: Number(amount),
                paymentMethodName: paymentMethod.name,
                payCurr: payCurr,
                netBase: Number(netBase),
                receiptData: receiptData || null
            };

            const result = await submitDepositFn(requestData);
            
            return { success: true, msg: result.data.message || 'تم إرسال طلب الإيداع بنجاح، يرجى الانتظار لحين المراجعة' };

        } catch (error) {
            console.error("Cloud Function Error (submitBalanceRequest):", error);
            return { success: false, msg: error.message || 'تعذر إرسال طلب الإيداع، يرجى المحاولة لاحقاً.' };
        }
    },
    
    // 🌟 توجيه التنسيق الزمني للنواة المركزية
    formatDateLocal: function(timestamp) {
        if (typeof RenderHelpers !== 'undefined' && RenderHelpers.formatSafeDate) {
            return RenderHelpers.formatSafeDate(timestamp);
        }
        return '---';
    },

    isFavorite: function(id) {
        const numId = Number(id);
        return this.favs && this.favs.has(numId);
    },

    toggleFavorite: function(id) {
        const numId = Number(id);
        if(isNaN(numId)) return;
        
        if(!this.favs) this.favs = new Set();
        if(this.favs.has(numId)) {
            this.favs.delete(numId);
        } else {
            this.favs.add(numId);
        }
        this.savePrefs();
    },

    getAdminCountries: async function() {
        try {
            const countries = await StoreDB.getAll(DB_KEYS.COUNTRIES);
            return Array.isArray(countries) ? countries : [];
        } catch (e) {
            console.error("DataManager Error: Failed to fetch countries from Cloud", e);
            return [];
        }
    },

    _isAlertForUser: function(msg, user, now, readIds = []) {
        const type = msg.targetType || msg.target || 'all';
        const tId = msg.targetId || msg.userId || msg.tierId || null;

        const isForMe = type === 'all' || 
                        (type === 'user' && String(tId) === String(user.id)) ||
                        (type === 'tier' && String(tId) === String(user.tierId));
        
        if (!isForMe) return false;
        if (msg.expiresAt && now > msg.expiresAt) return false;
        if (readIds.includes(String(msg.id))) return false;
        return true;
    },

    getUnreadAlerts: function() {
        const user = this.user; 
        if (!user) return [];

        const globalAlerts = LiveStoreData.alerts || [];
        const inboxAlerts = user.inbox || [];
        const allAlerts = [...globalAlerts, ...inboxAlerts];

        const readIds = JSON.parse(localStorage.getItem(DB_KEYS.NOTIF_READ_LIST) || "[]").map(String);
        const now = this.getNow(); // 🌟 تطبيق التوقيت المتزامن

        return allAlerts.filter(msg => {
            if (!this._isAlertForUser(msg, user, now, readIds)) return false;

            const isPopup = msg.type === 'popup' || msg.isPopup;
            if (isPopup && msg.maxViews) {
                const views = parseInt(localStorage.getItem(`alert_views_${msg.id}`) || "0");
                if (views >= msg.maxViews) return false; 
            }
            return true;
        }).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); 
    },

    getAllUserAlerts: function() {
        const user = this.user; 
        if (!user) return [];

        const globalAlerts = LiveStoreData.alerts || [];
        const inboxAlerts = user.inbox || [];
        const allAlerts = [...globalAlerts, ...inboxAlerts];
        const now = this.getNow(); // 🌟 تطبيق التوقيت المتزامن

        return allAlerts.filter(msg => {
            return this._isAlertForUser(msg, user, now, []);
        }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },

    markAlertAsRead: function(msgId, isPopup = false, maxViews = null) {
        if (!msgId) return;

        if (isPopup && maxViews && maxViews > 1) {
            let views = parseInt(localStorage.getItem(`alert_views_${msgId}`) || "0");
            views++;
            localStorage.setItem(`alert_views_${msgId}`, views.toString());
            if (views < maxViews) return; 
        }

        const readIds = JSON.parse(localStorage.getItem(DB_KEYS.NOTIF_READ_LIST) || "[]").map(String);
        
        if (!readIds.includes(String(msgId))) {
            readIds.push(String(msgId));
            localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(readIds));
        }
    },

    markAllAlertsRead: function() {
        const allAlerts = this.getAllUserAlerts();
        if (allAlerts.length === 0) return;

        const readIds = JSON.parse(localStorage.getItem(DB_KEYS.NOTIF_READ_LIST) || "[]").map(String);

        allAlerts.forEach(msg => {
            if (!readIds.includes(String(msg.id))) readIds.push(String(msg.id));
            if (msg.type === 'popup' || msg.isPopup) {
                localStorage.setItem(`alert_views_${msg.id}`, (msg.maxViews || 99).toString());
            }
        });

        localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(readIds));
    }
};
