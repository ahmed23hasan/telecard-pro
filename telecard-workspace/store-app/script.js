// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (script.js) - الإصدار المؤسسي V17.6.0 💎
// 🎯 الوظيفة: الأوركسترا المركزية، الإقلاع الآمن، عزل الحالة، وإدارة الجلسات
// 🚀 التحديثات المعمارية الصارمة:
// 1. Push Prompt Trigger: استدعاء نافذة الإشعارات الأنيقة بذكاء بعد الترحيب بالعميل.
// 2. Biometric Fallback: طرد صريح (Hard Logout) عند فشل البصمة لمنع تجميد الجلسة.
// 3. Loop Fix: حماية حلقة التحديث اللانهائية عبر ختم زمني (Timestamp) في الجلسة.
// 4. Cross-Tab Sync: مزامنة فورية لتسجيل الخروج بين النوافذ المفتوحة.
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
import * as Utils from './utils.js'; 
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import { RenderManager } from './renderManager.js';
import { Components, CalendarApp } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';

const _updateLiveArray = (arr, newData) => { if (arr) { arr.length = 0; if (Array.isArray(newData)) arr.push(...newData); } };
const _updateLiveObject = (obj, newData) => { if (obj) { Object.keys(obj).forEach(k => delete obj[k]); if (newData) Object.assign(obj, newData); } };

const _normalizeDataTime = (dataArray) => {
    if (!Array.isArray(dataArray)) return [];
    return dataArray.map(item => ({
        ...item,
        time: item.time && typeof item.time !== 'object' ? RenderHelpers.parseTime(item.time) : item.time,
        createdAt: item.createdAt && typeof item.createdAt !== 'object' ? RenderHelpers.parseTime(item.createdAt) : item.createdAt,
        actionTime: item.actionTime && typeof item.actionTime !== 'object' ? RenderHelpers.parseTime(item.actionTime) : item.actionTime
    }));
};

