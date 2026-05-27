// ============================================================================
// 🚀 نقطة الإقلاع المركزية (admin.js) - The Cloud Master Entry Point
// 🎯 الوظيفة: الربط النهائي، حقن التبعيات، إدارة دورة حياة التطبيق ومراقبة الاتصال
// 🌟 التحديث: تفعيل الرادار المتقدم (Boot Tracer) + زر الإغلاق القسري للودر
// ============================================================================

import { auth } from './core/firebaseAdapter.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

import { AdminData } from './adminData.js';
import { AppController } from './core/appController.js';
import { RenderHelpers } from './core/renderHelpers.js';
import { AdminUI, AdminCalendar } from './adminUI.js';
import { BackupSystem } from './core/backupService.js';
import { EventBus } from './adminUtils.js';

/**
 * 🛠️ 1. نظام تفويض الأحداث الموحد (Global Event Delegation)
 */
const bindDelegatedEvents = () => {
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        if (target.tagName === 'SELECT' || (target.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(target.type))) {
            return;
        }
        
        const action = target.dataset.action;
        const data = { ...target.dataset, element: target, originalEvent: e };
        
        if (target.tagName === 'A' || target.tagName === 'BUTTON') e.preventDefault();
        EventBus.emit('action-triggered', { action, ...data });
    });
    
    document.addEventListener('input', (e) => {
        const target = e.target.closest('[data-oninput]');
        if (!target) return;
        EventBus.emit('action-triggered', { action: target.dataset.oninput, val: target.value, element: target });
    });
    
    document.addEventListener('change', (e) => {
        const target = e.target.closest('[data-onchange], select[data-action], input[type="file"][data-action]');
        if (!target) return;
        EventBus.emit('action-triggered', { action: target.dataset.onchange || target.dataset.action, ...target.dataset, element: target, originalEvent: e, val: target.value });
    });
};

/**
 * 🛡️ 2. الحمايات العالمية ومراقب السحابة (Cloud Protections & Watchdog)
 */
const initGlobalProtections = () => {
    document.addEventListener('dragstart', (e) => {
        if (e.target.tagName === 'IMG') e.preventDefault();
    });
    
    window.onbeforeunload = () => {
        if (document.body.classList.contains('is-saving')) return "هناك تعديلات سحابية لم تُحفظ بعد، هل تريد الخروج؟";
    };
    
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
        console.log("🟢 1. بدأ تشغيل سكربت الإقلاع (startApp)...");
        
        // 🛡️ زر الإيقاف القسري (Failsafe Kill Switch)
        setTimeout(() => {
            const loader = document.getElementById('loader') || document.getElementById('loading-screen');
            if (loader && (loader.classList.contains('active') || loader.style.display !== 'none')) {
                console.error("🚨 طوارئ: تم إيقاف اللودر قسرياً بعد 12 ثانية من التعليق.");
                loader.classList.remove('active');
                loader.style.display = 'none';
                if (typeof AdminUI !== 'undefined' && AdminUI.showToast) {
                    AdminUI.showToast('تأخر استجابة السيرفر، يرجى تحديث الصفحة أو فحص الكونسول.', 'error', 8000);
                }
            }
        }, 12000);
        
        window.AdminCalendar = AdminCalendar;
        window.BackupSystem = BackupSystem;
        window.AdminApp = AppController;
        window.AdminData = AdminData;
        window.AdminUI = AdminUI;
        
        console.log("🟢 2. تم حقن الكائنات العالمية (Global Objects).");
        
        RenderHelpers.init({
            get settings() { return AdminData.data?.settings || {}; },
            get rates() { return AdminData.data?.rates || []; },
            get offers() { return AdminData.data?.offers || []; },
            isStore: false
        });
        
        injectAntiStickyCSS();
        initGlobalProtections();
        bindDelegatedEvents();
        
        console.log("🟢 3. جاري الاتصال بـ Firebase Auth للتحقق من الجلسة...");
        
        onAuthStateChanged(auth, async (user) => {
            console.log("🟢 4. استجابة Firebase Auth وصلت! المستخدم موجود؟", !!user);
            
            if (user) {
                console.log("🟢 5. تم تأكيد الهوية. بدء جلب البيانات (AppController.init)...");
                
                if (AppController && typeof AppController.init === 'function') {
                    await AppController.init();
                    console.log("🟢 6. اكتمل AppController.init بنجاح!");
                } else {
                    console.error("❌ خطأ: AppController غير موجود أو لا يحتوي على دالة init!");
                }
                
            } else {
                console.warn("🚨 لم يتم العثور على جلسة اتصال نشطة للمدير، جاري التوجيه الفوري لمنع التسريب المحاسبي.");
                window.location.replace("login.html");
            }
        });
        
    } catch (error) {
        const actualErrorMsg = error.message || error.toString();
        console.error("🚨 خطأ حرج في إقلاع النظام السحابي:", actualErrorMsg);
        
        if (typeof AdminUI !== 'undefined' && AdminUI.toggleLoader) {
            AdminUI.toggleLoader(false);
        }
        
        const loader = document.getElementById('loader') || document.getElementById('loading-screen');
        if (loader) {
            loader.classList.remove('active');
            setTimeout(() => loader.style.display = 'none', 300);
        }
        
        const alertMsg = "فشل الإقلاع: " + actualErrorMsg;
        if (typeof AdminUI !== 'undefined' && AdminUI.showToast) {
            AdminUI.showToast(alertMsg, 'error', 6000);
        } else {
            alert(alertMsg);
        }
        
        const errorScreen = document.getElementById('system-fatal-error');
        if (errorScreen) {
            errorScreen.style.display = 'flex';
            const errDesc = errorScreen.querySelector('p');
            if (errDesc) {
                errDesc.innerHTML = `السبب: <br><b dir="ltr" style="color: #fca5a5; background: #1e293b; padding: 5px; border-radius: 4px; display: inline-block; margin-top: 8px;">${actualErrorMsg}</b>`;
            }
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