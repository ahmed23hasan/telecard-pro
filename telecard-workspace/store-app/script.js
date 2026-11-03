// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (script.js) - الإصدار المؤسسي V21.1.0 🚀
// 🎯 الوظيفة: الأوركسترا المركزية، الإقلاع السريع، المستمعات السحابية الحية، وإدارة الجلسات.
// 🚀 التحديثات المعمارية الصارمة (V21.1.0 - Fast Boot & Background Listener Pipeline):
// 1. Race-Free Boot Pipeline ⚡: إزالة سباق الإقلاع وضمان اكتمال مصادقة المستخدم قبل فتح المستمعات أو فحص البصمة.
// 2. Auth-Scoped Alerts 🔕: حصر مستمع الإشعارات العامة على المسجلين فقط وخفض الحد إلى 20 لحظر نزيف القراءات للزوار.
// 3. Single-Source Catalog & Payments 💳: إلغاء الجلب المتأخر المكرر لطرق الدفع والدول للاعتماد حصراً على dataManager.
// 4. Reactive Modal Sync 🔄: تحديث نافذة الإيداع تلقائياً عند رصد أي تغير حي في configVersion أثناء فتحها.
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

const _sysLog = (context, error) => {
    console.warn(`🚨 [Engine SysLog] ${context}:`, error?.message || error);
};

import { DB_KEYS, CACHE_KEYS, APP_VERSION, ACTIVE_USER_KEY } from './config.js'; 
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import { RenderManager } from './renderManager.js';
import { Components, CalendarApp } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';

const _updateLiveArray = (arr, newData) => { 
    if (arr) { 
        arr.length = 0; 
        if (Array.isArray(newData)) {
            for (let i = 0; i < newData.length; i++) arr.push(newData[i]);
        }
    } 
};

const _updateLiveObject = (obj, newData) => {
    if (obj) {
        Object.keys(obj).forEach(k => delete obj[k]);
        if (newData) Object.assign(obj, newData);
    }
};

const _normalizeDataTime = (dataArray) => {
    if (!Array.isArray(dataArray)) return [];
    return dataArray.map(item => ({
        ...item,
        time: item.time ? RenderHelpers.parseTime(item.time) : null,
        createdAt: item.createdAt ? RenderHelpers.parseTime(item.createdAt) : null,
        actionTime: item.actionTime ? RenderHelpers.parseTime(item.actionTime) : null
    }));
};

