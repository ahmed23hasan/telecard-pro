// ============================================================================
// 🛠️ ملف الأدوات المساعدة (adminUtils.js) - Bank Grade 🏦
// الوظيفة: دوال مشتركة ومستقلة، ناقل الأحداث، وتوليد معرفات مشفرة
// ============================================================================

import { RenderHelpers } from './core/renderHelpers.js';

export const Utils = {
    // 1. حماية النصوص من هجمات XSS
    escapeHTML: function(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag));
    },

    // 2. تنسيق الأرقام بالإنجليزية
    enNum: function(num, decimals = null) {
        if (num === null || num === undefined || num === '') return num;
        if (isNaN(num)) return num;
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals !== null ? decimals : 6,
            useGrouping: false
        }).format(Number(num));
    },

    // 3. توجيه التنسيق للمحرك المركزي (لتوحيد الشكل في كل النظام)
    formatDate: function(ts) {
        return RenderHelpers.formatSafeDate(ts);
    },

    formatMoney: function(amount, code = 'USD', decimals = 2) {
        // نستخدم المنسق المالي الأنيق الموحد
        return RenderHelpers.formatMoney(amount, code, decimals); 
    },

    // 4. 🌟 ترقية أمنية: توليد ID عشوائي آمن جداً (Cryptographically Secure)
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