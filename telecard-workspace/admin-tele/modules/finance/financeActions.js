// ============================================================================
// 🗺️ خريطة مسارات المالية (Finance Actions Router)
// 💡 الوظيفة: استلام أحداث الإيداعات، بوابات الدفع، والعملات وتوجيهها
// ============================================================================

import { AppController } from '../../core/appController.js';
import { FinanceController } from './financeController.js'; // 🆕 استدعاء المتحكم الجديد
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';

export const FinanceActions = {
    // --- 1. قسم الإيداعات (Deposits) ---
    'open-deposit-drawer': (data) => AdminUI?.FinanceUI?.openDepositDrawer?.(data.id),
    
    // 🔗 توجيه أحداث الإيداع لـ FinanceController
    'submit-deposit': (data) => FinanceController.submitDepositReview?.(data.type),
    'reevaluate-deposit': (data) => FinanceController.reEvaluateDeposit?.(data.id),
    
    'load-more-deposits': () => AdminRender?.loadMoreDeposits?.(),
    'filter-deposits': (data) => AdminRender?.filterByTab?.('deposits', data.val, data.element),
    
    // --- 2. قسم بوابات الدفع (Payment Gateways) ---
    'open-payment-modal': (data) => AdminUI?.FinanceUI?.openPaymentModal?.(data.id),
    
    // 🔗 توجيه أحداث البوابات
    'save-pay': () => FinanceController.savePay?.(),
    'toggle-payment-status': (data) => FinanceController.togglePaymentStatus?.(data.id, data.element.checked),
    'add-pay-detail': () => FinanceController.addPayDetail?.(),
    'remove-pay-detail': (data) => FinanceController.removePayDetail?.(Number(data.index)),
    
    'toggle-curr-settings': () => AdminUI?.FinanceUI?.toggleCurrencySettings?.(),  
    // --- 3. قسم العملات وأسعار الصرف (Currencies & Rates) ---
    'open-edit-currency': (data) => AdminUI?.FinanceUI?.openEditCurrency?.(data.id || data.code),
    
    // 🌟 إضافة هذا السطر الجديد لاستقبال نقرة زر "جعلها عملة العرض"
    'set-default-display': (data) => FinanceController.setDefaultDisplayCurrency?.(data.code),
    
    // 🔗 توجيه أحداث العملات
    'save-currency': () => FinanceController.saveCurrency?.(),
    'change-currency-display': (data) => FinanceController.changeCurrencyDisplay?.(data.val),
    
    // 👇 السطر المسؤول عن ربط زر الحذف بالمتحكم 👇
    'delete-currency': (data) => FinanceController.deleteCurrency?.(data.code)
};
