
// ============================================================================
// ⚙️ وحدة الأساسيات والنواة (ui/uiCore.js) - الإصدار المؤسسي V21.1.0 💎
// 🎯 الوظيفة: إدارة النوافذ ذي المستويين، التوجيه الذكي، الأحداث التفاعلية، وموزع النقرات المركزي.
// 🚀 التحديثات المعمارية الصارمة (V21.1.0 - Citadel Router, Sync PopState Guard & Live Tx-Detail):
// 1. Synchronous Modal State + PopState Guard 🛡️: تحديث متزامن لـ UIState مع حارس (_ignorePopStateCount) يمنع إغلاق النوافذ المتتالية بالخطأ.
// 2. Two-Level Modal Stack 🪟: منع تراكم النوافذ الرئيسية مع السماح للنوافذ الفرعية (tx-detail, pay-receipt) بالفتح فوقها.
// 3. Live Open Tx-Detail Refresh ⚡: تحديث نافذة تفاصيل العملية (tx-detail) لحظياً إذا وصل الكود أو تغيرت الحالة وهي مفتوحة.
// 4. Deterministic ViewState Routing 🧭: ربط التنقل (Home, Category, Favorites, Search) بـ UIState ومزامنة الشريط السفلي تلقائياً.
// ============================================================================

import { CACHE_KEYS, ACTIVE_USER_KEY, DYNAMIC_PREFIXES } from '../config.js';           
import * as Utils from '../utils.js'; 
import { DataManager, LiveStoreData } from '../dataManager.js'; 
import { RenderManager } from '../renderManager.js'; 
import { Components, CalendarApp } from '../components.js';     
import { RenderHelpers } from '../core/renderHelpers.js'; 
import { FinancialEngine } from '../core/financialEngine.js';
import { UIManager, UIState } from './uiManager.js';

let deferredInstallPrompt = null; 

