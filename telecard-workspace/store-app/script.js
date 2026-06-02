// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (script.js) - المجلد الاحترافي المصلح للسحابة
// 🎯 الوظيفة: الإقلاع الشامل، حقن الاعتمادية، ومحرك المزامنة الحي (Real-time)
// 🚀 التحديث: دمج نظام المؤشرات (Cursor Pagination) + إيقاف نزيف الذاكرة
// ============================================================================

import { auth } from './core/firebaseAdapter.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { DB_KEYS } from './config.js';
import { Utils } from './utils.js';
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import { RenderManager } from './renderManager.js';
import { Components, CalendarApp } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';

// 🌟 مُطهر البيانات السحابية (آمن ولا ينهار مع المصفوفات الفارغة)
const _normalizeDataTime = (dataArray) => {
    if (!Array.isArray(dataArray)) return [];
    return dataArray.map(item => {
        let normalizedItem = { ...item };
        if (normalizedItem.time) normalizedItem.time = RenderHelpers.parseTime(normalizedItem.time);
        if (normalizedItem.createdAt) normalizedItem.createdAt = RenderHelpers.parseTime(normalizedItem.createdAt);
        if (normalizedItem.actionTime) normalizedItem.actionTime = RenderHelpers.parseTime(normalizedItem.actionTime);
        return normalizedItem;
    });
};

const ClientSystem = { 
    isReady: false,
    activeListeners: [], 

    clearFirebaseListeners: function() {
        if (this.activeListeners && this.activeListeners.length > 0) {
            this.activeListeners.forEach(unsubscribe => {
                if (typeof unsubscribe === 'function') unsubscribe();
            });
            this.activeListeners = [];
            console.log("🧹 تم تنظيف المستمعات السحابية السابقة بنجاح.");
        }
    },

    // ============================================================================
    // 🎯 نظام تفويض الأحداث المركزي (Global Event Delegation)
    // ============================================================================
    initGlobalListeners: function() {
        document.body.addEventListener('touchstart', () => {}, { passive: true });

        window.addEventListener('contextmenu', (e) => {
            if (e.target.closest('[data-action], .cat-card, .product-card')) {
                e.preventDefault();
            }
        });

        document.addEventListener('click', (e) => {
            const packageWrapper = document.getElementById('pkg-custom-dropdown');
            if (packageWrapper && packageWrapper.classList.contains('open') && !packageWrapper.contains(e.target) && !e.target.closest('.dropdown-trigger')) {
                packageWrapper.classList.remove('open');
            }

            const walletDrawer = document.getElementById('walletStatsDrawer');
            if (walletDrawer && walletDrawer.classList.contains('active')) {
                const isClickInsideDrawer = walletDrawer.contains(e.target);
                const isClickOnToggleButton = e.target.closest('.detail-arrow') || e.target.closest('.wallet-toggle-btn') || e.target.closest('[data-action="toggle-wallet-stats"]'); 
                
                if (!isClickInsideDrawer && !isClickOnToggleButton) {
                    if (typeof this.closeWalletStats === 'function') this.closeWalletStats(); 
                }
            }
        }, true); 

        let lastClickTime = 0;
        let lastClickTarget = null;

        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.getAttribute('data-action');
            const id = target.getAttribute('data-id');

            target.blur();

            switch (action) {
                case 'open-category':
                    e.preventDefault();
                    if (typeof this.openCategory === 'function') this.openCategory(id);
                    break;
                    
                case 'open-product':
                    e.preventDefault();
                    const currentTime = new Date().getTime();
                    const timeDiff = currentTime - lastClickTime;

                    if (timeDiff < 280 && lastClickTarget === id) {
                        clearTimeout(window.productClickTimer);
                        if (typeof this.triggerMagicFavorite === 'function') {
                            this.triggerMagicFavorite(e, id);
                        }
                        lastClickTime = 0; 
                    } else {
                        lastClickTime = currentTime;
                        lastClickTarget = id;
                        window.productClickTimer = setTimeout(() => {
                            if (typeof this.openProdModal === 'function') {
                                this.openProdModal(id);
                            }
                        }, 250);
                    }
                    break;
                    
                case 'select-pay':
                    if (typeof this.selectPay === 'function') this.selectPay(id);
                    break;
                    
                case 'submit-balance':
                    const currency = target.getAttribute('data-curr');
                    if (typeof this.handleBalanceSubmit === 'function') this.handleBalanceSubmit(currency);
                    break;
                    
                case 'select-reg-currency':
                    e.preventDefault();
                    const currName = target.getAttribute('data-name');
                    const currCode = target.getAttribute('data-code');
                    if (typeof this.selectRegCurrency === 'function') {
                        this.selectRegCurrency(currName, currCode);
                    }
                    break;

                case 'toggle-accordion':
                    e.preventDefault();
                    if(typeof this.togglePayDetail === 'function') this.togglePayDetail(target);
                    break;

                case 'toggle-wallet-stats': 
                    if(typeof this.toggleWalletStats === 'function') this.toggleWalletStats(target);
                    break;

                case 'jump-transaction': 
                    const type = target.getAttribute('data-type');
                    if(typeof this.jumpToTransaction === 'function') this.jumpToTransaction(id, type);
                    break;

                case 'open-detail': 
                    const txType = target.getAttribute('data-type');
                    if(typeof this.openDetail === 'function') this.openDetail(e, txType, id);
                    break;

                case 'apply-coupon':
                    if(typeof this.applyCoupon === 'function') this.applyCoupon();
                    break;
                    
                case 'remove-coupon':
                    if(typeof this.removeCoupon === 'function') this.removeCoupon();
                    break;

                case 'toggle-dropdown':
                    const dropWrapper = target.closest('.custom-dropdown') || target.parentElement;
                    if (dropWrapper) dropWrapper.classList.toggle('open');
                    break;

                case 'select-dropdown-item':
                    if(typeof this.selectDropdownItem === 'function') this.selectDropdownItem(target);
                    break;

                case 'toggle-theme':
                    if(typeof this.toggleTheme === 'function') this.toggleTheme();
                    break;
                
                case 'copy-text':
                    e.preventDefault();  
                    e.stopPropagation(); 
                    const textToCopy = target.getAttribute('data-text');
                    if(typeof this.copyToClipboard === 'function') this.copyToClipboard(textToCopy, target);
                    break;

                case 'close-sidebar':
                    if(typeof this.closeSidebar === 'function') this.closeSidebar();
                    break;
                    
                case 'open-favorites':
                    if(typeof this.openFavorites === 'function') this.openFavorites();
                    break;

                case 'select-country':
                    e.preventDefault();
                    const name = target.getAttribute('data-name');
                    const code = target.getAttribute('data-code');
                    const len = target.getAttribute('data-len');
                    if(typeof this.selectCountry === 'function') this.selectCountry(name, code, len);
                    break;

                case 'show-phone-toast':
                    if(typeof this.showToast === 'function') this.showToast('هذا الرقم مرتبط بحسابك الأساسي. لتغييره يرجى التواصل مع الدعم الفني.', 'info');
                    break;

                case 'handle-avatar-click':
                    if(typeof this.handleAvatarClick === 'function') this.handleAvatarClick(e);
                    break;

                case 'toggle-name-edit':
                    if(typeof this.toggleNameEdit === 'function') this.toggleNameEdit();
                    break;

                case 'save-identity':
                    if(typeof this.saveIdentityData === 'function') this.saveIdentityData();
                    break;

                case 'submit-kyc':
                    if(typeof this.submitKycData === 'function') this.submitKycData();
                    break;

                case 'open-kyc-upload':
                    if(typeof this.openModal === 'function') this.openModal('kyc-upload');
                    break;

                case 'open-kyc-status':
                    if(typeof this.openKycStatusModal === 'function') this.openKycStatusModal(target.getAttribute('data-state'));
                    break;
                
                case 'delete-avatar':
                    if(typeof this.deleteProfileImage === 'function') this.deleteProfileImage();
                    break;
            }
        });
    }
};

