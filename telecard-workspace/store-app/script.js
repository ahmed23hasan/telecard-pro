// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (script.js) - الإصدار الماسي الخارق (V12.5 - Stable Enterprise) 💎
// 🎯 الوظيفة: الإقلاع السريع، دمج البيانات الآمن، والتوافقية الشاملة مع جميع الأجهزة (Safari Safe)
// 🌟 التحديثات: سد ثغرات الذاكرة، حماية الكاش عند انقطاع الشبكة، والمزامنة النقية مع Firestore
// ============================================================================

// 🛡️ [حارس التوافقية]: منع انهيار متصفحات سفاري وآيفون التي لا تدعم requestIdleCallback
window.requestIdleCallback = window.requestIdleCallback || function(cb) {
    const start = Date.now();
    return setTimeout(() => cb({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
    }), 1);
};

import { auth } from './core/firebaseAdapter.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { DB_KEYS } from './config.js';
import { Utils } from './utils.js';
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import { RenderManager } from './renderManager.js';
import { Components, CalendarApp } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';
import { UIFinance } from './ui/uiFinance.js'; 

// 🕒 تسوية التواريخ مع حماية الذاكرة (Pure Function Approach)
const _normalizeDataTime = (dataArray) => {
    if (!Array.isArray(dataArray)) return [];
    return dataArray.map(item => ({
        ...item,
        time: item.time && typeof item.time !== 'object' ? RenderHelpers.parseTime(item.time) : item.time,
        createdAt: item.createdAt && typeof item.createdAt !== 'object' ? RenderHelpers.parseTime(item.createdAt) : item.createdAt,
        actionTime: item.actionTime && typeof item.actionTime !== 'object' ? RenderHelpers.parseTime(item.actionTime) : item.actionTime
    }));
};

