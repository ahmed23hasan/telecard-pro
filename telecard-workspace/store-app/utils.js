// ============================================================================
// 🛠️ ملف الأدوات المساعدة (utils.js) - ES6 Module V16.0 💎 (Enterprise Edition)
// 🎯 الوظيفة: أدوات نقية للتعامل مع النصوص، الروابط، التواريخ، وبصمة الجهاز.
// 🚀 التحديثات المعمارية:
// 1. Crypto-Safe Fallback: ترقيع ثغرة Idempotency Key لضمان عدم تكرار الطلبات المالية.
// 2. Unified Time Parser: التوافق الشامل مع Timestamp الخاص بـ Firebase.
// 3. Decimal Trap Fix: معالجة ذكية للفواصل في الأرقام العربية/الأوروبية.
// 4. Dynamic Router Fix: فك ارتباط التوجيه بأسماء المجلدات ليعمل في أي بيئة.
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

// 🛡️ درع حماية الروابط المتقدم (يمنع ثغرات XSS وحقن الجافاسكريبت)
export function safeUrl(url, fallback = '#') {
    if (!url) return fallback;
    let cleaned = String(url).replace(/[\x00-\x1F\x7F\s]/g, '').trim();
    
    // منع بروتوكولات التنفيذ الخبيثة
    if (/^(javascript|vbscript|data):/i.test(cleaned)) return fallback;
    
    const encodeUrlSafely = (u) => u.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E');
    
    try {
        const parsedUrl = new URL(cleaned, window.location.origin);
        const protocol = parsedUrl.protocol.toLowerCase();
        if (['http:', 'https:', 'mailto:', 'tel:'].includes(protocol)) return encodeUrlSafely(cleaned);
        return fallback;
    } catch (e) {
        // الروابط النسبية (Relative URLs)
        if (cleaned.startsWith('//')) return fallback;
        if (/^[./#?]/.test(cleaned)) return encodeUrlSafely(cleaned);
        return fallback;
    }
}

// 🌟 تنسيق الأرقام كنصوص للواجهة (تفعيل فواصل الآلاف لراحة العميل)
export function enNum(val, decimals = 2) {
    const safeDecimals = Math.min(20, Math.max(0, Number(decimals) || 2));
    let num = Number(val);
    if (isNaN(num)) num = 0;
    
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: safeDecimals,
        maximumFractionDigits: safeDecimals,
        useGrouping: true
    }).format(num);
}

// 🛡️ توحيد الأرقام العربية وإصلاح فخ الفواصل (تأمين المدخلات المالية)
export function parseSafeNumber(val) {
    if (!val) return 0;
    // تحويل الأرقام المشرقية إلى إنجليزية
    let englishVal = String(val).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
    // تحويل الفاصلة قبل آخر رقمين إلى نقطة عشرية (للصيغ الأوروبية)
    englishVal = englishVal.replace(/,(\d{1,2})$/, '.$1');
    // إزالة فواصل الآلاف الخاطئة أو المسافات
    englishVal = englishVal.replace(/[, \s]/g, '');
    return parseFloat(englishVal) || 0;
}

// === 2. أدوات التواريخ والزمن ===

// 🛡️ المرجع الشامل لتحليل الأوقات من كافة الصيغ (Single Source of Truth)
export function parseSafeTime(val) {
    if (val === null || val === undefined || val === '') return Date.now();
    if (typeof val === 'number') return val; // جاهز كـ Milliseconds
    if (typeof val.toMillis === 'function') return val.toMillis(); // Firebase Timestamp Object
    if (val.seconds !== undefined) return val.seconds * 1000; // Firebase Timestamp Raw
    if (val._seconds !== undefined) return val._seconds * 1000;
    if (val instanceof Date) return val.getTime(); // كائن Date عادي
    
    if (typeof val === 'string') {
        // دعم صيغة ISO والصيغة العادية
        const parsed = new Date(val.includes('T') ? val : val.replace(/-/g, '/')).getTime();
        return isNaN(parsed) ? Date.now() : parsed;
    }
    return Date.now();
}

