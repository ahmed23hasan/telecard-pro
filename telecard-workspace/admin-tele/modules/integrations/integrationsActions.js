// ============================================================================
// 🗺️ موجه أحداث الربط والموردين (modules/integrations/integrationsActions.js) - V20.5 💎
// 🎯 الوظيفة: استقبال أحداث واجهة الموردين وتوجيهها للمتحكم والنوافذ السحابية
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
    'filter-supplier-catalog': (data) => IntegrationsUI.filterSupplierCatalogModal?.(data.val),
    
    // --- 2. سجل الأكواد التالفة والمطالبة بالتعويض (Defects) ---
    'view-supplier-defects': (data) => IntegrationsController.viewSupplierDefects(data.id, data.name),
    'load-more-supplier-defects': (data) => IntegrationsController.viewSupplierDefects(data.id, data.name, true),
    'close-supplier-defects': () => IntegrationsUI.closeDefectsModal(),
    
    'view-defect-order': (data) => {
        if (!data.id) return;
        IntegrationsUI.closeDefectsModal();
        EventBus.emit('action-triggered', { action: 'open-order-drawer', id: data.id });
    }
};