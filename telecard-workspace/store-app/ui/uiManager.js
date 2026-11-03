// ============================================================================
// 🎨 الموزع المركزي ومخزن حالة الواجهة (ui/uiManager.js) - الإصدار المؤسسي V21.0.0 🏛️
// 🎯 الوظيفة: معمارية القلعة (Citadel State Store)، إدارة طبقات النوافذ، ومزامنة شريط التنقل.
// 🚀 التحديثات المعمارية الصارمة (V21.0.0 - Deterministic ViewState & 2-Level Modal Stack):
// 1. Orthogonal ViewState 🧭: فصل الشاشة الأساسية (baseView) عن مكدس النوافذ (activeModals) لمنع ضياع موضع التصفح.
// 2. Two-Level Modal Stack 🪟: التمييز بين النوافذ الرئيسية (Level 1) والنوافذ الفرعية العلوية (Level 2 مثل tx-detail و pay-receipt).
// 3. Reactive Bottom-Nav Sync ✨: تلوين شريط التنقل السفلي تلقائياً كدالة رياضية نقية تابعة لـ UIState دون قراءة نصوص الـ DOM.
// 4. Referential Equality & Failsafe Guard 🛡️: الحفاظ على مراجع الدوال وحماية الواجهة بقاطع تيار تلقائي للودر.
// ============================================================================

import { UICore } from './uiCore.js';
import { UIFinance } from './uiFinance.js';
import { UIAuth } from './uiAuth.js';
import { Components } from '../components.js';

// 🛡️ النوافذ الفرعية (المستوى الثاني) التي تُفتح فوق النوافذ الرئيسية دون إغلاقها
const SECONDARY_TOP_MODALS = new Set([
    'tx-detail',
    'setup-2fa',
    'purchase-success',
    'success',
    'kyc-celebration',
    'pay-receipt'
]);

