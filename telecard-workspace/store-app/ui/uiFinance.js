// ============================================================================
// 💳 وحدة الدفع والمنتجات (ui/uiFinance.js) - الإصدار المؤسسي V21.0.0 💎
// 🎯 الوظيفة: نوافذ الشراء، الإيداعات، المعاملات المالية، وتأمين الطلبات.
// 🚀 التحديثات المعمارية الصارمة (V21.0.0 - Citadel Modal Stack & Live Detail Sync):
// 1. Non-Destructive Tx-Detail (Level 2) 🪟: فتح تفاصيل العملية فوق سجل الطلبات/الإشعارات دون إغلاق النافذة الأم أو مسح البحث.
// 2. Live Open Detail Refresh ⚡: إضافة refreshOpenDetail لتحديث نافذة تفاصيل الطلب لحظياً فور وصول الكود من السيرفر.
// 3. Single-Pass Jump Transaction 🎯: تصفير تبويب الفلتر وضبط highlightId قبل الرسم لضمان ظهور وتمييز الطلب أو الإيداع فوراً.
// 4. Direct ES6 Module Binding 🔗: ربط مباشر بـ UIManager و UIState و Components دون وسطاء.
// ============================================================================

import * as Utils from '../utils.js';
import { DataManager, LiveStoreData, StoreDB } from '../dataManager.js';
import { RenderManager } from '../renderManager.js';
import { RenderHelpers } from '../core/renderHelpers.js';
import { UIBuilders } from './uiBuilders.js';
import { UIManager, UIState } from './uiManager.js';
import { Components } from '../components.js';

