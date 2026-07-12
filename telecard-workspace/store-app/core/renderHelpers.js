// ============================================================================
// 🛠️ مساعدات محرك الرسم العالمي (Universal Render Helpers)
// 🚀 الهندسة: Provider Pattern (Pure Agnostic Core - Zero Dependencies)
// 🎯 الوظيفة: تنسيق احترافي دون الاعتماد على النطاق العام أو ملفات خارجية
// 🌟 التحديث الأقصى: دمج حماية OWASP + طباعة فواتير الجوال الآمنة (No BDI)
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
        
        console.warn("⚠️ RenderHelpers: محاولة استخدام المحرك قبل الحقن (init). سيتم استخدام قيم افتراضية لمنع الانهيار.");
        return { settings: {}, rates: [], offers: [], isStore: false };
    },

    /**
     * 🛡️ دالة الحماية المركزية (Sanitization) - OWASP Strict Mode
     */
    _esc: function(str) {
        if (str === null || str === undefined) return '';
        // 🚀 ترقية التعقيم ليشمل كافة الرموز الخطرة حسب معايير OWASP
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
     * 🔢 دالة تنسيق الأرقام (البنكية)
     */
    _enNum: function(num, decimals = 2) {
        const parsedNum = Number(num) || 0;
        // 🚀 الإصلاح: إجبار عرض الخانات العشرية للعمليات المالية (مثل 5.00 وليس 5)
        return parsedNum.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
            useGrouping: false
        });
    },
    
    // ============================================================================
    // 🎫 محرك معالجة وتنسيق المُعرّفات المركزية (مدرع ضد XSS)
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
        
        if (!finalId) return '---';
        const formatted = withPrefix ? `USR-${finalId}` : finalId;
        return this._esc(formatted);
    },
    
    formatOrderId: function(orderObj, withPrefix = true) {
        if (!orderObj) return '---';
        const rawId = typeof orderObj === 'object' ? (orderObj.displayId || orderObj.id || '') : orderObj;
        if (!rawId) return '---';
        
        return this._esc(withPrefix ? `ORD-${String(rawId).toUpperCase()}` : String(rawId).toUpperCase());
    },
    
    formatDepositId: function(depObj, withPrefix = true) {
        if (!depObj) return '---';
        const rawId = typeof depObj === 'object' ? (depObj.displayId || depObj.id || '') : depObj;
        if (!rawId) return '---';
        
        return this._esc(withPrefix ? `DEP-${String(rawId).toUpperCase()}` : String(rawId).toUpperCase());
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
        const countryCode = currencyToCountry[code] || 'us'; 
        return `https://flagcdn.com/w40/${countryCode}.png`;
    },

    formatMoney: function(amount, currencyCode = 'USD', decimals = 2) {
        const num = Number(amount) || 0;
        
        const formattedNum = num.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
        
        const displayCur = this.getCurrencySymbolText(currencyCode);
        const isLongText = displayCur.trim().length > 1;
        const symbolClass = isLongText ? 'cur-multi' : 'cur-single';
        const safeCur = this._esc(displayCur);
        
        // 🛡️ [الترقيع المستعاد]: استخدام Flexbox و dir="ltr" لمنع تحطم الفواتير على الجوال بدلاً من <bdi>
        return `<span class="money-pro" dir="ltr" style="display: inline-flex; align-items: baseline; gap: 4px; direction: ltr;"><span class="num-en money-val">${formattedNum}</span><span class="cur-symbol ${symbolClass}">${safeCur}</span></span>`;
    },    

    // ============================================================================
    // 👥 محركات أسماء المستخدمين والشارات
    // ============================================================================

    _getTxName: function(u) {
        if (!u) return 'مستخدم جديد';
        const f = u.firstName || u.first_name || u.name || '';
        const l = u.lastName || u.last_name || '';
        let fullName = (f + ' ' + l).trim() || u.fullName || u.username;
        return this._esc(fullName ? fullName : 'مستخدم جديد');
    },

    _getExplicitName: function(u) {
        if (!u) return 'مستخدم غير معروف';
        const f = u.firstName || u.first_name || u.name || '';
        const l = u.lastName || u.last_name || '';
        const fullName = (f + ' ' + l).trim();
        return this._esc(fullName || u.username || 'مستخدم غير معروف');
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

    parseUnifiedTime: function(item) {
        if (!item) return 0;
        const t = item.time ?? item.createdAt ?? item.actionTime ?? null;
        return this.parseTime(t);
    },

    parseTime: function(ts) {
        if (ts === null || ts === undefined) return 0;
        if (typeof ts === 'number') return ts;
        if (ts instanceof Date) return ts.getTime();
        
        if (typeof ts.toDate === 'function') return ts.toDate().getTime(); 
        
        if (ts.seconds !== undefined) return ts.seconds * 1000; 
        if (ts._seconds !== undefined) return ts._seconds * 1000; 
        
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