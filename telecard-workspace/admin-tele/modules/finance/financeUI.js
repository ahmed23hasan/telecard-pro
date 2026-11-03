// ============================================================================
// 💰 وحدة المالية والإيداعات (modules/finance/financeUI.js) - Cloud-Native V19.5 💎
// 🚀 التحديث الأقصى (V19.5 - Currency Inputs Preservation & Cloud Drawer Resolver): 
// 1. Currency Row Selector Fix 🛡️: حفظ مدخلات العمولات والحدود عند تفعيل عملات متعددة في بوابة الدفع.
// 2. Cloud Deposit Fallback ☁️: جلب الإيداع سحابياً إذا فُتح من سجل العميل القديم خارج أول 50 إيداعاً.
// 3. Profile Avatar & Admin Tx Support 🖼️: دعم user.profileImage وتمييز القيود الإدارية المباشرة.
// 4. Double Escaping Fix 🐛: إصلاح تلف روابط الإيصالات والشعارات وصورة العميل وملاحظة الإدارة.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { FinanceTemplates } from './financeTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { UIService } from '../../core/uiService.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const FinanceUI = {
    currentDepositId: null,
    currentEditPaymentId: null,

    // ---------------------------------------------------------
    // 💵 1. نوافذ العملات (Currencies)
    // ---------------------------------------------------------
    openEditCurrency: function(id = null) {
        EventBus.emit('set-temp-edit-id', id);
        const cur = id ? (AdminData?.data?.ratesMap?.[id] || (AdminData?.data?.rates || []).find(r => r && r.code === id)) : null;
        
        let modal = document.getElementById('m-currency');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'm-currency';
            modal.className = 'modal-overlay dynamic-auto-destroy';
            document.body.appendChild(modal);
        }

        modal.innerHTML = FinanceTemplates.currencyEditModal();
        this.setupCurrencyModal(cur);
        void modal.offsetWidth;
        requestAnimationFrame(() => modal.classList.add('active'));
    },

    setupCurrencyModal: function(cur) {
        const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
        
        const titleEl = document.getElementById('cur-modal-title');
        if (titleEl) titleEl.innerHTML = cur ? '<i class="fa-solid fa-money-bill-transfer me-1"></i> تعديل عملة' : '<i class="fa-solid fa-money-bill-transfer me-1"></i> إضافة عملة جديدة'; 
        
        safeSetVal('cur-old-code', cur ? cur.code : '');
safeSetVal('cur-code', cur ? cur.code : '');
const codeInput = document.getElementById('cur-code');
if (codeInput) codeInput.disabled = Boolean(cur && cur.code);
safeSetVal('cur-name', cur ? cur.name : '');        safeSetVal('cur-symbol', cur ? cur.symbol : ''); 
        safeSetVal('cur-price-rate', cur ? cur.priceRate : ''); 
        safeSetVal('cur-dep-rate', cur ? cur.depRate : '');
    },

    // ---------------------------------------------------------
    // 🏦 2. نوافذ بوابات الدفع (Payment Gateways)
    // ---------------------------------------------------------
    openPaymentModal: function(id = null) {
        try {
            EventBus.emit('set-temp-edit-id', id);
            const pay = id ? (AdminData?.data?.payments || []).find(p => p && String(p.id) === String(id)) : null;
            const rates = AdminData?.data?.rates || [];
            
            let modal = document.getElementById('m-payment');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'm-payment';
                modal.className = 'modal-overlay dynamic-auto-destroy';
                document.body.appendChild(modal);
            }

            modal.innerHTML = FinanceTemplates.paymentEditModal();
            this.setupPaymentModal(pay, rates);
            
            void modal.offsetWidth;
            requestAnimationFrame(() => modal.classList.add('active'));
            
        } catch (error) {
            console.error("🚨 خطأ في فتح المودال:", error);
            alert("حدث خطأ:\n\n" + error.message);
        }
    },

    setupPaymentModal: function(p, rates) {
        const safeSetVal = (elId, val) => {
            const el = document.getElementById(elId);
            if (el) el.value = val || '';
        };
        
        const titleEl = document.getElementById('pay-modal-title');
        if (titleEl) titleEl.innerHTML = p ? '<i class="fa-solid fa-building-columns me-1"></i> تعديل طريقة الدفع' : '<i class="fa-solid fa-building-columns me-1"></i> إضافة طريقة دفع';
        
        safeSetVal('pay-name', p?.name || '');
        safeSetVal('pay-input-placeholder', p?.depositLabel || p?.inputPlaceholder || '');
        
        const proofChk = document.getElementById('pay-req-proof');
        if (proofChk) proofChk.checked = p ? (p.reqProof !== false) : true;
        
        AdminData.tempPayDetails = (p && Array.isArray(p.detailFields)) ?
            p.detailFields.map(item => (typeof item === 'object' && item !== null ? { ...item } : item)) :
            [];
        if (window.AdminRender && typeof window.AdminRender.renderPayDetailList === 'function') {
            window.AdminRender.renderPayDetailList(AdminData.tempPayDetails);
        }
        
        const curArr = (p && p.currencies && typeof p.currencies === 'string') ? p.currencies.split(',').map(c => c.trim().toUpperCase()) : [];
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
            list.querySelectorAll('.curr-setting-row, .currency-setting-row').forEach(row => {
                const code = row.dataset.code;
                if (!code) return;
                currentInputs[code] = {
                    feeType: row.querySelector(`[id^="pay-feetype-"]`)?.value || 'fee',
                    feeUnit: row.querySelector(`[id^="pay-feeunit-"]`)?.value || 'percent',
                    fee: row.querySelector(`[id^="pay-fee-"]`)?.value || '',
                    min: row.querySelector(`[id^="pay-min-"]`)?.value || '',
                    max: row.querySelector(`[id^="pay-max-"]`)?.value || '',
                    minFee: row.querySelector(`[id^="pay-minfee-"]`)?.value || '', 
                    maxFee: row.querySelector(`[id^="pay-maxfee-"]`)?.value || ''  
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
            else {
                const pay = payObj || (this.currentEditPaymentId && AdminData?.data?.payments ? AdminData.data.payments.find(p => p && String(p.id) === String(this.currentEditPaymentId)) : null);
                
                if (pay && pay.currencySettings && pay.currencySettings[code]) {
                    const s = pay.currencySettings[code];
                    ft = s.feeType || 'fee'; fu = s.feeUnit || s.unit || 'percent';
                    f = s.fee ?? ''; min = s.min ?? ''; max = s.max ?? '';
                    minFee = s.minFee ?? ''; maxFee = s.maxFee ?? ''; 
                } else if (pay && pay.currencies && typeof pay.currencies === 'string' && pay.currencies.includes(code)) { 
                    ft = pay.feeType || 'fee'; fu = pay.feeUnit || pay.unit || 'percent';
                    f = pay.fee ?? ''; min = pay.min ?? ''; max = pay.max ?? '';
                    minFee = pay.minFee ?? ''; maxFee = pay.maxFee ?? ''; 
                }
            }
            
            const displayCode = RenderHelpers.getCurrencySymbolText(code); 
            const safeDisplayCode = displayCode != null ? String(displayCode) : '';
            
            // 🚀 تم الإصلاح: إرسال المتغيرات كما هي بدون Utils.escapeHTML لمنع التشفير المزدوج للبيانات
            html += FinanceTemplates.currencySettingRow(
                code, 
                safeDisplayCode, 
                ft, fu, 
                f != null ? String(f) : '', 
                min != null ? String(min) : '', 
                max != null ? String(max) : '',
                minFee != null ? String(minFee) : '', 
                maxFee != null ? String(maxFee) : ''  
            );
        });
        
        list.innerHTML = html;

        chkBoxes.forEach(code => {
            const ftVal = currentInputs[code]?.feeType || document.getElementById(`pay-feetype-${code}`)?.getAttribute('data-val') || 'fee';
            const fuVal = currentInputs[code]?.feeUnit || document.getElementById(`pay-feeunit-${code}`)?.value || 'percent';
            
            const typeSel = document.getElementById(`pay-feetype-${code}`);
            const unitSel = document.getElementById(`pay-feeunit-${code}`);
            
            if (typeSel && ftVal) typeSel.value = ftVal;
            if (unitSel && fuVal) unitSel.value = fuVal;
        });
    },

    // ---------------------------------------------------------
    // 🧾 3. درج الإيداعات (Deposit Drawer)
    // ---------------------------------------------------------
    openDepositDrawer: async function(depositId) {
        const strId = String(depositId);
        let dep = AdminData?.data?.depositsMap?.[strId] || (AdminData?.data?.deposits || []).find(d => String(d.id) === strId);

        if (!dep) {
            if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(true, 'جاري جلب تفاصيل الإيداع سحابياً...');
            try {
                dep = await FirebaseAdapter.getById('telecard_deposits', strId);
                if (dep) {
                    if (!AdminData.data.depositsMap) AdminData.data.depositsMap = {};
                    AdminData.data.depositsMap[String(dep.id)] = dep;
                }
            } catch (e) {
                console.error("OpenDepositDrawer Cloud Fetch Error:", e);
            } finally {
                if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(false);
            }
        }

        if(!dep) {
            UIService?.showToast?.('تعذر العثور على تفاصيل هذا الإيداع.', 'error');
            return;
        }

        this.currentDepositId = dep.id;
        EventBus.emit('deposit-drawer-opened', dep.id);

        let drawerOverlay = document.getElementById('deposit-drawer-overlay');
        if (!drawerOverlay) {
            drawerOverlay = document.createElement('div');
            drawerOverlay.id = 'deposit-drawer-overlay';
            drawerOverlay.className = 'sys-overlay dynamic-auto-destroy'; 
            document.body.appendChild(drawerOverlay);
        }

        drawerOverlay.innerHTML = FinanceTemplates.depositDrawerModal();

        const bodyContent = document.getElementById('drawer-dep-body-content');
        const footerActions = document.getElementById('drawer-dep-footer-actions');
        const noteInput = document.getElementById('dep-drawer-note');
        const idBadge = document.getElementById('drawer-dep-id');

        if(!bodyContent || !footerActions) return;
        
        const scrollArea = drawerOverlay.querySelector('.drawer-scroll-area');
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

            const noteWrapper = noteInput.closest('.dr-card') || noteInput.parentElement; 
            if (dep.status === 'pending') noteWrapper.classList.remove('hide-element');
            else noteWrapper.classList.add('hide-element');
        }

        if(idBadge) {
            const formattedDepId = RenderHelpers.formatDepositId(dep);
            idBadge.innerHTML = formattedDepId;
            idBadge.className = 'drawer-dep-id-badge'; 
            idBadge.removeAttribute('data-action');
            idBadge.removeAttribute('data-copy-text');
            idBadge.title = "";
        }

        // 🚀 تم الإصلاح: عدم استخدام Utils.escapeHTML للروابط والبيانات الأولية لمنع التشفير المزدوج
        const user = AdminData.data.usersMap?.[dep.userId] || { id: dep.userId, displayId: dep.userDataSnapshot?.displayId };
        const displayUser = String(dep.userDataSnapshot?.fullName || dep.userName || user.fullName || user.name || user.username || 'مستخدم');
        const firstLetter = displayUser.replace('@', '').charAt(0).toUpperCase();
        const shortId = RenderHelpers.formatUserId(user);
        
        const userAvatarSrc = user.profileImage || user.img;
        const avatarHtml = AdminTemplates.drawerAvatar(userAvatarSrc || null, firstLetter);

        const rawBankMethod = dep.method || dep.methodName || 'إيداع';
        const isAdminManualMethod = (rawBankMethod === 'إيداع إداري' || rawBankMethod === 'خصم إداري' || dep.status === 'deducted');
        const bankName = String(rawBankMethod);
        const bankImgHtml = FinanceTemplates.drawerBankImg(dep.methodLogo || null);

        const payCurr = (dep.currency || dep.targetCurrency || 'USD').toUpperCase().replace('$', 'USD');
        const userBaseCurr = (user.baseCurrency || 'USD').toUpperCase().replace('$', 'USD');
        const targetCurr = (dep.targetCurrency || userBaseCurr || payCurr).toUpperCase().replace('$', 'USD');
        
        const feeType = dep.feeType || 'fee'; 
        const feeUnit = dep.feeUnit || dep.unit || dep.calcMethod || 'percent';
        const feeVal = Number(dep.feePct ?? dep.fee ?? 0);
        const feeAmount = Number(dep.feeAmount ?? (feeUnit === 'percent' ? (Number(dep.amount || 0) * (feeVal / 100)) : feeVal));
        
        const fxRate = Number(dep.fxRate || 1);
        const netBase = Number(dep.creditedAmount !== undefined ? dep.creditedAmount : (dep.amount || 0));

        const dateTxt = RenderHelpers.formatSafeDate(dep.time || dep.createdAt);
        const statusDict = { pending:'قيد المراجعة', approved:'مكتمل (تمت العملية)', deducted:'خصم إداري منفذ', rejected:'مرفوض', refunded:'تم استرجاع/إلغاء العملية' };
        const sText = statusDict[dep.status] || dep.status;
        const statusClass = (dep.status === 'approved') ? 'completed' : (dep.status === 'deducted' ? 'rejected' : dep.status); 

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

        // 🚀 تم الإصلاح: إرسال الرابط الأصلي للقالب حيث يتم تعقيمه هناك لمرة واحدة فقط
        let receiptHtml = '';
        if(dep.receipt) receiptHtml = FinanceTemplates.depositReceiptCard(dep.receipt);

        let replyHtml = '';
        const adminManualReply = dep.adminNote || ''; 
        if (adminManualReply && adminManualReply.trim() !== '') {
            replyHtml = AdminTemplates.adminReplyCard(adminManualReply, 'سبب الرفض / الملاحظة');
        }

        const isDeduction = netBase < 0 || dep.status === 'deducted';
        const absNetBase = Math.abs(netBase);
        
        let finalSign = '';
        let finalColorClass = '';
        let finalBgClass = '';
        
        if (dep.status === 'refunded') {
            finalSign = isDeduction ? '+' : '-';
            finalColorClass = isDeduction ? 'text-success' : 'text-danger'; 
            finalBgClass = isDeduction ? 'highlight-success' : 'highlight-danger';
        } else if (dep.status === 'approved' || dep.status === 'deducted') {
            finalSign = isDeduction ? '-' : '+';
            finalColorClass = isDeduction ? 'text-danger' : 'text-success';
            finalBgClass = isDeduction ? 'highlight-danger' : 'highlight-success';
        } else {
            finalSign = isDeduction ? '-' : '+';
            finalColorClass = dep.status === 'rejected' ? 'text-muted' : 'text-warning';
            finalBgClass = '';
        }

        const netBaseTxtText = `${finalSign} ${RenderHelpers.formatMoney(absNetBase, targetCurr, 2)}`;

        bodyContent.innerHTML = FinanceTemplates.depositDrawerBody({
            userId: String(dep.userId || '--'),
            userDisplayId: shortId,
            displayUser, avatarHtml, bankImgHtml, bankName,
            network: dep.network || null,
            amountTxt: RenderHelpers.formatMoney(Math.abs(dep.amount || 0), payCurr, 2),
            feeLabel, feeIcon, feeColorClass, feeNumClass, feeStr, feePctTxt, 
            netBaseTxt: netBaseTxtText,
            netColorClass: finalColorClass,
            netBgClass: finalBgClass,
            fxStr, statusClass, sText, dateTxt, receiptHtml, replyHtml
        });

        footerActions.innerHTML = FinanceTemplates.depositDrawerFooter(dep.status, dep.id, isDeduction, isAdminManualMethod);

        void drawerOverlay.offsetWidth;
        requestAnimationFrame(() => drawerOverlay.classList.add('active')); 
        
        setTimeout(() => {
            const sArea = drawerOverlay.querySelector('.drawer-scroll-area');
            const drawerPanel = drawerOverlay.firstElementChild; 
            if(sArea) { sArea.classList.add('overflow-y-hidden'); sArea.scrollTop = 0; sArea.classList.remove('overflow-y-hidden'); }
            if(drawerPanel) drawerPanel.scrollTop = 0;
            drawerOverlay.scrollTop = 0;
        }, 50);
    },  

    closeDepositDrawer: function() {
        if (window.AdminUI && window.AdminUI.closeModal) {
            window.AdminUI.closeModal('deposit-drawer-overlay');
        }
        this.currentDepositId = null;
        EventBus.emit('deposit-drawer-closed');
    },

    // ---------------------------------------------------------
    // 🛠️ 4. أدوات مساعدة إضافية
    // ---------------------------------------------------------
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
