// ============================================================================
// 🧩 ملف المكونات الإضافية والواجهات المستقلة (components.js) - ES6 Module
// 🎯 الوظيفة: إدارة التقويم، الكوبونات، اللمعان، ومزامنة الواجهة السفلية
// 🚀 التحديث الأقصى: ترقيع ثغرة (XSS)، منع تسريب الذاكرة، تحسين أداء Observer وتجربة الموبايل
// ============================================================================

import { DataManager, LiveStoreData } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import { Utils } from './utils.js';
import { RenderHelpers } from './core/renderHelpers.js'; 

// =========================================================
// 2️⃣ نظام التقويم الذكي (Calendar App)
// =========================================================
export const CalendarApp = {
    monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    dayNames: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    currYear: new Date().getFullYear(),
    currMonth: new Date().getMonth(),
    activeInputId: null,
    tempSelectedDate: null, 
    _isInitialized: false, 

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

        document.addEventListener('click', (e) => {
            const dateField = e.target.closest('.custom-field');
            if (dateField) {
                const hiddenInput = dateField.querySelector('input[type="hidden"]');
                if (hiddenInput) { e.preventDefault(); e.stopPropagation(); this.open(hiddenInput.id, dateField); return; }
            }
            if (!modal || !modal.classList.contains('show')) return;
            if (!modal.contains(e.target) && !e.target.closest('.btn-action')) this.close();
        });
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
    
    document.querySelectorAll('.custom-field').forEach(f => f.classList.remove('active'));
    if (targetElement) targetElement.classList.add('active');
    
    const hiddenInput = document.getElementById(inputId);
    const currentVal = hiddenInput ? hiddenInput.value : '';
    
    if (currentVal && currentVal.includes('-')) {
        const parts = currentVal.split('-');
        this.currYear = parseInt(parts[0], 10);
        this.currMonth = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        this.tempSelectedDate = isNaN(day) ? new Date() : new Date(this.currYear, this.currMonth, day);
    } else {
        const now = new Date();
        this.currYear = now.getFullYear();
        this.currMonth = now.getMonth();
        this.tempSelectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    
    this.render();
    const modal = document.getElementById('cal-modal');
    
    if (modal) {
        if (modal.parentNode !== document.body) document.body.appendChild(modal);
        modal.classList.add('show');
        
        // 🚀 [إصلاح تجربة الموبايل]: ضمان تمركز التقويم بشكل سليم على جميع الشاشات
        modal.style.position = "fixed";
        if (window.innerWidth > 500 && targetElement && typeof targetElement.getBoundingClientRect === 'function') {
            const rect = targetElement.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < 340) {
                modal.style.top = "auto";
                modal.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
            } else {
                modal.style.bottom = "auto";
                modal.style.top = (rect.bottom + 10) + 'px';
            }
            let leftPos = rect.left;
            if (leftPos < 10) leftPos = 10;
            modal.style.left = leftPos + 'px';
            modal.style.transform = "none";
        } else {
            // وضع الموبايل: توسيط إجباري
            modal.style.top = "50%";
            modal.style.left = "50%";
            modal.style.bottom = "auto";
            modal.style.transform = "translate(-50%, -50%)";
        }
    }
},    close: function() {
        const modal = document.getElementById('cal-modal');
        if(modal) modal.classList.remove('show');
        document.querySelectorAll('.custom-field').forEach(f => f.classList.remove('active'));
    },

    render: function() {
        document.getElementById('disp-month').innerText = this.monthNames[this.currMonth];
        document.getElementById('disp-year').innerText = this.currYear;
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
        document.querySelectorAll('.dropdown-list').forEach(l => { if(l.id !== id) l.classList.remove('active'); });
        const l = document.getElementById(id); 
        if(l) { 
            l.classList.toggle('active'); 
            if(l.classList.contains('active')) { 
                const s = l.querySelector('.selected'); 
                if(s) s.scrollIntoView({block:'center'}); 
            }
        }
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
                        mL.classList.remove('active');
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
                        yL.classList.remove('active');
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
// 3️⃣ تجميع المكونات (مصدّرة كـ Module)
// =========================================================
export const Components = {
    priceTicker: null,
    _navObserver: null, 
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
        const container = document.getElementById('store-grid') || document.body;
        
        container.addEventListener('mouseover', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;
            
            const infoEl = card.querySelector('.card-info');
            if (!infoEl || infoEl.classList.contains('shine-strong')) return;
            
            // 🛡️ [إصلاح تسريب الذاكرة]: تنظيف المؤقتات السابقة قبل إنشاء جديد
            if (infoEl._shineTimer) clearTimeout(infoEl._shineTimer);

            window.requestAnimationFrame(() => {
                infoEl.classList.remove('shine-soft');
                infoEl.classList.add('shine-strong');
            });
            
            infoEl._shineTimer = setTimeout(() => {
                if (infoEl.isConnected) {
                    window.requestAnimationFrame(() => infoEl.classList.remove('shine-strong'));
                }
            }, 2000);
        });
        
        this._shineBound = true;
    },

    animatePriceChange: function(startVal, endVal, currency) {
        const el = document.getElementById('pm-price');
        if (!el) return;
        if (this.priceTicker) cancelAnimationFrame(this.priceTicker);

        const duration = 800;
        let startTimestamp = null;

        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const currentVal = startVal + (endVal - startVal) * easeProgress;
            
            el.innerHTML = RenderHelpers.formatMoney(currentVal, currency);
            
            if (progress < 1) { 
                this.priceTicker = requestAnimationFrame(step); 
            } else { 
                this.priceTicker = null; 
                el.innerHTML = RenderHelpers.formatMoney(endVal, currency); 
            }
        };
        this.priceTicker = requestAnimationFrame(step);
    },

    toggleCoupon: function(btn) {
        const section = btn.closest('.coupon-section');
        if(section) section.classList.toggle('open');
        if(btn) btn.blur();
    },

    checkInputState: function() {
        const codeInput = document.getElementById('couponCode');
        const pasteIcon = document.getElementById('pasteIcon');
        const clearIcon = document.getElementById('clearIcon');
        
        if (!codeInput || !pasteIcon) return;
        
        if (codeInput.value.trim().length > 0) {
            pasteIcon.style.display = 'none';
            if (clearIcon && !codeInput.disabled) clearIcon.style.display = 'block';
        } else {
            pasteIcon.style.display = 'block';
            if (clearIcon) clearIcon.style.display = 'none';
        }
    },

    pasteText: async function() {
        const codeInput = document.getElementById('couponCode');
        if (!codeInput) return;
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                // الاعتماد الحصري على .value لا يشكل XSS فورياً، لكن يجب تعقيمه قبل العرض
                codeInput.value = text;
                this.checkInputState(); 
                codeInput.focus();
                if (typeof UIManager !== 'undefined') UIManager.showToast('تم إدراج الكوبون', 'success');
            }
        } catch (err) { 
            if (typeof UIManager !== 'undefined') UIManager.showToast('يرجى السماح باللصق', 'error'); 
        }
    },

    _showCouponMessage: function(msgBox, htmlContent, className, duration = 4000) {
        if (!msgBox) return;
        if (this._couponMsgTimer) clearTimeout(this._couponMsgTimer);
        
        msgBox.innerHTML = htmlContent;
        msgBox.className = `coupon-msg-box ${className}`;
        msgBox.style.display = 'flex';
        
        if (duration > 0) {
            this._couponMsgTimer = setTimeout(() => {
                if (msgBox.isConnected) msgBox.style.display = 'none';
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

        const pricingCheck = DataManager.calculateFinalPrice(DataManager.currentProd, DataManager.user, selection.qty, selection.optIdx, result.coupon);

        if (pricingCheck.unitSnapshot.isFirewallActive && pricingCheck.unitSnapshot.couponDiscount === 0) {
            this._showCouponMessage(msgBox, `<i class="fa-solid fa-circle-info"></i> عذراً، هذا المنتج متاح بأفضل سعر ممكن.`, 'error', 5000);
            if(SysUI) { SysUI.showToast('السعر الحالي هو أفضل سعر متاح', 'warning'); SysUI.sfx?.('error'); }
            return; 
        }

        DataManager.appliedCoupon = result.coupon; 
        
        if (SysUI && typeof SysUI.updatePriceDisplay === 'function') SysUI.updatePriceDisplay(); 
        if (SysUI) SysUI.sfx?.('success');

        // 🚀 [إصلاح العملة الديناميكية]: عرض العملة الصحيحة للعميل بدلاً من التثبيت على الدولار
        const safeCouponValue = Utils.escapeHtml(String(result.coupon.value));
        const displayCurr = DataManager.selectedCurr || DataManager.user.baseCurrency || 'USD';
        const currencySymbol = RenderHelpers ? RenderHelpers.getCurrencySymbolText(displayCurr) : displayCurr;
        
        const discountText = result.coupon.type === 'percentage' 
                             ? `${safeCouponValue}%` 
                             : `${RenderHelpers ? RenderHelpers._enNum(safeCouponValue, 2) : safeCouponValue} ${currencySymbol}`;
        
        this._showCouponMessage(msgBox, `<i class="fa-solid fa-check"></i> تم تطبيق خصم ${discountText}!`, 'success', 0);
        
        codeInput.disabled = true; 
        if(btnApply) { btnApply.disabled = true; btnApply.classList.add('btn-disabled'); }
        
        if(pasteIcon) pasteIcon.style.display = 'none'; 
        if(clearIcon) clearIcon.style.display = 'block'; 

        if(SysUI) SysUI.showToast('تم تطبيق الخصم بنجاح', 'success');
    },
    removeCoupon: function(silent = false) {
        const SysUI = typeof UIManager !== 'undefined' ? UIManager : null;
        const codeInput = document.getElementById('couponCode');
        const msgBox = document.getElementById('couponMsg');
        const btnApply = document.getElementById('btnApply');
        
        DataManager.appliedCoupon = null; 
        
        if (SysUI && typeof SysUI.updatePriceDisplay === 'function') SysUI.updatePriceDisplay(); 
        
        if (codeInput) {
            codeInput.value = '';
            codeInput.disabled = false;
            // 🛡️ [تحسين تجربة المستخدم موبايل]: لا تطلب Focus إذا كان المستخدم يتصفح من هاتف لتجنب فتح الكيبورد المزعج
            if (!silent && window.innerWidth > 768) {
                codeInput.focus();
            }
        }

        if (btnApply) {
            btnApply.disabled = false;
            btnApply.classList.remove('btn-disabled');
        }
        
        if (msgBox) msgBox.style.display = 'none';
        if (this._couponMsgTimer) clearTimeout(this._couponMsgTimer);
        
        this.checkInputState(); 

        if(!silent && SysUI) { SysUI.showToast('تم إزالة الكوبون', 'info'); SysUI.sfx?.('nav'); }
    },

    revalidateAppliedCoupon: function() {
        if (!DataManager.appliedCoupon || !DataManager.currentProd) return;
        
        const selection = this._getCurrentSelection();
        const result = DataManager.validateCoupon(DataManager.appliedCoupon.code, DataManager.currentProd, selection.qty, selection.optIdx);
        
        if (!result.valid) {
            this.removeCoupon(true); 
            const msgBox = document.getElementById('couponMsg');
            this._showCouponMessage(msgBox, `<i class="fa-solid fa-triangle-exclamation"></i> تم إزالة الكوبون: ${Utils.escapeHtml(result.msg)}`, 'error', 5000);
            
            const SysUI = typeof UIManager !== 'undefined' ? UIManager : null;
            if (SysUI) SysUI.showToast('تم إلغاء الكوبون بسبب تغير شروط الطلب', 'warning');
        }
    },

    // 🚀 [تحسين أداء المتصفح]: استخدام requestAnimationFrame لتجنب الـ Layout Thrashing 
    initBottomNavSync: function() {
        const navContainer = document.querySelector('.bottom-nav');
        if (!navContainer) return;
        
        const navIcons = navContainer.querySelectorAll('.nav-icon');
        let isSyncQueued = false; // لمنع الاستدعاء المكرر في نفس اللحظة
        
        function updateUIState() {
            navIcons.forEach(icon => icon.classList.remove('active'));
            
            let activeTarget = 'home';
            if (document.body.classList.contains('is-favorites')) activeTarget = 'favorites';
            else if (document.body.classList.contains('is-wallet')) activeTarget = 'wallet';
            else if (document.body.classList.contains('is-orders')) activeTarget = 'orders';
            else if (document.body.classList.contains('is-settings')) activeTarget = 'settings';

            navIcons.forEach(icon => {
                const action = icon.getAttribute('data-action') || '';
                if (action.includes(activeTarget) || 
                   (activeTarget === 'home' && (action === 'go-home' || action === ''))) {
                    icon.classList.add('active');
                }
            });
        }

        if (this._navObserver) this._navObserver.disconnect();
        
        this._navObserver = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (let m of mutations) {
                if (m.attributeName === 'class') { shouldUpdate = true; break; }
            }
            
            if (shouldUpdate && !isSyncQueued) {
                isSyncQueued = true;
                window.requestAnimationFrame(() => {
                    updateUIState();
                    isSyncQueued = false;
                });
            }
        });
        
        this._navObserver.observe(document.body, { attributes: true });

        if (!navContainer.dataset.navBound) {
            navContainer.dataset.navBound = '1';
            navContainer.addEventListener('click', (e) => {
                const clickedIcon = e.target.closest('.nav-icon');
                if (!clickedIcon) return;
                
                navIcons.forEach(i => i.classList.remove('active'));
                clickedIcon.classList.add('active');
            });
        }
        
        updateUIState();
    }
};