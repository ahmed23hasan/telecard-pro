// ============================================================================
// 🛠️ ملف الأدوات المساعدة (utils.js) - ES6 Module V14.8 💎
// 🎯 الوظيفة: أدوات نقية للتعامل مع النصوص، الروابط، والتواريخ فقط.
// 🚀 التحديثات المعمارية:
// 1. Strict Separation of Concerns: إزالة كل الدوال المالية (الجسور) نهائياً. الأموال تعالج فقط عبر FinancialEngine.
// 2. URL Hijacking Shield: منع ثغرة Protocol-Relative URLs والروابط الخبيثة.
// 3. Date & Text Sanitization: فلاتر آمنة لمنع XSS والـ NaN.
// ============================================================================

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
    
    // 🛡️ درع حماية الروابط المتقدم (Strict Protocol Validation)
    safeUrl: function(url, fallback = '#') {
        if (!url) return fallback;
        let cleaned = String(url).replace(/[\x00-\x1F\x7F\s]/g, '').trim();
        
        if (/^(javascript|vbscript|data):/i.test(cleaned)) return fallback;
        
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
            if (cleaned.startsWith('//')) return fallback;
            
            if (cleaned.startsWith('/') || cleaned.startsWith('./') || cleaned.startsWith('../') || cleaned.startsWith('#') || cleaned.startsWith('?')) {
                return encodeUrlSafely(cleaned);
            }
            return fallback;
        }
    },
    
    // 🌟 تنسيق الأرقام كنصوص للواجهة فقط
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
    
    // 🛡️ توحيد الأرقام العربية وإزالة الفواصل (تنظيف المدخلات)
    parseSafeNumber: function(val) {
        if (!val) return 0;
        const englishVal = String(val)
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
            .replace(/,/g, '')
            .replace(/\s/g, '');
        return parseFloat(englishVal) || 0;
    },
    
    // === 2. أداة تصفية التواريخ والبحث ===
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
    
    // === 3. أداة ذكية لاستخراج أكواد الخزنة كنص للعميل ===
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
    
    // === 4. محرك حساب مدة الإنجاز ===
    calculateOrderDuration: function(startTime, endTime) {
        if (!startTime || !endTime) return "---";
        
        const startMs = (typeof startTime.toMillis === 'function') ? startTime.toMillis() : Number(startTime);
        const endMs = (typeof endTime.toMillis === 'function') ? endTime.toMillis() : Number(endTime);
        
        if (isNaN(startMs) || isNaN(endMs)) return "---";
        
        const diffMs = endMs - startMs;
        
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
    
    // === 5. محرك المشاركة الذكي (Web Share API Wrapper) ===
    smartShareOrDownload: async function(blob, fileName, shareTitle = 'مشاركة', shareText = '') {
        const file = new File([blob], fileName, { type: blob.type });
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        const forceDownload = () => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                if (document.body.contains(a)) document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 300);
        };
        
        if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: shareTitle,
                    text: shareText,
                    files: [file]
                });
                return true;
            } catch (error) {
                if (error.name !== 'AbortError') forceDownload();
                return true;
            }
        } else {
            forceDownload();
            return true;
        }
    }
};