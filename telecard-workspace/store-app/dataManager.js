// ============================================================================
// ⚙️ مدير البيانات الرئيسي (DataManager.js) - النسخة التيتانيوم الشاملة V2.0 🛡️
// 🚀 الهندسة: Singleton State Manager + Smart Caching + Idempotency Locks
// 🎯 الوظيفة: إدارة حالة النظام، جلب البيانات، حماية المستخدم، والمزامنة
// 🌟 التحديث الأقصى (The Perfect Shield):
// 1. Offline Auth Fix: منع تسجيل الخروج القسري عند انقطاع الإنترنت.
// 2. Memory Leak Shield: التنظيف الآمن لمستمعات الأحداث (Unsubscribe Cleanup).
// 3. Storage Thrashing Fix: تحسين الأداء عبر تقليل الكتابة المتكررة في localStorage.
// 4. Time Drift Sync: مزامنة الوقت فوراً عند الحاجة بدون انتظار 6 ساعات.
// 5. Supply Chain Protection: بصمة محلية خفيفة (Fallback Hash) بدلاً من استيراد CDN خارجي.
// 6. Rate Limit Guard: تخزين الـ IP في الجلسة (Session) لمنع استنزاف طلبات الـ API للحظر.
// ============================================================================

import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"; 
import { DB_KEYS, ACTIVE_USER_KEY, CACHE_KEYS, DYNAMIC_PREFIXES } from './config.js';
import { FirebaseAdapter, auth } from './core/firebaseAdapter.js'; 
import { RenderHelpers } from './core/renderHelpers.js'; 
import { FinancialEngine } from './core/financialEngine.js';

export const StoreDB = FirebaseAdapter;

export const LiveStoreData = {
    cats: [], prods: [], settings: {}, banners: [], users: [], 
    orders: [], deposits: [], payments: [], tiers: [], rates: [],
    vault: [], coupons: [], offers: [], alerts: [],
    system: {}, countries: [], popup: null,
    userNotifications: [], 
    isInitialSyncDone: false,
    isOfflineMode: false
};

// ============================================================================
// 🛠️ مساعد قاعدة البيانات المحلية (IndexedDB Helper) 
// ============================================================================
const LocalDBHelper = {
    dbName: 'TeleCardStoreDB', storeName: 'CacheStore', dbVersion: 1,
    init: function() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    set: async function(key, val) {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                tx.objectStore(this.storeName).put(val, key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) { 
            console.warn("[LocalDB] تعذر الحفظ في IndexedDB:", e.message);
            return false; 
        }
    },
    get: async function(key) {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const req = tx.objectStore(this.storeName).get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error); 
            });
        } catch (e) {
            return null;
        }
    },
    remove: async function(key) {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                tx.objectStore(this.storeName).delete(key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) { return false; }
    }
};

// ============================================================================
// 📦 مدير الكاش الذكي (Smart Cache Manager)
// ============================================================================
export const SmartCacheManager = {
    CACHE_KEY: CACHE_KEYS.SMART_CATALOG, 
    EXPIRY_TIME: 24 * 60 * 60 * 1000, 
    
    saveCatalogToLocal: async function(prods, cats, offers, tiers, rates, banners) {
        const cacheData = { timestamp: Date.now(), data: { prods, cats, offers, tiers, rates, banners } };
        await LocalDBHelper.set(this.CACHE_KEY, cacheData);
    },
    
    loadCatalogFromLocal: async function() {
        try {
            let parsed = await LocalDBHelper.get(this.CACHE_KEY);
            if (!parsed) return null;
            
            if (Date.now() - parsed.timestamp > this.EXPIRY_TIME) {
                await LocalDBHelper.remove(this.CACHE_KEY);
                return null;
            }
            return parsed.data;
        } catch (e) { return null; }
    },
    
    shouldFetchFromServer: async function(currentServerVersion) {
        const localVersion = localStorage.getItem(CACHE_KEYS.CATALOG_VERSION);
        if (!localVersion || String(localVersion) !== String(currentServerVersion)) {
            localStorage.setItem(CACHE_KEYS.CATALOG_VERSION, String(currentServerVersion));
            return true;
        }
        
        const cachedData = await this.loadCatalogFromLocal();
        if (!cachedData) return true;
        
        Object.assign(LiveStoreData, cachedData);
        console.log("🚀 [Smart Cache] تم تحميل المتجر من الكاش بنجاح");
        return false; 
    }
};

