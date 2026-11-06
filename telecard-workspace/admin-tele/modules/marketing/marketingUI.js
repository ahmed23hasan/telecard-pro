// ============================================================================
// 📢 وحدة التسويق والعروض (modules/marketing/marketingUI.js) - Cloud-Native V20.5 💎
// 🎯 الوظيفة: إدارة نوافذ العروض والكوبونات والمحرك البصري ومعاينة الشريط الإخباري
// 🌟 التحديثات المعمارية:
// 1. Collision Modal Isolation 🛡️: منع هدم نافذة العرض (#m-offer) عند فتح نافذة تضارب التخفيضات الفرعية.
// 2. Tree Initialization Order 🌲: بناء شجرة المنتجات قبل setupOfferModal لضمان جاهزية شجرة الستوري فور فتح النافذة.
// 3. Live Ticker Animation Sync 📜: تحديث نص وحركة الشريط الإخباري (#preview-ticker) لحظياً وعند فتح القسم.
// 4. Visual Engine Harmony 🎨: تكامل تام مع الكلاسات المنطقية وألوان المعاينة المعتمدة في admin.css.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { MarketingTemplates } from './marketingTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { UIService } from '../../core/uiService.js'; 
import { RenderHelpers } from '../../core/renderHelpers.js'; 
import { MarketingRender } from './marketingRender.js'; 

