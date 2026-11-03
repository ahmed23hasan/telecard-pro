// ============================================================================
// 📁 ملف الإعدادات المركزي (config.js) - الإصدار المؤسسي V22.0.0 💎
// 🎯 الوظيفة: ثوابت النظام، توحيد مفاتيح قواعد البيانات والكاش، ومنع التضارب.
// 🚀 التحديثات المعمارية (V22.0.0 - Zero-Collision Keys & Server Alignment):
// 1. Version Keys Separation 🛡️: فصل مفاتيح إصدار الكتالوج عن إصدار التطبيق لمنع حلقات إعادة التحميل.
// 2. Canonical DB Keys 🗄️: إضافة مفتاح KYC القياسي وحذف المفاتيح المكررة غير المستخدمة.
// 3. Magic Strings Elimination 🧹: تجميع كافة مفاتيح التخزين المحلي في CACHE_KEYS كمصدر حقيقة وحيد.
// ============================================================================

const globalEnv = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {});
export const APP_VERSION = globalEnv.TELECARD_VERSION ? globalEnv.TELECARD_VERSION : 'v26.0';

const deepFreeze = (obj) => {
    Object.keys(obj).forEach(prop => {
        if (typeof obj[prop] === 'object' && obj[prop] !== null && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return Object.freeze(obj);
};

// ☁️ إعدادات فايربيز
export const firebaseConfig = deepFreeze({
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78",
    vapidKey: "BDdFL5sHBs1j5RXsps4TahR2UN4qCRwZR2G769OJEGR_1gTj8D2MHsTRsMeSv_Spad22N6LYFsu0x9GhdARqEFk"
});

// 🗄️ مفاتيح قاعدة البيانات القياسية (Firestore Collections - مطابقة للسيرفر والأدمن)
export const DB_KEYS = deepFreeze({
    CATS: 'telecard_cats',
    PRODS: 'telecard_prods_public',
    SETTINGS: 'telecard_settings',
    USERS: 'telecard_users',
    BANNERS: 'telecard_banners',
    ORDERS: 'telecard_orders',
    DEPOSITS: 'telecard_deposits',
    PAYMENTS: 'telecard_payments',
    RATES: 'telecard_rates',
    POPUP: 'telecard_popup',
    SYSTEM: 'telecard_system',
    ADMIN: 'telecard_admin',
    PREFS: 'telecard_user_prefs',
    TIERS: 'telecard_tiers_public',
    VAULT: 'telecard_vault',
    COUPONS: 'telecard_coupons',
    COUNTRIES: 'telecard_countries',
    OFFERS: 'telecard_offers',
    ALERTS: 'telecard_alerts',
    KYC: 'telecard_kyc',
    REVIEWS: 'telecard_reviews',
    NOTIF_READ_LIST: 'telecard_read_notifs'
});

// 🛡️ مفاتيح الكاش والجلسات المحلية الموحدة (LocalStorage & SessionStorage - بدون أي تضارب)
export const CACHE_KEYS = deepFreeze({
    ACTIVE_USER: 'telecard_active_user_v21',
    ACTIVE_UID: 'telecard_active_user_uid_v21',
    SETTINGS_SNAPSHOT: 'telecard_settings_snapshot_v21',
    RATES_SNAPSHOT: 'telecard_rates_snapshot_v21',
    CATS_COUNT: 'tc_cats_count',
    ORPHANED_FILES: 'tc_orphaned_files',
    LAST_CLEANUP: 'tc_last_cleanup',
    TIME_SYNC: 'telecard_time_sync_ts_v21',
    THEME: 'telecard_theme',
    DISPLAY_CURRENCY: 'telecard_display_currency',
    DISPLAY_STATE: 'telecard_display_state',
    SPLASH_NAME: 'telecard_splash_name',
    BIOMETRIC_KEY: 'telecard_biometric_key',
    LAYOUT_COLS: 'store_layout_cols',
    SHOWN_TOASTS: 'telecard_shown_toasts',
    
    // 📌 مفاتيح الإصدارات المفصولة تماماً لمنع التضارب وحلقات التحديث
    SERVER_VERSION: 'tc_catalog_config_version', // لإصدار الكتالوج والعملات (catalogVersion + configVersion)
    REMOTE_APP_VERSION: 'tc_remote_app_version', // لإصدار التطبيق المرسل من الإعدادات (settings.appVersion)
    LOCAL_APP_VERSION: 'tc_local_app_version', // لإصدار ملفات الواجهة المحلية (window.TELECARD_VERSION)
    
    // مفاتيح الجلسات والترحيب والخصوصية
    CLIENT_IP: 'tc_client_ip',
    UPDATE_RELOADS: 'tc_update_reloads_v2',
    LOGOUT_TOAST: 'tc_show_logout_toast',
    GREETING_SHOWN: 'tc_has_been_greeted',
    NEW_USER_SIGNUP: 'tc_new_user_signup',
    GUEST_PROMO_TIME: 'tc_guest_promo_time',
    GUEST_GREET_TIME: 'tc_guest_greet_time',
    PUSH_PROMPT_TIME: 'tc_push_prompt_time',
    USER_RATED: 'tc_user_rated'
});

export const DYNAMIC_PREFIXES = deepFreeze({
    USER_IMAGE: 'telecard_user_image_',
    ALERT_VIEWS: 'alert_views_',
    KYC_CELEBRATION: 'kyc_celebrated_'
});

export const ACTIVE_USER_KEY = CACHE_KEYS.ACTIVE_USER;

export const StoreConfig = deepFreeze({
    baseCurrency: 'USD',
    fallbackCurrencies: ['USD', 'TRY', 'SYP'],
    
    orderStatusMap: {
        pending: { text: 'قيد التنفيذ', icon: 'fa-clock', class: 'pending' },
        processing: { text: 'جاري تجهيز الطلب', icon: 'fa-gears', class: 'processing' },
        completed: { text: 'مكتمل', icon: 'fa-circle-check', class: 'completed' },
        refunded: { text: 'مسترجع', icon: 'fa-rotate-left', class: 'refunded' },
        returned: { text: 'مرتجع', icon: 'fa-rotate-left', class: 'returned' },
        rejected: { text: 'مرفوض', icon: 'fa-circle-xmark', class: 'rejected' },
        unknown: { text: 'غير معروف', icon: 'fa-circle-question', class: 'pending' }
    },
    
    paymentStatusMap: {
        pending: { text: 'قيد المعالجة', icon: 'fa-clock', class: 'text-warning' },
        approved: { text: 'مقبول', icon: 'fa-check', class: 'text-success' },
        completed: { text: 'مكتمل', icon: 'fa-check-double', class: 'text-success' },
        deducted: { text: 'مخصوم', icon: 'fa-arrow-up-long', class: 'text-danger' },
        rejected: { text: 'مرفوض', icon: 'fa-xmark', class: 'text-danger' },
        refunded: { text: 'مسترجع', icon: 'fa-rotate-left', class: 'text-info' },
        returned: { text: 'مرتجع', icon: 'fa-rotate-left', class: 'text-info' }
    },
    
    texts: {
        invalidDate: 'تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء',
        noOrders: 'لا توجد نتائج',
        noWallet: 'لا توجد سجلات',
        noPayments: 'لا توجد عمليات'
    },
    
    defaults: {
        currencySymbol: '$',
        defaultTierName: 'عضو',
        defaultTierIcon: 'fa-solid fa-medal',
        defaultTierColor: 'var(--primary)',
        defaultAvatar: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
    }
});