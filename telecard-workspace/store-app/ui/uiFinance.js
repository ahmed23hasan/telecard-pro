// ============================================================================
// 💳 وحدة الدفع والمنتجات (uiFinance.js) - النسخة المطلقة V17.3 👑
// 🎯 الوظيفة: نوافذ الشراء، الإيداعات، فلاتر القوائم، وتفاصيل الطلبات
// 🚀 التحديثات المعمارية (V17.3):
// 1. Clean UX: إزالة إشعارات التوست (Toast) المزدوجة عند الإرسال والاكتفاء بالنوافذ (Modals).
// 2. Unified UI Lock (DRY): دمج حقن الدرع الشفاف وإزالته في دوال مركزية للتحكم بالواجهة.
// 3. Kill Switch Timer: نظام طوارئ لفك قفل الشاشة إجبارياً بعد 60 ثانية لتجنب التجميد الأبدي.
// ============================================================================

import * as Utils from '../utils.js';
import { DataManager, LiveStoreData, StoreDB } from '../dataManager.js';
import { RenderManager } from '../renderManager.js';
import { RenderHelpers } from '../core/renderHelpers.js';
import { FinancialEngine } from '../core/financialEngine.js';
import { UIBuilders } from './uiBuilders.js';

const getSys = () => {
    if (window.ClientSystem) return window.ClientSystem;
    if (window.UIManager) return window.UIManager;
    return new Proxy({}, { get: (target, prop) => () => { console.error(`🚨 System not ready for: ${String(prop)}`); } });
};

