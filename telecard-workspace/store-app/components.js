// ============================================================================
// 🧩 ملف المكونات الإضافية والواجهات المستقلة (components.js) - V21.0.0 💎
// 🎯 الوظيفة: إدارة التقويم الذكي، أداة الكوبونات، لمعان البطاقات، وعداد السعر المتحرك.
// 🚀 التحديثات المعمارية الصارمة (V21.0.0 - Citadel Architecture & Zero-Conflict Events):
// 1. Deterministic Bottom-Nav Delegation 🏛️: إزالة مستمع النقر العشوائي من الشريط السفلي وتفويضه لـ UIManager.syncBottomNavUI.
// 2. Coupon Message Lifecycle Fix 🎟️: تفريغ وإعادة ضبط كلاسات صندوق رسائل الكوبون (_clearCouponMessage) لضمان اختفائها الفعلي.
// 3. Unified Calendar Sync 📅: توحيد صيغة التاريخ (YYYY-MM-DD) مع توقيت السيرفر وإلغاء الازدواجية في فتح التقويم.
// 4. Direct ES6 Module Binding ⚡: استبدال getSys() البطيئة باستيراد مباشر لـ UIManager و RenderManager.
// ============================================================================

import { DataManager } from './dataManager.js';
import * as Utils from './utils.js'; 
import { RenderHelpers } from './core/renderHelpers.js'; 
import { UIManager } from './ui/uiManager.js';
import { RenderManager } from './renderManager.js';

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

    _getServerToday: function() {
        const nowMs = (typeof DataManager !== 'undefined' && typeof DataManager.getNow === 'function')
            ? DataManager.getNow()
            : Date.now();
        return new Date(nowMs);
    },

    init: function() {
        const modal = document.getElementById('cal-modal');
        if (modal && modal.parentNode !== document.body) document.body.appendChild(modal);

        // ضبط العرض المبدئي للتواريخ بصيغة موحدة دون تقييد الحقول المخفية قبل اختيار المستخدم
        this.resetDefaultDates('order');
        this.resetDefaultDates('wallet');
        this.resetDefaultDates('pay');
        
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

        if (!this._boundDocClick) {
            document.addEventListener('click', (e) => {
                if (e.target.closest('#calBtnConfirm')) {
                    e.stopPropagation();
                    this.confirmSelection();
                    return;
                }
                if (e.target.closest('#calBtnCancel')) {
                    e.stopPropagation();
                    this.close();
                    return;
                }

                const activeModal = document.getElementById('cal-modal');
                if (!activeModal || !activeModal.classList.contains('show')) return;
                
                // إغلاق القوائم الفرعية للشهر والسنة عند النقر داخل التقويم خارج المحددات
                if (activeModal.contains(e.target) && !e.target.closest('.selector-box')) {
                    activeModal.querySelectorAll('.dropdown-list.active').forEach(l => l.classList.remove('active'));
                }

                // إغلاق التقويم عند النقر خارجه
                if (!activeModal.contains(e.target) && !e.target.closest('.custom-field') && !e.target.closest('.btn-action')) {
                    this.close();
                }
            });
            this._boundDocClick = true;
        }
    },

    resetDefaultDates: function(prefix) {
        const datePrefix = prefix === 'payments' ? 'pay' : prefix;
        const today = this._getServerToday();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const startFormatted = this.formatDate(yesterday);
        const endFormatted = this.formatDate(today);

        const startInp = document.getElementById(`${datePrefix}-date-start`);
        const endInp = document.getElementById(`${datePrefix}-date-end`);
        const dispStart = document.getElementById(`disp-${datePrefix}-date-start`);
        const dispEnd = document.getElementById(`disp-${datePrefix}-date-end`);

        // تبقى الحقول المخفية فارغة لعرض السجل كاملاً حتى يختار العميل التصفية بالتاريخ
        if (startInp) startInp.value = '';
        if (endInp) endInp.value = '';
        if (dispStart) { dispStart.innerText = startFormatted; dispStart.classList.remove('placeholder'); }
        if (dispEnd) { dispEnd.innerText = endFormatted; dispEnd.classList.remove('placeholder'); }
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
        const dispSpan = document.getElementById('disp-' + inputId);
        const rawDateStr = (hiddenInput && hiddenInput.value) ? hiddenInput.value : (dispSpan ? dispSpan.innerText.trim().replace(/\//g, '-') : '');
        
        if (rawDateStr && rawDateStr.includes('-')) {
            const parts = rawDateStr.split('-');
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
        const now = this._getServerToday();
        this.currYear = now.getFullYear();
        this.currMonth = now.getMonth();
        this.tempSelectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    },

    close: function() {
        requestAnimationFrame(() => {
            const modal = document.getElementById('cal-modal');
            if (modal) {
                modal.classList.remove('show');
                modal.querySelectorAll('.dropdown-list.active').forEach(l => l.classList.remove('active'));
            }
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
            
            const today = this._getServerToday();
            today.setHours(0, 0, 0, 0);
            
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
        if (hiddenInput) {
            hiddenInput.value = formatted;
            const disp = document.getElementById('disp-' + this.activeInputId);
            if (disp) disp.innerText = formatted;
            
            // 🔗 مزامنة الحقل المقابل (البداية أو النهاية) إذا كان لا يزال فارغاً لضمان تطابق ما يراه العميل مع الفلتر
            const isStart = this.activeInputId.endsWith('-start');
            const companionId = isStart ?
                this.activeInputId.replace('-start', '-end') :
                this.activeInputId.replace('-end', '-start');
            const companionInp = document.getElementById(companionId);
            const companionDisp = document.getElementById('disp-' + companionId);
            if (companionInp && !companionInp.value && companionDisp && companionDisp.innerText.includes('-')) {
                companionInp.value = companionDisp.innerText.trim();
            }
            
            if (typeof hiddenInput.onchange === 'function') hiddenInput.onchange();
            
            // ⚡ تصفية السجل المفتوح فوراً بمجرد اختيار التاريخ
            if (this.activeInputId.startsWith('order-')) RenderManager.renderOrders?.(true);
            else if (this.activeInputId.startsWith('wallet-')) RenderManager.renderWallet?.(true);
            else if (this.activeInputId.startsWith('pay-')) RenderManager.renderPayments?.(true);
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
            const ty = this._getServerToday().getFullYear(); 
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
// 2️⃣ المكونات التفاعلية (Components Module)
// =========================================================
export const Components = {
    priceTicker: null,
    _shineBound: false, 
    _couponMsgTimer: null, 

    _getCurrentSelection: function() {
        let qty = 1; let optIdx = null;
        if (!DataManager.currentProd) return { qty, optIdx };

        const prodType = DataManager.currentProd.type;

        try {
            if (prodType === 'counter') {
                qty = parseInt(document.getElementById('pm-qty')?.value, 10) || 1;
            } else if (prodType === 'select') {
                const sel = document.getElementById('pm-pack');
                optIdx = sel ? parseInt(sel.value, 10) : 0;
            } else if (prodType === 'simple' && DataManager.currentProd.allowQty) {
                qty = parseInt(document.getElementById('simple-qty-val')?.value, 10) || 1;
            }
        } catch(e) { console.warn('DOM Parse Warning', e); }

        const activeOpt = (prodType === 'select' && Array.isArray(DataManager.currentProd.options) && optIdx !== null) ?
            DataManager.currentProd.options[optIdx] : null;
            
        const rawMaxVal = activeOpt?.maxQty ?? DataManager.currentProd.maxQty ?? DataManager.currentProd.simpleMax;
        const rawMinVal = activeOpt?.minQty ?? DataManager.currentProd.minQty;
        const adminMax = parseInt(rawMaxVal, 10);
        const adminMin = parseInt(rawMinVal, 10);

        const systemMax = prodType === 'select' ? 1 : (prodType === 'counter' ? 5000000 : 100);
        
        const finalMaxLimit = (!isNaN(adminMax) && adminMax > 0) ? Math.min(adminMax, systemMax) : systemMax;
        const finalMinLimit = prodType === 'select' ? 1 : ((!isNaN(adminMin) && adminMin > 0) ? Math.max(1, adminMin) : 1);

        const finalQty = Math.min(Math.max(finalMinLimit, qty), finalMaxLimit);

        if (finalQty !== qty) {
            requestAnimationFrame(() => {
                const pmQty = document.getElementById('pm-qty');
                const simpleQty = document.getElementById('simple-qty-val');
                if (pmQty && prodType === 'counter') pmQty.value = finalQty;
                if (simpleQty && prodType === 'simple') simpleQty.value = finalQty;
            });
        }

        return { qty: finalQty, optIdx };
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
            const currentEl = document.getElementById('pm-price');
            if (!currentEl || currentEl !== el) {
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
                codeInput.blur(); 
                UIManager.showToast?.('تم إدراج الكوبون', 'success');
            }
        } catch (err) { 
            UIManager.showToast?.('تعذر اللصق تلقائياً، يرجى كتابة الكود', 'error'); 
        }
    },

    _clearCouponMessage: function(msgBox = document.getElementById('couponMsg')) {
        if (this._couponMsgTimer) {
            clearTimeout(this._couponMsgTimer);
            this._couponMsgTimer = null;
        }
        if (!msgBox) return;
        requestAnimationFrame(() => {
            if (!msgBox.isConnected) return;
            msgBox.className = 'coupon-msg-box';
            msgBox.innerHTML = '';
        });
    },

    _showCouponMessage: function(msgBox, htmlContent, className, duration = 4000) {
        if (!msgBox) return;
        if (this._couponMsgTimer) {
            clearTimeout(this._couponMsgTimer);
            this._couponMsgTimer = null;
        }
        
        requestAnimationFrame(() => {
            if (!msgBox.isConnected) return;
            msgBox.innerHTML = htmlContent;
            msgBox.className = `coupon-msg-box ${className} coupon-msg-visible`;
        });
        
        if (duration > 0) {
            this._couponMsgTimer = setTimeout(() => {
                this._clearCouponMessage(msgBox);
            }, duration);
        }
    },

    applyCoupon: async function() {
        if (!DataManager.currentProd) return; 

        if (!DataManager.user) {
            UIManager.showToast?.('يرجى تسجيل الدخول أولاً', 'error');
            UIManager.sfx?.('error');
            return;
        }
        
        if (DataManager.appliedCoupon) { 
            UIManager.showToast?.('يوجد كوبون مستخدم بالفعل', 'info'); 
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

        const originalBtnText = btnApply ? btnApply.innerHTML : 'تطبيق';
        if (btnApply) {
            btnApply.disabled = true;
            btnApply.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        }

        try {
            if (typeof DataManager.fetchCouponByCode === 'function') {
                await DataManager.fetchCouponByCode(code);
            }
        } finally {
            if (btnApply && !DataManager.appliedCoupon) {
                btnApply.disabled = false;
                btnApply.innerHTML = originalBtnText;
            }
        }

        const selection = this._getCurrentSelection();
        const result = DataManager.validateCoupon(code, DataManager.currentProd, selection.qty, selection.optIdx);

        if (!result.valid) {
            this._showCouponMessage(msgBox, `<i class="fa-solid fa-circle-xmark"></i> ${Utils.escapeHtml(result.msg)}`, 'error');
            UIManager.showToast?.(result.msg, 'error');
            UIManager.sfx?.('error');
            return;
        }

        const pricingCheck = DataManager.getPricingLocal(DataManager.currentProd, selection.qty, selection.optIdx, result.coupon);
        if (!pricingCheck || !pricingCheck.pricingSnapshot) return;

        if (pricingCheck.pricingSnapshot.isFirewallViolated) {
            const reason = pricingCheck.pricingSnapshot.rejectionReason || 'عذراً، هذا الكوبون يكسر حماية التسعير.';
            this._showCouponMessage(msgBox, `<i class="fa-solid fa-shield-halved"></i> ${Utils.escapeHtml(reason)}`, 'error', 6000);
            UIManager.showToast?.('مرفوض لحماية المتجر', 'error');
            UIManager.sfx?.('error');
            return; 
        }

        const couponVal = parseFloat(result.coupon.value) || 0;
        const originalTotal = pricingCheck.pricingSnapshot.originalPrice || 0;
        const couponDiscount = pricingCheck.pricingSnapshot.couponDiscount || 0;
        
        if (couponDiscount === 0 && originalTotal > 0 && couponVal > 0) {
            this._showCouponMessage(msgBox, `<i class="fa-solid fa-circle-info"></i> عذراً، لا يمكن تطبيق الخصم على هذا المنتج.`, 'error', 5000);
            UIManager.showToast?.('هذا المنتج غير مشمول بالخصم الإضافي', 'warning');
            UIManager.sfx?.('error');
            return; 
        }

        DataManager.appliedCoupon = result.coupon; 
        
        codeInput.disabled = true; 
        if(btnApply) { btnApply.innerHTML = originalBtnText; btnApply.disabled = true; btnApply.classList.add('btn-disabled'); }
        
        UIManager.updatePriceDisplay?.(); 
        UIManager.sfx?.('success');

        const safeCouponValue = Utils.escapeHtml(String(result.coupon.value));
        const discountText = result.coupon.type === 'percentage' ? `بنسبة ${safeCouponValue}%` : `ثابت`;

        this._showCouponMessage(msgBox, `<i class="fa-solid fa-check"></i> تم تطبيق خصم ${discountText} بنجاح!`, 'success', 0);
        
        requestAnimationFrame(() => {
            if(pasteIcon) pasteIcon.style.display = 'none'; 
            if(clearIcon) clearIcon.style.display = 'block'; 
        });

        UIManager.showToast?.('تم تطبيق الخصم بنجاح', 'success');
    },
    
    removeCoupon: function(silent = false) {
        const codeInput = document.getElementById('couponCode');
        const msgBox = document.getElementById('couponMsg');
        const btnApply = document.getElementById('btnApply');
        
        if (this.priceTicker) {
            cancelAnimationFrame(this.priceTicker);
            this.priceTicker = null;
        }

        DataManager.appliedCoupon = null; 
        
        UIManager.updatePriceDisplay?.(); 
        this._clearCouponMessage(msgBox);
        
        requestAnimationFrame(() => {
            if (codeInput) {
                codeInput.value = '';
                codeInput.disabled = false;
                if (!silent && window.innerWidth > 768) {
                    codeInput.focus();
                }
            }

            if (btnApply) {
                btnApply.disabled = false;
                btnApply.classList.remove('btn-disabled');
            }
        });
        
        this.checkInputState(); 

        if (!silent) {
            UIManager.showToast?.('تم إزالة الكوبون', 'info');
            UIManager.sfx?.('nav');
        }
    },

    revalidateAppliedCoupon: function() {
        if (!DataManager.appliedCoupon || !DataManager.currentProd) return;
        
        const selection = this._getCurrentSelection();
        const result = DataManager.validateCoupon(DataManager.appliedCoupon.code, DataManager.currentProd, selection.qty, selection.optIdx);
        
        let isValid = result.valid;
        let rejectMsg = result.msg;

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
            UIManager.showToast?.('تم إلغاء الكوبون بسبب تغير الشروط', 'warning');
        }
    },

    // 🏛️ تفويض كامل لمعمارية القلعة (UIState) دون أي مستمعات نقر متضاربة
    initBottomNavSync: function() {
        UIManager.syncBottomNavUI?.();
    }
};

if (typeof globalThis !== 'undefined' && !globalThis.CalendarApp) {
    Object.defineProperty(globalThis, 'CalendarApp', {
        value: CalendarApp,
        writable: false,
        configurable: false
    });
}