// ============================================================================
// 🚀 نقطة الإقلاع المركزية (admin.js) - The Cloud Master Entry Point
// 🎯 الوظيفة: الربط النهائي، حقن التبعيات، إدارة دورة حياة التطبيق ومراقبة الاتصال
// 🌟 التحديثات: 
// 1. 🛡️ [Multi-Tab UX Fix]: استخدام localStorage لتمكين عمل المدير على عدة نوافذ.
// 2. ⏱️ [Bank-Grade Idle Timeout]: محرك رصد الخمول الصارم (يطرد المدير بعد 10 دقائق).
// 3. 🔔 [Radar Bypass]: الاستماع الفوري لإشعارات الـ FCM لكسر قفل الشارات وتحديثها.
// 4. 🧹 [Clean Code]: إزالة الستايلات المدمجة والاعتماد الكلي على ملفات الـ CSS.
// ============================================================================

import { auth } from './core/firebaseAdapter.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

import { AdminData } from './adminData.js';
import { AppController } from './core/appController.js';
import { RenderHelpers } from './core/renderHelpers.js';
import { AdminUI, AdminCalendar } from './adminUI.js';

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
        // 🚀 [إصلاح حرج 2]: تعديل النطاق ليقبل الحقول النصية (Text Inputs) و (Textarea) استجابة لميزة البحث المباشر
        const target = e.target.closest('[data-onchange], select[data-action], input[data-action]:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea[data-action]');
        if (!target) return;
        EventBus.emit('action-triggered', { action: target.dataset.onchange || target.dataset.action, ...target.dataset, element: target, originalEvent: e, val: target.value });
    });
};

/**
 * ⏱️ 2. محرك رصد الخمول البنكي (Cross-Tab Idle Tracker)
 */
const initIdleTimeout = () => {
    // 🚀 [تحديث أمني]: 10 دقائق من الخمول لإنهاء الجلسة
    const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
    let lastUpdate = 0;
    
    const updateActivity = () => {
        const now = Date.now();
        if (now - lastUpdate > 60000) {
            localStorage.setItem('telecard_admin_last_activity', now);
            lastUpdate = now;
        }
    };
    
    localStorage.setItem('telecard_admin_last_activity', Date.now());
    
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, updateActivity, { passive: true });
    });
    
    const checkIdleNow = () => {
        const lastActivity = parseInt(localStorage.getItem('telecard_admin_last_activity') || '0', 10);
        if (lastActivity > 0 && (Date.now() - lastActivity > IDLE_TIMEOUT_MS)) {
            console.warn("⏳ انتهت جلسة الإدارة بسبب الخمول لأكثر من 10 دقائق. جاري تسجيل الخروج لحماية النظام...");
            localStorage.removeItem('telecard_admin_auth');
            localStorage.removeItem('telecard_admin_last_activity');
            EventBus.emit('req-logout');
        }
    };

    setInterval(checkIdleNow, 60000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkIdleNow();
    });
    window.addEventListener('focus', checkIdleNow);
};

/**
 * 🛡️ 3. الحمايات العالمية ومراقب السحابة (Cloud Protections & Watchdog)
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
    
    // 🚀 [الإصلاح المعماري 5]: كاسر قفل الشارات اللحظي (Radar Bypass)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            console.log("🔔 [Radar] وصل إشعار حقيقي للمتصفح، جاري كسر قفل الشارات وتحديثها...");
            if (window.AdminRender && typeof window.AdminRender.updateBadges === 'function') {
                // نمرر true لكسر حاجز الـ 3 دقائق وتحديث الأرقام في القائمة الجانبية فوراً
                window.AdminRender.updateBadges(true);
            }
        });
    }
    
    initIdleTimeout();
};

/**
 * 🏁 4. المحرك الرئيسي للإقلاع (Cloud Bootstrapper)
 */
