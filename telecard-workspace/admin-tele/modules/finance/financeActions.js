// ============================================================================
// 🗺️ خريطة مسارات المالية (Finance Actions Router) - النسخة الماسية V18.5 💎
// 💡 الوظيفة: استلام أحداث الإيداعات، بوابات الدفع، والعملات وتوجيهها للمتحكم
// 🚀 التحديث المعماري: 
// 1. Decoupled Architecture: توجيه أحداث الحذف والتعديل مباشرة للمتحكم المالي.
// 2. Silent Bug Fix: إصلاح مسار إعدادات العملة المخفية (toggle-currency-settings).
// ============================================================================

import { FinanceController } from './financeController.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';

export const FinanceActions = {
    // --- 1. قسم الإيداعات (Deposits) ---
    'open-deposit-drawer': (data) => AdminUI?.FinanceUI?.openDepositDrawer?.(data.id),
    'submit-deposit': (data) => FinanceController.submitDepositReview?.(data.type),
    'reevaluate-deposit': (data) => FinanceController.reEvaluateDeposit?.(data.id),
    'load-more-deposits': () => AdminRender?.loadMoreDeposits?.(),
    'filter-deposits': (data) => AdminRender?.filterByTab?.('deposits', data.val, data.element),
    
    // --- 2. قسم بوابات الدفع (Payment Gateways) ---
    // 🚀 [تصحيح الأسلاك]: توجيه التعديل والحذف مباشرة للمالية
    'edit-payment': (data) => AdminUI?.FinanceUI?.openPaymentModal?.(data.id),
    'delete-payment': (data) => FinanceController.deletePayment?.(data.id),
    
    'save-pay': () => FinanceController.savePay?.(),
    'toggle-payment-status': (data) => FinanceController.togglePaymentStatus?.(data.id, data.element.checked),
    'add-pay-detail': () => FinanceController.addPayDetail?.(),
    'remove-pay-detail': (data) => FinanceController.removePayDetail?.(Number(data.index)),
    
    // 🎯 [إصلاح الثغرة الصامتة]: تطابق الاسم مع الـ Checkbox في القوالب
    'toggle-currency-settings': () => AdminUI?.FinanceUI?.toggleCurrencySettings?.(),
    
    // --- 3. قسم العملات وأسعار الصرف (Currencies & Rates) ---
    'open-edit-currency': (data) => AdminUI?.FinanceUI?.openEditCurrency?.(data.id || data.code),
    'set-default-display': (data) => FinanceController.setDefaultDisplayCurrency?.(data.code),
    'save-currency': () => FinanceController.saveCurrency?.(),
    'change-currency-display': (data) => FinanceController.changeCurrencyDisplay?.(data.val),
    'delete-currency': (data) => FinanceController.deleteCurrency?.(data.code)
};
