// ============================================================================
// 🎨 الموزع المركزي للواجهات (uiManager.js) - الإصدار المؤسسي V18.2.0 🛡️
// 🎯 الوظيفة: تجميع وحدات الواجهة، إدارة الحالة (State)، ومنع تضارب البيانات
// 🚀 التحديثات المعمارية الصارمة (V18.2.0 - Safe Composition Patch):
// 1. Safe Mixin Guard 🛡️: إيقاف الدمج المسطح العشوائي ومنع الكتابة الفوقية للدوال المتشابهة.
// 2. Explicit Collision Detection: طباعة أخطاء صريحة عند تضارب أسماء الدوال بين الوحدات.
// 3. CPU Spamming Fix 🛡️: استمرار حماية خيط المعالجة عند تشغيل اللودر.
// 4. Loader Failsafe Guard 🛡️: حماية الواجهة من الإقفال الأبدي (45 ثانية).
// ============================================================================

import { UICore } from './uiCore.js';
import { UIFinance } from './uiFinance.js';
import { UIAuth } from './uiAuth.js';
import { Components } from '../components.js';

// ============================================================================
// 1️⃣ إعداد كائن الحالة المعزول (Isolated State Store)
// هذا الكائن مخصص لتخزين المتغيرات الديناميكية بأمان وعزلها عن المنطق التشغيلي
// ============================================================================
const UIState = {
    activeModals: [],
    currentRating: 0,
    activeListeners: new Map(),
    pendingReceiptFile: null,
    isProcessingTx: false,
    isSavingIdentity: false,
    isSubmittingKyc: false,
    currentImageJobId: null,
    clickTimers: {},
    debounceTimers: {}
};

// ============================================================================
// 2️⃣ بناء الموزع المركزي (UIManager) 
// ============================================================================
export const UIManager = {
    isReady: true,
    State: UIState,
    
    // 🚀 نظام اللودر الديناميكي مع حماية ضد الوميض ودرع التجميد
    _loaderActiveRequests: 0,
    _loaderTimeout: null,
    _failsafeTimer: null,
    
    toggleLoader: function(show, text = 'جاري المعالجة...', force = false) {
        if (show) {
            this._loaderActiveRequests++;
        } else {
            this._loaderActiveRequests = force ? 0 : Math.max(0, this._loaderActiveRequests - 1);
        }
        
        // 🛡️ درع الأمان (Failsafe): إغلاق إجباري بعد 45 ثانية لمنع تجميد المتجر
        if (this._loaderActiveRequests > 0) {
            if (this._failsafeTimer) clearTimeout(this._failsafeTimer);
            this._failsafeTimer = setTimeout(() => {
                console.error("🛡️ [UI Failsafe] تنبيه: تم إغلاق اللودر إجبارياً بعد 45 ثانية لمنع تجميد واجهة المستخدم.");
                this.forceHideLoader();
            }, 45000);
        } else {
            if (this._failsafeTimer) {
                clearTimeout(this._failsafeTimer);
                this._failsafeTimer = null;
            }
        }
        
        // 🛡️ حماية الـ DOM: استخدام مستمع آمن بدلاً من إرهاق المعالج
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', () => {
                this.toggleLoader(show, text, force);
            }, { once: true });
            return;
        }
        
        // ⏱️ تأخير 50 ملي ثانية لمنع الوميض المزعج عند الانتقال السريع بين العمليات
        clearTimeout(this._loaderTimeout);
        this._loaderTimeout = setTimeout(() => {
            let loader = document.getElementById('global-dynamic-loader');
            
            if (!loader && this._loaderActiveRequests > 0) {
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
                if (this._loaderActiveRequests > 0) {
                    if (textEl && textEl.textContent !== text) {
                        textEl.textContent = text;
                    }
                    loader?.classList.add('is-active');
                } else {
                    loader?.classList.remove('is-active');
                }
            });
        }, 50);
    },
    
    forceHideLoader: function() {
        this.toggleLoader(false, '', true);
    }
};

// ============================================================================
// 3️⃣ الدمج الآمن للوحدات (Safe Composition Guard)
// ============================================================================

// 🛡️ تعريف الوحدات مع أسمائها لتسهيل تتبع الأخطاء
const modulesToMerge = [
    { name: 'UICore', obj: UICore },
    { name: 'UIFinance', obj: UIFinance },
    { name: 'UIAuth', obj: UIAuth },
    { name: 'Components', obj: Components }
];

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

for (const mod of modulesToMerge) {
    if (!mod.obj) continue;
    
    const descriptors = Object.getOwnPropertyDescriptors(mod.obj);
    for (const [key, descriptor] of Object.entries(descriptors)) {
        if (FORBIDDEN_KEYS.has(key)) continue;
        
        // منع استبدال الخصائص الأساسية التي عرفناها في UIManager
        if (['isReady', 'State', 'toggleLoader', 'forceHideLoader', '_loaderActiveRequests', '_loaderTimeout', '_failsafeTimer'].includes(key)) continue;
        
        // 🛡️ خوارزمية منع الكتابة الفوقية (Collision Detection Guard)
        // إذا كانت الخاصية موجودة بالفعل، نوقف الدمج ونطبع خطأ صريحاً لإنهاء الفشل الصامت
        if (key in UIManager) {
            console.error(`🚨 [Architecture Guard] تضارب في الأسماء (Collision)! الدالة '${key}' من وحدة '${mod.name}' تحاول الكتابة فوق دالة موجودة مسبقاً في الموزع المركزي. تم إيقاف دمج هذه الدالة للحماية.`);
            continue; 
        }
        
        // ربط الدوال بالموزع المركزي لضمان أن `this` يشير دائماً لـ UIManager المفتوح
        if (typeof descriptor.value === 'function') {
            UIManager[key] = descriptor.value.bind(UIManager);
        } else {
            UIManager[key] = descriptor.value;
        }
    }
}

// ============================================================================
// 4️⃣ ربط الموزع بالبيئة العالمية بأمان 
// ============================================================================
if (typeof globalThis !== 'undefined') {
    if (!globalThis.UIManager) {
        Object.defineProperty(globalThis, 'UIManager', {
            value: UIManager,
            writable: false,
            configurable: false
        });
    }
    
    if (!globalThis.ClientSystem) {
        Object.defineProperty(globalThis, 'ClientSystem', {
            value: UIManager,
            writable: false,
            configurable: false
        });
    }
}
