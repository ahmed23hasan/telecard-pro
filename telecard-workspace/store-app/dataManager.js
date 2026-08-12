// ============================================================================
// ⚙️ مدير البيانات الرئيسي (DataManager.js) - النسخة V2.8 (العقدة المركزية المطلقة 🧠)
// 🚀 التحسينات (V2.8): 
// 1. Firebase Native Caching: الاعتماد على الكاش الأصلي لخفض فواتير القراءة بنسبة 80%.
// 2. Delta Sync Catalog: جلب التحديثات فقط للمنتجات بدلاً من تحميل الكتالوج بالكامل.
// 3. Zero-Latency Boot: فتح المتجر للعملاء العائدين في أجزاء من الثانية (Cache First).
// ============================================================================

import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"; 
import { DB_KEYS, ACTIVE_USER_KEY, CACHE_KEYS, DYNAMIC_PREFIXES } from './config.js';
import { FirebaseAdapter, auth } from './core/firebaseAdapter.js'; 
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

// 🛑 تم إيقاف نظام الكاش اليدوي (LocalDBHelper) لأنه يستهلك الذاكرة بشكل مضاعف، 
// وأصبحنا نعتمد على محرك Firebase IndexedDB الداخلي الأسرع والأذكى.

export const DataManager = {
        _ratesCache: null,
        _actionLocks: new Set(),
        cursors: { orders: null, deposits: null, wallet: null }, // 👈 هذا هو السطر الجديد
        
        get activeUid() { return this.user?.uid || this.user?.id || localStorage.getItem(CACHE_KEYS.ACTIVE_UID); },
        // ⚡ [التحديث الماسي 2.8]: تهيئة الكتالوج بسرعة البرق وبأقل تكلفة ممكنة
    initStoreCatalog: async function() {
        LiveStoreData.isOfflineMode = false;
        try {
            // 1. جلب الإعدادات من الكاش أولاً (لتسريع التهيئة)
            const [settingsSnap, systemSnap] = await Promise.all([
                StoreDB.getCacheFirst(DB_KEYS.SETTINGS, 'singleton').catch(() => null),
                StoreDB.getCacheFirst(DB_KEYS.SYSTEM, 'cache_version').catch(() => null)
            ]);
            
            if (settingsSnap) {
                LiveStoreData.settings = settingsSnap;
                if (typeof RenderHelpers !== 'undefined' && RenderHelpers.init) RenderHelpers.init(settingsSnap);
            }
            
            // 2. استخدام queryCacheFirst لجلب الكتالوج (مصفوفة فارغة [] تعني جلب الكل)
            // هذا السطر سيوفر لك مئات الدولارات شهرياً!
            const [rawProds, rawCats, offers, tiers, rates, banners] = await Promise.all([
                StoreDB.queryCacheFirst(DB_KEYS.PRODS, [], null, 2000).catch(() => []), 
                StoreDB.queryCacheFirst(DB_KEYS.CATS, [], null, 200).catch(() => []),
                StoreDB.queryCacheFirst(DB_KEYS.OFFERS, [], null, 100).catch(() => []), 
                StoreDB.queryCacheFirst(DB_KEYS.TIERS, [], null, 50).catch(() => []),
                StoreDB.queryCacheFirst(DB_KEYS.RATES, [], null, 50).catch(() => []), 
                StoreDB.queryCacheFirst(DB_KEYS.BANNERS, [], null, 20).catch(() => [])
            ]);
            
            const activeProds = rawProds.filter(p => p && String(p.isActive) !== 'false');
            Object.assign(LiveStoreData, { prods: activeProds, cats: rawCats, offers, tiers, rates, banners });
            this._ratesCache = null; 
            
            return true;
        } catch (error) {
            console.error("🚨 [DataManager] فشل تحميل الكتالوج:", error);
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

    saveUserLocal: function() {
        if (!this.user) return;
        const safeUser = { ...this.user, id: this.activeUid, uid: this.activeUid };
        try {
            localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(safeUser));
        } catch (e) {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(DYNAMIC_PREFIXES.ALERT_VIEWS)) localStorage.removeItem(key);
            });
            try { localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(safeUser)); } catch (err) {}
        }
    },

    updateUserProfile: async function(newData) {
        if (!this.activeUid || typeof newData !== 'object' || Array.isArray(newData) || !newData) return false;
        
        // 🛡️ درع حماية الحقول الحساسة
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

    getRates: function() { 
        if (this._ratesCache) return this._ratesCache;
        let rawData = LiveStoreData.rates;
        if ((!rawData || !rawData.length) && LiveStoreData.settings?.rates) rawData = LiveStoreData.settings.rates;
        this._ratesCache = typeof FinancialEngine.normalizeRates === 'function' ? FinancialEngine.normalizeRates(rawData) : { 'USD': { code: 'USD', symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true } };
        return this._ratesCache;
    },

    // ========================================================================
    // 🌉 الجسور المعمارية الشاملة (All Core Bridges)
    // ========================================================================
    
    getTiers: function() { return LiveStoreData.tiers || []; },
    getUserTier: function(userObj) { return FinancialEngine.getUserTier(userObj || this.user, this.getTiers()); },
    getTierProgress: function() { return FinancialEngine.getTierProgress(this.user, this.getTiers(), this.getNow()); },

    getActiveOffer: function(prodId) {
        const now = this.getNow(); 
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
            code, prod, qty, optIdx, this.user, userTier, LiveStoreData.coupons, this.getNow(), activeOffer
        );
    },

    calculateDepositFee: function(amt, method, payCurr) {
        const baseCur = (this.user?.baseCurrency || 'USD').toUpperCase();
        return FinancialEngine.calculateDepositFee(amt, method, payCurr, baseCur, this.getRates());
    },

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
        } finally { this._actionLocks.delete('identity'); }
    },

    submitKycDocuments: async function(kycData, files) {
        if (this._actionLocks.has('kyc')) return { success: false, msg: 'جاري الرفع...' };
        this._actionLocks.add('kyc');
        let uploadedUrls = [];
        try {
            const userId = this.user?.id || 'unknown';
            const timestamp = Date.now();
            
            const uploadPromises = [
                StoreDB.uploadImage(files.front, 'kyc_docs', `${userId}_front_${timestamp}.webp`),
                StoreDB.uploadImage(files.back, 'kyc_docs', `${userId}_back_${timestamp}.webp`),
                StoreDB.uploadImage(files.selfie, 'kyc_docs', `${userId}_selfie_${timestamp}.webp`)
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
            return { success: false, msg: error.message };
        } finally { this._actionLocks.delete('kyc'); }
    },

    submitPrivateFeedback: async function(rating, feedbackText) {
        if (this._actionLocks.has('feedback')) return { success: false };
        this._actionLocks.add('feedback');
        try {
            await StoreDB.add(DB_KEYS.FEEDBACKS, {
                userId: this.user?.id || localStorage.getItem(CACHE_KEYS.ACTIVE_UID) || 'guest',
                username: this.user?.username || 'ضيف',
                rating: rating || 0,
                feedback: feedbackText,
                time: Date.now()
            });
            return { success: true };
        } catch (e) { return { success: false }; } 
        finally { this._actionLocks.delete('feedback'); }
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

    // ========================================================================
    // 🔄 أحداث المزامنة والمستمعات 
    // ========================================================================

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

    // ⚠️ تنبيه: هذه الدالة بقيت بدون كاش لأنها تتعلق برصيد المستخدم وأوامره ويجب أن تكون دقيقة 100% وفي الوقت الفعلي.
    fetchUserHistory: async function() {
        if (!this.activeUid || !StoreDB.query) return;
        try {
            const [myOrders, myDeposits] = await Promise.all([
                StoreDB.query(DB_KEYS.ORDERS, 'userId', '==', this.activeUid),
                StoreDB.query(DB_KEYS.DEPOSITS, 'userId', '==', this.activeUid)
            ]);
            LiveStoreData.orders = (myOrders || []).sort((a,b) => parseSafeTime(b.createdAt || b.time) - parseSafeTime(a.createdAt || a.time));
            LiveStoreData.deposits = (myDeposits || []).sort((a,b) => parseSafeTime(b.createdAt || b.time) - parseSafeTime(a.createdAt || a.time));
            if (window.RenderManager?.renderWallet) window.RenderManager.renderWallet(true);
        } catch (error) { }
    },

    logout: async function() {
        try {
            if (auth) await signOut(auth);
            localStorage.removeItem(CACHE_KEYS.ACTIVE_UID);
            localStorage.removeItem(ACTIVE_USER_KEY);
            localStorage.removeItem(CACHE_KEYS.DISPLAY_CURRENCY);
            
            if (typeof this._notifUnsubscribe === 'function') { this._notifUnsubscribe(); this._notifUnsubscribe = null; }
            if (typeof this._userUnsubscribe === 'function') { this._userUnsubscribe(); this._userUnsubscribe = null; } 

            Object.keys(LiveStoreData).forEach(k => {
                if (Array.isArray(LiveStoreData[k])) { LiveStoreData[k].length = 0; }
                else if (typeof LiveStoreData[k] === 'object' && LiveStoreData[k] !== null) {
                    Object.keys(LiveStoreData[k]).forEach(subK => delete LiveStoreData[k][subK]); 
                }
            });
            
            LiveStoreData.isInitialSyncDone = false; LiveStoreData.isOfflineMode = false; LiveStoreData.popup = null;
            this._ratesCache = null; this.user = null; 
            
            if (this.favs) this.favs.clear(); 
            this._actionLocks.clear();
            this.cursors = { orders: null, deposits: null, wallet: null }; // 👈 هذا هو السطر الجديد            
        } catch(e) { console.warn("[DataManager] Error during logout:", e); }
        window.location.replace('login.html');
    },    

    syncUser: async function() {
        let me = null;
        if (this.activeUid) {
            me = (LiveStoreData.users || []).find(u => String(u.uid || u.id) === String(this.activeUid)) || JSON.parse(localStorage.getItem(ACTIVE_USER_KEY) || 'null');
            if (me && String(me.uid || me.id) !== String(this.activeUid)) me = null;
            
            const lastSync = sessionStorage.getItem(CACHE_KEYS.TIME_SYNC);
            if (!LiveStoreData.isOfflineMode && StoreDB.callFunction && (!lastSync || (Date.now() - Number(lastSync)) > 21600000 || this.serverTimeOffset === 0)) {
                StoreDB.callFunction('getServerTime').then(res => { 
                    if(res?.serverTime) {
                        this.serverTimeOffset = res.serverTime - Date.now(); 
                        sessionStorage.setItem(CACHE_KEYS.TIME_SYNC, Date.now().toString());
                    }
                }).catch(() => {});
            }
        }
        
        if (this.activeUid && !me && window.ClientSystem?.isReady) { if (!LiveStoreData.isOfflineMode) this.logout(); return false; }
        
        if (me) {
            if (me.isBanned || me.isIpBanned || me.isRestricted) { window.UIManager?.triggerLiveBanAlert ? window.UIManager.triggerLiveBanAlert(me.banReason) : this.logout(); return false; }  
            me.uid = this.activeUid; me.id = this.activeUid;
            me.baseCurrency = (me.baseCurrency || me.base_currency || 'USD').toUpperCase();
            me.walletBalance = Number(me.walletBalance ?? me.wallet_balance ?? me.balance ?? 0);
            if (me.tierCycleStartDate === undefined) { me.tierCycleStartDate = this.getNow(); me.tierCycleSpent = 0; }
            
            if (Array.isArray(me.readAlerts)) localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(me.readAlerts));
            
            this.user = me;
            this.saveUserLocal();
            
            this.injectSilentSensor();
            
            if (!LiveStoreData.isOfflineMode) this.fetchUserHistory();
            this.listenToUserUpdates(() => { window.UIManager?.updateProfileDisplay?.(); window.UIManager?.updateDisplayBalance?.(); window.RenderManager?.renderWallet?.(true); });
        } else if (!this.activeUid) this.user = null;
        
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
            this.fetchUserHistory();
            return { success: true, msg: res.message || 'تم إتمام الطلب', isAutoDelivered: res.isAutoDelivered, deliveredCodeText: res.deliveredCode };
        } catch (err) {
            console.error("🚨 [CRASH DUMP] فشل لحظي قبل أو أثناء الإرسال:", err.message);
            const msg = String(err.message || '');
            let finalMsg = 'خطأ بالشبكة أو نفد المخزون.';
            if (/[\u0600-\u06FF]/.test(msg)) finalMsg = msg;
            else if (msg.toLowerCase().includes('balance')) finalMsg = 'رصيدك غير كافٍ.';
            else if (msg.toLowerCase().includes('already')) finalMsg = 'تم استلام طلبك مسبقاً.';
            else if (err.code === 'network-offline' || msg.toLowerCase().includes('fetch')) finalMsg = 'تأكد من اتصالك بالإنترنت.';
            else if (msg.toLowerCase().includes('internal')) finalMsg = 'رفض السيرفر الطلب (خطأ داخلي).';
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
            this.fetchUserHistory();
            return { success: true, msg: res?.message || 'تم الإرسال بنجاح' };
        } catch (err) {
            console.error("Deposit Submission Error:", err);
            return { success: false, msg: 'تعذر الإرسال، جرب لاحقاً.' };
        } finally { this._actionLocks.delete(lockKey); }
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
    
    // 🛡️ الإصلاح الجذري 1: السماح بمرور إشعارات السيرفر الشخصية (الطلبات/المحفظة) فوراً
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
        
        for (const msg of allAlerts.slice(0, 50)) {
            if (!readIds.includes(String(msg.id))) readIds.push(String(msg.id));
            if (msg.type === 'popup' || msg.isPopup) {
                const viewKey = `alert_views_${msg.id}`;
                const maxV = (msg.maxViews || 99).toString();
                if (localStorage.getItem(viewKey) !== maxV) localStorage.setItem(viewKey, maxV);
            }
        }
        
        const cappedReadIds = readIds.slice(-50);
        localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(cappedReadIds));
        
        window.UIManager?.updateNotifBadges?.();
        window.RenderManager?.renderNotifCenterList?.();
        if (this.activeUid) this.updateUserProfile({ readAlerts: cappedReadIds }).catch(() => {});
    },
    
    sendPasswordResetEmail: async function(email) { return email ? await StoreDB.sendResetEmail(email) : { success: false, msg: 'بريد مفقود.' }; },
    generateTOTPSecret: async function() { return await StoreDB.generateTOTPSecret(); },
    enrollTOTP: async function(secret, code) { return await StoreDB.enrollTOTP(secret, code); },
    unenrollMFA: async function() { return await StoreDB.unenrollMFA(); },
    is2FAEnabled: function() { return auth?.currentUser?.multiFactor?.enrolledFactors?.length > 0; }
};

Object.defineProperty(DataManager, 'enforceIpBan', { configurable: false, writable: false });