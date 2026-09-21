// ============================================================================
// 🔌 واجهة الربط التفاعلية (modules/integrations/integrationsUI.js) 💎
// 🚀 التحديثات المعمارية (V18.4 - UI Thread Protection):
// 1. Thread Shield 🛡️: تغليف عملية فتح النافذة بـ try/catch لمنع انهيار الواجهة في حال تلف البيانات.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { IntegrationsTemplates } from './integrationsTemplates.js';
import { EventBus } from '../../adminUtils.js';

export const IntegrationsUI = {
    openSupplierModal: function(id = null) {
        try {
            const supplier = id ? (AdminData.data.suppliersMap?.[id] || (AdminData.data.suppliers || []).find(s => String(s.id) === String(id))) : null;
            
            const container = document.getElementById('supplier-modal-body');
            
            if (container) {
                container.innerHTML = IntegrationsTemplates.supplierModal(supplier);
                
                EventBus.emit('req-open-modal', 'supplier');
                
                const title = document.getElementById('supplier-modal-title');
                if (title) {
                    title.innerHTML = id ? '<i class="fa-solid fa-user-gear"></i> إعدادات المورد' : '<i class="fa-solid fa-user-plus"></i> إضافة مورد جديد';
                }
            } else {
                console.error("🚨 خطأ: لم يتم العثور على العنصر 'supplier-modal-body' في الواجهة");
            }
        } catch (error) {
            console.error("🚨 خطأ في فتح نافذة المورد:", error);
            EventBus.emit('req-show-toast', { message: 'حدث خطأ أثناء تهيئة نافذة المورد.', type: 'error' });
        }
    }
};