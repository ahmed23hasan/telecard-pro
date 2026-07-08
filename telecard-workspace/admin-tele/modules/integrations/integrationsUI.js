// ============================================================================
// 🔌 واجهة الربط التفاعلية (modules/integrations/integrationsUI.js) 💎
// ============================================================================

import { AdminData } from '../../adminData.js';
import { IntegrationsTemplates } from './integrationsTemplates.js';
import { EventBus } from '../../adminUtils.js';

export const IntegrationsUI = {
    openSupplierModal: function(id = null) {
        // 🌟 التحديث: استخدام خريطة البحث الفورية O(1) مع fallback آمن
        const supplier = id ? (AdminData.data.suppliersMap?.[id] || (AdminData.data.suppliers || []).find(s => String(s.id) === String(id))) : null;
        
        const container = document.getElementById('supplier-modal-body');
        
        if (container) {
            container.innerHTML = IntegrationsTemplates.supplierModal(supplier);
            
            EventBus.emit('req-open-modal', 'supplier');
            
            const title = document.getElementById('supplier-modal-title');
            if (title) title.innerHTML = id ? '<i class="fa-solid fa-user-gear"></i> إعدادات المورد' : '<i class="fa-solid fa-user-plus"></i> إضافة مورد جديد';
        } else {
            console.error("🚨 خطأ: لم يتم العثور على العنصر 'supplier-modal-body' في الواجهة");
        }
    }
};