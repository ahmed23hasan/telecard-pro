// ============================================================================
// ⚙️ ملف الإعدادات والأساسيات (adminConfig.js) - Enterprise V14.5 💎
// 🎯 الوظيفة: مصدر الحقيقة الوحيد للمفاتيح، إعدادات فايربيز، والمحرك المالي
// 🚀 التحديثات:
// 1. Audit Logs Sync: تصحيح مفتاح السجلات ليتطابق مع السيرفر (telecard_audit_logs).
// 2. Deep Freeze: تجميد عميق لمنع اختراق المتغيرات (Shallow Freeze Bypass).
// ============================================================================

import { FinancialEngine } from './core/financialEngine.js';

// 🛡️ [أداة أمنية]: دالة التجميد العميق لضمان عدم اختراق أو تعديل الكائنات المتداخلة
const deepFreeze = (obj) => {
    Object.keys(obj).forEach(prop => {
        if (typeof obj[prop] === 'object' && obj[prop] !== null && !Object.isFrozen(obj[prop])) {
            deepFreeze(obj[prop]);
        }
    });
    return Object.freeze(obj);
};

// ☁️ إعدادات فايربيز (Firebase Config) - المصدر الوحيد في النظام
export const firebaseConfig = deepFreeze({
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78"
});

// 🗄️ مفاتيح قواعد البيانات (Collections in Firestore)
export const DB_KEYS = deepFreeze({
    CATS: 'telecard_cats',
    PRODS: 'telecard_prods', // 👈 صحيح جداً: الإدارة يجب أن تقرأ المجموعة السرية لرؤية أسعار التكلفة
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
    LOGS: 'telecard_audit_logs', // 🛡️ [إصلاح الكارثة]: تم ربطه مع نفس المجموعة التي يكتب فيها السيرفر (functions/index.js)
    ALERTS: 'telecard_alerts',
    KYC: 'telecard_kyc'
});

// ============================================================================
// 💱 إعادة تصدير دوال المعالجة المالية 
// ============================================================================

// 🛡️ التخلص من الـ bind(this) لأنه لم يعد مطلوباً في المحرك המاسي الجديد (V14.2) 
// ولكنه لا يضر كطبقة توافقية
export const normalizeRates = FinancialEngine.normalizeRates.bind(FinancialEngine);
export const convertViaUSD = FinancialEngine.convertViaUSD.bind(FinancialEngine);

// ============================================================================
// ⚖️ المحرك المالي المركزي (Telecard Pricing Engine)
// ============================================================================
export const TelecardPricingEngine = deepFreeze({
    calculate: function(params) {
        return FinancialEngine.calculatePrice(params);
    }
});