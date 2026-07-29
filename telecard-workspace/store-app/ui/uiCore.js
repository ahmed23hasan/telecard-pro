// ============================================================================
// ⚙️ وحدة الأساسيات والنواة (uiCore.js) - Enterprise V14.3 💎
// 🎯 الوظيفة: النوافذ، الإشعارات، القائمة الجانبية، النسخ، الثيم، والتوجيه العام
// 🚀 التحديثات:
// 1. Queue System: طابور متسلسل للإشعارات المنبثقة لمنع التداخل وحذف الرسائل.
// 2. Battery & Memory Shield: إيقاف تام للـ Timers في الخلفية وتنظيف عُقد الصوت و Observers.
// 3. iOS UI Fixes: تشغيل الصوت بشكل متزامن وحل مشكلة قفزة النسخ التلقائي في أبل.
// 4. State Machine Args: تمرير كامل للمتغيرات داخل الـ Timer لمنع الفشل الصامت.
// ============================================================================

import { DB_KEYS, CACHE_KEYS, ACTIVE_USER_KEY } from '../config.js';           
import { Utils } from '../utils.js';             
import { DataManager, LiveStoreData, StoreDB } from '../dataManager.js'; 
import { RenderManager } from '../renderManager.js'; 
import { Components } from '../components.js';     
import { RenderHelpers } from '../core/renderHelpers.js'; 

const getSys = () => {
    if (window.ClientSystem) return window.ClientSystem;
    if (window.UIManager) return window.UIManager;
    return new Proxy({}, { get: (target, prop) => () => { console.error(`🚨 System not ready for: ${String(prop)}`); } });
};

