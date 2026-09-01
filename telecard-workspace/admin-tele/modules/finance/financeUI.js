// ============================================================================
// 💰 وحدة المالية والإيداعات (modules/finance/financeUI.js) - النسخة الماسية V4.6 💎
// 🎯 الوظيفة: إدارة واجهات الإيداعات وإعدادات العملات وبوابات الدفع
// 🚀 التحديث الأقصى: 
// 1. Safe State Mapping: تمرير الكائنات كمعاملات لمنع تضارب المتغيرات العامة (Race Conditions).
// 2. معالجة تناسق الألوان والإشارات للإيداعات السلبية، والاستجابة الفورية.
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
        const cur = id ? (AdminData?.data?.ratesMap?.[id] || (AdminData?.data?.rates || []).find(r => r && r.code === id)) : null;
        this.setupCurrencyModal(cur);
        EventBus.emit('req-open-modal', 'currency');
    },

    openPaymentModal: function(id = null) {
        try {
            EventBus.emit('set-temp-edit-id', id);
            const pay = id ? (AdminData?.data?.payments || []).find(p => p && String(p.id) === String(id)) : null;
            const rates = AdminData?.data?.rates || [];
            this.setupPaymentModal(pay, rates);
            EventBus.emit('req-open-modal', 'payment');
        } catch (error) {
            console.error("🚨 خطأ في فتح المودال:", error);
            alert("حدث خطأ:\n\n" + error.message);
        }
    },

    // ========================================================================
    // ⚙️ دوال تهيئة النوافذ (DOM Isolation)
    // ========================================================================

    setupPaymentModal: function(p, rates) {
        const safeSetVal = (elId, val) => {
            const el = document.getElementById(elId);
            if (el) el.value = val || '';
        };
        
        const titleEl = document.getElementById('pay-modal-title');
        if (titleEl) titleEl.innerText = p ? 'تعديل طريقة الدفع' : 'إضافة طريقة دفع';
        
        safeSetVal('pay-name', p?.name || '');
        safeSetVal('pay-input-placeholder', p?.depositLabel || p?.inputPlaceholder || '');
        
        const proofChk = document.getElementById('pay-req-proof');
        if (proofChk) proofChk.checked = p ? (p.reqProof !== false) : true;
        
        const curArr = (p && p.currencies && typeof p.currencies === 'string') ?
            p.currencies.split(',').map(c => c.trim().toUpperCase()) :
            [];
        
        const curSet = new Set(curArr);
        const chkContainer = document.querySelector('.pay-pro-currs');
        
        if (chkContainer && Array.isArray(rates)) {
            chkContainer.innerHTML = rates.map(r => {
                if (!r) return '';
                const displayCode = r.symbol || r.code;
                const isChecked = curSet.has(r.code) || (!p && r.code === 'USD');
                const safeCode = r.code != null ? String(r.code) : '';
                const safeName = r.name != null ? String(r.name) : '';
                const safeDisplayCode = displayCode != null ? String(displayCode) : '';

                return `<label class="pay-pro-chip">
                            <input type="checkbox" class="pay-curr-chk" value="${Utils.escapeHTML(safeCode)}" ${isChecked ? 'checked' : ''} data-action="toggle-currency-settings">
                            <span>${Utils.escapeHTML(safeName)} (${Utils.escapeHTML(safeDisplayCode)})</span>
                        </label>`;
            }).join('');
        }
        
        // 🚀 [لمسة الإبداع]: تمرير كائن (p) بشكل مباشر لمنع التضاربات مع الـ Global State
        this.toggleCurrencySettings(p?.id || null, true, p);
        
        const imgEl = document.getElementById('pay-img');
        const wrapEl = document.getElementById('pay-img-wrap');
        
        if (imgEl && wrapEl) {
            if (p?.img) {
                imgEl.src = p.img;
                imgEl.classList.remove('hide-element');
                wrapEl.classList.add('has-img');
            } else {
                imgEl.src = '';
                imgEl.classList.add('hide-element');
                wrapEl.classList.remove('has-img');
            }
        }
    },

    setupCurrencyModal: function(cur) {
        const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
        
        const titleEl = document.getElementById('cur-modal-title');
        if (titleEl) titleEl.innerText = cur ? 'تعديل عملة' : 'إضافة عملة جديدة'; 
        
        safeSetVal('cur-old-code', cur ? cur.code : ''); 
        safeSetVal('cur-code', cur ? cur.code : ''); 
        safeSetVal('cur-name', cur ? cur.name : ''); 
        safeSetVal('cur-symbol', cur ? cur.symbol : ''); 
        safeSetVal('cur-price-rate', cur ? cur.priceRate : ''); 
        safeSetVal('cur-dep-rate', cur ? cur.depRate : '');
    },

        toggleCurrencySettings: function(paymentId, isInitialLoad = false, payObj = null) {
        if (paymentId !== undefined) this.currentEditPaymentId = paymentId;
        
        const container = document.getElementById('currency-settings-container');
        const list = document.getElementById('currency-settings-list');
        if (!container || !list) return;

        const chkBoxes = Array.from(document.querySelectorAll('.pay-curr-chk:checked')).map(c => c.value);
        
        if(chkBoxes.length > 0) container.classList.remove('hide-element');
        else container.classList.add('hide-element');

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
                    max: row.querySelector(`[id^="pay-max-"]`)?.value || '',
                    minFee: row.querySelector(`[id^="pay-minfee-"]`)?.value || '', // 🚀 جديد
                    maxFee: row.querySelector(`[id^="pay-maxfee-"]`)?.value || ''  // 🚀 جديد
                };
            });
        }

        let html = '';
        chkBoxes.forEach(code => {
            let ft = 'fee', fu = 'percent', f = '', min = '', max = '', minFee = '', maxFee = '';
            
            if (currentInputs[code]) {
                ft = currentInputs[code].feeType; fu = currentInputs[code].feeUnit;
                f = currentInputs[code].fee; 
                min = currentInputs[code].min; max = currentInputs[code].max;
                minFee = currentInputs[code].minFee; maxFee = currentInputs[code].maxFee;
            } 
            else if (isInitialLoad) {
                const pay = payObj || (this.currentEditPaymentId && AdminData?.data?.payments ? AdminData.data.payments.find(p => p && String(p.id) === String(this.currentEditPaymentId)) : null);
                
                if (pay && pay.currencySettings && pay.currencySettings[code]) {
                    const s = pay.currencySettings[code];
                    ft = s.feeType || 'fee'; fu = s.feeUnit || s.unit || 'percent';
                    f = s.fee ?? ''; min = s.min ?? ''; max = s.max ?? '';
                    minFee = s.minFee ?? ''; maxFee = s.maxFee ?? ''; // 🚀 جديد
                } else if (pay && pay.currencies && typeof pay.currencies === 'string' && pay.currencies.includes(code)) { 
                    ft = pay.feeType || 'fee'; fu = pay.feeUnit || pay.unit || 'percent';
                    f = pay.fee ?? ''; min = pay.min ?? ''; max = pay.max ?? '';
                    minFee = pay.minFee ?? ''; maxFee = pay.maxFee ?? ''; // 🚀 جديد
                }
            }
            
            const displayCode = RenderHelpers.getCurrencySymbolText(code); 
            const safeDisplayCode = displayCode != null ? String(displayCode) : '';
            
            html += AdminTemplates.currencySettingRow(
                code, 
                Utils.escapeHTML(safeDisplayCode), 
                ft, fu, 
                Utils.escapeHTML(f != null ? String(f) : ''), 
                Utils.escapeHTML(min != null ? String(min) : ''), 
                Utils.escapeHTML(max != null ? String(max) : ''),
                Utils.escapeHTML(minFee != null ? String(minFee) : ''), // 🚀 جديد
                Utils.escapeHTML(maxFee != null ? String(maxFee) : '')  // 🚀 جديد
            );
        });
        
        list.innerHTML = html;

        chkBoxes.forEach(code => {
            const ftVal = currentInputs[code]?.feeType || (isInitialLoad ? document.getElementById(`pay-feetype-${code}`)?.getAttribute('data-val') : 'fee');
            const fuVal = currentInputs[code]?.feeUnit || (isInitialLoad ? document.getElementById(`pay-feeunit-${code}`)?.value : 'percent');
            
            const typeSel = document.getElementById(`pay-feetype-${code}`);
            const unitSel = document.getElementById(`pay-feeunit-${code}`);
            
            if (typeSel && ftVal) typeSel.value = ftVal;
            if (unitSel && fuVal) unitSel.value = fuVal;
        });
    },
 // ========================================================================
    // 📂 إدارة درج الإيداعات (Drawer)
    // ========================================================================

    openDepositDrawer: function(depositId) {
        let dep = null;
        if(AdminData && AdminData.data && AdminData.data.depositsMap) {
            dep = AdminData.data.depositsMap[depositId];
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
            
            if (!noteInput.hasAttribute('data-events-bound')) {
                noteInput.setAttribute('data-events-bound', 'true');
                noteInput.addEventListener('focus', function() {
                    const drawerContainer = document.querySelector('#deposit-drawer');
                    if(drawerContainer) drawerContainer.classList.add('typing-mode');
                    setTimeout(() => { this.scrollIntoView({ behavior: 'auto', block: 'nearest' }); }, 300); 
                });
                noteInput.addEventListener('blur', function() {
                    const drawerContainer = document.querySelector('#deposit-drawer');
                    if(drawerContainer) drawerContainer.classList.remove('typing-mode');
                });
            }

            const noteWrapper = noteInput.parentElement; 
            if (dep.status === 'pending') noteWrapper.classList.remove('hide-element');
            else noteWrapper.classList.add('hide-element');
        }

        if(idBadge) {
            const formattedDepId = RenderHelpers.formatDepositId(dep);
            idBadge.innerText = formattedDepId;
            idBadge.classList.add('copyable-admin');
            idBadge.title = "انقر لنسخ المعرف";
            
            idBadge.onclick = null; 
            idBadge.setAttribute('data-action', 'copy-text');
            idBadge.setAttribute('data-copy-text', formattedDepId);
        }

        const user = AdminData.data.usersMap?.[dep.userId] || (AdminData.data.users || []).find(u => u && String(u.id) === String(dep.userId)) || {};
        const displayUser = Utils.escapeHTML(user.fullName || user.name || user.username || 'مستخدم');
        const firstLetter = displayUser.replace('@', '').charAt(0).toUpperCase();

        const shortId = RenderHelpers.formatUserId(user);

        const avatarHtml = AdminTemplates.drawerAvatar(user.img ? Utils.escapeHTML(user.img) : null, firstLetter);

        const bankName = Utils.escapeHTML(dep.method || dep.methodName || 'إيداع');
        const safeLogo = Utils.escapeHTML(dep.methodLogo);
        const bankImgHtml = AdminTemplates.drawerBankImg(safeLogo);

        const payCurr = (dep.currency || 'USD').toUpperCase().replace('$', 'USD');
        const userBaseCurr = (user.baseCurrency || 'USD').toUpperCase().replace('$', 'USD');
        const targetCurr = (dep.targetCurrency || userBaseCurr || payCurr).toUpperCase().replace('$', 'USD');
        
        const feeType = dep.feeType || 'fee'; 
        const feeUnit = dep.feeUnit || dep.unit || dep.calcMethod || 'percent';
        const feeVal = Number(dep.feePct ?? dep.fee ?? 0);
        
        const feeAmount = Number(dep.feeAmount ?? (feeUnit === 'percent' ? (Number(dep.amount || 0) * (feeVal / 100)) : feeVal));
        
        let netPayCurr = Number(dep.amount || 0);
        if (feeType === 'bonus') netPayCurr += feeAmount; 
        else netPayCurr -= feeAmount; 

        let fxRate = Number(dep.fxRate);
        if (!fxRate || isNaN(fxRate) || fxRate === 1) { 
            if (dep.creditedAmount !== undefined && dep.creditedAmount !== null && netPayCurr !== 0) {
                fxRate = Math.abs(Number(dep.creditedAmount)) / Math.abs(netPayCurr);
            } else {
                fxRate = 1;
            }
        }

        const netBase = Number((dep.creditedAmount !== undefined && dep.creditedAmount !== null) ? dep.creditedAmount : (netPayCurr * fxRate));

        const dateTxt = RenderHelpers.formatSafeDate(dep.time || dep.createdAt);
        
        const statusDict = { pending:'قيد المراجعة', approved:'مكتمل (تمت العملية)', rejected:'مرفوض', refunded:'تم استرجاع/إلغاء العملية' };
        const sText = statusDict[dep.status] || dep.status;
        const statusClass = dep.status === 'approved' ? 'completed' : dep.status; 

        const payCurrSymbol = RenderHelpers.getCurrencySymbolText(payCurr);
        const fxStr = (payCurr !== targetCurr && fxRate !== 1) 
            ? `1 ${payCurrSymbol} = ${RenderHelpers.formatMoney(fxRate, targetCurr, 4)}` 
            : '1 : 1';
            
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
            userDisplayId: Utils.escapeHTML(shortId),
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
