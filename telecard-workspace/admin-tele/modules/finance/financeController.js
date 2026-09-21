// ============================================================================
// 🧠 متحكم المالية (modules/finance/financeController.js) - Cloud-Native V18.11 💎
// 🚀 التحديث الأقصى (V18.11 - Server-Side Truth Patch): 
// 1. Pre-Await Locking 🔒: إغلاق ثغرة (Race Condition) بنقل الأقفال الذرية قبل رسائل التأكيد.
// 2. Server-Side Truth 🧮: إزالة الحسابات المحلية للأرصدة عند قبول/استرجاع الإيداعات، والاعتماد المطلق على (index.js) لمنع تضارب الذاكرة.
// 3. Omnipresent UI Sync 🔄: تحديث نافذة ملف العميل الشامل لحظياً بعد مراجعة الإيداع.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { FinancialEngine } from '../../core/financialEngine.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';
import { UIService } from '../../core/uiService.js';

export const FinanceController = {

    _actionLocks: new Set(),

    savePay: async function() {
        if (this._actionLocks.has('save-pay')) return; 
        this._actionLocks.add('save-pay');

        try {
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
                    max: parseFloat(Utils.getVal(`pay-max-${code}`)) || 0,
                    minFee: parseFloat(Utils.getVal(`pay-minfee-${code}`)) || 0, 
                    maxFee: parseFloat(Utils.getVal(`pay-maxfee-${code}`)) || 0
                };

                const displayCode = AdminRender?.getCurrencySymbolText?.(code) || code;
                const typeText = fType === 'bonus' ? 'يمنح بونص إضافي (+)' : 'يخصم عمولة (-)';
                const unitText = fUnit === 'fixed' ? '(مبلغ ثابت)' : '(نسبة مئوية %)';
                summaryMsg += `• عملة ${displayCode}: ${typeText} بقيمة ${fVal} ${unitText}\n`;
            });

            if (checks.length > 0 && AdminUI && !await AdminUI.showConfirm(summaryMsg, 'تأكيد الحسبة المالية للبوابة')) {
                return; 
            }

            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ إعدادات بوابة الدفع...');

            const hasImg = AdminUI?.FinanceUI?.hasImage?.('pay-img-wrap');
            const tempEditId = AdminData.tempEditId;
            const oldImg = tempEditId ? AdminData.data.payments.find(p => String(p.id) === String(tempEditId))?.img : null;
            
            let finalImg = oldImg || '';
            if (hasImg) {
                const fileInput = document.getElementById('pay-img-input');
                const fileToUpload = fileInput?.files?.[0];

                if (fileToUpload) {
                    EventBus.emit('req-show-toast', { message: 'جاري ضغط ومعالجة شعار البوابة...', type: 'info' });
                    
                    const compressedBase64 = await new Promise(resolve => {
                        if (UIService && UIService.processImage) {
                            UIService.processImage(fileToUpload, resolve);
                        } else { resolve(null); }
                    });

                    let fileForUpload = fileToUpload;
                    if (compressedBase64 && compressedBase64.startsWith('data:image')) {
                        const mimeType = fileToUpload.type === 'image/png' ? 'image/png' : 'image/jpeg';
                        const byteString = atob(compressedBase64.split(',')[1]);
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                        const blob = new Blob([ab], { type: mimeType });
                        fileForUpload = new File([blob], fileToUpload.name, { type: mimeType });
                    }

                    if (oldImg && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                        await FirebaseAdapter.deleteImageByUrl(oldImg).catch(()=>{});
                    }

                    finalImg = await FirebaseAdapter.uploadImage(fileForUpload, 'payments', null, true);
                }
            }

            const existingPay = tempEditId ? AdminData.data.payments.find(p => String(p.id) === String(tempEditId)) : null;
            const currentActiveState = existingPay ? (existingPay.isActive !== false) : true;

            const newPay = {
                id: tempEditId || String(Date.now()),
                name: Utils.escapeHTML(Utils.getVal('pay-name')),
                detailFields: AdminData.tempPayDetails || [],
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
            FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
            
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-payments',
                modalId: 'payment', 
                logAction: isEdit ? 'EDIT_PAYMENT' : 'ADD_PAYMENT',
                logDetails: `تم ${isEdit ? 'تعديل' : 'إضافة'} وسيلة الدفع: ${newPay.name}`,
                toastMsg: 'تم حفظ طريقة الدفع بنجاح'
            });

            AdminData.tempEditId = null;
            AdminData.tempPayDetails = [];
            
        } catch (error) {
            console.error("Save Payment Error:", error);
            EventBus.emit('req-show-toast', {message:'فشل الحفظ: ' + (error.message || 'خطأ غير معروف'), type:'error'});
        } finally {
            this._actionLocks.delete('save-pay');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    togglePaymentStatus: async function(id, isActive) {
        if (this._actionLocks.has(`tog-pay-${id}`)) return; 
        this._actionLocks.add(`tog-pay-${id}`);

        try {
            const p = AdminData.data.payments.find(x => String(x.id) === String(id));
            if (!p) return;

            p.isActive = !!isActive;
            await AdminData?.savePayments?.();
            FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
            AdminData?.addLog?.('TOGGLE_PAYMENT', `تم ${isActive ? 'تفعيل' : 'إيقاف'} وسيلة الدفع: ${p.name}`);
            EventBus.emit('req-render-payments');
            EventBus.emit('req-show-toast', { message: isActive ? 'تم تفعيل وسيلة الدفع للمشترين' : 'تم إيقاف وسيلة الدفع مؤقتاً', type: isActive ? 'success' : 'warning' });
        } catch (error) {
            console.error("Toggle Payment Error:", error);
            EventBus.emit('req-show-toast', { message: 'فشل تبديل حالة الدفع', type: 'error' });
        } finally {
            this._actionLocks.delete(`tog-pay-${id}`);
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
        if (this._actionLocks.has('change-cur-disp')) return; 
        this._actionLocks.add('change-cur-disp');

        try {
            if (!AdminData.data.settings) AdminData.data.settings = {};
            AdminData.data.settings.currencyDisplay = val;
            await AdminData?.saveSystemSettings?.();
            EventBus.emit('req-show-toast', { message: 'تم تحديث طريقة عرض العملات بنجاح', type: 'success' });
            EventBus.emit('req-render-rates');
            EventBus.emit('req-render-sales');
        } catch (error) {
            EventBus.emit('req-show-toast', { message: 'فشل التحديث', type: 'error' });
        } finally {
            this._actionLocks.delete('change-cur-disp');
        }
    },

    saveCurrency: async function() {
        if (this._actionLocks.has('save-currency')) return; 
        this._actionLocks.add('save-currency');

        try {
            const oldCode = Utils.getVal('cur-old-code');
            const code = Utils.getVal('cur-code').toUpperCase();
            const name = Utils.escapeHTML(Utils.getVal('cur-name'));
            const symbol = Utils.escapeHTML(Utils.getVal('cur-symbol'));
            const rawPriceRate = Utils.getVal('cur-price-rate');
            const rawDepRate = Utils.getVal('cur-dep-rate');

            if (!code || !name) { EventBus.emit('req-show-toast', { message: 'تنبيه: يرجى إدخال رمز واسم العملة بشكل صحيح.', type: 'warning' }); return; }
            if (code === 'USD') { EventBus.emit('req-show-toast', { message: 'إجراء مرفوض: لا يمكن تعديل الدولار كونه العملة المرجعية الأساسية للنظام.', type: 'error' }); return; }
            if (rawPriceRate === '' || rawDepRate === '') { EventBus.emit('req-show-toast', { message: 'تنبيه: يرجى تعبئة جميع حقول أسعار الصرف المطلوبة.', type: 'warning' }); return; }

            const priceRate = parseFloat(rawPriceRate);
            const depRate = parseFloat(rawDepRate);

            if (isNaN(priceRate) || isNaN(depRate) || priceRate <= 0 || depRate <= 0) { EventBus.emit('req-show-toast', { message: 'خطأ في الإدخال: يجب أن تكون قيمة سعر الصرف رقماً صحيحاً وأكبر من الصفر.', type: 'error' }); return; }
            if (priceRate === 1 || depRate === 1) { EventBus.emit('req-show-toast', { message: 'تنبيه مالي: القيمة (1) تعني المطابقة التامة مع العملة المرجعية. يرجى إدخال سعر الصرف الفعلي.', type: 'warning' }); return; }

            let rates = Array.isArray(AdminData.data.rates) ? [...AdminData.data.rates] : [];
            if (!oldCode && rates.find(c => String(c.code).toUpperCase() === code)) { EventBus.emit('req-show-toast', { message: 'رمز العملة المُدخل مسجل مسبقاً في النظام.', type: 'info' }); return; }

            const warningTitle = '⚠️ تأكيد تحديث أسعار الصرف';
            const warningMsg = `يرجى العلم بأن تحديث سعر صرف عملة (${code}) سينعكس تلقائياً وبشكل فوري على تسعير كافة المنتجات في المتجر.\n\n• سعر البيع المعتمد: ${priceRate}\n• سعر الإيداع المعتمد: ${depRate}\n\nهل تود تأكيد واعتماد هذه القيم؟`;

            if (AdminUI && !await AdminUI.showConfirm(warningMsg, warningTitle)) return;
            
            if (oldCode) {
                const idx = rates.findIndex(c => String(c.code).toUpperCase() === String(oldCode).toUpperCase());
                if (idx > -1) rates[idx] = { code, name, symbol, priceRate, depRate, isBase: false };
            } else { rates.push({ code, name, symbol, priceRate, depRate, isBase: false }); }
            
            AdminData.data.rates = rates; 
            await AdminData?.saveRates?.();
            FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
            
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-rates', modalId: 'currency',
                logAction: oldCode ? 'EDIT_CURRENCY' : 'ADD_CURRENCY', logDetails: `تحديث مالي: تعديل سعر صرف عملة ${code}`, toastMsg: `تم تحديث واعتماد أسعار الصرف بنجاح`
            });
            
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `فشل الحفظ: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete('save-currency');
        }
    },

    setDefaultDisplayCurrency: async function(code) {
        if (!code || this._actionLocks.has('set-def-curr')) return; 
        this._actionLocks.add('set-def-curr');

        try {
            const rates = AdminData.data.rates || [];
            const isValid = code === 'USD' || rates.some(r => r.code === code);
            
            if (!isValid) { EventBus.emit('req-show-toast', { message: 'إجراء مرفوض: العملة غير مسجلة في النظام.', type: 'error' }); return; }

            if (!AdminData.data.settings) AdminData.data.settings = {};
            AdminData.data.settings.defaultCurrency = code;
            EventBus.emit('req-render-rates');
            
            await AdminData?.saveSystemSettings?.();
            AdminData?.addLog?.('SET_DEFAULT_CURRENCY', `تم تعيين (${code}) كعملة عرض افتراضية للضيوف`);
            EventBus.emit('req-show-toast', { message: `تم اعتماد (${code}) كعملة العرض الافتراضية للضيوف.`, type: 'success' });
        } catch (error) { 
            EventBus.emit('req-show-toast', { message: 'حدث خطأ في الاتصال أثناء حفظ عملة العرض.', type: 'error' }); 
        } finally { 
            this._actionLocks.delete('set-def-curr'); 
        }
    },

    deleteCurrency: async function(code) {
        if (code === 'USD' || this._actionLocks.has(`del-cur-${code}`)) return; 
        this._actionLocks.add(`del-cur-${code}`);

        try {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري فحص ارتباط العملة بالعملاء سحابياً...');
            
            const usageStats = await FirebaseAdapter.getAggregatedStats('telecard_users', [['baseCurrency', '==', code]], { total: { type: 'count' } });
            
            if (usageStats && usageStats.total > 0) {
                EventBus.emit('req-show-toast', { message: `لا يمكن حذف عملة ${code} لوجود ${usageStats.total} عميل يستخدمها في قاعدة البيانات!`, type: 'error' }); 
                return; 
            }
            
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);

            const currentDefault = AdminData.data.settings?.defaultCurrency || 'USD';
            const isDefaultDisplay = currentDefault === code;
            
            let confirmMsg = `هل أنت متأكد من حذف عملة ${code}؟`;
            let confirmTitle = 'تأكيد حذف العملة';
            if (isDefaultDisplay) {
                confirmTitle = '⚠️ تحذير: حذف عملة العرض الافتراضية';
                confirmMsg = `تنبيه هام: عملة (${code}) محددة حالياً كعملة العرض الافتراضية للضيوف في المتجر!\n\nهل تود المتابعة؟\n(في حال الحذف، سيعود المتجر لعرض الأسعار بالعملة الأساسية USD تلقائياً للضيوف).`;
            }

            if (AdminUI && !await AdminUI.showConfirm(confirmMsg, confirmTitle)) return;

            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الحذف سحابياً...');

            let paymentsChanged = false;
            if (AdminData.data.payments && Array.isArray(AdminData.data.payments)) {
                AdminData.data.payments.forEach(p => {
                    let modified = false;
                    if (p.currencies && typeof p.currencies === 'string') {
                        const curArr = p.currencies.split(',').map(c => c.trim());
                        if (curArr.includes(code)) { p.currencies = curArr.filter(c => c !== code).join(','); modified = true; }
                    }
                    if (p.currencySettings && p.currencySettings[code]) { delete p.currencySettings[code]; modified = true; }
                    if (modified) paymentsChanged = true;
                });
            }

            if (paymentsChanged) { await AdminData.savePayments(); EventBus.emit('req-render-payments'); }

            let rates = Array.isArray(AdminData.data.rates) ? [...AdminData.data.rates] : [];
            AdminData.data.rates = rates.filter(c => String(c.code).toUpperCase() !== String(code).toUpperCase());
            await AdminData?.saveRates?.();
            
            if (isDefaultDisplay) { AdminData.data.settings.defaultCurrency = 'USD'; await AdminData?.saveSystemSettings?.(); }

            FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
            AdminData?.addLog?.('DELETE_CURRENCY', `تم حذف عملة: ${code}`);
            EventBus.emit('req-render-rates');
            EventBus.emit('req-show-toast', { message: 'تم حذف العملة بنجاح وتحديث المتجر', type: 'success' });
            
        } catch (e) {
            EventBus.emit('req-show-toast', { message: `فشل الاتصال بالسيرفر أثناء فحص العملة`, type: 'error' }); 
        } finally {
            this._actionLocks.delete(`del-cur-${code}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

        submitDepositReview: async function(action) {
        const reviewId = AdminUI?.FinanceUI?.currentDepositId || null;
        if (!reviewId || this._actionLocks.has(reviewId)) return;
        this._actionLocks.add(reviewId);
        
        try {
            const dep = AdminData.data.depositsMap?.[reviewId] || AdminData.data.deposits.find(d => String(d.id) === String(reviewId));
            if (!dep) return;

            const note = Utils.escapeHTML(Utils.getVal('dep-drawer-note'));
            const mappedAction = action === 'approve' ? 'approved' : 'rejected';
            
            const amtVal = Number(dep.amount || 0).toFixed(2);
            const curr = (dep.currency || 'USD').toUpperCase();
            
            const customMessage = action === 'approve' 
                ? `تم قبول طلب إيداع بقيمة ${amtVal} ${curr}`
                : `تم رفض طلب إيداع بقيمة ${amtVal} ${curr}`;
            
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري توثيق العملية وتحديث الرصيد سحابياً...');
            
            const result = await FirebaseAdapter.callFunction('adminProcessDeposit', {
                depositId: String(dep.id),
                action: mappedAction,
                adminNote: note
            });
            
            if (result && result.success) {
                dep.status = mappedAction;
                
                // 🚀 [التحديث المعماري]: إنقاص العداد الأحمر محلياً لراحة الإدارة (Optimistic UI)
                if (AdminRender?.decrementLocalBadge) {
                    AdminRender.decrementLocalBadge('deposit');
                }

                // 🛡️ [التصحيح المعماري]: إزالة تحديث الرصيد المحلي لمنع الـ Race Condition مع السيرفر
                if (AdminUI?.FinanceUI?.closeDepositDrawer) AdminUI.FinanceUI.closeDepositDrawer();
                else if (AdminUI?.closeDepositDrawer) AdminUI.closeDepositDrawer();
                
                EventBus.emit('req-render-deposits');
                
                // 🚀 [التحديث المعماري - Omnipresent UI Sync]: جلب أحدث أرصدة من السيرفر
                setTimeout(() => {
                    EventBus.emit('req-refresh', { type: 'users' }); 
                    const modalDetail = document.getElementById('m-user-detail');
                    if (modalDetail && modalDetail.classList.contains('active')) {
                        const currentEditedUserId = AdminRender?.UsersRender?.state?.currentEditUserId;
                        if (currentEditedUserId === dep.userId) {
                            EventBus.emit('action-triggered', { action: 'view-user', id: dep.userId, preventModalOpen: true });
                        }
                    }
                }, 500);
                
                const logName = dep.userDataSnapshot?.fullName || dep.userName || dep.userId;
                if (AdminData?.addLog) AdminData.addLog(`DEPOSIT_${mappedAction.toUpperCase()}`, `${customMessage} للعميل ${logName}`);
                
                EventBus.emit('req-show-toast', { message: customMessage, type: 'success' });
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `فشل السيرفر: ${error.message}`, type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            this._actionLocks.delete(reviewId);
        }
    },
    reEvaluateDeposit: async function(depId) {
        if (this._actionLocks.has(depId)) return;
        this._actionLocks.add(depId);

        try {
            const dep = AdminData.data.depositsMap?.[depId] || AdminData.data.deposits.find(d => String(d.id) === String(depId));
            if (!dep || dep.status !== 'approved') return;
            
            let user = AdminData.data.usersMap?.[dep.userId] || AdminData.data.users.find(u => String(u.id) === String(dep.userId));
            
            if (!user) {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري فحص محفظة العميل في السحابة...');
                user = await FirebaseAdapter.getById('telecard_users', dep.userId);
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
                
                if (!user) {
                    EventBus.emit('req-show-toast', { message: 'لم يتم العثور على العميل المرتبط بهذا الإيداع', type: 'error' });
                    return;
                }
            }
            
            const amount = FinancialEngine.extractNum(dep.amount);
            const feeVal = FinancialEngine.extractNum(dep.feePct ?? dep.fee);
            const feeType = dep.feeType || 'fee';
            const feeUnit = dep.feeUnit || dep.unit || dep.calcMethod || 'percent';

            let feeAmount = (feeUnit === 'fixed' || feeUnit === 'amount') ?
                feeVal : FinancialEngine.safeMul(amount, FinancialEngine.safeDiv(feeVal, 100));

            let netPayCurr = (feeType === 'bonus') ?
                FinancialEngine.safeAdd(amount, feeAmount) : FinancialEngine.safeSub(amount, feeAmount);

            const fxRate = FinancialEngine.extractNum(dep.fxRate, false);
            const netBase = (dep.creditedAmount != null) ?
                FinancialEngine.extractNum(dep.creditedAmount) : FinancialEngine.safeMul(netPayCurr, fxRate);

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
                    const debtAmount = FinancialEngine.safeSub(netBase, currentBalance);
                    const plainDebtText = `${debtAmount.toFixed(2)} ${safeCurrency}`;
                    confirmMsg += `\n\n⚠️ تنبيه هام: لا يوجد رصيد كافٍ عند العميل حالياً.\nسوف يصبح رصيد العميل بالسالب كـ (دين عليه) بمقدار: ${plainDebtText}`;
                }
            }
            
            if (AdminUI && !await AdminUI.showConfirm(confirmMsg, confirmTitle)) return;

            const customMessage = isDeduction 
                ? `تم إلغاء الخصم وإعادة ${Math.abs(dep.amount)} ${dep.currency}`
                : `تم استرجاع إيداع بقيمة ${dep.amount} ${dep.currency}`;

            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تصحيح الرصيد سحابياً...');
            
            const result = await FirebaseAdapter.callFunction('adminProcessDeposit', {
                depositId: String(dep.id), action: 'refunded', adminNote: 'تم استرجاع الإيداع يدوياً من الإدارة'
            });
            
            if (result && result.success) {
                dep.status = 'refunded';
                
                // 🛡️ [التصحيح المعماري]: إزالة التحديث المحلي للرصيد والاعتماد على السيرفر (req-refresh)
                
                AdminUI?.FinanceUI?.closeDepositDrawer?.();
                EventBus.emit('req-refresh', { type: 'deposits' });
                
                setTimeout(() => {
                    EventBus.emit('req-refresh', { type: 'users' }); // جلب الأرصدة الحقيقية
                    const modalDetail = document.getElementById('m-user-detail');
                    if (modalDetail && modalDetail.classList.contains('active')) {
                        const currentEditedUserId = AdminRender?.UsersRender?.state?.currentEditUserId;
                        if (currentEditedUserId === dep.userId) {
                            EventBus.emit('action-triggered', { action: 'view-user', id: dep.userId, preventModalOpen: true });
                        }
                    }
                }, 500);
                
                const logName = dep.userDataSnapshot?.fullName || dep.userName || dep.userId;
                if (AdminData?.addLog) AdminData.addLog('REFUND_DEPOSIT', `${customMessage} للعميل ${logName}`);
                
                EventBus.emit('req-show-toast', { message: customMessage, type: 'success' });
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `فشل السيرفر: ${error.message}`, type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            this._actionLocks.delete(depId);
        }
    },

    deletePayment: async function(id) {
        if (!id || this._actionLocks.has('del-pay')) return;
        this._actionLocks.add('del-pay');

        try {
            const p = AdminData.data.payments.find(x => String(x.id) === String(id));
            if (!p) return;

            if (AdminUI && !await AdminUI.showConfirm(`هل أنت متأكد من حذف بوابة الدفع (${p.name}) نهائياً؟\nسيتم حذف الشعار وإزالة تسعيراتها من المتجر.`, 'تأكيد الحذف')) return;

            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري مسح البوابة وتحديث كاش المتجر...');
            
            if (p.img && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                await FirebaseAdapter.deleteImageByUrl(p.img).catch(() => {});
            }

            AdminData.data.payments = AdminData.data.payments.filter(x => String(x.id) !== String(id));
            await AdminData?.savePayments?.();
            
            if (typeof FirebaseAdapter !== 'undefined' && FirebaseAdapter.callFunction) {
                FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
            }

            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-payments',
                logAction: 'DELETE_PAY',
                logDetails: `تم حذف بوابة الدفع: ${p.name}`,
                toastMsg: 'تم حذف البوابة ومزامنة التسعير بنجاح'
            });

        } catch (error) {
            EventBus.emit('req-show-toast', { message: error.message || 'فشل الحذف', type: 'error' });
        } finally {
            this._actionLocks.delete('del-pay');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    }
};