// ============================================================================
// 🧠 المحرك الرئيسي للمتجر (script.js) - النسخة المدرعة للإنتاج V5.1
// 🎯 الوظيفة: الإقلاع الشامل، حقن الاعتمادية، ومحرك المزامنة الحي (Real-time)
// 🚀 التحديث: دمج المراقبة الحية للحظر (Live Ban Terminator) + البصمة الحيوية
// ============================================================================

import { auth } from './core/firebaseAdapter.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { DB_KEYS } from './config.js';
import { Utils } from './utils.js';
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import { RenderManager } from './renderManager.js';
import { Components, CalendarApp } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';

// 🌟 مُطهر البيانات السحابية (آمن ولا ينهار مع المصفوفات الفارغة)
const _normalizeDataTime = (dataArray) => {
    if (!Array.isArray(dataArray)) return [];
    return dataArray.map(item => {
        let normalizedItem = { ...item };
        if (normalizedItem.time) normalizedItem.time = RenderHelpers.parseTime(normalizedItem.time);
        if (normalizedItem.createdAt) normalizedItem.createdAt = RenderHelpers.parseTime(normalizedItem.createdAt);
        if (normalizedItem.actionTime) normalizedItem.actionTime = RenderHelpers.parseTime(normalizedItem.actionTime);
        return normalizedItem;
    });
};

