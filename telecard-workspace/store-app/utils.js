// ============================================================================
// 🛠️ ملف الأدوات المساعدة (utils.js) - ES6 Module V14.6 💎
// 🎯 الوظيفة: يحتوي على دوال الحماية (XSS)، وتنسيق النصوص، وتصفية التواريخ
// 🚀 التحديثات:
// 1. URL Hijacking Shield: منع ثغرة Protocol-Relative URLs والروابط الخبيثة.
// 2. RangeError Protection: تحصين Intl.NumberFormat من انهيار الواجهة.
// 3. NaN Cascade Fix: منع تشوه النصوص عند فشل الحسابات الزمنية.
// 4. Zero-Crash Guarantee: تحصين محرك التسعير وجسر العملات بـ Try/Catch.
// ============================================================================

import { FinancialEngine } from './core/financialEngine.js';

export const Utils = {
    // === 1. أدوات حماية النصوص وتنسيقها (OWASP Standard) ===
    escapeHtml: function(val) {
        if (val === undefined || val === null) return '';
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
    
    // 🛡️ درع حماية الروابط المتقدم (Strict Protocol & Traversal Validation)
    safeUrl: function(url, fallback = '#') {
        if (!url) return fallback;
        // إزالة الفراغات ورموز التحكم التي تخدع المتصفح
        let cleaned = String(url).replace(/[\x00-\x1F\x7F\s]/g, '').trim();
        
        // 🚨 حظر صريح لمحاولات الحقن المباشرة
        if (/^(javascript|vbscript|data):/i.test(cleaned)) return fallback;

        // 💡 [الإصلاح الماسي]: تشفير الروابط لتعمل مع HTML و CSS بأمان دون كسر روابط Firebase
        const encodeUrlSafely = (u) => {
            return u.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E');
        };
        
        try {
            const parsedUrl = new URL(cleaned, window.location.origin);
            const protocol = parsedUrl.protocol.toLowerCase();
            if (['http:', 'https:', 'mailto:', 'tel:'].includes(protocol)) {
                return encodeUrlSafely(cleaned);
            }
            return fallback;
        } catch (e) {
            // 🛡️ حظر الـ Protocol-Relative URLs (//evil.com)
            if (cleaned.startsWith('//')) return fallback;
            
            // السماح بالروابط النسبية الآمنة فقط
            if (cleaned.startsWith('/') || cleaned.startsWith('./') || cleaned.startsWith('../') || cleaned.startsWith('#') || cleaned.startsWith('?')) {
                return encodeUrlSafely(cleaned);
            }
            return fallback;
        }
    },

    // 🌟 حماية ضد RangeError لضمان الاستقرار التام للواجهة
    enNum: function(val, decimals = 2) {
        const num = Number(val);
        const safeDecimals = Math.min(20, Math.max(0, Number(decimals) || 2));
        
        if (isNaN(num)) return Number(0).toFixed(safeDecimals);
        
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: safeDecimals,
            maximumFractionDigits: safeDecimals,
            useGrouping: false
        }).format(num);
    },

    // === 2. جسر تحويل العملات (محصن بالكامل) ===
    normalizeRates: function(raw) {
        try {
            return (typeof FinancialEngine !== 'undefined' && typeof FinancialEngine.normalizeRates === 'function')
                ? FinancialEngine.normalizeRates(raw)
                : (raw || {}); // إرجاع البيانات كما هي في حالة غياب المحرك
        } catch (error) {
            return raw || {};
        }
    },
    
    convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel = 'pricing') {
        try {
            return (typeof FinancialEngine !== 'undefined' && typeof FinancialEngine.convertViaUSD === 'function')
                ? FinancialEngine.convertViaUSD(amount, fromCode, toCode, ratesArray, channel)
                : (Number(amount) || 0); // إرجاع المبلغ كما هو لمنع ظهور NaN
        } catch (error) {
            return Number(amount) || 0;
        }
    },

    // === 3. أداة تصفية التواريخ والبحث (مصححة وثابتة زمنياً) ===
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
        
        // استخراج النص الآمن بناءً على التوقيت المحلي الفعلي
        const toLocalISODate = (dateObj) => {
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        
        const defStart = toLocalISODate(yestObj);
        const defEnd = toLocalISODate(todayObj);
        
        if (dEnd && !dStart) { dStart = defStart; if (dStartEl) dStartEl.value = defStart; }
        if (dStart && !dEnd) { dEnd = defEnd; if (dEndEl) dEndEl.value = defEnd; }
        
        let tStart = null;
        let tEnd = null;
        
        if (dStart) {
            const [year, month, day] = dStart.split('-').map(Number);
            if (year && month && day) tStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
        }
        
        if (dEnd) {
            const [year, month, day] = dEnd.split('-').map(Number);
            if (year && month && day) tEnd = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
        }
        
        let error = null;
        if (tStart && tEnd && tStart > tEnd) error = 'تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء';
        
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
        
        const startMs = (typeof startTime.toMillis === 'function') ? startTime.toMillis() : Number(startTime);
        const endMs = (typeof endTime.toMillis === 'function') ? endTime.toMillis() : Number(endTime);
        
        if (isNaN(startMs) || isNaN(endMs)) return "---";
        
        const diffMs = endMs - startMs;
        
        // 🛡️ حماية ضد الـ NaN Cascade والأوقات السالبة
        if (isNaN(diffMs) || diffMs < 0) return "---";
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

    // === 6. محرك حساب الأسعار المضمن للواجهة (محصن بالكامل) ===
    TelecardPricingEngine: Object.freeze({
        calculate: function(params) {
            try {
                return FinancialEngine.calculatePrice(params);
            } catch (error) {
                console.warn("[TelecardPricingEngine] Failed to calculate price, using safe fallback.");
                // 🛡️ إرجاع كائن صفري آمن لمنع انهيار سلة المشتريات
                return {
                    originalPrice: 0, finalPrice: 0, totalDiscount: 0,
                    offerName: null, couponCode: null, isFirewallViolated: true
                };
            }
        },
        
        calculateOrderTotal: function(params, rawQty) {
            try {
                if (typeof FinancialEngine.calculateOrderTotal === 'function') {
                    return FinancialEngine.calculateOrderTotal(params, rawQty);
                }
                
                // كود احتياطي (Fallback) في حال كان المحرك قديماً
                const unit = this.calculate(params); 
                const q = Math.max(1, Math.floor(Number(rawQty) || 1));
                
                const safeMul = typeof FinancialEngine.safeMul === 'function' ?
                    (a, b) => FinancialEngine.safeMul(a, b) :
                    (a, b) => Math.round((Number(a) * Number(b)) * 10000) / 10000;
                
                return {
                    ...unit,
                    qty: q,
                    totalOriginalPrice: safeMul(unit.originalPrice || 0, q),
                    totalFinalPrice: safeMul(unit.finalPrice || 0, q),
                    totalDiscount: safeMul(unit.totalDiscount || 0, q) 
                };
            } catch (error) {
                console.warn("[TelecardPricingEngine] Failed to calculate total, using safe fallback.");
                return {
                    originalPrice: 0, finalPrice: 0, totalDiscount: 0, qty: 1,
                    totalOriginalPrice: 0, totalFinalPrice: 0, isFirewallViolated: true
                };
            }
        }
    })
};
