// ============================================================================
// 🗺️ موجه أحداث الربط (modules/integrations/integrationsActions.js)
// ============================================================================

import { IntegrationsController } from './integrationsController.js';
import { IntegrationsUI } from './integrationsUI.js';

export const IntegrationsActions = {
    // فتح نافذة إضافة مورد جديد
    'open-add-supplier': () => IntegrationsUI.openSupplierModal(),
    
    // فتح نافذة تعديل مورد موجود
    'open-supplier-edit': (data) => IntegrationsUI.openSupplierModal(data.id),
    
    // حفظ بيانات المورد (إضافة أو تعديل)
    'save-supplier': (data) => IntegrationsController.saveSupplier(data.id),
    
    // تفعيل/تعطيل المورد من السويتش
    'toggle-supplier': (data) => IntegrationsController.toggleSupplier(data.id, data.element.checked),
    
    // بدء عملية المزامنة اليدوية
    'sync-supplier': (data) => IntegrationsController.syncSupplier(data.id)
};
