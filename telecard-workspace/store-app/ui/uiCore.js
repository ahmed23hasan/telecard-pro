
// ⚙️ وحدة الأساسيات والنواة (uiCore.js) - ES6 Module
// 🎯 الوظيفة: النوافذ، الإشعارات، القائمة الجانبية، النسخ، الثيم، والتوجيه العام
// 🚀 التحديث الأقصى: ترقيع CSS Injection، تراكم الإشعارات (Toast Stack)، وتوحيد الـ Imports
// ============================================================================

import { DB_KEYS } from '../config.js';           
import { Utils } from '../utils.js';             
// 🛡️ [إصلاح معماري]: استيراد StoreDB من مصدر واحد (Singleton) لمنع تكرار الاتصال
import { DataManager, LiveStoreData, StoreDB } from '../dataManager.js'; 
import { RenderManager } from '../renderManager.js'; 
import { Components } from '../components.js';     
import { RenderHelpers } from '../core/renderHelpers.js'; 

const getSys = () => {
    if (window.ClientSystem) return window.ClientSystem;
    if (window.UIManager) return window.UIManager;
    
    return new Proxy({}, {
        get: (target, prop) => () => {
            console.error(`🚨 تم إيقاف استدعاء [${String(prop)}] لأن النظام (ClientSystem) لم يكتمل إقلاعه بعد!`);
        }
    });
};