const startApp = async () => {
    try {
        console.log("🟢 1. بدأ تشغيل سكربت الإقلاع (startApp)...");
        
        // =================================================================
        // 🛡️ [تفتيش أمني استباقي]: معالجة فخ إغلاق المتصفح (Offline Idle Trap)
        // =================================================================
        const lastActivity = parseInt(localStorage.getItem('telecard_admin_last_activity') || '0');
        
        // 🚀 [تحديث أمني]: 10 دقائق من الخمول تمنع فتح المتصفح مجدداً
        const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
        
        if (lastActivity > 0 && (Date.now() - lastActivity > IDLE_TIMEOUT_MS)) {
            console.warn("🚨 تنبيه أمني: تم اكتشاف غياب لأكثر من 10 دقائق. جاري تدمير الجلسة...");
            localStorage.removeItem('telecard_admin_auth');
            localStorage.removeItem('telecard_admin_last_activity');
            if (auth) await auth.signOut(); // تدمير التوكن فوراً قبل الإقلاع
            window.location.replace('login.html');
            return; // 🛑 إيقاف الإقلاع تماماً
        }
        // =================================================================
        
        // 🛡️ زر الإيقاف القسري الحقيقي: يعمل فقط إذا لم يكتمل الإقلاع وبقي اللودر نشطاً بعد 15 ثانية
        setTimeout(() => {
            const loader = document.getElementById('loader') || document.getElementById('loading-screen');
            if (!AppController.isInitialized && loader && loader.classList.contains('active')) {
                console.error("🚨 طوارئ: تم إيقاف اللودر قسرياً بعد 15 ثانية من التعليق.");
                if (typeof AdminUI !== 'undefined' && AdminUI.toggleLoader) {
                    AdminUI.toggleLoader(false);
                } else {
                    loader.classList.remove('active');
                    loader.classList.add('hide-element'); // 🚀 [تنظيف الستايلات]: الاعتماد على الكلاس بدلاً من style.display
                }
                if (typeof AdminUI !== 'undefined' && AdminUI.showToast) {
                    AdminUI.showToast('تأخر استجابة السيرفر، يرجى تحديث الصفحة أو فحص الاتصال.', 'error', 8000);
                }
            }
        }, 15000);        
        
        window.AdminCalendar = AdminCalendar;
        
        window.AdminApp = AppController;
window.AppController = AppController;
window.AdminData = AdminData;
window.AdminUI = AdminUI;

console.log("🟢 2. تم حقن الكائنات العالمية (Global Objects).");

RenderHelpers.init({
    get settings() { return AdminData.data?.settings || {}; },
    get rates() { return AdminData.data?.rates || []; },
    get offers() { return AdminData.data?.offers || []; },
    get prods() { return AdminData.data?.prods || []; },
    isStore: false
});        initGlobalProtections();
        bindDelegatedEvents();
        
        console.log("🟢 3. جاري الاتصال بـ Firebase Auth للتحقق من الجلسة...");
        
        onAuthStateChanged(auth, async (user) => {
            console.log("🟢 4. استجابة Firebase Auth وصلت! المستخدم موجود؟", !!user);
            
            if (user) {
                console.log("🟢 5. تم تأكيد الهوية. مزامنة الجلسة المحلية الفورية...");
                
                localStorage.setItem('telecard_admin_auth', 'true');
                
                if (AppController && typeof AppController.init === 'function') {
                    await AppController.init();
                    console.log("🟢 6. اكتمل AppController.init بنجاح!");
                } else {
                    console.error("❌ خطأ: AppController غير موجود أو لا يحتوي على دالة init!");
                }
                
            } else {
                const isLikelyLoggedIn = localStorage.getItem('telecard_admin_auth') === 'true';
                
                if (isLikelyLoggedIn) {
                    console.warn("⏳ الفايربيز يبلغ أن الحساب غير موجود، ولكن الذاكرة تقول عكس ذلك. ننتظر 1.5 ثانية...");
                    setTimeout(() => {
                        if (!auth.currentUser) {
                            console.warn("🚨 تأكدنا من عدم وجود جلسة، جاري التوجيه للدخول.");
                            localStorage.removeItem('telecard_admin_auth');
                            window.location.replace("login.html");
                        } else {
                            console.log("✅ الفايربيز صحح نفسه والتقط الجلسة المتأخرة!");
                        }
                    }, 1500);
                } else {
                    console.warn("🚨 لا توجد جلسة اتصال نشطة إطلاقاً، جاري التوجيه الفوري.");
                    localStorage.removeItem('telecard_admin_auth');
                    window.location.replace("login.html");
                }
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
            setTimeout(() => loader.classList.add('hide-element'), 300); // الاعتماد على الكلاس
        }
        
        const alertMsg = "فشل الإقلاع: " + actualErrorMsg;
        if (typeof AdminUI !== 'undefined' && AdminUI.showToast) {
            AdminUI.showToast(alertMsg, 'error', 6000);
        } else {
            alert(alertMsg);
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}
