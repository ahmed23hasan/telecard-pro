// ============================================================================
// ⚙️ ملف الإعدادات والأساسيات (adminConfig.js) - Enterprise V16.5 💎
// 🎯 الوظيفة: مصدر الحقيقة الوحيد للمفاتيح وإعدادات فايربيز.
// 🚀 التحديث: 
// 1. Circular Dependency Fix: إزالة استيراد FinancialEngine لفك الارتباط الدائري القاتل.
// 2. Data Only Object: تحويل الملف إلى Pure Config Object لمنع انهيار الـ Imports.
// ============================================================================

const deepFreeze = (obj) => {
    Object.keys(obj).forEach(prop => {
        if (typeof obj[prop] === 'object' && obj[prop] !== null && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return Object.freeze(obj);
};

export const firebaseConfig = deepFreeze({
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78"
});

export const DB_KEYS = deepFreeze({
    CATS: 'telecard_cats',
    PRODS: 'telecard_prods', // 👈 الإدارة ترى كل شيء (المنتجات الأصلية بتكلفتها)
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
    TIERS: 'telecard_tiers',
    BACKUP_HISTORY: 'telecard_backup_history',
    COUNTRIES: 'telecard_countries',
    VAULT: 'telecard_vault',
    COUPONS: 'telecard_coupons',
    OFFERS: 'telecard_offers',
    LOGS: 'telecard_audit_logs',
    ALERTS: 'telecard_alerts',
    KYC: 'telecard_kyc',
    SUPPLIERS: 'telecard_suppliers', 
    SYSTEM_ERRORS: 'telecard_system_errors' 
});

export const normalizeRates = (rawArray) => {
    let map = {
        'USD': { code: 'USD', name: 'دولار أمريكي', symbol: '$', priceRate: 1, depRate: 1, isBase: true }
    };

    if (Array.isArray(rawArray)) {
        rawArray.forEach(r => {
            if (r && r.code && String(r.code).toUpperCase() !== 'USD') {
                map[String(r.code).toUpperCase()] = { ...r, isBase: false };
            }
        });
    } else if (rawArray && typeof rawArray === 'object') {
        Object.values(rawArray).forEach(r => {
            if (r && r.code && String(r.code).toUpperCase() !== 'USD') {
                map[String(r.code).toUpperCase()] = { ...r, isBase: false };
            }
        });
    }

    return Object.values(map);
};