// ⏱️ محرك حساب مدة الإنجاز (لطلبات المتجر)
export function calculateOrderDuration(startTime, endTime) {
    if (!startTime || !endTime) return "---";
    
    const startMs = parseSafeTime(startTime);
    const endMs = parseSafeTime(endTime);
    
    if (startMs === 0 || endMs === 0) return "---";
    
    const diffMs = endMs - startMs;
    if (diffMs < 0) return "---"; // حالة شاذة (تاريخ الانتهاء قبل البدء)
    if (diffMs < 2000) return "فوري ⚡"; // أقل من ثانيتين يعتبر آلي/فوري
    
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

// 🔑 توليد مفتاح منع تكرار الطلبات (آمن تشفيرياً ومحصن ضد التصادم - Collision Resistant)
export function generateIdempotencyKey() {
    // الخيار الأول والأقوى: استخدام مكتبة المتصفح المدمجة
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    
    // الخيار الثاني: Fallback هندسي آمن للعمليات المالية يعتمد على الإنتروبيا (Entropy)
    const time = Date.now().toString(36);
    // دمج أداء المعالج بالمايكروثانية لضمان عدم التكرار حتى في نفس الملي ثانية
    const perf = (typeof performance !== 'undefined' && performance.now ? Math.floor(performance.now() * 1000).toString(36) : '');
    const rand1 = Math.random().toString(36).substring(2, 10);
    const rand2 = Math.random().toString(36).substring(2, 10);
    
    return `${time}-${perf}-${rand1}-${rand2}`;
}

// 🕵️‍♂️ توليد بصمة الجهاز (Device Fingerprint) مضاد للانهيار البيئي
export async function getDeviceFingerprint() {
    try {
        if (typeof window !== 'undefined' && window.FingerprintJS) {
            const loadedFp = await window.FingerprintJS.load();
            return (await loadedFp.get()).visitorId;
        } else {
            // بصمة بديلة تعتمد على خصائص المتصفح والشاشة
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

// 📄 أداة تصفية التواريخ والبحث (تستخدم وقت السيرفر المزامَن لمنع التلاعب)
export function getSearchAndDateFilters(searchId, datePrefixId, serverNowTime = Date.now()) {
    if (typeof document === 'undefined') return { q: '', dStart: '', dEnd: '', tStart: null, tEnd: null, error: null };
    
    const qInput = document.getElementById(`${searchId}-search-input`);
    const q = qInput ? qInput.value.toLowerCase().trim() : '';
    
    const dStartEl = document.getElementById(`${datePrefixId}-date-start`);
    const dEndEl = document.getElementById(`${datePrefixId}-date-end`);
    
    let dStart = dStartEl ? dStartEl.value : '';
    let dEnd = dEndEl ? dEndEl.value : '';
    
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

// 🧭 محرك التوجيه الآمن الديناميكي (يعمل بسلاسة على السيرفرات المحلية والحية)
export function safeRedirect(pageName) {
    const isLocal = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.');
    
    let finalPath = '/' + pageName;
    
    if (isLocal) {
        const currentPath = window.location.pathname;
        const lastSlashIndex = currentPath.lastIndexOf('/');
        const safeBasePath = currentPath.substring(0, lastSlashIndex + 1);
        finalPath = safeBasePath + pageName;
    }
    
    window.location.replace(finalPath);
}

// 💳 استخراج أكواد الخزنة كنص جاهز للنسخ والعرض
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

// 📤 محرك المشاركة الذكي (Web Share API) للإيصالات والصور
export async function smartShareOrDownload(blob, fileName, shareTitle = 'مشاركة', shareText = '') {
    const file = new File([blob], fileName, { type: blob.type });
    // تحديد الهواتف لفتح نافذة المشاركة الأصلية بدلاً من التحميل المباشر
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
            // إذا ألغى المستخدم المشاركة، لا نقم بالتحميل الإجباري. إذا فشل النظام، نقوم بالتحميل
            if (error.name !== 'AbortError') forceDownload();
            return true;
        }
    } else {
        // في أجهزة الكمبيوتر، نقوم بالتحميل المباشر
        forceDownload();
        return true;
    }
}