const ClientSystem = { 
    isReady: false,
    activeListeners: [], 
    userAuthListeners: [],
    _listenersBound: false, 

    // 🧹 [تحديث الذاكرة]: التنظيف المركزي الشامل للاتصالات
    clearFirebaseListeners: function() {
        [...this.activeListeners, ...this.userAuthListeners].forEach(unsub => {
            if (typeof unsub === 'function') try { unsub(); } catch(e){}
        });
        this.activeListeners = [];
        this.userAuthListeners = [];
        
        // 🔥 ضمان قتل أي اتصالات مخفية تم فتحها مباشرة من الـ Adapter
        if (StoreDB && typeof StoreDB.killAllListeners === 'function') {
            StoreDB.killAllListeners();
        }
    },

    // 🔒 نظام الحماية بالبصمة
    enforceBiometricLock: async function() {
        const lockScreen = document.getElementById('biometric-lock-screen');
        if (!lockScreen) return false;
        
        const isBiometricRequired = DataManager.user?.biometricEnabled === true;
        const savedRawId = localStorage.getItem('telecard_biometric_key');

        if (!window.PublicKeyCredential || !savedRawId) {
            if (isBiometricRequired) {
                lockScreen.classList.remove('active');
                this.showToast?.('مفتاح البصمة مفقود. يرجى تسجيل الدخول.', 'error');
                DataManager.logout?.();
                return false;
            }
            lockScreen.classList.remove('active');
            return true;
        }
        
        try {
            const retryBtn = document.getElementById('btn-biometric-retry');
            if (retryBtn) { retryBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحقق...'; retryBtn.disabled = true; }
            
            const challenge = new Uint8Array(32); window.crypto.getRandomValues(challenge);
            const rawIdBytes = new Uint8Array(savedRawId.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            
            await navigator.credentials.get({ publicKey: { challenge, timeout: 60000, userVerification: "required", allowCredentials: [{ type: "public-key", id: rawIdBytes }] } });
            
            lockScreen.classList.remove('active'); return true;
        } catch (error) {
            const retryBtn = document.getElementById('btn-biometric-retry');
            if (retryBtn) { retryBtn.innerHTML = '<i class="fa-solid fa-fingerprint"></i> المحاولة مجدداً'; retryBtn.disabled = false; }
            return false;
        }
    },  

    initNetworkSensors: function() {
        window.addEventListener('offline', () => {
            this.showToast?.('انقطع الاتصال بالإنترنت. أنت تتصفح البيانات المحفوظة.', 'warning');
            document.body.classList.add('is-offline');
        });
        window.addEventListener('online', () => {
            document.body.classList.remove('is-offline');
            this.showToast?.('عاد الاتصال بالإنترنت! جاري المزامنة...', 'success');
            if (this.isReady) { try { this.initFirebaseListeners(); } catch(e){} }
        });
    },

    // 🎛️ إدارة الأحداث المركزية
    initGlobalListeners: function() {
        if (this._listenersBound) return;
        this._listenersBound = true;
        this.initNetworkSensors(); 

        document.body.addEventListener('touchstart', () => {}, { passive: true });
        window.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-action], .cat-card, .product-card')) e.preventDefault(); });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const action = e.target.getAttribute('data-action');
            if (action === 'store-search-enter') { this.sfx?.('nav'); this.applyStoreSearch?.(); }
            if (action === 'order-search-enter') { this.sfx?.('nav'); this.renderOrders?.(); }
            if (action === 'wallet-search-enter') { this.sfx?.('nav'); this.renderWallet?.(); }
            if (action === 'pay-search-enter') { this.sfx?.('nav'); this.renderPayments?.(); }
        });

        document.addEventListener('change', (e) => {
            const action = e.target.getAttribute('data-action');
            if (action === 'change-currency') this.setDisplayCurrency?.(e.target.value);
            if (action === 'kyc-upload-front') this.handleKycImage?.(e.target, 'kyc-prev-front');
            if (action === 'kyc-upload-back') this.handleKycImage?.(e.target, 'kyc-prev-back');
            if (action === 'kyc-upload-selfie') this.handleKycImage?.(e.target, 'kyc-prev-selfie');
            if (action === 'upload-avatar') this.handleAvatarChange?.(e);
        });

        document.addEventListener('input', (e) => {
            const action = e.target.getAttribute('data-action');
            if (action === 'filter-countries') this.filterCountries?.(e.target.value);
            if (action === 'check-coupon-state') this.checkInputState?.();
        });

        document.addEventListener('click', (e) => {
            const packageWrapper = document.getElementById('pkg-custom-dropdown');
            if (packageWrapper?.classList.contains('open') && !packageWrapper.contains(e.target) && !e.target.closest('.dropdown-trigger')) {
                packageWrapper.classList.remove('open');
            }
            const walletDrawer = document.getElementById('walletStatsDrawer');
            if (walletDrawer?.classList.contains('active')) {
                if (!walletDrawer.contains(e.target) && !e.target.closest('.detail-arrow') && !e.target.closest('.wallet-toggle-btn') && !e.target.closest('[data-action="toggle-wallet-stats"]')) {
                    this.closeWalletStats?.(); 
                }
            }
        }, true); 

        const ActionDictionary = {
            'nav-home': () => this.navigateHome?.(),
            'nav-deposit': () => this.navigateBalance?.(),
            'nav-payments': () => this.navigateMyPayments?.(),
            'nav-orders': () => this.navigateOrders?.(),
            'nav-settings': () => this.navigateSettings?.(),
            'nav-wallet': () => this.openWallet?.(),
            'open-sidebar': () => this.openSidebar?.(),
            'close-sidebar': () => this.closeSidebar?.(),
            'open-notif-center': () => this.openNotifCenter?.(),
            'open-about': (e) => { e.preventDefault(); this.openAboutModal?.(); },
            'open-community': () => this.openCommunityModal?.(),
            'open-security-modal': () => this.openSecurityModal?.(),
            'open-rating': () => this.openRatingModal?.(),
            'open-terms': () => this.openTermsModal?.(),
            'open-support': () => this.openSupport?.(),
            'open-favorites': () => this.openFavorites?.(),
            'open-add-balance': () => this.openAddBalance?.(),
            'open-tier-info': (e) => { e.stopPropagation(); this.openTierInfoModal?.(); },
            'logout': () => DataManager.logout?.(),
            'enforce-biometric': () => this.enforceBiometricLock?.(),
            'close-orders': () => this.closeOrders?.(),
            'close-wallet': () => this.closeWallet?.(),
            'close-mypayments': () => this.closeMyPayments?.(),
            'close-settings': () => this.closeSettings?.(),
            'close-balance': () => this.closeBalanceModal?.(),
            'back-balance-step': () => this.backToPayMethods?.(),
            'close-purchase': () => this.closeModal?.('purchase'),
            'close-success': () => this.closeModal?.('success'),
            'close-purchase-success': () => this.closePurchaseSuccess?.(), 
            'open-kyc-upload': () => { this.closeSidebar?.(); this.openModal?.('kyc-upload'); },
            'open-kyc-status': (e, id, val, target) => { this.closeSidebar?.(); this.openKycStatusModal?.(target.getAttribute('data-state')); },
            'close-tx-detail': () => this.closeModal?.('tx-detail'),
            'close-profile': () => this.closeProfileInfo?.(),
            'close-pay-receipt': () => this.closePayReceipt?.(),
            'close-terms': () => this.closeModal?.('terms'),
            'close-identity': () => this.closeModal?.('identity'),
            'close-kyc-upload': () => this.closeKycModal?.(),
            'close-kyc-status': () => this.closeKycStatusModal?.(),
            'close-notif-center': () => this.closeNotifCenter?.(),
            'close-tier-info': () => this.closeModal?.('tier-info'),
            'close-kyc-celebration': () => this.closeModal?.('kyc-celebration'),
            'close-community': () => this.closeModal?.('community'),
            'close-rating': () => this.closeModal?.('rating'),
            'close-about': () => this.closeModal?.('about'),
            'close-security-modal': () => this.closeSecurityModal?.(),
            'close-setup-2fa': () => this.closeModal?.('setup-2fa'),
            'toggle-currency-menu': () => this.toggleDisplayCurrencyMenu?.(),
            'toggle-theme': () => this.toggleTheme?.(),
            'store-search-btn': () => this.applyStoreSearch?.(),
            'open-category': (e, id) => { e.preventDefault(); this.openCategory?.(id); },
            'open-product': (e, id) => { e.preventDefault(); this.openProdModal?.(id); },
            'toggle-fav-modal': () => this.toggleFavoriteFromModal?.(),
            'update-simple-qty': (e, id, val) => this.updateSimpleQty?.(parseInt(val)),
            'toggle-pkg-dropdown': (e, id, val, target) => target.parentElement.classList.toggle('open'),
            'toggle-coupon-ui': (e, id, val, target) => this.toggleCoupon?.(target),
            'apply-coupon': () => this.applyCoupon?.(),
            'remove-coupon': () => this.removeCoupon?.(),
            'paste-coupon': () => this.pasteText?.(),
            
            // 🛡️ درع منع النقرات المزدوجة أثناء معالجة الطلبات
            'confirm-purchase': async (e, id, val, target) => { 
                if (target.disabled || target.dataset.processing === 'true') return;
                target.disabled = true; target.dataset.processing = 'true';
                const originalHtml = target.innerHTML;
                target.innerHTML = '<span class="btn-content"><i class="fa-solid fa-spinner fa-spin"></i> جاري التنفيذ...</span>';
                try { await this.handlePurchaseSubmit?.(); } 
                finally { target.disabled = false; target.dataset.processing = 'false'; target.innerHTML = originalHtml; }
            },
            
            'nav-orders-from-success': () => { this.closePurchaseSuccess?.(); this.openOrders?.(); },
            'navigate-orders-success': () => { this.closeModal?.('purchase-success'); this.openOrders?.(); }, 
            'select-pay': (e, id) => this.selectPay?.(id),
            
            'submit-balance': async (e, id, val, target, dataType, dataCurr) => { 
                if (target.disabled || target.dataset.processing === 'true') return;
                target.disabled = true; target.dataset.processing = 'true';
                const originalHtml = target.innerHTML;
                target.innerHTML = '<span class="btn-content"><i class="fa-solid fa-spinner fa-spin"></i> جاري التنفيذ...</span>';
                try { await this.handleBalanceSubmit?.(dataCurr); } 
                finally { target.disabled = false; target.dataset.processing = 'false'; target.innerHTML = originalHtml; }
            },
            
            'toggle-accordion': (e, id, val, target) => { e.preventDefault(); this.togglePayDetail?.(target); },
            'jump-transaction': (e, id, val, target, dataType) => this.jumpToTransaction?.(id, dataType),
            'open-detail': (e, id, val, target, dataType) => this.openDetail?.(e, dataType, id),
            'render-orders': () => this.renderOrders?.(),
            'render-wallet': () => this.renderWallet?.(),
            'render-payments': () => this.renderPayments?.(),
            'filter-order': (e, id, val, target) => this.setOrderFilter?.(val, target),
            'filter-wallet': (e, id, val, target) => this.setWalletFilter?.(val, target),
            'filter-pay': (e, id, val, target) => this.setPaymentFilter?.(val, target),
            'toggle-wallet-stats': (e, id, val, target) => this.toggleWalletStats?.(target),
            'open-cal-order-start': (e) => CalendarApp?.open('order-date-start', e),
            'open-cal-order-end': (e) => CalendarApp?.open('order-date-end', e),
            'open-cal-wallet-start': (e) => CalendarApp?.open('wallet-date-start', e),
            'open-cal-wallet-end': (e) => CalendarApp?.open('wallet-date-end', e),
            'open-cal-pay-start': (e) => CalendarApp?.open('pay-date-start', e),
            'open-cal-pay-end': (e) => CalendarApp?.open('pay-date-end', e),
            'cal-adj-month': (e, id, val) => CalendarApp?.adjustMonth(parseInt(val)),
            'cal-adj-year': (e, id, val) => CalendarApp?.adjustYear(parseInt(val)),
            'cal-toggle-list': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen, dataTarget) => CalendarApp?.toggleList(dataTarget, e),
            'toggle-theme-pref': () => this.toggleThemePref?.(),
            'toggle-sound-pref': () => this.toggleSoundPref?.(),
            'open-profile-sidebar': () => setTimeout(() => { this.closeSidebar?.(); this.openProfileInfo?.(); }, 150),
            'open-wallet-sidebar': () => setTimeout(() => { this.closeSidebar?.(); this.openWallet?.(); }, 150),
            'open-identity-sidebar': () => setTimeout(() => { this.closeSidebar?.(); this.openModal?.('identity'); }, 150),
            'trigger-click': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen, dataTarget) => document.getElementById(dataTarget)?.click(),
            'delete-avatar': () => this.deleteProfileImage?.(),
            'toggle-name-edit': () => this.toggleNameEdit?.(),
            'toggle-2fa': () => this.handle2FAToggle?.(),
            'toggle-biometric': () => this.handleBiometricToggle?.(),
            'send-reset-pass': () => this.sendResetPasswordEmail?.(),
            'submit-password-change': () => this.handlePasswordSubmit?.(),
            'request-account-delete': () => this.toggleSecurityPref?.(),
            'verify-and-enable-2fa': () => this.verifyAndEnable2FA?.(),
            'toggle-parent-dropdown': (e, id, val, target) => target.parentElement.classList.toggle('open'),
            'select-reg-currency': (e, id, val, target, dataType, dataCurr, dataName, dataCode) => { e.preventDefault(); this.selectRegCurrency?.(dataName, dataCode); },
            'select-country': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen) => { e.preventDefault(); this.selectCountry?.(dataName, dataCode, dataLen); },
            'save-identity': () => this.saveIdentityData?.(),
            'submit-kyc': () => this.submitKycData?.(),
            'select-rating': (e, id, val) => this.selectRatingStar?.(parseInt(val)),
            'submit-rating-step': () => this.submitRatingStep?.(),
            'submit-private-feedback': () => this.submitPrivateFeedback?.(),
            'copy-text': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen, dataTarget, dataText) => {
                e.preventDefault(); e.stopPropagation();
                this.copyToClipboard?.(dataText || target.innerText, target);
            },
            'show-phone-toast': () => this.showToast?.('هذا الرقم مرتبط بحسابك الأساسي.', 'info'),
            
            'export-receipt': (e, id, val, target) => {
                e.preventDefault(); e.stopPropagation();
                if (target.closest('.nm-btn-print-magic')) RenderManager?.exportReceipt?.(id, target);
                else if (target.closest('.btn-receipt-export')) RenderManager?.exportPaymentReceipt?.(id, target);
                else this.exportReceipt?.(id, target);
            },
            
            'mark-all-read': () => {
                const notifContainer = document.getElementById('notif-center-list');
                if (notifContainer) {
                    const topBar = notifContainer.querySelector('.nc-top-action-bar');
                    if (topBar) topBar.style.display = 'none';
                    notifContainer.querySelectorAll('.nc-item.unread').forEach(item => {
                        item.classList.replace('unread', 'is-read');
                        const dot = item.querySelector('.unread-indicator-dot');
                        if (dot) dot.style.display = 'none';
                    });
                }
                this.markAllNotificationsRead?.();
            },
            
            'mark-single-read': (e, id) => {
                e.stopPropagation();
                const item = e.target.closest('.nc-item');
                if (item?.classList.contains('unread')) {
                    item.classList.replace('unread', 'is-read');
                    const dot = item.querySelector('.unread-indicator-dot');
                    if (dot) dot.style.display = 'none';
                    
                    const countNumEl = document.querySelector('.nc-unread-count-num');
                    if (countNumEl) {
                        const newCount = Math.max(0, (parseInt(countNumEl.innerText) || 0) - 1);
                        if (newCount > 0) countNumEl.innerText = newCount;
                        else { const topBar = document.querySelector('.nc-top-action-bar'); if (topBar) topBar.style.display = 'none'; }
                    }
                }
                (this.markSingleNotificationRead || DataManager.markSingleNotificationRead)?.(id);
                if (item?.hasAttribute('data-target-id')) this.openDetail?.(e, item.getAttribute('data-jump-type') || 'order', item.getAttribute('data-target-id'));
            }
        };

        // الموجه الرئيسي للنقرات
        document.body.addEventListener('click', (e) => {
            const target = e.target;
            
            if (target.classList.contains('pm-overlay') || target.classList.contains('modal-overlay')) {
                e.preventDefault();
                this.closeModal?.(target.id.replace('-overlay', ''));
                this.sfx?.('nav'); return;
            }
            
            const actionBtn = target.closest('[data-action]');
            if (!actionBtn) return;
            
            const action = actionBtn.getAttribute('data-action');
            const prodId = actionBtn.getAttribute('data-id');
            
            // معالجة الدبل كليك للصور (Smart Double-Click)
            if (action === 'open-product' && target.closest('.card-image')) {
                if (this._prodClickTimer && this._clickedProdId === prodId) {
                    clearTimeout(this._prodClickTimer);
                    this._prodClickTimer = null; this._clickedProdId = null;
                    this.triggerMagicFavorite?.(e, prodId); return;
                } else {
                    if (this._prodClickTimer) clearTimeout(this._prodClickTimer);
                    this._clickedProdId = prodId;
                    this._prodClickTimer = setTimeout(() => {
                        this._prodClickTimer = null; this._clickedProdId = null;
                        this.sfx?.('nav');
                        ActionDictionary[action]?.(e, prodId, actionBtn.getAttribute('data-val'), actionBtn);
                    }, 250);
                    return;
                }
            }
            
            if (!['copy-text', 'apply-coupon', 'submit-balance', 'confirm-purchase', 'trigger-click', 'update-simple-qty', 'delete-avatar', 'open-product', 'mark-single-read'].includes(action)) {
                this.sfx?.('nav');
            }
            
            if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) target.blur();
            
            try {
                const res = ActionDictionary[action]?.(e, prodId, actionBtn.getAttribute('data-val'), actionBtn, actionBtn.getAttribute('data-type'), actionBtn.getAttribute('data-curr'), actionBtn.getAttribute('data-name'), actionBtn.getAttribute('data-code'), actionBtn.getAttribute('data-len'), actionBtn.getAttribute('data-target'), actionBtn.getAttribute('data-text'));
                if (res instanceof Promise) res.catch(err => this.logCloudError(action, err));
            } catch (err) { this.logCloudError(action, err); }
        });
    },

    logCloudError: function(action, err) {
        console.error(`🚨 خطأ أثناء تنفيذ الإجراء [${action}]:`, err);
        if (StoreDB?.addDoc) {
            StoreDB.addDoc('SYSTEM_ERRORS', {
                action, errorMsg: err.message, stack: err.stack,
                userId: DataManager?.user?.uid || 'guest', device: navigator.userAgent, time: new Date().toISOString()
            }).catch(()=>{}); 
        }
        this.showToast?.('حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.', 'error');
    }
};