const ClientSystem = { 
    isReady: false,
    activeListeners: [], 

    clearFirebaseListeners: function() {
        if (this.activeListeners && this.activeListeners.length > 0) {
            this.activeListeners.forEach(unsubscribe => {
                if (typeof unsubscribe === 'function') unsubscribe();
            });
            this.activeListeners = [];
            console.log("🧹 تم تنظيف المستمعات السحابية السابقة بنجاح.");
        }
    },

    // 🛡️ دالة الحارس: تنفيذ قراءة البصمة للمتجر
    enforceBiometricLock: async function() {
        const lockScreen = document.getElementById('biometric-lock-screen');
        if (!lockScreen) return false;

        try {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            
            const savedRawId = localStorage.getItem('telecard_biometric_key');
            if (!savedRawId) throw new Error("No credential ID found");

            const rawIdBytes = new Uint8Array(savedRawId.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

            await navigator.credentials.get({
                publicKey: {
                    challenge: challenge,
                    timeout: 60000,
                    userVerification: "required",
                    allowCredentials: [{
                        type: "public-key",
                        id: rawIdBytes
                    }]
                }
            });

            lockScreen.classList.remove('active');
            return true;
        } catch (error) {
            console.error("Biometric Login Failed:", error);
            if (typeof this.showToast === 'function') this.showToast('تعذر التحقق من البصمة. يرجى المحاولة مجدداً أو تسجيل الخروج.', 'error');
            if (typeof this.sfx === 'function') this.sfx('error');
            return false;
        }
    },

    // ============================================================================
    // 🎯 نظام تفويض الأحداث المركزي المحدث والآمن (Global Event Delegation)
    // ============================================================================
    initGlobalListeners: function() {
        document.body.addEventListener('touchstart', () => {}, { passive: true });

        window.addEventListener('contextmenu', (e) => {
            if (e.target.closest('[data-action], .cat-card, .product-card')) {
                e.preventDefault();
            }
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
            
            if (action === 'change-currency' && typeof this.setDisplayCurrency === 'function') {
                this.setDisplayCurrency(target.value);
            }
            if (action === 'kyc-upload-front' && typeof this.handleKycImage === 'function') this.handleKycImage(target, 'kyc-prev-front');
            if (action === 'kyc-upload-back' && typeof this.handleKycImage === 'function') this.handleKycImage(target, 'kyc-prev-back');
            if (action === 'kyc-upload-selfie' && typeof this.handleKycImage === 'function') this.handleKycImage(target, 'kyc-prev-selfie');
            if (action === 'upload-avatar' && typeof this.handleAvatarChange === 'function') this.handleAvatarChange(e);
        });

        document.addEventListener('input', (e) => {
            const target = e.target;
            const action = target.getAttribute('data-action');
            
            if (action === 'filter-countries' && typeof this.filterCountries === 'function') {
                this.filterCountries(target.value);
            }
            
            if (action === 'check-coupon-state' && typeof this.checkInputState === 'function') {
                this.checkInputState();
            }
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

        let lastClickTime = 0;
        let lastClickTarget = null;

        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.getAttribute('data-action');
            const id = target.getAttribute('data-id');
            const val = target.getAttribute('data-val');
            const dataType = target.getAttribute('data-type');
            const dataCurr = target.getAttribute('data-curr');
            const dataName = target.getAttribute('data-name');
            const dataCode = target.getAttribute('data-code');
            const dataLen = target.getAttribute('data-len');
            const dataTarget = target.getAttribute('data-target');
            const dataText = target.getAttribute('data-text');

            if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.tagName !== 'SELECT') {
                target.blur();
            }

            const sfxActions = ['open-sidebar', 'open-notif-center', 'nav-home', 'nav-deposit', 'nav-payments', 'nav-orders', 'open-community', 'open-security-modal', 'nav-settings', 'open-rating', 'open-terms', 'open-support', 'logout', 'store-search-btn', 'render-orders', 'render-wallet', 'render-payments'];
            if (sfxActions.includes(action) && typeof this.sfx === 'function') this.sfx('nav');

            switch (action) {
                case 'nav-home': if (typeof this.renderHome === 'function') this.renderHome(); break;
                case 'nav-deposit': if (typeof this.navigateBalance === 'function') this.navigateBalance(); break;
                case 'nav-payments': if (typeof this.navigateMyPayments === 'function') this.navigateMyPayments(); break;
                case 'nav-orders': if (typeof this.navigateOrders === 'function') this.navigateOrders(); break;
                case 'nav-settings': if (typeof this.navigateSettings === 'function') this.navigateSettings(); break;
                case 'nav-wallet': if (typeof this.openWallet === 'function') this.openWallet(); break;
                
                case 'open-sidebar': if (typeof this.openSidebar === 'function') this.openSidebar(); break;
                case 'close-sidebar': if (typeof this.closeSidebar === 'function') this.closeSidebar(); break;
                case 'open-notif-center': if (typeof this.openNotifCenter === 'function') this.openNotifCenter(); break;
                case 'open-about': e.preventDefault(); if (typeof this.openAboutModal === 'function') this.openAboutModal(); break;
                case 'open-community': if (typeof this.openCommunityModal === 'function') this.openCommunityModal(); break;
                case 'open-security-modal': if (typeof this.openSecurityModal === 'function') this.openSecurityModal(); break;
                case 'open-rating': if (typeof this.openRatingModal === 'function') this.openRatingModal(); break;
                case 'open-terms': if (typeof this.openTermsModal === 'function') this.openTermsModal(); break;
                case 'open-support': if (typeof this.openSupport === 'function') this.openSupport(); break;
                case 'open-favorites': if (typeof this.openFavorites === 'function') this.openFavorites(); break;
                case 'open-add-balance': if (typeof this.openAddBalance === 'function') this.openAddBalance(); break;
                case 'open-tier-info': e.stopPropagation(); if (typeof this.openTierInfoModal === 'function') this.openTierInfoModal(); break;

                case 'logout': if (typeof this.logout === 'function') this.logout(); else if (DataManager && typeof DataManager.logout === 'function') DataManager.logout(); break;
                case 'enforce-biometric': if (typeof this.enforceBiometricLock === 'function') this.enforceBiometricLock(); break;

                case 'close-orders': if (typeof this.closeOrders === 'function') this.closeOrders(); break;
                case 'close-wallet': if (typeof this.closeWallet === 'function') this.closeWallet(); break;
                case 'close-mypayments': if (typeof this.closeMyPayments === 'function') this.closeMyPayments(); break;
                case 'close-settings': if (typeof this.closeSettings === 'function') this.closeSettings(); break;
                case 'close-balance': if (typeof this.closeBalanceModal === 'function') this.closeBalanceModal(); break;
                case 'close-purchase': if (typeof this.closeModal === 'function') this.closeModal('purchase'); break;
                case 'close-success': if (typeof this.closeModal === 'function') this.closeModal('success'); break;
                case 'close-tx-detail': if (typeof this.closeModal === 'function') this.closeModal('tx-detail'); break;
                case 'close-profile': if (typeof this.closeProfileInfo === 'function') this.closeProfileInfo(); break;
                case 'close-pay-receipt': if (typeof this.closePayReceipt === 'function') this.closePayReceipt(); break;
                case 'close-terms': if (typeof this.closeModal === 'function') this.closeModal('terms'); break;
                case 'close-identity': if (typeof this.closeModal === 'function') this.closeModal('identity'); break;
                case 'close-kyc-upload': if (typeof this.closeKycModal === 'function') this.closeKycModal(); break;
                case 'close-kyc-status': if (typeof this.closeKycStatusModal === 'function') this.closeKycStatusModal(); break;
                case 'close-notif-center': if (typeof this.closeNotifCenter === 'function') this.closeNotifCenter(); break;
                case 'close-tier-info': if (typeof this.closeModal === 'function') this.closeModal('tier-info'); break;
                case 'close-kyc-celebration': if (typeof this.closeModal === 'function') this.closeModal('kyc-celebration'); break;
                case 'close-community': if (typeof this.closeModal === 'function') this.closeModal('community'); break;
                case 'close-rating': if (typeof this.closeModal === 'function') this.closeModal('rating'); break;
                case 'close-about': if (typeof this.closeModal === 'function') this.closeModal('about'); break;
                case 'close-security-modal': if (typeof this.closeSecurityModal === 'function') this.closeSecurityModal(); break;
                case 'close-setup-2fa': if (typeof this.closeModal === 'function') this.closeModal('setup-2fa'); break;

                case 'toggle-currency-menu': if (typeof this.toggleDisplayCurrencyMenu === 'function') this.toggleDisplayCurrencyMenu(); break;
                case 'toggle-theme': if (typeof this.toggleTheme === 'function') this.toggleTheme(); break;
                case 'store-search-btn': if (typeof this.applyStoreSearch === 'function') this.applyStoreSearch(); break;
                case 'open-category': e.preventDefault(); if (typeof this.openCategory === 'function') this.openCategory(id); break;
                case 'open-product': {
                    e.preventDefault();
                    const currentTime = new Date().getTime();
                    const timeDiff = currentTime - lastClickTime;
                    if (timeDiff < 280 && lastClickTarget === id) {
                        clearTimeout(window.productClickTimer);
                        if (typeof this.triggerMagicFavorite === 'function') this.triggerMagicFavorite(e, id);
                        lastClickTime = 0; 
                    } else {
                        lastClickTime = currentTime;
                        lastClickTarget = id;
                        window.productClickTimer = setTimeout(() => {
                            if (typeof this.openProdModal === 'function') this.openProdModal(id);
                        }, 250);
                    }
                    break;
                }

                case 'toggle-fav-modal': if (typeof this.toggleFavoriteFromModal === 'function') this.toggleFavoriteFromModal(); break;
                case 'update-simple-qty': if (typeof this.updateSimpleQty === 'function') this.updateSimpleQty(parseInt(val)); break;
                case 'toggle-pkg-dropdown': target.parentElement.classList.toggle('open'); break;
                case 'toggle-coupon-ui': if (typeof this.toggleCoupon === 'function') this.toggleCoupon(target); break;
                case 'apply-coupon': if (typeof this.applyCoupon === 'function') this.applyCoupon(); break;
                case 'remove-coupon': if (typeof this.removeCoupon === 'function') this.removeCoupon(); break;
                case 'paste-coupon': if (typeof this.pasteText === 'function') this.pasteText(); break;
                case 'confirm-purchase': if (typeof this.handlePurchaseSubmit === 'function') this.handlePurchaseSubmit(); break;
                case 'nav-orders-from-success': if (typeof this.closePurchaseSuccess === 'function') { this.closePurchaseSuccess(); this.openOrders(); } break;

                case 'select-pay': if (typeof this.selectPay === 'function') this.selectPay(id); break;
                case 'submit-balance': if (typeof this.handleBalanceSubmit === 'function') this.handleBalanceSubmit(dataCurr); break;
                case 'toggle-accordion': e.preventDefault(); if (typeof this.togglePayDetail === 'function') this.togglePayDetail(target); break;
                case 'jump-transaction': if (typeof this.jumpToTransaction === 'function') this.jumpToTransaction(id, dataType); break;
                case 'open-detail': if (typeof this.openDetail === 'function') this.openDetail(e, dataType, id); break;
                
                case 'render-orders': if (typeof this.renderOrders === 'function') this.renderOrders(); break;
                case 'render-wallet': if (typeof this.renderWallet === 'function') this.renderWallet(); break;
                case 'render-payments': if (typeof this.renderPayments === 'function') this.renderPayments(); break;
                case 'filter-order': if (typeof this.setOrderFilter === 'function') this.setOrderFilter(val, target); break;
                case 'filter-wallet': if (typeof this.setWalletFilter === 'function') this.setWalletFilter(val, target); break;
                case 'filter-pay': if (typeof this.setPaymentFilter === 'function') this.setPaymentFilter(val, target); break;
                case 'toggle-wallet-stats': if (typeof this.toggleWalletStats === 'function') this.toggleWalletStats(target); break;

                case 'open-cal-order-start': if (CalendarApp && typeof CalendarApp.open === 'function') CalendarApp.open('order-date-start', e); break;
                case 'open-cal-order-end': if (CalendarApp && typeof CalendarApp.open === 'function') CalendarApp.open('order-date-end', e); break;
                case 'open-cal-wallet-start': if (CalendarApp && typeof CalendarApp.open === 'function') CalendarApp.open('wallet-date-start', e); break;
                case 'open-cal-wallet-end': if (CalendarApp && typeof CalendarApp.open === 'function') CalendarApp.open('wallet-date-end', e); break;
                case 'open-cal-pay-start': if (CalendarApp && typeof CalendarApp.open === 'function') CalendarApp.open('pay-date-start', e); break;
                case 'open-cal-pay-end': if (CalendarApp && typeof CalendarApp.open === 'function') CalendarApp.open('pay-date-end', e); break;
                case 'cal-adj-month': if (CalendarApp && typeof CalendarApp.adjustMonth === 'function') CalendarApp.adjustMonth(parseInt(val)); break;
                case 'cal-adj-year': if (CalendarApp && typeof CalendarApp.adjustYear === 'function') CalendarApp.adjustYear(parseInt(val)); break;
                case 'cal-toggle-list': if (CalendarApp && typeof CalendarApp.toggleList === 'function') CalendarApp.toggleList(dataTarget, e); break;

                case 'toggle-theme-pref': if (typeof this.toggleThemePref === 'function') this.toggleThemePref(); break;
                case 'toggle-sound-pref': if (typeof this.toggleSoundPref === 'function') this.toggleSoundPref(); break;
                case 'open-profile-sidebar': setTimeout(() => { if (typeof this.closeSidebar === 'function') this.closeSidebar(); if (typeof this.openProfileInfo === 'function') this.openProfileInfo(); }, 150); break;
                case 'open-wallet-sidebar': setTimeout(() => { if (typeof this.closeSidebar === 'function') this.closeSidebar(); if (typeof this.openWallet === 'function') this.openWallet(); }, 150); break;
                case 'open-identity-sidebar': setTimeout(() => { if (typeof this.closeSidebar === 'function') this.closeSidebar(); if (typeof this.openModal === 'function') this.openModal('identity'); }, 150); break;
                case 'trigger-click': const trg = document.getElementById(dataTarget); if (trg) trg.click(); break;
                case 'delete-avatar': if (typeof this.deleteProfileImage === 'function') this.deleteProfileImage(); break;
                case 'toggle-name-edit': if (typeof this.toggleNameEdit === 'function') this.toggleNameEdit(); break;
                case 'toggle-2fa': if (typeof this.handle2FAToggle === 'function') this.handle2FAToggle(); break;
                case 'toggle-biometric': if (typeof this.handleBiometricToggle === 'function') this.handleBiometricToggle(); break;
                case 'send-reset-pass': if (typeof this.sendResetPasswordEmail === 'function') this.sendResetPasswordEmail(); break;
                case 'submit-password-change': if (typeof this.handlePasswordSubmit === 'function') this.handlePasswordSubmit(); break;
                case 'request-account-delete': if (typeof this.toggleSecurityPref === 'function') this.toggleSecurityPref(); break;
                case 'verify-and-enable-2fa': if (typeof this.verifyAndEnable2FA === 'function') this.verifyAndEnable2FA(); break;

                case 'toggle-parent-dropdown': target.parentElement.classList.toggle('open'); break;
                case 'select-reg-currency': e.preventDefault(); if (typeof this.selectRegCurrency === 'function') this.selectRegCurrency(dataName, dataCode); break;
                case 'select-country': e.preventDefault(); if (typeof this.selectCountry === 'function') this.selectCountry(dataName, dataCode, dataLen); break;
                case 'save-identity': if (typeof this.saveIdentityData === 'function') this.saveIdentityData(); break;
                case 'submit-kyc': if (typeof this.submitKycData === 'function') this.submitKycData(); break;

                case 'select-rating': if (typeof this.selectRatingStar === 'function') this.selectRatingStar(parseInt(val)); break;
                case 'submit-rating-step': if (typeof this.submitRatingStep === 'function') this.submitRatingStep(); break;
                case 'submit-private-feedback': if (typeof this.submitPrivateFeedback === 'function') this.submitPrivateFeedback(); break;

                case 'copy-text':
                    e.preventDefault(); e.stopPropagation();
                    if (typeof this.copyToClipboard === 'function') this.copyToClipboard(dataText || target.innerText, target);
                    break;
                case 'show-phone-toast':
                    if (typeof this.showToast === 'function') this.showToast('هذا الرقم مرتبط بحسابك الأساسي. لتغييره يرجى التواصل مع الدعم الفني.', 'info');
                    break;
            }
        });
    }
};

