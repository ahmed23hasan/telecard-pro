// ============================================================================
// ⚙️ ملف الإعدادات والأساسيات (adminConfig.js) - Enterprise V16.6 💎
// 🎯 الوظيفة: مصدر الحقيقة الوحيد للمفاتيح وإعدادات فايربيز.
// 🚀 التحديثات (V16.6 - Security & Stability Patch):
// 1. Firebase Mutability Fix 🛡️: إزالة التجميد عن إعدادات فايربيز لمنع انهيار الـ SDK.
// 2. VAPID Key Centralization 🔑: إضافة مفتاح الرادار السحابي كمصدر حقيقة وحيد (SSOT).
// ============================================================================

const deepFreeze = (obj) => {
    Object.keys(obj).forEach(prop => {
        if (typeof obj[prop] === 'object' && obj[prop] !== null && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return Object.freeze(obj);
};

// 🛡️ تم إزالة deepFreeze هنا للسماح لمكتبة Firebase بحقن البيانات الوصفية (Metadata) بحرية
export const firebaseConfig = {
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78"
};

// 🚀 [التحديث المعماري]: مفتاح الرادار الموحد (Single Source of Truth)
export const VAPID_KEY = "BDdFL5sHBs1j5RXsps4TahR2UN4qCRwZR2G769OJEGR_1gTj8D2MHsTRsMeSv_Spad22N6LYFsu0x9GhdARqEFk";

// 🔒 الجداول تبقى مجمدة لأنها ثوابت خاصة بالنظام ولا يجب تعديلها برمجياً عن طريق الخطأ
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
