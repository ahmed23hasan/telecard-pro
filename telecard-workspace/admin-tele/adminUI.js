// ============================================================================
// 🎨 واجهة التوجيه المركزية للـ UI (adminUI.js) - Facade Pattern
// 🎯 الوظيفة: نقطة عبور (Router) لربط دوال الواجهة بوحدات النظام المعزولة
// ============================================================================

import { UIService } from './core/uiService.js';
import { CalendarService } from './core/calendarService.js';
import { EventBus } from './adminUtils.js';

// استيراد الوحدات الفرعية المعزولة
import { OrdersUI } from './modules/orders/ordersUI.js';
import { UsersUI } from './modules/users/usersUI.js';
import { FinanceUI } from './modules/finance/financeUI.js';
import { MarketingUI } from './modules/marketing/marketingUI.js';
import { CatalogUI } from './modules/catalog/catalogUI.js';

export const AdminUI = {
    // 🌟 1. كشف الوحدات الفرعية للمايسترو (Sub-modules Exposure)
    UsersUI,
    OrdersUI,
    FinanceUI,
    MarketingUI,
    CatalogUI,
    
    // 🌟 2. الجسور المفقودة للحالات (State Bridges)
    get tempImg() { return UIService.tempImg; },
    set tempImg(v) { UIService.tempImg = v; },
    
    get dragEditMode() { return CatalogUI.dragEditMode; },
    set dragEditMode(v) { CatalogUI.dragEditMode = v; },
    
    get currentDepositId() { return FinanceUI.currentDepositId; },
    get currentOrderId() { return OrdersUI.currentOrderId; },
    
    // =========================================================
    // 🛠️ 3. النواة المرئية العامة والنوافذ (Core UI Utilities)
    // =========================================================
    initTheme: () => UIService.initTheme(),
    toggleTheme: () => UIService.toggleTheme(),
    showToast: (...args) => UIService.showToast(...args),
    showConfirm: (...args) => UIService.showConfirm(...args),
    showPrompt: (...args) => UIService.showPrompt(...args),
    copyText: (...args) => UIService.copyText(...args),
    copyToClipboard: (...args) => UIService.copyToClipboard(...args),
    toggleLoader: (...args) => UIService.toggleLoader(...args),
    openModal: (id) => UIService.openModal(id),
    closeModal: (id) => UIService.closeModal(id),
    toggleSidebar: () => UIService.toggleSidebar(),
    closeSidebar: () => UIService.closeSidebar(),
    onResize: () => UIService.onResize(),
    openImageViewer: (...args) => UIService.openImageViewer(...args),
    closeImageViewer: () => UIService.closeImageViewer(),
    clearImg: (...args) => UIService.clearImg(...args),
    handleImageUpload: (...args) => UIService.handleImageUpload(...args),
    processImage: (...args) => UIService.processImage(...args),
    
    // =========================================================
    // 🔄 4. تحديثات النظام العامة (System Views & States)
    // =========================================================
    clearAllSearchAndFiltersUI: function() {
        document.querySelectorAll('input[id^="search-"], input[id="user-search"]').forEach(input => { if (input) input.value = ''; });
        document.querySelectorAll('[id^="date-start-"], [id^="date-end-"]').forEach(el => { if (el) el.innerText = 'DD/MM/YYYY'; });
        
        EventBus.emit('req-clear-render-filters');
        
        document.querySelectorAll('.main-tabs-header').forEach(container => {
            container.scrollLeft = 0;
            if (container.scrollWidth > 0) container.scrollLeft = container.scrollWidth;
            const btns = container.querySelectorAll('.main-tab-btn');
            if (btns.length > 0) { 
                btns.forEach(b => b.classList.remove('active')); 
                btns[0].classList.add('active'); 
            }
        });
    },

    updateQuickDateUI: function(start, end, section) {
        const formatDisp = (d) => d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : 'DD/MM/YYYY';
        const startEl = document.getElementById(`date-start-${section}`); 
        const endEl = document.getElementById(`date-end-${section}`);
        
        if (startEl) { 
            startEl.innerText = formatDisp(start); 
            if (start) { startEl.classList.remove('placeholder-text'); startEl.closest('.custom-field')?.classList.add('active'); } 
            else { startEl.classList.add('placeholder-text'); startEl.closest('.custom-field')?.classList.remove('active'); } 
        }
        if (endEl) { 
            endEl.innerText = formatDisp(end); 
            if (end) { endEl.classList.remove('placeholder-text'); endEl.closest('.custom-field')?.classList.add('active'); } 
            else { endEl.classList.add('placeholder-text'); endEl.closest('.custom-field')?.classList.remove('active'); } 
        }
    },

    switchSystemView: function(id) {
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        const activeSection = document.getElementById('view-' + id);
        if (activeSection) activeSection.classList.add('active');
        
        const workspace = document.querySelector('.workspace');
        if (workspace) workspace.scrollTo({ top: 0, behavior: 'instant' }); 

        const sidebarItem = document.querySelector(`.nav-item[data-target="${id}"]`);
        const pageTitle = document.getElementById('page-title');

        if (sidebarItem) {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            sidebarItem.classList.add('active');
            if (pageTitle) {
                const tempClone = sidebarItem.cloneNode(true);
                tempClone.querySelector('.badge-count')?.remove(); 
                tempClone.querySelector('.sidebar-kyc-badge')?.remove(); 
                pageTitle.innerText = tempClone.innerText.trim();
            }
        } else if (pageTitle && id === 'dash') {
            pageTitle.innerText = 'لوحة القيادة';
        }
    },

    setupSettingsViews: function(id, data) {
        const safeSetVal = (elId, val) => { const elem = document.getElementById(elId); if (elem) elem.value = val; };
        
        if (id === 'rates') { 
            safeSetVal('setting-curr-display', data?.settings?.currencyDisplay || 'symbol'); 
            const currToggle = document.getElementById('setting-show-currency');
            if (currToggle) currToggle.checked = data?.settings?.showCurrencyToggle !== false; 
        }
        else if (id === 'tiers') {
            safeSetVal('setting-tier-paused-msg', data?.settings?.tierPausedMsg || '');
        }
        else if (id === 'ads') {
            const s = data?.settings || {};
            const sys = data?.system || {}; 
            
            safeSetVal('promo-text', s.promoText || ''); 
            safeSetVal('slider-time', s.sliderDuration || 3); 
            safeSetVal('promo-speed', s.promoAnim || 'vertical-normal');
            safeSetVal('store-name-input', sys.storeName || ''); 
            safeSetVal('store-logo-size', sys.logoSize || 36);
            
            const lsv = document.getElementById('logo-size-val'); 
            if (lsv) lsv.innerText = (sys.logoSize || 36) + 'px';
            
            safeSetVal('store-name-weight', sys.nameWeight || '900'); 
            safeSetVal('store-color-type', sys.nameColorType || 'solid');
            safeSetVal('store-color-1', sys.nameColor1 || '#ffffff'); 
            safeSetVal('store-color-2', sys.nameColor2 || '#FFD700');
            
            const shadowEl = document.getElementById('store-name-shadow'); 
            if (shadowEl) shadowEl.checked = sys.nameShadow || false;
            
            const setImgPreview = (imgId, src) => {
                const preview = document.getElementById(`${imgId}-preview`), wrap = document.getElementById(`${imgId}-wrap`);
                if (src && preview && wrap) { 
                    preview.src = src; 
                    preview.classList.remove('hide-element'); 
                    wrap.classList.add('has-img'); 
                } else { 
                    this.clearImg(`${imgId}-preview`, `${imgId}-wrap`, `${imgId}-input`); 
                }
            };
            
            setImgPreview('store-logo', sys.storeLogo); 
            setImgPreview('store-logo-light', sys.storeLogoLight); 
            setImgPreview('store-favicon', sys.storeFavicon);
            
            this.toggleColorType();
            this.updateBrandPreview();
            EventBus.emit('req-render-banners');
        }
        else if (id === 'sys') {
            const s = data?.system || {};
            const sysToggle = document.getElementById('sys-maint-toggle');
            const sysDateTxt = document.getElementById('date-maint-sys');
            const freezeToggle = document.getElementById('sys-freeze-toggle');
            
            if (sysToggle) sysToggle.checked = s.maint || false;
            safeSetVal('sys-maint-msg', s.msg || '');
            safeSetVal('sys-maint', s.date || '');
            
            if (sysDateTxt) { 
                if (s.date) { 
                    sysDateTxt.innerText = new Date(Number(s.date)).toLocaleDateString('en-GB'); 
                    sysDateTxt.classList.remove('placeholder-text'); 
                    sysDateTxt.closest('.custom-field')?.classList.add('active'); 
                } else { 
                    sysDateTxt.innerText = 'DD/MM/YYYY HH:MM'; 
                    sysDateTxt.classList.add('placeholder-text'); 
                    sysDateTxt.closest('.custom-field')?.classList.remove('active'); 
                } 
            }
            
            if (freezeToggle) freezeToggle.checked = s.freeze || false;
            safeSetVal('sys-freeze-msg', s.freezeMsg || '');
        }
        else if (id === 'terms') { 
            safeSetVal('setting-terms-text', data?.settings?.terms || ''); 
        }
    },

    // =========================================================
    // 🌉 5. جسور العبور لوحدات النظام (Routing Bridges)
    // =========================================================
    
    // 📦 وحدة الطلبات
    openOrderDrawer: (id) => OrdersUI.openOrderDrawer(id),
    closeOrderDrawer: () => OrdersUI.closeOrderDrawer(),
    
    // 💳 وحدة المالية
    toggleCurrencySettings: (id) => FinanceUI.toggleCurrencySettings(id),
    openDepositDrawer: (id) => FinanceUI.openDepositDrawer(id),
    closeDepositDrawer: () => FinanceUI.closeDepositDrawer(),
    
    // 👥 وحدة المستخدمين والتوثيق
    openTierEdit: (id) => UsersUI.openTierEdit(id),
    selectTierBadge: (el, icon) => UsersUI.selectTierBadge(el, icon),
    toggleDefaultTierSecure: (cb) => UsersUI.toggleDefaultTierSecure(cb),
    openTierUsers: (id) => UsersUI.openTierUsers(id),
    backToTiers: () => UsersUI.backToTiers(),
    showTierSelection: (id) => UsersUI.showTierSelection(id),
    selectTierOption: (el) => UsersUI.selectTierOption(el),
    closeTierSelection: () => UsersUI.closeTierSelection(),
    openUserEditModal: (id) => UsersUI.openUserEditModal(id),
    closeUserEditModal: () => UsersUI.closeUserEditModal(),
    updateKycMode: (mode) => UsersUI.updateKycMode(mode),
    toggleKycForTier: (id, checked) => UsersUI.toggleKycForTier(id, checked),
    saveKycSettings: () => UsersUI.saveKycSettings(),
    handleKycAction: (id, action) => UsersUI.handleKycAction(id, action),
    
    // 📢 وحدة التسويق والعروض
    switchPromoTab: (tab, btn) => MarketingUI.switchPromoTab(tab, btn),
    toggleOfferFields: () => MarketingUI.toggleOfferFields(),
    switchBuilderTab: (tab, e) => MarketingUI.switchBuilderTab(tab, e),
    toggleStoryBuilder: () => MarketingUI.toggleStoryBuilder(),
    setGridColor: (btn) => MarketingUI.setGridColor(btn),
    setGridStyle: (t, v, btn) => MarketingUI.setGridStyle(t, v, btn),
    setGridPos: (t, btn) => MarketingUI.setGridPos(t, btn),
    updateStoryConfig: (t, v, btn) => MarketingUI.updateStoryConfig(t, v, btn),
    resetVisualBuilder: () => MarketingUI.resetVisualBuilder(),
    
    // 🛒 وحدة المنتجات، الأقسام، صناديق الأكواد والدول
    toggleDragEditMode: (e) => CatalogUI.toggleDragEditMode(e),
    toggleMockEdit: (n) => CatalogUI.toggleMockEdit(n),
    selectIcon: (el) => CatalogUI.selectIcon(el),
    selectAnimation: (el) => CatalogUI.selectAnimation(el),
    toggleTreeNode: (el) => CatalogUI.toggleTreeNode(el),
    handleTreeParentCheck: (cb) => CatalogUI.handleTreeParentCheck(cb),
    handleTreeChildCheck: (cb) => CatalogUI.handleTreeChildCheck(cb),
    
    setupCategoryModal: (cat, isSubCat) => CatalogUI.setupCategoryModal(cat, isSubCat),
    setupProductModal: (p, vaultData) => CatalogUI.setupProductModal(p, vaultData),
    setupCountryModal: (country) => CatalogUI.setupCountryModal(country),
    setupVaultModal: (pool) => CatalogUI.setupVaultModal(pool),
    
    // =========================================================
    // 🛠️ 6. أدوات النظام والمعاينات (System Utils & Previews)
    // =========================================================
    
    detectCountryAutoFill: function(inputVal) {
        const val = inputVal.trim().toLowerCase();
        if (!val) return;
        const smartCountriesDB = [
            { id: "SA", nameAr: "السعودية", flag: "🇸🇦", dial: "+966", len: 9, keys: ["سعودي", "السعودية", "ksa", "saudi"] },
            { id: "SY", nameAr: "سوريا", flag: "🇸🇾", dial: "+963", len: 9, keys: ["سوري", "سوريا", "syria"] },
            { id: "TR", nameAr: "تركيا", flag: "🇹🇷", dial: "+90", len: 10, keys: ["تركي", "تركيا", "turkey"] },
            { id: "EG", nameAr: "مصر", flag: "🇪🇬", dial: "+20", len: 10, keys: ["مصر", "egypt"] },
            { id: "AE", nameAr: "الإمارات", flag: "🇦🇪", dial: "+971", len: 9, keys: ["امارات", "uae"] },
            { id: "KW", nameAr: "الكويت", flag: "🇰🇼", dial: "+965", len: 8, keys: ["كويت", "kuwait"] }
        ];
        const match = smartCountriesDB.find(c => c.keys.some(k => val.includes(k)));
        if (match) {
            const codeEl = document.getElementById('country-code');
            const flagEl = document.getElementById('country-flag');
            const dialEl = document.getElementById('country-dial');
            if (codeEl && !codeEl.value) codeEl.value = match.id;
            if (flagEl && !flagEl.value) flagEl.value = match.flag;
            if (dialEl && !dialEl.value) dialEl.value = match.dial;
        }
    },
    
    // 🔔 إعدادات حقول الإشعارات (Popups)
    toggleAlertTypeFields: function() {
        const type = document.getElementById('alert-type')?.value;
        const advFields = document.getElementById('popup-advanced-fields');
        if (advFields) {
            if (type === 'popup') advFields.classList.remove('hide-element');
            else advFields.classList.add('hide-element');
        }
    },

    toggleAlertAdvancedFields: function() {
        const el = document.getElementById('popup-advanced-fields');
        if (el) el.classList.toggle('hide-element');
    },
    
    toggleAlertTargetFields: function() {
        const type = document.getElementById('alert-target-type')?.value;
        const tBox = document.getElementById('alert-target-tier-box');
        const uBox = document.getElementById('alert-target-user-box');
        if (tBox) tBox.classList.toggle('hide-element', type !== 'tier');
        if (uBox) uBox.classList.toggle('hide-element', type !== 'user');
    },
scrollToAlerts: function() {
    // 1. التأكد أولاً أننا في لوحة القيادة (Dashboard)
    const dashView = document.getElementById('view-dash');
    if (!dashView.classList.contains('active')) {
        // إذا لم نكن في الداتشبورد، ننتقل إليها أولاً
        EventBus.emit('req-navigate', { page: 'dash' });
    }
    
    // 2. التمرير إلى صندوق التنبيهات
    const alertsBox = document.getElementById('dash-smart-alerts');
    if (alertsBox) {
        alertsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // إضافة وميض بسيط لجذب الانتباه (اختياري)
        alertsBox.classList.add('highlight-pulse');
        setTimeout(() => alertsBox.classList.remove('highlight-pulse'), 2000);
    }
},
    // 🎨 دوال المعاينة الحية للهوية البصرية 
    toggleColorType: function() { 
        const type = document.getElementById('store-color-type')?.value; 
        const color2 = document.getElementById('store-color-2'); 
        if (color2) { 
            if (type === 'gradient') color2.classList.remove('hide-element'); 
            else color2.classList.add('hide-element'); 
        } 
    },

    updateBrandPreview: function() {
        const nameInput = document.getElementById('store-name-input'); 
        const name = nameInput ? (nameInput.value || 'اسم المتجر') : 'اسم المتجر';
        const logoSize = document.getElementById('store-logo-size')?.value || 36; 
        const weight = document.getElementById('store-name-weight')?.value || '900'; 
        const type = document.getElementById('store-color-type')?.value || 'solid';
        const c1 = document.getElementById('store-color-1')?.value || '#ffffff'; 
        const c2 = document.getElementById('store-color-2')?.value || '#FFD700'; 
        const hasShadow = document.getElementById('store-name-shadow')?.checked || false;
        
        const logoImg = document.getElementById('live-logo-img'); 
        const nameText = document.getElementById('live-name-text');
        const wrap = document.getElementById('store-logo-wrap'); 
        const imgSrc = (wrap && wrap.classList.contains('has-img')) ? document.getElementById('store-logo-preview')?.src : '';
        
        if (logoImg) { 
            if (imgSrc) { 
                logoImg.src = imgSrc; 
                logoImg.style.display = 'block'; 
                logoImg.style.maxHeight = logoSize + 'px'; 
            } 
            else { logoImg.style.display = 'none'; } 
        }
        
        if (nameText) {
            nameText.innerText = name; 
            nameText.style.fontWeight = weight; 
            nameText.style.fontSize = Math.max(16, (logoSize * 0.6)) + 'px'; 
            if (type === 'gradient') { 
                nameText.style.background = `linear-gradient(90deg, ${c1}, ${c2})`; 
                nameText.style.webkitBackgroundClip = 'text'; 
                nameText.style.webkitTextFillColor = 'transparent'; 
                nameText.style.color = 'transparent'; 
            } else { 
                nameText.style.background = 'none'; 
                nameText.style.webkitTextFillColor = 'initial'; 
                nameText.style.color = c1; 
            }
            nameText.style.filter = hasShadow ? (type === 'gradient' ? `drop-shadow(0 2px 4px rgba(0,0,0,0.5))` : `drop-shadow(0 0 8px ${c1}66)`) : 'none';
        }
    }
};

export const AdminCalendar = CalendarService;