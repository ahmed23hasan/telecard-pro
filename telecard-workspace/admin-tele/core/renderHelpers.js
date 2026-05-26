// ============================================================================
// 🛠️ مساعدات محرك الرسم العالمي (Universal Render Helpers)
// 🚀 الهندسة: Provider Pattern (Pure Agnostic Core - Zero Dependencies)
// 🎯 الوظيفة: تنسيق احترافي دون الاعتماد على النطاق العام أو ملفات خارجية
// 🌟 التحديث: توحيد مصدر الحقيقة الزمني (SSOT) ومحرك معالجة المُعرّفات (IDs)
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
     * 🔢 دالة تنسيق الأرقام (تضمن ظهور الرقم بالشكل القياسي الإنجليزي 123.45)
     * مستقلة تماماً لحماية النظام من تحول الأرقام إلى الهندية (١٢٣)
     */
    _enNum: function(num, decimals = 2) {
        const parsedNum = Number(num) || 0;
        return parsedNum.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
            useGrouping: false // تمنع فواصل الألوف للقيم البرمجية الصافية
        });
    },
    // ============================================================================
    // 🎫 محرك معالجة وتنسيق المُعرّفات المركزية (ID Formatter Engine)
    // ============================================================================

    /**
     * 👤 المنسق المركزي لأرقام العملاء (User ID)
     */
    formatUserId: function(userObj) {
        if (!userObj) return '---';
        const rawId = typeof userObj === 'object' ? (userObj.displayId || userObj.id || '') : userObj;
        if (!rawId) return '---';
        
        // ضمان ألا يتجاوز الرقم 6 خانات (لتوحيد الشكل)
        return String(rawId).substring(0, 6).toUpperCase();
    },

    /**
     * 📦 المنسق المركزي لأرقام الطلبات (Order ID)
     */
    formatOrderId: function(orderObj, withPrefix = true) {
        if (!orderObj) return '---';
        // إذا لم يجد displayId، سيأخذ أول 8 أحرف من الـ id العادي لحماية الواجهة من التشوه
        const rawId = typeof orderObj === 'object' ? (orderObj.displayId || String(orderObj.id || '').substring(0, 8)) : String(orderObj).substring(0, 8);
        if (!rawId) return '---';

        return withPrefix ? `ORD-${rawId.toUpperCase()}` : rawId.toUpperCase();
    },

    /**
     * 💳 المنسق المركزي لأرقام الإيداعات (Deposit ID)
     */
    formatDepositId: function(depObj, withPrefix = true) {
        if (!depObj) return '---';
        // حماية القص للـ ID الطويل
        const rawId = typeof depObj === 'object' ? (depObj.displayId || String(depObj.id || '').substring(0, 8)) : String(depObj).substring(0, 8);
        if (!rawId) return '---';

        return withPrefix ? `DEP-${rawId.toUpperCase()}` : rawId.toUpperCase();
    },

    // ============================================================================
    // 💰 المحركات المالية والعملات
    // ============================================================================

    /**
     * 💰 المحرك المركزي لجلب نص العملة (شعار أو رمز)
     */
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

    /**
     * 🌍 محرك جلب رابط علم الدولة تلقائياً بناءً على رمز العملة
     */
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

    /**
     * 🎨 دالة تنسيق المبالغ المالية الفاخرة
     * 🌟 العزل ثنائي الاتجاه (Bidi Isolation) لحل مشكلة الخط المشطوب
     */
    formatMoney: function(amount, currencyCode = 'USD', decimals = 2) {
        const num = Number(amount) || 0;
        
        const formattedNum = num.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
        
        const displayCur = this.getCurrencySymbolText(currencyCode);
        const isLongText = displayCur.trim().length > 2 || /[A-Za-z]/.test(displayCur);
        const symbolClass = isLongText ? 'cur-multi' : 'cur-single';
        
        return `<span class="money-pro"><bdi class="num-en money-val">${formattedNum}</bdi><bdi class="cur-symbol ${symbolClass}">${displayCur}</bdi></span>`;
    },

    // ============================================================================
    // 👥 محركات أسماء المستخدمين والشارات
    // ============================================================================

    /**
     * 🆔 جلب الاسم الظاهر للمستخدم (مخصص للطلبات والإيداعات والعمليات)
     * 🌟 التحديث: دمج الرقم القصير المركزي (formatUserId) لتعريف العميل بدقة في الجداول
     */
    _getTxName: function(u) {
        if (!u) return 'مستخدم جديد';
        
        // استخراج الرقم القصير من المحرك المركزي مباشرة لمنع التكرار والترقيع الموضعي
        const shortId = this.formatUserId(u);
        
        const f = u.firstName || u.first_name || u.name || '';
        const l = u.lastName || u.last_name || '';
        let fullName = (f + ' ' + l).trim() || u.fullName || u.username;
        
        if (!fullName) fullName = 'مستخدم جديد';
        
        // إرجاع الاسم متبوعاً بالرقم لتسهيل البحث والمطابقة على الإدارة
        return shortId && shortId !== '---' ? `${fullName} (#${shortId})` : fullName;
    },

    /**
     * 🆔 جلب الاسم الصريح للمستخدم (الاسم الأول والأخير صافي للملف الشخصي)
     */
    _getExplicitName: function(u) {
        if (!u) return 'مستخدم غير معروف';
        const f = u.firstName || u.first_name || u.name || '';
        const l = u.lastName || u.last_name || '';
        const fullName = (f + ' ' + l).trim();
        
        return fullName || u.username || 'مستخدم غير معروف';
    },

    /**
     * ⚡ شارة العروض النشطة 
     */
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

    /**
     * ⏱️ المحرك الزمني المركزي (يفك تشفير أي تاريخ من السحابة)
     * 🎯 SSOT: يعالج كائنات Firestore Timestamps والأرقام والنصوص دون انهيار الصبغة
     */
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

    /**
     * 📅 المنسق الزمني الموحد (يطبع التاريخ بشكل محاسبي أنيق ومقروء)
     * 🎯 SSOT: يتم استدعاؤه في قوائم المتجر ودرج الإدارة لمنع تضارب عروض الأوقات
     */
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
