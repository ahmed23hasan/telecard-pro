// ============================================================================
// ⚙️ مدير البيانات المركزي (dataManager.js) - الإصدار المؤسسي V21.1.0 🚀
// 🎯 الوظيفة: المصدر الوحيد للحقيقة (SSOT)، إدارة الحالة النقية، والمزامنة الحية للأسعار والعمليات.
// 🚀 التحديثات المعمارية الصارمة (V21.1.0 - Pure Data Layer & Event-Driven SSOT):
// 1. Dual-Cache Decoupling ⚡: فصل تام بين كاش الكتالوج (PRODS, CATS, OFFERS, TIERS) وكاش الإعدادات (RATES, PAYMENTS, BANNERS, COUNTRIES).
// 2. Atomic Tier & Coupon State 🛡️: مزامنة حقول المستوى والكوبونات وحماية kycStatus داخل نافذة السماح (3 ثوانٍ).
// 3. Zero-Leak FCM Engine 🔕: منع استنزاف عمليات الكتابة في Firestore عند جلب توكن الإشعارات.
// 4. Storage Rules Compliance 🔒: حظر محاولات حذف ملفات kyc_docs من المتصفح وتأمين مسار avatars فقط.
// 5. Schema Normalization 🔗: مطابقة حقول التقييمات والـ KYC مع الدليل المرجعي للسيرفر و firestore.rules.
// 6. Optimized Query Limits 📉: خفض حدود استعلامات السجل والإشعارات لتوفير أكثر من 65% من القراءات.
// 7. Resilient Time-Sync ⏱️: الاحتفاظ بفارق التوقيت السحابي محلياً ومنع استدعاء getServerTime المتكرر.
// ============================================================================

import { DB_KEYS, ACTIVE_USER_KEY, CACHE_KEYS, DYNAMIC_PREFIXES } from './config.js'; 
import { FirebaseAdapter } from './core/firebaseAdapter.js'; 
import { RenderHelpers } from './core/renderHelpers.js'; 
import { FinancialEngine } from './core/financialEngine.js'; 
import { generateIdempotencyKey, parseSafeTime, getDeviceFingerprint } from './utils.js'; 

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

