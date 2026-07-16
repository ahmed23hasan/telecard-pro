// ============================================================================
// 🗄️ مدير البيانات والعمليات الحسابية (dataManager.js) - النسخة الماسية V11.7 💎
// 🎯 الوظيفة: معالجة البيانات، الحسابات، والاتصال المباشر بالسحابة ومحرك الكاش
// 🚀 التحديث الأقصى: ربط المحرك المالي، حماية الذاكرة الممتلئة، وإصلاح تسرب الإشعارات
// ============================================================================

import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"; 
import { DB_KEYS, ACTIVE_USER_KEY } from './config.js';
import { Utils } from './utils.js';
import { FirebaseAdapter, auth } from './core/firebaseAdapter.js'; 
import { RenderHelpers } from './core/renderHelpers.js'; 
import { FinancialEngine } from './core/financialEngine.js'; // 🛡️ [الترقيع الماسي]: استيراد المحرك المالي الجديد مباشرة

export const StoreDB = FirebaseAdapter;

export const LiveStoreData = {
    cats: [], prods: [], settings: {}, banners: [], users: [], 
    orders: [], deposits: [], payments: [], tiers: [], rates: [],
    vault: [], coupons: [], offers: [], alerts: [],
    system: {}, countries: [], popup: null,
    userNotifications: [], 
    isInitialSyncDone: false,
    isOfflineMode: false // 🛡️ راية وضع عدم الاتصال
};

