// ============================================================================
// 🛠️ مساعدات محرك الرسم العالمي (Universal Render Helpers)
// 🚀 الهندسة: Provider Pattern (Pure Agnostic Core - Zero Dependencies)
// 🎯 الوظيفة: تنسيق احترافي دون الاعتماد على النطاق العام أو ملفات خارجية
// 🌟 التحديث: توحيد مصدر الحقيقة الزمني (SSOT) والذكاء المالي لإخفاء الأصفار
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

    /**
     * 👤 المنسق المركزي لأرقام العملاء (User ID)
     * يعالج الكائن أو النص المباشر ويقص المعرف الطويل فقط للحماية وسهولة القراءة
     */
    formatUserId: function(userObj) {
        if (!userObj) return '---';
        
        // 🌟 1. إذا كان المدخل كائناً (User Object)
        if (typeof userObj === 'object') {
            // إذا كان يمتلك المعرف الرقمي المكون من 7 خانات، نعرضه كاملاً دون قص
            if (userObj.displayId) return String(userObj.displayId);
            
            // خطة الطوارئ: إذا لم يمتلكه، نأخذ المعرف السحابي الطويل ونقصه للأمان والوضوح
            const rawId = userObj.id || '';
            if (!rawId) return '---';
            return String(rawId).substring(0, 6).toUpperCase();
        }
        
        // 🌟 2. إذا كان المدخل نصاً مباشراً (String ID)
        const strId = String(userObj);
        // إذا كان معرّف فايربيز السحابي الطويل (عادة أكبر من 15 حرف)، نقوم بقصه
        return strId.length > 15 ? strId.substring(0, 6).toUpperCase() : strId.toUpperCase();
    },

    /**
     * 📦 المنسق المركزي لأرقام الطلبات (Order ID)
     * يطبع المعرف الرقمي الصافي القادم من السيرفر ويضيف البادئة التجميلية
     */
    formatOrderId: function(orderObj, withPrefix = true) {
        if (!orderObj) return '---';
        const rawId = typeof orderObj === 'object' ? (orderObj.displayId || orderObj.id || '') : orderObj;
        if (!rawId) return '---';

        return withPrefix ? `ORD-${rawId}` : String(rawId);
    },

    /**
     * 💳 المنسق المركزي لأرقام الإيداعات (Deposit ID)
     * يطبع المعرف الرقمي ويضيف البادئة التجميلية للإيداعات
     */
    formatDepositId: function(depObj, withPrefix = true) {
        if (!depObj) return '---';
        const rawId = typeof depObj === 'object' ? (depObj.displayId || depObj.id || '') : depObj;
        if (!rawId) return '---';

        return withPrefix ? `DEP-${rawId}` : String(rawId);
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
     * 🌟 التحديث: إخفاء الأصفار العشرية الزائدة إذا كان الرقم صحيحاً + العزل ثنائي الاتجاه
     */
    formatMoney: function(amount, currencyCode = 'USD', decimals = 2) {
        const num = Number(amount) || 0;
        
        // الذكاء هنا: إذا الرقم صحيح (15) نخفي الأصفار، إذا كسري (15.50) نظهرها
        const finalDecimals = Number.isInteger(num) ? 0 : decimals;
        
        const formattedNum = num.toLocaleString('en-US', {
            minimumFractionDigits: finalDecimals,
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
     */
    _getTxName: function(u) {
        if (!u) return 'مستخدم جديد';
        
        const f = u.firstName || u.first_name || u.name || '';
        const l = u.lastName || u.last_name || '';
        let fullName = (f + ' ' + l).trim() || u.fullName || u.username;
        
        return fullName ? fullName : 'مستخدم جديد';
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
    /**
     * ⏱️ محرك فك تشفير وتوحيد أوقات المستندات (Unified Document Time Parser)
     * 🎯 الوظيفة: استخراج الوقت الصافي كـ (Millisecond) من أي كائن
     */
    parseUnifiedTime: function(item) {
        if (!item) return 0;
        
        // جلب الحقل الزمني المتوفر في المستند بمرونة
        const t = item.time ?? item.createdAt ?? item.actionTime ?? null;
        if (t === null || t === undefined) return 0;

        // 1. وقت رقمي جاهز
        if (typeof t === 'number') return t;
        
        // 2. كائن تاريخ متصفح اعتيادي
        if (t instanceof Date) return t.getTime();
        
        // 3. كائنات فايربيز (Standard)
        if (typeof t.toDate === 'function') return t.toDate().getTime(); 
        
        // 4. كائنات فايربيز الخام (Raw/JSON Parsed)
        if (t.seconds) return t.seconds * 1000; 
        if (t._seconds) return t._seconds * 1000; // 🛡️ حماية للكاش السحابي
        
        // 5. نصوص تاريخية
        if (typeof t === 'string') {
            const parsed = new Date(t).getTime();
            return isNaN(parsed) ? 0 : parsed;
        }
        
        return 0; 
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