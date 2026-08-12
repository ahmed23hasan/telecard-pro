// ============================================================================
// 🎨 الموزع المركزي للواجهات (uiManager.js) - النسخة الماسية V16.3 🛡️
// 🎯 الوظيفة: تجميع وحدات الواجهة المنفصلة وتصديرها ككائن واحد للنظام
// 🚀 التحديثات المعمارية (V16.3):
// 1. Full Facade Integration: دمج Components لتوحيد السياق وإصلاح أحداث الكوبونات.
// 2. Lifecycle Sync: إضافة `isReady` ليتناغم مع DataManager ويمنع تعليق النظام.
// 3. Strict DOM Safety: منع تشويه الـ HTML بتأجيل رسم اللودر حتى بناء الـ document.body.
// 4. Object Sealing: إغلاق كائن الواجهة لمنع الاختراق أو العبث الخارجي.
// ============================================================================

import { UICore } from './uiCore.js';
import { UIFinance } from './uiFinance.js';
import { UIAuth } from './uiAuth.js';
import { Components } from '../components.js'; // 👈 استيراد المكونات التفاعلية بنجاح

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

// التحقق من وصول كل وحدات الواجهة بسلام
verifyModule('UICore', UICore);
verifyModule('UIFinance', UIFinance);
verifyModule('UIAuth', UIAuth);
verifyModule('Components', Components); // 👈 التحقق من سلامة المكونات التفاعلية

// 🛡️ المحرك الماسي لدمج الوحدات
const createSafeFacade = (baseObject, ...modules) => {
    const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    
    for (const mod of modules) {
        if (!mod) continue;
        const descriptors = Object.getOwnPropertyDescriptors(mod);
        
        for (const [key, descriptor] of Object.entries(descriptors)) {
            if (FORBIDDEN_KEYS.has(key)) continue;
            
            if (key in baseObject) {
                throw new Error(`🚨 [Fatal Architecture Error]: تصادم فادح في المتغير/الدالة [${key}] من الوحدة المدمجة!`);
            }
            
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

// 💎 تجميع الكائن النهائي كـ Pure Dictionary
const FacadeInstance = createSafeFacade(
    Object.create(null), // 👈 الدرع المطلق ضد الـ Prototype Pollution
    UICore,
    UIFinance,
    UIAuth,
    Components // 👈 دمج المكونات لتصبح جزءاً من الكيان الموحد (Single Source of Truth)
);

// ⚙️ تعريف دوال اللودر وحالة النظام بأمان
Object.defineProperties(FacadeInstance, {
    
    // 🔗 التحديث 1: مفتاح الجاهزية الذي يحتاجه DataManager لمعرفة أن الواجهة تعمل
    isReady: {
        value: true,
        writable: false,
        configurable: false,
        enumerable: true
    },
    
    toggleLoader: {
        value: function(show, text = 'جاري المعالجة...', force = false) {
            if (show) {
                _loaderActiveRequests++;
            } else {
                _loaderActiveRequests = force ? 0 : Math.max(0, _loaderActiveRequests - 1);
            }
            
            // 🛡️ التحديث 2: حماية الـ DOM، إذا لم يتوفر body نؤجل التنفيذ حتى يتوفر
            if (!document.body) {
                requestAnimationFrame(() => this.toggleLoader(show, text, force));
                return;
            }
            
            let loader = document.getElementById('global-dynamic-loader');
            
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'global-dynamic-loader';
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
                        textEl.textContent = text; // استخدام textContent يحمي من ثغرات XSS تلقائياً
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
            this.toggleLoader(false, '', true);
        },
        writable: false,
        configurable: false,
        enumerable: true
    }
});

// 🛡️ التحديث 3: تصدير الكائن ليكون قابلاً للتمديد أثناء الإقلاع، وسيتم إغلاقه وتأمينه ديناميكياً في script.js
export const UIManager = FacadeInstance;

// 🔗 ربط الموزع بالبيئة العالمية (محصن ضد اختطاف الكائنات - Object Hijacking)
if (typeof globalThis !== 'undefined') {
    // 🛡️ استخدام defineProperty لمنع استبدال المتغير (window.UIManager = maliciousObj)
    if (!globalThis.UIManager) {
        Object.defineProperty(globalThis, 'UIManager', {
            value: UIManager,
            writable: false, // يمنع أي كود خارجي من إعادة تعيين المتغير
            configurable: false // يمنع حذف المتغير من البيئة العالمية
        });
    }
    
    // 🛡️ تأمين الاسم المستعار (Alias) بنفس الطريقة
    if (!globalThis.ClientSystem) {
        Object.defineProperty(globalThis, 'ClientSystem', {
            value: UIManager,
            writable: false,
            configurable: false
        });
    }
}