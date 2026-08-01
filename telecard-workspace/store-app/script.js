// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (script.js) - الإصدار الماسي الخارق V16.2 💎
// 🎯 الوظيفة: الأوركسترا المركزية، الإقلاع السريع، إدارة الكاش الذكي، والتوافقية
// 🚀 التحديثات المعمارية:
// 1. Architecture Sync: التخلي عن الدمج اليدوي العشوائي والاعتماد الكامل على UIManager المحصن.
// 2. Loop Firewall: حماية المتجر من حلقة التحديث اللانهائية (Refresh Loop) عبر Session Storage.
// 3. True Offline Hydration: إجبار واجهة المحفظة والطلبات على رسم بيانات الكاش فوراً بانتظار السيرفر.
// ============================================================================

const isNativeIdle = typeof window.requestIdleCallback === 'function';
window.requestIdleCallback = window.requestIdleCallback || function(cb) {
    const start = Date.now();
    return setTimeout(() => cb({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
    }), 1);
};
window.cancelIdleCallback = window.cancelIdleCallback || (isNativeIdle ? window.cancelIdleCallback : window.clearTimeout);

import { auth } from './core/firebaseAdapter.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { DB_KEYS, CACHE_KEYS, APP_VERSION } from './config.js';
import { Utils } from './utils.js';
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import { RenderManager } from './renderManager.js';
import { Components, CalendarApp } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';

// 🛡️ المساعدة لتنسيق الوقت بشكل موحد
const _normalizeDataTime = (dataArray) => {
    if (!Array.isArray(dataArray)) return [];
    return dataArray.map(item => ({
        ...item,
        time: item.time && typeof item.time !== 'object' ? RenderHelpers.parseTime(item.time) : item.time,
        createdAt: item.createdAt && typeof item.createdAt !== 'object' ? RenderHelpers.parseTime(item.createdAt) : item.createdAt,
        actionTime: item.actionTime && typeof item.actionTime !== 'object' ? RenderHelpers.parseTime(item.actionTime) : item.actionTime
    }));
};

// 🛡️ التحديث 1: الاعتماد 100% على UIManager المحصن وإلغاء الدمج المكرر
const ClientSystem = UIManager; 

