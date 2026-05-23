// ============================================================================
// 🧩 ملف المكونات الإضافية والواجهات المستقلة (components.js) - ES6 Module
// 🎯 الوظيفة: إدارة التقويم، الكوبونات، اللمعان، ومزامنة الواجهة السفلية
// 🚀 التحديث: إنهاء الـ DOM Scraping، سد تسريب الذاكرة، وتطبيق تفويض الأحداث الموضعي
// ============================================================================

import { DataManager, LiveStoreData } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import { Utils } from './utils.js';
import { RenderHelpers } from './core/renderHelpers.js'; 

// =========================================================
// 1️⃣ إغلاق القوائم المنسدلة عند النقر خارجها (Global Click Listener)
// =========================================================
document.addEventListener('click', function(e) {
    // 1. إغلاق قائمة باقات المنتجات المنسدلة (لا تزال تعمل بشكل مستقل)
    const packageWrapper = document.getElementById('pkg-custom-dropdown');
    if (packageWrapper && !packageWrapper.contains(e.target) && !e.target.closest('.dropdown-trigger')) {
        packageWrapper.classList.remove('open');
    }

    // 2. إغلاق صندوق إحصائيات المحفظة (النسخة المركزية الموحدة)
    const walletDrawer = document.getElementById('walletStatsDrawer');
    // نتحقق من وجوده وأنه مفتوح حالياً
    if (walletDrawer && walletDrawer.classList.contains('active')) {
        const isClickInsideDrawer = walletDrawer.contains(e.target);
        // نتحقق من أن النقرة ليست على السهم أو زر الفتح الخاص بالمحفظة
        const isClickOnToggleButton = e.target.closest('.detail-arrow') || e.target.closest('.wallet-toggle-btn'); 

        if (!isClickInsideDrawer && !isClickOnToggleButton) {
            // هنا الاستدعاء المركزي: نعتمد على الكائن الموحد
            const sys = window.ClientSystem || window.UIManager;
            if (sys && typeof sys.closeWalletStats === 'function') {
                sys.closeWalletStats(); 
            }
        }
    }
});
// =========================================================
// 2️⃣ نظام التقويم الذكي (Calendar App) - معزول وخالي من تسريب الذاكرة
// =========================================================
export const CalendarApp = {
    monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    dayNames: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    currYear: new Date().getFullYear(),
    currMonth: new Date().getMonth(),
    activeInputId: null,
    tempSelectedDate: null, 
    _isInitialized: false, // 🌟 قفل الحماية من تكرار الـ Event Listeners

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
        
        if (this._isInitialized) return; // 🌟 منع تكرار الأحداث
        this._isInitialized = true;

        // 🌟 تفويض موضعي لشبكة الأيام (يمنع إنشاء 30 مستمع حدث في كل مرة يتم فيها رسم الشهر)
        const grid = document.getElementById('days-container');
        if (grid) {
            grid.addEventListener('click', (e) => {
                const cell = e.target.closest('.day-cell:not(.empty):not(.disabled-day)');
                if (cell) {
                    e.stopPropagation();
                    this.tempSelectedDate = new Date(this.currYear, this.currMonth, parseInt(cell.innerText));
                    this.render();
                }
            });
        }

        // 🌟 تفويض أزرار التأكيد والإلغاء
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
            if (eventOrElement.currentTarget && eventOrElement.currentTarget instanceof Element) targetElement = eventOrElement.currentTarget;
            else if (eventOrElement.target && eventOrElement.target instanceof Element) targetElement = eventOrElement.target.closest('.custom-field') || eventOrElement.target;
            else if (eventOrElement instanceof Element || eventOrElement.nodeType === 1) targetElement = eventOrElement; 
        }

        if (!targetElement && inputId) {
            const inputEl = document.getElementById(inputId);
            if (inputEl) targetElement = inputEl.closest('.custom-field');
        }

        document.querySelectorAll('.custom-field').forEach(f => f.classList.remove('active'));
        if (targetElement && targetElement.classList) targetElement.classList.add('active');
        
        const currentVal = document.getElementById(inputId) ? document.getElementById(inputId).value : '';
        if(currentVal) {
            const parts = currentVal.split('-');
            this.currYear = parseInt(parts[0]);
            this.currMonth = parseInt(parts[1]) - 1;
            this.tempSelectedDate = new Date(this.currYear, this.currMonth, parseInt(parts[2]));
        } else {
            const now = new Date();
            this.currYear = now.getFullYear(); this.currMonth = now.getMonth();
            this.tempSelectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }

        this.render();
        const modal = document.getElementById('cal-modal');
        
        if(modal) {
            if (modal.parentNode !== document.body) document.body.appendChild(modal);
            modal.classList.add('show');
            if (window.innerWidth <= 500) {
                modal.style.cssText = "position: fixed !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important;";
            } else if (targetElement && typeof targetElement.getBoundingClientRect === 'function') {
                const rect = targetElement.getBoundingClientRect();
                modal.style.position = "fixed";
                const spaceBelow = window.innerHeight - rect.bottom;
                if (spaceBelow < 340) { modal.style.top = "auto"; modal.style.bottom = (window.innerHeight - rect.top + 10) + 'px'; } 
                else { modal.style.bottom = "auto"; modal.style.top = (rect.bottom + 10) + 'px'; }
                let leftPos = rect.left; if (leftPos < 10) leftPos = 10;
                modal.style.left = leftPos + 'px'; modal.style.transform = "none";
            }
        }
    },

    close: function() {
        const modal = document.getElementById('cal-modal');
        if(modal) modal.classList.remove('show');
        document.querySelectorAll('.custom-field').forEach(f => f.classList.remove('active'));
    },

    render: function() {
        document.getElementById('disp-month').innerText = this.monthNames[this.currMonth];
        document.getElementById('disp-year').innerText = this.currYear;
        const grid = document.getElementById('days-container');
        if(!grid) return;
        
        // 🌟 استخدام Fragment لتحسين الأداء
        grid.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        this.dayNames.forEach(d => { const div = document.createElement('div'); div.className = 'day-head'; div.innerText = d; fragment.appendChild(div); });
        
        const firstDay = new Date(this.currYear, this.currMonth, 1).getDay();
        const daysInMonth = new Date(this.currYear, this.currMonth + 1, 0).getDate();
        for(let i=0; i<firstDay; i++) { const e = document.createElement('div'); e.className = 'day-cell empty'; fragment.appendChild(e); }
        
        const today = new Date(); today.setHours(0, 0, 0, 0);
        
        for(let d=1; d<=daysInMonth; d++) {
            const cell = document.createElement('div'); cell.className = 'day-cell'; cell.innerText = d;
            if (this.tempSelectedDate && this.tempSelectedDate.getDate() === d && this.tempSelectedDate.getMonth() === this.currMonth && this.tempSelectedDate.getFullYear() === this.currYear) cell.classList.add('selected');
            const cellDate = new Date(this.currYear, this.currMonth, d);
            if (cellDate > today) cell.classList.add('disabled-day'); 
            // تم القضاء على المستمع المباشر (cell.onclick) هنا بفضل الـ Event Delegation في init()
            fragment.appendChild(cell);
        }
        
        grid.appendChild(fragment);
        this.updateHighlights();
    },

    confirmSelection: function() {
        if (this.tempSelectedDate && this.activeInputId) {
            const formatted = this.formatDate(this.tempSelectedDate);
            const hiddenInput = document.getElementById(this.activeInputId);
            if(hiddenInput) { hiddenInput.value = formatted; const disp = document.getElementById('disp-'+this.activeInputId); if(disp) disp.innerText = formatted; if(hiddenInput.onchange) hiddenInput.onchange(); }
        }
        this.close();
    },

    formatDate: function(d) { return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`; },
    adjustMonth: function(s) { this.currMonth+=s; if(this.currMonth>11){this.currMonth=0;this.currYear++;} if(this.currMonth<0){this.currMonth=11;this.currYear--;} this.render(); },
    adjustYear: function(s) { this.currYear+=s; this.render(); },
    
    toggleList: function(id, e) {
        if(e) e.stopPropagation();
        document.querySelectorAll('.dropdown-list').forEach(l => { if(l.id!==id) l.classList.remove('active'); });
        const l = document.getElementById(id); if(l) { l.classList.toggle('active'); if(l.classList.contains('active')) { const s=l.querySelector('.selected'); if(s) s.scrollIntoView({block:'center'}); }}
    },
    
    buildDropdowns: function() {
        const mL = document.getElementById('list-month'); 
        if(mL) { 
            mL.innerHTML = this.monthNames.map((m, i) => `<div class="list-item" data-idx="${i}">${m}</div>`).join('');
            // 🌟 التفويض الموضعي لخيارات الشهر
            if (!mL._boundDelegation) {
                mL.addEventListener('click', (e) => {
                    const item = e.target.closest('.list-item');
                    if (item) {
                        e.stopPropagation(); this.currMonth = parseInt(item.dataset.idx); this.render(); mL.classList.remove('active');
                    }
                });
                mL._boundDelegation = true;
            }
        }
        
        const yL = document.getElementById('list-year'); 
        if(yL) { 
            const ty=new Date().getFullYear(); 
            let yearsHtml = '';
            for(let y=ty-10;y<=ty+10;y++){ yearsHtml += `<div class="list-item" data-year="${y}">${y}</div>`; }
            yL.innerHTML = yearsHtml;
            // 🌟 التفويض الموضعي لخيارات السنة
            if (!yL._boundDelegation) {
                yL.addEventListener('click', (e) => {
                    const item = e.target.closest('.list-item');
                    if (item) {
                        e.stopPropagation(); this.currYear = parseInt(item.dataset.year); this.render(); yL.classList.remove('active');
                    }
                });
                yL._boundDelegation = true;
            }
        }
    },
    
    updateHighlights: function() {
        document.querySelectorAll('#list-month .list-item').forEach((el,i)=>el.classList.toggle('selected',i===this.currMonth));
        document.querySelectorAll('#list-year .list-item').forEach((el)=>el.classList.toggle('selected',parseInt(el.innerText)===this.currYear));
    }
};

// =========================================================
// 3️⃣ تجميع المكونات (مصدّرة كـ Module)
// =========================================================
export const Components = {
    priceTicker: null,
    _navObserver: null, // 🌟 تأمين مراقب الواجهة لمنع تسريب الذاكرة

    // 🌟 دالة نقية لاستخراج الكمية والباقة بعيداً عن تكرار الشروط
    _getCurrentSelection: function() {
        let qty = 1; let optIdx = null;
        if (!DataManager.currentProd) return { qty, optIdx };

        if (DataManager.currentProd.type === 'counter') {
            qty = parseFloat(document.getElementById('pm-qty')?.value) || 1;
        } else if (DataManager.currentProd.type === 'select') {
            const sel = document.getElementById('pm-pack');
            optIdx = sel ? Number(sel.value) : 0;
        } else if (DataManager.currentProd.type === 'simple' && DataManager.currentProd.allowQty) {
            qty = parseInt(document.getElementById('simple-qty-val')?.value) || 1;
        }
        return { qty, optIdx };
    },

    // 🌟 تأثير اللمعان للمنتجات
    initProductShine: function() {
        const cards = document.querySelectorAll('.product-card');
        
        cards.forEach((card) => {
            if (card.dataset.shineBound) return;
            card.dataset.shineBound = '1';
            
            const infoEl = card.querySelector('.card-info');
            if (!infoEl) return;

            card.triggerShine = () => {
                if (infoEl.classList.contains('shine-strong')) return;
                
                infoEl.classList.remove('shine-strong', 'shine-soft');
                void infoEl.offsetWidth; 
                infoEl.classList.add('shine-strong');
                
                setTimeout(() => {
                    if (infoEl.isConnected) infoEl.classList.remove('shine-strong');
                }, 2000); 
            };

            card.addEventListener('mouseenter', card.triggerShine);
        });
    },

    // 🌟 محرك الأنيميشن المالي المستقل
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
            
            // استخدام innerHTML و RenderHelpers للحفاظ على التنسيق البصري الفاخر
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
        if (!codeInput || !pasteIcon) return;
        if (codeInput.value.trim().length > 0) pasteIcon.classList.add('hide-element');
        else pasteIcon.classList.remove('hide-element');
    },

    pasteText: async function() {
        const codeInput = document.getElementById('couponCode');
        if (!codeInput) return;
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                codeInput.value = text;
                this.checkInputState(); 
                codeInput.focus();
                UIManager.showToast('تم إدراج الكوبون', 'success');
            }
        } catch (err) { UIManager.showToast('يرجى السماح باللصق', 'error'); }
    },

    // 🌟 Controller النظيف: يعتمد على الأرقام الحقيقية وليس على قراءة الشاشة
    applyCoupon: function() {
        if (!DataManager.currentProd) return; 

        // 🌟 تنبيه الضيف بضرورة تسجيل الدخول لاستخدام الكوبونات بدلاً من التجاهل الصامت
        if (!DataManager.user) {
            if (UIManager && typeof UIManager.showToast === 'function') {
                UIManager.showToast('يرجى تسجيل الدخول أولاً لاستخدام كوبونات الخصم', 'error');
            }
            if (UIManager && typeof UIManager.sfx === 'function') UIManager.sfx('error');
            return;
        }
        
        if (DataManager.appliedCoupon) { UIManager.showToast('يوجد كوبون مستخدم بالفعل', 'info'); return; }

        const codeInput = document.getElementById('couponCode');
        const msgBox = document.getElementById('couponMsg');
        const btnApply = document.getElementById('btnApply');
        const clearIcon = document.getElementById('clearIcon');
        const pasteIcon = document.getElementById('pasteIcon');

        if (!codeInput) return;
        const code = codeInput.value.toUpperCase().trim();

        if (!code) {
            if(msgBox) { msgBox.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> يرجى إدخال الكود`; msgBox.className = 'coupon-msg-box error'; msgBox.classList.remove('hide-element'); }
            return;
        }

        const selection = this._getCurrentSelection();
        const result = DataManager.validateCoupon(code, DataManager.currentProd, selection.qty, selection.optIdx);

        if (!result.valid) {
            if(msgBox) { 
                msgBox.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${Utils.escapeHtml(result.msg)}`; 
                msgBox.className = 'coupon-msg-box error'; 
                msgBox.classList.remove('hide-element'); 
                setTimeout(() => { msgBox.classList.add('hide-element'); }, 4000); 
            }
            UIManager.showToast(result.msg, 'error');
            if(UIManager.sfx) UIManager.sfx('error');
            return;
        }

        // 🌟 استخراج السعر بأمان من العقل المركزي قبل تطبيق الكوبون
        const prePricing = DataManager.getPricingLocal(DataManager.currentProd, selection.qty, selection.optIdx, null);
        const startVal = prePricing ? prePricing.totalLocalBase : 0;

        DataManager.appliedCoupon = result.coupon; 
        UIManager.updatePriceDisplay(); 
        
        // 🌟 استخراج السعر بعد تطبيق الكوبون
        const postPricing = DataManager.getPricingLocal(DataManager.currentProd, selection.qty, selection.optIdx, DataManager.appliedCoupon);
        const endVal = postPricing ? postPricing.totalLocalBase : 0;
        
        const currency = (DataManager.selectedCurr || DataManager.user.baseCurrency || 'USD');

        this.animatePriceChange(startVal, endVal, currency);
        if(UIManager.sfx) UIManager.sfx('success');

        const discountText = result.coupon.type === 'percentage' ? `${result.coupon.value}%` : `${result.coupon.value}$`;
        if(msgBox) { msgBox.innerHTML = `<i class="fa-solid fa-check"></i> تم تطبيق خصم ${discountText}!`; msgBox.className = 'coupon-msg-box success'; msgBox.classList.remove('hide-element'); }
        
        codeInput.disabled = true; 
        if(btnApply) { btnApply.disabled = true; btnApply.classList.add('btn-disabled'); }
        if(pasteIcon) pasteIcon.classList.add('hide-element'); 
        if(clearIcon) clearIcon.classList.remove('hide-element'); 

        UIManager.showToast('تم تطبيق الخصم بنجاح', 'success');
    },

    removeCoupon: function() {
        const codeInput = document.getElementById('couponCode');
        
        const selection = this._getCurrentSelection();
        
        // 🌟 استخراج السعر بأمان قبل الإزالة
        const prePricing = DataManager.getPricingLocal(DataManager.currentProd, selection.qty, selection.optIdx, DataManager.appliedCoupon);
        const startVal = prePricing ? prePricing.totalLocalBase : 0;

        if (UIManager.resetCouponUI) UIManager.resetCouponUI();
        DataManager.appliedCoupon = null; 
        
        UIManager.updatePriceDisplay(); 
        
        // 🌟 استخراج السعر بعد الإزالة
        const postPricing = DataManager.getPricingLocal(DataManager.currentProd, selection.qty, selection.optIdx, null);
        const endVal = postPricing ? postPricing.totalLocalBase : 0;
        
        const currency = (DataManager.selectedCurr || DataManager.user.baseCurrency || 'USD');

        this.animatePriceChange(startVal, endVal, currency);
        if (codeInput) {
            codeInput.disabled = false;
            codeInput.focus();
        }
    },

    initBottomNavSync: function() {
        const navIcons = document.querySelectorAll('.bottom-nav .nav-icon');
        function updateUIState() {
            setTimeout(() => {
                const gridTitle = document.getElementById('grid-title'); 
                const currentTitle = gridTitle ? gridTitle.innerText.trim() : '';
                const homeIcon = document.querySelector('.bottom-nav .nav-icon:nth-child(1)'); 
                const favIcon = document.querySelector('.bottom-nav .nav-icon:nth-child(3)');

                navIcons.forEach(icon => icon.classList.remove('active'));
                if (currentTitle === 'المفضلة') { if (favIcon) favIcon.classList.add('active'); } 
                else if (document.body.classList.contains('is-home')) { if (homeIcon) homeIcon.classList.add('active'); }
            }, 50);
        }

        const gridTitle = document.getElementById('grid-title'); 
        if (gridTitle) {
            // 🌟 إصلاح تسريب الذاكرة (Memory Leak): فصل المراقب القديم قبل إنشاء واحد جديد
            if (this._navObserver) {
                this._navObserver.disconnect();
            }
            this._navObserver = new MutationObserver(updateUIState);
            this._navObserver.observe(gridTitle, { characterData: true, childList: true, subtree: true });
        }

        navIcons.forEach(icon => {
            // إضافة الحماية من تكرار ربط الأحداث (Event Listener Duplication)
            if (icon.dataset.navBound) return;
            icon.dataset.navBound = '1';
            
            icon.addEventListener('click', function() {
                navIcons.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
            });
        });
        updateUIState();
    }
};
