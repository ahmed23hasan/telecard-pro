// ============================================================================
// 💰 المحرك المالي المركزي (core/financialEngine.js) - Agnostic Core
// 🎯 الوظيفة: حساب الأسعار، الخصومات، تحويل العملات، والضرائب (للمتجر والإدارة)
// ============================================================================

export const FinancialEngine = Object.freeze({

    normalizeRates: function(raw) {
        let rates = Array.isArray(raw) ? raw : [];
        if (!rates.find(c => c.isBase)) {
            rates.unshift({ code: 'USD', symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true });
        }
        return rates;
    },

    convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel='pricing') {
        const rates = this.normalizeRates(ratesArray);
        const amt = Number(amount) || 0;
        if (!fromCode || !toCode || fromCode === toCode) return amt;
        const fromCurr = rates.find(c => String(c.code).toUpperCase() === String(fromCode).toUpperCase()) || { priceRate: 1, depRate: 1 };
        const toCurr = rates.find(c => String(c.code).toUpperCase() === String(toCode).toUpperCase()) || { priceRate: 1, depRate: 1 };
        const fromRate = channel === 'deposit' ? fromCurr.depRate : fromCurr.priceRate;
        const toRate   = channel === 'deposit' ? toCurr.depRate : toCurr.priceRate;
        const inUSD = amt / (fromRate || 1);
        const finalAmount = inUSD * (toRate || 1);
        return Number(finalAmount.toFixed(4));
    },

    calculatePrice: function(params) {
        // ... (تضع هنا كود حساب الخصومات والأرباح وجدار الحماية الذي رأيناه سابقاً) ...
    }
});
