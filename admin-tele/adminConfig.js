// ============================================================================
// ⚙️ ملف الإعدادات والأساسيات (adminConfig.js) - بنية ES Modules نقية 100%
// ============================================================================

// ☁️ إعدادات فايربيز (Firebase Config) - تم التحديث للمفاتيح الحقيقية
export const firebaseConfig = {
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78"
};

// 🗄️ مفاتيح قواعد البيانات (ستعمل كأسماء Collections في Firestore)
export const DB_KEYS = { 
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
    ALERTS: 'telecard_alerts' // 🔔 المفتاح الجديد لمحرك الإشعارات والمنبثقات الموحد
};

// ============================================================================
// 💱 دوال المعالجة المالية (Domain-Specific Helpers)
// ============================================================================
export function normalizeRates(raw) {
    let rates = Array.isArray(raw) ? raw : [];
    if (!rates.find(c => c.isBase)) {
        rates.unshift({ code: 'USD', symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true });
    }
    return rates;
}

export function convertViaUSD(amount, fromCode, toCode, ratesArray, channel='pricing') {
    const rates = normalizeRates(ratesArray);
    const amt = Number(amount) || 0;
    if (!fromCode || !toCode || fromCode === toCode) return amt;
    const fromCurr = rates.find(c => String(c.code).toUpperCase() === String(fromCode).toUpperCase()) || { priceRate: 1, depRate: 1 };
    const toCurr = rates.find(c => String(c.code).toUpperCase() === String(toCode).toUpperCase()) || { priceRate: 1, depRate: 1 };
    const fromRate = channel === 'deposit' ? fromCurr.depRate : fromCurr.priceRate;
    const toRate   = channel === 'deposit' ? toCurr.depRate : toCurr.priceRate;
    const inUSD = amt / (fromRate || 1);
    const finalAmount = inUSD * (toRate || 1);
    return Number(finalAmount.toFixed(4));
} 

// ============================================================================
// ⚖️ المحرك المالي المركزي (Telecard Pricing Engine) - ☁️
// ============================================================================
export const TelecardPricingEngine = {
    /**
     * دالة نقية لحساب كل التفاصيل المالية
     * @param {Object} params - { costPrice, tier, offer, coupon }
     */
    calculate: function(params) {
        const rawCost = Number(params.costPrice) || 0;
        let tierName = params.tier ? params.tier.name : 'عادي (الافتراضي)';
        let tierPrice = rawCost; 

        if (params.tier) {
            const pct = Number(params.tier.profit_percent || 0) / 100;
            const minP = Number(params.tier.min_profit_usd || 0);
            tierPrice = rawCost + Math.max(rawCost * pct, minP);
        }

        let currentPrice = tierPrice;
        
        let offerDiscount = 0;
        let offerName = null;
        if (params.offer && params.offer.isActive) {
            offerName = params.offer.name;
            if (params.offer.type === 'fixed') {
                const fixedP = Number(params.offer.value || 0);
                offerDiscount = Math.max(0, currentPrice - fixedP);
                currentPrice = fixedP;
            } else if (params.offer.type === 'real') {
                const pct = Number(params.offer.value || 0) / 100;
                offerDiscount = currentPrice * pct;
                currentPrice -= offerDiscount;
            }
        }

        let couponDiscount = 0;
        let couponCode = null;
        if (params.coupon && params.coupon.isActive) {
            couponCode = params.coupon.code;
            if (params.coupon.type === 'percentage') {
                couponDiscount = currentPrice * (Number(params.coupon.value) / 100);
            } else {
                couponDiscount = Number(params.coupon.value);
            }
            currentPrice -= couponDiscount;
        }

        let firewallTriggered = false;
        if (currentPrice < rawCost && rawCost > 0) {
            firewallTriggered = true;
            const correction = rawCost - currentPrice;
            if (couponDiscount >= correction) couponDiscount -= correction;
            else if (offerDiscount >= correction) offerDiscount -= correction;
            
            currentPrice = rawCost; 
        }

        const netProfit = currentPrice - rawCost;
        const totalDiscount = offerDiscount + couponDiscount;
        const profitMarginPct = currentPrice > 0 ? (netProfit / currentPrice) * 100 : 0;

        return {
            cost: Number(rawCost.toFixed(4)),
            tierName: tierName,
            tierPrice: Number(tierPrice.toFixed(4)),      
            originalPrice: Number(tierPrice.toFixed(4)),  
            finalPrice: Number(currentPrice.toFixed(4)),  
            
            offerName: offerName,
            offerDiscount: Number(offerDiscount.toFixed(4)),
            couponCode: couponCode,
            couponDiscount: Number(couponDiscount.toFixed(4)),
            
            totalDiscountVal: Number(totalDiscount.toFixed(4)),
            profit: Number(netProfit.toFixed(4)),
            marginPct: Number(profitMarginPct.toFixed(1)),
            isFirewallTriggered: firewallTriggered,
            isFirewallActive: firewallTriggered,
            isLoss: netProfit <= 0
        };
    }
};
