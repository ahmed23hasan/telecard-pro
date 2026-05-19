// ============================================================================
// 🛠️ مساعدات محرك الرسم العالمي (Universal Render Helpers)
// 🚀 الهندسة: Provider Pattern (Pure Agnostic Core - Zero Dependencies)
// 🎯 الوظيفة: تنسيق احترافي دون الاعتماد على النطاق العام أو ملفات خارجية
// 🌟 التحديث: توافق رجعي كامل، دعم الرقم القصير (displayId)، وعزل ثنائي الاتجاه (Bidi)
// ============================================================================

// متغير خاص بالوحدة (Module-level Private Variable)
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
     * 🎨 دالة تنسيق المبالغ المالية الفاخرة
     * 🌟 تم الإصلاح: العزل ثنائي الاتجاه (Bidi Isolation) لحل مشكلة الخط المشطوب
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
        
        // استخدام وسم <bdi> لعزل الرقم عن العملة ومنع انزياح الخط المشطوب
        return `<span class="money-pro"><bdi class="num-en money-val">${formattedNum}</bdi><bdi class="cur-symbol ${symbolClass}">${displayCur}</bdi></span>`;
    },

    /**
     * 🆔 جلب الاسم الظاهر للمستخدم (مخصص للطلبات والإيداعات والعمليات)
     * 🌟 التحديث: دمج الرقم القصير (displayId) لتعريف العميل بدقة في الجداول
     */
    _getTxName: function(u) {
        if (!u) return 'مستخدم جديد';
        
        // استخراج الرقم القصير أو أول 6 خانات كبديل
        const shortId = u.displayId || (u.id ? String(u.id).substring(0, 6) : '');
        
        const f = u.firstName || u.first_name || u.name || '';
        const l = u.lastName || u.last_name || '';
        let fullName = (f + ' ' + l).trim() || u.fullName || u.username;
        
        if (!fullName) fullName = 'مستخدم جديد';
        
        // إرجاع الاسم متبوعاً بالرقم لتسهيل البحث والمطابقة على الإدارة
        return shortId ? `${fullName} (#${shortId})` : fullName;
    },

    /**
     * 🆔 جلب الاسم الصريح للمستخدم (الاسم الأول والأخير صافي للملف الشخصي)
     */
    _getExplicitName: function(u) {
        if (!u) return 'مستخدم غير معروف';
        const f = u.firstName || u.first_name || u.name || '';
        const l = u.lastName || u.last_name || '';
        const fullName = (f + ' ' + l).trim();
        
        // إرجاع الاسم الكامل، وإذا كان فارغاً يتم استخدام المعرف كبديل
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
    }
});