const AppController = {
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
        const mainApp = document.querySelector('.main-wrapper') || document.getElementById('app-container');
        const isBiometricRequired = DataManager.user?.biometricEnabled === true;
        const savedRawId = localStorage.getItem(CACHE_KEYS.BIOMETRIC_KEY);
        
        if (!isBiometricRequired) {
            if (mainApp) mainApp.style.display = ''; 
            return true; 
        }
        
        if (mainApp) mainApp.style.display = 'none';
        if (lockScreen) lockScreen.classList.add('active'); 
        
        if (!window.PublicKeyCredential || !savedRawId) {
            if (lockScreen) lockScreen.classList.remove('active');
            UIManager.showToast?.('البصمة غير مدعومة أو تم مسحها. يرجى تسجيل الدخول.', 'warning');
            if (DataManager.logout) DataManager.logout(true);
            return false;
        }
        
        try {
            const retryBtn = document.getElementById('btn-biometric-retry');
            if (retryBtn) {
                retryBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحقق...';
                retryBtn.disabled = true;
            }
            
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            
            let base64 = savedRawId.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) { base64 += '='; }
            const binaryString = atob(base64);
            const rawIdBytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                rawIdBytes[i] = binaryString.charCodeAt(i);
            }
            
            await navigator.credentials.get({
                publicKey: {
                    challenge,
                    timeout: 60000,
                    userVerification: "required",
                    allowCredentials: [{ type: "public-key", id: rawIdBytes }]
                }
            });
            
            if (lockScreen) lockScreen.classList.remove('active');
            if (mainApp) {
                mainApp.style.display = '';
                window.dispatchEvent(new Event('resize')); 
            }
            return true;
        } catch (error) {
            console.warn("فشل التحقق من البصمة:", error);
            const retryBtn = document.getElementById('btn-biometric-retry');
            if (retryBtn) {
                retryBtn.innerHTML = '<i class="fa-solid fa-fingerprint"></i> المحاولة مجدداً';
                retryBtn.disabled = false;
                retryBtn.onclick = () => this.enforceBiometricLock();
            }
            return false;
        }
    },

    initNetworkSensors: function() {
        if (this._networkSensorsBound) return;
        this._networkSensorsBound = true;

        let networkCooldownTimer = null; 
        
        window.addEventListener('offline', () => {
            if (networkCooldownTimer) clearTimeout(networkCooldownTimer);
            UIManager.showToast?.('انقطع الاتصال بالإنترنت. أنت تتصفح البيانات المحفوظة.', 'warning');
            document.body.classList.add('is-offline');
        });
        
        window.addEventListener('online', () => {
            document.body.classList.remove('is-offline');
            UIManager.showToast?.('عاد الاتصال بالإنترنت! جاري المزامنة...', 'success');
            
            if (UIManager.isReady) {
                if (networkCooldownTimer) clearTimeout(networkCooldownTimer);
                networkCooldownTimer = setTimeout(() => {
                    try { this.initFirebaseListeners(); } catch(e){}
                }, 3000); 
            }
        });
    },

    initFirebaseListeners: function() {
        console.log("📡 جاري تشغيل مستمعات السحابة الحية...");
        this.clearFirebaseListeners(); 
        
        if (DB_KEYS.SETTINGS) {
            this.activeListeners.push(StoreDB.listenDoc(DB_KEYS.SETTINGS, 'singleton', (incoming) => {
                if (!incoming) return;            
                
                const serverVersion = String(incoming.appVersion || '0').trim();
                const localAppVersion = String(localStorage.getItem('tc_app_version') || '0').trim();
                
                if (serverVersion !== '0' && serverVersion !== localAppVersion) {
                    if (this._isUpdatingServer) return; 
                    this._isUpdatingServer = true;
                    
                    const reloadData = JSON.parse(sessionStorage.getItem('tc_update_reloads_v2') || '{"count":0, "time":0}');
                    const now = Date.now();
                    
                    if (reloadData.count > 2 && (now - reloadData.time) < 60000) {
                        console.error("🚨 تم إيقاف حلقة التحديث اللانهائية للحماية.");
                        return;
                    }
                    
                    sessionStorage.setItem('tc_update_reloads_v2', JSON.stringify({
                        count: (now - reloadData.time) > 60000 ? 1 : reloadData.count + 1,
                        time: now
                    }));
                    
                    console.warn(`🔄 الإدارة أصدرت تحديثاً إجبارياً! (إلى الإصدار ${serverVersion})`);
                    if(UIManager.showToast) UIManager.showToast('يتوفر تحديث جديد للمتجر. جاري إعادة التحميل...', 'success');
                    
                    setTimeout(async () => {
                        localStorage.setItem('tc_app_version', serverVersion);
                        const clearPromises = [];
                        
                        const keysToRemove = [];
                        for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i);
                            if (k && (k.startsWith('telecard_store_cache') || k === CACHE_KEYS.SMART_CATALOG || k === CACHE_KEYS.CATALOG_VERSION)) {
                                keysToRemove.push(k);
                            }
                        }
                        keysToRemove.forEach(k => localStorage.removeItem(k));
                        
                        if ('caches' in window) {
                            clearPromises.push(caches.keys().then(names => Promise.all(names.map(name => caches.delete(name)))).catch(()=>[]));
                        }
                        if ('serviceWorker' in navigator) { 
                            clearPromises.push(navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister()))).catch(()=>[])); 
                        }
                        
                        await Promise.race([Promise.all(clearPromises), new Promise(r => setTimeout(r, 2000))]);
                        window.location.replace(window.location.href.split('#')[0]);
                    }, 2000);
                    return;
                }

                _updateLiveObject(LiveStoreData.settings, incoming);
                RenderHelpers.init({ settings: LiveStoreData.settings, rates: LiveStoreData.rates || [], offers: LiveStoreData.offers || [], isStore: true });
                
                if(DataManager.syncUser) DataManager.syncUser().then(() => {
                    if(UIManager.updateDisplayCurrencyUI) UIManager.updateDisplayCurrencyUI(DataManager.selectedCurr); 
                }); 
                
                if(UIManager.applyStoreIdentity) UIManager.applyStoreIdentity();
            }));
        }
        
        if (DB_KEYS.ALERTS) {
            this.activeListeners.push(StoreDB.listenQuery(DB_KEYS.ALERTS, [], 'createdAt', 50, (data) => {
                _updateLiveArray(LiveStoreData.alerts, _normalizeDataTime(Array.isArray(data) ? data : []));
                requestAnimationFrame(() => {
                    if (UIManager.processAndDisplayAlerts) UIManager.processAndDisplayAlerts();
                    if (UIManager.updateNotifBadges) UIManager.updateNotifBadges();
                });
            }));
        }    
        
        if (!auth) return; 
        
        if (this._authUnsubscribe) this._authUnsubscribe();
        
        this._authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            this.userAuthListeners.forEach(unsub => { if (typeof unsub === 'function') unsub(); });
            this.userAuthListeners = [];

            if (firebaseUser) {
                const uidStr = firebaseUser.uid;
                const localUid = localStorage.getItem(CACHE_KEYS.ACTIVE_UID);
                
                if (!localUid || !DataManager.user) {
                    console.warn("👻 [Ghost Session Detected]: فايربيز متصل لكن الكاش فارغ. جاري التشافي...");
                    localStorage.setItem(CACHE_KEYS.ACTIVE_UID, uidStr);
                    try {
                        const userDoc = await StoreDB.getById(DB_KEYS.USERS, uidStr);
                        if (userDoc) {
                            DataManager.user = { ...userDoc, uid: uidStr, id: uidStr };
                            DataManager.saveUserLocal(); 
                            if (UIManager.closeModal) UIManager.closeModal('login');
                        } else {
                            if (DataManager.logout) DataManager.logout();
                            return;
                        }
                    } catch (e) {
                        console.error("🚨 فشل استعادة الجلسة الشبحية:", e);
                    }
                } else {
                    localStorage.setItem(CACHE_KEYS.ACTIVE_UID, uidStr);
                }

                if (DataManager && typeof DataManager.listenToUserNotifications === 'function') {
                    const notifUnsub = DataManager.listenToUserNotifications(() => requestAnimationFrame(() => {
                        if (UIManager.processAndDisplayAlerts) UIManager.processAndDisplayAlerts();
                        if (UIManager.updateNotifBadges) UIManager.updateNotifBadges();
                        if (RenderManager && RenderManager.renderNotifCenterList) RenderManager.renderNotifCenterList();
                    }));
                    if (notifUnsub) this.userAuthListeners.push(notifUnsub);
                }
                
                if (StoreDB.listenDoc) {
                    this.userAuthListeners.push(StoreDB.listenDoc(DB_KEYS.USERS, uidStr, (userData) => {
                        if (userData) {
                            if (userData.isBanned || userData.isIpBanned) {
                                this.clearFirebaseListeners();
                                if (UIManager.triggerLiveBanAlert) {
                                    UIManager.triggerLiveBanAlert(userData.banReason || 'نعتذر، تم حظر حسابك.');
                                } else if (DataManager.logout) {
                                    DataManager.logout(); 
                                } else {
                                    signOut(auth).catch(()=>{}); 
                                }
                                return; 
                            }
                            
                            _updateLiveArray(LiveStoreData.users, [userData]);
                            
                            requestAnimationFrame(() => { 
                                if(DataManager.syncUser) DataManager.syncUser(); 
                                
                                const activeCurr = DataManager.user?.baseCurrency || 'USD';
                                const uiCurr = localStorage.getItem(CACHE_KEYS.DISPLAY_CURRENCY) || 'USD'; 
                                
                                if (UIManager.updateDisplayBalance) UIManager.updateDisplayBalance(); 
                                if (UIManager.updateNotifBadges) UIManager.updateNotifBadges(); 
                                
                                if (activeCurr !== uiCurr && typeof RenderManager !== 'undefined') {
                                    if (UIManager.updateDisplayCurrencyUI) UIManager.updateDisplayCurrencyUI(activeCurr);
                                    if (document.body.classList.contains('is-home')) {
                                        if (RenderManager.renderHome) RenderManager.renderHome(true);
                                    } else if (UIManager.currentCategoryId) {
                                        if (RenderManager._renderContent) RenderManager._renderContent(UIManager.currentCategoryId);
                                    }
                                }
                            });
                        }
                    }));
                }
                
                if (StoreDB.listenQuery) {
                    this.userAuthListeners.push(StoreDB.listenQuery(DB_KEYS.ORDERS, [['userId', '==', uidStr]], 'time', 30, (data) => {
                        const normData = _normalizeDataTime(Array.isArray(data) ? data : []);
                        _updateLiveArray(LiveStoreData.orders, normData); 
                        
                        try { 
                            const minifiedOrders = normData.map(o => ({ 
                                id: o.id, displayId: o.displayId, product: o.product, price: o.price, 
                                priceCurrency: o.priceCurrency, status: o.status, time: o.time, 
                                createdAt: o.createdAt, pricingSnapshot: o.pricingSnapshot 
                            }));
                            localStorage.setItem(`tc_orders_cache_${uidStr}`, JSON.stringify(minifiedOrders)); 
                        } catch(e) {}
                        
                        if (DataManager.cursors && DataManager.cursors.orders === undefined) DataManager.cursors.orders = null;
                        
                        requestAnimationFrame(() => { 
                            if (RenderManager.renderOrders && document.getElementById('orders-modal')?.classList.contains('active')) {
                                RenderManager.renderOrders(true); 
                            }
                        });
                    }));               
                    this.userAuthListeners.push(StoreDB.listenQuery(DB_KEYS.DEPOSITS, [['userId', '==', uidStr]], 'time', 30, (data) => {
                        const normData = _normalizeDataTime(Array.isArray(data) ? data : []);
                        _updateLiveArray(LiveStoreData.deposits, normData); 
                        
                        try { 
                            const minifiedDeposits = normData.map(d => ({ 
                                id: d.id, displayId: d.displayId, amount: d.amount, creditedAmount: d.creditedAmount, 
                                targetCurrency: d.targetCurrency, method: d.method, status: d.status, 
                                time: d.time, createdAt: d.createdAt 
                            }));
                            localStorage.setItem(`tc_deposits_cache_${uidStr}`, JSON.stringify(minifiedDeposits)); 
                        } catch(e){}
                        
                        if (DataManager.cursors && DataManager.cursors.deposits === undefined) DataManager.cursors.deposits = null;
                        
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
                const staleLocalUid = localStorage.getItem(CACHE_KEYS.ACTIVE_UID);
                if (staleLocalUid || DataManager.user) {
                    console.warn("🧹 [Stale Session]: فايربيز غير متصل لكن الكاش موجود. جاري التنظيف...");
                    if (DataManager.logout) DataManager.logout();
                } else {
                    localStorage.removeItem(CACHE_KEYS.ACTIVE_UID);
                    LiveStoreData.users.length = 0; LiveStoreData.orders.length = 0; LiveStoreData.deposits.length = 0;
                    DataManager.cursors = {}; 
                    if(DataManager.syncUser) DataManager.syncUser(); 
                    if(UIManager.updateDisplayBalance) UIManager.updateDisplayBalance();
                }
            }
        }); 
    }
}; 