const AppController = {
    activeListeners: [], 
    userAuthListeners: [],
    _networkSensorsBound: false, 
    _authUnsubscribe: null,
    _isUpdatingServer: false,
    _isListenersInitialized: false,

    clearFirebaseListeners: function() {
        const allListeners = [...this.activeListeners, ...this.userAuthListeners];
        allListeners.forEach(unsub => {
            if (typeof unsub === 'function') {
                try { unsub(); } catch(e) { _sysLog("Clear Listeners", e); }
            }
        });
        this.activeListeners = [];
        this.userAuthListeners = [];
        
        if (typeof DataManager !== 'undefined') {
            if (typeof DataManager._notifUnsubscribe === 'function') { DataManager._notifUnsubscribe(); DataManager._notifUnsubscribe = null; }
            if (typeof DataManager._userUnsubscribe === 'function') { DataManager._userUnsubscribe(); DataManager._userUnsubscribe = null; }
            DataManager._userListenerActive = false;
        }
        
        if (StoreDB && typeof StoreDB.killAllListeners === 'function') {
            StoreDB.killAllListeners();
        }
    },

    enforceBiometricLock: async function() {
        const lockScreen = document.getElementById('biometric-lock-screen');
        const isBiometricRequired = DataManager.user?.biometricEnabled === true;
        
        let savedRawId = null;
        try { savedRawId = localStorage.getItem(CACHE_KEYS.BIOMETRIC_KEY); } 
        catch (e) { _sysLog("Read Biometric Key", e); }
        
        if (!isBiometricRequired) {
            document.body.classList.remove('biometric-locked');
            return true; 
        }
        
        document.body.classList.add('biometric-locked');
        if (lockScreen) lockScreen.classList.add('active'); 
        
        if (!window.PublicKeyCredential || !savedRawId) {
            if (lockScreen) lockScreen.classList.remove('active');
            UIManager.showToast?.('البصمة غير مدعومة أو تم مسحها. يرجى تسجيل الدخول.', 'warning');
            if (DataManager.logout) DataManager.logout(true);
            return false;
        }
        
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 45000);
        
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
                },
                signal: abortController.signal
            });
            
            clearTimeout(timeoutId);
            
            if (lockScreen) lockScreen.classList.remove('active');
            document.body.classList.remove('biometric-locked');
            window.dispatchEvent(new Event('resize')); 
            
            return true;

        } catch (error) {
            clearTimeout(timeoutId);
            _sysLog("Biometric Verification", error);
            
            const retryBtn = document.getElementById('btn-biometric-retry');
            if (retryBtn) {
                retryBtn.innerHTML = '<i class="fa-solid fa-fingerprint"></i> المحاولة مجدداً';
                retryBtn.disabled = false;
                retryBtn.onclick = () => this.enforceBiometricLock();
            }
            
            if (error.name === 'AbortError' || error.message === 'biometric_timeout') {
                UIManager.showToast?.('تأخر النظام في الاستجابة. يمكنك المحاولة مجدداً أو تسجيل الخروج.', 'warning');
            } else {
                UIManager.showToast?.('فشل التحقق من الهوية.', 'error');
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
            LiveStoreData.isOfflineMode = true;
            UIManager.showToast?.('انقطع الاتصال بالإنترنت. أنت تتصفح البيانات المحفوظة.', 'warning');
            document.body.classList.add('is-offline');
        });
        
        window.addEventListener('online', () => {
            LiveStoreData.isOfflineMode = false;
            document.body.classList.remove('is-offline');
            UIManager.showToast?.('عاد الاتصال بالإنترنت! جاري المزامنة...', 'success');
            
            if (UIManager.isReady) {
                if (networkCooldownTimer) clearTimeout(networkCooldownTimer);
                networkCooldownTimer = setTimeout(() => {
                    try { 
                        this._isListenersInitialized = false; 
                        this.initFirebaseListeners(); 
                    } catch(e) { _sysLog("Online Recovery", e); }
                }, 3000); 
            }
        });
    },

    initFirebaseListeners: function() {
        return new Promise((resolve) => {
            if (this._isListenersInitialized) {
                resolve();
                return;
            }
            this._isListenersInitialized = true;

            console.log("📡 جاري تشغيل مستمعات السحابة الحية...");
            this.clearFirebaseListeners(); 
            
            let isResolved = false;
            const safeResolve = () => {
                if (!isResolved) {
                    isResolved = true;
                    resolve();
                }
            };
            
            // 1. مستمع الإعدادات العامة (telecard_settings/singleton)
            if (DB_KEYS.SETTINGS) {
                let isInitialSettingsSnap = true;
                this.activeListeners.push(StoreDB.listenDoc(DB_KEYS.SETTINGS, 'singleton', (incoming) => {
                    if (!incoming) return;            
                    
                    const serverVersion = String(incoming.appVersion || '0').trim();
                    let localRemoteVersion = '0';
                    try { localRemoteVersion = String(localStorage.getItem(CACHE_KEYS.REMOTE_APP_VERSION) || '0').trim(); }
                    catch(e) { _sysLog("Read remote_app_version", e); }
                    
                    if (serverVersion !== '0' && localRemoteVersion === '0') {
                        try { localStorage.setItem(CACHE_KEYS.REMOTE_APP_VERSION, serverVersion); } catch(e) {}
                    } else if (serverVersion !== '0' && serverVersion !== localRemoteVersion) {
                        if (this._isUpdatingServer) return; 
                        this._isUpdatingServer = true;
                        
                        let reloadData = { count: 0, time: 0 };
                        try { reloadData = JSON.parse(sessionStorage.getItem(CACHE_KEYS.UPDATE_RELOADS) || '{"count":0, "time":0}'); }
                        catch(e) {}
                        const now = Date.now();
                        
                        if (reloadData.count > 2 && (now - reloadData.time) < 60000) {
                            console.error("🚨 تم إيقاف حلقة التحديث اللانهائية للحماية.");
                            return;
                        }
                        
                        try {
                            sessionStorage.setItem(CACHE_KEYS.UPDATE_RELOADS, JSON.stringify({
                                count: (now - reloadData.time) > 60000 ? 1 : reloadData.count + 1,
                                time: now
                            }));
                        } catch(e){}
                        
                        console.warn(`🔄 الإدارة أصدرت تحديثاً إجبارياً! (إلى الإصدار ${serverVersion})`);
                        UIManager.showToast?.('يتوفر تحديث جديد للمتجر. جاري إعادة التحميل...', 'success');
                        
                        setTimeout(async () => {
                            try {
                                localStorage.setItem(CACHE_KEYS.REMOTE_APP_VERSION, serverVersion);
                                localStorage.removeItem(CACHE_KEYS.SERVER_VERSION);
                                const clearPromises = [];
                                
                                if ('caches' in window) {
                                    clearPromises.push(caches.keys().then(names => Promise.all(names.map(name => caches.delete(name)))).catch(()=>[]));
                                }
                                if ('serviceWorker' in navigator) { 
                                    clearPromises.push(navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister()))).catch(()=>[])); 
                                }
                                
                                await Promise.race([Promise.all(clearPromises), new Promise(r => setTimeout(r, 2000))]);
                            } catch(e) { _sysLog("Clear on Update", e); }
                            window.location.reload();
                        }, 2000);
                        return;
                    }

                    const prevCatVer = LiveStoreData.settings?.catalogVersion;
                    _updateLiveObject(LiveStoreData.settings, incoming);
                    try { localStorage.setItem(CACHE_KEYS.SETTINGS_SNAPSHOT, JSON.stringify(LiveStoreData.settings)); } catch (e) {}

                    if (typeof RenderHelpers !== 'undefined' && RenderHelpers.init) {
                        RenderHelpers.init({ settings: LiveStoreData.settings, rates: LiveStoreData.rates || [], offers: LiveStoreData.offers || [], isStore: true });
                    }
                    if (RenderManager?._priceCache) {
                        RenderManager._priceCache.clear();
                    }

                    if (prevCatVer !== undefined && incoming.catalogVersion && prevCatVer !== incoming.catalogVersion) {
                        DataManager.checkAndSyncCatalogVersion();
                    }
                    
                    if (!isInitialSettingsSnap && DataManager.syncUser) {
                        DataManager.syncUser().then(() => {
                            UIManager.updateDisplayCurrencyUI?.(DataManager.selectedCurr); 
                        }).catch(e => _sysLog("Sync User on Settings Change", e)); 
                    }
                    isInitialSettingsSnap = false;
                    
                    UIManager.applyStoreIdentity?.();
                    UIManager.applyFontSettings?.();
                    UIManager.renderTicker?.();
                    UIManager.initSupportButton?.();
                }));
            }

            // 2. مستمع إصدار الكتالوج والإعدادات الحي (telecard_system/cache_version)
            if (DB_KEYS.SYSTEM) {
                this.activeListeners.push(StoreDB.listenDoc(DB_KEYS.SYSTEM, 'cache_version', (verIncoming) => {
                    if (!verIncoming) return;
                    DataManager.checkAndSyncCatalogVersion(verIncoming).then((didSync) => {
                        if (didSync && document.getElementById('balance-modal')?.classList.contains('active')) {
                            RenderManager.renderPayMethods?.();
                        }
                    });
                }));

                // 3. مستمع حالة النظام الحية (telecard_system/singleton)
                this.activeListeners.push(StoreDB.listenDoc(DB_KEYS.SYSTEM, 'singleton', (sysIncoming) => {
                    if (!sysIncoming) return;
                    _updateLiveObject(LiveStoreData.system, sysIncoming);
                    UIManager.checkSystemStatus?.();
                }));
            }
            
            if (this._authUnsubscribe) this._authUnsubscribe();
            
            this._authUnsubscribe = StoreDB.onAuthChange(async (firebaseUser) => {
                this.userAuthListeners.forEach(unsub => { if (typeof unsub === 'function') unsub(); });
                this.userAuthListeners = [];

                if (firebaseUser) {
                    const uidStr = firebaseUser.uid;
                    try { localStorage.setItem(CACHE_KEYS.ACTIVE_UID, uidStr); } catch(e) {}
                    
                    try {
                        let cachedLocalUser = null;
                        const activeUserKey = CACHE_KEYS.ACTIVE_USER || ACTIVE_USER_KEY || 'telecard_active_user';
                        try { cachedLocalUser = JSON.parse(localStorage.getItem(activeUserKey) || 'null'); } catch (e) {}
                        
                        if (cachedLocalUser && String(cachedLocalUser.uid || cachedLocalUser.id) === String(uidStr)) {
    DataManager.user = { ...cachedLocalUser, uid: uidStr, id: uidStr };
} else {
    let userDoc = await StoreDB.getCacheFirst(DB_KEYS.USERS, uidStr);
    if (!userDoc) {
        await new Promise(r => setTimeout(r, 1800));
        userDoc = await StoreDB.getCacheFirst(DB_KEYS.USERS, uidStr, true);
    }
    if (userDoc) {
        DataManager.user = { ...userDoc, uid: uidStr, id: uidStr };
        DataManager.saveUserLocal();
    } else {
        safeResolve();
        UIManager.showToast?.('عذراً، بيانات حسابك غير متوفرة في قاعدة البيانات. يرجى التواصل مع الإدارة.', 'error');
        setTimeout(() => {
            if (DataManager.logout) DataManager.logout(true);
        }, 2500);
        return;
    }
}
                    } catch (e) { _sysLog("Fetch User Doc", e); }

                    if (DataManager.syncUser) {
                        await DataManager.syncUser().catch(() => {});
                    }
                    
                    safeResolve();

                    // مستمع الإشعارات العامة محصور على المستخدم المسجل فقط
                    if (DB_KEYS.ALERTS) {
                        this.userAuthListeners.push(StoreDB.listenQuery(DB_KEYS.ALERTS, [], 'time', 20, (data) => {
                            _updateLiveArray(LiveStoreData.alerts, _normalizeDataTime(Array.isArray(data) ? data : []));
                            requestAnimationFrame(() => {
                                UIManager.processAndDisplayAlerts?.();
                                UIManager.updateNotifBadges?.();
                            });
                        }));
                    }

                    if (DataManager && typeof DataManager.listenToUserNotifications === 'function') {
                        const notifUnsub = DataManager.listenToUserNotifications();
                        if (notifUnsub) this.userAuthListeners.push(notifUnsub);
                    }
                    
                    if (DataManager && typeof DataManager.fetchUserHistory === 'function') {
                        DataManager.fetchUserHistory();
                    }
                } else {
                    let staleLocalUid = null;
                    try { staleLocalUid = localStorage.getItem(CACHE_KEYS.ACTIVE_UID); } catch(e){}
                    
                    if (staleLocalUid || DataManager.user) {
                        safeResolve();
                        if (DataManager.logout) DataManager.logout();
                    } else {
                        try { localStorage.removeItem(CACHE_KEYS.ACTIVE_UID); } catch(e){}
                        LiveStoreData.users.length = 0;
                        LiveStoreData.orders.length = 0;
                        LiveStoreData.deposits.length = 0;
                        DataManager.cursors = { orders: null, deposits: null, wallet: null }; 
                        if (DataManager.syncUser) await DataManager.syncUser().catch(() => {}); 
                        UIManager.updateDisplayBalance?.();
                        safeResolve();
                    }
                }
            }); 
            
            setTimeout(() => {
                if (!isResolved && DataManager.activeUid && !DataManager.user && DataManager.syncUser) {
                    DataManager.syncUser().finally(safeResolve);
                } else {
                    safeResolve();
                }
            }, 1000);
        });
    }
}; 