// إضافة خواص التشغيل فقط
Object.assign(ClientSystem, {
    isReady: false,
    activeListeners: [], 
    userAuthListeners: [],
    _networkSensorsBound: false, 
    _authUnsubscribe: null,
    _isUpdatingServer: false,

    clearFirebaseListeners: function() {
        [...this.activeListeners, ...this.userAuthListeners].forEach(unsub => {
            if (typeof unsub === 'function') try { unsub(); } catch(e){}
        });
        this.activeListeners = [];
        this.userAuthListeners = [];
        
        if (StoreDB && typeof StoreDB.killAllListeners === 'function') {
            StoreDB.killAllListeners();
        }
    },

    enforceBiometricLock: async function() {
        const lockScreen = document.getElementById('biometric-lock-screen');
        if (!lockScreen) return false;
        
        const isBiometricRequired = DataManager.user?.biometricEnabled === true;
        const savedRawId = localStorage.getItem(CACHE_KEYS.BIOMETRIC_KEY || 'telecard_biometric_key');

        if (!window.PublicKeyCredential || !savedRawId) {
            if (isBiometricRequired) {
                lockScreen.classList.remove('active');
                this.showToast?.('مفتاح البصمة مفقود. يرجى تسجيل الدخول.', 'error');
                DataManager.logout?.();
                return false;
            }
            lockScreen.classList.remove('active');
            return true;
        }
        
        try {
            const retryBtn = document.getElementById('btn-biometric-retry');
            if (retryBtn) { retryBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحقق...'; retryBtn.disabled = true; }
            
            const challenge = new Uint8Array(32); window.crypto.getRandomValues(challenge);
            const rawIdBytes = new Uint8Array(savedRawId.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            
            await navigator.credentials.get({ publicKey: { challenge, timeout: 60000, userVerification: "required", allowCredentials: [{ type: "public-key", id: rawIdBytes }] } });
            
            lockScreen.classList.remove('active'); return true;
        } catch (error) {
            const retryBtn = document.getElementById('btn-biometric-retry');
            if (retryBtn) { retryBtn.innerHTML = '<i class="fa-solid fa-fingerprint"></i> المحاولة مجدداً'; retryBtn.disabled = false; }
            return false;
        }
    },  

    initNetworkSensors: function() {
        if (this._networkSensorsBound) return;
        this._networkSensorsBound = true;

        let networkCooldownTimer = null; 
        
        window.addEventListener('offline', () => {
            if (networkCooldownTimer) clearTimeout(networkCooldownTimer);
            this.showToast?.('انقطع الاتصال بالإنترنت. أنت تتصفح البيانات المحفوظة.', 'warning');
            document.body.classList.add('is-offline');
        });
        
        window.addEventListener('online', () => {
            document.body.classList.remove('is-offline');
            this.showToast?.('عاد الاتصال بالإنترنت! جاري المزامنة...', 'success');
            
            if (this.isReady) {
                if (networkCooldownTimer) clearTimeout(networkCooldownTimer);
                networkCooldownTimer = setTimeout(() => {
                    try { this.initFirebaseListeners(); } catch(e){}
                }, 3000); 
            }
        });
    }
});

ClientSystem.initFirebaseListeners = function() {
    console.log("📡 جاري تشغيل مستمعات السحابة الحية...");
    this.clearFirebaseListeners(); 
    
    if (DB_KEYS.SETTINGS) {
        this.activeListeners.push(StoreDB.listenDoc(DB_KEYS.SETTINGS, 'singleton', (incoming) => {
            if (!incoming) return;            
            const serverVersion = String(incoming.appVersion || '0');
            const localServerVersion = localStorage.getItem('telecard_server_version') || '0';
            
            if (serverVersion !== '0' && serverVersion !== localServerVersion) {
                if (this._isUpdatingServer) return; 
                this._isUpdatingServer = true;
                
                // 🛡️ التحديث 2: حماية المتجر من حلقة التحديث הלانهائية
                const reloadCount = parseInt(sessionStorage.getItem('tc_update_reloads') || '0');
                if (reloadCount > 2) {
                    console.error("🚨 تم إيقاف حلقة التحديث הלانهائية للحماية.");
                    return;
                }
                sessionStorage.setItem('tc_update_reloads', String(reloadCount + 1));
                
                console.warn(`🔄 الإدارة أصدرت تحديثاً إجبارياً! (إلى الإصدار ${serverVersion})`);
                if(this.showToast) this.showToast('يتوفر تحديث جديد للمتجر. جاري إعادة التحميل...', 'success');
                
                setTimeout(async () => {
                    localStorage.setItem('telecard_server_version', serverVersion);
                    const clearPromises = [];
                    
                    if (typeof indexedDB !== 'undefined') {
                        clearPromises.push(new Promise(res => {
                            const req = indexedDB.deleteDatabase('TeleCardStoreDB');
                            req.onsuccess = res; req.onerror = res; req.onblocked = res;
                        }));
                    }
                    
                    const keysToRemove = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && (k.startsWith('telecard_store_cache') || k === CACHE_KEYS.SMART_CATALOG || k === CACHE_KEYS.CATALOG_VERSION)) {
                            keysToRemove.push(k);
                        }
                    }
                    keysToRemove.forEach(k => localStorage.removeItem(k));
                    
                    if ('caches' in window) {
                        clearPromises.push(caches.keys().then(names => Promise.all(names.map(name => caches.delete(name)))));
                    }
                    if ('serviceWorker' in navigator) { 
                        clearPromises.push(navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister())))); 
                    }
                    
                    await Promise.race([Promise.all(clearPromises), new Promise(r => setTimeout(r, 2000))]);
                    window.location.replace(window.location.href.split('#')[0]);
                }, 2000);
                return;
            }

            LiveStoreData.settings = incoming;
            RenderHelpers.init({ settings: LiveStoreData.settings, rates: LiveStoreData.rates || [], offers: LiveStoreData.offers || [], isStore: true });
            
            if(DataManager.syncUser) DataManager.syncUser().then(() => {
                if(this.updateDisplayCurrencyUI) this.updateDisplayCurrencyUI(DataManager.selectedCurr); 
            }); 
            
            if(this.applyStoreIdentity) this.applyStoreIdentity();
        }));
    }
    
    if (DB_KEYS.ALERTS) {
        this.activeListeners.push(StoreDB.listenCollection(DB_KEYS.ALERTS, (data) => {
            LiveStoreData.alerts = _normalizeDataTime(Array.isArray(data) ? data : []);
            requestAnimationFrame(() => { 
                if(this.processAndDisplayAlerts) this.processAndDisplayAlerts(); 
                if(this.updateNotifBadges) this.updateNotifBadges(); 
            });
        }));
    }
    
    if (!auth) return; 
    
    if (this._authUnsubscribe) this._authUnsubscribe();
    
    this._authUnsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        this.userAuthListeners.forEach(unsub => { if (typeof unsub === 'function') unsub(); });
        this.userAuthListeners = [];

        if (firebaseUser) {
            const uidStr = firebaseUser.uid;
            localStorage.setItem(CACHE_KEYS.ACTIVE_UID || 'telecard_active_user_uid', uidStr);
            
            if (this.listenToUserNotifications) {
                const notifUnsub = this.listenToUserNotifications(() => requestAnimationFrame(() => { 
                    if(this.processAndDisplayAlerts) this.processAndDisplayAlerts(); 
                    if(this.updateNotifBadges) this.updateNotifBadges(); 
                }));
                if (notifUnsub) this.userAuthListeners.push(notifUnsub);
            }

            if (StoreDB.listenDoc) {
                this.userAuthListeners.push(StoreDB.listenDoc(DB_KEYS.USERS, uidStr, (userData) => {
                    if (userData) {
                        if (userData.isBanned || userData.isIpBanned) {
                            this.clearFirebaseListeners();
                            if (this.triggerLiveBanAlert) {
                                this.triggerLiveBanAlert(userData.banReason || 'نعتذر، تم حظر حسابك.');
                            } else {
                                signOut(auth).catch(()=>{}); 
                                if(DataManager.logout) DataManager.logout(); 
                            }
                            return; 
                        }
                        LiveStoreData.users = [userData];
                        requestAnimationFrame(() => { 
                            if(DataManager.syncUser) DataManager.syncUser(); 
                            if(this.updateDisplayBalance) this.updateDisplayBalance(); 
                            if(this.updateNotifBadges) this.updateNotifBadges(); 
                        });
                    }
                }));
            }
            
            if (StoreDB.listenQuery) {
                this.userAuthListeners.push(StoreDB.listenQuery(DB_KEYS.ORDERS, ['userId', '==', uidStr], 'time', 30, (data, lastDoc) => {
                    const normData = _normalizeDataTime(Array.isArray(data) ? data : []);
                    LiveStoreData.orders = normData;
                    
                    try { 
                        const minifiedOrders = normData.map(o => ({ id: o.id, displayId: o.displayId, product: o.product, price: o.price, priceCurrency: o.priceCurrency, status: o.status, time: o.time, createdAt: o.createdAt, pricingSnapshot: o.pricingSnapshot }));
                        localStorage.setItem(`tc_orders_cache_${uidStr}`, JSON.stringify(minifiedOrders)); 
                    } catch(e){}
                    
                    DataManager.cursors = DataManager.cursors || {}; DataManager.cursors.orders = data.length < 30 ? null : lastDoc;
                    
                    requestAnimationFrame(() => { 
                        if (RenderManager.renderOrders && document.getElementById('orders-modal')?.classList.contains('active')) {
                            RenderManager.renderOrders(true); 
                        }
                    });
                }));
                
                this.userAuthListeners.push(StoreDB.listenQuery(DB_KEYS.DEPOSITS, ['userId', '==', uidStr], 'time', 30, (data, lastDoc) => {
                    const normData = _normalizeDataTime(Array.isArray(data) ? data : []);
                    LiveStoreData.deposits = normData;
                    
                    try { 
                        const minifiedDeposits = normData.map(d => ({ id: d.id, displayId: d.displayId, amount: d.amount, creditedAmount: d.creditedAmount, targetCurrency: d.targetCurrency, method: d.method, status: d.status, time: d.time, createdAt: d.createdAt }));
                        localStorage.setItem(`tc_deposits_cache_${uidStr}`, JSON.stringify(minifiedDeposits)); 
                    } catch(e){}
                    
                    DataManager.cursors = DataManager.cursors || {}; DataManager.cursors.deposits = data.length < 30 ? null : lastDoc;
                    
                    requestAnimationFrame(() => { 
                        const isWalletOpen = document.getElementById('wallet-modal')?.classList.contains('active');
                        const isMyPayOpen = document.getElementById('mypay-modal')?.classList.contains('active');
                        if (isWalletOpen && RenderManager.renderWallet) RenderManager.renderWallet(true); 
                        if (isMyPayOpen && RenderManager.renderPayments) RenderManager.renderPayments(true); 
                    });
                }));
            }
        } else {
            console.log("👤 العميل زائر. تم تنظيف المستمعات.");
            localStorage.removeItem(CACHE_KEYS.ACTIVE_UID || 'telecard_active_user_uid');
            LiveStoreData.users = []; LiveStoreData.orders = []; LiveStoreData.deposits = [];
            DataManager.cursors = {}; 
            if(DataManager.syncUser) DataManager.syncUser(); 
            if(this.updateDisplayBalance) this.updateDisplayBalance();
        }
    });
};