AppController.init = async function() {
    console.log(`🚀 جاري إقلاع المتجر (نسخة المحرك الماسي ${APP_VERSION})...`);
    
    window.addEventListener('storage', (event) => {
        if (event.key === CACHE_KEYS.ACTIVE_UID && event.newValue === null) {
            console.warn("🔒 تم تسجيل الخروج من نافذة أخرى. جاري تأمين هذه الجلسة...");
            window.location.replace(window.location.pathname);
        }
    });

    if (typeof RenderHelpers !== 'undefined' && RenderHelpers.init) {
        RenderHelpers.init({ settings: {}, rates: [], offers: [], isStore: true });
    }
    
    try {
        const currentVersion = APP_VERSION || "1.0.0";
        const savedVersion = localStorage.getItem('telecard_app_version');
        
        if (savedVersion && savedVersion !== currentVersion) {
            console.warn(`🔄 تم اكتشاف تحديث محلي للمتجر! جاري التحديث من ${savedVersion} إلى ${currentVersion}...`);
            
            const clearPromises = [];
            if ('serviceWorker' in navigator) {
                clearPromises.push(navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister()))).catch(() => []));
            }
            if ('caches' in window) {
                clearPromises.push(caches.keys().then(names => Promise.all(names.map(name => caches.delete(name)))).catch(() => []));
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
    
    try {
        const activeUid = localStorage.getItem(CACHE_KEYS.ACTIVE_UID);
        if (activeUid) {
            const cachedOrders = JSON.parse(localStorage.getItem(`tc_orders_cache_${activeUid}`) || '[]');
            const cachedDeposits = JSON.parse(localStorage.getItem(`tc_deposits_cache_${activeUid}`) || '[]');
            
            if (cachedOrders.length > 0) {
                _updateLiveArray(LiveStoreData.orders, cachedOrders);
                if (document.getElementById('orders-modal')?.classList.contains('active') && RenderManager.renderOrders) RenderManager.renderOrders(true);
            }
            if (cachedDeposits.length > 0) {
                _updateLiveArray(LiveStoreData.deposits, cachedDeposits);
                if (document.getElementById('wallet-modal')?.classList.contains('active') && RenderManager.renderWallet) RenderManager.renderWallet(true);
            }
        }
    } catch (e) { console.warn("⚠️ [Cache Hydration] تعذر جلب السجلات المؤقتة."); }
    
    try {
        if (DataManager.loadPrefs) DataManager.loadPrefs();
        if (DataManager.syncUser) await DataManager.syncUser().catch(() => {});
        
        if (UIManager.initGlobalListeners) UIManager.initGlobalListeners();
        
        if (DataManager.user && DataManager.user.biometricEnabled) {
            this.enforceBiometricLock().then(isUnlocked => {
                if (!isUnlocked) {
                    const splash = document.getElementById('global-splash-screen');
                    if (splash) {
                        splash.style.opacity = '0';
                        splash.style.visibility = 'hidden';
                        setTimeout(() => { if (splash) splash.remove(); }, 400);
                    }
                }
            });
        }
        
        if (UIManager.applySavedTheme) UIManager.applySavedTheme();
        if (UIManager.toggleHeroSection) UIManager.toggleHeroSection(true);
    } catch (e) {}
    
    try {
        if (UIManager.checkSystemStatus && UIManager.checkSystemStatus()) return;
        
        await DataManager.initStoreCatalog();
        
        if (typeof RenderHelpers !== 'undefined' && RenderHelpers.init) {
            RenderHelpers.init({ settings: LiveStoreData.settings || {}, rates: LiveStoreData.rates || [], offers: LiveStoreData.offers || [], isStore: true });
        }
        
        DataManager.selectedCurr = localStorage.getItem(CACHE_KEYS.DISPLAY_CURRENCY) || LiveStoreData.settings?.defaultCurrency || 'USD';
        if (UIManager.updateDisplayCurrencyUI) UIManager.updateDisplayCurrencyUI(DataManager.selectedCurr);
        
        const removeSplashScreen = () => {
            const splash = document.getElementById('global-splash-screen');
            if (splash) {
                splash.style.opacity = '0';
                splash.style.visibility = 'hidden';
                setTimeout(() => { if (splash) splash.remove(); }, 400);
            }
        };
        requestAnimationFrame(removeSplashScreen);

        if (localStorage.getItem('tc_show_logout_toast')) {
            localStorage.removeItem('tc_show_logout_toast');
            setTimeout(() => {
                if (UIManager.showToast) UIManager.showToast('تم تسجيل الخروج بنجاح. نراك قريباً!', 'success');
                if (UIManager.sfx) UIManager.sfx('success');
            }, 1200);

        } else if (!sessionStorage.getItem('tc_has_been_greeted')) {
            sessionStorage.setItem('tc_has_been_greeted', 'true');
            setTimeout(() => {
                const isNewUser = sessionStorage.getItem('tc_new_user_signup');
                const storeName = localStorage.getItem('tc_splash_name') || LiveStoreData.settings?.storeName || LiveStoreData.settings?.name || 'متجرنا';
                const firstName = DataManager.user?.firstName || DataManager.user?.name || '';
                const namePart = firstName ? ` يا ${firstName}` : '';
                let finalGreeting = '';
                
                if (isNewUser) {
                    sessionStorage.removeItem('tc_new_user_signup');
                    const newWelcomePhrases = [
                        `أهلاً بك في عائلة ${storeName}${namePart} 🎉`,
                        `بداية موفقة معنا في ${storeName}${namePart} 🚀`,
                        `سعيدون بانضمامك لـ ${storeName}${namePart} ✨`
                    ];
                    finalGreeting = newWelcomePhrases[Math.floor(Math.random() * newWelcomePhrases.length)];
                } else {
                    const hour = new Date().getHours();
                    let timePhrases = [];
                    
                    if (hour >= 5 && hour < 12) timePhrases = ["صباح الخير", "عمت صباحاً", "صباح النشاط", "إشراقة جديدة"];
                    else if (hour >= 12 && hour < 18) timePhrases = ["طاب مساؤك", "كيف الحال", "ما الأخبار", "مرحباً بك"];
                    else timePhrases = ["مساء الخير", "سهرة ممتعة", "عمت مساءً", "أهلاً بك الليلة"];
                    
                    finalGreeting = `${timePhrases[Math.floor(Math.random() * timePhrases.length)]}${namePart} ✨`;
                }
                
                if (UIManager.showToast) UIManager.showToast(finalGreeting, 'info');
                
                // 🔔 الإضافة الجديدة هنا: استدعاء نافذة الإشعارات الأنيقة
                setTimeout(() => {
                    if (UIManager.showPushNotificationPrompt) {
                        UIManager.showPushNotificationPrompt();
                    }
                }, 3500);

            }, 1500);
        }

        if (UIManager.applyStoreIdentity) UIManager.applyStoreIdentity();
        if (UIManager.initSlider) UIManager.initSlider();
        if (UIManager.renderTicker) UIManager.renderTicker();
        if (UIManager.updateProfileDisplay) UIManager.updateProfileDisplay();

        const sName = LiveStoreData.settings?.storeName || LiveStoreData.settings?.name || 'TeleCard';
        const splashName = document.getElementById('splash-store-name');
        if (splashName) splashName.innerText = sName;
        localStorage.setItem(CACHE_KEYS.SPLASH_NAME, sName);

        if (UIManager.isReady && RenderManager) {
            const publicKeys = ['COUNTRIES', 'PAYMENTS'];
            const promises = publicKeys.map(k => StoreDB.getAll(DB_KEYS[k]).catch(() => []));
            
            if (DataManager.activeUid) {
                promises.push(StoreDB.getAll(DB_KEYS.COUPONS).catch(() => []));
                publicKeys.push('COUPONS');
            }
            
            Promise.all(promises).then(results => {
                publicKeys.forEach((key, i) => {
                    if (results[i] && results[i].length > 0) {
                        _updateLiveArray(LiveStoreData[key.toLowerCase()], results[i]);
                    }
                });
                if (RenderManager.renderHome) RenderManager.renderHome();
                if (UIManager.initSlider) UIManager.initSlider();
                if (UIManager.updateDisplayBalance) UIManager.updateDisplayBalance();
                
                if (document.getElementById('balance-modal')?.classList.contains('active')) {
                    if (RenderManager.renderPayMethods) RenderManager.renderPayMethods();
                }
            });
        }
    } catch (e) {
        console.error("🚨 خطأ أثناء محاولة إقلاع الواجهة:", e);
        const splash = document.getElementById('global-splash-screen');
        if (splash) splash.remove();
    }

    try {
        setTimeout(() => { if (DataManager.injectSilentSensor) DataManager.injectSilentSensor(); }, 3000);
        if (UIManager.updateDisplayBalance) UIManager.updateDisplayBalance();
        
        requestIdleCallback(() => {
            if (!UIManager.isReady) return;
            try { this.initFirebaseListeners(); } catch (e) {}
            try { if (CalendarApp?.init) CalendarApp.init(); } catch (e) {}
            
            ['updateSidebarText', 'initSupportButton', 'applyFontSettings', 'refreshCurrencyMenuFlags', 'renderSettingsUI', 'loadUserImageAutomatically', 'restoreDisplayState', 'setupMainContentClickDetector', 'initSwipeGestures']
            .forEach(m => { try { if (UIManager[m]) UIManager[m](); } catch (e) {} });
            
            if (Components.initBottomNavSync) Components.initBottomNavSync();
            if (UIManager.checkKycCelebration) UIManager.checkKycCelebration();
        }, { timeout: 2000 });
        
        console.log("✅ اكتمل الإقلاع. الكائنات محررة والواجهة جاهزة للتفاعل.");
        
    } catch (e) {}
};

if (typeof globalThis !== 'undefined') {
    if (!globalThis.ClientSystem) {
        Object.defineProperty(globalThis, 'ClientSystem', {
            value: UIManager,
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
    const startApp = () => { if (AppController.init) AppController.init(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApp);
    else startApp();
})();