export const MarketingUI = {

    visualConfig: {
        storyEnabled: false, 
        storyShape: 'shape-circle', 
        storyProducts: [], 
        grid: { 
            badgeText: '', 
            badgeStyle: 'none', 
            badgeColor: 'theme-ruby', 
            badgePos: 'pos-tr', 
            timerStyle: 'none', 
            timerPos: 'pos-bc' 
        }
    },

    _getBadgeColorClass: function(themeColor) {
        return String(themeColor || 'theme-ruby')
            .replace('theme-ruby', 'badge-red')
            .replace('theme-sapphire', 'badge-blue')
            .replace('theme-emerald', 'badge-green')
            .replace('theme-gold', 'badge-gold')
            .replace('theme-sunset', 'badge-red')
            .replace('theme-ocean', 'badge-blue')
            .replace('theme-amethyst', 'badge-purple')
            .replace('theme-cyber', 'badge-purple')
            .replace('theme-carbon', 'badge-black')
            .replace('theme-obsidian', 'badge-black');
    },

    _getLogicalPosClass: function(posKey) {
        const posMap = {
            'pos-tr': 'top-start',
            'pos-tc': 'top-center',
            'pos-tl': 'top-end',
            'pos-br': 'bottom-start',
            'pos-bc': 'bottom-center',
            'pos-bl': 'bottom-end'
        };
        return posMap[posKey] || 'top-start';
    },

    // =========================================================
    // 🎁 1. النوافذ الديناميكية (Dynamic Modals)
    // =========================================================
    openOfferModal: function(id = null) {
        const strId = id ? String(id) : null;
        EventBus.emit('req-update-state', { tempEditId: strId });
        
        const offer = strId ? (AdminData.data.offersMap?.[strId] || (AdminData.data.offers || []).find(o => String(o.id) === strId)) : null;

        let modal = document.getElementById('m-offer');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'm-offer';
            modal.className = 'modal-overlay dynamic-auto-destroy'; 
            document.body.appendChild(modal);
        }

        modal.innerHTML = MarketingTemplates.offerEditModal();

        if (MarketingRender?.populateSmartTreeTargets) {
            MarketingRender.populateSmartTreeTargets('offer-target', offer ? (offer.targetTiers || []) : [], offer ? (offer.targetProds || []) : []);
        }

        this.setupOfferModal(offer);

        void modal.offsetWidth; 
        EventBus.emit('req-open-modal', 'offer');
    },

    openCouponModal: function(id = null) {
        const strId = id ? String(id) : null;
        EventBus.emit('req-update-state', { tempEditId: strId });
        const isEdit = !!strId;
        
        const coupon = isEdit ? (AdminData.data.couponsMap?.[strId] || (AdminData.data.coupons || []).find(c => String(c.id) === strId)) : null;

        let modal = document.getElementById('m-coupon');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'm-coupon';
            modal.className = 'modal-overlay dynamic-auto-destroy'; 
            document.body.appendChild(modal);
        }

        modal.innerHTML = MarketingTemplates.couponEditModal();

        if (MarketingRender?.populateSmartTreeTargets) {
            MarketingRender.populateSmartTreeTargets('coupon-target', coupon ? (coupon.targetTiers || []) : [], coupon ? (coupon.targetProds || []) : []);
        }

        this.setupCouponModal(coupon, isEdit);

        void modal.offsetWidth; 
        EventBus.emit('req-open-modal', 'coupon');
    },

    openAlertModal: function() {
        let modal = document.getElementById('m-alert');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'm-alert';
            modal.className = 'modal-overlay dynamic-auto-destroy'; 
            document.body.appendChild(modal);
        }

        modal.innerHTML = MarketingTemplates.alertEditModal();
        this.setupAlertModal(AdminData.data.tiers || []);

        void modal.offsetWidth; 
        EventBus.emit('req-open-modal', 'alert');
    },

    openBannerModal: function() {
        let modal = document.getElementById('m-banner');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'm-banner';
            modal.className = 'modal-overlay dynamic-auto-destroy'; 
            document.body.appendChild(modal);
        }

        modal.innerHTML = MarketingTemplates.bannerEditModal();

        void modal.offsetWidth; 
        EventBus.emit('req-open-modal', 'banner');
    },

    showBatchCollisionResolverUI: function(collisions, resolveCallback) {
        let overlay = document.getElementById('batch-collision-modal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'batch-collision-modal';
            overlay.className = 'modal-overlay dynamic-auto-destroy'; 
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = MarketingTemplates.batchCollisionModal(collisions);

        const closeIt = (result) => {
            if (window.AdminUI && window.AdminUI.closeModal) {
                window.AdminUI.closeModal('batch-collision-modal');
            }
            resolveCallback(result);
        };

        const closeBtn = overlay.querySelector('#col-btn-close-icon');
        const cancelBtn = overlay.querySelector('#col-btn-cancel');
        const confirmBtn = overlay.querySelector('#col-btn-confirm');

        if (closeBtn) closeBtn.onclick = () => closeIt(null);
        if (cancelBtn) cancelBtn.onclick = () => closeIt(null);
        if (confirmBtn) confirmBtn.onclick = () => {
            const ids = Array.from(overlay.querySelectorAll('.col-chk-item:checked')).map(cb => cb.value);
            closeIt(ids);
        };

        void overlay.offsetWidth; 
        requestAnimationFrame(() => overlay.classList.add('active'));
    },

    // =========================================================
    // ⚙️ 2. تجهيز البيانات (Setup Data Methods)
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
            if (dText) { 
                dText.innerText = RenderHelpers.formatSafeDate(offer.expiryDate); 
                dText.classList.remove('placeholder-text'); 
                dText.closest('.custom-field')?.classList.add('active'); 
            } 
        } else { 
            if (dHidden) dHidden.value = ''; 
            if (dText) { 
                dText.innerText = 'DD/MM/YYYY HH:MM'; 
                dText.classList.add('placeholder-text'); 
                dText.closest('.custom-field')?.classList.remove('active'); 
            } 
        }
        this.toggleOfferFields();
        this.resetVisualBuilder(offer ? offer.visualConfig : null);
    },

    setupCouponModal: function(coupon, isEdit) {
        const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
        const safeSetCheck = (elId, checked) => { const el = document.getElementById(elId); if (el) el.checked = checked; };
        const titleEl = document.getElementById('coupon-modal-title'); 
        if (titleEl) titleEl.innerHTML = isEdit ? '<i class="fa-solid fa-pen me-1"></i> تعديل الكوبون' : '<i class="fa-solid fa-ticket me-1"></i> إضافة كوبون جديد';
        
        if (isEdit && coupon) {
            safeSetVal('coupon-code', coupon.code || ''); 
            safeSetVal('coupon-type', coupon.type || 'percentage'); 
            safeSetVal('coupon-value', coupon.value || 0); 
            safeSetVal('coupon-max-discount', coupon.maxDiscount || 0); 
            safeSetVal('coupon-min-order', coupon.minOrder || 0); 
            safeSetVal('coupon-max-uses', coupon.maxUses || 0); 
            safeSetCheck('coupon-active', coupon.isActive !== false); 
            safeSetVal('coupon-max-per-user', coupon.maxPerUser || 0); 
            safeSetVal('coupon-allowed-users', (coupon.allowedUsers || []).join(', '));
            
            const tempDate = coupon.expiryDate || null; 
            const dText = document.getElementById('date-expiry-coupon'); 
            const dHidden = document.getElementById('coupon-expiry');
            if (dHidden) dHidden.value = tempDate || '';
            if (dText) { 
                if (tempDate) { 
                    dText.innerText = RenderHelpers.formatSafeDate(tempDate); 
                    dText.classList.remove('placeholder-text'); 
                    dText.closest('.custom-field')?.classList.add('active'); 
                } else { 
                    dText.innerText = 'DD/MM/YYYY HH:MM'; 
                    dText.classList.add('placeholder-text'); 
                    dText.closest('.custom-field')?.classList.remove('active'); 
                } 
            }
        } else {
            safeSetVal('coupon-code', ''); 
            safeSetVal('coupon-type', 'percentage'); 
            safeSetVal('coupon-value', ''); 
            safeSetVal('coupon-max-discount', ''); 
            safeSetVal('coupon-min-order', ''); 
            safeSetVal('coupon-max-uses', ''); 
            safeSetCheck('coupon-active', true); 
            safeSetVal('coupon-max-per-user', ''); 
            safeSetVal('coupon-allowed-users', ''); 
            
            const dText = document.getElementById('date-expiry-coupon'); 
            const dHidden = document.getElementById('coupon-expiry');
            if (dHidden) dHidden.value = ''; 
            if (dText) { 
                dText.innerText = 'DD/MM/YYYY HH:MM'; 
                dText.classList.add('placeholder-text'); 
                dText.closest('.custom-field')?.classList.remove('active'); 
            }
        }
    },

    setupAlertModal: function(tiersList) {
        const safeSetVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

        safeSetVal('alert-title', ''); 
        safeSetVal('alert-body', ''); 
        safeSetVal('alert-expiry', ''); 
        
        const alertDText = document.getElementById('date-expiry-alert');
        if (alertDText) {
            alertDText.innerText = 'DD/MM/YYYY HH:MM';
            alertDText.classList.add('placeholder-text');
            alertDText.closest('.custom-field')?.classList.remove('active');
        }
        
        const alertTypeEl = document.getElementById('alert-type'); 
        if (alertTypeEl && alertTypeEl.options.length > 0) alertTypeEl.selectedIndex = 0; 
        const targetTypeEl = document.getElementById('alert-target-type'); 
        if (targetTypeEl && targetTypeEl.options.length > 0) targetTypeEl.selectedIndex = 0; 
        
        safeSetVal('alert-max-views', '3');
        safeSetVal('alert-action-link', '');
        safeSetVal('alert-coupon-code', '');
        
        const tierSelect = document.getElementById('alert-target-tier');
        if (tierSelect) { 
            tierSelect.innerHTML = tiersList.map(t => `<option value="${t.id}">${Utils.escapeHTML(t.name)}</option>`).join(''); 
        }
        
        this.toggleAlertTargetFields(); 
        this.toggleAlertTypeFields();
    },

    // =========================================================
    // 🔔 3. تفاعلات نافذة الإشعارات والشريط الإخباري
    // =========================================================
    updateTickerPreviewUI: function(customText = undefined) {
        const preview = document.getElementById('preview-ticker');
        if (!preview) return;
        const rawText = customText !== undefined ? customText : document.getElementById('promo-text')?.value;
        const speed = document.getElementById('promo-speed')?.value || 'vertical-normal';
        preview.innerText = (rawText && String(rawText).trim() !== '') ? String(rawText).trim() : 'معاينة النص...';
        preview.className = `tp-text anim-${speed}`;
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

    // =========================================================
    // 🎨 4. التفاعلات المرئية والمحرك البصري (Visual Builder Interactions)
    // =========================================================
    switchPromoTab: function(tab, btnEl) {
        document.querySelectorAll('#tabs-promotions .main-tab-btn').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        const couponsGrid = document.getElementById('coupons-grid');
        const offersGrid = document.getElementById('offers-grid');
        const btnAddCoupon = document.getElementById('btn-add-coupon');
        const btnAddOffer = document.getElementById('btn-add-offer');
        const infoAlertText = document.getElementById('promo-info-text');
        const pageTitle = document.getElementById('promo-page-title'); 

        if (tab === 'coupons') {
            if (couponsGrid) couponsGrid.classList.remove('hide-element');
            if (offersGrid) offersGrid.classList.add('hide-element');
            if (btnAddCoupon) btnAddCoupon.classList.remove('hide-element');
            if (btnAddOffer) btnAddOffer.classList.add('hide-element');
            if (infoAlertText) infoAlertText.innerText = "الكوبونات تتيح لك تقديم خصم يتم تطبيقه عند الدفع (في السلة) من قبل العميل.";
            if (pageTitle) pageTitle.innerHTML = '<i class="fa-solid fa-tags text-warning me-1"></i> إدارة الكوبونات';
        } else if (tab === 'offers') {
            if (couponsGrid) couponsGrid.classList.add('hide-element');
            if (offersGrid) offersGrid.classList.remove('hide-element');
            if (btnAddCoupon) btnAddCoupon.classList.add('hide-element');
            if (btnAddOffer) btnAddOffer.classList.remove('hide-element');
            if (infoAlertText) infoAlertText.innerText = "العروض المركزية تغير أسعار المنتجات مباشرة في المتجر وتظهر الشارات والسعر المشطوب للعميل فوراً.";
            if (pageTitle) pageTitle.innerHTML = '<i class="fa-solid fa-bolt text-warning me-1"></i> إدارة حملات التخفيض';
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
            else if (type === 'fixed') valueLabel.innerText = "قيمة مبلغ الخصم الثابت ($)";
        }
    },

    switchBuilderTab: function(tabId) {
        document.querySelectorAll('.b-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.builder-pane').forEach(pane => pane.classList.remove('active'));
        const targetBtn = document.querySelector(`.b-tab-btn[data-tab="${tabId}"]`);
        if (targetBtn) targetBtn.classList.add('active');
        const targetPane = document.getElementById(`b-pane-${tabId}`);
        if (targetPane) { 
            targetPane.classList.add('active'); 
            if (tabId === 'story') {
                this.renderStoryProductsTree();
                if (this.visualConfig.storyEnabled) this.renderStoryPreview();
            }
        }
    },

    toggleStoryBuilder: function() {
        const isChecked = document.getElementById('offer-in-story')?.checked;
        const container = document.getElementById('story-builder-container');
        if (!container) return;
        this.visualConfig.storyEnabled = isChecked;
        if (isChecked) {
            container.classList.remove('hide-element');
            document.getElementById('story-prods-container')?.classList.remove('hide-element');
            this.renderStoryProductsTree(); 
            this.renderStoryPreview();
        } else {
            container.classList.add('hide-element');
            document.getElementById('story-prods-container')?.classList.add('hide-element');
        }
    },

    renderStoryProductsTree: function() {
        const mainProdsContainer = document.getElementById('offer-target-prods');
        const storyProdsContainer = document.getElementById('story-selection-prods');
        if (!mainProdsContainer || !storyProdsContainer) return;
        
        const existingStoryCbs = storyProdsContainer.querySelectorAll('.tree-child-cb');
        if (existingStoryCbs.length > 0) {
            this.visualConfig.storyProducts = Array.from(storyProdsContainer.querySelectorAll('.tree-child-cb:checked')).map(cb => String(cb.value));
        }

        const checkedLabels = mainProdsContainer.querySelectorAll('.tree-child-cb:checked');
        if (checkedLabels.length === 0) {
            storyProdsContainer.innerHTML = '<div class="text-muted fs-12 text-center p-15"><i class="fa-solid fa-circle-exclamation text-warning mb-5 fa-2x"></i><br>يرجى تحديد المنتجات المشمولة بالعرض في التبويب الأول أولاً.</div>';
            return;
        }
        
        const savedStoryProds = (this.visualConfig.storyProducts || []).map(String);
        let html = '';
        
        checkedLabels.forEach(cb => {
            const prodId = String(cb.value);
            const isChecked = savedStoryProds.includes(prodId);
            
            const prodObj = AdminData.data.prodsMap?.[prodId] || (AdminData.data.prods || []).find(p => String(p.id) === prodId);
            const prodName = prodObj ? Utils.escapeHTML(prodObj.name) : 'منتج غير معروف';
            const prodImg = prodObj ? (prodObj.img || prodObj.image) : null;
            
            html += `
            <label class="tree-item-row">
                <input type="checkbox" class="tree-checkbox tree-child-cb" value="${Utils.escapeHTML(prodId)}" ${isChecked ? 'checked' : ''}>
                ${prodImg ? `<img src="${Utils.escapeHTML(prodImg)}" class="tree-thumb">` : `<div class="tree-thumb-fallback"><i class="fa-solid fa-box"></i></div>`}
                <div class="d-flex flex-column">
                    <span class="fs-12 fw-bold text-main">${prodName}</span>
                    <span class="fs-10 text-muted"><span class="num-en text-warning font-numeric" dir="ltr" lang="en">#${Utils.escapeHTML(prodId.slice(-4))}</span></span>
                </div>
            </label>`;
        });
        storyProdsContainer.innerHTML = html;
    },

    setGridColor: function(btnElement) {
        document.querySelectorAll('#grid-color-selectors .color-swatch').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
        this.visualConfig.grid.badgeColor = btnElement.getAttribute('data-color');
        this.renderGridPreview(); 
        this.renderStoryPreview();
    },

    setGridStyle: function(type, val, btnElement) {
        const containerId = type === 'badge' ? 'grid-badge-style-container' : 'grid-timer-style-container';
        document.querySelectorAll(`#${containerId} .style-card`).forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
        this.visualConfig.grid[type + 'Style'] = val;
        this.renderGridPreview(); 
        if (this.visualConfig.storyEnabled) this.renderStoryPreview();
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
        const badgeCont = document.getElementById('grid-live-badge');
        const timerCont = document.getElementById('grid-live-timer');
        if (!badgeCont || !timerCont) return;
        const badgeText = document.getElementById('grid-badge-text')?.value.trim() || '🔥 عرض محدود';
        const v = this.visualConfig.grid; 
        this.visualConfig.grid.badgeText = badgeText;
        
        const mB = this._getLogicalPosClass(v.badgePos);
        const mT = this._getLogicalPosClass(v.timerPos);
        const colorClass = this._getBadgeColorClass(v.badgeColor);
                                               
        badgeCont.innerHTML = v.badgeStyle === 'none' ? '' : `<div class="story-badge ${v.badgeStyle} ${colorClass} ${mB}">${Utils.escapeHTML(badgeText)}</div>`;
        timerCont.innerHTML = v.timerStyle === 'none' ? '' : `<div class="${v.timerStyle} ${mT}"><i class="fa-regular fa-clock me-1"></i> 12:30:00</div>`;
        if (this.visualConfig.storyEnabled) this.renderStoryPreview();
    },

    updateStoryConfig: function(type, value, btnElement) {
        const parent = btnElement.closest('.sb-grid');
        if (parent) parent.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
        this.visualConfig.storyShape = value; 
        this.renderStoryPreview();
    },

    renderStoryPreview: function() {
        if (!this.visualConfig.storyEnabled) return;
        const icon = document.getElementById('sb-preview-icon');
        const badgeCont = document.getElementById('sb-preview-badge');
        const timerCont = document.getElementById('sb-preview-timer');
        const titleCont = document.getElementById('sb-live-title');
        const imgWrap = document.getElementById('sb-preview-image-box'); 
        if (!icon || !imgWrap || !badgeCont || !timerCont || !titleCont) return;
        
        const mB = this._getLogicalPosClass(this.visualConfig.grid.badgePos);
        const mT = this._getLogicalPosClass(this.visualConfig.grid.timerPos);
        const colorClass = this._getBadgeColorClass(this.visualConfig.grid.badgeColor);
                                                                    
        icon.className = `promo-icon-wrapper ve-story-preview-icon ${this.visualConfig.storyShape} ${colorClass}`;
        imgWrap.className = `img-wrap ${this.visualConfig.storyShape}`;
        badgeCont.innerHTML = this.visualConfig.grid.badgeStyle === 'none' ? '' : `<div class="story-badge ${this.visualConfig.grid.badgeStyle} ${colorClass} ${mB}">${Utils.escapeHTML(this.visualConfig.grid.badgeText)}</div>`;
        timerCont.innerHTML = this.visualConfig.grid.timerStyle === 'none' ? '' : `<div class="${this.visualConfig.grid.timerStyle} ${mT}"><i class="fa-regular fa-clock me-1"></i> 12:30:00</div>`;
        titleCont.innerText = document.getElementById('offer-name')?.value.trim() || 'اسم العرض';
    },

    resetVisualBuilder: function(savedConfig = null) {
        this.visualConfig = savedConfig ? JSON.parse(JSON.stringify(savedConfig)) : { 
            storyEnabled: false, 
            storyShape: 'shape-circle', 
            storyProducts: [], 
            grid: { 
                badgeText: '', 
                badgeStyle: 'none', 
                badgeColor: 'theme-ruby', 
                badgePos: 'pos-tr', 
                timerStyle: 'none', 
                timerPos: 'pos-bc' 
            } 
        };
        const bInp = document.getElementById('grid-badge-text'); 
        if (bInp) bInp.value = this.visualConfig.grid.badgeText || '';
        const sTog = document.getElementById('offer-in-story'); 
        if (sTog) sTog.checked = this.visualConfig.storyEnabled;
        this.toggleStoryBuilder();
        document.querySelectorAll('.color-swatch, .pos-dot, .sb-btn, .style-card').forEach(b => b.classList.remove('active'));
        document.querySelector(`.color-swatch[data-color="${this.visualConfig.grid.badgeColor}"]`)?.classList.add('active');
        document.querySelector(`#grid-badge-pos .pos-dot[data-pos="${this.visualConfig.grid.badgePos}"]`)?.classList.add('active');
        document.querySelector(`#grid-timer-pos .pos-dot[data-pos="${this.visualConfig.grid.timerPos}"]`)?.classList.add('active');
        document.querySelector(`#grid-badge-style-container .style-card[data-val="${this.visualConfig.grid.badgeStyle}"]`)?.classList.add('active');
        document.querySelector(`#grid-timer-style-container .style-card[data-val="${this.visualConfig.grid.timerStyle}"]`)?.classList.add('active');
        document.querySelector(`.sb-btn[data-val="${this.visualConfig.storyShape}"]`)?.classList.add('active');
        this.switchBuilderTab('data'); 
        this.renderGridPreview();
    },

    applyGeneratedCoupon: function(code) {
        const input = document.getElementById('coupon-code');
        if (input) { 
            input.value = code; 
            input.focus(); 
            input.classList.add('flash-success'); 
            setTimeout(() => input.classList.remove('flash-success'), 400); 
        }
    },

    getSelectedTiers: () => Array.from(document.querySelectorAll('#offer-target-tiers .tree-tier-cb:checked')).map(cb => cb.value),
    getSelectedProds: () => Array.from(document.querySelectorAll('#offer-target-prods .tree-child-cb:checked')).map(cb => cb.value),
    getSelectedStoryProds: () => Array.from(document.querySelectorAll('#story-selection-prods .tree-child-cb:checked')).map(cb => cb.value),
    getCouponSelectedTiers: () => Array.from(document.querySelectorAll('#coupon-target-tiers .tree-tier-cb:checked')).map(cb => cb.value),
    getCouponSelectedProds: () => Array.from(document.querySelectorAll('#coupon-target-prods .tree-child-cb:checked')).map(cb => cb.value)
};