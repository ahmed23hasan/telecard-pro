// ============================================================================
// 🛠️ ملف الأدوات المساعدة (utils.js) - ES6 Module
// 🎯 الوظيفة: يحتوي على دوال الحماية (XSS)، وتنسيق النصوص، والعمليات الحسابية للعملات
// 🚀 التحديث: إصلاح ثغرة الفلاتر الزمنية (Timezone/End-of-Day Bug)
// ============================================================================

export const Utils = {
    // === 1. أدوات حماية النصوص وتنسيقها (XSS & Formatting Mitigation) ===
    escapeHtml: function(val) {
        if (val === undefined || val === null) return '';
        return String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    safeText: function(val, fallback = '---') {
        if (val === undefined || val === null || val === '') return fallback;
        return this.escapeHtml(val);
    },

    // 🌟 تمت إضافتها كشبكة أمان لمنع انهيار أي ملف آخر يحاول استدعاءها
    enNum: function(val, decimals = 2) {
        const num = Number(val);
        return isNaN(num) ? Number(0).toFixed(decimals) : num.toFixed(decimals);
    },

    // === 2. محرك تحويل العملات والتسعير الديناميكي (Dynamic FX Helpers) ===
    normalizeRates: function(raw) {
        let rates = Array.isArray(raw) ? raw : [];
        if (!rates.find(c => c.isBase || c.code === 'USD')) {
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

    // === 3. أداة الجوكر لتصفية التواريخ والبحث (تم الإصلاح المحاسبي 🚀) ===
    getSearchAndDateFilters: function(searchId, datePrefixId) {
        // حماية البيئة: التأكد من وجود الـ DOM
        if (typeof document === 'undefined') return { q: '', dStart: '', dEnd: '', tStart: null, tEnd: null, error: null };

        const qInput = document.getElementById(`${searchId}-search-input`);
        const q = qInput ? qInput.value.toLowerCase().trim() : '';
        
        const dStartEl = document.getElementById(`${datePrefixId}-date-start`);
        const dEndEl = document.getElementById(`${datePrefixId}-date-end`);
        
        let dStart = dStartEl ? dStartEl.value : '';
        let dEnd = dEndEl ? dEndEl.value : '';
        
        const todayObj = new Date();
        const yestObj = new Date(todayObj);
        yestObj.setDate(todayObj.getDate() - 1);
        
        // إصلاح التعامل مع التواريخ المحلية لمنع انزياح الـ Timezone
        const toLocalISODate = (dateObj) => {
            const tzOffset = dateObj.getTimezoneOffset() * 60000;
            return new Date(dateObj.getTime() - tzOffset).toISOString().split('T')[0];
        };

        const defStart = toLocalISODate(yestObj);
        const defEnd = toLocalISODate(todayObj);
        
        if (dEnd && !dStart) { dStart = defStart; if (dStartEl) dStartEl.value = defStart; }
        if (dStart && !dEnd) { dEnd = defEnd; if (dEndEl) dEndEl.value = defEnd; }
        
        let tStart = null;
        let tEnd = null;

        // 🌟 الإصلاح الجذري: ضبط بداية ونهاية اليوم بدقة 100%
        if (dStart) {
            const startObj = new Date(dStart);
            startObj.setHours(0, 0, 0, 0); // أول ثانية في اليوم المحلي
            tStart = startObj.getTime();
        }

        if (dEnd) {
            const endObj = new Date(dEnd);
            endObj.setHours(23, 59, 59, 999); // آخر جزء من الملي ثانية في اليوم المحلي
            tEnd = endObj.getTime();
        }

        let error = null;
        if (tStart && tEnd && tStart > tEnd) {
            error = 'تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء';
        }
        
        return { q, dStart, dEnd, tStart, tEnd, error };
    },

    // === 4. أداة ذكية لاستخراج أكواد الخزنة (Object/String) ===
    extractCodeText: function(dCode) {
        if (!dCode || dCode === 'null') return '';
        
        let extracted = '';
        if (Array.isArray(dCode)) {
            extracted = dCode.map(c => (typeof c === 'object' && c !== null) ? (c.text || c.code || '') : c).join(' | ');
        } else if (typeof dCode === 'object' && dCode !== null) {
            extracted = dCode.text || dCode.code || '';
        } else {
            extracted = String(dCode);
        }
        
        return this.escapeHtml(extracted); 
    },

    // ============================================================================
    // === 5. محرك حساب مدة الإنجاز (Unified Duration Engine) ===
    // ============================================================================
    calculateOrderDuration: function(startTime, endTime) {
        if (!startTime || !endTime) return "---"; 
        
        const startObj = new Date(Number(startTime));
        const endObj = new Date(Number(endTime));
        
        if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) return "---";
        
        const diffMs = endObj.getTime() - startObj.getTime();
        if (diffMs < 0) return "---"; 
        
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffDays > 0) return `${diffDays} يوم و ${diffHours % 24} ساعة`;
        if (diffHours > 0) return `${diffHours} ساعة و ${diffMins % 60} دقيقة`;
        if (diffMins > 0) return `${diffMins} دقيقة و ${diffSecs % 60} ثانية`;
        
        return `${diffSecs} ثانية`; 
    },

    // ============================================================================
    // === 6. المحرك المالي المركزي (Telecard Pricing Engine) ===
    // ============================================================================
    TelecardPricingEngine: Object.freeze({
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

            // 🛡️ جدار الحماية ضد البيع بخسارة (Firewall)
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
    })
};
