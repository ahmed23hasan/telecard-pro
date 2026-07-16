// ============================================================================
// 🛠️ ملف الأدوات المساعدة (utils.js) - ES6 Module
// 🎯 الوظيفة: يحتوي على دوال الحماية (XSS)، وتنسيق النصوص، وتصفية التواريخ
// 🚀 التحديث الأقصى: حماية مطلقة للروابط (URL Parsing)، حل جذري للـ Timezone
// ============================================================================

import { FinancialEngine } from './core/financialEngine.js';

export const Utils = {
    // === 1. أدوات حماية النصوص وتنسيقها (XSS & Formatting Mitigation) ===
    escapeHtml: function(val) {
        if (val === undefined || val === null) return '';
        // 🛡️ ترقية لمعايير OWASP العالمية للحماية من الـ XSS
        return String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '&#x60;')
            .replace(/=/g, '&#x3D;')
            .replace(/\//g, '&#x2F;');
    },
    
    safeText: function(val, fallback = '---') {
        if (val === undefined || val === null || val === '') return fallback;
        return this.escapeHtml(val);
    },
    
    // 🛡️ درع حماية الروابط المتقدم (Whitelist Protocol Validation)
    safeUrl: function(url, fallback = '#') {
        if (!url) return fallback;
        
        // إزالة رموز التحكم (Control Characters) التي يستخدمها الهاكرز لتخطي الفلاتر
        let cleaned = String(url).replace(/[\x00-\x1F\x7F]/g, '').trim();
        
        try {
            // محاولة تحليل الرابط (إذا كان Absolute)
            const parsedUrl = new URL(cleaned, window.location.origin);
            const protocol = parsedUrl.protocol.toLowerCase();
            
            // القائمة البيضاء للبروتوكولات الآمنة فقط
            if (['http:', 'https:', 'mailto:', 'tel:'].includes(protocol)) {
                return this.escapeHtml(cleaned);
            }
            return fallback;
        } catch (e) {
            // إذا فشل التحليل (يعني أنه رابط نسبي Relative مثل "/about" أو "#section")
            if (cleaned.startsWith('/') || cleaned.startsWith('./') || cleaned.startsWith('../') || cleaned.startsWith('#') || cleaned.startsWith('?')) {
                return this.escapeHtml(cleaned);
            }
            return fallback;
        }
    },
    
    // 🌟 شبكة أمان لمنع انهيار الواجهات عند تنسيق القيم العددية
    enNum: function(val, decimals = 2) {
        const num = Number(val);
        return isNaN(num) ? Number(0).toFixed(decimals) : num.toFixed(decimals);
    },
    
    // === 2. جسر تحويل العملات (Backward Compatibility FX Bridge) ===
    normalizeRates: function(raw) {
        return FinancialEngine.normalizeRates(raw);
    },
    
    convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel = 'pricing') {
        return FinancialEngine.convertViaUSD(amount, fromCode, toCode, ratesArray, channel);
    },
    
    // === 3. أداة الجوكر لتصفية التواريخ والبحث ===
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
        
        // تطبيق القيم الافتراضية إذا كانت فارغة تماماً
        if (dEnd && !dStart) { dStart = defStart; if (dStartEl) dStartEl.value = defStart; }
        if (dStart && !dEnd) { dEnd = defEnd; if (dEndEl) dEndEl.value = defEnd; }
        
        let tStart = null;
        let tEnd = null;
        
        // 🚀 [الحل الجذري للـ Timezone]: تمرير السنة والشهر واليوم صراحةً لمنع المتصفح من افتراض توقيت UTC
        if (dStart) {
            const [year, month, day] = dStart.split('-').map(Number);
            if (year && month && day) {
                // ملاحظة: الأشهر في Date تبدأ من 0 (يناير = 0)
                const startObj = new Date(year, month - 1, day, 0, 0, 0, 0);
                tStart = startObj.getTime();
            }
        }
        
        if (dEnd) {
            const [year, month, day] = dEnd.split('-').map(Number);
            if (year && month && day) {
                const endObj = new Date(year, month - 1, day, 23, 59, 59, 999);
                tEnd = endObj.getTime();
            }
        }
        
        let error = null;
        if (tStart && tEnd && tStart > tEnd) {
            error = 'تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء';
        }
        
        return { q, dStart, dEnd, tStart, tEnd, error };
    },
    
    // === 4. أداة ذكية لاستخراج أكواد الخزنة ===
    extractCodeText: function(dCode) {
        if (!dCode || dCode === 'null') return '';
        
        let extracted = '';
        if (Array.isArray(dCode)) {
            extracted = dCode.map(c => (typeof c === 'object' && c !== null) ? (c.text || c.code || '') : String(c)).join(' | ');
        } else if (typeof dCode === 'object' && dCode !== null) {
            extracted = dCode.text || dCode.code || '';
        } else {
            extracted = String(dCode);
        }
        
        return this.escapeHtml(extracted);
    },
    
    // === 5. محرك حساب مدة الإنجاز ===
    calculateOrderDuration: function(startTime, endTime) {
        if (!startTime || !endTime) return "---";
        
        let startMs, endMs;

// معالجة تاريخ البدء
if (startTime && typeof startTime.toMillis === 'function') {
    startMs = startTime.toMillis(); // إذا كان Firestore Timestamp
} else {
    startMs = Number(startTime); // إذا كان رقم عادي (Milliseconds)
}

// معالجة تاريخ الانتهاء
if (endTime && typeof endTime.toMillis === 'function') {
    endMs = endTime.toMillis();
} else {
    endMs = Number(endTime);
}

const startObj = new Date(startMs);
const endObj = new Date(endMs);
        const endObj = new Date(Number(endTime));
        
        if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) return "---";
        
        const diffMs = endObj.getTime() - startObj.getTime();
        if (diffMs < 0) return "---";
        
        if (diffMs < 2000) return "فوري ⚡";
        
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffDays > 0) return `${diffDays} يوم و ${diffHours % 24} ساعة`;
        if (diffHours > 0) return `${diffHours} ساعة و ${diffMins % 60} دقيقة`;
        if (diffMins > 0) return `${diffMins} دقيقة و ${diffSecs % 60} ثانية`;
        
        return `${diffSecs} ثانية`;
    },
// === 6. محرك حساب الأسعار ===
TelecardPricingEngine: Object.freeze({
    calculate: function(params) {
        return FinancialEngine.calculatePrice(params);
    },
    // 🚀 فتح الجسر للدالة الجديدة التي تحسب إجمالي الكميات للواجهة الأمامية
    calculateOrderTotalUi: function(params, rawQty) {
        // نتحقق من وجودها أولاً لتجنب الأخطاء إذا لم يتم تحديث المحرك بعد
        if (typeof FinancialEngine.calculateOrderTotalUi === 'function') {
            return FinancialEngine.calculateOrderTotalUi(params, rawQty);
        }
        // Fallback احتياطي في حال غياب الدالة
        const unit = FinancialEngine.calculatePrice(params);
        const q = Math.max(1, Math.floor(Number(rawQty) || 1));
        return {
            ...unit,
            qty: q,
            totalOriginalPrice: unit.originalPrice * q,
            totalFinalPrice: unit.finalPrice * q,
            totalDiscountVal: unit.totalDiscountVal * q
        };
    }
})};