// 🔗 دمج الوحدات
const baseKeys = Object.keys(ClientSystem);
[DataManager, UIManager, RenderManager, Components, Utils, UIFinance].forEach(mod => {
    if (!mod) return;
    Object.keys(mod).forEach(key => {
        if (baseKeys.includes(key)) return; 
        if (typeof mod[key] === 'function') ClientSystem[key] = mod[key].bind(mod);
        else Object.defineProperty(ClientSystem, key, { get: () => mod[key], set: (val) => { mod[key] = val; }, configurable: true });
    });
});

// ============================================================================
// 🔄 محرك المزامنة الحي (Real-time Firebase Sync Engine)
// ============================================================================
ClientSystem.initFirebaseListeners = function() {
    console.log("📡 جاري تشغيل مستمعات السحابة الحية (النظام التفاعلي)...");
    this.clearFirebaseListeners(); 
    
    if (DB_KEYS.SETTINGS) {
        this.activeListeners.push(StoreDB.listenCollection(DB_KEYS.SETTINGS, (data) => {
            const incoming = Array.isArray(data) ? (data[0] || null) : (data || null);
            if (!incoming) return;
            
            const serverVersion = String(incoming.appVersion || '0');
            const localVersion = localStorage.getItem('telecard_app_version') || window.TELECARD_VERSION || '0';
            
            if (serverVersion !== '0' && serverVersion !== localVersion) {
                console.warn(`🔄 الإدارة أصدرت تحديثاً إجبارياً! (من ${localVersion} إلى ${serverVersion})`);
                UIManager?.showToast?.('يتوفر تحديث جديد للمتجر. جاري إعادة التحميل...', 'success');
                setTimeout(async () => {
                    localStorage.setItem('telecard_app_version', serverVersion);
                    try { if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('TeleCardStoreDB'); } catch(e){}
                    if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); for (let r of regs) await r.unregister(); }
                    window.location.reload(true);
                }, 2000);
                return;
            }

            LiveStoreData.settings = incoming;
            RenderHelpers.init({ settings: LiveStoreData.settings, rates: LiveStoreData.rates || [], offers: LiveStoreData.offers || [], isStore: true });
            this.syncUser?.(); this.updateDisplayCurrencyUI?.(this.selectedCurr); this.applyStoreIdentity?.();
        }));
    }
    
    if (DB_KEYS.ALERTS) {
        this.activeListeners.push(StoreDB.listenCollection(DB_KEYS.ALERTS, (data) => {
            LiveStoreData.alerts = _normalizeDataTime(Array.isArray(data) ? data : []);
            requestAnimationFrame(() => { this.processAndDisplayAlerts?.(); this.updateNotifBadges?.(); });
        }));
    }
    
    if (!auth) return; 
    
    onAuthStateChanged(auth, (firebaseUser) => {
        this.userAuthListeners.forEach(unsub => { if (typeof unsub === 'function') unsub(); });
        this.userAuthListeners = [];

        if (firebaseUser) {
            const uidStr = firebaseUser.uid;
            localStorage.setItem('telecard_active_user_uid', uidStr);
            
            if (this.listenToUserNotifications) {
                const notifUnsub = this.listenToUserNotifications(() => requestAnimationFrame(() => { this.processAndDisplayAlerts?.(); this.updateNotifBadges?.(); }));
                if (notifUnsub) this.userAuthListeners.push(notifUnsub);
            }

            if (StoreDB.listenDoc) {
                this.userAuthListeners.push(StoreDB.listenDoc(DB_KEYS.USERS, uidStr, (userData) => {
                    if (userData) {
                        if (userData.isBanned || userData.isIpBanned) {
                            this.triggerLiveBanAlert?.(userData.banReason || 'نعتذر، تم حظر حسابك.');
                            signOut(auth).catch(()=>{}); this.logout?.(); return; 
                        }
                        LiveStoreData.users = [userData];
                        requestAnimationFrame(() => { this.syncUser?.(); this.updateDisplayBalance?.(); this.updateNotifBadges?.(); });
                    }
                }));
            }
            
            if (StoreDB.listenQuery) {
                // 🛡️ [تحديث المزامنة]: الاعتماد الكلي على Firestore Cache لمنع ثغرة البيانات المحذوفة والخالدة
                this.userAuthListeners.push(StoreDB.listenQuery(DB_KEYS.ORDERS, ['userId', '==', uidStr], 'time', 30, (data, lastDoc) => {
                    LiveStoreData.orders = _normalizeDataTime(Array.isArray(data) ? data : []);
                    this.cursors = this.cursors || {}; this.cursors.orders = data.length < 30 ? null : lastDoc;
                    requestAnimationFrame(() => this.renderOrders?.(true));
                }));
                
                this.userAuthListeners.push(StoreDB.listenQuery(DB_KEYS.DEPOSITS, ['userId', '==', uidStr], 'time', 30, (data, lastDoc) => {
                    LiveStoreData.deposits = _normalizeDataTime(Array.isArray(data) ? data : []);
                    this.cursors = this.cursors || {}; this.cursors.deposits = data.length < 30 ? null : lastDoc;
                    requestAnimationFrame(() => { this.renderWallet?.(true); this.renderPayments?.(true); });
                }));
            }
        } else {
            console.log("👤 العميل زائر. تم تنظيف المستمعات.");
            localStorage.removeItem('telecard_active_user_uid');
            LiveStoreData.users = []; LiveStoreData.orders = []; LiveStoreData.deposits = [];
            this.cursors = {}; this.syncUser?.(); this.updateDisplayBalance?.();
        }
    });
};

