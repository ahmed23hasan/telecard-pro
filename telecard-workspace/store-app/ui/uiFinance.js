// ============================================================================
// 💳 وحدة الدفع والمنتجات (uiFinance.js) - النسخة الماسية الشاملة (Pro V4.3)
// 🎯 الوظيفة: نوافذ الشراء، الإيداعات، فلاتر القوائم، وتفاصيل الطلبات
// 🌟 التحديث الأقصى: 
// 1. [Tx Watchdog]: حارس المعاملات الذكي لمنع تجمد الواجهة عند انقطاع الإنترنت.
// 2. [Safe Modal Closure]: الإغلاق الآمن للنوافذ باستخدام transitionend.
// 3. [Anti-Spam Shield]: درع حماية الواجهة من النقرات المتعددة (Invisible Shield).
// 4. [Clean Architecture]: تم فصل جميع كتل الـ HTML إلى uiBuilders.js
// ============================================================================

import { Utils } from '../utils.js';
import { DataManager, LiveStoreData } from '../dataManager.js';
import { RenderManager } from '../renderManager.js';
import { RenderHelpers } from '../core/renderHelpers.js';
import { FirebaseAdapter } from '../core/firebaseAdapter.js';
import { UIBuilders } from './uiBuilders.js'; // استيراد مصنع الواجهات

const getSys = () => {
    if (window.ClientSystem) return window.ClientSystem;
    if (window.UIManager) return window.UIManager;
    
    return new Proxy({}, {
        get: (target, prop) => () => {
            console.error(`🚨 تم إيقاف استدعاء [${String(prop)}] لأن النظام (ClientSystem) لم يكتمل إقلاعه بعد!`);
        }
    });
};

