// ============================================================================
// 📁 ملف الإعدادات المركزي (config.js) - الإصدار المؤسسي V21.1 💎
// 🎯 الوظيفة: ثوابت النظام، حماية مفاتيح قواعد البيانات، ونسف الكاش القديم
// 🚀 التحديثات المعمارية (V21.1 - Master Patch):
// 1. Missing Keys Alignment 🛡️: إدراج مفاتيح الإشعارات والتقييم لمنع النصوص السحرية.
// 2. VAPID Integration 🛡️: نقل مفتاح الإشعارات (FCM) للدستور لمنع التشتت.
// 3. Environment Safe 🛡️: دعم قراءة المتغيرات داخل Service Workers عبر (self).
// 4. Immutable Core: الحفاظ على deepFreeze لحماية الثوابت.
// ============================================================================

// 🛡️ دعم آمن لجلب رقم الإصدار سواء من المتصفح (window) أو عامل الخدمة (self)
const globalEnv = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {});
export const APP_VERSION = globalEnv.TELECARD_VERSION ? globalEnv.TELECARD_VERSION : 'v21.1';

// 🛡️ تجميد عميق مخصص فقط لملف الثوابت لمنع العبث بمفاتيح النظام
const deepFreeze = (obj) => {
    Object.keys(obj).forEach(prop => {
        if (typeof obj[prop] === 'object' && obj[prop] !== null && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return Object.freeze(obj);
};

// ☁️ إعدادات فايربيز (يجب تقييدها بنطاق موقعك عبر Google Cloud Console)
export const firebaseConfig = deepFreeze({
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78",
    
    // 🛡️ مفتاح الـ FCM (VAPID) تم جلبه إلى هنا لكي نحذفه لاحقاً من ملف firebaseAdapter
    vapidKey: "BDdFL5sHBs1j5RXsps4TahR2UN4qCRwZR2G769OJEGR_1gTj8D2MHsTRsMeSv_Spad22N6LYFsu0x9GhdARqEFk"
});

// 🗄️ مفاتيح قاعدة البيانات (Firestore Collections)
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
    TIERS: 'telecard_tiers',
    VAULT: 'telecard_vault',
    COUPONS: 'telecard_coupons',
    COUNTRIES: 'telecard_countries',
    OFFERS: 'telecard_offers',
    ALERTS: 'telecard_alerts',
    NOTIF_READ_LIST: 'telecard_read_notifs',
    FEEDBACKS: 'telecard_private_feedbacks',
    REVIEWS: 'reviews'
});

// 🛡️ مفاتيح الكاش والجلسات المحلية (LocalStorage & SessionStorage)
export const CACHE_KEYS = deepFreeze({
    ACTIVE_USER: 'telecard_active_user_v21',
    ACTIVE_UID: 'telecard_active_user_uid_v21',
    STORE_CACHE: 'telecard_store_cache_v21',
    STORE_CACHE_FALLBACK: 'telecard_store_cache_fallback_v21',
    SMART_CATALOG: 'telecard_store_catalog_master_v21',
    CATALOG_VERSION: 'telecard_catalog_version_v21',
    TIME_SYNC: 'telecard_time_sync_ts_v21',
    THEME: 'telecard_theme',
    DISPLAY_CURRENCY: 'telecard_display_currency',
    DISPLAY_STATE: 'telecard_display_state',
    SPLASH_NAME: 'telecard_splash_name',
    BIOMETRIC_KEY: 'telecard_biometric_key',
    LAYOUT_COLS: 'store_layout_cols',
    SHOWN_TOASTS: 'telecard_shown_toasts',
    
    // مفاتيح النظام والجلسات
    SERVER_VERSION: 'tc_server_version',
    LOCAL_APP_VERSION: 'tc_app_version',
    CLIENT_IP: 'tc_client_ip',
    UPDATE_RELOADS: 'tc_update_reloads',
    LOGOUT_TOAST: 'tc_show_logout_toast',
    GREETING_SHOWN: 'tc_has_been_greeted',
    NEW_USER_SIGNUP: 'tc_new_user_signup',

    // 🛡️ مفاتيح الخصوصية وتجربة المستخدم (المضافة حديثاً لتوحيد المصدر)
    PUSH_PROMPT_TIME: 'tc_push_prompt_time',
    PENDING_FCM_DELETE: 'tc_pending_fcm_delete',
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
