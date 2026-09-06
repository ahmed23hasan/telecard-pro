// ============================================================================
// 🛠️ مساعدات محرك الرسم العالمي (Store Render Helpers) - Enterprise V18.9.1 💎
// 🎯 الوظيفة: تنسيق احترافي للنصوص والأموال والتواريخ، مخصص لراحة العميل (UX).
// 🚀 التحديثات المعمارية (V18.9.1 - Performance & Crypto Patch):
// 1. Loop-Free Boot ⚡: إزالة حلقة البحث في LocalStorage (O(1)) لمنع تجميد المتصفح أثناء الإقلاع.
// 2. Crypto Precision Guard 💎: دعم ديناميكي للفواصل العشرية للعملات الرقمية (حتى 6 أصفار).
// 3. Strict Deterministic Cache 🛡️: قراءة الكاش عبر مفاتيح حتمية فقط لتسريع الرندر.
// 4. Stripe-Like Masking: اقتطاع أنيق للمعرفات لراحة عين المستخدم.
// ============================================================================

import { escapeHtml, enNum, parseSafeTime } from '../utils.js';

let _injectedSource = null;

export const RenderHelpers = Object.freeze({

    init: function(source) {
        _injectedSource = source;
    },

    // 🛡️ التحديث المعماري: O(1) Data Race Guard (إزالة الـ Loop بالكامل)
    _getDataSource: function() {
        if (_injectedSource) return _injectedSource;
        
        // في حال تم استدعاء الدالة قبل تهيئة الموزع (أثناء الإقلاع الباكر)، 
        // نبحث عبر مفاتيح حتمية (Deterministic) بدلاً من اللف على كل الذاكرة.
        try {
            if (typeof localStorage !== 'undefined') {
                const cachedSettings = JSON.parse(localStorage.getItem('telecard_store_cache_telecard_settings_singleton') || '{}');
                // استدعاء مباشر وسريع بدون إجهاد المعالج
                const cachedRates = JSON.parse(localStorage.getItem('telecard_store_cache_telecard_rates_singleton') || localStorage.getItem('telecard_rates') || '[]');
                
                return { settings: cachedSettings, rates: cachedRates, offers: [], isStore: true };
            }
        } catch(e) {
            console.warn("[RenderHelpers] تعذر قراءة الكاش الاحتياطي.");
        }

        return { settings: {}, rates: [], offers: [], isStore: true };
    },

    _esc: escapeHtml,
    _enNum: enNum,

    // ============================================================================
    // 🎫 محرك معالجة وتنسيق المُعرّفات (Stripe-Like Masking for UX)
    // ============================================================================

    formatUserId: function(userObj, withPrefix = false) {
        if (!userObj) return '---';
        let finalId = '';
        if (typeof userObj === 'object') {
            finalId = String(userObj.displayId || userObj.uid || userObj.id || '').substring(0, 6).toUpperCase();
        } else {
            const strId = String(userObj);
            finalId = strId.length > 15 ? strId.substring(0, 6).toUpperCase() : strId.toUpperCase();
        }
        if (!finalId.trim()) finalId = 'UKNWN';
        const formatted = withPrefix ? `USR-${finalId}` : finalId;
        return escapeHtml(formatted);
    },

    formatOrderId: function(orderObj, withPrefix = true) {
        if (!orderObj) return '---';
        let fullId = typeof orderObj === 'object' ? (orderObj.displayId || orderObj.id || '') : orderObj;
        fullId = String(fullId).replace(/^ORD-/i, '').trim();
        if (!fullId) return '---';

        const parts = fullId.split('-');
        let shortId = parts.length >= 2 ? parts[parts.length - 1] : (fullId.length > 7 ? fullId.slice(-7) : fullId);
        
        const finalFormatted = withPrefix ? `ORD-${shortId.toUpperCase()}` : shortId.toUpperCase();
        return escapeHtml(finalFormatted);
    },

    formatDepositId: function(depObj, withPrefix = true) {
        if (!depObj) return '---';
        let fullId = typeof depObj === 'object' ? (depObj.displayId || depObj.id || '') : depObj;
        fullId = String(fullId).replace(/^DEP-/i, '').trim();
        if (!fullId) return '---';

        const parts = fullId.split('-');
        let shortId = parts.length >= 2 ? parts[parts.length - 1] : (fullId.length > 7 ? fullId.slice(-7) : fullId);
        
        const finalFormatted = withPrefix ? `DEP-${shortId.toUpperCase()}` : shortId.toUpperCase();
        return escapeHtml(finalFormatted);
    },    

    // ============================================================================
    // 💰 المحركات المالية والعملات 
    // ============================================================================

    getCurrencySymbolText: function(currCode = 'USD') {
        const source = RenderHelpers._getDataSource();
        const { settings, rates } = source;
        const code = String(currCode).toUpperCase();
        
        let displayType = 'symbol'; 
        if (source.isStore && settings.syncCurrencyDisplay === true) {
            displayType = settings.currencyDisplay || 'symbol';
        }
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
            'BRL': 'br', 'JPY': 'jp', 'CHF': 'ch', 'SEK': 'ch'
        };
        const countryCode = currencyToCountry[code]; 
        if (!countryCode) return `https://cdn-icons-png.flaticon.com/512/1198/1198696.png`;
        return `https://flagcdn.com/w40/${countryCode}.png`;
    },

    // 🛡️ التحديث المعماري: حماية دقة العملات الرقمية وتحديد الفواصل بذكاء
    formatMoney: function(amount, currencyCode = 'USD', decimals = null) {
        const code = String(currencyCode).toUpperCase().trim();
        
        // الاكتشاف الذكي: إذا لم يحدد المبرمج الفواصل، نحددها بناءً على نوع العملة
        let finalDecimals = decimals !== null ? decimals : 2;
        const cryptoCurrencies = new Set(['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL']);
        
        if (decimals === null && cryptoCurrencies.has(code)) {
            // العملات المتقلبة مثل البتكوين تحتاج 6 فواصل، العملات المستقرة تحتاج 4
            finalDecimals = (code === 'BTC' || code === 'ETH') ? 6 : 4; 
        }

        const formattedNum = enNum(amount, finalDecimals);
        const displayCur = RenderHelpers.getCurrencySymbolText(code);
        const isLongText = displayCur.trim().length > 1;
        const symbolClass = isLongText ? 'cur-multi' : 'cur-single';
        const safeCur = escapeHtml(displayCur);
        
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
        return escapeHtml(fullName);
    },

    _getExplicitName: function(u) {
        if (!u) return 'مستخدم غير معروف';
        const f = String(u.firstName || u.first_name || u.name || '').trim();
        const l = String(u.lastName || u.last_name || '').trim();
        const combined = (f + ' ' + l).trim();
        const fullName = u.fullName || combined || u.username || 'مستخدم غير معروف';
        return escapeHtml(fullName);
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
        const safeName = escapeHtml(activeOffer.name);
        return `<span class="promo-badge b-success icon-ms-2 badge-micro" title="مشمول في عرض: ${safeName}"><i class="fa-solid fa-bolt"></i> عرض نشط</span>`;
    },

    // ============================================================================
    // ⏱️ المحرك الزمني المركزي (UX-Safe)
    // ============================================================================

    parseUnifiedTime: function(item) {
        if (!item) return Date.now();
        const t = item.time ?? item.createdAt ?? item.actionTime ?? null;
        return parseSafeTime(t);
    },

    parseTime: parseSafeTime,

    formatSafeDate: function(ts) {
        const timeMs = parseSafeTime(ts);
        const dateObj = new Date(timeMs);
        if (isNaN(dateObj.getTime())) return '---';
        
        const dateStr = dateObj.toLocaleDateString('en-GB'); 
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        return `${dateStr} | ${timeStr}`;
    }

});
