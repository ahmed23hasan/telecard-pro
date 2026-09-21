// ============================================================================
// 🛠️ مساعدات محرك الرسم للإدارة (Admin Render Helpers) - Enterprise V15.3 💎
// 🎯 الوظيفة: تنسيق الفواتير، التقارير، والواجهات الخاصة بلوحة تحكم المدير.
// 🚀 التحديثات المعمارية (V15.3):
// 1. Visual Masking: اقتطاع المعرفات الطويلة لـ 8 رموز (جماليات العرض البصري).
// 2. Data Integrity: إيقاف السفر عبر الزمن (Time-Travel) في الإحصائيات للتواريخ التالفة.
// 3. Name Priority: أولوية لـ fullName على الأسماء المدمجة لتجنب تشوه البيانات.
// 4. Decimal Zero Fix: معالجة فخ القيمة الصفرية في الخانات العشرية وتفعيل الفواصل.
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
        console.warn("⚠️ [Admin RenderHelpers]: محاولة استخدام المحرك قبل الحقن (init).");
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
     * 🔢 دالة تنسيق الأرقام (البنكية) - مريحة لعين المدير (UI Clarity)
     */
    _enNum: function(num, decimals) {
        const parsedNum = Number(num) || 0;
        
        // 🛡️ إصلاح فخ القيمة الصفرية: التأكد من السماح بتمرير 0 دون أن يتحول إلى 2
        const targetDecimals = (decimals !== undefined && decimals !== null) ? Number(decimals) : 2;
        const safeDecimals = Math.min(20, Math.max(0, targetDecimals));
        
        return parsedNum.toLocaleString('en-US', {
            minimumFractionDigits: safeDecimals,
            maximumFractionDigits: safeDecimals,
            useGrouping: true // 🛡️ تفعيل فواصل الآلاف لراحة عين الأدمن (مثال: 10,000.00)
        });
    },
    // ============================================================================
    // 🎫 محرك معالجة وتنسيق المُعرّفات المركزية (Dual-Target Smart ID Badge)
    // ============================================================================

    formatUserId: function(userObj, withPrefix = false) {
        if (!userObj) return '---';
        let fullId = typeof userObj === 'object' ? String(userObj.displayId || userObj.uid || userObj.id || '') : String(userObj);
        if (!fullId.trim()) fullId = 'UKNWN';
        
        const shortId = fullId.length > 15 ? fullId.substring(0, 8) : fullId;
        const displayTxt = withPrefix ? `USR-${shortId.toUpperCase()}` : shortId.toUpperCase();
        
        // 🚀 [التحديث المعماري]: نسخ مزدوج (النص للقصير، والأيقونة للطويل)
        return `<span style="display:inline-flex; align-items:center; gap:6px;">
            <span class="smart-id-badge" title="نسخ الرقم القصير (للبحث السريع)" data-action="copy-text" data-copy-text="${RenderHelpers._esc(displayTxt)}" style="cursor: pointer; border-bottom: 1px dashed var(--text-muted); padding-bottom: 1px;">${RenderHelpers._esc(displayTxt)}</span>
            <i class="fa-solid fa-fingerprint text-muted click-shrink" title="نسخ المعرف الكامل لقاعدة البيانات: ${RenderHelpers._esc(fullId)}" data-action="copy-text" data-copy-text="${RenderHelpers._esc(fullId)}" style="cursor: pointer; font-size: 13px;"></i>
        </span>`;
    },
    
    formatOrderId: function(orderObj, withPrefix = true) {
        if (!orderObj) return '---';
        let rawId = typeof orderObj === 'object' ? String(orderObj.displayId || orderObj.id || '') : String(orderObj);
        const fullId = rawId; // الاحتفاظ بالرقم الأصلي كاملاً
        rawId = rawId.replace(/^ORD-/i, '').trim();
        if (!rawId) return '---';
        
        const shortId = rawId.length > 8 ? rawId.slice(-8) : rawId;
        const displayTxt = withPrefix ? `ORD-${shortId.toUpperCase()}` : shortId.toUpperCase();
        
        // 🚀 [التحديث المعماري]: نسخ مزدوج (النص للقصير، والأيقونة للطويل)
        return `<span style="display:inline-flex; align-items:center; gap:6px;">
            <span class="smart-id-badge" title="نسخ الرقم القصير (للبحث السريع)" data-action="copy-text" data-copy-text="${RenderHelpers._esc(displayTxt)}" style="cursor: pointer; border-bottom: 1px dashed var(--text-muted); padding-bottom: 1px;">${RenderHelpers._esc(displayTxt)}</span>
            <i class="fa-solid fa-fingerprint text-muted click-shrink" title="نسخ المعرف الكامل لقاعدة البيانات: ${RenderHelpers._esc(fullId)}" data-action="copy-text" data-copy-text="${RenderHelpers._esc(fullId)}" style="cursor: pointer; font-size: 13px;"></i>
        </span>`;
    },
    
    formatDepositId: function(depObj, withPrefix = true) {
        if (!depObj) return '---';
        let rawId = typeof depObj === 'object' ? String(depObj.displayId || depObj.id || '') : String(depObj);
        const fullId = rawId; // الاحتفاظ بالرقم الأصلي كاملاً
        rawId = rawId.replace(/^DEP-/i, '').trim();
        if (!rawId) return '---';
        
        const shortId = rawId.length > 8 ? rawId.slice(-8) : rawId;
        const displayTxt = withPrefix ? `DEP-${shortId.toUpperCase()}` : shortId.toUpperCase();
        
        // 🚀 [التحديث المعماري]: نسخ مزدوج (النص للقصير، والأيقونة للطويل)
        return `<span style="display:inline-flex; align-items:center; gap:6px;">
            <span class="smart-id-badge" title="نسخ الرقم القصير (للبحث السريع)" data-action="copy-text" data-copy-text="${RenderHelpers._esc(displayTxt)}" style="cursor: pointer; border-bottom: 1px dashed var(--text-muted); padding-bottom: 1px;">${RenderHelpers._esc(displayTxt)}</span>
            <i class="fa-solid fa-fingerprint text-muted click-shrink" title="نسخ المعرف الكامل لقاعدة البيانات: ${RenderHelpers._esc(fullId)}" data-action="copy-text" data-copy-text="${RenderHelpers._esc(fullId)}" style="cursor: pointer; font-size: 13px;"></i>
        </span>`;
    },
    // ============================================================================
    // 💰 المحركات المالية والعملات 
    // ============================================================================

    getCurrencySymbolText: function(currCode = 'USD') {
        const source = RenderHelpers._getDataSource();
        const { settings, rates } = source;
        const code = String(currCode).toUpperCase();
        
        const displayType = settings.currencyDisplay || 'symbol';
        if (displayType === 'code') return code;
        
        let curObj = null;
        if (Array.isArray(rates)) curObj = rates.find(r => r.code === code);
        else if (rates && typeof rates === 'object') curObj = rates[code]; 
        
        return (curObj && curObj.symbol) ? curObj.symbol : code;
    },

    getCurrencyFlagUrl: function(currCode = 'USD') {
        const code = String(currCode).toUpperCase().trim();
        
        // 🪙 دعم أيقونات العملات الرقمية
        const cryptoIcons = {
            'USDT': 'https://cdn-icons-png.flaticon.com/512/825/825508.png',
            'BTC': 'https://cdn-icons-png.flaticon.com/512/5968/5968260.png',
            'ETH': 'https://cdn-icons-png.flaticon.com/512/6001/6001368.png'
        };
        if (cryptoIcons[code]) return cryptoIcons[code];

        const currencyToCountry = {
            'USD': 'us', 'TRY': 'tr', 'SAR': 'sa', 'AED': 'ae', 
            'EUR': 'eu', 'SYP': 'sy', 'EGP': 'eg', 'JOD': 'jo',
            'KWD': 'kw', 'BHD': 'bh', 'QAR': 'qa', 'OMR': 'om',
            'GBP': 'gb', 'DZD': 'dz', 'MAD': 'ma'
        };
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
        const combined = (f + ' ' + l).trim();
        
        // 🛡️ الأولوية القصوى لـ fullName لضمان عدم فقدان الأسماء المسجلة رسمياً
        const fullName = u.fullName || combined || u.username || 'مستخدم جديد';
        return RenderHelpers._esc(fullName);
    },

    _getExplicitName: function(u) {
        if (!u) return 'مستخدم غير معروف';
        const f = String(u.firstName || u.first_name || u.name || '').trim();
        const l = String(u.lastName || u.last_name || '').trim();
        const combined = (f + ' ' + l).trim();
        
        const fullName = u.fullName || combined || u.username || 'مستخدم غير معروف';
        return RenderHelpers._esc(fullName);
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
    // ⏱️ المحرك الزمني المركزي (Analytics-Safe Logic)
    // ============================================================================

    parseUnifiedTime: function(item) {
        if (!item) return 0;
        const t = item.time ?? item.createdAt ?? item.actionTime ?? null;
        return RenderHelpers.parseTime(t);
    },

    parseTime: function(ts) {
        // 🛡️ حماية الإحصائيات (Admin Mode): إذا كان التاريخ مفقوداً فعلياً، نرجع 0 (1970).
        // هذا يمنع السفر عبر الزمن ويضمن عدم ظهور الطلبات القديمة التالفة كأنها حدثت "اليوم".
        if (ts === null || ts === undefined || ts === '') return 0; 
        
        if (typeof ts === 'number') return ts;
        if (ts instanceof Date) return ts.getTime();
        
        if (typeof ts.toDate === 'function') return ts.toDate().getTime(); 
        if (ts.seconds !== undefined) return ts.seconds * 1000; 
        if (ts._seconds !== undefined) return ts._seconds * 1000; 
        
        if (typeof ts === 'string') {
            let safeString = ts;
            if (!ts.includes('T')) safeString = ts.replace(/-/g, '/'); // Safari ISO Shield
            const parsed = new Date(safeString).getTime();
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0; 
    },

    formatSafeDate: function(ts) {
        const timeMs = RenderHelpers.parseTime(ts);
        if (timeMs === 0) return '---'; // دلالة بصرية للأدمن أن التاريخ مفقود أو معلق
        
        const dateObj = new Date(timeMs);
        if (isNaN(dateObj.getTime())) return '---';
        
        const dateStr = dateObj.toLocaleDateString('en-GB'); 
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        return `${dateStr} | ${timeStr}`;
    }

});
