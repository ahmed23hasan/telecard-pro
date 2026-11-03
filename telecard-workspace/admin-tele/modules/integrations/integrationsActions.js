// ============================================================================
// 🗺️ موجه أحداث الربط والموردين (modules/integrations/integrationsActions.js) - V20.1 💎
// 🎯 الوظيفة: استقبال أحداث واجهة الموردين وتوجيهها للمتحكم والنوافذ السحابية
// 🚀 التحديثات المعمارية (V20.1 - Cloud Catalog Explorer):
// 1. Cloud Delete Route 🗑️: إضافة مسار حذف المورد (delete-supplier) لفك ارتباط المنتجات سحابياً.
// 2. Live Balance Route 💰: إضافة مسار فحص رصيد المورد المباشر (check-supplier-balance).
// 3. Defects Navigation 🐛: تأمين مسار معاينة الطلب التالف والانتقال السلس لدرج الطلبات.
// 4. Cloud Catalog Explorer 🔍: إضافة مسار لاستعراض منتجات المورد وأكوادها حياً (fetch-supplier-catalog).
// ============================================================================

import { IntegrationsController } from './integrationsController.js';
import { IntegrationsUI } from './integrationsUI.js';
import { EventBus } from '../../adminUtils.js';

export const IntegrationsActions = {
    // --- 1. إدارة الموردين وإعدادات الربط ---
    'open-add-supplier': () => IntegrationsUI.openSupplierModal(),
    'open-supplier-edit': (data) => IntegrationsUI.openSupplierModal(data.id),
    'save-supplier': (data) => IntegrationsController.saveSupplier(data.id),
    'delete-supplier': (data) => IntegrationsController.deleteSupplier(data.id),
    'toggle-supplier': (data) => IntegrationsController.toggleSupplier(data.id, data.element?.checked),
    'sync-supplier': (data) => IntegrationsController.syncSupplier(data.id),
    'check-supplier-balance': (data) => IntegrationsController.checkSupplierBalance(data.id),
    'fetch-supplier-catalog': (data) => IntegrationsController.fetchSupplierCatalog(data.id),
    
    // --- 2. سجل الأكواد التالفة والمطالبة بالتعويض (Defects) ---
    'view-supplier-defects': (data) => IntegrationsController.viewSupplierDefects(data.id, data.name),
    'load-more-supplier-defects': (data) => IntegrationsController.viewSupplierDefects(data.id, data.name, true),
    'close-supplier-defects': () => IntegrationsUI.closeDefectsModal(),
    
    // 🚀 [الإصلاح المعماري]: إغلاق نافذة التالف والانتقال فوراً لدرج تفاصيل الطلب بأمان
    'view-defect-order': (data) => {
        IntegrationsUI.closeDefectsModal();
        EventBus.emit('action-triggered', { action: 'open-order-drawer', id: data.id });
    }
};
