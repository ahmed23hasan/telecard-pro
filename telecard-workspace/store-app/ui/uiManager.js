// ============================================================================
// 🎨 الموزع المركزي للواجهات (uiManager.js) - Hub/Aggregator
// 🎯 الوظيفة: تجميع وحدات الواجهة المنفصلة وتصديرها ككائن واحد للنظام
// 🚀 التحديث: تحسين أداء اللودر وحماية نطاق المتصفح (Global Scope)
// ============================================================================

import { UICore } from './uiCore.js';
import { UIFinance } from './uiFinance.js';
import { UIAuth } from './uiAuth.js';

// 🔍 الفاحص الذكي للتأكد من سلامة الاستيراد قبل التجميع
// وظيفته كشف أي ملف فشل في التحميل بسبب مسار خاطئ أو خطأ برمجي داخلي
const verifyModule = (name, mod) => {
    if (!mod || Object.keys(mod).length === 0) {
        console.error(`🚨 فشل استيراد الوحدة: [${name}] غير موجودة أو فارغة!`);
        return false;
    }
    
    // تسجيل النجاح في نظام المراقبة الخارجي بشكل آمن
    if (typeof window !== 'undefined') {
        window.ModuleWatchdog = window.ModuleWatchdog || { loadedModules: [] };
        if (!window.ModuleWatchdog.loadedModules.includes(name)) {
            window.ModuleWatchdog.loadedModules.push(name);
        }
    }
    return true;
};

// تشغيل الفحص على الوحدات الأساسية
verifyModule('UICore', UICore);
verifyModule('UIFinance', UIFinance);
verifyModule('UIAuth', UIAuth);

export const UIManager = {
    // 🛠️ دمج كافة الدوال من الوحدات الفرعية في كائن واحد (Facade Pattern)
    ...UICore,
    ...UIFinance,
    ...UIAuth,    
    
    // 🌟 دالة اللودر المركزية (تم تنظيفها بالكامل لتعمل مع الستايل الجديد)
    toggleLoader: function(show, text = 'جاري المعالجة...') {
        let loader = document.getElementById('global-dynamic-loader');
        
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'global-dynamic-loader';
            loader.innerHTML = `
                <i class="fa-solid fa-circle-notch fa-spin loader-spinner"></i>
                <div id="dynamic-loader-text" class="loader-text"></div>
            `;
            document.body.appendChild(loader);
        }
        
        const textEl = document.getElementById('dynamic-loader-text');
        if (textEl && textEl.innerText !== text) {
            textEl.innerText = text;
        }
        
        // استخدام is-active المتوافقة مع ملف CSS الجديد لضمان سلاسة الأنيميشن
        requestAnimationFrame(() => {
            if (show) {
                loader.classList.add('is-active');
            } else {
                loader.classList.remove('is-active');
            }
        });
    }
};
