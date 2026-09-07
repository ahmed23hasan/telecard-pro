// ============================================================================
// 🎨 الموزع المركزي للواجهات (uiManager.js) - الإصدار المؤسسي V18.9.2 🛡️
// 🎯 الوظيفة: تجميع وحدات الواجهة، إدارة الحالة (State)، ومنع تضارب البيانات
// 🚀 التحديثات المعمارية الصارمة (V18.9.2 - Advanced Routing & Integrity Patch):
// 1. Referential Equality Cache 🛡️: تخزين الدوال المربوطة (Bound) لمنع كسر أوامر (removeEventListener).
// 2. Ultimate Failsafe Guard 🛡️: قاطع تيار تلقائي ينهي شاشة التحميل بعد 60 ثانية لفك تجمد النظام.
// 3. Proxy Transparency 🛡️: إضافة (has trap) لضمان استجابة الموزع لفحوصات (in operator) بشكل سليم.
// 4. State Isolation 🛡️: فصل الحالة المركزية عن وحدات المعالجة لمنع تضارب الذاكرة.
// ============================================================================

import { UICore } from './uiCore.js';
import { UIFinance } from './uiFinance.js';
import { UIAuth } from './uiAuth.js';
import { Components } from '../components.js';

// ============================================================================
// 1️⃣ إعداد كائن الحالة المعزول (Isolated State Store)
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
// 2️⃣ بناء الكائن الأساسي للموزع (Base UIManager)
// ============================================================================
const UIManagerBase = {
    isReady: true,
    State: UIState,
    
    // 🛡️ العزل الهيكلي: إرفاق الوحدات كمساحات أسماء (Namespaces) نقية
    Core: UICore,
    Finance: UIFinance,
    Auth: UIAuth,
    Components: Components,
    
    // 🚀 نظام اللودر الديناميكي مع حماية ضد الوميض ودرع التجميد
    _loaderActiveRequests: 0,
    _loaderTimeout: null,
    _failsafeTimer: null,
    _ultimateFailsafe: null, // قاطع التيار النهائي
    
    toggleLoader: function(show, text = 'جاري المعالجة...', force = false) {
        if (show) {
            this._loaderActiveRequests++;
        } else {
            this._loaderActiveRequests = force ? 0 : Math.max(0, this._loaderActiveRequests - 1);
        }
        
        // 🛡️ درع الأمان: تحذير تصاعدي و قاطع تيار مطلق
        if (this._loaderActiveRequests > 0) {
            if (this._failsafeTimer) clearTimeout(this._failsafeTimer);
            if (this._ultimateFailsafe) clearTimeout(this._ultimateFailsafe);

            // التحذير الأصفر بعد 15 ثانية
            this._failsafeTimer = setTimeout(() => {
                const textEl = document.getElementById('dynamic-loader-text');
                if (textEl) {
                    textEl.innerHTML = '<span style="color: #fbbf24;"><i class="fa-solid fa-triangle-exclamation"></i> الشبكة بطيئة، يرجى الانتظار...</span>';
                }
                console.warn("🛡️ [UI Failsafe] الشبكة بطيئة جداً. تم تنبيه العميل.");
            }, 15000); 

            // قاطع التيار النهائي بعد 60 ثانية (لمنع تجمد الواجهة للأبد)
            this._ultimateFailsafe = setTimeout(() => {
                console.error("🚨 [Ultimate Failsafe] تم إيقاف اللودر إجبارياً بعد مرور 60 ثانية لفك تجمد الواجهة.");
                this.forceHideLoader();
                if (this.State) this.State.isProcessingTx = false; // تحرير قفل الدفع المزدوج
            }, 60000);

        } else {
            if (this._failsafeTimer) { clearTimeout(this._failsafeTimer); this._failsafeTimer = null; }
            if (this._ultimateFailsafe) { clearTimeout(this._ultimateFailsafe); this._ultimateFailsafe = null; }
        }
        
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', () => {
                this.toggleLoader(show, text, force);
            }, { once: true });
            return;
        }
        
        // ⏱️ تأخير 50 ملي ثانية لمنع الوميض المزعج
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
                    if (textEl && textEl.textContent !== text && !textEl.innerHTML.includes('الشبكة بطيئة')) {
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
// 3️⃣ محول الوكيل الذكي (The Smart Proxy Router) 
// ============================================================================
// 🛡️ ذاكرة تخزين مؤقتة للحفاظ على تطابق مراجع الدوال (Referential Equality)
const boundFunctionsCache = new WeakMap();

export const UIManager = new Proxy(UIManagerBase, {
    get(target, prop) {
        if (prop in target) {
            return target[prop];
        }

        const namespaces = [target.Core, target.Finance, target.Auth, target.Components];
        
        for (const ns of namespaces) {
            if (ns && prop in ns) {
                const value = ns[prop];
                
                // 🛡️ إصلاح تطابق المراجع: نستخدم نفس النسخة المربوطة دائماً
                if (typeof value === 'function') {
                    if (!boundFunctionsCache.has(value)) {
                        boundFunctionsCache.set(value, value.bind(ns));
                    }
                    return boundFunctionsCache.get(value);
                }
                return value;
            }
        }
        
        return undefined;
    },
    
    set(target, prop, value) {
        if (prop in target) { 
            target[prop] = value; 
            return true; 
        }

        const namespaces = [target.Core, target.Finance, target.Auth, target.Components];
        for (const ns of namespaces) {
            if (ns && prop in ns) { 
                ns[prop] = value; 
                return true; 
            }
        }
        
        target[prop] = value; 
        return true;
    },

    // 🛡️ إضافة شفافية الفحص: لضمان عمل عمليات مثل ('openModal' in UIManager)
    has(target, prop) {
        if (prop in target) return true;
        const namespaces = [target.Core, target.Finance, target.Auth, target.Components];
        for (const ns of namespaces) {
            if (ns && prop in ns) return true;
        }
        return false;
    }
});

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
    
    // دعم الأسماء القديمة (Legacy Support) لضمان التوافق الرجعي
    if (!globalThis.ClientSystem) {
        Object.defineProperty(globalThis, 'ClientSystem', {
            value: UIManager,
            writable: false,
            configurable: false
        });
    }
}
