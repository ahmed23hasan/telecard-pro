// ============================================================================
// 🗺️ خريطة مسارات المالية (Finance Actions Router) - النسخة الماسية V19.7 💎
// 💡 الوظيفة: استلام أحداث الإيداعات، بوابات الدفع، والعملات وتوجيهها للمتحكم
// 🚀 التحديث المعماري: 
// 1. Two-Tabs Routing 🏛️: ربط مسار (switch-pay-tab) للتبديل بين تبويبات نافذة الدفع المزدوجة.
// 2. Complete Modal & Drawer Wiring 🔗: ربط فتح نافذة إضافة بوابة دفع وإغلاق درج الإيداع.
// 3. Decoupled Architecture: توجيه أحداث الحذف والتعديل مباشرة للمتحكم المالي.
// 4. Silent Bug Fix: إصلاح مسار إعدادات العملة المخفية (toggle-currency-settings).
// 5. Adaptive UI Route 🎨: ربط مسار (change-fee-type) لتبديل مسميات وألوان العمولة/البونص لحظياً.
// ============================================================================

import { FinanceController } from './financeController.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';

export const FinanceActions = {
    // --- 1. قسم الإيداعات (Deposits) ---
    'ignore-click': () => {},
'open-deposit-drawer': (data) => AdminUI?.FinanceUI?.openDepositDrawer?.(data.id),
    'close-deposit-drawer': () => AdminUI?.FinanceUI?.closeDepositDrawer?.(),
    'submit-deposit': (data) => FinanceController.submitDepositReview?.(data.type),
    'reevaluate-deposit': (data) => FinanceController.reEvaluateDeposit?.(data.id),
    'load-more-deposits': () => AdminRender?.loadMoreDeposits?.(),
    'filter-deposits': (data) => AdminRender?.filterByTab?.('deposits', data.val, data.element),
    
    // --- 2. قسم بوابات الدفع (Payment Gateways) ---
    'open-payment-modal': () => AdminUI?.FinanceUI?.openPaymentModal?.(null),
    'edit-payment': (data) => AdminUI?.FinanceUI?.openPaymentModal?.(data.id),
    'delete-payment': (data) => FinanceController.deletePayment?.(data.id),
    
    'save-pay': () => FinanceController.savePay?.(),
    'toggle-payment-status': (data) => FinanceController.togglePaymentStatus?.(data.id, data.element.checked),
    'add-pay-detail': () => FinanceController.addPayDetail?.(),
    'remove-pay-detail': (data) => FinanceController.removePayDetail?.(Number(data.index)),
    
    'toggle-currency-settings': () => AdminUI?.FinanceUI?.toggleCurrencySettings?.(),
    'switch-pay-tab': (data) => AdminUI?.FinanceUI?.switchPayTab?.(data.tab), // 👈 مسار نظام التبويبات الجديد

    // 🚀 مسار تغيير نوع الرسوم اللحظي (عمولة خصم أو بونص إضافي)
    'change-fee-type': (data) => AdminUI?.FinanceUI?.handleFeeTypeChange?.(data.code, data.element.value),
    
    // --- 3. قسم العملات وأسعار الصرف (Currencies & Rates) ---
    'open-edit-currency': (data) => AdminUI?.FinanceUI?.openEditCurrency?.(data.id || data.code),
    'set-default-display': (data) => FinanceController.setDefaultDisplayCurrency?.(data.code),
    'save-currency': () => FinanceController.saveCurrency?.(),
    'change-currency-display': (data) => FinanceController.changeCurrencyDisplay?.(data.val),
    'delete-currency': (data) => FinanceController.deleteCurrency?.(data.code)
};
