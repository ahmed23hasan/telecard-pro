// ============================================================================
// 🛠️ ملف الأدوات المساعدة للإدارة (adminUtils.js) - Bank Grade 🏦 V14.9
// 🎯 الوظيفة: دوال مشتركة، ناقل الأحداث، حماية XSS، وتأمين الروابط والأرقام.
// 🚀 التحديثات المعمارية (V14.9):
// 1. Circular Dependency Fix: إزالة استيراد RenderHelpers لمنع الشاشة البيضاء.
// 2. UI Clarity: تفعيل فواصل الآلاف (useGrouping) في الأرقام لسهولة القراءة.
// 3. Crypto Fallback: حماية توليد المعرفات من الانهيار في المتصفحات غير المدعومة.
// ============================================================================

// ❌ تم إزالة import { RenderHelpers } لمنع تضارب الاستيراد الدائري (Circular Dependency)

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
            useGrouping: true // 🛡️ تم التفعيل لمنع "العمى البصري" للأرقام الضخمة في لوحة الإدارة
        }).format(n);
    },
    
    // 💡 ملاحظة هندسية: تنسيق المال والتواريخ تم حذفه من هنا (يجب استدعاء RenderHelpers في ملفات الرسم مباشرة)
    
    generateID: function() {
        // 🛡️ Crypto Fallback: الحماية من انهيار المتصفحات القديمة أو اتصالات HTTP
        if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
            try {
                const array = new Uint8Array(12);
                window.crypto.getRandomValues(array);
                return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
            } catch (e) {}
        }
        // Fallback بديل وسريع في حال فشل الكريبتو
        return Date.now().toString(16) + Math.random().toString(16).substring(2, 14);
    },
    
    getVal: function(id, defaultValue = '') {
        if (typeof document === 'undefined') return defaultValue;
        const el = document.getElementById(id);
        return el ? el.value.trim() : defaultValue;
    },
    
    getCheck: function(id) {
        if (typeof document === 'undefined') return false;
        const el = document.getElementById(id);
        return el ? el.checked : false;
    }
};

// ============================================================================
// 📡 ناقل الأحداث المركزي (EventBus) - Enterprise Pub/Sub 💎
// ============================================================================
export const EventBus = {
    events: {},
    
    // تسجيل مستمع جديد (بدون تكرار بفضل الـ Set)
    on(event, listener) {
        if (!this.events[event]) this.events[event] = new Set();
        this.events[event].add(listener);
    },
    
    // إطلاق الحدث لجميع المستمعين
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(listener => {
                try { listener(data); } 
                catch (e) { console.error(`🚨 EventBus Error [${event}]:`, e); }
            });
        }
    },
    
    // مسح مستمع محدد أو مسح كل مستمعي الحدث
    off(event, listenerToRemove) {
        if (!this.events[event]) return;
        
        if (listenerToRemove) {
            this.events[event].delete(listenerToRemove);
            // تنظيف المفتاح إذا أصبح فارغاً لتخفيف الذاكرة
            if (this.events[event].size === 0) delete this.events[event];
        } else {
            this.clear(event);
        }
    },
    
    // تدمير حدث بالكامل
    clear(event) {
        if (this.events[event]) {
            this.events[event].clear(); 
            delete this.events[event];
        }
    },

    // ☢️ زر الدمار الشامل (يُستدعى عند الـ Logout) لتفريغ المتصفح بالكامل
    clearAll() {
        for (const event in this.events) {
            this.events[event].clear();
        }
        this.events = {};
        console.debug("🧹 [EventBus] تم تفريغ كافة نواقل الأحداث بنجاح.");
    }
};
