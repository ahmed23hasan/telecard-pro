// ============================================================================
// 🗄️ مدير البيانات والعمليات الحسابية (dataManager.js) - ES6 Module (Pure Model)
// 🎯 الوظيفة: معالجة البيانات، الحسابات المعقدة، والاتصال المباشر بالسحابة (Firebase)
// 🚀 التحديث: دمج نظام المعرفات القصيرة (displayId) للطلبات والإيداعات
// ============================================================================

import { DB_KEYS, ACTIVE_USER_KEY } from './config.js';
import { Utils } from './utils.js';
import { FirebaseAdapter } from './core/firebaseAdapter.js';

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
    rates: [],   // 🌟 تم تصحيحها هنا لتصبح مصفوفة (Array) بدلاً من كائن (Object)
    vault: [], 
    coupons: [], 
    offers: [], 
    alerts: [] 
};
// ============================================================================
// 👑 3. الكائن الرئيسي لمدير البيانات (Single Source of Truth)
// ============================================================================
export const DataManager = {
    user: null,
    prefs: { sound: true, theme: 'dark', security2fa: false, favs: [] },
    favs: new Set(),
    selectedCurr: 'USD',
    
    currentProd: null,
    currentPayment: null,
    currentPayCurrency: null,
    currentReceiptData: null,
    appliedCoupon: null,

    // 🌟 حماية العميل وحفظه محلياً بأمان (للجلسة السريعة)
    saveUserLocal: function() {
        if (!this.user) return;
        try {
            const liteUser = { ...this.user };
            delete liteUser.img;       
            delete liteUser.kycData;   
            localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(liteUser));
        } catch (e) { console.error('Storage Quota Error in saveUserLocal:', e); }
    },

    // 🌟 تحديث بيانات العميل (مزامنة حية مع Firestore كمستند مستقل)
            updateUserProfile: async function(newData) {
        // 1. تأمين جلب المعرّف الفريد الحقيقي للمستخدم ومنع تضارب المعرفات (id vs uid)
        const uid = this.user?.id || this.user?.uid || localStorage.getItem('telecard_active_user_uid');
        if (!uid) {
            console.error("🚨 DataManager: تعذّر العثور على المعرّف الفريد للمستخدم (UID)؛ تم إلغاء عملية الحفظ لمنع البيانات التالفة.");
            return false;
        }

        // 2. تحديث البيانات محلياً في الذاكرة الحية (RAM State) فوراً لسرعة استجابة الواجهة
        this.user = { ...this.user, ...newData };
        
        if (LiveStoreData.users && Array.isArray(LiveStoreData.users)) {
            const idx = LiveStoreData.users.findIndex(u => String(u.id) === String(uid) || String(u.uid) === String(uid));
            if (idx > -1) {
                LiveStoreData.users[idx] = { ...LiveStoreData.users[idx], ...newData };
            }
        }

        // 3. الحفظ الفعلي والآمن في قاعدة بيانات Firebase Firestore مع انتظار رد السيرفر
        try {
            // استخدام البوابة الشرعية الموحدة واشتراط دمج البيانات (Merge) لمنع مسح الحقول الأخرى
            const success = await StoreDB.set(DB_KEYS.USERS, uid, newData);
            
            if (success) {
                console.log(`✅ DataManager: تم تحديث مستند المستخدم [${uid}] بنجاح في السحابة.`);
                return true;
            } else {
                throw new Error("Firebase returned false during setDoc");
            }
        } catch (error) {
            console.error("🚨 DataManager: فشل تحديث بيانات الملف الشخصي في فايربيز:", error);
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
        const cycleStart = Number(this.user.tierCycleStartDate || Date.now());
        const remainingDays = Math.max(0, Math.ceil((durationMs - (Date.now() - cycleStart)) / (1000 * 60 * 60 * 24)));

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
        const now = Date.now();
        return offers.find(o => 
            o.isActive && (!o.expiryDate || o.expiryDate > now) && 
            o.targetProds && o.targetProds.includes(String(prodId))
        );
    },

    // ============================================================================
    // 🧮 4. المحرك الموحد للتسعير (Single Source of Truth Pricing)
    // ============================================================================
    calculateFinalPrice: function(prod, user, qty, optIdx, appliedCoupon) {
        let q = Math.max(1, Number(qty) || 1);
        if (prod.type === 'select') q = 1; 

        let rawUnitCost = 0;
        if (prod.type === 'select' && Array.isArray(prod.options) && prod.options[optIdx]) {
            const opt = prod.options[optIdx];
            rawUnitCost = Number(opt.price || opt.costPrice || 0);
        } else {
            rawUnitCost = Number(prod.costPrice || prod.unitCost || prod.price || 0);
        }

        const isFixed = !!(prod.isFixedPrice || prod.is_fixed_price);
        const fixedUsd = Number(prod.fixedPriceUsd || prod.fixed_price_usd || 0);
        if (isFixed && fixedUsd > 0) rawUnitCost = fixedUsd; 

        const tier = this.getUserTier(user);
        const activeOffer = this.getActiveOffer(prod.id);

        let unitSnapshot = {
            cost: rawUnitCost, tierPrice: rawUnitCost, originalPrice: rawUnitCost, finalPrice: rawUnitCost,
            tierName: null, offerName: null, offerDiscount: 0, couponCode: null, couponDiscount: 0,
            totalDiscountVal: 0, profit: 0, marginPct: 0, isFirewallActive: false
        };

        if (Utils.TelecardPricingEngine && typeof Utils.TelecardPricingEngine.calculate === 'function') {
            const appliedTier = isFixed ? null : tier; 
            unitSnapshot = Utils.TelecardPricingEngine.calculate({
                costPrice: rawUnitCost, tier: appliedTier, offer: activeOffer, coupon: appliedCoupon
            });
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
        if (!prod || !this.user) return null;
        
        const baseCurrency = (this.user.baseCurrency || this.user.base_currency || 'USD').toUpperCase();
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
        const now = Date.now();
        
        if (!coupon) return { valid: false, msg: 'الكود غير صحيح أو غير موجود' };
        if (!coupon.isActive) return { valid: false, msg: 'عذراً، هذا الكوبون غير فعال حالياً' };
        if (coupon.expiryDate && now > coupon.expiryDate) return { valid: false, msg: 'عذراً، انتهت صلاحية هذا الكوبون' };
        if (coupon.maxUses > 0 && (coupon.usedCount || 0) >= coupon.maxUses) return { valid: false, msg: 'عذراً، لقد نفذت كمية الاستخدام المسموحة لهذا الكوبون' };
        
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
        
        if (coupon.maxPerUser > 0) {
            const userKey = `user_${this.user.id}`;
            const userUsageCount = (coupon.usageHistory && coupon.usageHistory[userKey]) ? coupon.usageHistory[userKey] : 0;
            if (userUsageCount >= coupon.maxPerUser) return { valid: false, msg: `لقد استنفدت الحد الأقصى لاستخدام هذا الكوبون (${coupon.maxPerUser} مرات)` };
        }
        
        if (coupon.minOrder > 0) {
            const pricing = this.calculateFinalPrice(prod, this.user, qty, optIdx, null);
            if (pricing.totalUsd < coupon.minOrder) return { valid: false, msg: `عذراً، الحد الأدنى لاستخدام هذا الكوبون هو ${coupon.minOrder}$` };
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
    // 👤 5. دوال العميل وإدارة المحفظة والطلبات (Cloud Optimized)
    // ============================================================================
        logout: function() {
        try {
            // 🌟 تنظيف الذاكرة بالكامل من معرّفات الدخول
            localStorage.removeItem('telecard_active_user_uid');
            localStorage.removeItem(ACTIVE_USER_KEY);
            localStorage.removeItem('telecard_display_currency');
        } catch(e) { console.warn('logout cleanup error', e); }
        
        // 🌟 توجيه العميل لصفحة الدخول، واستخدام replace لمنعه من العودة للمتجر بزر "رجوع"
        window.location.replace('login.html');
    },
        syncUser: function() { 
        const users = LiveStoreData.users || [];
        
        // 🌟 1. قراءة المعرف السري الذي تم حفظه في صفحة login.html
        const activeUid = localStorage.getItem('telecard_active_user_uid'); 
        
        let me = null;
        
        // 🌟 2. البحث عن المستخدم في الرام/قاعدة البيانات
        if(activeUid) {
            me = users.find(u => String(u.id) === String(activeUid));
        }
        
        // 🌟 3. إذا كان هناك UID مسجل، لكن الحساب غير موجود (تم حذفه من الإدارة مثلاً)
        if (activeUid && !me && users.length > 0) {
            console.warn("⚠️ الحساب لم يعد موجوداً في قاعدة البيانات. جاري تسجيل الخروج...");
            this.logout();
            return false; 
        }
        
        if(me) {
            me.baseCurrency = me.baseCurrency || me.base_currency || 'USD';
            const bal = me.walletBalance ?? me.wallet_balance ?? me.balance ?? 0;
            me.walletBalance = bal;
            me.inbox = me.inbox || []; 

            if (me.tierCycleStartDate === undefined) {
                me.tierCycleStartDate = Date.now();
                me.tierCycleSpent = 0;
            }

            if (me.inbox.length > 30) {
                me.inbox.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); 
                me.inbox = me.inbox.slice(0, 30); 
            }

            this.user = me; 
            this.saveUserLocal(); 
        } else {
            // 🌟 4. تأكيد حالة الضيف إذا لم يجد شيئاً
            this.user = null;
        }
        
        let savedCurr = localStorage.getItem('telecard_display_currency') || (this.user?.baseCurrency) || 'USD';
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
        if(!this.user) return;
        const allOrders = LiveStoreData.orders || [];
        const mySpent = allOrders
            .filter(o => Number(o.userId) === Number(this.user.id) && o.status !== 'rejected' && o.status !== 'refunded')
            .reduce((sum, order) => sum + Number(order.price || 0), 0);
            
        const allDeposits = LiveStoreData.deposits || [];
        const myDeposits = allDeposits
            .filter(d => Number(d.userId) === Number(this.user.id) && d.status === 'approved')
            .reduce((sum, dep) => {
                const val = dep.creditedAmount !== undefined ? Number(dep.creditedAmount) : Number(dep.amount || 0);
                return sum + (val > 0 ? val : 0);
            }, 0);
            
        this.updateUserProfile({ totalSpent: mySpent, totalDeposit: myDeposits });
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

    // 🚀 التحديث: توليد وإرسال الرقم القصير displayId للمستندات السحابية
    confirmPurchase: function(prod, qty, optIdx, finalInputStr, appliedCoupon) {
        if (!prod || !this.user) return { success: false, msg: 'بيانات مفقودة' };

        const pricing = this.calculateFinalPrice(prod, this.user, qty, optIdx, appliedCoupon);
        const priceUsd = pricing.totalUsd;
        
        const baseCurrency = (this.user.baseCurrency || this.user.base_currency || 'USD').toUpperCase();
        const rates = typeof this.getRates === 'function' ? this.getRates() : null;
        
        const priceLocalBase = Math.ceil(this._safeConvert(priceUsd, 'USD', baseCurrency, rates, 'pricing') * 100) / 100;

        if (priceUsd <= 0 && prod.type !== 'select') return { success: false, msg: 'لا يمكن إتمام عملية بسعر 0' };
        if (this.user.walletBalance < priceLocalBase) return { success: false, msg: 'رصيدك غير كافٍ لإتمام العملية' };

        const currentTier = this.getUserTier(this.user);
        const tiersList = this.getTiers();
        
        let newCycleSpent = this.user.tierCycleSpent;
        let newCycleStartDate = this.user.tierCycleStartDate;
        let newTierId = this.user.tierId;
        let inboxUpdates = [...(this.user.inbox || [])];

        if (currentTier) {
            const durationDays = Number(currentTier.durationDays || 30);
            const durationMs = durationDays * 24 * 60 * 60 * 1000;
            const now = Date.now();
            
            if (now - (newCycleStartDate || now) > durationMs) {
                newCycleSpent = 0;
                newCycleStartDate = now;
            }
            
            newCycleSpent = (newCycleSpent || 0) + priceLocalBase;
            
            const sortedTiers = [...tiersList].sort((a, b) => Number(a.threshold) - Number(b.threshold));
            const nextTier = sortedTiers.find(t => Number(t.threshold) > Number(currentTier.threshold));
            
            const isAutoUpgradeEnabled = LiveStoreData.settings?.autoTierUpgrade ?? true; 
            
            if (nextTier && newCycleSpent >= Number(nextTier.threshold) && isAutoUpgradeEnabled) {
                newTierId = nextTier.id;
                newCycleSpent = 0;       
                newCycleStartDate = now; 
                
                inboxUpdates.push({
                    id: 'tier_up_' + now,
                    title: 'ترقية المستوى! 🎉',
                    message: `تهانينا! لقد تم ترقية حسابك إلى ${nextTier.name}. استمتع بأسعار وامتيازات أفضل.`,
                    createdAt: now,
                    type: 'notification',
                    targetType: 'user',
                    targetId: this.user.id
                });
            }
        }

        let isAutoDelivered = false;
        let deliveredCodeText = null;
        let extractedCodes = [];
        let vaults = LiveStoreData.vault || [];
        let poolIndex = -1;

        if (prod.vaultPoolId) {
            poolIndex = vaults.findIndex(v => String(v.id) === String(prod.vaultPoolId));
            if (poolIndex > -1 && vaults[poolIndex].codes && vaults[poolIndex].codes.length >= qty) {
                isAutoDelivered = true;
            } else {
                return { success: false, msg: 'عذراً، المنتج غير متوفر بالكمية المطلوبة حالياً' };
            }
        }
        
        if (isAutoDelivered && poolIndex > -1) {
            extractedCodes = vaults[poolIndex].codes.splice(0, qty);
            deliveredCodeText = extractedCodes.map(c => {
                if (typeof c === 'object' && c !== null) return c.text || c.code || '';
                return c;
            }).join(' | ');
            
            extractedCodes.forEach(c => { if(typeof c === 'object') c.status = 'sold'; });
            vaults[poolIndex].codes.push(...extractedCodes); 
            // 🚀 تحديث السحابة للمستند الفردي الخاص بالخزنة 
            StoreDB.set(DB_KEYS.VAULT, String(vaults[poolIndex].id), vaults[poolIndex]);
        }

        if (appliedCoupon) {
            const coupons = LiveStoreData.coupons || [];
            const cIdx = coupons.findIndex(c => String(c.id) === String(appliedCoupon.id));
            if (cIdx !== -1) {
                coupons[cIdx].usedCount = (coupons[cIdx].usedCount || 0) + 1;
                if (!coupons[cIdx].usageHistory) coupons[cIdx].usageHistory = {};
                const userKey = `user_${this.user.id}`;
                coupons[cIdx].usageHistory[userKey] = (coupons[cIdx].usageHistory[userKey] || 0) + 1;
                // 🚀 تحديث السحابة للمستند الفردي الخاص بالكوبون
                StoreDB.set(DB_KEYS.COUPONS, String(coupons[cIdx].id), coupons[cIdx]);
            }
        }

        const fxRateUsed = this._safeConvert(1, 'USD', baseCurrency, rates, 'pricing');
        const originalPriceLocal = Math.ceil(this._safeConvert(pricing.originalTotalUsd, 'USD', baseCurrency, rates, 'pricing') * 100) / 100;
        const couponDiscountLocal = Math.ceil(this._safeConvert(pricing.couponDiscountUsd, 'USD', baseCurrency, rates, 'pricing') * 100) / 100;
        const saleDiscountLocal = Math.ceil(this._safeConvert(pricing.saleDiscountUsd, 'USD', baseCurrency, rates, 'pricing') * 100) / 100;

        const uSnap = pricing.unitSnapshot;
        const totalSnapshot = {
            costUsd: Number((uSnap.cost * qty).toFixed(4)),
            tierPriceUsd: Number((uSnap.tierPrice * qty).toFixed(4)), 
            originalPriceUsd: Number((uSnap.originalPrice * qty).toFixed(4)),
            finalPriceUsd: Number((uSnap.finalPrice * qty).toFixed(4)),
            tierName: uSnap.tierName,
            offerName: uSnap.offerName,
            offerDiscount: Number((uSnap.offerDiscount * qty).toFixed(4)),
            couponCode: uSnap.couponCode,
            couponDiscount: Number((uSnap.couponDiscount * qty).toFixed(4)),
            totalDiscountVal: Number((uSnap.totalDiscountVal * qty).toFixed(4)),
            netProfitUsd: Number((uSnap.profit * qty).toFixed(4)),
            marginPct: uSnap.marginPct, 
            isFirewallActive: uSnap.isFirewallActive || uSnap.isFirewallTriggered
        };

        // 🚀 توليد المعرف القصير المكون من 6 أرقام
        const shortId = Math.floor(100000 + Math.random() * 900000);

        const newOrder = {
            id: Date.now(),
            displayId: shortId, // 🚀 إضافة المعرف القصير هنا
            userId: this.user.id,
            prodId: prod.id,
            product: prod.name,
            price: priceLocalBase,
            priceCurrency: baseCurrency,
            pricingSnapshot: totalSnapshot, 
            originalPrice: originalPriceLocal, 
            couponDiscount: couponDiscountLocal, 
            saleDiscount: saleDiscountLocal, 
            couponCode: appliedCoupon ? appliedCoupon.code : null, 
            qty: qty,
            input: finalInputStr,
            baseUsd: Number(pricing.totalUsd.toFixed(4)),
            fxRate: Number(fxRateUsed.toFixed(4)),
            unitCost: pricing.unitCost, 
            discountValue: pricing.couponDiscountUsd, 
            status: isAutoDelivered ? 'completed' : 'pending', 
            deliveredCode: deliveredCodeText, 
            time: Date.now(),
            actionTime: isAutoDelivered ? Date.now() : null 
        };

        // تحديث الرام للسرعة
        const orders = LiveStoreData.orders || [];
        orders.push(newOrder);
        
        // 🚀 إرسال مستند الطلب المستقل إلى السحابة (بدون مسح الطلبات الأخرى)
        StoreDB.set(DB_KEYS.ORDERS, String(newOrder.id), newOrder);

        if (isAutoDelivered) {
            inboxUpdates.push({
                id: 'sys_' + Date.now(),
                title: 'اكتمل طلبك بنجاح!',
                message: `تم تنفيذ طلبك لـ "${prod.name}" بنجاح. يمكنك استلام طلبك الآن.`,
                createdAt: Date.now(),
                type: 'notification',
                targetType: 'user',
                targetId: this.user.id,
                jumpTarget: 'order', 
                jumpId: newOrder.id    
            });
        }

        const newWalletBal = this.user.walletBalance - priceLocalBase;
        const newTotalSpent = (this.user.totalSpent || 0) + priceLocalBase;

        // 🚀 تحديث بيانات العميل (والتي تقوم بدورها بتحديث السحابة تلقائياً)
        this.updateUserProfile({
            walletBalance: newWalletBal,
            balance: newWalletBal,
            totalSpent: newTotalSpent,
            tierCycleSpent: newCycleSpent,
            tierCycleStartDate: newCycleStartDate,
            tierId: newTierId,
            inbox: inboxUpdates
        });

        return {
            success: true,
            isAutoDelivered: isAutoDelivered,
            deliveredCodeText: deliveredCodeText
        };
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

    // 🚀 التحديث: توليد وإرسال الرقم القصير displayId لإيداعات المحفظة
    submitBalanceRequest: function(amount, paymentMethod, payCurr, netBase, receiptData) {
        if (!paymentMethod) return { success: false, msg: 'حدث خطأ: لم يتم تحديد طريقة الدفع' };
        if (amount <= 0) return { success: false, msg: 'يرجى إدخال مبلغ صحيح ضمن الحدود المسموحة' };
        if (paymentMethod.reqProof !== false && !receiptData) return { success: false, msg: 'يرجى إرفاق صورة إشعار الدفع أولاً', errType: 'receipt' };

        const baseCurrency = (this.user.baseCurrency || this.user.base_currency || 'USD').toUpperCase();

        let feePct = 0;
        if(paymentMethod.currencySettings && paymentMethod.currencySettings[payCurr]) {
            feePct = parseFloat(paymentMethod.currencySettings[payCurr].fee) || 0;
        } else {
            feePct = parseFloat(paymentMethod.fee) || 0;
        }

        const rates = this.getRates();
        const fxRateUsed = this._safeConvert(1, payCurr, baseCurrency, rates, 'deposit');
        const usdEquivalent = this._safeConvert(netBase, baseCurrency, 'USD', rates, 'deposit');

        // 🚀 توليد المعرف القصير المكون من 6 أرقام
        const shortId = Math.floor(100000 + Math.random() * 900000);

        const newDeposit = {
            id: Date.now(),
            displayId: shortId, // 🚀 إضافة المعرف القصير هنا
            userId: this.user.id,
            method: paymentMethod.name,
            amount: amount,
            currency: payCurr,
            fee: amount * (feePct / 100),
            feePct: feePct,
            fees: amount * (feePct / 100),
            feesPercent: feePct,
            creditedAmount: netBase,
            targetCurrency: baseCurrency,
            baseUsd: Number(usdEquivalent.toFixed(4)),
            fxRate: Number(fxRateUsed.toFixed(4)),
            status: 'pending',
            time: Date.now(),
            receipt: receiptData || null,
            receiptImage: receiptData || null 
        };

        // تحديث الرام للسرعة
        const deposits = LiveStoreData.deposits || [];
        deposits.push(newDeposit);
        
        // 🚀 إرسال مستند الإيداع المستقل إلى السحابة
        StoreDB.set(DB_KEYS.DEPOSITS, String(newDeposit.id), newDeposit);

        return { success: true, msg: 'تم إرسال طلب الإيداع بنجاح، يرجى الانتظار لحين المراجعة' };
    },
    
    formatDateLocal: function(timestamp) {
        if (!timestamp) return '---';
        const dateObj = new Date(timestamp);
        const dateStr = dateObj.toLocaleDateString('en-GB'); 
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${dateStr} | ${timeStr}`;
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

    // ============================================================================
    // 🔔 6. محرك الإشعارات المجرد
    // ============================================================================
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
        const now = Date.now();

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
        const now = Date.now();

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
