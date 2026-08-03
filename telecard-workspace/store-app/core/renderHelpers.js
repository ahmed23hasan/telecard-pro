// ============================================================================
// 🛠️ مساعدات محرك الرسم العالمي (Universal Render Helpers) - Enterprise V15.0 💎
// 🚀 الهندسة: Provider Pattern (Pure Agnostic Core) + Destructuring-Safe
// 🎯 الوظيفة: تنسيق احترافي دون الاعتماد على النطاق العام أو ملفات خارجية
// 🌟 التحديث الأقصى (V15.0): 
// 1. Stripe-Like IDs: تقنيع بصري احترافي لأرقام الطلبات والإيداعات مع الحفاظ على بادئات (ORD/DEP).
// 2. Crypto Flags Support: إضافة دعم أيقونات العملات الرقمية كـ USDT.
// 3. Strict Sanitization: حماية المعرفات والنصوص المقتطعة من ثغرات الحقن.
// ============================================================================

let _injectedSource = null;

export const RenderHelpers = Object.freeze({

    /**
     * 🔌 بوابة حقن البيانات (Dependency Injection)
     */
    init: function(source) {
        _injectedSource = source;
    },

    /**
     * 🧠 محرك استرجاع البيانات الداخلي
     */
    _getDataSource: function() {
        if (_injectedSource) return _injectedSource;
        
        console.warn("⚠️ RenderHelpers: محاولة استخدام المحرك قبل الحقن (init). سيتم استخدام قيم افتراضية.");
        return { settings: {}, rates: [], offers: [], isStore: false };
    },

    /**
     * 🛡️ دالة الحماية المركزية (Sanitization) - OWASP Strict Mode
     */
    _esc: function(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '&#x60;')
            .replace(/=/g, '&#x3D;')
            .replace(/\//g, '&#x2F;');
    },

    /**
     * 🔢 دالة تنسيق الأرقام (البنكية) - [محصنة ضد RangeError]
     */
    _enNum: function(num, decimals = 2) {
        const safeDecimals = Math.min(20, Math.max(0, Number(decimals) || 2));
        
        let parsedNum = Number(num);
        if (isNaN(parsedNum)) parsedNum = 0; // 🛡️ توحيد المخرجات
        
        return parsedNum.toLocaleString('en-US', {
            minimumFractionDigits: safeDecimals,
            maximumFractionDigits: safeDecimals,
            useGrouping: false
        });
    },
    
    // ============================================================================
    // 🎫 محرك معالجة وتنسيق المُعرّفات المركزية (Stripe-Like Masking)
    // ============================================================================
    
    formatUserId: function(userObj, withPrefix = false) {
        if (!userObj) return '---';
        let finalId = '';
        
        if (typeof userObj === 'object') {
            if (userObj.displayId) finalId = String(userObj.displayId);
            else finalId = String(userObj.uid || userObj.id || '').substring(0, 6).toUpperCase();
        } else {
            const strId = String(userObj);
            finalId = strId.length > 15 ? strId.substring(0, 6).toUpperCase() : strId.toUpperCase();
        }
        
        if (!finalId || finalId.trim() === '') finalId = 'UKNWN';
        const formatted = withPrefix ? `USR-${finalId}` : finalId;
        
        return RenderHelpers._esc(formatted);
    },
    
    // 🛡️ التحديث الماسي: تقنيع بصري مع الحفاظ على الهوية للطلبات
    formatOrderId: function(orderObj, withPrefix = true) {
        if (!orderObj) return '---';
        
        let fullId = typeof orderObj === 'object' ? (orderObj.displayId || orderObj.id || '') : orderObj;
        // إزالة أي بادئة قديمة لتنظيف الرقم (لضمان عدم التكرار ORD-ORD-...)
        fullId = String(fullId).replace(/^ORD-/i, '').trim();
        
        if (!fullId) return '---';

        const parts = fullId.split('-');
        let shortId = '';

        // استخراج الجزء الأخير من الرقم المعقد (إذا كان بالصيغة الهندسية)
        if (parts.length >= 2) {
            shortId = parts[parts.length - 1]; 
        } else {
            // إذا كان رقماً قديماً أو عادياً، نعرض آخر 7 رموز
            shortId = fullId.length > 7 ? fullId.slice(-7) : fullId;
        }
        
        const finalFormatted = withPrefix ? `ORD-${shortId.toUpperCase()}` : shortId.toUpperCase();
        return RenderHelpers._esc(finalFormatted);
    },
    
    // 🛡️ التحديث الماسي: تقنيع بصري مع الحفاظ على الهوية للإيداعات
    formatDepositId: function(depObj, withPrefix = true) {
        if (!depObj) return '---';
        
        let fullId = typeof depObj === 'object' ? (depObj.displayId || depObj.id || '') : depObj;
        // إزالة أي بادئة قديمة لتنظيف الرقم
        fullId = String(fullId).replace(/^DEP-/i, '').trim();
        
        if (!fullId) return '---';

        const parts = fullId.split('-');
        let shortId = '';

        if (parts.length >= 2) {
            shortId = parts[parts.length - 1]; 
        } else {
            shortId = fullId.length > 7 ? fullId.slice(-7) : fullId;
        }
        
        const finalFormatted = withPrefix ? `DEP-${shortId.toUpperCase()}` : shortId.toUpperCase();
        return RenderHelpers._esc(finalFormatted);
    },    

    // ============================================================================
    // 💰 المحركات المالية والعملات 
    // ============================================================================
    
    getCurrencySymbolText: function(currCode = 'USD') {
        const source = RenderHelpers._getDataSource();
        const { settings, rates } = source;
        const code = String(currCode).toUpperCase();
        
        let displayType = 'symbol'; 
        if (source.isStore) {
            const isSyncEnabled = settings.syncCurrencyDisplay === true;
            displayType = isSyncEnabled ? (settings.currencyDisplay || 'symbol') : 'symbol';
        } else {
            displayType = settings.currencyDisplay || 'symbol';
        }

        if (displayType === 'code') return code;
        
        let curObj = null;
        if (Array.isArray(rates)) {
            curObj = rates.find(r => r.code === code);
        } else if (rates && typeof rates === 'object') {
            curObj = rates[code]; 
        }
        
        return (curObj && curObj.symbol) ? curObj.symbol : code;
    },

    getCurrencyFlagUrl: function(currCode = 'USD') {
        const code = String(currCode).toUpperCase().trim();
        const currencyToCountry = {
            'USD': 'us', 'TRY': 'tr', 'SAR': 'sa', 'AED': 'ae', 
            'EUR': 'eu', 'SYP': 'sy', 'EGP': 'eg', 'JOD': 'jo',
            'KWD': 'kw', 'BHD': 'bh', 'QAR': 'qa', 'OMR': 'om',
            'GBP': 'gb', 'DZD': 'dz', 'MAD': 'ma'
        };
        
        // دعم أيقونات العملات الرقمية
        const cryptoIcons = {
            'USDT': 'https://cdn-icons-png.flaticon.com/512/825/825508.png',
            'BTC': 'https://cdn-icons-png.flaticon.com/512/5968/5968260.png'
        };

        if (cryptoIcons[code]) return cryptoIcons[code];

        const countryCode = currencyToCountry[code]; 
        
        if (!countryCode) return `https://cdn-icons-png.flaticon.com/512/1198/1198696.png`;
        
        return `https://flagcdn.com/w40/${countryCode}.png`;
    },

    formatMoney: function(amount, currencyCode = 'USD', decimals = 2) {
        const formattedNum = RenderHelpers._enNum(amount, decimals);
        
        const displayCur = RenderHelpers.getCurrencySymbolText(currencyCode);
        const isLongText = displayCur.trim().length > 1;
        const symbolClass = isLongText ? 'cur-multi' : 'cur-single';
        const safeCur = RenderHelpers._esc(displayCur);
        
        return `<span class="money-pro" dir="ltr" style="display: inline-flex; align-items: baseline; gap: 4px; direction: ltr;"><span class="num-en money-val">${formattedNum}</span><span class="cur-symbol ${symbolClass}">${safeCur}</span></span>`;
    },    

    // ============================================================================
    // 👥 محركات أسماء المستخدمين والشارات
    // ============================================================================

    _getTxName: function(u) {
        if (!u) return 'مستخدم جديد';
        const f = String(u.firstName || u.first_name || u.name || '').trim();
        const l = String(u.lastName || u.last_name || '').trim();
        let fullName = (f + ' ' + l).trim() || u.fullName || u.username;
        return RenderHelpers._esc(fullName ? fullName : 'مستخدم جديد');
    },

    _getExplicitName: function(u) {
        if (!u) return 'مستخدم غير معروف';
        const f = String(u.firstName || u.first_name || u.name || '').trim();
        const l = String(u.lastName || u.last_name || '').trim();
        const fullName = (f + ' ' + l).trim();
        return RenderHelpers._esc(fullName || u.username || 'مستخدم غير معروف');
    },

    _getActiveOfferBadge: function(prodId) {
        const source = RenderHelpers._getDataSource();
        const now = Date.now();
        if (!source.offers || !Array.isArray(source.offers)) return '';

        const activeOffer = source.offers.find(o => 
            o.isActive && (!o.expiryDate || o.expiryDate > now) && 
            o.targetProds && o.targetProds.includes(String(prodId))
        );

        if (!activeOffer) return '';
        const safeName = RenderHelpers._esc(activeOffer.name);
        return `<span class="promo-badge b-success icon-ms-2 badge-micro" title="مشمول في عرض: ${safeName}"><i class="fa-solid fa-bolt"></i> عرض نشط</span>`;
    },

    // ============================================================================
    // ⏱️ المحرك الزمني المركزي
    // ============================================================================

    parseUnifiedTime: function(item) {
        if (!item) return 0;
        const t = item.time ?? item.createdAt ?? item.actionTime ?? null;
        return RenderHelpers.parseTime(t);
    },

    parseTime: function(ts) {
        if (ts === null || ts === undefined) return 0;
        if (typeof ts === 'number') return ts;
        if (ts instanceof Date) return ts.getTime();
        
        if (typeof ts.toDate === 'function') return ts.toDate().getTime(); 
        if (ts.seconds !== undefined) return ts.seconds * 1000; 
        if (ts._seconds !== undefined) return ts._seconds * 1000; 
        
        if (typeof ts === 'string') {
            let safeString = ts;
            if (!ts.includes('T')) {
                safeString = ts.replace(/-/g, '/');
            }
            const parsed = new Date(safeString).getTime();
            return isNaN(parsed) ? 0 : parsed;
        }
        
        return 0; 
    },

    formatSafeDate: function(ts) {
        const timeMs = RenderHelpers.parseTime(ts);
        if (!timeMs) return '---';
        const dateObj = new Date(timeMs);
        if (isNaN(dateObj.getTime())) return '---';
        
        const dateStr = dateObj.toLocaleDateString('en-GB'); 
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        return `${dateStr} | ${timeStr}`;
    }
});