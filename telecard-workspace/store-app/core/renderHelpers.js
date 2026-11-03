// ============================================================================
// 🛠️ مساعدات محرك الرسم العالمي (Store Render Helpers) - Enterprise V19.0.0 💎
// 🎯 الوظيفة: تنسيق احترافي للنصوص والأموال، مخصص لراحة العميل (UX).
// 🚀 التحديثات (V19.0.0 - Canonical Keys & Config Alignment):
// 1. ربط الكاش بـ CACHE_KEYS من config.js بدلاً من المفاتيح النصية اليدوية.
// 2. توحيد معرف القسم القياسي (categoryId / categoryIds) وحقول اسم العميل.
// ============================================================================

import { CACHE_KEYS } from '../config.js';
import { escapeHtml, enNum, parseSafeTime } from '../utils.js';

let _injectedSource = null;

export const RenderHelpers = Object.freeze({

    init: function(source) {
        _injectedSource = source;
    },

    _getDataSource: function() {
        if (_injectedSource) return _injectedSource;
        
        let safeSettings = {};
        let safeRates = [];

        if (typeof localStorage !== 'undefined') {
            try {
                safeSettings = JSON.parse(localStorage.getItem(CACHE_KEYS.SETTINGS_SNAPSHOT) || '{}');
            } catch (e) {
                console.warn("🛡️ [RenderHelpers] تعذر قراءة كاش الإعدادات، سيتم استخدام القيمة الافتراضية.");
            }

            try {
                safeRates = JSON.parse(localStorage.getItem(CACHE_KEYS.RATES_SNAPSHOT) || '[]');
            } catch (e) {
                console.warn("🛡️ [RenderHelpers] تعذر قراءة كاش أسعار الصرف، سيتم استخدام القيمة الافتراضية.");
            }
            
            return { settings: safeSettings, rates: safeRates, offers: [], isStore: true };
        }

        return { settings: {}, rates: [], offers: [], isStore: true };
    },

    _esc: escapeHtml,
    _enNum: enNum,

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
        let finalId = '';
        if (typeof userObj === 'object') {
            finalId = userObj.displayId
                ? String(userObj.displayId).replace(/^USR-/i, '').substring(0, 8).toUpperCase()
                : toShortCode(userObj.uid || userObj.id || '');
        } else {
            finalId = toShortCode(userObj);
        }
        if (!finalId.trim()) finalId = 'UKNWN';
        const formatted = withPrefix ? `USR-${finalId}` : finalId;
        return escapeHtml(formatted);
    },    formatOrderId: function(orderObj, withPrefix = true) {
        if (!orderObj) return '---';
        let rawId = typeof orderObj === 'object' ? String(orderObj.displayId || orderObj.id || '') : String(orderObj);
        const fullId = rawId.trim();
        const cleanBody = fullId.replace(/^(ORD-|TC-)/i, '').trim();
        if (!cleanBody) return '---';
        const shortId = cleanBody.split('-')[0].substring(0, 8).toUpperCase();
        const displayTxt = withPrefix ? `ORD-${shortId}` : shortId;
        return escapeHtml(displayTxt);
    },

    formatDepositId: function(depObj, withPrefix = true) {
        if (!depObj) return '---';
        let rawId = typeof depObj === 'object' ? String(depObj.displayId || depObj.id || '') : String(depObj);
        const fullId = rawId.trim();
        const cleanBody = fullId.replace(/^(DEP-|TC-|ADMBAL-)/i, '').trim();
        if (!cleanBody) return '---';
        const shortId = cleanBody.split('-')[0].substring(0, 8).toUpperCase();
        const displayTxt = withPrefix ? `DEP-${shortId}` : shortId;
        return escapeHtml(displayTxt);
    },    

    getCurrencySymbolText: function(currCode = 'USD') {
        const source = RenderHelpers._getDataSource();
        const { settings, rates } = source;
        const code = String(currCode).toUpperCase();
        
        let displayType = 'symbol'; 
        if (source.isStore && Boolean(settings.syncCurrencyDisplay || settings.syncCurrencyToStore || settings.syncCurrencyStore)) {
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
            'BRL': 'br', 'JPY': 'jp', 'CHF': 'ch', 
            'SEK': 'se' 
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

        const formattedNum = enNum(amount, finalDecimals);
        const displayCur = RenderHelpers.getCurrencySymbolText(code);
        const isLongText = displayCur.trim().length > 1;
        const symbolClass = isLongText ? 'cur-multi' : 'cur-single';
        const safeCur = escapeHtml(displayCur);
        
        return `<span class="money-pro" dir="ltr" style="display: inline-flex; align-items: baseline; gap: 4px; direction: ltr;"><span class="num-en money-val">${formattedNum}</span><span class="cur-symbol ${symbolClass}">${safeCur}</span></span>`;
    },    

    // 📌 [توحيد معماري]: اعتماد حقول UserBuilder القياسية (fullName, firstName, lastName, username)
    _getTxName: function(u) {
        if (!u) return 'مستخدم جديد';
        const f = String(u.firstName || '').trim();
        const l = String(u.lastName || '').trim();
        const combined = `${f} ${l}`.trim();
        const fullName = u.fullName || combined || u.username || 'مستخدم جديد';
        return escapeHtml(fullName);
    },

    _getExplicitName: function(u) {
        if (!u) return 'مستخدم غير معروف';
        const f = String(u.firstName || '').trim();
        const l = String(u.lastName || '').trim();
        const combined = `${f} ${l}`.trim();
        const fullName = u.fullName || combined || u.username || 'مستخدم غير معروف';
        return escapeHtml(fullName);
    },

    _getActiveOfferBadge: function(prodId, prodObj = null) {
        const source = RenderHelpers._getDataSource();
        const now = Date.now();
        if (!source.offers || !Array.isArray(source.offers)) return '';
        
        const product = prodObj || (Array.isArray(source.prods) ? source.prods.find(p => String(p.id) === String(prodId)) : null);
        if (product && (product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true')) {
            return '';
        }
        
        // 📌 [توحيد معماري]: المعرف القياسي للقسم هو categoryId (أو مصفوفة categoryIds)
        const prodCats = product ? [].concat(product.categoryId, product.categoryIds).filter(Boolean).map(String) : [];
        
        const activeOffer = source.offers.find(o => {
            if (!o || o.isActive === false || o.type === 'fake' || o.type === 'badge_only') return false;
            
            const startMs = o.startDate ? parseSafeTime(o.startDate) : 0;
            const expMs = o.expiryDate ? parseSafeTime(o.expiryDate) : 0;
            if (startMs > 0 && now < startMs) return false;
            if (expMs > 0 && now >= expMs) return false;
            
            const hasProds = Array.isArray(o.targetProds) && o.targetProds.length > 0;
            const hasCats = Array.isArray(o.targetCategories) && o.targetCategories.length > 0;
            const isGlobal = (!hasProds && !hasCats);
            
            const isProdMatch = hasProds && o.targetProds.map(String).includes(String(prodId));
            const isCatMatch = hasCats && prodCats.length > 0 && o.targetCategories.map(String).some(cid => prodCats.includes(cid));
            
            return isGlobal || isProdMatch || isCatMatch;
        });

        if (!activeOffer) return '';
        const safeName = escapeHtml(activeOffer.name);
        return `<span class="promo-badge b-success icon-ms-2 badge-micro" title="مشمول في عرض: ${safeName}"><i class="fa-solid fa-bolt"></i> عرض نشط</span>`;
    },

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