// ============================================================================
// 🛠️ مساعدات محرك الرسم للإدارة (Admin Render Helpers) - Enterprise V16.0.0 💎
// 🎯 الوظيفة: تنسيق الفواتير، التقارير، والواجهات الخاصة بلوحة تحكم المدير.
// 🚀 التحديثات المعمارية (V16.0.0 - Full Server & Store Parity):
// 1. Unified 8-Char Numeric User ID 🎫: توليد ومطابقة معرف العميل القياسي (حرفان + 6 أرقام مثل MK482915).
// 2. Strict Offer Parity 🎯: استبعاد عروض (badge_only و fake) لمطابقة السيرفر والمتجر.
// 3. Crypto Precision Formatting 🔬: ضبط الكسور تلقائياً (4-6 خانات) للعملات الرقمية في formatMoney.
// 4. Global Flags Expansion 🌍: إضافة USDC وكافة العملات المدعومة في المتجر.
// 5. Dual-Binding Copy Attributes 📋: دعم data-copy-text و data-text معاً لمنع فشل النسخ بالنقر.
// ============================================================================

let _injectedSource = null;

export const RenderHelpers = Object.freeze({

    init: function(source) {
        _injectedSource = source;
    },

    _getDataSource: function() {
        if (_injectedSource) return _injectedSource;
        console.warn("⚠️ [Admin RenderHelpers]: محاولة استخدام المحرك قبل الحقن (init).");
        return { settings: {}, rates: [], offers: [], prods: [], isStore: false };
    },

    _esc: function(str) {
        if (str === null || str === undefined) return '';
        const unescaped = String(str)
            .replace(/&#x2F;/gi, '/')
            .replace(/&#x3D;/gi, '=')
            .replace(/&#x60;/gi, '`')
            .replace(/&#39;|&#x27;/gi, "'")
            .replace(/&quot;/gi, '"')
            .replace(/&gt;/gi, '>')
            .replace(/&lt;/gi, '<')
            .replace(/&amp;/gi, '&');
        
        return unescaped
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '&#x60;')
            .replace(/=/g, '&#x3D;')
            .replace(/\//g, '&#x2F;');
    },

    _enNum: function(num, decimals) {
        const rawNum = Number(num) || 0;
        const targetDecimals = (decimals !== undefined && decimals !== null) ? Number(decimals) : 2;
        const safeDecimals = Math.min(20, Math.max(0, targetDecimals));
        
        const sanitizedNum = (typeof window !== 'undefined' && window.FinancialEngine) ?
            (safeDecimals > 4 && typeof window.FinancialEngine._internalSanitize === 'function' ?
                window.FinancialEngine._internalSanitize(rawNum) :
                window.FinancialEngine.sanitizeAmount(rawNum)) :
            rawNum;
        
        return sanitizedNum.toLocaleString('en-US', {
            minimumFractionDigits: safeDecimals,
            maximumFractionDigits: safeDecimals,
            useGrouping: true
        });
    },

    // ============================================================================
    // 🎫 محرك معالجة وتنسيق المُعرّفات المركزية (Unified Smart ID Engine)
    // ============================================================================

    _buildSmartIdHtml: function(fullId, displayTxt) {
        const safeDisplay = RenderHelpers._esc(displayTxt);
        const safeFull = RenderHelpers._esc(fullId);
        return `<span style="display:inline-flex; align-items:center; gap:6px;">
            <span class="smart-id-badge" title="نسخ الرقم القصير (للبحث السريع)" data-action="copy-text" data-copy-text="${safeDisplay}" data-text="${safeDisplay}" style="cursor: pointer; border-bottom: 1px dashed var(--text-muted); padding-bottom: 1px;">${safeDisplay}</span>
            <i class="fa-solid fa-fingerprint text-muted click-shrink" title="نسخ المعرف الكامل لقاعدة البيانات: ${safeFull}" data-action="copy-text" data-copy-text="${safeFull}" data-text="${safeFull}" style="cursor: pointer; font-size: 13px;"></i>
        </span>`;
    },

    // ============================================================================
    // 📭 محرك حالات الفراغ الموحد (Unified Empty States - CSS Synced)
    // ============================================================================
    emptyState: function(iconClass, title, description = '') {
        const safeTitle = RenderHelpers._esc(title);
        const safeDesc = RenderHelpers._esc(description);
        const safeIcon = RenderHelpers._esc(iconClass);
        
        return `
            <div class="empty-state interactive-scale">
                <i class="${safeIcon}"></i>
                <span>${safeTitle}</span>
                ${safeDesc ? `<span class="fs-12 mt-5 text-muted fw-bold">${safeDesc}</span>` : ''}
            </div>`;
    },
    
    // 🛡️ [توليد وتنسيق معرف العميل الموحد]: يدعم displayId المسجل أو يشتقه تلقائياً بصيغة (حرفان + 6 أرقام)
    formatUserId: function(userObj, withPrefix = false) {
        if (!userObj) return '---';

        const toShortCode = (rawUid) => {
            const str = String(rawUid || '').replace(/^USR-/i, '').trim();
            if (!str) return 'UKNWN';
            if (str.length <= 8) return str.toUpperCase();
            let h1 = 2166136261, h2 = 5381;
            for (let i = 0; i < str.length; i++) {
                const c = str.charCodeAt(i);
                h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
                h2 = (Math.imul(h2, 33) ^ c) >>> 0;
            }
            return `${String.fromCharCode(65 + (h1 % 26))}${String.fromCharCode(65 + ((h1 >>> 8) % 26))}${100000 + (h2 % 900000)}`;
        };

        let fullId = '';
        let shortId = '';

        if (typeof userObj === 'object') {
            fullId = String(userObj.uid || userObj.id || userObj.displayId || '').trim();
            shortId = userObj.displayId
                ? String(userObj.displayId).replace(/^USR-/i, '').substring(0, 8).toUpperCase()
                : toShortCode(fullId);
        } else {
            fullId = String(userObj).trim();
            shortId = toShortCode(fullId);
        }

        if (!fullId) return '---';
        if (!shortId) shortId = 'UKNWN';
        const displayTxt = withPrefix ? `USR-${shortId}` : shortId;
        
        return this._buildSmartIdHtml(fullId, displayTxt);
    },
    
    formatOrderId: function(orderObj, withPrefix = true) {
        if (!orderObj) return '---';
        let rawId = typeof orderObj === 'object' ? String(orderObj.displayId || orderObj.id || '') : String(orderObj);
        const fullId = rawId.trim();
        const cleanBody = fullId.replace(/^(ORD-|TC-)/i, '').trim();
        if (!cleanBody) return '---';
        
        const shortId = cleanBody.split('-')[0].substring(0, 8).toUpperCase();
        const displayTxt = withPrefix ? `ORD-${shortId}` : shortId;
        
        return this._buildSmartIdHtml(fullId, displayTxt);
    },
    
    formatDepositId: function(depObj, withPrefix = true) {
        if (!depObj) return '---';
        let rawId = typeof depObj === 'object' ? String(depObj.displayId || depObj.id || '') : String(depObj);
        const fullId = rawId.trim();
        const cleanBody = fullId.replace(/^(DEP-|TC-|ADMBAL-)/i, '').trim();
        if (!cleanBody) return '---';
        
        const shortId = cleanBody.split('-')[0].substring(0, 8).toUpperCase();
        const displayTxt = withPrefix ? `DEP-${shortId}` : shortId;
        
        return this._buildSmartIdHtml(fullId, displayTxt);
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
        
        const cryptoIcons = {
            'USDT': 'https://cdn-icons-png.flaticon.com/512/825/825508.png',
            'BTC': 'https://cdn-icons-png.flaticon.com/512/5968/5968260.png',
            'ETH': 'https://cdn-icons-png.flaticon.com/512/6001/6001368.png',
            'USDC': 'https://cdn-icons-png.flaticon.com/512/825/825508.png'
        };
        if (cryptoIcons[code]) return cryptoIcons[code];

        const currencyToCountry = {
            'USD': 'us', 'TRY': 'tr', 'SAR': 'sa', 'AED': 'ae', 
            'EUR': 'eu', 'SYP': 'sy', 'EGP': 'eg', 'JOD': 'jo',
            'KWD': 'kw', 'BHD': 'bh', 'QAR': 'qa', 'OMR': 'om',
            'GBP': 'gb', 'DZD': 'dz', 'MAD': 'ma', 'IQD': 'iq',
            'LBP': 'lb', 'YER': 'ye', 'SDG': 'sd', 'LYD': 'ly',
            'TND': 'tn', 'MRU': 'mr', 'SOS': 'so', 'CAD': 'ca',
            'AUD': 'au', 'RUB': 'ru', 'CNY': 'cn', 'INR': 'in',
            'BRL': 'br', 'JPY': 'jp', 'CHF': 'ch', 'SEK': 'se'
        };
        const countryCode = currencyToCountry[code]; 
        
        if (!countryCode) return `https://cdn-icons-png.flaticon.com/512/1198/1198696.png`;
        return `https://flagcdn.com/w40/${countryCode}.png`;
    },

    formatMoney: function(amount, currencyCode = 'USD', decimals = null) {
        const code = String(currencyCode).toUpperCase().trim();
        
        let finalDecimals = decimals !== null ? decimals : 2;
        const cryptoCurrencies = new Set(['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL']);
        
        if (decimals === null && cryptoCurrencies.has(code)) {
            finalDecimals = (code === 'BTC' || code === 'ETH') ? 6 : 4; 
        }

        const formattedNum = RenderHelpers._enNum(amount, finalDecimals);
        const displayCur = RenderHelpers.getCurrencySymbolText(code);
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
        
        const fullName = u.fullName || combined || u.username || 'مستخدم جديد';
        return RenderHelpers._esc(fullName);
    },
    
    // 🚀 [تطابق 100% مع السيرفر والمتجر]: شمول الأقسام المتعددة واستثناء السعر الثابت وعروض fake و badge_only
    _getActiveOfferBadge: function(prodId) {
        const source = RenderHelpers._getDataSource();
        const now = Date.now();
        if (!source.offers || !Array.isArray(source.offers)) return '';
        
        const product = Array.isArray(source.prods) ? source.prods.find(p => String(p.id) === String(prodId)) : null;
        if (product && (product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true' || product.is_fixed_price === true)) {
            return '';
        }
        
        const prodCats = product ?
            [].concat(product.catId, product.category, product.categoryId, product.categoryIds).filter(Boolean).map(String) :
            [];

        const activeOffer = source.offers.find(o => {
            if (!o || o.isActive === false || o.type === 'fake' || o.type === 'badge_only') return false;
            
            const startMs = o.startDate ? RenderHelpers.parseTime(o.startDate, false) : 0;
            const expMs = o.expiryDate ? RenderHelpers.parseTime(o.expiryDate, false) : 0;
            
            if (startMs > 0 && now < startMs) return false;
            if (expMs > 0 && now >= expMs) return false;
            
            const hasProds = Array.isArray(o.targetProds) && o.targetProds.length > 0;
            const hasCats = Array.isArray(o.targetCategories) && o.targetCategories.length > 0;
            
            const isGlobal = (!hasProds && !hasCats);
            const isTargetingProduct = hasProds && o.targetProds.map(String).includes(String(prodId));
            const isTargetingCategory = hasCats && prodCats.length > 0 && o.targetCategories.map(String).some(cid => prodCats.includes(cid));
            
            return isGlobal || isTargetingProduct || isTargetingCategory;
        });
        
        if (!activeOffer) return '';
        const safeName = RenderHelpers._esc(activeOffer.name);
        return `<span class="promo-badge b-success icon-ms-2 badge-micro" title="مشمول في عرض: ${safeName}"><i class="fa-solid fa-bolt"></i> عرض نشط</span>`;
    },

    // ============================================================================
    // ⏱️ المحرك الزمني المركزي (Analytics-Safe Logic)
    // ============================================================================

    parseUnifiedTime: function(item) {
        if (!item) return Date.now();
        const t = item.time ?? item.createdAt ?? item.actionTime ?? null;
        return RenderHelpers.parseTime(t);
    },

    parseTime: function(ts, fallbackToNow = true) {
        if (ts === null || ts === undefined || ts === '') return fallbackToNow ? Date.now() : 0; 
        
        if (typeof ts === 'number') {
            if (ts === 0) return fallbackToNow ? Date.now() : 0;
            return ts;
        }
        
        if (ts instanceof Date) return isNaN(ts.getTime()) ? (fallbackToNow ? Date.now() : 0) : ts.getTime();
        
        if (typeof ts.toDate === 'function') return ts.toDate().getTime(); 
        if (ts.seconds !== undefined) return ts.seconds * 1000; 
        if (ts._seconds !== undefined) return ts._seconds * 1000; 
        
        if (typeof ts === 'string') {
            let safeString = ts;
            if (!ts.includes('T')) safeString = ts.replace(/-/g, '/'); 
            const parsed = new Date(safeString).getTime();
            return isNaN(parsed) ? (fallbackToNow ? Date.now() : 0) : parsed;
        }
        
        return fallbackToNow ? Date.now() : 0; 
    },

    formatSafeDate: function(ts) {
        const timeMs = RenderHelpers.parseTime(ts);
        const dateObj = new Date(timeMs);
        
        if (isNaN(dateObj.getTime())) return '---';
        
        const dateStr = dateObj.toLocaleDateString('en-GB'); 
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        return `${dateStr} | ${timeStr}`;
    }

});