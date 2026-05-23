// ============================================================================
// 💰 وحدة المالية والإيداعات (modules/finance/financeUI.js)
// 🎯 الوظيفة: إدارة واجهات الإيداعات وإعدادات العملات وبوابات الدفع
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { UIService } from '../../core/uiService.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

export const FinanceUI = {
    currentDepositId: null,
    currentEditPaymentId: null,

    // ========================================================================
    // 🪟 دوال فتح النوافذ 
    // ========================================================================

    openEditCurrency: function(id = null) {
        EventBus.emit('set-temp-edit-id', id);
        const cur = id ? (AdminData.data.rates || []).find(r => r.code === id) : null;
        this.setupCurrencyModal(cur);
        EventBus.emit('req-open-modal', 'currency');
    },

    openPaymentModal: function(id = null) {
        EventBus.emit('set-temp-edit-id', id);
        const pay = id ? (AdminData.data.payments || []).find(p => String(p.id) === String(id)) : null;
        const rates = AdminData.data.rates || [];
        this.setupPaymentModal(pay, rates);
        EventBus.emit('req-open-modal', 'payment');
    },

    // ========================================================================
    // ⚙️ دوال تهيئة النوافذ (DOM Isolation)
    // ========================================================================

    setupPaymentModal: function(p, rates) {
        const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
        document.getElementById('pay-modal-title').innerText = p ? 'تعديل طريقة الدفع' : 'إضافة طريقة دفع';
        safeSetVal('pay-name', p ? p.name : '');
        safeSetVal('pay-input-placeholder', p ? (p.depositLabel || p.inputPlaceholder || '') : '');
        if(document.getElementById('pay-req-proof')) document.getElementById('pay-req-proof').checked = p ? (p.reqProof !== false) : true; 
        
        const curArr = (p && p.currencies) ? p.currencies.split(',').map(c=>c.trim().toUpperCase()) : [];
        const curSet = new Set(curArr);
        const chkContainer = document.querySelector('.pay-pro-currs'); 
        
        if (chkContainer) {
            chkContainer.innerHTML = rates.map(r => {
                const displayCode = r.symbol || r.code;
                return `<label class="pay-pro-chip"><input type="checkbox" class="pay-curr-chk" value="${r.code}" ${curSet.has(r.code) || (!p && r.code === 'USD') ? 'checked' : ''} data-action="toggle-currency-settings"><span>${r.name} (${displayCode})</span></label>`;
            }).join('');
        }
        
        this.toggleCurrencySettings(p ? p.id : null, true); // إجبار إعادة التهيئة

        const imgEl = document.getElementById('pay-img'); const wrapEl = document.getElementById('pay-img-wrap');
        if (p && p.img && imgEl && wrapEl) { imgEl.src = p.img; imgEl.classList.remove('hide-element'); wrapEl.classList.add('has-img'); } 
        else if (imgEl && wrapEl) { imgEl.src = ''; imgEl.classList.add('hide-element'); wrapEl.classList.remove('has-img'); }
    },

    setupCurrencyModal: function(cur) {
        const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
        document.getElementById('cur-modal-title').innerText = cur ? 'تعديل عملة' : 'إضافة عملة جديدة'; 
        safeSetVal('cur-old-code', cur ? cur.code : ''); 
        safeSetVal('cur-code', cur ? cur.code : ''); 
        safeSetVal('cur-name', cur ? cur.name : ''); 
        safeSetVal('cur-symbol', cur ? cur.symbol : ''); 
        safeSetVal('cur-price-rate', cur ? cur.priceRate : ''); 
        safeSetVal('cur-dep-rate', cur ? cur.depRate : '');
    },

    toggleCurrencySettings: function(paymentId, isInitialLoad = false) {
        if (paymentId !== undefined) this.currentEditPaymentId = paymentId;
        
        const container = document.getElementById('currency-settings-container');
        const list = document.getElementById('currency-settings-list');
        if (!container || !list) return;

        const chkBoxes = Array.from(document.querySelectorAll('.pay-curr-chk:checked')).map(c => c.value);
        
        if(chkBoxes.length > 0) container.classList.remove('hide-element');
        else container.classList.add('hide-element');

        // 🌟 الإصلاح الذكي للحفاظ على القيم أثناء التبديل
        const currentInputs = {};
        if (!isInitialLoad) {
            list.querySelectorAll('.currency-setting-row').forEach(row => {
                const code = row.dataset.code;
                if (!code) return;
                currentInputs[code] = {
                    feeType: row.querySelector(`[id^="pay-feetype-"]`)?.value || 'fee',
                    feeUnit: row.querySelector(`[id^="pay-feeunit-"]`)?.value || 'percent',
                    fee: row.querySelector(`[id^="pay-fee-"]`)?.value || '',
                    min: row.querySelector(`[id^="pay-min-"]`)?.value || '',
                    max: row.querySelector(`[id^="pay-max-"]`)?.value || ''
                };
            });
        }

        let html = '';
        chkBoxes.forEach(code => {
            let ft = 'fee', fu = 'percent', f = '', min = '', max = '';
            
            // 1. جلب القيم الموجودة في الـ HTML (لو العميل يكتب حالياً)
            if (currentInputs[code]) {
                ft = currentInputs[code].feeType; fu = currentInputs[code].feeUnit;
                f = currentInputs[code].fee; min = currentInputs[code].min; max = currentInputs[code].max;
            } 
            // 2. إذا لم يكن يكتب، اجلبها من قاعدة البيانات (فقط عند التهيئة الأولى)
            else if (isInitialLoad && this.currentEditPaymentId && AdminData?.data?.payments) {
                const pay = AdminData.data.payments.find(p => String(p.id) === String(this.currentEditPaymentId));
                if (pay && pay.currencySettings && pay.currencySettings[code]) {
                    const s = pay.currencySettings[code];
                    ft = s.feeType || 'fee'; fu = s.feeUnit || s.unit || 'percent';
                    f = s.fee || ''; min = s.min || ''; max = s.max || '';
                } else if (pay && pay.currencies && pay.currencies.includes(code)) { // التوافق مع القديم
                    ft = pay.feeType || 'fee'; fu = pay.feeUnit || pay.unit || 'percent';
                    f = pay.fee || ''; min = pay.min || ''; max = pay.max || '';
                }
            }
            
            const displayCode = RenderHelpers.getCurrencySymbolText(code); 
            html += AdminTemplates.currencySettingRow(code, Utils.escapeHTML(displayCode), ft, fu, Utils.escapeHTML(f), Utils.escapeHTML(min), Utils.escapeHTML(max));
        });
        
                // ... (الجزء العلوي من الدالة كما هو)
        list.innerHTML = html;

        // 🌟 الإصلاح الاحترافي: التنفيذ المتزامن الفوري (بدون setTimeout)
        chkBoxes.forEach(code => {
            const ftVal = currentInputs[code]?.feeType || (isInitialLoad ? document.getElementById(`pay-feetype-${code}`)?.getAttribute('data-val') : 'fee');
            const fuVal = currentInputs[code]?.feeUnit || (isInitialLoad ? document.getElementById(`pay-feeunit-${code}`)?.getAttribute('data-val') : 'percent');
            
            const typeEl = document.getElementById(`pay-feetype-${code}`);
            const unitEl = document.getElementById(`pay-feeunit-${code}`);
            
            if (typeEl && ftVal) typeEl.value = ftVal;
            if (unitEl && fuVal) unitEl.value = fuVal;
        });
    }, // نهاية دالة toggleCurrencySettings

    // ========================================================================
    // 📂 إدارة درج الإيداعات (Drawer)
    // ========================================================================

        openDepositDrawer: function(depositId) {
        let dep = null;
        if(AdminData && AdminData.data && AdminData.data.deposits) {
            dep = AdminData.data.deposits.find(d => String(d.id) === String(depositId));
        }
        if(!dep) return;

        this.currentDepositId = dep.id;
        EventBus.emit('deposit-drawer-opened', dep.id);

        const drawer = document.getElementById('deposit-drawer-overlay');
        const bodyContent = document.getElementById('drawer-dep-body-content');
        const footerActions = document.getElementById('drawer-dep-footer-actions');
        const noteInput = document.getElementById('dep-drawer-note');
        const idBadge = document.getElementById('drawer-dep-id');

        if(!drawer || !bodyContent || !footerActions) return;
        
        const scrollArea = drawer.querySelector('.drawer-scroll-area');
        if(scrollArea) scrollArea.scrollTop = 0;

        if(noteInput) {
            noteInput.value = ''; 
            noteInput.onfocus = function() {
                const drawerContainer = document.querySelector('#deposit-drawer');
                if(drawerContainer) drawerContainer.classList.add('typing-mode');
                setTimeout(() => { this.scrollIntoView({ behavior: 'auto', block: 'nearest' }); }, 300); 
            };
            noteInput.onblur = function() {
                const drawerContainer = document.querySelector('#deposit-drawer');
                if(drawerContainer) drawerContainer.classList.remove('typing-mode');
            };

            const noteWrapper = noteInput.parentElement; 
            if (dep.status === 'pending') noteWrapper.classList.remove('hide-element');
            else noteWrapper.classList.add('hide-element');
        }

        if(idBadge) {
            idBadge.innerText = `#${dep.id}`;
            idBadge.classList.add('copyable-admin');
            idBadge.title = "انقر لنسخ المعرف";
            idBadge.onclick = function(e) { UIService.copyText(dep.id, e, this); };
        }

        const user = (AdminData.data.users || []).find(u => String(u.id) === String(dep.userId)) || {};
        const displayUser = Utils.escapeHTML(user.fullName || user.name || user.username || 'مستخدم');
        const firstLetter = displayUser.replace('@', '').charAt(0).toUpperCase();

        // 🌟 استخراج العميل والرقم القصير لتمريره للدرج
        const shortId = user.displayId || (dep.userId ? String(dep.userId).substring(0, 6) : '---');

        const avatarHtml = AdminTemplates.drawerAvatar(user.img ? Utils.escapeHTML(user.img) : null, firstLetter);

        const bankName = Utils.escapeHTML(dep.method || dep.methodName || 'إيداع');
        const safeLogo = Utils.escapeHTML(dep.methodLogo);
        const bankImgHtml = AdminTemplates.drawerBankImg(safeLogo);

        const payCurr = (dep.currency || 'USD').toUpperCase().replace('$', 'USD');
        const targetCurr = (dep.targetCurrency || payCurr).toUpperCase().replace('$', 'USD');
        
        const feeType = dep.feeType || 'fee'; 
        const feeUnit = dep.feeUnit || dep.unit || dep.calcMethod || 'percent';
        const feeVal = Number(dep.feePct ?? dep.fee ?? 0);
        
        const feeAmount = Number(dep.feeAmount ?? (feeUnit === 'percent' ? (Number(dep.amount || 0) * (feeVal / 100)) : feeVal));
        
        let netPayCurr = Number(dep.amount || 0);
        if (feeType === 'bonus') netPayCurr += feeAmount; 
        else netPayCurr -= feeAmount; 

        const fxRate = Number(dep.fxRate ?? 1);
        const netBase = Number((dep.creditedAmount !== undefined && dep.creditedAmount !== null) ? dep.creditedAmount : (netPayCurr * fxRate));

        const dateObj = dep.time ? new Date(dep.time) : new Date();
        const dateTxt = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' | ' + dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        const statusDict = { pending:'قيد المراجعة', approved:'مكتمل (تمت العملية)', rejected:'مرفوض', refunded:'تم استرجاع/إلغاء العملية' };
        const sText = statusDict[dep.status] || dep.status;
        const statusClass = dep.status === 'approved' ? 'completed' : dep.status; 

        let feeLabel = '';
        let feeIcon = '';
        let feeColorClass = '';
        let feeStr = '';
        let feeNumClass = '';
        
        const feePctTxt = (feeVal > 0 && feeUnit === 'percent') ? `(${Utils.enNum(feeVal, 2)}%)` : ''; 

        if (feeAmount === 0 && feeVal === 0) {
            feeLabel = 'الرسوم الإضافية';
            feeIcon = 'fa-minus-circle';
            feeColorClass = 'text-muted';
            feeStr = 'بدون رسوم';
        } 
        else if (feeType === 'bonus') {
            feeLabel = feeUnit === 'fixed' ? 'بونص إضافي (مبلغ ثابت)' : 'بونص إضافي (هدية)';
            feeIcon = 'fa-gift';
            feeColorClass = 'text-success';
            feeNumClass = 'num-en';
            feeStr = `+ ${RenderHelpers.formatMoney(feeAmount, payCurr, 2)}`;
        } 
        else {
            feeLabel = feeUnit === 'fixed' ? 'عمولة التحويل (مبلغ ثابت)' : 'عمولة التحويل / الشبكة';
            feeIcon = 'fa-arrow-trend-down';
            feeColorClass = 'text-danger';
            feeNumClass = 'num-en';
            feeStr = `- ${RenderHelpers.formatMoney(feeAmount, payCurr, 2)}`;
        }

        const baseCurrText = RenderHelpers.getCurrencySymbolText('USD');
        const fxStr = dep.fxRate ? `1 ${baseCurrText} = ${RenderHelpers.formatMoney(dep.fxRate, targetCurr, 4)}` : '1 : 1';
        
        let receiptHtml = '';
        if(dep.receipt) receiptHtml = AdminTemplates.depositReceiptCard(Utils.escapeHTML(dep.receipt));

        let replyHtml = '';
        const adminManualReply = dep.adminNote || ''; 
        if (adminManualReply && adminManualReply.trim() !== '') {
            replyHtml = AdminTemplates.adminReplyCard(Utils.escapeHTML(adminManualReply), 'سبب الرفض / الملاحظة');
        }

        const isDeduction = netBase < 0;
        const absNetBase = Math.abs(netBase);
        let finalSign = '';
        let finalColorClass = '';
        let finalBgClass = '';

        if (dep.status === 'refunded') {
            finalSign = isDeduction ? '+' : '-';
            finalColorClass = isDeduction ? 'text-success' : 'text-danger';
            finalBgClass = isDeduction ? 'highlight-success' : 'highlight-danger';
        } else if (dep.status === 'approved') {
            finalSign = isDeduction ? '-' : '+';
            finalColorClass = isDeduction ? 'text-danger' : 'text-success';
            finalBgClass = isDeduction ? 'highlight-danger' : 'highlight-success';
        } else {
            finalSign = isDeduction ? '-' : '+';
            finalColorClass = dep.status === 'rejected' ? 'text-muted' : 'text-warning';
            finalBgClass = '';
        }

        const netBaseTxtText = `${finalSign} ${RenderHelpers.formatMoney(absNetBase, targetCurr, 2)}`;

        bodyContent.innerHTML = AdminTemplates.depositDrawerBody({
            userId: Utils.escapeHTML(dep.userId || '--'),
            userDisplayId: Utils.escapeHTML(shortId), // 🌟 تمرير الرقم القصير هنا
            displayUser, avatarHtml, bankImgHtml, bankName,
            network: dep.network ? Utils.escapeHTML(dep.network) : null,
            amountTxt: RenderHelpers.formatMoney(Math.abs(dep.amount || 0), payCurr, 2),
            feeLabel, feeIcon, feeColorClass, feeNumClass, feeStr, feePctTxt, 
            netBaseTxt: netBaseTxtText,
            netColorClass: finalColorClass,
            netBgClass: finalBgClass,
            fxStr, statusClass, sText, dateTxt, receiptHtml, replyHtml
        });

        footerActions.innerHTML = AdminTemplates.depositDrawerFooter(dep.status, dep.id, isDeduction);

        drawer.classList.add('active'); 
        
        setTimeout(() => {
            const scrollArea = drawer.querySelector('.drawer-scroll-area');
            const drawerPanel = drawer.firstElementChild; 
            if(scrollArea) { scrollArea.style.overflowY = 'hidden'; scrollArea.scrollTop = 0; scrollArea.style.overflowY = 'auto'; }
            if(drawerPanel) drawerPanel.scrollTop = 0;
            drawer.scrollTop = 0;
        }, 50);
    },

    closeDepositDrawer: function() {
        const drawer = document.getElementById('deposit-drawer-overlay');
        if (drawer) drawer.classList.remove('active');
        this.currentDepositId = null;
        EventBus.emit('deposit-drawer-closed');
    },

    getCheckedCurrencies: function() {
        return Array.from(document.querySelectorAll('.pay-curr-chk:checked')).map(c => c.value.toUpperCase());
    },

    hasImage: function(wrapperId) {
        const wrap = document.getElementById(wrapperId);
        return wrap ? wrap.classList.contains('has-img') : false;
    },

    clearPayDetailInput: function() {
        const input = document.getElementById('pay-det-input');
        if (input) {
            input.value = '';
            input.focus();
        }
    }
};
