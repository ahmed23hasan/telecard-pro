// ============================================================================
// 💳 وحدة الدفع والمنتجات (uiFinance.js) - الإصدار المؤسسي V18.6 💎
// 🎯 الوظيفة: نوافذ الشراء، الإيداعات، المعاملات المالية، وتأمين الطلبات
// 🚀 التحديثات المعمارية الصارمة (V18.6 - UX & Transaction Integrity Patch):
// 1. Ghost Transaction Shield 🛡️: إزالة (Promise.race) من الواجهة لمنع تكرار عمليات الدفع بالخلفية.
// 2. DOM Detachment Guard 🛡️: منع تسرب الذاكرة عند محاولة تلميع كروت منتجات تم إخفاؤها.
// 3. Receipt Clear Button 🛡️: إضافة دالة تفريغ الإشعار بأمان وتدمير الـ Blob من الذاكرة العشوائية.
// 4. Limits Bar DOM Thrashing Fix: رسم شريط حدود الإيداع مرة واحدة لمنع وميض الواجهة.
// ============================================================================

import * as Utils from '../utils.js';
import { DataManager, LiveStoreData, StoreDB } from '../dataManager.js';
import { RenderManager } from '../renderManager.js';
import { RenderHelpers } from '../core/renderHelpers.js';
import { FinancialEngine } from '../core/financialEngine.js';
import { UIBuilders } from './uiBuilders.js';

// التوجيه الآمن للموزع المركزي (UIManager)
const getSys = () => {
    if (window.UIManager) return window.UIManager;
    if (window.ClientSystem) return window.ClientSystem;
    return new Proxy({}, { get: (target, prop) => () => { console.error(`🚨 System not ready for: ${String(prop)}`); } });
};