// ============================================================================
// 🚀 إقلاع النظام المدمج (Smart Boot)
// ============================================================================
ClientSystem.init = async function() {
    this.isReady = true;
    console.log("🚀 جاري إقلاع النظام (نمط مكافحة الانهيار + الكاش الذكي O(1) Reads)...");
    
    try {
        const currentVersion = window.TELECARD_VERSION || "1.0.0";
        const savedVersion = localStorage.getItem('telecard_app_version');

        if (savedVersion && savedVersion !== currentVersion) {
            console.warn(`🔄 تم اكتشاف تحديث محلي للمتجر! جاري التحديث من ${savedVersion} إلى ${currentVersion}...`);
            try { if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('TeleCardStoreDB'); } catch(e){}
            if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); for (let r of regs) await r.unregister(); }
            
            const activeUid = localStorage.getItem('telecard_active_user_uid');
            const theme = localStorage.getItem('telecard_theme');
            localStorage.clear();
            
            if (activeUid) localStorage.setItem('telecard_active_user_uid', activeUid);
            if (theme) localStorage.setItem('telecard_theme', theme);
            localStorage.setItem('telecard_app_version', currentVersion);
            window.location.reload(true); return; 
        } else if (!savedVersion) {
            localStorage.setItem('telecard_app_version', currentVersion);
        }
    } catch (e) {}

    try {
        DataManager.loadPrefs?.();
        DataManager.syncUser?.().catch(()=>{});
        UIManager.applySavedTheme?.();
        DataManager.selectedCurr = localStorage.getItem('telecard_display_currency') || LiveStoreData.settings?.defaultCurrency || 'USD';
        UIManager.updateDisplayCurrencyUI?.(DataManager.selectedCurr);
        UIManager.toggleHeroSection?.(true);
    } catch(e) {}

    try {
        if (UIManager.checkSystemStatus?.()) return;
        this.initGlobalListeners(); 

        await DataManager.initStoreCatalog();

        RenderHelpers.init({ settings: LiveStoreData.settings || {}, rates: LiveStoreData.rates || [], offers: LiveStoreData.offers || [], isStore: true });
        UIManager.applyStoreIdentity?.();
        
        requestAnimationFrame(() => {
            const splash = document.getElementById('global-splash-screen');
            if (splash) { splash.style.opacity = '0'; splash.style.visibility = 'hidden'; setTimeout(() => splash.remove(), 400); }
        });

        RenderManager.renderHome?.();
        UIManager.initSlider?.(); UIManager.renderTicker?.(); UIManager.updateProfileDisplay?.();

        const sName = LiveStoreData.settings?.storeName || LiveStoreData.settings?.name || 'MaliMor';
        const splashName = document.getElementById('splash-store-name');
        if (splashName) splashName.innerText = sName;
        localStorage.setItem('telecard_splash_name', sName);
// 🛡️ [تحديث الإقلاع]: جلب آمن للبيانات الثانوية لا يمسح الكاش في حال انقطاع النت
if (this.isReady && RenderManager) {
    const secKeys = ['COUPONS', 'COUNTRIES', 'PAYMENTS', 'BANNERS'];
    const promises = secKeys.map(k => StoreDB.getAll(DB_KEYS[k]).catch(() => []));
    
    Promise.all(promises).then(results => {
        secKeys.forEach((key, i) => {
            if (results[i] && results[i].length > 0) {
                LiveStoreData[key.toLowerCase()] = results[i];
            }
        });
        RenderManager.renderHome?.();
        UIManager.initSlider?.(); // 🚀 هذا هو السطر الذي يوقظ البنرات فوراً!
        UIManager.updateDisplayBalance?.();
    });
}
} catch (e) {}

try {
    setTimeout(() => DataManager.injectSilentSensor?.(), 3000);
    UIManager.updateDisplayBalance?.();
    
    requestIdleCallback(() => {
        if (!this.isReady) return;
        try { this.initFirebaseListeners(); } catch (e) {}
        try { CalendarApp?.init(); } catch (e) {}
        
        ['updateSidebarText', 'initSupportButton', 'applyFontSettings', 'refreshCurrencyMenuFlags', 'renderSettingsUI', 'loadUserImageAutomatically', 'restoreDisplayState', 'setupMainContentClickDetector', 'initSwipeGestures']
        .forEach(m => { try { UIManager[m]?.(); } catch (e) {} });
        
        Components.initBottomNavSync?.();
        UIManager.checkKycCelebration?.();
    }, { timeout: 2000 });
    
} catch (e) {}
};

window.ClientSystem = ClientSystem;
window.CalendarApp = CalendarApp;
// 🟢 نقطة الانطلاق
(function() {
    const startApp = () => { if (window.ClientSystem?.init) window.ClientSystem.init(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApp);
    else startApp();
})();
