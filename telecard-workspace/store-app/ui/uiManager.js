// ============================================================================
// 🎨 الموزع المركزي للواجهات (uiManager.js) - الإصدار المؤسسي V18.9.1 🛡️
// 🎯 الوظيفة: تجميع وحدات الواجهة، إدارة الحالة (State)، ومنع تضارب البيانات
// 🚀 التحديثات المعمارية الصارمة (V18.9.1 - State Routing & Proxy Patch):
// 1. Proxy Set Trap 🛡️: إضافة فخ الكتابة (set) لتوجيه المتغيرات إلى وحداتها الأصلية ومنع الشلل في التنقل.
// 2. Smart Proxy Router 🛡️: استخدام (Proxy) لتوجيه الاستدعاءات للوحدات الفرعية دون تسطيحها للحفاظ على التوافق الرجعي.
// 3. Context Preservation 🛡️: حماية الكلمة المفتاحية (this) لكل وحدة (Module) بدلاً من ربطها العشوائي بالموزع المركزي.
// 4. Progressive Warning 🛡️: نظام تنبيهات ديناميكي يطمئن العميل عند بطء الشبكة دون إلغاء حماية المعاملة.
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
    
    toggleLoader: function(show, text = 'جاري المعالجة...', force = false) {
        if (show) {
            this._loaderActiveRequests++;
        } else {
            this._loaderActiveRequests = force ? 0 : Math.max(0, this._loaderActiveRequests - 1);
        }
        
        // 🛡️ درع الأمان: تحذير تصاعدي بدلاً من الإغلاق الكارثي لضمان سلامة العمليات المالية
        if (this._loaderActiveRequests > 0) {
            if (this._failsafeTimer) clearTimeout(this._failsafeTimer);
            this._failsafeTimer = setTimeout(() => {
                const textEl = document.getElementById('dynamic-loader-text');
                if (textEl) {
                    textEl.innerHTML = '<span style="color: #fbbf24;"><i class="fa-solid fa-triangle-exclamation"></i> الشبكة بطيئة، يرجى الانتظار...</span>';
                }
                console.warn("🛡️ [UI Failsafe] الشبكة بطيئة جداً. تم تنبيه العميل مع إبقاء الواجهة مقفلة لمنع تكرار الطلب (Double-Spend).");
            }, 15000); 
        } else {
            if (this._failsafeTimer) {
                clearTimeout(this._failsafeTimer);
                this._failsafeTimer = null;
            }
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
// هذا الوكيل يسمح باستدعاء الدوال القديمة بشكل مسطح (Flat Call) مثل UIManager.openModal()
// مع توجيه الطلب داخلياً للوحدة المناسبة (مثلاً Core) مع الحفاظ على سياقها (this).
export const UIManager = new Proxy(UIManagerBase, {
    get(target, prop) {
        // 1. إذا كانت الخاصية موجودة في الموزع الأساسي (مثل toggleLoader أو State)
        if (prop in target) {
            return target[prop];
        }

        // 2. إذا لم تكن موجودة، نبحث عنها في مساحات الأسماء بالترتيب
        const namespaces = [target.Core, target.Finance, target.Auth, target.Components];
        
        for (const ns of namespaces) {
            if (ns && prop in ns) {
                const value = ns[prop];
                // 🛡️ الأهم: إذا كانت دالة، يجب ربطها (bind) بوحدتها الأصلية لمنع فقدان السياق (Context Loss)
                if (typeof value === 'function') {
                    return value.bind(ns);
                }
                return value;
            }
        }
        
        // إرجاع undefined إذا لم يتم العثور عليها في أي مكان
        return undefined;
    },
    
    // 🛡️ التحديث المعماري (V18.9.1): إضافة فخ الكتابة (Set Trap) 
    // لضمان أن تعديل المتغيرات (مثل UIManager.currentCategoryId = null) يتم حفظه في وحدته الأصلية
    set(target, prop, value) {
        // 1. إذا كان المتغير يخص الموزع المركزي نفسه
        if (prop in target) { 
            target[prop] = value; 
            return true; 
        }

        // 2. البحث عن المتغير في مساحات الأسماء وتحديثه هناك
        const namespaces = [target.Core, target.Finance, target.Auth, target.Components];
        for (const ns of namespaces) {
            if (ns && prop in ns) { 
                ns[prop] = value; // توجيه القيمة الجديدة للوحدة الأصلية
                return true; 
            }
        }
        
        // 3. إذا كان متغيراً جديداً تماماً (لم يتم تعريفه مسبقاً)، نحفظه في الموزع
        target[prop] = value; 
        return true;
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
    
    // دعم الأسماء القديمة (Legacy Support)
    if (!globalThis.ClientSystem) {
        Object.defineProperty(globalThis, 'ClientSystem', {
            value: UIManager,
            writable: false,
            configurable: false
        });
    }
}
