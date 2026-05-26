// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (script.js) - المجلد الاحترافي المصلح للسحابة
// 🎯 الوظيفة: الإقلاع الشامل، حقن الاعتمادية، ومحرك المزامنة الحي (Real-time)
// 🚀 التحديث: حل أخطاء (Type Mismatch) ومنع تعارض قواعد أمان فايربيز
// ============================================================================

import { DB_KEYS } from './config.js';
import { Utils } from './utils.js';
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import { RenderManager } from './renderManager.js';
import { Components, CalendarApp } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';

// 🌟 مُطهر البيانات السحابية (ينظف الأوقات قبل دخولها للذاكرة الحية)
const _normalizeDataTime = (dataArray) => {
    if (!Array.isArray(dataArray)) return dataArray;
    return dataArray.map(item => {
        let normalizedItem = { ...item };
        if (normalizedItem.time) {
            if (typeof normalizedItem.time.toDate === 'function') normalizedItem.time = normalizedItem.time.toDate().getTime();
            else if (normalizedItem.time.seconds) normalizedItem.time = normalizedItem.time.seconds * 1000;
        }
        if (normalizedItem.createdAt) {
            if (typeof normalizedItem.createdAt.toDate === 'function') normalizedItem.createdAt = normalizedItem.createdAt.toDate().getTime();
            else if (normalizedItem.createdAt.seconds) normalizedItem.createdAt = normalizedItem.createdAt.seconds * 1000;
        }
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
        let clickTimeout = null;

        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.getAttribute('data-action');
            const id = target.getAttribute('data-id');

            switch (action) {
                case 'open-category':
                    e.preventDefault();
                    if(typeof this.openCategory === 'function') this.openCategory(id); 
                    break;
                    
                case 'open-product':
                    e.preventDefault();
                    const currentTime = new Date().getTime();
                    const timeDiff = currentTime - lastClickTime;

                    if (timeDiff < 300 && lastClickTarget === id) {
                        clearTimeout(clickTimeout);
                        if(typeof this.triggerMagicFavorite === 'function') this.triggerMagicFavorite(e, id);
                        lastClickTime = 0; 
                    } else {
                        clickTimeout = setTimeout(() => {
                            if(typeof this.openProdModal === 'function') this.openProdModal(id);
                        }, 300);
                        lastClickTime = currentTime;
                        lastClickTarget = id;
                    }
                    break;

                case 'select-pay':
                    if(typeof this.selectPay === 'function') this.selectPay(id);
                    break;
                    
                case 'submit-balance':
                    const currency = target.getAttribute('data-curr');
                    if(typeof this.handleBalanceSubmit === 'function') this.handleBalanceSubmit(currency);
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

ClientSystem.initFirebaseListeners = function() {
    console.log("📡 جاري تشغيل مستمعات السحابة الحية (المحمية)...");
    this.clearFirebaseListeners();

    // ... (كود الـ SETTINGS و ALERTS يبقى كما هو) ...

    const uidStr = localStorage.getItem('telecard_active_user_uid');
    
    // 🕵️‍♂️ نقطة التفتيش 1: هل المتجر يعرف من هو العميل؟
    console.log("🕵️‍♂️ [تحقيق 1] معرف العميل الحالي في المتصفح:", uidStr);
    
    if (uidStr) {
        const uidNum = Number(uidStr);
        const queryUids = isNaN(uidNum) ? [uidStr] : [uidStr, uidNum];

        if (StoreDB.listenDoc) {
            const unsubUser = StoreDB.listenDoc(DB_KEYS.USERS, String(uidStr), (userData) => {
                // 🕵️‍♂️ نقطة التفتيش 2: هل بيانات العميل (بما فيها الرصيد) تصل من السحابة؟
                console.log("🕵️‍♂️ [تحقيق 2] بيانات العميل القادمة من السحابة:", userData);
                
                if (userData) {
                    LiveStoreData.users = Object.freeze([userData]); 
                    requestAnimationFrame(() => {
                        if (DataManager.syncUser) DataManager.syncUser();
                        if (UIManager && typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
                    });
                }
            });
            this.activeListeners.push(unsubUser);
        }

        if (StoreDB.listenQuery) {
            // 🕵️‍♂️ نقطة التفتيش 3: ماذا ترد السحابة عندما نطلب الطلبات؟
            const unsubOrders = StoreDB.listenQuery(DB_KEYS.ORDERS, ['userId', 'in', queryUids], (data) => {
                console.log("🕵️‍♂️ [تحقيق 3] الطلبات المجلوبة من فايربيز:", data);
                LiveStoreData.orders = Object.freeze(_normalizeDataTime([...data]));
                requestAnimationFrame(() => {
                    if (RenderManager && typeof RenderManager.renderOrders === 'function') RenderManager.renderOrders();
                });
            });
            this.activeListeners.push(unsubOrders);

            // 🕵️‍♂️ نقطة التفتيش 4: ماذا ترد السحابة عندما نطلب الإيداعات؟
            const unsubDeposits = StoreDB.listenQuery(DB_KEYS.DEPOSITS, ['userId', 'in', queryUids], (data) => {
                console.log("🕵️‍♂️ [تحقيق 4] الإيداعات المجلوبة من فايربيز:", data);
                LiveStoreData.deposits = Object.freeze(_normalizeDataTime([...data]));
                requestAnimationFrame(() => {
                    if (RenderManager && typeof RenderManager.renderWallet === 'function') RenderManager.renderWallet();
                    if (RenderManager && typeof RenderManager.renderPayments === 'function') RenderManager.renderPayments();
                });
            });
            this.activeListeners.push(unsubDeposits);
        }
    }
};
// ============================================================================
// 🚀 نقطة الإقلاع المركزية للنظام (Bootstrapper)
// ============================================================================
ClientSystem.init = async function() {
    try {
        console.log("🚀 جاري إقلاع النظام السحابي المحصن...");

        if(typeof UIManager.applySavedTheme === 'function') UIManager.applySavedTheme();
        
        // 📥 1. التحميل الأولي للبيانات الثابتة
        if (StoreDB) {
            try {
                const staticKeys = ['CATS', 'PRODS', 'BANNERS', 'OFFERS', 'RATES', 'TIERS', 'COUPONS', 'COUNTRIES', 'PAYMENTS'];
                
                const fetchPromises = staticKeys.map(k => StoreDB.getAll(DB_KEYS[k]));
                const results = await Promise.all(fetchPromises);
                
                staticKeys.forEach((keyName, i) => {
                    const property = keyName.toLowerCase(); 
                    LiveStoreData[property] = Object.freeze([...(results[i] || [])]); 
                });

                const uid = localStorage.getItem('telecard_active_user_uid');
                if (uid) {
                    try {
                        // 🌟 الإصلاح الجذري: منع استخدام getAll للطلبات والدفعات لحماية السحابة من الانهيار الأمني
                        // يتم الاعتماد حصرياً على listenQuery (المزامنة الحية المفلترة) لجلب بيانات هذا العميل فقط
                        console.log("✅ سيتم جلب سجلات المستخدم حصرياً عبر المزامنة الحية الآمنة (Real-time Sync).");
                    } catch (fetchErr) {
                        console.warn("⚠️ فشل في تهيئة المزامنة.");
                    }
                }

                RenderHelpers.init({
                    settings: LiveStoreData.settings || {},
                    rates: LiveStoreData.rates || [],
                    offers: LiveStoreData.offers || [],
                    isStore: true
                });

                console.log("✅ تم استرجاع وتهيئة كافة البيانات الأساسية بأمان.");
            } catch (error) { 
                console.error("❌ فشل تحميل البيانات الحيوية من السحابة:", error); 
            }
        }

        // ⏱️ 2. مزامنة التوقيت السحابي
        try {
            if (DataManager && typeof DataManager._getCloudFunction === 'function') {
                const getServerTimeFn = DataManager._getCloudFunction('getServerTime');
                const timeRes = await getServerTimeFn();
                const serverMs = timeRes.data.serverTime;
                DataManager.serverTimeOffset = serverMs - Date.now();
            }
        } catch (timeErr) {
            DataManager.serverTimeOffset = 0;
        }
        
        if (UIManager.checkSystemStatus && UIManager.checkSystemStatus()) return;
        
        const adminDefaultCurrency = (LiveStoreData.settings && LiveStoreData.settings.defaultCurrency) 
            ? LiveStoreData.settings.defaultCurrency 
            : 'USD';

        const savedDisplayCurr = localStorage.getItem('telecard_display_currency');
        DataManager.selectedCurr = savedDisplayCurr || adminDefaultCurrency;

        if(DataManager.initDummyData) DataManager.initDummyData(); 
        if(DataManager.syncUser) DataManager.syncUser();
        if(DataManager.loadPrefs) DataManager.loadPrefs();
        
        if(typeof UIManager.applyStoreIdentity === 'function') UIManager.applyStoreIdentity();
        if(typeof UIManager.toggleHeroSection === 'function') UIManager.toggleHeroSection(true);
        if(RenderManager.renderHome) RenderManager.renderHome();
        
        if(CalendarApp && CalendarApp.init) CalendarApp.init();
        
        const uiInitMethods = [
            'initSlider', 'updateSidebarText', 'initSupportButton', 'initTheme',
            'applyFontSettings', 'refreshCurrencyMenuFlags', 'renderSettingsUI',
            'loadUserImageAutomatically', 'restoreDisplayState', 'setupMainContentClickDetector',
            'initSwipeGestures'
        ];
        uiInitMethods.forEach(method => { 
            if(typeof UIManager[method] === 'function') UIManager[method](); 
        });
        
        if(typeof UIManager.updateDisplayCurrencyUI === 'function') UIManager.updateDisplayCurrencyUI(DataManager.selectedCurr);
        if(Components && Components.initBottomNavSync) Components.initBottomNavSync();
        
        if(typeof UIManager.checkKycCelebration === 'function') UIManager.checkKycCelebration();

        // 📡 تشغيل المستمعات الحية
        this.initFirebaseListeners();
        this.initGlobalListeners();

        this.isReady = true;
        console.log("🚀 المتجر جاهز تماماً ومتصل بالسحابة!");
        
    } catch (criticalError) {
        console.error("🚨 خطأ حرج يمنع الإقلاع:", criticalError.message);
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
