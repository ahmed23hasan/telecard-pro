// ============================================================================
// 🎨 الموزع المركزي للواجهات (uiManager.js) - النسخة الماسية المطلقة
// 🎯 الوظيفة: تجميع وحدات الواجهة المنفصلة وتصديرها ككائن واحد للنظام
// 🚀 التحديث الأقصى: دمج الخصائص العميقة (Descriptors)، وحماية الـ Watchdog، وتحسين الـ FPS
// ============================================================================

import { UICore } from './uiCore.js';
import { UIFinance } from './uiFinance.js';
import { UIAuth } from './uiAuth.js';
import { Utils } from '../utils.js'; 

let _loaderActiveRequests = 0;

const verifyModule = (name, mod) => {
    if (!mod || Object.keys(mod).length === 0) {
        console.error(`🚨 فشل استيراد الوحدة: [${name}] غير موجودة أو فارغة!`);
        return false;
    }
    
    if (typeof window !== 'undefined') {
        // 🛡️ [إصلاح أمني]: منع تسمم الكائنات (Prototype Pollution) باستخدام defineProperty
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

const deepMergeModules = (targetObject, ...modules) => {
    for (const mod of modules) {
        if (!mod) continue;
        const descriptors = Object.getOwnPropertyDescriptors(mod);
        for (const [key, descriptor] of Object.entries(descriptors)) {
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
        // 🛡️ إضافة معامل `force` لمنع حالة القفل الأبدي (Deadlock)
        value: function(show, text = 'جاري المعالجة...', force = false) {
            if (show) {
                _loaderActiveRequests++;
            } else {
                if (force) {
                    _loaderActiveRequests = 0; // صمام الأمان الإجباري
                } else {
                    _loaderActiveRequests = Math.max(0, _loaderActiveRequests - 1);
                }
            }
            
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
            
            // 🚀 [أداء فائق]: حصر التعديلات داخل إطار الرسوميات
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
            this.toggleLoader(false, '', true); // استخدام وضع Force
        },
        writable: false,
        configurable: false
    }
});
