// ============================================================================
// 💳 وحدة الدفع والمنتجات (uiFinance.js) - النسخة الماسية المطلقة V4.7 💎
// 🎯 الوظيفة: نوافذ الشراء، الإيداعات، فلاتر القوائم، وتفاصيل الطلبات
// 🚀 التحديثات:
// 1. Phantom Blob Fix: مسح جبري للذاكرة العشوائية لمنع نزيف الرام عند الرفع المكرر.
// 2. Ghost Modal Shield: فك الارتباط الزمني لمنع تجمد الـ CSS عند الانتقال بين النوافذ.
// 3. Destructuring-Safe Events: حماية السياق (Context) عند ربط الـ Document Events.
// ============================================================================

import { Utils } from '../utils.js';
import { DataManager, LiveStoreData } from '../dataManager.js';
import { RenderManager } from '../renderManager.js';
import { RenderHelpers } from '../core/renderHelpers.js';
import { FirebaseAdapter } from '../core/firebaseAdapter.js';
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
    _txAbortController: null, 
    
    _toggleButtonLoader: function(btn, isLoading) {
        if (!btn) return;
        
        window.requestAnimationFrame(() => {
            if (isLoading) {
                btn.disabled = true;
                btn.classList.add('is-loading');
                if (!btn.querySelector('.btn-spinner')) {
                    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
                    const btnWidth = btn.offsetWidth;
                    if (btnWidth > 0) btn.style.width = `${btnWidth}px`;
                    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري المعالجة...`;
                }
            } else {
                btn.disabled = false;
                btn.classList.remove('is-loading');
                if (btn.dataset.originalHtml) {
                    btn.innerHTML = btn.dataset.originalHtml;
                    btn.style.width = ''; 
                    delete btn.dataset.originalHtml;
                }
            }
        });
    },

    _startTxWatchdog: function(submitBtn, shieldId) {
        this._cleanupTxUI(null, null); 
        
        this._watchdogTimer = setTimeout(() => {
            if (this._isProcessingTx) {
                console.warn("[MaliMor] Watchdog: Transaction timed out, forcing unlock.");
                getSys().showToast?.('طال وقت المعاملة، السيرفر يعاني من ضغط. يرجى مراجعة سجل طلباتك.', 'warning');
                this._cleanupTxUI(submitBtn, shieldId);
            }
        }, 20000);
        
        this._txAbortController = new AbortController();
        window.addEventListener('offline', () => {
            if (this._isProcessingTx) getSys().showToast?.('تم انقطاع الاتصال! يرجى التأكد من استقرار الشبكة.', 'warning');
        }, { signal: this._txAbortController.signal });
    },

    _cleanupTxUI: function(submitBtn, shieldId) {
        this._isProcessingTx = false;
        
        if (shieldId) {
            const shield = document.getElementById(shieldId);
            if (shield) shield.remove();
        }
        
        if (submitBtn) this._toggleButtonLoader(submitBtn, false);
        
        if (this._watchdogTimer) { clearTimeout(this._watchdogTimer); this._watchdogTimer = null; }
        
        if (this._txAbortController) {
            this._txAbortController.abort(); 
            this._txAbortController = null;
        }
    },

    _applyTabFilter: function(filterKey, filterValue, element, renderFuncName) {
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
        
        // 🛡️ [إصلاح ماسي]: منع تضارب الـ CSS والـ DOM بمعالجة القفز بعد 150ms
        setTimeout(() => {
            if (type === 'purchase') getSys().openOrders?.();
            else getSys().openMyPayments?.();
            
            const searchInput = document.getElementById((type === 'purchase') ? 'order-search-input' : 'pay-search-input');
            if (searchInput) searchInput.value = id;

            if (RenderManager) RenderManager.highlightId = id;

            if (type === 'purchase') { if(RenderManager.renderOrders) RenderManager.renderOrders(); } 
            else { if(RenderManager.renderPayments) RenderManager.renderPayments(); }
        }, 150);
    },    

    _validateKycAndSystem: function(actionType = 'purchase') {
        const sys = LiveStoreData.system || {};
        if (sys.freeze) { 
            getSys().showToast?.(sys.freezeMsg || 'عذراً، العمليات المالية متوقفة مؤقتاً لتحديث النظام.', 'warning'); 
            return false; 
        }

        if (!DataManager || !DataManager.user) {
            getSys().showToast?.('يجب تسجيل الدخول أولاً للقيام بهذا الإجراء', 'error');
            setTimeout(() => { 
                if (DataManager && typeof DataManager.logout === 'function') DataManager.logout();
                else window.location.href = 'login.html'; 
            }, 1500);
            return false; 
        }

        const settings = LiveStoreData.settings || {};
        const kycConfig = settings.kycConfig || { mode: 'off', targetedTiers: [] };
        
        if (!DataManager.user.isVerified) {
            getSys().showToast?.('يرجى إكمال بيانات الحساب الأساسية أولاً للمتابعة', 'error');
            setTimeout(() => { getSys().openModal?.('identity'); }, 800); 
            return false; 
        }
        
        let needsKyc = false;
        if (kycConfig.mode === 'all') needsKyc = true; 
        else if (kycConfig.mode === 'specific' || kycConfig.mode === 'spec') {
            const targetedArray = (kycConfig.targetedTiers || []).map(String);
            if (targetedArray.includes(String(DataManager.getUserTier(DataManager.user).id)) || targetedArray.includes(String(DataManager.user.tierId))) { 
                needsKyc = true; 
            }
        }

        if (needsKyc) {
            const status = DataManager.user.kycStatus;
            const isKycApproved = (status === 'approved' || status === 'verified');
            
            if (!isKycApproved) {
                const actionName = actionType === 'deposit' ? 'الإيداع' : 'الشراء';
                if (status === 'pending') {
                    getSys().showToast?.(`هويتك قيد المراجعة، يرجى الانتظار لتتمكن من ${actionName}`, 'warning');
                    getSys().openKycStatusModal?.('pending');
                } else {
                    getSys().showToast?.(`حسابك يتطلب التوثيق الأمني (KYC) لتتمكن من ${actionName}`, 'error');
                    setTimeout(() => { getSys().openModal?.('kyc-upload'); }, 800);
                }
                return false; 
            }
        }
        return true;
    },

    openProdModal: function(id) {
        if (!this._validateKycAndSystem('purchase')) return;
   
        getSys().removeCoupon?.(true);
        getSys().resetUI?.();

        const prods = LiveStoreData.prods || [];
        const originalProd = prods.find(p => String(p.id) === String(id));
        if (!originalProd) return;

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
                    const colorClass = RenderManager._getMappedColor(v.badgeColor);
                    badgeContainer.innerHTML = `<div class="offer-badge-base ${v.badgeStyle} ${colorClass}" style="position: relative; top: 0; right: 0; width: fit-content; margin-bottom: 5px;">${Utils.escapeHtml(v.badgeText)}</div>`;
                } else if (DataManager.currentProd.badgeText) {
                    badgeContainer.innerHTML = `<div class="offer-badge-base prod-badge badge-${DataManager.currentProd.badgeColor || 'red'}" style="position: relative; top: 0; right: 0; width: fit-content; margin-bottom: 5px;">${Utils.safeText(DataManager.currentProd.badgeText)}</div>`;
                } else { badgeContainer.innerHTML = ''; }
            }

            if (nameEl) nameEl.innerText = DataManager.currentProd.name;
            if (favBtn) {
                const isFav = DataManager.isFavorite ? DataManager.isFavorite(DataManager.currentProd.id) : false;
                favBtn.className = `pm-btn-icon ${isFav ? 'active' : ''}`;
                favBtn.innerHTML = `<i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
            }
            if (descBox) {
                if (DataManager.currentProd.description) {
                    descBox.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${Utils.escapeHtml(DataManager.currentProd.description)}`;
                    descBox.style.display = 'block';
                } else descBox.style.display = 'none';
            }

            if (dynOps) { dynOps.style.display = 'none'; dynOps.innerHTML = ''; dynOps.classList.remove('pm-ops-visible'); }
            if (staOps) staOps.style.display = 'none';
            if (simpleQtyBox) simpleQtyBox.style.display = 'none';
            getSys().hideQtyError?.();

            const createInput = (inpId, lbl) => `<div class="floating-group"><input type="text" id="${inpId}" class="floating-input" placeholder=" " autocomplete="off"><label class="floating-label">${Utils.escapeHtml(lbl || '')}</label></div>`;
            let inputHtml = '';

            if (DataManager.currentProd.type === 'double') {
                inputHtml += createInput('pm-inp-1', DataManager.currentProd.input1Label);
                inputHtml += createInput('pm-inp-2', DataManager.currentProd.input2Label);
            } else if (['single', 'counter'].includes(DataManager.currentProd.type)) { 
                inputHtml += createInput('pm-inp-1', DataManager.currentProd.input1Label);
            } else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) {
                if(simpleQtyBox) simpleQtyBox.style.display = 'block';
                const sQty = document.getElementById('simple-qty-val');
                if(sQty) sQty.value = 1;
            } else if (DataManager.currentProd.type === 'select') {
                inputHtml += createInput('pm-inp-1', DataManager.currentProd.input1Label);
                if(staOps) staOps.style.display = 'block';
                
                const sel = document.getElementById('pm-pack');
                const menu = document.getElementById('pkg-custom-menu');
                const triggerText = document.getElementById('pkg-selected-text');

                if (sel && menu) {
                    let selHtml = '';
                    let menuHtml = '';
                    const options = DataManager.currentProd.options || [];

                    options.forEach((pkg, idx) => {
                        selHtml += `<option value="${idx}">${Utils.escapeHtml(pkg.name)}</option>`;
                        menuHtml += `<div class="dropdown-item" data-idx="${idx}" data-name="${Utils.escapeHtml(pkg.name)}"><span>${Utils.escapeHtml(pkg.name)}</span></div>`;
                    });

                    sel.innerHTML = selHtml;
                    menu.innerHTML = menuHtml;

                    if (!this._selectDropdownBound) {
                        document.addEventListener('click', (e) => {
                            const item = e.target.closest('#pkg-custom-menu .dropdown-item');
                            if (!item) return;
                            
                            const pkgSel = document.getElementById('pm-pack');
                            const pkgTxt = document.getElementById('pkg-selected-text');
                            const dropCont = document.getElementById('pkg-custom-dropdown');
                            
                            if (pkgSel) pkgSel.value = item.dataset.idx;
                            if (pkgTxt) pkgTxt.textContent = item.dataset.name;
                            if (dropCont) dropCont.classList.remove('open');
                            
                            item.parentNode.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
                            item.classList.add('active');
                            
                            // 🛡️ [إصلاح ماسي]: استدعاء System-level لمنع فقدان السياق بسبب הـ Arrow function
                            getSys().updatePriceDisplay?.();
                            getSys().revalidateAppliedCoupon?.();
                            getSys().sfx?.('nav');
                        });
                        this._selectDropdownBound = true;
                    }

                    if (options.length > 0) {
                        sel.value = 0; if(triggerText) triggerText.textContent = options[0].name;
                        if(menu.firstChild) menu.firstChild.classList.add('active');
                    } else { if(triggerText) triggerText.textContent = "لا توجد باقات"; }
                }
            }
            
            if(inputContainer) inputContainer.innerHTML = inputHtml;

            if (DataManager.currentProd.type === 'counter' && dynOps) {
                dynOps.classList.add('pm-ops-visible'); dynOps.style.display = 'block'; 
                dynOps.innerHTML = `<div class="pm-new-grid"><div class="pm-float-box"><input type="tel" id="pm-qty" inputmode="numeric" dir="ltr" placeholder=" "> <label>العدد</label></div><div class="pm-float-box readonly"><input type="text" id="pm-price-unit" readonly placeholder=" "><label>سعر القطعة</label></div></div>`; 

                const qInp = document.getElementById('pm-qty');
                if (qInp) {
                    let minQ = parseInt(DataManager.currentProd.minQty) || 1;
                    qInp.value = minQ; 
                    qInp.addEventListener('input', (e) => { 
                        e.target.value = e.target.value.replace(/[^0-9]/g, ''); 
                        getSys().updatePriceDisplay?.(); 
                        getSys().revalidateAppliedCoupon?.(); 
                    });
                    qInp.addEventListener('blur', (e) => { 
                        let val = parseInt(e.target.value, 10); 
                        if (isNaN(val) || val < minQ) { 
                            e.target.value = minQ; 
                            getSys().updatePriceDisplay?.(); 
                            getSys().revalidateAppliedCoupon?.(); 
                        } 
                    });
                }
            }

            getSys().updatePriceDisplay?.();
            getSys().openModal?.('purchase');
        });
    },

    closePurchaseModal: function() { 
        getSys().removeCoupon?.(true);
        getSys().closeModal?.('purchase');

        if (DataManager.currentProd) {
            const targetProdName = DataManager.currentProd.name; 
            setTimeout(() => {
                const cards = document.querySelectorAll('.product-card');
                cards.forEach(card => {
                    if (card.querySelector('.product-name')?.innerText.trim() === targetProdName) {
                        const infoEl = card.querySelector('.card-info');
                        if (infoEl) {
                            window.requestAnimationFrame(() => {
                                infoEl.classList.add('shine-strong');
                                setTimeout(() => infoEl.classList.remove('shine-strong'), 2000);
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
        let el = document.getElementById('simple-qty-val');
        if (!el || !DataManager.currentProd) return;
        let val = parseInt(el.value, 10);
        let max = DataManager.currentProd.simpleMax || 10;
        let min = DataManager.currentProd.minQty || 1; 
        let newVal = val + change;

        if (newVal > max) { getSys().sfx?.('error'); getSys().showQtyError?.(`تجاوزت الحد (${max})`); return; }
        if (newVal < min) return; 

        el.value = newVal;
        getSys().hideQtyError?.();
        getSys().updatePriceDisplay?.(); 
        getSys().revalidateAppliedCoupon?.();
    },

    updatePriceDisplay: function() {
        if (!DataManager.currentProd || typeof DataManager.getPricingLocal !== 'function') return;
        
        window.requestAnimationFrame(() => {
            let qty = 1; let optIdx = null;

            if (DataManager.currentProd.type === 'counter') qty = Math.max(1, parseInt(document.getElementById('pm-qty')?.value, 10)) || 1; 
            else if (DataManager.currentProd.type === 'select') optIdx = Number(document.getElementById('pm-pack')?.value || 0); 
            else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) qty = Math.max(1, parseInt(document.getElementById('simple-qty-val')?.value, 10) || 1);

            const result = DataManager.getPricingLocal(DataManager.currentProd, qty, optIdx, DataManager.appliedCoupon);
            if (!result || typeof result !== 'object') return;

            const unitInput = document.getElementById('pm-price-unit');
            if (unitInput) unitInput.value = result.unitText || '';

            const beautifulTotalHtml = (typeof RenderHelpers !== 'undefined') ? RenderHelpers.formatMoney(result.totalLocalBase, result.displayCurrency) : (result.totalText || '0.00');

            const totalInput = document.getElementById('pm-total');
            if (totalInput) {
                if (totalInput.tagName === 'INPUT') totalInput.value = result.totalText || '';
                else totalInput.innerHTML = beautifulTotalHtml; 
            }

            const currPriceEl = document.getElementById('pm-price');
            const oldPriceEl = document.getElementById('oldPriceDisplay');
            const priceBox = document.getElementById('priceBox');
            
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
        
        const inp1El = document.getElementById('pm-inp-1');
        const inp2El = document.getElementById('pm-inp-2');
        const qtyEl = document.getElementById('simple-qty-val');
        
        const keepKeyboardOpen = () => { if (inp1El && !inp1El.disabled) inp1El.focus(); else if (qtyEl && !qtyEl.disabled) qtyEl.focus(); };
        
        const showInlineError = (element, message) => {
            if(!element) return;
            element.classList.add('input-error'); 
            const parent = element.parentNode;
            const oldMsg = parent.querySelector('.input-error-text');
            if(oldMsg) oldMsg.remove();
            const errorMsg = document.createElement('div'); 
            errorMsg.className = 'input-error-text'; 
            errorMsg.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${message}`;
            if (element.nextSibling) parent.insertBefore(errorMsg, element.nextSibling); else parent.appendChild(errorMsg);
            element.addEventListener('input', function() { element.classList.remove('input-error'); parent.querySelector('.input-error-text')?.remove(); }, {once: true});
        };

        let qty = 1; let optIdx = null; let isValid = true; let finalInputStr = '';
        const inp1 = inp1El ? inp1El.value.trim() : ''; 
        const inp2 = inp2El ? inp2El.value.trim() : '';

        if(DataManager.currentProd.type === 'double') { 
            finalInputStr = `${DataManager.currentProd.input1Label}: ${inp1} | ${DataManager.currentProd.input2Label}: ${inp2}`; 
            if(!inp1) { showInlineError(inp1El, 'يرجى ملء الحقل الأول'); isValid = false; inp1El.focus(); }
            if(!inp2) { if(inp2El) { showInlineError(inp2El, 'يرجى ملء الحقل الثاني'); if(isValid) inp2El.focus(); isValid = false; } }
        } else if (DataManager.currentProd.type === 'simple') { 
            finalInputStr = ""; 
        } else { 
            finalInputStr = inp1; 
            if(inp1El && !inp1) { showInlineError(inp1El, 'يرجى ملء الحقل المطلوب'); isValid = false; inp1El.focus(); } 
        }

        if (DataManager.currentProd.type === 'counter') { 
            const minQ = parseInt(DataManager.currentProd.minQty) || 1;
            qty = Math.max(minQ, parseInt(document.getElementById('pm-qty')?.value, 10)) || minQ;
        } else if (DataManager.currentProd.type === 'select') { 
            optIdx = Number(document.getElementById('pm-pack')?.value || 0); 
        } else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) { 
            const minQ = parseInt(DataManager.currentProd.minQty) || 1;
            const maxQ = parseInt(DataManager.currentProd.simpleMax) || 10;
            qty = parseInt(qtyEl?.value, 10);
            if(isNaN(qty) || qty < minQ) qty = minQ;
            if(qty > maxQ) { showInlineError(qtyEl.parentNode, `أقصى كمية مسموحة هي ${maxQ}`); isValid = false; qtyEl.focus(); }
        }

        if(!isValid) { getSys().sfx?.('error'); return; }
        if(!DataManager || typeof DataManager.confirmPurchase !== 'function') return;

        const submitBtn = document.getElementById('btn-confirm-buy') || document.querySelector('.pm-btn-gold');
        const shieldId = 'invisible-tx-shield';
        
        this._isProcessingTx = true;
        this._toggleButtonLoader(submitBtn, true); 
        if (!document.getElementById(shieldId)) document.body.insertAdjacentHTML('beforeend', `<div id="${shieldId}"></div>`);

        this._startTxWatchdog(submitBtn, shieldId);

        try {
            const result = await DataManager.confirmPurchase(DataManager.currentProd, qty, optIdx, finalInputStr, DataManager.appliedCoupon);

            if (result.success) {
                getSys().sfx?.('success');
                this.closePurchaseModal();
                if(typeof DataManager.syncUser === 'function') DataManager.syncUser(); 
                getSys().updateDisplayBalance?.();

                setTimeout(() => {
                    getSys().openModal?.('purchase-success');
                    const titleEl = document.getElementById('purchase-success-title');
                    const descEl = document.getElementById('purchase-success-desc');
                    const codeDisplayContainer = document.getElementById('purchase-code-display');

                    if (result.isAutoDelivered && result.deliveredCodeText) {
                        if (titleEl) titleEl.innerText = 'تم تنفيذ الطلب بنجاح!';
                        if (descEl) descEl.innerHTML = 'تم إصدار الكود بنجاح. تم حفظه بأمان في <span class="smart-link" data-action="navigate-orders-success">سجل طلباتك</span> للرجوع إليه في أي وقت.';
                        if (codeDisplayContainer) {
                            codeDisplayContainer.innerHTML = `<div class="dc-title"><i class="fa-solid fa-key"></i> الأكواد الخاصة بك:</div><div style="max-height: 200px; overflow-y: auto; padding-right: 5px;">${UIBuilders.buildCodesList(result.deliveredCodeText)}</div>`;
                            codeDisplayContainer.classList.remove('d-none');
                        }
                    } else {
                        if (titleEl) titleEl.innerText = 'تم استلام طلبك!';
                        if (descEl) descEl.innerHTML = 'طلبك الآن قيد المعالجة. يمكنك متابعة حالة التنفيذ عبر <span class="smart-link" data-action="navigate-orders-success">سجل الطلبات</span>.';
                        if (codeDisplayContainer) { codeDisplayContainer.innerHTML = ''; codeDisplayContainer.classList.add('d-none'); }
                    }
                    
                    const modalEl = document.getElementById('purchase-success-modal');
                    if (modalEl && !this._successLinksBound) {
                        modalEl.addEventListener('click', (e) => {
                            if (e.target.closest('[data-action="navigate-orders-success"]')) {
                                getSys().closeModal?.('purchase-success'); getSys().openOrders?.();
                            }
                        });
                        this._successLinksBound = true;
                    }
                }, 150);
            } else {
                getSys().showToast?.(result.msg || 'عذراً، رصيدك الحالي غير كافٍ.', 'error'); 
                keepKeyboardOpen();
            }
        } catch (err) {
            console.error("🚨 خطأ أثناء تنفيذ الشراء:", err);
            let displayMessage = 'حدث خطأ في الاتصال بالسيرفر، يرجى المحاولة لاحقاً';
            if (err.code) {
                const codes = {
                    'failed-precondition': err.message, 'already-exists': 'عذراً، هذا الطلب تمت معالجته مسبقاً.',
                    'resource-exhausted': 'نفدت الكمية أو تم تجاوز الحد المسموح.', 'permission-denied': 'تم رفض العملية. تأكد من صلاحيات حسابك.',
                    'deadline-exceeded': 'انتهى وقت الطلب بسبب ضعف الإنترنت.', 'unauthenticated': 'انتهت جلستك، يرجى تسجيل الدخول مجدداً.'
                };
                displayMessage = codes[err.code] || displayMessage;
            } else if (err.message) displayMessage = err.message;
            getSys().showToast?.(displayMessage, 'error');
        } finally {
            this._cleanupTxUI(submitBtn, shieldId);
        }
    },

    openAddBalance: function() {
        if (!this._validateKycAndSystem('deposit')) return;
        getSys().resetUI?.();
        
        const modal = document.getElementById('balance-modal');
        if(modal) modal.classList.remove('is-step-2');

        const blockedView = document.getElementById('bal-blocked-view');
        const normalView = document.getElementById('bal-normal-view');
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
            const amtCurr = document.getElementById('bal-amount-curr');
            if (amtCurr) amtCurr.innerText = curr;
            this.calcFee();
        });
    },

    selectPay: function(id) {
        const payments = LiveStoreData.payments || [];
        const modal = document.getElementById('balance-modal');
        this.currentPayment = payments.find(p => String(p.id) === String(id));
        
        if (!this.currentPayment || !modal) return;
        
        modal.classList.add('is-step-2');
        modal.scrollTop = 0;
        if (typeof this._toggleBalHeaderBtn === 'function') this._toggleBalHeaderBtn('back'); 
        
        const section = document.getElementById('bal-method-info-section');
        if (!section) return;
        
        const p = this.currentPayment;
        let copyLinesHtml = '';
        let hasFields = false;
        const fieldsArray = p.detailFields || p.details || p.fields || [];
        
        const createSmartLine = (text, canCopy) => {
            const safeText = Utils.escapeHtml(String(text));
            if (canCopy) {
                return `<div class="smart-copy-line is-copyable" data-action="copy-text" data-text="${safeText}"><div style="display: flex; flex-direction: column; justify-content: center; text-align: right; width: 100%;"><span class="scl-text num-en" style="font-size: 14.5px; font-weight: 800;">${safeText}</span></div><i class="fa-regular fa-copy scl-icon"></i></div>`;
            } else {
                return `<div class="smart-copy-line not-copyable"><div style="display: flex; flex-direction: column; justify-content: center; text-align: right; width: 100%;"><span class="scl-text" style="font-size: 13.5px; font-weight: 700; color: var(--text-main); line-height: 1.6;">${safeText.replace(/\n/g, '<br>')}</span></div></div>`;
            }
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

            if (!section._boundDelegation) {
                section.addEventListener('input', (e) => {
                    if (e.target.id === 'bal-amount') { this.calcFee(); e.target.parentElement.classList.toggle('has-value', e.target.value !== ''); }
                });
                section.addEventListener('click', (e) => {
                    if (e.target.closest('#bal-upload-box')) document.getElementById('bal-file')?.click();
                    const currTrigger = e.target.closest('.micro-currency-trigger');
                    if (currTrigger) {
                        const list = currTrigger.parentElement.querySelector('.dropdown-menu');
                        if (list && list.style.display !== 'none') currTrigger.parentElement.classList.toggle('open');
                    }
                    const currItem = e.target.closest('.dropdown-item');
                    if (currItem) { this.changeDepositCurrency(currItem.dataset.curr); e.target.closest('.split-dropdown')?.classList.remove('open'); }
                });
                section.addEventListener('change', (e) => { if (e.target.id === 'bal-file') this.previewReceipt(e.target); });
                section._boundDelegation = true;
            }
            this.calcFee();
            getSys().sfx?.('nav');
        });
    },

    backToPayMethods: function() {
        const modal = document.getElementById('balance-modal');
        if (!modal) return;

        modal.classList.remove('is-step-2'); 
        modal.scrollTop = 0;
        modal.querySelectorAll('.pm-scroll-content, .scrollable, .modal-content').forEach(s => s.scrollTop = 0);

        if (typeof this._toggleBalHeaderBtn === 'function') this._toggleBalHeaderBtn('close');

        this.currentReceiptData = null; 
        
        // 🛡️ [إصلاح ماسي 1]: التنظيف غير المشروط للـ Blob من المتصفح لمنع نزيف الرام
        const preview = document.getElementById('bal-img-preview');
        if (preview && preview.src && preview.src.startsWith('blob:')) {
            URL.revokeObjectURL(preview.src);
            preview.src = '';
        }
        this.pendingReceiptFile = null;

        setTimeout(() => {
            const section = document.getElementById('bal-method-info-section');
            if (section && !modal.classList.contains('is-step-2')) section.innerHTML = ''; 
        }, 400);

        getSys().sfx?.('nav');
    },

    closeBalanceModal: function() {
        const modal = document.getElementById('balance-modal');
        getSys().closeModal?.('balance');
        if (modal) {
            modal.addEventListener('transitionend', () => {
                this.backToPayMethods(); 
            }, { once: true });
        }
    },

    previewReceipt: function(inp) { 
        const file = inp.files && inp.files[0];
        
        // 🛡️ [إصلاح ماسي 1]: التنظيف الفوري للـ Blob القديم قبل إنشاء واحد جديد
        const preview = document.getElementById('bal-img-preview');
        if (preview && preview.src && preview.src.startsWith('blob:')) {
            URL.revokeObjectURL(preview.src);
            preview.src = '';
        }
        
        if(!file) {
            this.pendingReceiptFile = null;
            this.currentReceiptData = null;
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            getSys().showToast?.('حجم الملف كبير جداً. الحد الأقصى 10MB.', 'error');
            inp.value = ''; return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            getSys().showToast?.('نوع الملف غير مدعوم. يرجى رفع صورة أو PDF.', 'error');
            inp.value = ''; this.pendingReceiptFile = null; this.currentReceiptData = null; return;
        }

        const isPdf = file.type === 'application/pdf';
        const uploadBox = document.getElementById('bal-upload-box'); 

        const setUploadSuccessUI = (type) => {
            if(uploadBox) {
                uploadBox.classList.add('has-file');
                const iconClass = type === 'pdf' ? 'fa-file-pdf' : 'fa-check-circle';
                const text = type === 'pdf' ? 'تم إرفاق ملف PDF' : 'تم إرفاق الصورة بنجاح';
                uploadBox.innerHTML = `<div class="bal-upload-success-row"><i class="fa-solid ${iconClass} bal-upload-success-icon"></i><span class="bal-upload-success-text">${text}</span></div>`;
            }
        };

        if(isPdf) {
            this.pendingReceiptFile = file; 
            const reader = new FileReader();
            reader.onload = e => { 
                this.currentReceiptData = e.target.result; 
                if(preview) preview.style.display = 'none'; 
                setUploadSuccessUI('pdf'); 
            };
            reader.readAsDataURL(file);
        } else {
            if(uploadBox) uploadBox.innerHTML = `<div class="bal-upload-success-row"><i class="fa-solid fa-spinner fa-spin bal-upload-success-icon"></i><span class="bal-upload-success-text">جاري المعالجة...</span></div>`;

            const reader = new FileReader(); 
            reader.onload = e => { 
                const img = new Image();
                img.onload = () => {
                    requestAnimationFrame(() => {
                        try {
                            const canvas = document.createElement('canvas');
                            let width = img.width, height = img.height;
                            const MAX_SIZE = 1200; 
                            
                            if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
                            else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                            
                            canvas.width = width; canvas.height = height;
                            const ctx = canvas.getContext('2d'); 
                            
                            ctx.fillStyle = '#ffffff'; 
                            ctx.fillRect(0, 0, width, height); 
                            ctx.drawImage(img, 0, 0, width, height);
                            
                            canvas.toBlob((blob) => {
                                const safeName = file.name ? file.name.replace(/\.[^/.]+$/, "") : "receipt";
                                this.pendingReceiptFile = new File([blob], `${safeName}.webp`, { type: 'image/webp' });
                                
                                const previewUrl = URL.createObjectURL(blob); 
                                if(preview) { 
                                    preview.src = previewUrl; 
                                    preview.style.display = 'block'; 
                                    preview.className = 'bal-receipt-preview-new'; 
                                }
                                setUploadSuccessUI('image');
                                
                                // 🛡️ كنس الذاكرة الإجباري لصور الموبايل العملاقة
                                canvas.width = 0; canvas.height = 0; 
                                img.src = '';
                            }, 'image/webp', 0.75);
                        } catch (err) {
                            getSys().showToast?.('تعذر معالجة الصورة، قد تكون تالفة أو كبيرة', 'error');
                            if (uploadBox) uploadBox.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>';
                            inp.value = '';
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
        
        const amount = parseFloat(input.value) || 0;
        const payCurr = (this.currentPayCurrency || '').toUpperCase();
        if (typeof DataManager.calculateDepositFee !== 'function') return;
        
        const result = DataManager.calculateDepositFee(amount, this.currentPayment, payCurr);
        
        window.requestAnimationFrame(() => {
            const errorBox = document.getElementById('bal-amount-error');
            const submitBtn = document.getElementById('btn-submit-deposit');
            const netDisplay = document.getElementById('calc-net');
            const netWrap = document.getElementById('bal-net-wrap');
            const limitsBar = document.getElementById('bal-limits-bar');

            const s = (this.currentPayment.currencySettings && this.currentPayment.currencySettings[payCurr]) ? this.currentPayment.currencySettings[payCurr] : this.currentPayment;

            if (amount > 0) {
                if (parseFloat(s.min) > 0 && amount < parseFloat(s.min)) { result.isValid = false; result.msg = `الحد الأدنى للإيداع هو ${s.min}`; } 
                else if (parseFloat(s.max) > 0 && amount > parseFloat(s.max)) { result.isValid = false; result.msg = `الحد الأعلى للإيداع هو ${s.max}`; }
            }
            
            if (limitsBar) {
                const itemsHtml = UIBuilders.buildLimitsBar(parseFloat(s.fee)||0, payCurr, s.feeUnit||s.unit||'percent', s.feeType||'fee', parseFloat(s.min)||0, parseFloat(s.max)||0);
                if (itemsHtml.length === 0) limitsBar.style.display = 'none';
                else { limitsBar.style.display = 'flex'; limitsBar.className = `compact-limits-bar count-${itemsHtml.length}`; limitsBar.innerHTML = itemsHtml.join(''); }
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
        const amount = parseFloat(input ? input.value.trim() : '') || 0;
        
        if (isNaN(amount) || amount <= 0) { getSys().showToast?.('يرجى إدخال مبلغ إيداع صحيح', 'error'); return; }
        
        const payCurr = currency || this.currentPayCurrency || 'USD';

        let methodMaxLimit = 0;
        if (this.currentPayment) {
            const s = (this.currentPayment.currencySettings && this.currentPayment.currencySettings[payCurr]) ? this.currentPayment.currencySettings[payCurr] : this.currentPayment;
            methodMaxLimit = parseFloat(s.max) || 0;
        }
        
        const GLOBAL_MAX_LIMIT_USD = 5000;
        let dynamicGlobalLimit = GLOBAL_MAX_LIMIT_USD;
        
        if (payCurr !== 'USD' && typeof DataManager !== 'undefined' && typeof DataManager._safeConvert === 'function') {
            dynamicGlobalLimit = DataManager._safeConvert(GLOBAL_MAX_LIMIT_USD, 'USD', payCurr, typeof DataManager.getRates === 'function' ? DataManager.getRates() : {}, 'deposit');
        }

        if (methodMaxLimit > 0 && amount > methodMaxLimit) {
            const symbol = RenderHelpers?.getCurrencySymbolText ? RenderHelpers.getCurrencySymbolText(payCurr) : payCurr;
            getSys().showToast?.(`الحد الأقصى للإيداع هو ${Number(methodMaxLimit).toLocaleString('en-US')} ${symbol}`, 'error'); return;
        } else if (amount > dynamicGlobalLimit || amount > Number.MAX_SAFE_INTEGER) {
            const symbol = RenderHelpers?.getCurrencySymbolText ? RenderHelpers.getCurrencySymbolText(payCurr) : payCurr;
            getSys().showToast?.(`يتجاوز المبلغ سقف الإيداع الكلي (${Number(dynamicGlobalLimit).toLocaleString('en-US')} ${symbol})`, 'warning');
            if (input) { input.value = Math.floor(dynamicGlobalLimit); if (typeof this.calcFee === 'function') this.calcFee(); }
            return;
        }

        if (input && input.classList.contains('input-invalid')) { getSys().showToast?.('المبلغ خارج الحدود المسموحة', 'error'); return; }
        
        const submitBtn = document.querySelector('[data-action="submit-balance"]');
        const shieldId = 'invisible-tx-shield';
        
        this._isProcessingTx = true;
        this._toggleButtonLoader(submitBtn, true); 
        if (!document.getElementById(shieldId)) document.body.insertAdjacentHTML('beforeend', `<div id="${shieldId}"></div>`);
        
        this._startTxWatchdog(submitBtn, shieldId);
        
        try {
            let finalReceiptUrl = '';
            if (this.pendingReceiptFile) {
                const uniqueFileName = `dep_${DataManager.user?.uid || 'unknown'}_${Date.now()}.${this.pendingReceiptFile.type === 'application/pdf' ? 'pdf' : 'webp'}`;
                finalReceiptUrl = await FirebaseAdapter.uploadImage(this.pendingReceiptFile, 'receipts', uniqueFileName);
                if (!finalReceiptUrl) throw new Error("تعذر رفع الإشعار، تأكد من اتصالك بالإنترنت.");
            }
            
            const result = await DataManager.submitBalanceRequest(amount, this.currentPayment, payCurr, finalReceiptUrl);
            
            if (result.success) {
                getSys().sfx?.('success');
                this.closeBalanceModal();
                if (typeof DataManager.syncUser === 'function') DataManager.syncUser();
                setTimeout(() => getSys().openModal?.('success'), 150);
            } else { getSys().showToast?.(result.msg, 'error'); }
        } catch (error) {
            console.error("🚨 خطأ أثناء إرسال الإيداع:", error);
            const msg = error.code ? ({
                'failed-precondition': error.message, 'already-exists': 'لديك طلب قيد المراجعة بالفعل.',
                'resource-exhausted': 'يرجى الانتظار قبل إرسال طلب جديد.', 'permission-denied': 'حسابك مقيد.',
                'deadline-exceeded': 'انتهى وقت الطلب بسبب ضعف الإنترنت.', 'unauthenticated': 'انتهت جلستك، يرجى تسجيل الدخول.'
            }[error.code] || 'خطأ غير معروف في الخادم') : (error.message || 'فشل إرسال الطلب');
            getSys().showToast?.(msg, 'error');
        } finally {            
            this._cleanupTxUI(submitBtn, shieldId);
        }
    },

    togglePayDetail: function(headerElement) {
        if (!headerElement) return;
        const card = headerElement.closest('.pay-history-card');
        if (!card) return;
        
        window.requestAnimationFrame(() => {
            const det = card.querySelector('.ph-details-body');
            const arrow = headerElement.querySelector('.fa-chevron-down, .fa-angle-down, .fa-chevron-left, .ph-arrow-btn, .ph-arrow');
            if (det) { const isOpen = det.classList.toggle('is-open'); if(arrow) arrow.classList.toggle('is-open', isOpen); }
        });
        getSys().sfx?.('nav');
    },

    toggleWalletStats: function(btn) {
        const drawer = document.getElementById('walletStatsDrawer');
        if (drawer) drawer.classList.contains('active') ? this.closeWalletStats() : this.openWalletStats(btn);
    },

    openWalletStats: function(btn) {
        window.requestAnimationFrame(() => {
            document.getElementById('walletStatsDrawer')?.classList.add('active');
            if (btn) btn.classList.add('open');
            document.getElementById('wallet-modal')?.classList.add('drawer-blur-active');
        });
        getSys().sfx?.('nav');
    },

    closeWalletStats: function() {
        window.requestAnimationFrame(() => {
            document.getElementById('walletStatsDrawer')?.classList.remove('active');
            const wModal = document.getElementById('wallet-modal');
            if (wModal) { wModal.classList.remove('drawer-blur-active'); wModal.querySelector('.detail-arrow')?.classList.remove('open'); }
        });
    },
    
    openDetail: function(e, type, id) {
        getSys().resetUI?.();
        const content = document.getElementById('tx-detail-content');
        if (!content) return;

        const html = UIBuilders.buildTransactionDetail(type, id, LiveStoreData, DataManager);
        
        if (html) {
            window.requestAnimationFrame(() => {
                content.innerHTML = html;
                getSys().openModal?.('tx-detail');
            });
        }
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