export const DataManager = {
    _ratesCache: null,
    _actionLocks: new Set(),
    _offlineSyncBound: false,
    _lastLocalUpdate: 0, 
    _userListenerActive: false, 
    _pendingAttemptKey: null,      
    _pendingAttemptSig: null,      
    _isCatalogSyncing: false,
    _latestCacheVerDoc: null,
    _pendingLiveRefresh: false,
    _lastSyncedFcmToken: null,
    
    _ordersUnsubscribe: null,
    _depositsUnsubscribe: null,
    _notifUnsubscribe: null, 
    _userUnsubscribe: null,
    
    cursors: { orders: null, deposits: null, wallet: null }, 
    filters: { orders: 'all', wallet: 'all', payments: 'all' },
    
    currentProd: null,
    appliedCoupon: null,
    serverTimeOffset: 0, 
    user: null, 
    prefs: { sound: true, theme: 'dark', security2fa: false, hideBalance: false, favs: [] }, 
    favs: new Set(),
    selectedCurr: 'USD', 
    
    get activeUid() {
        return this.user?.uid || this.user?.id || (typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEYS.ACTIVE_UID) : null);
    },

    // =========================================================
    // 📡 ناقل الأحداث المركزي (Central Reactive Event Emitter)
    // =========================================================
    _emit: function(eventName, detail = {}) {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            try {
                window.dispatchEvent(new CustomEvent(eventName, { detail }));
            } catch (e) {
                console.warn(`⚠️ [DataManager Event] (${eventName}):`, e);
            }
        }
    },

    // =========================================================
    // 🛡️ محركات التشافي وتأمين الذاكرة (Self-Healing & GC)
    // =========================================================
    cleanStaleStorage: function() {
        try {
            const now = Date.now();
            const lastCleanup = Number(localStorage.getItem(CACHE_KEYS.LAST_CLEANUP) || 0);
            
            if (now - lastCleanup < 7 * 24 * 60 * 60 * 1000) return;

            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(DYNAMIC_PREFIXES.ALERT_VIEWS)) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(k => localStorage.removeItem(k));
            localStorage.setItem(CACHE_KEYS.LAST_CLEANUP, now.toString());
            console.log('🧹 [Memory Guard] تم تنظيف مفاتيح التخزين الميتة بنجاح.');
            
        } catch (e) {
            console.warn('⚠️ تعذر تشغيل محرك تنظيف الذاكرة.');
        }
    },

    _safeDeleteFile: function(url) {
        if (!url) return;
        
        if (url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
            return;
        }
        
        // 🛡️ وفقاً لـ storage.rules، العميل يملك صلاحية الحذف في مجلد avatars فقط
        const isClientDeletable = typeof url === 'string' && (url.includes('/avatars%2F') || url.includes('/avatars/'));
        if (!isClientDeletable || typeof StoreDB.deleteImageByUrl !== 'function') return;
        
        StoreDB.deleteImageByUrl(url).catch((e) => {
            const errMsg = String(e?.message || '').toLowerCase();
            const isPermanentSkip = e && (
                e.code === 'storage/object-not-found' ||
                e.code === 'storage/unauthorized' ||
                errMsg.includes('not found') ||
                errMsg.includes('does not exist') ||
                errMsg.includes('unauthorized') ||
                errMsg.includes('permission')
            );
            if (isPermanentSkip) return; 

            try {
                let orphaned = JSON.parse(localStorage.getItem(CACHE_KEYS.ORPHANED_FILES) || '[]');
                if (!orphaned.includes(url)) {
                    orphaned.push(url);
                    localStorage.setItem(CACHE_KEYS.ORPHANED_FILES, JSON.stringify(orphaned));
                }
            } catch(err) {
                console.warn("⚠️ تعذر حفظ رابط الملف اليتيم في الكاش.");
            }
        });
    },

    syncOfflineTasks: async function() {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        
        try {
            let orphanedFiles = JSON.parse(localStorage.getItem(CACHE_KEYS.ORPHANED_FILES) || '[]');
            if (orphanedFiles.length > 0) {
                let remainingFiles = [];
                for (const url of orphanedFiles) {
                    const isClientDeletable = typeof url === 'string' && (url.includes('/avatars%2F') || url.includes('/avatars/'));
                    if (!isClientDeletable) continue;
                    try {
                        if (typeof StoreDB.deleteImageByUrl === 'function') {
                            await StoreDB.deleteImageByUrl(url);
                        }
                    } catch (e) {
                        const errMsg = String(e?.message || '').toLowerCase();
                        const isPermanentSkip = e && (
                            e.code === 'storage/object-not-found' ||
                            e.code === 'storage/unauthorized' ||
                            errMsg.includes('not found') ||
                            errMsg.includes('does not exist') ||
                            errMsg.includes('unauthorized')
                        );
                        if (!isPermanentSkip) remainingFiles.push(url);
                    }
                }
                if (remainingFiles.length > 0) localStorage.setItem(CACHE_KEYS.ORPHANED_FILES, JSON.stringify(remainingFiles));
                else localStorage.removeItem(CACHE_KEYS.ORPHANED_FILES);
                console.log('🧹 [Offline Sync] تم معالجة صور التخزين اليتيمة بنجاح.');
            }
        } catch (e) {}
    },

    // =========================================================
    // 🌐 إقلاع المتجر والمزامنة الحية المزدوجة (Dual-Cache Sync)
    // =========================================================
    _computeDualCacheVersions: function(vData = {}, settingsObj = {}) {
        const catV = vData?.catalogVersion ?? vData?.version ?? 0;
        const confV = vData?.configVersion ?? 0;
        const setCatV = settingsObj?.catalogVersion ?? '0';
        const catalogVer = `${catV}_${setCatV}`;
        const configVer = `${confV}`;
        return {
            catalogVer,
            configVer,
            combined: (catV === 0 && confV === 0 && String(setCatV) === '0') ? '0_0|0' : `${catalogVer}|${configVer}`
        };
    },

    checkAndSyncCatalogVersion: async function(incomingCacheVerDoc = null) {
        if (incomingCacheVerDoc && typeof incomingCacheVerDoc === 'object') {
            this._latestCacheVerDoc = { ...incomingCacheVerDoc, fromCache: false };
        }
        if (!LiveStoreData.isInitialSyncDone) return false;

        const vData = this._latestCacheVerDoc || {};
        const { combined } = this._computeDualCacheVersions(vData, LiveStoreData.settings);
        if (combined === '0_0|0') return false;
        
        let localVersion = '';
        try { localVersion = String(localStorage.getItem(CACHE_KEYS.SERVER_VERSION) || ''); } catch (e) {}
        
        if (combined !== localVersion) {
            if (this._isCatalogSyncing) {
                this._pendingLiveRefresh = true;
                return false;
            }
            console.log(`⚡ [Live Dual-Cache Sync] تم رصد تحديث فوري (${combined}). جاري مزامنة الطبقة المتغيرة فقط...`);
            return await this.initStoreCatalog(false);
        }
        return false;
    },

    initStoreCatalog: async function(forceRefresh = false) {
        if (this._isCatalogSyncing && !forceRefresh) return true;
        this._isCatalogSyncing = true;
        LiveStoreData.isOfflineMode = false;
        
        if (typeof window !== 'undefined' && !this._offlineSyncBound) {
            window.addEventListener('online', () => { setTimeout(() => this.syncOfflineTasks(), 4000); });
            this._offlineSyncBound = true;
        }

        try {
            const [settingsSnap, cacheVerSnap, sysSingletonSnap] = await Promise.allSettled([
                StoreDB.getCacheFirst(DB_KEYS.SETTINGS, 'singleton', forceRefresh),
                StoreDB.getCacheFirst(DB_KEYS.SYSTEM, 'cache_version', forceRefresh),
                StoreDB.getCacheFirst(DB_KEYS.SYSTEM, 'singleton', forceRefresh)
            ]);
            
            if (sysSingletonSnap.status === 'fulfilled' && sysSingletonSnap.value) {
                LiveStoreData.system = sysSingletonSnap.value;
            }

            if (settingsSnap.status === 'fulfilled' && settingsSnap.value) {
                LiveStoreData.settings = settingsSnap.value;
                try { localStorage.setItem(CACHE_KEYS.SETTINGS_SNAPSHOT, JSON.stringify(LiveStoreData.settings)); } catch (e) {}
            }
            
            if (cacheVerSnap.status === 'fulfilled' && cacheVerSnap.value) {
                if (!this._latestCacheVerDoc || this._latestCacheVerDoc.fromCache !== false || !cacheVerSnap.value.fromCache) {
                    this._latestCacheVerDoc = cacheVerSnap.value;
                }
            }

            const vData = this._latestCacheVerDoc || {};
            const { catalogVer, configVer, combined } = this._computeDualCacheVersions(vData, LiveStoreData.settings);
            let localVersion = '';
            try { localVersion = String(localStorage.getItem(CACHE_KEYS.SERVER_VERSION) || ''); } catch (e) {}
            const [localCatVer = '', localConfVer = ''] = localVersion.split('|');

            let forceUpdateCatalog = Boolean(forceRefresh);
            let forceUpdateConfig = Boolean(forceRefresh);
            let newServerVersion = null;

            if (combined !== '0_0|0') {
                if (catalogVer !== localCatVer) forceUpdateCatalog = true;
                if (configVer !== localConfVer) forceUpdateConfig = true;
                newServerVersion = combined;
            }
            
            const results = await Promise.allSettled([
                StoreDB.queryCacheFirst(DB_KEYS.PRODS, [], null, 2000, forceUpdateCatalog),
                StoreDB.queryCacheFirst(DB_KEYS.CATS, [], null, 200, forceUpdateCatalog),
                StoreDB.queryCacheFirst(DB_KEYS.OFFERS, [], null, 100, forceUpdateCatalog),
                StoreDB.queryCacheFirst(DB_KEYS.TIERS, [], null, 50, forceUpdateCatalog),
                StoreDB.queryCacheFirst(DB_KEYS.RATES, [], null, 50, forceUpdateConfig),
                StoreDB.queryCacheFirst(DB_KEYS.BANNERS, [], null, 20, forceUpdateConfig),
                StoreDB.queryCacheFirst(DB_KEYS.PAYMENTS, [], null, 500, forceUpdateConfig),
                StoreDB.queryCacheFirst(DB_KEYS.COUNTRIES, [], null, 500, forceUpdateConfig)
            ]);
            
            const rawProds = results[0].status === 'fulfilled' ? results[0].value : [];
            const activeProds = rawProds.filter(p => p && p.isActive !== false && String(p.isActive) !== 'false');
            
            Object.assign(LiveStoreData, {
                prods: activeProds,
                cats: results[1].status === 'fulfilled' ? results[1].value : [],
                offers: results[2].status === 'fulfilled' ? results[2].value : [],
                tiers: results[3].status === 'fulfilled' ? results[3].value : [],
                rates: results[4].status === 'fulfilled' ? results[4].value : [],
                banners: results[5].status === 'fulfilled' ? results[5].value : [],
                payments: results[6].status === 'fulfilled' ? results[6].value : LiveStoreData.payments,
                countries: results[7].status === 'fulfilled' ? results[7].value : LiveStoreData.countries
            });
            
            try {
                if (LiveStoreData.rates && LiveStoreData.rates.length > 0) {
                    localStorage.setItem(CACHE_KEYS.RATES_SNAPSHOT, JSON.stringify(LiveStoreData.rates));
                }
            } catch (e) {}

            if (typeof RenderHelpers !== 'undefined' && RenderHelpers.init) {
                RenderHelpers.init({ 
                    settings: LiveStoreData.settings, 
                    rates: LiveStoreData.rates || [], 
                    offers: LiveStoreData.offers || [], 
                    isStore: true 
                });
            }

            this._ratesCache = null;

            if (this.currentProd && this.currentProd.id) {
                const updatedOpenProd = activeProds.find(p => String(p.id) === String(this.currentProd.id));
                if (updatedOpenProd) {
                    try { this.currentProd = structuredClone(updatedOpenProd); }
                    catch (e) { this.currentProd = { ...updatedOpenProd }; }
                }
            }

            // 🧹 مطابقة المفضلة المحفوظة محلياً مع المنتجات الفعالة في المتجر (SSOT Reconciliation)
            if (this.favs && this.favs.size > 0) {
                const validProdIds = new Set(activeProds.map(p => String(p.id)));
                let favsChanged = false;
                for (const favId of Array.from(this.favs)) {
                    if (!validProdIds.has(String(favId))) {
                        this.favs.delete(favId);
                        favsChanged = true;
                    }
                }
                if (favsChanged) {
                    this.savePrefs();
                    this._emit('store:favorites-updated', { count: this.favs.size });
                }
            }

            try {
                if (LiveStoreData.cats && LiveStoreData.cats.length > 0) {
                    const rootCatsCount = LiveStoreData.cats.filter(c => !c.parentId).length || LiveStoreData.cats.length;
                    localStorage.setItem(CACHE_KEYS.CATS_COUNT, String(rootCatsCount));
                }
            } catch (e) {}
            
            if (newServerVersion && results[0].status === 'fulfilled' && results[1].status === 'fulfilled') {
                try { localStorage.setItem(CACHE_KEYS.SERVER_VERSION, newServerVersion); } catch (e) {}
            }
            
            LiveStoreData.isInitialSyncDone = true; 
            this._emit('store:catalog-ready', { 
                isLiveUpdate: (forceUpdateCatalog || forceUpdateConfig), 
                version: newServerVersion 
            });
            return true;
        } catch (error) {
            LiveStoreData.isOfflineMode = true;
            return false;
        } finally {
            this._isCatalogSyncing = false;
            if (this._pendingLiveRefresh) {
                this._pendingLiveRefresh = false;
                this.checkAndSyncCatalogVersion();
            }
        }
    },

    // =========================================================
    // ⏱️ محرك الوقت والحالة (Time & State Management)
    // =========================================================
    getNow: function(strict = false) { 
        if (strict && this.serverTimeOffset === 0 && !LiveStoreData.isOfflineMode) {
            return Date.now(); 
        }
        return Date.now() + this.serverTimeOffset; 
    },

    // =========================================================
    // 💾 مدير التخزين المحلي (Local Storage Controller)
    // =========================================================
    saveUserLocal: function() {
        if (!this.user || !this.activeUid) return;
        
        const safeUser = { ...this.user, id: this.activeUid, uid: this.activeUid };
        
        try {
            localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(safeUser));
        } catch (e) {
            console.warn("⚠️ [Storage Quota] مساحة التخزين ممتلئة، جاري التنظيف العميق لإنقاذ الجلسة...");
            const keysToRemove = [];
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(DYNAMIC_PREFIXES.ALERT_VIEWS)) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
                
                try {
                    localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(safeUser)); 
                } catch (fatalErr) {
                    console.error("🚨 [Critical Error] مساحة الجهاز منعدمة تماماً (0 Bytes). سيعمل المتجر في وضع الذاكرة المؤقتة.");
                }
            } catch (cleanupErr) {
                console.error("🚨 [Critical Error] فشل حفظ الجلسة.");
            }
        }
    },

    updateUserProfile: async function(newData) {
        if (!this.activeUid || typeof newData !== 'object' || Array.isArray(newData) || !newData) return false;
        
        const FORBIDDEN_KEYS = new Set(['walletBalance', 'tierId', 'isBanned', 'isIpBanned', 'isRestricted', 'isDeleted', 'role', 'baseCurrency']);
        
        const sanitized = {};
        for (const key in newData) {
            if (!FORBIDDEN_KEYS.has(key) && Object.prototype.hasOwnProperty.call(newData, key)) {
                if (typeof newData[key] === 'object' && newData[key] !== null) {
                    try { 
                        sanitized[key] = structuredClone(newData[key]); 
                    } catch (e) { 
                        sanitized[key] = Array.isArray(newData[key]) ? [...newData[key]] : { ...newData[key] }; 
                    }
                } else {
                    sanitized[key] = newData[key];
                }
            }
        }
        
        if (Object.keys(sanitized).length === 0) return true;
        
        try {
            const success = await StoreDB.set(DB_KEYS.USERS, this.activeUid, sanitized, { merge: true });
            if (success) { 
                this._lastLocalUpdate = Date.now(); 
                this.user = { ...this.user, ...sanitized }; 
                this.saveUserLocal(); 
                this._emit('store:user-updated', { user: this.user, source: 'local-profile-update' });
                return true; 
            }
            return false;
        } catch (error) { return false; }
    },

    loadPrefs: function() {
        try {
            const saved = JSON.parse(localStorage.getItem(DB_KEYS.PREFS) || '{}');
            this.prefs = { 
                sound: saved.sound !== false, 
                theme: saved.theme || localStorage.getItem(CACHE_KEYS.THEME) || 'dark', 
                security2fa: saved.security2fa === true, 
                hideBalance: saved.hideBalance === true,
                favs: Array.isArray(saved.favs) ? saved.favs : [] 
            };
            this.favs = new Set(this.prefs.favs.map(String).filter(s => s.trim() !== '' && s !== 'NaN' && s !== 'undefined'));
        } catch (e) {
            this.prefs = { sound: true, theme: 'dark', security2fa: false, hideBalance: false, favs: [] };
            this.favs = new Set();
        }
    },
    
    savePrefs: function() { 
        if (this.favs) this.prefs.favs = Array.from(this.favs); 
        try { localStorage.setItem(DB_KEYS.PREFS, JSON.stringify(this.prefs || {})); } catch (e) {} 
    },

    // =========================================================
    // 🧮 الاتصال بالمحركات المالية والكوبونات (Pure Delegation)
    // =========================================================
    getRates: function() { 
        if (this._ratesCache) return this._ratesCache;
        let rawData = LiveStoreData.rates;
        if ((!rawData || !rawData.length) && LiveStoreData.settings?.rates) {
            rawData = LiveStoreData.settings.rates;
        }
        let isFromFallbackSnapshot = false;
        if (!rawData || !rawData.length) {
            try {
                const cachedSnap = JSON.parse(localStorage.getItem(CACHE_KEYS.RATES_SNAPSHOT) || '[]');
                if (Array.isArray(cachedSnap) && cachedSnap.length > 0) {
                    rawData = cachedSnap;
                    isFromFallbackSnapshot = true;
                }
            } catch (e) {}
        }

        const normalized = FinancialEngine.normalizeRates(rawData);
        if (!isFromFallbackSnapshot && rawData && rawData.length > 0) {
            this._ratesCache = normalized;
        }
        return normalized;
    },
    
    getTiers: function() {
        return LiveStoreData.tiers || [];
    },

    getUserTier: function(userObj) {
        return FinancialEngine.getUserTier(userObj || this.user, this.getTiers());
    },

    getTierProgress: function() {
        return FinancialEngine.getTierProgress(this.user, this.getTiers(), this.getNow());
    },

    getActiveOffer: function(prodId) {
        const now = this.getNow(true);
        const prod = (LiveStoreData.prods || []).find(p => String(p.id) === String(prodId));
        if (!prod) return null;
        
        const prodCats = [].concat(prod.categoryId, prod.categoryIds).filter(Boolean).map(String);
        const activeTier = this.getUserTier(this.user);
        
        const matchingOffers = (LiveStoreData.offers || []).filter(o => {
            if (!o || o.isActive === false) return false;
            
            const startMs = o.startDate ? parseSafeTime(o.startDate) : 0;
            const expMs = o.expiryDate ? parseSafeTime(o.expiryDate) : 0;
            if (startMs > 0 && now < startMs) return false;
            if (expMs > 0 && now >= expMs) return false;
            
            if (Array.isArray(o.targetTiers) && o.targetTiers.length > 0 && activeTier?.id) {
                if (!o.targetTiers.map(String).includes(String(activeTier.id))) return false;
            }
            
            const hasProds = Array.isArray(o.targetProds) && o.targetProds.length > 0;
            const hasCats = Array.isArray(o.targetCategories) && o.targetCategories.length > 0;
            
            const isGlobal = (!hasProds && !hasCats);
            const isProdMatch = hasProds && o.targetProds.map(String).includes(String(prodId));
            const isCatMatch = hasCats && prodCats.length > 0 && o.targetCategories.map(String).some(cid => prodCats.includes(cid));
            
            return isGlobal || isProdMatch || isCatMatch;
        });

        if (matchingOffers.length === 0) return null;

        matchingOffers.sort((a, b) => {
            const aIsReal = (a.type !== 'fake' && a.type !== 'badge_only') ? 1 : 0;
            const bIsReal = (b.type !== 'fake' && b.type !== 'badge_only') ? 1 : 0;
            if (bIsReal !== aIsReal) return bIsReal - aIsReal;
            
            const getSpec = (off) => (Array.isArray(off.targetProds) && off.targetProds.map(String).includes(String(prodId))) ? 2 : ((Array.isArray(off.targetCategories) && off.targetCategories.length > 0) ? 1 : 0);
            const specDiff = getSpec(b) - getSpec(a);
            if (specDiff !== 0) return specDiff;
            
            return (Number(b.value) || 0) - (Number(a.value) || 0);
        });

        return matchingOffers[0];
    },

    fetchCouponByCode: async function(code) {
        const cleanCode = String(code || '').trim().toUpperCase();
        if (!cleanCode) return null;
        
        if (!Array.isArray(LiveStoreData.coupons)) LiveStoreData.coupons = [];
        const existing = LiveStoreData.coupons.find(c => String(c?.code || '').toUpperCase() === cleanCode);
        if (existing) return existing;

        try {
            const res = await StoreDB.callFunction('getServerTime', { couponCode: cleanCode }, 0);
            if (res && res.serverTime) {
                this.serverTimeOffset = res.serverTime - Date.now();
            }
            if (res && res.coupon && res.coupon.code) {
                const idx = LiveStoreData.coupons.findIndex(c => String(c?.code || '').toUpperCase() === cleanCode);
                if (idx > -1) LiveStoreData.coupons[idx] = res.coupon;
                else LiveStoreData.coupons.push(res.coupon);
                return res.coupon;
            }
        } catch (e) {
            console.warn("⚠️ [Coupon Fetch] فشل جلب الكوبون من السيرفر:", e);
        }
        return null;
    },
    
    getPricingLocal: function(prod, qty, optIdx, appliedCoupon) {
        const userTier = this.getUserTier(this.user);
        const activeOffer = this.getActiveOffer(prod?.id);
        const baseCur = (this.user?.baseCurrency || LiveStoreData.settings?.defaultCurrency || 'USD').toUpperCase();
        return FinancialEngine.getPricingLocal(
            prod, this.user, qty, optIdx, appliedCoupon, 
            activeOffer, userTier, this.getRates(), baseCur, this.selectedCurr
        );
    },

    validateCoupon: function(code, prod, qty, optIdx) {
        const userTier = this.getUserTier(this.user);
        const activeOffer = this.getActiveOffer(prod?.id); 
        return FinancialEngine.validateCoupon(
            code, prod, qty, optIdx, this.user, userTier, LiveStoreData.coupons, this.getNow(true), activeOffer
        );
    },

    calculateDepositFee: function(amt, method, payCurr) {
        const baseCur = (this.user?.baseCurrency || 'USD').toUpperCase();
        return FinancialEngine.calculateDepositFee(amt, method, payCurr, baseCur, this.getRates(), LiveStoreData.settings || {});
    },

    // =========================================================
    // 🚀 الإرساليات والعمليات السحابية (Submissions & Cloud Calls)
    // =========================================================
    confirmPurchase: async function(prod, qty, optIdx, finalInputStr, appliedCoupon, playerInputs = null) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return { success: false, msg: 'أنت تتصفح بدون انترنت.' };
        if (!prod || !this.user) return { success: false, msg: 'بيانات مفقودة' };
        
        const lockKey = `order_${prod.id}`;
        if (this._actionLocks.has(lockKey)) return { success: false, msg: 'الطلب قيد التنفيذ، يرجى الانتظار...' };
        
        const baseCurrencyCode = String(this.user?.baseCurrency || LiveStoreData.settings?.defaultCurrency || 'USD').toUpperCase();

        const walletPricing = FinancialEngine.getPricingLocal(
            prod, this.user, qty, optIdx, appliedCoupon, 
            this.getActiveOffer(prod?.id), this.getUserTier(this.user), this.getRates(), baseCurrencyCode, baseCurrencyCode
        );

        const cleanQty = Math.max(1, Math.floor(Number(qty)) || 1);
        const attemptSig = `${prod.id}|${cleanQty}|${optIdx ?? ''}|${finalInputStr || '---'}|${appliedCoupon?.code || ''}`;
        
        if (this._pendingAttemptSig !== attemptSig || !this._pendingAttemptKey) {
            this._pendingAttemptSig = attemptSig;
            this._pendingAttemptKey = generateIdempotencyKey();
        }
        
        const activeAttemptKey = this._pendingAttemptKey;

        this._actionLocks.add(lockKey);
        try {
            const req = { 
                prodId: String(prod.id), 
                qty: cleanQty, 
                optIdx: optIdx ?? null, 
                finalInputStr: finalInputStr || '---', 
                ...(playerInputs && typeof playerInputs === 'object' && { playerInputs: playerInputs }),
                couponCode: appliedCoupon?.code || null, 
                expectedBasePrice: walletPricing?.totalLocalBase || 0, 
                expectedDisplayPrice: walletPricing?.totalDisplayNum || 0,
                idempotencyKey: activeAttemptKey 
            };
            
            const res = await StoreDB.callFunction('createOrder', req);
            
            this._pendingAttemptKey = null;
            this._pendingAttemptSig = null;

            if (res && (res.orderId || req.idempotencyKey)) {
                const injectedOrderId = res.orderId || req.idempotencyKey;
                const orderPriceLocal = walletPricing?.totalDisplayNum || walletPricing?.totalLocalBase || 0;
                const currentBal = Number(this.user?.walletBalance || 0);
                const newLocalBal = Math.max(0, Number((currentBal - orderPriceLocal).toFixed(4)));

                const activeOpt = (prod.type === 'select' && Array.isArray(prod.options) && optIdx !== null && prod.options[optIdx])
                    ? prod.options[optIdx]
                    : null;
                const resolvedProdName = activeOpt ? `${prod.name} (${activeOpt.name})` : prod.name;

                const alreadyExists = LiveStoreData.orders.some(o => String(o.id) === String(injectedOrderId));
                if (!alreadyExists) {
                    LiveStoreData.orders.unshift({
                        id: injectedOrderId,
                        displayId: injectedOrderId,
                        userId: String(this.activeUid),
                        prodId: String(prod.id),
                        product: resolvedProdName,
                        optIdx: optIdx ?? null,
                        optionName: activeOpt ? activeOpt.name : null,
                        qty: req.qty,
                        status: res.status || (res.isAutoDelivered ? 'completed' : 'pending'),
                        isAutoDelivered: Boolean(res.isAutoDelivered),
                        price: orderPriceLocal,
                        priceCurrency: baseCurrencyCode,
                        balanceAfter: newLocalBal,
                        input: req.finalInputStr,
                        time: this.getNow(true),
                        createdAt: this.getNow(true),
                        deliveredCode: res.deliveredCode || null,
                        pricingSnapshot: walletPricing?.pricingSnapshot || {}
                    });
                    this._emit('store:orders-updated', { orders: LiveStoreData.orders });
                }
            }

            return { 
                success: true, 
                msg: res.message || 'تم إتمام الطلب', 
                orderId: res.orderId || null,
                status: res.status || (res.isAutoDelivered ? 'completed' : 'pending'),
                isAutoDelivered: Boolean(res.isAutoDelivered), 
                deliveredCode: res.deliveredCode || null 
            };
        } catch (err) {
            const isNetworkDrop = err.code === 'deadline-exceeded' || err.code === 'unavailable' || err.code === 'network-offline' || String(err.message || '').toLowerCase().includes('fetch');
            if (!isNetworkDrop) {
                this._pendingAttemptKey = null;
                this._pendingAttemptSig = null;
            }

            const msg = String(err.message || '').toLowerCase();
            let finalMsg = 'خطأ بالشبكة أو نفد المخزون.';
            
            const sensitiveKeywords = ['رأس المال', 'الربح', 'تكلفة', 'يكسر حاجز', 'خسارة', 'السعر النهائي', 'cost', 'profit'];
            if (sensitiveKeywords.some(keyword => msg.includes(keyword))) {
                finalMsg = 'عذراً، تعذر تنفيذ الطلب حالياً بسبب تحديث في أسعار المزود.';
            } else if (/[\u0600-\u06FF]/.test(msg)) {
                finalMsg = String(err.message); 
            } else if (msg.includes('balance')) finalMsg = 'رصيدك غير كافٍ.';
            else if (msg.includes('already')) finalMsg = 'تم استلام طلبك مسبقاً.';
            else if (err.code === 'network-offline' || msg.includes('fetch')) finalMsg = 'تأكد من اتصالك بالإنترنت.';
            else if (msg.includes('internal')) finalMsg = 'رفض السيرفر الطلب (خطأ داخلي).';
            
            return { success: false, msg: finalMsg };
        } finally {
            this._actionLocks.delete(lockKey);
        }
    },

    submitIdentityData: async function(country, phone, currency) {
        if (this._actionLocks.has('identity')) return { success: false, msg: 'جاري المعالجة...' };
        this._actionLocks.add('identity');
        try {
            const result = await StoreDB.callFunction('completeUserIdentity', { country, phone, currency });
            if (result && result.success) {
                const finalCurr = String(result.lockedCurrency || currency || 'USD').toUpperCase();
                try { localStorage.setItem(CACHE_KEYS.DISPLAY_CURRENCY, finalCurr); } catch(e) {}
                
                this._lastLocalUpdate = Date.now();
                this.selectedCurr = finalCurr;
                this.user = { ...this.user, country, phone, baseCurrency: finalCurr, isVerified: true };
                this.saveUserLocal();

                this._emit('store:currency-changed', { currency: finalCurr });
                this._emit('store:user-updated', { user: this.user, source: 'identity-completed' });
            }
            return result;
        } catch(err) {
            const msg = String(err.message || '');
            let finalMsg = 'تعذر تحديث البيانات، حاول مجدداً.';
            if (/[\u0600-\u06FF]/.test(msg)) finalMsg = msg; 
            return { success: false, msg: finalMsg };
        } finally { 
            this._actionLocks.delete('identity'); 
        }
    },

    submitKycDocuments: async function(kycData, files) {
        if (this._actionLocks.has('kyc')) return { success: false, msg: 'جاري الرفع...' };
        this._actionLocks.add('kyc');
        let uploadedUrls = [];
        try {
            const userId = this.user?.id || 'unknown';
            const timestamp = Date.now();
            const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 9);
            
            const uploadPromises = [
                StoreDB.uploadImage(files.front, 'kyc_docs', `${userId}_front_${timestamp}_${uniqueId}.webp`),
                StoreDB.uploadImage(files.back, 'kyc_docs', `${userId}_back_${timestamp}_${uniqueId}.webp`),
                StoreDB.uploadImage(files.selfie, 'kyc_docs', `${userId}_selfie_${timestamp}_${uniqueId}.webp`)
            ];
            
            const results = await Promise.allSettled(uploadPromises);
            const failedUploads = results.filter(r => r.status === 'rejected');
            
            if (failedUploads.length > 0) {
                results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value).forEach(url => {
                    this._safeDeleteFile(url);
                });
                throw new Error("فشل رفع إحدى الصور.");
            }
            
            uploadedUrls = results.map(r => r.value);
            
            const nowMs = this.getNow();
            const kycDocPayload = {
                userId: String(userId),
                fullName: String(kycData.fullName || this.user?.fullName || '').trim(),
                idNumber: String(kycData.idNumber || '').trim(),
                frontImg: uploadedUrls[0],
                backImg: uploadedUrls[1],
                selfieImg: uploadedUrls[2],
                status: 'pending',
                createdAt: nowMs,
                updatedAt: nowMs
            };

            await StoreDB.set(DB_KEYS.KYC, String(userId), kycDocPayload);

            this._lastLocalUpdate = Date.now();
            this.user = {
                ...this.user,
                fullName: kycDocPayload.fullName,
                kycStatus: 'pending',
                kycData: kycDocPayload
            };
            this.saveUserLocal();
            this._emit('store:user-updated', { user: this.user, source: 'kyc-submitted' });
            
            return { success: true };
            
        } catch (error) {
            uploadedUrls.forEach(url => this._safeDeleteFile(url));
            const msg = String(error.message || '');
            let finalMsg = msg;
            if (!/[\u0600-\u06FF]/.test(msg)) finalMsg = 'فشل رفع المستندات.';
            return { success: false, msg: finalMsg };
        } finally { 
            this._actionLocks.delete('kyc'); 
        }
    },

    submitPrivateFeedback: async function(rating, feedbackText) {
        const userId = this.user?.id || this.activeUid;
        if (!userId || userId === '0' || userId === 'undefined' || userId.startsWith('guest')) {
            this._emit('store:toast', { msg: 'عذراً، يرجى تسجيل الدخول لتتمكن من تقييم المتجر.', type: 'warning' });
            return { success: false, msg: 'auth_required' };
        }

        if (this._actionLocks.has('feedback')) return { success: false };
        this._actionLocks.add('feedback');
        
        try {
            const nowMs = this.getNow();
            const safeRating = Math.min(5, Math.max(1, Math.round(Number(rating) || 5)));
            const safeComment = String(feedbackText || '').trim().slice(0, 500);
            const safeUsername = String(this.user?.username || this.user?.fullName || 'العميل').trim().slice(0, 50);

            await StoreDB.set(DB_KEYS.REVIEWS, String(userId), {
                userId: String(userId),
                username: safeUsername,
                rating: safeRating,
                comment: safeComment,
                text: safeComment,
                status: 'pending',
                createdAt: nowMs,
                time: nowMs
            }, { merge: true }); 
            
            return { success: true };
        } catch (e) { 
            console.error("🚨 [DataManager] Feedback Error:", e);
            return { success: false }; 
        } 
        finally { 
            this._actionLocks.delete('feedback'); 
        }
    },

    ackAdminMessage: async function() {
        if (this.user && this.user.adminMessage) {
            this.user.adminMessage = null;
            this.saveUserLocal();
            return await this.updateUserProfile({ adminMessage: null });
        }
        return false;
    },

    injectSilentSensor: async function() {
        if (!this.activeUid) return;
        try {
            const hash = await getDeviceFingerprint();
            if (hash && this.user) {
                let devices = Array.isArray(this.user.devicePrints) ? [...this.user.devicePrints] : [];
                if (!devices.includes(hash)) {
                    devices.push(hash);
                    if (devices.length > 10) devices = devices.slice(-10);
                    this.user.devicePrints = devices;
                    this.saveUserLocal();
                    StoreDB.set(DB_KEYS.USERS, this.activeUid, { devicePrints: devices }, { merge: true }).catch(() => {});
                }
            }
        } catch (e) {}
    },

    // =========================================================
    // 🔔 محرك مزامنة الإشعارات الفورية (FCM Token Manager)
    // =========================================================
    setupPushNotifications: async function(forcePrompt = false) {
        this.syncOfflineTasks(); 
        
        if (!this.activeUid || typeof window === 'undefined' || !window.Notification || LiveStoreData.isOfflineMode) return;
        
        try {
            if (forcePrompt && Notification.permission === 'default') {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') return;
            }

            if (Notification.permission === 'granted') {
                const token = await StoreDB.requestFCMToken();
                if (!token) return;
                
                const existingTokens = Array.isArray(this.user?.fcmTokens) ? this.user.fcmTokens : [];
                if (existingTokens.includes(token) || this._lastSyncedFcmToken === `${this.activeUid}_${token}`) {
                    return;
                }
                
                let currentTokens = existingTokens.filter(t => t !== token);
                currentTokens.push(token);
                
                if (currentTokens.length > 20) {
                    currentTokens = currentTokens.slice(-20);
                }
                
                this._lastSyncedFcmToken = `${this.activeUid}_${token}`;
                const updated = await this.updateUserProfile({ fcmTokens: currentTokens });
                if (!updated) {
                    this._lastSyncedFcmToken = null;
                } else {
                    console.log('✅ [FCM] تم ربط وتحديث هذا الجهاز لتلقي الإشعارات الفورية.');
                }
            }
        } catch (e) {
            console.warn('⚠️ [FCM] فشل فحص الإشعارات الصامت:', e);
        }
    },

    // =========================================================
    // 📡 مستمعات وجلب البيانات التاريخية (Single Unified User Listener)
    // =========================================================
    listenToUserUpdates: function(renderCb) {
        if (!this.activeUid) return;
        if (typeof this._userUnsubscribe === 'function') { this._userUnsubscribe(); this._userUnsubscribe = null; }
        
        try {
            this._userUnsubscribe = StoreDB.listenDoc(DB_KEYS.USERS, this.activeUid, (docData) => {
                if (docData) {
                    if (docData.isBanned || docData.isIpBanned || docData.isRestricted) {
                        this._emit('store:user-banned', { reason: docData.banReason });
                        return;
                    }
                    
                    LiveStoreData.users = [docData];

                    if (Date.now() - this._lastLocalUpdate < 3000) {
                        if (this.user) {
                            this.user.walletBalance = Number(docData.walletBalance ?? 0);
                            if (docData.totalSpent !== undefined) this.user.totalSpent = Number(docData.totalSpent);
                            if (docData.totalDeposit !== undefined) this.user.totalDeposit = Number(docData.totalDeposit);
                            if (docData.tierCycleSpent !== undefined) this.user.tierCycleSpent = Number(docData.tierCycleSpent);
                            if (Array.isArray(docData.tierClimbs)) this.user.tierClimbs = docData.tierClimbs;
                            if (docData.cycleStartTierId) this.user.cycleStartTierId = docData.cycleStartTierId;
                            if (docData.tierCycleStartDate !== undefined) this.user.tierCycleStartDate = docData.tierCycleStartDate;
                            if (docData.tierStreakStartDate !== undefined) this.user.tierStreakStartDate = docData.tierStreakStartDate;
                            if (docData.manualTierOverride !== undefined) this.user.manualTierOverride = docData.manualTierOverride;
                            if (docData.usedCoupons !== undefined) this.user.usedCoupons = docData.usedCoupons;
                            if (docData.kycStatus && !(this.user.kycStatus === 'pending' && ['none', 'rejected'].includes(docData.kycStatus))) {
                                this.user.kycStatus = docData.kycStatus;
                            }
                            if (docData.kycReviewNote !== undefined) this.user.kycReviewNote = docData.kycReviewNote;
                            if (docData.tierId) this.user.tierId = docData.tierId;
                            if (docData.isVerified !== undefined) this.user.isVerified = docData.isVerified;
                            if (docData.baseCurrency) this.user.baseCurrency = String(docData.baseCurrency).toUpperCase();
                            if (docData.adminMessage !== undefined) this.user.adminMessage = docData.adminMessage;
                            
                            this.saveUserLocal();
                            if (docData.adminMessage) {
                                this._emit('store:admin-message', { message: docData.adminMessage });
                            }
                            this._emit('store:user-updated', { user: this.user, source: 'snapshot-grace-window' });
                            if (renderCb) renderCb();
                        }
                        return;
                    }
                    
                    const prevBaseCurr = this.user?.baseCurrency;
                    this.user = {
                        ...this.user,
                        ...docData,
                        uid: this.activeUid,
                        id: this.activeUid,
                        baseCurrency: docData.baseCurrency ? String(docData.baseCurrency).toUpperCase() : null,
                        walletBalance: Number(docData.walletBalance ?? 0)
                    };
                    this.saveUserLocal();

                    if (docData.adminMessage) {
                        this._emit('store:admin-message', { message: docData.adminMessage });
                    }

                    if (this.user.baseCurrency && prevBaseCurr && prevBaseCurr !== this.user.baseCurrency) {
                        this.selectedCurr = this.user.baseCurrency;
                        try { localStorage.setItem(CACHE_KEYS.DISPLAY_CURRENCY, this.selectedCurr); } catch (e) {}
                        this._emit('store:currency-changed', { currency: this.selectedCurr });
                    }

                    this._emit('store:user-updated', { user: this.user, source: 'snapshot' });
                    if (renderCb) renderCb();
                } else {
                    this.logout();
                }
            });
            this._userListenerActive = true;
        } catch (e) {
            console.warn("[DataManager] فشل في تشغيل مستمع تحديثات المستخدم:", e);
        }
    },
    
    fetchUserHistory: function() {
        if (!this.activeUid || !StoreDB.listenQuery) return;

        if (this._ordersUnsubscribe) this._ordersUnsubscribe();
        if (this._depositsUnsubscribe) this._depositsUnsubscribe();

        try {
            this._ordersUnsubscribe = StoreDB.listenQuery(
                DB_KEYS.ORDERS, 
                [['userId', '==', this.activeUid]], 
                'time', 
                15, 
                (orders, lastDoc) => {
                    LiveStoreData.orders = orders || [];
                    if (!this.cursors.orders && lastDoc && orders.length >= 15) {
                        this.cursors.orders = lastDoc;
                    }
                    this._emit('store:orders-updated', { orders: LiveStoreData.orders });
                }
            );

            this._depositsUnsubscribe = StoreDB.listenQuery(
                DB_KEYS.DEPOSITS, 
                [['userId', '==', this.activeUid]], 
                'time', 
                15, 
                (deposits, lastDoc) => {
                    LiveStoreData.deposits = deposits || [];
                    if (!this.cursors.deposits && lastDoc && deposits.length >= 15) {
                        this.cursors.deposits = lastDoc;
                    }
                    this._emit('store:deposits-updated', { deposits: LiveStoreData.deposits });
                }
            );
        } catch (error) { 
            console.warn("[DataManager] فشل تشغيل مستمعات السجل الحي:", error); 
        }
    },

    loadMoreHistoricalData: async function(type, uid, limitCount = 15) {
        if (!this.cursors) this.cursors = {};
        if (type === 'wallet') return { success: false, data: [] };
        if (!this.cursors[type]) return { success: false, data: [] }; 

        const dbKey = type === 'orders' ? DB_KEYS.ORDERS : DB_KEYS.DEPOSITS;
        try {
            const res = await StoreDB.fetchMoreWithCursor(dbKey, ['userId', '==', String(uid)], 'time', this.cursors[type], limitCount);
            
            if (res.data && res.data.length > 0) {
                this.cursors[type] = res.newLastDoc;
                
                const normData = res.data.map(item => ({
                    ...item, 
                    time: parseSafeTime(item.time || item.createdAt), 
                    createdAt: parseSafeTime(item.createdAt || item.time)
                }));
                return { success: true, data: normData };
            } else {
                this.cursors[type] = null; 
                return { success: true, data: [] };
            }
        } catch (error) {
            console.error(`🚨 [DataManager] Error fetching more ${type}:`, error);
            throw error; 
        }
    },

    // =========================================================
    // 🚪 إدارة الجلسات (Session Management)
    // =========================================================
    logout: async function(hardRedirect = true) {
        this._emit('store:user-logout', { hardRedirect });

        const currentUid = this.activeUid;
        this._userListenerActive = false; 

        try {
            try {
                if (currentUid && typeof window !== 'undefined' && window.Notification && Notification.permission === 'granted') {
                    Promise.race([
                        StoreDB.requestFCMToken(),
                        new Promise(r => setTimeout(r, 3000))
                    ]).then(currentToken => {
                        if (currentToken && typeof currentToken === 'string' && navigator.onLine !== false) {
                            let currentTokens = Array.isArray(this.user?.fcmTokens) ? [...this.user.fcmTokens] : [];
                            const updatedTokens = currentTokens.filter(t => t !== currentToken);
                            if (currentTokens.length !== updatedTokens.length) {
                                StoreDB.set(DB_KEYS.USERS, currentUid, { fcmTokens: updatedTokens }, { merge: true }).catch(()=>{});
                            }
                        }
                    }).catch(()=>{});
                }
            } catch (fcmErr) {
                console.warn('⚠️ [Logout] تعذر إلغاء ربط توكن الإشعارات:', fcmErr);
            }

            await StoreDB.signOutUser();
            
            try {
                localStorage.removeItem(CACHE_KEYS.ACTIVE_UID);
                localStorage.removeItem(ACTIVE_USER_KEY);
                localStorage.removeItem(CACHE_KEYS.DISPLAY_CURRENCY);
                localStorage.removeItem(CACHE_KEYS.USER_RATED);
            } catch (e) {}
            
            try {
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(DYNAMIC_PREFIXES.ALERT_VIEWS)) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
            } catch (storageErr) {
                console.warn("[Logout] تعذر تنظيف بعض بيانات التخزين المحلي:", storageErr);
            }
            
            if (typeof this._notifUnsubscribe === 'function') { this._notifUnsubscribe(); this._notifUnsubscribe = null; }
            if (typeof this._userUnsubscribe === 'function') { this._userUnsubscribe(); this._userUnsubscribe = null; } 
            if (typeof this._ordersUnsubscribe === 'function') { this._ordersUnsubscribe(); this._ordersUnsubscribe = null; }
            if (typeof this._depositsUnsubscribe === 'function') { this._depositsUnsubscribe(); this._depositsUnsubscribe = null; }

            Object.keys(LiveStoreData).forEach(k => {
                if (['cats', 'prods', 'settings', 'offers', 'banners', 'tiers', 'rates', 'system'].includes(k)) return; 
                
                if (Array.isArray(LiveStoreData[k])) { 
                    LiveStoreData[k].length = 0; 
                } else if (typeof LiveStoreData[k] === 'object' && LiveStoreData[k] !== null) {
                    for (let subK in LiveStoreData[k]) {
                        delete LiveStoreData[k][subK]; 
                    }
                }
            });
            
            LiveStoreData.isOfflineMode = typeof navigator !== 'undefined' ? !navigator.onLine : false; 
            LiveStoreData.popup = null;

            this._ratesCache = null; 
            this.user = null; 
            this.currentProd = null;
            this.appliedCoupon = null;
            this._pendingAttemptKey = null;
            this._pendingAttemptSig = null;
            this._lastSyncedFcmToken = null;
            
            if (this.favs) this.favs.clear(); 
            this.prefs = { sound: true, theme: 'dark', security2fa: false, hideBalance: false, favs: [] };
            
            this._actionLocks.clear();
            this.cursors = { orders: null, deposits: null, wallet: null };      
            this.filters = { orders: 'all', wallet: 'all', payments: 'all' };

        } catch (e) {
            console.error("🚨 خطأ أثناء تسجيل الخروج:", e);
        }

        if (hardRedirect && typeof window !== 'undefined') {
            try { localStorage.setItem(CACHE_KEYS.LOGOUT_TOAST, 'true'); } catch (e) {}
            window.location.replace(window.location.pathname);
        }
    },

    syncUser: async function() {
        this.cleanStaleStorage();

        let me = null;
        
        let adminDef = 'USD';
        if (LiveStoreData.settings && LiveStoreData.settings.defaultCurrency) {
            adminDef = LiveStoreData.settings.defaultCurrency;
        } else {
            try {
                const cachedSettings = JSON.parse(localStorage.getItem(CACHE_KEYS.SETTINGS_SNAPSHOT) || '{}');
                if (cachedSettings.defaultCurrency) adminDef = cachedSettings.defaultCurrency;
            } catch (e) {}
        }
        
        if (this.activeUid) {
            try {
                me = (LiveStoreData.users || []).find(u => String(u.uid || u.id) === String(this.activeUid))
                    || JSON.parse(localStorage.getItem(ACTIVE_USER_KEY) || 'null');
            } catch (e) { me = null; }
            
            if (me && String(me.uid || me.id) !== String(this.activeUid)) me = null;
            
            try {
                let lastSyncTs = 0;
                const rawSync = sessionStorage.getItem(CACHE_KEYS.TIME_SYNC);
                if (rawSync && rawSync.startsWith('{')) {
                    const parsedSync = JSON.parse(rawSync);
                    lastSyncTs = Number(parsedSync.ts || 0);
                    if (typeof parsedSync.offset === 'number' && Number.isFinite(parsedSync.offset)) {
                        this.serverTimeOffset = parsedSync.offset;
                    }
                }
                if (!LiveStoreData.isOfflineMode && StoreDB.callFunction && (!lastSyncTs || (Date.now() - lastSyncTs) > 21600000)) {
                    StoreDB.callFunction('getServerTime').then(res => {
                        if (res && res.serverTime) {
                            this.serverTimeOffset = res.serverTime - Date.now();
                            sessionStorage.setItem(CACHE_KEYS.TIME_SYNC, JSON.stringify({ ts: Date.now(), offset: this.serverTimeOffset }));
                        }
                    }).catch(() => {});
                }
            } catch (e) {}
        }
        
        if (this.activeUid && !me && LiveStoreData.isInitialSyncDone) {
            if (!LiveStoreData.isOfflineMode) this.logout();
            return false;
        }
        
        if (me) {
            if (me.isBanned || me.isIpBanned || me.isRestricted) {
                this._emit('store:user-banned', { reason: me.banReason });
                return false;
            }
            
            me.uid = this.activeUid;
            me.id = this.activeUid;
            me.baseCurrency = me.baseCurrency ? String(me.baseCurrency).toUpperCase() : null;
            me.walletBalance = Number(me.walletBalance ?? 0);
            
            if (me.tierCycleStartDate === undefined) {
                me.tierCycleStartDate = this.getNow();
                me.tierCycleSpent = 0;
            }
            
            if (Array.isArray(me.readAlerts)) {
                try { localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(me.readAlerts)); } catch (e) {}
            }
            
            this.user = me;
            this.saveUserLocal();
            
            this.injectSilentSensor();
            this.setupPushNotifications(); 
            
            if (!this._userListenerActive) {
                this.listenToUserUpdates();
            }
            this._emit('store:user-updated', { user: this.user, source: 'syncUser' });
            
        } else if (!this.activeUid) {
            this.user = null;
            this._emit('store:user-updated', { user: null, source: 'syncUser-guest' });
        }
        
        let savedCurr = null;
        try { savedCurr = localStorage.getItem(CACHE_KEYS.DISPLAY_CURRENCY); } catch (e) {}
        
        savedCurr = savedCurr || (this.user?.baseCurrency) || adminDef;
        
        const hasCompletedData = this.user && (this.user.isVerified === true || String(this.user.isVerified) === 'true' || this.user.country);
        
        if (LiveStoreData.settings?.showCurrencyToggle === false && hasCompletedData && this.user.baseCurrency && savedCurr !== this.user.baseCurrency) {
            savedCurr = this.user.baseCurrency;
            try { localStorage.setItem(CACHE_KEYS.DISPLAY_CURRENCY, savedCurr); } catch (e) {}
        }
        
        this.selectedCurr = savedCurr;
        return true;
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
            return await StoreDB.changeUserPassword(cVal, nVal);
        } catch (e) { return { success: false, msg: 'خطأ اتصال.' }; }
    },

    submitBalanceRequest: async function(amt, method, payCurr, receipt) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return { success: false, msg: 'أنت تتصفح بدون انترنت.' };
        
        const cleanAmt = Number(amt);
        if (!method || isNaN(cleanAmt) || cleanAmt <= 0) return { success: false, msg: 'بيانات غير صالحة' };
        if (method.reqProof !== false && !receipt) return { success: false, msg: 'أرفق الإشعار', errType: 'receipt' };
        
        const lockKey = `deposit_${method.id}`;
        if (this._actionLocks.has(lockKey)) return { success: false, msg: 'الطلب قيد التنفيذ...' };
        
        this._actionLocks.add(lockKey);
        try {
            const req = { amount: cleanAmt, paymentMethodName: method.name, payCurr, receiptUrl: receipt, idempotencyKey: generateIdempotencyKey() };
            const res = await StoreDB.callFunction('submitBalanceRequest', req);
            
            return { success: true, msg: res?.message || 'تم الإرسال بنجاح' };
        } catch (err) {
            if (receipt) this._safeDeleteFile(receipt);
            const msg = String(err.message || '');
            let finalMsg = 'تعذر الإرسال، جرب لاحقاً.';
            if (/[\u0600-\u06FF]/.test(msg)) finalMsg = msg; 
            return { success: false, msg: finalMsg };
        } finally { 
            this._actionLocks.delete(lockKey); 
        }
    },
    
    isFavorite: function(id) { return this.favs?.has(String(id)); },
    toggleFavorite: function(id) {
        if (!id) return;
        if (!this.favs) this.favs = new Set();
        this.favs.has(String(id)) ? this.favs.delete(String(id)) : this.favs.add(String(id));
        this.savePrefs();
        this._emit('store:favorites-updated', { count: this.favs.size, id: String(id) });
    },

    getAdminCountries: async function() {
        try {
            if (Array.isArray(LiveStoreData.countries) && LiveStoreData.countries.length > 0) {
                return LiveStoreData.countries;
            }
            const c = await StoreDB.getAll(DB_KEYS.COUNTRIES);
            if (Array.isArray(c) && c.length > 0) {
                LiveStoreData.countries = c;
                return c;
            }
            return [];
        } catch (e) { return []; }
    },

    _getSafeReadIds: function() {
        try { return JSON.parse(localStorage.getItem(DB_KEYS.NOTIF_READ_LIST) || "[]").map(String); } 
        catch(e) { try { localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, "[]"); } catch(err){} return []; }
    },

    listenToUserNotifications: function(renderCb) {
        if (!this.activeUid) return null;
        if (typeof this._notifUnsubscribe === 'function') { this._notifUnsubscribe(); this._notifUnsubscribe = null; }
        try {
            this._notifUnsubscribe = StoreDB.listenQuery(`${DB_KEYS.USERS}/${this.activeUid}/notifications`, [], 'createdAt', 20, (notifs) => {
                LiveStoreData.userNotifications = (notifs || [])
                    .sort((a, b) => parseSafeTime(b.createdAt) - parseSafeTime(a.createdAt))
                    .slice(0, 100);
                this._emit('store:alerts-updated', { notifications: LiveStoreData.userNotifications });
                if (renderCb) renderCb();
            });
            return this._notifUnsubscribe; 
        } catch (e) { return null; }
    },

    _isAlertForUser: function(msg, user, now, readIds = [], excludeRead = false) {
        if (excludeRead && (msg.isRead || readIds.includes(String(msg.id)))) return false;
        if (msg.expiresAt && now > parseSafeTime(msg.expiresAt)) return false;
        
        const rawAlertTs = msg.createdAt || msg.time;
        const alertTime = rawAlertTs ? parseSafeTime(rawAlertTs) : 0;
        
        if (user.lastReadAlertTime && alertTime > 0 && alertTime <= parseSafeTime(user.lastReadAlertTime)) {
            return false;
        }

        if (msg.type === 'notification') return true;
        
        const type = msg.targetType || msg.target || 'all';
        const tId = String(msg.targetId || msg.userId || msg.tierId || '');
        const isForMe = type === 'all' || (type === 'user' && tId === String(user.uid)) || (type === 'tier' && tId === String(user.tierId));
        
        if (!isForMe) return false;
        
        if (type !== 'user') {
            const userCreatedTime = user.createdAt ? parseSafeTime(user.createdAt) : 0;
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
                if (parseInt(localStorage.getItem(`${DYNAMIC_PREFIXES.ALERT_VIEWS}${msg.id}`) || "0") >= msg.maxViews) return false;
            }
            return true;
        }).sort((a, b) => parseSafeTime(b.createdAt || b.time) - parseSafeTime(a.createdAt || a.time));
    },
    
    getAllUserAlerts: function() {
        if (!this.user) return [];
        return [...(LiveStoreData.alerts || []), ...(LiveStoreData.userNotifications || [])]
            .filter(msg => this._isAlertForUser(msg, this.user, this.getNow(), [], false))
            .sort((a, b) => parseSafeTime(b.createdAt || b.time) - parseSafeTime(a.createdAt || a.time));
    },

    markSingleNotificationRead: async function(msgId, isPopup = false, maxViews = null) {
        if (!msgId) return;
        if (isPopup && maxViews && maxViews > 1) {
            let views = parseInt(localStorage.getItem(`${DYNAMIC_PREFIXES.ALERT_VIEWS}${msgId}`) || "0") + 1;
            try { localStorage.setItem(`${DYNAMIC_PREFIXES.ALERT_VIEWS}${msgId}`, views.toString()); } catch (e) {}
            if (views < maxViews) return;
        }

        const readIds = this._getSafeReadIds();
        if (!readIds.includes(String(msgId))) {
            readIds.push(String(msgId));
            if (readIds.length > 50) readIds.splice(0, readIds.length - 50);
            try { localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(readIds)); } catch (e) {}
            if (this.activeUid) this.updateUserProfile({ readAlerts: readIds }).catch(()=>{});
        }
        this._emit('store:alerts-updated', { action: 'single-read', id: msgId });
        if (this.activeUid) {
            try { await StoreDB.set(`${DB_KEYS.USERS}/${this.activeUid}/notifications`, msgId, { isRead: true }, { merge: true }); } catch (e) { }
        }
    },

    markAllNotificationsRead: async function() {
        const allAlerts = this.getAllUserAlerts();
        if (!allAlerts.length) return;
        const readIds = this._getSafeReadIds();
        
        const bulkUpdates = {}; 
        
        for (const msg of allAlerts) {
            if (!readIds.includes(String(msg.id))) readIds.push(String(msg.id));
            if (msg.type === 'popup' || msg.isPopup) {
                const viewKey = `${DYNAMIC_PREFIXES.ALERT_VIEWS}${msg.id}`;
                const maxV = (msg.maxViews || 99).toString();
                if (localStorage.getItem(viewKey) !== maxV) bulkUpdates[viewKey] = maxV;
            }
        }
        
        Object.entries(bulkUpdates).forEach(([key, val]) => {
            try { localStorage.setItem(key, val); } catch (e) {}
        });
        
        const cappedReadIds = readIds.slice(-50);
        try { localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(cappedReadIds)); } catch (e) {}
        
        this._emit('store:alerts-updated', { action: 'all-read' });
        
        if (this.activeUid) {
            this.updateUserProfile({ 
                readAlerts: cappedReadIds, 
                lastReadAlertTime: this.getNow() 
            }).catch(() => {});
        }
    },
    
    sendPasswordResetEmail: async function(email) { return email ? await StoreDB.sendResetEmail(email) : { success: false, msg: 'بريد مفقود.' }; },
    generateTOTPSecret: async function() { return await StoreDB.generateTOTPSecret(); },
    enrollTOTP: async function(secret, code) { return await StoreDB.enrollTOTP(secret, code); },
    unenrollMFA: async function() { return await StoreDB.unenrollMFA(); },
    is2FAEnabled: function() { return StoreDB.is2FAEnabled(); }
};
