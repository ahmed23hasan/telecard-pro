// ============================================================================
// 🧩 ملف المكونات الإضافية والواجهات المستقلة (components.js) - V18.9.0 💎
// 🎯 الوظيفة: إدارة التقويم، الكوبونات، اللمعان، ومزامنة الواجهة السفلية
// 🚀 التحديثات المعمارية الصارمة (V18.9.0 - Firewall Integration Patch):
// 1. Silent Success Fix 🛡️: دمج مستشعرات הגدار الناري المالي مع الكوبونات لمنع نجاح وهمي إذا رُفض السعر.
// 2. Mobile Keyboard Glitch Fix 🛡️: إزالة (focus) بعد اللصق الآلي للكوبون لمنع انبثاق كيبورد الهاتف بشكل مزعج.
// 3. Dynamic Revalidation 🛡️: إلغاء الكوبون المطبق تلقائياً إذا قام العميل بتغيير الكمية لسعر يكسر حماية المتجر.
// 4. Clean Memory Release 🛡️: تفريغ مؤقتات رسائل الكوبونات عند تدمير العنصر.
// ============================================================================

import { DataManager, LiveStoreData } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import * as Utils from './utils.js'; 
import { RenderHelpers } from './core/renderHelpers.js'; 

// =========================================================
// 1️⃣ نظام التقويم الذكي (Calendar App)
// =========================================================
export const CalendarApp = {
    monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    dayNames: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    currYear: new Date().getFullYear(),
    currMonth: new Date().getMonth(),
    activeInputId: null,
    tempSelectedDate: null, 
    _isInitialized: false,
    _boundDocClick: false, 

    init: function() {
        const modal = document.getElementById('cal-modal');
        if (modal && modal.parentNode !== document.body) document.body.appendChild(modal);

        const today = new Date();
        const formatted = this.formatDate(today);
        
        ['order-date-start', 'order-date-end', 'wallet-date-start', 'wallet-date-end', 'pay-date-start', 'pay-date-end'].forEach(id => {
            const hiddenInput = document.getElementById(id);
            const dispSpan = document.getElementById('disp-' + id);
            if(hiddenInput && dispSpan) { hiddenInput.value = formatted; dispSpan.innerText = formatted; }
        });
        
        this.buildDropdowns();
        
        if (this._isInitialized) return;
        this._isInitialized = true;

        const grid = document.getElementById('days-container');
        if (grid) {
            grid.addEventListener('click', (e) => {
                const cell = e.target.closest('.day-cell:not(.empty):not(.disabled-day)');
                if (cell) {
                    e.stopPropagation();
                    this.tempSelectedDate = new Date(this.currYear, this.currMonth, parseInt(cell.innerText, 10));
                    this.render();
                }
            });
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.closest('#calBtnConfirm')) {
                    e.stopPropagation(); this.confirmSelection();
                } else if (e.target.closest('#calBtnCancel')) {
                    e.stopPropagation(); this.close();
                }
            });
        }

        if (!this._boundDocClick) {
            document.addEventListener('click', (e) => {
                const dateField = e.target.closest('.custom-field');
                if (dateField) {
                    const hiddenInput = dateField.querySelector('input[type="hidden"]');
                    if (hiddenInput) { e.preventDefault(); e.stopPropagation(); this.open(hiddenInput.id, dateField); return; }
                }
                const activeModal = document.getElementById('cal-modal');
                if (!activeModal || !activeModal.classList.contains('show')) return;
                
                if (!activeModal.contains(e.target) && !e.target.closest('.btn-action')) {
                    this.close();
                }
            });
            this._boundDocClick = true;
        }
    },

    open: function(inputId, eventOrElement) {
        this.activeInputId = inputId;
        let targetElement = null;
        
        if (eventOrElement) {
            if (typeof eventOrElement.stopPropagation === 'function') eventOrElement.stopPropagation();
            if (eventOrElement.currentTarget instanceof Element) targetElement = eventOrElement.currentTarget;
            else if (eventOrElement.target instanceof Element) targetElement = eventOrElement.target.closest('.custom-field') || eventOrElement.target;
            else if (eventOrElement instanceof Element || eventOrElement.nodeType === 1) targetElement = eventOrElement;
        }
        
        if (!targetElement && inputId) {
            const inputEl = document.getElementById(inputId);
            if (inputEl) targetElement = inputEl.closest('.custom-field');
        }
        
        requestAnimationFrame(() => {
            document.querySelectorAll('.custom-field').forEach(f => f.classList.remove('active'));
            if (targetElement) targetElement.classList.add('active');
        });
        
        const hiddenInput = document.getElementById(inputId);
        const currentVal = hiddenInput ? hiddenInput.value : '';
        
        if (currentVal && currentVal.includes('-')) {
            const parts = currentVal.split('-');
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                this.currYear = y;
                this.currMonth = m;
                this.tempSelectedDate = new Date(y, m, d);
            } else {
                this._setFallbackDate();
            }
        } else {
            this._setFallbackDate();
        }
        
        this.render();
        const modal = document.getElementById('cal-modal');
        
        if (modal) {
            if (modal.parentNode !== document.body) document.body.appendChild(modal);
            requestAnimationFrame(() => modal.classList.add('show'));
        }
    },

    _setFallbackDate: function() {
        const now = new Date();
        this.currYear = now.getFullYear();
        this.currMonth = now.getMonth();
        this.tempSelectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    },

    close: function() {
        requestAnimationFrame(() => {
            const modal = document.getElementById('cal-modal');
            if(modal) modal.classList.remove('show');
            document.querySelectorAll('.custom-field').forEach(f => f.classList.remove('active'));
        });
    },

    render: function() {
        requestAnimationFrame(() => {
            const dispMonth = document.getElementById('disp-month');
            const dispYear = document.getElementById('disp-year');
            if (dispMonth) dispMonth.innerText = this.monthNames[this.currMonth];
            if (dispYear) dispYear.innerText = this.currYear;
            
            const grid = document.getElementById('days-container');
            if(!grid) return;
            
            grid.innerHTML = '';
            const fragment = document.createDocumentFragment();
            
            this.dayNames.forEach(d => { 
                const div = document.createElement('div'); 
                div.className = 'day-head'; div.innerText = d; 
                fragment.appendChild(div); 
            });
            
            const firstDay = new Date(this.currYear, this.currMonth, 1).getDay();
            const daysInMonth = new Date(this.currYear, this.currMonth + 1, 0).getDate();
            
            for(let i = 0; i < firstDay; i++) { 
                const e = document.createElement('div'); 
                e.className = 'day-cell empty'; 
                fragment.appendChild(e); 
            }
            
            const today = new Date(); today.setHours(0, 0, 0, 0);
            
            for(let d = 1; d <= daysInMonth; d++) {
                const cell = document.createElement('div'); 
                cell.className = 'day-cell'; 
                cell.innerText = d;
                
                if (this.tempSelectedDate && this.tempSelectedDate.getDate() === d && this.tempSelectedDate.getMonth() === this.currMonth && this.tempSelectedDate.getFullYear() === this.currYear) {
                    cell.classList.add('selected');
                }
                const cellDate = new Date(this.currYear, this.currMonth, d);
                if (cellDate > today) cell.classList.add('disabled-day'); 
                
                fragment.appendChild(cell);
            }
            
            grid.appendChild(fragment);
            this.updateHighlights();
        });
    },

    confirmSelection: function() {
        if (this.tempSelectedDate && this.activeInputId) {
            const formatted = this.formatDate(this.tempSelectedDate);
            const hiddenInput = document.getElementById(this.activeInputId);
            if(hiddenInput) { 
                hiddenInput.value = formatted; 
                const disp = document.getElementById('disp-' + this.activeInputId); 
                if(disp) disp.innerText = formatted; 
                if(typeof hiddenInput.onchange === 'function') hiddenInput.onchange(); 
            }
        }
        this.close();
    },

    formatDate: function(d) { 
        return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`; 
    },
    
    adjustMonth: function(s) { 
        this.currMonth += s; 
        if(this.currMonth > 11) { this.currMonth = 0; this.currYear++; } 
        if(this.currMonth < 0) { this.currMonth = 11; this.currYear--; } 
        this.render(); 
    },
    
    adjustYear: function(s) { this.currYear += s; this.render(); },
    
    toggleList: function(id, e) {
        if(e) e.stopPropagation();
        requestAnimationFrame(() => {
            document.querySelectorAll('.dropdown-list').forEach(l => { if(l.id !== id) l.classList.remove('active'); });
            const l = document.getElementById(id); 
            if(l) { 
                l.classList.toggle('active'); 
                if(l.classList.contains('active')) { 
                    const s = l.querySelector('.selected'); 
                    if(s) s.scrollIntoView({block:'center'}); 
                }
            }
        });
    },
    
    buildDropdowns: function() {
        const mL = document.getElementById('list-month'); 
        if(mL) { 
            mL.innerHTML = this.monthNames.map((m, i) => `<div class="list-item" data-idx="${i}">${m}</div>`).join('');
            if (!mL._boundDelegation) {
                mL.addEventListener('click', (e) => {
                    const item = e.target.closest('.list-item');
                    if (item) {
                        e.stopPropagation(); 
                        this.currMonth = parseInt(item.dataset.idx, 10); 
                        this.render(); 
                        requestAnimationFrame(() => mL.classList.remove('active'));
                    }
                });
                mL._boundDelegation = true;
            }
        }
        
        const yL = document.getElementById('list-year'); 
        if(yL) { 
            const ty = new Date().getFullYear(); 
            let yearsHtml = '';
            for(let y = ty - 10; y <= ty + 10; y++){ 
                yearsHtml += `<div class="list-item" data-year="${y}">${y}</div>`; 
            }
            yL.innerHTML = yearsHtml;
            if (!yL._boundDelegation) {
                yL.addEventListener('click', (e) => {
                    const item = e.target.closest('.list-item');
                    if (item) {
                        e.stopPropagation(); 
                        this.currYear = parseInt(item.dataset.year, 10); 
                        this.render(); 
                        requestAnimationFrame(() => yL.classList.remove('active'));
                    }
                });
                yL._boundDelegation = true;
            }
        }
    },
    
    updateHighlights: function() {
        document.querySelectorAll('#list-month .list-item').forEach((el, i) => el.classList.toggle('selected', i === this.currMonth));
        document.querySelectorAll('#list-year .list-item').forEach((el) => el.classList.toggle('selected', parseInt(el.innerText, 10) === this.currYear));
    }
};

// =========================================================
// 2️⃣ تجميع المكونات (مصدّرة كـ Module)
// =========================================================
export const Components = {
    priceTicker: null,
    _shineBound: false, 
    _couponMsgTimer: null, 

    _getCurrentSelection: function() {
        let qty = 1; let optIdx = null;
        if (!DataManager.currentProd) return { qty, optIdx };

        try {
            if (DataManager.currentProd.type === 'counter') {
                qty = parseInt(document.getElementById('pm-qty')?.value, 10) || 1;
            } else if (DataManager.currentProd.type === 'select') {
                const sel = document.getElementById('pm-pack');
                optIdx = sel ? parseInt(sel.value, 10) : 0;
            } else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) {
                qty = parseInt(document.getElementById('simple-qty-val')?.value, 10) || 1;
            }
        } catch(e) { console.warn('DOM Parse Warning', e); }

        return { qty: Math.max(1, qty), optIdx };
    },

    initProductShine: function() {
        if (this._shineBound) return;
        
        document.addEventListener('mouseover', (e) => {
            if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

            const card = e.target.closest('#store-grid .product-card');
            if (!card) return;
            
            const infoEl = card.querySelector('.card-info');
            if (!infoEl || infoEl.classList.contains('shine-strong')) return;
            
            if (infoEl._shineTimer) clearTimeout(infoEl._shineTimer);

            window.requestAnimationFrame(() => {
                if (!infoEl.isConnected) return;
                infoEl.classList.remove('shine-soft');
                infoEl.classList.add('shine-strong');
            });
            
            infoEl._shineTimer = setTimeout(() => {
                if (!infoEl || !infoEl.isConnected) return;
                window.requestAnimationFrame(() => infoEl.classList.remove('shine-strong'));
            }, 2000);
        });
        
        this._shineBound = true;
    },

    animatePriceChange: function(startVal, endVal, currency) {
        const el = document.getElementById('pm-price');
        if (!el) return;
        
        if (this.priceTicker) cancelAnimationFrame(this.priceTicker);
        
        el.innerHTML = RenderHelpers.formatMoney(startVal, currency);
        
        const numElement = el.querySelector('.num-en.money-val');
        
        if (!numElement) {
            el.innerHTML = RenderHelpers.formatMoney(endVal, currency);
            return;
        }
        
        const duration = 800;
        let startTimestamp = null;
        
        const step = (timestamp) => {
            if (!el.isConnected) {
                this.priceTicker = null;
                return; 
            }

            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const currentVal = startVal + (endVal - startVal) * easeProgress;
            
            numElement.textContent = RenderHelpers._enNum(currentVal, 2);
            
            if (progress < 1) {
                this.priceTicker = requestAnimationFrame(step);
            } else {
                this.priceTicker = null;
                if (el.isConnected) {
                    el.innerHTML = RenderHelpers.formatMoney(endVal, currency);
                }
            }
        };
        this.priceTicker = requestAnimationFrame(step);
    },
    
    toggleCoupon: function(btn) {
        requestAnimationFrame(() => {
            const section = btn?.closest('.coupon-section');
            if(section) section.classList.toggle('open');
            if(btn) btn.blur();
        });
    },

    checkInputState: function() {
        const codeInput = document.getElementById('couponCode');
        const pasteIcon = document.getElementById('pasteIcon');
        const clearIcon = document.getElementById('clearIcon');
        
        if (!codeInput || !pasteIcon) return;
        
        requestAnimationFrame(() => {
            if (codeInput.value.trim().length > 0) {
                pasteIcon.style.display = 'none';
                if (clearIcon && !codeInput.disabled) clearIcon.style.display = 'block';
            } else {
                pasteIcon.style.display = 'block';
                if (clearIcon) clearIcon.style.display = 'none';
            }
        });
    },

    pasteText: async function() {
        const codeInput = document.getElementById('couponCode');
        if (!codeInput) return;
        try {
            if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error("Clipboard API not supported");
            
            const text = await navigator.clipboard.readText();
            if (text) {
                codeInput.value = String(text).replace(/[<>'"/;`%]/g, '').trim().toUpperCase();
                this.checkInputState(); 
                
                // 🛡️ Mobile Keyboard Glitch Fix: نفك التركيز (blur) بدلاً من (focus) لمنع كيبورد الجوال من القفز للعميل فجأة
                codeInput.blur(); 
                
                if (typeof UIManager !== 'undefined') UIManager.showToast('تم إدراج الكوبون', 'success');
            }
        } catch (err) { 
            if (typeof UIManager !== 'undefined') UIManager.showToast('تعذر اللصق تلقائياً، يرجى كتابة الكود', 'error'); 
        }
    },

    _showCouponMessage: function(msgBox, htmlContent, className, duration = 4000) {
        if (!msgBox) return;
        if (this._couponMsgTimer) clearTimeout(this._couponMsgTimer);
        
        requestAnimationFrame(() => {
            if (!msgBox.isConnected) return;
            msgBox.innerHTML = htmlContent;
            msgBox.className = `coupon-msg-box ${className} coupon-msg-visible`;
        });
        
        if (duration > 0) {
            this._couponMsgTimer = setTimeout(() => {
                if (msgBox.isConnected) {
                    requestAnimationFrame(() => msgBox.classList.remove('coupon-msg-visible'));
                }
            }, duration);
        }
    },

    applyCoupon: function() {
        if (!DataManager.currentProd) return; 
        const SysUI = typeof UIManager !== 'undefined' ? UIManager : null;

        if (!DataManager.user) {
            if (SysUI) { SysUI.showToast('يرجى تسجيل الدخول أولاً', 'error'); SysUI.sfx?.('error'); }
            return;
        }
        
        if (DataManager.appliedCoupon) { 
            if (SysUI) SysUI.showToast('يوجد كوبون مستخدم بالفعل', 'info'); 
            return; 
        }

        const codeInput = document.getElementById('couponCode');
        const msgBox = document.getElementById('couponMsg');
        const btnApply = document.getElementById('btnApply');
        const clearIcon = document.getElementById('clearIcon');
        const pasteIcon = document.getElementById('pasteIcon');

        if (!codeInput) return;
        const code = codeInput.value.toUpperCase().trim();

        if (!code) {
            this._showCouponMessage(msgBox, `<i class="fa-solid fa-circle-xmark"></i> يرجى إدخال الكود`, 'error');
            return;
        }

        const selection = this._getCurrentSelection();
        const result = DataManager.validateCoupon(code, DataManager.currentProd, selection.qty, selection.optIdx);

        if (!result.valid) {
            this._showCouponMessage(msgBox, `<i class="fa-solid fa-circle-xmark"></i> ${Utils.escapeHtml(result.msg)}`, 'error');
            if(SysUI) { SysUI.showToast(result.msg, 'error'); SysUI.sfx?.('error'); }
            return;
        }

        const pricingCheck = DataManager.getPricingLocal(DataManager.currentProd, selection.qty, selection.optIdx, result.coupon);
        if (!pricingCheck || !pricingCheck.pricingSnapshot) return;

        // 🛡️ التحديث الماسي (Firewall Guard): 
        // نتحقق من رسائل الخطأ الصادرة من المحرك المالي قبل الموافقة على الكوبون
        if (pricingCheck.pricingSnapshot.isFirewallViolated) {
            const reason = pricingCheck.pricingSnapshot.rejectionReason || 'عذراً، هذا الكوبون يكسر حماية التسعير.';
            this._showCouponMessage(msgBox, `<i class="fa-solid fa-shield-halved"></i> ${Utils.escapeHtml(reason)}`, 'error', 6000);
            if(SysUI) { SysUI.showToast('مرفوض لحماية المتجر', 'error'); SysUI.sfx?.('error'); }
            return; 
        }

        const couponVal = parseFloat(result.coupon.value) || 0;
        const originalTotal = pricingCheck.pricingSnapshot.totalOriginalPrice || 0;
        const couponDiscount = pricingCheck.pricingSnapshot.couponDiscount || 0;
        
        if (couponDiscount === 0 && originalTotal > 0 && couponVal > 0) {
            this._showCouponMessage(msgBox, `<i class="fa-solid fa-circle-info"></i> عذراً، لا يمكن تطبيق الخصم على هذا المنتج.`, 'error', 5000);
            if(SysUI) { SysUI.showToast('هذا المنتج غير مشمول بالخصم الإضافي', 'warning'); SysUI.sfx?.('error'); }
            return; 
        }

        DataManager.appliedCoupon = result.coupon; 
        
        codeInput.disabled = true; 
        if(btnApply) { btnApply.disabled = true; btnApply.classList.add('btn-disabled'); }
        
        if (SysUI && typeof SysUI.updatePriceDisplay === 'function') SysUI.updatePriceDisplay(); 
        if (SysUI) SysUI.sfx?.('success');

        const safeCouponValue = Utils.escapeHtml(String(result.coupon.value));
        const discountText = result.coupon.type === 'percentage' ? `بنسبة ${safeCouponValue}%` : `ثابت`;

        this._showCouponMessage(msgBox, `<i class="fa-solid fa-check"></i> تم تطبيق خصم ${discountText} بنجاح!`, 'success', 0);
        
        requestAnimationFrame(() => {
            if(pasteIcon) pasteIcon.style.display = 'none'; 
            if(clearIcon) clearIcon.style.display = 'block'; 
        });

        if(SysUI) SysUI.showToast('تم تطبيق الخصم بنجاح', 'success');
    },
    
    removeCoupon: function(silent = false) {
        const SysUI = typeof UIManager !== 'undefined' ? UIManager : null;
        const codeInput = document.getElementById('couponCode');
        const msgBox = document.getElementById('couponMsg');
        const btnApply = document.getElementById('btnApply');
        
        DataManager.appliedCoupon = null; 
        
        if (SysUI && typeof SysUI.updatePriceDisplay === 'function') SysUI.updatePriceDisplay(); 
        
        requestAnimationFrame(() => {
            if (codeInput) {
                codeInput.value = '';
                codeInput.disabled = false;
                // التركيز فقط على الكمبيوتر لمنع كيبورد الموبايل من الانبثاق التلقائي
                if (!silent && window.innerWidth > 768) {
                    codeInput.focus();
                }
            }

            if (btnApply) {
                btnApply.disabled = false;
                btnApply.classList.remove('btn-disabled');
            }
            
            if (msgBox) msgBox.classList.remove('coupon-msg-visible');
        });
        
        if (this._couponMsgTimer) clearTimeout(this._couponMsgTimer);
        
        this.checkInputState(); 

        if(!silent && SysUI) { SysUI.showToast('تم إزالة الكوبون', 'info'); SysUI.sfx?.('nav'); }
    },

    revalidateAppliedCoupon: function() {
        if (!DataManager.appliedCoupon || !DataManager.currentProd) return;
        
        const selection = this._getCurrentSelection();
        const result = DataManager.validateCoupon(DataManager.appliedCoupon.code, DataManager.currentProd, selection.qty, selection.optIdx);
        
        let isValid = result.valid;
        let rejectMsg = result.msg;

        // 🛡️ Dynamic Revalidation Guard: التأكد أن تغيير الكمية لم يكسر הגدار الناري
        if (isValid) {
            const pricingCheck = DataManager.getPricingLocal(DataManager.currentProd, selection.qty, selection.optIdx, DataManager.appliedCoupon);
            if (pricingCheck && pricingCheck.pricingSnapshot?.isFirewallViolated) {
                isValid = false;
                rejectMsg = 'تجاوز حدود حماية التسعير للكمية المحددة.';
            }
        }
        
        if (!isValid) {
            this.removeCoupon(true); 
            const msgBox = document.getElementById('couponMsg');
            this._showCouponMessage(msgBox, `<i class="fa-solid fa-triangle-exclamation"></i> تم إزالة الكوبون: ${Utils.escapeHtml(rejectMsg)}`, 'error', 5000);
            
            const SysUI = typeof UIManager !== 'undefined' ? UIManager : null;
            if (SysUI) SysUI.showToast('تم إلغاء الكوبون بسبب تغير الشروط', 'warning');
        }
    },

    initBottomNavSync: function() {
        const navContainer = document.querySelector('.bottom-nav');
        if (!navContainer) return;
        
        const navIcons = navContainer.querySelectorAll('.nav-icon');
        
        window.updateBottomNavState = function(targetState) {
            requestAnimationFrame(() => {
                navIcons.forEach(icon => icon.classList.remove('active'));
                navIcons.forEach(icon => {
                    const action = icon.getAttribute('data-action') || '';
                    if (action.includes(targetState) || (targetState === 'home' && (action === 'go-home' || action === ''))) {
                        icon.classList.add('active');
                    }
                });
            });
        };
        
        if (!navContainer.dataset.navBound) {
            navContainer.dataset.navBound = '1';
            navContainer.addEventListener('click', (e) => {
                const clickedIcon = e.target.closest('.nav-icon');
                if (!clickedIcon) return;
                
                requestAnimationFrame(() => {
                    navIcons.forEach(i => i.classList.remove('active'));
                    clickedIcon.classList.add('active');
                });
            });
        }
        
        let initialState = 'home';
        if (document.body.classList.contains('is-favorites')) initialState = 'favorites';
        else if (document.body.classList.contains('is-wallet')) initialState = 'wallet';
        else if (document.body.classList.contains('is-orders')) initialState = 'orders';
        else if (document.body.classList.contains('is-settings')) initialState = 'settings';
        
        window.updateBottomNavState(initialState);
    }
};
