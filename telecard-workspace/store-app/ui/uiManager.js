// ============================================================================
// 🎨 الموزع المركزي للواجهات (uiManager.js) - النسخة الماسية المطلقة V15.1 💎
// 🎯 الوظيفة: تجميع وحدات الواجهة المنفصلة وتصديرها ككائن واحد للنظام
// 🚀 التحديثات:
// 1. Prototype Shield: منع ثغرة تسمم النماذج (Prototype Pollution).
// 2. Collision Detector: كشف التحذيرات إذا قامت وحدة بمسح دوال وحدة أخرى.
// 3. Destructuring-Safe: حماية دوال اللودر من فقدان الـ this.
// ============================================================================

import { UICore } from './uiCore.js';
import { UIFinance } from './uiFinance.js';
import { UIAuth } from './uiAuth.js';
// 🧹 تم إزالة استيراد Utils الزائد لتنظيف الكود

let _loaderActiveRequests = 0;

const verifyModule = (name, mod) => {
    if (!mod || Object.keys(mod).length === 0) {
        console.error(`🚨 فشل استيراد الوحدة: [${name}] غير موجودة أو فارغة!`);
        return false;
    }
    
    if (typeof window !== 'undefined') {
        if (!window.ModuleWatchdog) {
            Object.defineProperty(window, 'ModuleWatchdog', {
                value: Object.freeze({ loadedModules: new Set() }),
                writable: false,
                configurable: false
            });
        }
        window.ModuleWatchdog.loadedModules.add(name);
    }
    return true;
};

verifyModule('UICore', UICore);
verifyModule('UIFinance', UIFinance);
verifyModule('UIAuth', UIAuth);

// 🛡️ [إصلاح ماسي 1 و 2]: دمج آمن مع كاشف للتصادم ومانع للاختراق
const deepMergeModules = (targetObject, ...modules) => {
    const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    
    for (const mod of modules) {
        if (!mod) continue;
        const descriptors = Object.getOwnPropertyDescriptors(mod);
        
        for (const [key, descriptor] of Object.entries(descriptors)) {
            // 🛡️ درع الحماية ضد Prototype Pollution
            if (FORBIDDEN_KEYS.has(key)) continue;
            
            // 🚨 كاشف التصادم المعماري (Architectural Collision Detector)
            if (key in targetObject) {
                console.warn(`⚠️ [UI Architecture Warning]: تم اكتشاف تصادم! الدالة/الخاصية [${key}] تم الكتابة فوقها.`);
            }
            
            Object.defineProperty(targetObject, key, descriptor);
        }
    }
    return targetObject;
};

export const UIManager = deepMergeModules(
    {}, 
    UICore, 
    UIFinance, 
    UIAuth
);

Object.defineProperties(UIManager, {
    toggleLoader: {
        value: function(show, text = 'جاري المعالجة...', force = false) {
            if (show) {
                _loaderActiveRequests++;
            } else {
                if (force) {
                    _loaderActiveRequests = 0; 
                } else {
                    _loaderActiveRequests = Math.max(0, _loaderActiveRequests - 1);
                }
            }
            
            let loader = document.getElementById('global-dynamic-loader');
            
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'global-dynamic-loader';
                // تم إضافة aria-live لمعايير إمكانية الوصول (Enterprise Accessibility)
                loader.setAttribute('aria-live', 'assertive');
                loader.innerHTML = `
                    <i class="fa-solid fa-circle-notch fa-spin loader-spinner"></i>
                    <div id="dynamic-loader-text" class="loader-text"></div>
                `;
                document.body.appendChild(loader);
            }
            
            const textEl = document.getElementById('dynamic-loader-text');
            
            requestAnimationFrame(() => {
                if (_loaderActiveRequests > 0) {
                    if (textEl && textEl.textContent !== text) {
                        textEl.textContent = text;
                    }
                    loader.classList.add('is-active');
                } else {
                    loader.classList.remove('is-active');
                }
            });
        },
        writable: false,
        configurable: false
    },
    
    forceHideLoader: {
        value: function() {
            // 🛡️ [إصلاح ماسي 3]: استدعاء صريح لمنع انهيار الـ Destructuring
            UIManager.toggleLoader(false, '', true); 
        },
        writable: false,
        configurable: false
    }
});

// 🔒 التجميد يتم في الملف الرئيسي (app.js / main.js) حفاظاً على دورة حياة التهيئة
