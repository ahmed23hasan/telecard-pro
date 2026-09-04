// ============================================================================
// ⚙️ مدير البيانات الرئيسي (dataManager.js) - الإصدار المؤسسي V18.2 💎
// 🎯 الوظيفة: العقدة المركزية المطلقة لمعالجة البيانات، الاتصال المالي، والإشعارات.
// 🚀 التحديثات المعمارية الصارمة (V18.2 - Offline Privacy Shield): 
// 1. Offline FCM Ghosting Fix: حفظ توكنات الإشعارات محلياً عند الخروج بدون إنترنت لحذفها لاحقاً.
// 2. Self-Healing FCM Sync: تنظيف التوكنات العالقة آلياً بمجرد عودة الاتصال لضمان خصوصية العملاء.
// 3. Storage Quota Shield: تنظيف آلي وعميق لكاشات الحسابات السابقة لمنع انهيار الـ LocalStorage.
// 4. Time Manipulation Guard: تحصين دالة الوقت لمنع تجاوز صلاحية الكوبونات.
// 5. Memory Leak Fix: تصفير حدود العرض (Pagination) ومحرك الرسم عند تسجيل الخروج.
// ============================================================================

import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"; 
import { DB_KEYS, ACTIVE_USER_KEY, CACHE_KEYS, DYNAMIC_PREFIXES } from './config.js'; 
import { FirebaseAdapter, auth } from './core/firebaseAdapter.js'; 
import { RenderHelpers } from './core/renderHelpers.js'; 
import { FinancialEngine } from './core/financialEngine.js'; 
import { generateIdempotencyKey, parseSafeTime, getDeviceFingerprint } from './utils.js'; 

