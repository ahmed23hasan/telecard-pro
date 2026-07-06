// ============================================================================
// 📁 ملف الإعدادات المركزي (config.js) - النسخة الماسية المرنة
// 🎯 الوظيفة: يحتوي على جميع الثوابت، مفاتيح قواعد البيانات، وإعدادات المتجر
// 🚀 التحديث الأقصى: تجميد المفاتيح الحساسة فقط، وترك الإعدادات مرنة للسماح بالإقلاع
// ============================================================================

// 🛡️ [أداة أمنية]: دالة التجميد العميق لضمان عدم اختراق الكائنات المتداخلة
const deepFreeze = (obj) => {
    Object.keys(obj).forEach(prop => {
        if (typeof obj[prop] === 'object' && obj[prop] !== null && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return Object.freeze(obj);
};

// 1. مفاتيح قواعد البيانات السحابية (Firestore Collections)
// 🌟 محمية بالتجميد العميق لمنع التعديل العرضي من أي ملف آخر (Read-Only)
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
    FEEDBACKS: 'telecard_private_feedbacks'
});

// ============================================================================
// 2. مفاتيح الذاكرة المحلية (Local Storage & Cache Keys)
// ============================================================================
export const CACHE_KEYS = deepFreeze({
    ACTIVE_USER: 'telecard_active_user',
    ACTIVE_UID: 'telecard_active_user_uid',
    STORE_CACHE: 'telecard_store_cache',
    STORE_CACHE_FALLBACK: 'telecard_store_cache_fallback',
    THEME: 'telecard_theme',
    DISPLAY_CURRENCY: 'telecard_display_currency',
    DISPLAY_STATE: 'telecard_display_state',
    SPLASH_NAME: 'telecard_splash_name',
    BIOMETRIC_KEY: 'telecard_biometric_key',
    LAYOUT_COLS: 'store_layout_cols',
    SHOWN_TOASTS: 'telecard_shown_toasts'
});

export const DYNAMIC_PREFIXES = deepFreeze({
    USER_IMAGE: 'telecard_user_image_',
    ALERT_VIEWS: 'alert_views_',
    KYC_CELEBRATION: 'kyc_celebrated_'
});

export const ACTIVE_USER_KEY = CACHE_KEYS.ACTIVE_USER;

// ============================================================================
// 3. كائن الإعدادات العامة (Store Configuration & Fallbacks)
// 🚀 [إصلاح الإقلاع]: إزالة التجميد للسماح للمحرك الأساسي بحقن التحديثات
// ============================================================================
export const StoreConfig = {
    currencies: ['USD', 'TRY', 'SYP'],
    
    orderStatusMap: {
        pending: { text: 'قيد التنفيذ', icon: 'fa-clock', class: 'pending' },
        processing: { text: 'جاري التنفيذ', icon: 'fa-spinner fa-spin', class: 'processing' }, // 🚀 تم التعديل لتتوافق مع renderManager
        completed: { text: 'مكتمل', icon: 'fa-circle-check', class: 'completed' },
        refunded: { text: 'مسترجع', icon: 'fa-rotate-left', class: 'refunded' },
        returned: { text: 'مرتجع', icon: 'fa-rotate-left', class: 'returned' },
        rejected: { text: 'مرفوض', icon: 'fa-circle-xmark', class: 'rejected' },
        unknown: { text: 'غير معروف', icon: 'fa-circle-question', class: 'pending' }
    },
    
    paymentStatusMap: {
        pending: { text: 'قيد المعالجة', icon: 'fa-clock', class: 'text-warning' },
        approved: { text: 'مقبول', icon: 'fa-check', class: 'text-success' },
        completed: { text: 'مكتمل', icon: 'fa-check-double', class: 'text-success' }, // 🚀 تم إضافتها لمنع انهيار نافذة تفاصيل الدفع
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
        defaultTierColor: 'var(--primary)'
    }
};