export const UICore = {
    displayMenuTimer: null,
    audioCtx: null,
    _lastSfxTime: 0,
    navHistory: [],
    currentCategoryId: null,
    historyStateSet: false,
    _reactiveEventsBound: false,
    _ignorePopStateCount: 0,

    // =========================================================
    // 🚨 0. نافذة الطرد المباشر الآمنة (Deep Purge Enabled)
    // =========================================================
    triggerLiveBanAlert: function(reasonMessage) {
        const msgText = Utils.escapeHtml(reasonMessage || 'تم تقييد حسابك.');
        
        let overlay = document.getElementById('global-security-alert');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'global-security-alert';
            overlay.className = 'sys-dialog-wrapper active master-overlay';
            document.body.appendChild(overlay);
            
            const mainApp = document.getElementById('app-container') || document.querySelector('.main-wrapper');
            if (mainApp) mainApp.style.display = 'none'; 
        } else {
            overlay.classList.add('active');
        }

        overlay.innerHTML = `
            <div class="sys-dialog-card danger-border">
                <div class="sys-dialog-header">
                    <div class="sys-dialog-icon danger"><i class="fa-solid fa-ban"></i></div>
                    <h3 class="sys-dialog-title danger">تنبيه أمني</h3>
                </div>
                <div class="sys-dialog-msg-container"><p class="sys-dialog-msg">${msgText}</p></div>
            </div>
        `;
        
        this.sfx?.('error');
        
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, null, window.location.href);
        }
        
        setTimeout(() => {
            if (DataManager && typeof DataManager.logout === 'function') {
                DataManager.logout(true);
            } else {
                try {
                    localStorage.removeItem(CACHE_KEYS.ACTIVE_UID);
                    localStorage.removeItem(ACTIVE_USER_KEY);
                    localStorage.removeItem(CACHE_KEYS.DISPLAY_CURRENCY);
                    
                    Object.keys(localStorage).forEach(key => {
                        if (key.startsWith(DYNAMIC_PREFIXES.ALERT_VIEWS) ||
                            key.startsWith(DYNAMIC_PREFIXES.USER_IMAGE) ||
                            key.startsWith(DYNAMIC_PREFIXES.KYC_CELEBRATION)) {
                            localStorage.removeItem(key);
                        }
                    });

                    sessionStorage.clear();
                    if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
                        indexedDB.databases().then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name).catch(()=>{})));
                    }
                } catch (e) { console.warn("🛡️ System Purge Guard:", e); }
                window.location.replace('login.html');
            } 
        }, 3500); 
    },

    openSettings: function() {
        this.renderSettingsUI();
        this.openModal('settings');
    },
    closeSettings: function() {
        this.closeModal('settings');
    },

    // =========================================================
    // 🌗 1. دوال الثيم والهوية البصرية
    // =========================================================
    toggleTheme: function() {
        const isCurrentlyLight = document.body.classList.contains('light-mode');
        this.setThemePref(isCurrentlyLight ? 'dark' : 'light');
    },
    
    setThemePref: function(mode) {
        const isLight = mode === 'light';
        document.body.classList.toggle('light-mode', isLight);
        try { localStorage.setItem(CACHE_KEYS.THEME, isLight ? 'light' : 'dark'); } catch (e) {}
        
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

    applySavedTheme: function() {
        let savedTheme = 'dark';
        try { savedTheme = localStorage.getItem(CACHE_KEYS.THEME) || 'dark'; } catch (e) {}
        this.setThemePref(savedTheme);
    },
    initTheme: function() {
        let savedTheme = 'dark';
        try { savedTheme = (DataManager.prefs && DataManager.prefs.theme) ? DataManager.prefs.theme : (localStorage.getItem(CACHE_KEYS.THEME) || 'dark'); } catch (e) {}
        this.setThemePref(savedTheme);
    },
    
    // =========================================================
    // 🔊 إعدادات الأصوات
    // =========================================================
    toggleSoundPref: function() {
        if (!DataManager.prefs) return;
        DataManager.prefs.sound = !DataManager.prefs.sound;
        if (DataManager.savePrefs) DataManager.savePrefs();
        this.updateSoundUI();
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
        this.setThemePref((DataManager.prefs?.theme === 'light' || document.body.classList.contains('light-mode')) ? 'light' : 'dark');
        this.updateSoundUI();
    },

    _getFullName: function(user) {
        const u = user || DataManager.user || {};
        const isKycApproved = (u.kycStatus === 'approved' || u.kycStatus === 'verified');
        if (isKycApproved && u.fullName && u.fullName.trim()) return u.fullName.trim();
        if (isKycApproved && u.kycData && u.kycData.fullName && u.kycData.fullName.trim()) return u.kycData.fullName.trim();
        const f = u.firstName || '';
        const l = u.lastName || '';
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
    // 🪟 2. الإدارة المركزية لمكدس النوافذ (2-Level Modal Stack Manager)
    // =========================================================
    _getModalDomElements: function(modalId) {
        if (modalId === 'pay-receipt') {
            return {
                overlay: null,
                modal: document.getElementById('pay-receipt-lightbox')
            };
        }
        return {
            overlay: document.getElementById(`${modalId}-overlay`),
            modal: document.getElementById(`${modalId}-modal`)
        };
    },

    openModal: function(modalId) {
        if (!modalId) return;
        const { overlay, modal } = this._getModalDomElements(modalId);
        if (!modal) return;

        if (!Array.isArray(UIState.activeModals)) UIState.activeModals = [];

        if (UIState.sidebarOpen || document.querySelector('.sidebar.active')) {
            this.closeSidebar(true);
        }

        const isSecondary = UIManager.isSecondaryModal(modalId);
        let replacedPrimaryModal = false;

        // 🛡️ إذا كانت النافذة من المستوى الأول، نغلق أي نوافذ سابقة لمنع التراكم فوق بعضها
        if (!isSecondary && UIState.activeModals.length > 0) {
            const modalsToClose = UIState.activeModals.filter(id => id !== modalId);
            if (modalsToClose.length > 0) {
                replacedPrimaryModal = true;
                modalsToClose.forEach(id => this._deactivateModalDOM(id));
                UIState.activeModals = UIState.activeModals.filter(id => id === modalId);
            }
        }

        document.querySelectorAll('.ct-menu').forEach(el => el.classList.remove('open', 'active'));
        document.querySelectorAll('.custom-dropdown-container').forEach(el => el.classList.remove('open'));
        if (modalId !== 'wallet') {
            const walletDrawer = document.getElementById('walletStatsDrawer');
            if (walletDrawer) {
                walletDrawer.classList.remove('active');
                walletDrawer.closest('#wallet-modal')?.classList.remove('drawer-blur-active');
                document.querySelector('.detail-arrow')?.classList.remove('open');
            }
        }

        document.body.classList.add('no-scroll');
        
        if (overlay) overlay.classList.add('active'); 
        modal.scrollTop = 0;
        const scrollable = modal.querySelector('.pm-scroll-content, .scrollable, .profile-container, .modal-content');
        if (scrollable) scrollable.scrollTop = 0;
        
        requestAnimationFrame(() => modal.classList.add('active'));
        
        if (window.history && window.history.pushState) {
            const currentHistModal = window.history.state?.modal;
            if (currentHistModal !== modalId) {
                if (replacedPrimaryModal && currentHistModal && !UIManager.isSecondaryModal(currentHistModal)) {
                    window.history.replaceState({ modal: modalId }, '', `#${modalId}`);
                } else {
                    window.history.pushState({ modal: modalId }, '', `#${modalId}`);
                }
            }
        }

        if (!UIState.activeModals.includes(modalId)) {
            UIState.activeModals.push(modalId);
        }

        if (modalId === 'identity') {
            const listTarget = document.getElementById('countries-list-target');
            if (listTarget) listTarget.innerHTML = '<div class="dropdown-item" style="justify-content: center; color: var(--text-muted);">جاري تحميل الدول...</div>';
            if (typeof DataManager.getAdminCountries === 'function') {
                DataManager.getAdminCountries().then(countries => {
                    if (RenderManager.renderCountryList) RenderManager.renderCountryList(countries);
                });
            }
            UIManager.loadDynamicCurrenciesForModal?.();
        }
        if (modalId === 'kyc-upload') UIManager.prepareKycModalState?.();

        UIManager.syncBottomNavUI();
    },

    _deactivateModalDOM: function(modalId) {
        if (modalId === 'purchase' || modalId === 'purchase-success') {
            Components.removeCoupon?.(true);
        }
        if (modalId === 'tx-detail') {
            UIState.activeDetailTx = null;
        }
        const { overlay, modal } = this._getModalDomElements(modalId);
        if (modal) {
            requestAnimationFrame(() => modal.classList.remove('active'));
            if (modal._scrollTimer) clearTimeout(modal._scrollTimer);
            modal._scrollTimer = setTimeout(() => {
                if (modalId === 'pay-receipt') {
                    const img = document.getElementById('pay-receipt-img');
                    if (img) img.src = '';
                } else {
                    modal.scrollTop = 0;
                    modal.querySelectorAll('.pm-scroll-content, .scrollable, .modal-content, .profile-container, .profile-pass-body, [id$="-list"]').forEach(s => s.scrollTop = 0);
                }
            }, 350);
        }
        if (overlay) {
            requestAnimationFrame(() => overlay.classList.remove('active'));
        }
    },

    closeModal: function(modalId, skipHistoryPop = false) {
        if (!Array.isArray(UIState.activeModals)) UIState.activeModals = [];

        if (!modalId) { 
            if (UIState.activeModals.length > 0) {
                modalId = UIState.activeModals[UIState.activeModals.length - 1];
            } else {
                UIManager.closePurchaseModal?.();
                return; 
            }
        }

        // 1. تحديث متزامن وفوري للـ DOM ولـ UIState لمنع أي سباق زمني مع النوافذ التالية
        this._deactivateModalDOM(modalId);
        UIState.activeModals = UIState.activeModals.filter(id => id !== modalId);
        if (UIState.activeModals.length === 0 && !UIState.sidebarOpen) {
            document.body.classList.remove('no-scroll');
        }
        UIManager.syncBottomNavUI();

        // 2. تنظيف سجل التاريخ مع تفعيل حارس يمنع popstate المتأخر من إغلاق أي نافذة جديدة
        if (!skipHistoryPop && window.history && window.history.state && window.history.state.modal === modalId) {
            this._ignorePopStateCount = (this._ignorePopStateCount || 0) + 1;
            window.history.back(); 
        }
    },    
    
    closeAllModals: function() { 
        if (Array.isArray(UIState.activeModals) && UIState.activeModals.length > 0) {
            [...UIState.activeModals].forEach(id => this.closeModal(id, true)); 
        }
    },

    resetUI: function(preserveState = false) {
        if (!preserveState) {
            this.closeSidebar(true);
            this.closeAllModals();

            ['store-search-input', 'order-search-input', 'wallet-search-input', 'pay-search-input'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        }

        if (UIState.activeListeners) {
            UIState.activeListeners.forEach((listener) => {
                document.removeEventListener('click', listener);
            });
            UIState.activeListeners.clear();
        }

        document.querySelectorAll('.ct-menu').forEach(el => el.classList.remove('open', 'active'));
        document.querySelectorAll('.custom-dropdown-container').forEach(el => el.classList.remove('open'));
        
        const walletDrawer = document.getElementById('walletStatsDrawer');
        if (walletDrawer) { 
            walletDrawer.classList.remove('active');
            walletDrawer.style.removeProperty('max-height'); 
            const walletModal = walletDrawer.closest('#wallet-modal');
            if (walletModal) walletModal.classList.remove('drawer-blur-active');
        }
        document.querySelector('.detail-arrow')?.classList.remove('open');

        if (!UIState.sidebarOpen && UIState.activeModals.length === 0) {
            document.body.classList.remove('no-scroll');
        }
        UIManager.syncBottomNavUI();
    },    
    
    resetGridScroll: function() {
        window.scrollTo(0, 0);
        const grid = document.getElementById('store-grid');
        if (grid) {
            grid.scrollTop = 0;
            let parent = grid.parentElement;
            while (parent && parent.tagName !== 'HTML') {
                parent.scrollTop = 0;
                parent = parent.parentElement;
            }
        }
    },

    syncBottomNavWithBaseState: function() {
        UIManager.syncBottomNavUI();
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
        if (RenderManager.renderTerms) RenderManager.renderTerms();
        else {
            const termsContent = document.getElementById('store-terms-content');
            if (termsContent) termsContent.innerText = (LiveStoreData.settings || {}).terms || 'لا توجد شروط وأحكام مسجلة حالياً.';
        }
        this.openModal('terms');
    },

    openPayReceipt: function(url) {
        const safeUrl = Utils.safeUrl(url);
        if (!safeUrl || safeUrl === '#') return;
        const img = document.getElementById('pay-receipt-img');
        if (img) img.src = safeUrl;
        this.openModal('pay-receipt');
    },

    // =========================================================
    // 🚀 3. التوجيه والقائمة الجانبية 
    // =========================================================
    openSidebar: function() { 
        this.closeAllModals();
        if (DataManager.syncUser) DataManager.syncUser(); 
        
        UIManager.updateProfileDisplay?.();
        this.updateDisplayBalance();

        const menu = document.querySelector('.sidebar') || document.getElementById('cs-menu');
        const overlay = document.getElementById('cs-overlay') || document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-overlay');
        document.body.classList.add('no-scroll');
        UIState.sidebarOpen = true;
        
        if(overlay) { overlay.classList.add('active'); overlay.onclick = (e) => { if(e.target === overlay) this.closeSidebar(); }; }
        if(menu) {
            menu.style.transform = ''; requestAnimationFrame(() => menu.classList.add('active'));
            const menuList = menu.querySelector('.menu-list');
            if(menuList) menuList.scrollTop = 0;
            menu.scrollTop = 0;
            this.initSwipeGestures(menu, overlay);
        }
        this.saveDisplayState();
        UIManager.syncBottomNavUI();
    },

    closeSidebar: function(silent = false) { 
        const menu = document.querySelector('.sidebar') || document.getElementById('cs-menu');
        const overlay = document.getElementById('cs-overlay') || document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-overlay');
        
        UIState.sidebarOpen = false;
        if (!UIState.activeModals || UIState.activeModals.length === 0) {
            document.body.classList.remove('no-scroll');
        }

        if(menu) { menu.classList.remove('active'); menu.style.transform = ''; }
        if(overlay) overlay.classList.remove('active'); 
        
        if (UIState.activeListeners && UIState.activeListeners.has('sidebarClickOutside')) {
            document.removeEventListener('click', UIState.activeListeners.get('sidebarClickOutside'), true);
            UIState.activeListeners.delete('sidebarClickOutside');
        }

        if (!silent) {
            this.saveDisplayState();
            UIManager.syncBottomNavUI();
        }
    },

    bindSidebarProfileTriggers: function() {
        const avatarEl = document.getElementById('cs-avatar');
        const nameEl = document.getElementById('cs-name');
        const handleProfileClick = (e) => { e.preventDefault(); e.stopPropagation(); UIManager.openProfileInfo?.(); this.sfx?.('nav'); };

        if (avatarEl && !avatarEl.dataset.eventBound) { avatarEl.addEventListener('click', handleProfileClick); avatarEl.dataset.eventBound = "true"; avatarEl.style.cursor = 'pointer'; }
        if (nameEl && !nameEl.dataset.eventBound) { nameEl.addEventListener('click', handleProfileClick); nameEl.dataset.eventBound = "true"; nameEl.style.cursor = 'pointer'; }
    },

    setupMainContentClickDetector: function() {
        if (UIState.activeListeners && UIState.activeListeners.has('mainContentClick')) {
            document.removeEventListener('click', UIState.activeListeners.get('mainContentClick'), true);
        }
        
        const handler = (event) => {
            const sidebar = document.querySelector('.sidebar') || document.getElementById('cs-menu');
            if (!sidebar || !sidebar.classList.contains('active')) return;
            if (!sidebar.contains(event.target) && !event.target.closest('.hamburger') && !event.target.closest('[data-action="open-sidebar"]')) {
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
                this.closeSidebar();
            }
        };
        
        UIState.activeListeners.set('mainContentClick', handler);
        document.addEventListener('click', handler, true);
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
            if (!e.touches || e.touches.length === 0) return;
            
            startX = e.touches[0].clientX; startY = e.touches[0].clientY;
            initialOpenState = menu.classList.contains('active');
            if (!initialOpenState && startX <= (window.innerWidth - edgeZone)) return;

            menuWidth = menu.offsetWidth || 260; 
            menu.style.willChange = 'transform'; if(overlay) overlay.style.willChange = 'opacity';
            isDragging = true; isSwipeConfirmed = false; startTime = Date.now();
            
            menu.addEventListener('touchmove', onTouchMove, { passive: false });
            menu.addEventListener('touchend', onTouchEnd, { passive: true });
            menu.addEventListener('touchcancel', onTouchEnd, { passive: true });
        };

        const onTouchMove = (e) => {
            if (!isDragging || !e.touches || e.touches.length === 0) return;
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
            const diffX = (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0].clientX - startX : 0;
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
    // 📡 4. ربط الأحداث التفاعلية مع DataManager (Reactive Event Subscriptions)
    // =========================================================
    _bindStoreReactiveEvents: function() {
        if (this._reactiveEventsBound) return;
        this._reactiveEventsBound = true;

        // 1. عند جاهزية الكتالوج أو وصول تحديث لحظي للأسعار/العروض/المستويات
        window.addEventListener('store:catalog-ready', (e) => {
            if (RenderManager._priceCache) RenderManager._priceCache.clear();
            
            this.applyStoreIdentity();
            this.applyFontSettings();
            this.initSupportButton();
            this.renderTicker();
            this.updateDisplayCurrencyUI(DataManager.selectedCurr);
            this.updateDisplayBalance();
            UIManager.updateProfileDisplay?.();
            if (RenderManager.renderTerms) RenderManager.renderTerms();

            if (e.detail?.isLiveUpdate) {
                this.initSlider();
                if (UIState.baseView === 'search' && UIState.searchQuery) {
                    RenderManager.searchStoreTerm?.(UIState.searchQuery);
                } else if (UIState.baseView === 'category' && this.currentCategoryId) {
                    RenderManager.renderOfferStories?.(this.currentCategoryId);
                    RenderManager._renderContent?.(this.currentCategoryId);
                } else if (UIState.baseView === 'favorites') {
                    RenderManager.renderFavorites?.();
                } else {
                    RenderManager._lastHomeHash = null;
                    RenderManager.renderHome?.(true);
                }
// تحديث سعر المنتج المفتوح حالياً في نافذة الشراء فوراً
if (UIState.activeModals.includes('purchase') && DataManager.currentProd) {
    UIManager.updatePriceDisplay?.();
    Components.revalidateAppliedCoupon?.();
}

// تحديث بوابات الدفع وحساب الرسوم لحظياً إذا كانت نافذة الإيداع مفتوحة
if (UIState.activeModals.includes('balance')) {
    RenderManager.renderPayMethods?.();
    UIManager.calcFee?.();
}
}
});
        // 2. عند تحديث بيانات المستخدم أو رصيده أو مستواه
        window.addEventListener('store:user-updated', () => {
            UIManager.updateProfileDisplay?.();
            this.updateDisplayBalance();
            this.updateNotifBadges();
            this.updateFavBadgeCount();
            if (UIState.activeModals.includes('wallet')) {
                RenderManager.renderWallet?.(true);
            }
        });

        // 3. عند تحديث سجل الطلبات حياً من السيرفر
        window.addEventListener('store:orders-updated', () => {
            if (UIState.activeModals.includes('orders')) {
                RenderManager.renderOrders?.(true);
            }
            if (UIState.activeModals.includes('wallet')) {
                RenderManager.renderWallet?.(true);
            }
            if (UIState.activeModals.includes('tx-detail') && UIState.activeDetailTx?.type !== 'deposit') {
                UIManager.refreshOpenDetail?.();
            }
        });

        // 4. عند تحديث سجل الإيداعات حياً من السيرفر
        window.addEventListener('store:deposits-updated', () => {
            if (UIState.activeModals.includes('mypay')) {
                RenderManager.renderPayments?.(true);
            }
            if (UIState.activeModals.includes('wallet')) {
                RenderManager.renderWallet?.(true);
            }
            if (UIState.activeModals.includes('balance')) {
                RenderManager.renderPayMethods?.();
            }
            if (UIState.activeModals.includes('tx-detail') && UIState.activeDetailTx?.type === 'deposit') {
                UIManager.refreshOpenDetail?.();
            }
        });

        // 5. عند وصول إشعارات أو تنبيهات جديدة
        window.addEventListener('store:alerts-updated', (e) => {
            if (!e.detail?.action) {
                this.processAndDisplayAlerts();
            }
            this.updateNotifBadges();
            if (UIState.activeModals.includes('notif-center')) {
                RenderManager.renderNotifCenterList?.();
            }
        });

        // 6. عند تغير العملة
        window.addEventListener('store:currency-changed', (e) => {
            if (RenderManager._priceCache) RenderManager._priceCache.clear();
            const newCurr = e.detail?.currency || DataManager.selectedCurr;
            this.updateDisplayCurrencyUI(newCurr);
            this.updateDisplayBalance();
        });

        // 7. أحداث المفضلة، الحظر، الرسائل الإدارية، التوست، وتسجيل الخروج
        window.addEventListener('store:favorites-updated', () => this.updateFavBadgeCount());
        window.addEventListener('store:user-banned', (e) => this.triggerLiveBanAlert(e.detail?.reason));
        window.addEventListener('store:admin-message', (e) => this.showAdminDirectMessage(e.detail?.message));
        window.addEventListener('store:toast', (e) => this.showToast(e.detail?.msg, e.detail?.type || 'info'));
        window.addEventListener('store:user-logout', () => {
            this.closeSidebar(true);
            this.closeAllModals();
            if (RenderManager) {
                RenderManager._historicalData = { orders: [], deposits: [] };
                RenderManager.highlightId = null;
                RenderManager.limits = { wallet: 15, orders: 15, payments: 15 };
            }
        });
    },
    
    // =========================================================
    // 🎛️ 5. إدارة الأحداث المركزية (Global Event Delegator)
    // =========================================================
    initGlobalListeners: function() {
        this._bindStoreReactiveEvents();

        if (this._listenersBound) return;
        this._listenersBound = true;
        
        window.addEventListener('popstate', () => {
            if (this._ignorePopStateCount > 0) {
                this._ignorePopStateCount--;
                return;
            }
            if (UIState.activeModals && UIState.activeModals.length > 0) {
                this.closeModal(UIState.activeModals[UIState.activeModals.length - 1], true);
                return; 
            }
            if (UIState.sidebarOpen) {
                this.closeSidebar();
                return;
            }
            if (this.currentCategoryId !== null || this.navHistory.length > 0 || UIState.baseView === 'favorites' || UIState.baseView === 'search') {
                this._manualGoBack(true);
            }
        });

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'FCM_NOTIFICATION_CLICK') {
                    const payload = event.data.payload || {};
                    const target = payload.targetType || payload.type;
                    const id = payload.targetId || payload.id;
                    if (target === 'profile') {
                        UIManager.openProfileInfo?.();
                    } else if (target === 'notification') {
                        this.openNotifCenter();
                    } else if (target && id) {
                        if (target === 'order' || target === 'purchase') UIManager.jumpToTransaction?.(id, 'purchase');
                        else if (target === 'deposit' || target === 'wallet') UIManager.jumpToTransaction?.(id, 'deposit');
                        else UIManager.openDetail?.(null, target, id);
                    }
                }
            });
        }

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('action') === 'view') {
            const type = urlParams.get('type'), id = urlParams.get('id');
            setTimeout(() => {
                if (type === 'profile') UIManager.openProfileInfo?.();
                else if (type === 'notification') this.openNotifCenter();
                else if (type === 'orders' && !id) this.openOrders();
                else if (type === 'wallet' && !id) this.openWallet();
                else if (type === 'order' || type === 'purchase') UIManager.jumpToTransaction?.(id, 'purchase');
                else if (type === 'deposit' || type === 'wallet') UIManager.jumpToTransaction?.(id, 'deposit');
                else if (type && id) UIManager.openDetail?.(null, type, id);
                if (window.history && window.history.replaceState) window.history.replaceState(null, '', window.location.pathname);
            }, 1200); 
        }        const NavActions = {
            'nav-home': () => this.navigateHome(),
            'go-back': (e) => {
                if (e) e.preventDefault();
                if (UIState.baseView === 'favorites' || document.body.classList.contains('is-favorites')) {
                    this.closeFavorites();
                    return;
                }
                const searchInp = document.getElementById('store-search-input');
                if ((searchInp && searchInp.value.trim() !== '') || UIState.baseView === 'search') {
                    if (searchInp) searchInp.value = '';
                    UIState.searchQuery = '';
                    if (this.currentCategoryId) {
                        UIManager.setBaseView('category', { categoryId: this.currentCategoryId, searchQuery: '' });
                        RenderManager._renderContent?.(this.currentCategoryId);
                    } else {
                        UIManager.setBaseView('home', { categoryId: null, searchQuery: '' });
                        RenderManager.renderHome?.(true);
                    }
                    return;
                }
                this._manualGoBack(false);
            },
            'nav-deposit': () => this.navigateBalance(),
            'nav-payments': () => this.navigateMyPayments(),
            'nav-orders': () => this.navigateOrders(),
            'nav-settings': () => this.navigateSettings(),
            'nav-wallet': () => this.navigateWallet(),
            'open-sidebar': () => this.openSidebar(),
            'close-sidebar': () => this.closeSidebar(),
            'open-notif-center': () => this.openNotifCenter(),
            'open-about': (e) => { e.preventDefault(); this.openAboutModal(); },
            'open-community': () => this.openCommunityModal(),
            'open-rating': () => this.openRatingModal(),
            'open-terms': () => this.openTermsModal(),
            'open-support': () => this.openSupport(),
            'open-favorites': () => this.openFavorites(),
            'nav-orders-from-success': () => { 
                this.closeModal('purchase-success', true);
                this.navigateOrders();
            },
            'navigate-orders-success': () => {
                this.closeModal('purchase-success', true);
                this.navigateOrders();
            }
        };

        const ModalActions = {
            'close-orders': () => this.closeOrders(),
            'close-wallet': () => this.closeWallet(),
            'close-mypayments': () => this.closeMyPayments(),
            'close-settings': () => this.closeSettings(),
            'close-balance': () => UIManager.closeBalanceModal?.(),
            'back-balance-step': () => UIManager.backToPayMethods?.(),
            'close-purchase': () => UIManager.closePurchaseModal?.(),
            'close-success': () => this.closeModal('success'),
            'close-purchase-success': () => UIManager.closePurchaseSuccess?.(), 
            'open-kyc-upload': () => this.openModal('kyc-upload'),
            'open-kyc-status': (e, id, val, target) => UIManager.openKycStatusModal?.(target.getAttribute('data-state')),
            'close-tx-detail': () => this.closeModal('tx-detail'),
            'close-profile': () => UIManager.closeProfileInfo?.(),
            'close-pay-receipt': () => this.closeModal('pay-receipt'),
            'view-pay-receipt': (e, id, val, target) => {
                e.preventDefault();
                e.stopPropagation();
                const url = target.getAttribute('data-url') || target.getAttribute('href');
                if (url) this.openPayReceipt(url);
            },
            'close-terms': () => this.closeModal('terms'),
            'close-identity': () => this.closeModal('identity'),
            'close-kyc-upload': () => UIManager.closeKycModal?.(),
            'close-kyc-status': () => UIManager.closeKycStatusModal?.(),
            'close-notif-center': () => this.closeNotifCenter(),
            'close-tier-info': () => this.closeModal('tier-info'),
            'close-kyc-celebration': () => this.closeModal('kyc-celebration'),
            'close-community': () => this.closeModal('community'),
            'close-rating': () => this.closeModal('rating'),
            'close-about': () => this.closeModal('about'),
            'open-security-modal': () => UIManager.openSecurityModal?.(),
            'close-security-modal': () => UIManager.closeSecurityModal?.(),
            'close-setup-2fa': () => this.closeModal('setup-2fa'),
            'open-tier-info': (e) => { e.stopPropagation(); UIManager.openTierInfoModal?.(); },
            'open-add-balance': () => UIManager.openAddBalance?.(),
            'toggle-currency-menu': () => this.toggleDisplayCurrencyMenu(),
            'toggle-bal-curr-menu': () => {
                const dropdown = document.getElementById('bal-currency-dropdown');
                if (dropdown) dropdown.classList.toggle('open');
            },
            'toggle-theme': () => this.toggleTheme(),
            'toggle-avatar-menu': () => {
    const menu = document.getElementById('avatar-action-menu');
    if (menu) menu.classList.toggle('active');
},
'locked-pay-toast': () => this.showToast('لديك طلب إيداع قيد المعالجة بهذه الطريقة.', 'warning')
};
        const FinanceActions = {
            'confirm-purchase': async (e, id, val, target) => { 
                if (UIState.isProcessingTx || target.dataset.processing === 'true') {
                    console.warn("🛡️ [Double-Spend Shield] تم حظر نقرة شراء متزامنة.");
                    return;
                }
                target.dataset.processing = 'true';
                try { await UIManager.handlePurchaseSubmit?.(); } 
                finally { target.dataset.processing = 'false'; }
            },
            'submit-balance': async (e, id, val, target, dataType, dataCurr) => {
                if (UIState.isProcessingTx || target.disabled || target.dataset.processing === 'true') {
                    console.warn("🛡️ [Double-Spend Shield] تم حظر نقرة إيداع متزامنة.");
                    return;
                }
                target.dataset.processing = 'true';
                try {
                    await UIManager.handleBalanceSubmit?.(dataCurr, target);
                }
                finally { target.dataset.processing = 'false'; }
            },
            'apply-coupon': () => Components.applyCoupon?.(),
            'remove-coupon': () => Components.removeCoupon?.(),
            'paste-coupon': () => Components.pasteText?.(),
            'select-pay': (e, id) => UIManager.selectPay?.(id),
            'select-bal-curr': (e, id, val, target) => {
                const curr = target.getAttribute('data-curr');
                UIManager.changeDepositCurrency?.(curr);
            },
            'jump-transaction': (e, id, val, target, dataType) => UIManager.jumpToTransaction?.(id, dataType),
            'open-detail': (e, id, val, target, dataType) => UIManager.openDetail?.(e, dataType, id),
            'export-receipt': async (e, id, val, target) => {
                e.preventDefault(); e.stopPropagation();
                if (target.closest('.nm-btn-print-magic')) return RenderManager.exportReceipt?.(id, target);
                else if (target.closest('.btn-receipt-export')) return RenderManager.exportPaymentReceipt?.(id, target);
                else return RenderManager.exportReceipt?.(id, target);
            }
        };       

        const StoreActions = {
            'store-search-btn': () => this.applyStoreSearch(),
            'open-category': (e, id) => { e.preventDefault(); this.openCategory(id); },
            'open-product': (e, id) => UIManager.openProdModal?.(id),
            'toggle-fav-modal': () => this.toggleFavoriteFromModal(),
            'update-simple-qty': (e, id, val) => UIManager.updateSimpleQty?.(parseInt(val, 10)),
            'toggle-pkg-dropdown': (e, id, val, target) => target.parentElement.classList.toggle('open'),
            'toggle-coupon-ui': (e, id, val, target) => Components.toggleCoupon?.(target)
        };

        const SystemActions = {
            'logout': () => {
                UIManager.Auth?._clear2FAState?.();
                DataManager.logout?.();
            },
            'go-login': (e) => { e.preventDefault(); window.location.href = 'login.html'; },
            'request-account-delete': () => this.showToast('يرجى التواصل مع الدعم الفني لحذف حسابك نهائياً', 'warning'),
            'install-pwa': () => this.triggerPWAInstall(),
            'manage-push-notif': () => this.managePushNotifications(),

            'copy-text': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen, dataTarget, dataText) => {
                e.preventDefault(); e.stopPropagation();
                this.copyToClipboard(dataText || target.innerText, target);
            },
            'show-phone-toast': () => this.showToast('هذا الرقم مرتبط بحسابك الأساسي.', 'info'),
            'toggle-accordion': (e, id, val, target) => { e.preventDefault(); UIManager.togglePayDetail?.(target); },
            'toggle-wallet-stats': (e, id, val, target) => UIManager.toggleWalletStats?.(target),
            'toggle-theme-pref': () => this.toggleTheme(),
            'toggle-sound-pref': () => this.toggleSoundPref(),
            'open-profile-sidebar': () => UIManager.openProfileInfo?.(),
            'open-wallet-sidebar': () => this.navigateWallet(),
            'open-identity-sidebar': () => this.openModal('identity'),
            'trigger-click': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen, dataTarget) => document.getElementById(dataTarget)?.click(),
            'delete-avatar': () => UIManager.deleteProfileImage?.(),
            'toggle-name-edit': () => UIManager.toggleNameEdit?.(),
            'send-reset-pass': () => UIManager.sendResetPasswordEmail?.(),
            'submit-password-change': () => UIManager.handlePasswordSubmit?.(),
            'toggle-2fa': () => UIManager.handle2FAToggle?.(),
            'toggle-biometric': () => UIManager.handleBiometricToggle?.(),
            'verify-and-enable-2fa': () => UIManager.verifyAndEnable2FA?.(),
            'toggle-parent-dropdown': (e, id, val, target) => {
                const parentBox = target.parentElement;
                const isAlreadyOpen = parentBox.classList.contains('open');
                document.querySelectorAll('.custom-dropdown-container').forEach(el => el.classList.remove('open'));
                if (!isAlreadyOpen) parentBox.classList.add('open');
            },
            'select-reg-currency': (e, id, val, target, dataType, dataCurr, dataName, dataCode) => { e.preventDefault(); UIManager.selectRegCurrency?.(dataName, dataCode); },
            'select-country': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen) => { e.preventDefault(); UIManager.selectCountry?.(dataName, dataCode, dataLen); },
            'save-identity': () => UIManager.saveIdentityData?.(),
            'submit-kyc': () => UIManager.submitKycData?.(),
            'select-rating': (e, id, val) => this.selectRatingStar(parseInt(val, 10)),
            'submit-rating-step': () => this.submitRatingStep(),
            'submit-private-feedback': () => this.submitPrivateFeedback(),

            'clear-bal-file': () => UIManager.clearDepositFile?.(),
            'clear-kyc-file': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen, dataTarget) => {
                e.preventDefault();
                e.stopPropagation();
                UIManager.clearKycImage?.(dataTarget);
            },
            
            'toggle-balance-visibility': () => {
                if (!DataManager.prefs) DataManager.prefs = {};
                DataManager.prefs.hideBalance = !DataManager.prefs.hideBalance;
                if (DataManager.savePrefs) DataManager.savePrefs();
                this.updateDisplayBalance();
            }
        };     

        const FilterNotifActions = {
            'render-orders': () => RenderManager.renderOrders?.(true),
            'render-wallet': () => RenderManager.renderWallet?.(true),
            'render-payments': () => RenderManager.renderPayments?.(true),
            'filter-order': (e, id, val, target) => UIManager.setOrderFilter?.(val, target),
            'filter-wallet': (e, id, val, target) => UIManager.setWalletFilter?.(val, target),
            'filter-pay': (e, id, val, target) => UIManager.setPaymentFilter?.(val, target),
            'open-cal-order-start': (e) => CalendarApp.open('order-date-start', e),
            'open-cal-order-end': (e) => CalendarApp.open('order-date-end', e),
            'open-cal-wallet-start': (e) => CalendarApp.open('wallet-date-start', e),
            'open-cal-wallet-end': (e) => CalendarApp.open('wallet-date-end', e),
            'open-cal-pay-start': (e) => CalendarApp.open('pay-date-start', e),
            'open-cal-pay-end': (e) => CalendarApp.open('pay-date-end', e),
            'cal-adj-month': (e, id, val) => CalendarApp.adjustMonth(parseInt(val, 10)),
            'cal-adj-year': (e, id, val) => CalendarApp.adjustYear(parseInt(val, 10)),
            'cal-toggle-list': (e, id, val, target, dataType, dataCurr, dataName, dataCode, dataLen, dataTarget) => CalendarApp.toggleList(dataTarget, e),
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
                this.markAllNotificationsRead();
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
                        const newCount = Math.max(0, (parseInt(countNumEl.innerText, 10) || 0) - 1);
                        if (newCount > 0) countNumEl.innerText = newCount;
                        else { const topBar = document.querySelector('.nc-top-action-bar'); if (topBar) topBar.style.display = 'none'; }
                    }
                }
                if (DataManager && typeof DataManager.markSingleNotificationRead === 'function') {
                    DataManager.markSingleNotificationRead(id);
                }
                const tType = item?.getAttribute('data-target-type');
                const tId = item?.getAttribute('data-target-id');
                if (tType === 'profile') {
                    UIManager.openProfileInfo?.();
                } else if ((tType === 'order' || tType === 'deposit') && tId && tId !== 'null' && tId !== 'undefined') {
                    UIManager.openDetail?.(e, tType, tId);
                }
            },
            'accept-push-prompt': async () => {
                const promptEl = document.getElementById('push-soft-prompt');
                if (promptEl) promptEl.remove();
                try { localStorage.setItem(CACHE_KEYS.PUSH_PROMPT_TIME, Date.now().toString()); } catch (e) {}
                if (typeof DataManager !== 'undefined' && DataManager.setupPushNotifications) await DataManager.setupPushNotifications(true);
            },
            'dismiss-push-prompt': () => {
                const promptEl = document.getElementById('push-soft-prompt');
                if (promptEl) promptEl.remove();
                try { localStorage.setItem(CACHE_KEYS.PUSH_PROMPT_TIME, Date.now().toString()); } catch (e) {}
            }
        };

        const ActionDictionary = {
            ...NavActions,
            ...ModalActions,
            ...FinanceActions,
            ...StoreActions,
            ...SystemActions,
            ...FilterNotifActions
        }; 

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredInstallPrompt = e; 
            const installContainer = document.getElementById('pwa-install-container');
            if (installContainer) installContainer.style.display = 'block';
        });

        window.addEventListener('appinstalled', () => {
            const installContainer = document.getElementById('pwa-install-container');
            if (installContainer) installContainer.style.display = 'none';
            deferredInstallPrompt = null; 
        });

        document.body.addEventListener('touchstart', () => {}, { passive: true });
        
        window.addEventListener('contextmenu', (e) => { 
            if (e.target.tagName === 'IMG' || e.target.closest('.prevent-context')) e.preventDefault(); 
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const action = e.target.getAttribute('data-action');
            if (action === 'store-search-enter') { this.sfx?.('nav'); this.applyStoreSearch(); }
            if (action === 'order-search-enter') { this.sfx?.('nav'); RenderManager.renderOrders?.(true); }
            if (action === 'wallet-search-enter') { this.sfx?.('nav'); RenderManager.renderWallet?.(true); }
            if (action === 'pay-search-enter') { this.sfx?.('nav'); RenderManager.renderPayments?.(true); }
        });

        document.addEventListener('input', (e) => {
            if (e.target.id === 'bal-amount') {
                if (this._amountTypingTimer) clearTimeout(this._amountTypingTimer);
                this._amountTypingTimer = setTimeout(() => {
                    UIManager.calcFee?.();
                    if (e.target.parentElement) e.target.parentElement.classList.toggle('has-value', e.target.value !== '');
                }, 150);
            }
            if (e.target.id === 'edit-name-input') {
                const saveBtn = document.getElementById('save-name-btn');
                if (saveBtn) { saveBtn.classList.remove('d-none'); saveBtn.style.display = 'inline-flex'; }
            }
            
            if (e.target.id === 'couponCode') {
                Components.checkInputState?.();
            }
            
            if (e.target.getAttribute('data-action') === 'filter-countries') {
                const term = e.target.value.toLowerCase().trim();
                document.querySelectorAll('#countries-list-target .dropdown-item').forEach(item => {
                    const name = item.querySelector('.country-name')?.textContent.toLowerCase() || '';
                    item.style.display = name.includes(term) ? 'flex' : 'none';
                });
            }
        });

        document.addEventListener('change', (e) => {
            const action = e.target.getAttribute('data-action');
            if (action === 'change-currency') this.setDisplayCurrency(e.target.value);
            if (action === 'kyc-upload-front') UIManager.handleKycImage?.(e.target, 'kyc-prev-front');
            if (action === 'kyc-upload-back') UIManager.handleKycImage?.(e.target, 'kyc-prev-back');
            if (action === 'kyc-upload-selfie') UIManager.handleKycImage?.(e.target, 'kyc-prev-selfie');
            if (action === 'upload-avatar') UIManager.handleAvatarChange?.(e);
            if (e.target.id === 'bal-file') UIManager.previewReceipt?.(e.target); 
        });

        document.body.addEventListener('click', (e) => {
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().catch(()=>{});
            } else if (!this.audioCtx) {
                try {
                    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                    if (AudioContextClass) this.audioCtx = new AudioContextClass();
                } catch(err){}
            }

            const target = e.target;
            
            const avatarMenu = document.getElementById('avatar-action-menu');
            if (avatarMenu?.classList.contains('active') && !avatarMenu.contains(target) && !target.closest('[data-action="toggle-avatar-menu"]')) {
                avatarMenu.classList.remove('active');
            }

            const ctMenu = document.getElementById('ct-menu');
if (ctMenu?.classList.contains('open') && !ctMenu.contains(target) && !target.closest('#ct-toggle')) {
    this.closeDisplayCurrencyMenu();
}

if (!target.closest('.custom-dropdown-container')) {
    document.querySelectorAll('.custom-dropdown-container.open').forEach(el => el.classList.remove('open'));
}
if (!target.closest('#bal-currency-dropdown')) {
    document.getElementById('bal-currency-dropdown')?.classList.remove('open');
}
            if (target.classList.contains('master-overlay') || target.classList.contains('pm-overlay')) {
                e.preventDefault();
                if (target.id === 'global-security-alert' || target.id === 'biometric-lock-screen') {
                    this.sfx?.('error'); return; 
                }
                if (target.id === 'pay-receipt-lightbox') {
                    this.closeModal('pay-receipt');
                    this.sfx?.('nav'); return;
                }
                this.closeModal(target.id.replace('-overlay', ''));
                this.sfx?.('nav'); return;
            }
           
            const actionBtn = target.closest('[data-action]');
            
            if (!actionBtn || actionBtn.disabled || actionBtn.classList.contains('disabled') || actionBtn.classList.contains('is-loading')) return;
            
            const action = actionBtn.getAttribute('data-action');
            const prodId = actionBtn.getAttribute('data-id');
            const args = [
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
            ];
            
            if (action === 'open-product' && target.closest('.card-image')) {
                if (!this._clickState) this._clickState = {};
                const state = this._clickState;
                if (state.timer && state.id === prodId) {
                    clearTimeout(state.timer);
                    state.timer = null; state.id = null;
                    this.triggerMagicFavorite(e, prodId);
                    return;
                }
                if (state.timer && state.id !== prodId) {
                    clearTimeout(state.timer);
                    ActionDictionary[action]?.(...state.args);
                }
                this.sfx?.('nav'); 
                state.id = prodId; state.args = args;
                state.timer = setTimeout(() => {
                    state.timer = null; state.id = null;
                    ActionDictionary[action]?.(...args);
                }, 250);
                return;
            }

            if (!['copy-text', 'apply-coupon', 'submit-balance', 'confirm-purchase', 'trigger-click', 'update-simple-qty', 'delete-avatar', 'open-product', 'mark-single-read', 'toggle-fav-modal', 'toggle-balance-visibility'].includes(action)) {
                this.sfx?.('nav');
            }            
            
            if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) target.blur();

            try {
                const res = ActionDictionary[action]?.(...args);
                if (res instanceof Promise) res.catch(err => { console.error(`[UI Action Error] Action: ${action} Failed:`, err); });
            } catch (err) {
                console.error(`[UI Sync Error] Action: ${action} Crashed:`, err);
            }
        });
    },

    triggerPWAInstall: async function() {
        if (!deferredInstallPrompt) return;
        this.sfx?.('nav');
        
        const installContainer = document.getElementById('pwa-install-container');
        if (installContainer) installContainer.style.display = 'none';
        
        try {
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
        } catch (err) {
            console.warn("تم إلغاء التثبيت:", err);
        } finally {
            deferredInstallPrompt = null;
        }
    },

    // =========================================================
    // 🌟 محرك الانتقالات والتوجيه (Citadel View Router)
    // =========================================================
    _toggleNavLoader: function(show) {
        let loader = document.getElementById('premium-nav-loader');
        if (!loader) {
            const s = LiveStoreData.settings || {};
            loader = document.createElement('div');
            loader.id = 'premium-nav-loader';
            loader.className = 'pnl-backdrop';
            loader.innerHTML = `
                <div class="pnl-content">
                    <div class="pnl-spinner-box">
                        <i class="fa-solid fa-spinner fa-spin pnl-spinner-icon"></i>
                        <i class="fa-solid fa-store pnl-store-icon"></i>
                    </div>
                    <div class="pnl-store-name">${Utils.escapeHtml(s.storeName || s.name || 'المتجر')}</div>
                </div>`;
            document.body.appendChild(loader);
        }
        if (show) { loader.classList.add('active'); } 
        else { loader.classList.remove('active'); setTimeout(() => { if(!loader.classList.contains('active')) loader.style.display = 'none'; }, 200); }
    },

    _executePageTransition: function(renderCallback) {
        const grid = document.getElementById('store-grid');
        this._toggleNavLoader(true); 
        
        if (grid) { 
            grid.style.transition = 'none'; 
            grid.style.opacity = '0'; 
            grid.style.transform = 'translateY(15px)';
        }
        
        requestAnimationFrame(() => {
            try {
                if (typeof renderCallback === 'function') renderCallback(); 
            } catch (err) {
                console.error("🚨 Render Error during transition:", err);
            } finally {
                if (grid) void grid.offsetHeight;

                setTimeout(() => {
                    this._toggleNavLoader(false); 
                    if (grid) { 
                        grid.style.transition = 'opacity 0.25s ease-out, transform 0.25s ease-out'; 
                        grid.style.opacity = '1'; 
                        grid.style.transform = 'translateY(0)'; 
                        
                        setTimeout(() => { 
                            if(grid) { grid.style.transition = ''; grid.style.transform = ''; } 
                        }, 250);
                    }
                }, 30);
            }
        });
    },

    navigateHome: function() { 
        this.closeSidebar(true);
        this.closeAllModals();
        this.currentCategoryId = null;
        this.navHistory = [];
        UIState.navHistory = [];
        UIManager.setBaseView('home', { categoryId: null, searchQuery: '' });
        this._executePageTransition(() => { if(RenderManager.renderHome) RenderManager.renderHome(); });
    },
    
    openFavorites: function() {
        if (!DataManager?.user) { 
            this.showToast('يجب تسجيل الدخول لعرض المفضلة', 'error'); 
            UIManager.syncBottomNavUI();
            setTimeout(() => { window.location.href = 'login.html'; }, 1500); 
            return; 
        }     
        this.closeSidebar(true); 
        this.closeAllModals();

        if (UIState.baseView === 'favorites') { 
            window.scrollTo({ top: 0, behavior: 'smooth' }); 
            UIManager.syncBottomNavUI();
            return; 
        }
        this.currentCategoryId = null;
        UIManager.setBaseView('favorites', { categoryId: null, searchQuery: '' });
        this._executePageTransition(() => { if (RenderManager.renderFavorites) RenderManager.renderFavorites(); });
    },

    navigateBalance: function() { UIManager.openAddBalance?.(); },
    navigateMyPayments: function() { this.openMyPayments(); },
    navigateOrders: function() { this.openOrders(); },
    navigateWallet: function() { this.openWallet(); },
    navigateSettings: function() { this.openSettings(); },

    openCategory: function(id) {
        this.closeSidebar(true);
        this.closeAllModals();
        
        this.navHistory.push(this.currentCategoryId === null ? 'HOME' : this.currentCategoryId);
        if (this.navHistory.length > 20) this.navHistory.shift();
        UIState.navHistory = this.navHistory;
        
        const hash = '#cat-' + id;
        if (window.location.hash !== hash && window.history?.pushState) {
            window.history.pushState({ internalId: Date.now(), catId: id }, '', hash);
        }
        this.currentCategoryId = id;
        UIManager.setBaseView('category', { categoryId: id, searchQuery: '' });
        
        const grid = document.getElementById('store-grid');
        if (grid) {
            this.setGridMode('grid-prods');
            const hasData = (LiveStoreData.prods?.length > 0) || (LiveStoreData.cats?.length > 0);
            
            if (hasData) {
                this._executePageTransition(() => {
                    if (RenderManager._renderContent) RenderManager._renderContent(id);
                    if (Components?.initProductShine) Components.initProductShine();
                });
            } else {
                RenderManager._hideOfferStoriesBar?.();
                grid.innerHTML = '';
                if (RenderManager.renderProductSkeletons) RenderManager.renderProductSkeletons('store-grid', 8);
                setTimeout(() => {
                    if (RenderManager._renderContent) RenderManager._renderContent(id);
                    if (Components?.initProductShine) Components.initProductShine();
                }, 800);
            }
        }
    },
    
    _manualGoBack: function(isPopState = false) {
        if (!isPopState && window.location.hash) {
            this._ignorePopStateCount = (this._ignorePopStateCount || 0) + 1;
            window.history.back();
        }
        
        if (this.navHistory.length === 0 || this.navHistory[this.navHistory.length - 1] === 'HOME') {
            this.currentCategoryId = null;
            this.navHistory = [];
            UIState.navHistory = [];
            UIManager.setBaseView('home', { categoryId: null, searchQuery: '' });
            this._executePageTransition(() => { if (RenderManager.renderHome) RenderManager.renderHome(true); });
        } else {
            const prevId = this.navHistory.pop();
            this.currentCategoryId = prevId;
            UIState.navHistory = this.navHistory;
            UIManager.setBaseView('category', { categoryId: prevId, searchQuery: '' });
            this._executePageTransition(() => {
                if (RenderManager._renderContent) RenderManager._renderContent(prevId);
                if (Components?.initProductShine) Components.initProductShine();
            });
        }
    },
    openOrders: function() {
        if (!DataManager?.user) { 
            this.showToast('يجب تسجيل الدخول لعرض الطلبات', 'error'); 
            UIManager.syncBottomNavUI();
            setTimeout(() => { window.location.href = 'login.html'; }, 1500); 
            return; 
        }     
        this.setFilterDefaults('order');
        if (RenderManager.renderOrders) RenderManager.renderOrders(true);
        this.openModal('orders');
    },
    
    openWallet: function() {
        if (!DataManager?.user) { 
            this.showToast('يجب تسجيل الدخول لعرض المحفظة', 'error'); 
            UIManager.syncBottomNavUI();
            setTimeout(() => { window.location.href = 'login.html'; }, 1500); 
            return; 
        }      
        this.setFilterDefaults('wallet'); 
        this.updateDisplayBalance();
        if (RenderManager.renderWallet) RenderManager.renderWallet(true);
        this._syncWalletBlur();
        this.openModal('wallet');
    },
    
    _syncWalletBlur: function() {
        const drawer = document.getElementById('walletStatsDrawer');
        const walletModal = document.getElementById('wallet-modal');
        if (!drawer || !walletModal) return;

        if (this._walletBlurObserver) this._walletBlurObserver.disconnect();
        
        this._walletBlurObserver = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                if (m.attributeName === 'class' && !drawer.classList.contains('active')) {
                    walletModal.classList.remove('drawer-blur-active');
                    document.querySelector('.detail-arrow')?.classList.remove('open');
                }
            });
        });
        
        this._walletBlurObserver.observe(drawer, { attributes: true, attributeFilter: ['class'] });
    },
    
    openMyPayments: function() {
        if (!DataManager?.user) {
            this.showToast('يجب تسجيل الدخول', 'error');
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            return;
        }      
        this.setFilterDefaults('payments');
        if (RenderManager.renderPayments) RenderManager.renderPayments(true);
        this.openModal('mypay');
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
        this._closeAndResetTabs('wallet', 'wallet', '#wallet-tabs .mf-tab');
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
        UIManager.setBaseView('home', { categoryId: null, searchQuery: '' });
        const grid = document.getElementById('store-grid');
        if (grid) {
            grid.style.opacity = '0'; grid.style.transform = 'translateY(20px)';
            setTimeout(() => {
                if (RenderManager.renderHome) RenderManager.renderHome(true);
                if (grid) { grid.style.opacity = ''; grid.style.transform = ''; }
            }, 200);
        } else {
            if (RenderManager.renderHome) RenderManager.renderHome(true);
        }
    },

    smoothPageTransition: function(fromPage, toPage) {
        const grid = document.getElementById('store-grid');
        if(grid) { grid.style.transition = ''; grid.style.opacity = ''; grid.style.transform = ''; }
        if(toPage === 'home') { UIManager.setBaseView('home', { categoryId: null }); if(RenderManager.renderHome) RenderManager.renderHome(); } 
        else if(toPage === 'favorites') { UIManager.setBaseView('favorites', { categoryId: null }); if(RenderManager.renderFavorites) RenderManager.renderFavorites(); }
    },

    copyToClipboard: function(text, element, type = 'default') {
        this.sfx?.('nav'); 
        
        const successVisuals = () => {
            if (element) { 
                if (element.classList.contains('is-copied') || element.classList.contains('copy-success')) return;

                element.style.transition = 'transform 0.1s ease';
                element.style.transform = 'scale(0.92)'; 
                setTimeout(() => { if(element) element.style.transform = 'scale(1)'; }, 100); 

                let icon = type === 'smartline' ? element.querySelector('.scl-icon') : (element.querySelector('i') || (element.tagName === 'I' ? element : null));
                
                element.classList.add(type === 'smartline' ? 'copy-success' : 'is-copied');
                if (icon) {
                    if (!icon.dataset.origClass) icon.dataset.origClass = icon.className;
                    icon.className = 'fa-solid fa-check-double' + (type === 'smartline' ? ' scl-icon' : '');
                }
                
                if (element.copyTimer) clearTimeout(element.copyTimer);
                element.copyTimer = setTimeout(() => { 
                    element.classList.remove(type === 'smartline' ? 'copy-success' : 'is-copied');
                    if (icon && icon.dataset.origClass) icon.className = icon.dataset.origClass; 
                }, 1000); 
            }

            const shortText = text.length > 15 ? text.substring(0, 15) + '...' : text;
            this.showToast(`تم نسخ: ${shortText}`, 'success');
        };

        if (navigator.clipboard && window.isSecureContext) { 
            navigator.clipboard.writeText(text).then(successVisuals).catch(() => this.showToast('فشل النسخ', 'error')); 
        } else {
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

    showAdminDirectMessage: function(msgText) {
        if (!msgText || document.getElementById('admin-direct-msg-popup')) return;
        const html = `<div id="admin-direct-msg-popup" class="sys-dialog-wrapper active"><div class="sys-dialog-overlay"></div><div class="sys-dialog-card"><div class="sys-dialog-header"><div class="sys-dialog-icon warning"><i class="fa-solid fa-envelope-open-text fa-bounce"></i></div><h3 class="sys-dialog-title warning">رسالة إدارية هامة</h3></div><div class="sys-dialog-msg-container"><p class="sys-dialog-msg">${Utils.escapeHtml(msgText)}</p></div><div class="sys-dialog-actions" style="margin-top:20px;"><button id="ack-admin-msg-btn" class="adv-close-btn" style="background:#111a2b;">قرأت ذلك، شكراً</button></div></div></div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        this.sfx?.('success');
        document.getElementById('ack-admin-msg-btn')?.addEventListener('click', () => { 
            this.sfx?.('nav');
            if (DataManager && typeof DataManager.ackAdminMessage === 'function') {
                DataManager.ackAdminMessage(); 
            }
            document.getElementById('admin-direct-msg-popup')?.remove(); 
        });
    },

    showPushNotificationPrompt: function() {
        if (typeof window === 'undefined' || !window.Notification || typeof DataManager === 'undefined' || !DataManager.activeUid) return;
        if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
        
        const lastPrompt = localStorage.getItem(CACHE_KEYS.PUSH_PROMPT_TIME);
        if (lastPrompt && (Date.now() - parseInt(lastPrompt, 10)) < 7 * 24 * 60 * 60 * 1000) return;

        if (document.getElementById('push-soft-prompt')) return;

        const html = `
            <div id="push-soft-prompt" class="sys-dialog-wrapper active" style="z-index: 99999;">
                <div class="sys-dialog-overlay" data-action="dismiss-push-prompt"></div>
                <div class="sys-dialog-card" style="border-top: 4px solid var(--primary);">
                    <div class="sys-dialog-header">
                        <div class="sys-dialog-icon" style="color: var(--primary); background: rgba(var(--primary-rgb), 0.1);">
                            <i class="fa-solid fa-bell fa-shake"></i>
                        </div>
                        <h3 class="sys-dialog-title" style="color: var(--text-main);">تنبيهات المتجر</h3>
                    </div>
                    <div class="sys-dialog-msg-container">
                        <p class="sys-dialog-msg" style="text-align: center; margin-bottom: 20px;">
                            هل ترغب بتفعيل الإشعارات ليصلك تحديث فوري عند اكتمال طلباتك أو توفر عروض حصرية جديدة؟
                        </p>
                    </div>
                    <div class="sys-dialog-actions" style="display: flex; gap: 10px; margin-top: 15px;">
                        <button class="btn btn-primary" data-action="accept-push-prompt" style="flex: 1;"><i class="fa-solid fa-check"></i> تفعيل الآن</button>
                        <button class="btn btn-secondary" data-action="dismiss-push-prompt" style="flex: 1; background: var(--bg-glass-heavy); color: var(--text-muted);">ليس الآن</button>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', html);
        this.sfx?.('info');
    },

    managePushNotifications: async function() {
    if (!DataManager?.user || !DataManager?.activeUid) {
        return this.showToast('يرجى تسجيل الدخول أولاً لتفعيل إشعارات الطلبات على جهازك.', 'warning');
    }
    
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        return this.showToast('متصفح المعاينة الحالي لا يدعم الإشعارات الفورية. يرجى فتح المتجر في متصفح رسمي (Chrome / Safari).', 'warning');
    }
    
    if (Notification.permission === 'denied') {
        this.showAdvancedPopup({
            title: 'الإشعارات محظورة',
            message: 'لقد قمت بحظر الإشعارات مسبقاً. لتفعيلها، اضغط على أيقونة القفل 🔒 في شريط عنوان المتصفح بالأعلى واختر "السماح" (Allow) للإشعارات.'
        });
        return;
    }
    
    if (Notification.permission === 'granted') {
        if (typeof DataManager.setupPushNotifications === 'function') {
            await DataManager.setupPushNotifications(false);
        }
        this.showToast('الإشعارات الفورية مفعلة ومربوطة بحسابك بنجاح على هذا الجهاز.', 'success');
        return;
    }
    
    this.showToast('يرجى الضغط على "سماح" من نافذة المتصفح...', 'info');
    if (typeof DataManager.setupPushNotifications === 'function') {
        await DataManager.setupPushNotifications(true);
        
        if (Notification.permission === 'granted') {
            this.showToast('تم تفعيل وربط الإشعارات الفورية بجهازك بنجاح!', 'success');
        } else if (Notification.permission === 'denied') {
            this.showToast('تم حظر الإشعارات من المتصفح.', 'error');
        } else {
            this.showToast('لم يتم منح إذن الإشعارات من المتصفح.', 'warning');
        }
    }
},    processAndDisplayAlerts: function() {
        if (!DataManager.getUnreadAlerts) return;
        const unreadAlerts = DataManager.getUnreadAlerts();
        if (!unreadAlerts || unreadAlerts.length === 0) return;
        
        let shownToasts = [];
        try { shownToasts = JSON.parse(localStorage.getItem(CACHE_KEYS.SHOWN_TOASTS) || "[]"); } catch (e) {}
        
        const popups = unreadAlerts.filter(m => (m.type === 'popup' || m.isPopup) && !shownToasts.includes(String(m.id)));
        const toasts = unreadAlerts.filter(m => !(m.type === 'popup' || m.isPopup) && !shownToasts.includes(String(m.id)));
        
        toasts.forEach(msg => {
            let msgType = 'info';
            const fullText = `${msg.title || ''} ${msg.message || ''}`.toLowerCase();
            if (/نجاح|مكتمل|مقبول|جاهز/.test(fullText)) msgType = 'success';
            else if (/مرفوض|خطأ|فشل|مسترجع/.test(fullText)) msgType = 'error';
            else if (/مراجعة|قيد|تنبيه/.test(fullText)) msgType = 'warning';
            
            const displayText = msg.title ? `${msg.title} - ${msg.message}` : msg.message;
            this.showToast(displayText, msgType);
            
            shownToasts.push(String(msg.id));
        });
        
        if (popups.length > 0) {
            popups.forEach(p => shownToasts.push(String(p.id)));
            this.showAdvancedPopup(popups[0], popups.slice(1));
        }
        
        if (shownToasts.length > 50) shownToasts = shownToasts.slice(-50);
        
        try {
            localStorage.setItem(CACHE_KEYS.SHOWN_TOASTS, JSON.stringify(shownToasts));
        } catch (e) {}

        this.updateNotifBadges();
    },
    
    showAdvancedPopup: function(alertObj, remainingQueue) {
        const existingModal = document.getElementById('advanced-alert-modal');
        if (existingModal) existingModal.remove();

        let extraHtml = '';
        if (alertObj.couponCode) {
            extraHtml += `
                <div class="adv-coupon-box">
                    <div class="adv-coupon-title">🎁 كود خصم حصري لك:</div>
                    <div class="adv-coupon-flex">
                        <span class="adv-coupon-code num-en">${Utils.escapeHtml(alertObj.couponCode)}</span>
                        <button id="adv-alert-copy-btn" data-code="${Utils.escapeHtml(alertObj.couponCode)}" class="adv-coupon-btn">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                    </div>
                </div>`;
        }
        if (alertObj.actionLink) {
            extraHtml += `<a href="${Utils.safeUrl(alertObj.actionLink)}" target="_blank" rel="noopener noreferrer" class="adv-action-link">عرض التفاصيل الآن <i class="fa-solid fa-arrow-left" style="margin-inline-start: 5px;"></i></a>`;
        }

        const modalHtml = `
            <div id="advanced-alert-modal" class="sys-dialog-wrapper active">
                <div class="sys-dialog-card">
                    <div class="sys-dialog-header">
                        <div class="sys-dialog-icon warning"><i class="fa-solid fa-bell"></i></div>
                        <h3 class="sys-dialog-title warning">${Utils.escapeHtml(alertObj.title || 'إشعار هام')}</h3>
                    </div>
                    <div class="sys-dialog-msg">${Utils.escapeHtml(alertObj.message || '')}</div>
                    ${extraHtml}
                    <button id="close-advanced-alert" class="adv-close-btn">إغلاق النافذة</button>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.sfx?.('success');

        const copyBtn = document.getElementById('adv-alert-copy-btn');
        if (copyBtn) copyBtn.onclick = function() {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(this.dataset.code);
                this.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(() => { if (this.isConnected) this.innerHTML = '<i class="fa-solid fa-copy"></i>'; }, 2000);
            }
        };

        document.getElementById('close-advanced-alert')?.addEventListener('click', () => {
            const modal = document.getElementById('advanced-alert-modal');
            if (modal) { modal.classList.remove('active'); modal.style.opacity = '0'; }
            if (DataManager.markSingleNotificationRead && alertObj.id) {
                DataManager.markSingleNotificationRead(alertObj.id, true, alertObj.maxViews);
            }
            this.updateNotifBadges();
            setTimeout(() => { if (modal) modal.remove(); if (remainingQueue?.length > 0) setTimeout(() => this.showAdvancedPopup(remainingQueue[0], remainingQueue.slice(1)), 500); }, 300);
        }, { once: true });
    }, 

    openNotifCenter: function() {     
        if (!DataManager?.user) {
            this.showToast('يجب تسجيل الدخول', 'error');
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            return;
        }      
        if (RenderManager.renderNotifCenterList) RenderManager.renderNotifCenterList();
        this.openModal('notif-center');
    },

    closeNotifCenter: function() {
        this.closeModal('notif-center');
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
        UIManager.toggleLoader(true, 'جاري تحديث الإشعارات...');
        try {
            await DataManager.markAllNotificationsRead();
            this.sfx?.('success');
            this.updateNotifBadges();
            if (RenderManager?.renderNotifCenterList) RenderManager.renderNotifCenterList();
        } catch (e) {
            this.showToast('حدث خطأ بالاتصال', 'error');
        } finally {
            UIManager.toggleLoader(false);
        }
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

    showToast: function(msg, type = 'info', duration = 4000) {
        if (type === 'info') {
            if (/فشل|خطأ|عذراً|كاف|نفد|غير صالح/.test(msg)) type = 'error';
            else if (/مراجعة|انتظار|قيد|يرجى/.test(msg)) type = 'warning'; 
            else if (/إزالة|حذف|إلغاء/.test(msg)) type = 'info'; 
            else if (/تم|نجاح|شكراً/.test(msg)) type = 'success';
        }

        let container = document.querySelector('.custom-toast-container');
        if (!container) {
            container = document.createElement('div'); 
            container.className = 'custom-toast-container'; 
            document.body.appendChild(container);
        } else {
            if (container.children.length > 0) {
                const lastToast = container.lastElementChild;
                
                const incomingText = type === 'welcome' ? msg : Utils.escapeHtml(msg);
                const compareText = type === 'welcome' ? lastToast.querySelector('.toast-msg')?.innerHTML : lastToast.querySelector('.toast-msg')?.innerText;

                if (lastToast && compareText === incomingText) {
                    lastToast.style.animation = 'none'; 
                    void lastToast.offsetWidth; 
                    lastToast.style.animation = 'proShake 0.4s ease-in-out'; 
                    
                    if (lastToast._hideTimer) clearTimeout(lastToast._hideTimer);
                    lastToast._hideTimer = setTimeout(() => {
                        if(lastToast.isConnected) {
                            lastToast.classList.add('anim-out');
                            setTimeout(() => { if(lastToast.isConnected) lastToast.remove(); }, 400);
                        }
                    }, duration);
                    return; 
                }

                while (container.children.length >= 3) { 
                    const first = container.firstChild;
                    if(first) {
                        if(first._hideTimer) clearTimeout(first._hideTimer);
                        first.remove();
                    }
                }
            }
        }

        const toast = document.createElement('div');
        toast.className = `custom-toast toast-${type}`;
        
        let iconClass = 'fa-circle-info', titleText = 'معلومة';
        if (type === 'success') { iconClass = 'fa-circle-check'; titleText = 'نجاح'; }
        else if (type === 'error') { iconClass = 'fa-circle-xmark'; titleText = 'خطأ'; }
        else if (type === 'warning') { iconClass = 'fa-triangle-exclamation'; titleText = 'تنبيه'; }
        else if (type === 'welcome') { iconClass = 'fa-wand-magic-sparkles'; titleText = ''; }

        const safeMsg = type === 'welcome' ? msg : Utils.escapeHtml(msg);

        if (type === 'welcome') {
            const isGuestPromo = !DataManager?.user && safeMsg.includes('highlight-gold');
            if (isGuestPromo) {
                toast.setAttribute('data-action', 'go-login');
                toast.style.cursor = 'pointer';
            }
            toast.innerHTML = `
                <div class="welcome-orb-icon">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div class="welcome-capsule-body">
                    <span class="toast-msg">${safeMsg}</span>
                </div>
            `;
        } else {
            toast.innerHTML = `<i class="fa-solid ${iconClass} toast-icon-base" style="font-size: 24px;"></i><div class="toast-content"><span class="toast-title">${titleText}</span><span class="toast-msg">${safeMsg}</span></div>`;
        }
        container.appendChild(toast);        
        this.sfx?.(type === 'error' ? 'error' : 'success');
        
        toast._hideTimer = setTimeout(() => {
            if(toast.isConnected) {
                requestAnimationFrame(() => {
                    toast.classList.add('anim-out');
                    setTimeout(() => { if(toast.isConnected) toast.remove(); }, 400);
                });
            }
        }, duration);
    },

    sfx: function(type) {
        if(DataManager.prefs?.sound === false) return; 
        if (!navigator.userActivation || !navigator.userActivation.hasBeenActive) return;

        if (this._lastSfxTime && (Date.now() - this._lastSfxTime < 100)) return;
        this._lastSfxTime = Date.now();

        try {
            if(!this.audioCtx) {
                try {
                    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                    if (AudioContextClass) this.audioCtx = new AudioContextClass();
                } catch(ctxErr) { return; } 
            }
            if(!this.audioCtx) return;

            const playSound = () => {
                try {
                    const t = this.audioCtx.currentTime; 
                    const osc = this.audioCtx.createOscillator(); 
                    const gain = this.audioCtx.createGain();
                    osc.connect(gain); gain.connect(this.audioCtx.destination);
                    
                    if (type === 'nav') { osc.type='sine'; osc.frequency.setValueAtTime(1200,t); gain.gain.setValueAtTime(0.05,t); gain.gain.exponentialRampToValueAtTime(0.001,t+0.03); osc.start(t); osc.stop(t+0.03); } 
                    else if (type === 'success') { osc.type='sine'; osc.frequency.setValueAtTime(400,t); osc.frequency.linearRampToValueAtTime(800,t+0.15); gain.gain.setValueAtTime(0.1,t); gain.gain.linearRampToValueAtTime(0.001,t+0.3); osc.start(t); osc.stop(t+0.3); } 
                    else if (type === 'error') { osc.type='triangle'; osc.frequency.setValueAtTime(150,t); gain.gain.setValueAtTime(0.1,t); gain.gain.linearRampToValueAtTime(0.001,t+0.2); osc.start(t); osc.stop(t+0.2); }
                    
                    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
                } catch (internalErr) {}
            };

            if(this.audioCtx.state === 'suspended') { 
                this.audioCtx.resume().then(() => playSound()).catch(()=>{}); 
            } else { playSound(); }
            
        } catch(e) {}
        
        try {
            if (navigator.vibrate) {
                if (type === 'error') navigator.vibrate([50, 50, 50]); 
                else if (type === 'success') navigator.vibrate(50); 
                else navigator.vibrate(20);
            }
        } catch(e) {}
    },    

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
        const logoSize = parseInt(sys.storeLogoSize || sys.logoSize, 10) || 40; 
        const rawWeight = String(sys.storeNameWeight || sys.nameWeight || '900').trim();
        const weight = /^(normal|bold|bolder|lighter|[1-9]00)$/.test(rawWeight) ? rawWeight : '900';
        const type = sys.storeColorType || sys.nameColorType || 'solid';
        
        const c1 = this._sanitizeCssValue(sys.storeColor1 || sys.nameColor1 || '#ffffff');
        const c2 = this._sanitizeCssValue(sys.storeColor2 || sys.nameColor2 || '#FFD700');
        const rawShadow = sys.storeNameShadow ?? sys.nameShadow;
        const hasShadow = rawShadow === true || rawShadow === 'true';
        
        const logoDark = sys.storeLogo || sys.logo || '';
        const logoLight = sys.storeLogoLight || sys.logo_light || logoDark; 
        const favicon = sys.storeFavicon || sys.favicon || '';

        const finalStoreName = storeName || 'المتجر';

        const currentConfigHash = `${finalStoreName}_${logoDark}_${logoLight}_${logoSize}_${type}_${c1}_${c2}_${weight}_${favicon}`;
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

        const strictLogoStyle = `opacity: 1; max-height: ${logoSize}px !important; max-width: 150px !important; width: auto !important; object-fit: contain !important;`;

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
                requestAnimationFrame(() => {
                    el.innerHTML = finalHtml;
                    el.classList.toggle('is-en', isEnglish);
                    el.classList.toggle('logo-ar', !isEnglish);
                });
            }
        });
    },      
    
    saveDisplayState: function() {
        const displayState = {
            sidebarOpen: UIState.sidebarOpen,
            userImage: DataManager.user?.profileImage || null,
            theme: DataManager.prefs?.theme || 'dark',
            sound: DataManager.prefs?.sound !== false,
            lastVisit: Date.now()
        };
        try { localStorage.setItem(CACHE_KEYS.DISPLAY_STATE, JSON.stringify(displayState)); } catch (e) {}
    },
    
    restoreDisplayState: function() {
        try {
            const savedState = localStorage.getItem(CACHE_KEYS.DISPLAY_STATE);
            if (savedState) {
                const displayState = JSON.parse(savedState);
                if (displayState.userImage && DataManager.user) {
                    DataManager.user = { ...DataManager.user, profileImage: displayState.userImage };
                    UIManager.loadUserImageAutomatically?.();
                }
                if (displayState.theme) this.setThemePref(displayState.theme);
                if (displayState.sound !== undefined && DataManager.prefs) DataManager.prefs.sound = displayState.sound;
                if (displayState.lastVisit) { 
                    if (Math.floor((Date.now() - displayState.lastVisit) / 86400000) > 7) {
                        this.showToast('مرحباً بعودتك! تم تحديث الواجهة منذ آخر زيارة.'); 
                    }
                }
            }
        } catch (e) {}
    },
applyFontSettings: function() {
        const s = LiveStoreData.settings || {};
        const customFont = s.fontFamily ? s.fontFamily.replace(/['"]/g, '').trim() : 'Cairo';
        const family = `'${customFont}', 'Cairo', 'Inter', sans-serif`;
        
        const root = document.documentElement;
        
        requestAnimationFrame(() => {
            root.style.setProperty('--font-family-main', family);
            root.style.setProperty('--fs-base', `${s.fontSizeBase || 16}px`);
            root.style.setProperty('--fs-title', `${s.fontSizeTitle || 19}px`);
            root.style.setProperty('--fs-label', `${s.fontSizeLabel || 14}px`);
            root.style.setProperty('--fs-small', `${s.fontSizeSmall || 12}px`);
            root.style.setProperty('--fw-body', s.fontWeightBody || 700);
            root.style.setProperty('--fw-head', s.fontWeightHead || 900);
            document.body.style.fontFamily = family;
        });
    },

    updateDisplayBalance: function() {
        if (!DataManager.user) return; 

        const user = DataManager.user;
        const baseCurrency = (user.baseCurrency || 'USD').toUpperCase();
        const displayCurrency = (DataManager.selectedCurr || baseCurrency).toUpperCase();        
        const rates = DataManager.getRates ? DataManager.getRates() : null;

        const rawBal = Number(user.walletBalance);
        const safeRawBal = isNaN(rawBal) ? 0 : rawBal;
        const safeRawSpent = isNaN(Number(user.totalSpent)) ? 0 : Number(user.totalSpent);
        const safeRawDep = isNaN(Number(user.totalDeposit)) ? 0 : Number(user.totalDeposit);
        
        let displayBal = safeRawBal, displaySpent = safeRawSpent, displayDep = safeRawDep;

        if (FinancialEngine && typeof FinancialEngine.convertViaUSD === 'function' && rates) {
            try {
                if (displayCurrency !== baseCurrency) {
                    displayBal = FinancialEngine.convertViaUSD(safeRawBal, baseCurrency, displayCurrency, rates, 'deposit');
                }
                if (displayCurrency !== 'USD') {
                    displaySpent = FinancialEngine.convertViaUSD(safeRawSpent, 'USD', displayCurrency, rates, 'pricing');
                    displayDep = FinancialEngine.convertViaUSD(safeRawDep, 'USD', displayCurrency, rates, 'deposit');
                }
            } catch (e) {}
        }
        
        const isHidden = DataManager.prefs?.hideBalance === true;
        const formattedNum = (val) => isHidden ? '****' : Number(val).toFixed(2);
        
        const beautifulBalHtml = (RenderHelpers?.formatMoney)
            ? (isHidden ? `**** ${displayCurrency}` : RenderHelpers.formatMoney(displayBal, displayCurrency))
            : `${formattedNum(displayBal)} ${displayCurrency}`;
        const currencyTxt = (RenderHelpers?.getCurrencySymbolText)
            ? RenderHelpers.getCurrencySymbolText(displayCurrency)
            : displayCurrency;

        requestAnimationFrame(() => {
            const numEl = document.getElementById('live-balance-num'), currEl = document.getElementById('live-balance-curr');
            if (numEl) numEl.innerText = formattedNum(displayBal);
            if (currEl) currEl.innerText = isHidden ? '' : currencyTxt;

            const spentNum = document.getElementById('live-spent-num'), spentCurr = document.getElementById('live-spent-curr');
            if (spentNum) spentNum.innerText = formattedNum(displaySpent);
            if (spentCurr) spentCurr.innerText = isHidden ? '' : currencyTxt;

            const depNum = document.getElementById('live-deposit-num'), depCurr = document.getElementById('live-deposit-curr');
            if (depNum) depNum.innerText = formattedNum(displayDep);
            if (depCurr) depCurr.innerText = isHidden ? '' : currencyTxt;

            const sidebarBalBox = document.querySelector('.sp-balance-value');
            if (sidebarBalBox) sidebarBalBox.innerHTML = beautifulBalHtml;

            const balMain = document.getElementById('wallet-balance-disp');
            if (balMain) balMain.innerHTML = beautifulBalHtml;
            
            const eyeIcon = document.getElementById('balance-eye-icon');
            if (eyeIcon) {
                eyeIcon.className = isHidden ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
            }
        });

        this.updateDisplayCurrencyUI(displayCurrency);
    },    
    
    initSlider: function() {
        const banners = LiveStoreData.banners || [];
        const settings = LiveStoreData.settings || {};
        
        const currentBannerHash = JSON.stringify(banners.map(b => b.img)) + (settings.sliderTransition || 'fade');
        if (this._lastBannerHash === currentBannerHash) return;
        this._lastBannerHash = currentBannerHash;

        const container = document.getElementById('slider'); 
        if (!container) return;
        
        if (banners.length === 0) { 
            container.style.display = 'block'; 
            container.innerHTML = `
                <div class="slide active flex-center flex-column" style="width: 100%; min-height: 160px; aspect-ratio: 2/1; background: var(--bg-card); border-radius: inherit; border: var(--border-default);">
                    <i class="fa-solid fa-gift text-muted mb-10" style="font-size: clamp(28px, 6vw, 36px); opacity: 0.4;"></i>
                    <span class="fs-label text-muted" style="font-weight: var(--fw-head); opacity: 0.6;">عروض حصرية قوية قادمة</span>
                </div>
            `;
            container.className = 'slider slider-fade';
            if (this.sliderTimer) { clearInterval(this.sliderTimer); this.sliderTimer = null; }
            return; 
        }
        
        container.style.display = ''; 
        container.innerHTML = '';
        container.classList.add('slider', `slider-${settings.sliderTransition || 'fade'}`); 
        
        banners.forEach((b, i) => { 
            const div = document.createElement('div'); 
            div.className = `slide ${i === 0 ? 'active' : ''}`; 
            div.style.backgroundImage = `url('${Utils.safeUrl(b.img)}')`;
            
            if (i === 0) { const preloadImg = new Image(); preloadImg.fetchPriority = "high"; preloadImg.src = Utils.safeUrl(b.img); }
            container.appendChild(div); 
        });
        
        if (this.sliderTimer) { clearInterval(this.sliderTimer); this.sliderTimer = null; }
        
        this._sliderContainer = container;
        this._sliderIntervalMs = ((settings.sliderTime || settings.sliderDuration) ? Number(settings.sliderTime || settings.sliderDuration) * 1000 : 3000) || 3000;
        this._sliderIdx = 0;
        
        this._nextSlide = () => {
            if (!this._sliderContainer) return;
            const slides = this._sliderContainer.querySelectorAll('.slide');
            if (slides.length <= 1) return;
            slides[this._sliderIdx].classList.remove('active'); 
            this._sliderIdx = (this._sliderIdx + 1) % slides.length; 
            slides[this._sliderIdx].classList.add('active');
        };

        this._startSliderTimer = () => { 
            if (!this.sliderTimer && banners.length > 1) {
                this.sliderTimer = setInterval(this._nextSlide, this._sliderIntervalMs); 
            }
        };
        
        this._stopSliderTimer = () => { 
            if (this.sliderTimer) { clearInterval(this.sliderTimer); this.sliderTimer = null; } 
        };

        if (!this._visibilityBound) {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this._stopSliderTimer?.(); 
                else if (this._sliderContainer && this._sliderContainer.offsetParent !== null) this._startSliderTimer?.();
            });
            this._visibilityBound = true;
        }

        if ('IntersectionObserver' in window) {
            if (this._sliderObserver) this._sliderObserver.disconnect();
            
            this._sliderObserver = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && !document.hidden) this._startSliderTimer();
                else this._stopSliderTimer();
            });
            this._sliderObserver.observe(container);
        } else {
            this._startSliderTimer();
        }
    },

    renderTicker: function() {
        const s = LiveStoreData.settings || {};
        const txtEl = document.getElementById('ticker-text');
        const movingLine = document.querySelector('.ticker-moving-line');
        
        requestAnimationFrame(() => {
            let defaultText = 'أهلاً وسهلاً بكم في متجرنا';
            const tickerString = s.tickerText || s.promoText;
            
            if (!DataManager.user && (!tickerString || tickerString.trim() === '')) {
                const directMarketingPhrases = [
                    '🔥 أسعار خاصة للعملاء المسجلين.. أنشئ حسابك الآن!',
                    '✨ سجل حسابك لتكون أول من يحصل على عروضنا الحصرية.',
                    '🚀 تجربة شراء أسرع وأفضل بانتظارك، انضم لعائلتنا الآن!',
                    '🎁 خصومات مميزة للأعضاء.. لا تفوت الفرصة وسجل دخولك.'
                ];
                defaultText = directMarketingPhrases[Math.floor(Math.random() * directMarketingPhrases.length)];
            }
            
            if (txtEl) txtEl.innerText = tickerString || defaultText;
            if (movingLine) movingLine.className = `ticker-moving-line ticker-anim-${s.tickerSpeed || s.promoAnim || 'horizontal-normal'}`;
        });
    },

    getFlagUrl: function(curr) { return RenderHelpers.getCurrencyFlagUrl(curr); },
    setFlagEl: function(el, curr) {
        if(!el) return;
        el.innerHTML = '';
        const img = document.createElement('img'); img.className = 'ct-flag'; img.alt = curr; img.src = this.getFlagUrl(curr);
        img.onerror = () => { el.innerHTML = `<span class="ct-flag-emoji">🌍</span>`; };
        el.appendChild(img);
    },
    refreshCurrencyMenuFlags: function() {
        document.querySelectorAll('.ct-item').forEach(item => {
            this.setFlagEl(item.querySelector('.ct-flag-box'), item.dataset.curr || item.getAttribute('data-curr'));
        });
    },

    setDisplayCurrency: function(curr) {
        DataManager.selectedCurr = (curr || DataManager.user?.baseCurrency || LiveStoreData.settings?.defaultCurrency || 'USD').toUpperCase();
        try { localStorage.setItem(CACHE_KEYS.DISPLAY_CURRENCY, DataManager.selectedCurr); } catch (e) {}
        
        if (RenderManager._priceCache) RenderManager._priceCache.clear();
        this.updateDisplayBalance();
        if (UIState.activeModals.includes('purchase') && DataManager.currentProd) {
            UIManager.updatePriceDisplay?.();
        }
        this.updateDisplayCurrencyUI(DataManager.selectedCurr);
        
        if (typeof RenderManager !== 'undefined') {
            if (UIState.baseView === 'search' && UIState.searchQuery) {
                RenderManager.searchStoreTerm(UIState.searchQuery);
            } else if (UIState.baseView === 'category' && this.currentCategoryId) {
                RenderManager._renderContent(this.currentCategoryId);
            } else if (UIState.baseView === 'favorites') {
                RenderManager.renderFavorites();
            } else {
                RenderManager.renderHome(true);
            }
            
            if (UIState.activeModals.includes('wallet')) {
                RenderManager.renderWallet(true);
            }
            if (UIState.activeModals.includes('orders')) {
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
        const baseCurr = (user?.baseCurrency || 'USD').toUpperCase();
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
        
        requestAnimationFrame(() => {
            menu.innerHTML = menuHtml;
            if (nativeSel) nativeSel.innerHTML = nativeHtml;
            this.refreshCurrencyMenuFlags();
        });
        
        if (!menu.dataset.delegated) {
            menu.addEventListener('click', (e) => { const item = e.target.closest('.ct-item'); if (item) this.selectDisplayCurrency(item.dataset.curr); });
            menu.dataset.delegated = "true";
        }
    },    
    
    updateDisplayCurrencyUI: function(curr) {
        const code = (curr || 'USD').toUpperCase();
        this.renderDynamicCurrencyMenu();
        
        requestAnimationFrame(() => {
            const labelEl = document.getElementById('ct-label');
            if (labelEl) {
                if (labelEl.textContent !== code) labelEl.textContent = code;
                labelEl.style.opacity = '1'; 
            }

            const flagBoxEl = document.getElementById('ct-flag-box');
            if (flagBoxEl) {
                this.setFlagEl(flagBoxEl, code);
            }

            const nativeSelEl = document.getElementById('display-currency');
            if (nativeSelEl && nativeSelEl.value !== code) {
                nativeSelEl.value = code;
            }   
            document.querySelectorAll('.ct-item').forEach(item => item.classList.toggle('active', item.dataset.curr === code));

            const ctWrapper = document.querySelector('.ct-wrapper');
            if (ctWrapper) {
                if ((LiveStoreData.settings || {}).showCurrencyToggle === false) { ctWrapper.classList.add('hide-element'); ctWrapper.style.display = 'none'; } 
                else { ctWrapper.classList.remove('hide-element'); ctWrapper.style.display = ''; }
            }
        });
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
            }
        };
        processBtn('header-support-btn', 'header-support-icon', 'header-support-icon-wrapper');
        processBtn('sidebar-support-btn', 'sidebar-support-icon', 'sidebar-support-icon-wrapper');
    },

    openSupport: function() {
        const supportLink = (LiveStoreData.settings || {}).supportLink;
        if (supportLink && String(supportLink).trim()) { 
            if (supportLink.startsWith('http')) {
                window.open(Utils.safeUrl(supportLink), '_blank', 'noopener,noreferrer');
            } else {
                window.open(Utils.safeUrl(`https://wa.me/${supportLink.replace(/[^0-9]/g, '')}`), '_blank', 'noopener,noreferrer');
            } 
        } else {
            this.showToast('لم يتم إعداد رابط الدعم الفني بعد.', 'info');
        }
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
        const q = inp ? inp.value.trim() : '';
        if (!q) {
            this.navigateHome();
            return;
        }
        UIManager.setBaseView('search', { searchQuery: q });
        if (RenderManager.searchStoreTerm) {
            RenderManager.searchStoreTerm(q);
        }
        if (inp) {
            inp.blur();
        }
    },

    // 📅 توحيد ضبط التواريخ الافتراضية عبر CalendarApp لضمان التطابق البصري والبرمجي (YYYY-MM-DD)
    setFilterDefaults: function(prefix) {
        CalendarApp.resetDefaultDates(prefix);
    },

    checkSystemStatus: function() {
        const sys = LiveStoreData.system || {};
        
        if (sys.maint === true) {
            const msg = sys.msg || 'نحن نجري بعض التحسينات حالياً.';
            let dateHtml = '';
            if (sys.date) {
                const safeTimeMs = Utils.parseSafeTime(sys.date);
                if (safeTimeMs > 0) {
                    const d = new Date(safeTimeMs).toLocaleString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    dateHtml = `<div class="m-date"><i class="fa-regular fa-clock"></i> وقت العودة المتوقع: <span dir="ltr">${d}</span></div>`;
                }
            }
            
            document.body.innerHTML = `<div class="maintenance-screen"><div class="m-glass-box"><i class="fa-solid fa-person-digging m-icon"></i><h1 class="m-title">المتجر في وضع الصيانة</h1><p class="m-desc">${Utils.escapeHtml(msg)}</p>${dateHtml}<button id="maint-refresh-btn" class="btn btn-primary mt-20">تحديث الصفحة</button></div></div>`;
            document.getElementById('maint-refresh-btn')?.addEventListener('click', () => {
                this.sfx?.('nav');
                location.reload();
            });
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

    toggleFavoriteFromModal: function() {
        if (!DataManager.currentProd) return;
        if (!DataManager.user) {
            this.showToast('يجب تسجيل الدخول', 'error');
            this.sfx?.('error');
            setTimeout(() => { window.location.replace('login.html'); }, 1500);
            return;
        }
        
        const productId = DataManager.currentProd.id;
        const wasFavorite = DataManager.isFavorite?.(productId);
        if (DataManager.toggleFavorite) DataManager.toggleFavorite(productId);
        
        const btn = document.getElementById('pm-fav-btn');
        if (btn) {
            btn.classList.toggle('active', !wasFavorite);
            const icon = btn.querySelector('i');
            if (icon) icon.className = !wasFavorite ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        }
        
        if (wasFavorite) {
            this.showToast('تمت إزالة المنتج من المفضلة', 'info');
            if (UIState.baseView === 'favorites') {
                const card = document.querySelector(`.product-card[data-id="${productId}"]`);
                if (card) {
                    card.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';
                    setTimeout(() => {
                        card.remove();
                        if (document.querySelectorAll('#store-grid .product-card').length === 0 && RenderManager.renderFavorites) {
                            RenderManager.renderFavorites();
                        }
                    }, 300);
                }
            }
        } else {
            this.showToast('تمت إضافة المنتج إلى المفضلة', 'success');
        }
        
        this.updateFavBadgeCount();
    },    

    triggerMagicFavorite: function(e, productId) {
        if (e) e.preventDefault();
        if (!DataManager?.user) { this.showToast('يجب تسجيل الدخول', 'error'); this.sfx?.('error'); setTimeout(() => { window.location.replace('login.html'); }, 1500); return; }
        
        const wasFavorite = DataManager.isFavorite?.(productId);
        if (DataManager.toggleFavorite) DataManager.toggleFavorite(productId);
        
        const headerHeart = document.getElementById('sticky-fav-btn');
        const productCard = document.querySelector(`.product-card[data-id="${productId}"]`);
        const imgBox = productCard?.querySelector('.card-image');
        
        if (wasFavorite) {
            this.showToast('تمت الإزالة', 'info'); this.sfx?.('nav');
            if (imgBox) { const popHeart = document.createElement('i'); popHeart.className = 'fa-solid fa-heart-crack center-crack-heart'; imgBox.appendChild(popHeart); setTimeout(() => popHeart.remove(), 800); }
            this.updateFavBadgeCount();
            if (UIState.baseView === 'favorites' && productCard) {
                productCard.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'; productCard.style.opacity = '0'; productCard.style.transform = 'scale(0.8)';
                setTimeout(() => { productCard.remove(); if (document.querySelectorAll('#store-grid .product-card').length === 0 && RenderManager.renderFavorites) RenderManager.renderFavorites(); }, 300);
            }
            return;
        }
        
        this.showToast('تمت الإضافة للمفضلة', 'success'); this.sfx?.('success');
        
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
                this.updateFavBadgeCount();
                setTimeout(() => headerHeart.classList.remove('pulse-catch'), 500);
            } else {
                this.updateFavBadgeCount();
            }
        }, 800);
    },    

    openCommunityModal: function() {
        const target = document.getElementById('community-links-target');
        const s = LiveStoreData?.settings || {};
        const linksList = Array.isArray(s.socialLinksList) ? s.socialLinksList : [];
        
        let html = '';

        if (linksList.length > 0) {
            const colorMap = {
                'fa-whatsapp': '#25D366', 'fa-telegram': '#24A1DE', 'fa-facebook': '#1877F2',
                'fa-instagram': '#E1306C', 'fa-x-twitter': '#000000', 'fa-youtube': '#FF0000',
                'fa-tiktok': '#000000', 'fa-discord': '#5865F2', 'fa-link': 'var(--primary)'
            };

            linksList.forEach(link => {
                const safeUrl = Utils.safeUrl ? Utils.safeUrl(link.url) : link.url;
                if (!safeUrl || safeUrl === '#') return;

                let iconClass = link.icon || 'fa-link';
                
                if (!iconClass.includes('fa-solid') && !iconClass.includes('fa-brands') && !iconClass.includes('fa-regular')) {
                    if (iconClass.includes('link') || iconClass === 'fa-link') {
                        iconClass = `fa-solid ${iconClass}`;
                    } else {
                        iconClass = `fa-brands ${iconClass}`; 
                    }
                }

                const bgColor = colorMap[link.icon] || 'var(--primary)';
                const safeName = Utils.escapeHtml ? Utils.escapeHtml(link.name || 'رابط سريع') : (link.name || 'رابط سريع');

                html += `
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="community-item-card" onclick="(window.ClientSystem || window.UIManager)?.sfx?.('nav')">
                    <div class="community-left">
                        <div class="community-icon" style="background: ${bgColor};">
                            <i class="${iconClass}"></i>
                        </div>
                        <div class="community-info">
                            <span class="community-name" style="font-weight: 700;">${safeName}</span>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-left community-arrow"></i>
                </a>`;
            });
        }
        
        if (target) {
            target.innerHTML = html ? html : `<div class="empty-state-v2"><i class="fa-solid fa-share-nodes"></i><h3>قريباً جداً</h3><p>تعمل الإدارة حالياً على تجهيز شبكات التواصل الاجتماعي.</p></div>`;
        }
        
        this.openModal('community');
    },

    openRatingModal: function() {
        if (!DataManager?.user) {
            this.showToast('يجب تسجيل الدخول لتقييم المتجر', 'error');
            this.sfx?.('error');
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            return;
        }
        
        const hasRated = localStorage.getItem(CACHE_KEYS.USER_RATED) === 'true';
        UIState.currentRating = 0;
        
        const btn = document.getElementById('btnContinueRating');
        if (btn) { btn.disabled = true; btn.classList.add('opacity-50'); }
        
        const feedbackInp = document.getElementById('ratingFeedbackInput');
        if (feedbackInp) feedbackInp.value = '';
        
        document.querySelectorAll('.rating-star').forEach(star => {
            star.classList.remove('fa-solid', 'active');
            star.classList.add('fa-regular');
        });
        
        const stepStars = document.getElementById('rating-step-stars');
        const stepFeedback = document.getElementById('rating-step-feedback');
        const stepShare = document.getElementById('rating-step-share');
        
        if (hasRated) {
            if (stepStars) stepStars.classList.add('hide-element');
            if (stepFeedback) stepFeedback.classList.add('hide-element');
            if (stepShare) stepShare.classList.remove('hide-element', 'd-none');
        } else {
            if (stepStars) stepStars.classList.remove('hide-element', 'd-none');
            if (stepFeedback) stepFeedback.classList.add('hide-element');
            if (stepShare) stepShare.classList.add('hide-element');
        }
        
        this.openModal('rating');
    },    

    selectRatingStar: function(val) {
        UIState.currentRating = val; 
        
        document.querySelectorAll('.rating-star').forEach(star => {
            const starVal = parseInt(star.dataset.val || star.getAttribute('data-val') || 0, 10);
            if (starVal <= val) {
                star.classList.remove('fa-regular');
                star.classList.add('fa-solid', 'active'); 
            } else {
                star.classList.remove('fa-solid', 'active');
                star.classList.add('fa-regular');
            }
        });
        
        const btn = document.getElementById('btnContinueRating'); 
        if (btn) { btn.disabled = false; btn.classList.remove('opacity-50'); }
    },
    
    submitRatingStep: function() {
        try { localStorage.setItem(CACHE_KEYS.USER_RATED, 'true'); } catch (e) {}
        
        const stepStars = document.getElementById('rating-step-stars');
        if (stepStars) stepStars.classList.add('hide-element');
        
        const currRating = UIState.currentRating || 0;
        if (currRating >= 4 && typeof DataManager?.submitPrivateFeedback === 'function') {
            DataManager.submitPrivateFeedback(currRating, 'تقييم ممتاز').catch(() => {});
        }
        const targetId = currRating <= 3 ? 'rating-step-feedback' : 'rating-step-share';
        
        const targetStep = document.getElementById(targetId);
        if (targetStep) targetStep.classList.remove('hide-element', 'd-none');
    },

    // ⭐ منقولة من uiAuth.js لتوحيد كافة دوال التقييم داخل uiCore.js
    submitPrivateFeedback: async function() {
        const rawFeedback = document.getElementById('ratingFeedbackInput')?.value.trim() || '';
const feedback = rawFeedback.replace(/[<>]/g, '').trim();        
        if (!feedback) {
            this.showToast("يرجى كتابة تفاصيل مقترحك أو شكواك لمساعدتنا على خدمتك", "warning");
            return;
        }
        
        const btn = document.getElementById('btnSubmitFeedback');
        if (btn) { btn.textContent = "جاري الإرسال..."; btn.disabled = true; }
        
        try {
            const currentRating = UIState.currentRating || 0;
            const res = await DataManager.submitPrivateFeedback(currentRating, feedback);
            
            if (res.success) {
                this.closeModal('rating'); 
                this.showToast("نشكرك جداً! تم الإرسال للإدارة.", "success"); 
            } else {
                throw new Error("فشل الإرسال");
            }
        } catch (error) {
            console.error("Feedback Error:", error);
            this.showToast("حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.", "error");
        } finally {
            if (btn) { btn.textContent = "إرسال للإدارة"; btn.disabled = false; }
        }
    },

    openAboutModal: function() {
        const s = LiveStoreData.settings || {};
        const storeName = s.storeName || s.name || 'المتجر';
        const logoDark = s.storeLogo || s.logo || '';
        
        const logoTarget = document.getElementById('about-logo-box');
        if (logoTarget) {
            logoTarget.innerHTML = logoDark 
                ? `<div class="about-logo-wrapper"><img src="${Utils.safeUrl(logoDark)}" alt="Logo" class="about-logo-img"></div>`
                : `<div class="about-logo-wrapper"><i class="fa-solid fa-circle-info" style="font-size: 24px;"></i></div>`;
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