// ============================================================================
// 1️⃣ كائن الحالة المركزي المعزول (Single Source of Truth for UI State)
// ============================================================================
export const UIState = {
    // 🧭 طبقة الشاشة الأساسية (Base Canvas View)
    baseView: 'home',          // 'home' | 'category' | 'favorites' | 'search'
    currentCategoryId: null,   // معرف القسم المفتوح حالياً
    searchQuery: '',           // نص البحث الحالي
    navHistory: [],            // سجل التنقل بين الأقسام

    // 🪟 طبقة النوافذ والقائمة الجانبية (Overlay & Modal Stack)
    activeModals: [],          // مكدس النوافذ المفتوحة بالترتيب
    sidebarOpen: false,        // هل القائمة الجانبية مفتوحة؟

    // 🔒 أقفال العمليات المالية والحالات المؤقتة
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
// 2️⃣ الكائن الأساسي للموزع وإدارة الحالة (Base UIManager)
// ============================================================================
const UIManagerBase = {
    isReady: true,
    State: UIState,
    
    // 🛡️ العزل الهيكلي: إرفاق الوحدات كمساحات أسماء (Namespaces) نقية
    Core: UICore,
    Finance: UIFinance,
    Auth: UIAuth,
    Components: Components,

    // 🔍 فحص ما إذا كانت النافذة من المستوى الثاني (تُفتح فوق النافذة الحالية)
    isSecondaryModal: function(modalId) {
        return SECONDARY_TOP_MODALS.has(String(modalId || ''));
    },

    // 🧭 تحديث حالة الشاشة الأساسية ومزامنة الشريط السفلي والـ Body تلقائياً
    setBaseView: function(viewName, options = {}) {
        const validViews = new Set(['home', 'category', 'favorites', 'search']);
        UIState.baseView = validViews.has(viewName) ? viewName : 'home';

        if (options.categoryId !== undefined) {
            UIState.currentCategoryId = options.categoryId;
            UICore.currentCategoryId = options.categoryId;
        }
        if (options.searchQuery !== undefined) {
            UIState.searchQuery = options.searchQuery;
        }

        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.toggle('is-home', UIState.baseView === 'home');
            document.body.classList.toggle('is-favorites', UIState.baseView === 'favorites');
        }

        this.syncBottomNavUI();
    },

    // ✨ المزامنة التلقائية الحتمية لشريط التنقل السفلي والقائمة الجانبية (Zero DOM Scraping)
    syncBottomNavUI: function() {
        let targetAction = 'nav-home';

        if (UIState.sidebarOpen) {
            targetAction = 'open-sidebar';
        } else if (UIState.activeModals.includes('wallet')) {
            targetAction = 'nav-wallet';
        } else if (UIState.activeModals.includes('orders')) {
            targetAction = 'nav-orders';
        } else if (UIState.baseView === 'favorites') {
            targetAction = 'open-favorites';
        } else {
            targetAction = 'nav-home';
        }

        let sidebarAction = 'nav-home';
        if (UIState.activeModals.includes('balance')) sidebarAction = 'nav-deposit';
        else if (UIState.activeModals.includes('mypay')) sidebarAction = 'nav-payments';
        else if (UIState.activeModals.includes('orders')) sidebarAction = 'nav-orders';
        else if (UIState.activeModals.includes('notif-center')) sidebarAction = 'open-notif-center';
        else if (UIState.activeModals.includes('security')) sidebarAction = 'open-security-modal';
        else if (UIState.activeModals.includes('settings')) sidebarAction = 'nav-settings';

        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                const navIcons = document.querySelectorAll('.bottom-nav .nav-icon');
                navIcons.forEach(icon => {
                    const action = icon.getAttribute('data-action');
                    icon.classList.toggle('active', action === targetAction);
                });

                const sidebarItems = document.querySelectorAll('#cs-menu .menu-list .nav-item');
                sidebarItems.forEach(item => {
                    const action = item.getAttribute('data-action');
                    item.classList.toggle('active', action === sidebarAction);
                });
            });
        }
    },
    
    // 🚀 نظام اللودر الديناميكي مع حماية ضد الوميض ودرع التجميد
    _loaderActiveRequests: 0,
    _loaderTimeout: null,
    _failsafeTimer: null,
    _ultimateFailsafe: null,
    
    toggleLoader: function(show, text = 'جاري المعالجة...', force = false) {
        if (show) {
            this._loaderActiveRequests++;
        } else {
            this._loaderActiveRequests = force ? 0 : Math.max(0, this._loaderActiveRequests - 1);
        }
        
        if (this._loaderActiveRequests > 0) {
            if (this._failsafeTimer) clearTimeout(this._failsafeTimer);
            if (this._ultimateFailsafe) clearTimeout(this._ultimateFailsafe);

            this._failsafeTimer = setTimeout(() => {
                const textEl = document.getElementById('dynamic-loader-text');
                if (textEl) {
                    textEl.innerHTML = '<span style="color: #fbbf24;"><i class="fa-solid fa-triangle-exclamation"></i> الشبكة بطيئة، يرجى الانتظار...</span>';
                }
                console.warn("🛡️ [UI Failsafe] الشبكة بطيئة جداً. تم تنبيه العميل.");
            }, 15000); 

            this._ultimateFailsafe = setTimeout(() => {
                console.error("🚨 [Ultimate Failsafe] تم إيقاف اللودر إجبارياً بعد مرور 60 ثانية لفك تجمد الواجهة.");
                this.forceHideLoader();
                UIState.isProcessingTx = false;
            }, 60000);

        } else {
            if (this._failsafeTimer) { clearTimeout(this._failsafeTimer); this._failsafeTimer = null; }
            if (this._ultimateFailsafe) { clearTimeout(this._ultimateFailsafe); this._ultimateFailsafe = null; }
        }
        
        if (typeof document !== 'undefined' && !document.body) {
            document.addEventListener('DOMContentLoaded', () => {
                this.toggleLoader(show, text, force);
            }, { once: true });
            return;
        }
        
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
// 3️⃣ محول الوكيل الذكي (The Smart Proxy Facade)
// ============================================================================
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
// 4️⃣ التوافق المرجعي الآمن مع النطاق العام
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
    globalThis.updateBottomNavState = () => UIManager.syncBottomNavUI();
}