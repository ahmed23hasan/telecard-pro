// ============================================================================
// ⚙️ ملف الإعدادات والأساسيات (adminConfig.js) - بنية ES Modules نقية 100%
// 🚀 التحديث: تطبيق مبدأ الحماية (Immutability) وتفعيل العزل المعماري للمحرك المالي
// ============================================================================

// 🌟 استدعاء المحرك المالي المركزي (لتطبيق مبدأ DRY و SRP)
import { FinancialEngine } from './core/financialEngine.js';

// ☁️ إعدادات فايربيز (Firebase Config) - تم التحديث للمفاتيح الحقيقية
export const firebaseConfig = Object.freeze({
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78"
});

// 🗄️ مفاتيح قواعد البيانات (ستعمل كأسماء Collections في Firestore)
// 🌟 تم إضافة Object.freeze لحماية المفاتيح من التعديل الخطأ في أي ملف آخر
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
    TIERS: 'telecard_tiers', 
    BACKUP_HISTORY: 'telecard_backup_history',
    COUNTRIES: 'telecard_countries',
    VAULT: 'telecard_vault',
    COUPONS: 'telecard_coupons',
    OFFERS: 'telecard_offers', 
    LOGS: 'telecard_logs',
    ALERTS: 'telecard_alerts', // 🔔 المفتاح الجديد لمحرك الإشعارات والمنبثقات الموحد
    KYC: 'telecard_kyc' // 👈 إضافة المفتاح لضمان سلامة محرك التوثيق
});

// ============================================================================
// 💱 إعادة تصدير دوال المعالجة المالية (Backward Compatibility Bridge)
// 🎯 الوظيفة: توجيه الطلبات للمحرك المركزي دون كسر الملفات التي تستدعيها من هنا
// ============================================================================

export const normalizeRates = FinancialEngine.normalizeRates;

export const convertViaUSD = FinancialEngine.convertViaUSD;

// ============================================================================
// ⚖️ المحرك المالي المركزي (Telecard Pricing Engine)
// ============================================================================
// تم نقل اللوجيك الداخلي بالكامل إلى صندوقه الأسود في (core/financialEngine.js)
// ونكتفي هنا بتصدير الواجهة (Interface) لخدمة باقي أجزاء لوحة الإدارة
export const TelecardPricingEngine = Object.freeze({
    calculate: function(params) {
        return FinancialEngine.calculatePrice(params);
    }
});
