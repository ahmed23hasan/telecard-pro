// ============================================================================
// ⚙️ ملف الإعدادات والأساسيات (adminConfig.js) - SSOT Architecture 🚀
// 🎯 الوظيفة: مصدر الحقيقة الوحيد للمفاتيح، إعدادات فايربيز، والمحرك المالي
// ============================================================================

import { FinancialEngine } from './core/financialEngine.js';

// ☁️ إعدادات فايربيز (Firebase Config) - المصدر الوحيد في النظام
export const firebaseConfig = Object.freeze({
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78"
});

// 🗄️ مفاتيح قواعد البيانات (Collections in Firestore)
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
    ALERTS: 'telecard_alerts',
    KYC: 'telecard_kyc'
});

// ============================================================================
// 💱 إعادة تصدير دوال المعالجة المالية (Backward Compatibility Bridge)
// ============================================================================

export const normalizeRates = FinancialEngine.normalizeRates.bind(FinancialEngine);
export const convertViaUSD = FinancialEngine.convertViaUSD.bind(FinancialEngine);

// ============================================================================
// ⚖️ المحرك المالي المركزي (Telecard Pricing Engine)
// ============================================================================
export const TelecardPricingEngine = Object.freeze({
    calculate: function(params) {
        return FinancialEngine.calculatePrice(params);
    }
});