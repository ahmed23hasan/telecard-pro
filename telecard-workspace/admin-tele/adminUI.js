// ============================================================================
// 🎨 واجهة التوجيه المركزية للـ UI (adminUI.js) - Facade Pattern V15.1 💎
// 🎯 الوظيفة: نقطة عبور (Router) لربط دوال الواجهة بوحدات النظام المعزولة
// 🌟 التحديثات (V15.1): إغلاق ثغرة XSS وتكسر التصميم في منشئ الشروط والأحكام.
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
            const container = document.getElementById('dynamic-terms-container');
            if (!container) return;
            
            container.innerHTML = ''; 
            
            let termsData = data?.settings?.terms || [];
            
            if (typeof termsData === 'string') {
                if (termsData.trim() !== '') {
                    termsData = [{ title: "الشروط العامة", text: termsData, icon: "fa-shield-halved" }];
                } else {
                    termsData = [];
                }
            }
            
            if (termsData.length === 0) {
                this.addTermCardUI(); 
            } else {
                termsData.forEach(term => this.addTermCardUI(term));
            }

            if (typeof Sortable !== 'undefined') {
                new Sortable(container, {
                    animation: 150,
                    handle: '.term-drag-handle',
                    ghostClass: 'sortable-ghost'
                });
            }
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
    
    detectCountryAutoFill: function(inputVal, dynamicCountriesArray = []) {
        const val = inputVal.trim().toLowerCase();
        if (!val) return;
        
        let match = null;

        if (dynamicCountriesArray && dynamicCountriesArray.length > 0) {
            match = dynamicCountriesArray.find(c => 
                (c.name && c.name.toLowerCase().includes(val)) || 
                (c.code && c.code.toLowerCase().includes(val))
            );
        }

        if (!match) {
            const smartCountriesDB = [
                { code: "SA", flag: "🇸🇦", dialCode: "+966", keys: ["سعودي", "السعودية", "ksa", "saudi"] },
                { code: "SY", flag: "🇸🇾", dialCode: "+963", keys: ["سوري", "سوريا", "syria"] },
                { code: "TR", flag: "🇹🇷", dialCode: "+90", keys: ["تركي", "تركيا", "turkey"] },
                { code: "EG", flag: "🇪🇬", dialCode: "+20", keys: ["مصر", "egypt"] },
                { code: "AE", flag: "🇦🇪", dialCode: "+971", keys: ["امارات", "uae"] },
                { code: "KW", flag: "🇰🇼", dialCode: "+965", keys: ["كويت", "kuwait"] }
            ];
            match = smartCountriesDB.find(c => c.keys.some(k => val.includes(k)));
        }

        if (match) {
            const codeEl = document.getElementById('country-code');
            const flagEl = document.getElementById('country-flag');
            const dialEl = document.getElementById('country-dial');
            
            const safeCode = match.code || match.id;
            const safeFlag = match.flag || match.flagEmoji;
            const safeDial = match.dialCode || match.dial;

            if (codeEl && !codeEl.value) codeEl.value = safeCode;
            if (flagEl && !flagEl.value) flagEl.value = safeFlag;
            if (dialEl && !dialEl.value) dialEl.value = safeDial;
        }
    },
    
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
        const dashView = document.getElementById('view-dash');
        if (!dashView.classList.contains('active')) {
            EventBus.emit('req-navigate', { page: 'dash' });
        }
        
        const alertsBox = document.getElementById('dash-smart-alerts');
        if (alertsBox) {
            alertsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            alertsBox.classList.add('highlight-pulse');
            setTimeout(() => alertsBox.classList.remove('highlight-pulse'), 2000);
        }
    },

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
            // استخدام innerText آمن جداً ضد الـ XSS
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
    },

    // =========================================================
    // 📝 7. منشئ الشروط والأحكام التفاعلي (Interactive Terms Builder)
    // =========================================================
    addTermCardUI: function(termData = {}) {
        const container = document.getElementById('dynamic-terms-container');
        if (!container) return;
        
        const cardId = 'term_' + Date.now() + Math.floor(Math.random() * 1000);
        
        const currentIcon = termData.icon || 'fa-check';
        const iconsList = ['fa-user', 'fa-wallet', 'fa-box', 'fa-shield-halved', 'fa-lock', 'fa-headset', 'fa-gem', 'fa-check', 'fa-handshake', 'fa-scale-balanced'];
        
        // 🚀 [التحديث الأمني]: تعقيم البيانات لمنع ثغرات XSS وكسر القوالب
        const safeTitle = UIService._esc(termData.title || '');
        const safeText = UIService._esc(termData.text || '');
        const safeIcon = UIService._esc(currentIcon);
        
        let iconsHTML = iconsList.map(icon => `
                <div class="is-opt ${safeIcon === icon ? 'active' : ''}" data-action="select-term-icon" data-val="${icon}">
                    <i class="fa-solid ${icon}"></i>
                </div>
            `).join('');
        
        const html = `
                <div class="panel-card term-builder-card mb-15 p-15" id="${cardId}">
                    
                    <div class="term-card-header">
                        <div class="term-drag-handle">
                            <i class="fa-solid fa-grip-vertical"></i>
                            <span>سحب للترتيب</span>
                        </div>
                        <button type="button" class="btn-micro btn-red" onclick="document.getElementById('${cardId}').remove()">
                            <i class="fa-solid fa-trash"></i>
                            <span>إزالة</span>
                        </button>
                    </div>
                    
                    <div class="form-group mb-10">
                        <label class="form-label fs-12 text-primary">عنوان البند</label>
                        <!-- تم تأمين الـ value -->
                        <input type="text" class="form-input term-title-input" value="${safeTitle}" placeholder="مثال: الشروط العامة لحساب المستخدم">
                    </div>

                    <div class="form-group mb-10">
                        <label class="form-label fs-12">أيقونة البند</label>
                        <div class="icon-selector term-icon-grid">
                            ${iconsHTML}
                        </div>
                        <!-- تم تأمين الـ value -->
                        <input type="hidden" class="term-icon-input" value="${safeIcon}">
                    </div>
                    
                    <div class="form-group mb-0">
                        <label class="form-label fs-12 text-warning">تفاصيل البند</label>
                        <!-- تم تأمين النص -->
                        <textarea class="form-input term-text-input" rows="2" placeholder="اكتب الشرح التفصيلي هنا...">${safeText}</textarea>
                    </div>
                </div>
            `;
        
        container.insertAdjacentHTML('beforeend', html);
    },    

    getTermsDataFromUI: function() {
        const cards = document.querySelectorAll('.term-builder-card');
        const termsArray = [];
        
        cards.forEach(card => {
            const title = card.querySelector('.term-title-input').value.trim();
            const text = card.querySelector('.term-text-input').value.trim();
            const icon = card.querySelector('.term-icon-input').value;
            
            if (title || text) {
                termsArray.push({ title, text, icon });
            }
        });
        
        return termsArray;
    },
    
    selectTermIconUI: function(element, val) {
        if (!element) return;
        const parent = element.closest('.icon-selector');
        if (parent) {
            parent.querySelectorAll('.is-opt').forEach(el => el.classList.remove('active'));
            element.classList.add('active');
            const hiddenInput = parent.nextElementSibling;
            if (hiddenInput && hiddenInput.classList.contains('term-icon-input')) {
                hiddenInput.value = val;
            }
        }
    }

};

export const AdminCalendar = CalendarService;
