// ============================================================================
// ⚙️ وحدة الأساسيات والنواة (uiCore.js) - ES6 Module
// 🎯 الوظيفة: النوافذ، الإشعارات، القائمة الجانبية، النسخ، الثيم، والتوجيه العام
// 🚀 التحديث: تطبيق مبدأ DRY بشكل صارم وتوحيد دورة حياة إغلاق النوافذ
// ============================================================================

import { DB_KEYS } from '../config.js';           
import { Utils } from '../utils.js';             
import { DataManager, LiveStoreData } from '../dataManager.js'; 
import { RenderManager } from '../renderManager.js'; 
import { Components } from '../components.js';     
import { RenderHelpers } from '../core/renderHelpers.js'; 

export const UICore = {
    activeModals: [],
    displayMenuTimer: null,
    audioCtx: null,
    navHistory: [],
    currentCategoryId: null,
    historyStateSet: false,

    // =========================================================
    // 🌗 1. دوال الثيم والهوية البصرية (Theme & Identity)
    // =========================================================
    toggleTheme: function() {
        const isLightMode = document.body.classList.toggle('light-mode');
        const icon = document.getElementById('theme-toggle-icon');
        if (icon) icon.className = isLightMode ? 'fa-solid fa-moon' : 'sun-dots-icon';
        localStorage.setItem('telecard_theme', isLightMode ? 'light' : 'dark');
        if(typeof this.sfx === 'function') this.sfx('nav');
    },

    applySavedTheme: function() {
        const savedTheme = localStorage.getItem('telecard_theme');
        const icon = document.getElementById('theme-toggle-icon');
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
            if (icon) icon.className = 'fa-solid fa-moon';
        } else {
            document.body.classList.remove('light-mode');
            if (icon) icon.className = 'sun-dots-icon';
        }
    },

    // 🌟 توحيد استخراج اسم المستخدم (DRY Principle)
        // 🌟 توحيد استخراج اسم المستخدم (مع احترام أولوية الهوية الموثقة)
    _getFullName: function(user) {
        const u = user || DataManager.user || {}; 

        // 🌟 الإصلاح الجذري: فحص حالة (KYC) الحقيقية وليس توثيق الهاتف
        const isKycApproved = (u.kycStatus === 'approved' || u.kycStatus === 'verified');

        if (isKycApproved) {
            const verifiedName = u.fullName || (u.kycData && u.kycData.fullName) || '';
            if (verifiedName.trim()) return verifiedName.trim();
        }

        const f = u.firstName || u.first_name || u.name || '';
        const l = u.lastName || u.last_name || u.familyName || '';
        const combined = (f + ' ' + l).trim();
        
        if (combined) return combined;
        if (u.fullName && u.fullName.trim()) return u.fullName;
        if (u.username) return `@${u.username}`;
        
        return 'العميل';
    },
    // 🌟 استدعاء الدالة الموحدة لمنع تكرار الشروط
        _getTxNameWithID: function(user) {
        const u = user || DataManager.user || {}; 
        const namePart = u.username ? `@${u.username}` : this._getFullName(u);
        const displayId = u.displayId || (u.id ? u.id.substring(0, 6) : '---');

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
        }

        if (modalId === 'kyc-upload') {
            if (typeof this.prepareKycModalState === 'function') {
                this.prepareKycModalState();
            }
        }
    },

    closeModal: function(modalId) {
        if (!modalId) { if(typeof this.closePurchaseModal === 'function') this.closePurchaseModal(); return; }
        const overlay = document.getElementById(`${modalId}-overlay`);
        const modal = document.getElementById(`${modalId}-modal`);
        
        if (modal) {
            modal.classList.remove('active');
            // 🌟 الإصلاح: نقل إعادة ضبط التمرير هنا ليعمل أينما تم إغلاق النافذة وليس فقط في resetUI
            setTimeout(() => {
                modal.scrollTop = 0;
                const innerScrolls = modal.querySelectorAll('.pm-scroll-content, .scrollable, .modal-content, .profile-container, .profile-pass-body, [id$="-list"]');
                innerScrolls.forEach(s => s.scrollTop = 0);
            }, 350);
        }
        
        if (overlay) overlay.classList.remove('active');
        
        if (this.activeModals && Array.isArray(this.activeModals)) {
            this.activeModals = this.activeModals.filter(id => id !== modalId);
            // يتم إرجاع التمرير للشاشة الرئيسية فقط إذا لم يكن هناك نوافذ أخرى أو قائمة مفتوحة
            if (this.activeModals.length === 0 && !document.querySelector('.sidebar.active')) {
                document.body.classList.remove('no-scroll');
            }
        }
    },

    closeAllModals: function() {
        if (this.activeModals && Array.isArray(this.activeModals)) { 
            [...this.activeModals].forEach(id => this.closeModal(id)); 
        }
    },

    // 🚀 الإصلاح الجذري: تطبيق DRY والاعتماد على دورة حياة النوافذ الحقيقية
    resetUI: function() {
        const sidebar = document.querySelector('.sidebar') || document.getElementById('cs-menu');
        const sidebarOverlay = document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-overlay');
        
        if (sidebar) sidebar.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');

        // الاعتماد المباشر على دالة إغلاق النوافذ (مصدر واحد للحقيقة) بدلاً من تكرار الكود
        this.closeAllModals();

        // إغلاق القوائم المنسدلة والعناصر الفرعية
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

        if (walletArrow) { 
            walletArrow.classList.remove('open'); 
        }
        
        const searchInputs = ['store-search-input', 'order-search-input', 'wallet-search-input', 'pay-search-input'];
        searchInputs.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

        // التحقق الذكي قبل تفعيل التمرير للصفحة
        if (!document.querySelector('.sidebar.active') && this.activeModals.length === 0) {
            document.body.classList.remove('no-scroll');
        }
    },

    resetGridScroll: function() {
        window.scrollTo(0, 0);
        const grid = document.getElementById('store-grid');
        if (grid) { grid.scrollTop = 0; let parent = grid.parentElement; while (parent && parent.tagName !== 'HTML') { parent.scrollTop = 0; parent = parent.parentElement; } }
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
        if(typeof this.closeSidebar === 'function') this.closeSidebar();
        const settings = LiveStoreData.settings || {};
        const termsContent = document.getElementById('store-terms-content');
        if (termsContent) termsContent.innerText = settings.terms || 'لا توجد شروط وأحكام مسجلة حالياً.';
        this.openModal('terms');
    },

    // =========================================================
    // 🚀 3. التوجيه (Routing) والقائمة الجانبية (Sidebar)
    // =========================================================
    openSidebar: function() { 
        this.resetUI();
        if(DataManager.syncUser) DataManager.syncUser(); 
        
        if(typeof this.updateProfileDisplay === 'function') this.updateProfileDisplay();
        if(typeof this.updateDisplayBalance === 'function') this.updateDisplayBalance();

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
        if(typeof this.saveDisplayState === 'function') this.saveDisplayState();
    },

    closeSidebar: function() { 
        const menu = document.querySelector('.sidebar') || document.getElementById('cs-menu');
        const overlay = document.getElementById('cs-overlay') || document.getElementById('sidebarOverlay') || document.querySelector('.sidebar-overlay');
        
        // التحقق الذكي قبل الإزالة
        if (this.activeModals.length === 0) {
            document.body.classList.remove('no-scroll');
        }

        if(menu) { menu.classList.remove('active'); menu.style.transform = ''; }
        if(overlay) overlay.classList.remove('active'); 
        this.removeSidebarClickOutsideDetector();
        if(typeof this.saveDisplayState === 'function') this.saveDisplayState();
    },

    bindSidebarProfileTriggers: function() {
        const avatarEl = document.getElementById('cs-avatar');
        const nameEl = document.getElementById('cs-name');
        const handleProfileClick = (e) => { e.preventDefault(); e.stopPropagation(); if(typeof this.openProfileInfo === 'function') this.openProfileInfo(); if(typeof this.sfx === 'function') this.sfx('nav'); };

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
            const isClickOnHamburger = event.target.closest('.hamburger') || event.target.closest('[onclick*="openSidebar"]');
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
            const isClickOnHamburger = event.target.closest('.hamburger') || event.target.closest('[onclick*="openSidebar"]');
            if (!isClickInsideSidebar && !isClickOnHamburger) {
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
                this.closeSidebar();
            }
        };
        setTimeout(() => { document.addEventListener('click', this._mainContentClickHandler, true); }, 100);
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
        const removeListeners = () => { document.removeEventListener('touchmove', onTouchMove); document.removeEventListener('touchend', onTouchEnd); isDragging = false; isSwipeConfirmed = false; };

        const onTouchStart = (e) => {
            if (e.target.closest('.slider-container, .scrollable-area')) return;
            startX = e.touches[0].clientX; startY = e.touches[0].clientY;
            initialOpenState = menu.classList.contains('active');
            const isValidStart = initialOpenState || (!initialOpenState && startX > (window.innerWidth - edgeZone));
            if (!isValidStart) return;

            menu.style.willChange = 'transform'; if(overlay) overlay.style.willChange = 'opacity';
            isDragging = true; isSwipeConfirmed = false; startTime = Date.now();
            
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onTouchEnd, { passive: true });
        };

        const onTouchMove = (e) => {
            if (!isDragging) return;
            const diffX = e.touches[0].clientX - startX; const diffY = e.touches[0].clientY - startY;

            if (!isSwipeConfirmed) {
                if (Math.sqrt(diffX ** 2 + diffY ** 2) < 10) return;
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
            const diffX = e.changedTouches[0].clientX - startX;
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

    navigateHome: function() { this.closeSidebar(); if(RenderManager.renderHome) RenderManager.renderHome(); },
            openFavorites: function() { 
        // 🛑 حماية الجدار للضيوف (تطرد الضيف فوراً لصفحة الدخول)
        if (!DataManager || !DataManager.user) {
            if(typeof this.showToast === 'function') this.showToast('يجب تسجيل الدخول لعرض مفضلتك', 'error');
            if(typeof this.sfx === 'function') this.sfx('error');
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            return;
        }
        this.closeSidebar(); 
        this.resetUI(); 
        this.currentCategoryId = null;
        if(RenderManager.renderFavorites) RenderManager.renderFavorites(); 
    },

    navigateBalance: function() { this.closeSidebar(); if(typeof this.openAddBalance === 'function') this.openAddBalance(); },
    navigateMyPayments: function() { this.closeSidebar(); if(typeof this.openMyPayments === 'function') this.openMyPayments(); },
    navigateOrders: function() { this.closeSidebar(); if(typeof this.openOrders === 'function') this.openOrders(); },
    navigateWallet: function() { this.closeSidebar(); if(typeof this.openWallet === 'function') this.openWallet(); },
    navigateSettings: function() { this.closeSidebar(); if(typeof this.openSettings === 'function') this.openSettings(); },

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
            } else {
                storiesBar.innerHTML = ''; 
                storiesBar.style.display = 'none';
            }

            grid.innerHTML = '';
            this.setGridMode('grid-prods');
            
            if (RenderManager.renderProductSkeletons) {
                RenderManager.renderProductSkeletons('store-grid', 8);
            }
        }

        setTimeout(() => {
            if (RenderManager.renderOfferStories) {
                RenderManager.renderOfferStories(id);
            }
            if(RenderManager._renderContent) {
                RenderManager._renderContent(id);
            }
            if (Components && Components.initProductShine) {
                Components.initProductShine();
            }
        }, 1500); 
    },
    
    _manualGoBack: function() {
        if (this.navHistory.length === 0) { if(RenderManager.renderHome) RenderManager.renderHome(true); return; }
        const prevId = this.navHistory.pop();
        if (prevId === 'HOME' || prevId === null) { if(RenderManager.renderHome) RenderManager.renderHome(true); } 
        else { this.currentCategoryId = prevId; if(RenderManager._renderContent) RenderManager._renderContent(prevId); }
    },
    openOrders: function() { 
        // 🛑 حماية الجدار للضيوف
        if (!DataManager || !DataManager.user) {
            if(typeof this.showToast === 'function') this.showToast('يجب تسجيل الدخول لعرض طلباتك', 'error');
            if(typeof this.sfx === 'function') this.sfx('error');
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            return;
        }
        this.resetUI();
        if(typeof this.setFilterDefaults === 'function') this.setFilterDefaults('order');
        if(RenderManager.renderOrders) RenderManager.renderOrders(); 
        setTimeout(() => { this.openModal('orders'); }, 10);
    },

    openWallet: function() { 
        // 🛑 حماية الجدار للضيوف
        if (!DataManager || !DataManager.user) {
            if(typeof this.showToast === 'function') this.showToast('يجب تسجيل الدخول لعرض محفظتك', 'error');
            if(typeof this.sfx === 'function') this.sfx('error');
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            return;
        }
        this.resetUI();
        if(typeof this.setFilterDefaults === 'function') this.setFilterDefaults('wallet'); 
        if(typeof this.updateDisplayBalance === 'function') this.updateDisplayBalance();
        if(RenderManager.renderWallet) RenderManager.renderWallet(); 
        setTimeout(() => { this.openModal('wallet'); }, 10);
    },

    openMyPayments: function() { 
        // 🛑 حماية الجدار للضيوف
        if (!DataManager || !DataManager.user) {
            if(typeof this.showToast === 'function') this.showToast('يجب تسجيل الدخول لعرض سجل الدفعات', 'error');
            if(typeof this.sfx === 'function') this.sfx('error');
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            return;
        }
        this.resetUI();
        if(typeof this.setFilterDefaults === 'function') this.setFilterDefaults('payments');
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
        if (statsDrawer) statsDrawer.classList.remove('active'); 
        if (arrowBtn) arrowBtn.classList.remove('open'); 
        this._closeAndResetTabs('wallet', 'wallet', '#wallet-tabs .mf-tab');
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

    // =========================================================
    // 📋 4. العمليات المشتركة والإشعارات (Utilities & Alerts)
    // =========================================================
    copyToClipboard: function(text, element, type = 'default') {
        if(typeof this.sfx === 'function') this.sfx('nav'); 
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
                }, 1500); 
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

    showAdminDirectMessage: function(msgText) {
        if (document.getElementById('admin-direct-msg-popup')) return;
        const safeMsg = Utils.escapeHtml(msgText);
        const html = `<div id="admin-direct-msg-popup" class="sys-dialog-wrapper"><div class="sys-dialog-overlay"></div><div class="sys-dialog-card"><div class="sys-dialog-header"><div class="sys-dialog-icon"><i class="fa-solid fa-envelope-open-text fa-bounce"></i></div><h3 class="sys-dialog-title">رسالة إدارية هامة</h3></div><div class="sys-dialog-msg-container"><p class="sys-dialog-msg">${safeMsg}</p></div><div class="sys-dialog-actions"><button class="sys-dialog-btn" onclick="ClientSystem.ackAdminMessage(); document.getElementById('admin-direct-msg-popup').remove();">قرأت ذلك، شكراً</button></div></div></div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        if(typeof this.sfx === 'function') this.sfx('success');
    },

    processAndDisplayAlerts: function() {
        if (!DataManager.getUnreadAlerts) return;
        const unreadAlerts = DataManager.getUnreadAlerts();
        if (!unreadAlerts || unreadAlerts.length === 0) return;

        const popupsQueue = unreadAlerts.filter(msg => msg.type === 'popup' || msg.isPopup);
        const toastsQueue = unreadAlerts.filter(msg => msg.type === 'notification' || !msg.isPopup);

        const shownToastsKey = 'telecard_shown_toasts';
        const shownToasts = JSON.parse(localStorage.getItem(shownToastsKey) || "[]");
        
        const newToasts = toastsQueue.filter(msg => !shownToasts.includes(String(msg.id)));

        newToasts.forEach((msg, index) => {
            setTimeout(() => {
                this.showNotification(msg.title || 'إشعار جديد', 'info');
                shownToasts.push(String(msg.id));
                localStorage.setItem(shownToastsKey, JSON.stringify(shownToasts));
            }, index * 2000); 
        });

        if (popupsQueue.length > 0) {
            if (!document.getElementById('advanced-alert-modal')) { this.showAdvancedPopup(popupsQueue[0], popupsQueue.slice(1)); }
        }
    },

    showAdvancedPopup: function(alertObj, remainingQueue) {
        const title = alertObj.title || 'إشعار هام';
        const message = alertObj.message || '';
        const escapeHtml = Utils.escapeHtml;
        let extraHtml = '';
        
        if (alertObj.couponCode) {
            extraHtml += `<div class="mt-15" style="background: rgba(168, 85, 247, 0.1); border: 1px dashed #a855f7; padding: 12px; border-radius: 12px; text-align: center;"><div style="font-size: 11px; color: #a855f7; margin-bottom: 6px; font-weight: bold;">🎁 كود خصم حصري لك:</div><div style="display: flex; gap: 8px; justify-content: center; align-items: center;"><span class="num-en" style="font-size: 18px; font-weight: 900; color: #fff; letter-spacing: 2px;">${escapeHtml(alertObj.couponCode)}</span><button onclick="navigator.clipboard.writeText('${escapeHtml(alertObj.couponCode)}'); this.innerHTML='<i class=\\'fa-solid fa-check\\'></i>'; setTimeout(()=>this.innerHTML='<i class=\\'fa-solid fa-copy\\'></i>',2000);" style="background: #a855f7; border: none; color: #fff; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;"><i class="fa-solid fa-copy"></i></button></div></div>`;
        }

        if (alertObj.actionLink) {
            extraHtml += `<a href="${escapeHtml(alertObj.actionLink)}" target="_blank" style="display: block; width: 100%; background: linear-gradient(135deg, #FFD700, #C5A028); color: #000; text-align: center; padding: 12px; border-radius: 10px; font-weight: 900; margin-top: 15px; text-decoration: none; box-shadow: 0 4px 15px rgba(255, 215, 0, 0.2); transition: 0.3s;">عرض التفاصيل الآن <i class="fa-solid fa-arrow-left" style="margin-right: 5px;"></i></a>`;
        }

        const modalHtml = `<div id="advanced-alert-modal" class="modal-overlay active" style="z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);"><div class="sys-dialog-card" style="animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1); position: relative; max-width: 400px; width: 90%; background: #111a2b; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 25px;"><div class="sys-dialog-header" style="text-align: center; margin-bottom: 15px;"><div class="sys-dialog-icon" style="width: 50px; height: 50px; margin: 0 auto 15px; background: rgba(255, 215, 0, 0.15); color: #FFD700; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 1px solid #FFD700;"><i class="fa-solid fa-bell"></i></div><h3 class="sys-dialog-title" style="color: #FFD700; font-size: 18px; font-weight: 900; margin: 0;">${escapeHtml(title)}</h3></div><div class="sys-dialog-msg" style="color: #f1f5f9; font-size: 14px; line-height: 1.6; text-align: center; white-space: pre-wrap;">${escapeHtml(message)}</div>${extraHtml}<button id="close-advanced-alert" class="btn btn-ghost" style="width: 100%; margin-top: 20px; border: 1px solid rgba(255,255,255,0.1); padding: 12px; border-radius: 10px; color: #94a3b8; font-weight: 800; cursor: pointer; background: transparent;">إغلاق النافذة</button></div></div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if(typeof this.sfx === 'function') this.sfx('success');

        const closeBtn = document.getElementById('close-advanced-alert');
        closeBtn.onclick = () => {
            const modal = document.getElementById('advanced-alert-modal');
            modal.style.transition = '0.3s ease'; modal.style.opacity = '0'; modal.style.transform = 'scale(0.9)';
            if (DataManager.markAlertAsRead) DataManager.markAlertAsRead(alertObj.id, true, alertObj.maxViews);
            this.updateNotifBadges();
            setTimeout(() => { modal.remove(); if (remainingQueue.length > 0) { setTimeout(() => this.showAdvancedPopup(remainingQueue[0], remainingQueue.slice(1)), 500); } }, 300);
        };
    },

        openNotifCenter: function() {
        // 🛑 حماية الجدار للضيوف (تطرد الضيف فوراً لصفحة الدخول)
        if (!DataManager || !DataManager.user) {
            if(typeof this.showToast === 'function') this.showToast('يجب تسجيل الدخول لعرض إشعاراتك', 'error');
            if(typeof this.sfx === 'function') this.sfx('error');
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
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

    showNotification: function(msg, type = 'error') {
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
            if(typeof this.sfx === 'function') this.sfx(type === 'error' ? 'error' : 'success');
            this.notifTimer = setTimeout(() => { el.classList.remove('active'); }, 3000);
        }, 50);
    },

        showToast: function(msg, type = 'info') {
        // التحليل الذكي للنصوص (Auto-detect)
        if (type === 'info') {
            if (msg.includes('فشل') || msg.includes('خطأ') || msg.includes('عذراً') || msg.includes('تنبيه') || msg.includes('كاف')) type = 'error';
            if (msg.includes('تم') || msg.includes('نجاح') || msg.includes('شكراً')) type = 'success';
            if (msg.includes('مراجعة') || msg.includes('انتظار')) type = 'warning'; // 👈 إضافة ذكية للتحذيرات
        }

        const oldToast = document.getElementById('toast-warning');
        if (oldToast) oldToast.style.display = 'none';

        const notifEl = document.getElementById('custom-notification');
        
        if (notifEl) {
            notifEl.classList.remove('active', 'success', 'error', 'info', 'warning'); // 👈 أضفنا warning للتنظيف
            clearTimeout(this.notifTimer);
            void notifEl.offsetWidth; 

            setTimeout(() => {
                const icon = notifEl.querySelector('.notif-icon');
                const title = notifEl.querySelector('.notif-title');
                const message = notifEl.querySelector('.notif-msg');
                
                if (message) message.textContent = msg; 
                if (title) {
                    if (type === 'error') title.textContent = 'خطأ';
                    else if (type === 'warning') title.textContent = 'تنبيه'; // 👈 تسمية التحذير
                    else if (type === 'success') title.textContent = 'نجاح';
                    else title.textContent = 'معلومة';
                }
                
                notifEl.classList.add(type);
                
                if (icon) { 
                    if (type === 'error') icon.className = 'notif-icon fa-solid fa-circle-xmark';
                    else if (type === 'warning') icon.className = 'notif-icon fa-solid fa-triangle-exclamation'; // 👈 أيقونة التحذير
                    else if (type === 'success') icon.className = 'notif-icon fa-solid fa-circle-check';
                    else icon.className = 'notif-icon fa-solid fa-circle-info';
                }
                
                notifEl.classList.add('active');
                if(typeof this.sfx === 'function') this.sfx(type === 'error' ? 'error' : 'success');
                
                this.notifTimer = setTimeout(() => { notifEl.classList.remove('active'); }, 3000);
            }, 10);
        } else {
            // نظام التوست الاحتياطي (Fallback)
            let container = document.querySelector('.custom-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.className = 'custom-toast-container';
                document.body.appendChild(container);
            }

            container.innerHTML = '';

            const toast = document.createElement('div');
            toast.className = `custom-toast toast-${type}`;
            
            let iconClass = 'fa-circle-info';
            let titleText = 'معلومة';
            if (type === 'success') { iconClass = 'fa-circle-check'; titleText = 'نجاح'; }
            if (type === 'error') { iconClass = 'fa-circle-xmark'; titleText = 'خطأ'; }
            if (type === 'warning') { iconClass = 'fa-triangle-exclamation'; titleText = 'تنبيه'; } // 👈 إضافة التحذير للتوست الاحتياطي

            toast.innerHTML = `
                <i class="fa-solid ${iconClass}"></i>
                <div class="toast-content">
                    <span class="toast-title">${titleText}</span>
                    <span class="toast-msg">${msg}</span>
                </div>
            `;
            
            container.appendChild(toast);
            if(typeof this.sfx === 'function') this.sfx(type === 'error' ? 'error' : 'success');
            
            setTimeout(() => {
                if(toast.parentElement) {
                    toast.style.animation = 'toastOutTop 0.4s forwards';
                    setTimeout(() => toast.remove(), 400);
                }
            }, 3000);
        }
    },
   sfx: function(type) {
        if(DataManager.prefs && DataManager.prefs.sound === false) return; 
        try {
            if(!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if(this.audioCtx.state === 'suspended') { this.audioCtx.resume().catch(() => {}); }
            const t = this.audioCtx.currentTime; const osc = this.audioCtx.createOscillator(); const gain = this.audioCtx.createGain();
            osc.connect(gain); gain.connect(this.audioCtx.destination);
            if (type === 'nav') { osc.type='sine'; osc.frequency.setValueAtTime(1200,t); gain.gain.setValueAtTime(0.05,t); gain.gain.exponentialRampToValueAtTime(0.001,t+0.03); osc.start(t); osc.stop(t+0.03); } 
            else if (type === 'success') { osc.type='sine'; osc.frequency.setValueAtTime(400,t); osc.frequency.linearRampToValueAtTime(800,t+0.15); gain.gain.setValueAtTime(0.1,t); gain.gain.linearRampToValueAtTime(0.001,t+0.3); osc.start(t); osc.stop(t+0.3); } 
            else if (type === 'error') { osc.type='triangle'; osc.frequency.setValueAtTime(150,t); gain.gain.setValueAtTime(0.1,t); gain.gain.linearRampToValueAtTime(0.001,t+0.2); osc.start(t); osc.stop(t+0.2); }
        } catch(e) {}
        try {
            if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) {
                if (type === 'error') { navigator.vibrate([50, 50, 50]); } else if (type === 'success') { navigator.vibrate(50); } else { navigator.vibrate(20); }
            }
        } catch(e) {}
    },
    // =========================================================
    // ⚙️ 5. إعدادات المتجر العامة (General Setup)
    // =========================================================
    applyStoreIdentity: function() {
        // 🌟 الإصلاح الجذري: قراءة الهوية من كائن system كما يحفظها الآدمن
        const sys = LiveStoreData.system || {}; 
        
        const storeName = (sys.storeName || sys.name || '').trim();
        const logoSize = parseInt(sys.logoSize) || 36;
        const weight = sys.nameWeight || '900';
        const type = sys.nameColorType || 'solid';
        const c1 = sys.nameColor1 || '#ffffff';
        const c2 = sys.nameColor2 || '#FFD700';
        const hasShadow = sys.nameShadow === true || sys.nameShadow === 'true';
        
        const logoDark = sys.storeLogo || sys.logo || '';
        const logoLight = sys.storeLogoLight || sys.logo_light || logoDark; 
        const favicon = sys.storeFavicon || sys.favicon || '';

        const isEnglish = /^[A-Za-z0-9]/.test(storeName);

        // إذا كان الاسم فارغاً، نستخدم كلمة 'المتجر' كبديل مؤقت
        const finalStoreName = storeName || 'المتجر';

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
            if (logoDark) logoHtml += `<img src="${logoDark}" alt="${Utils.escapeHtml(finalStoreName)}" class="brand-logo-dynamic store-logo-dark">`;
            if (logoLight) logoHtml += `<img src="${logoLight}" alt="${Utils.escapeHtml(finalStoreName)}" class="brand-logo-dynamic store-logo-light">`;
        }

        const nameHtml = `<div class="brand-text-dynamic">${Utils.safeText(finalStoreName)}</div>`;
        
        // 🌟 الترتيب: اللوغو ثم الاسم
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
                if (displayState.userImage && DataManager.user) { DataManager.user.img = displayState.userImage; if(typeof this.loadUserImageAutomatically === 'function') this.loadUserImageAutomatically(); }
                if (displayState.theme && typeof this.setThemePref === 'function') { this.setThemePref(displayState.theme); }
                if (displayState.sound !== undefined && DataManager.prefs) { DataManager.prefs.sound = displayState.sound; }
                if (displayState.lastVisit) { const days = Math.floor((Date.now() - displayState.lastVisit) / (1000 * 60 * 60 * 24)); if (days > 7) { this.showToast('مرحباً بعودتك! تم تحديث الواجهة منذ آخر زيارة.'); } }
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
        
        // 🌟 الإصلاح: فحص الكائن بطريقة ES6 الصحيحة (RenderHelpers موجود دائماً لأنه تم استدعاؤه)
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
        if (this.sliderTimer) { clearInterval(this.sliderTimer); this.sliderTimer = null; }
        const banners = LiveStoreData.banners || [];
        const settings = LiveStoreData.settings || {};
        const container = document.getElementById('slider'); 
        if (!container || banners.length === 0) { if(container) container.innerHTML = ''; return; }
        
        container.innerHTML = '';
        const transition = settings.sliderTransition || 'fade';
        container.classList.add('slider'); container.classList.remove('slider-fade', 'slider-slide', 'slider-slide-vertical', 'slider-zoom'); container.classList.add(`slider-${transition}`);
        
        banners.forEach((b, i) => { const div = document.createElement('div'); div.className = `slide ${i === 0 ? 'active' : ''}`; div.style.backgroundImage = `url('${b.img}')`; container.appendChild(div); });
        let idx = 0; const slides = container.querySelectorAll('.slide');
        const intervalMs = (settings.sliderDuration ? Number(settings.sliderDuration) * 1000 : 3000) || 3000;
        
        this.sliderTimer = setInterval(() => {
            if (slides.length === 0 || !slides[0].isConnected) { clearInterval(this.sliderTimer); return; }
            slides[idx].classList.remove('active'); idx = (idx + 1) % slides.length; slides[idx].classList.add('active');
        }, intervalMs);
    },

        // =========================================================
    // 📢 المترجم الموحد للشريط الإخباري (النسخة المطابقة لقاعدة البيانات)
    // =========================================================
    renderTicker: function() {
        const s = LiveStoreData.settings || {};
        const txtEl = document.getElementById('ticker-text');
        const movingLine = document.querySelector('.ticker-moving-line');
        
        // 1. حقن النص (المتغير في الملف هو promoText)
        if (txtEl) {
            txtEl.innerText = s.promoText || 'أهلاً وسهلاً بكم في متجرنا';
        }
        
        if (movingLine) {
            // 2. تنظيف كافة كلاسات الأنيميشن القديمة قبل الإضافة
            // نحن هنا نمسح أي كلاس يبدأ بـ ticker-anim- لضمان النظافة
            movingLine.className = 'ticker-moving-line'; 
            
            // 3. جلب القيمة من قاعدة البيانات (promoAnim)
            // المتوقع أن تكون: horizontal-fast, vertical-slow, إلخ.
            const animationValue = s.promoAnim || 'horizontal-normal';
            
            // 4. دمج البادئة مع القيمة لتطابق كلاسات ملف style.css
            // النتيجة النهائية: ticker-anim-horizontal-fast
            movingLine.classList.add(`ticker-anim-${animationValue}`);
        }
    },

    getFlagUrl: function(curr) {
        const code = (curr || 'USD').toUpperCase();
        const countries = LiveStoreData.countries || [];
        const country = countries.find(c => String(c.id).toUpperCase() === code || (c.currency && String(c.currency).toUpperCase() === code));
        
        if (country && country.flagEmoji) {
            return country.flagEmoji; 
        }

        const map = {
            USD: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 741 390'%3E%3Crect width='741' height='390' fill='%23b22234'/%3E%3Cg fill='%23fff'%3E%3Crect y='30' width='741' height='30'/%3E%3Crect y='90' width='741' height='30'/%3E%3Crect y='150' width='741' height='30'/%3E%3Crect y='210' width='741' height='30'/%3E%3Crect y='270' width='741' height='30'/%3E%3Crect y='330' width='741' height='30'/%3E%3C/g%3E%3Crect width='296' height='210' fill='%230b3d91'/%3E%3Cg fill='%23fff' transform='translate(30 21)'%3E%3Cpath id='s' d='M10 0l3.09 9.51h9.99l-8.08 5.87 3.09 9.51-8.1-5.88-8.1 5.88 3.09-9.51-8.08-5.87h9.99z'/%3E%3Cg id='row6'%3E%3Cuse href='%23s'/%3E%3Cuse href='%23s' x='49'/%3E%3Cuse href='%23s' x='98'/%3E%3Cuse href='%23s' x='147'/%3E%3Cuse href='%23s' x='196'/%3E%3Cuse href='%23s' x='245'/%3E%3C/g%3E%3Cg id='row5'%3E%3Cuse href='%23s' x='24.5'/%3E%3Cuse href='%23s' x='73.5'/%3E%3Cuse href='%23s' x='122.5'/%3E%3Cuse href='%23s' x='171.5'/%3E%3Cuse href='%23s' x='220.5'/%3E%3C/g%3E%3Cuse href='%23row6' y='0'/%3E%3Cuse href='%23row5' y='21'/%3E%3Cuse href='%23row6' y='42'/%3E%3Cuse href='%23row5' y='63'/%3E%3Cuse href='%23row6' y='84'/%3E%3Cuse href='%23row5' y='105'/%3E%3Cuse href='%23row6' y='126'/%3E%3Cuse href='%23row5' y='147'/%3E%3Cuse href='%23row6' y='168'/%3E%3C/g%3E%3C/svg%3E",
            TRY: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 600'%3E%3Crect width='900' height='600' fill='%23e30a17'/%3E%3Ccircle cx='360' cy='300' r='180' fill='%23fff'/%3E%3Ccircle cx='405' cy='300' r='135' fill='%23e30a17'/%3E%3Cpath fill='%23fff' d='M0-1L0.2245-0.309L0.9511-0.309L0.3633 0.118L0.5878 0.809L0 0.3819L-0.5878 0.809L-0.3633 0.118L-0.9511-0.309L-0.2245-0.309Z' transform='translate(540 300) scale(70)'/%3E%3C/svg%3E",
            SYP: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 600'%3E%3Crect width='900' height='600' fill='%23000000'/%3E%3Crect width='900' height='400' fill='%23ffffff'/%3E%3Crect width='900' height='200' fill='%23007a3d'/%3E%3Cg fill='%23ce1126'%3E%3Cpath d='M0-1L0.2245-0.309L0.9511-0.309L0.3633 0.118L0.5878 0.809L0 0.3819L-0.5878 0.809L-0.3633 0.118L-0.9511-0.309L-0.2245-0.309Z' transform='translate(225 300) scale(70)'/%3E%3Cpath d='M0-1L0.2245-0.309L0.9511-0.309L0.3633 0.118L0.5878 0.809L0 0.3819L-0.5878 0.809L-0.3633 0.118L-0.9511-0.309L-0.2245-0.309Z' transform='translate(450 300) scale(70)'/%3E%3Cpath d='M0-1L0.2245-0.309L0.9511-0.309L0.3633 0.118L0.5878 0.809L0 0.3819L-0.5878 0.809L-0.3633 0.118L-0.9511-0.309L-0.2245-0.309Z' transform='translate(675 300) scale(70)'/%3E%3C/g%3E%3C/svg%3E"
        };

        return map[code] || "🌍";
    },

    setFlagEl: function(el, curr) {
        if(!el) return;
        el.innerHTML = '';
        const flagData = this.getFlagUrl(curr);
        const isImageUrl = flagData.startsWith('data:image') || flagData.startsWith('http');

        if (isImageUrl) {
            const img = document.createElement('img');
            img.className = 'ct-flag';
            img.alt = curr;
            img.src = flagData;
            img.onerror = () => { el.innerHTML = `<span class="ct-flag-emoji">🌍</span>`; };
            el.appendChild(img);
        } else {
            const span = document.createElement('span');
            span.className = 'ct-flag-emoji';
            span.innerText = flagData;
            el.appendChild(span);
        }
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
        if(pm && pm.classList.contains('active') && this.currentProd) { if(typeof this.updatePriceDisplay === 'function') this.updatePriceDisplay(); }
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
        if (!menu) return;

        const user = DataManager.user;
        const baseCurr = (user?.baseCurrency || user?.base_currency || 'USD').toUpperCase();
        const rates = typeof DataManager.getRates === 'function' ? DataManager.getRates() : [];
        const availableCodes = new Set();
        
        availableCodes.add(baseCurr); 
        if (Array.isArray(rates)) {
            rates.forEach(r => { if(r.code) availableCodes.add(r.code.toUpperCase()); });
        }

        const selected = DataManager.selectedCurr || baseCurr;
        let menuHtml = '';
        
        availableCodes.forEach(code => {
            const isActive = code === selected ? 'active' : '';
            menuHtml += `
                <div class="ct-item ${isActive}" data-curr="${code}" onclick="ClientSystem.selectDisplayCurrency('${code}')">
                    <div class="ct-flag-box"></div>
                    <span class="ct-name">${code}</span>
                </div>`;
        });

        menu.innerHTML = menuHtml;
        this.refreshCurrencyMenuFlags();
    },

    updateDisplayCurrencyUI: function(curr) {
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
            } else {
                ctWrapper.classList.remove('hide-element');
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
                if(supportLink && supportLink.trim()) { btn.onclick = (e) => { e.stopPropagation(); if(typeof this.sfx === 'function') this.sfx('nav'); this.openSupport(); }; } 
                else { btn.onclick = (e) => { e.stopPropagation(); }; }
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
        if(searchInput) { searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => searchInput.focus(), 300); }
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
                        <button class="btn btn-primary mt-20" onclick="location.reload()">تحديث الصفحة</button>
                    </div>
                </div>`;
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
    }
};
