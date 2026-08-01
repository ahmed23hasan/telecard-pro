// ============================================================================
// 🎨 الموزع المركزي للواجهات (uiManager.js) - النسخة الماسية V16.1 🛡️
// 🎯 الوظيفة: تجميع وحدات الواجهة المنفصلة وتصديرها ككائن واحد للنظام
// 🚀 التحديثات المعمارية (V16.1):
// 1. Global Sync: ربط الكائن بـ globalThis لضمان عمل دوال getSys() في باقي الملفات.
// 2. DOM Safety: حماية نظام اللودر من الانهيار إذا تم استدعاؤه قبل بناء document.body.
// 3. Advanced Binding: دعم ربط دوال الـ Getters والـ Setters بأمان لمنع الانهيار.
// ============================================================================

import { UICore } from './uiCore.js';
import { UIFinance } from './uiFinance.js';
import { UIAuth } from './uiAuth.js';

let _loaderActiveRequests = 0;

// 🛡️ حماية المراقب باستخدام globalThis الحديث
const initWatchdog = () => {
    if (typeof globalThis === 'undefined') return;
    
    const existingDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ModuleWatchdog');
    
    if (!existingDescriptor || existingDescriptor.configurable) {
        Object.defineProperty(globalThis, 'ModuleWatchdog', {
            value: Object.freeze({ loadedModules: new Set() }),
            writable: false,
            configurable: false,
            enumerable: false
        });
    }
};
initWatchdog();

const verifyModule = (name, mod) => {
    if (!mod || Object.keys(mod).length === 0) {
        throw new Error(`🚨 [System Crash]: فشل استيراد الوحدة [${name}]. النظام غير قادر على الإقلاع!`);
    }
    
    if (typeof globalThis !== 'undefined' && globalThis.ModuleWatchdog) {
        globalThis.ModuleWatchdog.loadedModules.add(name);
    }
    return true;
};

verifyModule('UICore', UICore);
verifyModule('UIFinance', UIFinance);
verifyModule('UIAuth', UIAuth);

// 🛡️ المحرك الماسي لدمج الوحدات
const createSafeFacade = (baseObject, ...modules) => {
    const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    
    for (const mod of modules) {
        if (!mod) continue;
        const descriptors = Object.getOwnPropertyDescriptors(mod);
        
        for (const [key, descriptor] of Object.entries(descriptors)) {
            if (FORBIDDEN_KEYS.has(key)) continue;
            
            // 🚨 Fail Fast: إيقاف النظام فوراً عند التصادم
            if (key in baseObject) {
                throw new Error(`🚨 [Fatal Architecture Error]: تصادم فادح في المتغير/الدالة [${key}] من الوحدة المدمجة!`);
            }
            
            // 🔗 Native Binding: استخدام bind الأسرع والأكثر أماناً مع دعم Getters/Setters
            if (descriptor.value && typeof descriptor.value === 'function') {
                descriptor.value = descriptor.value.bind(baseObject);
            } else {
                if (descriptor.get) descriptor.get = descriptor.get.bind(baseObject);
                if (descriptor.set) descriptor.set = descriptor.set.bind(baseObject);
            }
            
            Object.defineProperty(baseObject, key, descriptor);
        }
    }
    return baseObject;
};

// 💎 تجميع الكائن النهائي كـ Pure Dictionary (كائن بلا جذور)
export const UIManager = createSafeFacade(
    Object.create(null), // 👈 الدرع المطلق ضد الـ Prototype Pollution
    UICore,
    UIFinance,
    UIAuth
);

// ⚙️ تعريف دوال اللودر بأمان
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
                // 🛡️ التحديث 2: حماية הـ DOM من الانهيار المبكر
                const targetNode = document.body || document.documentElement;
                if (!targetNode) return; // حماية مطلقة
                
                loader = document.createElement('div');
                loader.id = 'global-dynamic-loader';
                loader.setAttribute('aria-live', 'assertive');
                loader.innerHTML = `
                    <i class="fa-solid fa-circle-notch fa-spin loader-spinner"></i>
                    <div id="dynamic-loader-text" class="loader-text"></div>
                `;
                targetNode.appendChild(loader);
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
        configurable: false,
        enumerable: true
    },
    
    forceHideLoader: {
        value: function() {
            UIManager.toggleLoader(false, '', true);
        },
        writable: false,
        configurable: false,
        enumerable: true
    }
});

// 🛡️ التحديث 1: ربط الموزع بالبيئة العالمية لتعمل كل الواجهات معاً كجسد واحد
if (typeof globalThis !== 'undefined') {
    globalThis.UIManager = UIManager;
    // دعم التوافقية الرجعية (Backward Compatibility)
    globalThis.ClientSystem = UIManager;
}