// ============================================================================
// 📢 وحدة التسويق والعروض (modules/marketing/marketingUI.js)
// 🎯 الوظيفة: إدارة الكوبونات، العروض المركزية، ومحرك البناء المرئي (Visual Engine)
// ============================================================================

import { Utils, EventBus } from '../../adminUtils.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { UIService } from '../../core/uiService.js'; 

export const MarketingUI = {

    // =========================================================
    // 🌟 1. جسور تهيئة النوافذ (Modals Setup - DOM Isolation)
    // =========================================================
    setupOfferModal: function(offer) {
        const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
        const safeSetCheck = (elId, val) => { const el = document.getElementById(elId); if (el) el.checked = val; };
        
        safeSetVal('offer-name', offer ? offer.name : ''); 
        safeSetVal('offer-type', offer ? offer.type : 'real'); 
        safeSetVal('offer-value', offer ? offer.value : ''); 
        safeSetCheck('offer-active', offer ? offer.isActive !== false : true);
        
        const dText = document.getElementById('date-expiry-offer'); 
        const dHidden = document.getElementById('offer-expiry'); 
        if (offer && offer.expiryDate) { 
            if (dHidden) dHidden.value = offer.expiryDate; 
            if (dText) { dText.innerText = Utils.formatDate(offer.expiryDate); dText.classList.remove('placeholder-text'); } 
        } else { 
            if (dHidden) dHidden.value = ''; 
            if (dText) { dText.innerText = 'DD/MM/YYYY HH:MM'; dText.classList.add('placeholder-text'); } 
        }
        this.toggleOfferFields();
    },

    setupCouponModal: function(coupon, isEdit) {
        const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
        const safeSetCheck = (elId, checked) => { const el = document.getElementById(elId); if (el) el.checked = checked; };
        const titleEl = document.getElementById('coupon-modal-title'); 
        if (titleEl) titleEl.innerHTML = isEdit ? '<i class="fa-solid fa-pen"></i> تعديل الكوبون' : '<i class="fa-solid fa-ticket"></i> إضافة كوبون جديد';
        
        if (isEdit && coupon) {
            safeSetVal('coupon-code', coupon.code || ''); safeSetVal('coupon-type', coupon.type || 'percentage'); safeSetVal('coupon-value', coupon.value || 0); safeSetVal('coupon-min-order', coupon.minOrder || 0); safeSetVal('coupon-max-uses', coupon.maxUses || 0); safeSetCheck('coupon-active', coupon.isActive !== false); safeSetVal('coupon-max-per-user', coupon.maxPerUser || 0); safeSetVal('coupon-allowed-users', (coupon.allowedUsers || []).join(', '));
            const tempDate = coupon.expiryDate || null; const dText = document.getElementById('date-expiry-coupon'); const dHidden = document.getElementById('coupon-expiry');
            if (dHidden) dHidden.value = tempDate || '';
            if (dText) { if (tempDate) { dText.innerText = Utils.formatDate(tempDate); dText.classList.remove('placeholder-text'); } else { dText.innerText = 'DD/MM/YYYY HH:MM'; dText.classList.add('placeholder-text'); } }
        } else {
            safeSetVal('coupon-code', ''); safeSetVal('coupon-type', 'percentage'); safeSetVal('coupon-value', ''); safeSetVal('coupon-min-order', ''); safeSetVal('coupon-max-uses', ''); safeSetCheck('coupon-active', true); safeSetVal('coupon-max-per-user', ''); safeSetVal('coupon-allowed-users', ''); 
            const dText = document.getElementById('date-expiry-coupon'); const dHidden = document.getElementById('coupon-expiry');
            if (dHidden) dHidden.value = ''; if (dText) { dText.innerText = 'DD/MM/YYYY HH:MM'; dText.classList.add('placeholder-text'); }
        }
    },

    setupAlertModal: function(tiersList) {
        document.getElementById('alert-title').value = ''; document.getElementById('alert-body').value = ''; document.getElementById('alert-expiry').value = ''; document.getElementById('date-expiry-alert').innerText = 'DD/MM/YYYY HH:MM';
        const alertTypeEl = document.getElementById('alert-type'); if (alertTypeEl && alertTypeEl.options.length > 0) alertTypeEl.selectedIndex = 0; 
        const targetTypeEl = document.getElementById('alert-target-type'); if (targetTypeEl && targetTypeEl.options.length > 0) targetTypeEl.selectedIndex = 0; 
        const maxViewsInput = document.getElementById('alert-max-views'); if (maxViewsInput) maxViewsInput.value = '3'; 
        const actionLinkInput = document.getElementById('alert-action-link'); if (actionLinkInput) actionLinkInput.value = '';
        const couponInput = document.getElementById('alert-coupon-code'); if (couponInput) couponInput.value = '';
        const tierSelect = document.getElementById('alert-target-tier');
        if (tierSelect) { tierSelect.innerHTML = tiersList.map(t => `<option value="${t.id}">${Utils.escapeHTML(t.name)}</option>`).join(''); }
        if(window.AdminUI) { window.AdminUI.toggleAlertTargetFields?.(); window.AdminUI.toggleAlertTypeFields?.(); }
    },

    // =========================================================
    // 🌟 2. تبويبات العروض والتخفيضات 
    // =========================================================
    switchPromoTab: function(tab, btnEl) {
        document.querySelectorAll('#tabs-promotions.main-tab-btn').forEach(b => b.classList.remove('active'));
        if(btnEl) btnEl.classList.add('active');

        const couponsGrid = document.getElementById('coupons-grid');
        const offersGrid = document.getElementById('offers-grid');
        const btnAddCoupon = document.getElementById('btn-add-coupon');
        const btnAddOffer = document.getElementById('btn-add-offer');
        const infoAlertText = document.getElementById('promo-info-text');
        const pageTitle = document.getElementById('promo-page-title'); 

        if (tab === 'coupons') {
            if(couponsGrid) couponsGrid.classList.remove('hide-element');
            if(offersGrid) offersGrid.classList.add('hide-element');
            if(btnAddCoupon) btnAddCoupon.classList.remove('hide-element');
            if(btnAddOffer) btnAddOffer.classList.add('hide-element');
            if(infoAlertText) infoAlertText.innerText = "الكوبونات تتيح لك تقديم خصم يتم تطبيقه عند الدفع (في السلة) من قبل العميل.";
            if(pageTitle) pageTitle.innerHTML = '<i class="fa-solid fa-tags text-warning"></i> إدارة الكوبونات';
        } else if (tab === 'offers') {
            if(couponsGrid) couponsGrid.classList.add('hide-element');
            if(offersGrid) offersGrid.classList.remove('hide-element');
            if(btnAddCoupon) btnAddCoupon.classList.add('hide-element');
            if(btnAddOffer) btnAddOffer.classList.remove('hide-element');
            if(infoAlertText) infoAlertText.innerText = "العروض المركزية تغير أسعار المنتجات مباشرة في المتجر وتظهر الشارات والسعر المشطوب للعميل فوراً.";
            if(pageTitle) pageTitle.innerHTML = '<i class="fa-solid fa-bolt text-warning"></i> إدارة حملات التخفيض ';
            EventBus.emit('req-render-offers');
        }
    },

    toggleOfferFields: function() {
        const type = document.getElementById('offer-type') ? document.getElementById('offer-type').value.trim() : ''; 
        const valueGroup = document.getElementById('offer-value-group');
        const valueLabel = document.getElementById('offer-value-label');
        if (!valueGroup || !valueLabel) return;
        if (type === 'badge_only') valueGroup.classList.add('hide-element'); 
        else {
            valueGroup.classList.remove('hide-element');
            if (type === 'real' || type === 'fake') valueLabel.innerText = "نسبة الخصم المئوية (%)";
            else if (type === 'fixed') valueLabel.innerText = "السعر الثابت الموحد ($)";
        }
    },

    // ============================================================================
    // 🎨 3. محرك البناء المرئي (Visual Engine)
    // ============================================================================
    visualConfig: {
        storyEnabled: false, storyShape: 'shape-circle', storyProducts: [], 
        grid: { badgeText: '', badgeStyle: 'none', badgeColor: 'theme-ruby', badgePos: 'pos-tr', timerStyle: 'none', timerPos: 'pos-bc' }
    },

    switchBuilderTab: function(tabId) {
        document.querySelectorAll('.b-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.builder-pane').forEach(pane => pane.classList.remove('active'));
        const targetBtn = document.querySelector(`.b-tab-btn[data-tab="${tabId}"]`);
        if (targetBtn) targetBtn.classList.add('active');
        const targetPane = document.getElementById(`b-pane-${tabId}`);
        if (targetPane) { targetPane.classList.add('active'); if (tabId === 'story') this.renderStoryProductsTree(); }
    },

    toggleStoryBuilder: function() {
        const isChecked = document.getElementById('offer-in-story')?.checked;
        const container = document.getElementById('story-builder-container');
        if(!container) return;
        this.visualConfig.storyEnabled = isChecked;
        if (isChecked) {
            container.classList.remove('hide-element');
            document.getElementById('story-prods-container')?.classList.remove('hide-element');
            this.renderStoryProductsTree(); this.renderStoryPreview();
        } else {
            container.classList.add('hide-element');
            document.getElementById('story-prods-container')?.classList.add('hide-element');
        }
    },

    renderStoryProductsTree: function() {
        const mainProdsContainer = document.getElementById('offer-target-prods');
        const storyProdsContainer = document.getElementById('story-selection-prods');
        if (!mainProdsContainer || !storyProdsContainer) return;
        const checkedLabels = mainProdsContainer.querySelectorAll('.tree-child-cb:checked');
        if (checkedLabels.length === 0) {
            storyProdsContainer.innerHTML = '<div class="text-muted fs-12 text-center" style="padding: 20px;"><i class="fa-solid fa-circle-exclamation text-warning mb-5 fa-2x"></i><br>يرجى تحديد المنتجات المشمولة بالعرض في التبويب الأول أولاً.</div>';
            return;
        }
        const savedStoryProds = this.visualConfig.storyProducts || [];
        let html = '<div class="smart-tree-container">';
        checkedLabels.forEach(cb => {
            const parentLabel = cb.closest('.tree-item-row');
            const prodId = cb.value;
            const isChecked = savedStoryProds.includes(String(prodId));
            const prodName = parentLabel.querySelector('.text-main').innerText;
            const imgEl = parentLabel.querySelector('img');
            html += `
            <label class="tree-item-row" style="background: rgba(0,0,0,0.1); border-radius: 6px; margin-bottom: 5px;">
                <input type="checkbox" class="tree-checkbox tree-child-cb" value="${prodId}" ${isChecked ? 'checked' : ''}>
                ${imgEl ? `<img src="${imgEl.src}" class="tree-thumb">` : `<div class="tree-thumb-fallback"><i class="fa-solid fa-box"></i></div>`}
                <div class="flex-col">
                    <span class="fs-12 fw-bold text-main">${prodName}</span>
                    <span class="fs-10 text-muted"><span class="num-en text-warning" dir="ltr">#${prodId.slice(-4)}</span></span>
                </div>
            </label>`;
        });
        html += '</div>';
        storyProdsContainer.innerHTML = html;
    },

    setGridColor: function(btnElement) {
        document.querySelectorAll('#grid-color-selectors .color-swatch').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
        this.visualConfig.grid.badgeColor = btnElement.getAttribute('data-color');
        this.renderGridPreview(); this.renderStoryPreview();
    },

    setGridStyle: function(type, val, btnElement) {
        const containerId = type === 'badge' ? 'grid-badge-style-container' : 'grid-timer-style-container';
        document.querySelectorAll(`#${containerId} .style-card`).forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
        this.visualConfig.grid[type + 'Style'] = val;
        this.renderGridPreview(); if(this.visualConfig.storyEnabled) this.renderStoryPreview();
    },

    setGridPos: function(type, btnElement) {
        if (btnElement.classList.contains('disabled')) return;
        const pos = btnElement.getAttribute('data-pos'); 
        const otherType = type === 'badge' ? 'timer' : 'badge';
        const currentOtherPos = this.visualConfig.grid[`${otherType}Pos`];
        this.visualConfig.grid[`${type}Pos`] = pos;
        const isTop = (p) => p.includes('-t'), isBottom = (p) => p.includes('-b');
        if ((isTop(pos) && isTop(currentOtherPos)) || (isBottom(pos) && isBottom(currentOtherPos))) {
            const newOtherPos = isTop(pos) ? currentOtherPos.replace('-t', '-b') : currentOtherPos.replace('-b', '-t');
            this.visualConfig.grid[`${otherType}Pos`] = newOtherPos;
            const otherContainerId = otherType === 'badge' ? 'grid-badge-pos' : 'grid-timer-pos';
            document.querySelectorAll(`#${otherContainerId} .pos-dot`).forEach(b => b.classList.remove('active'));
            const newActiveDot = document.querySelector(`#${otherContainerId} .pos-dot[data-pos="${newOtherPos}"]`);
            if (newActiveDot) newActiveDot.classList.add('active');
            
            UIService.showToast(`تم نقل ${otherType === 'badge' ? 'الشارة' : 'المؤقت'} لمنع التضارب`, 'info');
        }
        document.querySelectorAll(`#${type === 'badge' ? 'grid-badge-pos' : 'grid-timer-pos'} .pos-dot`).forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
        this.renderGridPreview();
    },

    renderGridPreview: function() {
        const badgeCont = document.getElementById('grid-live-badge'), timerCont = document.getElementById('grid-live-timer');
        if(!badgeCont || !timerCont) return;
        const badgeText = document.getElementById('grid-badge-text')?.value.trim() || '🔥 عرض محدود';
        const v = this.visualConfig.grid; this.visualConfig.grid.badgeText = badgeText;
        const posMap = { 'pos-tl': 'top-left', 'pos-tc': 'top-center', 'pos-tr': 'top-right', 'pos-bl': 'bottom-left', 'pos-bc': 'bottom-center', 'pos-br': 'bottom-right' };
        const mB = posMap[v.badgePos] || v.badgePos, mT = posMap[v.timerPos] || v.timerPos;
        
        // 🌟 المترجم اللوني المحدث والكامل
        const colorClass = String(v.badgeColor).replace('theme-ruby', 'badge-red')
                                               .replace('theme-sapphire', 'badge-blue')
                                               .replace('theme-emerald', 'badge-green')
                                               .replace('theme-gold', 'badge-gold')
                                               .replace('theme-sunset', 'badge-red')
                                               .replace('theme-ocean', 'badge-blue')
                                               .replace('theme-amethyst', 'badge-purple')
                                               .replace('theme-cyber', 'badge-purple')
                                               .replace('theme-carbon', 'badge-black')
                                               .replace('theme-obsidian', 'badge-black');
                                               
        badgeCont.innerHTML = v.badgeStyle === 'none' ? '' : `<div class="story-badge ${v.badgeStyle} ${colorClass} ${mB}">${Utils.escapeHTML(badgeText)}</div>`;
        timerCont.innerHTML = v.timerStyle === 'none' ? '' : `<div class="${v.timerStyle} ${mT}"><i class="fa-regular fa-clock"></i> 12:30:00</div>`;
        if(this.visualConfig.storyEnabled) this.renderStoryPreview();
    },

    updateStoryConfig: function(type, value, btnElement) {
        const parent = btnElement.closest('.sb-grid');
        if(parent) parent.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
        this.visualConfig.storyShape = value; this.renderStoryPreview();
    },

    renderStoryPreview: function() {
        if(!this.visualConfig.storyEnabled) return;
        const icon = document.getElementById('sb-preview-icon'), badgeCont = document.getElementById('sb-preview-badge'), timerCont = document.getElementById('sb-preview-timer'), titleCont = document.getElementById('sb-live-title'), imgWrap = document.getElementById('sb-preview-image-box'); 
        if(!icon || !imgWrap || !badgeCont || !timerCont || !titleCont) return;
        const posMap = { 'pos-tl': 'top-left', 'pos-tc': 'top-center', 'pos-tr': 'top-right', 'pos-bl': 'bottom-left', 'pos-bc': 'bottom-center', 'pos-br': 'bottom-right' };
        const mB = posMap[this.visualConfig.grid.badgePos] || this.visualConfig.grid.badgePos, mT = posMap[this.visualConfig.grid.timerPos] || this.visualConfig.grid.timerPos;
        
        // 🌟 المترجم اللوني المحدث والكامل
        const colorClass = String(this.visualConfig.grid.badgeColor).replace('theme-ruby', 'badge-red')
                                                                    .replace('theme-sapphire', 'badge-blue')
                                                                    .replace('theme-emerald', 'badge-green')
                                                                    .replace('theme-gold', 'badge-gold')
                                                                    .replace('theme-sunset', 'badge-red')
                                                                    .replace('theme-ocean', 'badge-blue')
                                                                    .replace('theme-amethyst', 'badge-purple')
                                                                    .replace('theme-cyber', 'badge-purple')
                                                                    .replace('theme-carbon', 'badge-black')
                                                                    .replace('theme-obsidian', 'badge-black');
                                                                    
        icon.className = `promo-icon-wrapper ${this.visualConfig.storyShape} ${colorClass}`;
        imgWrap.className = `img-wrap ${this.visualConfig.storyShape}`;
        badgeCont.innerHTML = this.visualConfig.grid.badgeStyle === 'none' ? '' : `<div class="story-badge ${this.visualConfig.grid.badgeStyle} ${colorClass} ${mB}">${Utils.escapeHTML(this.visualConfig.grid.badgeText)}</div>`;
        timerCont.innerHTML = this.visualConfig.grid.timerStyle === 'none' ? '' : `<div class="${this.visualConfig.grid.timerStyle} ${mT}"><i class="fa-regular fa-clock"></i> 12:30:00</div>`;
        titleCont.innerText = document.getElementById('offer-name')?.value.trim() || 'اسم العرض';
    },

    resetVisualBuilder: function(savedConfig = null) {
        this.visualConfig = savedConfig ? JSON.parse(JSON.stringify(savedConfig)) : { storyEnabled: false, storyShape: 'shape-circle', storyProducts: [], grid: { badgeText: '', badgeStyle: 'none', badgeColor: 'theme-ruby', badgePos: 'pos-tr', timerStyle: 'none', timerPos: 'pos-bc' } };
        const bInp = document.getElementById('grid-badge-text'); if(bInp) bInp.value = this.visualConfig.grid.badgeText || '';
        const sTog = document.getElementById('offer-in-story'); if(sTog) sTog.checked = this.visualConfig.storyEnabled;
        this.toggleStoryBuilder();
        document.querySelectorAll('.color-swatch, .pos-dot, .sb-btn, .style-card').forEach(b => b.classList.remove('active'));
        document.querySelector(`.color-swatch[data-color="${this.visualConfig.grid.badgeColor}"]`)?.classList.add('active');
        document.querySelector(`#grid-badge-pos .pos-dot[data-pos="${this.visualConfig.grid.badgePos}"]`)?.classList.add('active');
        document.querySelector(`#grid-timer-pos .pos-dot[data-pos="${this.visualConfig.grid.timerPos}"]`)?.classList.add('active');
        document.querySelector(`#grid-badge-style-container .style-card[data-val="${this.visualConfig.grid.badgeStyle}"]`)?.classList.add('active');
        document.querySelector(`#grid-timer-style-container .style-card[data-val="${this.visualConfig.grid.timerStyle}"]`)?.classList.add('active');
        document.querySelector(`.sb-btn[data-val="${this.visualConfig.storyShape}"]`)?.classList.add('active');
        this.switchBuilderTab('data', null); this.renderGridPreview();
    },

    // =========================================================
    // 🛡️ 4. أدوات منع التضارب والجسور (Logic Bridges)
    // =========================================================
    showBatchCollisionResolverUI: function(collisions, resolveCallback) {
        const overlay = document.createElement('div'); overlay.className = 'modal-overlay active'; overlay.id = 'batch-collision-modal';
        const listHtml = collisions.map(c => `
            <label class="copy-row cursor-pointer" style="justify-content: flex-start; gap: 12px; padding: 12px; margin-bottom: 8px;">
                <input type="checkbox" class="col-chk-item" value="${c.prodId}" checked style="width: 18px; height: 18px; accent-color: var(--primary);">
                <div class="cr-content w-100" style="align-items: flex-start;">
                    <span class="fw-bold text-main fs-13 text-truncate" style="max-width: 100%; display: block;">${Utils.escapeHTML(c.prodName)}</span>
                    <div class="fs-11 text-danger mt-5"><i class="fa-solid fa-link"></i> مرتبط بـ: ${Utils.escapeHTML(c.oldOfferName)}</div>
                </div>
            </label>`).join('');
        overlay.innerHTML = `
            <div class="modal-content tier-modal-content">
                <div class="modal-close-btn" id="col-btn-close-icon"><i class="fa-solid fa-xmark"></i></div>
                <h2 class="main-title mb-15 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> تضارب في التخفيضات!</h2>
                <div class="tsm-list-container custom-scrollbar mb-20" style="max-height: 250px; overflow-y: auto;">${listHtml}</div>
                <div class="tsm-actions flex-center-gap">
                    <button class="btn btn-primary flex-1" id="col-btn-confirm">تأكيد السحب</button>
                    <button class="btn btn-ghost flex-1" id="col-btn-cancel">إلغاء</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#col-btn-close-icon').onclick = () => { overlay.remove(); resolveCallback(null); };
        overlay.querySelector('#col-btn-confirm').onclick = () => { const ids = Array.from(overlay.querySelectorAll('.col-chk-item:checked')).map(cb => cb.value); overlay.remove(); resolveCallback(ids); };
    },

    applyGeneratedCoupon: function(code) {
        const input = document.getElementById('coupon-code');
        if (input) { input.value = code; input.focus(); input.classList.add('flash-success'); setTimeout(() => input.classList.remove('flash-success'), 400); }
    },

    // 🌟 5. مساعدة استخراج البيانات (Data Extractors)
    getSelectedTiers: () => Array.from(document.querySelectorAll('#offer-target-tiers .tree-tier-cb:checked')).map(cb => cb.value),
    getSelectedProds: () => Array.from(document.querySelectorAll('#offer-target-prods .tree-child-cb:checked')).map(cb => cb.value),
    getSelectedStoryProds: () => Array.from(document.querySelectorAll('#story-selection-prods .tree-child-cb:checked')).map(cb => cb.value),
    getCouponSelectedTiers: () => Array.from(document.querySelectorAll('#coupon-target-tiers .tree-tier-cb:checked')).map(cb => cb.value),
    getCouponSelectedProds: () => Array.from(document.querySelectorAll('#coupon-target-prods .tree-child-cb:checked')).map(cb => cb.value)
};
