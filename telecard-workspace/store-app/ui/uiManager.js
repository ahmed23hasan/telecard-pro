// ============================================================================
// 🎨 الموزع المركزي للواجهات (uiManager.js) - الإصدار المؤسسي V17.2 🛡️
// 🎯 الوظيفة: تجميع وحدات الواجهة، إدارة الحالة (State)، ومنع تضارب البيانات
// 🚀 التحديثات المعمارية:
// 1. Flexible Facade: إزالة التجميد القاتل (Object.freeze) لضمان تحديث المتغيرات بحرية.
// 2. Isolated State: توفير كائن State مخصص لحفظ حالة الواجهة المؤقتة.
// 3. Module Merge Orphan Fix: إدراج تطبيق التقويم (CalendarApp) لتوحيد سياق this.
// 4. Debounced Loader: حماية اللودر الديناميكي من الوميض عبر تأخير زمني 50ms.
// ============================================================================

import { UICore } from './uiCore.js';
import { UIFinance } from './uiFinance.js';
import { UIAuth } from './uiAuth.js';
// 🛡️ الإصلاح: استيراد CalendarApp مع Components
import { Components, CalendarApp } from '../components.js';

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
    clickTimers: {},
    debounceTimers: {}
};

// ============================================================================
// 2️⃣ بناء الموزع المركزي (UIManager) بدون قيود التجميد (Unfrozen Object)
// ============================================================================
export const UIManager = {
    isReady: true,
    State: UIState, 
    
    // 🚀 نظام اللودر الديناميكي مع حماية ضد الوميض (Anti-Flicker Debounce)
    _loaderActiveRequests: 0,
    _loaderTimeout: null,

    toggleLoader: function(show, text = 'جاري المعالجة...', force = false) {
        if (show) {
            this._loaderActiveRequests++;
        } else {
            this._loaderActiveRequests = force ? 0 : Math.max(0, this._loaderActiveRequests - 1);
        }
        
        // 🛡️ حماية الـ DOM: تأجيل الرسم إذا لم يكن عنصر الـ body متاحاً بعد
        if (!document.body) {
            requestAnimationFrame(() => this.toggleLoader(show, text, force));
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
// 3️⃣ الدمج الآمن للوحدات (Safe Flat Merge)
// ننقل كافة دوال الواجهات إلى الموزع لدعم الأكواد القديمة مع ربط السياق (this)
// ============================================================================

// 🛡️ الإصلاح: إضافة CalendarApp للمصفوفة لدمج دوال التقويم مع الموزع المركزي
const modulesToMerge = [UICore, UIFinance, UIAuth, Components, CalendarApp];
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

for (const mod of modulesToMerge) {
    if (!mod) continue;
    
    const descriptors = Object.getOwnPropertyDescriptors(mod);
    for (const [key, descriptor] of Object.entries(descriptors)) {
        if (FORBIDDEN_KEYS.has(key)) continue;
        
        // منع استبدال الخصائص الأساسية التي عرفناها في UIManager
        if (key === 'isReady' || key === 'State' || key === 'toggleLoader' || key === 'forceHideLoader') continue;

        // ربط الدوال بالموزع المركزي لضمان أن `this` يشير دائماً لـ UIManager المفتوح
        if (typeof descriptor.value === 'function') {
            UIManager[key] = descriptor.value.bind(UIManager);
        } else {
            // المتغيرات العادية يتم نقلها كما هي
            UIManager[key] = descriptor.value;
        }
    }
}

// ============================================================================
// 4️⃣ ربط الموزع بالبيئة العالمية بأمان (توفير الأسماء المستعارة للـ HTML)
// ============================================================================
if (typeof globalThis !== 'undefined') {
    // نمنع استبدال المتغير بالكامل لحماية النظام من أي إضافات خارجية خبيثة
    if (!globalThis.UIManager) {
        Object.defineProperty(globalThis, 'UIManager', {
            value: UIManager,
            writable: false,     
            configurable: false
        });
    }
    
    // دعم الأكواد التي لا تزال تستخدم ClientSystem
    if (!globalThis.ClientSystem) {
        Object.defineProperty(globalThis, 'ClientSystem', {
            value: UIManager,
            writable: false,
            configurable: false
        });
    }
}