// ============================================================================
// 🔗 دمج الوحدات (Facade Pattern)
// ============================================================================
const modules = [DataManager, UIManager, RenderManager, Components, Utils];
modules.forEach(mod => {
    if (!mod) return;
    Object.keys(mod).forEach(key => {
        if (key in ClientSystem) return; 
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
// 🔄 محرك المزامنة الحي (Real-time Firebase Sync Engine) - النسخة المحمية
// ============================================================================
ClientSystem.initFirebaseListeners = function() {
    console.log("📡 جاري تشغيل مستمعات السحابة الحية (المحمية)...");
    this.clearFirebaseListeners();
    
    // 1. المستمعات العامة
    if (DB_KEYS.SETTINGS) {
        const unsubSettings = StoreDB.listenCollection(DB_KEYS.SETTINGS, (data) => {
            const incoming = Array.isArray(data) ? (data[0] || null) : (data || null);
            if (!incoming && Object.keys(LiveStoreData.settings || {}).length > 0) return;
            
            LiveStoreData.settings = incoming || {};
            RenderHelpers.init({
                settings: LiveStoreData.settings || {},
                rates: LiveStoreData.rates || [],
                offers: LiveStoreData.offers || [],
                isStore: true
            });
            
            if (DataManager.syncUser) DataManager.syncUser();
            if (UIManager && typeof UIManager.updateDisplayCurrencyUI === 'function') {
                UIManager.updateDisplayCurrencyUI(DataManager.selectedCurr);
            }
            if (UIManager && typeof UIManager.applyStoreIdentity === 'function') {
                UIManager.applyStoreIdentity();
            }
        });
        this.activeListeners.push(unsubSettings);
    }
    
    if (DB_KEYS.ALERTS) {
        const unsubAlerts = StoreDB.listenCollection(DB_KEYS.ALERTS, (data) => {
            LiveStoreData.alerts = _normalizeDataTime(Array.isArray(data) ? data : []);
            requestAnimationFrame(() => {
                if (UIManager && typeof UIManager.processAndDisplayAlerts === 'function') UIManager.processAndDisplayAlerts();
                if (UIManager && typeof UIManager.updateNotifBadges === 'function') UIManager.updateNotifBadges();
            });
        });
        this.activeListeners.push(unsubAlerts);
    }
    
    // 🌟 2. المستمعات الخاصة + الترقيم الاحترافي والمراقبة الحية للحظر
    onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
            console.log("🔐 تم تأكيد الهوية. جاري جلب أحدث البيانات المالية...");
            const uidStr = firebaseUser.uid;
            localStorage.setItem('telecard_active_user_uid', uidStr);
            
            DataManager.cursors = DataManager.cursors || {};
            
            if (StoreDB.listenDoc) {
                const unsubUser = StoreDB.listenDoc(DB_KEYS.USERS, String(uidStr), (userData) => {
                    if (userData) {
                        // 🛑 [الدرع الأمني - المراقبة الحية]: التحقق الفوري واللحظي من حالة الحظر
                        if (userData.isBanned === true || userData.isIpBanned === true) {
                            console.error("🚨 LIVE BAN DETECTED: Terminating session...");
                            
                            if (UIManager && typeof UIManager.triggerLiveBanAlert === 'function') {
                                UIManager.triggerLiveBanAlert(userData.banReason || 'نعتذر، تم حظر حسابك من قبل الإدارة. سيتم إيقاف الجلسة حالاً.');
                            }
                            
                            // إعدام الجلسة بعد 4 ثوانٍ ليتمكن العميل من قراءة سبب الحظر
                            setTimeout(() => {
                                if (DataManager && typeof DataManager.logout === 'function') {
                                    DataManager.logout();
                                }
                            }, 4000);
                            
                            return; // إيقاف تنفيذ باقي الكود لمنع أي تسرب للبيانات
                        }

                        LiveStoreData.users = [userData];
                        requestAnimationFrame(() => {
                            if (DataManager.syncUser) DataManager.syncUser();
                            if (UIManager && typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
                            
                            if (UIManager && typeof UIManager.updateNotifBadges === 'function') UIManager.updateNotifBadges();
                            if (UIManager && typeof UIManager.processAndDisplayAlerts === 'function') UIManager.processAndDisplayAlerts();
                        });
                    }
                });
                this.activeListeners.push(unsubUser);
            }
            
            if (StoreDB.listenQuery) {
                const unsubOrders = StoreDB.listenQuery(DB_KEYS.ORDERS, ['userId', '==', String(uidStr)], 'time', 30, (data, lastDoc) => {
                    LiveStoreData.orders = _normalizeDataTime(Array.isArray(data) ? data : []);
                    DataManager.cursors.orders = data.length < 30 ? null : lastDoc;
                    requestAnimationFrame(() => {
                        if (RenderManager && typeof RenderManager.renderOrders === 'function') RenderManager.renderOrders();
                    });
                });
                this.activeListeners.push(unsubOrders);
                
                const unsubDeposits = StoreDB.listenQuery(DB_KEYS.DEPOSITS, ['userId', '==', String(uidStr)], 'time', 30, (data, lastDoc) => {
                    LiveStoreData.deposits = _normalizeDataTime(Array.isArray(data) ? data : []);
                    DataManager.cursors.deposits = data.length < 30 ? null : lastDoc;
                    requestAnimationFrame(() => {
                        if (RenderManager && typeof RenderManager.renderWallet === 'function') RenderManager.renderWallet();
                        if (RenderManager && typeof RenderManager.renderPayments === 'function') RenderManager.renderPayments();
                    });
                });
                this.activeListeners.push(unsubDeposits);
            }
        } else {
            console.log("👤 العميل زائر. تم إيقاف جلب البيانات الخاصة.");
            this.clearFirebaseListeners();
            localStorage.removeItem('telecard_active_user_uid');
            LiveStoreData.users = [];
            LiveStoreData.orders = [];
            LiveStoreData.deposits = [];
            if (DataManager.cursors) DataManager.cursors = {}; 
            if (DataManager.syncUser) DataManager.syncUser();
            if (UIManager && typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
        }
    });
};

// ============================================================================
// 🚀 نقطة الإقلاع المركزية للنظام
// ============================================================================
ClientSystem.init = async function() {
    try {
        console.log("🚀 جاري إقلاع النظام (نمط الـ Hydration الفوري)...");
        
        if (typeof UIManager.applySavedTheme === 'function') UIManager.applySavedTheme();
        
        try {
            const localCache = localStorage.getItem('telecard_store_cache');
            if (localCache) {
                const parsed = JSON.parse(localCache);
                ['cats', 'settings', 'tiers', 'rates', 'banners'].forEach(k => {
                    if (parsed[k]) LiveStoreData[k] = parsed[k];
                });
                RenderHelpers.init({
                    settings: LiveStoreData.settings || {},
                    rates: LiveStoreData.rates || [],
                    offers: [],
                    isStore: true
                });
            }
        } catch (e) {}
        
        if (UIManager.checkSystemStatus && UIManager.checkSystemStatus()) return;
        
        const adminDefaultCurrency = (LiveStoreData.settings && LiveStoreData.settings.defaultCurrency) ? LiveStoreData.settings.defaultCurrency : 'USD';
        DataManager.selectedCurr = localStorage.getItem('telecard_display_currency') || adminDefaultCurrency;
        
        if (DataManager.initDummyData) DataManager.initDummyData();
        
        if (DataManager.syncUser) DataManager.syncUser();

        // 🔒 [الحارس الأمني]: اعتراض الشاشة فوراً إذا كان حساب العميل مقفلاً بالبصمة من السيرفر
        if (DataManager.user && DataManager.user.biometricEnabled === true) {
            const lockScreen = document.getElementById('biometric-lock-screen');
            if (lockScreen) {
                lockScreen.classList.add('active');
                const isUnlocked = await this.enforceBiometricLock();
                if (!isUnlocked) {
                    return;
                }
            }
        }

        if (DataManager.loadPrefs) DataManager.loadPrefs();
        
        if (UIManager && typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
        if (typeof UIManager.applyStoreIdentity === 'function') UIManager.applyStoreIdentity();
        if (typeof UIManager.toggleHeroSection === 'function') UIManager.toggleHeroSection(true);
        if (RenderManager.renderHome) RenderManager.renderHome();
        
        if (CalendarApp && CalendarApp.init) CalendarApp.init();
        
        const uiInitMethods = [
            'initSlider', 'updateSidebarText', 'initSupportButton', 'initTheme',
            'applyFontSettings', 'refreshCurrencyMenuFlags', 'renderSettingsUI',
            'loadUserImageAutomatically', 'restoreDisplayState', 'setupMainContentClickDetector',
            'initSwipeGestures'
        ];
        uiInitMethods.forEach(method => {
            if (typeof UIManager[method] === 'function') UIManager[method]();
        });
        
        if (typeof UIManager.updateDisplayCurrencyUI === 'function') UIManager.updateDisplayCurrencyUI(DataManager.selectedCurr);
        if (Components && Components.initBottomNavSync) Components.initBottomNavSync();
        if (typeof UIManager.checkKycCelebration === 'function') UIManager.checkKycCelebration();
        
        this.initGlobalListeners();
        this.isReady = true;
        
        this.initFirebaseListeners();
        
        // 📥 1. التحميل الأولي للبيانات الثابتة العامة وتحديث الكاش
        if (StoreDB) {
            const staticKeys = ['SETTINGS', 'CATS', 'PRODS', 'BANNERS', 'OFFERS', 'RATES', 'TIERS', 'COUPONS', 'COUNTRIES', 'PAYMENTS'];
            
            Promise.all(staticKeys.map(k => StoreDB.getAll(DB_KEYS[k]))).then(results => {
                let cacheObject = {};
                
                const oldCats = [...LiveStoreData.cats];

                staticKeys.forEach((keyName, i) => {
                    const property = keyName.toLowerCase();
                    const rawData = results[i] || [];
                    
                    if (property === 'settings') {
                        LiveStoreData.settings = Array.isArray(rawData) ? (rawData[0] || {}) : (rawData || {});
                    } else {
                        LiveStoreData[property] = Object.freeze([...rawData]);
                    }
                    
                    if (['cats', 'settings', 'tiers', 'rates', 'banners'].includes(property)) {
                        cacheObject[property] = LiveStoreData[property];
                    }
                });                
                
                localStorage.setItem('telecard_store_cache', JSON.stringify(cacheObject));
                LiveStoreData.isInitialSyncDone = true; 
                
                RenderHelpers.init({
                    settings: LiveStoreData.settings || {},
                    rates: LiveStoreData.rates || [],
                    offers: LiveStoreData.offers || [],
                    isStore: true
                });
                
                if (typeof UIManager.applyStoreIdentity === 'function') UIManager.applyStoreIdentity();
                if (typeof UIManager.updateDisplayBalance === 'function') UIManager.updateDisplayBalance();
                
                const areCategoriesEqual = (arr1, arr2) => {
                    if (!arr1 || !arr2) return false;
                    if (arr1.length !== arr2.length) return false;
                    
                    const sorted1 = [...arr1].sort((a, b) => String(a.id).localeCompare(String(b.id)));
                    const sorted2 = [...arr2].sort((a, b) => String(a.id).localeCompare(String(b.id)));
                    
                    return sorted1.every((cat, index) => {
                        const other = sorted2[index];
                        return cat.id === other.id &&
                               cat.name === other.name &&
                               cat.img === other.img &&
                               cat.parentId === other.parentId &&
                               (cat.order || 0) === (other.order || 0);
                    });
                };

                const isCatsDataIdentical = areCategoriesEqual(oldCats, LiveStoreData.cats);

                if (!isCatsDataIdentical) {
                    console.log("🔄 تم اكتشاف تغيير في الأقسام من السيرفر، جاري التحديث البصري...");
                    if (RenderManager && typeof RenderManager.renderHome === 'function') RenderManager.renderHome(); 
                } else {
                    console.log("🛡️ الأقسام مطابقة تماماً للذاكرة المحلية، تم إلغاء إعادة الرسم لتفادي الومضة البصرية.");
                }
                
                if (typeof UIManager.initSlider === 'function') UIManager.initSlider();
                if (typeof UIManager.renderTicker === 'function') UIManager.renderTicker(); 
                
            }).catch(error => {
                console.warn("⚠️ تعذر جلب البيانات الثابتة، المتجر يعمل حالياً على النسخة المخبأة (Cache).", error);
            });
        }
        
        try {
            if (DataManager && typeof DataManager._getCloudFunction === 'function') {
                DataManager._getCloudFunction('getServerTime')().then(timeRes => {
                    DataManager.serverTimeOffset = timeRes.data.serverTime - Date.now();
                });
            }
        } catch (timeErr) {
            DataManager.serverTimeOffset = 0;
        }
        
    } catch (criticalError) {
        document.body.innerHTML = `
            <div class="error-screen" style="display:flex; justify-content:center; align-items:center; height:100vh; background:#111; color:#fff; font-family:sans-serif; text-align:center;">
                <div>
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:40px; color:#ff4444; margin-bottom:15px;"></i>
                    <h3>عذراً، حدث خطأ أثناء الاتصال بالخادم</h3>
                    <p style="color:#888; font-size:14px; margin-top:10px;">يرجى تحديث الصفحة أو التحقق من الاتصال بالإنترنت</p>
                </div>
            </div>`;
    }
};

window.ClientSystem = ClientSystem;
window.CalendarApp = CalendarApp;

(function() {
    const startApp = () => {
        if (window.ClientSystem && window.ClientSystem.init) window.ClientSystem.init();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApp);
    } else {
        startApp();
    }
})();
