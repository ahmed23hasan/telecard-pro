// ============================================================================
// 🧠 متحكم المالية (modules/finance/financeController.js)
// الوظيفة: معالجة العمليات المنطقية (Business Logic) للإيداعات، بوابات الدفع، والعملات.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';
import { normalizeRates } from '../../adminConfig.js';

export const FinanceController = {

    // =========================================================
    // 💳 1. إدارة بوابات الدفع (Payment Gateways)
    // =========================================================
    savePay: async function() {
        const checks = AdminUI?.FinanceUI?.getCheckedCurrencies?.() || [];
        let currSettings = {};
        let summaryMsg = 'يرجى مراجعة إعدادات الرسوم والبونص قبل الحفظ:\n\n';

        checks.forEach(code => {
            const fType = Utils.getVal(`pay-feetype-${code}`) || 'fee';
            const fVal = parseFloat(Utils.getVal(`pay-fee-${code}`)) || 0;
            const fUnit = Utils.getVal(`pay-feeunit-${code}`) || 'percent';
            
            currSettings[code] = {
                feeType: fType,
                fee: fVal,
                feeUnit: fUnit,
                min: parseFloat(Utils.getVal(`pay-min-${code}`)) || 0,
                max: parseFloat(Utils.getVal(`pay-max-${code}`)) || 0
            };

            const displayCode = AdminRender?.getCurrencySymbolText?.(code) || code;
            const typeText = fType === 'bonus' ? 'يمنح بونص إضافي (+)' : 'يخصم عمولة (-)';
            const unitText = fUnit === 'fixed' ? '(مبلغ ثابت)' : '(نسبة مئوية %)';
            summaryMsg += `• عملة ${displayCode}: ${typeText} بقيمة ${fVal} ${unitText}\n`;
        });

        if (checks.length > 0 && AdminUI && !await AdminUI.showConfirm(summaryMsg, 'تأكيد الحسبة المالية للبوابة')) return;

        const hasImg = AdminUI?.FinanceUI?.hasImage?.('pay-img-wrap');
        const oldImg = AppController.tempEditId ? AdminData.data.payments.find(p => String(p.id) === String(AppController.tempEditId))?.img : null;
        const finalImg = hasImg ? (AppController.tempImg || oldImg || '') : '';

        const existingPay = AppController.tempEditId ? AdminData.data.payments.find(p => String(p.id) === String(AppController.tempEditId)) : null;
        const currentActiveState = existingPay ? (existingPay.isActive !== false) : true;

        const newPay = {
            id: AppController.tempEditId || String(Date.now()),
            name: Utils.escapeHTML(Utils.getVal('pay-name')),
            detailFields: AppController.tempPayDetails || [],
            currencies: checks.join(',') || 'USD',
            currencySettings: currSettings,
            inputPlaceholder: Utils.escapeHTML(Utils.getVal('pay-input-placeholder')),
            reqProof: Utils.getCheck('pay-req-proof'),
            img: finalImg,
            isActive: currentActiveState
        };

        const isEdit = !!AppController.tempEditId;
        if (isEdit) {
            const idx = AdminData.data.payments.findIndex(p => String(p.id) === String(AppController.tempEditId));
            if (idx > -1) AdminData.data.payments[idx] = newPay;
        } else {
            AdminData.data.payments.push(newPay);
        }

        await AdminData?.savePayments?.();
        AppController.finishAction('req-render-payments', null, isEdit ? 'EDIT_PAYMENT' : 'ADD_PAYMENT', `تم ${isEdit ? 'تعديل' : 'إضافة'} وسيلة الدفع: ${newPay.name}`, 'تم حفظ طريقة الدفع بنجاح');
    },

    togglePaymentStatus: async function(id, isActive) {
        const p = AdminData.data.payments.find(x => String(x.id) === String(id));
        if (p) {
            p.isActive = !!isActive;
            await AdminData?.savePayments?.();
            AdminData?.addLog?.('TOGGLE_PAYMENT', `تم ${isActive ? 'تفعيل' : 'إيقاف'} وسيلة الدفع: ${p.name}`);
            EventBus.emit('req-render-payments');
            EventBus.emit('req-show-toast', { message: isActive ? 'تم تفعيل وسيلة الدفع للمشترين' : 'تم إيقاف وسيلة الدفع مؤقتاً', type: isActive ? 'success' : 'warning' });
        }
    },

    addPayDetail: function() {
        const val = Utils.escapeHTML(Utils.getVal('pay-det-input'));
        const copyCheck = Utils.getCheck('pay-det-copyable');
        if (val) {
            if (!Array.isArray(AppController.tempPayDetails)) AppController.tempPayDetails = [];
            AppController.tempPayDetails.push({ text: val, copyable: copyCheck });
            AdminRender?.renderPayDetailList?.(AppController.tempPayDetails);
            AdminUI?.FinanceUI?.clearPayDetailInput?.();
        } else {
            EventBus.emit('req-show-toast', { message: 'يرجى كتابة نص أولاً', type: 'warning' });
        }
    },

    removePayDetail: function(index) {
        if (AppController.tempPayDetails && Array.isArray(AppController.tempPayDetails) && index >= 0 && index < AppController.tempPayDetails.length) {
            AppController.tempPayDetails.splice(index, 1);
            AdminRender?.renderPayDetailList?.(AppController.tempPayDetails);
        }
    },

    // =========================================================
    // 💱 2. إدارة أسعار الصرف (Currencies & Rates)
    // =========================================================
    saveRates: async function() {
        AdminData.data.rates = normalizeRates({
            pricing: {
                USD_TRY: parseFloat(Utils.getVal('r-price-usd-try', 35)),
                USD_SYP: parseFloat(Utils.getVal('r-price-usd-syp', 15500))
            },
            deposit: {
                USD_TRY: parseFloat(Utils.getVal('r-dep-usd-try', 34)),
                USD_SYP: parseFloat(Utils.getVal('r-dep-usd-syp', 15000))
            }
        });
        await AdminData?.saveRates?.();
        AppController.finishAction(null, null, 'UPDATE_RATES', `تم تحديث أسعار الصرف للعملات`, 'تم حفظ أسعار الصرف بنجاح');
    },

    changeCurrencyDisplay: async function(val) {
        if (!AdminData.data.settings) AdminData.data.settings = {};
        AdminData.data.settings.currencyDisplay = val;
        await AdminData?.saveSystemSettings?.();
        EventBus.emit('req-show-toast', { message: 'تم تحديث طريقة عرض العملات بنجاح', type: 'success' });
        EventBus.emit('req-render-rates');
        EventBus.emit('req-render-sales');
    },

    saveCurrency: async function() {
        const oldCode = Utils.getVal('cur-old-code');
        const code = Utils.getVal('cur-code').toUpperCase();
        const name = Utils.escapeHTML(Utils.getVal('cur-name'));
        const symbol = Utils.escapeHTML(Utils.getVal('cur-symbol'));
        const rawPriceRate = Utils.getVal('cur-price-rate');
        const rawDepRate = Utils.getVal('cur-dep-rate');

        if (!code || !name) {
            EventBus.emit('req-show-toast', { message: 'تنبيه: يرجى إدخال رمز واسم العملة بشكل صحيح.', type: 'warning' });
            return;
        }

        if (code === 'USD') {
            EventBus.emit('req-show-toast', { message: 'إجراء مرفوض: لا يمكن تعديل الدولار كونه العملة المرجعية الأساسية للنظام.', type: 'error' });
            return;
        }

        if (rawPriceRate === '' || rawDepRate === '') {
            EventBus.emit('req-show-toast', { message: 'تنبيه: يرجى تعبئة جميع حقول أسعار الصرف المطلوبة.', type: 'warning' });
            return;
        }

        const priceRate = parseFloat(rawPriceRate);
        const depRate = parseFloat(rawDepRate);

        if (isNaN(priceRate) || isNaN(depRate) || priceRate <= 0 || depRate <= 0) {
            EventBus.emit('req-show-toast', { message: 'خطأ في الإدخال: يجب أن تكون قيمة سعر الصرف رقماً صحيحاً وأكبر من الصفر.', type: 'error' });
            return;
        }

        if (priceRate === 1 || depRate === 1) {
            EventBus.emit('req-show-toast', { message: 'تنبيه مالي: القيمة (1) تعني المطابقة التامة مع العملة المرجعية. يرجى إدخال سعر الصرف الفعلي.', type: 'warning' });
            return;
        }

        let rates = normalizeRates(AdminData.data.rates);
        if (!oldCode && rates.find(c => c.code === code)) {
            EventBus.emit('req-show-toast', { message: 'رمز العملة المُدخل مسجل مسبقاً في النظام.', type: 'info' });
            return;
        }

        const warningTitle = '⚠️ تأكيد تحديث أسعار الصرف';
        const warningMsg = `يرجى العلم بأن تحديث سعر صرف عملة (${code}) سينعكس تلقائياً وبشكل فوري على تسعير كافة المنتجات في المتجر.\n\n• سعر البيع المعتمد: ${priceRate}\n• سعر الإيداع المعتمد: ${depRate}\n\nهل تود تأكيد واعتماد هذه القيم؟`;

        if (AdminUI && await AdminUI.showConfirm(warningMsg, warningTitle)) {
            if (oldCode) {
                const idx = rates.findIndex(c => c.code === oldCode);
                if (idx > -1) rates[idx] = { code, name, symbol, priceRate, depRate, isBase: false };
            } else {
                rates.push({ code, name, symbol, priceRate, depRate, isBase: false });
            }
            AdminData.data.rates = rates;
            await AdminData?.saveRates?.();
            AppController.finishAction('req-render-rates', null, oldCode ? 'EDIT_CURRENCY' : 'ADD_CURRENCY', `تحديث مالي: تعديل سعر صرف عملة ${code} (البيع: ${priceRate} | الإيداع: ${depRate})`, 'تم تحديث واعتماد أسعار الصرف بنجاح.');
        } else {
            EventBus.emit('req-show-toast', { message: 'تم إلغاء عملية التحديث.', type: 'info' });
        }
    },

    deleteCurrency: async function(code) {
        if (code === 'USD') return;
        const usersUsingIt = (AdminData.data.users || []).some(u => (u.baseCurrency || '').toUpperCase() === code);
        if (usersUsingIt) {
            EventBus.emit('req-show-toast', { message: `لا يمكن حذف عملة ${code} لوجود عملاء يستخدمونها حالياً!`, type: 'error' });
            return;
        }

        if (AdminUI && await AdminUI.showConfirm(`هل أنت متأكد من حذف عملة ${code}؟`)) {
            let rates = normalizeRates(AdminData.data.rates);
            AdminData.data.rates = rates.filter(c => c.code !== code);
            await AdminData?.saveRates?.();
            AdminData?.addLog?.('DELETE_CURRENCY', `تم حذف عملة: ${code}`);
            EventBus.emit('req-render-rates');
            EventBus.emit('req-show-toast', { message: 'تم حذف العملة بنجاح', type: 'success' });
        }
    },

    // =========================================================
    // 🏦 3. معالجة الإيداعات (Deposits Processing)
    // =========================================================
    submitDepositReview: async function(action) {
        const reviewId = AdminUI?.FinanceUI?.currentDepositId || null;
        if (!reviewId) return;

        const dep = AdminData.data.deposits.find(d => String(d.id) === String(reviewId));
        if (!dep) return;

        const note = Utils.escapeHTML(Utils.getVal('dep-drawer-note'));
        dep.status = action === 'approve' ? 'approved' : 'rejected';
        dep.adminNote = note;
        dep.actionTime = Date.now();

        if (AdminData.data.system && AdminData.data.system.globalStats) {
            if (action === 'approve') AdminData.data.system.globalStats.deposits.approved++;
            if (action === 'reject') AdminData.data.system.globalStats.deposits.rejected++;
        }

        const user = AdminData.data.users.find(u => String(u.id) === String(dep.userId));

        if (action === 'approve' && user) {
            const feePct = Number(dep.feePct ?? dep.fee ?? 0);
            const feeType = dep.feeType || 'fee';
            const feeAmount = Number(dep.amount || 0) * (feePct / 100);

            let netPayCurr = Number(dep.amount || 0);
            if (feeType === 'bonus') netPayCurr += feeAmount;
            else netPayCurr -= feeAmount;

            const fxRate = Number(dep.fxRate ?? 1);
            const netBase = Number((dep.creditedAmount != null) ? dep.creditedAmount : (netPayCurr * fxRate));

            user.walletBalance = (Number(user.walletBalance) || 0) + netBase;
            user.balance = user.walletBalance;
        }

        if (user) {
            let notifTitle = action === 'approve' ? 'اكتمل الإيداع ✅' : 'إيداع مرفوض ❌';
            let notifMsg = action === 'approve' 
                ? `تمت إضافة الرصيد لمحفظتك بنجاح. انقر لعرض الإيصال.` 
                : `تم رفض طلب الإيداع. ${note ? 'السبب: ' + note : 'انقر لمعرفة التفاصيل.'}`;
            
            const autoAlert = {
                id: 'sys_dep_' + Date.now(),
                title: notifTitle,
                message: notifMsg,
                createdAt: Date.now(),
                type: 'notification',
                targetType: 'user',
                targetId: user.id,
                jumpTarget: 'deposit',
                jumpId: dep.id
            };
            user.inbox = user.inbox || [];
            user.inbox.push(autoAlert);
        }

        await AdminData?.saveDeposits?.();
        if (user) await AdminData?.saveUsers?.();
        await AdminData?.saveSystemSettings?.();

        const curTxt = AdminRender?.getCurrencySymbolText?.(dep.currency || 'USD') || (dep.currency || 'USD');
        AdminUI?.FinanceUI?.closeDepositDrawer?.();
        
        AppController.finishAction('req-render-deposits', null, `DEPOSIT_${action.toUpperCase()}`, `إيداع رقم #${dep.id} للعميل ${dep.userName} بمبلغ ${dep.amount} ${curTxt} - ${action === 'approve' ? 'مقبول' : 'مرفوض'}`, action === 'approve' ? 'تم قبول الإيداع وإضافة الرصيد' : 'تم رفض الإيداع');
    },

    reEvaluateDeposit: async function(depId) {
        const dep = AdminData.data.deposits.find(d => String(d.id) === String(depId));
        if (!dep || dep.status !== 'approved') return;

        const user = AdminData.data.users.find(u => String(u.id) === String(dep.userId));
        if (!user) {
            EventBus.emit('req-show-toast', { message: 'لم يتم العثور على العميل المرتبط بهذا الإيداع', type: 'error' });
            return;
        }

        const feePct = Number(dep.feePct ?? dep.fee ?? 0);
        const feeType = dep.feeType || 'fee';
        const feeAmount = Number(dep.amount || 0) * (feePct / 100);

        let netPayCurr = Number(dep.amount || 0);
        if (feeType === 'bonus') netPayCurr += feeAmount;
        else netPayCurr -= feeAmount;

        const fxRate = Number(dep.fxRate ?? 1);
        const netBase = Number((dep.creditedAmount != null) ? dep.creditedAmount : (netPayCurr * fxRate));
        const isDeduction = netBase < 0;
        const currentBalance = Number(user.walletBalance || user.balance || 0);
        const safeCurrency = (user.baseCurrency || user.base_currency || 'USD').toUpperCase().replace('$', 'USD');

        let confirmMsg = "";
        let confirmTitle = "";

        if (isDeduction) {
            confirmTitle = "تأكيد إلغاء الخصم";
            confirmMsg = `هل أنت متأكد من إلغاء عملية الخصم هذه؟\nسوف يتم إعادة مبلغ (${Math.abs(netBase).toFixed(2)} ${safeCurrency}) إلى محفظة العميل.`;
        } else {
            confirmTitle = "تأكيد استرجاع الإيداع";
            confirmMsg = "هل أنت متأكد من استرجاع هذا الإيداع وخصم المال من رصيد العميل؟";
            if (currentBalance < netBase) {
                const debtAmount = netBase - currentBalance;
                const plainDebtText = `${debtAmount.toFixed(2)} ${safeCurrency}`;
                confirmMsg += `\n\n⚠️ تنبيه هام: لا يوجد رصيد كافٍ عند العميل حالياً.\nسوف يصبح رصيد العميل بالسالب كـ (دين عليه) بمقدار: ${plainDebtText}`;
            }
        }

        if (AdminUI && await AdminUI.showConfirm(confirmMsg, confirmTitle)) {
            const prevStatus = dep.status;
            user.walletBalance = currentBalance - netBase;
            user.balance = user.walletBalance;
            dep.status = 'refunded';
            dep.actionTime = Date.now();

            if (AdminData.data.system && AdminData.data.system.globalStats) {
                AdminData.data.system.globalStats.deposits.refunded++;
                if (prevStatus === 'approved') {
                    AdminData.data.system.globalStats.deposits.approved = Math.max(0, AdminData.data.system.globalStats.deposits.approved - 1);
                }
            }

            await AdminData?.saveDeposits?.();
            await AdminData?.saveUsers?.();
            await AdminData?.saveSystemSettings?.();

            const curTxt = AdminRender?.getCurrencySymbolText?.(dep.currency || 'USD') || (dep.currency || 'USD');
            AdminUI?.FinanceUI?.closeDepositDrawer?.();
            
            const successLogMsg = isDeduction 
                ? `تم إلغاء عملية خصم وإعادة ${Math.abs(dep.amount)} ${curTxt} لرصيد العميل ${dep.userName}` 
                : `تم استرجاع إيداع رقم #${dep.id} للعميل ${dep.userName} وتم خصم ${dep.amount} ${curTxt} من رصيده`;
            
            AppController.finishAction('req-render-deposits', null, 'REFUND_DEPOSIT', successLogMsg, isDeduction ? 'تم إلغاء الخصم وإعادة الرصيد للعميل' : 'تم استرجاع الإيداع وتقييد الخصم/الدين على العميل');
        }
    }
};