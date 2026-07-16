// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (script.js) - الإصدار الماسي الخارق (V11.3 - Enterprise Edition) 💎
// 🎯 الوظيفة: الإقلاع الذكي، حقن الاعتمادية، إدارة الأحداث (Event Delegation)، والمزامنة الحية
// 🌟 التحديثات الجديدة: تفعيل التحديث اللحظي المباشر (Real-time UI Sync) وإجبار الرسم الفوري
// ============================================================================

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

// 🕒 تسوية وتحويل التواريخ لتناسب العرض (تم تحسين الأداء لتقليل استهلاك الذاكرة O(N) Mutation)
const _normalizeDataTime = (dataArray) => {
    if (!Array.isArray(dataArray)) return [];
    return dataArray.map(item => {
        if (item.time && typeof item.time !== 'object') item.time = RenderHelpers.parseTime(item.time);
        if (item.createdAt && typeof item.createdAt !== 'object') item.createdAt = RenderHelpers.parseTime(item.createdAt);
        if (item.actionTime && typeof item.actionTime !== 'object') item.actionTime = RenderHelpers.parseTime(item.actionTime);
        return item;
    });
};

const ClientSystem = { 
    isReady: false,
    activeListeners: [], 
    _listenersBound: false, 

    clearFirebaseListeners: function() {
        if (this.activeListeners && this.activeListeners.length > 0) {
            this.activeListeners.forEach(unsubscribe => {
                if (typeof unsubscribe === 'function') unsubscribe();
            });
            this.activeListeners = [];
        }
    },

    // 🔒 نظام الحماية بالبصمة (WebAuthn / Biometrics)
    enforceBiometricLock: async function() {
        const lockScreen = document.getElementById('biometric-lock-screen');
        if (!lockScreen) return false;
        
        const isBiometricRequired = DataManager.user?.biometricEnabled === true;
        const savedRawId = localStorage.getItem('telecard_biometric_key');

        if (!window.PublicKeyCredential || !savedRawId) {
            if (isBiometricRequired) {
                lockScreen.classList.remove('active');
                if (typeof this.showToast === 'function') this.showToast('مفتاح البصمة مفقود. يرجى تسجيل الدخول.', 'error');
                if (DataManager.logout) DataManager.logout();
                return false;
            }
            lockScreen.classList.remove('active');
            return true;
        }
        
        try {
            const retryBtn = document.getElementById('btn-biometric-retry');
            if (retryBtn) {
                retryBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحقق...';
                retryBtn.disabled = true;
            }
            
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            
            const rawIdBytes = new Uint8Array(savedRawId.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            
            await navigator.credentials.get({
                publicKey: {
                    challenge: challenge, timeout: 60000, userVerification: "required",
                    allowCredentials: [{ type: "public-key", id: rawIdBytes }]
                }
            });
            
            lockScreen.classList.remove('active');
            return true;
            
        } catch (error) {
            const retryBtn = document.getElementById('btn-biometric-retry');
            if (retryBtn) {
                retryBtn.innerHTML = '<i class="fa-solid fa-fingerprint"></i> المحاولة مجدداً';
                retryBtn.disabled = false;
            }
            return false;
        }
    },  

    // 🌐 إعداد مستشعرات الاتصال بالشبكة (الإنترنت)
    initNetworkSensors: function() {
        window.addEventListener('offline', () => {
            if (typeof this.showToast === 'function') this.showToast('انقطع الاتصال بالإنترنت. أنت تتصفح وضع عدم الاتصال.', 'warning');
            document.body.classList.add('is-offline');
        });

        window.addEventListener('online', () => {
            document.body.classList.remove('is-offline');
            if (typeof this.showToast === 'function') this.showToast('عاد الاتصال بالإنترنت! جاري المزامنة...', 'success');
            if (this.isReady) {
                try { this.initFirebaseListeners(); } catch(e){}
                if (StoreDB && typeof StoreDB.callFunction === 'function') {
                    StoreDB.callFunction('getServerTime').then(timeRes => {
                        if (timeRes && timeRes.serverTime && DataManager) {
                            DataManager.serverTimeOffset = timeRes.serverTime - Date.now();
                        }
                    }).catch(()=>{});
                }
            }
        });
    },

    // 🎛️ إدارة الأحداث المركزية (Event Delegation) لتوفير الرام
    initGlobalListeners: function() {
        if (this._listenersBound) return;
        this._listenersBound = true;
        this.initNetworkSensors(); 

        document.body.addEventListener('touchstart', () => {}, { passive: true });

        window.addEventListener('contextmenu', (e) => {
            if (e.target.closest('[data-action], .cat-card, .product-card')) e.preventDefault();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const target = e.target;
                const action = target.getAttribute('data-action');
                if (action === 'store-search-enter' && typeof this.applyStoreSearch === 'function') { this.sfx?.('nav'); this.applyStoreSearch(); }
                if (action === 'order-search-enter' && typeof this.renderOrders === 'function') { this.sfx?.('nav'); this.renderOrders(); }
                if (action === 'wallet-search-enter' && typeof this.renderWallet === 'function') { this.sfx?.('nav'); this.renderWallet(); }
                if (action === 'pay-search-enter' && typeof this.renderPayments === 'function') { this.sfx?.('nav'); this.renderPayments(); }
            }
        });

        document.addEventListener('change', (e) => {
            const target = e.target;
            const action = target.getAttribute('data-action');
            if (action === 'change-currency' && typeof this.setDisplayCurrency === 'function') this.setDisplayCurrency(target.value);
            if (action === 'kyc-upload-front' && typeof this.handleKycImage === 'function') this.handleKycImage(target, 'kyc-prev-front');
            if (action === 'kyc-upload-back' && typeof this.handleKycImage === 'function') this.handleKycImage(target, 'kyc-prev-back');
            if (action === 'kyc-upload-selfie' && typeof this.handleKycImage === 'function') this.handleKycImage(target, 'kyc-prev-selfie');
            if (action === 'upload-avatar' && typeof this.handleAvatarChange === 'function') this.handleAvatarChange(e);
        });

        document.addEventListener('input', (e) => {
            const target = e.target;
            const action = target.getAttribute('data-action');
            if (action === 'filter-countries' && typeof this.filterCountries === 'function') this.filterCountries(target.value);
            if (action === 'check-coupon-state' && typeof this.checkInputState === 'function') this.checkInputState();
        });

        document.addEventListener('click', (e) => {
            const packageWrapper = document.getElementById('pkg-custom-dropdown');
            if (packageWrapper && packageWrapper.classList.contains('open') && !packageWrapper.contains(e.target) && !e.target.closest('.dropdown-trigger')) {
                packageWrapper.classList.remove('open');
            }

            const walletDrawer = document.getElementById('walletStatsDrawer');
            if (walletDrawer && walletDrawer.classList.contains('active')) {
                const isClickInsideDrawer = walletDrawer.contains(e.target);
                const isClickOnToggleButton = e.target.closest('.detail-arrow') || e.target.closest('.wallet-toggle-btn') || e.target.closest('[data-action="toggle-wallet-stats"]'); 
                if (!isClickInsideDrawer && !isClickOnToggleButton && typeof this.closeWalletStats === 'function') {
                    this.closeWalletStats(); 
                }
            }
        }, true); 

        // 📘 قاموس الأحداث المركزي
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
            'logout': () => { if (typeof this.logout === 'function') this.logout(); else if (DataManager && typeof DataManager.logout === 'function') DataManager.logout(); },
            'enforce-biometric': () => this.enforceBiometricLock?.(),
            'close-orders': () => this.closeOrders?.(),
            'close-wallet': () => this.closeWallet?.(),
            'close-mypayments': () => this.closeMyPayments?.(),
            'close-settings': () => this.closeSettings?.(),
            'close-balance': () => this.closeBalanceModal?.(),
            'back-balance-step': () => { if (typeof this.backToPayMethods === 'function') this.backToPayMethods(); },
            'close-purchase': () => this.closeModal?.('purchase'),
            'close-success': () => this.closeModal?.('success'),
            'close-purchase-success': () => this.closePurchaseSuccess?.(), 
            'open-kyc-upload': () => { this.closeSidebar?.(); this.openModal?.('kyc-upload'); },
            'open-kyc-status': (e, id, val, target) => { this.closeSidebar?.(); const state = target.getAttribute('data-state'); this.openKycStatusModal?.(state); },
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
            
            // 🛡️ حماية زر الشراء الديناميكية
            'confirm-purchase': async (e, id, val, target) => { 
                if (target.disabled) return;
                target.disabled = true;
                const originalContent = target.innerHTML;
                target.innerHTML = '<span class="btn-content"><i class="fa-solid fa-spinner fa-spin"></i> جاري التنفيذ...</span>';
                try {
                    if (typeof this.handlePurchaseSubmit === 'function') await this.handlePurchaseSubmit(); 
                } finally {
                    if (target) {
                        target.disabled = false;
                        target.innerHTML = originalContent;
                    }
                }
            },
            
            'nav-orders-from-success': () => { this.closePurchaseSuccess?.(); this.openOrders?.(); },
            'navigate-orders-success': () => { this.closeModal?.('purchase-success'); this.openOrders?.(); }, 
            'select-pay': (e, id) => this.selectPay?.(id),
            
            // 🛡️ حماية زر الإيداع الديناميكية
            'submit-balance': async (e, id, val, target, dataType, dataCurr) => { 
                if (target.disabled) return;
                target.disabled = true;
                const originalContent = target.innerHTML;
                target.innerHTML = '<span class="btn-content"><i class="fa-solid fa-spinner fa-spin"></i> جاري التنفيذ...</span>';
                try {
                    if (typeof this.handleBalanceSubmit === 'function') await this.handleBalanceSubmit(dataCurr); 
                } finally {
                    if (target) {
                        target.disabled = false;
                        target.innerHTML = originalContent;
                    }
                }
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
            'trigger-click': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen, dataTarget) => { const trg = document.getElementById(dataTarget); if (trg) trg.click(); },
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
            
            // 🚀 تصدير الفواتير المركزية
            'export-receipt': (e, id, val, target) => {
                e.preventDefault(); e.stopPropagation();
                if (RenderManager && typeof RenderManager.exportReceipt === 'function' && target.closest('.nm-btn-print-magic')) {
                    RenderManager.exportReceipt(id, target);
                } else if (RenderManager && typeof RenderManager.exportPaymentReceipt === 'function' && target.closest('.btn-receipt-export')) {
                    RenderManager.exportPaymentReceipt(id, target);
                } else if (typeof this.exportReceipt === 'function') {
                    this.exportReceipt(id, target);
                }
            },
            
            // إدارة الإشعارات
            'mark-all-read': () => {
                const notifContainer = document.getElementById('notif-center-list');
                if (notifContainer) {
                    const topBar = notifContainer.querySelector('.nc-top-action-bar');
                    if (topBar) topBar.style.display = 'none';
                    
                    const unreadItems = notifContainer.querySelectorAll('.nc-item.unread');
                    unreadItems.forEach(item => {
                        item.classList.remove('unread');
                        item.classList.add('is-read');
                        const redDot = item.querySelector('.unread-indicator-dot');
                        if (redDot) redDot.style.display = 'none';
                    });
                }
                if (typeof this.markAllNotificationsRead === 'function') this.markAllNotificationsRead();
            },
            'mark-single-read': (e, id) => {
    e.stopPropagation();
    const targetItem = e.target.closest('.nc-item');
    
    if (targetItem && targetItem.classList.contains('unread')) {
        // 1. تغيير الشكل إلى مقروء
        targetItem.classList.remove('unread');
        targetItem.classList.add('is-read');
        const redDot = targetItem.querySelector('.unread-indicator-dot');
        if (redDot) redDot.style.display = 'none';
        
        // 🚀 2. الإصلاح: إنقاص العداد وإخفاء الزر إذا وصل للصفر
        const notifContainer = document.getElementById('notif-center-list');
        if (notifContainer) {
            const countNumEl = notifContainer.querySelector('.nc-unread-count-num');
            const topBar = notifContainer.querySelector('.nc-top-action-bar');
            
            if (countNumEl) {
                let currentCount = parseInt(countNumEl.innerText) || 0;
                currentCount = Math.max(0, currentCount - 1);
                
                if (currentCount > 0) {
                    countNumEl.innerText = currentCount;
                } else {
                    if (topBar) topBar.style.display = 'none';
                }
            }
        }
    }
    
    if (typeof this.markSingleNotificationRead === 'function') this.markSingleNotificationRead(id);
    else if (DataManager && typeof DataManager.markSingleNotificationRead === 'function') DataManager.markSingleNotificationRead(id);
    
    if (targetItem && targetItem.hasAttribute('data-target-id')) {
        const targetId = targetItem.getAttribute('data-target-id');
        const jumpType = targetItem.getAttribute('data-jump-type') || 'order';
        if (typeof this.openDetail === 'function') this.openDetail(e, jumpType, targetId);
    }
}        };

        // الموجه الرئيسي للنقرات
        document.body.addEventListener('click', (e) => {
            const target = e.target;
            
            if (target.classList.contains('pm-overlay') || target.classList.contains('modal-overlay')) {
                e.preventDefault();
                const modalId = target.id.replace('-overlay', '');
                if (typeof this.closeModal === 'function') this.closeModal(modalId);
                if (typeof this.sfx === 'function') this.sfx('nav');
                return;
            }
            
            const actionBtn = target.closest('[data-action]');
            if (!actionBtn) return;
            
            const action = actionBtn.getAttribute('data-action');
            const prodId = actionBtn.getAttribute('data-id');
            
            if (action === 'open-product') {
                const isClickOnImage = target.closest('.card-image');
                if (isClickOnImage) {
                    if (this._prodClickTimer && this._clickedProdId === prodId) {
                        clearTimeout(this._prodClickTimer);
                        this._prodClickTimer = null;
                        this._clickedProdId = null;
                        if (typeof this.triggerMagicFavorite === 'function') this.triggerMagicFavorite(e, prodId);
                        return;
                    } else {
                        if (this._prodClickTimer) clearTimeout(this._prodClickTimer);
                        this._clickedProdId = prodId;
                        
                        const btnVal = actionBtn.getAttribute('data-val');
                        const btnType = actionBtn.getAttribute('data-type');
                        const btnCurr = actionBtn.getAttribute('data-curr');
                        const btnName = actionBtn.getAttribute('data-name');
                        const btnCode = actionBtn.getAttribute('data-code');
                        const btnLen = actionBtn.getAttribute('data-len');
                        const btnTarget = actionBtn.getAttribute('data-target');
                        const btnText = actionBtn.getAttribute('data-text');

                        this._prodClickTimer = setTimeout(() => {
                            this._prodClickTimer = null;
                            this._clickedProdId = null;
                            if (typeof this.sfx === 'function') this.sfx('nav');
                            const handler = ActionDictionary[action];
                            if (handler) {
                                try { handler(e, prodId, btnVal, actionBtn, btnType, btnCurr, btnName, btnCode, btnLen, btnTarget, btnText); } 
                                catch (err) { this.logCloudError(action, err); }
                            }
                        }, 250);
                        return;
                    }
                }
            }
            
            if (typeof this.sfx === 'function') {
                const silentActions = ['copy-text', 'apply-coupon', 'submit-balance', 'confirm-purchase', 'trigger-click', 'update-simple-qty', 'delete-avatar', 'open-product', 'mark-single-read'];
                if (!silentActions.includes(action)) {
                    this.sfx('nav');
                }
            }
            
            if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.tagName !== 'SELECT') {
                target.blur();
            }
            
            const handler = ActionDictionary[action];
            if (handler) {
                try {
                    const result = handler(
                        e,
                        prodId,
                        actionBtn.getAttribute('data-val'),
                        actionBtn,
                        actionBtn.getAttribute('data-type'),
                        actionBtn.getAttribute('data-curr'),
                        actionBtn.getAttribute('data-name'),
                        actionBtn.getAttribute('data-code'),
                        actionBtn.getAttribute('data-len'),
                        actionBtn.getAttribute('data-target'),
                        actionBtn.getAttribute('data-text')
                    );
                    
                    if (result instanceof Promise) {
                        result.catch(err => this.logCloudError(action, err));
                    }
                } catch (err) {
                    this.logCloudError(action, err);
                }
            }
        });
    },

    // ☁️ مسجل الأخطاء السحابي
    logCloudError: function(action, err) {
        console.error(`🚨 خطأ أثناء تنفيذ الإجراء [${action}]:`, err);
        if (StoreDB && typeof StoreDB.addDoc === 'function') {
            StoreDB.addDoc('SYSTEM_ERRORS', {
                action: action,
                errorMsg: err.message,
                stack: err.stack,
                userId: DataManager?.user?.uid || 'guest',
                device: navigator.userAgent,
                time: new Date().toISOString()
            }).catch(()=>{}); 
        }
        if (typeof this.showToast === 'function') this.showToast('حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.', 'error');
    }
};