// ============================================================================
// 📦 مدير الكاش الذكي (Smart Cache Manager)
// ============================================================================
export const SmartCacheManager = {
    CACHE_KEY: 'telecard_store_catalog_v1',
    EXPIRY_TIME: 24 * 60 * 60 * 1000, 
    
    saveCatalogToLocal: function(prods, cats, offers, tiers, rates) {
        const cacheData = { timestamp: Date.now(), data: { prods, cats, offers, tiers, rates } };
        try {
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
            console.log("💎 [Smart Cache] TeleCard Catalog saved to device memory.");
        } catch (e) {
            // 🛡️ [حماية الذاكرة الممتلئة]: تنظيف الذاكرة ومحاولة الحفظ مجدداً
            console.warn("Storage is full, clearing old caches...", e);
            try {
                localStorage.clear(); 
                localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
            } catch (ex) {
                console.error("Critical: Device storage completely full.", ex);
            }
        }
    },
    
    loadCatalogFromLocal: function() {
        try {
            const raw = localStorage.getItem(this.CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (Date.now() - parsed.timestamp > this.EXPIRY_TIME) {
                localStorage.removeItem(this.CACHE_KEY);
                return null;
            }
            return parsed.data;
        } catch (e) { return null; }
    },
    
    shouldFetchFromServer: async function(currentServerVersion) {
        const localVersion = localStorage.getItem('telecard_catalog_version');
        
        if (!localVersion || String(localVersion) !== String(currentServerVersion)) {
            localStorage.setItem('telecard_catalog_version', String(currentServerVersion));
            return true;
        }
        
        const cachedData = this.loadCatalogFromLocal();
        if (!cachedData) return true;
        
        LiveStoreData.prods = cachedData.prods || [];
        LiveStoreData.cats = cachedData.cats || [];
        LiveStoreData.offers = cachedData.offers || [];
        LiveStoreData.tiers = cachedData.tiers || [];
        LiveStoreData.rates = cachedData.rates || [];
        
        console.log("🚀 [Smart Cache] Loaded 100% from Device (0 Firebase Reads!)");
        return false; 
    }
};

// ============================================================================
// ⚙️ مدير البيانات الرئيسي (DataManager)
// ============================================================================
export const DataManager = {
    
    initStoreCatalog: async function() {
        console.log("⚡ جاري تشغيل المتجر...");
        const t0 = performance.now();
        LiveStoreData.isOfflineMode = false; // إعادة ضبط الحالة عند الإقلاع

        try {
            // 🛡️ [الترقيع]: 3 ثوانٍ كحد أقصى لانتظار الإعدادات حماية لأصحاب الـ AdBlockers
            const settingsSnap = await StoreDB._withTimeout(StoreDB.getById('telecard_settings', 'singleton'), 3000, 'Init Settings').catch(() => null);
            
            if (!settingsSnap) throw new Error("تعذر جلب الإعدادات (Timeout)");
            
            const serverCatalogVersion = settingsSnap?.catalogVersion || '1.0'; 
            LiveStoreData.settings = settingsSnap || {};

            const needsFetch = await SmartCacheManager.shouldFetchFromServer(serverCatalogVersion);

            if (!needsFetch) {
                const t1 = performance.now();
                console.log(`✅ تم تحميل متجر TeleCard من الذاكرة في ${Math.round(t1 - t0)}ms (التكلفة: 1 Read فقط!)`);
                return true;
            }

            console.log("🔄 جاري تحميل أحدث كتالوج من السيرفر...");
            const [prods, cats, offers, tiers, rates] = await Promise.all([
                StoreDB.getAll('telecard_prods_public'), 
                StoreDB.getAll('telecard_cats'),
                StoreDB.getAll('telecard_offers'),
                StoreDB.getAll('telecard_tiers'),
                StoreDB.getAll('telecard_rates')
            ]);

            const activeProds = prods.filter(p => p.isActive !== false);

            LiveStoreData.prods = activeProds;
            LiveStoreData.cats = cats;
            LiveStoreData.offers = offers;
            LiveStoreData.tiers = tiers;
            LiveStoreData.rates = rates;

            SmartCacheManager.saveCatalogToLocal(activeProds, cats, offers, tiers, rates);

            const t2 = performance.now();
            console.log(`✅ تم جلب المتجر من السيرفر وحفظه في الكاش في ${Math.round(t2 - t0)}ms`);
            return true;

        } catch (error) {
            console.error("🚨 فشل تحميل المتجر (الإنترنت ضعيف أو مقطوع):", error);
            
            // 🛡️ [الترقيع الماسي]: تفعيل وضع الأوفلاين لكي تفهمه واجهة المستخدم
            LiveStoreData.isOfflineMode = true; 

            const fallbackData = SmartCacheManager.loadCatalogFromLocal();
            if (fallbackData && fallbackData.cats && fallbackData.cats.length > 0) {
                LiveStoreData.prods = fallbackData.prods;
                LiveStoreData.cats = fallbackData.cats;
                LiveStoreData.offers = fallbackData.offers;
                LiveStoreData.tiers = fallbackData.tiers;
                LiveStoreData.rates = fallbackData.rates;
                console.warn("⚠️ تم تشغيل متجر TeleCard في وضع الاوفلاين (الطوارئ)");
                
                setTimeout(() => {
                    if (window.UIManager?.showToast) window.UIManager.showToast('أنت تتصفح المتجر بدون اتصال بالإنترنت (بيانات محفوظة محلياً)', 'warning');
                }, 1500);
                return true;
            }
            return false;
        }
    },

    serverTimeOffset: 0,
    getNow: function() { return Date.now() + this.serverTimeOffset; },

    user: null,
    prefs: { sound: true, theme: 'dark', security2fa: false, favs: [] },
    favs: new Set(),
    selectedCurr: 'USD',
    cursors: { orders: null, deposits: null },
    currentProd: null, currentPayment: null, currentPayCurrency: null,
    currentReceiptData: null, appliedCoupon: null,

    _notifUnsubscribe: null,
    _userUnsubscribe: null,

    // 🛡️ إنشاء معرّف فريد للعمليات المالية لمنع تكرار الخصم
    generateIdempotencyKey: function() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15);
    },

    saveUserLocal: function() {
        if (!this.user) return;
        try {
            const safeUser = {
                id: String(this.user.uid || this.user.id), 
                uid: String(this.user.uid || this.user.id),
                displayId: this.user.displayId, 
                name: this.user.name, 
                firstName: this.user.firstName || this.user.first_name,
                lastName: this.user.lastName || this.user.last_name,
                fullName: this.user.fullName, 
                username: this.user.username,
                img: this.user.img, 
                email: this.user.email,
                phone: this.user.phone,
                country: this.user.country,
                isVerified: Boolean(this.user.isVerified),
                kycStatus: this.user.kycStatus,
                kycData: this.user.kycData,
                walletBalance: Number(this.user.walletBalance ?? this.user.balance ?? 0), 
                balance: Number(this.user.balance ?? this.user.walletBalance ?? 0),
                baseCurrency: String(this.user.baseCurrency || this.user.base_currency || 'USD').toUpperCase(),
                tierId: String(this.user.tierId || this.user.tier || '1'),
                tierCycleSpent: Number(this.user.tierCycleSpent || 0),
                tierCycleStartDate: this.user.tierCycleStartDate,
                totalSpent: Number(this.user.totalSpent || 0), 
                totalDeposit: Number(this.user.totalDeposit || 0)
            };
            localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(safeUser));
        } catch (e) { console.error('Storage Quota Error:', e); }
    },

    updateUserProfile: async function(newData) {
        const uid = this.user?.uid || this.user?.id || localStorage.getItem('telecard_active_user_uid');
        if (!uid) return false;
        
        if (typeof newData !== 'object' || Array.isArray(newData)) return false;
        
        const FORBIDDEN_KEYS = new Set([
            'walletBalance', 'balance', 'tierId', 'tier', 'totalSpent',
            'totalDeposit', 'isBanned', 'isIpBanned', 'isRestricted',
            'kycStatus', 'kycData', 'role', 'adminMessage', 'isVerified',
            'devicePrints', 'passwordChangeHistory'
        ]);
        
        const sanitizedData = {};
        for (const key in newData) {
            // 🛡️ [تحديث التوافقية]: استخدام الطريقة الآمنة لجميع المتصفحات القديمة والحديثة
            if (!FORBIDDEN_KEYS.has(key) && Object.prototype.hasOwnProperty.call(newData, key)) {
                sanitizedData[key] = newData[key];
            }
        }
        
        if (Object.keys(sanitizedData).length === 0) return true;
        
        try {
            const success = await StoreDB.set(DB_KEYS.USERS, String(uid), sanitizedData, { merge: true });
            if (success) {
                this.user = { ...this.user, ...sanitizedData };
                this.saveUserLocal();
                return true;
            }
            return false;
        } catch (error) {
            console.error("Update Profile Blocked by Firestore Rules:", error.message);
            return false;
        }
    },

    loadPrefs: function() {
        try {
            const savedRaw = localStorage.getItem(DB_KEYS.PREFS);
            const saved = savedRaw ? JSON.parse(savedRaw) : {};
            this.prefs = {
                sound: saved.sound !== false,
                theme: saved.theme || localStorage.getItem('telecard_theme') || 'dark',
                security2fa: saved.security2fa === true,
                favs: Array.isArray(saved.favs) ? saved.favs : []
            };
            const cleanFavIds = this.prefs.favs.map(String).filter(s => s.trim() !== '' && s !== 'NaN' && s !== 'undefined');
            this.favs = new Set(cleanFavIds);
        } catch (e) {
            this.prefs = { sound: true, theme: 'dark', security2fa: false, favs: [] };
            this.favs = new Set();
        }
    },
    
    savePrefs: function() {
        try {
            if (this.favs) this.prefs.favs = Array.from(this.favs);
            localStorage.setItem(DB_KEYS.PREFS, JSON.stringify(this.prefs || {}));
        } catch (e) { console.error("Save Prefs Error:", e); }
    },

    getTiers: function() { return LiveStoreData.tiers || []; },

    getUserTier: function(user) {
        const tiers = this.getTiers();
        if (!tiers || tiers.length === 0) return { profit_percent: 0, min_profit_usd: 0 }; 
        const code = String(user?.tierId ?? user?.tier ?? '1');
        return tiers.find(t => String(t.id) === code) || tiers.find(t => t.isDefault) || tiers[0];
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
        const cycleStart = Number(this.user.tierCycleStartDate || this.getNow()); 
        const remainingDays = Math.max(0, Math.ceil((durationMs - (this.getNow() - cycleStart)) / (1000 * 60 * 60 * 24))); 

        const nextTier = sortedTiers.find(t => Number(t.threshold || 0) > Number(currentTier.threshold || 0));
        let targetThreshold = nextTier ? Number(nextTier.threshold) : (Number(currentTier.threshold || 0) > 0 ? Number(currentTier.threshold) : 500);
        
        return {
            currentTier, nextTier, 
            targetNameDisplay: nextTier ? nextTier.name : "للحفاظ على المميزات", 
            targetThreshold, spent,
            remainingAmt: Math.max(0, targetThreshold - spent), 
            percent: Math.min(100, Math.max(0, (spent / targetThreshold) * 100)), 
            remainingDays, isMaxTier: !nextTier,
            isGoalReached: !nextTier && spent >= targetThreshold, 
            isAutoAdvanceEnabled: currentTier.autoAdvance !== false
        };
    },

    getActiveOffer: function(prodId) {
        const now = this.getNow(); 
        return (LiveStoreData.offers || []).find(o => o.isActive && (!o.expiryDate || o.expiryDate > now) && o.targetProds?.includes(String(prodId)));
    },

    // 🛡️ [الترقيع الماسي]: استخدام المحرك المالي النظيف والآمن بشكل مباشر
    calculateFinalPrice: function(prod, user, qty, optIdx, appliedCoupon) {
        let q = Math.max(1, Number(qty) || 1);
        if (prod.type === 'select') q = 1; 

        const tier = this.getUserTier(user);
        const activeOffer = this.getActiveOffer(prod.id);

        const orderSnapshot = FinancialEngine.calculateOrderTotalUi({ 
            product: prod, tier: tier, offer: activeOffer, coupon: appliedCoupon, optIdx: optIdx 
        }, q);

        const oldPriceUsd = (activeOffer?.type === 'fake') ? Number(activeOffer.value || 0) : null;

        return {
            unitSnapshot: orderSnapshot, 
            totalUsd: orderSnapshot.totalFinalPrice, 
            unitUsd: orderSnapshot.finalPrice, 
            originalTotalUsd: orderSnapshot.totalOriginalPrice, 
            saleDiscountUsd: orderSnapshot.offerDiscount * q, 
            couponDiscountUsd: orderSnapshot.couponDiscount * q, 
            oldPriceUsd, 
            displayOldTotalUsd: oldPriceUsd ? (oldPriceUsd * q) : orderSnapshot.totalOriginalPrice
        };
    },
    
    computeSellingUsd: function(prod, user, qty=1, optIndex=null) {
        return this.calculateFinalPrice(prod, user, qty, optIndex, null).totalUsd;
    },

    _safeConvert: function(amount, fromCurr, toCurr, rates, channel) {
        return FinancialEngine.convertViaUSD(amount, fromCurr, toCurr, rates, channel);
    },

    getPricingLocal: function(prod, qty, optIdx, appliedCoupon) {
        if (!prod) return null;
        
        const baseCurrency = (this.user?.baseCurrency || LiveStoreData.settings?.defaultCurrency || 'USD').toUpperCase();
        const displayCurrency = (this.selectedCurr || baseCurrency).toUpperCase();
        const rates = this.getRates();
        const pricing = this.calculateFinalPrice(prod, this.user, qty, optIdx, appliedCoupon);

        const totalLocalBase = Math.ceil(this._safeConvert(pricing.totalUsd, 'USD', baseCurrency, rates, 'pricing') * 100) / 100;
        const unitPriceLocal = Math.ceil(this._safeConvert(pricing.unitUsd, 'USD', baseCurrency, rates, 'pricing') * 100) / 100;
        
        const valUnit = (displayCurrency === baseCurrency) ? unitPriceLocal : this._safeConvert(unitPriceLocal, baseCurrency, displayCurrency, rates, 'pricing');
        const valTotal = (displayCurrency === baseCurrency) ? totalLocalBase : this._safeConvert(totalLocalBase, baseCurrency, displayCurrency, rates, 'pricing');
        
        return {
            totalUsd: pricing.totalUsd, totalLocalBase, displayCurrency,
            unitText: valUnit.toFixed(2) + (displayCurrency === 'USD' ? ' $' : ' ' + displayCurrency),
            totalText: valTotal.toFixed(2) + (displayCurrency === 'USD' ? ' $' : ' ' + displayCurrency),
            hasDiscount: Boolean(pricing.oldPriceUsd || pricing.couponDiscountUsd > 0 || pricing.saleDiscountUsd > 0),
            oldTotalLocalBase: pricing.displayOldTotalUsd ? this._safeConvert(pricing.displayOldTotalUsd, 'USD', displayCurrency, rates, 'pricing') : 0, 
            pricingSnapshot: pricing
        };
    },

    validateCoupon: function(code, prod, qty, optIdx) {
        if (!code) return { valid: false, msg: 'يرجى إدخال الكود' };
        const coupon = (LiveStoreData.coupons || []).find(c => c.code.toUpperCase() === code.toUpperCase());
        if (!coupon) return { valid: false, msg: 'الكود غير صحيح أو غير موجود' };
        if (coupon.isActive === false) return { valid: false, msg: 'هذا الكوبون غير فعال حالياً' };
        if (coupon.expiryDate && this.getNow() > coupon.expiryDate) return { valid: false, msg: 'انتهت صلاحية هذا الكوبون' };
        
        if (coupon.maxUses !== undefined && Number(coupon.maxUses) > 0 && Number(coupon.usedCount || 0) >= Number(coupon.maxUses)) {
            return { valid: false, msg: 'نفذت كمية الاستخدام المسموحة لهذا الكوبون' };
        }
        
        if (coupon.targetTiers?.length > 0 && !coupon.targetTiers.includes(String(this.getUserTier(this.user)?.id))) {
            return { valid: false, msg: 'الكوبون غير متاح لمستوى عضويتك الحالي' };
        }
        
        if (coupon.targetProds?.length > 0 && !coupon.targetProds.includes(String(prod.id)) && !coupon.targetProds.includes(String(prod.catId))) {
            return { valid: false, msg: 'الكوبون غير مخصص لهذا المنتج' };
        }
        
        if (coupon.allowedUsers?.length > 0) {
            const allowedStringIds = coupon.allowedUsers.map(String);
            if (!allowedStringIds.includes(String(this.user.uid || this.user.id))) return { valid: false, msg: 'الكوبون مخصص لعملاء محددين' };
        }
        
        if (Number(coupon.maxPerUser) > 0) {
            const userUsageCount = (coupon.usageHistory?.[`user_${this.user.uid || this.user.id}`]) || 0;
            if (userUsageCount >= Number(coupon.maxPerUser)) return { valid: false, msg: `استنفدت الحد الأقصى للاستخدام (${coupon.maxPerUser} مرات)` };
        }
        
        if (Number(coupon.minOrder) > 0) {
            const pricing = this.calculateFinalPrice(prod, this.user, qty, optIdx, null);
            if (pricing.totalUsd < Number(coupon.minOrder)) return { valid: false, msg: `الحد الأدنى للاستخدام هو ${coupon.minOrder}$` };
        }

        return { valid: true, coupon: coupon };
    },

    getRates: function() { return FinancialEngine.normalizeRates(LiveStoreData.rates || {}); },

    convertViaUSDHelper: function(amount, fromCurr, toCurr, rounding='round', channel='pricing') {
        let val = this._safeConvert(amount, (fromCurr||'USD').toUpperCase(), (toCurr||'USD').toUpperCase(), LiveStoreData.rates, channel);
        if(rounding === 'floor') return Math.floor(val * 10000) / 10000;
        if(rounding === 'ceil')  return Math.ceil(val * 10000) / 10000;
        return Number(val.toFixed(4));
    },

    listenToUserUpdates: function(renderCb) {
    const activeUid = localStorage.getItem('telecard_active_user_uid');
    if (!activeUid) return;
    
    if (this._userUnsubscribe) this._userUnsubscribe();
    
    try {
        // 🚀 الإصلاح: تم تعديل الاسم إلى listenDoc ليتطابق مع firebaseAdapter
        if (typeof StoreDB.listenDoc === 'function') {
            this._userUnsubscribe = StoreDB.listenDoc(DB_KEYS.USERS, activeUid, (docData) => {
                if (docData) {
                    if (docData.isBanned || docData.isIpBanned) {
                        if (window.UIManager?.triggerLiveBanAlert) window.UIManager.triggerLiveBanAlert(docData.banReason || 'تم تقييد حسابك.');
                        else this.logout();
                        return;
                    }
                    
                    this.user = { ...this.user, ...docData };
                    this.user.uid = activeUid;
                    this.user.id = activeUid;
                    this.user.walletBalance = Number(docData.walletBalance ?? docData.balance ?? 0);
                    this.saveUserLocal();
                    
                    // تحديث الواجهة فوراً عند تغير الرصيد!
                    if (renderCb) renderCb();
                }
            });
        } else {
            console.error("🚨 خطأ معماري: دالة listenDoc غير موجودة في StoreDB");
        }
    } catch (e) { console.warn("User Listener Error:", e); }
},    logout: async function() {
        try {
            if (auth) await signOut(auth);
            localStorage.removeItem('telecard_active_user_uid');
            localStorage.removeItem(ACTIVE_USER_KEY);
            localStorage.removeItem('telecard_display_currency');
            
            if (this._notifUnsubscribe) this._notifUnsubscribe(); 
            if (this._userUnsubscribe) this._userUnsubscribe(); 
        } catch(e) {}
        window.location.replace('login.html');
    },

    syncUser: async function() {
        const activeUid = localStorage.getItem('telecard_active_user_uid');
        let me = null;

        if (activeUid) {
            // 🛡️ [تحديث]: تقليل الاعتماد الأعمى على مصفوفة users التي قد تكون فارغة في البداية
            const users = LiveStoreData.users || [];
            me = users.find(u => String(u.uid || u.id) === String(activeUid)) || JSON.parse(localStorage.getItem(ACTIVE_USER_KEY) || 'null');
            if (me && String(me.uid || me.id) !== String(activeUid)) me = null;
            
            // 🛡️ [الترقيع]: لا نستدعي السيرفر إذا كنا في وضع الاوفلاين لمنع الأخطاء في الكونسول
            if (this.serverTimeOffset === 0 && !LiveStoreData.isOfflineMode && StoreDB.callFunction) {
                StoreDB.callFunction('getServerTime').then(res => { 
                    if(res && res.serverTime) this.serverTimeOffset = res.serverTime - Date.now(); 
                }).catch(() => {});
            }
        }
        
        if (activeUid && !me && window.ClientSystem?.isReady) {
            this.logout(); return false;
        }
        
        if (me) {
            if (me.isBanned || me.isIpBanned || me.isRestricted) {
                if (window.UIManager?.triggerLiveBanAlert) window.UIManager.triggerLiveBanAlert(me.banReason || 'نعتذر، تم تقييد حسابك.');
                else this.logout();
                return false;
            }  
            me.uid = activeUid;
            me.id = activeUid;
            me.baseCurrency = (me.baseCurrency || me.base_currency || 'USD').toUpperCase();
            me.walletBalance = Number(me.walletBalance ?? me.wallet_balance ?? me.balance ?? 0);
            if (me.tierCycleStartDate === undefined) { me.tierCycleStartDate = this.getNow(); me.tierCycleSpent = 0; }
            
            if (me.readAlerts && Array.isArray(me.readAlerts)) {
                localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(me.readAlerts));
            }
            
            this.user = me;
            this.saveUserLocal();

            this.listenToUserUpdates(window.UIManager ? () => window.UIManager.updateWalletUI() : null);
            
        } else {
            if (!activeUid) this.user = null;
        }
        
        const isIpBanned = await this.enforceIpBan();
        if (isIpBanned) return false;

        const adminDef = LiveStoreData.settings?.defaultCurrency || 'USD';
        let savedCurr = localStorage.getItem('telecard_display_currency') || this.user?.baseCurrency || adminDef;
        if (LiveStoreData.settings?.showCurrencyToggle === false && this.user && savedCurr !== this.user.baseCurrency) {
            savedCurr = this.user.baseCurrency;
            localStorage.setItem('telecard_display_currency', savedCurr);
        }
        this.selectedCurr = savedCurr;
        return true;
    },

    enforceIpBan: async function() {
        // 🛡️ [الترقيع]: لا نستدعي API خارجي إذا كان الإنترنت مقطوعاً لمنع التأخير
        if (LiveStoreData.isOfflineMode) return false;
        
        try {
            const bannedIps = LiveStoreData.settings?.bannedIps || [];
            if (!bannedIps.length) return false;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            
            let ip = null;
            try {
                const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal }).then(r => r.json());
                ip = res.ip;
            } catch (primaryErr) {
                try {
                    const fallbackRes = await fetch('https://ipapi.co/json/', { signal: controller.signal }).then(r => r.json());
                    ip = fallbackRes.ip;
                } catch (secondaryErr) {
                    console.warn("IP Check bypassed locally due to AdBlocker.");
                }
            }
            clearTimeout(timeoutId);

            if (ip && bannedIps.includes(ip)) {
                this.logout(); return true;
            }
        } catch (e) { console.warn("Client IP Check failed."); }
        return false;
    },

    ackAdminMessage: async function() {
        if (this.user?.uid) try { await this.updateUserProfile({ adminMessage: '' }); } catch(e) { }
    },

    updateWalletStats: function() {
        if (this.user) {
            this.user.totalSpent = Number(this.user.totalSpent || 0);
            this.user.totalDeposit = Number(this.user.totalDeposit || 0);
        }
    },

    submitPasswordChange: async function(currentVal, newVal, confirmVal) {
        if (!newVal || newVal.length < 6) return { success: false, msg: 'كلمة المرور يجب أن لا تقل عن 6 أحرف.' };
        if (newVal !== confirmVal) return { success: false, msg: 'كلمتا المرور غير متطابقتين.' };
        if (!currentVal) return { success: false, msg: 'الرجاء إدخال كلمة المرور الحالية.' };
        
        const now = this.getNow();
        let changeHistory = (this.user?.passwordChangeHistory || []).filter(ts => (now - ts) < 86400000);
        
        if (changeHistory.length >= 3) {
            return { success: false, msg: `استنفدت الحد الأقصى للتغيير. حاول بعد ${Math.ceil((86400000 - (now - changeHistory[0])) / 3600000)} ساعة.` };
        }
        
        try {
            changeHistory.push(now);
            await this.updateUserProfile({ passwordChangeHistory: changeHistory });
            
            const result = await StoreDB.changeUserPassword(currentVal, newVal);
            if (result.success) {
                return { success: true, msg: 'تم تحديث كلمة المرور بنجاح. يرجى تسجيل الدخول مجدداً.' };
            } else {
                changeHistory.pop();
                await this.updateUserProfile({ passwordChangeHistory: changeHistory });
                return { success: false, msg: result.msg };
            }
        } catch (e) { return { success: false, msg: 'تعذر الاتصال بالسيرفر.' }; }
    },

    _currentPurchaseKey: null,
    confirmPurchase: async function(prod, qty, optIdx, finalInputStr, appliedCoupon) {
        // 🛡️ منع الشراء في وضع الأوفلاين
        if (LiveStoreData.isOfflineMode) {
            return { success: false, msg: 'أنت تتصفح في وضع عدم الاتصال، يرجى استعادة الشبكة.' };
        }
        
        if (!prod || !this.user) return { success: false, msg: 'بيانات مفقودة' };
        
        this._currentPurchaseKey = this._currentPurchaseKey || this.generateIdempotencyKey();
        
        try {
            const req = {
                productId: String(prod.id),
                qty: Number(qty) || 1,
                optIdx: optIdx ?? null,
                finalInputStr: finalInputStr || '---',
                couponCode: appliedCoupon?.code || null,
                idempotencyKey: this._currentPurchaseKey
            };
            const res = await StoreDB.callFunction('createOrder', req);
            
            this._currentPurchaseKey = null;
            return { success: true, msg: res.message || 'تم إتمام الطلب', isAutoDelivered: res.isAutoDelivered, deliveredCodeText: res.deliveredCode };
            
        } catch (err) {
            const code = err.code || '';
            const msg = String(err.message || '').toLowerCase();
            
            if (!['unavailable', 'deadline-exceeded', 'internal'].includes(code)) {
                this._currentPurchaseKey = null;
            }
            
            if (code === 'failed-precondition' || msg.includes('رصيد')) return { success: false, msg: 'رصيدك غير كافٍ.' };
            if (code === 'already-exists' || msg.includes('مسبقاً')) return { success: false, msg: 'تم استلام طلبك بالفعل.' };
            if (code === 'resource-exhausted') return { success: false, msg: 'المنتج أو الكوبون نفد من المخزون.' };
            if (code === 'not-found') return { success: false, msg: 'المنتج غير متوفر.' };
            if (code === 'permission-denied') { this.syncUser(); return { success: false, msg: 'حسابك مقيد حالياً.' }; }
            
            return { success: false, msg: 'حدث خطأ بالشبكة، يرجى التحقق من طلباتك قبل إعادة المحاولة.' };
        }
    },    

    calculateDepositFee: function(amount, paymentMethod, payCurr) {
        if (!paymentMethod || amount <= 0) return { isValid: false, msg: 'بيانات غير صالحة', netBase: 0, feePct: 0, feeType: 'fee', feeUnit: 'percent' };
        
        const curr = (payCurr || '').toUpperCase();
        let s = { fee: parseFloat(paymentMethod.fee)||0, min: parseFloat(paymentMethod.min)||0, max: parseFloat(paymentMethod.max)||0, feeType: paymentMethod.feeType||'fee', feeUnit: paymentMethod.feeUnit||paymentMethod.unit||'percent' };

        if (paymentMethod.currencySettings?.[curr]) {
            const cs = paymentMethod.currencySettings[curr];
            s = { fee: parseFloat(cs.fee)||0, min: parseFloat(cs.min)||0, max: parseFloat(cs.max)||0, feeType: cs.feeType||'fee', feeUnit: cs.feeUnit||cs.unit||'percent' };
        } 

        if (s.min > 0 && amount < s.min) return { isValid: false, msg: `أقل مبلغ: ${s.min} ${curr}`, ...s };
        if (s.max > 0 && amount > s.max) return { isValid: false, msg: `أقصى مبلغ: ${s.max} ${curr}`, ...s };

        let feeAmt = ['fixed', 'amount'].includes(s.feeUnit) ? s.fee : amount * (s.fee / 100);
        let net = s.feeType === 'bonus' ? amount + feeAmt : amount - feeAmt;
        let netBase = this.convertViaUSDHelper(net, curr, this.user.baseCurrency || 'USD', 'floor', 'deposit');

        return { isValid: true, netBase: isNaN(netBase) ? 0 : netBase, feePct: s.fee, feeType: s.feeType, feeUnit: s.feeUnit, feeAmount: feeAmt };
    },

    _currentDepositKey: null,
    submitBalanceRequest: async function(amount, paymentMethod, payCurr, receiptData) {
        if (!paymentMethod) return { success: false, msg: 'طريقة الدفع مفقودة' };
        if (amount <= 0) return { success: false, msg: 'مبلغ غير صالح' };
        if (paymentMethod.reqProof !== false && !receiptData) return { success: false, msg: 'يرجى إرفاق الإشعار', errType: 'receipt' };
        
        this._currentDepositKey = this._currentDepositKey || this.generateIdempotencyKey();
        
        try {
            const req = { amount: Number(amount), paymentMethodName: paymentMethod.name, payCurr, receiptData, idempotencyKey: this._currentDepositKey };
            const res = await StoreDB.callFunction('submitBalanceRequest', req);
            this._currentDepositKey = null; 
            return { success: true, msg: res.message || 'تم إرسال الطلب بنجاح' };
        } catch (err) {
            const code = err.code || '';
            if (code && !['unavailable', 'deadline-exceeded', 'internal'].includes(code)) this._currentDepositKey = null;
            
            if (code === 'already-exists') return { success: false, msg: 'لديك طلب قيد المراجعة.' };
            if (code === 'resource-exhausted') return { success: false, msg: 'يرجى الانتظار قليلاً.' };
            if (code === 'permission-denied') { this.syncUser(); return { success: false, msg: 'حسابك مقيد.' }; }
            return { success: false, msg: 'تعذر إرسال الطلب، جرب لاحقاً.' };
        }
    },

    formatDateLocal: function(ts) { return typeof RenderHelpers !== 'undefined' ? RenderHelpers.formatSafeDate(ts) : '---'; },

    isFavorite: function(id) { return this.favs?.has(String(id)); },
    toggleFavorite: function(id) {
        if (!id) return;
        const strId = String(id);
        if(!this.favs) this.favs = new Set();
        this.favs.has(strId) ? this.favs.delete(strId) : this.favs.add(strId);
        this.savePrefs();
    },

    getAdminCountries: async function() {
        try { const c = await StoreDB.getAll(DB_KEYS.COUNTRIES); return Array.isArray(c) ? c : []; } catch (e) { return []; }
    },

    _getSafeReadIds: function() {
        try {
            return JSON.parse(localStorage.getItem(DB_KEYS.NOTIF_READ_LIST) || "[]").map(String);
        } catch(e) {
            localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, "[]");
            return [];
        }
    },

    listenToUserNotifications: function(renderCb) {
        if (!this.user?.uid) return null;
        if (this._notifUnsubscribe) this._notifUnsubscribe();
        
        try {
            this._notifUnsubscribe = StoreDB.listenCollection(
                `telecard_users/${this.user.uid}/notifications`,
                (notifs) => {
                    LiveStoreData.userNotifications = (notifs || []).sort((a, b) =>
                        (b.createdAt || 0) - (a.createdAt || 0)
                    );
                    if (renderCb) renderCb();
                }
            );
            return this._notifUnsubscribe; 
        } catch (e) { 
            console.warn("Notif Listener Error:", e); 
            return null;
        }
    },

    _isAlertForUser: function(msg, user, now, readIds = [], excludeRead = false) {
    const type = msg.targetType || msg.target || 'all';
    const tId = String(msg.targetId || msg.userId || msg.tierId || '');
    const isForMe = type === 'all' || (type === 'user' && tId === String(user.uid)) || (type === 'tier' && tId === String(user.tierId));
    
    if (!isForMe || (msg.expiresAt && now > msg.expiresAt)) return false;
    if (excludeRead && (msg.isRead || readIds.includes(String(msg.id)))) return false;
    
    // 🚀 الإصلاح الماسي: منع الإشعارات القديمة من السفر عبر الزمن للعملاء الجدد
    // إذا كان الإشعار ليس مخصصاً حصراً للعميل، وتاريخ الإشعار أقدم من تاريخ إنشاء حساب العميل -> لا تعرضه!
    if (type !== 'user') {
        const userCreatedTime = this.parseTime(user.createdAt);
        const alertTime = this.parseUnifiedTime(msg);
        
        // إذا كان تاريخ الحساب وتاريخ الإشعار موجودين، والإشعار أقدم من الحساب، اخفه
        if (userCreatedTime > 0 && alertTime > 0 && alertTime < userCreatedTime) {
            return false;
        }
    }
    
    return true;
},   getUnreadAlerts: function() {
        if (!this.user) return [];
        const allAlerts = [...(LiveStoreData.alerts || []), ...(LiveStoreData.userNotifications || [])];
        const readIds = this._getSafeReadIds();
        const now = this.getNow();
        
        return allAlerts.filter(msg => {
            if (!this._isAlertForUser(msg, this.user, now, readIds, true)) return false;
            if ((msg.type === 'popup' || msg.isPopup) && msg.maxViews) {
                if (parseInt(localStorage.getItem(`alert_views_${msg.id}`) || "0") >= msg.maxViews) return false;
            }
            return true;
        }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    
    getAllUserAlerts: function() {
        if (!this.user) return [];
        const allAlerts = [...(LiveStoreData.alerts || []), ...(LiveStoreData.userNotifications || [])];
        return allAlerts.filter(msg => this._isAlertForUser(msg, this.user, this.getNow(), [], false))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },

    markSingleNotificationRead: async function(msgId, isPopup = false, maxViews = null) {
        if (!msgId) return;
        
        if (isPopup && maxViews && maxViews > 1) {
            let views = parseInt(localStorage.getItem(`alert_views_${msgId}`) || "0") + 1;
            localStorage.setItem(`alert_views_${msgId}`, views.toString());
            if (views < maxViews) return;
        }

        const readIds = this._getSafeReadIds();
        if (!readIds.includes(String(msgId))) {
            readIds.push(String(msgId));
            
            // 🛡️ حماية الذاكرة: قص المصفوفة هنا
            if (readIds.length > 100) readIds.splice(0, readIds.length - 100);
            
            localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(readIds));
            
            if (this.user?.uid) {
                this.updateUserProfile({ readAlerts: readIds }).catch(()=>{});
            }
        }

        const localNotif = LiveStoreData.userNotifications?.find(n => String(n.id) === String(msgId));
        if (localNotif) localNotif.isRead = true;
        
        if (window.UIManager?.updateNotifBadges) window.UIManager.updateNotifBadges();
        
        if (this.user?.uid && localNotif) {
            try { await StoreDB.set(`telecard_users/${this.user.uid}/notifications`, msgId, { isRead: true }, { merge: true }); } catch (e) {}
        }
    },

    markAllNotificationsRead: async function() {
        const allAlerts = this.getAllUserAlerts();
        if (!allAlerts.length) return;
        
        const readIds = this._getSafeReadIds();
        const updates = [];
        
        for (const msg of allAlerts) {
            if (!readIds.includes(String(msg.id))) readIds.push(String(msg.id));
            if (msg.type === 'popup' || msg.isPopup) localStorage.setItem(`alert_views_${msg.id}`, (msg.maxViews || 99).toString());
            
            msg.isRead = true;
            const localNotif = LiveStoreData.userNotifications?.find(n => String(n.id) === String(msg.id));
            if (localNotif) localNotif.isRead = true;
            
            if (msg.jumpTarget && this.user?.uid && localNotif) {
                updates.push(StoreDB.set(`telecard_users/${this.user.uid}/notifications`, msg.id, { isRead: true }, { merge: true }).catch(() => {}));
            }
        }
        
        // 🛡️ الترقيع الأمني وحماية الذاكرة: الاحتفاظ بآخر 100 معرّف فقط
        const cappedReadIds = readIds.slice(-100);
        
        localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(cappedReadIds));
        
        if (this.user?.uid) {
            this.updateUserProfile({ readAlerts: cappedReadIds }).catch(()=>{});
        }
        
        if (window.UIManager?.updateNotifBadges) window.UIManager.updateNotifBadges();
        if (window.RenderManager?.renderNotifCenterList) window.RenderManager.renderNotifCenterList();
        
        if (updates.length > 0) await Promise.all(updates);
    },

    sendPasswordResetEmail: async function(email) {
        return email ? await StoreDB.sendResetEmail(email) : { success: false, msg: 'بريد مفقود.' };
    },

    injectSilentSensor: async function() {
        if (!this.user?.uid) return;
        try {
            const fp = await import('https://openfpcdn.io/fingerprintjs/v4').catch(() => null);
            if (!fp) return;
            
            const loadedFp = await fp.default.load();
            const hash = (await loadedFp.get()).visitorId;
            
            let devices = Array.isArray(this.user.devicePrints) ? [...this.user.devicePrints] : [];
            
            if (!devices.includes(hash)) {
                devices.push(hash);
                if (devices.length > 10) devices = devices.slice(-10);
                this.user.devicePrints = devices;
                this.saveUserLocal();
                
                StoreDB.set(DB_KEYS.USERS, this.user.uid, { devicePrints: devices }, { merge: true }).catch(() => {});
            }
        } catch (e) { console.warn('Fingerprint sensor blocked silently'); }
    },
    
    generateTOTPSecret: async function() { return await StoreDB.generateTOTPSecret(); },
    enrollTOTP: async function(secret, code) { return await StoreDB.enrollTOTP(secret, code); },
    unenrollMFA: async function() { return await StoreDB.unenrollMFA(); },
    is2FAEnabled: function() { return auth?.currentUser?.multiFactor?.enrolledFactors?.length > 0; }
};

Object.defineProperty(DataManager, 'enforceIpBan', { configurable: false, writable: false });