// ============================================================================
// 🔗 دمج الوحدات (Facade Pattern)
// ============================================================================
const modules = [DataManager, UIManager, RenderManager, Components, Utils];
modules.forEach(mod => {
    if (!mod) return;
    Object.keys(mod).forEach(key => {
        if (key in ClientSystem) return; 
        if (typeof mod[key] === 'function') {
            ClientSystem[key] = mod[key].bind(mod);
        } else {
            Object.defineProperty(ClientSystem, key, {
                get: () => mod[key],
                set: (val) => { mod[key] = val; },
                configurable: true
            });
        }
    });
});

// ============================================================================
// 🔄 محرك المزامنة الحي (Real-time Firebase Sync Engine) - النسخة المحمية
// ============================================================================
ClientSystem.initFirebaseListeners = function() {
    console.log("📡 جاري تشغيل مستمعات السحابة الحية (المحمية)...");
    this.clearFirebaseListeners();
    
    // 1. المستمعات العامة
    if (DB_KEYS.SETTINGS) {
        const unsubSettings = StoreDB.listenCollection(DB_KEYS.SETTINGS, (data) => {
            const incoming = Array.isArray(data) ? (data[0] || null) : (data || null);
            if (!incoming && Object.keys(LiveStoreData.settings || {}).length > 0) return;
            
            LiveStoreData.settings = incoming || {};
            RenderHelpers.init({
                settings: LiveStoreData.settings || {},
                rates: LiveStoreData.rates || [],
                offers: LiveStoreData.offers || [],
                isStore: true
            });
            
            if (DataManager.syncUser) DataManager.syncUser();
            if (UIManager && typeof UIManager.updateDisplayCurrencyUI === 'function') {
                UIManager.updateDisplayCurrencyUI(DataManager.selectedCurr);
            }
            if (UIManager && typeof UIManager.applyStoreIdentity === 'function') {
                UIManager.applyStoreIdentity();
            }
        });
        this.activeListeners.push(unsubSettings);
    }
    
    if (DB_KEYS.ALERTS) {
        const unsubAlerts = StoreDB.listenCollection(DB_KEYS.ALERTS, (data) => {
            LiveStoreData.alerts = _normalizeDataTime(Array.isArray(data) ? data : []);
            requestAnimationFrame(() => {
                if (UIManager && typeof UIManager.processAndDisplayAlerts === 'function') UIManager.processAndDisplayAlerts();
                if (UIManager && typeof UIManager.updateNotifBadges === 'function') UIManager.updateNotifBadges();
            });
        });
        this.activeListeners.push(unsubAlerts);
    }
    
    // 🌟 2. المستمعات الخاصة + الترقيم الاحترافي
    onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
            console.log("🔐 تم تأكيد الهوية. جاري جلب أحدث البيانات المالية...");
            const uidStr = firebaseUser.uid;
            localStorage.setItem('telecard_active_user_uid', uidStr);
            
            // تهيئة مخزن المؤشرات (Cursors)
            DataManager.cursors = DataManager.cursors || {};
            
            if (StoreDB.listenDoc) {
                const unsubUser = StoreDB.listenDoc(DB_KEYS.USERS, String(uidStr), (userData) => {
                    if (userData) {
                        LiveStoreData.users = [userData];
                        requestAnimationFrame(() => {
                            if (DataManager.syncUser) DataManager.syncUser();
                            if (UIManager && typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
                        });
                    }
                });
                this.activeListeners.push(unsubUser);
            }
            
            if (StoreDB.listenQuery) {
                // 🌟 جلب أحدث 30 طلب فقط + حفظ المؤشر
                const unsubOrders = StoreDB.listenQuery(DB_KEYS.ORDERS, ['userId', '==', String(uidStr)], 'time', 30, (data, lastDoc) => {
                    LiveStoreData.orders = _normalizeDataTime(Array.isArray(data) ? data : []);
                    DataManager.cursors.orders = lastDoc; // حفظ مكان التوقف
                    requestAnimationFrame(() => {
                        if (RenderManager && typeof RenderManager.renderOrders === 'function') RenderManager.renderOrders();
                    });
                });
                this.activeListeners.push(unsubOrders);
                
                // 🌟 جلب أحدث 30 إيداع فقط + حفظ المؤشر
                const unsubDeposits = StoreDB.listenQuery(DB_KEYS.DEPOSITS, ['userId', '==', String(uidStr)], 'time', 30, (data, lastDoc) => {
                    LiveStoreData.deposits = _normalizeDataTime(Array.isArray(data) ? data : []);
                    DataManager.cursors.deposits = lastDoc; // حفظ مكان التوقف
                    requestAnimationFrame(() => {
                        if (RenderManager && typeof RenderManager.renderWallet === 'function') RenderManager.renderWallet();
                        if (RenderManager && typeof RenderManager.renderPayments === 'function') RenderManager.renderPayments();
                    });
                });
                this.activeListeners.push(unsubDeposits);
            }
        } else {
            console.log("👤 العميل زائر. تم إيقاف جلب البيانات الخاصة.");
            this.clearFirebaseListeners(); 
            localStorage.removeItem('telecard_active_user_uid');
            LiveStoreData.users = [];
            LiveStoreData.orders = [];
            LiveStoreData.deposits = [];
            if (DataManager.cursors) DataManager.cursors = {}; // تصفير المؤشرات
            if (DataManager.syncUser) DataManager.syncUser();
            if (UIManager && typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
        }
    });
};