export const UIFinance = {

    pendingReceiptFile: null,
    _isProcessingTx: false, 
    _watchdogTimer: null,
    _boundOfflineHandler: null, 
    // 🛡️ [متحكم اللودر الذكي - Smart Loader Controller]
    _toggleButtonLoader: function(btn, isLoading) {
        if (!btn) return;
        
        if (isLoading) {
            btn.disabled = true;
            btn.classList.add('is-loading');
            
            // إذا كان الزر لا يحتوي على هيكلة اللودر الجاهزة، نصنعها له برمجياً مع حمايته من التشوه
            if (!btn.querySelector('.btn-spinner')) {
                // حفظ شكل الزر الأصلي
                if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
                
                // تثبيت عرض الزر حتى لا ينكمش أو يهتز شكله أثناء الدوران
                const btnWidth = btn.offsetWidth;
                if (btnWidth > 0) btn.style.width = `${btnWidth}px`;
                
                // زرع اللودر الأنيق
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري المعالجة...`;
            }
        } else {
            btn.disabled = false;
            btn.classList.remove('is-loading');
            
            // استعادة الزر لشكله الطبيعي بعد انتهاء العملية
            if (btn.dataset.originalHtml) {
                btn.innerHTML = btn.dataset.originalHtml;
                btn.style.width = ''; // إزالة العرض الثابت
                delete btn.dataset.originalHtml;
            }
        }
    },

    _startTxWatchdog: function(submitBtn, shieldId) {
        this._watchdogTimer = setTimeout(() => {
            if (this._isProcessingTx) {
                console.warn("[TeleCard] Watchdog: Transaction timed out, forcing unlock.");
                getSys().showToast?.('طال وقت المعاملة أكثر من المعتاد، يرجى التحقق من حالة الطلب.', 'warning');
                this._cleanupTxUI(submitBtn, shieldId);
            }
        }, 20000);

        this._boundOfflineHandler = () => {
            if (this._isProcessingTx) {
                getSys().showToast?.('تم انقطاع الاتصال! جاري استرداد الحالة...', 'warning');
            }
        };
        window.addEventListener('offline', this._boundOfflineHandler);
    },

        _cleanupTxUI: function(submitBtn, shieldId) {
        this._isProcessingTx = false;
        
        const shield = document.getElementById(shieldId);
        if (shield) shield.remove();
        
        if (submitBtn) {
            this._toggleButtonLoader(submitBtn, false); // 👈 إيقاف اللودر واستعادة الزر بذكاء
        }
        
        if (this._watchdogTimer) clearTimeout(this._watchdogTimer);
        if (this._boundOfflineHandler) window.removeEventListener('offline', this._boundOfflineHandler);
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
        
        if (type === 'purchase') { getSys().openOrders?.(); } 
        else { getSys().openMyPayments?.(); }
        
        const targetSearchId = (type === 'purchase') ? 'order-search-input' : 'pay-search-input';
        const searchInput = document.getElementById(targetSearchId);
        if (searchInput) searchInput.value = id;

        if (RenderManager) RenderManager.highlightId = id;

        if (type === 'purchase') { if(RenderManager.renderOrders) RenderManager.renderOrders(); } 
        else { if(RenderManager.renderPayments) RenderManager.renderPayments(); }
    },    

    _validateKycAndSystem: function(actionType = 'purchase') {
        const sys = LiveStoreData.system || {};
        if (sys.freeze) { 
            getSys().showToast?.(sys.freezeMsg || 'عذراً، العمليات المالية متوقفة مؤقتاً لتحديث النظام.', 'warning'); 
            return false; 
        }

        if (!DataManager || !DataManager.user) {
            getSys().showToast?.('يجب تسجيل الدخول أولاً للقيام بهذا الإجراء', 'error');
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
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
        if (kycConfig.mode === 'all') { 
            needsKyc = true; 
        } else if (kycConfig.mode === 'specific' || kycConfig.mode === 'spec') {
            const targetedArray = (kycConfig.targetedTiers || []).map(t => String(t));
            const currentTier = DataManager.getUserTier(DataManager.user);
            if (targetedArray.includes(String(currentTier.id)) || targetedArray.includes(String(DataManager.user.tierId))) { 
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

        try {
            DataManager.currentProd = structuredClone(originalProd);
        } catch (e) {
            DataManager.currentProd = JSON.parse(JSON.stringify(originalProd));
        }

        const badgeContainer = document.getElementById('pm-badge-container');
        if (badgeContainer) {
            badgeContainer.innerHTML = ''; 
            const activeOffer = DataManager.getActiveOffer(DataManager.currentProd.id);
            
            if (activeOffer?.visualConfig?.grid && activeOffer.visualConfig.badgeStyle !== 'none') {
                const v = activeOffer.visualConfig.grid;
                const colorClass = RenderManager._getMappedColor(v.badgeColor);
                badgeContainer.innerHTML = `
                    <div class="offer-badge-base ${v.badgeStyle} ${colorClass}" 
                         style="position: relative; top: 0; right: 0; width: fit-content; margin-bottom: 5px;">
                        ${Utils.escapeHtml(v.badgeText)}
                    </div>`;
            } else if (DataManager.currentProd.badgeText) {
                badgeContainer.innerHTML = `
                    <div class="offer-badge-base prod-badge badge-${DataManager.currentProd.badgeColor || 'red'}" 
                         style="position: relative; top: 0; right: 0; width: fit-content; margin-bottom: 5px;">
                        ${Utils.safeText(DataManager.currentProd.badgeText)}
                    </div>`;
            }
        }

        DataManager.currentProd.basePriceUsd = DataManager.currentProd.basePriceUsd || DataManager.currentProd.price || DataManager.currentProd.unitPrice || 0;
        if (Array.isArray(DataManager.currentProd.options)) {
            DataManager.currentProd.options = DataManager.currentProd.options.map(o => ({ ...o, basePriceUsd: o.basePriceUsd || o.price || 0 }));
        }

        const nameEl = document.getElementById('pm-name');
        if(nameEl) nameEl.innerText = DataManager.currentProd.name;
        
        const favBtn = document.getElementById('pm-fav-btn');
        if (favBtn) {
            const isFav = DataManager.isFavorite ? DataManager.isFavorite(DataManager.currentProd.id) : false;
            favBtn.classList.toggle('active', isFav);
            favBtn.innerHTML = `<i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
        }
        
        const descBox = document.getElementById('pm-desc-container');
        if (descBox) {
            if (DataManager.currentProd.description) {
                descBox.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${Utils.escapeHtml(DataManager.currentProd.description)}`;
                descBox.style.display = 'block';
            } else descBox.style.display = 'none';
        }

        const dynOps = document.getElementById('pm-dynamic-ops');
        const staOps = document.getElementById('pm-static-ops');
        const inputContainer = document.getElementById('pm-input-container');
        const simpleQtyBox = document.getElementById('simple-qty-wrapper');

        if(dynOps) { dynOps.style.display = 'none'; dynOps.innerHTML = ''; dynOps.classList.remove('pm-ops-visible'); }
        if(staOps) staOps.style.display = 'none';
        if(simpleQtyBox) simpleQtyBox.style.display = 'none';
        getSys().hideQtyError?.();

        const createInput = (inpId, lbl) => {
            const safeLbl = Utils.escapeHtml(lbl || '');
            return `<div class="floating-group"><input type="text" id="${inpId}" class="floating-input" placeholder=" " autocomplete="off"><label class="floating-label">${safeLbl}</label></div>`;
        };

        let inputHtml = '';

        if (DataManager.currentProd.type === 'double') {
            inputHtml += createInput('pm-inp-1', DataManager.currentProd.input1Label);
            inputHtml += createInput('pm-inp-2', DataManager.currentProd.input2Label);
        } else if (['single', 'counter'].includes(DataManager.currentProd.type)) { 
            inputHtml += createInput('pm-inp-1', DataManager.currentProd.input1Label);
        } else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) {
            simpleQtyBox.style.display = 'block';
            const sQty = document.getElementById('simple-qty-val');
            if(sQty) sQty.value = 1;
        } else if (DataManager.currentProd.type === 'select') {
            inputHtml += createInput('pm-inp-1', DataManager.currentProd.input1Label);
            staOps.style.display = 'block';
            
            const sel = document.getElementById('pm-pack');
            const menu = document.getElementById('pkg-custom-menu');
            const triggerText = document.getElementById('pkg-selected-text');
            const dropdownContainer = document.getElementById('pkg-custom-dropdown');

            if (sel && menu && dropdownContainer) {
                dropdownContainer.classList.remove('open'); 
                
                let selHtml = '';
                const frag = document.createDocumentFragment();
                const options = DataManager.currentProd.options || [];

                options.forEach((pkg, idx) => {
                    selHtml += `<option value="${idx}">${Utils.escapeHtml(pkg.name)}</option>`;
                    const item = document.createElement('div');
                    item.className = 'dropdown-item';
                    item.dataset.idx = idx;
                    item.dataset.name = pkg.name;
                    item.innerHTML = `<span>${Utils.escapeHtml(pkg.name)}</span>`;
                    frag.appendChild(item);
                });

                sel.innerHTML = selHtml;
                menu.innerHTML = '';
                menu.appendChild(frag);

                if(!menu._boundClick) {
                    menu.addEventListener('click', (e) => {
                        const item = e.target.closest('.dropdown-item');
                        if(!item) return;
                        
                        sel.value = item.dataset.idx; 
                        triggerText.textContent = item.dataset.name; 
                        dropdownContainer.classList.remove('open');
                        
                        menu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
                        item.classList.add('active');
                        
                        this.updatePriceDisplay();
                        getSys().revalidateAppliedCoupon?.();
                        getSys().sfx?.('nav');
                    });
                    menu._boundClick = true;
                }

                if (options.length > 0) {
                    sel.value = 0; triggerText.textContent = options[0].name;
                    if(menu.firstChild) menu.firstChild.classList.add('active');
                } else { triggerText.textContent = "لا توجد باقات"; }
            }
        }
        
        if(inputContainer) inputContainer.innerHTML = inputHtml;

        getSys().openModal?.('purchase');

        if (DataManager.currentProd.type === 'counter') {
            const dOps = document.getElementById('pm-dynamic-ops');
            if (dOps) {
                dOps.classList.add('pm-ops-visible'); dOps.style.display = 'block'; 
                dOps.innerHTML = `
                    <div class="pm-new-grid">
                        <div class="pm-float-box"><input type="tel" id="pm-qty" inputmode="numeric" dir="ltr" placeholder=" "> <label>العدد</label></div>
                        <div class="pm-float-box readonly"><input type="text" id="pm-price-unit" readonly placeholder=" "><label>سعر القطعة</label></div>
                    </div>`; 

                const qInp = document.getElementById('pm-qty');
                let minQ = parseInt(DataManager.currentProd.minQty) || 1;
                qInp.value = minQ; 
                
                qInp.addEventListener('input', (e) => {
                    e.target.value = e.target.value.replace(/[^0-9]/g, ''); 
                    this.updatePriceDisplay(); 
                    getSys().revalidateAppliedCoupon?.();
                });

                qInp.addEventListener('blur', (e) => {
                    let val = parseInt(e.target.value, 10);
                    if (isNaN(val) || val < minQ) { 
                        e.target.value = minQ; 
                        this.updatePriceDisplay(); 
                        getSys().revalidateAppliedCoupon?.();
                    }
                });
            }
        }

        this.updatePriceDisplay();
    },

    closePurchaseModal: function() { 
        getSys().removeCoupon?.(true);
        getSys().closeModal?.('purchase');

        const currentTitle = document.getElementById('grid-title')?.innerText?.trim();
        if(currentTitle === 'المفضلة') {
            const grid = document.getElementById('store-grid');
            if(grid) { grid.style.opacity = '1'; grid.style.transform = 'translateY(0)'; grid.style.filter = 'none'; }
        }

        if (DataManager.currentProd) {
            const targetProdName = DataManager.currentProd.name; 
            
            setTimeout(() => {
                const cards = document.querySelectorAll('.product-card');
                cards.forEach(card => {
                    const nameEl = card.querySelector('.product-name');
                    if (nameEl && nameEl.innerText.trim() === targetProdName) {
                        const infoEl = card.querySelector('.card-info');
                        if (infoEl) {
                            window.requestAnimationFrame(() => {
                                infoEl.classList.add('shine-strong');
                                setTimeout(() => {
                                    if (infoEl.isConnected) infoEl.classList.remove('shine-strong');
                                }, 2000);
                            });
                        }
                    }
                });
            }, 300);
        }

        DataManager.currentProd = null;
    },

    closePurchaseSuccess: function() {
        getSys().closeModal?.('purchase-success');
    },

    closeGeneralSuccess: function() {
        getSys().closeModal?.('success');
    },
    
    updateSimpleQty: function(change) {
        let el = document.getElementById('simple-qty-val');
        if (!el || !DataManager.currentProd) return;
        let val = parseInt(el.value, 10);
        let max = DataManager.currentProd.simpleMax || 10;
        let min = DataManager.currentProd.minQty || 1; 
        let newVal = val + change;

        if (newVal > max) { getSys().sfx?.('error'); getSys().showQtyError?.(`تجاوزت الحد المسموح (${max})`); return; }
        if (newVal < min) return; 

        el.value = newVal;
        getSys().hideQtyError?.();
        this.updatePriceDisplay(); 
        
        getSys().revalidateAppliedCoupon?.();
    },

    updatePriceDisplay: function() {
        if (!DataManager.currentProd) return;
        
        let qty = 1; 
        let optIdx = null;

        if (DataManager.currentProd.type === 'counter') { 
            qty = Math.max(1, parseInt(document.getElementById('pm-qty')?.value, 10)) || 1; 
        } 
        else if (DataManager.currentProd.type === 'select') { 
            const selEl = document.getElementById('pm-pack'); 
            optIdx = selEl ? Number(selEl.value) : 0; 
        } 
        else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) { 
            const qtyEl = document.getElementById('simple-qty-val'); 
            qty = qtyEl ? Math.max(1, parseInt(qtyEl.value, 10) || 1) : 1; 
        }

        if (qty <= 0 || isNaN(qty)) qty = 1;

        if (!DataManager || typeof DataManager.getPricingLocal !== 'function') return;

        const result = DataManager.getPricingLocal(DataManager.currentProd, qty, optIdx, DataManager.appliedCoupon);
        if (!result || typeof result !== 'object') return;

        const unitInput = document.getElementById('pm-price-unit');
        if (unitInput) unitInput.value = result.unitText || '';

        const beautifulTotalHtml = (typeof RenderHelpers !== 'undefined') 
            ? RenderHelpers.formatMoney(result.totalLocalBase, result.displayCurrency)
            : (result.totalText || '0.00');

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
            if (oldPriceEl) {
                oldPriceEl.innerHTML = (typeof RenderHelpers !== 'undefined') 
                    ? RenderHelpers.formatMoney(result.oldTotalLocalBase, result.displayCurrency)
                    : (result.oldTotalText || ''); 
            }
            if (currPriceEl) currPriceEl.innerHTML = beautifulTotalHtml; 
        } else {
            if (priceBox) priceBox.classList.remove('active');
            if (currPriceEl) currPriceEl.innerHTML = beautifulTotalHtml; 
        }
    },

        handlePurchaseSubmit: async function() { 
        if (this._isProcessingTx) return; 
        
        if (!DataManager.currentProd) return;
        if (!this._validateKycAndSystem('purchase')) return;
        
        const inp1El = document.getElementById('pm-inp-1');
        const inp2El = document.getElementById('pm-inp-2');
        const qtyEl = document.getElementById('simple-qty-val');
        
        const keepKeyboardOpen = () => { 
            if (inp1El && !inp1El.disabled) inp1El.focus(); 
            else if (qtyEl && !qtyEl.disabled) qtyEl.focus(); 
        };
        
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
            element.addEventListener('input', function() { 
                element.classList.remove('input-error'); 
                const msg = parent.querySelector('.input-error-text'); 
                if(msg) msg.remove(); 
            }, {once: true});
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
            qty = Math.max(1, parseInt(document.getElementById('pm-qty')?.value, 10)) || 1; 
        } else if (DataManager.currentProd.type === 'select') { 
            const selEl = document.getElementById('pm-pack'); 
            optIdx = selEl ? Number(selEl.value) : 0; 
            qty = 1; 
        } else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) { 
            qty = Math.max(1, parseInt(qtyEl?.value, 10)) || 1; 
            const max = DataManager.currentProd.simpleMax || 10; 
            if(qty > max) { showInlineError(qtyEl.parentNode, `أقصى كمية هي ${max}`); isValid = false; qtyEl.focus(); } 
        }

        if(!isValid) { getSys().sfx?.('error'); return; }
        if(!DataManager || typeof DataManager.confirmPurchase !== 'function') return;

        const submitBtn = document.getElementById('btn-confirm-buy') || document.querySelector('.pm-btn-gold');
        const shieldId = 'invisible-tx-shield';
        
        this._isProcessingTx = true;
        this._toggleButtonLoader(submitBtn, true); // 👈 تشغيل اللودر الأنيق

        if (!document.getElementById(shieldId)) {
            document.body.insertAdjacentHTML('beforeend', `<div id="${shieldId}"></div>`);
        }

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
                        if (descEl) descEl.innerHTML = 'تم تسليم الكود، تجده دائماً في <span class="smart-link" data-action="navigate-orders-success">سجل الطلبات</span>';
                        if (codeDisplayContainer) {
                            const splitCodesHtml = UIBuilders.buildCodesList(result.deliveredCodeText);
                            codeDisplayContainer.innerHTML = `<div class="dc-title"><i class="fa-solid fa-key"></i> الأكواد الخاصة بك:</div><div style="max-height: 200px; overflow-y: auto; padding-right: 5px;">${splitCodesHtml}</div>`;
                            codeDisplayContainer.classList.remove('d-none');
                        }
                    } else {
                        if (titleEl) titleEl.innerText = 'تم استلام طلبك!';
                        if (descEl) descEl.innerHTML = 'يمكنك متابعة حالة الطلب في <span class="smart-link" data-action="navigate-orders-success">سجل الطلبات</span>';
                        if (codeDisplayContainer) { codeDisplayContainer.innerHTML = ''; codeDisplayContainer.classList.add('d-none'); }
                    }
                    
                    const purchaseSuccessModal = document.getElementById('purchase-success-modal');
                    if (purchaseSuccessModal && !purchaseSuccessModal._boundSuccessLinks) {
                        purchaseSuccessModal.addEventListener('click', (e) => {
                            const link = e.target.closest('[data-action="navigate-orders-success"]');
                            if (link) {
                                getSys().closeModal?.('purchase-success'); 
                                getSys().openOrders?.();
                            }
                        });
                        purchaseSuccessModal._boundSuccessLinks = true;
                    }
                }, 150);
                
            } else {
                getSys().showToast?.(result.msg || 'عذراً، رصيدك الحالي غير كافٍ.', 'error'); 
                keepKeyboardOpen();
            }
        } catch (err) {
            console.error("🚨 خطأ أثناء تنفيذ الشراء السحابي:", err);
            
            // 🛡️ التوازن المثالي: رسالة عامة كخط دفاع افتراضي
            let displayMessage = 'حدث خطأ في الاتصال بالسيرفر، يرجى المحاولة لاحقاً';

            // 🎯 إظهار الرسالة الحقيقية فقط إذا كانت قادمة من فايربيز (HttpsError)
            if (err.name === 'FirebaseError' || err.code) {
                displayMessage = err.message; 
            }

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
        const dropdown = document.getElementById('bal-currency-dropdown');
        const selectedTxt = document.getElementById('bal-selected-currency');
        const items = document.querySelectorAll('#bal-currency-list .dropdown-item');
        
        if (selectedTxt) selectedTxt.innerText = curr;
        if (dropdown) dropdown.classList.remove('open');
        
        items.forEach(item => {
            if (item.dataset.curr === curr) item.classList.add('active');
            else item.classList.remove('active');
        });

        const amtCurr = document.getElementById('bal-amount-curr');
        if (amtCurr) amtCurr.innerText = curr;

        this.calcFee();
    },

    selectPay: function(id) {
        const payments = LiveStoreData.payments || [];
        const modal = document.getElementById('balance-modal');
        
        this.currentPayment = payments.find(p => String(p.id) === String(id));
        if (!this.currentPayment || !modal) return;
        
        modal.classList.add('is-step-2');
        modal.scrollTop = 0;
        
        if (typeof this._toggleBalHeaderBtn === 'function') {
            this._toggleBalHeaderBtn('back'); 
        }
        
        const section = document.getElementById('bal-method-info-section');
        if (!section) return;
        
        const p = this.currentPayment;
        
        let copyLinesHtml = '';
        let hasFields = false;
        const fieldsArray = p.detailFields || p.details || p.fields || [];
        
        const createSmartLine = (text, canCopy) => {
            const safeText = Utils.escapeHtml(String(text));
            if (canCopy) {
                return `
                <div class="smart-copy-line is-copyable" data-action="copy-text" data-text="${safeText}">
                    <div style="display: flex; flex-direction: column; justify-content: center; text-align: right; width: 100%;">
                        <span class="scl-text num-en" style="font-size: 14.5px; font-weight: 800;">${safeText}</span>
                    </div>
                    <i class="fa-regular fa-copy scl-icon"></i>
                </div>`;
            } else {
                return `
                <div class="smart-copy-line not-copyable">
                    <div style="display: flex; flex-direction: column; justify-content: center; text-align: right; width: 100%;">
                        <span class="scl-text" style="font-size: 13.5px; font-weight: 700; color: var(--text-main); line-height: 1.6;">
                            ${safeText.replace(/\n/g, '<br>')}
                        </span>
                    </div>
                </div>`;
            }
        };

        if (Array.isArray(fieldsArray) && fieldsArray.length > 0) {
            hasFields = true;
            fieldsArray.forEach((field) => {
                const val = typeof field === 'string' ? field : field.text || field.value || field.v || '';
                const canCopy = typeof field === 'string' ? true : (field.copyable !== false);
                if (val && String(val).trim() !== '') {
                    copyLinesHtml += createSmartLine(val, canCopy);
                }
            });
        }
        
        if (!hasFields && p.number) {
            copyLinesHtml += createSmartLine(p.number, true);
        }
        
        const infoData = p.info || p.note || p.instructions;
        if (infoData && String(infoData).trim() !== '') {
            const safeInfo = Utils.escapeHtml(String(infoData)).replace(/\n/g, '<br>');
            copyLinesHtml += `
            <div class="smart-copy-line not-copyable" style="background: rgba(var(--primary-rgb), 0.05); border: 1px dashed rgba(var(--primary-rgb), 0.3);">
                <div style="display: flex; flex-direction: column; gap: 4px; text-align: right; width: 100%;">
                    <span style="font-size: 11px; color: var(--primary); font-weight: 900; opacity: 0.9;">
                        <i class="fa-solid fa-circle-info"></i> تعليمات هامة
                    </span>
                    <span class="scl-text" style="font-size: 12.5px; line-height: 1.6; color: var(--text-main);">
                        ${safeInfo}
                    </span>
                </div>
            </div>`;
        }
        
        let copyContainer = copyLinesHtml ? `<div class="clean-list-container">${copyLinesHtml}</div>` : '';

        let availableCurrencies = [];

        if (p.currencies && typeof p.currencies === 'string') {
            const parsedCurrencies = p.currencies.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
            availableCurrencies.push(...parsedCurrencies);
        } else if (p.currency) {
            availableCurrencies.push(String(p.currency).toUpperCase());
        }

        if (p.currencySettings) {
            availableCurrencies.push(...Object.keys(p.currencySettings).map(c => c.toUpperCase()));
        }

        let uniqueCurrencies = [...new Set(availableCurrencies)];

        if (uniqueCurrencies.length === 0) {
            uniqueCurrencies = [(DataManager.user?.baseCurrency || 'USD').toUpperCase()];
        }
        
        this.currentPayCurrency = uniqueCurrencies[0];
        const isSingleCurrency = uniqueCurrencies.length === 1;

        let currItemsHtml = uniqueCurrencies.map((c, i) => `
            <div class="dropdown-item ${i === 0 ? 'active' : ''}" data-curr="${c}">${c}</div>
        `).join('');
        
        const baseCurr = (DataManager.user?.baseCurrency || 'USD').toUpperCase();
        
        section.innerHTML = UIBuilders.buildDepositForm(p, copyContainer, isSingleCurrency, this.currentPayCurrency, currItemsHtml, baseCurr);

        if (!section._boundDelegation) {
            section.addEventListener('input', (e) => {
                if (e.target.id === 'bal-amount') {
                    this.calcFee();
                    e.target.parentElement.classList.toggle('has-value', e.target.value !== '');
                }
            });
            
            section.addEventListener('click', (e) => {
                const uploadBox = e.target.closest('#bal-upload-box');
                if (uploadBox) document.getElementById('bal-file')?.click();
                
                const currTrigger = e.target.closest('.micro-currency-trigger');
                if (currTrigger) {
                    const list = currTrigger.parentElement.querySelector('.dropdown-menu');
                    if (list && list.style.display !== 'none') {
                        currTrigger.parentElement.classList.toggle('open');
                    }
                }
                
                const currItem = e.target.closest('.dropdown-item');
                if (currItem) {
                    const newCurrency = currItem.dataset.curr;
                    this.changeDepositCurrency(newCurrency);
                    
                    const dropWrap = e.target.closest('.split-dropdown');
                    if (dropWrap) dropWrap.classList.remove('open');
                }
            });
            
            section.addEventListener('change', (e) => {
                if (e.target.id === 'bal-file') {
                    this.previewReceipt(e.target);
                }
            });
            
            section._boundDelegation = true;
        }

        this.calcFee();
        getSys().sfx?.('nav');
    },

    backToPayMethods: function() {
        const modal = document.getElementById('balance-modal');
        if (!modal) return;

        modal.classList.remove('is-step-2'); 
        modal.scrollTop = 0;
        
        const scrollables = modal.querySelectorAll('.pm-scroll-content, .scrollable, .modal-content'); 
        scrollables.forEach(s => s.scrollTop = 0);

        if (typeof this._toggleBalHeaderBtn === 'function') {
            this._toggleBalHeaderBtn('close');
        }

        this.currentReceiptData = null; 
        this.pendingReceiptFile = null; 

        setTimeout(() => {
            const section = document.getElementById('bal-method-info-section');
            if (section && !modal.classList.contains('is-step-2')) {
                section.innerHTML = ''; 
            }
        }, 400);

        getSys().sfx?.('nav');
    },

    _toggleBalHeaderBtn: function(mode) {
        const actionBtn = document.querySelector('#balance-modal .pm-close-std') || document.getElementById('bal-action-btn');
        const titleEl = document.querySelector('#balance-modal .title-badge') || document.querySelector('#balance-modal .pm-title-badge');
        
        if (actionBtn) {
            if (actionBtn._boundBalClose) {
                const clone = actionBtn.cloneNode(true);
                actionBtn.parentNode.replaceChild(clone, actionBtn);
                actionBtn._boundBalClose = false;
            }

            const newBtn = document.querySelector('#balance-modal .pm-close-std') || document.getElementById('bal-action-btn');
            
            if (mode === 'back') {
                newBtn.setAttribute('data-action', 'back-balance-step');
                newBtn.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
            } else {
                newBtn.setAttribute('data-action', 'close-balance');
                newBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            }
        }

        if (titleEl) {
            if (mode === 'back') {
                titleEl.innerHTML = '<i class="fa-solid fa-money-bill-transfer"></i> إتمام الإيداع';
            } else {
                titleEl.innerHTML = '<i class="fa-solid fa-wallet"></i> إيداع رصيد';
            }
        }
    },

    closeBalanceModal: function() {
        const modal = document.getElementById('balance-modal');
        getSys().closeModal?.('balance');
        
        if (modal) {
            modal.addEventListener('transitionend', () => {
                try { this.backToPayMethods(); } catch(e) {}
            }, { once: true });
        }
    },

    previewReceipt: function(inp) { 
        const file = inp.files && inp.files[0];
        if(!file) {
            this.pendingReceiptFile = null;
            this.currentReceiptData = null;
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            getSys().showToast?.('حجم الملف كبير جداً. الحد الأقصى 10MB.', 'error');
            inp.value = '';
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            getSys().showToast?.('نوع الملف غير مدعوم. يرجى رفع صورة أو PDF.', 'error');
            inp.value = '';
            this.pendingReceiptFile = null;
            this.currentReceiptData = null;
            return;
        }

        const isPdf = file.type === 'application/pdf';
        const preview = document.getElementById('bal-img-preview');
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
            if(uploadBox) uploadBox.innerHTML = `<div class="bal-upload-success-row"><i class="fa-solid fa-spinner fa-spin bal-upload-success-icon"></i><span class="bal-upload-success-text">جاري معالجة الصورة...</span></div>`;

            const reader = new FileReader(); 
            reader.onload = e => { 
                const img = new Image();
                img.onload = () => {
                    requestAnimationFrame(() => {
                        try {
                            const canvas = document.createElement('canvas');
                            let width = img.width, height = img.height;
                            const MAX_SIZE = 1200; 
                            
                            if (width > height) { 
                                if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } 
                            } else { 
                                if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } 
                            }
                            
                            canvas.width = width; 
                            canvas.height = height;
                            
                            const ctx = canvas.getContext('2d'); 
                            if (!ctx) throw new Error('Canvas not supported');
                            
                            ctx.fillStyle = '#ffffff'; 
                            ctx.fillRect(0, 0, width, height); 
                            ctx.drawImage(img, 0, 0, width, height);
                            
                            canvas.toBlob((blob) => {
                                if (!blob) throw new Error('Blob failed');
                                const safeName = file.name ? file.name.replace(/\.[^/.]+$/, "") : "receipt";
                                const newWebPFile = new File([blob], `${safeName}.webp`, { type: 'image/webp' });
                                
                                this.pendingReceiptFile = newWebPFile;
                                
                                const previewUrl = URL.createObjectURL(blob);
                                if(preview) { 
                                    preview.src = previewUrl; 
                                    preview.style.display = 'block'; 
                                    preview.className = 'bal-receipt-preview-new'; 
                                }
                                setUploadSuccessUI('image');

                            }, 'image/webp', 0.75);
                        } catch (err) {
                            getSys().showToast?.('تعذر معالجة الصورة، قد تكون تالفة أو كبيرة جداً', 'error');
                            if (uploadBox) uploadBox.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>';
                            inp.value = '';
                        }
                    });
                };
                
                img.onerror = () => {
                    getSys().showToast?.('ملف الصورة تالف، يرجى اختيار صورة أخرى', 'error');
                    if (uploadBox) uploadBox.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>';
                    inp.value = '';
                };
                
                img.src = e.target.result;
            }; 
            
            reader.onerror = () => {
                getSys().showToast?.('تعذر قراءة الملف من جهازك', 'error');
                if (uploadBox) uploadBox.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>';
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

        const errorBox = document.getElementById('bal-amount-error');
        const submitBtn = document.getElementById('btn-submit-deposit');
        const netDisplay = document.getElementById('calc-net');
        const netWrap = document.getElementById('bal-net-wrap');
        const limitsBar = document.getElementById('bal-limits-bar');

        const s = (this.currentPayment.currencySettings && this.currentPayment.currencySettings[payCurr]) 
                  ? this.currentPayment.currencySettings[payCurr] 
                  : this.currentPayment;

        const minVal = parseFloat(s.min) || 0;
        const maxVal = parseFloat(s.max) || 0;
        const feeVal = parseFloat(s.fee) || 0;
        const feeType = s.feeType || 'fee';
        const feeUnit = s.feeUnit || s.unit || 'percent';

        if (amount > 0) {
            if (minVal > 0 && amount < minVal) {
                result.isValid = false;
                result.msg = `الحد الأدنى للإيداع هو ${minVal}`;
            } else if (maxVal > 0 && amount > maxVal) {
                result.isValid = false;
                result.msg = `الحد الأعلى للإيداع هو ${maxVal}`;
            }
        }
        
        if (limitsBar) {
            const itemsHtml = UIBuilders.buildLimitsBar(feeVal, payCurr, feeUnit, feeType, minVal, maxVal);

            if (itemsHtml.length === 0) {
                limitsBar.style.display = 'none';
            } else {
                limitsBar.style.display = 'flex';
                limitsBar.className = `compact-limits-bar count-${itemsHtml.length}`; 
                limitsBar.innerHTML = itemsHtml.join('');
            }
        }

        if (!result.isValid) {
            input.classList.toggle('input-invalid', amount > 0);
            if (errorBox) { 
                errorBox.innerHTML = (amount > 0) ? `<i class="fa-solid fa-circle-exclamation"></i> ${result.msg}` : ''; 
                errorBox.style.display = (amount > 0 && result.msg) ? 'block' : 'none'; 
                errorBox.classList.remove('d-none');
            }
            if (submitBtn) submitBtn.disabled = true; 
            if (netDisplay) netDisplay.innerText = "0.00";
            if (netWrap) netWrap.classList.remove('has-value');
        } 
        else {
            input.classList.remove('input-invalid');
            if (errorBox) {
                errorBox.style.display = 'none';
                errorBox.classList.add('d-none');
            }
            if (submitBtn) submitBtn.disabled = false;
            
            this.pendingDepositNetBase = result.netBase;
            
            if (netDisplay) {
                netDisplay.innerText = result.netBase.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            }
            if (netWrap) netWrap.classList.add('has-value'); 
        }
    },

        handleBalanceSubmit: async function(currency) {
        if (this._isProcessingTx) return;
        
        if (!this._validateKycAndSystem('deposit')) return;
        
        const input = document.getElementById('bal-amount');
        const rawValue = input ? input.value.trim() : '';
        const amount = parseFloat(rawValue) || 0;
        
        if (isNaN(amount) || amount <= 0) {
            getSys().showToast?.('يرجى إدخال مبلغ إيداع صحيح أكبر من صفر', 'error');
            return;
        }
        
        const MAX_DEPOSIT_LIMIT = 1000000;
        if (amount > MAX_DEPOSIT_LIMIT || amount > Number.MAX_SAFE_INTEGER) {
            getSys().showToast?.(`عذراً، الحد الأقصى للإيداع في العملية الواحدة هو ${MAX_DEPOSIT_LIMIT}`, 'error');
            if (input) input.value = ''; 
            return;
        }
        
        if (input && input.classList.contains('input-invalid')) {
            getSys().showToast?.('يرجى التأكد من أن المبلغ ضمن الحدود المسموحة لطريقة الدفع', 'error');
            return;
        }
        
        const submitBtn = document.querySelector('[data-action="submit-balance"]');
        const shieldId = 'invisible-tx-shield';
        
        this._isProcessingTx = true;
        this._toggleButtonLoader(submitBtn, true); 
        if (!document.getElementById(shieldId)) {
            document.body.insertAdjacentHTML('beforeend', `<div id="${shieldId}"></div>`);
        }
        
        this._startTxWatchdog(submitBtn, shieldId);
        
        try {
            const payCurr = currency || this.currentPayCurrency || 'USD';
            let finalReceiptUrl = '';
            
            if (this.pendingReceiptFile) {
                const userId = DataManager.user?.uid || DataManager.user?.id || 'unknown';
                const isPdf = this.pendingReceiptFile.type === 'application/pdf';
                const fileExt = isPdf ? 'pdf' : 'webp';
                const uniqueFileName = `dep_${userId}_${Date.now()}.${fileExt}`;
                
                finalReceiptUrl = await FirebaseAdapter.uploadImage(this.pendingReceiptFile, 'receipts', uniqueFileName);
                if (!finalReceiptUrl) throw new Error("تعذر رفع الإشعار، تأكد من اتصالك بالإنترنت.");
            }
            
            const result = await DataManager.submitBalanceRequest(amount, this.currentPayment, payCurr, finalReceiptUrl);
            
            if (result.success) {
                getSys().sfx?.('success');
                this.closeBalanceModal();
                if (typeof DataManager.syncUser === 'function') DataManager.syncUser();
                
                this.pendingReceiptFile = null;
                this.currentReceiptData = null;
                
                setTimeout(() => {
                    getSys().openModal?.('success');
                }, 150);
                
            } else {
                getSys().showToast?.(result.msg, 'error');
            }
        } catch (error) {
            console.error("🚨 خطأ أثناء إرسال طلب الإيداع:", error);
            
            // 🛡️ التوازن المثالي: رسالة عامة كخط دفاع افتراضي
            let displayMessage = 'فشل إرسال الطلب، يرجى المحاولة لاحقاً';

            // 🎯 إظهار الرسالة الحقيقية فقط إذا كانت قادمة من فايربيز (HttpsError)
            if (error.name === 'FirebaseError' || error.code) {
                displayMessage = error.message; 
            }

            getSys().showToast?.(displayMessage, 'error');
        } finally {
            this._cleanupTxUI(submitBtn, shieldId);
        }
    },
    togglePayDetail: function(headerElement) {
        if (!headerElement) return;

        const card = headerElement.closest('.pay-history-card');
        if (!card) return;

        const det = card.querySelector('.ph-details-body');
        if (!det) return;

        const isOpen = det.classList.toggle('is-open');
        
        const arrow = headerElement.querySelector('.fa-chevron-down, .fa-angle-down, .fa-chevron-left, .ph-arrow-btn, .ph-arrow');
        
        if (arrow) {
            arrow.classList.toggle('is-open', isOpen);
        }

        if (typeof this.sfx === 'function') {
            this.sfx('nav');
        } else if (typeof window.ClientSystem !== 'undefined' && typeof window.ClientSystem.sfx === 'function') {
            window.ClientSystem.sfx('nav');
        }
    },

    toggleWalletStats: function(btn) {
        const drawer = document.getElementById('walletStatsDrawer');
        if (!drawer) return;
        
        const isActive = drawer.classList.contains('active');
        
        if (isActive) {
            this.closeWalletStats(); 
        } else {
            this.openWalletStats(btn); 
        }
    },

    openWalletStats: function(btn) {
        const drawer = document.getElementById('walletStatsDrawer');
        const walletModal = document.getElementById('wallet-modal');
        if (!drawer) return;

        drawer.classList.add('active');
        if (btn) btn.classList.add('open');
        if (walletModal) walletModal.classList.add('drawer-blur-active');
        
        if (typeof this.sfx === 'function') this.sfx('nav');
    },

    closeWalletStats: function() {
        const drawer = document.getElementById('walletStatsDrawer');
        const walletModal = document.getElementById('wallet-modal');
        
        const arrowBtn = walletModal ? walletModal.querySelector('.detail-arrow') : null;

        if (drawer) drawer.classList.remove('active');
        if (arrowBtn) arrowBtn.classList.remove('open');
        
        if (walletModal) walletModal.classList.remove('drawer-blur-active');
    },
    
    openDetail: function(e, type, id) {
        getSys().resetUI?.();
        const modal = document.getElementById('tx-detail-modal'); 
        const content = document.getElementById('tx-detail-content');
        
        const formatInputData = (str) => { 
            if(!str || str === '---') return '<span class="num-en">---</span>'; 
            if(str.includes('|')) { 
                const parts = str.split('|').map(s => s.split(':').pop().trim());
                return `<div class="nm-input-stack">
                          ${parts.map(p => `<span class="num-en nm-input-capsule">${Utils.escapeHtml(p)}</span>`).join('')}
                        </div>`;
            } 
            let singleVal = str.includes(':') ? str.split(':').pop().trim() : str; 
            return `<span class="num-en nm-input-capsule">${Utils.escapeHtml(singleVal)}</span>`; 
        };
        let html = '';

        if(type === 'deposit') {
            const deposits = LiveStoreData.deposits || [];
            const d = deposits.find(x => String(x.id) === String(id));
            if(!d) {
                getSys().showToast?.('عذراً، لم يتم العثور على الإيداع.', 'error');
                return;
            }

            const shortDepositId = RenderHelpers.formatDepositId(d);

            let stClass = 'pending'; let stTxt = d.status === 'pending' ? 'قيد المراجعة' : d.status; let stIcon = 'fa-clock';
            if(d.status === 'approved' || d.status === 'completed') { stClass = 'completed'; stTxt = 'مقبول'; stIcon = 'fa-check-circle'; }
            else if(d.status === 'rejected') { stClass = 'rejected'; stTxt = 'مرفوض'; stIcon = 'fa-times-circle'; }
            
            const badgeContainer = document.getElementById('tx-top-badge-container');
            if(badgeContainer) badgeContainer.innerHTML = '';

            let replyHtml = '';
            if (d.adminNote && d.adminNote.trim() !== '') {
                const safeResponse = Utils.escapeHtml ? Utils.escapeHtml(d.adminNote) : d.adminNote.replace(/</g, '&lt;');
                const copySafeText = safeResponse.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n').replace(/\r/g, '');

                replyHtml = `
                <div class="nm-reply-box">
                    <div class="nm-reply-content">
                        <span class="nm-reply-head"><i class="fa-solid fa-headset"></i> ملاحظات الإدارة</span>
                        <div class="nm-reply-body admin-reply-text">${safeResponse}</div>
                    </div>
                    <button class="reply-copy-btn" data-action="copy-text" data-text="${copySafeText}" title="نسخ الرد">
                        <i class="fa-regular fa-copy"></i>
                    </button>
                </div>`;
            }

            let creditedRow = '';
            if (d.creditedAmount !== undefined) {
                const creditedValueHtml = RenderHelpers.formatMoney(d.creditedAmount, d.targetCurrency || 'USD');
                creditedRow = `
                <div class="nm-row-compact">
                    <span class="nm-label"><i class="fa-solid fa-wallet"></i> الرصيد المضاف</span>
                    <div class="nm-val">${creditedValueHtml}</div>
                </div>`;
            }

            const depositAmountHtml = RenderHelpers.formatMoney(d.amount, d.currency || 'USD');

            const receiptHtml = d.receipt ? `
                <div class="nm-universal-card nm-receipt-card" style="cursor: zoom-in;" onclick="window.open('${Utils.escapeHtml(d.receipt)}', '_blank')">
                    <img src="${Utils.escapeHtml(d.receipt)}" class="nm-receipt-img" alt="Receipt">
                    <div style="text-align:center; font-size:11px; margin-top:8px; color:var(--text-muted); font-weight:700;">
                        <i class="fa-solid fa-magnifying-glass-plus"></i> اضغط لعرض الإيصال كاملاً
                    </div>
                </div>` : '';

            html = `
            <div class="nm-container">
                <div class="nm-universal-card">
                    <div class="nm-title-frame"><div class="nm-prod-title">تفاصيل الإيداع</div></div>
                    <div class="nm-card-body">
                        <div class="nm-row-compact">
                            <span class="nm-label"><i class="fa-solid fa-coins"></i> المبلغ المودع</span>
                            <div class="nm-val">${depositAmountHtml}</div>
                        </div>
                        
                        ${creditedRow}
                        
                        <div class="nm-row-compact">
                            <span class="nm-label"><i class="fa-solid fa-building-columns"></i> طريقة الدفع</span>
                            <div class="nm-val"><span class="num-en">${Utils.escapeHtml(d.method || 'غير محدد')}</span></div>
                        </div>
                        
                        <div class="nm-row-compact">
                            <span class="nm-label"><i class="fa-solid fa-circle-info"></i> الحالة</span>
                            <div class="nm-status-badge-lux ${stClass}">
                                <i class="fa-solid ${stIcon}"></i> ${stTxt}
                            </div>
                        </div>
                        
                        <div class="nm-row-compact smart-copy-line is-copyable" data-action="copy-text" data-text="${shortDepositId}">
                            <span class="nm-label" style="pointer-events: none;"><i class="fa-solid fa-hashtag"></i> رقم العملية</span>
                            <div class="uid-capsule" style="pointer-events: none;">
                                <i class="fa-solid fa-id-card"></i>
                                <span class="num-en">${shortDepositId}</span>
                            </div>
                        </div>
                        
                        <div class="nm-row-compact">
                            <span class="nm-label"><i class="fa-solid fa-calendar"></i> التاريخ</span>
                            <span class="nm-val num-en">${RenderHelpers.formatSafeDate(d.time)}</span>
                        </div>
                    </div>
                </div>
                ${replyHtml}
                ${receiptHtml}
            </div>`;
        } else {
            const orders = LiveStoreData.orders || [];
            const user = DataManager.user;

            const o = orders.find(x => String(x.id) === String(id) && user && String(x.userId) === String(user.id));

            if(!o) {
                getSys().showToast?.('لا يمكن العثور على تفاصيل هذا الطلب أو أنك لا تملك صلاحية لعرضه', 'error');
                return;
            }

            const shortOrderId = RenderHelpers.formatOrderId(o);

            const isRet = (o.status === 'refunded' || o.status === 'returned');
            let stTxt = 'قيد التنفيذ'; let stClass = 'pending'; let stIcon = 'fa-clock';

            if (o.status === 'completed') { stTxt = 'مكتمل'; stClass = 'completed'; stIcon = 'fa-circle-check'; } 
            else if (o.status === 'rejected') { stTxt = 'مرفوض'; stClass = 'rejected'; stIcon = 'fa-circle-xmark'; } 
            else if (isRet) { stTxt = 'مسترجع'; stClass = 'returned'; stIcon = 'fa-rotate-left'; }
            
            let dateTimeDisplay = RenderHelpers.formatSafeDate(o.time);
            let finalInputVal = formatInputData(o.input);
            let displayQty = o.qty ? o.qty : 1;
            
            let durationHtml = '';
            const isFinished = (o.status === 'completed' || o.status === 'rejected' || isRet);

            if (!isFinished) {
                durationHtml = `<div class="nm-duration-pill"><i class="fa-solid fa-bolt"></i><span class="mx-1">مدة انجاز الطلب: </span><i class="fa-regular fa-clock opacity-90"></i></div>`;
            } else {
                let finalEndTime = o.actionTime || o.completedTime || o.updatedAt;
                if (!finalEndTime && o.status === 'completed' && o.deliveredCode && o.deliveredCode !== 'null') finalEndTime = o.time;
                let durationStr = finalEndTime ? (Utils.calculateOrderDuration ? Utils.calculateOrderDuration(o.time, finalEndTime) : '---') : 'غير متوفر';
                durationHtml = `<div class="nm-duration-pill"><i class="fa-solid fa-bolt"></i><span dir="ltr" class="nm-font-en-fix">مدة انجاز الطلب: ${durationStr}</span></div>`;
            }

            const badgeContainer = document.getElementById('tx-top-badge-container');
            if(badgeContainer) badgeContainer.innerHTML = '';

            let replyHtml = '';
            
            if (o.response && o.response.trim() !== '' && o.response !== 'null') {
                const safeResponse = Utils.escapeHtml ? Utils.escapeHtml(o.response) : o.response;
                const copySafeText = safeResponse.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n').replace(/\r/g, '');

                replyHtml += `
                <div class="nm-reply-box">
                    <div class="nm-reply-content">
                        <span class="nm-reply-head"><i class="fa-solid fa-headset"></i> رد المتجر</span>
                        <div class="nm-reply-body admin-reply-text">${safeResponse}</div>
                    </div>
                    <button class="reply-copy-btn" data-action="copy-text" data-text="${copySafeText}" title="نسخ الرد">
                        <i class="fa-regular fa-copy"></i>
                    </button>
                </div>`;
            }
            
            if (o.status === 'completed' && o.deliveredCode && o.deliveredCode !== 'null') {
                const splitCodesHtml = UIBuilders.buildCodesList(o.deliveredCode);
                
                replyHtml += `
                <div class="nm-reply-box auto-delivery-box">
                    <div class="nm-reply-content">
                        <span class="nm-reply-head"><i class="fa-solid fa-bolt"></i> تسليم سستم فوري</span>
                        <div class="nm-reply-body" style="max-height: 200px; overflow-y: auto; padding-right: 5px;">
                            ${splitCodesHtml}
                        </div>
                    </div>
                </div>`;
            }

            const cDiscountLocal = Number(o.couponDiscount || 0);
            const oDiscountLocal = Number(o.saleDiscount || 0);
            const origLocal = Number(o.originalPrice || o.baseUsd || o.price || 0);
            const finalLocal = Number(o.price || 0);
            
            let cCodeText = o.couponCode ? Utils.escapeHtml(o.couponCode) : 'مفعل';
            if (o.pricingSnapshot && o.pricingSnapshot.couponCode) {
                cCodeText = Utils.escapeHtml(o.pricingSnapshot.couponCode);
            }

            const displayCurr = (o.priceCurrency || 'USD').toUpperCase();
            const formatFn = (amt) => RenderHelpers.formatMoney(amt, displayCurr);

            const hasCoupon = cDiscountLocal > 0;
            const hasSale = oDiscountLocal > 0;
            let priceSectionHtml = '';

            if (hasCoupon || hasSale) {
                let breakdownDetails = `
                    <div class="nm-receipt-line">
                        <span class="line-lbl"><i class="fa-solid fa-box-open"></i> السعر الأساسي</span>
                        <span class="old-amt num-en" dir="ltr">${formatFn(origLocal)}</span>
                    </div>`;
                    
                if (hasSale) {
                    breakdownDetails += `
                    <div class="nm-receipt-line sale-line">
                        <span class="line-lbl"><i class="fa-solid fa-tag"></i> تخفيض العرض</span>
                        <span class="num-en" dir="ltr">-${formatFn(oDiscountLocal)}</span>
                    </div>`;
                }
                
                if (hasCoupon) {
                    breakdownDetails += `
                    <div class="nm-receipt-line discount-line">
                        <span class="line-lbl"><i class="fa-solid fa-ticket"></i> كوبون (${cCodeText})</span>
                        <span class="num-en" dir="ltr">-${formatFn(cDiscountLocal)}</span>
                    </div>`;
                }
                
                priceSectionHtml = `
                <div class="nm-row-compact col-layout">
                    <div class="nm-receipt-integrated">
                        <div class="nm-receipt-details-box">
                            ${breakdownDetails}
                        </div>
                        <div class="nm-receipt-main-row">
                            <span class="nm-label"><i class="fa-solid fa-file-invoice-dollar"></i> الإجمالي النهائي</span>
                            <span class="nm-receipt-main-total num-en" dir="ltr">${formatFn(finalLocal)}</span>
                        </div>
                    </div>
                </div>`;
            } else {
                priceSectionHtml = `<div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-coins"></i> السعر الاجمالي</span><div class="nm-val" dir="ltr">${formatFn(finalLocal)}</div></div>`;
            }

            html = `
            <div class="nm-container">
                ${durationHtml} <div class="nm-universal-card">
                    <div class="nm-title-frame"><div class="nm-prod-title">${Utils.escapeHtml(o.product || 'منتج')}</div></div>
                    <div class="nm-card-body">
                        <div class="nm-row-compact smart-copy-line is-copyable" data-action="copy-text" data-text="${shortOrderId}">
                            <span class="nm-label" style="pointer-events: none;"><i class="fa-solid fa-hashtag"></i> رقم الطلب (ID)</span>
                            <div class="nm-val scl-text" dir="ltr" style="pointer-events: none;">
                                <span class="num-en">${shortOrderId}</span>

                                <i class="fa-regular fa-copy scl-icon"></i>
                            </div>
                        </div>
                        
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-circle-info"></i> الحالة</span><div class="nm-status-badge-lux ${stClass}"><i class="fa-solid ${stIcon}"></i> ${stTxt}</div></div>
                        
                        ${priceSectionHtml} 
                        
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-layer-group"></i> الكمية</span><div class="nm-val" dir="ltr"><span class="num-en">${displayQty}</span></div></div>
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-clock"></i> الوقت والتاريخ</span><div class="nm-val" dir="ltr"><span class="num-en">${dateTimeDisplay}</span></div></div>
                        
                        <div class="nm-row-compact align-start">
                            <span class="nm-label"><i class="fa-solid fa-bullseye"></i> بيانات الحساب (ID)</span>
                            <div class="nm-val" dir="ltr">${finalInputVal}</div>
                        </div>
                        
                    </div>
                </div>
                <div class="nm-data-box">
                    <div class="nm-btn-print-magic" id="export-order-pdf-btn" data-action="export-receipt" data-id="${id}">
                        <i class="fa-solid fa-file-pdf"></i> تصدير الإيصال
                    </div>
                </div>

                ${replyHtml}
            </div>
            `;
        }        
        if (content) {
            content.innerHTML = html;
        }
        
        getSys().openModal?.('tx-detail');
    },

    closePayReceipt: function() {
        const lightbox = document.getElementById('pay-receipt-lightbox');
        if (lightbox) {
            lightbox.classList.remove('active');
            
            setTimeout(() => {
                const img = document.getElementById('pay-receipt-img');
                if (img) img.src = '';
            }, 300);
        }
    }
};
