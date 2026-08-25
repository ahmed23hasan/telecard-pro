// ============================================================================
// 🛠️ ملف الأدوات المساعدة (utils.js) - ES6 Module V15.4 💎 (The Forge)
// 🎯 الوظيفة: أدوات نقية للتعامل مع النصوص، الروابط، التواريخ، وبصمة الجهاز.
// 🚀 التحديثات المعمارية (V15.4 - Bulletproof Edition):
// 1. Dynamic Router Fix: فك ارتباط التوجيه بأسماء المجلدات ليعمل في أي بيئة.
// 2. Decimal Trap Fix: معالجة ذكية للفواصل في الأرقام العربية/الأوروبية.
// 3. Time-Travel Sync: مزامنة فلاتر البحث مع وقت السيرفر بدلاً من هاتف العميل.
// 4. UI Clarity: تفعيل فواصل الآلاف (useGrouping) لراحة العين.
// ============================================================================

// === 1. أدوات حماية النصوص وتنسيقها (OWASP Standard) ===

const htmlEntityMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;', '=': '&#x3D;', '/': '&#x2F;' };
export function escapeHtml(val) {
    if (val == null) return '';
    return String(val).replace(/[&<>"'`=\/]/g, s => htmlEntityMap[s]);
}

export function safeText(val, fallback = '---') {
    if (val == null || val === '') return fallback;
    return escapeHtml(val);
}

// 🛡️ درع حماية الروابط المتقدم (يمنع ثغرات XSS)
export function safeUrl(url, fallback = '#') {
    if (!url) return fallback;
    let cleaned = String(url).replace(/[\x00-\x1F\x7F\s]/g, '').trim();
    
    if (/^(javascript|vbscript|data):/i.test(cleaned)) return fallback;
    
    const encodeUrlSafely = (u) => u.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E');
    
    try {
        const parsedUrl = new URL(cleaned, window.location.origin);
        const protocol = parsedUrl.protocol.toLowerCase();
        if (['http:', 'https:', 'mailto:', 'tel:'].includes(protocol)) return encodeUrlSafely(cleaned);
        return fallback;
    } catch (e) {
        if (cleaned.startsWith('//')) return fallback;
        if (/^[./#?]/.test(cleaned)) return encodeUrlSafely(cleaned);
        return fallback;
    }
}

// 🌟 تنسيق الأرقام كنصوص للواجهة فقط (تم تفعيل useGrouping لتسهيل القراءة)
export function enNum(val, decimals = 2) {
    const safeDecimals = Math.min(20, Math.max(0, Number(decimals) || 2));
    
    let num = Number(val);
    if (isNaN(num)) num = 0; // 🛡️ توحيد المخرجات
    
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: safeDecimals,
        maximumFractionDigits: safeDecimals,
        useGrouping: true // 🛡️ تم التفعيل لمنع أخطاء قراءة الأرقام الضخمة
    }).format(num);
}

// 🛡️ توحيد الأرقام العربية وإصلاح فخ الفواصل (Decimal Trap Fix)
export function parseSafeNumber(val) {
    if (!val) return 0;
    // 1. تحويل الأرقام العربية إلى إنجليزية
    let englishVal = String(val).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
    
    // 2. المعالجة الذكية للفاصلة العشرية: إذا كانت الفاصلة قبل آخر رقم أو رقمين (مثال 10,50 تصبح 10.50)
    englishVal = englishVal.replace(/,(\d{1,2})$/, '.$1');
    
    // 3. إزالة فواصل الآلاف والمسافات بأمان
    englishVal = englishVal.replace(/[, \s]/g, '');
    
    return parseFloat(englishVal) || 0;
}

// === 2. أدوات التواريخ والزمن ===

// 🛡️ تأمين ومعالجة التواريخ من مختلف الصيغ لضمان عدم عودة (NaN)
export function parseSafeTime(val) {
    if (val === null || val === undefined || val === '') return Date.now();
    if (typeof val === 'number') return val;
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (val.seconds !== undefined) return val.seconds * 1000;
    if (val._seconds !== undefined) return val._seconds * 1000;
    
    if (typeof val === 'string') {
        const parsed = new Date(val.includes('T') ? val : val.replace(/-/g, '/')).getTime();
        return isNaN(parsed) ? Date.now() : parsed;
    }
    return Date.now();
}

// ⏱️ محرك حساب مدة الإنجاز
export function calculateOrderDuration(startTime, endTime) {
    if (!startTime || !endTime) return "---";
    
    const startMs = parseSafeTime(startTime);
    const endMs = parseSafeTime(endTime);
    
    if (startMs === 0 || endMs === 0) return "---";
    
    const diffMs = endMs - startMs;
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
}

// === 3. أدوات الأمان والمصادقة ===

// 🔑 توليد مفتاح منع تكرار الطلبات (آمن تشفيرياً مع Fallback)
export function generateIdempotencyKey() {
    if (typeof crypto !== 'undefined') {
        if (crypto.randomUUID) return crypto.randomUUID();
        try {
            const arr = new Uint32Array(4);
            crypto.getRandomValues(arr);
            return arr.join('-');
        } catch (e) {}
    }
    return Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
}

// 🕵️‍♂️ توليد بصمة الجهاز (محصنة بيئياً - Environment Safe)
export async function getDeviceFingerprint() {
    try {
        if (typeof window !== 'undefined' && window.FingerprintJS) {
            const loadedFp = await window.FingerprintJS.load();
            return (await loadedFp.get()).visitorId;
        } else {
            const nav = typeof navigator !== 'undefined' ? navigator : {};
            const scr = typeof screen !== 'undefined' ? screen : {};
            const rawPrint = (nav.userAgent || 'unknown') + (nav.language || '') + (scr.width || 0) + (scr.height || 0);
            
            if (typeof crypto !== 'undefined' && crypto.subtle) {
                const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawPrint));
                return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
            } else {
                let hash = 0;
                for (let i = 0; i < rawPrint.length; i++) {
                    const char = rawPrint.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }
                return 'fb-' + Math.abs(hash).toString(16) + Date.now().toString(16).slice(-4);
            }
        }
    } catch (e) { return "fb-" + Date.now().toString(16); }
}

