// ============================================================================
// 🧠 متحكم المالية (modules/finance/financeController.js) - Cloud-Native V19.0 💎
// 🚀 التحديثات المعمارية (V19.0 - Zero-Bleed Sync, Strict Non-Negative Refund & Instant Counters): 
// 1. Strict Non-Negative Refund Shield 🛡️: منع استرجاع الإيداع إذا استهلك العميل الرصيد (تطابق 100% مع السيرفر).
// 2. Zero-Read User Balance Sync ⚡: تحديث رصيد العميل في الذاكرة بعد قبول/استرجاع الإيداع بـ 0 قراءات إضافية.
// 3. No Duplicate Pricing Sync 🧹: الاعتماد على تريجرات السيرفر التلقائية (onRateUpdate / onPaymentUpdate).
// 4. Orphan Logo Guard 🧹: إصلاح استبدال ومسح شعار بوابة الدفع وعرض شاشة التحميل بشكل سليم.
// 5. Data Integrity Shield 🛡️: حماية نصوص النسخ من التشفير وإغلاق ثغرة تغيير كود العملة.
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
        const payName = Utils.getVal('pay-name').trim();
        if (!payName) {
            EventBus.emit('req-show-toast', { message: 'يرجى إدخال اسم طريقة الدفع.', type: 'warning' });
            return;
        }
        
        const checks = AdminUI?.FinanceUI?.getCheckedCurrencies?.() || [];
        if (checks.length === 0) {
            EventBus.emit('req-show-toast', { message: 'يرجى اختيار عملة واحدة على الأقل لبوابة الدفع.', type: 'warning' });
            return;
        }
        
        let currSettings = {};
        let summaryMsg = 'يرجى مراجعة إعدادات الرسوم والبونص قبل الحفظ:\n\n';
        
        for (const code of checks) {
            const fType = Utils.getVal(`pay-feetype-${code}`) || 'fee';
            const fVal = Math.max(0, parseFloat(Utils.getVal(`pay-fee-${code}`)) || 0);
            const fUnit = Utils.getVal(`pay-feeunit-${code}`) || 'percent';
            const minVal = Math.max(0, parseFloat(Utils.getVal(`pay-min-${code}`)) || 0);
            const maxVal = Math.max(0, parseFloat(Utils.getVal(`pay-max-${code}`)) || 0);
            const minFeeVal = Math.max(0, parseFloat(Utils.getVal(`pay-minfee-${code}`)) || 0);
            const maxFeeVal = Math.max(0, parseFloat(Utils.getVal(`pay-maxfee-${code}`)) || 0);
            
            if (maxVal > 0 && minVal > maxVal) {
                EventBus.emit('req-show-toast', { message: `خطأ في عملة (${code}): أدنى حد للإيداع (${minVal}) أكبر من أعلى حد (${maxVal})!`, type: 'error' });
                return;
            }
            if (maxFeeVal > 0 && minFeeVal > maxFeeVal) {
                EventBus.emit('req-show-toast', { message: `خطأ في عملة (${code}): أدنى عمولة/بونص (${minFeeVal}) أكبر من أعلى عمولة/بونص (${maxFeeVal})!`, type: 'error' });
                return;
            }
            if (fUnit === 'percent' && fType === 'fee' && fVal > 75) {
                EventBus.emit('req-show-toast', { message: `خطأ في عملة (${code}): نسبة العمولة المئوية لا يمكن أن تتجاوز 75%.`, type: 'error' });
                return;
            }
            
            currSettings[code] = {
                feeType: fType,
                fee: fVal,
                feeUnit: fUnit,
                min: minVal,
                max: maxVal,
                minFee: minFeeVal,
                maxFee: maxFeeVal
            };
            
            const displayCode = AdminRender?.getCurrencySymbolText?.(code) || code;
            const typeText = fType === 'bonus' ? 'يمنح بونص إضافي (+)' : 'يخصم عمولة (-)';
            const unitText = fUnit === 'fixed' ? '(مبلغ ثابت)' : '(نسبة مئوية %)';
            summaryMsg += `• عملة ${displayCode}: ${typeText} بقيمة ${fVal} ${unitText}\n`;
        }
        
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
                    const mimeMatch = compressedBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
                    const mimeType = mimeMatch ? mimeMatch[1] : (fileToUpload.type || 'image/jpeg');
                    const byteString = atob(compressedBase64.split(',')[1]);
                    const ab = new ArrayBuffer(byteString.length);
                    const ia = new Uint8Array(ab);
                    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                    const blob = new Blob([ab], { type: mimeType });
                    fileForUpload = new File([blob], fileToUpload.name, { type: mimeType });
                }
                
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري رفع شعار البوابة للسحابة...');
                if (oldImg && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                    await FirebaseAdapter.deleteImageByUrl(oldImg).catch(() => {});
                }
                
                finalImg = await FirebaseAdapter.uploadImage(fileForUpload, 'payments', null, true);
            }
        } else if (oldImg) {
            if (typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                await FirebaseAdapter.deleteImageByUrl(oldImg).catch(() => {});
            }
            finalImg = '';
        }
        
        const existingPay = tempEditId ? AdminData.data.payments.find(p => String(p.id) === String(tempEditId)) : null;
        const currentActiveState = existingPay ? (existingPay.isActive !== false) : true;
        const cleanPlaceholder = Utils.getVal('pay-input-placeholder').trim();
        
        const finalDetails = Array.isArray(AdminData.tempPayDetails) ? AdminData.tempPayDetails : [];
        const newPay = {
            id: tempEditId || String(Date.now()),
            name: payName,
            detailFields: finalDetails || [],
            currencies: checks.join(',') || 'USD',
            currencySettings: currSettings,
            inputPlaceholder: cleanPlaceholder,
            depositLabel: cleanPlaceholder,
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
        EventBus.emit('req-show-toast', { message: 'فشل الحفظ: ' + (error.message || 'خطأ غير معروف'), type: 'error' });
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
        const val = Utils.getVal('pay-det-input').trim(); // 🚀 إصلاح: الحفظ الخام لتجنب تلف الروابط والحسابات
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
            const oldCode = Utils.getVal('cur-old-code').trim().toUpperCase();
            const code = (oldCode || Utils.getVal('cur-code')).trim().toUpperCase(); // 🚀 إجبار استخدام oldCode إن وجد
            const name = Utils.getVal('cur-name').trim();
            const symbol = Utils.getVal('cur-symbol').trim();
            const rawPriceRate = Utils.getVal('cur-price-rate');
            const rawDepRate = Utils.getVal('cur-dep-rate');

            if (!code || !name) { EventBus.emit('req-show-toast', { message: 'تنبيه: يرجى إدخال رمز واسم العملة بشكل صحيح.', type: 'warning' }); return; }
            if (code === 'USD') { EventBus.emit('req-show-toast', { message: 'إجراء مرفوض: لا يمكن تعديل الدولار كونه العملة المرجعية الأساسية للنظام.', type: 'error' }); return; }
            if (rawPriceRate === '' || rawDepRate === '') { EventBus.emit('req-show-toast', { message: 'تنبيه: يرجى تعبئة جميع حقول أسعار الصرف المطلوبة.', type: 'warning' }); return; }

            const priceRate = parseFloat(rawPriceRate);
            const depRate = parseFloat(rawDepRate);

            if (isNaN(priceRate) || isNaN(depRate) || priceRate <= 0 || depRate <= 0) { EventBus.emit('req-show-toast', { message: 'خطأ في الإدخال: يجب أن تكون قيمة سعر الصرف رقماً صحيحاً وأكبر من الصفر.', type: 'error' }); return; }
            
            if (priceRate === 1 || depRate === 1) { 
                const confirmStable = await AdminUI.showConfirm('أنت تقوم بإضافة عملة سعر صرفها (1) مطابق تماماً للدولار (مثل USDT).\nهل تود الاستمرار واعتمادها كعملة مستقرة؟', 'تأكيد عملة مستقرة');
                if (!confirmStable) return;
            }

            let rates = Array.isArray(AdminData.data.rates) ? [...AdminData.data.rates] : [];
            if (!oldCode && rates.find(c => String(c.code).toUpperCase() === code)) { EventBus.emit('req-show-toast', { message: 'رمز العملة المُدخل مسجل مسبقاً في النظام.', type: 'info' }); return; }

            const warningTitle = '⚠️ تأكيد تحديث أسعار الصرف';
            const warningMsg = `يرجى العلم بأن تحديث سعر صرف عملة (${code}) سينعكس تلقائياً وبشكل فوري على تسعير كافة المنتجات في المتجر.\n\n• سعر البيع المعتمد: ${priceRate}\n• سعر الإيداع المعتمد: ${depRate}\n\nهل تود تأكيد واعتماد هذه القيم؟`;

            if (AdminUI && !await AdminUI.showConfirm(warningMsg, warningTitle)) return;
            
            // 🚀 تثبيت id === code دائماً لحل مشاكل الفقدان
            const rateObj = { id: code, code, name, symbol, priceRate, depRate, isBase: false };
            if (oldCode) {
                const idx = rates.findIndex(c => String(c.code).toUpperCase() === oldCode);
                if (idx > -1) rates[idx] = { ...rates[idx], ...rateObj, id: rates[idx].id || code };
            } else {
                rates.push(rateObj);
            }
            
            AdminData.data.rates = rates; 
            
            if (!AdminData.data.ratesMap) AdminData.data.ratesMap = {};
            AdminData.data.ratesMap[code] = rateObj;
            
            await AdminData?.saveRates?.();
            
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
            
            if (AdminData.data.ratesMap) delete AdminData.data.ratesMap[code];
            
            await AdminData?.saveRates?.();
            
            if (isDefaultDisplay) { AdminData.data.settings.defaultCurrency = 'USD'; await AdminData?.saveSystemSettings?.(); }
            
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

            const oldStatus = dep.status;
            const note = Utils.getVal('dep-drawer-note');
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
                if (note) dep.adminNote = note;
                
                if (AdminRender?.FinanceRender?.adjustTabCountersOnStatusChange) {
                    AdminRender.FinanceRender.adjustTabCountersOnStatusChange(oldStatus, mappedAction);
                }
                if (AdminRender?.decrementLocalBadge) {
                    AdminRender.decrementLocalBadge('deposit');
                }

                if (AdminUI?.FinanceUI?.closeDepositDrawer) AdminUI.FinanceUI.closeDepositDrawer();
                else if (AdminUI?.closeDepositDrawer) AdminUI.closeDepositDrawer();
                
                if (mappedAction === 'approved') {
    if (AdminRender?.FinanceRender) AdminRender.FinanceRender._liquidityFetchedOnce = false;
    if (AdminData.data?.dashboardStats) AdminData.data.dashboardStats.wallets = null;
}
const cachedUser = AdminData.data.usersMap?.[String(dep.userId)];
if (cachedUser && mappedAction === 'approved') {
    const amtLocal = Number(dep.creditedAmount ?? dep.amount ?? 0);
    cachedUser.walletBalance = FinancialEngine.sanitizeAmount(FinancialEngine.safeAdd(cachedUser.walletBalance || 0, amtLocal));
}
                EventBus.emit('req-render-deposits');
                
                const modalDetail = document.getElementById('m-user-detail');
                const openUserEditBtn = modalDetail?.classList.contains('active')
                    ? modalDetail.querySelector(`.ud-header-clean [data-action="open-user-edit"][data-id="${dep.userId}"]`)
                    : null;

                if (openUserEditBtn) {
                    const updatedUser = await FirebaseAdapter.getById('telecard_users', String(dep.userId));
                    if (updatedUser && AdminData.data.usersMap) {
                        AdminData.data.usersMap[String(dep.userId)] = updatedUser;
                    }
                    EventBus.emit('action-triggered', { action: 'view-user', id: dep.userId, preventModalOpen: true });
                }
                
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

            if (dep.method === 'إيداع إداري' || dep.method === 'خصم إداري') {
                EventBus.emit('req-show-toast', { message: 'العمليات الإدارية المباشرة يتم تعديلها من خلال أزرار (إيداع / خصم) داخل ملف العميل.', type: 'warning' });
                return;
            }
            
            let user = AdminData.data.usersMap?.[dep.userId] || (AdminData.data.users || []).find(u => String(u.id) === String(dep.userId));
            const netBase = Number(dep.creditedAmount !== undefined ? dep.creditedAmount : (dep.amount || 0));
            const absNetBase = Math.abs(netBase);

            // 🛡️ إذا كان العميل غير موجود في الذاكرة أو ظهر أن رصيده في الذاكرة أقل من قيمة الإيداع، نتحقق من رصيده الحي من السحابة أولاً لمنع المنع الكاذب
            if (!user || Number(user.walletBalance ?? user.balance ?? 0) < absNetBase) {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري فحص محفظة العميل في السحابة...');
                const freshUser = await FirebaseAdapter.getById('telecard_users', dep.userId);
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
                
                if (freshUser) {
                    user = freshUser;
                    if (!AdminData.data.usersMap) AdminData.data.usersMap = {};
                    AdminData.data.usersMap[String(user.id)] = user;
                } else if (!user) {
                    EventBus.emit('req-show-toast', { message: 'لم يتم العثور على العميل المرتبط بهذا الإيداع', type: 'error' });
                    return;
                }
            }
            
            const currentBalance = Number(user.walletBalance ?? user.balance ?? 0);
            const safeCurrency = (user.baseCurrency || dep.targetCurrency || 'USD').toUpperCase();
            
            if (currentBalance < absNetBase) {
                const msg = `⚠️ لا يمكن استرجاع هذا الإيداع حالياً!\n\nرصيد العميل الحالي (${currentBalance.toFixed(2)} ${safeCurrency}) أقل من قيمة الإيداع المراد سحبه (${absNetBase.toFixed(2)} ${safeCurrency}) لأن العميل استهلك الرصيد.\n\nإذا كان للعميل طلبات معلقة أو مكتملة، قم برفضها أو استرجاعها أولاً لتعود السيولة لمحفظته ثم استرجع الإيداع.`;
                if (AdminUI?.showAlert) {
                    await AdminUI.showAlert(msg, 'رصيد العميل لا يغطي السحب');
                } else {
                    EventBus.emit('req-show-toast', { message: 'لا يمكن التراجع عن الإيداع: رصيد العميل الحالي لا يغطي قيمة السحب.', type: 'error' });
                }
                return;
            }
            
            const confirmTitle = "تأكيد استرجاع الإيداع";
            const confirmMsg = `هل أنت متأكد من استرجاع هذا الإيداع وخصم مبلغ (${absNetBase.toFixed(2)} ${safeCurrency}) من رصيد محفظة العميل؟`;
            
            if (AdminUI && !await AdminUI.showConfirm(confirmMsg, confirmTitle)) return;

            const oldStatus = dep.status;
            const customMessage = `تم استرجاع إيداع بقيمة ${dep.amount} ${dep.currency}`;

            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تصحيح الرصيد سحابياً...');
            
            const result = await FirebaseAdapter.callFunction('adminProcessDeposit', {
                depositId: String(dep.id), action: 'refunded', adminNote: 'تم استرجاع الإيداع يدوياً من الإدارة'
            });
            
       if (result && result.success) {
    dep.status = 'refunded';
    user.walletBalance = FinancialEngine.sanitizeAmount(Math.max(0, FinancialEngine.safeSub(currentBalance, absNetBase)));
    if (AdminRender?.FinanceRender) AdminRender.FinanceRender._liquidityFetchedOnce = false;
    if (AdminData.data?.dashboardStats) AdminData.data.dashboardStats.wallets = null;
                if (AdminRender?.FinanceRender?.adjustTabCountersOnStatusChange) {
                    AdminRender.FinanceRender.adjustTabCountersOnStatusChange(oldStatus, 'refunded');
                }
                
                AdminUI?.FinanceUI?.closeDepositDrawer?.();
                EventBus.emit('req-render-deposits');
                
                const modalDetail = document.getElementById('m-user-detail');
                const openUserEditBtn = modalDetail?.classList.contains('active')
                    ? modalDetail.querySelector(`.ud-header-clean [data-action="open-user-edit"][data-id="${dep.userId}"]`)
                    : null;

                if (openUserEditBtn) {
                    EventBus.emit('action-triggered', { action: 'view-user', id: dep.userId, preventModalOpen: true });
                }
                
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
    },    auditUserWallet: async function(userId) {
        if (this._actionLocks.has(`audit-${userId}`)) return;
        this._actionLocks.add(`audit-${userId}`);
        
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري التدقيق المحاسبي وفحص السجلات سحابياً...');
        
        try {
            const result = await FirebaseAdapter.callFunction('adminAuditUserWallet', { userId: String(userId) });
            
            if (result && result.success) {
                EventBus.emit('req-show-toast', { message: result.message, type: 'success' });
            } else if (result && result.requiresCorrection) {
                const data = result.data;
                const confirmMsg = `🚨 تم اكتشاف خلل مالي للمستخدم!\n\n` +
                    `• الرصيد المسجل حالياً: ${data.currentWalletBal}\n` +
                    `• الرصيد الحقيقي المفترض: ${data.expectedBalance}\n` +
                    `• الفارق المالي: ${data.difference}\n\n` +
                    `هل تريد إجبار النظام على تصحيح الرصيد واعتماد الرصيد الحقيقي (${data.expectedBalance})؟`;
                
                if (AdminUI && await AdminUI.showConfirm(confirmMsg, '⚠️ تصحيح محاسبي إجباري')) {
                    if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تطبيق التصحيح...');
                    
                    const correctionResult = await FirebaseAdapter.callFunction('adminAuditUserWallet', {
                        userId: String(userId),
                        forceCorrect: true
                    });
                    
                    if (correctionResult && correctionResult.success) {
                        if (AdminData.data.usersMap?.[String(userId)]) {
                            AdminData.data.usersMap[String(userId)].walletBalance = data.expectedBalance;
                        }
                        EventBus.emit('req-show-toast', { message: 'تم تصحيح الرصيد سحابياً بنجاح!', type: 'success' });
                        EventBus.emit('action-triggered', { action: 'view-user', id: userId, preventModalOpen: true });
                    }
                }
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `فشل التدقيق: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete(`audit-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
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
