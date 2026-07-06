// ============================================================================
// 🧠 متحكم المالية (modules/finance/financeController.js) - النسخة الماسية V8.5 💎
// الوظيفة: معالجة العمليات المنطقية للإيداعات، بوابات الدفع، والعملات.
// 🚀 التحديث الأقصى: القضاء على الـ O(N) في المعاملات المالية وفك الارتباط الدائري كلياً
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';

// 🚀 [نقاء هندسي]: تم حذف استيراد AppController تماماً لكسر الارتباط الدائري الميت!
import { normalizeRates } from '../../adminConfig.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const FinanceController = {

    _isProcessingDeposit: false,

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

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ إعدادات بوابة الدفع...');

        try {
            const hasImg = AdminUI?.FinanceUI?.hasImage?.('pay-img-wrap');
            // ⚡ التحديث: استخدام المتغير المؤقت من مستودع الحالة الصافي AdminData لمنع التداخل
            const tempEditId = AdminData.tempEditId;
            const oldImg = tempEditId ? AdminData.data.payments.find(p => String(p.id) === String(tempEditId))?.img : null;
            
            let finalImg = oldImg || '';
            if (hasImg) {
                const fileInput = document.getElementById('pay-img-input');
                const fileToUpload = fileInput?.files?.[0];

                if (fileToUpload) {
                    finalImg = await FirebaseAdapter.uploadImage(fileToUpload, 'payments');
                }
            }

            const existingPay = tempEditId ? AdminData.data.payments.find(p => String(p.id) === String(tempEditId)) : null;
            const currentActiveState = existingPay ? (existingPay.isActive !== false) : true;

            const newPay = {
                id: tempEditId || String(Date.now()),
                name: Utils.escapeHTML(Utils.getVal('pay-name')),
                detailFields: AdminData.tempPayDetails || [], // ⚡ تحديث قراءة التفاصيل
                currencies: checks.join(',') || 'USD',
                currencySettings: currSettings,
                inputPlaceholder: Utils.escapeHTML(Utils.getVal('pay-input-placeholder')),
                reqProof: Utils.getCheck('pay-req-proof'),
                img: finalImg, 
                isActive: currentActiveState
            };

            const isEdit = !!tempEditId;
            if (isEdit) {
                const idx = AdminData.data.payments.findIndex(p => String(p.id) === String(tempEditId));
                if (idx > -1) AdminData.data.payments[idx] = newPay;
            } else {
                AdminData.data.payments.push(newPay);
            }

            await AdminData?.savePayments?.();
            
            // ⚡ التحديث النقي: إنهاء العمليات بحدث EventBus موحد دون نداء AppController المباشر
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-payments',
                modalId: null,
                logAction: isEdit ? 'EDIT_PAYMENT' : 'ADD_PAYMENT',
                logDetails: `تم ${isEdit ? 'تعديل' : 'إضافة'} وسيلة الدفع: ${newPay.name}`,
                toastMsg: 'تم حفظ طريقة الدفع بنجاح'
            });
            
        } catch (error) {
            console.error("Save Payment Error:", error);
            EventBus.emit('req-show-toast', {message:'فشل الحفظ: ' + (error.message || 'خطأ غير معروف'), type:'error'});
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
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
            if (!Array.isArray(AdminData.tempPayDetails)) AdminData.tempPayDetails = [];
            AdminData.tempPayDetails.push({ text: val, copyable: copyCheck });
            AdminRender?.renderPayDetailList?.(AdminData.tempPayDetails);
            AdminUI?.FinanceUI?.clearPayDetailInput?.();
        } else {
            EventBus.emit('req-show-toast', { message: 'يرجى كتابة نص أولاً', type: 'warning' });
        }
    },

    removePayDetail: function(index) {
        if (AdminData.tempPayDetails && Array.isArray(AdminData.tempPayDetails) && index >= 0 && index < AdminData.tempPayDetails.length) {
            AdminData.tempPayDetails.splice(index, 1);
            AdminRender?.renderPayDetailList?.(AdminData.tempPayDetails);
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
            
            // ⚡ التحديث النقي بـ EventBus
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-rates',
                modalId: null,
                logAction: oldCode ? 'EDIT_CURRENCY' : 'ADD_CURRENCY',
                logDetails: `تحديث مالي: تعديل سعر صرف عملة ${code} (البيع: ${priceRate} | الإيداع: ${depRate})`,
                toastMsg: `تم تحديث واعتماد أسعار الصرف بنجاح`
            });
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

        if (!AdminData.data.settings) AdminData.data.settings = {};
        AdminData.data.settings.defaultCurrency = code;
        
        EventBus.emit('req-render-rates');
        
        try {
            await AdminData?.saveSystemSettings?.();
            AdminData?.addLog?.('SET_DEFAULT_CURRENCY', `تم تعيين (${code}) كعملة عرض افتراضية للضيوف`);
            EventBus.emit('req-show-toast', { message: `تم اعتماد (${code}) كعملة العرض الافتراضية للضيوف.`, type: 'success' });
        } catch (error) {
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

    // ==========================================
    // 🏦 3. معالجة الإيداعات الآمنة (أمان مالي + Loader)
    // ==========================================
    submitDepositReview: async function(action) {
        if (this._isProcessingDeposit) return;
        
        const reviewId = AdminUI?.FinanceUI?.currentDepositId || null;
        if (!reviewId) return;
        
        // ⚡ جلب فوري بـ O(1) للإيداع من الخريطة السحابية مع fallback آمن
        const dep = AdminData.data.depositsMap?.[reviewId] || AdminData.data.deposits.find(d => String(d.id) === String(reviewId));
        if (!dep) return;

        this._isProcessingDeposit = true;
        const note = Utils.escapeHTML(Utils.getVal('dep-drawer-note'));
        const mappedAction = action === 'approve' ? 'approved' : 'rejected';
        
        // 🌟 1. تجهيز الرسالة الدقيقة بناءً على الإجراء والمبلغ
        const amtVal = Number(dep.amount || 0).toFixed(2);
        const curr = (dep.currency || 'USD').toUpperCase();
        
        const customMessage = action === 'approve' 
            ? `تم قبول طلب إيداع بقيمة ${amtVal} ${curr}`
            : `تم رفض طلب إيداع بقيمة ${amtVal} ${curr}`; // 🛡️ تم إصلاح متغير amtEq الميت هنا!
        
        // 🌟 2. تجميد الشاشة وحمايتها من النقر المزدوج (Loader)
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري توثيق العملية وتحديث الرصيد سحابياً...');
        
        try {
            // 🌟 3. إرسال الطلب للسيرفر والانتظار لضمان الأمان المالي
            const result = await FirebaseAdapter.callFunction('adminProcessDeposit', {
                depositId: String(dep.id),
                action: mappedAction,
                adminNote: note
            });
            
            // 🌟 4. إذا نجح السيرفر، نقوم بتحديث الشاشة وإظهار الإشعار النهائي فقط
            if (result && result.success) {
                dep.status = mappedAction;
                
                if (AdminUI?.FinanceUI?.closeDepositDrawer) AdminUI.FinanceUI.closeDepositDrawer();
                else if (AdminUI?.closeDepositDrawer) AdminUI.closeDepositDrawer();
                
                EventBus.emit('req-render-deposits');
                
                if (AdminData?.addLog) {
                    AdminData.addLog(`DEPOSIT_${mappedAction.toUpperCase()}`, `${customMessage} للعميل ${dep.userName || dep.userId}`);
                }
                
                // إشعار واحد فقط دقيق وجميل!
                EventBus.emit('req-show-toast', { message: customMessage, type: 'success' });
            }
        } catch (error) {
            console.error("Deposit Processing Error:", error);
            EventBus.emit('req-show-toast', { message: `فشل السيرفر: ${error.message}`, type: 'error' });
        } finally {
            // 🌟 5. رفع الحظر عن الشاشة دائماً في النهاية
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            this._isProcessingDeposit = false;
        }
    },
    
    reEvaluateDeposit: async function(depId) {
        if (this._isProcessingDeposit) return;

        // ⚡ جلب فوري بـ O(1) للإيداع من الخريطة
        const dep = AdminData.data.depositsMap?.[depId] || AdminData.data.deposits.find(d => String(d.id) === String(depId));
        if (!dep || dep.status !== 'approved') return;
        
        // ⚡ جلب فوري بـ O(1) للعميل من الخريطة
        const user = AdminData.data.usersMap?.[dep.userId] || AdminData.data.users.find(u => String(u.id) === String(dep.userId));
        if (!user) {
            EventBus.emit('req-show-toast', { message: 'لم يتم العثور على العميل المرتبط بهذا الإيداع', type: 'error' });
            return;
        }
        
        // 🛡️ [إصلاح حرج 2]: تم إزالة الكائن الميت this.currentPayment وقراءة الرسوم والنسب مباشرة من مستند الإيداع
        const feeVal = Number(dep.feePct ?? dep.fee ?? 0);
        const feeType = dep.feeType || 'fee';
        const feeUnit = dep.feeUnit || dep.unit || dep.calcMethod || 'percent';

        let feeAmount = feeUnit === 'fixed' || feeUnit === 'amount' ? feeVal : Number(dep.amount || 0) * (feeVal / 100);
        
        let netPayCurr = Number(dep.amount || 0);
        if (feeType === 'bonus') netPayCurr += feeAmount;
        else netPayCurr -= feeAmount;
        
        const fxRate = Number(dep.fxRate ?? 1);
        const netBase = Number((dep.creditedAmount != null) ? dep.creditedAmount : (netPayCurr * fxRate));
        
        const currentBalance = Number(user.walletBalance || user.balance || 0);
        const safeCurrency = (user.baseCurrency || 'USD').toUpperCase();
        
        let confirmMsg = "";
        let confirmTitle = "";
        
        const isDeduction = netBase < 0;
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
            this._isProcessingDeposit = true;

            const customMessage = isDeduction 
                ? `تم إلغاء الخصم وإعادة ${Math.abs(dep.amount)} ${dep.currency}`
                : `تم استرجاع إيداع بقيمة ${dep.amount} ${dep.currency}`;

            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تصحيح الرصيد سحابياً...');
            
            try {
                const result = await FirebaseAdapter.callFunction('adminProcessDeposit', {
                    depositId: String(dep.id),
                    action: 'refunded',
                    adminNote: 'تم استرجاع الإيداع يدوياً من الإدارة'
                });
                
                if (result && result.success) {
                    dep.status = 'refunded';
                    AdminUI?.FinanceUI?.closeDepositDrawer?.();
                    EventBus.emit('req-refresh', { type: 'deposits' });
                    
                    if (AdminData?.addLog) {
                        AdminData.addLog('REFUND_DEPOSIT', `${customMessage} للعميل ${dep.userName || dep.userId}`);
                    }
                    
                    EventBus.emit('req-show-toast', { message: customMessage, type: 'success' });
                }
                
            } catch (error) {
                console.error("Refund Deposit Error:", error);
                EventBus.emit('req-show-toast', { message: `فشل السيرفر: ${error.message}`, type: 'error' });
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
                this._isProcessingDeposit = false;
            }
        }
    }
};