export const UIFinance = {

    _watchdogTimer: null,
    _amountTypingTimer: null,
    
    _offlineHandler: function() {
        const sys = getSys();
        if (sys.State?.isProcessingTx) {
            sys.showToast?.('انقطع الاتصال بالإنترنت! النظام يحمي معاملتك الآن.', 'error');
        }
    },

    _parseSafeAmount: function(val) {
        if (!val) return 0;
        return Utils.parseSafeNumber(val);
    },
    
    _toggleButtonLoader: function(btn, isLoading) {
        if (!btn) return;
        try {
            if (isLoading) {
                if (btn._originalHtml === undefined && !btn.querySelector('.btn-content')) {
                    btn._originalHtml = btn.innerHTML; 
                }
                btn.disabled = true;
                btn.classList.add('is-loading', 'tx-processing-safe');
                
                if (!btn.querySelector('.btn-content')) {
                    const currentWidth = btn.offsetWidth;
                    if (currentWidth > 0) btn.style.width = `${currentWidth}px`;
                    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="margin-inline-end: 6px;"></i> جاري المعالجة...`;
                }
            } else {
                btn.disabled = false;
                btn.classList.remove('is-loading', 'tx-processing-safe');
                
                if (btn._originalHtml !== undefined) {
                    btn.innerHTML = btn._originalHtml;
                    btn.style.width = '';
                    btn._originalHtml = undefined;
                }
            }
        } catch (e) {
            btn.disabled = false;
            btn.classList.remove('is-loading', 'tx-processing-safe');
        }
    },

    _lockUI: function(btn) {
        const sys = getSys();
        if (sys.State) sys.State.isProcessingTx = true;
        this._toggleButtonLoader(btn, true);

        const shieldId = 'invisible-tx-shield';
        if (!document.getElementById(shieldId)) {
            document.body.insertAdjacentHTML('beforeend', `<div id="${shieldId}" class="tx-shield-overlay master-overlay"></div>`);
        }

        if (this._watchdogTimer) clearTimeout(this._watchdogTimer);

        this._watchdogTimer = setTimeout(() => {
            if (sys.State?.isProcessingTx) {
                sys.showToast?.('الشبكة بطيئة بعض الشيء، جاري معالجة طلبك بأمان... الرجاء عدم إغلاق الصفحة.', 'warning');
            }
        }, 15000); 
        
        window.removeEventListener('offline', this._offlineHandler); 
        window.addEventListener('offline', this._offlineHandler);
    },

    _unlockUI: function(btn) {
        const sys = getSys();
        if (sys.State) sys.State.isProcessingTx = false;
        
        const shield = document.getElementById('invisible-tx-shield');
        if (shield) shield.remove();
        
        if (btn) this._toggleButtonLoader(btn, false);
        
        if (this._watchdogTimer) { clearTimeout(this._watchdogTimer); this._watchdogTimer = null; }
        window.removeEventListener('offline', this._offlineHandler);
    },

    _applyTabFilter: function(filterKey, filterValue, element, renderFuncName) {
        if (element.classList.contains('active')) return;
        
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

        const securityPolicy = (LiveStoreData.settings || {}).securityPolicy || {};
        const actionNameAr = actionType === 'deposit' ? 'الإيداع' : 'الشراء';

        if (securityPolicy.forceBiometrics) {
            const isBioEnabled = u.biometricEnabled === true;
            if (!isBioEnabled) {
                getSys().showToast?.(`يجب تفعيل البصمة الحيوية لحماية أموالك قبل ${actionNameAr}.`, 'error');
                setTimeout(() => { getSys().openSecurityModal?.(); }, 1200);
                return false;
            }
        }

        if (securityPolicy.force2FA) {
            const is2FAEnabled = typeof DataManager.is2FAEnabled === 'function' ? DataManager.is2FAEnabled() : false;
            if (!is2FAEnabled) {
                getSys().showToast?.(`أمان المتجر يلزمك بتفعيل المصادقة الثنائية (2FA) قبل ${actionNameAr}.`, 'error');
                setTimeout(() => { getSys().openSecurityModal?.(); }, 1200);
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
                    badgeContainer.innerHTML = `<div class="offer-badge-base ${v.badgeStyle} ${RenderManager._getMappedColor(v.badgeColor)} pm-badge-wrapper">${Utils.escapeHtml(v.badgeText)}</div>`;
                } else if (DataManager.currentProd.badgeText) {
                    badgeContainer.innerHTML = `<div class="offer-badge-base prod-badge badge-${DataManager.currentProd.badgeColor || 'red'} pm-badge-wrapper">${Utils.safeText(DataManager.currentProd.badgeText)}</div>`;
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
        const sys = getSys();
        if (sys.State?.isProcessingTx) return; 
        sys.removeCoupon?.(true); sys.closeModal?.('purchase');

        if (DataManager.currentProd) {
            const targetProdName = DataManager.currentProd.name; 
            setTimeout(() => {
                document.querySelectorAll('.product-card').forEach(card => {
                    if (card.querySelector('.product-name')?.innerText.trim() === targetProdName) {
                        const infoEl = card.querySelector('.card-info');
                        // 🛡️ DOM Detachment Guard
                        if (infoEl && infoEl.isConnected) { 
                            requestAnimationFrame(() => { 
                                infoEl.classList.add('shine-strong'); 
                                setTimeout(() => {
                                    if (infoEl && infoEl.isConnected) infoEl.classList.remove('shine-strong');
                                }, 2000); 
                            }); 
                        }
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

            const unitInput = document.getElementById('pm-price-unit');
            if (unitInput) {
                unitInput.value = result.unitText || '';
                unitInput.setAttribute('dir', 'ltr');
                unitInput.classList.add('text-center-force');
            }            
            
            const targetTotalValue = result.totalDisplayNum !== undefined ? result.totalDisplayNum : result.totalLocalBase;
            const beautifulTotalHtml = (typeof RenderHelpers !== 'undefined') ? RenderHelpers.formatMoney(targetTotalValue, result.displayCurrency) : (result.totalText || '0.00');

            const totalInput = document.getElementById('pm-total');
            if (totalInput) { if (totalInput.tagName === 'INPUT') totalInput.value = result.totalText || ''; else totalInput.innerHTML = beautifulTotalHtml; }

            const currPriceEl = document.getElementById('pm-price'), oldPriceEl = document.getElementById('oldPriceDisplay'), priceBox = document.getElementById('priceBox');
            
            if (result.hasDiscount) {
                if (priceBox) priceBox.classList.add('active');
                
                const targetOldValue = result.oldTotalDisplayNum !== undefined ? result.oldTotalDisplayNum : (result.oldTotalLocalBase || 0);
                if (oldPriceEl) oldPriceEl.innerHTML = (typeof RenderHelpers !== 'undefined') ? RenderHelpers.formatMoney(targetOldValue, result.displayCurrency) : ''; 
                
                if (currPriceEl) currPriceEl.innerHTML = beautifulTotalHtml; 
            } else {
                if (priceBox) priceBox.classList.remove('active');
                if (currPriceEl) currPriceEl.innerHTML = beautifulTotalHtml; 
            }
        });
    },

    handlePurchaseSubmit: async function() { 
        const sys = getSys();
        if (sys.State?.isProcessingTx || !DataManager.currentProd || !this._validateKycAndSystem('purchase')) return;
        
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
            const minQ = parseInt(DataManager.currentProd.minQty) || 1; 
            qty = Math.max(minQ, Utils.parseSafeNumber(document.getElementById('pm-qty')?.value)) || minQ;
        } else if (DataManager.currentProd.type === 'select') { 
            optIdx = Number(document.getElementById('pm-pack')?.value || 0); 
        } else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) { 
            const minQ = parseInt(DataManager.currentProd.minQty) || 1;
            const maxQ = parseInt(DataManager.currentProd.simpleMax) || 10;
            qty = Utils.parseSafeNumber(qtyEl?.value); 
            if(isNaN(qty) || qty < minQ) qty = minQ;
            if(qty > maxQ) { showInlineError(qtyEl.parentNode, `أقصى كمية ${maxQ}`); isValid = false; qtyEl.focus(); }
        }

        if(!isValid) { sys.sfx?.('error'); return; }

        const pricingCheck = DataManager.getPricingLocal(DataManager.currentProd, qty, optIdx, DataManager.appliedCoupon);
        if (pricingCheck && pricingCheck.pricingSnapshot && pricingCheck.pricingSnapshot.totalOriginalPrice <= 0) {
            sys.showToast?.('عذراً، لا يمكن الشراء بسعر صفر.', 'error'); sys.sfx?.('error'); return;
        }

        const submitBtn = document.getElementById('btn-confirm-buy') || document.querySelector('.pm-btn-gold');
        
        this._lockUI(submitBtn);

        try {
            // 🛡️ Transaction Ghosting Shield: تم إزالة Promise.race. הסيرفر هو من يقرر نجاح/فشل/انقضاء وقت العملية عبر محول FirebaseAdapter.
            const result = await DataManager.confirmPurchase(DataManager.currentProd, qty, optIdx, finalInputStr, DataManager.appliedCoupon);

            if (result.success) {
                sys.sfx?.('success'); 
                
                if (result.isAutoDelivered && typeof sys.updateNotifBadges === 'function') {
                    const currentBadge = document.getElementById('header-notif-badge');
                    const currentCount = currentBadge ? (parseInt(currentBadge.innerText) || 0) : 0;
                    sys.updateNotifBadges(currentCount + 1);
                }

                this.closePurchaseModal();
                if(typeof DataManager.syncUser === 'function') DataManager.syncUser(); 
                sys.updateDisplayBalance?.();

                setTimeout(() => {
                    sys.openModal?.('purchase-success');
                    const titleEl = document.getElementById('purchase-success-title'), descEl = document.getElementById('purchase-success-desc'), codeDisplayContainer = document.getElementById('purchase-code-display');

                    if (result.isAutoDelivered && result.deliveredCodeText) {
                        if (titleEl) titleEl.innerText = 'تم تنفيذ الطلب بنجاح!';
                        if (descEl) descEl.innerHTML = 'تم إصدار الكود بنجاح، ومحفوظ في <span class="smart-link" data-action="navigate-orders-success">سجل طلباتك</span>.';
                        if (codeDisplayContainer) {
                            codeDisplayContainer.innerHTML = `<div class="dc-title"><i class="fa-solid fa-key"></i> الأكواد المستلمة:</div><div class="auto-delivery-scroll">${UIBuilders.buildCodesList(result.deliveredCodeText)}</div>`;
                            codeDisplayContainer.classList.remove('d-none');
                        }
                    } else {
                        if (titleEl) titleEl.innerText = 'تم استلام طلبك!';
                        if (descEl) descEl.innerHTML = 'طلبك قيد التنفيذ، تابعه عبر <span class="smart-link" data-action="navigate-orders-success">سجل الطلبات</span>.';
                        if (codeDisplayContainer) { codeDisplayContainer.innerHTML = ''; codeDisplayContainer.classList.add('d-none'); }
                    }
                }, 150);
            } else { 
                sys.showToast?.(result.msg || 'فشلت العملية', 'error');
                sys.sfx?.('error'); 
                keepKeyboardOpen(); 
            }
        } catch (err) { 
            sys.showToast?.(err.message || 'حدث خطأ في النظام', 'error');
            sys.sfx?.('error'); 
        } finally { 
            this._unlockUI(submitBtn); 
        }
    },    

    _manageDepositModalState: function(isStep2) {
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
                headerBtn.setAttribute('data-action', 'back-balance-step');
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
            
            this._drawInitialLimitsBar();
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
            if (canCopy) return `<div class="smart-copy-line is-copyable" data-action="copy-text" data-text="${safeText}"><div class="scl-col-layout"><span class="scl-text num-en scl-text-primary">${safeText}</span></div><i class="fa-regular fa-copy scl-icon"></i></div>`;
            return `<div class="smart-copy-line not-copyable"><div class="scl-col-layout"><span class="scl-text scl-text-secondary">${safeText.replace(/\n/g, '<br>')}</span></div></div>`;
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
            copyLinesHtml += `<div class="smart-copy-line not-copyable scl-info-box"><div class="scl-col-layout" style="gap:4px;"><span class="scl-info-header"><i class="fa-solid fa-circle-info"></i> تعليمات هامة</span><span class="scl-text scl-info-text">${Utils.escapeHtml(String(infoData)).replace(/\n/g, '<br>')}</span></div></div>`;
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
            section.innerHTML = UIBuilders.buildDepositForm(
                p, 
                copyContainer, 
                uniqueCurrencies.length === 1, 
                this.currentPayCurrency, 
                uniqueCurrencies.map((c, i) => `<div class="dropdown-item ${i === 0 ? 'active' : ''}" data-action="select-bal-curr" data-curr="${c}">${c}</div>`).join(''), 
                (DataManager.user?.baseCurrency || 'USD').toUpperCase()
            );
            
            this._drawInitialLimitsBar();
            this.calcFee();
        });
    },

    _drawInitialLimitsBar: function() {
        const limitsBar = document.getElementById('bal-limits-bar');
        if (!limitsBar || !this.currentPayment) return;

        const payCurr = (this.currentPayCurrency || 'USD').toUpperCase();
        const method = this.currentPayment;

        let s = method.currencySettings?.[payCurr] 
            ? { 
                fee: parseFloat(method.currencySettings[payCurr].fee || method.currencySettings[payCurr].value) || 0, 
                min: parseFloat(method.currencySettings[payCurr].min || method.currencySettings[payCurr].minVal) || 0, 
                max: parseFloat(method.currencySettings[payCurr].max || method.currencySettings[payCurr].maxVal) || 0, 
                feeType: method.currencySettings[payCurr].feeType || method.currencySettings[payCurr].type || 'fee', 
                feeUnit: method.currencySettings[payCurr].feeUnit || method.currencySettings[payCurr].fee_unit || method.currencySettings[payCurr].unit || 'percent' 
              }
            : { 
                fee: parseFloat(method.fee || method.value) || 0, 
                min: parseFloat(method.min || method.minVal) || 0, 
                max: parseFloat(method.max || method.maxVal) || 0, 
                feeType: method.feeType || method.type || 'fee', 
                feeUnit: method.feeUnit || method.fee_unit || method.unit || 'percent' 
              };

        if (typeof UIBuilders !== 'undefined' && UIBuilders.buildLimitsBar) {
            const itemsHtml = UIBuilders.buildLimitsBar(s.fee, payCurr, s.feeUnit, s.feeType, s.min, s.max);
            
            if (!itemsHtml || itemsHtml.length === 0) {
                limitsBar.style.display = 'none'; 
            } else { 
                limitsBar.style.display = 'flex'; 
                limitsBar.className = `compact-limits-bar count-${itemsHtml.length}`; 
                limitsBar.innerHTML = itemsHtml.join(''); 
            }
        }
    },
    
    // 🛡️ زر مسح إشعار الدفع (Clear Deposit File)
    clearDepositFile: function() {
        const sys = getSys();
        const input = document.getElementById('bal-file');
        const preview = document.getElementById('bal-img-preview');
        const uploadBox = document.getElementById('bal-upload-box');
        const clearBtn = document.getElementById('bal-file-clear');

        if (input) input.value = '';
        if (sys.State) { sys.State.pendingReceiptFile = null; sys.State.currentImageJobId = null; }
        if (preview) {
            if (preview.src && preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
            preview.src = ''; preview.style.display = 'none';
        }
        if (uploadBox) {
            uploadBox.classList.remove('has-file');
            uploadBox.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>';
        }
        if (clearBtn) clearBtn.classList.add('hide-element');
        sys.showToast?.('تم إزالة المرفق لتتمكن من إعادة الرفع', 'info');
    },

    backToPayMethods: function() {
        const sys = getSys();
        const modal = document.getElementById('balance-modal');
        if (!modal) return;

        this._manageDepositModalState(false);
        modal.scrollTop = 0;
        modal.querySelectorAll('.pm-scroll-content, .scrollable, .modal-content').forEach(s => s.scrollTop = 0);

        if (sys.State) {
            sys.State.pendingReceiptFile = null; 
            sys.State.currentImageJobId = null;
        }

        const preview = document.getElementById('bal-img-preview');
        if (preview && preview.src && preview.src.startsWith('blob:')) { URL.revokeObjectURL(preview.src); preview.src = ''; }

        const fileInputs = document.querySelectorAll('input[type="file"]');
        fileInputs.forEach(inp => {
            if (inp.getAttribute('data-action') === 'preview-receipt' || inp.closest('#bal-upload-box')) {
                inp.value = '';
            }
        });
        
        const uploadBox = document.getElementById('bal-upload-box');
        if (uploadBox) {
            uploadBox.classList.remove('has-file');
            uploadBox.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>';
        }
        
        const clearBtn = document.getElementById('bal-file-clear');
        if (clearBtn) clearBtn.classList.add('hide-element');

        setTimeout(() => {
            const section = document.getElementById('bal-method-info-section');
            if (section && !modal.classList.contains('is-step-2')) section.innerHTML = ''; 
        }, 400);
    },

    closeBalanceModal: function() {
        const sys = getSys();
        if (sys.State?.isProcessingTx) return; 
        const modal = document.getElementById('balance-modal');
        sys.closeModal?.('balance');
        if (modal) {
            modal.addEventListener('transitionend', () => { this.backToPayMethods(); }, { once: true });
        }
    },    
    
    previewReceipt: function(inp) { 
        const sys = getSys();
        const file = inp.files && inp.files[0];
        
        const currentJobId = Date.now();
        if (sys.State) sys.State.currentImageJobId = currentJobId;
        
        const preview = document.getElementById('bal-img-preview');
        if (preview && preview.src && preview.src.startsWith('blob:')) { URL.revokeObjectURL(preview.src); preview.src = ''; }
        
        if(!file) { 
            if (sys.State) sys.State.pendingReceiptFile = null; 
            if(preview) { preview.style.display = 'none'; preview.src = ''; }
            const clearBtn = document.getElementById('bal-file-clear');
            if(clearBtn) clearBtn.classList.add('hide-element');
            return; 
        }

        if (file.size > 10 * 1024 * 1024) { 
            sys.showToast?.('حجم الملف كبير جداً. الحد 10MB.', 'error'); 
            inp.value = ''; 
            if (sys.State) sys.State.pendingReceiptFile = null;
            if(preview) { preview.style.display = 'none'; preview.src = ''; }
            const clearBtn = document.getElementById('bal-file-clear');
            if(clearBtn) clearBtn.classList.add('hide-element');
            return; 
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) { 
            sys.showToast?.('نوع الملف غير مدعوم.', 'error'); 
            inp.value = ''; 
            if (sys.State) sys.State.pendingReceiptFile = null; 
            if(preview) { preview.style.display = 'none'; preview.src = ''; }
            const clearBtn = document.getElementById('bal-file-clear');
            if(clearBtn) clearBtn.classList.add('hide-element');
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
            const clearBtn = document.getElementById('bal-file-clear');
            if (clearBtn) clearBtn.classList.remove('hide-element');
        };

        if(isPdf) {
            if (sys.State) sys.State.pendingReceiptFile = file; 
            if(preview) preview.style.display = 'none'; setUploadSuccessUI('pdf'); 
        } else {
            if(uploadBox) uploadBox.innerHTML = `<div class="bal-upload-success-row"><i class="fa-solid fa-spinner fa-spin bal-upload-success-icon"></i><span class="bal-upload-success-text">جاري المعالجة...</span></div>`;

            const reader = new FileReader(); 
            reader.onload = e => { 
                if (sys.State?.currentImageJobId !== currentJobId) return; 
                const img = new Image();
                img.onload = () => {
                    requestAnimationFrame(() => {
                        if (sys.State?.currentImageJobId !== currentJobId) return;
                        try {
                            const canvas = document.createElement('canvas');
                            let width = img.width, height = img.height; const MAX_SIZE = 1200; 
                            if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
                            else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                            
                            canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); 
                            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0, width, height);
                            
                            canvas.toBlob((blob) => {
                                if (sys.State?.currentImageJobId !== currentJobId) return; 
                                
                                const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 9);
                                const safeFileName = `deposit_img_${Date.now()}_${uniqueId}.webp`;
                                
                                if (sys.State) sys.State.pendingReceiptFile = new File([blob], safeFileName, { type: 'image/webp' });
                                
                                if(preview) { preview.src = URL.createObjectURL(blob); preview.style.display = 'block'; preview.className = 'bal-receipt-preview-new'; }
                                setUploadSuccessUI('image');
                                canvas.width = 0; canvas.height = 0; img.src = '';
                            }, 'image/webp', 0.75);
                        } catch (err) {
                            sys.showToast?.('تعذر معالجة الصورة', 'error');
                            if (uploadBox) uploadBox.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>'; inp.value = '';
                            const clearBtn = document.getElementById('bal-file-clear');
                            if(clearBtn) clearBtn.classList.add('hide-element');
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
            const errorBox = document.getElementById('bal-amount-error');
            const submitBtn = document.getElementById('btn-submit-deposit');
            const netDisplay = document.getElementById('calc-net');
            const netWrap = document.getElementById('bal-net-wrap');

            if (!result.isValid) {
                input.classList.toggle('input-invalid', amount > 0);
                if (errorBox) { 
                    errorBox.innerHTML = (amount > 0) ? `<i class="fa-solid fa-circle-exclamation"></i> ${result.msg}` : ''; 
                    errorBox.style.display = (amount > 0 && result.msg) ? 'block' : 'none'; 
                    errorBox.classList.remove('d-none'); 
                }
                if (submitBtn) submitBtn.disabled = true; 
                
                if (netDisplay) { netDisplay.innerText = "0.00"; netDisplay.style.opacity = '0.4'; }
                if (netWrap) netWrap.classList.remove('has-value');
            } 
            else {
                input.classList.remove('input-invalid');
                if (errorBox) { errorBox.style.display = 'none'; errorBox.classList.add('d-none'); }
                if (submitBtn) submitBtn.disabled = false;
                
                if (netDisplay) { 
                    netDisplay.innerText = result.netBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    netDisplay.style.opacity = '1'; 
                }
                if (netWrap) netWrap.classList.add('has-value'); 
            }
        });
    },

    handleBalanceSubmit: async function(currency) {
        const sys = getSys();
        if (sys.State?.isProcessingTx || !this._validateKycAndSystem('deposit')) return;
        
        const input = document.getElementById('bal-amount');
        const amount = this._parseSafeAmount(input ? input.value : '');
        if (isNaN(amount) || amount <= 0) { sys.showToast?.('أدخل مبلغ إيداع صحيح', 'error'); return; }
        
        const payCurr = currency || this.currentPayCurrency || 'USD';

        if (this.currentPayment && this.currentPayment.reqProof !== false) {
            if (!sys.State?.pendingReceiptFile) {
                const uploadBox = document.getElementById('bal-upload-box');
                if (uploadBox && uploadBox.innerHTML.includes('fa-spinner')) {
                    sys.showToast?.('جاري تجهيز الصورة، يرجى الانتظار لحظة...', 'warning');
                    return;
                }
                
                sys.showToast?.('أرفق إشعار الدفع أولاً', 'error');
                if (uploadBox) {
                    uploadBox.classList.remove('shake-error-input');
                    void uploadBox.offsetWidth;
                    uploadBox.classList.add('shake-error-input');
                    setTimeout(() => uploadBox.classList.remove('shake-error-input'), 1000);
                }
                return; 
            }
        }

        const validation = DataManager.calculateDepositFee(amount, this.currentPayment, payCurr);
        if (!validation.isValid) {
            sys.showToast?.(validation.msg, 'error');
            if (input) {
                input.classList.remove('shake-error-input');
                void input.offsetWidth;
                input.classList.add('shake-error-input');
                setTimeout(() => input.classList.remove('shake-error-input'), 1500);
            }
            return;
        }
        
        const submitBtn = document.querySelector('[data-action="submit-balance"]'); 
        this._lockUI(submitBtn);
        
        let uploadedReceiptUrl = null;
        try {
            // 🛡️ Transaction Ghosting Shield: تم إزالة Promise.race.
            if (sys.State?.pendingReceiptFile) {
                if (!StoreDB || typeof StoreDB.uploadImage !== 'function') throw new Error("نظام الرفع غير متوفر.");
                const userId = DataManager.user?.uid || DataManager.user?.id || 'unknown';
                
                const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 9);
                const safeFileName = `deposit_${userId}_${Date.now()}_${uniqueId}.webp`;
                
                uploadedReceiptUrl = await StoreDB.uploadImage(sys.State.pendingReceiptFile, 'receipts', safeFileName, false);
            }
            const result = await DataManager.submitBalanceRequest(amount, this.currentPayment, payCurr, uploadedReceiptUrl);
            
            if (result.success) {
                sys.sfx?.('success'); 
                this.closeBalanceModal();
                if (typeof DataManager.syncUser === 'function') DataManager.syncUser();
                setTimeout(() => sys.openModal?.('success'), 150);
            } else { 
                if (uploadedReceiptUrl && StoreDB.deleteImageByUrl) StoreDB.deleteImageByUrl(uploadedReceiptUrl).catch(()=>{});
                sys.showToast?.(result.msg || 'تعذر إرسال الطلب', 'error'); 
                sys.sfx?.('error');
            }
        } catch (error) {
            if (uploadedReceiptUrl && StoreDB.deleteImageByUrl) {
                StoreDB.deleteImageByUrl(uploadedReceiptUrl).catch(() => {});
            }
            
            console.error("🚨 Client-Side Deposit Exception:", error);
            let errMsg = 'حدث خطأ أثناء الاتصال بالخادم.';
            const rawMsg = String(error.message || '');
            if (/[\u0600-\u06FF]/.test(rawMsg)) errMsg = rawMsg;
            
            sys.showToast?.(errMsg, 'error');
            sys.sfx?.('error');
            
        } finally {
            this._unlockUI(submitBtn);
        }
    },
    
    togglePayDetail: function(headerElement) {
        if (!headerElement) return; const card = headerElement.closest('.pay-history-card'); if (!card) return;
        window.requestAnimationFrame(() => {
            const det = card.querySelector('.ph-details-body'), arrow = headerElement.querySelector('.fa-chevron-down, .fa-angle-down, .fa-chevron-left, .ph-arrow-btn, .ph-arrow');
            if (det) { const isOpen = det.classList.toggle('is-open'); if(arrow) arrow.classList.toggle('is-open', isOpen); }
        });
    },

    toggleWalletStats: function(btn) { const drawer = document.getElementById('walletStatsDrawer'); if (drawer) drawer.classList.contains('active') ? this.closeWalletStats() : this.openWalletStats(btn); },
    
    openWalletStats: function(btn) { 
        window.requestAnimationFrame(() => { 
            document.getElementById('walletStatsDrawer')?.classList.add('active'); 
            if (btn) btn.classList.add('open'); 
            document.getElementById('wallet-modal')?.classList.add('drawer-blur-active'); 
        }); 
    },
    
    closeWalletStats: function() { window.requestAnimationFrame(() => { document.getElementById('walletStatsDrawer')?.classList.remove('active'); const wModal = document.getElementById('wallet-modal'); if (wModal) { wModal.classList.remove('drawer-blur-active'); wModal.querySelector('.detail-arrow')?.classList.remove('open'); } }); },
    
    openDetail: function(e, type, id) {
        const sys = getSys();
        sys.resetUI?.(); const content = document.getElementById('tx-detail-content'); if (!content) return;
        const html = UIBuilders.buildTransactionDetail(type, id, LiveStoreData, DataManager);
        if (html) { window.requestAnimationFrame(() => { content.innerHTML = html; sys.openModal?.('tx-detail'); }); }
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
