// ============================================================================
// 🗄️ مدير البيانات والعمليات الحسابية (dataManager.js) - النسخة الماسية المطلقة V12.1 💎
// 🎯 الوظيفة: معالجة البيانات، الحسابات، والاتصال المباشر بالسحابة ومحرك الكاش
// 🚀 التحديث الأقصى: الانتقال إلى IndexedDB، القائمة البيضاء للأمان، ومعالجة انحراف الوقت
// ============================================================================

import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"; 
import { DB_KEYS, ACTIVE_USER_KEY } from './config.js';
import { Utils } from './utils.js';
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
// 🛠️ مساعد قاعدة البيانات المحلية (IndexedDB Helper) - للتخزين اللامحدود
// ============================================================================
const LocalDBHelper = {
    dbName: 'TeleCardStoreDB',
    storeName: 'CacheStore',
    
    init: function() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (e) => {
                e.target.result.createObjectStore(this.storeName);
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
        } catch (e) { return false; }
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
        } catch (e) { return null; }
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
// 📦 مدير الكاش الذكي (Smart Cache Manager - O(1) Reads with IndexedDB)
// ============================================================================
export const SmartCacheManager = {
    CACHE_KEY: 'telecard_store_catalog_v2', // تحديث المفتاح لبدء كاش نظيف
    EXPIRY_TIME: 24 * 60 * 60 * 1000, 
    
    saveCatalogToLocal: async function(prods, cats, offers, tiers, rates) {
        const cacheData = { timestamp: Date.now(), data: { prods, cats, offers, tiers, rates } };
        
        // محاولة الحفظ في IndexedDB (مساحة عملاقة) بدلاً من LocalStorage المحدودة
        const saved = await LocalDBHelper.set(this.CACHE_KEY, cacheData);
        if (saved) {
            console.log("💎 [Smart Cache] Catalog saved to IndexedDB (Zero Reads, Unlimited Storage).");
        } else {
            // نظام طوارئ بديل في حالة عدم دعم المتصفح
            try { localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData)); } 
            catch (e) { console.warn("Critical: Both IndexedDB & LocalStorage failed."); }
        }
    },
    
    loadCatalogFromLocal: async function() {
        try {
            let parsed = await LocalDBHelper.get(this.CACHE_KEY);
            
            // تحقق من نظام الطوارئ إذا كانت IndexedDB فارغة
            if (!parsed) {
                const raw = localStorage.getItem(this.CACHE_KEY);
                if (raw) parsed = JSON.parse(raw);
            }
            
            if (!parsed) return null;
            
            if (Date.now() - parsed.timestamp > this.EXPIRY_TIME) {
                await LocalDBHelper.remove(this.CACHE_KEY);
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
        
        const cachedData = await this.loadCatalogFromLocal();
        if (!cachedData) return true;
        
        Object.assign(LiveStoreData, cachedData); // دمج البيانات بكفاءة واستهلاك أقل للذاكرة
        console.log("🚀 [Smart Cache] Loaded 100% from IndexedDB (0 Firebase Reads!)");
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
        LiveStoreData.isOfflineMode = false; 

        try {
            const settingsSnap = await StoreDB._withTimeout(StoreDB.getById('telecard_settings', 'singleton'), 3000, 'Init Settings').catch(() => null);
            if (!settingsSnap) throw new Error("تعذر جلب الإعدادات (Timeout)");
            
            const serverCatalogVersion = settingsSnap?.catalogVersion || '1.0'; 
            LiveStoreData.settings = settingsSnap || {};

            if (!(await SmartCacheManager.shouldFetchFromServer(serverCatalogVersion))) {
                console.log(`✅ تم تحميل متجر MaliMor من الذاكرة في ${Math.round(performance.now() - t0)}ms`);
                return true;
            }

            console.log("🔄 جاري تحميل أحدث كتالوج من السيرفر...");
            const [prods, cats, offers, tiers, rates] = await Promise.all([
                StoreDB.getAll('telecard_prods_public'), StoreDB.getAll('telecard_cats'),
                StoreDB.getAll('telecard_offers'), StoreDB.getAll('telecard_tiers'), StoreDB.getAll('telecard_rates')
            ]);

            const activeProds = prods.filter(p => p.isActive !== false);
            Object.assign(LiveStoreData, { prods: activeProds, cats, offers, tiers, rates });
            await SmartCacheManager.saveCatalogToLocal(activeProds, cats, offers, tiers, rates);

            console.log(`✅ تم جلب وحفظ الكتالوج في ${Math.round(performance.now() - t0)}ms`);
            return true;

        } catch (error) {
            console.error("🚨 فشل الاتصال، تفعيل وضع الأوفلاين:", error);
            LiveStoreData.isOfflineMode = true; 
            
            const fallback = await SmartCacheManager.loadCatalogFromLocal();
            if (fallback?.cats?.length) {
                Object.assign(LiveStoreData, fallback);
                setTimeout(() => window.UIManager?.showToast?.('أنت في وضع عدم الاتصال (بيانات محلية)', 'warning'), 1500);
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
    _notifUnsubscribe: null,
    _userUnsubscribe: null,

    generateIdempotencyKey: function() {
        return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).substring(2);
    },

    saveUserLocal: function() {
    if (!this.user) return;
    try {
        // 🛡️ [أمان - القائمة البيضاء]: استخراج وحفظ البيانات الضرورية والآمنة فقط، وتجاهل أي بيانات حساسة
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
            tierCycleStartDate: this.user.tierCycleStartDate,
            readAlerts: Array.isArray(this.user.readAlerts) ? this.user.readAlerts : [],
            // 🚀 [إصلاح جرس الإشعارات]: حفظ تاريخ تسجيل العميل لتشغيل درع "السفر عبر الزمن" بدقة
            createdAt: this._parseSafeTime(this.user.createdAt)
        };
        localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(safeUser));
    } catch (e) { console.error('Storage Quota Error:', e); }
}, updateUserProfile: async function(newData) {
        const uid = this.user?.uid || this.user?.id || localStorage.getItem('telecard_active_user_uid');
        if (!uid || typeof newData !== 'object' || Array.isArray(newData)) return false;
        
        const FORBIDDEN_KEYS = new Set(['walletBalance', 'balance', 'tierId', 'tier', 'totalSpent', 'totalDeposit', 'isBanned', 'isIpBanned', 'isRestricted', 'kycStatus', 'kycData', 'role', 'adminMessage', 'isVerified', 'devicePrints', 'passwordChangeHistory']);
        
        const sanitized = {};
        for (const key in newData) {
            if (!FORBIDDEN_KEYS.has(key) && Object.prototype.hasOwnProperty.call(newData, key)) sanitized[key] = newData[key];
        }
        
        if (Object.keys(sanitized).length === 0) return true;
        
        try {
            const success = await StoreDB.set(DB_KEYS.USERS, String(uid), sanitized, { merge: true });
            if (success) {
                this.user = { ...this.user, ...sanitized };
                this.saveUserLocal();
                return true;
            }
            return false;
        } catch (error) { return false; }
    },

    loadPrefs: function() {
        try {
            const saved = JSON.parse(localStorage.getItem(DB_KEYS.PREFS) || '{}');
            this.prefs = {
                sound: saved.sound !== false, theme: saved.theme || localStorage.getItem('telecard_theme') || 'dark',
                security2fa: saved.security2fa === true, favs: Array.isArray(saved.favs) ? saved.favs : []
            };
            this.favs = new Set(this.prefs.favs.map(String).filter(s => s.trim() !== '' && s !== 'NaN' && s !== 'undefined'));
        } catch (e) {
            this.prefs = { sound: true, theme: 'dark', security2fa: false, favs: [] };
            this.favs = new Set();
        }
    },
    
    savePrefs: function() {
        try {
            if (this.favs) this.prefs.favs = Array.from(this.favs);
            localStorage.setItem(DB_KEYS.PREFS, JSON.stringify(this.prefs || {}));
        } catch (e) { }
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
        const remainingDays = Math.max(0, Math.ceil((durationMs - (this.getNow() - Number(this.user.tierCycleStartDate || this.getNow()))) / 86400000)); 

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
        let q = Math.max(1, Number(qty) || 1);
        if (prod.type === 'select') q = 1; 

        const activeOffer = this.getActiveOffer(prod.id);
        const orderSnap = FinancialEngine.calculateOrderTotalUi({ product: prod, tier: this.getUserTier(user), offer: activeOffer, coupon: appliedCoupon, optIdx }, q);
        const oldPriceUsd = (activeOffer?.type === 'fake') ? Number(activeOffer.value || 0) : null;

        return {
            unitSnapshot: orderSnap, totalUsd: orderSnap.totalFinalPrice, unitUsd: orderSnap.finalPrice, 
            originalTotalUsd: orderSnap.totalOriginalPrice, saleDiscountUsd: orderSnap.offerDiscount * q, 
            couponDiscountUsd: orderSnap.couponDiscount * q, oldPriceUsd, 
            displayOldTotalUsd: oldPriceUsd ? (oldPriceUsd * q) : orderSnap.totalOriginalPrice
        };
    },
    
    computeSellingUsd: function(p, u, q=1, i=null) { return this.calculateFinalPrice(p, u, q, i, null).totalUsd; },
    _safeConvert: function(amt, f, t, r, c) { return FinancialEngine.convertViaUSD(amt, f, t, r, c); },

    getPricingLocal: function(prod, qty, optIdx, appliedCoupon) {
        if (!prod) return null;
        const baseCur = (this.user?.baseCurrency || LiveStoreData.settings?.defaultCurrency || 'USD').toUpperCase();
        const dispCur = (this.selectedCurr || baseCur).toUpperCase();
        const rates = this.getRates();
        const prc = this.calculateFinalPrice(prod, this.user, qty, optIdx, appliedCoupon);

        const totBase = Math.ceil(this._safeConvert(prc.totalUsd, 'USD', baseCur, rates, 'pricing') * 100) / 100;
        const untBase = Math.ceil(this._safeConvert(prc.unitUsd, 'USD', baseCur, rates, 'pricing') * 100) / 100;
        
        const valUnit = (dispCur === baseCur) ? untBase : this._safeConvert(untBase, baseCur, dispCur, rates, 'pricing');
        const valTotal = (dispCur === baseCur) ? totBase : this._safeConvert(totBase, baseCur, dispCur, rates, 'pricing');
        
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
    if (!cp) return { valid: false, msg: 'الكود غير صحيح أو غير موجود' };
    if (cp.isActive === false) return { valid: false, msg: 'هذا الكوبون غير فعال حالياً' };
    if (cp.expiryDate && this.getNow() > cp.expiryDate) return { valid: false, msg: 'انتهت صلاحية هذا الكوبون' };
    if (Number(cp.maxUses) > 0 && Number(cp.usedCount || 0) >= Number(cp.maxUses)) return { valid: false, msg: 'نفذت كمية الاستخدام المسموحة' };
    if (cp.targetTiers?.length > 0 && !cp.targetTiers.includes(String(this.getUserTier(this.user)?.id))) return { valid: false, msg: 'غير متاح لمستوى عضويتك' };
    if (cp.targetProds?.length > 0 && !cp.targetProds.includes(String(prod.id)) && !cp.targetProds.includes(String(prod.catId))) return { valid: false, msg: 'غير مخصص لهذا المنتج' };
    if (cp.allowedUsers?.length > 0 && !cp.allowedUsers.map(String).includes(String(this.user.uid || this.user.id))) return { valid: false, msg: 'مخصص لعملاء محددين' };
    
    if (Number(cp.maxPerUser) > 0) {
        // 🛡️ [إصلاح الكوبونات]: إضافة علامات الـ Backticks لتكوين المتغير النصي بشكل صحيح
        const used = (cp.usageHistory?.[`user_${this.user.uid || this.user.id}`]) || 0;
        if (used >= Number(cp.maxPerUser)) return { valid: false, msg: `استنفدت الحد الأقصى (${cp.maxPerUser} مرات)` };
    }
    
    if (Number(cp.minOrder) > 0) {
        const p = this.calculateFinalPrice(prod, this.user, qty, optIdx, null);
        if (p.totalUsd < Number(cp.minOrder)) return { valid: false, msg: `الحد الأدنى للاستخدام هو ${cp.minOrder}$` };
    }
    return { valid: true, coupon: cp };
},    getRates: function() { return FinancialEngine.normalizeRates(LiveStoreData.rates || {}); },
    convertViaUSDHelper: function(amt, f, t, rnd='round', c='pricing') {
        let v = this._safeConvert(amt, (f||'USD').toUpperCase(), (t||'USD').toUpperCase(), LiveStoreData.rates, c);
        if(rnd === 'floor') return Math.floor(v * 10000) / 10000;
        if(rnd === 'ceil')  return Math.ceil(v * 10000) / 10000;
        return Number(v.toFixed(4));
    },

    listenToUserUpdates: function(renderCb) {
        const activeUid = localStorage.getItem('telecard_active_user_uid');
        if (!activeUid) return;
        if (this._userUnsubscribe) this._userUnsubscribe();
        
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
                    }
                });
            }
        } catch (e) { console.warn("User Listener Error:", e); }
    },

    logout: async function() {
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
            me = (LiveStoreData.users || []).find(u => String(u.uid || u.id) === String(activeUid)) || JSON.parse(localStorage.getItem(ACTIVE_USER_KEY) || 'null');
            if (me && String(me.uid || me.id) !== String(activeUid)) me = null;
            
            // 🛡️ [حل مشكلة انحراف الوقت Time Drift]: مزامنة وقت السيرفر وتجديدها إذا مرت 6 ساعات
            const lastSync = sessionStorage.getItem('telecard_time_sync_ts');
            const now = Date.now();
            const needsSync = !lastSync || (now - Number(lastSync)) > (6 * 60 * 60 * 1000); 

            if (this.serverTimeOffset === 0 && !LiveStoreData.isOfflineMode && StoreDB.callFunction && needsSync) {
                StoreDB.callFunction('getServerTime').then(res => { 
                    if(res && res.serverTime) {
                        this.serverTimeOffset = res.serverTime - Date.now(); 
                        sessionStorage.setItem('telecard_time_sync_ts', Date.now().toString());
                    }
                }).catch(() => {});
            }
        }
        
        if (activeUid && !me && window.ClientSystem?.isReady) { this.logout(); return false; }
        
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
            this.listenToUserUpdates(window.UIManager ? () => window.UIManager.updateWalletUI() : null);
        } else if (!activeUid) {
            this.user = null;
        }
        
        if (await this.enforceIpBan()) return false;

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
        if (LiveStoreData.isOfflineMode) return false;
        try {
            const banned = LiveStoreData.settings?.bannedIps || [];
            if (!banned.length) return false;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            
            let ip = null;
            try { ip = (await fetch('https://api.ipify.org?format=json', { signal: controller.signal }).then(r => r.json())).ip; } 
            catch (e) {
                try { ip = (await fetch('https://ipapi.co/json/', { signal: controller.signal }).then(r => r.json())).ip; } 
                catch (e2) { console.warn("IP Check bypassed (AdBlocker)."); }
            }
            clearTimeout(timeoutId);

            if (ip && banned.includes(ip)) { this.logout(); return true; }
        } catch (e) { }
        return false;
    },

    ackAdminMessage: async function() { if (this.user?.uid) try { await this.updateUserProfile({ adminMessage: '' }); } catch(e) {} },

    updateWalletStats: function() {
        if (this.user) {
            this.user.totalSpent = Number(this.user.totalSpent || 0);
            this.user.totalDeposit = Number(this.user.totalDeposit || 0);
        }
    },

    submitPasswordChange: async function(cVal, nVal, confVal) {
        if (!nVal || nVal.length < 6) return { success: false, msg: 'كلمة المرور يجب أن لا تقل عن 6 أحرف.' };
        if (nVal !== confVal) return { success: false, msg: 'كلمتا المرور غير متطابقتين.' };
        if (!cVal) return { success: false, msg: 'أدخل كلمة المرور الحالية.' };
        
        const now = this.getNow();
        let hist = (this.user?.passwordChangeHistory || []).filter(ts => (now - ts) < 86400000);
        if (hist.length >= 3) return { success: false, msg: `استنفدت الحد الأقصى. حاول بعد ${Math.ceil((86400000 - (now - hist[0])) / 3600000)} ساعة.` };
        
        try {
            hist.push(now);
            await this.updateUserProfile({ passwordChangeHistory: hist });
            const result = await StoreDB.changeUserPassword(cVal, nVal);
            if (result.success) return { success: true, msg: 'تم التحديث بنجاح.' };
            hist.pop();
            await this.updateUserProfile({ passwordChangeHistory: hist });
            return { success: false, msg: result.msg };
        } catch (e) { return { success: false, msg: 'خطأ بالاتصال.' }; }
    },

    _currentPurchaseKey: null,
    confirmPurchase: async function(prod, qty, optIdx, finalInputStr, appliedCoupon) {
        if (LiveStoreData.isOfflineMode) return { success: false, msg: 'أنت تتصفح بدون انترنت.' };
        if (!prod || !this.user) return { success: false, msg: 'بيانات مفقودة' };
        
        this._currentPurchaseKey = this._currentPurchaseKey || this.generateIdempotencyKey();
        try {
            const req = { productId: String(prod.id), qty: Number(qty) || 1, optIdx: optIdx ?? null, finalInputStr: finalInputStr || '---', couponCode: appliedCoupon?.code || null, idempotencyKey: this._currentPurchaseKey };
            const res = await StoreDB.callFunction('createOrder', req);
            this._currentPurchaseKey = null;
            return { success: true, msg: res.message || 'تم إتمام الطلب', isAutoDelivered: res.isAutoDelivered, deliveredCodeText: res.deliveredCode };
        } catch (err) {
            const code = err.code || '';
            const msg = String(err.message || '').toLowerCase();
            if (!['unavailable', 'deadline-exceeded', 'internal'].includes(code)) this._currentPurchaseKey = null;
            if (code === 'failed-precondition' || msg.includes('رصيد')) return { success: false, msg: 'رصيدك غير كافٍ.' };
            if (code === 'already-exists' || msg.includes('مسبقاً')) return { success: false, msg: 'تم استلام طلبك بالفعل.' };
            if (code === 'resource-exhausted') return { success: false, msg: 'المنتج نفد من المخزون.' };
            if (code === 'not-found') return { success: false, msg: 'المنتج غير متوفر.' };
            if (code === 'permission-denied') { this.syncUser(); return { success: false, msg: 'حساب مقيد.' }; }
            return { success: false, msg: 'خطأ بالشبكة، تحقق من طلباتك.' };
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
        let net = s.feeType === 'bonus' ? amt + feeAmt : amt - feeAmt;
        let netBase = this.convertViaUSDHelper(net, curr, this.user.baseCurrency || 'USD', 'floor', 'deposit');
        return { isValid: true, netBase: isNaN(netBase) ? 0 : netBase, feePct: s.fee, feeType: s.feeType, feeUnit: s.feeUnit, feeAmount: feeAmt };
    },

    _currentDepositKey: null,
    submitBalanceRequest: async function(amt, method, payCurr, receipt) {
        if (!method) return { success: false, msg: 'طريقة الدفع مفقودة' };
        if (amt <= 0) return { success: false, msg: 'مبلغ غير صالح' };
        if (method.reqProof !== false && !receipt) return { success: false, msg: 'أرفق الإشعار', errType: 'receipt' };
        
        this._currentDepositKey = this._currentDepositKey || this.generateIdempotencyKey();
        try {
            const req = { amount: Number(amt), paymentMethodName: method.name, payCurr, receiptData: receipt, idempotencyKey: this._currentDepositKey };
            const res = await StoreDB.callFunction('submitBalanceRequest', req);
            this._currentDepositKey = null; 
            return { success: true, msg: res.message || 'تم الإرسال' };
        } catch (err) {
            const code = err.code || '';
            if (!['unavailable', 'deadline-exceeded', 'internal'].includes(code)) this._currentDepositKey = null;
            if (code === 'already-exists') return { success: false, msg: 'طلب قيد المراجعة.' };
            if (code === 'resource-exhausted') return { success: false, msg: 'انتظر قليلاً.' };
            if (code === 'permission-denied') { this.syncUser(); return { success: false, msg: 'حساب مقيد.' }; }
            return { success: false, msg: 'تعذر الإرسال، جرب لاحقاً.' };
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
        if (this._notifUnsubscribe) this._notifUnsubscribe();
        try {
            this._notifUnsubscribe = StoreDB.listenCollection(`telecard_users/${this.user.uid}/notifications`, (notifs) => {
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
        if (typeof val === 'string') return new Date(val).getTime() || 0;
        return 0;
    },

    _isAlertForUser: function(msg, user, now, readIds = [], excludeRead = false) {
    const type = msg.targetType || msg.target || 'all';
    const tId = String(msg.targetId || msg.userId || msg.tierId || '');
    const isForMe = type === 'all' || (type === 'user' && tId === String(user.uid)) || (type === 'tier' && tId === String(user.tierId));
    
    // 1. استبعاد الإشعارات غير المخصصة له أو المنتهية الصلاحية
    if (!isForMe || (msg.expiresAt && now > msg.expiresAt)) return false;
    
    // 2. استبعاد الإشعارات المقروءة
    if (excludeRead && (msg.isRead || readIds.includes(String(msg.id)))) return false;
    
    // 🚀 3. [درع السفر عبر الزمن - Time Travel Guard]: منع الإشعارات القديمة للعملاء الجدد
    if (type !== 'user') {
        const userCreatedTime = this._parseSafeTime(user.createdAt);
        // جلب وقت الإشعار من أي حقل متاح (createdAt أو time أو timestamp)
        const alertTime = this._parseSafeTime(msg.createdAt || msg.time || msg.timestamp);
        
        // إذا كان حساب العميل موجوداً، والإشعار له تاريخ، والإشعار أقدم من الحساب -> احذفه من العرض!
        if (userCreatedTime > 0 && alertTime > 0 && alertTime < userCreatedTime) {
            return false;
        }
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
        
        // 🛡️ [إصلاح مزامنة الإشعارات]: تحديث السيرفر لكل إشعارات العميل لضمان تطابق الحالة بين الأجهزة
        if (this.user?.uid && localNotif) {
            updates.push(StoreDB.set(`telecard_users/${this.user.uid}/notifications`, msg.id, { isRead: true }, { merge: true }).catch(() => {}));
        }
    }
    
    const cappedReadIds = readIds.slice(-50);
    localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(cappedReadIds));
    if (this.user?.uid) this.updateUserProfile({ readAlerts: cappedReadIds }).catch(() => {});
    
    if (window.UIManager?.updateNotifBadges) window.UIManager.updateNotifBadges();
    if (window.RenderManager?.renderNotifCenterList) window.RenderManager.renderNotifCenterList();
    
    if (updates.length > 0) await Promise.all(updates);
},
    sendPasswordResetEmail: async function(email) { return email ? await StoreDB.sendResetEmail(email) : { success: false, msg: 'بريد مفقود.' }; },

    injectSilentSensor: async function() {
        if (!this.user?.uid) return;
        try {
            const fp = await import('https://openfpcdn.io/fingerprintjs/v4').catch(() => null);
            if (!fp) {
                // 🛡️ [تتبع صامت]: في حال تم حظر السكربت، يتم تسجيل الحدث داخلياً للمراقبة بدون تنبيه للمستخدم
                console.debug("[Sensor] Fingerprint load prevented gracefully.");
                return; 
            }
            
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
        } catch (e) {
            console.debug("[Sensor] Execution skipped due to environment limits.");
        }
    },
    
    generateTOTPSecret: async function() { return await StoreDB.generateTOTPSecret(); },
    enrollTOTP: async function(secret, code) { return await StoreDB.enrollTOTP(secret, code); },
    unenrollMFA: async function() { return await StoreDB.unenrollMFA(); },
    is2FAEnabled: function() { return auth?.currentUser?.multiFactor?.enrolledFactors?.length > 0; }
};

Object.defineProperty(DataManager, 'enforceIpBan', { configurable: false, writable: false });