// ============================================================================
// 🚀 نقطة الإقلاع المركزية للنظام
// ============================================================================
ClientSystem.init = async function() {
    try {
        console.log("🚀 جاري إقلاع النظام (نمط الـ Hydration الفوري)...");
        
        if (typeof UIManager.applySavedTheme === 'function') UIManager.applySavedTheme();
        
        try {
            const localCache = localStorage.getItem('telecard_store_cache');
            if (localCache) {
                const parsed = JSON.parse(localCache);
                ['cats', 'settings', 'tiers', 'rates', 'banners'].forEach(k => {
                    if (parsed[k]) LiveStoreData[k] = parsed[k];
                });
                RenderHelpers.init({
                    settings: LiveStoreData.settings || {},
                    rates: LiveStoreData.rates || [],
                    offers: [],
                    isStore: true
                });
            }
        } catch (e) {}
        
        if (UIManager.checkSystemStatus && UIManager.checkSystemStatus()) return;
        
        const adminDefaultCurrency = (LiveStoreData.settings && LiveStoreData.settings.defaultCurrency) ? LiveStoreData.settings.defaultCurrency : 'USD';
        DataManager.selectedCurr = localStorage.getItem('telecard_display_currency') || adminDefaultCurrency;
        
        if (DataManager.initDummyData) DataManager.initDummyData();
        
        if (DataManager.syncUser) DataManager.syncUser();
        if (DataManager.loadPrefs) DataManager.loadPrefs();
        
        if (UIManager && typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
        if (typeof UIManager.applyStoreIdentity === 'function') UIManager.applyStoreIdentity();
        if (typeof UIManager.toggleHeroSection === 'function') UIManager.toggleHeroSection(true);
        if (RenderManager.renderHome) RenderManager.renderHome();
        
        if (CalendarApp && CalendarApp.init) CalendarApp.init();
        
        const uiInitMethods = [
            'initSlider', 'updateSidebarText', 'initSupportButton', 'initTheme',
            'applyFontSettings', 'refreshCurrencyMenuFlags', 'renderSettingsUI',
            'loadUserImageAutomatically', 'restoreDisplayState', 'setupMainContentClickDetector',
            'initSwipeGestures'
        ];
        uiInitMethods.forEach(method => {
            if (typeof UIManager[method] === 'function') UIManager[method]();
        });
        
        if (typeof UIManager.updateDisplayCurrencyUI === 'function') UIManager.updateDisplayCurrencyUI(DataManager.selectedCurr);
        if (Components && Components.initBottomNavSync) Components.initBottomNavSync();
        if (typeof UIManager.checkKycCelebration === 'function') UIManager.checkKycCelebration();
        
        this.initGlobalListeners();
        this.isReady = true;
        
        this.initFirebaseListeners();
        
        if (StoreDB) {
            const staticKeys = ['SETTINGS', 'CATS', 'PRODS', 'BANNERS', 'OFFERS', 'RATES', 'TIERS', 'COUPONS', 'COUNTRIES', 'PAYMENTS'];
            
            Promise.all(staticKeys.map(k => StoreDB.getAll(DB_KEYS[k]))).then(results => {
                let cacheObject = {};
                staticKeys.forEach((keyName, i) => {
                    const property = keyName.toLowerCase();
                    const rawData = results[i] || [];
                    
                    if (property === 'settings') {
                        LiveStoreData.settings = Array.isArray(rawData) ? (rawData[0] || {}) : (rawData || {});
                    } else {
                        LiveStoreData[property] = Object.freeze([...rawData]);
                    }
                    
                    if (['cats', 'settings', 'tiers', 'rates', 'banners'].includes(property)) {
                        cacheObject[property] = LiveStoreData[property];
                    }
                });                
                
                localStorage.setItem('telecard_store_cache', JSON.stringify(cacheObject));
                
                RenderHelpers.init({
                    settings: LiveStoreData.settings || {},
                    rates: LiveStoreData.rates || [],
                    offers: LiveStoreData.offers || [],
                    isStore: true
                });
                
                if (typeof UIManager.applyStoreIdentity === 'function') UIManager.applyStoreIdentity();
                if (typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
                
                if (typeof UIManager.initSlider === 'function') UIManager.initSlider();
                if (typeof UIManager.renderTicker === 'function') UIManager.renderTicker(); 
                
            }).catch(error => {
                console.warn("⚠️ تعذر جلب البيانات الثابتة، المتجر يعمل حالياً على النسخة المخبأة (Cache).", error);
            });
        }
        
        try {
            if (DataManager && typeof DataManager._getCloudFunction === 'function') {
                DataManager._getCloudFunction('getServerTime')().then(timeRes => {
                    DataManager.serverTimeOffset = timeRes.data.serverTime - Date.now();
                });
            }
        } catch (timeErr) {
            DataManager.serverTimeOffset = 0;
        }
        
    } catch (criticalError) {
        document.body.innerHTML = `
            <div class="error-screen" style="display:flex; justify-content:center; align-items:center; height:100vh; background:#111; color:#fff; font-family:sans-serif; text-align:center;">
                <div>
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:40px; color:#ff4444; margin-bottom:15px;"></i>
                    <h3>عذراً، حدث خطأ أثناء الاتصال بالخادم</h3>
                    <p style="color:#888; font-size:14px; margin-top:10px;">يرجى تحديث الصفحة أو التحقق من الاتصال بالإنترنت</p>
                </div>
            </div>`;
    }
};

window.ClientSystem = ClientSystem;
window.CalendarApp = CalendarApp;

(function() {
    const startApp = () => {
        if (window.ClientSystem && window.ClientSystem.init) window.ClientSystem.init();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApp);
    } else {
        startApp();
    }
})();