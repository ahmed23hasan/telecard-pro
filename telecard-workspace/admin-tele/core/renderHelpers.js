// ============================================================================
// 🛠️ مساعدات محرك الرسم العالمي (Universal Render Helpers) - Bank Grade 🏦
// 🚀 الهندسة: Provider Pattern (Pure Agnostic Core - Zero Dependencies)
// 🎯 الوظيفة: تنسيق احترافي دون الاعتماد على النطاق العام أو ملفات خارجية
// 🌟 التحديث: سد ثغرة (Currency XSS) + دعم العزل المزدوج للاتجاهات (BDI)
// ============================================================================

let _injectedSource = null;

export const RenderHelpers = Object.freeze({

    /**
     * 🔌 بوابة حقن البيانات (Dependency Injection)
     * @param {Object} source - كائن يحتوي على (settings, rates, offers, isStore)
     */
    init: function(source) {
        _injectedSource = source;
    },

    /**
     * 🧠 محرك استرجاع البيانات الداخلي
     */
    _getDataSource: function() {
        if (_injectedSource) return _injectedSource;
        
        // حالة الطوارئ: إذا حاول النظام الرسم قبل الحقن
        console.warn("⚠️ RenderHelpers: محاولة استخدام المحرك قبل الحقن (init). سيتم استخدام قيم افتراضية لمنع الانهيار.");
        return { settings: {}, rates: [], offers: [], isStore: false };
    },

    /**
     * 🛡️ دالة الحماية المركزية (Sanitization) المستقلة 100%
     */
    _esc: function(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, m => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m]));
    },

    /**
     * 🔢 دالة تنسيق الأرقام (الذكية)
     * تضمن ظهور الرقم بالشكل القياسي الإنجليزي وتخفي الأصفار العشرية إذا كان الرقم صحيحاً
     */
    _enNum: function(num, decimals = 2) {
        const parsedNum = Number(num) || 0;
        const finalDecimals = Number.isInteger(parsedNum) ? 0 : decimals;
        
        return parsedNum.toLocaleString('en-US', {
            minimumFractionDigits: finalDecimals,
            maximumFractionDigits: decimals,
            useGrouping: false // تمنع فواصل الألوف للقيم البرمجية الصافية
        });
    },

    // ============================================================================
    // 🎫 محرك معالجة وتنسيق المُعرّفات المركزية (ID Formatter Engine)
    // ============================================================================

    formatUserId: function(userObj) {
        if (!userObj) return '---';
        if (typeof userObj === 'object') {
            if (userObj.displayId) return String(userObj.displayId);
            const rawId = userObj.id || '';
            if (!rawId) return '---';
            return String(rawId).substring(0, 6).toUpperCase();
        }
        const strId = String(userObj);
        return strId.length > 15 ? strId.substring(0, 6).toUpperCase() : strId.toUpperCase();
    },

    formatOrderId: function(orderObj, withPrefix = true) {
        if (!orderObj) return '---';
        const rawId = typeof orderObj === 'object' ? (orderObj.displayId || orderObj.id || '') : orderObj;
        if (!rawId) return '---';
        return withPrefix ? `ORD-${rawId}` : String(rawId);
    },

    formatDepositId: function(depObj, withPrefix = true) {
        if (!depObj) return '---';
        const rawId = typeof depObj === 'object' ? (depObj.displayId || depObj.id || '') : depObj;
        if (!rawId) return '---';
        return withPrefix ? `DEP-${rawId}` : String(rawId);
    },

    // ============================================================================
    // 💰 المحركات المالية والعملات
    // ============================================================================

    getCurrencySymbolText: function(currCode = 'USD') {
        const source = this._getDataSource();
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
        
        const curObj = Array.isArray(rates) ? rates.find(r => r.code === code) : null;
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
        
        const countryCode = currencyToCountry[code];
        // 🌟 تعديل: إذا كانت العملة مجهولة، نستخدم أيقونة علم الأمم المتحدة (un) كبديل حيادي
        return countryCode ? `https://flagcdn.com/w40/${countryCode}.png` : `https://flagcdn.com/w40/un.png`;
    },

    /**
     * 🎨 دالة تنسيق المبالغ المالية الفاخرة
     * 🌟 التحديث: تطهير رمز العملة (XSS Safe) + إخفاء الأصفار + عزل الاتجاهات
     */
    formatMoney: function(amount, currencyCode = 'USD', decimals = 2) {
        const num = Number(amount) || 0;
        const finalDecimals = Number.isInteger(num) ? 0 : decimals;
        
        // هنا نسمح بفواصل الألوف لأنها للعرض البصري الجمالي
        const formattedNum = num.toLocaleString('en-US', {
            minimumFractionDigits: finalDecimals,
            maximumFractionDigits: decimals
        });
        
        const rawDisplayCur = this.getCurrencySymbolText(currencyCode);
        // 🛡️ الحماية: تطهير رمز العملة القادم من قاعدة البيانات
        const safeDisplayCur = this._esc(rawDisplayCur);
        
        const isLongText = safeDisplayCur.trim().length > 2 || /[A-Za-z]/.test(safeDisplayCur);
        const symbolClass = isLongText ? 'cur-multi' : 'cur-single';
        
        return `<span class="money-pro"><bdi class="num-en money-val">${formattedNum}</bdi><bdi class="cur-symbol ${symbolClass}">${safeDisplayCur}</bdi></span>`;
    },

    // ============================================================================
    // 👥 محركات أسماء المستخدمين والشارات
    // ============================================================================

    _getTxName: function(u) {
        if (!u) return 'مستخدم جديد';
        const f = u.firstName || u.first_name || u.name || '';
        const l = u.lastName || u.last_name || '';
        let fullName = (f + ' ' + l).trim() || u.fullName || u.username;
        return fullName ? fullName : 'مستخدم جديد';
    },

    _getExplicitName: function(u) {
        if (!u) return 'مستخدم غير معروف';
        const f = u.firstName || u.first_name || u.name || '';
        const l = u.lastName || u.last_name || '';
        const fullName = (f + ' ' + l).trim();
        return fullName || u.username || 'مستخدم غير معروف';
    },

    _getActiveOfferBadge: function(prodId) {
        const source = this._getDataSource();
        const now = Date.now();
        
        if (!source.offers || !Array.isArray(source.offers)) return '';

        const activeOffer = source.offers.find(o => 
            o.isActive && (!o.expiryDate || o.expiryDate > now) && 
            o.targetProds && o.targetProds.includes(String(prodId))
        );

        if (!activeOffer) return '';
        
        const safeName = this._esc(activeOffer.name);
            
        return `<span class="promo-badge b-success icon-ms-2 badge-micro" title="مشمول في عرض: ${safeName}"><i class="fa-solid fa-bolt"></i> عرض نشط</span>`;
    },

    // ============================================================================
    // ⏱️ المحرك الزمني المركزي
    // ============================================================================

    parseTime: function(ts) {
        if (!ts) return 0;
        if (typeof ts === 'number') return ts;
        if (typeof ts.toDate === 'function') return ts.toDate().getTime(); 
        if (ts.seconds) return ts.seconds * 1000; 
        if (typeof ts === 'string') {
            const parsed = new Date(ts).getTime();
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0; 
    },

    formatSafeDate: function(ts) {
        const timeMs = this.parseTime(ts);
        if (!timeMs) return '---';
        
        const dateObj = new Date(timeMs);
        if (isNaN(dateObj.getTime())) return '---'; 

        const dateStr = dateObj.toLocaleDateString('en-GB'); 
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${dateStr} | ${timeStr}`;
    }
});