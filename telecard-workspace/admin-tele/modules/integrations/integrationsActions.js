// ============================================================================
// 🗺️ موجه أحداث الربط (modules/integrations/integrationsActions.js) - V18.4 💎
// 🚀 التحديثات:
// 1. Defects Ledger Route 🔗: ربط مسار فتح السجل الجنائي للمورد (الأكواد التالفة).
// ============================================================================

import { IntegrationsController } from './integrationsController.js';
import { IntegrationsUI } from './integrationsUI.js';
import { AdminUI } from '../../adminUI.js'; // 🚀 لفتح نافذة الطلبات الجانبية

export const IntegrationsActions = {
    'open-add-supplier': () => IntegrationsUI.openSupplierModal(),
    'open-supplier-edit': (data) => IntegrationsUI.openSupplierModal(data.id),
    'save-supplier': (data) => IntegrationsController.saveSupplier(data.id),
    'toggle-supplier': (data) => IntegrationsController.toggleSupplier(data.id, data.element.checked),
    'sync-supplier': (data) => IntegrationsController.syncSupplier(data.id),
    
    // 🚀 [الإضافة الجديدة]: مسار فتح سجل الأكواد التالفة للمورد
    'view-supplier-defects': (data) => IntegrationsController.viewSupplierDefects(data.id, data.name),
    
    // 🚀 [الإضافة الجديدة]: مسار فتح الطلب من داخل نافذة التوالف
    'open-order-drawer': (data) => AdminUI?.OrdersUI?.openOrderDrawer?.(data.id)
};