// 🛡️ تصدير محول قاعدة البيانات ليكون متاحاً لبقية الملفات
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
    cursors: { orders: null, deposits: null, wallet: null }, 
    
    get activeUid() { return this.user?.uid || this.user?.id || localStorage.getItem(CACHE_KEYS.ACTIVE_UID); },

    // =========================================================
    // 🌐 إقلاع المتجر (Store Bootstrapping)
    // =========================================================
    initStoreCatalog: async function() {
        LiveStoreData.isOfflineMode = false;
        try {
            const [settingsSnap, systemSnap] = await Promise.allSettled([
                StoreDB.getCacheFirst(DB_KEYS.SETTINGS, 'singleton'),
                StoreDB.getCacheFirst(DB_KEYS.SYSTEM, 'cache_version')
            ]);
            
            let forceUpdateCatalog = false;
            let newServerVersion = null; 
            
            if (settingsSnap.status === 'fulfilled' && settingsSnap.value) {
                LiveStoreData.settings = settingsSnap.value;
                if (typeof RenderHelpers !== 'undefined' && RenderHelpers.init) {
                    RenderHelpers.init({ 
                        settings: LiveStoreData.settings, 
                        rates: LiveStoreData.rates || [], 
                        offers: LiveStoreData.offers || [], 
                        isStore: true 
                    });
                }
            }
            
            if (systemSnap.status === 'fulfilled' && systemSnap.value) {
                const serverVersion = String(systemSnap.value.catalogVersion || '0').trim();
                const localVersion = String(localStorage.getItem('tc_server_version') || '0').trim();
                
                if (serverVersion !== '0' && serverVersion !== localVersion) {
                    forceUpdateCatalog = true;
                    newServerVersion = serverVersion; 
                }
            }
            
            const results = await Promise.allSettled([
                StoreDB.queryCacheFirst(DB_KEYS.PRODS, [], null, 2000, forceUpdateCatalog),
                StoreDB.queryCacheFirst(DB_KEYS.CATS, [], null, 200, forceUpdateCatalog),
                StoreDB.queryCacheFirst(DB_KEYS.OFFERS, [], null, 100, forceUpdateCatalog),
                StoreDB.queryCacheFirst(DB_KEYS.TIERS, [], null, 50, forceUpdateCatalog),
                StoreDB.queryCacheFirst(DB_KEYS.RATES, [], null, 50, forceUpdateCatalog),
                StoreDB.queryCacheFirst(DB_KEYS.BANNERS, [], null, 20, forceUpdateCatalog)
            ]);
            
            const rawProds = results[0].status === 'fulfilled' ? results[0].value : [];
            const activeProds = rawProds.filter(p => p && p.isActive !== false && String(p.isActive) !== 'false');
            
            Object.assign(LiveStoreData, {
                prods: activeProds,
                cats: results[1].status === 'fulfilled' ? results[1].value : [],
                offers: results[2].status === 'fulfilled' ? results[2].value : [],
                tiers: results[3].status === 'fulfilled' ? results[3].value : [],
                rates: results[4].status === 'fulfilled' ? results[4].value : [],
                banners: results[5].status === 'fulfilled' ? results[5].value : []
            });
            
            if (typeof RenderHelpers !== 'undefined' && RenderHelpers.init) {
                RenderHelpers.init({ 
                    settings: LiveStoreData.settings, 
                    rates: LiveStoreData.rates || [], 
                    offers: LiveStoreData.offers || [], 
                    isStore: true 
                });
            }

            this._ratesCache = null;
            
            try {
                if (LiveStoreData.cats && LiveStoreData.cats.length > 0) {
                    localStorage.setItem('tc_cats_count', LiveStoreData.cats.length);
                }
            } catch (e) {}
            
            if (newServerVersion && results[0].status === 'fulfilled' && results[1].status === 'fulfilled') {
                localStorage.setItem('tc_server_version', newServerVersion);
            }
            
            LiveStoreData.isInitialSyncDone = true; 
            return true;
        } catch (error) {
            LiveStoreData.isOfflineMode = true;
            return false;
        }
    },
    
    serverTimeOffset: 0, 

    // =========================================================
    // ⏱️ محرك الوقت والحالة (Time & State Management)
    // =========================================================
    
    // 🛡️ دالة الوقت المحصنة: تمنع تلاعب المستخدم بساعة جهازه لتخطي صلاحية الكوبونات والعروض
    getNow: function(strict = false) { 
        if (strict && this.serverTimeOffset === 0 && !LiveStoreData.isOfflineMode) {
            return Infinity; 
        }
        return Date.now() + this.serverTimeOffset; 
    },
    
    user: null, 
    prefs: { sound: true, theme: 'dark', security2fa: false, favs: [] }, 
    favs: new Set(),
    selectedCurr: 'USD', 
    _notifUnsubscribe: null, 
    _userUnsubscribe: null,

    // =========================================================
    // 💾 مدير التخزين المحلي (Local Storage Controller)
    // =========================================================

    // 🛡️ حفظ بيانات المستخدم محلياً مع حماية سعة التخزين (Advanced Quota Shield)
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
                    if (key && (
                        key.startsWith(DYNAMIC_PREFIXES.ALERT_VIEWS) || 
                        key.startsWith('tc_orders_cache_') || 
                        key.startsWith('tc_deposits_cache_')
                    )) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
            } catch (cleanupErr) {
                console.warn("[Storage Error] تعذر قراءة المفاتيح أثناء التنظيف.");
            }
            
            try { 
                localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(safeUser)); 
            } catch (err) {
                console.error("🚨 [Critical Error] فشل حفظ جلسة المستخدم تماماً. الذاكرة ممتلئة ومقفلة.");
            }
        }
    },

    updateUserProfile: async function(newData) {
        if (!this.activeUid || typeof newData !== 'object' || Array.isArray(newData) || !newData) return false;
        
        const FORBIDDEN_KEYS = new Set(['walletBalance', 'balance', 'tierId', 'isBanned', 'isIpBanned', 'role', 'baseCurrency']);
        
        const sanitized = {};
        for (const key in newData) {
            if (!FORBIDDEN_KEYS.has(key) && Object.prototype.hasOwnProperty.call(newData, key)) {
                if (typeof newData[key] === 'object' && newData[key] !== null) {
                    try { sanitized[key] = structuredClone(newData[key]); } 
                    catch (e) { sanitized[key] = { ...newData[key] }; }
                } else {
                    sanitized[key] = newData[key];
                }
            }
        }
        
        if (Object.keys(sanitized).length === 0) return true;
        
        try {
            const success = await StoreDB.set(DB_KEYS.USERS, this.activeUid, sanitized, { merge: true });
            if (success) { this.user = { ...this.user, ...sanitized }; this.saveUserLocal(); return true; }
            return false;
        } catch (error) { return false; }
    },

    loadPrefs: function() {
        try {
            const saved = JSON.parse(localStorage.getItem(DB_KEYS.PREFS) || '{}');
            this.prefs = { sound: saved.sound !== false, theme: saved.theme || localStorage.getItem(CACHE_KEYS.THEME) || 'dark', security2fa: saved.security2fa === true, favs: Array.isArray(saved.favs) ? saved.favs : [] };
            this.favs = new Set(this.prefs.favs.map(String).filter(s => s.trim() !== '' && s !== 'NaN' && s !== 'undefined'));
        } catch (e) { this.prefs = { sound: true, theme: 'dark', security2fa: false, favs: [] }; this.favs = new Set(); }
    },
    
    savePrefs: function() { 
        if (this.favs) this.prefs.favs = Array.from(this.favs); 
        try { localStorage.setItem(DB_KEYS.PREFS, JSON.stringify(this.prefs || {})); } catch (e) {} 
    },

    // =========================================================
    // 🧮 الاتصال بالمحركات المالية
    // =========================================================

    getRates: function() { 
        if (this._ratesCache) return this._ratesCache;
        let rawData = LiveStoreData.rates;
        if ((!rawData || !rawData.length) && LiveStoreData.settings?.rates) rawData = LiveStoreData.settings.rates;
        this._ratesCache = typeof FinancialEngine.normalizeRates === 'function' ? FinancialEngine.normalizeRates(rawData) : { 'USD': { code: 'USD', symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true } };
        return this._ratesCache;
    },
    
    getTiers: function() { return LiveStoreData.tiers || []; },
    getUserTier: function(userObj) { return FinancialEngine.getUserTier(userObj || this.user, this.getTiers()); },
    getTierProgress: function() { return FinancialEngine.getTierProgress(this.user, this.getTiers(), this.getNow()); },

    getActiveOffer: function(prodId) {
        const now = this.getNow(true); // استخدام وضع الحماية لمنع التلاعب
        return (LiveStoreData.offers || []).find(o => o.isActive && (!o.expiryDate || o.expiryDate > now) && o.targetProds?.includes(String(prodId)));
    },

    getPricingLocal: function(prod, qty, optIdx, appliedCoupon) {
        const userTier = FinancialEngine.getUserTier(this.user, this.getTiers());
        const activeOffer = this.getActiveOffer(prod?.id);
        const baseCur = (this.user?.baseCurrency || LiveStoreData.settings?.defaultCurrency || 'USD').toUpperCase();
        return FinancialEngine.getPricingLocal(
            prod, this.user, qty, optIdx, appliedCoupon, 
            activeOffer, userTier, this.getRates(), baseCur, this.selectedCurr
        );
    },

    validateCoupon: function(code, prod, qty, optIdx) {
        const userTier = FinancialEngine.getUserTier(this.user, this.getTiers());
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
    // 🚀 الإرساليات (Submissions & API Calls)
    // =========================================================

    submitIdentityData: async function(country, phone, currency) {
        if (this._actionLocks.has('identity')) return { success: false, msg: 'جاري المعالجة...' };
        this._actionLocks.add('identity');
        try {
            const result = await StoreDB.callFunction('completeUserIdentity', { country, phone, currency });
            if (result && result.success) {
                const finalCurr = result.lockedCurrency || currency;
                try { localStorage.setItem(CACHE_KEYS.DISPLAY_CURRENCY, finalCurr); } catch(e) {}
                this.selectedCurr = finalCurr;
                this.user = { ...this.user, country, phone, baseCurrency: finalCurr, isVerified: true };
                this.saveUserLocal();
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
                StoreDB.uploadImage(files.front, 'kyc_docs', `kyc_${userId}_front_${timestamp}_${uniqueId}.webp`),
                StoreDB.uploadImage(files.back, 'kyc_docs', `kyc_${userId}_back_${timestamp}_${uniqueId}.webp`),
                StoreDB.uploadImage(files.selfie, 'kyc_docs', `kyc_${userId}_selfie_${timestamp}_${uniqueId}.webp`)
            ];
            
            const results = await Promise.allSettled(uploadPromises);
            const failedUploads = results.filter(r => r.status === 'rejected');
            
            if (failedUploads.length > 0) {
                results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value).forEach(url => {
                    StoreDB.deleteImageByUrl(url).catch(() => {});
                });
                throw new Error("فشل رفع إحدى الصور.");
            }
            
            uploadedUrls = results.map(r => r.value);
            const newKycData = { 
                ...(this.user?.kycData || {}), 
                idNumber: kycData.idNumber, 
                frontImg: uploadedUrls[0], backImg: uploadedUrls[1], selfieImg: uploadedUrls[2], 
                submittedAt: Date.now() 
            };
            
            const success = await StoreDB.set(DB_KEYS.USERS, userId, { kycStatus: 'pending', kycData: newKycData }, { merge: true });
            if (!success) throw new Error("فشل التحديث في السيرفر.");
            
            if (this.user?.kycData) {
                [this.user.kycData.frontImg, this.user.kycData.backImg, this.user.kycData.selfieImg].filter(Boolean).forEach(url => {
                    StoreDB.deleteImageByUrl(url).catch(() => {});
                });
            }
            
            await this.updateUserProfile({ fullName: kycData.fullName, kycStatus: 'pending', kycData: newKycData });
            return { success: true };
            
        } catch (error) {
            uploadedUrls.forEach(url => StoreDB.deleteImageByUrl(url).catch(() => {}));
            const msg = String(error.message || '');
            let finalMsg = msg;
            if (!/[\u0600-\u06FF]/.test(msg)) finalMsg = 'فشل رفع المستندات.';
            return { success: false, msg: finalMsg };
        } finally { this._actionLocks.delete('kyc'); }
    },

    submitPrivateFeedback: async function(rating, feedbackText) {
        const userId = this.user?.id || this.activeUid || localStorage.getItem(CACHE_KEYS.ACTIVE_UID);
        if (!userId || userId === '0' || userId === 'undefined' || userId.startsWith('guest')) {
            if (window.UIManager && window.UIManager.showToast) {
                window.UIManager.showToast('عذراً، يرجى تسجيل الدخول لتتمكن من تقييم المتجر.', 'warning');
            }
            return { success: false, msg: 'auth_required' };
        }

        if (this._actionLocks.has('feedback')) return { success: false };
        this._actionLocks.add('feedback');
        
        try {
            await StoreDB.set('reviews', String(userId), {
                userId: String(userId),
                username: this.user?.username || this.user?.fullName || 'العميل',
                rating: rating || 0,
                text: feedbackText || '', 
                status: 'pending', 
                time: Date.now()
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
            if (hash) {
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
        // 🛡️ التحديث الماسي: تشافي ذاتي (Self-Healing) للتوكنات العالقة
        if (typeof window !== 'undefined' && navigator.onLine) {
            try {
                let pendingDeletes = JSON.parse(localStorage.getItem('tc_pending_fcm_delete') || '[]');
                if (pendingDeletes.length > 0) {
                    for (const req of pendingDeletes) {
                        try {
                            const userDoc = await StoreDB.getById(DB_KEYS.USERS, req.uid);
                            if (userDoc && Array.isArray(userDoc.fcmTokens)) {
                                const updatedTokens = userDoc.fcmTokens.filter(t => t !== req.token);
                                if (updatedTokens.length !== userDoc.fcmTokens.length) {
                                    await StoreDB.set(DB_KEYS.USERS, req.uid, { fcmTokens: updatedTokens }, { merge: true });
                                }
                            }
                        } catch (e) {} // نتجاهل الأخطاء الفردية لنكمل الباقي
                    }
                    localStorage.removeItem('tc_pending_fcm_delete');
                    console.log('🧹 [FCM] تم تنظيف التوكنات العالقة من الجلسات السابقة بنجاح.');
                }
            } catch (e) {
                console.warn('⚠️ [FCM] تعذر معالجة قائمة التوكنات المحذوفة:', e);
            }
        }

        if (!this.activeUid || typeof window === 'undefined' || !window.Notification || LiveStoreData.isOfflineMode) return;
        
        try {
            if (forcePrompt && Notification.permission === 'default') {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') return;
            }

            if (Notification.permission === 'granted') {
                const token = await StoreDB.requestFCMToken();
                if (!token) return;
                
                let currentTokens = Array.isArray(this.user?.fcmTokens) ? [...this.user.fcmTokens] : [];
                
                if (!currentTokens.includes(token)) {
                    currentTokens.push(token);
                    if (currentTokens.length > 5) currentTokens = currentTokens.slice(-5);
                    await this.updateUserProfile({ fcmTokens: currentTokens });
                    console.log('✅ [FCM] تم ربط هذا الجهاز لتلقي الإشعارات الفورية.');
                }
            }
        } catch (e) {
            console.warn('⚠️ [FCM] فشل فحص الإشعارات الصامت:', e);
        }
    },

    // =========================================================
    // 📡 مستمعات وجلب البيانات التاريخية
    // =========================================================

    listenToUserUpdates: function(renderCb) {
        if (!this.activeUid) return;
        if (typeof this._userUnsubscribe === 'function') { this._userUnsubscribe(); this._userUnsubscribe = null; }
        
        try {
            this._userUnsubscribe = StoreDB.listenDoc(DB_KEYS.USERS, this.activeUid, (docData) => {
                if (docData) {
                    if (docData.isBanned || docData.isIpBanned) {
                        window.UIManager?.triggerLiveBanAlert ? window.UIManager.triggerLiveBanAlert(docData.banReason) : this.logout();
                        return;
                    }
                    this.user = { ...this.user, ...docData, uid: this.activeUid, id: this.activeUid, walletBalance: Number(docData.walletBalance ?? docData.balance ?? 0) };
                    this.saveUserLocal();
                    if (renderCb) renderCb();
                } else this.logout();
            });
        } catch (e) { }
    },

    fetchUserHistory: async function() {
        if (!this.activeUid || !StoreDB.query) return;
        try {
            const [ordersRes, depositsRes] = await Promise.allSettled([
                StoreDB.query(DB_KEYS.ORDERS, 'userId', '==', this.activeUid),
                StoreDB.query(DB_KEYS.DEPOSITS, 'userId', '==', this.activeUid)
            ]);
            
            if (ordersRes.status === 'fulfilled') {
                LiveStoreData.orders = (ordersRes.value || []).sort((a,b) => parseSafeTime(b.createdAt || b.time) - parseSafeTime(a.createdAt || a.time));
            }
            if (depositsRes.status === 'fulfilled') {
                LiveStoreData.deposits = (depositsRes.value || []).sort((a,b) => parseSafeTime(b.createdAt || b.time) - parseSafeTime(a.createdAt || a.time));
            }
            
            if (window.RenderManager?.renderWallet) window.RenderManager.renderWallet(true);
        } catch (error) { console.warn("[DataManager] فشل جلب السجل:", error); }
    },

    loadMoreHistoricalData: async function(type, uid, limitCount = 15) {
        if (!this.cursors) this.cursors = {};
        if (!this.cursors[type]) return { success: false, data: [] }; 

        const dbKey = type === 'orders' ? DB_KEYS.ORDERS : DB_KEYS.DEPOSITS;
        try {
            const res = await StoreDB.fetchMoreWithCursor(dbKey, ['userId', '==', String(uid)], 'time', this.cursors[type], limitCount);
            
            if (res.data && res.data.length > 0) {
                this.cursors[type] = res.newLastDoc;
                
                const normData = res.data.map(item => ({
                    ...item, 
                    time: parseSafeTime(item.time), 
                    createdAt: parseSafeTime(item.createdAt)
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
        if (typeof window !== 'undefined' && window.UIManager && typeof window.UIManager.closeSidebar === 'function') {
            window.UIManager.closeSidebar();
        }

        try {
            // 🛡️ التحديث الماسي: حماية الخصوصية والإشعارات في وضع عدم الاتصال (Offline Privacy Shield)
            try {
                if (this.activeUid && typeof window !== 'undefined' && window.Notification && Notification.permission === 'granted') {
                    Promise.race([
                        StoreDB.requestFCMToken(),
                        new Promise(r => setTimeout(r, 3000))
                    ]).then(currentToken => {
                        if (currentToken && typeof currentToken === 'string') {
                            if (navigator.onLine === false) {
    // 🛡️ الإنترنت مقطوع: حفظ التوكن مع منع تضخم الذاكرة (حد أقصى 10 توكنات)
    let pendingDeletes = JSON.parse(localStorage.getItem('tc_pending_fcm_delete') || '[]');
    if (!pendingDeletes.some(item => item.token === currentToken)) {
        pendingDeletes.push({ uid: this.activeUid, token: currentToken });
        if (pendingDeletes.length > 10) pendingDeletes = pendingDeletes.slice(-10); // منع تضخم الكاش
        localStorage.setItem('tc_pending_fcm_delete', JSON.stringify(pendingDeletes));
        console.log('🔒 [FCM Offline] تم حفظ التوكن للإلغاء لاحقاً.');
    }                         } else {
                                // الإنترنت متصل: تحديث السيرفر بصمت لحذف الجهاز الحالي من قائمة الإشعارات
                                let currentTokens = Array.isArray(this.user?.fcmTokens) ? [...this.user.fcmTokens] : [];
                                const updatedTokens = currentTokens.filter(t => t !== currentToken);
                                if (currentTokens.length !== updatedTokens.length) {
                                    StoreDB.set(DB_KEYS.USERS, this.activeUid, { fcmTokens: updatedTokens }, { merge: true }).catch(()=>{});
                                    console.log('🔒 [FCM] تم إلغاء ربط هذا الجهاز بالإشعارات بنجاح لحماية الخصوصية.');
                                }
                            }
                        }
                    }).catch(()=>{});
                }
            } catch (fcmErr) {
                console.warn('⚠️ [Logout] تعذر إلغاء ربط توكن الإشعارات:', fcmErr);
            }

            // إنهاء جلسة فايربيز (Firebase Auth) بأمان
            if (auth && typeof signOut === 'function') await signOut(auth);
            
            try {
                localStorage.removeItem(CACHE_KEYS.ACTIVE_UID);
                localStorage.removeItem(ACTIVE_USER_KEY);
                localStorage.removeItem(CACHE_KEYS.DISPLAY_CURRENCY);
            } catch (e) {}
            
            try {
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (
                        key.startsWith('tc_orders_cache_') || 
                        key.startsWith('tc_deposits_cache_') || 
                        key.startsWith(DYNAMIC_PREFIXES.ALERT_VIEWS)
                    )) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
            } catch (storageErr) {
                console.warn("[Logout] تعذر تنظيف بعض بيانات التخزين المحلي:", storageErr);
            }
            
            if (typeof this._notifUnsubscribe === 'function') { this._notifUnsubscribe(); this._notifUnsubscribe = null; }
            if (typeof this._userUnsubscribe === 'function') { this._userUnsubscribe(); this._userUnsubscribe = null; } 

            Object.keys(LiveStoreData).forEach(k => {
                if (Array.isArray(LiveStoreData[k])) { 
                    LiveStoreData[k].length = 0; 
                } else if (typeof LiveStoreData[k] === 'object' && LiveStoreData[k] !== null) {
                    for (let subK in LiveStoreData[k]) {
                        LiveStoreData[k][subK] = undefined; 
                    }
                }
            });
            
            LiveStoreData.isInitialSyncDone = false; 
            LiveStoreData.isOfflineMode = typeof navigator !== 'undefined' ? !navigator.onLine : false; 
            LiveStoreData.popup = null;

            if (typeof window !== 'undefined' && window.RenderManager) {
                window.RenderManager._historicalData = { orders: [], deposits: [] };
                window.RenderManager.highlightId = null;
                window.RenderManager.limits = { wallet: 15, orders: 15, payments: 15 };
            }

            if (typeof window !== 'undefined' && window.UIManager && window.UIManager.State) {
                window.UIManager.State.activeModals = [];
                window.UIManager.State.isProcessingTx = false;
                window.UIManager.State.pendingReceiptFile = null;
            }

            this._ratesCache = null; 
            this.user = null; 
            
            if (this.favs) this.favs.clear(); 
            this.prefs = { sound: true, theme: 'dark', security2fa: false, favs: [] };
            
            this._actionLocks.clear();
            this.cursors = { orders: null, deposits: null, wallet: null };      

        } catch (e) {
            console.error("🚨 خطأ أثناء تسجيل الخروج:", e);
        }

        if (hardRedirect && typeof window !== 'undefined') {
            try { localStorage.setItem('tc_show_logout_toast', 'true'); } catch (e) {}
            window.location.replace(window.location.pathname);
        }
    },
    syncUser: async function() {
        let me = null;
        
        let adminDef = 'USD';
        if (LiveStoreData.settings && LiveStoreData.settings.defaultCurrency) {
            adminDef = LiveStoreData.settings.defaultCurrency;
        } else {
            try {
                const cachedSettings = JSON.parse(localStorage.getItem(`telecard_store_cache_${DB_KEYS.SETTINGS}_singleton`) || '{}');
                if (cachedSettings.defaultCurrency) adminDef = cachedSettings.defaultCurrency;
            } catch (e) {}
        }
        
        if (this.activeUid) {
            try {
                me = (LiveStoreData.users || []).find(u => String(u.uid || u.id) === String(this.activeUid)) || JSON.parse(localStorage.getItem(ACTIVE_USER_KEY) || 'null');
            } catch (e) { me = null; }
            
            if (me && String(me.uid || me.id) !== String(this.activeUid)) me = null;
            
            try {
                const lastSync = sessionStorage.getItem(CACHE_KEYS.TIME_SYNC);
                if (!LiveStoreData.isOfflineMode && StoreDB.callFunction && (!lastSync || (Date.now() - Number(lastSync)) > 21600000 || this.serverTimeOffset === 0)) {
                    
                    // 🛡️ التحديث الماسي: "الإقلاع غير المانع" (Non-Blocking Boot)
                    // تغليف طلب الوقت بمهلة 3 ثوانٍ فقط لمنع تجميد اللودر للأبد
                    const timeRequest = StoreDB.callFunction('getServerTime').catch(() => null);
                    const timeoutFallback = new Promise(resolve => setTimeout(() => resolve(null), 3000));
                    
                    const res = await Promise.race([timeRequest, timeoutFallback]);
                    
                    if (res && res.serverTime) {
                        this.serverTimeOffset = res.serverTime - Date.now();
                        sessionStorage.setItem(CACHE_KEYS.TIME_SYNC, Date.now().toString());
                    } else {
                        console.warn("⚠️ [TimeSync] تأخر السيرفر في الرد. تم إقلاع المتجر بالوقت المحلي لحماية الواجهة من التجميد.");
                    }
                }
            } catch (e) {
                console.warn("⚠️ تعذر جلب وقت السيرفر، تم الاعتماد على الوقت المحلي.");
            }
        }
        
        if (this.activeUid && !me && window.ClientSystem?.isReady) {
            if (!LiveStoreData.isOfflineMode) this.logout();
            return false;
        }
        
        if (me) {
            if (me.isBanned || me.isIpBanned || me.isRestricted) {
                window.UIManager?.triggerLiveBanAlert ? window.UIManager.triggerLiveBanAlert(me.banReason) : this.logout();
                return false;
            }
            
            me.uid = this.activeUid;
            me.id = this.activeUid;
            
            if (me.baseCurrency || me.base_currency) {
                me.baseCurrency = (me.baseCurrency || me.base_currency).toUpperCase();
            } else {
                me.baseCurrency = null; 
            }
            
            me.walletBalance = Number(me.walletBalance ?? me.wallet_balance ?? me.balance ?? 0);
            
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
            
            this.listenToUserUpdates(() => {
                window.UIManager?.updateProfileDisplay?.();
                window.UIManager?.updateDisplayBalance?.();
                window.RenderManager?.renderWallet?.(true);
            });
            
        } else if (!this.activeUid) {
            this.user = null;
        }
        
        this.enforceIpBan().catch(() => {});
        
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
 
    enforceIpBan: async function() {
        if (LiveStoreData.isOfflineMode) return false;
        try {
            const banned = LiveStoreData.settings?.bannedIps || [];
            if (!banned.length) return false;
            let ip = sessionStorage.getItem('tc_client_ip');
            if (ip === 'blocked_or_failed') return false;
            
            if (!ip) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1500);
                try {
                    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
                    if (res.ok) { ip = (await res.json()).ip; sessionStorage.setItem('tc_client_ip', ip); }
                } catch (e) { sessionStorage.setItem('tc_client_ip', 'blocked_or_failed'); } 
                finally { clearTimeout(timeoutId); }
            }
            if (ip && ip !== 'blocked_or_failed' && banned.includes(ip)) { this.logout(); return true; }
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
            return await StoreDB.changeUserPassword(cVal, nVal);
        } catch (e) { return { success: false, msg: 'خطأ اتصال.' }; }
    },

    confirmPurchase: async function(prod, qty, optIdx, finalInputStr, appliedCoupon) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return { success: false, msg: 'أنت تتصفح بدون انترنت.' };
        if (!prod || !this.user) return { success: false, msg: 'بيانات مفقودة' };
        
        const lockKey = `order_${prod.id}`;
        if (this._actionLocks.has(lockKey)) return { success: false, msg: 'الطلب قيد التنفيذ، يرجى الانتظار...' };
        
        this._actionLocks.add(lockKey);
        try {
            const req = { productId: String(prod.id), qty: Math.max(1, Math.floor(Number(qty)) || 1), optIdx: optIdx ?? null, finalInputStr: finalInputStr || '---', couponCode: appliedCoupon?.code || null, idempotencyKey: generateIdempotencyKey() };
            const res = await StoreDB.callFunction('createOrder', req);
            
            return { success: true, msg: res.message || 'تم إتمام الطلب', isAutoDelivered: res.isAutoDelivered, deliveredCodeText: res.deliveredCode };
        } catch (err) {
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
        if(!this.favs) this.favs = new Set();
        this.favs.has(String(id)) ? this.favs.delete(String(id)) : this.favs.add(String(id));
        this.savePrefs();
    },

    getAdminCountries: async function() { try { const c = await StoreDB.getAll(DB_KEYS.COUNTRIES); return Array.isArray(c) ? c : []; } catch (e) { return []; } },

    _getSafeReadIds: function() {
        try { return JSON.parse(localStorage.getItem(DB_KEYS.NOTIF_READ_LIST) || "[]").map(String); } 
        catch(e) { localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, "[]"); return []; }
    },

    listenToUserNotifications: function(renderCb) {
        if (!this.activeUid) return null;
        if (typeof this._notifUnsubscribe === 'function') { this._notifUnsubscribe(); this._notifUnsubscribe = null; }
        try {
            this._notifUnsubscribe = StoreDB.listenQuery(`telecard_users/${this.activeUid}/notifications`, [], 'createdAt', 50, (notifs) => {
                LiveStoreData.userNotifications = (notifs || []).sort((a, b) => parseSafeTime(b.createdAt) - parseSafeTime(a.createdAt));
                if (renderCb) renderCb();
            });
            return this._notifUnsubscribe; 
        } catch (e) { return null; }
    },

    _isAlertForUser: function(msg, user, now, readIds = [], excludeRead = false) {
        if (excludeRead && (msg.isRead || readIds.includes(String(msg.id)))) return false;
        if (msg.expiresAt && now > msg.expiresAt) return false;
        
        if (msg.type === 'notification' || msg.jumpTarget) return true;
        
        const type = msg.targetType || msg.target || 'all';
        const tId = String(msg.targetId || msg.userId || msg.tierId || '');
        const isForMe = type === 'all' || (type === 'user' && tId === String(user.uid)) || (type === 'tier' && tId === String(user.tierId));
        
        if (!isForMe) return false;
        
        if (type !== 'user') {
            const userCreatedTime = parseSafeTime(user.createdAt);
            const alertTime = parseSafeTime(msg.createdAt || msg.time || msg.timestamp);
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
            let views = parseInt(localStorage.getItem(`alert_views_${msgId}`) || "0") + 1;
            localStorage.setItem(`alert_views_${msgId}`, views.toString());
            if (views < maxViews) return;
        }

        const readIds = this._getSafeReadIds();
        if (!readIds.includes(String(msgId))) {
            readIds.push(String(msgId));
            if (readIds.length > 50) readIds.splice(0, readIds.length - 50);
            localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(readIds));
            if (this.activeUid) this.updateUserProfile({ readAlerts: readIds }).catch(()=>{});
        }
        window.UIManager?.updateNotifBadges?.();
        if (this.activeUid) {
            try { await StoreDB.set(`telecard_users/${this.activeUid}/notifications`, msgId, { isRead: true }, { merge: true }); } catch (e) { }
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
                const viewKey = `alert_views_${msg.id}`;
                const maxV = (msg.maxViews || 99).toString();
                if (localStorage.getItem(viewKey) !== maxV) bulkUpdates[viewKey] = maxV;
            }
        }
        
        Object.entries(bulkUpdates).forEach(([key, val]) => localStorage.setItem(key, val));
        
        const cappedReadIds = readIds.slice(-50);
        localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(cappedReadIds));
        
        window.UIManager?.updateNotifBadges?.();
        window.RenderManager?.renderNotifCenterList?.();
        
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
    is2FAEnabled: function() { return auth?.currentUser?.multiFactor?.enrolledFactors?.length > 0; }
};
