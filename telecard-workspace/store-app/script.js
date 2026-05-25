// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (script.js) - المجلد الاحترافي المصلح للسحابة
// 🎯 الوظيفة: الإقلاع الشامل، حقن الاعتمادية، ومحرك المزامنة الحي (Real-time)
// 🚀 التحديث: إضافة تفويض الأحداث المركزي، منع التضارب، وإصلاح الأقواس (Syntax)
// ============================================================================

import { DB_KEYS } from './config.js';
import { Utils } from './utils.js';
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import { RenderManager } from './renderManager.js';
import { Components, CalendarApp } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';

const ClientSystem = { 
    isReady: false,
    activeListeners: [], // 🌟 مصفوفة لتخزين دوال الإغلاق للمستمعات الحية

    // 🌟 دالة تنظيف المستمعات لمنع تسريب الذاكرة وتكرار القراءات
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
        // 🌟 1. مدير النقرات خارج العناصر المركزية (Click-Outside Manager)
        // نستخدم (true) لتفعيل الـ Capturing Phase والتقاط الحدث قبل أي stopPropagation
        document.addEventListener('click', (e) => {
            // إغلاق باقات المنتجات المنسدلة
            const packageWrapper = document.getElementById('pkg-custom-dropdown');
            if (packageWrapper && packageWrapper.classList.contains('open') && !packageWrapper.contains(e.target) && !e.target.closest('.dropdown-trigger')) {
                packageWrapper.classList.remove('open');
            }

            // إغلاق صندوق إحصائيات المحفظة
            const walletDrawer = document.getElementById('walletStatsDrawer');
            if (walletDrawer && walletDrawer.classList.contains('active')) {
                const isClickInsideDrawer = walletDrawer.contains(e.target);
                const isClickOnToggleButton = e.target.closest('.detail-arrow') || e.target.closest('.wallet-toggle-btn') || e.target.closest('[data-action="toggle-wallet-stats"]'); 
                
                if (!isClickInsideDrawer && !isClickOnToggleButton) {
                    if (typeof this.closeWalletStats === 'function') this.closeWalletStats(); 
                }
            }
        }, true); 

        // 🌟 2. متغيرات تتبع النقر المزدوج (Double Click Tracker)
        let lastClickTime = 0;
        let lastClickTarget = null;
        let clickTimeout = null;

        // 🌟 3. المعالج المركزي لأحداث (data-action)
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            
            // إذا لم يكن العنصر قابلاً للنقر عبر نظامنا، نتجاهل الأمر
            if (!target) return;

            const action = target.getAttribute('data-action');
            const id = target.getAttribute('data-id');

            // توجيه الحدث (Routing) بناءً على نوع الأكشن
            switch (action) {
                // 🛒 أحداث التصفح والمنتجات
                case 'open-category':
                    e.preventDefault();
                    if(typeof this.openCategory === 'function') this.openCategory(id); 
                    break;
                    
                case 'open-product':
                    e.preventDefault();
                    const currentTime = new Date().getTime();
                    const timeDiff = currentTime - lastClickTime;

                    // 🌟 معالجة النقر المزدوج (أقل من 300 مللي ثانية) للمفضلة السريعة
                    if (timeDiff < 300 && lastClickTarget === id) {
                        clearTimeout(clickTimeout);
                        if(typeof this.triggerMagicFavorite === 'function') this.triggerMagicFavorite(e, id);
                        lastClickTime = 0; // إعادة الضبط
                    } else {
                        // نقرة مفردة عادية (ننتظر قليلاً للتأكد أنها ليست مزدوجة)
                        clickTimeout = setTimeout(() => {
                            if(typeof this.openProdModal === 'function') this.openProdModal(id);
                        }, 300);
                        lastClickTime = currentTime;
                        lastClickTarget = id;
                    }
                    break;

                // 💳 أحداث الدفع والمحفظة
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

                // 🎟️ أحداث الكوبونات
                case 'apply-coupon':
                    if(typeof this.applyCoupon === 'function') this.applyCoupon();
                    break;
                    
                case 'remove-coupon':
                    if(typeof this.removeCoupon === 'function') this.removeCoupon();
                    break;

                // ⚙️ أحداث القوائم المنسدلة (كبسولة العملات وغيرها)
                case 'toggle-dropdown':
                    const dropWrapper = target.closest('.custom-dropdown') || target.parentElement;
                    if (dropWrapper) dropWrapper.classList.toggle('open');
                    break;

                case 'select-dropdown-item':
                    if(typeof this.selectDropdownItem === 'function') this.selectDropdownItem(target);
                    break;

                // ⚙️ أحداث النظام والواجهة
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

                // 🪪 أحداث الهوية والملف الشخصي
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
    } // 🌟 إغلاق دالة initGlobalListeners
}; // 🌟 إغلاق كائن ClientSystem بالكامل (هنا كان الخلل!)

