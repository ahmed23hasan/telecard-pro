// ============================================================================
// ⚙️ ملف الإعدادات والأساسيات (adminConfig.js) - Enterprise V14.8 💎
// 🎯 الوظيفة: مصدر الحقيقة الوحيد للمفاتيح، إعدادات فايربيز، والمحرك المالي
// 🚀 التحديثات المعمارية (V14.8):
// 1. API Security: توثيق ضرورة تقييد الـ HTTP Referrers لمفاتيح فايربيز.
// 2. DB Keys Isolation: استدعاء telecard_prods حصرياً لكشف بيانات الموردين للإدارة.
// ============================================================================

import { FinancialEngine } from './core/financialEngine.js';

const deepFreeze = (obj) => {
    Object.keys(obj).forEach(prop => {
        if (typeof obj[prop] === 'object' && obj[prop] !== null && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return Object.freeze(obj);
};

export const firebaseConfig = deepFreeze({
    // 🛑 [تنبيه أمني أقصى]: هذا المفتاح مرئي (وهذا طبيعي في الويب)، 
    // لكن يجب الدخول إلى Google Cloud Console -> APIs & Services -> Credentials
    // وإضافة (HTTP Referrers) لتسمح فقط بنطاق موقعك (Domain) باستخدامه لمنع سرقة البيانات.
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

// ============================================================================
// 💱 إعادة تصدير دوال المعالجة المالية (نظيفة بدون bind)
// ============================================================================
export const normalizeRates = (rawArray) => FinancialEngine.normalizeRates(rawArray);
export const convertViaUSD = (amount, fromCode, toCode, ratesArray, channel) =>
    FinancialEngine.convertViaUSD(amount, fromCode, toCode, ratesArray, channel);

// ============================================================================
// ⚖️ المحرك المالي المركزي (Telecard Pricing Engine)
// ============================================================================
export const TelecardPricingEngine = deepFreeze({
    calculate: (params) => FinancialEngine.calculatePrice(params)
});