export const UICore = {
    activeModals: [],
    displayMenuTimer: null,
    audioCtx: null,
    navHistory: [],
    currentCategoryId: null,
    historyStateSet: false,

    // =========================================================
    // 🚨 0. نافذة الطرد المباشر وإعدام الجلسات (True Session Eviction)
    // =========================================================
    triggerLiveBanAlert: function(reasonMessage) {
        const msgText = Utils.escapeHtml(reasonMessage || 'تم تقييد حسابك.');
        
        // 1. تدمير واجهة المستخدم بالكامل فوراً لمنع تفاعل المخترق عبر الـ Console
        document.body.innerHTML = `
            <div id="global-security-alert" class="sys-dialog-wrapper active" style="z-index: 999999999; background: #000;">
                <div class="sys-dialog-card" style="border-color: #ef4444;">
                    <div class="sys-dialog-header">
                        <div class="sys-dialog-icon" style="color: #ef4444; background: rgba(239, 68, 68, 0.1);">
                            <i class="fa-solid fa-ban"></i>
                        </div>
                        <h3 class="sys-dialog-title text-danger">تنبيه أمني</h3>
                    </div>
                    <div class="sys-dialog-msg-container">
                        <p class="sys-dialog-msg" id="global-alert-msg">${msgText}</p>
                    </div>
                </div>
            </div>
        `;
        
        getSys().sfx?.('error');
        
        // 2. تدمير الكاش والجلسة محلياً (مسح شامل لكل المخلفات)
        try {
            if (window.localforage) window.localforage.clear();
            localStorage.removeItem('telecard_store_cache');
            localStorage.removeItem('telecard_active_user_uid');
            localStorage.removeItem('telecard_active_user');
            localStorage.removeItem('telecard_biometric_key'); // 🛡️ مسح البصمة لمنع القفل الأبدي
            
            import('../core/firebaseAdapter.js').then(module => {
                if (module.auth) module.auth.signOut();
            }).catch(()=>{});
        } catch(e) {}
        
        // 3. التوجيه لصفحة الدخول
        setTimeout(() => {
            window.location.replace('login.html');
        }, 4000);
    },

    // =========================================================
    // ⚙️ نافذة الإعدادات (Settings Modal)
    // =========================================================
    openSettings: function() { 
        getSys().resetUI?.(); 
        getSys().renderSettingsUI?.(); 
        getSys().openModal?.('settings'); 
    },
    closeSettings: function() { getSys().closeModal?.('settings'); },

    // =========================================================
    // 🌗 1. دوال الثيم والهوية البصرية والتزامن الذكي
    // =========================================================
    toggleTheme: function() {
        const isCurrentlyLight = document.body.classList.contains('light-mode');
        getSys().setThemePref(isCurrentlyLight ? 'dark' : 'light');
        getSys().sfx?.('nav');
    },
    
    toggleThemePref: function() {
        getSys().toggleTheme();
    },
    
    setThemePref: function(mode) {
        const isLight = mode === 'light';
        
        document.body.classList.toggle('light-mode', isLight);
        localStorage.setItem('telecard_theme', isLight ? 'light' : 'dark');
        
        if (DataManager.prefs) {
            DataManager.prefs.theme = isLight ? 'light' : 'dark';
            if (DataManager.savePrefs) DataManager.savePrefs();
        }
        
        const dottedSunSVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="display:inline-block; vertical-align:middle;"><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="2" r="1.5"></circle><circle cx="12" cy="22" r="1.5"></circle><circle cx="2" cy="12" r="1.5"></circle><circle cx="22" cy="12" r="1.5"></circle><circle cx="4.93" cy="4.93" r="1.5"></circle><circle cx="19.07" cy="19.07" r="1.5"></circle><circle cx="4.93" cy="19.07" r="1.5"></circle><circle cx="19.07" cy="4.93" r="1.5"></circle></svg>`;
        
        const headerIcon = document.getElementById('theme-toggle-icon');
        if (headerIcon) {
            if (isLight) {
                headerIcon.innerHTML = '';
                headerIcon.className = 'fa-solid fa-moon';
            } else {
                headerIcon.className = ''; 
                headerIcon.innerHTML = dottedSunSVG; 
            }
        }
        
        const themeToggles = document.querySelectorAll('.global-theme-toggle');
        themeToggles.forEach(btn => {
            btn.classList.toggle('is-light', isLight);
            btn.classList.toggle('is-active', isLight);
            
            const lbl = btn.querySelector('.theme-lbl');
            const icn = btn.querySelector('.theme-icn');
            
            if (lbl) lbl.textContent = isLight ? 'نهاري' : 'ليلي';
            if (icn) {
                if (isLight) {
                    icn.innerHTML = ''; icn.className = 'fa-solid fa-moon theme-icn';
                } else {
                    icn.className = 'theme-icn'; icn.innerHTML = dottedSunSVG;
                }
            }
        });
    },    

    applySavedTheme: function() {
        const savedTheme = localStorage.getItem('telecard_theme') || 'dark';
        getSys().setThemePref(savedTheme);
    },
    
    initTheme: function() {
        const saved = (DataManager.prefs && DataManager.prefs.theme) ? DataManager.prefs.theme : (localStorage.getItem('telecard_theme') || 'dark');
        getSys().setThemePref(saved);
    },
    
    // =========================================================
    // 🔊 دوال الأصوات وتزامن الأزرار
    // =========================================================
    toggleSoundPref: function() {
        if (!DataManager.prefs) return;
        DataManager.prefs.sound = !DataManager.prefs.sound;
        if (DataManager.savePrefs) DataManager.savePrefs();
        getSys().updateSoundUI();
        getSys().sfx?.('nav');
    },
    
    updateSoundUI: function() {
        const soundOn = (DataManager.prefs && DataManager.prefs.sound !== false);
        const soundToggles = document.querySelectorAll('.global-sound-toggle');
        
        soundToggles.forEach(btn => {
            btn.classList.toggle('is-active', soundOn);
            const lbl = btn.querySelector('.sound-lbl');
            const icn = btn.querySelector('.sound-icn');
            if (lbl) lbl.textContent = soundOn ? 'مفعل' : 'صامت';
            if (icn) icn.className = soundOn ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
        });
    },
    
    renderSettingsUI: function() {
        const prefs = DataManager.prefs || {};
        const isLight = prefs.theme === 'light' || document.body.classList.contains('light-mode');
        getSys().setThemePref(isLight ? 'light' : 'dark');
        getSys().updateSoundUI();
    },

    // =========================================================
    // 👤 دالة استخراج الاسم الصريح للعميل (Name Sanitization)
    // =========================================================
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
        const namePart = u.username ? `@${u.username}` : this._getFullName(u);
        const displayId = RenderHelpers.formatUserId(u);

        return `
            <div class="tx-name-wrapper">
                <span class="tx-name-text">${Utils.escapeHtml(namePart)}</span>
                <div class="uid-capsule" dir="ltr">
                    <i class="fa-solid fa-id-card"></i>
                    <span class="num-en">${displayId}</span>
                </div>
            </div>`;
    },

    // =========================================================
    // 🪟 2. الإدارة المركزية للنوافذ (Modals & Resets)
    // =========================================================
    openModal: function(modalId) {
        const overlay = document.getElementById(`${modalId}-overlay`);
        const modal = document.getElementById(`${modalId}-modal`);
        if (!modal) return;

        if (!this.activeModals || !Array.isArray(this.activeModals)) this.activeModals = [];
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
                DataManager.getAdminCountries().then(countries => {
                    if (RenderManager.renderCountryList) RenderManager.renderCountryList(countries);
                });
            }
            getSys().loadDynamicCurrenciesForModal?.();
        }

        if (modalId === 'kyc-upload') {
            getSys().prepareKycModalState?.();
        }
    },

    closeModal: function(modalId) {
        if (!modalId) { getSys().closePurchaseModal?.(); return; }
        const overlay = document.getElementById(`${modalId}-overlay`);
        const modal = document.getElementById(`${modalId}-modal`);
        
        if (modal) {
            modal.classList.remove('active');
            // 🛡️ مسح مؤقت التمرير إذا تم فتح نافذة أخرى سريعاً
            if (modal._scrollTimer) clearTimeout(modal._scrollTimer);
            modal._scrollTimer = setTimeout(() => {
                modal.scrollTop = 0;
                const innerScrolls = modal.querySelectorAll('.pm-scroll-content, .scrollable, .modal-content, .profile-container, .profile-pass-body, [id$="-list"]');
                innerScrolls.forEach(s => s.scrollTop = 0);
            }, 350);
        }
        
        if (overlay) overlay.classList.remove('active');
        
        if (this.activeModals && Array.isArray(this.activeModals)) {
            this.activeModals = this.activeModals.filter(id => id !== modalId);
            if (this.activeModals.length === 0 && !document.querySelector('.sidebar.active')) {
                document.body.classList.remove('no-scroll');
            }
        }
        
        const majorModals = ['wallet', 'orders', 'mypay', 'profile-info'];
        if (majorModals.includes(modalId)) {
            this.syncBottomNavWithBaseState();
        }
    },    
    
    closeAllModals: function() {
        if (this.activeModals && Array.isArray(this.activeModals)) { 
            [...this.activeModals].forEach(id => this.closeModal(id)); 
        }
    },

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
        const walletArrow = document.querySelector('.detail-arrow'); 
        if (walletDrawer) { 
            walletDrawer.classList.remove('active'); 
            walletDrawer.style.removeProperty('max-height'); 
            const walletModal = walletDrawer.closest('#wallet-modal');
            if(walletModal) walletModal.classList.remove('drawer-blur-active');
        }

        if (walletArrow) { walletArrow.classList.remove('open'); }
        
        const searchInputs = ['store-search-input', 'order-search-input', 'wallet-search-input', 'pay-search-input'];
        searchInputs.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

        if (!document.querySelector('.sidebar.active') && this.activeModals.length === 0) {
            document.body.classList.remove('no-scroll');
        }
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
            
            const isHome = document.body.classList.contains('is-home');
            const titleText = document.getElementById('grid-title')?.innerText?.trim();
            const isFavorites = titleText === 'المفضلة';
            
            let targetAction = 'nav-home'; 
            if (isFavorites) targetAction = 'open-favorites';
            else if (isHome || this.currentCategoryId) targetAction = 'nav-home';
            
            const activeBtn = document.querySelector(`.bottom-nav .nav-icon[data-action="${targetAction}"]`);
            if (activeBtn) activeBtn.classList.add('active');
            
        }, 350);
    },

    closeAllSheets: function() { this.resetUI(); },
    
    toggleHeroSection: function(show) {
        if(show) document.body.classList.remove('hero-hidden'); else document.body.classList.add('hero-hidden');
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
        if (RenderManager && typeof RenderManager.renderTerms === 'function') {
            RenderManager.renderTerms();
        } else {
            const settings = LiveStoreData.settings || {};
            const termsContent = document.getElementById('store-terms-content');
            if (termsContent) termsContent.innerText = settings.terms || 'لا توجد شروط وأحكام مسجلة حالياً.';
        }
        this.openModal('terms');
    },

    // =========================================================
    // 🚀 3. التوجيه (Routing) والقائمة الجانبية (Sidebar)
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
        
        if (this.activeModals.length === 0) {
            document.body.classList.remove('no-scroll');
        }

        if(menu) { menu.classList.remove('active'); menu.style.transform = ''; }
        if(overlay) overlay.classList.remove('active'); 
        this.removeSidebarClickOutsideDetector();
        getSys().saveDisplayState?.();

        if (typeof this.syncBottomNavWithBaseState === 'function') {
            this.syncBottomNavWithBaseState();
        }
    },

    bindSidebarProfileTriggers: function() {
        const avatarEl = document.getElementById('cs-avatar');
        const nameEl = document.getElementById('cs-name');
        const handleProfileClick = (e) => { e.preventDefault(); e.stopPropagation(); getSys().openProfileInfo?.(); getSys().sfx?.('nav'); };

        if (avatarEl && !avatarEl.dataset.eventBound) { avatarEl.addEventListener('click', handleProfileClick); avatarEl.dataset.eventBound = "true"; avatarEl.style.cursor = 'pointer'; }
        if (nameEl && !nameEl.dataset.eventBound) { nameEl.addEventListener('click', handleProfileClick); nameEl.dataset.eventBound = "true"; nameEl.style.cursor = 'pointer'; }
    },

    setupSidebarClickOutsideDetector: function() {
        this.removeSidebarClickOutsideDetector();
        this._sidebarClickHandler = (event) => {
            const sidebar = document.querySelector('.sidebar') || document.getElementById('cs-menu');
            const overlay = document.getElementById('cs-overlay') || document.getElementById('sidebarOverlay');
            if (!sidebar || !sidebar.classList.contains('active')) return;
            const isClickInsideSidebar = sidebar.contains(event.target);
            const isClickOnHamburger = event.target.closest('.hamburger') || event.target.closest('[data-action="open-sidebar"]');
            const isClickOnOverlay = event.target === overlay;
            if (isClickOnOverlay || (!isClickInsideSidebar && !isClickOnHamburger)) this.closeSidebar();
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
            const isClickInsideSidebar = sidebar.contains(event.target);
            const isClickOnHamburger = event.target.closest('.hamburger') || event.target.closest('[data-action="open-sidebar"]');
            if (!isClickInsideSidebar && !isClickOnHamburger) {
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
        
        if (menu) menu.classList.add('swipe-ready');
        if (!menu || menu.dataset.swipeInitialized) return;
        menu.dataset.swipeInitialized = "true";

        let menuWidth = 260; const edgeZone = 40; const MAX_OPACITY = 1; 
        let startX = 0, startY = 0, isDragging = false, isSwipeConfirmed = false, startTime = 0, initialOpenState = false;

        const resetSidebarScroll = () => {
            if (menu) menu.scrollTop = 0;
            requestAnimationFrame(() => {
                const scrollables = menu.querySelectorAll('div, .sidebar-content, .scrollable, .offcanvas-body');
                scrollables.forEach(el => { if (el.scrollHeight > el.clientHeight) el.scrollTop = 0; });
            });
        };

        const stateObserver = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                if (m.attributeName === 'class') {
                    const isOpen = menu.classList.contains('active');
                    if (isOpen) { resetSidebarScroll(); if (!isDragging && overlay) overlay.style.opacity = MAX_OPACITY; } 
                    else { if (!isDragging && overlay) overlay.style.opacity = ''; }
                }
            });
        });
        stateObserver.observe(menu, { attributes: true, attributeFilter: ['class'] });

        const cleanupPerformance = () => { menu.style.willChange = 'auto'; if(overlay) overlay.style.willChange = 'auto'; };
        
        const removeListeners = () => { 
            document.removeEventListener('touchmove', onTouchMove); 
            document.removeEventListener('touchend', onTouchEnd); 
            document.removeEventListener('touchcancel', onTouchEnd); 
            isDragging = false; 
            isSwipeConfirmed = false; 
        };

        const onTouchStart = (e) => {
            if (e.target.closest('.slider-container')) return; 
            
            removeListeners();
            
            startX = e.touches[0].clientX; startY = e.touches[0].clientY;
            initialOpenState = menu.classList.contains('active');
            const isValidStart = initialOpenState || (!initialOpenState && startX > (window.innerWidth - edgeZone));
            if (!isValidStart) return;

            menu.style.willChange = 'transform'; if(overlay) overlay.style.willChange = 'opacity';
            isDragging = true; isSwipeConfirmed = false; startTime = Date.now();
            
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd, { passive: true });
            document.addEventListener('touchcancel', onTouchEnd, { passive: true });
        };

        const onTouchMove = (e) => {
            if (!isDragging) return;
            const diffX = e.touches[0].clientX - startX; const diffY = e.touches[0].clientY - startY;

            if (!isSwipeConfirmed) {
                if (Math.sqrt(diffX ** 2 + diffY ** 2) < 10) return;
                // السماح بالتمرير العمودي بحرية
                if (Math.abs(diffY) > Math.abs(diffX) * 1.5) { isDragging = false; removeListeners(); cleanupPerformance(); return; }
                isSwipeConfirmed = true;
                if (!initialOpenState) resetSidebarScroll();
                menuWidth = menu.offsetWidth || 260;
                menu.style.visibility = 'visible'; menu.style.transition = 'none';
                if(overlay) { overlay.style.transition = 'none'; overlay.style.opacity = initialOpenState ? getComputedStyle(overlay).opacity : '0'; }
            }

            if (e.cancelable) e.preventDefault();
            let translateVal = initialOpenState ? Math.max(0, diffX) : Math.max(0, menuWidth + diffX);
            if (translateVal > menuWidth) translateVal = menuWidth;

            requestAnimationFrame(() => {
                menu.style.transform = `translate3d(${translateVal}px, 0, 0)`;
                if (overlay) { const percentage = 1 - (translateVal / menuWidth); overlay.style.opacity = (percentage * MAX_OPACITY).toFixed(2); }
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
                if (shouldClose) {
                    this.closeSidebar(); 
                    requestAnimationFrame(() => { menu.style.transition = ''; menu.style.transform = ''; menu.style.visibility = ''; if(overlay) { overlay.style.transition = ''; overlay.style.opacity = ''; } });
                } else {
                    this.openSidebar(); 
                    resetSidebarScroll();
                    requestAnimationFrame(() => { menu.style.transition = ''; menu.style.transform = ''; if(overlay) { overlay.style.transition = ''; setTimeout(() => overlay.style.opacity = MAX_OPACITY, 0); } });
                }
                cleanupPerformance();
            }, duration + 20); 

            removeListeners();
        };

        document.addEventListener('touchstart', onTouchStart, { passive: true });
    },

    // =========================================================
    // 🌟 محرك الانتقالات الفاخر (Native App Transition Engine)
    // =========================================================
    _toggleNavLoader: function(show) {
        let loader = document.getElementById('premium-nav-loader');
        if (!loader) {
            const s = LiveStoreData.settings || {};
            const sName = s.storeName || s.name || 'المتجر';
            loader = document.createElement('div');
            loader.id = 'premium-nav-loader';
            loader.innerHTML = `
                <div class="pnl-backdrop" style="position:fixed; inset:0; background:var(--bg-main, #111a2b); opacity:0.85; backdrop-filter:blur(8px); z-index:99999; display:flex; align-items:center; justify-content:center; transition:opacity 0.2s ease;">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:15px; transform:scale(0.9); animation:pnlPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;">
                        <div style="position:relative; width:60px; height:60px; display:flex; align-items:center; justify-content:center;">
                            <i class="fa-solid fa-circle-notch fa-spin" style="position:absolute; font-size:60px; color:var(--gold-main, #FFD700); opacity:0.3;"></i>
                            <i class="fa-solid fa-store" style="font-size:24px; color:var(--gold-main, #FFD700);"></i>
                        </div>
                        <div style="color:#fff; font-weight:900; font-size:16px; letter-spacing:1px; font-family:'Cairo', sans-serif;">${Utils.escapeHtml(sName)}</div>
                    </div>
                </div>
                <style>@keyframes pnlPop { to { transform:scale(1); } }</style>
            `;
            document.body.appendChild(loader);
        }
        
        const backdrop = loader.querySelector('.pnl-backdrop');
        if (show) {
            loader.style.display = 'block';
            void loader.offsetWidth; 
            backdrop.style.opacity = '1';
        } else {
            backdrop.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 200);
        }
    },

    _executePageTransition: function(renderCallback) {
        const grid = document.getElementById('store-grid');
        this._toggleNavLoader(true); 
        
        if (grid) {
            grid.style.transition = 'none';
            grid.style.opacity = '0'; 
        }
        
        requestAnimationFrame(() => {
            renderCallback(); 
            setTimeout(() => {
                this._toggleNavLoader(false); 
                if (grid) {
                    grid.style.transition = 'opacity 0.25s ease-out';
                    grid.style.opacity = '1'; 
                }
            }, 250);
        });
    },

    // =========================================================
    // 🚀 تطبيق المحرك على دوال التوجيه
    // =========================================================

    navigateHome: function() { 
        this.closeSidebar(); 
        this.currentCategoryId = null; 
        this.navHistory = [];
        
        this._executePageTransition(() => {
            if(RenderManager.renderHome) RenderManager.renderHome();
        });
    },
    
    openFavorites: function() {
        if (!DataManager || !DataManager.user) {
            getSys().showToast?.('يجب تسجيل الدخول لعرض مفضلتك', 'error');
            getSys().sfx?.('error');
            setTimeout(() => { window.location.replace('login.html'); }, 1500);
            return;
        }
        
        const currentTitle = document.getElementById('grid-title')?.innerText?.trim();
        if (currentTitle === 'المفضلة') {
            this.closeSidebar();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return; 
        }
        
        this.closeSidebar();
        this.resetUI();
        this.currentCategoryId = null;
        
        this._executePageTransition(() => {
            if (RenderManager.renderFavorites) RenderManager.renderFavorites();
        });
    },

    navigateBalance: function() { this.closeSidebar(); getSys().openAddBalance?.(); },
    navigateMyPayments: function() { this.closeSidebar(); getSys().openMyPayments?.(); },
    navigateOrders: function() { this.closeSidebar(); getSys().openOrders?.(); },
    navigateWallet: function() { this.closeSidebar(); getSys().openWallet?.(); },
    navigateSettings: function() { this.closeSidebar(); getSys().openSettings?.(); },

    openCategory: function(id) {
        if (!this.historyStateSet) {
            window.addEventListener('popstate', (e) => { this._manualGoBack(); });
            this.historyStateSet = true;
        }
        
        if (this.currentCategoryId === null) this.navHistory.push('HOME'); 
        else this.navHistory.push(this.currentCategoryId);
        
        const hash = '#cat-' + id;
        if(window.location.hash !== hash) { 
            window.history.pushState({ internalId: Date.now() }, '', hash); 
        }
        this.currentCategoryId = id;
        
        const grid = document.getElementById('store-grid');
        
        if (grid) {
            let storiesBar = document.getElementById('offer-stories-bar');
            if (!storiesBar) {
                storiesBar = document.createElement('div');
                storiesBar.id = 'offer-stories-bar';
                grid.parentNode.insertBefore(storiesBar, grid); 
            }

            this.setGridMode('grid-prods');
            const hasData = (LiveStoreData.prods && LiveStoreData.prods.length > 0) || (LiveStoreData.cats && LiveStoreData.cats.length > 0);

            if (hasData) {
                this._executePageTransition(() => {
                    if (RenderManager.renderOfferStories) RenderManager.renderOfferStories(id);
                    if (RenderManager._renderContent) RenderManager._renderContent(id);
                    if (Components && Components.initProductShine) Components.initProductShine();
                });
            } else {
                storiesBar.style.display = 'none';
                grid.innerHTML = '';
                
                if (RenderManager.renderProductSkeletons) {
                    RenderManager.renderProductSkeletons('store-grid', 8);
                }
                
                setTimeout(() => {
                    if (RenderManager.renderOfferStories) RenderManager.renderOfferStories(id);
                    if (RenderManager._renderContent) RenderManager._renderContent(id);
                    if (Components && Components.initProductShine) Components.initProductShine();
                }, 800);
            }
        }
    },
    
    _manualGoBack: function() {
        if (this.navHistory.length === 0) { 
            this.currentCategoryId = null; 
            this._executePageTransition(() => {
                if(RenderManager.renderHome) RenderManager.renderHome(true);
            });
            return; 
        }
        
        const prevId = this.navHistory.pop();
        
        if (prevId === 'HOME' || prevId === null) { 
            this.currentCategoryId = null; 
            this._executePageTransition(() => {
                if(RenderManager.renderHome) RenderManager.renderHome(true);
            });
        } else { 
            this.currentCategoryId = prevId; 
            this._executePageTransition(() => {
                if(RenderManager.renderOfferStories) RenderManager.renderOfferStories(prevId);
                if(RenderManager._renderContent) RenderManager._renderContent(prevId); 
                if (Components && Components.initProductShine) Components.initProductShine();
            });
        }
    },    
    
    openOrders: function() { 
        if (!DataManager || !DataManager.user) {
            getSys().showToast?.('يجب تسجيل الدخول لعرض طلباتك', 'error');
            getSys().sfx?.('error');
            setTimeout(() => { window.location.replace('login.html'); }, 1500);
            return;
        }
        this.resetUI();
        getSys().setFilterDefaults?.('order');
        if(RenderManager.renderOrders) RenderManager.renderOrders(); 
        setTimeout(() => { this.openModal('orders'); }, 10);
    },

    openWallet: function() { 
        if (!DataManager || !DataManager.user) {
            getSys().showToast?.('يجب تسجيل الدخول لعرض محفظتك', 'error');
            getSys().sfx?.('error');
            setTimeout(() => { window.location.replace('login.html'); }, 1500);
            return;
        }
        this.resetUI();
        getSys().setFilterDefaults?.('wallet'); 
        getSys().updateDisplayBalance?.();
        if(RenderManager.renderWallet) RenderManager.renderWallet(); 

        this._syncWalletBlur();
        setTimeout(() => { this.openModal('wallet'); }, 10);
    },

    _syncWalletBlur: function() {
        const drawer = document.getElementById('walletStatsDrawer');
        const walletModal = document.getElementById('wallet-modal');
        
        if (!drawer || !walletModal || drawer._hasBlurObserver) return;

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                if (m.attributeName === 'class') {
                    if (!drawer.classList.contains('active')) {
                        walletModal.classList.remove('drawer-blur-active');
                        const arrowBtn = document.querySelector('.detail-arrow'); 
                        if (arrowBtn) arrowBtn.classList.remove('open');
                    }
                }
            });
        });

        observer.observe(drawer, { attributes: true, attributeFilter: ['class'] });
        drawer._hasBlurObserver = true;
    },    
    
    openMyPayments: function() { 
        if (!DataManager || !DataManager.user) {
            getSys().showToast?.('يجب تسجيل الدخول لعرض سجل الدفعات', 'error');
            getSys().sfx?.('error');
            setTimeout(() => { window.location.replace('login.html'); }, 1500);
            return;
        }
        this.resetUI();
        getSys().setFilterDefaults?.('payments');
        if(RenderManager.renderPayments) RenderManager.renderPayments(); 
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
        const arrowBtn = document.querySelector('.detail-arrow'); 
        const walletModal = document.getElementById('wallet-modal');

        if (statsDrawer) {
            statsDrawer.classList.remove('active');
            statsDrawer.style.removeProperty('max-height');
        }
        if (arrowBtn) arrowBtn.classList.remove('open'); 
        if (walletModal) {
            walletModal.classList.remove('drawer-blur-active');
            walletModal.scrollTop = 0;
        }
        if (typeof this._closeAndResetTabs === 'function') {
            this._closeAndResetTabs('wallet', 'wallet', '#wallet-tabs .mf-tab');
        }
    },

    setupWalletDrawerClickOutside: function() {
        if (this._walletDrawerListenerBound) return;
        document.addEventListener('click', (e) => {
            const drawer = document.getElementById('walletStatsDrawer');
            const walletModal = document.getElementById('wallet-modal');
            const isClickOnToggleBtn = e.target.closest('[data-action="toggle-wallet-stats"]');
            
            if (drawer && drawer.classList.contains('active')) {
                if (!drawer.contains(e.target) && !isClickOnToggleBtn) {
                    drawer.classList.remove('active'); 
                    if (walletModal) walletModal.classList.remove('drawer-blur-active'); 
                    const arrowBtn = document.querySelector('.detail-arrow');
                    if (arrowBtn) arrowBtn.classList.remove('open'); 
                }
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
                
                let icon = null;
                if (type === 'smartline') {
                    element.classList.add('copy-success'); 
                    icon = element.querySelector('.scl-icon');
                    if (icon) icon.className = 'fa-solid fa-check-double scl-icon';
                } else {
                    element.classList.add('is-copied');
                    icon = element.querySelector('i') || (element.tagName === 'I' ? element : null);
                    if (icon) {
                        if (!icon.dataset.origClass) icon.dataset.origClass = icon.className;
                        icon.className = 'fa-solid fa-check-double';
                    }
                }
                
                if (element.copyTimer) clearTimeout(element.copyTimer);
                element.copyTimer = setTimeout(() => { 
                    if (type === 'smartline') {
                        if (icon) icon.className = 'fa-regular fa-copy scl-icon';
                        element.classList.remove('copy-success');
                    } else {
                        element.classList.remove('is-copied');
                        if (icon && icon.dataset.origClass) icon.className = icon.dataset.origClass; 
                    }
                }, 800); 
            }
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(successVisuals).catch(() => this.showToast('فشل النسخ', 'error'));
        } else {
            const textarea = document.createElement('textarea'); 
            textarea.value = text; document.body.appendChild(textarea); textarea.select();
            try { document.execCommand('copy'); successVisuals(); } catch (e) { this.showToast('فشل النسخ', 'error'); }
            document.body.removeChild(textarea);
        }
    },

    copyOrderInput: function(text, element) { this.copyToClipboard(text, element, 'default'); },
    copySmartLine: function(element, text) { this.copyToClipboard(text, element, 'smartline'); },

    pasteText: async function() {
        const couponInput = document.getElementById('couponCode');
        if (!couponInput) return;

        if (!navigator.clipboard) {
            this.showToast('المتصفح يحظر اللصق التلقائي على هذا الاتصال. يرجى استخدام اللصق اليدوي بالضغط المطول داخل الحقل.', 'warning');
            return;
        }

        try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim() !== '') {
                couponInput.value = text.trim().toUpperCase();
                
                if (typeof this.checkInputState === 'function') {
                    this.checkInputState();
                } else if (typeof getSys().checkInputState === 'function') {
                    getSys().checkInputState();
                }
                
                this.showToast('تم لصق الكوبون بنجاح', 'success');
                getSys().sfx?.('success');
            } else {
                this.showToast('الحافظة فارغة! يرجى نسخ كود الكوبون أولاً.', 'warning');
            }
        } catch (err) {
            this.showToast('يرجى السماح باللصق التلقائي من إعدادات المتصفح (أيقونة القفل 🔒 بأعلى الشاشة)', 'warning');
        }
    },    
    
    showAdminDirectMessage: function(msgText) {
        if (document.getElementById('admin-direct-msg-popup')) return;
        const safeMsg = Utils.escapeHtml(msgText);
        
        const html = `
            <div id="admin-direct-msg-popup" class="sys-dialog-wrapper">
                <div class="sys-dialog-overlay"></div>
                <div class="sys-dialog-card">
                    <div class="sys-dialog-header">
                        <div class="sys-dialog-icon"><i class="fa-solid fa-envelope-open-text fa-bounce"></i></div>
                        <h3 class="sys-dialog-title">رسالة إدارية هامة</h3>
                    </div>
                    <div class="sys-dialog-msg-container">
                        <p class="sys-dialog-msg">${safeMsg}</p>
                    </div>
                    <div class="sys-dialog-actions">
                        <button id="ack-admin-msg-btn" class="sys-dialog-btn">قرأت ذلك، شكراً</button>
                    </div>
                </div>
            </div>`;
            
        document.body.insertAdjacentHTML('beforeend', html);
        getSys().sfx?.('success');

        document.getElementById('ack-admin-msg-btn').addEventListener('click', () => {
            if (DataManager.ackAdminMessage) DataManager.ackAdminMessage();
            document.getElementById('admin-direct-msg-popup').remove();
        });
    },

    processAndDisplayAlerts: function() {
    if (!DataManager.getUnreadAlerts) return;
    
    const unreadAlerts = DataManager.getUnreadAlerts();
    if (!unreadAlerts || unreadAlerts.length === 0) return;
    
    const shownToastsKey = 'telecard_shown_toasts';
    let shownToasts = [];
    try { shownToasts = JSON.parse(localStorage.getItem(shownToastsKey) || "[]"); } catch (e) {}
    
    unreadAlerts.forEach((msg) => {
        const msgId = String(msg.id);
        
        // 🛡️ درع الحماية: لا تظهر الإشعار إلا إذا كان جديداً ولم يسبق عرضه في هذه الجلسة
        if (!shownToasts.includes(msgId)) {
            
            if (msg.type === 'popup' || msg.isPopup) {
                this.showAdvancedPopup(msg, []);
            } else {
                // 🚀 عرض الإشعار التلقائي بناءً على محتوى الرسالة (نجاح، رفض، استرجاع)
                this.showToast(msg.message, 'info');
            }
            
            // تسجيل الإشعار كـ "معروض"
            shownToasts.push(msgId);
            // الحفاظ على حجم الـ LocalStorage (آخر 50 إشعار فقط)
            if (shownToasts.length > 50) shownToasts.shift();
            localStorage.setItem(shownToastsKey, JSON.stringify(shownToasts));
            
            // تحديث العدادات في الهيدر والسايدبار
            this.updateNotifBadges();
        }
    });
},
    showAdvancedPopup: function(alertObj, remainingQueue) {
        // 🛡️ [تنظيف الـ DOM]: مسح أي نافذة سابقة لمنع التكدس وتسرب الذاكرة
        const existingModal = document.getElementById('advanced-alert-modal');
        if (existingModal) existingModal.remove();

        const title = alertObj.title || 'إشعار هام';
        const message = alertObj.message || '';
        const escapeHtml = Utils.escapeHtml;
        let extraHtml = '';
        
        if (alertObj.couponCode) {
            extraHtml += `<div class="mt-15" style="background: rgba(168, 85, 247, 0.1); border: 1px dashed #a855f7; padding: 12px; border-radius: 12px; text-align: center;">
                <div style="font-size: 11px; color: #a855f7; margin-bottom: 6px; font-weight: bold;">🎁 كود خصم حصري لك:</div>
                <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
                    <span class="num-en" style="font-size: 18px; font-weight: 900; color: #fff; letter-spacing: 2px;">${escapeHtml(alertObj.couponCode)}</span>
                    <button id="adv-alert-copy-btn" data-code="${escapeHtml(alertObj.couponCode)}" style="background: #a855f7; border: none; color: #fff; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>
            </div>`;
        }

        if (alertObj.actionLink) {
            extraHtml += `<a href="${Utils.safeUrl(alertObj.actionLink)}" target="_blank" rel="noopener noreferrer" style="display: block; width: 100%; background: linear-gradient(135deg, #FFD700, #C5A028); color: #000; text-align: center; padding: 12px; border-radius: 10px; font-weight: 900; margin-top: 15px; text-decoration: none; box-shadow: 0 4px 15px rgba(255, 215, 0, 0.2); transition: 0.3s;">عرض التفاصيل الآن <i class="fa-solid fa-arrow-left" style="margin-right: 5px;"></i></a>`;
        }

        const modalHtml = `
            <div id="advanced-alert-modal" class="modal-overlay active" style="z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);">
                <div class="sys-dialog-card" style="animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1); position: relative; max-width: 400px; width: 90%; background: #111a2b; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 25px;">
                    <div class="sys-dialog-header" style="text-align: center; margin-bottom: 15px;">
                        <div class="sys-dialog-icon" style="width: 50px; height: 50px; margin: 0 auto 15px; background: rgba(255, 215, 0, 0.15); color: #FFD700; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 1px solid #FFD700;">
                            <i class="fa-solid fa-bell"></i>
                        </div>
                        <h3 class="sys-dialog-title" style="color: #FFD700; font-size: 18px; font-weight: 900; margin: 0;">${escapeHtml(title)}</h3>
                    </div>
                    <div class="sys-dialog-msg" style="color: #f1f5f9; font-size: 14px; line-height: 1.6; text-align: center; white-space: pre-wrap;">${escapeHtml(message)}</div>
                    ${extraHtml}
                    <button id="close-advanced-alert" class="btn btn-ghost" style="width: 100%; margin-top: 20px; border: 1px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 10px; color: #94a3b8; font-weight: 800; cursor: pointer; background: transparent;">إغلاق النافذة</button>
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        getSys().sfx?.('success');

        const copyBtn = document.getElementById('adv-alert-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', function() {
                navigator.clipboard.writeText(this.dataset.code);
                this.innerHTML = '<i class="fa-solid fa-check"></i>'; 
                setTimeout(() => this.innerHTML = '<i class="fa-solid fa-copy"></i>', 2000);
            });
        }

        const closeBtn = document.getElementById('close-advanced-alert');
        closeBtn.addEventListener('click', () => {
            const modal = document.getElementById('advanced-alert-modal');
            modal.style.transition = '0.3s ease'; modal.style.opacity = '0'; modal.style.transform = 'scale(0.9)';
            if (DataManager.markSingleNotificationRead) DataManager.markSingleNotificationRead(alertObj.id, true, alertObj.maxViews);
            this.updateNotifBadges();
            setTimeout(() => { 
                modal.remove(); 
                if (remainingQueue.length > 0) { 
                    setTimeout(() => this.showAdvancedPopup(remainingQueue[0], remainingQueue.slice(1)), 500); 
                } 
            }, 300);
        });
    },  openNotifCenter: function() {
        if (!DataManager || !DataManager.user) {
            getSys().showToast?.('يجب تسجيل الدخول لعرض إشعاراتك', 'error');
            getSys().sfx?.('error');
            setTimeout(() => { window.location.replace('login.html'); }, 1500);
            return;
        }

        this.closeSidebar();
        if (RenderManager.renderNotifCenterList) RenderManager.renderNotifCenterList();
        
        const modal = document.getElementById('notif-center-modal');
        const overlay = document.getElementById('notif-center-overlay');
        
        if (modal) modal.classList.add('active'); 
        if (overlay) overlay.classList.add('active');
    },

    closeNotifCenter: function() {
        const modal = document.getElementById('notif-center-modal');
        const overlay = document.getElementById('notif-center-overlay');
        if (modal) modal.classList.remove('active'); if (overlay) overlay.classList.remove('active');
    },

    updateNotifBadges: function() {
        if (!DataManager.getUnreadAlerts) return;
        const unreadAlerts = DataManager.getUnreadAlerts();
        const count = unreadAlerts.length;

        const headerBadge = document.getElementById('header-notif-badge');
        const sidebarBadge = document.getElementById('sidebar-notif-badge');
        const displayCount = count > 99 ? '99+' : count.toString();

        if (count > 0) {
            if (headerBadge) { headerBadge.innerText = displayCount; headerBadge.classList.remove('hide-element'); }
            if (sidebarBadge) { sidebarBadge.innerText = displayCount; sidebarBadge.classList.remove('hide-element'); }
        } else {
            if (headerBadge) headerBadge.classList.add('hide-element');
            if (sidebarBadge) sidebarBadge.classList.add('hide-element');
        }
    },