// ============================================================================
// 🔗 دمج الوحدات (Facade Pattern) - تجميع آمن للمكونات
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
// 🔄 محرك المزامنة الحي (Real-time Firebase Sync Engine) - النسخة الآمنة
// ============================================================================
ClientSystem.initFirebaseListeners = function() {
    console.log("📡 جاري تشغيل مستمعات السحابة الحية (المحمية)...");
    
    this.clearFirebaseListeners();

    // 1. الإعدادات والتنبيهات العامة (مسموحة للجميع)
    if (DB_KEYS.SETTINGS) {
        const unsubSettings = StoreDB.listenCollection(DB_KEYS.SETTINGS, (data) => {
            LiveStoreData.settings = Array.isArray(data) ? (data[0] || {}) : (data || {});
            
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
            LiveStoreData.alerts = Object.freeze([...data]); 
            requestAnimationFrame(() => {
                if (UIManager && typeof UIManager.processAndDisplayAlerts === 'function') UIManager.processAndDisplayAlerts();
                if (UIManager && typeof UIManager.updateNotifBadges === 'function') UIManager.updateNotifBadges();
            });
        });
        this.activeListeners.push(unsubAlerts);
    }

    // 2. البيانات الخاصة (تُجلب للعميل المسجل فقط وبناءً على المعرّف الخاص به)
    const uid = localStorage.getItem('telecard_active_user_uid');
    if (uid) {
        if (StoreDB.listenDoc) {
            const unsubUser = StoreDB.listenDoc(DB_KEYS.USERS, uid, (userData) => {
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
            const unsubOrders = StoreDB.listenQuery(DB_KEYS.ORDERS, ['userId', '==', uid], (data) => {
                LiveStoreData.orders = Object.freeze([...data]);
                requestAnimationFrame(() => {
                    if (UIManager && typeof UIManager.renderOrders === 'function') UIManager.renderOrders();
                });
            });
            this.activeListeners.push(unsubOrders);

            const unsubDeposits = StoreDB.listenQuery(DB_KEYS.DEPOSITS, ['userId', '==', uid], (data) => {
                LiveStoreData.deposits = Object.freeze([...data]);
                requestAnimationFrame(() => {
                    if (UIManager && typeof UIManager.renderWallet === 'function') UIManager.renderWallet();
                });
            });
            this.activeListeners.push(unsubDeposits);
        } else {
            console.warn("⚠️ المحول يفتقد لدالة listenQuery، سيتم إيقاف المزامنة الحية للطلبات مؤقتاً.");
        }
    }
};

// ============================================================================
// 🚀 نقطة الإقلاع المركزية للنظام (Bootstrapper) - النسخة المحصنة
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

        // ⏱️ 2. مزامنة التوقيت السحابي (Time Sync)
        try {
            if (DataManager && typeof DataManager._getCloudFunction === 'function') {
                const getServerTimeFn = DataManager._getCloudFunction('getServerTime');
                const timeRes = await getServerTimeFn();
                const serverMs = timeRes.data.serverTime;
                DataManager.serverTimeOffset = serverMs - Date.now();
                console.log(`⏱️ تمت مزامنة التوقيت السحابي بنجاح. الفارق: ${DataManager.serverTimeOffset}ms`);
            }
        } catch (timeErr) {
            console.warn("⚠️ تعذر مزامنة التوقيت مع السيرفر، سيتم الاعتماد على الوقت المحلي كإجراء احتياطي.");
            DataManager.serverTimeOffset = 0;
        }
        
        if (UIManager.checkSystemStatus && UIManager.checkSystemStatus()) return;
        
        const adminDefaultCurrency = (LiveStoreData.settings && LiveStoreData.settings.defaultCurrency) 
            ? LiveStoreData.settings.defaultCurrency 
            : 'USD';

        const savedDisplayCurr = localStorage.getItem('telecard_display_currency');

        DataManager.selectedCurr = savedDisplayCurr || adminDefaultCurrency;

        // ⚙️ تهيئة حالة المستخدم والإعدادات
        if(DataManager.initDummyData) DataManager.initDummyData(); 
        if(DataManager.syncUser) DataManager.syncUser();
        if(DataManager.loadPrefs) DataManager.loadPrefs();
        
        // 🎨 رسم الواجهة الأساسية
        if(typeof UIManager.applyStoreIdentity === 'function') UIManager.applyStoreIdentity();
        if(typeof UIManager.toggleHeroSection === 'function') UIManager.toggleHeroSection(true);
        if(RenderManager.renderHome) RenderManager.renderHome();
        
        if(CalendarApp && CalendarApp.init) CalendarApp.init();
        
        // 🛠️ تفعيل مكونات الواجهة التفاعلية
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
        
        // 🎉 التحقق من احتفالية التوثيق
        if(typeof UIManager.checkKycCelebration === 'function') UIManager.checkKycCelebration();

        // 📡 تشغيل محرك المزامنة السحابي الحي المحمي
        this.initFirebaseListeners();
        
        // 🎯 تشغيل مستمع الأحداث المركزي لتنظيم النقرات
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
