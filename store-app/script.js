// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (script.js) - المجلد الاحترافي المصلح للسحابة
// 🎯 الوظيفة: الإقلاع الشامل، حقن الاعتمادية، ومحرك المزامنة الحي (Real-time)
// 🚀 التحديث: تم الانتقال من نظام (Polling) المكلف إلى (Firestore Listeners)
// ============================================================================

import { DB_KEYS } from './config.js';
import { Utils } from './utils.js';
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import { RenderManager } from './renderManager.js';
import { Components, CalendarApp } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';

const ClientSystem = { 
    isReady: false
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
// 🔄 محرك المزامنة الحي (Real-time Firebase Sync Engine)
// يعتمد على onSnapshot لتحديث الواجهة فوراً وبدون استهلاك الباقة المجانية
// ============================================================================
ClientSystem.initFirebaseListeners = function() {
    console.log("📡 جاري تشغيل مستمعات السحابة الحية (Real-time Listeners)...");

    // 1. تحديد المجموعات التي تتطلب تحديثاً فورياً (الحية)
    const liveKeys = ['USERS', 'ORDERS', 'DEPOSITS', 'ALERTS', 'SETTINGS'];

    liveKeys.forEach(keyName => {
        const collectionName = DB_KEYS[keyName];
        if (!collectionName) return;

        // 2. تفعيل المستمع السحابي
        StoreDB.listenCollection(collectionName, (data) => {
            const property = keyName.toLowerCase();
            LiveStoreData[property] = data;

            // 3. تحديث محرك الرسم إذا تغيرت الإعدادات
            if (keyName === 'SETTINGS') {
                RenderHelpers.init({
                    settings: LiveStoreData.settings || {},
                    rates: LiveStoreData.rates || [],
                    offers: LiveStoreData.offers || [],
                    isStore: true
                });
            }

            // 4. تحديث الواجهة بسلاسة فور وصول البيانات الجديدة
            if (DataManager.syncUser) DataManager.syncUser();
            
            if (UIManager) {
                if (typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
                if (typeof UIManager.processAndDisplayAlerts === 'function') UIManager.processAndDisplayAlerts();
                if (typeof UIManager.updateNotifBadges === 'function') UIManager.updateNotifBadges();
                
                if (typeof UIManager.updateDisplayCurrencyUI === 'function') {
                    UIManager.updateDisplayCurrencyUI(DataManager.selectedCurr);
                }
            }
        });
    });
};

// ============================================================================
// 🚀 نقطة الإقلاع المركزية للنظام (Bootstrapper)
// ============================================================================
ClientSystem.init = async function() {
    try {
        console.log("🚀 جاري إقلاع النظام السحابي المحصن...");

        if(typeof UIManager.applySavedTheme === 'function') UIManager.applySavedTheme();
        
        // 📥 1. التحميل الأولي للبيانات الثابتة (يتم مرة واحدة لتوفير التكلفة)
        if (StoreDB) {
            try {
                // استثناء البيانات الحية التي سيتكفل بها المستمع (Listeners)
                const staticKeys = ['CATS', 'PRODS', 'BANNERS', 'OFFERS', 'RATES', 'TIERS', 'VAULT', 'COUPONS', 'COUNTRIES'];
                
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

                console.log("✅ تم استرجاع وتهيئة كافة البيانات الأساسية من السحابة بنجاح.");
            } catch (error) { 
                console.error("❌ فشل تحميل البيانات الحيوية من السحابة:", error); 
            }
        }
        
        if (UIManager.checkSystemStatus && UIManager.checkSystemStatus()) return;
        
        const savedDisplayCurr = localStorage.getItem('telecard_display_currency');
        if (savedDisplayCurr) DataManager.selectedCurr = savedDisplayCurr;
        
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

        // 📡 تشغيل محرك المزامنة السحابي الحي (البديل العصري والآمن للـ Sync القديم)
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
