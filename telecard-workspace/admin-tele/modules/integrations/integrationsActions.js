// ============================================================================
// 🗺️ موجه أحداث الربط (modules/integrations/integrationsActions.js) - V18.5 💎
// 🚀 التحديثات:
// 1. Decoupled Navigation 🔀: استخدام EventBus لفتح نافذة الطلبات بدلاً من الاتصال المباشر بوحدة الطلبات لتجنب أخطاء التحميل.
// 2. Safe Modal Closure 🛡️: إضافة مسار إغلاق نافذة الأكواد التالفة.
// ============================================================================

import { IntegrationsController } from './integrationsController.js';
import { IntegrationsUI } from './integrationsUI.js';
import { EventBus } from '../../adminUtils.js';

export const IntegrationsActions = {
    'open-add-supplier': () => IntegrationsUI.openSupplierModal(),
    'open-supplier-edit': (data) => IntegrationsUI.openSupplierModal(data.id),
    'save-supplier': (data) => IntegrationsController.saveSupplier(data.id),
    'toggle-supplier': (data) => IntegrationsController.toggleSupplier(data.id, data.element.checked),
    'sync-supplier': (data) => IntegrationsController.syncSupplier(data.id),
    
    // 🚀 مسار فتح سجل الأكواد التالفة للمورد
    'view-supplier-defects': (data) => IntegrationsController.viewSupplierDefects(data.id, data.name),
    
    // 🚀 [الإصلاح المعماري 2]: إغلاق النافذة بشكل آمن وأنيمشن سلس
    'close-supplier-defects': () => IntegrationsUI.closeDefectsModal(),
    
    // 🚀 [الإصلاح المعماري 1]: استخدام الحدث المركزي لفتح الطلب من أي مكان لمنع الانهيار
    'open-order-drawer': (data) => {
        // نغلق نافذة التوالف أولاً لتسهيل رؤية الطلب
        IntegrationsUI.closeDefectsModal();
        // نوجه النظام لفتح الطلب بأمان عبر نظام الأحداث المركزي
        EventBus.emit('action-triggered', { action: 'open-order-drawer', id: data.id });
    }
};