export const UICore = {
    activeModals: [],
    displayMenuTimer: null,
    audioCtx: null,
    navHistory: [],
    currentCategoryId: null,
    historyStateSet: false,

    // =========================================================
    // 🚨 0. نافذة الطرد المباشر الآمنة
    // =========================================================
    triggerLiveBanAlert: function(reasonMessage) {
        const msgText = Utils.escapeHtml(reasonMessage || 'تم تقييد حسابك.');
        
        document.body.innerHTML = `
            <div id="global-security-alert" class="sys-dialog-wrapper active" style="z-index: 999999999; background: #000;">
                <div class="sys-dialog-card" style="border-color: #ef4444;">
                    <div class="sys-dialog-header">
                        <div class="sys-dialog-icon" style="color: #ef4444; background: rgba(239, 68, 68, 0.1);"><i class="fa-solid fa-ban"></i></div>
                        <h3 class="sys-dialog-title text-danger">تنبيه أمني</h3>
                    </div>
                    <div class="sys-dialog-msg-container"><p class="sys-dialog-msg">${msgText}</p></div>
                </div>
            </div>
        `;
        
        this.sfx?.('error');
        
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, null, window.location.href);
        }
        
        try {
            if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('TeleCardStoreDB');
            // 🛡️ مسح البيانات الحساسة فقط دون تدمير الإعدادات والبصمة
            localStorage.removeItem(ACTIVE_USER_KEY); 
            localStorage.removeItem(CACHE_KEYS.ACTIVE_UID);
            sessionStorage.clear();
            
            import('../core/firebaseAdapter.js').then(module => {
                if (module.auth) module.auth.signOut();
            }).catch(() => {});
        } catch (e) {}
        
        setTimeout(() => { window.location.replace('login.html'); }, 3000);
    },

    openSettings: function() { getSys().resetUI?.(); getSys().renderSettingsUI?.(); getSys().openModal?.('settings'); },
    closeSettings: function() { getSys().closeModal?.('settings'); },

    // =========================================================
    // 🌗 1. دوال الثيم والهوية البصرية
    // =========================================================
    toggleTheme: function() {
        const isCurrentlyLight = document.body.classList.contains('light-mode');
        getSys().setThemePref(isCurrentlyLight ? 'dark' : 'light');
        this.sfx?.('nav');
    },
    
    toggleThemePref: function() { getSys().toggleTheme(); },
    
    setThemePref: function(mode) {
        const isLight = mode === 'light';
        document.body.classList.toggle('light-mode', isLight);
        localStorage.setItem(CACHE_KEYS.THEME || 'telecard_theme', isLight ? 'light' : 'dark');
        
        if (DataManager.prefs) {
            DataManager.prefs.theme = isLight ? 'light' : 'dark';
            if (DataManager.savePrefs) DataManager.savePrefs();
        }
        
        const dottedSunSVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="display:inline-block; vertical-align:middle;"><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="2" r="1.5"></circle><circle cx="12" cy="22" r="1.5"></circle><circle cx="2" cy="12" r="1.5"></circle><circle cx="22" cy="12" r="1.5"></circle><circle cx="4.93" cy="4.93" r="1.5"></circle><circle cx="19.07" cy="19.07" r="1.5"></circle><circle cx="4.93" cy="19.07" r="1.5"></circle><circle cx="19.07" cy="4.93" r="1.5"></circle></svg>`;
        
        const headerIcon = document.getElementById('theme-toggle-icon');
        if (headerIcon) {
            if (isLight) { headerIcon.innerHTML = ''; headerIcon.className = 'fa-solid fa-moon'; } 
            else { headerIcon.className = ''; headerIcon.innerHTML = dottedSunSVG; }
        }
        
        document.querySelectorAll('.global-theme-toggle').forEach(btn => {
            btn.classList.toggle('is-light', isLight);
            btn.classList.toggle('is-active', isLight);
            const lbl = btn.querySelector('.theme-lbl'), icn = btn.querySelector('.theme-icn');
            if (lbl) lbl.textContent = isLight ? 'نهاري' : 'ليلي';
            if (icn) { if (isLight) { icn.innerHTML = ''; icn.className = 'fa-solid fa-moon theme-icn'; } else { icn.className = 'theme-icn'; icn.innerHTML = dottedSunSVG; } }
        });
    },    

    applySavedTheme: function() { getSys().setThemePref(localStorage.getItem(CACHE_KEYS.THEME || 'telecard_theme') || 'dark'); },
    initTheme: function() { getSys().setThemePref((DataManager.prefs && DataManager.prefs.theme) ? DataManager.prefs.theme : (localStorage.getItem(CACHE_KEYS.THEME || 'telecard_theme') || 'dark')); },
    
    // =========================================================
    // 🔊 دوال الأصوات
    // =========================================================
    toggleSoundPref: function() {
        if (!DataManager.prefs) return;
        DataManager.prefs.sound = !DataManager.prefs.sound;
        if (DataManager.savePrefs) DataManager.savePrefs();
        getSys().updateSoundUI();
        this.sfx?.('nav');
    },
    
    updateSoundUI: function() {
        const soundOn = (DataManager.prefs && DataManager.prefs.sound !== false);
        document.querySelectorAll('.global-sound-toggle').forEach(btn => {
            btn.classList.toggle('is-active', soundOn);
            const lbl = btn.querySelector('.sound-lbl'), icn = btn.querySelector('.sound-icn');
            if (lbl) lbl.textContent = soundOn ? 'مفعل' : 'صامت';
            if (icn) icn.className = soundOn ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
        });
    },
    
    renderSettingsUI: function() {
        getSys().setThemePref((DataManager.prefs?.theme === 'light' || document.body.classList.contains('light-mode')) ? 'light' : 'dark');
        getSys().updateSoundUI();
    },

    _getFullName: function(user) {
        const u = user || DataManager.user || {};
        const isKycApproved = (u.kycStatus === 'approved' || u.kycStatus === 'verified');
        if (isKycApproved && u.fullName && u.fullName.trim()) return u.fullName.trim();
        if (isKycApproved && u.kycData && u.kycData.fullName && u.kycData.fullName.trim()) return u.kycData.fullName.trim();
        const f = u.firstName || u.first_name || u.name || '';
        const l = u.lastName || u.last_name || u.familyName || '';
        const combined = `${f} ${l}`.trim();
        if (combined) return combined;
        if (u.fullName && u.fullName.trim()) return u.fullName.trim();
        if (u.username && u.username.trim()) return `@${u.username.trim()}`;
        return 'العميل';
    },

    _getTxNameWithID: function(user) {
        const u = user || DataManager.user || {}; 
        return `<div class="tx-name-wrapper"><span class="tx-name-text">${Utils.escapeHtml(u.username ? `@${u.username}` : this._getFullName(u))}</span><div class="uid-capsule" dir="ltr"><i class="fa-solid fa-id-card"></i><span class="num-en">${RenderHelpers.formatUserId(u)}</span></div></div>`;
    },

    // =========================================================
    // 🪟 2. الإدارة المركزية للنوافذ
    // =========================================================
    openModal: function(modalId) {
        const overlay = document.getElementById(`${modalId}-overlay`);
        const modal = document.getElementById(`${modalId}-modal`);
        if (!modal) return;

        if (!this.activeModals) this.activeModals = [];
        document.body.classList.add('no-scroll');
        
        if (overlay) overlay.classList.add('active'); 
        modal.scrollTop = 0;
        const scrollable = modal.querySelector('.pm-scroll-content, .scrollable, .profile-container, .modal-content');
        if (scrollable) scrollable.scrollTop = 0;
        
        modal.classList.add('active');
        if (!this.activeModals.includes(modalId)) this.activeModals.push(modalId);

        if (modalId === 'identity') {
            const listTarget = document.getElementById('countries-list-target');
            if (listTarget) listTarget.innerHTML = '<div class="dropdown-item" style="justify-content: center; color: var(--text-muted);">جاري تحميل الدول...</div>';
            if (typeof DataManager.getAdminCountries === 'function') {
                DataManager.getAdminCountries().then(countries => { if (RenderManager.renderCountryList) RenderManager.renderCountryList(countries); });
            }
            getSys().loadDynamicCurrenciesForModal?.();
        }
        if (modalId === 'kyc-upload') getSys().prepareKycModalState?.();
    },

    closeModal: function(modalId) {
    if (!modalId) { getSys().closePurchaseModal?.(); return; }
    
    // 🛡️ [إصلاح تسريب الكوبون]: تصفير حالة الكوبون عند إغلاق نافذة الشراء
    if (modalId === 'purchase' || modalId === 'purchase-success') {
        if (typeof getSys().removeCoupon === 'function') getSys().removeCoupon(true);
    }
    
    const overlay = document.getElementById(`${modalId}-overlay`);
    const modal = document.getElementById(`${modalId}-modal`);
    
    if (modal) {
        modal.classList.remove('active');
        if (modal._scrollTimer) clearTimeout(modal._scrollTimer);
        modal._scrollTimer = setTimeout(() => {
            modal.scrollTop = 0;
            modal.querySelectorAll('.pm-scroll-content, .scrollable, .modal-content, .profile-container, .profile-pass-body, [id$="-list"]').forEach(s => s.scrollTop = 0);
        }, 350);
    }
    
    if (overlay) overlay.classList.remove('active');
    
    if (this.activeModals) {
        this.activeModals = this.activeModals.filter(id => id !== modalId);
        if (this.activeModals.length === 0 && !document.querySelector('.sidebar.active')) document.body.classList.remove('no-scroll');
    }
    
    if (['wallet', 'orders', 'mypay', 'profile-info'].includes(modalId)) this.syncBottomNavWithBaseState();
},    
    closeAllModals: function() { if (this.activeModals) [...this.activeModals].forEach(id => this.closeModal(id)); },

    resetUI: function() {
        const sidebar = document.querySelector('.sidebar') || document.getElementById('cs-menu');
        const sidebarOverlay = document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-overlay');
        
        if (sidebar) sidebar.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');

        this.closeAllModals();

        document.querySelectorAll('.nm-container').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.ct-menu').forEach(el => el.classList.remove('open', 'active'));
        document.querySelectorAll('.custom-dropdown-container').forEach(el => el.classList.remove('open'));
        
        const walletDrawer = document.getElementById('walletStatsDrawer');
        if (walletDrawer) { 
            walletDrawer.classList.remove('active'); walletDrawer.style.removeProperty('max-height'); 
            const walletModal = walletDrawer.closest('#wallet-modal');
            if(walletModal) walletModal.classList.remove('drawer-blur-active');
        }
        document.querySelector('.detail-arrow')?.classList.remove('open');
        
        ['store-search-input', 'order-search-input', 'wallet-search-input', 'pay-search-input'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

        if (!document.querySelector('.sidebar.active') && this.activeModals.length === 0) document.body.classList.remove('no-scroll');
    },

    resetGridScroll: function() {
        window.scrollTo(0, 0);
        const grid = document.getElementById('store-grid');
        if (grid) { grid.scrollTop = 0; let parent = grid.parentElement; while (parent && parent.tagName !== 'HTML') { parent.scrollTop = 0; parent = parent.parentElement; } }
    },

    syncBottomNavWithBaseState: function() {
        setTimeout(() => {
            const navIcons = document.querySelectorAll('.bottom-nav .nav-icon');
            if (!navIcons.length) return;
            navIcons.forEach(icon => icon.classList.remove('active'));
            
            const isFavorites = document.getElementById('grid-title')?.innerText?.trim() === 'المفضلة';
            const targetAction = isFavorites ? 'open-favorites' : 'nav-home';
            document.querySelector(`.bottom-nav .nav-icon[data-action="${targetAction}"]`)?.classList.add('active');
        }, 350);
    },

    closeAllSheets: function() { this.resetUI(); },
    
    toggleHeroSection: function(show) {
        document.body.classList.toggle('hero-hidden', !show);
        const searchBox = document.querySelector('.store-search-box');
        if (searchBox) searchBox.style.display = 'flex'; 
    },

    setGridMode: function(mode) {
        const grid = document.getElementById('store-grid');
        if(!grid) return;
        grid.classList.remove('grid-cats', 'grid-prods', 'products-grid');
        if(mode) { grid.classList.add(mode); if(mode === 'grid-prods') grid.classList.add('products-grid'); }
    },

    openTermsModal: function() {
        getSys().closeSidebar?.();
        if (RenderManager.renderTerms) RenderManager.renderTerms();
        else {
            const termsContent = document.getElementById('store-terms-content');
            if (termsContent) termsContent.innerText = (LiveStoreData.settings || {}).terms || 'لا توجد شروط وأحكام مسجلة حالياً.';
        }
        this.openModal('terms');
    },

    // =========================================================
    // 🚀 3. التوجيه والقائمة الجانبية
    // =========================================================
    openSidebar: function() { 
        this.resetUI();
        if(DataManager.syncUser) DataManager.syncUser(); 
        
        getSys().updateProfileDisplay?.();
        getSys().updateDisplayBalance?.();

        const menu = document.querySelector('.sidebar') || document.getElementById('cs-menu');
        const overlay = document.getElementById('cs-overlay') || document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-overlay');
        document.body.classList.add('no-scroll');
        
        if(overlay) { overlay.classList.add('active'); overlay.onclick = (e) => { if(e.target === overlay) this.closeSidebar(); }; }
        if(menu) {
            menu.style.transform = ''; menu.classList.add('active');
            const menuList = menu.querySelector('.menu-list');
            if(menuList) menuList.scrollTop = 0;
            menu.scrollTop = 0;
            this.initSwipeGestures(menu, overlay);
        }
        getSys().saveDisplayState?.();
    },

    closeSidebar: function() { 
        const menu = document.querySelector('.sidebar') || document.getElementById('cs-menu');
        const overlay = document.getElementById('cs-overlay') || document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-overlay');
        
        if (this.activeModals.length === 0) document.body.classList.remove('no-scroll');

        if(menu) { menu.classList.remove('active'); menu.style.transform = ''; }
        if(overlay) overlay.classList.remove('active'); 
        this.removeSidebarClickOutsideDetector();
        getSys().saveDisplayState?.();

        if (typeof this.syncBottomNavWithBaseState === 'function') this.syncBottomNavWithBaseState();
    },

    bindSidebarProfileTriggers: function() {
        const avatarEl = document.getElementById('cs-avatar');
        const nameEl = document.getElementById('cs-name');
        const handleProfileClick = (e) => { e.preventDefault(); e.stopPropagation(); getSys().openProfileInfo?.(); this.sfx?.('nav'); };

        if (avatarEl && !avatarEl.dataset.eventBound) { avatarEl.addEventListener('click', handleProfileClick); avatarEl.dataset.eventBound = "true"; avatarEl.style.cursor = 'pointer'; }
        if (nameEl && !nameEl.dataset.eventBound) { nameEl.addEventListener('click', handleProfileClick); nameEl.dataset.eventBound = "true"; nameEl.style.cursor = 'pointer'; }
    },

    setupSidebarClickOutsideDetector: function() {
        this.removeSidebarClickOutsideDetector();
        this._sidebarClickHandler = (event) => {
            const sidebar = document.querySelector('.sidebar') || document.getElementById('cs-menu');
            if (!sidebar || !sidebar.classList.contains('active')) return;
            if (event.target === (document.getElementById('cs-overlay') || document.getElementById('sidebarOverlay')) || (!sidebar.contains(event.target) && !event.target.closest('.hamburger') && !event.target.closest('[data-action="open-sidebar"]'))) {
                this.closeSidebar();
            }
        };
        document.addEventListener('click', this._sidebarClickHandler, true);
    },
    
    removeSidebarClickOutsideDetector: function() {
        if (this._sidebarClickHandler) { document.removeEventListener('click', this._sidebarClickHandler, true); this._sidebarClickHandler = null; }
    },

    setupMainContentClickDetector: function() {
        this.removeMainContentClickDetector();
        this._mainContentClickHandler = (event) => {
            const sidebar = document.querySelector('.sidebar') || document.getElementById('cs-menu');
            if (!sidebar || !sidebar.classList.contains('active')) return;
            if (!sidebar.contains(event.target) && !event.target.closest('.hamburger') && !event.target.closest('[data-action="open-sidebar"]')) {
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
                this.closeSidebar();
            }
        };
        document.addEventListener('click', this._mainContentClickHandler, true);
    },
    
    removeMainContentClickDetector: function() {
        if (this._mainContentClickHandler) { document.removeEventListener('click', this._mainContentClickHandler, true); this._mainContentClickHandler = null; }
    },

    initSwipeGestures: function(menu, overlay) {
        if (!menu) menu = document.querySelector('.sidebar') || document.getElementById('cs-menu');
        if (!overlay) overlay = document.querySelector('.sidebar-overlay') || document.getElementById('cs-overlay');
        
        if (!menu || menu.dataset.swipeInitialized) return;
        menu.classList.add('swipe-ready');
        menu.dataset.swipeInitialized = "true";

        let menuWidth = 260; const edgeZone = 40; const MAX_OPACITY = 1; 
        let startX = 0, startY = 0, isDragging = false, isSwipeConfirmed = false, startTime = 0, initialOpenState = false;

        const resetSidebarScroll = () => {
            if (menu) menu.scrollTop = 0;
            requestAnimationFrame(() => {
                menu.querySelectorAll('div, .sidebar-content, .scrollable, .offcanvas-body').forEach(el => { if (el.scrollHeight > el.clientHeight) el.scrollTop = 0; });
            });
        };

        // 🛡️ إصلاح تسريب הـ Observer
        if (this._sidebarObserver) this._sidebarObserver.disconnect();
        this._sidebarObserver = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                if (m.attributeName === 'class') {
                    const isOpen = menu.classList.contains('active');
                    if (isOpen) { resetSidebarScroll(); if (!isDragging && overlay) overlay.style.opacity = MAX_OPACITY; } 
                    else { if (!isDragging && overlay) overlay.style.opacity = ''; }
                }
            });
        });
        this._sidebarObserver.observe(menu, { attributes: true, attributeFilter: ['class'] });

        const cleanupPerformance = () => { menu.style.willChange = 'auto'; if(overlay) overlay.style.willChange = 'auto'; };
        
        const removeListeners = () => { 
            menu.removeEventListener('touchmove', onTouchMove); 
            menu.removeEventListener('touchend', onTouchEnd); 
            menu.removeEventListener('touchcancel', onTouchEnd); 
            isDragging = false; isSwipeConfirmed = false; 
        };

        const onTouchStart = (e) => {
            if (e.target.closest('.slider-container')) return; 
            removeListeners();
            
            startX = e.touches[0].clientX; startY = e.touches[0].clientY;
            initialOpenState = menu.classList.contains('active');
            if (!initialOpenState && startX <= (window.innerWidth - edgeZone)) return;

            menuWidth = menu.offsetWidth || 260; // 🛡️ قراءة العرض خارج التحريك
            menu.style.willChange = 'transform'; if(overlay) overlay.style.willChange = 'opacity';
            isDragging = true; isSwipeConfirmed = false; startTime = Date.now();
            
            menu.addEventListener('touchmove', onTouchMove, { passive: false });
            menu.addEventListener('touchend', onTouchEnd, { passive: true });
            menu.addEventListener('touchcancel', onTouchEnd, { passive: true });
        };

        const onTouchMove = (e) => {
            if (!isDragging) return;
            const diffX = e.touches[0].clientX - startX; const diffY = e.touches[0].clientY - startY;

            if (!isSwipeConfirmed) {
                if (Math.sqrt(diffX ** 2 + diffY ** 2) < 10) return;
                if (Math.abs(diffY) > Math.abs(diffX) * 1.5) { isDragging = false; removeListeners(); cleanupPerformance(); return; }
                isSwipeConfirmed = true;
                if (!initialOpenState) resetSidebarScroll();
                menu.style.visibility = 'visible'; menu.style.transition = 'none';
                if(overlay) { overlay.style.transition = 'none'; overlay.style.opacity = initialOpenState ? getComputedStyle(overlay).opacity : '0'; }
            }

            if (e.cancelable) e.preventDefault();
            let translateVal = initialOpenState ? Math.max(0, diffX) : Math.max(0, menuWidth + diffX);
            if (translateVal > menuWidth) translateVal = menuWidth;

            requestAnimationFrame(() => {
                menu.style.transform = `translate3d(${translateVal}px, 0, 0)`;
                if (overlay) overlay.style.opacity = ((1 - (translateVal / menuWidth)) * MAX_OPACITY).toFixed(2);
            });
        };

        const onTouchEnd = (e) => {
            if (!isDragging || !isSwipeConfirmed) { removeListeners(); cleanupPerformance(); return; }
            const diffX = e.changedTouches ? e.changedTouches[0].clientX - startX : 0;
            const time = Date.now() - startTime;
            const isFlick = time < 250 && Math.abs(diffX) > 20;
            const threshold = menuWidth / 3;
            
            let shouldClose = initialOpenState ? (diffX > 0 && (isFlick || diffX > threshold)) : !(diffX < 0 && (isFlick || Math.abs(diffX) > threshold));
            const duration = 250;
            
            menu.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
            if(overlay) overlay.style.transition = `opacity ${duration}ms ease`;

            requestAnimationFrame(() => {
                menu.style.transform = `translate3d(${shouldClose ? menuWidth : 0}px, 0, 0)`;
                if(overlay) overlay.style.opacity = shouldClose ? 0 : MAX_OPACITY;
            });

            setTimeout(() => {
                if (shouldClose) { this.closeSidebar(); requestAnimationFrame(() => { menu.style.transition = ''; menu.style.transform = ''; menu.style.visibility = ''; if(overlay) { overlay.style.transition = ''; overlay.style.opacity = ''; } }); } 
                else { this.openSidebar(); resetSidebarScroll(); requestAnimationFrame(() => { menu.style.transition = ''; menu.style.transform = ''; if(overlay) { overlay.style.transition = ''; setTimeout(() => overlay.style.opacity = MAX_OPACITY, 0); } }); }
                cleanupPerformance();
            }, duration + 20); 

            removeListeners();
        };

        window.addEventListener('touchstart', onTouchStart, { passive: true });
    },

    // =========================================================
    // 🎛️ إدارة الأحداث المركزية (Global Event Delegator)
    // =========================================================
    initGlobalListeners: function() {
        if (this._listenersBound) return;
        this._listenersBound = true;
        
        // استخدام getSys() بدلاً من this للوصول للدوال الموجودة في UIManager
        const ActionDictionary = {
            'nav-home': () => this.navigateHome?.(),
            'nav-deposit': () => this.navigateBalance?.(),
            'nav-payments': () => this.navigateMyPayments?.(),
            'nav-orders': () => this.navigateOrders?.(),
            'nav-settings': () => this.navigateSettings?.(),
            'nav-wallet': () => this.navigateWallet?.(),
            'open-sidebar': () => this.openSidebar?.(),
            'close-sidebar': () => this.closeSidebar?.(),
            'open-notif-center': () => this.openNotifCenter?.(),
            'open-about': (e) => { e.preventDefault(); this.openAboutModal?.(); },
            'open-community': () => this.openCommunityModal?.(),
            'open-security-modal': () => getSys().openSecurityModal?.(),
            'open-rating': () => this.openRatingModal?.(),
            'open-terms': () => this.openTermsModal?.(),
            'open-support': () => this.openSupport?.(),
            'open-favorites': () => this.openFavorites?.(),
            'open-add-balance': () => getSys().openAddBalance?.(),
            'open-tier-info': (e) => { e.stopPropagation(); getSys().openTierInfoModal?.(); },
            'logout': () => DataManager.logout?.(),
            'enforce-biometric': () => getSys().enforceBiometricLock?.(),
            'close-orders': () => this.closeOrders?.(),
            'close-wallet': () => this.closeWallet?.(),
            'close-mypayments': () => this.closeMyPayments?.(),
            'close-settings': () => this.closeSettings?.(),
            'close-balance': () => getSys().closeBalanceModal?.(),
            'back-balance-step': () => getSys().backToPayMethods?.(),
            'close-purchase': () => this.closeModal?.('purchase'),
            'close-success': () => this.closeModal?.('success'),
            'close-purchase-success': () => getSys().closePurchaseSuccess?.(), 
            'open-kyc-upload': () => { this.closeSidebar?.(); this.openModal?.('kyc-upload'); },
            'open-kyc-status': (e, id, val, target) => { this.closeSidebar?.(); getSys().openKycStatusModal?.(target.getAttribute('data-state')); },
            'close-tx-detail': () => this.closeModal?.('tx-detail'),
            'close-profile': () => getSys().closeProfileInfo?.(),
            'close-pay-receipt': () => getSys().closePayReceipt?.(),
            'close-terms': () => this.closeModal?.('terms'),
            'close-identity': () => this.closeModal?.('identity'),
            'close-kyc-upload': () => getSys().closeKycModal?.(),
            'close-kyc-status': () => getSys().closeKycStatusModal?.(),
            'close-notif-center': () => this.closeNotifCenter?.(),
            'close-tier-info': () => this.closeModal?.('tier-info'),
            'close-kyc-celebration': () => this.closeModal?.('kyc-celebration'),
            'close-community': () => this.closeModal?.('community'),
            'close-rating': () => this.closeModal?.('rating'),
            'close-about': () => this.closeModal?.('about'),
            'close-security-modal': () => getSys().closeSecurityModal?.(),
            'close-setup-2fa': () => this.closeModal?.('setup-2fa'),
            'toggle-currency-menu': () => this.toggleDisplayCurrencyMenu?.(),
            'toggle-theme': () => this.toggleTheme?.(),
            'store-search-btn': () => this.applyStoreSearch?.(),
            'open-category': (e, id) => { e.preventDefault(); this.openCategory?.(id); },
            'toggle-fav-modal': () => this.toggleFavoriteFromModal?.(),
            'update-simple-qty': (e, id, val) => getSys().updateSimpleQty?.(parseInt(val)),
            'toggle-pkg-dropdown': (e, id, val, target) => target.parentElement.classList.toggle('open'),
            'toggle-coupon-ui': (e, id, val, target) => getSys().toggleCoupon?.(target),
            'apply-coupon': () => getSys().applyCoupon?.(),
            'remove-coupon': () => getSys().removeCoupon?.(),
            'paste-coupon': () => this.pasteText?.(),
            
            'confirm-purchase': async (e, id, val, target) => { 
                if (target.disabled || target.dataset.processing === 'true') return;
                target.disabled = true; target.dataset.processing = 'true';
                const originalHtml = target.innerHTML;
                target.innerHTML = '<span class="btn-content"><i class="fa-solid fa-spinner fa-spin"></i> جاري التنفيذ...</span>';
                try { await getSys().handlePurchaseSubmit?.(); } 
                finally { target.disabled = false; target.dataset.processing = 'false'; target.innerHTML = originalHtml; }
            },
            
            'nav-orders-from-success': () => { 
                // 🛡️ التوجيه الآمن بعد الدفع
                if (getSys().closePurchaseSuccess) getSys().closePurchaseSuccess(); else this.closeModal('purchase-success');
                setTimeout(() => { this.navigateOrders?.(); }, 360); 
            },
            'navigate-orders-success': () => { this.closeModal?.('purchase-success'); setTimeout(() => { this.navigateOrders?.(); }, 360); }, 
            'select-pay': (e, id) => getSys().selectPay?.(id),
            
            'submit-balance': async (e, id, val, target, dataType, dataCurr) => { 
                if (target.disabled || target.dataset.processing === 'true') return;
                target.disabled = true; target.dataset.processing = 'true';
                const originalHtml = target.innerHTML;
                target.innerHTML = '<span class="btn-content"><i class="fa-solid fa-spinner fa-spin"></i> جاري التنفيذ...</span>';
                try { await getSys().handleBalanceSubmit?.(dataCurr); } 
                finally { target.disabled = false; target.dataset.processing = 'false'; target.innerHTML = originalHtml; }
            },
            
            'toggle-accordion': (e, id, val, target) => { e.preventDefault(); getSys().togglePayDetail?.(target); },
            'jump-transaction': (e, id, val, target, dataType) => getSys().jumpToTransaction?.(id, dataType),
            'open-detail': (e, id, val, target, dataType) => getSys().openDetail?.(e, dataType, id),
            'render-orders': () => getSys().renderOrders?.(),
            'render-wallet': () => getSys().renderWallet?.(),
            'render-payments': () => getSys().renderPayments?.(),
            'filter-order': (e, id, val, target) => getSys().setOrderFilter?.(val, target),
            'filter-wallet': (e, id, val, target) => getSys().setWalletFilter?.(val, target),
            'filter-pay': (e, id, val, target) => getSys().setPaymentFilter?.(val, target),
            'toggle-wallet-stats': (e, id, val, target) => getSys().toggleWalletStats?.(target),
            'open-cal-order-start': (e) => window.CalendarApp?.open('order-date-start', e),
            'open-cal-order-end': (e) => window.CalendarApp?.open('order-date-end', e),
            'open-cal-wallet-start': (e) => window.CalendarApp?.open('wallet-date-start', e),
            'open-cal-wallet-end': (e) => window.CalendarApp?.open('wallet-date-end', e),
            'open-cal-pay-start': (e) => window.CalendarApp?.open('pay-date-start', e),
            'open-cal-pay-end': (e) => window.CalendarApp?.open('pay-date-end', e),
            'cal-adj-month': (e, id, val) => window.CalendarApp?.adjustMonth(parseInt(val)),
            'cal-adj-year': (e, id, val) => window.CalendarApp?.adjustYear(parseInt(val)),
            'cal-toggle-list': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen, dataTarget) => window.CalendarApp?.toggleList(dataTarget, e),
            'toggle-theme-pref': () => this.toggleThemePref?.(),
            'toggle-sound-pref': () => this.toggleSoundPref?.(),
            'open-profile-sidebar': () => setTimeout(() => { this.closeSidebar?.(); getSys().openProfileInfo?.(); }, 150),
            'open-wallet-sidebar': () => setTimeout(() => { this.closeSidebar?.(); this.navigateWallet?.(); }, 150),
            'open-identity-sidebar': () => setTimeout(() => { this.closeSidebar?.(); this.openModal?.('identity'); }, 150),
            'trigger-click': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen, dataTarget) => document.getElementById(dataTarget)?.click(),
            'delete-avatar': () => getSys().deleteProfileImage?.(),
            'toggle-name-edit': () => getSys().toggleNameEdit?.(),
            'toggle-2fa': () => getSys().handle2FAToggle?.(),
            'toggle-biometric': () => getSys().handleBiometricToggle?.(),
            'send-reset-pass': () => getSys().sendResetPasswordEmail?.(),
            'submit-password-change': () => getSys().handlePasswordSubmit?.(),
            'request-account-delete': () => getSys().toggleSecurityPref?.(),
            'verify-and-enable-2fa': () => getSys().verifyAndEnable2FA?.(),
            'toggle-parent-dropdown': (e, id, val, target) => target.parentElement.classList.toggle('open'),
            'select-reg-currency': (e, id, val, target, dataType, dataCurr, dataName, dataCode) => { e.preventDefault(); getSys().selectRegCurrency?.(dataName, dataCode); },
            'select-country': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen) => { e.preventDefault(); getSys().selectCountry?.(dataName, dataCode, dataLen); },
            'save-identity': () => getSys().saveIdentityData?.(),
            'submit-kyc': () => getSys().submitKycData?.(),
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
                else getSys().exportReceipt?.(id, target);
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
                if (item?.hasAttribute('data-target-id')) getSys().openDetail?.(e, item.getAttribute('data-jump-type') || 'order', item.getAttribute('data-target-id'));
            }
        };

        if (this.initNetworkSensors) this.initNetworkSensors(); 

        document.body.addEventListener('touchstart', () => {}, { passive: true });
        window.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-action], .cat-card, .product-card')) e.preventDefault(); });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const action = e.target.getAttribute('data-action');
            if (action === 'store-search-enter') { this.sfx?.('nav'); this.applyStoreSearch?.(); }
            if (action === 'order-search-enter') { this.sfx?.('nav'); getSys().renderOrders?.(); }
            if (action === 'wallet-search-enter') { this.sfx?.('nav'); getSys().renderWallet?.(); }
            if (action === 'pay-search-enter') { this.sfx?.('nav'); getSys().renderPayments?.(); }
        });

        document.addEventListener('change', (e) => {
            const action = e.target.getAttribute('data-action');
            if (action === 'change-currency') this.setDisplayCurrency?.(e.target.value);
            if (action === 'kyc-upload-front') getSys().handleKycImage?.(e.target, 'kyc-prev-front');
            if (action === 'kyc-upload-back') getSys().handleKycImage?.(e.target, 'kyc-prev-back');
            if (action === 'kyc-upload-selfie') getSys().handleKycImage?.(e.target, 'kyc-prev-selfie');
            if (action === 'upload-avatar') getSys().handleAvatarChange?.(e);
        });

        document.addEventListener('click', (e) => {
            const packageWrapper = document.getElementById('pkg-custom-dropdown');
            if (packageWrapper?.classList.contains('open') && !packageWrapper.contains(e.target) && !e.target.closest('.dropdown-trigger')) {
                packageWrapper.classList.remove('open');
            }
            const walletDrawer = document.getElementById('walletStatsDrawer');
            if (walletDrawer?.classList.contains('active')) {
                if (!walletDrawer.contains(e.target) && !e.target.closest('.detail-arrow') && !e.target.closest('.wallet-toggle-btn') && !e.target.closest('[data-action="toggle-wallet-stats"]')) {
                    getSys().closeWalletStats?.(); 
                }
            }
        }, true); 

        // 🛡️ آلة الحالة الآمنة (State Machine Fix)
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
            const args = [e, prodId, actionBtn.getAttribute('data-val'), actionBtn, actionBtn.getAttribute('data-type'), actionBtn.getAttribute('data-curr'), actionBtn.getAttribute('data-name'), actionBtn.getAttribute('data-code'), actionBtn.getAttribute('data-len'), actionBtn.getAttribute('data-target'), actionBtn.getAttribute('data-text')];
            
            if (action === 'open-product' && target.closest('.card-image')) {
                if (!this._clickState) this._clickState = {};
                const state = this._clickState;
    
                if (state.timer && state.id === prodId) {
                    clearTimeout(state.timer);
                    state.timer = null; state.id = null;
                    this.triggerMagicFavorite?.(e, prodId);
                    return;
                }
    
                if (state.timer && state.id !== prodId) {
                    clearTimeout(state.timer);
                    ActionDictionary[action]?.(...state.args);
                }
    
                this.sfx?.('nav'); // تشغيل الصوت خارج المؤقت ليدعمه سفاري 
    
                state.id = prodId; state.args = args;
                state.timer = setTimeout(() => {
                    state.timer = null; state.id = null;
                    ActionDictionary[action]?.(...args);
                }, 250);
                return;
            }
            
            if (!['copy-text', 'apply-coupon', 'submit-balance', 'confirm-purchase', 'trigger-click', 'update-simple-qty', 'delete-avatar', 'open-product', 'mark-single-read'].includes(action)) {
                this.sfx?.('nav');
            }
            
            if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) target.blur();
            
            try {
                const res = ActionDictionary[action]?.(...args);
                if (res instanceof Promise && this.logCloudError) res.catch(err => this.logCloudError(action, err));
            } catch (err) { if (this.logCloudError) this.logCloudError(action, err); }
        });
    },

    // =========================================================
    // 🌟 محرك الانتقالات الفاخر
    // =========================================================
    _toggleNavLoader: function(show) {
        let loader = document.getElementById('premium-nav-loader');
        if (!loader) {
            const s = LiveStoreData.settings || {};
            loader = document.createElement('div');
            loader.id = 'premium-nav-loader';
            loader.innerHTML = `<div class="pnl-backdrop" style="position:fixed; inset:0; background:var(--bg-main, #111a2b); opacity:0.85; backdrop-filter:blur(8px); z-index:99999; display:flex; align-items:center; justify-content:center; transition:opacity 0.2s ease;"><div style="display:flex; flex-direction:column; align-items:center; gap:15px; transform:scale(0.9); animation:pnlPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;"><div style="position:relative; width:60px; height:60px; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-circle-notch fa-spin" style="position:absolute; font-size:60px; color:var(--gold-main, #FFD700); opacity:0.3;"></i><i class="fa-solid fa-store" style="font-size:24px; color:var(--gold-main, #FFD700);"></i></div><div style="color:#fff; font-weight:900; font-size:16px; letter-spacing:1px; font-family:'Cairo', sans-serif;">${Utils.escapeHtml(s.storeName || s.name || 'المتجر')}</div></div></div><style>@keyframes pnlPop { to { transform:scale(1); } }</style>`;
            document.body.appendChild(loader);
        }
        const backdrop = loader.querySelector('.pnl-backdrop');
        if (show) { loader.style.display = 'block'; void loader.offsetWidth; backdrop.style.opacity = '1'; } 
        else { backdrop.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 200); }
    },

    _executePageTransition: function(renderCallback) {
        const grid = document.getElementById('store-grid');
        this._toggleNavLoader(true); 
        
        if (grid) { grid.style.transition = 'none'; grid.style.opacity = '0'; }
        
        requestAnimationFrame(() => {
            setTimeout(() => {
                renderCallback(); 
                setTimeout(() => {
                    this._toggleNavLoader(false); 
                    if (grid) { grid.style.transition = 'opacity 0.25s ease-out'; grid.style.opacity = '1'; }
                }, 250);
            }, 0);
        });
    },

    navigateHome: function() { 
        this.closeSidebar(); this.currentCategoryId = null; this.navHistory = [];
        this._executePageTransition(() => { if(RenderManager.renderHome) RenderManager.renderHome(); });
    },
    
    openFavorites: function() {
        if (!DataManager?.user) { getSys().showToast?.('يجب تسجيل الدخول', 'error'); setTimeout(() => { window.location.replace('login.html'); }, 1500); return; }
        if (document.getElementById('grid-title')?.innerText?.trim() === 'المفضلة') { this.closeSidebar(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        this.closeSidebar(); this.resetUI(); this.currentCategoryId = null;
        this._executePageTransition(() => { if (RenderManager.renderFavorites) RenderManager.renderFavorites(); });
    },

    navigateBalance: function() { this.closeSidebar(); getSys().openAddBalance?.(); },
    navigateMyPayments: function() { this.closeSidebar(); getSys().openMyPayments?.(); },
    navigateOrders: function() { this.closeSidebar(); getSys().openOrders?.(); },
    navigateWallet: function() { this.closeSidebar(); getSys().openWallet?.(); },
    navigateSettings: function() { this.closeSidebar(); getSys().openSettings?.(); },

    openCategory: function(id) {
        // 🛡️ إصلاح تكرار Popstate
        if (!window._tcPopStateBound) { 
            window.addEventListener('popstate', () => { this._manualGoBack(); }); 
            window._tcPopStateBound = true; 
        }
        
        this.navHistory.push(this.currentCategoryId === null ? 'HOME' : this.currentCategoryId);
        if(this.navHistory.length > 20) this.navHistory.shift(); // حماية الذاكرة من التضخم
        
        const hash = '#cat-' + id;
        if(window.location.hash !== hash) window.history.pushState({ internalId: Date.now() }, '', hash); 
        this.currentCategoryId = id;
        
        const grid = document.getElementById('store-grid');
        if (grid) {
            let storiesBar = document.getElementById('offer-stories-bar');
            if (!storiesBar) { storiesBar = document.createElement('div'); storiesBar.id = 'offer-stories-bar'; grid.parentNode.insertBefore(storiesBar, grid); }

            this.setGridMode('grid-prods');
            const hasData = (LiveStoreData.prods?.length > 0) || (LiveStoreData.cats?.length > 0);

            if (hasData) {
                this._executePageTransition(() => {
                    if (RenderManager.renderOfferStories) RenderManager.renderOfferStories(id);
                    if (RenderManager._renderContent) RenderManager._renderContent(id);
                    if (Components?.initProductShine) Components.initProductShine();
                });
            } else {
                storiesBar.style.display = 'none'; grid.innerHTML = '';
                if (RenderManager.renderProductSkeletons) RenderManager.renderProductSkeletons('store-grid', 8);
                setTimeout(() => {
                    if (RenderManager.renderOfferStories) RenderManager.renderOfferStories(id);
                    if (RenderManager._renderContent) RenderManager._renderContent(id);
                    if (Components?.initProductShine) Components.initProductShine();
                }, 800);
            }
        }
    },
    
    _manualGoBack: function() {
        if (this.navHistory.length === 0 || this.navHistory[this.navHistory.length - 1] === 'HOME') { 
            this.currentCategoryId = null; this.navHistory.pop();
            this._executePageTransition(() => { if(RenderManager.renderHome) RenderManager.renderHome(true); });
        } else { 
            const prevId = this.navHistory.pop(); this.currentCategoryId = prevId; 
            this._executePageTransition(() => {
                if(RenderManager.renderOfferStories) RenderManager.renderOfferStories(prevId);
                if(RenderManager._renderContent) RenderManager._renderContent(prevId); 
                if (Components?.initProductShine) Components.initProductShine();
            });
        }
    },    
    
    openOrders: function() {
        if (!DataManager?.user) { getSys().showToast?.('يجب تسجيل الدخول', 'error'); setTimeout(() => { window.location.replace('login.html'); }, 1500); return; }
        this.resetUI(); getSys().setFilterDefaults?.('order');
        if (RenderManager.renderOrders) RenderManager.renderOrders(true);
        setTimeout(() => { this.openModal('orders'); }, 10);
    },
    
    openWallet: function() {
        if (!DataManager?.user) { getSys().showToast?.('يجب تسجيل الدخول', 'error'); setTimeout(() => { window.location.replace('login.html'); }, 1500); return; }
        this.resetUI(); getSys().setFilterDefaults?.('wallet'); getSys().updateDisplayBalance?.();
        if (RenderManager.renderWallet) RenderManager.renderWallet(true);
        this._syncWalletBlur();
        setTimeout(() => { this.openModal('wallet'); }, 10);
    },
    
    _syncWalletBlur: function() {
        const drawer = document.getElementById('walletStatsDrawer');
        const walletModal = document.getElementById('wallet-modal');
        if (!drawer || !walletModal || drawer._hasBlurObserver) return;
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                if (m.attributeName === 'class' && !drawer.classList.contains('active')) {
                    walletModal.classList.remove('drawer-blur-active');
                    document.querySelector('.detail-arrow')?.classList.remove('open');
                }
            });
        });
        observer.observe(drawer, { attributes: true, attributeFilter: ['class'] });
        drawer._hasBlurObserver = true;
    },
    
    openMyPayments: function() {
        if (!DataManager?.user) { getSys().showToast?.('يجب تسجيل الدخول', 'error'); setTimeout(() => { window.location.replace('login.html'); }, 1500); return; }
        this.resetUI(); getSys().setFilterDefaults?.('payments');
        if (RenderManager.renderPayments) RenderManager.renderPayments(true);
        setTimeout(() => { this.openModal('mypay'); }, 10);
    },
    
    _closeAndResetTabs: function(modalId, filterKey, tabsSelector) {
        this.closeModal(modalId);
        setTimeout(() => {
            if (DataManager.filters) DataManager.filters[filterKey] = 'all';
            const tabs = document.querySelectorAll(tabsSelector);
            if (tabs.length > 0) { tabs.forEach(t => t.classList.remove('active')); tabs[0].classList.add('active'); }
        }, 350);
    },

    closeOrders: function() { this._closeAndResetTabs('orders', 'orders', '#orders-tabs .mf-tab'); },
    
    closeWallet: function() {
        const statsDrawer = document.getElementById('walletStatsDrawer');
        if (statsDrawer) { statsDrawer.classList.remove('active'); statsDrawer.style.removeProperty('max-height'); }
        document.querySelector('.detail-arrow')?.classList.remove('open'); 
        const walletModal = document.getElementById('wallet-modal');
        if (walletModal) { walletModal.classList.remove('drawer-blur-active'); walletModal.scrollTop = 0; }
        if (typeof this._closeAndResetTabs === 'function') this._closeAndResetTabs('wallet', 'wallet', '#wallet-tabs .mf-tab');
    },

    setupWalletDrawerClickOutside: function() {
        if (this._walletDrawerListenerBound) return;
        document.addEventListener('click', (e) => {
            const drawer = document.getElementById('walletStatsDrawer');
            if (drawer && drawer.classList.contains('active') && !drawer.contains(e.target) && !e.target.closest('[data-action="toggle-wallet-stats"]')) {
                drawer.classList.remove('active'); 
                document.getElementById('wallet-modal')?.classList.remove('drawer-blur-active'); 
                document.querySelector('.detail-arrow')?.classList.remove('open'); 
            }
        });
        this._walletDrawerListenerBound = true;
    },

    closeMyPayments: function() { this._closeAndResetTabs('mypay', 'payments', '#payments-tabs .mf-tab'); },
    closeFavorites: function() {
        const grid = document.getElementById('store-grid');
        if(grid) {
            grid.style.opacity = '0'; grid.style.transform = 'translateY(20px)';
            setTimeout(() => { if(RenderManager.renderHome) RenderManager.renderHome(); if(grid) { grid.style.opacity = ''; grid.style.transform = ''; } }, 200);
        } else { if(RenderManager.renderHome) RenderManager.renderHome(); }
    },

    smoothPageTransition: function(fromPage, toPage) {
        const grid = document.getElementById('store-grid');
        if(grid) { grid.style.transition = ''; grid.style.opacity = ''; grid.style.transform = ''; }
        if(toPage === 'home') { if(RenderManager.renderHome) RenderManager.renderHome(); } 
        else if(toPage === 'favorites') { if(RenderManager.renderFavorites) RenderManager.renderFavorites(); }
    },

    copyToClipboard: function(text, element, type = 'default') {
        getSys().sfx?.('nav'); 
        const successVisuals = () => {
            this.showToast('تم النسخ', 'success');
            if (element) { 
                if (element.classList.contains('is-copied') || element.classList.contains('copy-success')) return;
                
                let icon = type === 'smartline' ? element.querySelector('.scl-icon') : (element.querySelector('i') || (element.tagName === 'I' ? element : null));
                if (type === 'smartline') element.classList.add('copy-success'); else element.classList.add('is-copied');
                
                if (icon) {
                    if (!icon.dataset.origClass) icon.dataset.origClass = icon.className;
                    icon.className = 'fa-solid fa-check-double' + (type === 'smartline' ? ' scl-icon' : '');
                }
                
                if (element.copyTimer) clearTimeout(element.copyTimer);
                element.copyTimer = setTimeout(() => { 
                    element.classList.remove(type === 'smartline' ? 'copy-success' : 'is-copied');
                    if (icon && icon.dataset.origClass) icon.className = icon.dataset.origClass; 
                }, 800); 
            }
        };

        if (navigator.clipboard && window.isSecureContext) { 
            navigator.clipboard.writeText(text).then(successVisuals).catch(() => this.showToast('فشل النسخ', 'error')); 
        } else {
            // 🛡️ إصلاح مشكلة اهتزاز واجهة iOS
            const textarea = document.createElement('textarea'); 
            textarea.value = text; 
            textarea.readOnly = true; 
            textarea.style.position = 'fixed'; 
            textarea.style.opacity = '0';
            document.body.appendChild(textarea); 
            textarea.select();
            try { document.execCommand('copy'); successVisuals(); } catch (e) { this.showToast('فشل النسخ', 'error'); }
            document.body.removeChild(textarea);
        }
    },

    copyOrderInput: function(text, element) { this.copyToClipboard(text, element, 'default'); },
    copySmartLine: function(element, text) { this.copyToClipboard(text, element, 'smartline'); },

    pasteText: async function() {
        const couponInput = document.getElementById('couponCode');
        if (!couponInput) return;
        if (!navigator.clipboard) { this.showToast('المتصفح يحظر اللصق التلقائي.', 'warning'); return; }
        try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim() !== '') {
                couponInput.value = text.trim().toUpperCase();
                if (typeof this.checkInputState === 'function') this.checkInputState(); else if (typeof getSys().checkInputState === 'function') getSys().checkInputState();
                this.showToast('تم لصق الكوبون بنجاح', 'success'); getSys().sfx?.('success');
            } else this.showToast('الحافظة فارغة!', 'warning');
        } catch (err) { this.showToast('يرجى السماح باللصق التلقائي من إعدادات المتصفح', 'warning'); }
    },    
    
    showAdminDirectMessage: function(msgText) {
        if (document.getElementById('admin-direct-msg-popup')) return;
        const html = `<div id="admin-direct-msg-popup" class="sys-dialog-wrapper"><div class="sys-dialog-overlay"></div><div class="sys-dialog-card"><div class="sys-dialog-header"><div class="sys-dialog-icon"><i class="fa-solid fa-envelope-open-text fa-bounce"></i></div><h3 class="sys-dialog-title">رسالة إدارية هامة</h3></div><div class="sys-dialog-msg-container"><p class="sys-dialog-msg">${Utils.escapeHtml(msgText)}</p></div><div class="sys-dialog-actions"><button id="ack-admin-msg-btn" class="sys-dialog-btn">قرأت ذلك، شكراً</button></div></div></div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        this.sfx?.('success');
        document.getElementById('ack-admin-msg-btn').addEventListener('click', () => { if (DataManager.ackAdminMessage) DataManager.ackAdminMessage(); document.getElementById('admin-direct-msg-popup').remove(); });
    },

    processAndDisplayAlerts: function() {
        if (!DataManager.getUnreadAlerts) return;
        const unreadAlerts = DataManager.getUnreadAlerts();
        if (!unreadAlerts || unreadAlerts.length === 0) return;
        
        let shownToasts = [];
        try { shownToasts = JSON.parse(localStorage.getItem('telecard_shown_toasts') || "[]"); } catch (e) {}
        
        // 🛡️ إصلاح التداخل (Queue System & Thrash Fix)
        const popups = unreadAlerts.filter(m => (m.type === 'popup' || m.isPopup) && !shownToasts.includes(String(m.id)));
        const toasts = unreadAlerts.filter(m => !(m.type === 'popup' || m.isPopup) && !shownToasts.includes(String(m.id)));

        toasts.forEach(msg => {
            this.showToast(msg.message, 'info');
            shownToasts.push(String(msg.id));
        });

        if (popups.length > 0) {
            popups.forEach(p => shownToasts.push(String(p.id)));
            this.showAdvancedPopup(popups[0], popups.slice(1));
        }

        if (shownToasts.length > 50) shownToasts = shownToasts.slice(-50);
        localStorage.setItem('telecard_shown_toasts', JSON.stringify(shownToasts));
        
        this.updateNotifBadges(); // نقل التحديث لخارج الحلقة للحفاظ على المعالج
    },

    showAdvancedPopup: function(alertObj, remainingQueue) {
        const existingModal = document.getElementById('advanced-alert-modal');
        if (existingModal) existingModal.remove();
        
        let extraHtml = '';
        if (alertObj.couponCode) {
            extraHtml += `<div class="mt-15" style="background: rgba(168, 85, 247, 0.1); border: 1px dashed #a855f7; padding: 12px; border-radius: 12px; text-align: center;"><div style="font-size: 11px; color: #a855f7; margin-bottom: 6px; font-weight: bold;">🎁 كود خصم حصري لك:</div><div style="display: flex; gap: 8px; justify-content: center; align-items: center;"><span class="num-en" style="font-size: 18px; font-weight: 900; color: #fff; letter-spacing: 2px;">${Utils.escapeHtml(alertObj.couponCode)}</span><button id="adv-alert-copy-btn" data-code="${Utils.escapeHtml(alertObj.couponCode)}" style="background: #a855f7; border: none; color: #fff; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;"><i class="fa-solid fa-copy"></i></button></div></div>`;
        }
        if (alertObj.actionLink) {
            extraHtml += `<a href="${Utils.safeUrl(alertObj.actionLink)}" target="_blank" rel="noopener noreferrer" style="display: block; width: 100%; background: linear-gradient(135deg, #FFD700, #C5A028); color: #000; text-align: center; padding: 12px; border-radius: 10px; font-weight: 900; margin-top: 15px; text-decoration: none; box-shadow: 0 4px 15px rgba(255, 215, 0, 0.2); transition: 0.3s;">عرض التفاصيل الآن <i class="fa-solid fa-arrow-left" style="margin-right: 5px;"></i></a>`;
        }
        
        const modalHtml = `<div id="advanced-alert-modal" class="modal-overlay active" style="z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);"><div class="sys-dialog-card" style="animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1); position: relative; max-width: 400px; width: 90%; background: #111a2b; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 25px;"><div class="sys-dialog-header" style="text-align: center; margin-bottom: 15px;"><div class="sys-dialog-icon" style="width: 50px; height: 50px; margin: 0 auto 15px; background: rgba(255, 215, 0, 0.15); color: #FFD700; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 1px solid #FFD700;"><i class="fa-solid fa-bell"></i></div><h3 class="sys-dialog-title" style="color: #FFD700; font-size: 18px; font-weight: 900; margin: 0;">${Utils.escapeHtml(alertObj.title || 'إشعار هام')}</h3></div><div class="sys-dialog-msg" style="color: #f1f5f9; font-size: 14px; line-height: 1.6; text-align: center; white-space: pre-wrap;">${Utils.escapeHtml(alertObj.message || '')}</div>${extraHtml}<button id="close-advanced-alert" class="btn btn-ghost" style="width: 100%; margin-top: 20px; border: 1px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 10px; color: #94a3b8; font-weight: 800; cursor: pointer; background: transparent;">إغلاق النافذة</button></div></div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.sfx?.('success');
        
        const copyBtn = document.getElementById('adv-alert-copy-btn');
        if (copyBtn) copyBtn.onclick = function() { if (navigator.clipboard) { navigator.clipboard.writeText(this.dataset.code); this.innerHTML = '<i class="fa-solid fa-check"></i>'; setTimeout(() => { if (this.isConnected) this.innerHTML = '<i class="fa-solid fa-copy"></i>'; }, 2000); } };
        
        document.getElementById('close-advanced-alert')?.addEventListener('click', () => {
            const modal = document.getElementById('advanced-alert-modal');
            if (modal) { modal.style.transition = '0.3s ease'; modal.style.opacity = '0'; modal.style.transform = 'scale(0.9)'; }
            if (DataManager.markSingleNotificationRead) DataManager.markSingleNotificationRead(alertObj.id, true, alertObj.maxViews);
            this.updateNotifBadges();
            setTimeout(() => { if (modal) modal.remove(); if (remainingQueue?.length > 0) setTimeout(() => this.showAdvancedPopup(remainingQueue[0], remainingQueue.slice(1)), 500); }, 300);
        }, { once: true }); 
    }, 

    openNotifCenter: function() {     
        if (!DataManager?.user) { getSys().showToast?.('يجب تسجيل الدخول', 'error'); setTimeout(() => { window.location.replace('login.html'); }, 1500); return; }
        this.closeSidebar();
        if (RenderManager.renderNotifCenterList) RenderManager.renderNotifCenterList();
        document.getElementById('notif-center-modal')?.classList.add('active'); 
        document.getElementById('notif-center-overlay')?.classList.add('active');
    },

    closeNotifCenter: function() {
        document.getElementById('notif-center-modal')?.classList.remove('active'); 
        document.getElementById('notif-center-overlay')?.classList.remove('active');
    },

    updateNotifBadges: function(unreadCountParam) {
        if (!DataManager.getUnreadAlerts) return;
        const count = unreadCountParam !== undefined ? unreadCountParam : DataManager.getUnreadAlerts().length;
        const hBadge = document.getElementById('header-notif-badge'), sBadge = document.getElementById('sidebar-notif-badge');
        
        if (count > 0) {
            const t = count > 99 ? '99+' : count;
            if (hBadge) { hBadge.innerText = t; hBadge.classList.remove('hide-element'); }
            if (sBadge) { sBadge.innerText = t; sBadge.classList.remove('hide-element'); }
        } else {
            if (hBadge) hBadge.classList.add('hide-element');
            if (sBadge) sBadge.classList.add('hide-element');
        }
    },

    markAllNotificationsRead: async function() {
        if (!DataManager || typeof DataManager.markAllNotificationsRead !== 'function') return;
        getSys().toggleLoader?.(true, 'جاري تحديث الإشعارات...');
        try {
            await DataManager.markAllNotificationsRead();
            this.sfx?.('success'); this.updateNotifBadges();
            if (RenderManager?.renderNotifCenterList) RenderManager.renderNotifCenterList();
        } catch (e) { getSys().showToast?.('حدث خطأ بالاتصال', 'error'); } 
        finally { getSys().toggleLoader?.(false); }
    }, 

    showNotification: function(msg, type = 'error') {        
        const el = document.getElementById('custom-notification');
        if(!el) { this.showToast(msg, type); return; }
        el.classList.remove('active'); clearTimeout(this.notifTimer);
        setTimeout(() => {
            const icon = el.querySelector('.notif-icon'), title = el.querySelector('.notif-title'), message = el.querySelector('.notif-msg');
            if(message) message.textContent = msg; if(title) title.textContent = type === 'error' ? 'تنبيه' : 'نجاح';
            el.className = `custom-notification ${type}`;
            if(icon) icon.className = `notif-icon fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`;
            requestAnimationFrame(() => el.classList.add('active'));
            this.sfx?.(type === 'error' ? 'error' : 'success');
            this.notifTimer = setTimeout(() => el.classList.remove('active'), 3000);
        }, 50);
    },

    showToast: function(msg, type = 'info') {
        if (type === 'info') {
            if (/فشل|خطأ|عذراً|كاف|نفد/.test(msg)) type = 'error';
            else if (/مراجعة|انتظار|قيد/.test(msg)) type = 'warning'; 
            else if (/إزالة|حذف|إلغاء/.test(msg)) type = 'info'; 
            else if (/تم|نجاح|شكراً/.test(msg)) type = 'success';
        }

        let container = document.querySelector('.custom-toast-container');
        if (!container) {
            container = document.createElement('div'); container.className = 'custom-toast-container'; document.body.appendChild(container);
        } else {
            const lastToast = container.lastElementChild;
            if (lastToast && lastToast.querySelector('.toast-msg')?.innerText === Utils.escapeHtml(msg)) {
                lastToast.style.animation = 'none'; void lastToast.offsetWidth; lastToast.style.animation = 'shake-anim 0.3s ease-in-out'; return; 
            }
            while (container.children.length >= 3) { container.firstChild?.remove(); }
        }

        const toast = document.createElement('div');
        toast.className = `custom-toast toast-${type}`;
        
        let iconClass = 'fa-circle-info', titleText = 'معلومة';
        if (type === 'success') { iconClass = 'fa-circle-check'; titleText = 'نجاح'; }
        if (type === 'error') { iconClass = 'fa-circle-xmark'; titleText = 'خطأ'; }
        if (type === 'warning') { iconClass = 'fa-triangle-exclamation'; titleText = 'تنبيه'; } 

        toast.innerHTML = `<i class="fa-solid ${iconClass}"></i><div class="toast-content"><span class="toast-title">${titleText}</span><span class="toast-msg">${Utils.escapeHtml(msg)}</span></div>`;
        container.appendChild(toast);
        this.sfx?.(type === 'error' ? 'error' : 'success');
        
        setTimeout(() => {
            if(toast.isConnected) {
                toast.style.animation = 'toastOutTop 0.4s forwards';
                setTimeout(() => { if(toast.isConnected) toast.remove(); }, 400);
            }
        }, 3000);
    },

    sfx: function(type) {
        if(DataManager.prefs?.sound === false) return; 
        if (!navigator.userActivation || !navigator.userActivation.hasBeenActive) return;

        try {
            if(!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            const playSound = () => {
                const t = this.audioCtx.currentTime; 
                const osc = this.audioCtx.createOscillator(); 
                const gain = this.audioCtx.createGain();
                osc.connect(gain); gain.connect(this.audioCtx.destination);
                
                if (type === 'nav') { osc.type='sine'; osc.frequency.setValueAtTime(1200,t); gain.gain.setValueAtTime(0.05,t); gain.gain.exponentialRampToValueAtTime(0.001,t+0.03); osc.start(t); osc.stop(t+0.03); } 
                else if (type === 'success') { osc.type='sine'; osc.frequency.setValueAtTime(400,t); osc.frequency.linearRampToValueAtTime(800,t+0.15); gain.gain.setValueAtTime(0.1,t); gain.gain.linearRampToValueAtTime(0.001,t+0.3); osc.start(t); osc.stop(t+0.3); } 
                else if (type === 'error') { osc.type='triangle'; osc.frequency.setValueAtTime(150,t); gain.gain.setValueAtTime(0.1,t); gain.gain.linearRampToValueAtTime(0.001,t+0.2); osc.start(t); osc.stop(t+0.2); }
                
                // 🛡️ تدمير العقد لتنظيف الذاكرة العشوائية
                osc.onended = () => { osc.disconnect(); gain.disconnect(); };
            };

            if(this.audioCtx.state === 'suspended') { this.audioCtx.resume().then(playSound).catch(()=>{}); } 
            else { playSound(); }
            
        } catch(e) {}
        
        try {
            if (navigator.vibrate) {
                if (type === 'error') navigator.vibrate([50, 50, 50]); 
                else if (type === 'success') navigator.vibrate(50); 
                else navigator.vibrate(20);
            }
        } catch(e) {}
    },    

    // =========================================================
    // ⚙️ 5. إعدادات المتجر العامة والهوية البصرية
    // =========================================================
    
    _sanitizeCssValue: function(val) {
        if (!val) return '';
        const trimmed = val.trim();
        const safeColorRegex = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s,\.%]+\)|hsla?\([\d\s,\.%deg]+\)|[a-zA-Z]+)$/;
        return safeColorRegex.test(trimmed) ? trimmed : 'var(--primary)';
    },

    applyStoreIdentity: function() {
        let sys = LiveStoreData.settings || {}; 
        if (Array.isArray(sys)) sys = sys[0] || {}; 

        const storeName = (sys.storeName || sys.name || '').trim();
        const logoSize = parseInt(sys.logoSize) || 40; 
        const rawWeight = String(sys.nameWeight || '900').trim();
        const weight = /^(normal|bold|bolder|lighter|[1-9]00)$/.test(rawWeight) ? rawWeight : '900';
        const type = sys.nameColorType || 'solid';
        
        const c1 = this._sanitizeCssValue(sys.nameColor1 || '#ffffff');
        const c2 = this._sanitizeCssValue(sys.nameColor2 || '#FFD700');
        const hasShadow = sys.nameShadow === true || sys.nameShadow === 'true';
        
        const logoDark = sys.storeLogo || sys.logo || '';
        const logoLight = sys.storeLogoLight || sys.logo_light || logoDark; 
        const favicon = sys.storeFavicon || sys.favicon || '';

        const finalStoreName = storeName || 'المتجر';

        const currentConfigHash = `${finalStoreName}_${logoDark}_${logoLight}_${logoSize}_${type}_${c1}_${c2}_${weight}`;
        if (this._lastIdentityHash === currentConfigHash) return; 
        this._lastIdentityHash = currentConfigHash;

        const isEnglish = /^[A-Za-z0-9]/.test(storeName);

        document.title = `${finalStoreName} | المتجر`;
        if (favicon) {
            let link = document.querySelector("link[rel~='icon']");
            if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
            link.href = favicon;
        }

        const root = document.documentElement;
        root.style.setProperty('--brand-c1', c1);
        root.style.setProperty('--brand-c2', c2);
        root.style.setProperty('--brand-weight', weight);
        root.style.setProperty('--brand-size', `${Math.max(16, (logoSize * 0.55))}px`);

        let textClass = 'brand-text-solid';
        let textStyle = '';
        
        if (type === 'gradient') { 
            textClass = 'brand-text-gradient';
            if (hasShadow) textStyle = `filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));`; 
        } else { 
            if (hasShadow) textStyle = `text-shadow: 0 2px 8px var(--brand-c1); opacity: 0.9;`; 
        }

        const strictLogoStyle = `opacity: 1; max-height: ${logoSize}px !important; max-width: 150px !important; width: auto !important; object-fit: contain !important; display: inline-block;`;

        let logoHtml = '';
        if (logoDark) {
            if (!logoLight || logoDark === logoLight) {
                logoHtml += `<img src="${Utils.escapeHtml(logoDark)}" style="${strictLogoStyle}" alt="${Utils.escapeHtml(finalStoreName)}" class="brand-logo-dynamic">`;
            } else {
                logoHtml += `<img src="${Utils.escapeHtml(logoDark)}" style="${strictLogoStyle}" alt="${Utils.escapeHtml(finalStoreName)}" class="brand-logo-dynamic store-logo-dark">`;
                logoHtml += `<img src="${Utils.escapeHtml(logoLight)}" style="${strictLogoStyle}" alt="${Utils.escapeHtml(finalStoreName)}" class="brand-logo-dynamic store-logo-light">`;
            }
        } else if (logoLight) {
            logoHtml += `<img src="${Utils.escapeHtml(logoLight)}" style="${strictLogoStyle}" alt="${Utils.escapeHtml(finalStoreName)}" class="brand-logo-dynamic">`;
        }

        const nameHtml = `<div class="${textClass}" style="${textStyle}">${Utils.safeText(finalStoreName)}</div>`;
        const finalHtml = `${logoHtml} ${nameHtml}`;

        ['store-branding-target', 'sidebar-branding-target'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = finalHtml;
                el.classList.toggle('is-en', isEnglish);
                el.classList.toggle('logo-ar', !isEnglish);
            }
        });
    },
      saveDisplayState: function() {
        const displayState = { sidebarOpen: document.querySelector('.sidebar.active') !== null, userImage: DataManager.user?.img || null, theme: DataManager.prefs?.theme || 'dark', sound: DataManager.prefs?.sound !== false, lastVisit: Date.now() };
        try { localStorage.setItem('telecard_display_state', JSON.stringify(displayState)); } catch (e) {}
    },
    
    restoreDisplayState: function() {
        try {
            const savedState = localStorage.getItem('telecard_display_state');
            if (savedState) {
                const displayState = JSON.parse(savedState);
                if (displayState.userImage && DataManager.user) { DataManager.user = { ...DataManager.user, img: displayState.userImage }; if (this.loadUserImageAutomatically) this.loadUserImageAutomatically(); }
                if (displayState.theme && this.setThemePref) { this.setThemePref(displayState.theme); }
                if (displayState.sound !== undefined && DataManager.prefs) { DataManager.prefs.sound = displayState.sound; }
                if (displayState.lastVisit) { 
                    if (Math.floor((Date.now() - displayState.lastVisit) / 86400000) > 7) this.showToast('مرحباً بعودتك! تم تحديث الواجهة منذ آخر زيارة.'); 
                }
            }
        } catch (e) {}
    },
    
    applyFontSettings: function() {
        const s = LiveStoreData.settings || {};
        const family = s.fontFamily || "'Cairo', sans-serif";
        const root = document.documentElement;
        root.style.setProperty('--font-family-main', family);
        root.style.setProperty('--fs-base', `${s.fontSizeBase || 16}px`);
        root.style.setProperty('--fs-title', `${s.fontSizeTitle || 19}px`);
        root.style.setProperty('--fs-label', `${s.fontSizeLabel || 14}px`);
        root.style.setProperty('--fs-small', `${s.fontSizeSmall || 12}px`);
        root.style.setProperty('--fw-body', s.fontWeightBody || 700);
        root.style.setProperty('--fw-head', s.fontWeightHead || 900);
        document.body.style.fontFamily = family;
    },
    
    // =========================================================
    // 💰 تحديث الرصيد والإحصائيات ديناميكياً
    // =========================================================
    updateDisplayBalance: function() {
        if (!DataManager.user) return; 

        const user = DataManager.user;
        const baseCurrency = user.baseCurrency || user.base_currency || 'USD';
        const displayCurrency = DataManager.selectedCurr || baseCurrency;        
        const rates = DataManager.getRates ? DataManager.getRates() : null;

        // 🛡️ حماية من الـ NaN للكميات المخزنة كنصوص بفاصلة عربية بالخطأ
        const rawBal = Number(user.walletBalance);
        const safeRawBal = isNaN(rawBal) ? 0 : rawBal;
        const safeRawSpent = isNaN(Number(user.totalSpent)) ? 0 : Number(user.totalSpent);
        const safeRawDep = isNaN(Number(user.totalDeposit)) ? 0 : Number(user.totalDeposit);
        
        let displayBal = safeRawBal, displaySpent = safeRawSpent, displayDep = safeRawDep;

        if (displayCurrency !== baseCurrency && Utils.convertViaUSD) {
            displayBal = Utils.convertViaUSD(safeRawBal, baseCurrency, displayCurrency, rates, 'deposit');
            displaySpent = Utils.convertViaUSD(safeRawSpent, baseCurrency, displayCurrency, rates, 'pricing');
            displayDep = Utils.convertViaUSD(safeRawDep, baseCurrency, displayCurrency, rates, 'deposit');
        }
        
        const beautifulBalHtml = (RenderHelpers?.formatMoney) ? RenderHelpers.formatMoney(displayBal, displayCurrency) : `${Number(displayBal).toFixed(2)} ${displayCurrency}`;
        const currencyTxt = (RenderHelpers?.getCurrencySymbolText) ? RenderHelpers.getCurrencySymbolText(displayCurrency) : displayCurrency;
        const formattedNum = (val) => Number(val).toFixed(2);

        const numEl = document.getElementById('live-balance-num'), currEl = document.getElementById('live-balance-curr');
        if (numEl) numEl.innerText = formattedNum(displayBal);
        if (currEl) currEl.innerText = currencyTxt;

        const spentNum = document.getElementById('live-spent-num'), spentCurr = document.getElementById('live-spent-curr');
        if (spentNum) spentNum.innerText = formattedNum(displaySpent);
        if (spentCurr) spentCurr.innerText = currencyTxt;

        const depNum = document.getElementById('live-deposit-num'), depCurr = document.getElementById('live-deposit-curr');
        if (depNum) depNum.innerText = formattedNum(displayDep);
        if (depCurr) depCurr.innerText = currencyTxt;

        const sidebarBalBox = document.querySelector('.sp-balance-value');
        if (sidebarBalBox) sidebarBalBox.innerHTML = beautifulBalHtml;

        const balMain = document.getElementById('wallet-balance-disp');
        if (balMain) balMain.innerHTML = beautifulBalHtml;

        this.updateDisplayCurrencyUI(displayCurrency);
    },

    // 🛡️ [إصلاح ماسي 3]: دمج Visibility API مع الـ Slider لتوفير حقيقي للبطارية
    initSlider: function() {
        const banners = LiveStoreData.banners || [];
        const settings = LiveStoreData.settings || {};
        
        const currentBannerHash = JSON.stringify(banners.map(b => b.img)) + (settings.sliderTransition || 'fade');
        if (this._lastBannerHash === currentBannerHash) return;
        this._lastBannerHash = currentBannerHash;

        const container = document.getElementById('slider'); 
        if (!container || banners.length === 0) { if(container) container.innerHTML = ''; return; }
        
        container.innerHTML = '';
        container.classList.add('slider', `slider-${settings.sliderTransition || 'fade'}`); 
        
        banners.forEach((b, i) => { 
            const div = document.createElement('div'); 
            div.className = `slide ${i === 0 ? 'active' : ''}`; 
            div.style.backgroundImage = `url('${Utils.safeUrl(b.img)}')`;
            
            if (i === 0) { const preloadImg = new Image(); preloadImg.fetchPriority = "high"; preloadImg.src = Utils.safeUrl(b.img); }
            container.appendChild(div); 
        });
        
        let idx = 0; 
        const intervalMs = (settings.sliderDuration ? Number(settings.sliderDuration) * 1000 : 3000) || 3000;
        
        const nextSlide = () => {
            const slides = container.querySelectorAll('.slide');
            if (slides.length === 0) return;
            slides[idx].classList.remove('active'); 
            idx = (idx + 1) % slides.length; 
            slides[idx].classList.add('active');
        };

        const startTimer = () => { if (!this.sliderTimer) this.sliderTimer = setInterval(nextSlide, intervalMs); };
        const stopTimer = () => { if (this.sliderTimer) { clearInterval(this.sliderTimer); this.sliderTimer = null; } };

        // 🛡️ التحكم العميق لإنقاذ البطارية
        if (!this._visibilityBound) {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) stopTimer(); else if (container.offsetParent !== null) startTimer();
            });
            this._visibilityBound = true;
        }

        if ('IntersectionObserver' in window) {
            if (this._sliderObserver) this._sliderObserver.disconnect();
            
            this._sliderObserver = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && !document.hidden) startTimer();
                else stopTimer();
            });
            this._sliderObserver.observe(container);
        } else {
            startTimer();
        }
    }, 

    renderTicker: function() {
        const s = LiveStoreData.settings || {};
        const txtEl = document.getElementById('ticker-text');
        const movingLine = document.querySelector('.ticker-moving-line');
        if (txtEl) txtEl.innerText = s.promoText || 'أهلاً وسهلاً بكم في متجرنا';
        if (movingLine) movingLine.className = `ticker-moving-line ticker-anim-${s.promoAnim || 'horizontal-normal'}`;
    },

    getFlagUrl: function(curr) { return RenderHelpers.getCurrencyFlagUrl(curr); },
    setFlagEl: function(el, curr) {
        if(!el) return;
        el.innerHTML = '';
        const img = document.createElement('img'); img.className = 'ct-flag'; img.alt = curr; img.src = this.getFlagUrl(curr);
        img.onerror = () => { el.innerHTML = `<span class="ct-flag-emoji">🌍</span>`; };
        el.appendChild(img);
    },
    refreshCurrencyMenuFlags: function() { document.querySelectorAll('.ct-item').forEach(item => this.setFlagEl(item.querySelector('.ct-flag-box'), item.dataset.curr || item.getAttribute('data-curr'))); },

        setDisplayCurrency: function(curr) {
        if (!DataManager.user) return; 
        
        // 1. تحديث العملة في البيانات المحلية
        DataManager.selectedCurr = curr || (DataManager.user.baseCurrency || 'USD');
        localStorage.setItem(CACHE_KEYS.DISPLAY_CURRENCY || 'telecard_display_currency', DataManager.selectedCurr);
        
        // 2. تحديث الرصيد والأعلام ونافذة الشراء (إن كانت مفتوحة)
        this.updateDisplayBalance();
        const pm = document.getElementById('purchase-modal');
        if(pm && pm.classList.contains('active') && DataManager.currentProd) { getSys().updatePriceDisplay?.(); }
        this.updateDisplayCurrencyUI(DataManager.selectedCurr);

        // 3. 🚀 التحديث الماسي: إجبار الرسام (RenderManager) على تحديث الشاشة الحالية فوراً
        if (typeof RenderManager !== 'undefined') {
            if (this.currentCategoryId) {
                // إذا كان المستخدم داخل قسم معين
                RenderManager._renderContent(this.currentCategoryId);
            } else if (document.body.classList.contains('is-home')) {
                // إذا كان المستخدم في الصفحة الرئيسية
                RenderManager.renderHome(true);
            } else if (document.body.classList.contains('is-favorites')) {
                // إذا كان المستخدم في المفضلة
                RenderManager.renderFavorites();
            }
            
            // تحديث فوري إذا كانت المحفظة أو الطلبات مفتوحة
            if (document.getElementById('wallet-modal')?.classList.contains('active')) {
                RenderManager.renderWallet(true);
            }
            if (document.getElementById('orders-modal')?.classList.contains('active')) {
                RenderManager.renderOrders(true);
            }
        }
    },


    clearDisplayCurrencyTimer: function() { if(this.displayMenuTimer) { clearTimeout(this.displayMenuTimer); this.displayMenuTimer = null; } },
    toggleDisplayCurrencyMenu: function() {
        const menu = document.getElementById('ct-menu');
        if(!menu) return;
        if(menu.classList.contains('open')) { this.closeDisplayCurrencyMenu(); } 
        else { this.clearDisplayCurrencyTimer(); menu.classList.add('open'); this.displayMenuTimer = setTimeout(() => { this.closeDisplayCurrencyMenu(); }, 6000); }
    },
    closeDisplayCurrencyMenu: function() { this.clearDisplayCurrencyTimer(); document.getElementById('ct-menu')?.classList.remove('open'); },
    selectDisplayCurrency: function(curr) { this.setDisplayCurrency(curr); this.updateDisplayCurrencyUI(curr); this.closeDisplayCurrencyMenu(); },

    renderDynamicCurrencyMenu: function() {
        const menu = document.getElementById('ct-menu');
        const nativeSel = document.getElementById('display-currency');
        if (!menu) return;
        
        const user = DataManager.user;
        const baseCurr = (user?.baseCurrency || user?.base_currency || 'USD').toUpperCase();
        const rawRates = typeof DataManager.getRates === 'function' ? DataManager.getRates() : [];
        const availableCodes = new Set();
        if (baseCurr && baseCurr.trim() !== "") availableCodes.add(baseCurr);
        
        (Array.isArray(rawRates) ? rawRates : Object.values(rawRates)).forEach(r => { if (r && r.code && r.isActive !== false) availableCodes.add(r.code.toUpperCase()); });
        availableCodes.add('USD');
        
        const selected = (DataManager.selectedCurr || baseCurr || 'USD').toUpperCase();
        let menuHtml = '', nativeHtml = '';
        
        availableCodes.forEach(code => {
            const safeCode = Utils.escapeHtml(code); 
            menuHtml += `<div class="ct-item ${code === selected ? 'active' : ''}" data-curr="${safeCode}"><div class="ct-flag-box"></div><span class="ct-name">${safeCode}</span></div>`;
            nativeHtml += `<option value="${safeCode}" ${code === selected ? 'selected' : ''}>${safeCode}</option>`;
        });    
        menu.innerHTML = menuHtml;
        if (nativeSel) nativeSel.innerHTML = nativeHtml;
        
        this.refreshCurrencyMenuFlags();
        if (!menu.dataset.delegated) {
            menu.addEventListener('click', (e) => { const item = e.target.closest('.ct-item'); if (item) this.selectDisplayCurrency(item.dataset.curr); });
            menu.dataset.delegated = "true";
        }
    },    
    
    updateDisplayCurrencyUI: function(curr) {
        const code = curr || 'USD';
        this.renderDynamicCurrencyMenu();
        const label = document.getElementById('ct-label'); if(label && label.innerText !== code) label.innerText = code;
        this.setFlagEl(document.getElementById('ct-flag-box'), code);
        const nativeSel = document.getElementById('display-currency'); if(nativeSel && nativeSel.value !== code) nativeSel.value = code;
        
        document.querySelectorAll('.ct-item').forEach(item => item.classList.toggle('active', item.dataset.curr === code));

        const ctWrapper = document.querySelector('.ct-wrapper');
        if (ctWrapper) {
            if ((LiveStoreData.settings || {}).showCurrencyToggle === false) { ctWrapper.classList.add('hide-element'); ctWrapper.style.display = 'none'; } 
            else { ctWrapper.classList.remove('hide-element'); ctWrapper.style.display = ''; }
        }
    },

    initSupportButton: function() {
        const settings = LiveStoreData.settings || {};
        const supportLink = settings.supportLink; const supportIcon = settings.supportIcon || 'fa-whatsapp'; const supportAnimation = settings.supportAnimation || 'none';
        let iconClass = (supportIcon === 'fa-whatsapp' || supportIcon === 'fa-telegram') ? `fa-brands ${supportIcon}` : (supportIcon && supportIcon.startsWith('fa-')) ? `fa-solid ${supportIcon}` : `fa-solid fa-headset`;
        const processBtn = (btnId, iconId, wrapperId) => {
            const btn = document.getElementById(btnId); const icon = document.getElementById(iconId); const wrapper = document.getElementById(wrapperId);
            if(btn && icon && wrapper) {
                icon.className = iconClass; wrapper.classList.remove('support-anim-glow', 'support-anim-pulse', 'support-anim-blink', 'support-anim-bounce', 'support-anim-shake');
                if(supportAnimation !== 'none') wrapper.classList.add(`support-anim-${supportAnimation}`);
                btn.style.display = 'flex';
                
                const newBtn = btn.cloneNode(true);
                btn.replaceWith(newBtn);
                
                if(supportLink && supportLink.trim()) { newBtn.addEventListener('click', (e) => { e.stopPropagation(); this.sfx?.('nav'); this.openSupport(); }); } 
                else { newBtn.addEventListener('click', (e) => { e.stopPropagation(); }); }
            }
        };
        processBtn('header-support-btn', 'header-support-icon', 'header-support-icon-wrapper');
        processBtn('sidebar-support-btn', 'sidebar-support-icon', 'sidebar-support-icon-wrapper');
    },

    openSupport: function() {
        const supportLink = (LiveStoreData.settings || {}).supportLink;
        if(supportLink) { if(supportLink.startsWith('http')) { window.open(supportLink, '_blank'); } else { window.open(`https://wa.me/${supportLink.replace(/[^0-9]/g, '')}`, '_blank'); } }
    },
    
    updateSidebarText: function() {
        document.querySelectorAll('.cs-link').forEach(link => { if(link.innerText.includes('شحن الرصيد')) link.innerHTML = '<i class="fa-solid fa-circle-plus"></i> إيداع رصيد'; });
        const modalTitle = document.querySelector('#balance-modal .pm-title-badge'); if(modalTitle && modalTitle.innerText.includes('شحن')) modalTitle.innerText = 'إيداع رصيد';
    },

    activateSearch: function() {
        this.toggleHeroSection(false);
        const searchInput = document.getElementById('store-search-input');
        if(searchInput) { searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); searchInput.focus(); }
    },

    applyStoreSearch: function() {
        const inp = document.getElementById('store-search-input');
        if(RenderManager.searchStoreTerm) RenderManager.searchStoreTerm(inp ? inp.value : '');
    },

    setFilterDefaults: function(prefix) {
        const datePrefix = prefix === 'payments' ? 'pay' : prefix;
        const startEl = document.getElementById(`${datePrefix}-date-start`), endEl = document.getElementById(`${datePrefix}-date-end`);
        if(startEl) startEl.value = ''; if(endEl) endEl.value = '';
        const dispStart = document.getElementById(`disp-${datePrefix}-date-start`), dispEnd = document.getElementById(`disp-${datePrefix}-date-end`);
        const today = new Date(), yesterday = new Date(today); yesterday.setDate(today.getDate() - 1); 
        const formatDate = (date) => { const d = String(date.getDate()).padStart(2, '0'), m = String(date.getMonth() + 1).padStart(2, '0'), y = date.getFullYear(); return `${y}/${m}/${d}`; };
        if(dispStart) { dispStart.innerText = formatDate(yesterday); dispStart.classList.remove('placeholder'); }
        if(dispEnd) { dispEnd.innerText = formatDate(today); dispEnd.classList.remove('placeholder'); }
    },

    checkSystemStatus: function() {
        const sys = LiveStoreData.system || {};
        
        if (sys.maint === true || sys.maintenance === true) {
            const msg = sys.msg || sys.maintenanceMsg || 'نحن نجري بعض التحسينات حالياً.';
            let dateHtml = '';
            if(sys.date) {
                const d = new Date(Number(sys.date)).toLocaleString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                dateHtml = `<div class="m-date"><i class="fa-regular fa-clock"></i> وقت العودة المتوقع: <span dir="ltr">${d}</span></div>`;
            }
            
            document.body.innerHTML = `<div class="maintenance-screen"><div class="m-glass-box"><i class="fa-solid fa-person-digging m-icon"></i><h1 class="m-title">المتجر في وضع الصيانة</h1><p class="m-desc">${Utils.escapeHtml(msg)}</p>${dateHtml}<button id="maint-refresh-btn" class="btn btn-primary mt-20">تحديث الصفحة</button></div></div>`;
            document.getElementById('maint-refresh-btn').addEventListener('click', () => location.reload());
            return true;
        }

        if (sys.freeze === true) {
            let freezeBanner = document.getElementById('system-freeze-banner');
            if (!freezeBanner) {
                freezeBanner = document.createElement('div');
                freezeBanner.id = 'system-freeze-banner';
                freezeBanner.className = 'freeze-notice-bar'; 
                freezeBanner.innerHTML = `<i class="fa-solid fa-snowflake fa-spin-slow"></i> <span>${Utils.escapeHtml(sys.freezeMsg || 'العمليات المالية متوقفة مؤقتاً للتحديث.')}</span>`;
                document.body.prepend(freezeBanner);
            }
        } else {
            document.getElementById('system-freeze-banner')?.remove();
        }

        return false;
    },

    checkBrowserCompatibility: function() {
        const features = { 'localStorage': typeof(Storage) !== "undefined", 'CSS Grid': CSS.supports('display', 'grid'), 'CSS Flexbox': CSS.supports('display', 'flex') };
        let compatibleFeatures = 0, totalFeatures = 0;
        for (const [feature, supported] of Object.entries(features)) { totalFeatures++; if (supported) compatibleFeatures++; }
        if ((compatibleFeatures / totalFeatures) * 100 < 80) console.warn('⚠️ متصفحك قد لا يدعم جميع الميزات بشكل كامل');
        return features;
    },

    testPerformance: function() {
        const startTime = performance.now(); const memoryBefore = performance.memory ? performance.memory.usedJSHeapSize : 0;
        const avatar = document.getElementById('cs-avatar');
        if (avatar) {
            const imgLoadStart = performance.now(); const tempImg = new Image();
            tempImg.onload = () => { console.log(`✅ صورة الأفاتار تم تحميلها في ${(performance.now() - imgLoadStart).toFixed(2)}ms`); };
            tempImg.src = avatar.src || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
        }
        setTimeout(() => {
            const totalTime = performance.now() - startTime; const memoryUsed = (performance.memory ? performance.memory.usedJSHeapSize : 0) - memoryBefore;
            console.log(`📊 أداء النظام: وقت التهيئة ${totalTime.toFixed(2)}ms | الذاكرة ${(memoryUsed / 1024 / 1024).toFixed(2)}MB`);
        }, 1000);
    },

    // =========================================================
    // ❤️ نظام المفضلة السحري
    // =========================================================
    toggleFavoriteFromModal: function() {
        if (!DataManager.currentProd) return;
        if (!DataManager.user) { getSys().showToast?.('يجب تسجيل الدخول', 'error'); this.sfx?.('error'); setTimeout(() => { window.location.replace('login.html'); }, 1500); return; }
        
        const productId = DataManager.currentProd.id;
        const wasFavorite = DataManager.isFavorite?.(productId);
        if (DataManager.toggleFavorite) DataManager.toggleFavorite(productId);
        
        const btn = document.getElementById('pm-fav-btn');
        if (btn) {
            btn.classList.toggle('active', !wasFavorite);
            const icon = btn.querySelector('i');
            if (icon) icon.className = !wasFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        }
        
        this.sfx?.('nav');
        if (wasFavorite) {
            getSys().showToast?.('تمت إزالة المنتج من المفضلة', 'info');
            if (document.body.classList.contains('is-favorites')) {
                const card = document.querySelector(`.product-card[data-id="${productId}"]`);
                if (card) {
                    card.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'; card.style.opacity = '0'; card.style.transform = 'scale(0.8)';
                    setTimeout(() => { card.remove(); if (document.querySelectorAll('#store-grid .product-card').length === 0 && RenderManager.renderFavorites) RenderManager.renderFavorites(); }, 300);
                }
            }
        } else { getSys().showToast?.('تمت إضافة المنتج إلى المفضلة', 'success'); }
        
        if (typeof this.updateFavBadgeCount === 'function') this.updateFavBadgeCount();
    },
    
    triggerMagicFavorite: function(e, productId) {
        if (e) e.preventDefault();
        if (!DataManager?.user) { getSys().showToast?.('يجب تسجيل الدخول', 'error'); this.sfx?.('error'); setTimeout(() => { window.location.replace('login.html'); }, 1500); return; }
        
        const wasFavorite = DataManager.isFavorite?.(productId);
        if (DataManager.toggleFavorite) DataManager.toggleFavorite(productId);
        
        const headerHeart = document.getElementById('sticky-fav-btn');
        const productCard = document.querySelector(`.product-card[data-id="${productId}"]`);
        const imgBox = productCard?.querySelector('.card-image');
        
        if (wasFavorite) {
            getSys().showToast?.('تمت الإزالة', 'info'); this.sfx?.('nav');
            if (imgBox) { const popHeart = document.createElement('i'); popHeart.className = 'fa-solid fa-heart-crack center-crack-heart'; imgBox.appendChild(popHeart); setTimeout(() => popHeart.remove(), 800); }
            if (typeof this.updateFavBadgeCount === 'function') this.updateFavBadgeCount();
            if (document.body.classList.contains('is-favorites') && productCard) {
                productCard.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'; productCard.style.opacity = '0'; productCard.style.transform = 'scale(0.8)';
                setTimeout(() => { productCard.remove(); if (document.querySelectorAll('#store-grid .product-card').length === 0 && RenderManager.renderFavorites) RenderManager.renderFavorites(); }, 300);
            }
            return;
        }
        
        getSys().showToast?.('تمت الإضافة للمفضلة', 'success'); this.sfx?.('success');
        
        let startX = window.innerWidth / 2, startY = window.innerHeight / 2;
        if (imgBox) {
            const rect = imgBox.getBoundingClientRect(); startX = rect.left + (rect.width / 2); startY = rect.top + (rect.height / 2);
            const popHeart = document.createElement('i'); popHeart.className = 'fa-solid fa-heart center-pop-heart'; imgBox.appendChild(popHeart); setTimeout(() => popHeart.remove(), 700);
        } else if (e?.clientX) { startX = e.clientX; startY = e.clientY; }
        
        let endX = window.innerWidth / 2, endY = 20;
        if (headerHeart && headerHeart.getBoundingClientRect().width > 0) { const rect = headerHeart.getBoundingClientRect(); endX = rect.left + (rect.width / 2); endY = rect.top + (rect.height / 2); }
        
        const flyingHeart = document.createElement('i');
        flyingHeart.className = 'fa-solid fa-heart flying-magic-heart';
        flyingHeart.style.setProperty('--startX', `${startX}px`); flyingHeart.style.setProperty('--startY', `${startY}px`);
        flyingHeart.style.setProperty('--endX', `${endX}px`); flyingHeart.style.setProperty('--endY', `${endY}px`);
        document.body.appendChild(flyingHeart);
        
        setTimeout(() => {
            flyingHeart.remove();
            if (headerHeart && headerHeart.getBoundingClientRect().width > 0) {
                headerHeart.classList.add('pulse-catch');
                if (typeof this.updateFavBadgeCount === 'function') this.updateFavBadgeCount();
                setTimeout(() => headerHeart.classList.remove('pulse-catch'), 500);
            } else if (typeof this.updateFavBadgeCount === 'function') this.updateFavBadgeCount();
        }, 800);
    },    

    openCommunityModal: function() {
        this.closeSidebar();
        const target = document.getElementById('community-links-target');
        if (!target) return;
        
        const s = LiveStoreData.settings || {};
        const tChan = Utils.safeUrl(s.telegramChannel || s.telegramLink || ''), tGrp = Utils.safeUrl(s.telegramGroup || '');
        const wGrp = Utils.safeUrl(s.whatsappGroup || ''), fPage = Utils.safeUrl(s.facebookPage || '');
        
        let html = '';
        if (tChan && tChan !== '#') html += `<a href="${tChan}" target="_blank" rel="noopener noreferrer" class="community-item-card" onclick="ClientSystem.sfx('nav')"><div class="community-left"><div class="community-icon" style="background: #24A1DE;"><i class="fa-brands fa-telegram"></i></div><div class="community-info"><span class="community-name">قناتنا الرسمية على تلغرام</span><span class="community-desc">أحدث الأسعار، العروض، والمسابقات الحصرية أولاً بأول.</span></div></div><i class="fa-solid fa-chevron-left community-arrow"></i></a>`;
        if (tGrp && tGrp !== '#') html += `<a href="${tGrp}" target="_blank" rel="noopener noreferrer" class="community-item-card" onclick="ClientSystem.sfx('nav')"><div class="community-left"><div class="community-icon" style="background: #229ED9;"><i class="fa-solid fa-users"></i></div><div class="community-info"><span class="community-name">مجموعة مناقشات الأعضاء</span><span class="community-desc">تبادل الأفكار، والنقاشات الفورية مع عائلة المتجر.</span></div></div><i class="fa-solid fa-chevron-left community-arrow"></i></a>`;
        if (wGrp && wGrp !== '#') html += `<a href="${wGrp}" target="_blank" rel="noopener noreferrer" class="community-item-card" onclick="ClientSystem.sfx('nav')"><div class="community-left"><div class="community-icon" style="background: #25D366;"><i class="fa-brands fa-whatsapp"></i></div><div class="community-info"><span class="community-name">مجموعتنا على واتساب</span><span class="community-desc">تحديثات سريعة ودعم مباشر متاح على مدار الساعة.</span></div></div><i class="fa-solid fa-chevron-left community-arrow"></i></a>`;
        if (fPage && fPage !== '#') html += `<a href="${fPage}" target="_blank" rel="noopener noreferrer" class="community-item-card" onclick="ClientSystem.sfx('nav')"><div class="community-left"><div class="community-icon" style="background: #1877F2;"><i class="fa-brands fa-facebook-f"></i></div><div class="community-info"><span class="community-name">صفحتنا على فيسبوك</span><span class="community-desc">تابع أخبارنا وتواصل معنا عبر منصة فيسبوك الرسمية.</span></div></div><i class="fa-solid fa-chevron-left community-arrow"></i></a>`;
        
        target.innerHTML = html ? html : `<div class="empty-state-v2"><i class="fa-solid fa-share-nodes"></i><h3>قريباً جداً</h3><p>تعمل الإدارة حالياً على تجهيز شبكات التواصل الاجتماعي.</p></div>`;
        this.openModal('community');
    },

    openRatingModal: function() {
        this.closeSidebar();
        this._currentRating = 0;
        const btn = document.getElementById('btnContinueRating');
        if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
        if (document.getElementById('ratingFeedbackInput')) document.getElementById('ratingFeedbackInput').value = '';
        
        document.querySelectorAll('.rating-star').forEach(star => star.className = 'fa-regular fa-star rating-star');
        
        ['rating-step-stars', 'rating-step-feedback', 'rating-step-share'].forEach((id, i) => { const el = document.getElementById(id); if(el) el.style.display = i===0?'block':'none'; });
        this.openModal('rating');
    },
    
    selectRatingStar: function(val) {
        this._currentRating = val; this.sfx?.('nav');
        document.querySelectorAll('.rating-star').forEach(star => {
            star.className = parseInt(star.dataset.value || star.getAttribute('data-value')) <= val ? 'fa-solid fa-star rating-star active' : 'fa-regular fa-star rating-star';
        });
        const btn = document.getElementById('btnContinueRating'); if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    },
    
    submitRatingStep: function() {
        this.sfx?.('nav');
        document.getElementById('rating-step-stars').style.display = 'none';
        document.getElementById((this._currentRating || 0) <= 3 ? 'rating-step-feedback' : 'rating-step-share').style.display = 'block';
    },
    
    submitPrivateFeedback: async function() {
        const rawFeedback = document.getElementById('ratingFeedbackInput')?.value.trim() || '';
        const feedback = Utils.escapeHtml ? Utils.escapeHtml(rawFeedback) : rawFeedback.replace(/[<>]/g, '');
        
        if (!feedback) { getSys().showToast?.("يرجى كتابة تفاصيل مقترحك أو شكواك لمساعدتنا على خدمتك", "warning"); return; }
        
        const btn = document.getElementById('btnSubmitFeedback');
        if (btn) { btn.textContent = "جاري الإرسال..."; btn.disabled = true; }
        
        try {
            await StoreDB.add(DB_KEYS.FEEDBACKS, {
                userId: DataManager.user?.id || localStorage.getItem(CACHE_KEYS.ACTIVE_UID || 'telecard_active_user_uid') || 'guest',
                username: DataManager.user?.username || 'ضيف',
                rating: this._currentRating || 0,
                feedback: feedback,
                time: Date.now()
            });
            
            getSys().toggleLoader?.(false); getSys().closeModal?.('rating'); getSys().showToast?.("نشكرك جداً! تم الإرسال للإدارة.", "success"); this.sfx?.('success');
        } catch (error) {
            if (btn) { btn.textContent = "إرسال للإدارة"; btn.disabled = false; }
            getSys().showToast?.("حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.", "error");
        }
    },

    openAboutModal: function() {
        this.closeSidebar(); 
        const s = LiveStoreData.settings || {};
        const storeName = s.storeName || s.name || 'المتجر';
        const logoDark = s.storeLogo || s.logo || '';
        
        const logoTarget = document.getElementById('about-logo-box');
        if (logoTarget) {
            logoTarget.innerHTML = logoDark 
                ? `<div class="alert-icon-box" style="width: 75px; height: 75px; background: rgba(255,215,0,0.05); border: 1px solid var(--gold-main); border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; box-shadow: 0 0 15px rgba(255, 215, 0, 0.15);"><img src="${Utils.escapeHtml(logoDark)}" alt="Logo" style="max-height: 48px; width: auto; object-fit: contain;"></div>`
                : `<div class="alert-icon-box"><i class="fa-solid fa-circle-info" style="font-size: 24px;"></i></div>`;
        }
        
        const titleEl = document.getElementById('about-popup-title');
        if(titleEl) titleEl.innerHTML = `عن <span class="brand-text-dynamic num-en" style="font-size: 22px !important; display: inline-block;">${Utils.escapeHtml(storeName)}</span>`;
        
        const descEl = document.getElementById('about-popup-desc');
        if(descEl) descEl.textContent = s.aboutUs || s.storeDesc || 'بوابتك الأولى والآمنة لشراء وتداول الكروت الرقمية وبطاقات الشحن لجميع الألعاب والخدمات العالمية.';
        
        this.openModal('about');
    },  

    updateFavBadgeCount: function() {
        const countBadge = document.getElementById('sticky-fav-count');
        const headerHeartIcon = document.querySelector('#sticky-fav-btn i');
        if (!countBadge || !DataManager) return;
        
        const favCount = DataManager.favs ? DataManager.favs.size : 0;
        
        if (favCount > 0) {
            countBadge.innerText = favCount > 99 ? '+99' : favCount;
            countBadge.classList.remove('hide-element');
            if (headerHeartIcon) headerHeartIcon.className = 'fa-solid fa-heart';
        } else {
            countBadge.classList.add('hide-element');
            if (headerHeartIcon) headerHeartIcon.className = 'fa-regular fa-heart';
        }
    }
};
