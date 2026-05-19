// ============================================================================
// 📁 ملف الإعدادات المركزي (config.js) - ES6 Module
// 🎯 الوظيفة: يحتوي على جميع الثوابت، مفاتيح قواعد البيانات، وإعدادات المتجر
// 🚀 التحديث: تطبيق مبدأ (Immutability) وتوسيع خرائط الحالات لتشمل جميع الاحتمالات
// ============================================================================

// 1. مفاتيح قواعد البيانات (Local Storage Keys)
// 🌟 استخدام Object.freeze لمنع التعديل العرضي من أي ملف آخر (Read-Only)
export const DB_KEYS = Object.freeze({ 
    CATS: 'telecard_cats', 
    PRODS: 'telecard_prods', 
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
    
    // 🌟 مفاتيح المزامنة مع الإدارة
    COUNTRIES: 'telecard_countries', 
    OFFERS: 'telecard_offers',       
    
    // 🔔 محرك الإشعارات والمنبثقات
    ALERTS: 'telecard_alerts',              
    NOTIF_READ_LIST: 'telecard_read_notifs' 
});

// 2. مفتاح الجلسة للمستخدم الحالي
export const ACTIVE_USER_KEY = 'telecard_active_user';

// ============================================================================
// 3. كائن الإعدادات العامة (Store Configuration)
// ============================================================================
export const StoreConfig = Object.freeze({
    // العملات الافتراضية (كمرجعية احتياطية في حال تأخر جلب البيانات من الخادم)
    currencies: Object.freeze(['USD', 'TRY', 'SYP']),
    
    // خرائط الحالات (Status Maps)
    orderStatusMap: Object.freeze({
        pending: { text: 'قيد التنفيذ', icon: 'fa-clock', class: 'pending' },
        processing: { text: 'جاري التنفيذ', icon: 'fa-spinner fa-spin', class: 'pending' },
        completed: { text: 'مكتمل', icon: 'fa-circle-check', class: 'completed' },
        refunded: { text: 'مسترجع', icon: 'fa-rotate-left', class: 'refunded' },
        returned: { text: 'مرتجع', icon: 'fa-rotate-left', class: 'returned' }, // 👈 تمت إضافتها لتطابق ملفات الرسم
        rejected: { text: 'مرفوض', icon: 'fa-circle-xmark', class: 'rejected' },
        unknown: { text: 'غير معروف', icon: 'fa-circle-question', class: 'pending' }
    }),

    paymentStatusMap: Object.freeze({
        pending: { text: 'قيد المعالجة', icon: 'fa-clock', color: '#f59e0b' },
        approved: { text: 'مقبول', icon: 'fa-check', color: '#10b981' },
        rejected: { text: 'مرفوض', icon: 'fa-xmark', color: '#ef4444' },
        refunded: { text: 'مسترجع', icon: 'fa-rotate-left', color: '#0ea5e9' },
        returned: { text: 'مرتجع', icon: 'fa-rotate-left', color: '#0ea5e9' } // 👈 تمت إضافتها لتطابق ملفات الرسم
    }),

    texts: Object.freeze({
        invalidDate: 'تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء',
        noOrders: 'لا توجد نتائج',
        noWallet: 'لا توجد سجلات',
        noPayments: 'لا توجد عمليات'
    }),

    defaults: Object.freeze({
        currencySymbol: '$',
        defaultTierName: 'عضو',
        defaultTierIcon: 'fa-solid fa-medal',
        defaultTierColor: '#FFD700'
    })
});