export const UIFinance = {

    _watchdogTimer: null,
    _amountTypingTimer: null,
    
    _offlineHandler: () => {
        if (UIState.isProcessingTx) {
            UIManager.showToast?.('انقطع الاتصال بالإنترنت! النظام يحمي معاملتك الآن.', 'error');
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
                if (!btn.classList.contains('is-loading')) {
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
            console.warn("🛡️ UI Loader recovery:", e);
            btn.disabled = false;
            btn.classList.remove('is-loading', 'tx-processing-safe');
        }
    },

    _lockUI: function(btn) {
        UIState.isProcessingTx = true;
        this._toggleButtonLoader(btn, true);

        const shieldId = 'invisible-tx-shield';
        if (!document.getElementById(shieldId)) {
            document.body.insertAdjacentHTML('beforeend', `<div id="${shieldId}" class="tx-shield-overlay master-overlay"></div>`);
        }

        if (this._watchdogTimer) clearTimeout(this._watchdogTimer);

        this._watchdogTimer = setTimeout(() => {
            if (UIState.isProcessingTx) {
                UIManager.showToast?.('الشبكة بطيئة بعض الشيء، جاري معالجة طلبك بأمان... الرجاء عدم إغلاق الصفحة.', 'warning');
            }
        }, 15000); 
        
        window.removeEventListener('offline', this._offlineHandler); 
        window.addEventListener('offline', this._offlineHandler);
    },

    _unlockUI: function(btn) {
        UIState.isProcessingTx = false;
        
        const shield = document.getElementById('invisible-tx-shield');
        if (shield) shield.remove();
        
        if (btn) this._toggleButtonLoader(btn, false);
        
        if (this._watchdogTimer) { clearTimeout(this._watchdogTimer); this._watchdogTimer = null; }
        window.removeEventListener('offline', this._offlineHandler);
    },

    _applyTabFilter: function(filterKey, filterValue, element, renderFuncName) {
        if (!element || element.classList.contains('active')) return;
        
        const tabs = element.parentElement.querySelectorAll('.mf-tab');
        tabs.forEach(tab => tab.classList.remove('active'));
        element.classList.add('active');
        
        if (!DataManager.filters) DataManager.filters = { orders: 'all', wallet: 'all', payments: 'all' };
        DataManager.filters[filterKey] = filterValue;
        if (RenderManager.limits) RenderManager.limits[filterKey] = 15;
        if (RenderManager[renderFuncName]) RenderManager[renderFuncName](true);
    },

    setOrderFilter: function(val, el) { this._applyTabFilter('orders', val, el, 'renderOrders'); },
    setWalletFilter: function(val, el) { this._applyTabFilter('wallet', val, el, 'renderWallet'); },
    setPaymentFilter: function(val, el) { this._applyTabFilter('payments', val, el, 'renderPayments'); },

    jumpToTransaction: function(id, type) {
        const isPurchase = (type === 'purchase' || type === 'order');
        const filterKey = isPurchase ? 'orders' : 'payments';
        const tabsSelector = isPurchase ? '#orders-tabs .mf-tab' : '#payments-tabs .mf-tab';
        const searchInputId = isPurchase ? 'order-search-input' : 'pay-search-input';
        const datePrefix = isPurchase ? 'order' : 'pay';
        const modalId = isPurchase ? 'orders' : 'mypay';

        // 1. تصفير التبويب إلى (الكل) وتصفير التاريخ لضمان عدم اختفاء العملية المقفوز إليها
        if (!DataManager.filters) DataManager.filters = { orders: 'all', wallet: 'all', payments: 'all' };
        DataManager.filters[filterKey] = 'all';
        const tabs = document.querySelectorAll(tabsSelector);
        if (tabs.length > 0) {
            tabs.forEach(t => t.classList.remove('active'));
            tabs[0].classList.add('active');
        }
        UIManager.setFilterDefaults?.(datePrefix);

        // 2. استخراج المعرف المختصر للعملية ووضعه في شريط البحث
        let displaySearchId = id;
        try {
            if (isPurchase) {
                const orderObj = (LiveStoreData.orders || []).find(o => String(o.id) === String(id)) || { id: id };
                displaySearchId = RenderHelpers.formatOrderId(orderObj);
            } else {
                const depObj = (LiveStoreData.deposits || []).find(d => String(d.id) === String(id)) || { id: id };
                displaySearchId = RenderHelpers.formatDepositId(depObj);
            }
        } catch (e) {
            displaySearchId = id; 
        }

        const searchInput = document.getElementById(searchInputId);
        if (searchInput) searchInput.value = displaySearchId;
        if (RenderManager) RenderManager.highlightId = id; 

        // 3. رسم القائمة مرة واحدة وفتح النافذة (التي ستستبدل المحفظة تلقائياً لأنها نافذة مستوى 1)
        if (isPurchase) {
            RenderManager.renderOrders?.(true);
        } else {
            RenderManager.renderPayments?.(true);
        }
        UIManager.openModal?.(modalId);
    },    

    _validateKycAndSystem: function(actionType = 'purchase') {
        const systemStatus = LiveStoreData.system || {};
        
        if (systemStatus.maint === true) {
            UIManager.showToast?.(systemStatus.msg || 'عذراً، المتجر في وضع الصيانة حالياً.', 'warning');
            return false;
        }
        if (systemStatus.freeze === true) { 
            UIManager.showToast?.(systemStatus.freezeMsg || 'عذراً، العمليات المالية متوقفة مؤقتاً.', 'warning'); 
            return false; 
        }
        if (!DataManager || !DataManager.user) {
            UIManager.showToast?.('يجب تسجيل الدخول أولاً', 'error');
            setTimeout(() => { if (DataManager.logout) DataManager.logout(); else window.location.href = 'login.html'; }, 1500); 
            return false;
        }
        
        const u = DataManager.user;
        const isIdentityComplete = (String(u.isVerified) === 'true' || u.isVerified === true) || 
            ((u.phone && String(u.phone).trim() !== '') && 
             (u.country && String(u.country).trim() !== '') && 
             (u.baseCurrency && String(u.baseCurrency).trim() !== ''));
        
        if (!isIdentityComplete) {
            UIManager.showToast?.('يرجى إكمال بيانات الحساب', 'error');
            setTimeout(() => { UIManager.openModal?.('identity'); }, 800); 
            return false;
        }
        
        const kycConfig = (LiveStoreData.settings || {}).kycConfig || { mode: 'off', targetedTiers: [] };
        let needsKyc = false;
        if (kycConfig.mode === 'all') needsKyc = true;
        else if ((kycConfig.mode === 'specific' || kycConfig.mode === 'spec') && (kycConfig.targetedTiers || []).map(String).includes(String(u.tierId || 'TIER_DEFAULT'))) needsKyc = true;
        
        if (needsKyc) {
            const status = String(u.kycStatus || 'none').toLowerCase();
            if (status !== 'approved' && status !== 'verified') {
                const actionName = actionType === 'deposit' ? 'الإيداع' : 'الشراء';
                if (status === 'pending') {
                    UIManager.showToast?.(`هويتك قيد المراجعة لتتمكن من ${actionName}`, 'warning');
                    UIManager.openKycStatusModal?.('pending');
                } else {
                    UIManager.showToast?.(`حسابك يتطلب التوثيق لتتمكن من ${actionName}`, 'error');
                    setTimeout(() => { UIManager.openModal?.('kyc-upload'); }, 800);
                }
                return false;
            }
        }

        const securityPolicy = (LiveStoreData.settings || {}).securityPolicy || {};
        const actionNameAr = actionType === 'deposit' ? 'الإيداع' : 'الشراء';

        if (securityPolicy.forceBiometrics) {
            const isBioEnabled = u.biometricEnabled === true;
            if (!isBioEnabled) {
                UIManager.showToast?.(`يجب تفعيل البصمة الحيوية لحماية أموالك قبل ${actionNameAr}.`, 'error');
                setTimeout(() => { UIManager.openSecurityModal?.(); }, 1200);
                return false;
            }
        }

        if (securityPolicy.force2FA) {
            const is2FAEnabled = typeof DataManager.is2FAEnabled === 'function' ? DataManager.is2FAEnabled() : false;
            if (!is2FAEnabled) {
                UIManager.showToast?.(`أمان المتجر يلزمك بتفعيل المصادقة الثنائية (2FA) قبل ${actionNameAr}.`, 'error');
                setTimeout(() => { UIManager.openSecurityModal?.(); }, 1200);
                return false;
            }
        }

        return true;
    },

    openProdModal: function(id) {
        if (!this._validateKycAndSystem('purchase')) return;
        Components.removeCoupon?.(true);

        const originalProd = (LiveStoreData.prods || []).find(p => String(p.id) === String(id));
        if (!originalProd) return;

        const isProdAvailable = originalProd.isAvailable !== false && String(originalProd.isAvailable) !== 'false' &&
            (originalProd.type !== 'select' || (Array.isArray(originalProd.options) && originalProd.options.some(o => o && o.isActive !== false && o.isAvailable !== false && String(o.isAvailable) !== 'false')));
        if (!isProdAvailable) {
            UIManager.showToast?.('عذراً، هذا المنتج غير متوفر حالياً.', 'warning');
            UIManager.sfx?.('error');
            return;
        }

        const isValidPriceNum = (n) => Number.isFinite(n) && n > 0 && n < 9999999;
        let hasValidPrice = (originalProd.type === 'select' && Array.isArray(originalProd.options))
            ? originalProd.options.some(opt => opt && opt.isActive !== false && isValidPriceNum(Number(opt.price || opt.fixedPriceUsd || 0)))
            : isValidPriceNum(Number(originalProd.price || originalProd.fixedPriceUsd || 0));
        if (!hasValidPrice) {
            UIManager.showToast?.('عذراً، هذا المنتج قيد التسعير.', 'error');
            UIManager.sfx?.('error');
            return;
        }

        try { DataManager.currentProd = structuredClone(originalProd); }
        catch (e) { DataManager.currentProd = { ...originalProd }; }

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
                const activeOffer = DataManager.getActiveOffer?.(DataManager.currentProd.id);
                const v = activeOffer?.visualConfig?.grid;
                if (v && v.badgeStyle && v.badgeStyle !== 'none') {
                    badgeContainer.innerHTML = `<div class="offer-badge-base ${v.badgeStyle} ${RenderManager._getMappedColor(v.badgeColor)} pm-badge-wrapper">${Utils.escapeHtml(v.badgeText)}</div>`;
                } else if (DataManager.currentProd.badgeText) {
                    badgeContainer.innerHTML = `<div class="offer-badge-base prod-badge badge-${DataManager.currentProd.badgeColor || 'red'} pm-badge-wrapper">${Utils.safeText(DataManager.currentProd.badgeText)}</div>`;
                } else { badgeContainer.innerHTML = ''; }
            }

            if (nameEl) nameEl.innerText = DataManager.currentProd.name;
            if (favBtn) {
                const isFav = DataManager.isFavorite ? DataManager.isFavorite(DataManager.currentProd.id) : false;
                favBtn.classList.toggle('active', isFav);
                favBtn.innerHTML = `<i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`;
            }
            
            if (descBox) {
                if (DataManager.currentProd.description) {
                    descBox.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${Utils.escapeHtml(DataManager.currentProd.description)}`;
                    descBox.style.display = 'block';
                } else {
                    descBox.style.display = 'none';
                }
            }

            if (dynOps) { dynOps.style.display = 'none'; dynOps.innerHTML = ''; dynOps.classList.remove('pm-ops-visible'); }
            if (staOps) staOps.style.display = 'none';
            if (simpleQtyBox) simpleQtyBox.style.display = 'none';

            const createInput = (inpId, lbl) => `<div class="floating-group"><input type="text" id="${inpId}" class="floating-input" placeholder=" " autocomplete="off"><label class="floating-label">${Utils.escapeHtml(lbl || '')}</label></div>`;
            let inputHtml = '';

            if (DataManager.currentProd.type === 'double') {
                inputHtml += createInput('pm-inp-1', DataManager.currentProd.input1Label) + createInput('pm-inp-2', DataManager.currentProd.input2Label);
            } else if (['single', 'counter'].includes(DataManager.currentProd.type)) {
                inputHtml += createInput('pm-inp-1', DataManager.currentProd.input1Label);
            } else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) {
                if(simpleQtyBox) simpleQtyBox.style.display = 'block';
                const sQty = document.getElementById('simple-qty-val'); 
                if(sQty) {
                    let minQ = Math.max(1, parseInt(DataManager.currentProd.minQty, 10) || 1);
                    let maxQ = Math.min(100, Math.max(minQ, parseInt(DataManager.currentProd.simpleMax || DataManager.currentProd.maxQty, 10) || 10));
                    sQty.value = minQ;
                    sQty.oninput = (e) => { 
                        e.target.value = e.target.value.replace(/[^0-9٠-٩]/g, ''); 
                        this.updatePriceDisplay(); 
                    };
                    sQty.onblur = (e) => {
                        let val = Utils.parseSafeNumber(e.target.value);
                        if (isNaN(val) || val < minQ) e.target.value = minQ;
                        else if (val > maxQ) e.target.value = maxQ;
                        this.updatePriceDisplay();
                        Components.revalidateAppliedCoupon?.();
                    };
                }
            } else if (DataManager.currentProd.type === 'select') {
                inputHtml += createInput('pm-inp-1', DataManager.currentProd.input1Label);
                if(staOps) staOps.style.display = 'block';
                
                const sel = document.getElementById('pm-pack'), menu = document.getElementById('pkg-custom-menu'), triggerText = document.getElementById('pkg-selected-text');
                if (sel && menu) {
                    let selHtml = '', menuHtml = '';
                    const options = DataManager.currentProd.options || [];
                    let firstValidIdx = -1;

                    options.forEach((pkg, idx) => {
                        if (!pkg || pkg.isActive === false) return;
                        const isAvail = String(pkg.isAvailable) !== 'false';
                        if (firstValidIdx === -1 && isAvail) firstValidIdx = idx;
                        const labelTxt = isAvail ? pkg.name : `${pkg.name} (نفد المخزون)`;
                        selHtml += `<option value="${idx}" ${!isAvail ? 'disabled' : ''}>${Utils.escapeHtml(labelTxt)}</option>`;
                        menuHtml += `<div class="dropdown-item ${!isAvail ? 'disabled opacity-50' : ''}" data-idx="${idx}" data-avail="${isAvail}" data-name="${Utils.escapeHtml(pkg.name)}"><span>${Utils.escapeHtml(labelTxt)}</span></div>`;
                    });

                    if (firstValidIdx === -1 && options.length > 0) {
                        firstValidIdx = options.findIndex(o => o && o.isActive !== false);
                    }

                    sel.innerHTML = selHtml;
                    menu.innerHTML = menuHtml;

                    if (firstValidIdx >= 0 && options[firstValidIdx]) {
                        sel.value = firstValidIdx;
                        if (triggerText) triggerText.textContent = options[firstValidIdx].name;
                        const activeItem = menu.querySelector(`.dropdown-item[data-idx="${firstValidIdx}"]`);
                        if (activeItem) activeItem.classList.add('active');
                    } else {
                        if (triggerText) triggerText.textContent = "لا توجد باقات متاحة";
                    }

                    menu.onclick = (e) => {
                        const item = e.target.closest('.dropdown-item');
                        if (!item || item.dataset.avail === 'false' || item.classList.contains('disabled')) return;
                        const chosenIdx = item.getAttribute('data-idx');
                        const chosenName = item.getAttribute('data-name');
                        sel.value = chosenIdx;
                        if (triggerText) triggerText.textContent = chosenName;
                        menu.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('active'));
                        item.classList.add('active');
                        item.closest('.custom-dropdown-container')?.classList.remove('open');
                        this.updatePriceDisplay();
                        Components.revalidateAppliedCoupon?.();
                    };
                }
            }
            
            if(inputContainer) inputContainer.innerHTML = inputHtml;

            if (DataManager.currentProd.type === 'counter' && dynOps) {
                dynOps.classList.add('pm-ops-visible'); dynOps.style.display = 'block'; 
                dynOps.innerHTML = `<div class="pm-new-grid"><div class="pm-float-box"><input type="tel" id="pm-qty" inputmode="numeric" dir="ltr" placeholder=" "> <label>العدد</label></div><div class="pm-float-box readonly"><input type="text" id="pm-price-unit" readonly placeholder=" "><label>سعر القطعة</label></div></div>`; 

                const qInp = document.getElementById('pm-qty');
                if (qInp) {
                    let minQ = Math.max(1, parseInt(DataManager.currentProd.minQty, 10) || 1);
                    let maxQ = Math.min(5000000, Math.max(minQ, parseInt(DataManager.currentProd.maxQty, 10) || 5000000));
                    qInp.value = minQ; 
                    qInp.oninput = (e) => { e.target.value = e.target.value.replace(/[^0-9٠-٩]/g, ''); this.updatePriceDisplay(); };
                    qInp.onblur = (e) => { 
                        let val = Utils.parseSafeNumber(e.target.value); 
                        if (isNaN(val) || val < minQ) { e.target.value = minQ; this.updatePriceDisplay(); }
                        else if (val > maxQ) { e.target.value = maxQ; this.updatePriceDisplay(); }
                        Components.revalidateAppliedCoupon?.(); 
                    };
                }
            }

            this.updatePriceDisplay();
            UIManager.openModal?.('purchase');
        });
    },

    closePurchaseModal: function(skipHistoryPop = false) { 
        if (UIState.isProcessingTx) return; 
        Components.removeCoupon?.(true);
        UIManager.closeModal?.('purchase', skipHistoryPop);

        if (DataManager.currentProd) {
            const targetProdId = DataManager.currentProd.id;
            setTimeout(() => {
                const cardInfo = document.querySelector(`.product-card[data-id="${targetProdId}"] .card-info`);
                if (cardInfo && cardInfo.isConnected) { 
                    requestAnimationFrame(() => { 
                        cardInfo.classList.add('shine-strong'); 
                        setTimeout(() => {
                            if (cardInfo && cardInfo.isConnected) cardInfo.classList.remove('shine-strong');
                        }, 2000); 
                    }); 
                }
            }, 300);
        }
        DataManager.currentProd = null;
    },

    closePurchaseSuccess: function() { UIManager.closeModal?.('purchase-success'); },
    closeGeneralSuccess: function() { UIManager.closeModal?.('success'); },
    
    updateSimpleQty: function(change) {
        let el = document.getElementById('simple-qty-val'); if (!el || !DataManager.currentProd) return;
        let val = Utils.parseSafeNumber(el.value);
        let min = Math.max(1, parseInt(DataManager.currentProd.minQty, 10) || 1);
        let max = Math.min(100, Math.max(min, parseInt(DataManager.currentProd.simpleMax || DataManager.currentProd.maxQty, 10) || 10));
        let newVal = val + change;
        
        if (newVal > max) { 
            UIManager.sfx?.('error'); 
            UIManager.showToast?.(`تجاوزت الحد المسموح (${max})`, 'warning'); 
            return; 
        }
        
        if (newVal < min) return; 
        el.value = newVal; 
        this.updatePriceDisplay(); 
        Components.revalidateAppliedCoupon?.();
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
        if (UIState.isProcessingTx) {
            console.warn("🛡️ [Double-Spend Shield] تم حظر محاولة دفع متزامنة.");
            return;
        }
        
        if (!DataManager.currentProd || !this._validateKycAndSystem('purchase')) return;
        
        const inp1El = document.getElementById('pm-inp-1'), inp2El = document.getElementById('pm-inp-2'), qtyEl = document.getElementById('simple-qty-val');
        
        const keepKeyboardOpen = () => { 
            if (inp1El && !inp1El.disabled) inp1El.focus(); 
            else if (qtyEl && !qtyEl.disabled) qtyEl.focus(); 
        };
        
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

        let structuredPlayerInputs = null;

        if (DataManager.currentProd.type === 'double') { 
            const lbl1 = getSafeLabel(DataManager.currentProd.input1Label, 'معرف الحساب');
            const lbl2 = getSafeLabel(DataManager.currentProd.input2Label, 'تفاصيل إضافية');
            
            finalInputStr = `${lbl1}: ${inp1} | ${lbl2}: ${inp2}`; 
            if (inp1) {
                structuredPlayerInputs = {
                    playerId: inp1,
                    server: inp2 || ''
                };
            }
            
            if(!inp1) { showInlineError(inp1El, 'يرجى ملء الحقل الأول'); isValid = false; inp1El.focus(); }
            if(!inp2) { if(inp2El) { showInlineError(inp2El, 'يرجى ملء الحقل الثاني'); if(isValid) inp2El.focus(); isValid = false; } }
            
        } else if (DataManager.currentProd.type === 'single' || DataManager.currentProd.type === 'counter' || DataManager.currentProd.type === 'select') { 
            const lbl1 = getSafeLabel(DataManager.currentProd.input1Label, 'معرف الحساب');
            finalInputStr = `${lbl1}: ${inp1}`; 
            if (inp1) {
                structuredPlayerInputs = {
                    playerId: inp1
                };
            }
            
            if(inp1El && !inp1) { showInlineError(inp1El, 'يرجى ملء الحقل المطلوب'); isValid = false; inp1El.focus(); } 
            
        } else if (DataManager.currentProd.type === 'simple') { 
            finalInputStr = ""; 
        } else {
            finalInputStr = inp1;
            if (inp1) structuredPlayerInputs = { playerId: inp1 };
            if(inp1El && !inp1) { showInlineError(inp1El, 'يرجى ملء الحقل المطلوب'); isValid = false; inp1El.focus(); }
        }

        if (DataManager.currentProd.type === 'counter') { 
            const minQ = Math.max(1, parseInt(DataManager.currentProd.minQty, 10) || 1);
            const maxQ = Math.min(5000000, Math.max(minQ, parseInt(DataManager.currentProd.maxQty, 10) || 5000000));
            const pmQtyEl = document.getElementById('pm-qty');
            qty = Utils.parseSafeNumber(pmQtyEl?.value);
            if (isNaN(qty) || qty < minQ) {
                if (pmQtyEl) showInlineError(pmQtyEl.parentNode, `الحد الأدنى للطلب هو ${minQ}`);
                isValid = false;
            } else if (qty > maxQ) {
                if (pmQtyEl) showInlineError(pmQtyEl.parentNode, `الحد الأقصى للطلب هو ${maxQ}`);
                isValid = false;
            }
        } else if (DataManager.currentProd.type === 'select') { 
            optIdx = Number(document.getElementById('pm-pack')?.value || 0); 
        } else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) { 
            const minQ = Math.max(1, parseInt(DataManager.currentProd.minQty, 10) || 1);
            const maxQ = Math.min(100, Math.max(minQ, parseInt(DataManager.currentProd.simpleMax || DataManager.currentProd.maxQty, 10) || 10));
            qty = Utils.parseSafeNumber(qtyEl?.value); 
            if(isNaN(qty) || qty < minQ) qty = minQ;
            if(qty > maxQ) { showInlineError(qtyEl.parentNode, `أقصى كمية ${maxQ}`); isValid = false; qtyEl.focus(); }
        }

        if(!isValid) { UIManager.sfx?.('error'); return; }

        const pricingCheck = DataManager.getPricingLocal(DataManager.currentProd, qty, optIdx, DataManager.appliedCoupon);
        if (!pricingCheck || !pricingCheck.pricingSnapshot || pricingCheck.pricingSnapshot.originalPrice <= 0 || pricingCheck.pricingSnapshot.finalPrice <= 0 || pricingCheck.pricingSnapshot.isFirewallViolated) {
            UIManager.showToast?.(pricingCheck?.pricingSnapshot?.rejectionReason || 'عذراً، لا يمكن إتمام الشراء بهذا التسعير حالياً.', 'error');
            UIManager.sfx?.('error');
            return;
        }

        const submitBtn = document.getElementById('btn-confirm-buy') || document.querySelector('.pm-btn-gold');
        
        this._lockUI(submitBtn);

        try {
            const result = await DataManager.confirmPurchase(DataManager.currentProd, qty, optIdx, finalInputStr, DataManager.appliedCoupon, structuredPlayerInputs);

            if (result.success) {
                UIManager.sfx?.('success'); 
                
                if (result.isAutoDelivered && typeof UIManager.updateNotifBadges === 'function') {
                    const currentBadge = document.getElementById('header-notif-badge');
                    const currentCount = currentBadge ? (parseInt(currentBadge.innerText, 10) || 0) : 0;
                    UIManager.updateNotifBadges(currentCount + 1);
                }

                this._unlockUI(submitBtn);
                this.closePurchaseModal(true);
                if (typeof DataManager.syncUser === 'function') DataManager.syncUser(); 
                UIManager.updateDisplayBalance?.();

                setTimeout(() => {
                    UIManager.openModal?.('purchase-success');
                    const titleEl = document.getElementById('purchase-success-title'), descEl = document.getElementById('purchase-success-desc'), codeDisplayContainer = document.getElementById('purchase-code-display');

                    if (result.isAutoDelivered && result.deliveredCode) {
                        if (titleEl) titleEl.innerText = 'تم تنفيذ الطلب بنجاح!';
                        if (descEl) descEl.innerHTML = 'تم إصدار الكود بنجاح، ومحفوظ في <span class="smart-link" data-action="navigate-orders-success">سجل طلباتك</span>.';
                        if (codeDisplayContainer) {
                            codeDisplayContainer.innerHTML = `<div class="dc-title"><i class="fa-solid fa-key"></i> الأكواد المستلمة:</div><div class="auto-delivery-scroll">${UIBuilders.buildCodesList(result.deliveredCode)}</div>`;
                            codeDisplayContainer.classList.remove('d-none');
                        }
                    } else {
                        if (titleEl) titleEl.innerText = 'تم استلام طلبك!';
                        if (descEl) descEl.innerHTML = 'طلبك قيد التنفيذ، تابعه عبر <span class="smart-link" data-action="navigate-orders-success">سجل الطلبات</span>.';
                        if (codeDisplayContainer) { codeDisplayContainer.innerHTML = ''; codeDisplayContainer.classList.add('d-none'); }
                    }
                }, 100);
            } else { 
                UIManager.showToast?.(result.msg || 'فشلت العملية', 'error');
                UIManager.sfx?.('error'); 
                
                if (result.msg && (result.msg.includes('تحديث') || result.msg.includes('الصرف'))) {
                    this.updatePriceDisplay();
                    const priceBox = document.getElementById('pm-price');
                    if (priceBox) {
                        priceBox.classList.remove('shake-error-input');
                        void priceBox.offsetWidth;
                        priceBox.classList.add('shake-error-input');
                        priceBox.style.color = 'var(--danger)';
                        setTimeout(() => { priceBox.style.color = ''; priceBox.classList.remove('shake-error-input'); }, 1500);
                    }
                }
                
                keepKeyboardOpen(); 
            }
        } catch (err) { 
            console.error("🚨 Transaction processing error:", err);
            UIManager.showToast?.(err.message || 'حدث خطأ في النظام', 'error');
            UIManager.sfx?.('error'); 
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
        
        this._manageDepositModalState(false);
        
        const blockedView = document.getElementById('bal-blocked-view'),
            normalView = document.getElementById('bal-normal-view');
        if (blockedView) blockedView.style.display = 'none';
        if (normalView) normalView.style.display = '';
        
        if (RenderManager.renderPayMethods) {
            RenderManager.renderPayMethods();
            const container = document.getElementById('bal-pay-grid');
            if (container) void container.offsetHeight;
        }
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                UIManager.openModal?.('balance');
            });
        });
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

const userWalletCurr = (DataManager.user?.baseCurrency || 'USD').toUpperCase();
this.currentPayCurrency = uniqueCurrencies.includes(userWalletCurr) ? userWalletCurr : uniqueCurrencies[0];       window.requestAnimationFrame(() => {
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
    
    clearDepositFile: function() {
        const input = document.getElementById('bal-file');
        const preview = document.getElementById('bal-img-preview');
        const uploadBox = document.getElementById('bal-upload-box');
        const clearBtn = document.getElementById('bal-file-clear');

        if (input) input.value = '';
        UIState.pendingReceiptFile = null;
        UIState.currentImageJobId = null;
        if (preview) {
            if (preview.src && preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
            preview.src = ''; preview.style.display = 'none';
        }
        if (uploadBox) {
            uploadBox.classList.remove('has-file', 'is-processing-img');
            uploadBox.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>';
        }
        if (clearBtn) clearBtn.classList.add('hide-element');
        UIManager.showToast?.('تم إزالة المرفق لتتمكن من إعادة الرفع', 'info');
    },

    backToPayMethods: function() {
        const modal = document.getElementById('balance-modal');
        if (!modal) return;

        this._manageDepositModalState(false);
        modal.scrollTop = 0;
        modal.querySelectorAll('.pm-scroll-content, .scrollable, .modal-content').forEach(s => s.scrollTop = 0);

        UIState.pendingReceiptFile = null; 
        UIState.currentImageJobId = null;

        const preview = document.getElementById('bal-img-preview');
        if (preview && preview.src && preview.src.startsWith('blob:')) { URL.revokeObjectURL(preview.src); preview.src = ''; }

        const fileInputs = document.querySelectorAll('input[type="file"]');
        fileInputs.forEach(inp => {
            if (inp.id === 'bal-file' || inp.getAttribute('data-action') === 'preview-receipt' || inp.closest('#bal-upload-box')) {
                inp.value = '';
            }
        });
        
        const uploadBox = document.getElementById('bal-upload-box');
        if (uploadBox) {
            uploadBox.classList.remove('has-file', 'is-processing-img'); 
            uploadBox.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>';
        }
        
        const clearBtn = document.getElementById('bal-file-clear');
        if (clearBtn) clearBtn.classList.add('hide-element');

        setTimeout(() => {
            const section = document.getElementById('bal-method-info-section');
            if (section && !modal.classList.contains('is-step-2')) section.innerHTML = ''; 
        }, 400);
    },

    closeBalanceModal: function(skipHistoryPop = false) {
        if (UIState.isProcessingTx) return; 
        const modal = document.getElementById('balance-modal');
        UIManager.closeModal?.('balance', skipHistoryPop);
        if (modal) {
            modal.addEventListener('transitionend', () => { this.backToPayMethods(); }, { once: true });
        }
    },    
    
    previewReceipt: async function(inp) { 
        const file = inp.files && inp.files[0];
        
        const currentJobId = Date.now();
        UIState.currentImageJobId = currentJobId;
        
        const preview = document.getElementById('bal-img-preview');
        if (preview && preview.src && preview.src.startsWith('blob:')) { URL.revokeObjectURL(preview.src); preview.src = ''; }
        
        if(!file) { 
            UIState.pendingReceiptFile = null; 
            if(preview) { preview.style.display = 'none'; preview.src = ''; }
            const clearBtn = document.getElementById('bal-file-clear');
            if(clearBtn) clearBtn.classList.add('hide-element');
            return; 
        }

        if (file.size > 10 * 1024 * 1024) { 
            UIManager.showToast?.('حجم الملف كبير جداً. الحد 10MB.', 'error'); 
            inp.value = ''; 
            UIState.pendingReceiptFile = null;
            if(preview) { preview.style.display = 'none'; preview.src = ''; }
            const clearBtn = document.getElementById('bal-file-clear');
            if(clearBtn) clearBtn.classList.add('hide-element');
            return; 
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) { 
            UIManager.showToast?.('نوع الملف غير مدعوم.', 'error'); 
            inp.value = ''; 
            UIState.pendingReceiptFile = null; 
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
            UIState.pendingReceiptFile = file; 
            if(preview) preview.style.display = 'none';
            setUploadSuccessUI('pdf'); 
        } else {
            if(uploadBox) {
                uploadBox.classList.add('is-processing-img'); 
                uploadBox.innerHTML = `<div class="bal-upload-success-row"><i class="fa-solid fa-spinner fa-spin bal-upload-success-icon"></i><span class="bal-upload-success-text">جاري المعالجة...</span></div>`;
            }

            try {
                const compressed = await UIManager.Auth._compressImage(file, 1200);
                
                if (UIState.currentImageJobId !== currentJobId) {
                    URL.revokeObjectURL(compressed.previewUrl);
                    return; 
                }
                
                UIState.pendingReceiptFile = compressed.file;
                
                if(preview) { 
                    preview.src = compressed.previewUrl; 
                    preview.style.display = 'block'; 
                    preview.className = 'bal-receipt-preview-new'; 
                }
                if (uploadBox) uploadBox.classList.remove('is-processing-img');
                setUploadSuccessUI('image');
                
            } catch (err) {
                console.error("🚨 Image Processing Error:", err);
                UIManager.showToast?.('تعذر معالجة الصورة، الملف تالف أو غير مدعوم.', 'error');
                if (uploadBox) {
                    uploadBox.classList.remove('is-processing-img');
                    uploadBox.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>'; 
                }
                inp.value = '';
                const clearBtn = document.getElementById('bal-file-clear');
                if(clearBtn) clearBtn.classList.add('hide-element');
            }
        }
    },
    
    calcFee: function() {
        const input = document.getElementById('bal-amount');
        if (!input || !DataManager || !this.currentPayment) return;
        
        const amount = this._parseSafeAmount(input.value);
        const payCurr = (this.currentPayCurrency || '').toUpperCase();
        if (typeof DataManager.calculateDepositFee !== 'function') return;
        
        let result;
        try {
            result = DataManager.calculateDepositFee(amount, this.currentPayment, payCurr);
            if (!result) throw new Error("استجابة فارغة من المحرك المالي");
        } catch (error) {
            console.warn("🛡️ Financial Engine Recovery:", error);
            const cleanMsg = error.message ? error.message.replace(/\[.*?\]/g, '').trim() : 'تعذر حساب الرسوم بسبب تحديثات في أسعار الصرف.';
            result = { isValid: false, msg: cleanMsg, netBase: 0 };
        }
        
        window.requestAnimationFrame(() => {
            const errorBox = document.getElementById('bal-amount-error');
            const submitBtn = document.getElementById('btn-submit-deposit');
            const netDisplay = document.getElementById('calc-net');
            const netWrap = document.getElementById('bal-net-wrap');

            if (!result.isValid) {
                input.classList.toggle('input-invalid', amount > 0);
                if (errorBox) { 
                    errorBox.innerHTML = (amount > 0 && result.msg) ? `<i class="fa-solid fa-circle-exclamation"></i> ${Utils.escapeHtml(result.msg)}` : ''; 
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
                    const safeNet = Number(result.netBase) || 0;
                    netDisplay.innerText = safeNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    netDisplay.style.opacity = '1'; 
                }
                if (netWrap) netWrap.classList.add('has-value'); 
            }
        });
    },

    handleBalanceSubmit: async function(currency, submitBtn) {
        if (UIState.isProcessingTx) {
            console.warn("🛡️ [Double-Spend Shield] تم حظر محاولة إرسال إيداع متزامنة.");
            return;
        }
        
        if (!this._validateKycAndSystem('deposit')) return;
        
        const input = document.getElementById('bal-amount');
        const amount = this._parseSafeAmount(input ? input.value : '');
        if (isNaN(amount) || amount <= 0) { UIManager.showToast?.('أدخل مبلغ إيداع صحيح', 'error'); return; }
        
        const payCurr = currency || this.currentPayCurrency || 'USD';
        
        if (this.currentPayment && this.currentPayment.reqProof !== false) {
            const uploadBox = document.getElementById('bal-upload-box');
            
            if (uploadBox && uploadBox.classList.contains('is-processing-img')) {
                UIManager.showToast?.('جاري تجهيز الصورة، يرجى الانتظار لحظة...', 'warning');
                return;
            }
            
            if (!UIState.pendingReceiptFile) {
                UIManager.showToast?.('أرفق إشعار الدفع أولاً', 'error');
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
            UIManager.showToast?.(validation.msg, 'error');
            if (input) {
                input.classList.remove('shake-error-input');
                void input.offsetWidth;
                input.classList.add('shake-error-input');
                setTimeout(() => input.classList.remove('shake-error-input'), 1500);
            }
            return;
        }
        
        this._lockUI(submitBtn);
        
        let uploadedReceiptUrl = null;
        try {
            if (UIState.pendingReceiptFile) {
                if (!StoreDB || typeof StoreDB.uploadImage !== 'function') throw new Error("نظام الرفع غير متوفر.");
                const userId = DataManager.user?.uid || DataManager.user?.id || 'unknown';
                const isPdfFile = UIState.pendingReceiptFile.type === 'application/pdf';
                const ext = isPdfFile ? 'pdf' : 'webp';
                
                const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 9);
                const safeFileName = `${userId}_${Date.now()}_${uniqueId}.${ext}`;
                
                uploadedReceiptUrl = await StoreDB.uploadImage(UIState.pendingReceiptFile, 'receipts', safeFileName);
            }
            const result = await DataManager.submitBalanceRequest(amount, this.currentPayment, payCurr, uploadedReceiptUrl);
            
            if (result.success) {
                UIManager.sfx?.('success');
                this._unlockUI(submitBtn);
                this.closeBalanceModal(true);
                if (typeof DataManager.syncUser === 'function') DataManager.syncUser();
                setTimeout(() => UIManager.openModal?.('success'), 100);
        } else {
    UIManager.showToast?.(result.msg || 'تعذر إرسال الطلب', 'error');
    UIManager.sfx?.('error');
}
} catch (error) {            console.error("🚨 Client-Side Deposit Exception:", error);
            let errMsg = 'حدث خطأ أثناء الاتصال بالخادم.';
            const rawMsg = String(error.message || '');
            if (/[\u0600-\u06FF]/.test(rawMsg)) errMsg = rawMsg;
            
            UIManager.showToast?.(errMsg, 'error');
            UIManager.sfx?.('error');
            
        } finally {
            this._unlockUI(submitBtn);
        }
    },    

    togglePayDetail: function(headerElement) {
        if (!headerElement) return;
        const card = headerElement.closest('.pay-history-card');
        if (!card) return;
        window.requestAnimationFrame(() => {
            const det = card.querySelector('.ph-details-body'), arrow = headerElement.querySelector('.fa-chevron-down, .fa-angle-down, .fa-chevron-left, .ph-arrow-btn, .ph-arrow');
            if (det) { const isOpen = det.classList.toggle('is-open'); if(arrow) arrow.classList.toggle('is-open', isOpen); }
        });
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
    },
    
    closeWalletStats: function() {
        window.requestAnimationFrame(() => {
            document.getElementById('walletStatsDrawer')?.classList.remove('active');
            const wModal = document.getElementById('wallet-modal');
            if (wModal) {
                wModal.classList.remove('drawer-blur-active');
                wModal.querySelector('.detail-arrow')?.classList.remove('open');
            }
        });
    },
    
    openDetail: function(e, type, id) {
        const content = document.getElementById('tx-detail-content');
        if (!content) return;
        UIState.activeDetailTx = { type, id };
        const html = UIBuilders.buildTransactionDetail(type, id, LiveStoreData, DataManager);
        if (html) {
            window.requestAnimationFrame(() => {
                content.innerHTML = html;
                UIManager.openModal?.('tx-detail');
            });
        }
    },

    refreshOpenDetail: function() {
        if (!UIState.activeModals.includes('tx-detail') || !UIState.activeDetailTx) return;
        const { type, id } = UIState.activeDetailTx;
        const content = document.getElementById('tx-detail-content');
        if (!content) return;
        const html = UIBuilders.buildTransactionDetail(type, id, LiveStoreData, DataManager);
        if (html) {
            window.requestAnimationFrame(() => {
                content.innerHTML = html;
            });
        }
    },

    closePayReceipt: function() {
        UIManager.closeModal?.('pay-receipt');
    }
};