ClientSystem.init = async function() {
    this.isReady = true;
    console.log(`🚀 جاري إقلاع المتجر (نسخة المحرك الماسي ${APP_VERSION})...`);
    
    if (typeof RenderHelpers !== 'undefined' && RenderHelpers.init) {
        RenderHelpers.init({ settings: {}, rates: [], offers: [], isStore: true });
    }

    try {
        const currentVersion = APP_VERSION || "1.0.0";
        const savedVersion = localStorage.getItem('telecard_app_version');

        if (savedVersion && savedVersion !== currentVersion) {
            console.warn(`🔄 تم اكتشاف تحديث محلي للمتجر! جاري التحديث من ${savedVersion} إلى ${currentVersion}...`);
            
            const clearPromises = [];
            if (typeof indexedDB !== 'undefined') {
                clearPromises.push(new Promise(res => {
                    const req = indexedDB.deleteDatabase('TeleCardStoreDB');
                    req.onsuccess = res; req.onerror = res; req.onblocked = res;
                }));
            }
            if ('serviceWorker' in navigator) { 
                clearPromises.push(navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister())))); 
            }
            if ('caches' in window) {
                clearPromises.push(caches.keys().then(names => Promise.all(names.map(name => caches.delete(name)))));
            }
            
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k.startsWith('telecard_store_cache') || k === CACHE_KEYS.SMART_CATALOG || k === CACHE_KEYS.CATALOG_VERSION)) {
                    keysToRemove.push(k);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            
            localStorage.setItem('telecard_app_version', currentVersion);
            
            await Promise.race([Promise.all(clearPromises), new Promise(r => setTimeout(r, 2000))]);
            window.location.replace(window.location.href.split('#')[0]); 
            return; 
        } else if (!savedVersion) {
            localStorage.setItem('telecard_app_version', currentVersion);
        }
    } catch (e) {}

    // 🛡️ التحديث 3: الترطيب المبكر ورسم الكاش فوراً قبل رد السيرفر
    try {
        const activeUid = localStorage.getItem(CACHE_KEYS.ACTIVE_UID || 'telecard_active_user_uid');
        if (activeUid) {
            const cachedOrders = JSON.parse(localStorage.getItem(`tc_orders_cache_${activeUid}`) || '[]');
            const cachedDeposits = JSON.parse(localStorage.getItem(`tc_deposits_cache_${activeUid}`) || '[]');
            
            if (cachedOrders.length > 0) {
                LiveStoreData.orders = cachedOrders;
                if (document.getElementById('orders-modal')?.classList.contains('active')) RenderManager.renderOrders(true);
            }
            if (cachedDeposits.length > 0) {
                LiveStoreData.deposits = cachedDeposits;
                if (document.getElementById('wallet-modal')?.classList.contains('active')) RenderManager.renderWallet(true);
            }
        }
    } catch (e) {
        console.warn("⚠️ [Cache Hydration] تعذر جلب السجلات المؤقتة.");
    }

    try {
        if(DataManager.loadPrefs) DataManager.loadPrefs();
        if(DataManager.syncUser) await DataManager.syncUser().catch(()=>{});
        if(this.applySavedTheme) this.applySavedTheme();
        
        DataManager.selectedCurr = localStorage.getItem(CACHE_KEYS.DISPLAY_CURRENCY || 'telecard_display_currency') || LiveStoreData.settings?.defaultCurrency || 'USD';
        if(this.updateDisplayCurrencyUI) this.updateDisplayCurrencyUI(DataManager.selectedCurr);
        if(this.toggleHeroSection) this.toggleHeroSection(true);
    } catch(e) {}

    try {
        if (this.checkSystemStatus && this.checkSystemStatus()) return;
        
        if(this.initGlobalListeners) this.initGlobalListeners(); 

        await DataManager.initStoreCatalog();

        if (typeof RenderHelpers !== 'undefined' && RenderHelpers.init) {
            RenderHelpers.init({ settings: LiveStoreData.settings || {}, rates: LiveStoreData.rates || [], offers: LiveStoreData.offers || [], isStore: true });
        }
        
        const removeSplashScreen = () => {
            const splash = document.getElementById('global-splash-screen');
            if (splash) { 
                splash.style.opacity = '0'; 
                splash.style.visibility = 'hidden'; 
                setTimeout(() => { if (splash) splash.remove(); }, 400); 
            }
        };
        requestAnimationFrame(removeSplashScreen);

        if(this.applyStoreIdentity) this.applyStoreIdentity();
        if(this.initSlider) this.initSlider(); 
        if(this.renderTicker) this.renderTicker(); 
        if(this.updateProfileDisplay) this.updateProfileDisplay();

        const sName = LiveStoreData.settings?.storeName || LiveStoreData.settings?.name || 'TeleCard';
        const splashName = document.getElementById('splash-store-name');
        if (splashName) splashName.innerText = sName;
        localStorage.setItem(CACHE_KEYS.SPLASH_NAME || 'telecard_splash_name', sName);

        if (this.isReady && RenderManager) {
            const secKeys = ['COUPONS', 'COUNTRIES', 'PAYMENTS'];
            const promises = secKeys.map(k => StoreDB.getAll(DB_KEYS[k]).catch(() => []));
            
            Promise.all(promises).then(results => {
                secKeys.forEach((key, i) => {
                    if (results[i] && results[i].length > 0) {
                        LiveStoreData[key.toLowerCase()] = results[i];
                    }
                });
                if(RenderManager.renderHome) RenderManager.renderHome(); 
                if(this.initSlider) this.initSlider(); 
                if(this.updateDisplayBalance) this.updateDisplayBalance();
                
                if (document.getElementById('balance-modal')?.classList.contains('active')) {
                    if(RenderManager.renderPayMethods) RenderManager.renderPayMethods();
                }
            });
        }
    } catch (e) {
        console.error("🚨 خطأ أثناء محاولة إقلاع الواجهة:", e);
        const splash = document.getElementById('global-splash-screen');
        if (splash) splash.remove();
    }

    try {
        setTimeout(() => { if(DataManager.injectSilentSensor) DataManager.injectSilentSensor(); }, 3000);
        if(this.updateDisplayBalance) this.updateDisplayBalance();
        
        requestIdleCallback(() => {
            if (!this.isReady) return;
            try { this.initFirebaseListeners(); } catch (e) {}
            try { if(CalendarApp?.init) CalendarApp.init(); } catch (e) {}
            
            ['updateSidebarText', 'initSupportButton', 'applyFontSettings', 'refreshCurrencyMenuFlags', 'renderSettingsUI', 'loadUserImageAutomatically', 'restoreDisplayState', 'setupMainContentClickDetector', 'initSwipeGestures']
            .forEach(m => { try { if(this[m]) this[m](); } catch (e) {} });
            
            if(Components.initBottomNavSync) Components.initBottomNavSync();
            if(this.checkKycCelebration) this.checkKycCelebration();
        }, { timeout: 2000 });
        
    } catch (e) {}
};

// إعداد بيئة آمنة تضمن أن النظام جاهز للعمل بشكل موحد
if (typeof globalThis !== 'undefined') {
    if (!globalThis.ClientSystem) {
        Object.defineProperty(globalThis, 'ClientSystem', {
            value: ClientSystem,
            writable: false, 
            configurable: false 
        });
    }
    if (!globalThis.CalendarApp) {
        Object.defineProperty(globalThis, 'CalendarApp', {
            value: CalendarApp,
            writable: false,
            configurable: false
        });
    }
}

(function() {
    const startApp = () => { if (globalThis.ClientSystem?.init) globalThis.ClientSystem.init(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApp);
    else startApp();
})();