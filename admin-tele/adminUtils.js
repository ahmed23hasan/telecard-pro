// ============================================================================
// 🛠️ ملف الأدوات المساعدة (adminUtils.js) - بنية ES Modules نقية
// الوظيفة: دوال مشتركة ومستقلة تماماً (تنسيق، حماية، تواريخ) لتجنب التكرار
// ============================================================================

export const Utils = {
    // 1. حماية النصوص من هجمات XSS (كانت متكررة في Data و Config)
    escapeHTML: function(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag));
    },

    // 2. تنسيق الأرقام بالإنجليزية (كانت متكررة في UI و Templates)
    enNum: function(num, decimals = null) {
        if (num === null || num === undefined || num === '') return num;
        if (isNaN(num)) return num;
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals !== null ? decimals : 6
        }).format(Number(num));
    },

    // 3. تنسيق التواريخ (كانت موجودة داخل Templates)
    formatDate: function(ts) {
        if (!ts) return '---';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '---';
        return `${d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })} | ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    },

    // 4. تنسيق العملات بشكل موحد
    formatMoney: function(amount, code = 'USD', decimals = 2) {
        const num = Number(amount) || 0;
        // نستخدم دالة enNum من نفس الكائن
        return `${this.enNum(num, decimals)} ${code}`; 
    },

    // 5. [إضافة جديدة ستفيدنا لفايربيز] توليد ID عشوائي للطلبات والمستخدمين
    generateID: function() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    },

    // 6. 🌟 أدوات استخراج البيانات الموحدة (مضافة حديثاً لتقليل التكرار)
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
// 📡 ناقل الأحداث (EventBus) - لفك الارتباط الدائري بين الملفات (Decoupling)
// ============================================================================
export const EventBus = {
    events: {},
    
    // للاستماع لحدث معين
    on(event, listener) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(listener);
    },
    
    // لإطلاق حدث معين مع تمرير بيانات اختيارية
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(listener => listener(data));
        }
    },
    
    // لإزالة مستمع (مفيد لتنظيف الذاكرة إن لزم الأمر)
    off(event, listenerToRemove) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(l => l !== listenerToRemove);
    }
};