markAllNotificationsRead: async function() {
    // ♻️ تم إصلاح اسم الدالة هنا
    if (!DataManager || typeof DataManager.markAllNotificationsRead !== 'function') return;
    
    // 1. تشغيل اللودر لمنع المستخدم من العبث أثناء الاتصال بقاعدة البيانات
    getSys().toggleLoader?.(true, 'جاري تحديث الإشعارات...');
    
    try {
        // 2. تحديث قاعدة البيانات (استدعاء الاسم الصحيح) ♻️
        await DataManager.markAllNotificationsRead();
        
        // 3. تشغيل تأثير النجاح
        getSys().sfx?.('success');
        
        // 4. تصفير العداد الأحمر في الهيدر والقائمة الجانبية
        this.updateNotifBadges();
        
        // 5. إعادة رسم قائمة الإشعارات لتظهر الحالة الفارغة الأنيقة
        if (RenderManager && typeof RenderManager.renderNotifCenterList === 'function') {
            RenderManager.renderNotifCenterList();
        }
    } catch (error) {
        console.error("Mark All Read Error:", error);
        getSys().showToast?.('حدث خطأ أثناء الاتصال، يرجى المحاولة لاحقاً', 'error');
    } finally {
        // 6. إغلاق اللودر دائماً
        getSys().toggleLoader?.(false);
    }
},    showNotification: function(msg, type = 'error') {
        const el = document.getElementById('custom-notification');
        if(!el) { this.showToast(msg, type); return; }
        el.classList.remove('active'); clearTimeout(this.notifTimer);
        setTimeout(() => {
            const icon = el.querySelector('.notif-icon'), title = el.querySelector('.notif-title'), message = el.querySelector('.notif-msg');
            if(message) message.textContent = msg; 
            if(title) title.textContent = type === 'error' ? 'تنبيه' : 'نجاح';
            el.className = ''; el.classList.add(type);
            if(icon) { icon.className = type === 'error' ? 'notif-icon fa-solid fa-circle-exclamation' : 'notif-icon fa-solid fa-circle-check'; }
            requestAnimationFrame(() => el.classList.add('active'));
            getSys().sfx?.(type === 'error' ? 'error' : 'success');
            this.notifTimer = setTimeout(() => { el.classList.remove('active'); }, 3000);
        }, 50);
    },

     showToast: function(msg, type = 'info') {
        if (type === 'info') {
            if (msg.includes('فشل') || msg.includes('خطأ') || msg.includes('عذراً') || msg.includes('كاف') || msg.includes('نفد')) type = 'error';
            else if (msg.includes('مراجعة') || msg.includes('انتظار') || msg.includes('قيد')) type = 'warning'; 
            else if (msg.includes('إزالة') || msg.includes('حذف') || msg.includes('إلغاء')) type = 'info'; 
            else if (msg.includes('تم') || msg.includes('نجاح') || msg.includes('شكراً')) type = 'success';
        }

        let container = document.querySelector('.custom-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'custom-toast-container';
            document.body.appendChild(container);
        } else {
            // 🛡️ [تحديث مانع التكرار Spam Preventer]: 
            // إذا كان آخر إشعار معروض يحمل نفس النص بالضبط، لا تكرره، فقط قم بعمل اهتزاز له!
            const lastToast = container.lastElementChild;
            if (lastToast) {
                const lastMsgEl = lastToast.querySelector('.toast-msg');
                if (lastMsgEl && lastMsgEl.innerText === Utils.escapeHtml(msg)) {
                    lastToast.style.animation = 'none';
                    void lastToast.offsetWidth; // إعادة تنشيط الـ DOM
                    lastToast.style.animation = 'shake-anim 0.3s ease-in-out'; // اهتزاز خفيف للفت الانتباه
                    return; // توقف هنا ولا تنشئ إشعاراً جديداً
                }
            }

            // السماح بتراكم 3 إشعارات (مختلفة) فقط
            if (container.children.length >= 3) {
                container.firstChild.style.animation = 'toastOutTop 0.2s forwards';
                setTimeout(() => { if (container.firstChild) container.firstChild.remove(); }, 200);
            }
        }

        const toast = document.createElement('div');
        toast.className = `custom-toast toast-${type}`;
        
        let iconClass = 'fa-circle-info', titleText = 'معلومة';
        if (type === 'success') { iconClass = 'fa-circle-check'; titleText = 'نجاح'; }
        if (type === 'error') { iconClass = 'fa-circle-xmark'; titleText = 'خطأ'; }
        if (type === 'warning') { iconClass = 'fa-triangle-exclamation'; titleText = 'تنبيه'; } 

        toast.innerHTML = `<i class="fa-solid ${iconClass}"></i><div class="toast-content"><span class="toast-title">${titleText}</span><span class="toast-msg">${Utils.escapeHtml(msg)}</span></div>`;
        
        container.appendChild(toast);
        getSys().sfx?.(type === 'error' ? 'error' : 'success');
        
        setTimeout(() => {
            if(toast.parentElement) {
                toast.style.animation = 'toastOutTop 0.4s forwards';
                setTimeout(() => toast.remove(), 400);
            }
        }, 3000);
    },
       sfx: function(type) {
        if(DataManager.prefs && DataManager.prefs.sound === false) return; 
        
        if (!navigator.userActivation || !navigator.userActivation.hasBeenActive) return;

        try {
            if(!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if(this.audioCtx.state === 'suspended') { this.audioCtx.resume().catch(() => {}); }
            
            const t = this.audioCtx.currentTime; 
            const osc = this.audioCtx.createOscillator(); 
            const gain = this.audioCtx.createGain();
            
            osc.connect(gain); 
            gain.connect(this.audioCtx.destination);
            
            if (type === 'nav') { osc.type='sine'; osc.frequency.setValueAtTime(1200,t); gain.gain.setValueAtTime(0.05,t); gain.gain.exponentialRampToValueAtTime(0.001,t+0.03); osc.start(t); osc.stop(t+0.03); } 
            else if (type === 'success') { osc.type='sine'; osc.frequency.setValueAtTime(400,t); osc.frequency.linearRampToValueAtTime(800,t+0.15); gain.gain.setValueAtTime(0.1,t); gain.gain.linearRampToValueAtTime(0.001,t+0.3); osc.start(t); osc.stop(t+0.3); } 
            else if (type === 'error') { osc.type='triangle'; osc.frequency.setValueAtTime(150,t); gain.gain.setValueAtTime(0.1,t); gain.gain.linearRampToValueAtTime(0.001,t+0.2); osc.start(t); osc.stop(t+0.2); }
        } catch(e) {}
        
        try {
            if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) {
                if (type === 'error') { navigator.vibrate([50, 50, 50]); } 
                else if (type === 'success') { navigator.vibrate(50); } 
                else { navigator.vibrate(20); }
            }
        } catch(e) {}
    },

    // =========================================================
    // ⚙️ 5. إعدادات المتجر العامة والهوية البصرية (General Setup)
    // =========================================================
    
    // 🛡️ دالة لتنظيف الـ CSS من الرموز الخبيثة (محصنة ضد حقن الدوال والألوان الخبيثة)
    _sanitizeCssValue: function(val) {
        if (!val) return '';
        const trimmed = val.trim();
        // السماح حصراً بصيغ الألوان الآمنة: (Hex, RGB, RGBA, HSL, HSLA) أو أسماء الألوان البسيطة
        const safeColorRegex = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s,\.%]+\)|hsla?\([\d\s,\.%deg]+\)|[a-zA-Z]+)$/;
        return safeColorRegex.test(trimmed) ? trimmed : 'var(--primary)';
    },

    applyStoreIdentity: function() {
        let sys = LiveStoreData.settings || {}; 
        if (Array.isArray(sys)) sys = sys[0] || {}; 

        const storeName = (sys.storeName || sys.name || '').trim();
        const logoSize = parseInt(sys.logoSize) || 36;
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

        const currentConfigHash = `${finalStoreName}_${logoDark}_${logoLight}_${logoSize}_${type}_${c1}_${c2}`;
        if (this._lastIdentityHash === currentConfigHash) return; 
        this._lastIdentityHash = currentConfigHash;

        const isEnglish = /^[A-Za-z0-9]/.test(storeName);

        document.title = `${finalStoreName} | المتجر`;
        if (favicon) {
            let link = document.querySelector("link[rel~='icon']");
            if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
            link.href = favicon;
        }

        let styleId = 'dynamic-brand-styles';
        let styleEl = document.getElementById(styleId);
        if(!styleEl) { 
            styleEl = document.createElement('style'); 
            styleEl.id = styleId; 
            document.head.appendChild(styleEl); 
        }
        
        let textStyles = `font-weight: ${weight}; font-size: ${Math.max(16, (logoSize * 0.55))}px; line-height: 1; margin: 0; padding: 0; transition: color 0.3s;`;
        
        if (type === 'gradient') { 
            textStyles += ` background: linear-gradient(90deg, ${c1}, ${c2}); -webkit-background-clip: text; -webkit-text-fill-color: transparent; color: transparent;`; 
            if (hasShadow) textStyles += ` filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));`; 
        } else { 
            textStyles += ` color: ${c1};`; 
            if (hasShadow) textStyles += ` text-shadow: 0 2px 8px ${c1}88;`; 
        }

        styleEl.innerHTML = `
            .brand-text-dynamic { ${textStyles} } 
            .brand-logo-dynamic { max-height: ${logoSize}px; width: auto; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15)); transition: transform 0.3s ease; display: block; transform-origin: right center; } 
            .store-logo-dark { display: block; } 
            .store-logo-light { display: none; } 
            body.light-mode .store-logo-dark { display: none; } 
            body.light-mode .store-logo-light { display: block; } 
            .brand-logo-dynamic:hover { transform: scale(1.05); }
        `;

        let logoHtml = '';
        if (logoDark || logoLight) {
            if (logoDark) logoHtml += `<img src="${Utils.escapeHtml(logoDark)}" onload="this.style.opacity='1'" style="opacity: 0; transition: opacity 0.4s ease-in-out;" alt="${Utils.escapeHtml(finalStoreName)}" class="brand-logo-dynamic store-logo-dark">`;
            if (logoLight) logoHtml += `<img src="${Utils.escapeHtml(logoLight)}" onload="this.style.opacity='1'" style="opacity: 0; transition: opacity 0.4s ease-in-out;" alt="${Utils.escapeHtml(finalStoreName)}" class="brand-logo-dynamic store-logo-light">`;
        }

        const nameHtml = `<div class="brand-text-dynamic">${Utils.safeText(finalStoreName)}</div>`;
        const finalHtml = `${logoHtml} ${nameHtml}`;

        const targets = ['store-branding-target', 'sidebar-branding-target'];
        targets.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = finalHtml;
                if (isEnglish) {
                    el.classList.add('is-en');
                    el.classList.remove('logo-ar');
                } else {
                    el.classList.remove('is-en');
                    el.classList.add('logo-ar');
                }
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
                
                if (displayState.userImage && DataManager.user && typeof DataManager.user === 'object') { 
                    DataManager.user = { ...DataManager.user, img: displayState.userImage }; 
                    if (typeof this.loadUserImageAutomatically === 'function') this.loadUserImageAutomatically(); 
                }
                
                if (displayState.theme && typeof this.setThemePref === 'function') { this.setThemePref(displayState.theme); }
                if (displayState.sound !== undefined && DataManager.prefs) { DataManager.prefs.sound = displayState.sound; }
                if (displayState.lastVisit) { 
                    const days = Math.floor((Date.now() - displayState.lastVisit) / (1000 * 60 * 60 * 24)); 
                    if (days > 7) { this.showToast('مرحباً بعودتك! تم تحديث الواجهة منذ آخر زيارة.'); } 
                }
            }
        } catch (e) {
            console.error('Error restoring display state:', e);
        }
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
    // 💰 تحديث الرصيد والإحصائيات ديناميكياً (Dynamic Stats Engine)
    // =========================================================
    updateDisplayBalance: function() {
        if (!DataManager.user) return; 

        const user = DataManager.user;
        const baseCurrency = user.baseCurrency || user.base_currency || 'USD';
        const displayCurrency = DataManager.selectedCurr || baseCurrency;        
        const rates = DataManager.getRates ? DataManager.getRates() : null;

        const rawBal = Number(user.walletBalance || 0);
        const rawSpent = Number(user.totalSpent || 0);
        const rawDep = Number(user.totalDeposit || 0);
        
        let displayBal = rawBal;
        let displaySpent = rawSpent;
        let displayDep = rawDep;

        if (displayCurrency !== baseCurrency && Utils.convertViaUSD) {
            displayBal = Utils.convertViaUSD(rawBal, baseCurrency, displayCurrency, rates, 'deposit');
            displaySpent = Utils.convertViaUSD(rawSpent, baseCurrency, displayCurrency, rates, 'pricing');
            displayDep = Utils.convertViaUSD(rawDep, baseCurrency, displayCurrency, rates, 'deposit');
        }
        
        const beautifulBalHtml = (RenderHelpers && typeof RenderHelpers.formatMoney === 'function') 
            ? RenderHelpers.formatMoney(displayBal, displayCurrency) 
            : `${Number(displayBal).toFixed(2)} ${displayCurrency}`;
            
        const currencyTxt = (RenderHelpers && typeof RenderHelpers.getCurrencySymbolText === 'function') 
            ? RenderHelpers.getCurrencySymbolText(displayCurrency) 
            : displayCurrency;
            
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
        if (sidebarBalBox) {
            sidebarBalBox.innerHTML = beautifulBalHtml;
        }

        const balMain = document.getElementById('wallet-balance-disp');
        if (balMain) {
            balMain.innerHTML = beautifulBalHtml;
        }

        this.updateDisplayCurrencyUI(displayCurrency);
    },

    initSlider: function() {
        const banners = LiveStoreData.banners || [];
        const settings = LiveStoreData.settings || {};
        
        const currentBannerHash = JSON.stringify(banners.map(b => b.img)) + (settings.sliderTransition || 'fade');
        if (this._lastBannerHash === currentBannerHash) return;
        this._lastBannerHash = currentBannerHash;

        if (this.sliderTimer) { clearInterval(this.sliderTimer); this.sliderTimer = null; }
        
        const container = document.getElementById('slider'); 
        if (!container || banners.length === 0) { if(container) container.innerHTML = ''; return; }
        
        container.innerHTML = '';
        const transition = settings.sliderTransition || 'fade';
        container.classList.add('slider'); 
        container.classList.remove('slider-fade', 'slider-slide', 'slider-slide-vertical', 'slider-zoom'); 
        container.classList.add(`slider-${transition}`);
        
        banners.forEach((b, i) => { 
            const div = document.createElement('div'); 
            div.className = `slide ${i === 0 ? 'active' : ''}`; 
            
            div.style.opacity = '0'; 
            div.style.transition = 'opacity 0.5s ease-in-out';
            
            const tempImg = new Image();
            tempImg.onload = () => {
                // 🚀 [إصلاح الشاشة السوداء]: تم إزالة escapeHtml لأن الـ CSS url() لا يدعم 
                // التشفير الذي يكسر روابط Firebase التي تحتوي على علامات & و =
                // نقوم بتشفير علامة الاقتباس إلى %27 لمنع انكسار الـ CSS
div.style.backgroundImage = `url('${b.img.replace(/'/g, "%27")}')`;
                div.style.opacity = '1'; 
            };
            tempImg.src = b.img;
            
            container.appendChild(div); 
        });
        
        let idx = 0; const slides = container.querySelectorAll('.slide');
        const intervalMs = (settings.sliderDuration ? Number(settings.sliderDuration) * 1000 : 3000) || 3000;
        
        this.sliderTimer = setInterval(() => {
            if (slides.length === 0 || !slides[0].isConnected) { clearInterval(this.sliderTimer); return; }
            slides[idx].classList.remove('active'); 
            idx = (idx + 1) % slides.length; 
            slides[idx].classList.add('active');
        }, intervalMs);
    },
    renderTicker: function() {
        const s = LiveStoreData.settings || {};
        const txtEl = document.getElementById('ticker-text');
        const movingLine = document.querySelector('.ticker-moving-line');
        
        if (txtEl) {
            txtEl.innerText = s.promoText || 'أهلاً وسهلاً بكم في متجرنا';
        }
        
        if (movingLine) {
            movingLine.className = 'ticker-moving-line'; 
            const animationValue = s.promoAnim || 'horizontal-normal';
            movingLine.classList.add(`ticker-anim-${animationValue}`);
        }
    },

    getFlagUrl: function(curr) {
        return RenderHelpers.getCurrencyFlagUrl(curr);
    },

    setFlagEl: function(el, curr) {
        if(!el) return;
        el.innerHTML = '';
        const flagUrl = this.getFlagUrl(curr);

        const img = document.createElement('img');
        img.className = 'ct-flag';
        img.alt = curr;
        img.src = flagUrl;
        
        img.onerror = () => { el.innerHTML = `<span class="ct-flag-emoji">🌍</span>`; };
        
        el.appendChild(img);
    },

    refreshCurrencyMenuFlags: function() {
        document.querySelectorAll('.ct-item').forEach(item => {
            const c = item.dataset.curr || item.getAttribute('data-curr');
            const box = item.querySelector('.ct-flag-box');
            this.setFlagEl(box, c);
        });
    },

    setDisplayCurrency: function(curr) {
        if (!DataManager.user) return; 
        DataManager.selectedCurr = curr || (DataManager.user.baseCurrency || 'USD');
        localStorage.setItem('telecard_display_currency', DataManager.selectedCurr);
        this.updateDisplayBalance();
        const pm = document.getElementById('purchase-modal');
        if(pm && pm.classList.contains('active') && this.currentProd) { getSys().updatePriceDisplay?.(); }
        this.updateDisplayCurrencyUI(DataManager.selectedCurr);
    },

    clearDisplayCurrencyTimer: function() { if(this.displayMenuTimer) { clearTimeout(this.displayMenuTimer); this.displayMenuTimer = null; } },
    
    toggleDisplayCurrencyMenu: function() {
        const menu = document.getElementById('ct-menu');
        if(!menu) return;
        if(menu.classList.contains('open')) { this.closeDisplayCurrencyMenu(); } 
        else { this.clearDisplayCurrencyTimer(); menu.classList.add('open'); this.displayMenuTimer = setTimeout(() => { this.closeDisplayCurrencyMenu(); }, 6000); }
    },
    
    closeDisplayCurrencyMenu: function() { this.clearDisplayCurrencyTimer(); const menu = document.getElementById('ct-menu'); if(menu) menu.classList.remove('open'); },
    
    selectDisplayCurrency: function(curr) { this.setDisplayCurrency(curr); this.updateDisplayCurrencyUI(curr); this.closeDisplayCurrencyMenu(); },

    renderDynamicCurrencyMenu: function() {
    const menu = document.getElementById('ct-menu');
    const nativeSel = document.getElementById('display-currency');
    
    if (!menu) return;
    
    const user = DataManager.user;
    const baseCurr = (user?.baseCurrency || user?.base_currency || 'USD').toUpperCase();
    
    // جلب العملات (قد تكون مصفوفة أو كائناً بناءً على إصدار المحرك المالي)
    const rawRates = typeof DataManager.getRates === 'function' ? DataManager.getRates() : [];
    
    const availableCodes = new Set();
    if (baseCurr && baseCurr.trim() !== "") {
        availableCodes.add(baseCurr);
    }
    
    // ✅ الإصلاح: تحويل الكائن إلى مصفوفة قيم إذا لزم الأمر لمعالجة كافة العملات
    const ratesArray = Array.isArray(rawRates) ? rawRates : Object.values(rawRates);
    
    if (ratesArray.length > 0) {
        ratesArray.forEach(r => {
            if (r && r.code && r.isActive !== false) {
                availableCodes.add(r.code.toUpperCase());
            }
        });
    }
    
    // ضمان وجود USD دائماً كخيار عرض احتياطي
    availableCodes.add('USD');
    
    const selected = (DataManager.selectedCurr || baseCurr || 'USD').toUpperCase();
    let menuHtml = '';
    let nativeHtml = '';
    
    availableCodes.forEach(code => {
        const isActive = code === selected ? 'active' : '';
        menuHtml += `
                    <div class="ct-item ${isActive}" data-curr="${code}">
                        <div class="ct-flag-box"></div>
                        <span class="ct-name">${code}</span>
                    </div>`;
        nativeHtml += `<option value="${code}" ${code === selected ? 'selected' : ''}>${code}</option>`;
    });
    
    menu.innerHTML = menuHtml;
    if (nativeSel) nativeSel.innerHTML = nativeHtml;
    
    this.refreshCurrencyMenuFlags();
    
    if (!menu.dataset.delegated) {
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.ct-item');
            if (item) {
                const code = item.dataset.curr;
                this.selectDisplayCurrency(code);
            }
        });
        menu.dataset.delegated = "true";
    }
},    updateDisplayCurrencyUI: function(curr) {
        const code = curr || 'USD';
        
        this.renderDynamicCurrencyMenu();

        const label = document.getElementById('ct-label'); 
        if(label && label.innerText !== code) label.innerText = code;
        
        const flagBox = document.getElementById('ct-flag-box'); 
        this.setFlagEl(flagBox, code);

        const nativeSel = document.getElementById('display-currency'); 
        if(nativeSel && nativeSel.value !== code) nativeSel.value = code;
        
        document.querySelectorAll('.ct-item').forEach(item => { 
            if(item.dataset.curr === code) item.classList.add('active'); 
            else item.classList.remove('active'); 
        });

        const ctWrapper = document.querySelector('.ct-wrapper');
        if (ctWrapper) {
            const settings = LiveStoreData.settings || {};
            if (settings.showCurrencyToggle === false) {
                ctWrapper.classList.add('hide-element');
                ctWrapper.style.display = 'none'; 
            } else {
                ctWrapper.classList.remove('hide-element');
                ctWrapper.style.display = ''; 
            }
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
                
                if(supportLink && supportLink.trim()) { 
                    newBtn.addEventListener('click', (e) => { 
                        e.stopPropagation(); getSys().sfx?.('nav'); this.openSupport(); 
                    }); 
                } else { 
                    newBtn.addEventListener('click', (e) => { e.stopPropagation(); }); 
                }
            }
        };
        processBtn('header-support-btn', 'header-support-icon', 'header-support-icon-wrapper');
        processBtn('sidebar-support-btn', 'sidebar-support-icon', 'sidebar-support-icon-wrapper');
    },

    openSupport: function() {
        const settings = LiveStoreData.settings || {};
        const supportLink = settings.supportLink;
        if(supportLink) { if(supportLink.startsWith('http')) { window.open(supportLink, '_blank'); } else { window.open(`https://wa.me/${supportLink.replace(/[^0-9]/g, '')}`, '_blank'); } }
    },
    
    updateSidebarText: function() {
        document.querySelectorAll('.cs-link').forEach(link => { if(link.innerText.includes('شحن الرصيد')) link.innerHTML = '<i class="fa-solid fa-circle-plus"></i> إيداع رصيد'; });
        const modalTitle = document.querySelector('#balance-modal .pm-title-badge'); if(modalTitle && modalTitle.innerText.includes('شحن')) modalTitle.innerText = 'إيداع رصيد';
    },

    activateSearch: function() {
        this.toggleHeroSection(false);
        const searchInput = document.getElementById('store-search-input');
        if(searchInput) { 
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
// تأخير الفوكس قليلاً حتى ينتهي انتقال الشاشة (Smooth Scroll)
searchInput.focus();        }
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
        
        const isMaint = (sys.maint === true || sys.maintenance === true);
        if (isMaint) {
            const msg = sys.msg || sys.maintenanceMsg || 'نحن نجري بعض التحسينات حالياً.';
            let dateHtml = '';
            if(sys.date) {
                const d = new Date(Number(sys.date)).toLocaleString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                dateHtml = `<div class="m-date"><i class="fa-regular fa-clock"></i> وقت العودة المتوقع: <span dir="ltr">${d}</span></div>`;
            }
            
            document.body.innerHTML = `
                <div class="maintenance-screen">
                    <div class="m-glass-box">
                        <i class="fa-solid fa-person-digging m-icon"></i>
                        <h1 class="m-title">المتجر في وضع الصيانة</h1>
                        <p class="m-desc">${Utils.escapeHtml(msg)}</p>
                        ${dateHtml}
                        <button id="maint-refresh-btn" class="btn btn-primary mt-20">تحديث الصفحة</button>
                    </div>
                </div>`;
                
            document.getElementById('maint-refresh-btn').addEventListener('click', () => location.reload());
            return true;
        }

        if (sys.freeze === true) {
            const freezeMsg = sys.freezeMsg || 'العمليات المالية متوقفة مؤقتاً للتحديث.';
            let freezeBanner = document.getElementById('system-freeze-banner');
            if (!freezeBanner) {
                freezeBanner = document.createElement('div');
                freezeBanner.id = 'system-freeze-banner';
                freezeBanner.className = 'freeze-notice-bar'; 
                freezeBanner.innerHTML = `<i class="fa-solid fa-snowflake fa-spin-slow"></i> <span>${Utils.escapeHtml(freezeMsg)}</span>`;
                document.body.prepend(freezeBanner);
            }
        } else {
            const existingBanner = document.getElementById('system-freeze-banner');
            if (existingBanner) existingBanner.remove();
        }

        return false;
    },

    checkBrowserCompatibility: function() {
        const features = { 'localStorage': typeof(Storage) !== "undefined", 'CSS Grid': CSS.supports('display', 'grid'), 'CSS Flexbox': CSS.supports('display', 'flex') };
        let compatibleFeatures = 0, totalFeatures = 0;
        for (const [feature, supported] of Object.entries(features)) { totalFeatures++; if (supported) compatibleFeatures++; }
        const rate = (compatibleFeatures / totalFeatures) * 100;
        if (rate < 80) console.warn('⚠️ متصفحك قد لا يدعم جميع الميزات بشكل كامل');
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
// ❤️ نظام المفضلة السحري (Magic Favorites System) - مُحدث
// =========================================================
toggleFavoriteFromModal: function() {
        if (!DataManager.currentProd) return;
        
        if (!DataManager.user) {
            getSys().showToast?.('يجب تسجيل الدخول لإضافة المنتجات للمفضلة', 'error');
            getSys().sfx?.('error');
            setTimeout(() => { window.location.replace('login.html'); }, 1500);
            return;
        }
        
        const productId = DataManager.currentProd.id;
        const wasFavorite = typeof DataManager.isFavorite === 'function' ? DataManager.isFavorite(productId) : false;
        
        if (typeof DataManager.toggleFavorite === 'function') {
            DataManager.toggleFavorite(productId);
        }
        
        const btn = document.getElementById('pm-fav-btn');
        if (btn) {
            const isFav = !wasFavorite;
            btn.classList.toggle('active', isFav);
            const icon = btn.querySelector('i');
            if (icon) icon.className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        }
        
        getSys().sfx?.('nav');
        if (wasFavorite) {
            getSys().showToast?.('تمت إزالة المنتج من المفضلة', 'info');
            
            // 🚀 [تحديث معماري]: إزالة الكارد بسلاسة إذا أزلنا المفضلة من داخل المودال أثناء تصفح صفحة المفضلة
            if (document.body.classList.contains('is-favorites')) {
                const card = document.querySelector(`.product-card[data-id="${productId}"]`);
                if (card) {
                    card.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';
                    setTimeout(() => {
                        card.remove();
                        const remainingCards = document.querySelectorAll('#store-grid .product-card');
                        if (remainingCards.length === 0 && RenderManager.renderFavorites) {
                            RenderManager.renderFavorites();
                        }
                    }, 300);
                }
            }
        } else {
            getSys().showToast?.('تمت إضافة المنتج إلى المفضلة', 'success');
        }
        
        if (typeof this.updateFavBadgeCount === 'function') this.updateFavBadgeCount();
    },
    
    triggerMagicFavorite: function(e, productId) {
        if (e) {
            e.preventDefault();
        }
        
        if (!DataManager || !DataManager.user) {
            getSys().showToast?.('يجب تسجيل الدخول لإضافة المنتجات للمفضلة', 'error');
            getSys().sfx?.('error');
            setTimeout(() => { window.location.replace('login.html'); }, 1500);
            return;
        }
        
        const wasFavorite = typeof DataManager.isFavorite === 'function' ? DataManager.isFavorite(productId) : false;
        if (typeof DataManager.toggleFavorite === 'function') {
            DataManager.toggleFavorite(productId);
        }
        
        const headerHeart = document.getElementById('sticky-fav-btn');
        const productCard = document.querySelector(`.product-card[data-id="${productId}"]`);
        const imgBox = productCard ? productCard.querySelector('.card-image') : null;
        
        if (wasFavorite) {
            getSys().showToast?.('تمت إزالة المنتج من المفضلة', 'info');
            getSys().sfx?.('nav');
            
            if (imgBox) {
                const popHeart = document.createElement('i');
                popHeart.className = 'fa-solid fa-heart-crack center-crack-heart';
                imgBox.appendChild(popHeart);
                setTimeout(() => popHeart.remove(), 800);
            }
            if (typeof this.updateFavBadgeCount === 'function') this.updateFavBadgeCount();
            
            // 🚀 [تحديث معماري]: تلاشي وإزالة الكارد فوراً وبسلاسة إذا كنا داخل صفحة المفضلة لمنع الحاجة للتحديث
            if (document.body.classList.contains('is-favorites') && productCard) {
                productCard.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                productCard.style.opacity = '0';
                productCard.style.transform = 'scale(0.8)';
                setTimeout(() => {
                    productCard.remove();
                    // إذا فرغت المفضلة، نعيد رسم الصفحة لعرض الحالة الفارغة الأنيقة (Empty State)
                    const remainingCards = document.querySelectorAll('#store-grid .product-card');
                    if (remainingCards.length === 0 && RenderManager.renderFavorites) {
                        RenderManager.renderFavorites();
                    }
                }, 300);
            }
            return;
        }
        
        getSys().showToast?.('تمت إضافة المنتج للمفضلة', 'success');
        getSys().sfx?.('success');
        
        let startX = window.innerWidth / 2;
        let startY = window.innerHeight / 2;
        
        if (imgBox) {
            const rect = imgBox.getBoundingClientRect();
            startX = rect.left + (rect.width / 2);
            startY = rect.top + (rect.height / 2);
            
            const popHeart = document.createElement('i');
            popHeart.className = 'fa-solid fa-heart center-pop-heart';
            imgBox.appendChild(popHeart);
            setTimeout(() => popHeart.remove(), 700);
        } else if (e && e.clientX) {
            startX = e.clientX;
            startY = e.clientY;
        }
        
        // 🚀 [الإصلاح البصري المتقدم]: حساب إحداثيات الهدف بذكاء لتجنب العناصر المخفية في تصميم الموبايل
        let endX = window.innerWidth / 2;
        let endY = 20;
        
        if (headerHeart) {
            const rect = headerHeart.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                endX = rect.left + (rect.width / 2);
                endY = rect.top + (rect.height / 2);
            }
        }
        
        const flyingHeart = document.createElement('i');
        flyingHeart.className = 'fa-solid fa-heart flying-magic-heart';
        flyingHeart.style.setProperty('--startX', `${startX}px`);
        flyingHeart.style.setProperty('--startY', `${startY}px`);
        flyingHeart.style.setProperty('--endX', `${endX}px`);
        flyingHeart.style.setProperty('--endY', `${endY}px`);
        document.body.appendChild(flyingHeart);
        
        setTimeout(() => {
            flyingHeart.remove();
            if (headerHeart && headerHeart.getBoundingClientRect().width > 0) {
                headerHeart.classList.add('pulse-catch');
                if (typeof this.updateFavBadgeCount === 'function') this.updateFavBadgeCount();
                setTimeout(() => headerHeart.classList.remove('pulse-catch'), 500);
            } else if (typeof this.updateFavBadgeCount === 'function') {
                this.updateFavBadgeCount();
            }
        }, 800);
    },    openCommunityModal: function() {
        this.closeSidebar();
        
        const target = document.getElementById('community-links-target');
        if (!target) return;
        
        const s = LiveStoreData.settings || {};
        
        const telegramChan = Utils.safeUrl(s.telegramChannel || s.telegramLink || '');
        const telegramGroup = Utils.safeUrl(s.telegramGroup || '');
        const whatsappGroup = Utils.safeUrl(s.whatsappGroup || '');
        const facebookPage = Utils.safeUrl(s.facebookPage || '');
        
        let html = '';
        
        if (telegramChan && telegramChan !== '#') {
            html += `
                    <a href="${telegramChan}" target="_blank" rel="noopener noreferrer" class="community-item-card" onclick="ClientSystem.sfx('nav')">
                        <div class="community-left">
                            <div class="community-icon" style="background: #24A1DE;"><i class="fa-brands fa-telegram"></i></div>
                            <div class="community-info">
                                <span class="community-name">قناتنا الرسمية على تلغرام</span>
                                <span class="community-desc">أحدث الأسعار، العروض، والمسابقات الحصرية أولاً بأول.</span>
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-left community-arrow"></i>
                    </a>`;
        }
        
        if (telegramGroup && telegramGroup !== '#') {
            html += `
                    <a href="${telegramGroup}" target="_blank" rel="noopener noreferrer" class="community-item-card" onclick="ClientSystem.sfx('nav')">
                        <div class="community-left">
                            <div class="community-icon" style="background: #229ED9;"><i class="fa-solid fa-users"></i></div>
                            <div class="community-info">
                                <span class="community-name">مجموعة مناقشات الأعضاء</span>
                                <span class="community-desc">تبادل الأفكار، والنقاشات الفورية مع عائلة المتجر.</span>
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-left community-arrow"></i>
                    </a>`;
        }
        
        if (whatsappGroup && whatsappGroup !== '#') {
            html += `
                    <a href="${whatsappGroup}" target="_blank" rel="noopener noreferrer" class="community-item-card" onclick="ClientSystem.sfx('nav')">
                        <div class="community-left">
                            <div class="community-icon" style="background: #25D366;"><i class="fa-brands fa-whatsapp"></i></div>
                            <div class="community-info">
                                <span class="community-name">مجموعتنا على واتساب</span>
                                <span class="community-desc">تحديثات سريعة ودعم مباشر متاح على مدار الساعة.</span>
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-left community-arrow"></i>
                    </a>`;
        }
        
        if (facebookPage && facebookPage !== '#') {
            html += `
                    <a href="${facebookPage}" target="_blank" rel="noopener noreferrer" class="community-item-card" onclick="ClientSystem.sfx('nav')">
                        <div class="community-left">
                            <div class="community-icon" style="background: #1877F2;"><i class="fa-brands fa-facebook-f"></i></div>
                            <div class="community-info">
                                <span class="community-name">صفحتنا على فيسبوك</span>
                                <span class="community-desc">تابع أخبارنا وتواصل معنا عبر منصة فيسبوك الرسمية.</span>
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-left community-arrow"></i>
                    </a>`;
        }
        
        if (!html) {
            html = `<div class="empty-state-v2"><i class="fa-solid fa-share-nodes"></i><h3>قريباً جداً</h3><p>تعمل الإدارة حالياً على تجهيز شبكات التواصل الاجتماعي الرسمية.</p></div>`;
        }
        
        target.innerHTML = html;
        this.openModal('community');
    },

    openRatingModal: function() {
        this.closeSidebar();
        
        this._currentRating = 0;
        const btn = document.getElementById('btnContinueRating');
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        }
        
        const feedbackInput = document.getElementById('ratingFeedbackInput');
        if (feedbackInput) feedbackInput.value = '';
        
        document.querySelectorAll('.rating-star').forEach(star => {
            star.className = 'fa-regular fa-star rating-star';
        });
        
        document.getElementById('rating-step-stars').style.display = 'block';
        document.getElementById('rating-step-feedback').style.display = 'none';
        document.getElementById('rating-step-share').style.display = 'none';
        
        this.openModal('rating');
    },
    
    selectRatingStar: function(val) {
        this._currentRating = val;
        getSys().sfx?.('nav');
        
        const stars = document.querySelectorAll('.rating-star');
        stars.forEach(star => {
            const starVal = parseInt(star.dataset.value || star.getAttribute('data-value'));
            if (starVal <= val) {
                star.className = 'fa-solid fa-star rating-star active';
            } else {
                star.className = 'fa-regular fa-star rating-star';
            }
        });
        
        const btn = document.getElementById('btnContinueRating');
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    },
    
    submitRatingStep: function() {
        getSys().sfx?.('nav');
        const rating = this._currentRating || 0;
        
        document.getElementById('rating-step-stars').style.display = 'none';
        
        if (rating <= 3) {
            document.getElementById('rating-step-feedback').style.display = 'block';
        } else {
            document.getElementById('rating-step-share').style.display = 'block';
        }
    },
    
    submitPrivateFeedback: async function() {
    const feedbackInput = document.getElementById('ratingFeedbackInput');
    // 🛡️ [تحديث UX]: نكتفي بتنظيف الفراغات فقط. Firebase يعالج حقن قواعد البيانات تلقائياً.
    // الحماية الحقيقية من XSS ستكون وقت العرض في لوحة الإدارة باستخدام escapeHtml.
    const feedback = feedbackInput ? feedbackInput.value.trim() : '';
    
    if (!feedback) {
        getSys().showToast?.("يرجى كتابة تفاصيل مقترحك أو شكواك لمساعدتنا على خدمتك", "warning");
        return;
    }
    
    const btn = document.getElementById('btnSubmitFeedback');
    btn.textContent = "جاري الإرسال...";
    btn.disabled = true;
    
    try {
        const uid = DataManager.user?.id || localStorage.getItem('telecard_active_user_uid') || 'guest';
        const username = DataManager.user?.username || 'ضيف';
        
        await StoreDB.add(DB_KEYS.FEEDBACKS, {
            userId: uid,
            username: username,
            rating: this._currentRating || 0,
            feedback: feedback,
            time: Date.now()
        });
        
        getSys().toggleLoader?.(false);
        getSys().closeModal?.('rating');
        getSys().showToast?.("نشكرك جداً على مقترحك الصادق! تم إرساله للإدارة لمراجعته وحل مشكلتك فوراً.", "success");
        getSys().sfx?.('success');
        
    } catch (error) {
        btn.textContent = "إرسال للإدارة";
        btn.disabled = false;
        console.error("Feedback Submission Error:", error);
        getSys().showToast?.("حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.", "error");
    }
},
    openAboutModal: function() {
        this.closeSidebar(); 
        
        const logoTarget = document.getElementById('about-logo-box');
        const titleEl = document.getElementById('about-popup-title');
        const descEl = document.getElementById('about-popup-desc');
        
        if (!logoTarget || !titleEl || !descEl) return;
        
        const s = LiveStoreData.settings || {};
        const storeName = s.storeName || s.name || 'تيليكارد';
        
        const aboutText = s.aboutUs || s.storeDesc || 'بوابتك الأولى والآمنة لشراء وتداول الكروت الرقمية وبطاقات الشحن لجميع الألعاب والخدمات العالمية كالبلايستيشن، والبطاقات الترفيهية بأسعار مذهلة وتسليم آلي فوري.';
        const logoDark = s.storeLogo || s.logo || '';
        
        if (logoDark) {
            logoTarget.innerHTML = `
                    <div class="alert-icon-box" style="width: 75px; height: 75px; background: rgba(255,215,0,0.05); border: 1px solid var(--gold-main); border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; box-shadow: 0 0 15px rgba(255, 215, 0, 0.15);">
                        <img src="${Utils.escapeHtml(logoDark)}" alt="${Utils.escapeHtml(storeName)}" style="max-height: 48px; width: auto; object-fit: contain;">
                    </div>`;
        } else {
            logoTarget.innerHTML = `
                    <div class="alert-icon-box">
                        <i class="fa-solid fa-circle-info" style="font-size: 24px;"></i>
                    </div>`;
        }
        
        titleEl.innerHTML = `عن <span class="brand-text-dynamic num-en" style="font-size: 22px !important; display: inline-block;">${Utils.escapeHtml(storeName)}</span>`;
        descEl.textContent = aboutText;
        
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