// === 4. أدوات الواجهة والمنوعات ===

// 📄 أداة تصفية التواريخ والبحث (تستخدم وقت السيرفر لسد ثغرة Time-Travel)
export function getSearchAndDateFilters(searchId, datePrefixId, serverNowTime = Date.now()) {
    if (typeof document === 'undefined') return { q: '', dStart: '', dEnd: '', tStart: null, tEnd: null, error: null };
    
    const qInput = document.getElementById(`${searchId}-search-input`);
    const q = qInput ? qInput.value.toLowerCase().trim() : '';
    
    const dStartEl = document.getElementById(`${datePrefixId}-date-start`);
    const dEndEl = document.getElementById(`${datePrefixId}-date-end`);
    
    let dStart = dStartEl ? dStartEl.value : '';
    let dEnd = dEndEl ? dEndEl.value : '';
    
    // 🛡️ استخدام وقت السيرفر لحساب (اليوم والأمس)
    const todayObj = new Date(serverNowTime);
    todayObj.setHours(0, 0, 0, 0);
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
    
    let tStart = null,
        tEnd = null;
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
}

// 🧭 محرك التوجيه الآمن الديناميكي (Dynamic Environment-Aware Router)
export function safeRedirect(pageName) {
    const isLocal = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.');
    
    let finalPath = '/' + pageName;
    
    if (isLocal) {
        // 🚀 الحل الديناميكي: استخراج المسار الأساسي تلقائياً دون كتابة اسم المجلد برمجياً
        const currentPath = window.location.pathname;
        const lastSlashIndex = currentPath.lastIndexOf('/');
        const safeBasePath = currentPath.substring(0, lastSlashIndex + 1);
        
        finalPath = safeBasePath + pageName;
    }
    
    window.location.replace(finalPath);
}

// 💳 استخراج أكواد الخزنة كنص
export function extractCodeText(dCode) {
    if (dCode == null || dCode === 'null') return '';
    let extracted = '';
    if (Array.isArray(dCode)) {
        extracted = dCode.map(c => (typeof c === 'object' && c !== null) ? (c.text || c.code || '') : String(c)).join(' | ');
    } else if (typeof dCode === 'object' && dCode !== null) {
        extracted = dCode.text || dCode.code || '';
    } else {
        extracted = String(dCode);
    }
    return escapeHtml(extracted);
}

// 📤 محرك المشاركة الذكي (Web Share API)
export async function smartShareOrDownload(blob, fileName, shareTitle = 'مشاركة', shareText = '') {
    const file = new File([blob], fileName, { type: blob.type });
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    const forceDownload = () => {
        if (typeof document === 'undefined') return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            if (a.parentNode) a.parentNode.removeChild(a);
            URL.revokeObjectURL(url);
        }, 500);
    };
    
    if (isMobile && typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ title: shareTitle, text: shareText, files: [file] });
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