// 🔗 دمج الوحدات الفرعية في كيان واحد عبر (Dependency Injection)
const baseKeys = Object.keys(ClientSystem);
const modules = [DataManager, UIManager, RenderManager, Components, Utils, UIFinance];
modules.forEach(mod => {
    if (!mod) return;
    Object.keys(mod).forEach(key => {
        if (baseKeys.includes(key)) return; 
        if (typeof mod[key] === 'function') {
            ClientSystem[key] = mod[key].bind(mod);
        } else {
            Object.defineProperty(ClientSystem, key, {
                get: () => mod[key],
                set: (val) => { mod[key] = val; },
                configurable: true
            });
        }
    });
});

// ============================================================================
// 🔄 محرك المزامنة الحي (Real-time Firebase Sync Engine)
// ============================================================================
ClientSystem.userAuthListeners = []; 

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
                if (typeof UIManager !== 'undefined' && UIManager.showToast) {
                    UIManager.showToast('يتوفر تحديث جديد للمتجر. جاري إعادة التحميل للحصول على أفضل تجربة...', 'success');
                }
                setTimeout(async () => {
                    localStorage.setItem('telecard_app_version', serverVersion);
                    if (typeof localforage !== 'undefined') await localforage.clear();
                    if ('serviceWorker' in navigator) {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        for (let r of regs) await r.unregister();
                    }
                    window.location.reload(true);
                }, 2000);
                return;
            }

            LiveStoreData.settings = incoming;
            RenderHelpers.init({ settings: LiveStoreData.settings, rates: LiveStoreData.rates || [], offers: LiveStoreData.offers || [], isStore: true });
            try { if (this.syncUser) this.syncUser(); } catch(e){}
            try { if (this.updateDisplayCurrencyUI) this.updateDisplayCurrencyUI(this.selectedCurr); } catch(e){}
            try { if (this.applyStoreIdentity) this.applyStoreIdentity(); } catch(e){}
        }));
    }
    
    if (DB_KEYS.ALERTS) {
        this.activeListeners.push(StoreDB.listenCollection(DB_KEYS.ALERTS, (data) => {
            LiveStoreData.alerts = _normalizeDataTime(Array.isArray(data) ? data : []);
            requestAnimationFrame(() => {
                try { if (this.processAndDisplayAlerts) this.processAndDisplayAlerts(); } catch(e){}
                try { if (this.updateNotifBadges) this.updateNotifBadges(); } catch(e){}
            });
        }));
    }
    
    if (!auth) return; 
    
    onAuthStateChanged(auth, (firebaseUser) => {
        if (this.userAuthListeners && this.userAuthListeners.length > 0) {
            this.userAuthListeners.forEach(unsubscribe => { if (typeof unsubscribe === 'function') unsubscribe(); });
            this.userAuthListeners = [];
        }

        if (firebaseUser) {
            const uidStr = firebaseUser.uid;
            localStorage.setItem('telecard_active_user_uid', uidStr);
            
            if (typeof this.listenToUserNotifications === 'function') {
                const notifUnsub = this.listenToUserNotifications(() => {
                    requestAnimationFrame(() => {
                        if (typeof this.processAndDisplayAlerts === 'function') this.processAndDisplayAlerts();
                        if (typeof this.updateNotifBadges === 'function') this.updateNotifBadges();
                    });
                });
                if (typeof notifUnsub === 'function') this.userAuthListeners.push(notifUnsub);
            }

            if (StoreDB.listenDoc) {
                this.userAuthListeners.push(StoreDB.listenDoc(DB_KEYS.USERS, String(uidStr), (userData) => {
                    if (userData) {
                        if (userData.isBanned === true || userData.isIpBanned === true) {
                            if (this.triggerLiveBanAlert) this.triggerLiveBanAlert(userData.banReason || 'نعتذر، تم حظر حسابك.');
                            signOut(auth).catch(()=>{});
                            if (this.logout) this.logout();
                            return; 
                        }
                        LiveStoreData.users = [userData];
                        requestAnimationFrame(() => {
                            try { if (this.syncUser) this.syncUser(); } catch(e){}
                            try { if (this.updateDisplayBalance) this.updateDisplayBalance(); } catch(e){}
                            try { if (this.updateNotifBadges) this.updateNotifBadges(); } catch(e){}
                        });
                    }
                }));
            }
            
            if (StoreDB.listenQuery) {
                this.userAuthListeners.push(StoreDB.listenQuery(DB_KEYS.ORDERS, ['userId', '==', String(uidStr)], 'time', 30, (data, lastDoc) => {
                    LiveStoreData.orders = _normalizeDataTime(Array.isArray(data) ? data : []);
                    this.cursors = this.cursors || {};
                    this.cursors.orders = data.length < 30 ? null : lastDoc;
                    
                    // 🚀 الإصلاح الماسي: إجبار الرسم الفوري بتمرير (true) لتخطي التأخير (Debounce)
                    requestAnimationFrame(() => { try { if (this.renderOrders) this.renderOrders(true); } catch(e){} });
                }));
                
                this.userAuthListeners.push(StoreDB.listenQuery(DB_KEYS.DEPOSITS, ['userId', '==', String(uidStr)], 'time', 30, (data, lastDoc) => {
                    LiveStoreData.deposits = _normalizeDataTime(Array.isArray(data) ? data : []);
                    this.cursors = this.cursors || {};
                    this.cursors.deposits = data.length < 30 ? null : lastDoc;
                    
                    requestAnimationFrame(() => {
                        // 🚀 الإصلاح الماسي: إجبار الرسم الفوري بتمرير (true) لتخطي التأخير (Debounce)
                        try { if (this.renderWallet) this.renderWallet(true); } catch(e){}
                        try { if (this.renderPayments) this.renderPayments(true); } catch(e){}
                    });
                }));
            }
        } else {
            console.log("👤 العميل زائر. تم تنظيف المستمعات الخاصة لتخفيف الضغط.");
            localStorage.removeItem('telecard_active_user_uid');
            LiveStoreData.users = []; LiveStoreData.orders = []; LiveStoreData.deposits = [];
            if (this.cursors) this.cursors = {}; 
            try { if (this.syncUser) this.syncUser(); } catch(e){}
            try { if (this.updateDisplayBalance) this.updateDisplayBalance(); } catch(e){}
        }
    });
};

