// ============================================================================
// 🚀 نقطة الإقلاع المركزية (admin.js) - The Cloud Master Entry Point
// 🎯 الوظيفة: الربط النهائي، حقن التبعيات، إدارة دورة حياة التطبيق ومراقبة الاتصال
// ============================================================================

import { AdminData } from './adminData.js';
import { AppController } from './core/appController.js';
import { RenderHelpers } from './core/renderHelpers.js';
import { AdminUI, AdminCalendar } from './adminUI.js';
import { BackupSystem } from './core/backupService.js';
import { EventBus } from './adminUtils.js';

/**
 * 🛠️ 1. نظام تفويض الأحداث الموحد (Global Event Delegation)
 * يسمح للنظام بالاستماع لكل العناصر التي تحمل وسم [data-action] 
 * دون الحاجة لتعريف مستمعات أحداث مكررة.
 */
const bindDelegatedEvents = () => {
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        // 🌟 منع القوائم المنسدلة والحقول النصية من إرسال أوامر بمجرد النقر عليها
        if (target.tagName === 'SELECT' || (target.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(target.type))) {
            return; 
        }
        
        const action = target.dataset.action;
        const data = { ...target.dataset, element: target, originalEvent: e };
        
        // منع السلوك الافتراضي للروابط
        if (target.tagName === 'A' || target.tagName === 'BUTTON') e.preventDefault();
        
        // إرسال الحدث للموجه المركزي
        EventBus.emit('action-triggered', { action, ...data });
    });
    
    // الاستماع لتغييرات المدخلات (مثل فلاتر البحث)
    document.addEventListener('input', (e) => {
        const target = e.target.closest('[data-oninput]');
        if (!target) return;
        
        const action = target.dataset.oninput;
        EventBus.emit('action-triggered', { action, val: target.value, element: target });
    });
    
    // الاستماع لتغيير القوائم المنسدلة ومدخلات الملفات
    document.addEventListener('change', (e) => {
        const target = e.target.closest('[data-onchange], select[data-action], input[type="file"][data-action]');
        if (!target) return;
        
        const action = target.dataset.onchange || target.dataset.action;
        const data = { ...target.dataset, element: target, originalEvent: e, val: target.value };
        
        EventBus.emit('action-triggered', { action, ...data });
    });
};

/**
 * 🛡️ 2. الحمايات العالمية ومراقب السحابة (Cloud Protections & Watchdog)
 */
const initGlobalProtections = () => {
    // منع سحب الصور للحفاظ على شكل الواجهة
    document.addEventListener('dragstart', (e) => {
        if (e.target.tagName === 'IMG') e.preventDefault();
    });
    
    // حماية الخروج أثناء وجود عمليات حفظ معلقة
    window.onbeforeunload = () => {
        if (document.body.classList.contains('is-saving')) return "هناك تعديلات سحابية لم تُحفظ بعد، هل تريد الخروج؟";
    };

    // 📡 مراقب حالة الاتصال بالإنترنت (Network Watchdog) - ضروري لـ Firebase
    window.addEventListener('offline', () => {
        console.warn("⚠️ انقطع الاتصال بالإنترنت!");
        if (typeof AdminUI !== 'undefined' && AdminUI.showToast) {
            AdminUI.showToast('انقطع الاتصال بالإنترنت! يرجى عدم إجراء تعديلات حتى تعود الشبكة.', 'error', 5000);
        }
    });

    window.addEventListener('online', () => {
        console.log("✅ عاد الاتصال بالإنترنت.");
        if (typeof AdminUI !== 'undefined' && AdminUI.showToast) {
            AdminUI.showToast('عاد الاتصال بالإنترنت، المزامنة السحابية تعمل الآن.', 'success', 3000);
        }
    });
};

/**
 * 🎨 3. حقن التنسيقات الإصلاحية (Layout Fixes)
 */
const injectAntiStickyCSS = () => {
    const style = document.createElement('style');
    style.textContent = `
        .click-shrink, .nav-item { -webkit-tap-highlight-color: transparent; }
        #loader.active { display: flex !important; z-index: 99999; }
    `;
    document.head.appendChild(style);
};

/**
 * 🏁 4. المحرك الرئيسي للإقلاع (Cloud Bootstrapper)
 */
const startApp = async () => {
    try {
        console.log("⏳ جاري تهيئة النظام وربط المكونات السحابية...");

        // 🌟 أ. كشف الكائنات للنطاق العالمي (Global Context)
        window.AdminCalendar = AdminCalendar;
        window.BackupSystem = BackupSystem;
        window.AdminApp = AppController;
        window.AdminData = AdminData;
        window.AdminUI = AdminUI;
        
        // 🌟 ب. حقن محرك الرسم بالبيانات (Dependency Injection)
        RenderHelpers.init({
            get settings() { return AdminData.data?.settings || {}; },
            get rates() { return AdminData.data?.rates || []; },
            get offers() { return AdminData.data?.offers || []; },
            isStore: false
        });
        
        // 🌟 ج. تهيئة البنية التحتية للواجهة
        injectAntiStickyCSS();
        initGlobalProtections();
        bindDelegatedEvents();
        
        // 🌟 د. تشغيل الموجه المركزي (الذي سيقوم بدوره بجلب البيانات من Firebase)
        if (AppController && typeof AppController.init === 'function') {
            await AppController.init();
        }
        
        console.log("%c🚀 Telecard Admin: Cloud System Bootstrapped Successfully", "color: #10b981; font-weight: bold;");
        
    } catch (error) {
        console.error("🚨 خطأ حرج في إقلاع النظام السحابي:", error);
        
        // محاولة إنقاذ الواجهة: إخفاء شاشة التحميل
        if (typeof AdminUI !== 'undefined' && AdminUI.toggleLoader) {
            AdminUI.toggleLoader(false);
        }
        
        const loader = document.getElementById('loader') || document.getElementById('loading-screen');
        if (loader) {
            loader.classList.remove('active');
            setTimeout(() => loader.style.display = 'none', 300);
        }
        
        // تنبيه الإدمن بوجود مشكلة تقنية في الاتصال بقاعدة البيانات
        const alertMsg = "عذراً، فشل النظام في الاتصال بقاعدة البيانات السحابية. تأكد من اتصالك بالإنترنت ثم قم بتحديث الصفحة.";
        if (typeof AdminUI !== 'undefined' && AdminUI.showToast) {
            AdminUI.showToast(alertMsg, 'error', 6000);
        } else {
            alert(alertMsg);
        }
    }
};

/**
 * 🚀 تنفيذ الإقلاع بناءً على حالة المستند
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}
