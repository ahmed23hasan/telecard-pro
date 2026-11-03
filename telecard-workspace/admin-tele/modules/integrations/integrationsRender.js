// ============================================================================
// 🖥️ محرك رسم الربط والموردين (modules/integrations/integrationsRender.js) - V19.0
// 🌟 التحديثات المعمارية:
// 1. Pure Renderer 🛡️: إزالة دالة النوافذ بالكامل ليصبح الملف محرك رسم نقي للقوائم فقط.
// 2. Memory Leak Shield 🛡️: إضافة قفل _listenersBound لمنع تكرار الأحداث.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { IntegrationsTemplates } from './integrationsTemplates.js';
import { EventBus } from '../../adminUtils.js';

export const IntegrationsRender = {
    
    _listenersBound: false,
    
    initListeners: function() {
        if (this._listenersBound) return;
        this._listenersBound = true;
        
        EventBus.on('req-render-integrations', () => this.renderSuppliers());
    },
    
    renderSuppliers: function() {
        try {
            const view = document.getElementById('view-integrations');
            if (!view || !view.classList.contains('active')) return;
            
            const container = document.getElementById('suppliers-grid');
            if (!container) return;
            
            const suppliers = AdminData.data.suppliers || [];
            
            if (suppliers.length === 0) {
                container.innerHTML = IntegrationsTemplates.emptySuppliers();
                return;
            }
            
            const htmlString = suppliers.map(supp => {
                try {
                    return IntegrationsTemplates.supplierCard(supp);
                } catch (err) {
                    console.error("خطأ في رسم المورد (يتم تجاهله):", supp, err);
                    return '';
                }
            }).join('');
            
            container.innerHTML = htmlString;
            
        } catch (error) {
            console.error("🚨 خطأ حرج في محرك رسم الموردين:", error);
        }
    }
};