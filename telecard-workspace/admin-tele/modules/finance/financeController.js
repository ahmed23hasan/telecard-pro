// ============================================================================
// 🧠 متحكم المالية (modules/finance/financeController.js) - Cloud Secured ☁️
// الوظيفة: معالجة العمليات المنطقية (Business Logic) للإيداعات، بوابات الدفع، والعملات.
// 🌟 التحديث: ربط صور بوابات الدفع بمحرك الرفع السحابي (Firebase Storage)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';
import { normalizeRates } from '../../adminConfig.js';
import { getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
// 🌟 استدعاء محول السحابة لرفع الصور
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

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

        EventBus.emit('req-show-loader', true); // 🌟 إظهار شاشة التحميل لمنع التكرار

        try {
            const hasImg = AdminUI?.FinanceUI?.hasImage?.('pay-img-wrap');
            const oldImg = AppController.tempEditId ? AdminData.data.payments.find(p => String(p.id) === String(AppController.tempEditId))?.img : null;
            
            // 🌟 محرك الرفع السحابي لشعارات بوابات الدفع
            let finalImg = '';
            if (hasImg) {
                // 🌟 سحب الملف مباشرة من عنصر الإدخال
                const fileInput = document.getElementById('pay-img-input');
                const fileToUpload = fileInput?.files?.[0];

                if (fileToUpload) {
                    EventBus.emit('req-show-toast', {message:'جاري رفع شعار البوابة للسحابة...', type:'info'});
                    finalImg = await FirebaseAdapter.uploadImage(fileToUpload, 'payments');
                } else {
                    finalImg = oldImg || ''; 
                }
            }

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
                img: finalImg, // 👈 تخزين الرابط السحابي النظيف
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
            
        } catch (error) {
            console.error("Save Payment Error:", error);
            // 🌟 إظهار رسالة الخطأ الحقيقية القادمة من السحابة لتشخيص الخلل
            EventBus.emit('req-show-toast', {message:'فشل الحفظ: ' + (error.message || 'خطأ غير معروف'), type:'error'});
        } finally {
            EventBus.emit('req-show-loader', false); // 🌟 إخفاء شاشة التحميل دائماً
        }
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

        setDefaultDisplayCurrency: async function(code) {
        if (!code) return;
        
        const rates = AdminData.data.rates || [];
        const isValid = code === 'USD' || rates.some(r => r.code === code);
        
        if (!isValid) {
            EventBus.emit('req-show-toast', { message: 'إجراء مرفوض: العملة غير مسجلة في النظام.', type: 'error' });
            return;
        }

        // 1. تحديث البيانات في الذاكرة الحية (RAM)
        if (!AdminData.data.settings) AdminData.data.settings = {};
        AdminData.data.settings.defaultCurrency = code;
        
        // 🌟 2. [التحديث المتفائل]: إعادة رسم الكروت فوراً لتعبئة النجمة دون انتظار السحابة
        EventBus.emit('req-render-rates');
        
        try {
            // 3. إرسال الطلب للسحابة للحفظ (هذا سيحدث في الخلفية الآن دون تجميد الواجهة)
            await AdminData?.saveSystemSettings?.();
            AdminData?.addLog?.('SET_DEFAULT_CURRENCY', `تم تعيين (${code}) كعملة عرض افتراضية للضيوف`);
            
            // 4. إظهار الإشعار بعد نجاح الحفظ السحابي
            EventBus.emit('req-show-toast', { message: `تم اعتماد (${code}) كعملة العرض الافتراضية للضيوف.`, type: 'success' });
        } catch (error) {
            // كود احترافي: في حال فشل السيرفر لسبب ما، نظهر خطأ
            console.error("Failed to save default currency:", error);
            EventBus.emit('req-show-toast', { message: 'حدث خطأ في الاتصال أثناء حفظ عملة العرض.', type: 'error' });
        }
    },
    deleteCurrency: async function(code) {
        if (code === 'USD') return;

        const usersUsingIt = (AdminData.data.users || []).some(u => (u.baseCurrency || '').toUpperCase() === code);
        if (usersUsingIt) {
            EventBus.emit('req-show-toast', { message: `لا يمكن حذف عملة ${code} لوجود عملاء يستخدمونها حالياً!`, type: 'error' });
            return;
        }

        const currentDefault = AdminData.data.settings?.defaultCurrency || 'USD';
        const isDefaultDisplay = currentDefault === code;
        
        let confirmMsg = `هل أنت متأكد من حذف عملة ${code}؟`;
        let confirmTitle = 'تأكيد حذف العملة';
        
        if (isDefaultDisplay) {
            confirmTitle = '⚠️ تحذير: حذف عملة العرض الافتراضية';
            confirmMsg = `تنبيه هام: عملة (${code}) محددة حالياً كعملة العرض الافتراضية للضيوف في المتجر!\n\nهل تود المتابعة؟\n(في حال الحذف، سيعود المتجر لعرض الأسعار بالعملة الأساسية USD تلقائياً للضيوف).`;
        }

        if (AdminUI && await AdminUI.showConfirm(confirmMsg, confirmTitle)) {
            let rates = normalizeRates(AdminData.data.rates);
            AdminData.data.rates = rates.filter(c => c.code !== code);
            await AdminData?.saveRates?.();
            
            if (isDefaultDisplay) {
                AdminData.data.settings.defaultCurrency = 'USD';
                await AdminData?.saveSystemSettings?.();
            }

            AdminData?.addLog?.('DELETE_CURRENCY', `تم حذف عملة: ${code}`);
            EventBus.emit('req-render-rates');
            EventBus.emit('req-show-toast', { message: 'تم حذف العملة بنجاح', type: 'success' });
        }
    },

    // =========================================================
    // 🏦 3. معالجة الإيداعات الآمنة (Cloud Protected)
    // =========================================================
    submitDepositReview: async function(action) {
        const reviewId = AdminUI?.FinanceUI?.currentDepositId || null;
        if (!reviewId) return;

        const dep = AdminData.data.deposits.find(d => String(d.id) === String(reviewId));
        if (!dep) return;

        const note = Utils.escapeHTML(Utils.getVal('dep-drawer-note'));
        const mappedAction = action === 'approve' ? 'approved' : 'rejected';

        // 🌟 إظهار شاشة التحميل (العملية الآن تتم على خوادم جوجل)
        if (AdminUI && AdminUI.toggleLoader) AdminUI.toggleLoader(true, 'جاري معالجة الإيداع سحابياً...');

        try {
            const app = getApp();
            const functions = getFunctions(app);
            const processDepositFn = httpsCallable(functions, 'adminProcessDeposit');

            // 🚀 إرسال الأمر للسيرفر
            const result = await processDepositFn({
                depositId: String(dep.id),
                action: mappedAction,
                adminNote: note
            });

            // 🔄 تحديث الواجهة عند نجاح العملية السحابية
            if (AdminUI && AdminUI.toggleLoader) AdminUI.toggleLoader(false);
            AdminUI?.FinanceUI?.closeDepositDrawer?.();
            
            AppController.finishAction(
                'req-render-deposits', 
                null, 
                `DEPOSIT_${mappedAction.toUpperCase()}`, 
                `إيداع رقم #${dep.id} بمبلغ ${dep.amount} ${dep.currency} - ${mappedAction === 'approved' ? 'مقبول' : 'مرفوض'}`, 
                result.data.message || 'تمت العملية بنجاح'
            );

        } catch (error) {
            console.error("Cloud Function Error:", error);
            if (AdminUI && AdminUI.toggleLoader) AdminUI.toggleLoader(false);
            EventBus.emit('req-show-toast', { message: error.message || 'تعذر معالجة الإيداع. تأكد من اتصالك أو راجع السجل.', type: 'error' });
        }
    },

    reEvaluateDeposit: async function(depId) {
        const dep = AdminData.data.deposits.find(d => String(d.id) === String(depId));
        if (!dep || dep.status !== 'approved') return;

        const user = AdminData.data.users.find(u => String(u.id) === String(dep.userId));
        if (!user) {
            EventBus.emit('req-show-toast', { message: 'لم يتم العثور على العميل المرتبط بهذا الإيداع', type: 'error' });
            return;
        }

        const feeVal = Number(dep.feePct ?? dep.fee ?? 0);
        const feeType = dep.feeType || 'fee';
        const feeUnit = dep.feeUnit || dep.unit || dep.calcMethod || 'percent';

        const feeAmount = Number(dep.feeAmount ?? (feeUnit === 'percent' ? (Number(dep.amount || 0) * (feeVal / 100)) : feeVal));

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
            
            // 🌟 إظهار شاشة التحميل
            if (AdminUI && AdminUI.toggleLoader) AdminUI.toggleLoader(true, 'جاري استرجاع الإيداع سحابياً...');

            try {
                const app = getApp();
                const functions = getFunctions(app);
                const processDepositFn = httpsCallable(functions, 'adminProcessDeposit');

                // 🚀 إرسال الأمر للسيرفر
                const result = await processDepositFn({
                    depositId: String(dep.id),
                    action: 'refunded',
                    adminNote: 'تم استرجاع الإيداع يدوياً من الإدارة'
                });

                if (AdminUI && AdminUI.toggleLoader) AdminUI.toggleLoader(false);
                AdminUI?.FinanceUI?.closeDepositDrawer?.();
                
                const curTxt = AdminRender?.getCurrencySymbolText?.(dep.currency || 'USD') || (dep.currency || 'USD');
                const successLogMsg = isDeduction 
                    ? `تم إلغاء عملية خصم وإعادة ${Math.abs(dep.amount)} ${curTxt} لرصيد العميل ${dep.userName}` 
                    : `تم استرجاع إيداع رقم #${dep.id} للعميل ${dep.userName} وتم خصم ${dep.amount} ${curTxt} من رصيده`;
                
                AppController.finishAction(
                    'req-render-deposits', 
                    null, 
                    'REFUND_DEPOSIT', 
                    successLogMsg, 
                    result.data.message || (isDeduction ? 'تم إلغاء الخصم وإعادة الرصيد للعميل' : 'تم استرجاع الإيداع وتقييد الخصم/الدين على العميل')
                );

            } catch (error) {
                console.error("Cloud Function Error:", error);
                if (AdminUI && AdminUI.toggleLoader) AdminUI.toggleLoader(false);
                EventBus.emit('req-show-toast', { message: error.message || 'تعذر استرجاع الإيداع. تأكد من اتصالك.', type: 'error' });
            }
        }
    }
};
