// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (script.js) - المجلد الاحترافي المصلح للسحابة
// 🎯 الوظيفة: الإقلاع الشامل، حقن الاعتمادية، ومحرك المزامنة الحي (Real-time)
// 🚀 التحديث: تم الانتقال من نظام (Polling) المكلف إلى (Firestore Listeners) بشكل آمن مع سد تسريب الذاكرة
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
    }
}; 

// 🔗 دمج الوحدات (Facade Pattern) - تجميع آمن للمكونات
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
    
    // 🌟 تنظيف أي استماع سابق قبل بدء استماع جديد
    this.clearFirebaseListeners();

    // 1. الإعدادات والتنبيهات العامة (مسموحة للجميع)
    if (DB_KEYS.SETTINGS) {
        const unsubSettings = StoreDB.listenCollection(DB_KEYS.SETTINGS, (data) => {
            LiveStoreData.settings = data;
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
        });
        this.activeListeners.push(unsubSettings);
    }

    if (DB_KEYS.ALERTS) {
        const unsubAlerts = StoreDB.listenCollection(DB_KEYS.ALERTS, (data) => {
            LiveStoreData.alerts = data;
            if (UIManager && typeof UIManager.processAndDisplayAlerts === 'function') UIManager.processAndDisplayAlerts();
            if (UIManager && typeof UIManager.updateNotifBadges === 'function') UIManager.updateNotifBadges();
        });
        this.activeListeners.push(unsubAlerts);
    }

    // 2. البيانات الخاصة (تُجلب للعميل المسجل فقط وبناءً على المعرّف الخاص به)
    const uid = localStorage.getItem('telecard_active_user_uid');
    if (uid) {
        // جلب ملف العميل الشخصي فقط وليس جدول المستخدمين!
        if (StoreDB.listenDoc) {
            const unsubUser = StoreDB.listenDoc(DB_KEYS.USERS, uid, (userData) => {
                if (userData) {
                    LiveStoreData.users = [userData]; // الحفاظ على توافقية المصفوفة للأنظمة القديمة
                    if (DataManager.syncUser) DataManager.syncUser();
                    if (UIManager && typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
                }
            });
            this.activeListeners.push(unsubUser);
        }

        // جلب طلبات وإيداعات العميل فقط عبر فلتر ذكي (Query)
        if (StoreDB.listenQuery) {
            const unsubOrders = StoreDB.listenQuery(DB_KEYS.ORDERS, ['userId', '==', uid], (data) => {
                LiveStoreData.orders = data;
                if (UIManager && typeof UIManager.renderOrders === 'function') UIManager.renderOrders();
            });
            this.activeListeners.push(unsubOrders);

            const unsubDeposits = StoreDB.listenQuery(DB_KEYS.DEPOSITS, ['userId', '==', uid], (data) => {
                LiveStoreData.deposits = data;
                if (UIManager && typeof UIManager.renderWallet === 'function') UIManager.renderWallet();
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
        
        // 📥 1. التحميل الأولي للبيانات الثابتة (يتم مرة واحدة لتوفير التكلفة)
        if (StoreDB) {
            try {
                // 🚨 تم إزالة 'VAULT' من هنا نهائياً لحماية الأكواد السرية!
                // استثناء البيانات الحية التي سيتكفل بها المستمع (Listeners)
                const staticKeys = ['CATS', 'PRODS', 'BANNERS', 'OFFERS', 'RATES', 'TIERS', 'COUPONS', 'COUNTRIES'];
                
                const fetchPromises = staticKeys.map(k => StoreDB.getAll(DB_KEYS[k]));
                const results = await Promise.all(fetchPromises);
                
                staticKeys.forEach((keyName, i) => {
                    const property = keyName.toLowerCase(); 
                    LiveStoreData[property] = results[i] || [];
                });

                // ✅ حقن البيانات فوراً للمحرك المالي قبل بدء رسم الواجهة
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
        
        if (UIManager.checkSystemStatus && UIManager.checkSystemStatus()) return;
        
        const adminDefaultCurrency = (LiveStoreData.settings && LiveStoreData.settings.defaultCurrency) 
    ? LiveStoreData.settings.defaultCurrency 
    : 'USD';

const savedDisplayCurr = localStorage.getItem('telecard_display_currency');

// إعطاء الأولوية للعملة المحفوظة، ثم لعملة العرض الافتراضية التي حددها الأدمن
DataManager.selectedCurr = savedDisplayCurr || adminDefaultCurrency;

        // ⚙️ تهيئة حالة المستخدم والإعدادات
        if(DataManager.initDummyData) DataManager.initDummyData(); // يمكن إزالتها لاحقاً بعد استقرار الفايربيز
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