AppController.init = async function() {
    console.log(`🚀 جاري إقلاع المتجر (النسخة المؤسسية ${APP_VERSION})...`);
    
    try {
        if (localStorage.getItem('TELECARD_REQUIRE_DB_CLEAR') === 'true') {
            console.warn("🧹 جاري تنظيف قواعد بيانات IndexedDB العالقة بناءً على طلب محول فايربيز...");
            if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
                const dbs = await window.indexedDB.databases();
                const deletePromises = dbs.map(db => {
                    return new Promise((resolve) => {
                        if (db.name.includes('firestore') || db.name.includes('firebase')) {
                            const req = window.indexedDB.deleteDatabase(db.name);
                            req.onsuccess = () => resolve();
                            req.onerror = () => resolve(); 
                            req.onblocked = () => resolve(); 
                        } else {
                            resolve();
                        }
                    });
                });
                await Promise.all(deletePromises);
            }
            localStorage.removeItem('TELECARD_REQUIRE_DB_CLEAR');
            window.location.reload();
            return; 
        }
    } catch (e) {
        _sysLog("IndexedDB Clear Fallback", e);
        try { localStorage.removeItem('TELECARD_REQUIRE_DB_CLEAR'); } catch(e){}
    }

    window.addEventListener('storage', (event) => {
        if (event.key === CACHE_KEYS.ACTIVE_UID && event.newValue === null) {
            console.warn("🔒 تم تسجيل الخروج من نافذة أخرى. جاري تأمين هذه الجلسة...");
            window.location.replace(window.location.pathname);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && typeof DataManager !== 'undefined' && DataManager.activeUid) {
            if (typeof DataManager.syncUser === 'function') DataManager.syncUser().catch(()=>{}); 
        }
    });

    if (typeof RenderHelpers !== 'undefined' && RenderHelpers.init) {
        RenderHelpers.init({ settings: {}, rates: [], offers: [], isStore: true });
    }
    
    try {
        const currentVersion = APP_VERSION || "1.0.0";
        const savedVersion = localStorage.getItem(CACHE_KEYS.LOCAL_APP_VERSION); 
        
        if (savedVersion && savedVersion !== currentVersion) {
            const clearPromises = [];
            if ('serviceWorker' in navigator) {
                clearPromises.push(navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister()))).catch(() => []));
            }
            if ('caches' in window) {
                clearPromises.push(caches.keys().then(names => Promise.all(names.map(name => caches.delete(name)))).catch(() => []));
            }
            
            localStorage.removeItem(CACHE_KEYS.SERVER_VERSION);
            localStorage.setItem(CACHE_KEYS.LOCAL_APP_VERSION, currentVersion); 
            
            await Promise.race([Promise.all(clearPromises), new Promise(r => setTimeout(r, 2000))]);
            window.location.reload();
            return;
        } else if (!savedVersion) {
            localStorage.setItem(CACHE_KEYS.LOCAL_APP_VERSION, currentVersion);
        }
    } catch (e) { _sysLog("Version Check Cache Clear", e); }
    
    try {
        // 1. تحميل التفضيلات والثيم وتفعيل مستمعات الواجهة والشبكة
        if (DataManager.loadPrefs) DataManager.loadPrefs();
        UIManager.applySavedTheme?.();
        UIManager.toggleHeroSection?.(true);
        UIManager.initGlobalListeners?.();
        this.initNetworkSensors();

        // 2. تطبيق الهوية المبدئية وإخفاء شاشة اللودر فوراً ليظهر الهيكل النبضي السريع (Instant Skeleton UX)
        UIManager.applyStoreIdentity?.();
        if (!(DataManager.user && DataManager.user.biometricEnabled)) {
            requestAnimationFrame(() => {
                const splash = document.getElementById('global-splash-screen');
                if (splash) {
                    splash.style.opacity = '0';
                    splash.style.visibility = 'hidden';
                    setTimeout(() => { if (splash) splash.remove(); }, 350);
                }
            });
        }

        // 3. جلب الكتالوج وتشغيل المستمعات ومزامنة المستخدم بتسلسل موحد خالٍ من التعارض
        await DataManager.initStoreCatalog();
        await this.initFirebaseListeners();

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
    } catch (e) { _sysLog("Core Boot Sequence", e); }

    try {
        if (UIManager.checkSystemStatus && UIManager.checkSystemStatus()) return;

        if (typeof RenderHelpers !== 'undefined' && RenderHelpers.init) {
            RenderHelpers.init({ settings: LiveStoreData.settings || {}, rates: LiveStoreData.rates || [], offers: LiveStoreData.offers || [], isStore: true });
        }
        
        let storedCurr = 'USD';
        try { storedCurr = localStorage.getItem(CACHE_KEYS.DISPLAY_CURRENCY); } catch(e){}
        DataManager.selectedCurr = storedCurr || DataManager.user?.baseCurrency || LiveStoreData.settings?.defaultCurrency || 'USD';
        UIManager.updateDisplayCurrencyUI?.(DataManager.selectedCurr);
        
        const removeSplashScreen = () => {
            const splash = document.getElementById('global-splash-screen');
            if (splash) {
                splash.style.opacity = '0';
                splash.style.visibility = 'hidden';
                setTimeout(() => { if (splash) splash.remove(); }, 400); 
            }
        };

        const handleWelcomeMessages = () => {
            try {
                if (localStorage.getItem(CACHE_KEYS.LOGOUT_TOAST)) {
                    localStorage.removeItem(CACHE_KEYS.LOGOUT_TOAST);
                    setTimeout(() => {
                        UIManager.showToast?.('تم تسجيل الخروج بنجاح. نراك قريباً!', 'success');
                        UIManager.sfx?.('success');
                    }, 1200);
                } else {
                    const isGuest = !DataManager || !DataManager.user;
                    const now = Date.now();

                    if (isGuest) {
                        const lastPromoTime = parseInt(localStorage.getItem(CACHE_KEYS.GUEST_PROMO_TIME), 10) || 0;
                        const lastGreetTime = parseInt(localStorage.getItem(CACHE_KEYS.GUEST_GREET_TIME), 10) || 0;
                        
                        const COOLDOWN_PROMO = 43200000;
                        const COOLDOWN_GREET = 10800000;
                        
                        if (now - lastPromoTime > COOLDOWN_PROMO) {
                            setTimeout(() => {
                                const hour = new Date().getHours();
                                let greetings = [];
                                
                                if (hour >= 5 && hour < 12) greetings = ["صباح الخير! ☀️", "عمت صباحاً! ☕"];
                                else if (hour >= 12 && hour < 18) greetings = ["مساء الخير! 🌤️", "طاب يومك! ✨"];
                                else greetings = ["مساء الخير! 🌙", "سهرة ممتعة! 🌟"];
                                
                                const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
                                const marketingAction = "<span class='highlight-gold'>أنشئ حسابك الآن</span> واستمتع بأسعار حصرية.";
                                const toastMsg = `${randomGreeting} <br> ${marketingAction}`;
                                
                                UIManager.showToast?.(toastMsg, 'welcome', 6000); 
                                localStorage.setItem(CACHE_KEYS.GUEST_PROMO_TIME, now.toString());
                                localStorage.setItem(CACHE_KEYS.GUEST_GREET_TIME, now.toString());
                            }, 3500);
                        } else if (now - lastGreetTime > COOLDOWN_GREET) {
                            setTimeout(() => {
                                const simpleGreetings = [
                                    "أهلاً بك مجدداً! نتمنى لك جولة تسوق ممتعة. 🛍️",
                                    "سعيدون بعودتك لاستكشاف متجرنا! ✨",
                                    "مرحباً بك! هل تبحث عن شيء محدد اليوم؟ 🎯"
                                ];
                                const toastMsg = simpleGreetings[Math.floor(Math.random() * simpleGreetings.length)];
                                
                                UIManager.showToast?.(toastMsg, 'info', 4000); 
                                localStorage.setItem(CACHE_KEYS.GUEST_GREET_TIME, now.toString());
                            }, 3500);
                        }
                    } else {
                        if (!sessionStorage.getItem(CACHE_KEYS.GREETING_SHOWN)) {
                            sessionStorage.setItem(CACHE_KEYS.GREETING_SHOWN, 'true');
                            setTimeout(() => {
                                const isNewUser = sessionStorage.getItem(CACHE_KEYS.NEW_USER_SIGNUP);
                                const storeName = localStorage.getItem(CACHE_KEYS.SPLASH_NAME) || LiveStoreData.settings?.storeName || LiveStoreData.settings?.name || 'متجرنا';
                                const firstName = DataManager.user?.firstName || DataManager.user?.fullName || '';
                                const namePart = firstName ? ` يا ${firstName}` : '';
                                let finalGreeting = '';
                                
                                if (isNewUser) {
                                    sessionStorage.removeItem(CACHE_KEYS.NEW_USER_SIGNUP);
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
                                
                                UIManager.showToast?.(finalGreeting, 'welcome', 5000);
                                
                                setTimeout(() => {
                                    UIManager.showPushNotificationPrompt?.();
                                }, 3500);

                            }, 1500);
                        }
                    }
                }
            } catch(e) { _sysLog("Welcome Messages", e); }
        };

        UIManager.applyStoreIdentity?.();
        UIManager.updateProfileDisplay?.();
        UIManager.updateFavBadgeCount?.();

        const sName = LiveStoreData.settings?.storeName || LiveStoreData.settings?.name || 'TeleCard';
        const splashName = document.getElementById('splash-store-name');
        if (splashName) splashName.innerText = sName;
        try { localStorage.setItem(CACHE_KEYS.SPLASH_NAME, sName); } catch(e){}

        if (UIManager.isReady && RenderManager) {
            RenderManager.renderHome?.();
            UIManager.initSlider?.();
            UIManager.updateDisplayBalance?.();
          
            requestAnimationFrame(removeSplashScreen);
            handleWelcomeMessages();
        } else {
            requestAnimationFrame(removeSplashScreen);
            handleWelcomeMessages();
        }
    } catch (e) {
        console.error("🚨 خطأ فادح أثناء محاولة إقلاع الواجهة:", e);
        const splash = document.getElementById('global-splash-screen');
        if (splash) splash.remove();
    }

    try {
        setTimeout(() => { if (DataManager.injectSilentSensor) DataManager.injectSilentSensor(); }, 3000);
        UIManager.updateDisplayBalance?.();
        
        requestIdleCallback(() => {
            if (!UIManager.isReady) return;
            try { if (CalendarApp?.init) CalendarApp.init(); } catch (e) { _sysLog("Calendar Init", e); }
            
            [
                'updateSidebarText',
                'initSupportButton',
                'applyFontSettings',
                'refreshCurrencyMenuFlags',
                'renderSettingsUI',
                'loadUserImageAutomatically',
                'restoreDisplayState',
                'setupMainContentClickDetector',
                'setupWalletDrawerClickOutside',
                'initSwipeGestures',
                'updateFavBadgeCount'
            ].forEach(m => {
                try { if (UIManager[m]) UIManager[m](); } catch (e) { _sysLog(`UI Action: ${m}`, e); }
            });

            RenderManager.renderTerms?.();
            Components.initBottomNavSync?.();
            UIManager.checkKycCelebration?.();
        }, { timeout: 2000 });
        
        console.log("✅ اكتمل الإقلاع. معمارية القلعة نشطة والواجهة جاهزة للتفاعل.");
        
    } catch (e) { _sysLog("Post Boot Actions", e); }
};

if (typeof globalThis !== 'undefined') {
    if (!globalThis.DataManager) {
        Object.defineProperty(globalThis, 'DataManager', {
            value: DataManager,
            writable: false,
            configurable: false
        });
    }
    if (!globalThis.RenderManager) {
        Object.defineProperty(globalThis, 'RenderManager', {
            value: RenderManager,
            writable: false,
            configurable: false
        });
    }
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
