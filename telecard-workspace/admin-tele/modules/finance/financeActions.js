// ============================================================================
// 🗺️ خريطة مسارات المالية (Finance Actions Router) - النسخة الماسية V4.2 💎
// 💡 الوظيفة: استلام أحداث الإيداعات، بوابات الدفع، والعملات وتوجيهها للمتحكم
// 🚀 التحديث المعماري: كسر الارتباط الدائري الميت تماماً بحذف الاستيراد غير المستخدم
// ============================================================================

import { FinanceController } from './financeController.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';

// 🚀 [نقاء هندسي]: تم حذف استيراد AppController تماماً لحماية لوحة الإدارة من الانهيار عند الإقلاع

export const FinanceActions = {
    // --- 1. قسم الإيداعات (Deposits) ---
    'open-deposit-drawer': (data) => AdminUI?.FinanceUI?.openDepositDrawer?.(data.id),
    
    // 🔗 توجيه أحداث الإيداع لـ FinanceController المطور بـ O(1)
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
    
    // 🌟 استقبال نقرة زر "جعلها عملة العرض الافتراضية للضيوف"
    'set-default-display': (data) => FinanceController.setDefaultDisplayCurrency?.(data.code),
    
    // 🔗 توجيه أحداث العملات
    'save-currency': () => FinanceController.saveCurrency?.(),
    'change-currency-display': (data) => FinanceController.changeCurrencyDisplay?.(data.val),
    
    // 🔗 توجيه أحداث الحذف بأمان
    'delete-currency': (data) => FinanceController.deleteCurrency?.(data.code)
};