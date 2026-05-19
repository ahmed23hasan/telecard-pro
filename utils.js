// ============================================================================
// 🛠️ ملف الأدوات المساعدة (utils.js) - ES6 Module
// 🎯 الوظيفة: يحتوي على دوال الحماية (XSS)، وتنسيق النصوص، وتصفية التواريخ
// 🚀 التحديث: تفكيك التكرار الكلي وربط اللوجيك المالي بالمحرك المركزي الموحد (DRY)
// ============================================================================

// 🌟 استدعاء المحرك المالي المركزي الموحد لضمان تطابق الأسعار والأرباح 100%
import { FinancialEngine } from './core/financialEngine.js';

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

    // 🌟 شبكة أمان لمنع انهيار الواجهات عند تنسيق القيم العددية
    enNum: function(val, decimals = 2) {
        const num = Number(val);
        return isNaN(num) ? Number(0).toFixed(decimals) : num.toFixed(decimals);
    },

    // === 2. جسر تحويل العملات (Backward Compatibility FX Bridge) ===
    // تفويض برمي مباشر للمحرك المالي المركزي لمنع تكرار اللوجيك المالي الحساس
    normalizeRates: function(raw) {
        return FinancialEngine.normalizeRates(raw);
    },

    convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel='pricing') {
        return FinancialEngine.convertViaUSD(amount, fromCode, toCode, ratesArray, channel);
    },

    // === 3. أداة الجوكر لتصفية التواريخ والبحث (مصلحة محاسبياً ضد فجوة التوقيت) ===
    getSearchAndDateFilters: function(searchId, datePrefixId) {
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

        if (dStart) {
            const startObj = new Date(dStart);
            startObj.setHours(0, 0, 0, 0); // تصفير الساعات لبداية اليوم الفعلي
            tStart = startObj.getTime();
        }

        if (dEnd) {
            const endObj = new Date(dEnd);
            endObj.setHours(23, 59, 59, 999); // إغلاق اليوم المحاسبي في آخر جزء من الثانية
            tEnd = endObj.getTime();
        }

        let error = null;
        if (tStart && tEnd && tStart > tEnd) {
            error = 'تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء';
        }
        
        return { q, dStart, dEnd, tStart, tEnd, error };
    },

    // === 4. أداة ذكية لاستخراج أكواد الخزنة (Object/String Rendering) ===
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

    // === 5. محرك حساب مدة الإنجاز (Unified Duration Engine) ===
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

    // === 6. محرك حساب الأسعار (Telecard Pricing Engine Bridge) ===
    // واجهة مجمّدة ومحمية برميّاً تقوم باستدعاء كود الحساب الموحد من السيرفر المركزي
    TelecardPricingEngine: Object.freeze({
        calculate: function(params) {
            return FinancialEngine.calculatePrice(params);
        }
    })
};
