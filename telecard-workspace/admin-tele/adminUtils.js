// ============================================================================
// 🛠️ ملف الأدوات المساعدة (adminUtils.js) - Bank Grade 🏦
// الوظيفة: دوال مشتركة، ناقل الأحداث، حماية XSS صارمة
// ============================================================================

import { RenderHelpers } from './core/renderHelpers.js';

export const Utils = {
    // 1. 🛡️ ترقية لمعايير OWASP العالمية للحماية من الـ XSS (متطابق مع العميل)
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
    
    // 2. تنسيق الأرقام لعرضها في الـ UI (يعيد نص String)
    enNum: function(num, decimals = null) {
        if (num === null || num === undefined || num === '') return '';
        const n = Number(num);
        if (isNaN(n)) return '';
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals !== null ? decimals : 6,
            useGrouping: false
        }).format(n);
    },
    
    // 3. توجيه التنسيق للمحرك المركزي
    formatDate: function(ts) {
        return RenderHelpers.formatSafeDate(ts);
    },
    
    formatMoney: function(amount, code = 'USD', decimals = 2) {
        return RenderHelpers.formatMoney(amount, code, decimals);
    },
    
    // 4. 🌟 توليد ID عشوائي آمن جداً (Cryptographically Secure)
    generateID: function() {
        const array = new Uint8Array(12);
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    },
    
    // 5. أدوات استخراج البيانات الموحدة
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
// 📡 ناقل الأحداث (EventBus) - لفك الارتباط الدائري
// ============================================================================
export const EventBus = {
    events: {},
    
    on(event, listener) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(listener);
    },
    
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(listener => listener(data));
        }
    },
    
    off(event, listenerToRemove) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(l => l !== listenerToRemove);
    }
};