// ============================================================================
// ⚙️ مدير البيانات الرئيسي (DataManager)
// ============================================================================
export const DataManager = {
    _ratesCache: null, 

    initStoreCatalog: async function() {
        console.log("⚡ جاري تشغيل المتجر وجلب البيانات...");
        const t0 = performance.now();
        LiveStoreData.isOfflineMode = false;
        
        try {
            let settingsSnap = null;
            let systemSnap = null;
            try {
                const configResults = await Promise.all([
                    StoreDB.getById(DB_KEYS.SETTINGS, 'singleton').catch(() => null),
                    StoreDB.getById(DB_KEYS.SYSTEM, 'cache_version').catch(() => null)
                ]);
                settingsSnap = configResults[0];
                systemSnap = configResults[1];
            } catch (e) { console.warn("⚠️ تأخر في جلب الإعدادات، سنستمر..."); }
            
            let serverCatalogVersion = systemSnap?.version || settingsSnap?.catalogVersion || '1.0';
            
            if (settingsSnap) {
                LiveStoreData.settings = settingsSnap;
                if (typeof RenderHelpers !== 'undefined' && RenderHelpers.init) RenderHelpers.init(LiveStoreData.settings);
            }
            
            const shouldFetch = await SmartCacheManager.shouldFetchFromServer(serverCatalogVersion);
            const isStoreEmpty = !LiveStoreData.prods || LiveStoreData.prods.length === 0;
            
            if (!shouldFetch && !isStoreEmpty) {
                this._ratesCache = null; 
                return true;
            }
            
            const fetchPromises = [
                StoreDB.getAll(DB_KEYS.PRODS).catch(() => []), 
                StoreDB.getAll(DB_KEYS.CATS).catch(() => []),
                StoreDB.getAll(DB_KEYS.OFFERS).catch(() => []), 
                StoreDB.getAll(DB_KEYS.TIERS).catch(() => []),
                StoreDB.getAll(DB_KEYS.RATES).catch(() => []), 
                StoreDB.getAll(DB_KEYS.BANNERS).catch(() => [])
            ];
            
            const results = await Promise.all(fetchPromises);
            
            const rawProds = Array.isArray(results[0]) ? results[0] : [];
            const rawCats = Array.isArray(results[1]) ? results[1] : [];
            const offers = Array.isArray(results[2]) ? results[2] : [];
            const tiers = Array.isArray(results[3]) ? results[3] : [];
            const rates = Array.isArray(results[4]) ? results[4] : [];
            const banners = Array.isArray(results[5]) ? results[5] : [];
            
            const activeProds = rawProds.filter(p => p && String(p.isActive) !== 'false');
            
            Object.assign(LiveStoreData, { prods: activeProds, cats: rawCats, offers, tiers, rates, banners });
            this._ratesCache = null; 
            
            await SmartCacheManager.saveCatalogToLocal(activeProds, rawCats, offers, tiers, rates, banners);
            
            console.log(`✅ تم التحديث بنجاح (النسخة: ${serverCatalogVersion}) في ${Math.round(performance.now() - t0)}ms`);
            return true;
            
        } catch (error) {
            console.error("❌ [DataManager] خطأ غير متوقع أثناء التهيئة:", error.message);
            const fallback = await SmartCacheManager.loadCatalogFromLocal();
            if (fallback && fallback.prods) {
                Object.assign(LiveStoreData, fallback);
                this._ratesCache = null;
                LiveStoreData.isOfflineMode = true;
                return true;
            }
            LiveStoreData.isOfflineMode = true;
            return false;
        }
    },

    serverTimeOffset: 0, 
    getNow: function() { return Date.now() + this.serverTimeOffset; },
    user: null, 
    prefs: { sound: true, theme: 'dark', security2fa: false, favs: [] }, 
    favs: new Set(),
    selectedCurr: 'USD', 
    _notifUnsubscribe: null, 
    _userUnsubscribe: null,

    generateIdempotencyKey: function() { return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).substring(2); },

    saveUserLocal: function() {
    if (!this.user) return;
    
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
        walletBalance: Number(this.user.walletBalance ?? this.user.balance ?? 0),
        baseCurrency: String(this.user.baseCurrency || 'USD').toUpperCase(),
        tierId: String(this.user.tierId || '1'),
        tierCycleSpent: Number(this.user.tierCycleSpent || 0),
        // 🛡️ الترقيع الماسي: تحويل كائن التاريخ إلى رقم ثابت لمنع فساده عند تحويله لـ JSON
        tierCycleStartDate: this._parseSafeTime(this.user.tierCycleStartDate),
        readAlerts: Array.isArray(this.user.readAlerts) ? this.user.readAlerts.slice(0, 50) : [],
        createdAt: this._parseSafeTime(this.user.createdAt),
        isVerified: Boolean(this.user.isVerified || false),
        kycStatus: String(this.user.kycStatus || 'none'),
        biometricEnabled: Boolean(this.user.biometricEnabled || false)
    };
    
    try {
        localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(safeUser));
    }
    catch (e) {
        console.warn("[DataManager] سعة التخزين ممتلئة، جاري تنظيف الكاش غير الضروري...");
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(DYNAMIC_PREFIXES.ALERT_VIEWS) || key === CACHE_KEYS.SMART_CATALOG) {
                localStorage.removeItem(key);
            }
        });
        try {
            localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(safeUser));
        } catch (err) {
            console.error("[DataManager] فشل حفظ بيانات العميل محلياً رغم التنظيف الجبري:", err);
        }
    }
},
    updateUserProfile: async function(newData) {
        const uid = this.user?.uid || this.user?.id || localStorage.getItem(CACHE_KEYS.ACTIVE_UID);
        if (!uid || typeof newData !== 'object' || Array.isArray(newData) || newData === null) return false;
        
        const FORBIDDEN_KEYS = new Set([
            'walletBalance', 'balance', 'wallet_balance', 'tierId', 'tier', 'totalSpent', 'totalDeposit', 'isBanned', 'isIpBanned', 
            'isRestricted', 'kycStatus', 'kycData', 'role', 'adminMessage', 'isVerified', 'devicePrints', 'passwordChangeHistory',
            'baseCurrency', 'base_currency', 'email', 'phone', 
            '__proto__', 'constructor', 'prototype' 
        ]);
        
        const sanitized = Object.create(null);
        
        for (const key in newData) {
            if (!FORBIDDEN_KEYS.has(key) && Object.prototype.hasOwnProperty.call(newData, key)) {
                sanitized[key] = typeof newData[key] === 'object' && newData[key] !== null ? JSON.parse(JSON.stringify(newData[key])) : newData[key];
            }
        }
        
        if (Object.keys(sanitized).length === 0) return true;
        
        try {
            const success = await StoreDB.set(DB_KEYS.USERS, String(uid), sanitized, { merge: true });
            if (success) { this.user = { ...this.user, ...sanitized }; this.saveUserLocal(); return true; }
            return false;
        } catch (error) { return false; }
    },

    loadPrefs: function() {
        try {
            const saved = JSON.parse(localStorage.getItem(DB_KEYS.PREFS) || '{}');
            this.prefs = { sound: saved.sound !== false, theme: saved.theme || localStorage.getItem(CACHE_KEYS.THEME) || 'dark', security2fa: saved.security2fa === true, favs: Array.isArray(saved.favs) ? saved.favs : [] };
            this.favs = new Set(this.prefs.favs.map(String).filter(s => s.trim() !== '' && s !== 'NaN' && s !== 'undefined'));
        } catch (e) { 
            this.prefs = { sound: true, theme: 'dark', security2fa: false, favs: [] }; this.favs = new Set(); 
        }
    },
    
    savePrefs: function() { 
        try { 
            if (this.favs) this.prefs.favs = Array.from(this.favs); 
            localStorage.setItem(DB_KEYS.PREFS, JSON.stringify(this.prefs || {})); 
        } catch (e) {} 
    },

    getTiers: function() { return LiveStoreData.tiers || []; },
    getUserTier: function(user) {
        const tiers = this.getTiers();
        if (!tiers.length) return { profit_percent: 0, min_profit_usd: 0 }; 
        const code = String(user?.tierId ?? user?.tier ?? '1');
        return tiers.find(t => String(t.id) === code) || tiers.find(t => t.isDefault) || tiers[0];
    },

    getTierProgress: function() {
        if (!this.user) return null;
        const currentTier = this.getUserTier(this.user);
        const tiers = this.getTiers();
        if (!currentTier || tiers.length === 0) return null;

        const sorted = [...tiers].sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0));
        const spent = Number(this.user.tierCycleSpent || 0);
        const durationMs = Number(currentTier.durationDays || 30) * 86400000;
        
        // 🛡️ الترقيع الماسي: استخدام _parseSafeTime لضمان استخراج الوقت بشكل صحيح سواء كان Object أو Number
        const safeStartDateMs = this._parseSafeTime(this.user.tierCycleStartDate) || this.getNow();
        const remainingDays = Math.max(0, Math.ceil((durationMs - (this.getNow() - safeStartDateMs)) / 86400000)); 

        const nextTier = sorted.find(t => Number(t.threshold || 0) > Number(currentTier.threshold || 0));
        let target = nextTier ? Number(nextTier.threshold) : (Number(currentTier.threshold || 0) > 0 ? Number(currentTier.threshold) : 500);
        
        return {
            currentTier, nextTier, targetNameDisplay: nextTier ? nextTier.name : "للحفاظ على المميزات", 
            targetThreshold: target, spent, remainingAmt: Math.max(0, target - spent), 
            percent: Math.min(100, Math.max(0, (spent / target) * 100)), remainingDays, 
            isMaxTier: !nextTier, isGoalReached: !nextTier && spent >= target, isAutoAdvanceEnabled: currentTier.autoAdvance !== false
        };
    },
    getActiveOffer: function(prodId) {
        const now = this.getNow(); 
        return (LiveStoreData.offers || []).find(o => o.isActive && (!o.expiryDate || o.expiryDate > now) && o.targetProds?.includes(String(prodId)));
    },

    calculateFinalPrice: function(prod, user, qty, optIdx, appliedCoupon) {
        let q = Math.max(1, Math.floor(Number(qty)) || 1);
        if (prod.type === 'select') q = 1; 

        const activeOffer = this.getActiveOffer(prod.id);
        const orderSnap = FinancialEngine.calculateOrderTotal({ 
            product: prod, tier: this.getUserTier(user), offer: activeOffer, coupon: appliedCoupon, optIdx 
        }, q);
        
        const oldPriceUsd = (activeOffer?.type === 'fake') ? Number(activeOffer.value || 0) : null;

        return {
            unitSnapshot: orderSnap, totalUsd: orderSnap.totalFinalPrice, unitUsd: orderSnap.finalPrice, 
            originalTotalUsd: orderSnap.totalOriginalPrice, saleDiscountUsd: FinancialEngine.safeMul(orderSnap.offerDiscount, q), 
            couponDiscountUsd: FinancialEngine.safeMul(orderSnap.couponDiscount, q), oldPriceUsd, 
            displayOldTotalUsd: oldPriceUsd ? FinancialEngine.safeMul(oldPriceUsd, q) : orderSnap.totalOriginalPrice
        };
    }, 
    
    computeSellingUsd: function(p, u, q=1, i=null) { return this.calculateFinalPrice(p, u, q, i, null).totalUsd; },

    getRates: function() { 
        if (this._ratesCache) return this._ratesCache;

        let rawData = LiveStoreData.rates;
        if ((!rawData || (Array.isArray(rawData) && rawData.length === 0)) && LiveStoreData.settings?.rates) {
            rawData = LiveStoreData.settings.rates;
        }

        if (typeof FinancialEngine.normalizeRates === 'function') {
            this._ratesCache = FinancialEngine.normalizeRates(rawData);
        } else {
            this._ratesCache = { 'USD': { code: 'USD', symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true } };
        }

        return this._ratesCache;
    },

    _safeConvert: function(amt, f, t, r, c) { 
        if (!amt || typeof amt !== 'number' || amt <= 0) return 0;
        
        const fromCur = (f || 'USD').toUpperCase();
        const toCur = (t || 'USD').toUpperCase();
        
        if (fromCur === toCur) return amt;

        let converted = null;
        try {
            converted = FinancialEngine.convertViaUSD(amt, fromCur, toCur, r, c);
        } catch(e) { }
        
        if (!converted || converted === 0 || isNaN(converted)) {
            const safeRates = (r && Object.keys(r).length > 0) ? r : this.getRates();
            
            const getSafeRateValue = (rateObj, channel) => {
                if (typeof rateObj === 'object' && rateObj !== null) {
                    return Number(channel === 'deposit' ? rateObj.depRate : rateObj.priceRate) || 1;
                }
                return Number(rateObj) || 1; 
            };

            const fromRate = getSafeRateValue(safeRates[fromCur], c);
            const toRate = getSafeRateValue(safeRates[toCur], c);
            
            try {
                const amtInUsd = FinancialEngine.safeDiv(amt, fromRate);
                converted = FinancialEngine.safeMul(amtInUsd, toRate);
            } catch (e) {
                converted = 0;
            }
        }
        
        return converted;
    },

    getPricingLocal: function(prod, qty, optIdx, appliedCoupon) {
        if (!prod) return null;
        
        const baseCur = (this.user?.baseCurrency || LiveStoreData.settings?.defaultCurrency || 'USD').toUpperCase();
        const dispCur = (this.selectedCurr || baseCur).toUpperCase();
        const rates = this.getRates();
        const prc = this.calculateFinalPrice(prod, this.user, qty, optIdx, appliedCoupon);

        const totBase = this._safeConvert(prc.totalUsd, 'USD', baseCur, rates, 'pricing');
        const valUnit = this._safeConvert(prc.unitUsd, 'USD', dispCur, rates, 'pricing');
        const valTotal = this._safeConvert(prc.totalUsd, 'USD', dispCur, rates, 'pricing');
        
        return {
            totalUsd: prc.totalUsd, totalLocalBase: totBase, displayCurrency: dispCur,
            unitText: valUnit.toFixed(2) + (dispCur === 'USD' ? ' $' : ' ' + dispCur),
            totalText: valTotal.toFixed(2) + (dispCur === 'USD' ? ' $' : ' ' + dispCur),
            hasDiscount: Boolean(prc.oldPriceUsd || prc.couponDiscountUsd > 0 || prc.saleDiscountUsd > 0),
            oldTotalLocalBase: prc.displayOldTotalUsd ? this._safeConvert(prc.displayOldTotalUsd, 'USD', dispCur, rates, 'pricing') : 0, 
            pricingSnapshot: prc
        };
    },

    validateCoupon: function(code, prod, qty, optIdx) {
        if (!code) return { valid: false, msg: 'يرجى إدخال الكود' };
        const cp = (LiveStoreData.coupons || []).find(c => c.code.toUpperCase() === code.toUpperCase());
        if (!cp) return { valid: false, msg: 'الكود غير صحيح' };
        if (cp.isActive === false) return { valid: false, msg: 'هذا الكوبون غير فعال' };
        if (cp.expiryDate && this.getNow() > cp.expiryDate) return { valid: false, msg: 'انتهت صلاحية الكوبون' };
        if (Number(cp.maxUses) > 0 && Number(cp.usedCount || 0) >= Number(cp.maxUses)) return { valid: false, msg: 'نفذت كمية الاستخدام' };
        if (cp.targetTiers?.length > 0 && !cp.targetTiers.includes(String(this.getUserTier(this.user)?.id))) return { valid: false, msg: 'غير متاح لمستوى عضويتك' };
        if (cp.targetProds?.length > 0 && !cp.targetProds.includes(String(prod.id)) && !cp.targetProds.includes(String(prod.catId))) return { valid: false, msg: 'غير مخصص لهذا المنتج' };
        if (cp.allowedUsers?.length > 0 && !cp.allowedUsers.map(String).includes(String(this.user.uid || this.user.id))) return { valid: false, msg: 'مخصص لعملاء محددين' };
        
        if (Number(cp.minOrder) > 0) {
            const p = this.calculateFinalPrice(prod, this.user, qty, optIdx, null);
            if (p.totalUsd < Number(cp.minOrder)) return { valid: false, msg: `الحد الأدنى للاستخدام ${cp.minOrder}$` };
        }
        return { valid: true, coupon: cp };
    },    

    convertViaUSDHelper: function(amt, f, t, rnd='round', c='pricing') {
        let v = this._safeConvert(amt, (f||'USD').toUpperCase(), (t||'USD').toUpperCase(), LiveStoreData.rates, c);
        if(rnd === 'floor') return Math.floor(v * 10000) / 10000;
        if(rnd === 'ceil')  return Math.ceil(v * 10000) / 10000;
        return Number(v.toFixed(4));
    },

    listenToUserUpdates: function(renderCb) {
        const activeUid = localStorage.getItem(CACHE_KEYS.ACTIVE_UID);
        if (!activeUid) return;
        
        // 🛡️ التحديث 2: التنظيف الآمن للمستمعات
        if (typeof this._userUnsubscribe === 'function') {
            this._userUnsubscribe();
            this._userUnsubscribe = null;
        }
        
        try {
            if (typeof StoreDB.listenDoc === 'function') {
                this._userUnsubscribe = StoreDB.listenDoc(DB_KEYS.USERS, activeUid, (docData) => {
                    if (docData) {
                        if (docData.isBanned || docData.isIpBanned) {
                            if (window.UIManager?.triggerLiveBanAlert) window.UIManager.triggerLiveBanAlert(docData.banReason || 'تم تقييد حسابك.');
                            else this.logout();
                            return;
                        }
                        this.user = { ...this.user, ...docData, uid: activeUid, id: activeUid, walletBalance: Number(docData.walletBalance ?? docData.balance ?? 0) };
                        this.saveUserLocal();
                        if (renderCb) renderCb();
                    } else {
                        this.logout();
                    }
                });
            }
        } catch (e) { console.warn("[DataManager] listenDoc failed:", e.message); }
    },

    logout: async function() {
        try {
            if (auth) await signOut(auth);
            localStorage.removeItem(CACHE_KEYS.ACTIVE_UID);
            localStorage.removeItem(ACTIVE_USER_KEY);
            localStorage.removeItem(CACHE_KEYS.DISPLAY_CURRENCY);
            
            if (typeof this._notifUnsubscribe === 'function') { this._notifUnsubscribe(); this._notifUnsubscribe = null; }
            if (typeof this._userUnsubscribe === 'function') { this._userUnsubscribe(); this._userUnsubscribe = null; } 

            LiveStoreData.cats = []; LiveStoreData.prods = []; LiveStoreData.settings = {}; 
            LiveStoreData.banners = []; LiveStoreData.users = []; LiveStoreData.orders = []; 
            LiveStoreData.deposits = []; LiveStoreData.payments = []; LiveStoreData.tiers = []; 
            LiveStoreData.rates = []; LiveStoreData.vault = []; LiveStoreData.coupons = []; 
            LiveStoreData.offers = []; LiveStoreData.alerts = []; LiveStoreData.system = {}; 
            LiveStoreData.countries = []; LiveStoreData.popup = null; LiveStoreData.userNotifications = [];
            LiveStoreData.isInitialSyncDone = false; LiveStoreData.isOfflineMode = false;
            
            this._ratesCache = null; 
            this.user = null;
            this.favs = new Set();
            this.prefs = {};

        } catch(e) {}
        window.location.replace('login.html');
    },

    syncUser: async function() {
        const activeUid = localStorage.getItem(CACHE_KEYS.ACTIVE_UID);
        let me = null;

        if (activeUid) {
            me = (LiveStoreData.users || []).find(u => String(u.uid || u.id) === String(activeUid)) || JSON.parse(localStorage.getItem(ACTIVE_USER_KEY) || 'null');
            if (me && String(me.uid || me.id) !== String(activeUid)) me = null;
            
            const lastSync = sessionStorage.getItem(CACHE_KEYS.TIME_SYNC);
            const now = Date.now();
            
            // 🛡️ التحديث 4: استرجاع الوقت عند الحاجة الفعلية فوراً إذا كان Offset صفراً ونحن متصلون
            const needsSync = !lastSync || (now - Number(lastSync)) > (6 * 60 * 60 * 1000); 
            if (!LiveStoreData.isOfflineMode && StoreDB.callFunction && (needsSync || this.serverTimeOffset === 0)) {
                StoreDB.callFunction('getServerTime').then(res => { 
                    if(res && res.serverTime) {
                        this.serverTimeOffset = res.serverTime - Date.now(); 
                        sessionStorage.setItem(CACHE_KEYS.TIME_SYNC, Date.now().toString());
                    }
                }).catch(() => {});
            }
        }
        
        // 🛡️ التحديث 1: منع الخروج العشوائي للعميل إذا لم يكن هناك إنترنت
        if (activeUid && !me && window.ClientSystem?.isReady) { 
            if (!LiveStoreData.isOfflineMode) {
                this.logout(); 
            }
            return false; 
        }
        
        if (me) {
            if (me.isBanned || me.isIpBanned || me.isRestricted) {
                if (window.UIManager?.triggerLiveBanAlert) window.UIManager.triggerLiveBanAlert(me.banReason || 'حساب مقيد.');
                else this.logout();
                return false;
            }  
            me.uid = activeUid; me.id = activeUid;
            me.baseCurrency = (me.baseCurrency || me.base_currency || 'USD').toUpperCase();
            me.walletBalance = Number(me.walletBalance ?? me.wallet_balance ?? me.balance ?? 0);
            if (me.tierCycleStartDate === undefined) { me.tierCycleStartDate = this.getNow(); me.tierCycleSpent = 0; }
            
            if (me.readAlerts && Array.isArray(me.readAlerts)) localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(me.readAlerts));
            
            this.user = me;
            this.saveUserLocal();
            this.listenToUserUpdates(() => {
                if (window.UIManager?.updateProfileDisplay) window.UIManager.updateProfileDisplay();
                if (window.UIManager?.updateDisplayBalance) window.UIManager.updateDisplayBalance();
                if (window.RenderManager?.renderWallet) window.RenderManager.renderWallet(true);
            });
        } else if (!activeUid) {
            this.user = null;
        }
        
        this.enforceIpBan().catch(()=>{}); 

        const adminDef = LiveStoreData.settings?.defaultCurrency || 'USD';
        let savedCurr = localStorage.getItem(CACHE_KEYS.DISPLAY_CURRENCY) || this.user?.baseCurrency || adminDef;
        if (LiveStoreData.settings?.showCurrencyToggle === false && this.user && savedCurr !== this.user.baseCurrency) {
            savedCurr = this.user.baseCurrency;
            localStorage.setItem(CACHE_KEYS.DISPLAY_CURRENCY, savedCurr);
        }
        this.selectedCurr = savedCurr;
        return true;
    },

    // 🛡️ التحديث 6: حفظ الـ IP في الجلسة لمنع هدر الطلبات (Rate Limit Protection)
    enforceIpBan: async function() {
    if (LiveStoreData.isOfflineMode) return false;
    try {
        const banned = LiveStoreData.settings?.bannedIps || [];
        if (!banned.length) return false;
        
        let ip = sessionStorage.getItem('tc_client_ip');
        
        // 🛡️ الترقيع الماسي: تجاوز سريع إذا كان المتصفح يحظر الخدمة (مخزنة في الجلسة)
        if (ip === 'blocked_or_failed') return false;
        
        if (!ip) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500); // تقليل المدة لـ 1.5 ثانية
            try {
                const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
                if (res.ok) {
                    ip = (await res.json()).ip;
                    sessionStorage.setItem('tc_client_ip', ip);
                }
            } catch (e) {
                // تسجيل الفشل لمنع إعادة المحاولة وتعطيل العميل في نفس الجلسة
                sessionStorage.setItem('tc_client_ip', 'blocked_or_failed');
            } finally {
                clearTimeout(timeoutId);
            }
        }
        
        if (ip && ip !== 'blocked_or_failed' && banned.includes(ip)) {
            this.logout();
            return true;
        }
    } catch (e) {}
    return false;
},
    submitPasswordChange: async function(cVal, nVal, confVal) {
        if (!nVal || nVal.length < 6) return { success: false, msg: 'يجب أن تكون 6 أحرف على الأقل.' };
        if (nVal !== confVal) return { success: false, msg: 'غير متطابقتين.' };
        if (!cVal) return { success: false, msg: 'أدخل الحالية.' };
        
        const now = this.getNow();
        let hist = (this.user?.passwordChangeHistory || []).filter(ts => (now - ts) < 86400000);
        if (hist.length >= 3) return { success: false, msg: 'استنفدت المحاولات، حاول غداً.' };
        
        try {
            hist.push(now);
            await this.updateUserProfile({ passwordChangeHistory: hist });
            const result = await StoreDB.changeUserPassword(cVal, nVal);
            if (result.success) return { success: true, msg: 'تم التحديث.' };
            return { success: false, msg: result.msg };
        } catch (e) { return { success: false, msg: 'خطأ اتصال.' }; }
    },

    _currentPurchaseKey: null,
    confirmPurchase: async function(prod, qty, optIdx, finalInputStr, appliedCoupon) {
        if (LiveStoreData.isOfflineMode) return { success: false, msg: 'أنت تتصفح بدون انترنت.' };
        if (!prod || !this.user) return { success: false, msg: 'بيانات مفقودة' };
        
        const SESSION_ORDER_KEY = `tc_pending_order_${prod.id}`;

        if (sessionStorage.getItem(SESSION_ORDER_KEY)) return { success: false, msg: 'طلب جاري، يرجى الانتظار...' };

        this._currentPurchaseKey = this.generateIdempotencyKey();
        sessionStorage.setItem(SESSION_ORDER_KEY, this._currentPurchaseKey);
        
        try {
            const req = { productId: String(prod.id), qty: Math.max(1, Math.floor(Number(qty)) || 1), optIdx: optIdx ?? null, finalInputStr: finalInputStr || '---', couponCode: appliedCoupon?.code || null, idempotencyKey: this._currentPurchaseKey };
            const res = await StoreDB.callFunction('createOrder', req);
            
            return { success: true, msg: res.message || 'تم إتمام الطلب', isAutoDelivered: res.isAutoDelivered, deliveredCodeText: res.deliveredCode };
        } catch (err) {
            const msg = String(err.message || '').toLowerCase();
            if (msg.includes('رصيد')) return { success: false, msg: 'رصيدك غير كافٍ.' };
            if (msg.includes('مسبقاً')) return { success: false, msg: 'تم استلام طلبك.' };
            return { success: false, msg: 'خطأ بالشبكة أو نفد المخزون.' };
        } finally {
            sessionStorage.removeItem(SESSION_ORDER_KEY);
        }
    },    

    calculateDepositFee: function(amt, method, payCurr) {
        if (!method || amt <= 0) return { isValid: false, msg: 'بيانات غير صالحة', netBase: 0, feePct: 0, feeType: 'fee', feeUnit: 'percent' };
        const curr = (payCurr || '').toUpperCase();
        let s = { fee: parseFloat(method.fee)||0, min: parseFloat(method.min)||0, max: parseFloat(method.max)||0, feeType: method.feeType||'fee', feeUnit: method.feeUnit||method.unit||'percent' };
        if (method.currencySettings?.[curr]) {
            const cs = method.currencySettings[curr];
            s = { fee: parseFloat(cs.fee)||0, min: parseFloat(cs.min)||0, max: parseFloat(cs.max)||0, feeType: cs.feeType||'fee', feeUnit: cs.feeUnit||cs.unit||'percent' };
        } 
        if (s.min > 0 && amt < s.min) return { isValid: false, msg: `أقل مبلغ: ${s.min} ${curr}`, ...s };
        if (s.max > 0 && amt > s.max) return { isValid: false, msg: `أقصى مبلغ: ${s.max} ${curr}`, ...s };

        let feeAmt = ['fixed', 'amount'].includes(s.feeUnit) ? s.fee : amt * (s.fee / 100);
        let net = Math.max(0, s.feeType === 'bonus' ? amt + feeAmt : amt - feeAmt);
        let netBase = this.convertViaUSDHelper(net, curr, this.user.baseCurrency || 'USD', 'floor', 'deposit');
        return { isValid: true, netBase: isNaN(netBase) ? 0 : netBase, feePct: s.fee, feeType: s.feeType, feeUnit: s.feeUnit, feeAmount: feeAmt };
    },

    _currentDepositKey: null,
    submitBalanceRequest: async function(amt, method, payCurr, receipt) {
        if (!method) return { success: false, msg: 'طريقة الدفع مفقودة' };
        if (amt <= 0) return { success: false, msg: 'مبلغ غير صالح' };
        if (method.reqProof !== false && !receipt) return { success: false, msg: 'أرفق الإشعار', errType: 'receipt' };
        
        const SESSION_DEPOSIT_KEY = `tc_pending_deposit_${method.id}`;
        if (sessionStorage.getItem(SESSION_DEPOSIT_KEY)) return { success: false, msg: 'طلب جاري...' };

        this._currentDepositKey = this.generateIdempotencyKey();
        sessionStorage.setItem(SESSION_DEPOSIT_KEY, this._currentDepositKey);
        
        try {
            const req = { amount: Number(amt), paymentMethodName: method.name, payCurr, receiptData: receipt, idempotencyKey: this._currentDepositKey };
            const res = await StoreDB.callFunction('submitBalanceRequest', req);
            
            return { success: true, msg: res.message || 'تم الإرسال' };
        } catch (err) {
            return { success: false, msg: 'تعذر الإرسال، جرب لاحقاً.' };
        } finally {
            sessionStorage.removeItem(SESSION_DEPOSIT_KEY);
        }
    },

    formatDateLocal: function(ts) { return typeof RenderHelpers !== 'undefined' ? RenderHelpers.formatSafeDate(ts) : '---'; },
    isFavorite: function(id) { return this.favs?.has(String(id)); },
    toggleFavorite: function(id) {
        if (!id) return;
        if(!this.favs) this.favs = new Set();
        this.favs.has(String(id)) ? this.favs.delete(String(id)) : this.favs.add(String(id));
        this.savePrefs();
    },

    getAdminCountries: async function() {
        try { const c = await StoreDB.getAll(DB_KEYS.COUNTRIES); return Array.isArray(c) ? c : []; } catch (e) { return []; }
    },

    _getSafeReadIds: function() {
        try { return JSON.parse(localStorage.getItem(DB_KEYS.NOTIF_READ_LIST) || "[]").map(String); } 
        catch(e) { localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, "[]"); return []; }
    },

    listenToUserNotifications: function(renderCb) {
        if (!this.user?.uid) return null;
        if (typeof this._notifUnsubscribe === 'function') {
            this._notifUnsubscribe();
            this._notifUnsubscribe = null;
        }
        try {
            this._notifUnsubscribe = StoreDB.listenQuery(`telecard_users/${this.user.uid}/notifications`, [], 'createdAt', 50, (notifs) => {
                LiveStoreData.userNotifications = (notifs || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                if (renderCb) renderCb();
            });
            return this._notifUnsubscribe; 
        } catch (e) { return null; }
    },

    _parseSafeTime: function(val) {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        if (typeof val.toMillis === 'function') return val.toMillis();
        if (typeof val === 'string') {
            let safeString = val;
            if (!val.includes('T')) {
                safeString = val.replace(/-/g, '/');
            }
            const parsed = new Date(safeString).getTime(); 
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    },

    _isAlertForUser: function(msg, user, now, readIds = [], excludeRead = false) {
        const type = msg.targetType || msg.target || 'all';
        const tId = String(msg.targetId || msg.userId || msg.tierId || '');
        const isForMe = type === 'all' || (type === 'user' && tId === String(user.uid)) || (type === 'tier' && tId === String(user.tierId));
        
        if (!isForMe || (msg.expiresAt && now > msg.expiresAt)) return false;
        if (excludeRead && (msg.isRead || readIds.includes(String(msg.id)))) return false;
        
        if (type !== 'user') {
            const userCreatedTime = this._parseSafeTime(user.createdAt);
            const alertTime = this._parseSafeTime(msg.createdAt || msg.time || msg.timestamp);
            if (userCreatedTime > 0 && alertTime > 0 && alertTime < userCreatedTime) return false;
        }
        return true;
    },

    getUnreadAlerts: function() {
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
        return [...(LiveStoreData.alerts || []), ...(LiveStoreData.userNotifications || [])]
            .filter(msg => this._isAlertForUser(msg, this.user, this.getNow(), [], false))
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
            if (readIds.length > 50) readIds.splice(0, readIds.length - 50);
            localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(readIds));
            if (this.user?.uid) this.updateUserProfile({ readAlerts: readIds }).catch(()=>{});
        }

        const localNotif = LiveStoreData.userNotifications?.find(n => String(n.id) === String(msgId));
        if (localNotif) localNotif.isRead = true;
        if (window.UIManager?.updateNotifBadges) window.UIManager.updateNotifBadges();
        
        if (this.user?.uid && localNotif) {
            try { await StoreDB.set(`telecard_users/${this.user.uid}/notifications`, msgId, { isRead: true }, { merge: true }); } 
            catch (e) { }
        }
    },

    // 🛡️ التحديث 3: تحسين الأداء عبر تقليل الكتابة المتكررة
    markAllNotificationsRead: async function() {
        const allAlerts = this.getAllUserAlerts();
        if (!allAlerts.length) return;
        
        const readIds = this._getSafeReadIds();
        
        for (const msg of allAlerts.slice(0, 50)) {
            if (!readIds.includes(String(msg.id))) readIds.push(String(msg.id));
            if (msg.type === 'popup' || msg.isPopup) {
                const viewKey = `alert_views_${msg.id}`;
                const maxV = (msg.maxViews || 99).toString();
                if (localStorage.getItem(viewKey) !== maxV) {
                    localStorage.setItem(viewKey, maxV);
                }
            }
            msg.isRead = true;
            const localNotif = LiveStoreData.userNotifications?.find(n => String(n.id) === String(msg.id));
            if (localNotif) localNotif.isRead = true;
        }
        
        const cappedReadIds = readIds.slice(-50);
        localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(cappedReadIds));
        
        if (window.UIManager?.updateNotifBadges) window.UIManager.updateNotifBadges();
        if (window.RenderManager?.renderNotifCenterList) window.RenderManager.renderNotifCenterList();
        
        if (this.user?.uid) {
            this.updateUserProfile({ readAlerts: cappedReadIds }).catch(() => {
                console.warn("[DataManager] فشل مزامنة الإشعارات، تم حفظها محلياً.");
            });
        }
    },
    
    sendPasswordResetEmail: async function(email) { return email ? await StoreDB.sendResetEmail(email) : { success: false, msg: 'بريد مفقود.' }; },

    // 🛡️ التحديث 5: بصمة محلية لتفادي أخطاء الـ CDN
    injectSilentSensor: async function() {
        if (!this.user?.uid) return;
        try {
            let hash = null;
            if (window.FingerprintJS) { 
                const loadedFp = await window.FingerprintJS.load();
                hash = (await loadedFp.get()).visitorId;
            } else {
                const rawPrint = navigator.userAgent + navigator.language + screen.width + screen.height;
                hash = await this._generateHashFallback(rawPrint);
            }
            
            if (hash) {
                let devices = Array.isArray(this.user.devicePrints) ? [...this.user.devicePrints] : [];
                if (!devices.includes(hash)) {
                    devices.push(hash);
                    if (devices.length > 10) devices = devices.slice(-10);
                    this.user.devicePrints = devices;
                    this.saveUserLocal();
                    StoreDB.set(DB_KEYS.USERS, this.user.uid, { devicePrints: devices }, { merge: true }).catch(() => {});
                }
            }
        } catch (e) { }
    },

    _generateHashFallback: async function(str) {
        try {
            const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
        } catch(e) { return "fallback-" + Date.now(); }
    },
    
    generateTOTPSecret: async function() { return await StoreDB.generateTOTPSecret(); },
    enrollTOTP: async function(secret, code) { return await StoreDB.enrollTOTP(secret, code); },
    unenrollMFA: async function() { return await StoreDB.unenrollMFA(); },
    is2FAEnabled: function() { return auth?.currentUser?.multiFactor?.enrolledFactors?.length > 0; }
};

Object.defineProperty(DataManager, 'enforceIpBan', { configurable: false, writable: false });