// ============================================================================
// 🚀 إقلاع النظام المدمج (Smart Boot) - القاتل لفواتير فايربيز 💸
// ============================================================================
ClientSystem.init = async function() {
    this.isReady = true;
    console.log("🚀 جاري إقلاع النظام (نمط مكافحة الانهيار + الكاش الذكي O(1) Reads)...");
    
    try {
        const currentVersion = window.TELECARD_VERSION || "1.0.0";
        const savedVersion = localStorage.getItem('telecard_app_version');

        if (savedVersion && savedVersion !== currentVersion) {
            console.warn(`🔄 تم اكتشاف تحديث محلي للمتجر! (من ${savedVersion} إلى ${currentVersion}). جاري تنظيف الكاش العميق...`);
            if (typeof localforage !== 'undefined') await localforage.clear();

            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }

            const activeUid = localStorage.getItem('telecard_active_user_uid');
            const theme = localStorage.getItem('telecard_theme');
            localStorage.clear();
            
            if (activeUid) localStorage.setItem('telecard_active_user_uid', activeUid);
            if (theme) localStorage.setItem('telecard_theme', theme);
            
            localStorage.setItem('telecard_app_version', currentVersion);
            window.location.reload(true);
            return; 
            
        } else if (!savedVersion) {
            localStorage.setItem('telecard_app_version', currentVersion);
        }
    } catch (e) {
        console.error("خطأ في حارس الإصدارات:", e);
    }

    try {
        if (DataManager.loadPrefs) DataManager.loadPrefs();
        if (DataManager.syncUser) DataManager.syncUser().catch(()=>{});
        if (typeof UIManager.applySavedTheme === 'function') UIManager.applySavedTheme();
        const adminDefaultCurrency = (LiveStoreData.settings && LiveStoreData.settings.defaultCurrency) ? LiveStoreData.settings.defaultCurrency : 'USD';
        DataManager.selectedCurr = localStorage.getItem('telecard_display_currency') || adminDefaultCurrency;
        if (typeof UIManager.updateDisplayCurrencyUI === 'function') UIManager.updateDisplayCurrencyUI(DataManager.selectedCurr);
        if (typeof UIManager.toggleHeroSection === 'function') UIManager.toggleHeroSection(true);
    } catch(e) { console.warn("Boot Phase 1 Skip", e); }

    try {
        if (UIManager.checkSystemStatus && UIManager.checkSystemStatus()) return;
        this.initGlobalListeners(); 

        await DataManager.initStoreCatalog();

        RenderHelpers.init({ 
            settings: LiveStoreData.settings || {}, 
            rates: LiveStoreData.rates || [], 
            offers: LiveStoreData.offers || [], 
            isStore: true 
        });

        if (typeof UIManager.applyStoreIdentity === 'function') UIManager.applyStoreIdentity();
        
        requestAnimationFrame(() => {
            const splash = document.getElementById('global-splash-screen');
            if (splash) { 
                splash.style.opacity = '0'; 
                splash.style.visibility = 'hidden'; 
                setTimeout(() => { if (splash.parentNode) splash.remove() }, 400); 
            }
        });

        if (RenderManager && typeof RenderManager.renderHome === 'function') RenderManager.renderHome();
        if (typeof UIManager.initSlider === 'function') UIManager.initSlider();
        if (typeof UIManager.renderTicker === 'function') UIManager.renderTicker(); 
        if (typeof UIManager.updateProfileDisplay === 'function') UIManager.updateProfileDisplay();

        const sName = LiveStoreData.settings?.storeName || LiveStoreData.settings?.name || 'المتجر';
        const splashName = document.getElementById('splash-store-name');
        if (splashName) splashName.innerText = sName;
        localStorage.setItem('telecard_splash_name', sName);

        setTimeout(() => {
            if (!this.isReady) return; 
            
            const secondaryKeys = ['COUPONS', 'COUNTRIES', 'PAYMENTS', 'BANNERS'];
            Promise.allSettled(secondaryKeys.map(k => StoreDB.getAll(DB_KEYS[k]))).then(secResults => {
                if (!this.isReady || typeof RenderManager === 'undefined') return;
                
                secondaryKeys.forEach((keyName, i) => {
                    const property = keyName.toLowerCase();
                    if (secResults[i].status === 'fulfilled' && secResults[i].value) {
                        LiveStoreData[property] = [...secResults[i].value];
                    }
                });
                
                if (RenderManager && typeof RenderManager.renderHome === 'function') RenderManager.renderHome();
                if (UIManager && typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
            });
        }, 1500);

    } catch(e) { console.warn("Boot Phase 2 (Smart Cache) Skip", e); }

    try {
        if (DataManager && typeof DataManager.injectSilentSensor === 'function') setTimeout(() => { DataManager.injectSilentSensor(); }, 3000);
        if (UIManager && typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
        
        setTimeout(() => {
            if (!this.isReady) return; 
            
            try { this.initFirebaseListeners(); } catch(e){}
            try { if (CalendarApp && CalendarApp.init) CalendarApp.init(); } catch(e){}
            
            const uiInitMethods = ['updateSidebarText', 'initSupportButton', 'applyFontSettings', 'refreshCurrencyMenuFlags', 'renderSettingsUI', 'loadUserImageAutomatically', 'restoreDisplayState', 'setupMainContentClickDetector', 'initSwipeGestures'];
            uiInitMethods.forEach(method => { try { if (typeof UIManager[method] === 'function') UIManager[method](); } catch(e){} });
            
            try { if (Components && Components.initBottomNavSync) Components.initBottomNavSync(); } catch(e){}
            try { if (typeof UIManager.checkKycCelebration === 'function') UIManager.checkKycCelebration(); } catch(e){}
            
            try { 
                if (navigator.onLine && StoreDB && typeof StoreDB.callFunction === 'function') {
                    StoreDB.callFunction('getServerTime').then(timeRes => { 
                        if (timeRes && timeRes.serverTime) DataManager.serverTimeOffset = timeRes.serverTime - Date.now(); 
                    }).catch(()=>{}); 
                }
            } catch(e){}
        }, 800);
    } catch(e) { console.warn("Boot Phase 3 Skip", e); }
};

window.ClientSystem = ClientSystem;
window.CalendarApp = CalendarApp;

// 🟢 نقطة الانطلاق (Entry Point)
(function() {
    const startApp = () => { if (window.ClientSystem && window.ClientSystem.init) window.ClientSystem.init(); };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApp);
    } else {
        startApp();
    }
})();