export const UIFinance = {

    pendingReceiptFile: null,
    _isProcessingTx: false, 
    _watchdogTimer: null,
    _killSwitchTimer: null,
    _offlineHandler: null,
    _currentImageJobId: null, 
    _amountTypingTimer: null,

    _parseSafeAmount: function(val) {
        if (!val) return 0;
        return Utils.parseSafeNumber(val);
    },
    
    _toggleButtonLoader: function(btn, isLoading) {
        if (!btn) return;
        
        try {
            if (isLoading) {
                if (btn._originalHtml === undefined && !btn.innerHTML.includes('fa-spinner')) {
                    btn._originalHtml = btn.innerHTML;
                }
                
                btn.disabled = true;
                btn.classList.remove('is-loading');
                
                const contentSpan = btn.querySelector('.btn-content');
                const spinnerSpan = btn.querySelector('.btn-spinner');
                
                if (contentSpan && spinnerSpan) {
                    btn._isComplex = true;
                    contentSpan.style.display = 'none';
                    spinnerSpan.style.display = 'inline-block';
                } else {
                    const currentWidth = btn.offsetWidth;
                    if (currentWidth > 0) btn.style.width = `${currentWidth}px`;
                    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-inline-end: 6px;"></i> جاري المعالجة...`;
                }
                
                btn.classList.add('tx-processing-safe');
                
            } else {
                btn.disabled = false;
                btn.classList.remove('tx-processing-safe', 'is-loading');
                
                if (btn._isComplex) {
                    const contentSpan = btn.querySelector('.btn-content');
                    const spinnerSpan = btn.querySelector('.btn-spinner');
                    if (contentSpan) contentSpan.style.display = '';
                    if (spinnerSpan) spinnerSpan.style.display = 'none';
                } else if (btn._originalHtml !== undefined) {
                    btn.innerHTML = btn._originalHtml;
                    btn.style.width = '';
                    btn._originalHtml = undefined;
                } else {
                    btn.innerHTML = 'تأكيد';
                    btn.style.width = '';
                }
            }
        } catch (e) {
            console.error("🚨 Button Restore Error:", e);
            btn.disabled = false;
            btn.classList.remove('tx-processing-safe', 'is-loading');
        }
    },

    // 🛡️ حماية الواجهة من التجميد الأبدي
    _lockUI: function(btn) {
        this._isProcessingTx = true;
        this._toggleButtonLoader(btn, true);

        const shieldId = 'invisible-tx-shield';
        if (!document.getElementById(shieldId)) {
            document.body.insertAdjacentHTML('beforeend', `
                <div id="${shieldId}" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(255, 255, 255, 0.01); z-index: 9999999; cursor: wait; touch-action: none;"></div>
            `);
        }

        if (this._watchdogTimer) clearTimeout(this._watchdogTimer);
        if (this._killSwitchTimer) clearTimeout(this._killSwitchTimer);

        this._watchdogTimer = setTimeout(() => {
            if (this._isProcessingTx) {
                getSys().showToast?.('الشبكة بطيئة بعض الشيء، جاري معالجة طلبك بأمان... الرجاء عدم إغلاق الصفحة.', 'warning');
            }
        }, 15000); 

        // 🛡️ مفتاح الطوارئ (Kill Switch)
        this._killSwitchTimer = setTimeout(() => {
            if (this._isProcessingTx) {
                getSys().showToast?.('انتهى وقت المعالجة وتأخر الخادم بالرد، تم تحرير الشاشة.', 'error');
                this._unlockUI(btn);
            }
        }, 60000);
        
        if (this._offlineHandler) window.removeEventListener('offline', this._offlineHandler);
        this._offlineHandler = () => {
            if (this._isProcessingTx) getSys().showToast?.('انقطع الاتصال بالإنترنت! النظام يحمي معاملتك الآن.', 'error');
        };
        window.addEventListener('offline', this._offlineHandler);
    },

    _unlockUI: function(btn) {
        this._isProcessingTx = false;
        
        const shield = document.getElementById('invisible-tx-shield');
        if (shield) shield.remove();
        
        if (btn) this._toggleButtonLoader(btn, false);
        
        if (this._watchdogTimer) { clearTimeout(this._watchdogTimer); this._watchdogTimer = null; }
        if (this._killSwitchTimer) { clearTimeout(this._killSwitchTimer); this._killSwitchTimer = null; }
        if (this._offlineHandler) { window.removeEventListener('offline', this._offlineHandler); this._offlineHandler = null; }
    },

    _applyTabFilter: function(filterKey, filterValue, element, renderFuncName) {
        if (element.classList.contains('active')) return;
        getSys().sfx?.('nav');
        const tabs = element.parentElement.querySelectorAll('.mf-tab');
        tabs.forEach(tab => tab.classList.remove('active'));
        element.classList.add('active');
        
        if (!DataManager.filters) DataManager.filters = { orders:'all', wallet:'all', payments:'all' };
        DataManager.filters[filterKey] = filterValue;
        if (RenderManager.limits) RenderManager.limits[filterKey] = 15;
        if (RenderManager[renderFuncName]) RenderManager[renderFuncName]();
    },

    setOrderFilter: function(val, el) { this._applyTabFilter('orders', val, el, 'renderOrders'); },
    setWalletFilter: function(val, el) { this._applyTabFilter('wallet', val, el, 'renderWallet'); },
    setPaymentFilter: function(val, el) { this._applyTabFilter('payments', val, el, 'renderPayments'); },

    jumpToTransaction: function(id, type) {
        getSys().sfx?.('nav');
        getSys().closeWallet?.();
        setTimeout(() => {
            if (type === 'purchase') getSys().openOrders?.(); else getSys().openMyPayments?.();
            
            const searchInput = document.getElementById((type === 'purchase') ? 'order-search-input' : 'pay-search-input');
            
            let displaySearchId = id;
            try {
                if (type === 'purchase') {
                    const orderObj = (LiveStoreData.orders || []).find(o => String(o.id) === String(id)) || { id: id };
                    displaySearchId = RenderHelpers.formatOrderId(orderObj);
                } else {
                    const depObj = (LiveStoreData.deposits || []).find(d => String(d.id) === String(id)) || { id: id };
                    displaySearchId = RenderHelpers.formatDepositId(depObj);
                }
            } catch (e) {
                displaySearchId = id; 
            }

            if (searchInput) searchInput.value = displaySearchId;
            if (RenderManager) RenderManager.highlightId = id; 
            
            if (type === 'purchase') { if(RenderManager.renderOrders) RenderManager.renderOrders(); } 
            else { if(RenderManager.renderPayments) RenderManager.renderPayments(); }
        }, 150);
    },    

    _validateKycAndSystem: function(actionType = 'purchase') {
        const sys = LiveStoreData.system || {};
        if (sys.freeze) { getSys().showToast?.(sys.freezeMsg || 'عذراً، العمليات المالية متوقفة مؤقتاً.', 'warning'); return false; }
        if (!DataManager || !DataManager.user) {
            getSys().showToast?.('يجب تسجيل الدخول أولاً', 'error');
            setTimeout(() => { if (DataManager.logout) DataManager.logout(); else window.location.href = 'login.html'; }, 1500); return false;
        }
        
        const u = DataManager.user;
        const isIdentityComplete = (String(u.isVerified) === 'true' || u.isVerified === true) || 
            ((u.phone && String(u.phone).trim() !== '') && 
             (u.country && String(u.country).trim() !== '') && 
             (u.baseCurrency && String(u.baseCurrency).trim() !== ''));
        
        if (!isIdentityComplete) {
            getSys().showToast?.('يرجى إكمال بيانات الحساب', 'error');
            setTimeout(() => { getSys().openModal?.('identity'); }, 800); return false;
        }
        
        const kycConfig = (LiveStoreData.settings || {}).kycConfig || { mode: 'off', targetedTiers: [] };
        let needsKyc = false;
        if (kycConfig.mode === 'all') needsKyc = true;
        else if ((kycConfig.mode === 'specific' || kycConfig.mode === 'spec') && (kycConfig.targetedTiers || []).map(String).includes(String(u.tierId || '1'))) needsKyc = true;
        
        if (needsKyc) {
            const status = String(u.kycStatus || 'none').toLowerCase();
            if (status !== 'approved' && status !== 'verified') {
                const actionName = actionType === 'deposit' ? 'الإيداع' : 'الشراء';
                if (status === 'pending') {
                    getSys().showToast?.(`هويتك قيد المراجعة لتتمكن من ${actionName}`, 'warning'); getSys().openKycStatusModal?.('pending');
                } else {
                    getSys().showToast?.(`حسابك يتطلب التوثيق لتتمكن من ${actionName}`, 'error'); setTimeout(() => { getSys().openModal?.('kyc-upload'); }, 800);
                }
                return false;
            }
        }
        return true;
    },

    openProdModal: function(id) {
        if (!this._validateKycAndSystem('purchase')) return;
        getSys().removeCoupon?.(true); getSys().resetUI?.();

        const originalProd = (LiveStoreData.prods || []).find(p => String(p.id) === String(id));
        if (!originalProd) return;

        let hasValidPrice = (originalProd.type === 'select' && Array.isArray(originalProd.options)) ? originalProd.options.some(opt => Number(opt.price || opt.fixedPriceUsd || 0) > 0) : Number(originalProd.price || originalProd.fixedPriceUsd || 0) > 0;
        if (!hasValidPrice) { getSys().showToast?.('عذراً، هذا المنتج قيد التسعير.', 'error'); getSys().sfx?.('error'); return; }

        DataManager.currentProd = structuredClone(originalProd);

        window.requestAnimationFrame(() => {
            const badgeContainer = document.getElementById('pm-badge-container');
            const nameEl = document.getElementById('pm-name');
            const favBtn = document.getElementById('pm-fav-btn');
            const descBox = document.getElementById('pm-desc-container');
            const dynOps = document.getElementById('pm-dynamic-ops');
            const staOps = document.getElementById('pm-static-ops');
            const inputContainer = document.getElementById('pm-input-container');
            const simpleQtyBox = document.getElementById('simple-qty-wrapper');

            if (badgeContainer) {
                const activeOffer = DataManager.getActiveOffer(DataManager.currentProd.id);
                if (activeOffer?.visualConfig?.grid && activeOffer.visualConfig.badgeStyle !== 'none') {
                    const v = activeOffer.visualConfig.grid;
                    badgeContainer.innerHTML = `<div class="offer-badge-base ${v.badgeStyle} ${RenderManager._getMappedColor(v.badgeColor)}" style="position:relative; top:0; right:0; width:fit-content; margin-bottom:5px;">${Utils.escapeHtml(v.badgeText)}</div>`;
                } else if (DataManager.currentProd.badgeText) {
                    badgeContainer.innerHTML = `<div class="offer-badge-base prod-badge badge-${DataManager.currentProd.badgeColor || 'red'}" style="position:relative; top:0; right:0; width:fit-content; margin-bottom:5px;">${Utils.safeText(DataManager.currentProd.badgeText)}</div>`;
                } else { badgeContainer.innerHTML = ''; }
            }

            if (nameEl) nameEl.innerText = DataManager.currentProd.name;
            if (favBtn) {
                const isFav = DataManager.isFavorite ? DataManager.isFavorite(DataManager.currentProd.id) : false;
                favBtn.classList.toggle('active', isFav); favBtn.innerHTML = `<i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
            }
            
            if (descBox) {
                if (DataManager.currentProd.description) { descBox.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${Utils.escapeHtml(DataManager.currentProd.description)}`; descBox.style.display = 'block'; } 
                else descBox.style.display = 'none';
            }

            if (dynOps) { dynOps.style.display = 'none'; dynOps.innerHTML = ''; dynOps.classList.remove('pm-ops-visible'); }
            if (staOps) staOps.style.display = 'none';
            if (simpleQtyBox) simpleQtyBox.style.display = 'none';
            getSys().hideQtyError?.();

            const createInput = (inpId, lbl) => `<div class="floating-group"><input type="text" id="${inpId}" class="floating-input" placeholder=" " autocomplete="off"><label class="floating-label">${Utils.escapeHtml(lbl || '')}</label></div>`;
            let inputHtml = '';

            if (DataManager.currentProd.type === 'double') { inputHtml += createInput('pm-inp-1', DataManager.currentProd.input1Label) + createInput('pm-inp-2', DataManager.currentProd.input2Label); } 
            else if (['single', 'counter'].includes(DataManager.currentProd.type)) { inputHtml += createInput('pm-inp-1', DataManager.currentProd.input1Label); } 
            else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) {
                if(simpleQtyBox) simpleQtyBox.style.display = 'block';
                const sQty = document.getElementById('simple-qty-val'); 
                if(sQty) {
                    sQty.value = 1;
                    sQty.oninput = (e) => { 
                        e.target.value = e.target.value.replace(/[^0-9٠-٩]/g, ''); 
                        getSys().updatePriceDisplay?.(); 
                    };
                    sQty.onblur = (e) => {
                        let minQ = parseInt(DataManager.currentProd.minQty) || 1;
                        let maxQ = parseInt(DataManager.currentProd.simpleMax) || 10;
                        let val = Utils.parseSafeNumber(e.target.value);
                        if (isNaN(val) || val < minQ) e.target.value = minQ;
                        else if (val > maxQ) e.target.value = maxQ;
                        getSys().updatePriceDisplay?.();
                        getSys().revalidateAppliedCoupon?.();
                    };
                }
            } else if (DataManager.currentProd.type === 'select') {
                inputHtml += createInput('pm-inp-1', DataManager.currentProd.input1Label);
                if(staOps) staOps.style.display = 'block';
                
                const sel = document.getElementById('pm-pack'), menu = document.getElementById('pkg-custom-menu'), triggerText = document.getElementById('pkg-selected-text');
                if (sel && menu) {
                    let selHtml = '', menuHtml = '';
                    const options = DataManager.currentProd.options || [];
                    options.forEach((pkg, idx) => {
                        selHtml += `<option value="${idx}">${Utils.escapeHtml(pkg.name)}</option>`;
                        menuHtml += `<div class="dropdown-item" data-idx="${idx}" data-name="${Utils.escapeHtml(pkg.name)}"><span>${Utils.escapeHtml(pkg.name)}</span></div>`;
                    });
                    sel.innerHTML = selHtml; menu.innerHTML = menuHtml;

                    if (options.length > 0) { sel.value = 0; if(triggerText) triggerText.textContent = options[0].name; if(menu.firstChild) menu.firstChild.classList.add('active'); } 
                    else { if(triggerText) triggerText.textContent = "لا توجد باقات"; }
                }
            }
            
            if(inputContainer) inputContainer.innerHTML = inputHtml;

            if (DataManager.currentProd.type === 'counter' && dynOps) {
                dynOps.classList.add('pm-ops-visible'); dynOps.style.display = 'block'; 
                dynOps.innerHTML = `<div class="pm-new-grid"><div class="pm-float-box"><input type="tel" id="pm-qty" inputmode="numeric" dir="ltr" placeholder=" "> <label>العدد</label></div><div class="pm-float-box readonly"><input type="text" id="pm-price-unit" readonly placeholder=" "><label>سعر القطعة</label></div></div>`; 

                const qInp = document.getElementById('pm-qty');
                if (qInp) {
                    let minQ = parseInt(DataManager.currentProd.minQty) || 1; qInp.value = minQ; 
                    qInp.oninput = (e) => { e.target.value = e.target.value.replace(/[^0-9٠-٩]/g, ''); getSys().updatePriceDisplay?.(); };
                    qInp.onblur = (e) => { 
                        let val = Utils.parseSafeNumber(e.target.value); 
                        if (isNaN(val) || val < minQ) { e.target.value = minQ; getSys().updatePriceDisplay?.(); } 
                        getSys().revalidateAppliedCoupon?.(); 
                    };
                }
            }

            getSys().updatePriceDisplay?.(); getSys().openModal?.('purchase');
        });
    },

    closePurchaseModal: function() { 
        if (this._isProcessingTx) return; 
        getSys().removeCoupon?.(true); getSys().closeModal?.('purchase');

        if (DataManager.currentProd) {
            const targetProdName = DataManager.currentProd.name; 
            setTimeout(() => {
                document.querySelectorAll('.product-card').forEach(card => {
                    if (card.querySelector('.product-name')?.innerText.trim() === targetProdName) {
                        const infoEl = card.querySelector('.card-info');
                        if (infoEl) { requestAnimationFrame(() => { infoEl.classList.add('shine-strong'); setTimeout(() => infoEl.classList.remove('shine-strong'), 2000); }); }
                    }
                });
            }, 300);
        }
        DataManager.currentProd = null;
    },

    closePurchaseSuccess: function() { getSys().closeModal?.('purchase-success'); },
    closeGeneralSuccess: function() { getSys().closeModal?.('success'); },
    
    updateSimpleQty: function(change) {
        let el = document.getElementById('simple-qty-val'); if (!el || !DataManager.currentProd) return;
        let val = Utils.parseSafeNumber(el.value), max = DataManager.currentProd.simpleMax || 10, min = DataManager.currentProd.minQty || 1, newVal = val + change;
        if (newVal > max) { getSys().sfx?.('error'); getSys().showQtyError?.(`تجاوزت الحد (${max})`); return; }
        if (newVal < min) return; 
        el.value = newVal; getSys().hideQtyError?.(); getSys().updatePriceDisplay?.(); getSys().revalidateAppliedCoupon?.();
    },

    updatePriceDisplay: function() {
        if (!DataManager.currentProd || typeof DataManager.getPricingLocal !== 'function') return;
        
        window.requestAnimationFrame(() => {
            if (!DataManager.currentProd) return; 
            
            let qty = 1; let optIdx = null;

            if (DataManager.currentProd.type === 'counter') qty = Math.max(1, Utils.parseSafeNumber(document.getElementById('pm-qty')?.value)) || 1; 
            else if (DataManager.currentProd.type === 'select') optIdx = Number(document.getElementById('pm-pack')?.value || 0); 
            else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) qty = Math.max(1, Utils.parseSafeNumber(document.getElementById('simple-qty-val')?.value) || 1);

            const result = DataManager.getPricingLocal(DataManager.currentProd, qty, optIdx, DataManager.appliedCoupon);
            if (!result || typeof result !== 'object') return;

            const unitInput = document.getElementById('pm-price-unit'); if (unitInput) unitInput.value = result.unitText || '';
            const beautifulTotalHtml = (typeof RenderHelpers !== 'undefined') ? RenderHelpers.formatMoney(result.totalLocalBase, result.displayCurrency) : (result.totalText || '0.00');

            const totalInput = document.getElementById('pm-total');
            if (totalInput) { if (totalInput.tagName === 'INPUT') totalInput.value = result.totalText || ''; else totalInput.innerHTML = beautifulTotalHtml; }

            const currPriceEl = document.getElementById('pm-price'), oldPriceEl = document.getElementById('oldPriceDisplay'), priceBox = document.getElementById('priceBox');
            
            if (result.hasDiscount) {
                if (priceBox) priceBox.classList.add('active');
                if (oldPriceEl) oldPriceEl.innerHTML = (typeof RenderHelpers !== 'undefined') ? RenderHelpers.formatMoney(result.oldTotalLocalBase, result.displayCurrency) : ''; 
                if (currPriceEl) currPriceEl.innerHTML = beautifulTotalHtml; 
            } else {
                if (priceBox) priceBox.classList.remove('active');
                if (currPriceEl) currPriceEl.innerHTML = beautifulTotalHtml; 
            }
        });
    },

    handlePurchaseSubmit: async function() { 
        if (this._isProcessingTx || !DataManager.currentProd || !this._validateKycAndSystem('purchase')) return;
        
        const inp1El = document.getElementById('pm-inp-1'), inp2El = document.getElementById('pm-inp-2'), qtyEl = document.getElementById('simple-qty-val');
        const keepKeyboardOpen = () => { setTimeout(() => { if (inp1El && !inp1El.disabled) inp1El.focus(); else if (qtyEl && !qtyEl.disabled) qtyEl.focus(); }, 50); };
        
        const showInlineError = (element, message) => {
            if(!element) return;
            element.classList.add('input-error'); const parent = element.parentNode;
            const oldMsg = parent.querySelector('.input-error-text'); if(oldMsg) oldMsg.remove();
            const errorMsg = document.createElement('div'); errorMsg.className = 'input-error-text'; errorMsg.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${message}`;
            if (element.nextSibling) parent.insertBefore(errorMsg, element.nextSibling); else parent.appendChild(errorMsg);
            element.addEventListener('input', function() { element.classList.remove('input-error'); parent.querySelector('.input-error-text')?.remove(); }, {once: true});
        };

        let qty = 1; let optIdx = null; let isValid = true; let finalInputStr = '';
        const inp1 = inp1El ? inp1El.value.trim().replace(/\|/g, '-') : '';
        const inp2 = inp2El ? inp2El.value.trim().replace(/\|/g, '-') : '';

        const getSafeLabel = (adminVal, defaultVal) => {
            if (adminVal && typeof adminVal === 'string' && adminVal.trim() !== '') return adminVal.trim();
            return defaultVal;
        };

        if (DataManager.currentProd.type === 'double') { 
            const lbl1 = getSafeLabel(DataManager.currentProd.input1Label, 'معرف الحساب');
            const lbl2 = getSafeLabel(DataManager.currentProd.input2Label, 'تفاصيل إضافية');
            
            finalInputStr = `${lbl1}: ${inp1} | ${lbl2}: ${inp2}`; 
            
            if(!inp1) { showInlineError(inp1El, 'يرجى ملء الحقل الأول'); isValid = false; inp1El.focus(); }
            if(!inp2) { if(inp2El) { showInlineError(inp2El, 'يرجى ملء الحقل الثاني'); if(isValid) inp2El.focus(); isValid = false; } }
            
        } else if (DataManager.currentProd.type === 'single' || DataManager.currentProd.type === 'counter' || DataManager.currentProd.type === 'select') { 
            const lbl1 = getSafeLabel(DataManager.currentProd.input1Label, 'معرف الحساب');
            finalInputStr = `${lbl1}: ${inp1}`; 
            
            if(inp1El && !inp1) { showInlineError(inp1El, 'يرجى ملء الحقل المطلوب'); isValid = false; inp1El.focus(); } 
            
        } else if (DataManager.currentProd.type === 'simple') { 
            finalInputStr = ""; 
        } else {
            finalInputStr = inp1;
            if(inp1El && !inp1) { showInlineError(inp1El, 'يرجى ملء الحقل المطلوب'); isValid = false; inp1El.focus(); }
        }

        if (DataManager.currentProd.type === 'counter') { 
            const minQ = parseInt(DataManager.currentProd.minQty) || 1; qty = Math.max(minQ, Utils.parseSafeNumber(document.getElementById('pm-qty')?.value)) || minQ;
        } else if (DataManager.currentProd.type === 'select') { 
            optIdx = Number(document.getElementById('pm-pack')?.value || 0); 
        } else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) { 
            const minQ = parseInt(DataManager.currentProd.minQty) || 1, maxQ = parseInt(DataManager.currentProd.simpleMax) || 10;
            qty = Utils.parseSafeNumber(qtyEl?.value); if(isNaN(qty) || qty < minQ) qty = minQ;
            if(qty > maxQ) { showInlineError(qtyEl.parentNode, `أقصى كمية ${maxQ}`); isValid = false; qtyEl.focus(); }
        }

        if(!isValid) { getSys().sfx?.('error'); return; }

        const pricingCheck = DataManager.getPricingLocal(DataManager.currentProd, qty, optIdx, DataManager.appliedCoupon);
        if (pricingCheck && pricingCheck.pricingSnapshot && pricingCheck.pricingSnapshot.totalOriginalPrice <= 0) {
            getSys().showToast?.('عذراً، لا يمكن الشراء بسعر صفر.', 'error'); getSys().sfx?.('error'); return;
        }

        const submitBtn = document.getElementById('btn-confirm-buy') || document.querySelector('.pm-btn-gold');
        
        this._lockUI(submitBtn);

        try {
            const result = await DataManager.confirmPurchase(DataManager.currentProd, qty, optIdx, finalInputStr, DataManager.appliedCoupon);
            if (result.success) {
                // 1. صوت النجاح
                getSys().sfx?.('success'); 
                
                // 2. 🚀 رفع عداد الجرس فوراً كخدعة بصرية سريعة قبل السيرفر (للطلبات الفورية فقط)
                if (result.isAutoDelivered && typeof getSys().updateNotifBadges === 'function') {
                    const currentBadge = document.getElementById('header-notif-badge');
                    const currentCount = currentBadge ? (parseInt(currentBadge.innerText) || 0) : 0;
                    getSys().updateNotifBadges(currentCount + 1);
                }

                // 3. إغلاق وتحديث
                this.closePurchaseModal();
                if(typeof DataManager.syncUser === 'function') DataManager.syncUser(); 
                getSys().updateDisplayBalance?.();

                // 4. فتح النافذة (مودال) بدون أي توست مزعج
                setTimeout(() => {
                    getSys().openModal?.('purchase-success');
                    const titleEl = document.getElementById('purchase-success-title'), descEl = document.getElementById('purchase-success-desc'), codeDisplayContainer = document.getElementById('purchase-code-display');

                    if (result.isAutoDelivered && result.deliveredCodeText) {
                        if (titleEl) titleEl.innerText = 'تم تنفيذ الطلب بنجاح!';
                        if (descEl) descEl.innerHTML = 'تم إصدار الكود بنجاح، ومحفوظ في <span class="smart-link" data-action="navigate-orders-success">سجل طلباتك</span>.';
                        if (codeDisplayContainer) {
                            codeDisplayContainer.innerHTML = `<div class="dc-title"><i class="fa-solid fa-key"></i> الأكواد المستلمة:</div><div style="max-height: 200px; overflow-y: auto;">${UIBuilders.buildCodesList(result.deliveredCodeText)}</div>`;
                            codeDisplayContainer.classList.remove('d-none');
                        }
                    } else {
                        if (titleEl) titleEl.innerText = 'تم استلام طلبك!';
                        if (descEl) descEl.innerHTML = 'طلبك قيد التنفيذ، تابعه عبر <span class="smart-link" data-action="navigate-orders-success">سجل الطلبات</span>.';
                        if (codeDisplayContainer) { codeDisplayContainer.innerHTML = ''; codeDisplayContainer.classList.add('d-none'); }
                    }
                }, 150);
            } else { 
                // ✔️ التوست  يُعرض فقط في حالة الخطأ
                getSys().showToast?.(result.msg || 'فشلت العملية', 'error'); 
                keepKeyboardOpen(); 
            }
        } catch (err) { 
            getSys().showToast?.('حدث خطأ في النظام', 'error'); 
        } finally { 
            this._unlockUI(submitBtn); 
        }
    },    _manageDepositModalState: function(isStep2) {
        const modal = document.getElementById('balance-modal');
        if (!modal) return;

        const titleEl = modal.querySelector('.title-badge.pm-title-badge, .pm-title-badge, .title-badge');
        const headerBtn = modal.querySelector('#bal-action-btn, .pm-close-std');

        if (isStep2) {
            modal.classList.add('is-step-2');
            if (titleEl) {
                const icon = titleEl.querySelector('i');
                titleEl.innerHTML = (icon ? icon.outerHTML + ' ' : '') + 'إتمام الإيداع';
            }
            if (headerBtn) {
                headerBtn.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
                headerBtn.setAttribute('data-action', 'back-pay-step');
                if (!headerBtn._backBound) {
                    headerBtn.addEventListener('click', (e) => {
                        if (headerBtn.getAttribute('data-action') === 'back-pay-step') {
                            e.preventDefault(); e.stopPropagation();
                            this.backToPayMethods();
                        }
                    });
                    headerBtn._backBound = true;
                }
            }
        } else {
            modal.classList.remove('is-step-2');
            if (titleEl) {
                const icon = titleEl.querySelector('i');
                titleEl.innerHTML = (icon ? icon.outerHTML + ' ' : '') + 'إيداع رصيد';
            }
            if (headerBtn) {
                headerBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                headerBtn.setAttribute('data-action', 'close-balance');
            }
        }
    },

    openAddBalance: function() {
        if (!this._validateKycAndSystem('deposit')) return;
        getSys().resetUI?.();
        
        this._manageDepositModalState(false);

        const blockedView = document.getElementById('bal-blocked-view'), normalView = document.getElementById('bal-normal-view');
        if(blockedView) blockedView.style.display = 'none'; 
        if(normalView) normalView.style.display = ''; 
        
        if(RenderManager.renderPayMethods) RenderManager.renderPayMethods(); 
        getSys().openModal?.('balance');
    },

    changeDepositCurrency: function(curr) {
        this.currentPayCurrency = curr;
        window.requestAnimationFrame(() => {
            const dropdown = document.getElementById('bal-currency-dropdown');
            const selectedTxt = document.getElementById('bal-selected-currency');
            const items = document.querySelectorAll('#bal-currency-list .dropdown-item');
            
            if (selectedTxt) selectedTxt.innerText = curr; 
            
            if (dropdown) dropdown.classList.remove('open');
            items.forEach(item => item.classList.toggle('active', item.dataset.curr === curr));
            const amtCurr = document.getElementById('bal-amount-curr'); if (amtCurr) amtCurr.innerText = curr;
            this.calcFee();
        });
    },

    selectPay: function(id) {
        const payments = LiveStoreData.payments || [];
        const modal = document.getElementById('balance-modal');
        this.currentPayment = payments.find(p => String(p.id) === String(id));
        if (!this.currentPayment || !modal) return;
        
        this._manageDepositModalState(true);
        modal.scrollTop = 0;
        
        const section = document.getElementById('bal-method-info-section');
        if (!section) return;
        
        const p = this.currentPayment;
        let copyLinesHtml = '', hasFields = false;
        const fieldsArray = p.detailFields || p.details || p.fields || [];
        
        const createSmartLine = (text, canCopy) => {
            const safeText = Utils.escapeHtml(String(text));
            if (canCopy) return `<div class="smart-copy-line is-copyable" data-action="copy-text" data-text="${safeText}"><div style="display: flex; flex-direction: column; justify-content: center; text-align: right; width: 100%;"><span class="scl-text num-en" style="font-size: 14.5px; font-weight: 800;">${safeText}</span></div><i class="fa-regular fa-copy scl-icon"></i></div>`;
            return `<div class="smart-copy-line not-copyable"><div style="display: flex; flex-direction: column; justify-content: center; text-align: right; width: 100%;"><span class="scl-text" style="font-size: 13.5px; font-weight: 700; color: var(--text-main); line-height: 1.6;">${safeText.replace(/\n/g, '<br>')}</span></div></div>`;
        };

        if (Array.isArray(fieldsArray) && fieldsArray.length > 0) {
            hasFields = true;
            fieldsArray.forEach((field) => {
                const val = typeof field === 'string' ? field : field.text || field.value || field.v || '';
                const canCopy = typeof field === 'string' ? true : (field.copyable !== false);
                if (val && String(val).trim() !== '') copyLinesHtml += createSmartLine(val, canCopy);
            });
        }
        if (!hasFields && p.number) copyLinesHtml += createSmartLine(p.number, true);
        
        const infoData = p.info || p.note || p.instructions;
        if (infoData && String(infoData).trim() !== '') {
            copyLinesHtml += `<div class="smart-copy-line not-copyable" style="background: rgba(var(--primary-rgb), 0.05); border: 1px dashed rgba(var(--primary-rgb), 0.3);"><div style="display: flex; flex-direction: column; gap: 4px; text-align: right; width: 100%;"><span style="font-size: 11px; color: var(--primary); font-weight: 900; opacity: 0.9;"><i class="fa-solid fa-circle-info"></i> تعليمات هامة</span><span class="scl-text" style="font-size: 12.5px; line-height: 1.6; color: var(--text-main);">${Utils.escapeHtml(String(infoData)).replace(/\n/g, '<br>')}</span></div></div>`;
        }
        let copyContainer = copyLinesHtml ? `<div class="clean-list-container">${copyLinesHtml}</div>` : '';

        let availableCurrencies = [];
        if (p.currencies && typeof p.currencies === 'string') availableCurrencies.push(...p.currencies.split(',').map(c => c.trim().toUpperCase()).filter(Boolean));
        else if (p.currency) availableCurrencies.push(String(p.currency).toUpperCase());
        if (p.currencySettings) availableCurrencies.push(...Object.keys(p.currencySettings).map(c => c.toUpperCase()));

        let uniqueCurrencies = [...new Set(availableCurrencies)];
        if (uniqueCurrencies.length === 0) uniqueCurrencies = [(DataManager.user?.baseCurrency || 'USD').toUpperCase()];
        this.currentPayCurrency = uniqueCurrencies[0];
        
        window.requestAnimationFrame(() => {
            section.innerHTML = UIBuilders.buildDepositForm(p, copyContainer, uniqueCurrencies.length === 1, this.currentPayCurrency, uniqueCurrencies.map((c, i) => `<div class="dropdown-item ${i === 0 ? 'active' : ''}" data-curr="${c}">${c}</div>`).join(''), (DataManager.user?.baseCurrency || 'USD').toUpperCase());
            this.calcFee(); getSys().sfx?.('nav');
        });
    },

    backToPayMethods: function(playSound = true) {
        const modal = document.getElementById('balance-modal');
        if (!modal) return;

        this._manageDepositModalState(false);
        modal.scrollTop = 0;
        modal.querySelectorAll('.pm-scroll-content, .scrollable, .modal-content').forEach(s => s.scrollTop = 0);

        this.currentReceiptData = null; this._currentImageJobId = null; 
        const preview = document.getElementById('bal-img-preview');
        if (preview && preview.src && preview.src.startsWith('blob:')) { URL.revokeObjectURL(preview.src); preview.src = ''; }
        this.pendingReceiptFile = null;

        setTimeout(() => {
            const section = document.getElementById('bal-method-info-section');
            if (section && !modal.classList.contains('is-step-2')) section.innerHTML = ''; 
        }, 400);

        if (playSound) getSys().sfx?.('nav');
    },

    closeBalanceModal: function() {
        if (this._isProcessingTx) return; 
        const modal = document.getElementById('balance-modal');
        getSys().closeModal?.('balance');
        if (modal) {
            modal.addEventListener('transitionend', () => { this.backToPayMethods(false); }, { once: true });
        }
    },    
    
    previewReceipt: function(inp) { 
        const file = inp.files && inp.files[0];
        this._currentImageJobId = Date.now(); const currentJobId = this._currentImageJobId;
        
        const preview = document.getElementById('bal-img-preview');
        if (preview && preview.src && preview.src.startsWith('blob:')) { URL.revokeObjectURL(preview.src); preview.src = ''; }
        
        if(!file) { 
            this.pendingReceiptFile = null; 
            this.currentReceiptData = null; 
            if(preview) { preview.style.display = 'none'; preview.src = ''; }
            return; 
        }

        if (file.size > 10 * 1024 * 1024) { 
            getSys().showToast?.('حجم الملف كبير جداً. الحد 10MB.', 'error'); 
            inp.value = ''; 
            this.pendingReceiptFile = null;
            if(preview) { preview.style.display = 'none'; preview.src = ''; }
            return; 
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) { 
            getSys().showToast?.('نوع الملف غير مدعوم.', 'error'); 
            inp.value = ''; 
            this.pendingReceiptFile = null; 
            if(preview) { preview.style.display = 'none'; preview.src = ''; }
            return; 
        }

        const isPdf = file.type === 'application/pdf';
        const uploadBox = document.getElementById('bal-upload-box'); 

        const setUploadSuccessUI = (type) => {
            if(uploadBox) {
                uploadBox.classList.add('has-file');
                const iconClass = type === 'pdf' ? 'fa-file-pdf' : 'fa-check-circle';
                uploadBox.innerHTML = `<div class="bal-upload-success-row"><i class="fa-solid ${iconClass} bal-upload-success-icon"></i><span class="bal-upload-success-text">${type === 'pdf' ? 'تم الإرفاق (PDF)' : 'تمت معالجة الصورة'}</span></div>`;
            }
        };

        if(isPdf) {
            this.pendingReceiptFile = file; this.currentReceiptData = null; 
            if(preview) preview.style.display = 'none'; setUploadSuccessUI('pdf'); 
        } else {
            if(uploadBox) uploadBox.innerHTML = `<div class="bal-upload-success-row"><i class="fa-solid fa-spinner fa-spin bal-upload-success-icon"></i><span class="bal-upload-success-text">جاري المعالجة...</span></div>`;

            const reader = new FileReader(); 
            reader.onload = e => { 
                if (this._currentImageJobId !== currentJobId) return; 
                const img = new Image();
                img.onload = () => {
                    requestAnimationFrame(() => {
                        if (this._currentImageJobId !== currentJobId) return;
                        try {
                            const canvas = document.createElement('canvas');
                            let width = img.width, height = img.height; const MAX_SIZE = 1200; 
                            if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
                            else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                            
                            canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); 
                            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
                            
                            canvas.toBlob((blob) => {
                                if (this._currentImageJobId !== currentJobId) return; 
                                const safeName = file.name ? file.name.replace(/\.[^/.]+$/, "") : "receipt";
                                this.pendingReceiptFile = new File([blob], `${safeName}.webp`, { type: 'image/webp' });
                                
                                if(preview) { preview.src = URL.createObjectURL(blob); preview.style.display = 'block'; preview.className = 'bal-receipt-preview-new'; }
                                setUploadSuccessUI('image');
                                canvas.width = 0; canvas.height = 0; img.src = '';
                            }, 'image/webp', 0.75);
                        } catch (err) {
                            getSys().showToast?.('تعذر معالجة الصورة', 'error');
                            if (uploadBox) uploadBox.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>'; inp.value = '';
                        }
                    });
                };
                img.src = e.target.result;
            }; 
            reader.readAsDataURL(file); 
        }
    },
    
    calcFee: function() {
        const input = document.getElementById('bal-amount');
        if (!input || !DataManager || !this.currentPayment) return;
        
        const amount = this._parseSafeAmount(input.value);
        const payCurr = (this.currentPayCurrency || '').toUpperCase();
        if (typeof DataManager.calculateDepositFee !== 'function') return;
        
        const result = DataManager.calculateDepositFee(amount, this.currentPayment, payCurr);
        
        window.requestAnimationFrame(() => {
            const errorBox = document.getElementById('bal-amount-error'), submitBtn = document.getElementById('btn-submit-deposit'), netDisplay = document.getElementById('calc-net'), netWrap = document.getElementById('bal-net-wrap'), limitsBar = document.getElementById('bal-limits-bar');
            const s = (this.currentPayment.currencySettings && this.currentPayment.currencySettings[payCurr]) ? this.currentPayment.currencySettings[payCurr] : this.currentPayment;

            const sysSettings = LiveStoreData.settings || {};
            const GLOBAL_MAX_LIMIT_USD = parseFloat(sysSettings.globalMaxDepositUsd) || 5000;
            let dynamicGlobalLimit = GLOBAL_MAX_LIMIT_USD;

            try {
                if (payCurr !== 'USD' && typeof FinancialEngine !== 'undefined') {
                    const rates = DataManager.getRates ? DataManager.getRates() : {};
                    dynamicGlobalLimit = FinancialEngine.convertViaUSD(GLOBAL_MAX_LIMIT_USD, 'USD', payCurr, rates, 'deposit');
                }
            } catch (e) {}
            
            const methodMaxLimit = parseFloat(s.max) || 0;
            const finalMaxLimit = methodMaxLimit > 0 ? Math.min(methodMaxLimit, dynamicGlobalLimit) : dynamicGlobalLimit;

            if (amount > 0) {
                if (parseFloat(s.min) > 0 && amount < parseFloat(s.min)) { result.isValid = false; result.msg = `الحد الأدنى هو ${s.min}`; } 
                else if (amount > finalMaxLimit) { result.isValid = false; result.msg = `الحد الأعلى هو ${Number(finalMaxLimit).toLocaleString('en-US')}`; }
            }
            
            if (limitsBar) {
                const itemsHtml = UIBuilders.buildLimitsBar(parseFloat(s.fee)||0, payCurr, s.feeUnit||s.unit||'percent', s.feeType||'fee', parseFloat(s.min)||0, parseFloat(s.max)||0);
                if (itemsHtml.length === 0) limitsBar.style.display = 'none'; else { limitsBar.style.display = 'flex'; limitsBar.className = `compact-limits-bar count-${itemsHtml.length}`; limitsBar.innerHTML = itemsHtml.join(''); }
            }

            if (!result.isValid) {
                input.classList.toggle('input-invalid', amount > 0);
                if (errorBox) { errorBox.innerHTML = (amount > 0) ? `<i class="fa-solid fa-circle-exclamation"></i> ${result.msg}` : ''; errorBox.style.display = (amount > 0 && result.msg) ? 'block' : 'none'; errorBox.classList.remove('d-none'); }
                if (submitBtn) submitBtn.disabled = true; 
                if (netDisplay) netDisplay.innerText = "0.00";
                if (netWrap) netWrap.classList.remove('has-value');
            } else {
                input.classList.remove('input-invalid');
                if (errorBox) { errorBox.style.display = 'none'; errorBox.classList.add('d-none'); }
                if (submitBtn) submitBtn.disabled = false;
                this.pendingDepositNetBase = result.netBase;
                if (netDisplay) netDisplay.innerText = result.netBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                if (netWrap) netWrap.classList.add('has-value'); 
            }
        });
    },

    handleBalanceSubmit: async function(currency) {
        if (this._isProcessingTx || !this._validateKycAndSystem('deposit')) return;
        
        const input = document.getElementById('bal-amount');
        const amount = this._parseSafeAmount(input ? input.value : '');
        if (isNaN(amount) || amount <= 0) { getSys().showToast?.('أدخل مبلغ إيداع صحيح', 'error'); return; }
        
        const payCurr = currency || this.currentPayCurrency || 'USD';

        if (this.currentPayment && this.currentPayment.reqProof !== false && !this.pendingReceiptFile) {
            getSys().showToast?.('أرفق إشعار الدفع أولاً', 'error');
            const uploadBox = document.getElementById('bal-upload-box');
            if (uploadBox) { 
                uploadBox.style.animation = 'none'; void uploadBox.offsetWidth; 
                uploadBox.style.animation = 'shake-anim 0.3s ease-in-out'; 
                uploadBox.style.border = '1px solid var(--danger)'; 
                setTimeout(() => uploadBox.style.border = '', 1000); 
            }
            return; 
        }

        let methodMaxLimit = 0;
        if (this.currentPayment) { 
            const s = (this.currentPayment.currencySettings && this.currentPayment.currencySettings[payCurr]) ? this.currentPayment.currencySettings[payCurr] : this.currentPayment; 
            methodMaxLimit = parseFloat(s.max) || 0; 
        }
        
        const sysSettings = LiveStoreData.settings || {};
        const GLOBAL_MAX_LIMIT_USD = parseFloat(sysSettings.globalMaxDepositUsd) || 5000;
        let dynamicGlobalLimit = GLOBAL_MAX_LIMIT_USD;
        
        try { 
            if (payCurr !== 'USD' && typeof FinancialEngine !== 'undefined') { 
                const rates = DataManager.getRates ? DataManager.getRates() : {}; 
                dynamicGlobalLimit = FinancialEngine.convertViaUSD(GLOBAL_MAX_LIMIT_USD, 'USD', payCurr, rates, 'deposit'); 
            } 
        } catch (e) {}

        const finalLimit = methodMaxLimit > 0 ? Math.min(methodMaxLimit, dynamicGlobalLimit) : dynamicGlobalLimit;
        if (amount > finalLimit) { 
            const symbol = RenderHelpers?.getCurrencySymbolText ? RenderHelpers.getCurrencySymbolText(payCurr) : payCurr; 
            getSys().showToast?.(`الحد الأقصى هو ${Number(finalLimit).toLocaleString('en-US')} ${symbol}`, 'error'); 
            return; 
        }

        let methodMinLimit = 0;
        if (this.currentPayment) { 
            const s = (this.currentPayment.currencySettings && this.currentPayment.currencySettings[payCurr]) ? this.currentPayment.currencySettings[payCurr] : this.currentPayment; 
            methodMinLimit = parseFloat(s.min) || 0; 
        }
        
        if (methodMinLimit > 0 && amount < methodMinLimit) {
            getSys().showToast?.(`الحد الأدنى المسموح به هو ${methodMinLimit}`, 'error');
            if (input) {
                input.style.animation = 'none'; void input.offsetWidth; 
                input.style.animation = 'shake-anim 0.3s ease-in-out';
                input.style.borderColor = 'var(--danger)';
                setTimeout(() => input.style.borderColor = '', 1500);
            }
            return;
        }
        
        const submitBtn = document.querySelector('[data-action="submit-balance"]'); 
        this._lockUI(submitBtn);
        
        let uploadedReceiptUrl = null;
        try {
            if (this.pendingReceiptFile) {
                if (!StoreDB || typeof StoreDB.uploadImage !== 'function') throw new Error("نظام الرفع غير متوفر.");
                const userId = DataManager.user?.uid || DataManager.user?.id || 'unknown';
                const safeFileName = `deposit_${userId}_${Date.now()}.webp`;
                uploadedReceiptUrl = await StoreDB.uploadImage(this.pendingReceiptFile, 'receipts', safeFileName, false);
            }

            const result = await DataManager.submitBalanceRequest(amount, this.currentPayment, payCurr, uploadedReceiptUrl);
            
            if (result.success) {
                // ❌ تم الإزالة هنا لعدم تكرار الإشعار والاكتفاء بالنافذة (Modal)
                getSys().sfx?.('success'); 
                this.closeBalanceModal();
                if (typeof DataManager.syncUser === 'function') DataManager.syncUser();
                setTimeout(() => getSys().openModal?.('success'), 150);
            } else { 
                // ✔️ التوست يُعرض فقط في حالة الخطأ
                if (uploadedReceiptUrl && StoreDB.deleteImageByUrl) StoreDB.deleteImageByUrl(uploadedReceiptUrl).catch(()=>{});
                getSys().showToast?.(result.msg || 'تعذر إرسال الطلب', 'error'); 
            }
        } catch (error) { 
            if (uploadedReceiptUrl && StoreDB.deleteImageByUrl) StoreDB.deleteImageByUrl(uploadedReceiptUrl).catch(()=>{});
            console.error("🚨 Client-Side Deposit Exception:", error);
            getSys().showToast?.('حدث خطأ أثناء الاتصال بالخادم.', 'error'); 
        } 
        finally { 
            this._unlockUI(submitBtn); 
        }
    },

    togglePayDetail: function(headerElement) {
        if (!headerElement) return; const card = headerElement.closest('.pay-history-card'); if (!card) return;
        window.requestAnimationFrame(() => {
            const det = card.querySelector('.ph-details-body'), arrow = headerElement.querySelector('.fa-chevron-down, .fa-angle-down, .fa-chevron-left, .ph-arrow-btn, .ph-arrow');
            if (det) { const isOpen = det.classList.toggle('is-open'); if(arrow) arrow.classList.toggle('is-open', isOpen); }
        }); getSys().sfx?.('nav');
    },

    toggleWalletStats: function(btn) { const drawer = document.getElementById('walletStatsDrawer'); if (drawer) drawer.classList.contains('active') ? this.closeWalletStats() : this.openWalletStats(btn); },
    openWalletStats: function(btn) { window.requestAnimationFrame(() => { document.getElementById('walletStatsDrawer')?.classList.add('active'); if (btn) btn.classList.add('open'); document.getElementById('wallet-modal')?.classList.add('drawer-blur-active'); }); getSys().sfx?.('nav'); },
    closeWalletStats: function() { window.requestAnimationFrame(() => { document.getElementById('walletStatsDrawer')?.classList.remove('active'); const wModal = document.getElementById('wallet-modal'); if (wModal) { wModal.classList.remove('drawer-blur-active'); wModal.querySelector('.detail-arrow')?.classList.remove('open'); } }); },
    
    openDetail: function(e, type, id) {
        getSys().resetUI?.(); const content = document.getElementById('tx-detail-content'); if (!content) return;
        const html = UIBuilders.buildTransactionDetail(type, id, LiveStoreData, DataManager);
        if (html) { window.requestAnimationFrame(() => { content.innerHTML = html; getSys().openModal?.('tx-detail'); }); }
    },

    closePayReceipt: function() {
        window.requestAnimationFrame(() => {
            const lightbox = document.getElementById('pay-receipt-lightbox');
            if (lightbox) {
                lightbox.classList.remove('active');
                setTimeout(() => { const img = document.getElementById('pay-receipt-img'); if (img) img.src = ''; }, 300);
            }
        });
    }
};
