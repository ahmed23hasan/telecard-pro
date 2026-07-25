// ============================================================================
// 🛠️ ملف الأدوات المساعدة للإدارة (adminUtils.js) - Bank Grade 🏦 V14.7
// الوظيفة: دوال مشتركة، ناقل الأحداث، حماية XSS، وتأمين الروابط والأرقام
// 🚀 التحديث: ترقية EventBus لاستخدام (Set) لمنع تسرب الذاكرة وتكرار الأحداث.
// ============================================================================

import { RenderHelpers } from './core/renderHelpers.js';

export const Utils = {
    escapeHTML: function(val) {
        if (val === undefined || val === null) return '';
        return String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '&#x60;')
            .replace(/=/g, '&#x3D;')
            .replace(/\//g, '&#x2F;');
    },
    
    safeUrl: function(url, fallback = '#') {
        if (!url) return fallback;
        let cleaned = String(url).replace(/[\x00-\x1F\x7F\s]/g, '').trim();
        if (/^(javascript|vbscript|data):/i.test(cleaned)) return fallback;
        
        try {
            const parsedUrl = new URL(cleaned, window.location.origin);
            const protocol = parsedUrl.protocol.toLowerCase();
            if (['http:', 'https:', 'mailto:', 'tel:'].includes(protocol)) return this.escapeHTML(cleaned);
            return fallback;
        } catch (e) {
            if (cleaned.startsWith('//')) return fallback;
            if (cleaned.startsWith('/') || cleaned.startsWith('./') || cleaned.startsWith('../') || cleaned.startsWith('#') || cleaned.startsWith('?')) return this.escapeHTML(cleaned);
            return fallback;
        }
    },
    
    enNum: function(num, decimals = null) {
        if (num === null || num === undefined || num === '') return '';
        const n = Number(num);
        if (isNaN(n)) return '';
        
        const targetDecimals = decimals !== null ? decimals : 6;
        const safeDecimals = Math.min(20, Math.max(0, Number(targetDecimals) || 0));
        
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: safeDecimals,
            useGrouping: false
        }).format(n);
    },
    
    formatDate: function(ts) { return RenderHelpers.formatSafeDate(ts); },
    formatMoney: function(amount, code = 'USD', decimals = 2) { return RenderHelpers.formatMoney(amount, code, decimals); },
    
    generateID: function() {
        const array = new Uint8Array(12);
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    },
    
    getVal: function(id, defaultValue = '') {
        const el = document.getElementById(id);
        return el ? el.value.trim() : defaultValue;
    },
    
    getCheck: function(id) {
        const el = document.getElementById(id);
        return el ? el.checked : false;
    }
};

// ============================================================================
// 📡 ناقل الأحداث (EventBus) - Memory Leak Proof
// ============================================================================
export const EventBus = {
    events: {},
    
    on(event, listener) {
        // 🛡️ استخدام Set يضمن عدم تسجيل نفس الدالة مرتين أبداً
        if (!this.events[event]) this.events[event] = new Set();
        this.events[event].add(listener);
    },
    
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(listener => {
                try { listener(data); } catch (e) { console.error(`EventBus Error [${event}]:`, e); }
            });
        }
    },
    
    off(event, listenerToRemove) {
        if (!this.events[event]) return;
        this.events[event].delete(listenerToRemove);
    }
};