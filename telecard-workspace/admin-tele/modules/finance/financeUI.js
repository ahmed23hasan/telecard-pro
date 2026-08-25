// ============================================================================
// 💰 وحدة المالية والإيداعات (modules/finance/financeUI.js) - النسخة الماسية V4.5 💎
// 🎯 الوظيفة: إدارة واجهات الإيداعات وإعدادات العملات وبوابات الدفع
// 🚀 التحديث الأقصى: معالجة تناسق الألوان والإشارات للإيداعات السلبية (Deductions)
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
        
        this.toggleCurrencySettings(p?.id || null, true);
        
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

    toggleCurrencySettings: function(paymentId, isInitialLoad = false) {
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
                    max: row.querySelector(`[id^="pay-max-"]`)?.value || ''
                };
            });
        }

        let html = '';
        chkBoxes.forEach(code => {
            let ft = 'fee', fu = 'percent', f = '', min = '', max = '';
            
            if (currentInputs[code]) {
                ft = currentInputs[code].feeType; fu = currentInputs[code].feeUnit;
                f = currentInputs[code].fee; min = currentInputs[code].min; max = currentInputs[code].max;
            } 
            else if (isInitialLoad && this.currentEditPaymentId && AdminData?.data?.payments) {
                const pay = AdminData.data.payments.find(p => p && String(p.id) === String(this.currentEditPaymentId));
                if (pay && pay.currencySettings && pay.currencySettings[code]) {
                    const s = pay.currencySettings[code];
                    ft = s.feeType || 'fee'; fu = s.feeUnit || s.unit || 'percent';
                    f = s.fee ?? ''; min = s.min ?? ''; max = s.max ?? '';
                } else if (pay && pay.currencies && typeof pay.currencies === 'string' && pay.currencies.includes(code)) { 
                    ft = pay.feeType || 'fee'; fu = pay.feeUnit || pay.unit || 'percent';
                    f = pay.fee ?? ''; min = pay.min ?? ''; max = pay.max ?? '';
                }
            }
            
            const displayCode = RenderHelpers.getCurrencySymbolText(code); 
            const safeDisplayCode = displayCode != null ? String(displayCode) : '';
            const safeF = f != null ? String(f) : '';
            const safeMin = min != null ? String(min) : '';
            const safeMax = max != null ? String(max) : '';

            html += AdminTemplates.currencySettingRow(
                code, 
                Utils.escapeHTML(safeDisplayCode), 
                ft, 
                fu, 
                Utils.escapeHTML(safeF), 
                Utils.escapeHTML(safeMin), 
                Utils.escapeHTML(safeMax)
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
            const formattedDepId = RenderHelpers.formatDepositId(dep);
            idBadge.innerText = formattedDepId;
            idBadge.classList.add('copyable-admin');
            idBadge.title = "انقر لنسخ المعرف";
            idBadge.onclick = function(e) { UIService.copyText(formattedDepId, e, this); };
        }

        const user = AdminData.data.usersMap?.[dep.userId] || (AdminData.data.users || []).find(u => u && String(u.id) === String(dep.userId)) || {};
        const displayUser = Utils.escapeHTML(user.fullName || user.name || user.username || 'مستخدم');
        const firstLetter = displayUser.replace('@', '').charAt(0).toUpperCase();

        const shortId = RenderHelpers.formatUserId(user);

        const avatarHtml = AdminTemplates.drawerAvatar(user.img ? Utils.escapeHTML(user.img) : null, firstLetter);

        const bankName = Utils.escapeHTML(dep.method || dep.methodName || 'إيداع');
        const safeLogo = Utils.escapeHTML(dep.methodLogo);
        const bankImgHtml = AdminTemplates.drawerBankImg(safeLogo);

        // 1. تحديد عملة الدفع
        const payCurr = (dep.currency || 'USD').toUpperCase().replace('$', 'USD');
        
        // 2. 🛡️ [الإصلاح الماسي]: إذا لم يرسل السيرفر targetCurrency، نستنتجها من عملة العميل
        const userBaseCurr = (user.baseCurrency || 'USD').toUpperCase().replace('$', 'USD');
        const targetCurr = (dep.targetCurrency || userBaseCurr || payCurr).toUpperCase().replace('$', 'USD');
        
        // 3. حساب الرسوم
        const feeType = dep.feeType || 'fee'; 
        const feeUnit = dep.feeUnit || dep.unit || dep.calcMethod || 'percent';
        const feeVal = Number(dep.feePct ?? dep.fee ?? 0);
        
        const feeAmount = Number(dep.feeAmount ?? (feeUnit === 'percent' ? (Number(dep.amount || 0) * (feeVal / 100)) : feeVal));
        
        let netPayCurr = Number(dep.amount || 0);
        if (feeType === 'bonus') netPayCurr += feeAmount; 
        else netPayCurr -= feeAmount; 

        // 4. 🛡️ [الدمج الماسي]: استنتاج سعر الصرف (مع حماية القيم السالبة وفخ الرقم 1)
        let fxRate = Number(dep.fxRate);
        if (!fxRate || isNaN(fxRate) || fxRate === 1) { // 👈 كشف الرقم 1 الوهمي
            if (dep.creditedAmount !== undefined && dep.creditedAmount !== null && netPayCurr !== 0) {
                // 👈 استخدام القيمة المطلقة لمنع أسعار الصرف السالبة
                fxRate = Math.abs(Number(dep.creditedAmount)) / Math.abs(netPayCurr);
            } else {
                fxRate = 1;
            }
        }

        // 5. حساب الصافي
        const netBase = Number((dep.creditedAmount !== undefined && dep.creditedAmount !== null) ? dep.creditedAmount : (netPayCurr * fxRate));

        const dateTxt = RenderHelpers.formatSafeDate(dep.time || dep.createdAt);
        
        const statusDict = { pending:'قيد المراجعة', approved:'مكتمل (تمت العملية)', rejected:'مرفوض', refunded:'تم استرجاع/إلغاء العملية' };
        const sText = statusDict[dep.status] || dep.status;
        const statusClass = dep.status === 'approved' ? 'completed' : dep.status; 

        // 6. 🛡️ [إضافتك العبقرية]: كتابة سعر الصرف بشكل منطقي وتجاهله إذا تطابقت العملات
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
