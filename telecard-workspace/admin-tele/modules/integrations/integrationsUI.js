// ============================================================================
// 🔌 واجهة الربط التفاعلية (modules/integrations/integrationsUI.js)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { EventBus } from '../../adminUtils.js';

export const IntegrationsUI = {
    openSupplierModal: function(id = null) {
        const supplier = id ? (AdminData.data.suppliers || []).find(s => String(s.id) === String(id)) : null;
        
        // 👇 تم التحديث هنا ليتطابق مع admin.html 👇
        const container = document.getElementById('supplier-modal-body'); 
        
        if (container) {
            container.innerHTML = AdminTemplates.supplierModal(supplier);
            
            // 👇 تم التحديث هنا لفتح نافذة الموردين (m-supplier) 👇
            EventBus.emit('req-open-modal', 'supplier'); 
            
            // تحديث عنوان النافذة
            const title = document.getElementById('supplier-modal-title');
            if (title) title.innerHTML = id ? '<i class="fa-solid fa-user-gear"></i> تعديل مورد' : '<i class="fa-solid fa-user-plus"></i> إضافة مورد جديد';
        } else {
            console.error("🚨 خطأ: لم يتم العثور على العنصر 'supplier-modal-body' في الواجهة");
        }
    }
};
