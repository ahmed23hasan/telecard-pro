// ============================================================================
// 🔌 واجهة الربط التفاعلية (modules/integrations/integrationsUI.js)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { IntegrationsTemplates } from './integrationsTemplates.js'; // 🌟 الإصلاح: استيراد القوالب الصحيحة
import { EventBus } from '../../adminUtils.js';

export const IntegrationsUI = {
    openSupplierModal: function(id = null) {
        const supplier = id ? (AdminData.data.suppliers || []).find(s => String(s.id) === String(id)) : null;
        
        const container = document.getElementById('supplier-modal-body'); 
        
        if (container) {
            // 🌟 الإصلاح: استخدام IntegrationsTemplates بدلاً من AdminTemplates
            container.innerHTML = IntegrationsTemplates.supplierModal(supplier);
            
            EventBus.emit('req-open-modal', 'supplier'); 
            
            const title = document.getElementById('supplier-modal-title');
            if (title) title.innerHTML = id ? '<i class="fa-solid fa-user-gear"></i> تعديل مورد' : '<i class="fa-solid fa-user-plus"></i> إضافة مورد جديد';
        } else {
            console.error("🚨 خطأ: لم يتم العثور على العنصر 'supplier-modal-body' في الواجهة");
        }
    }
};
