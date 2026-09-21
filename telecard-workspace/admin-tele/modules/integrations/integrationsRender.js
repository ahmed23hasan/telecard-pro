// ============================================================================
// 🖥️ محرك رسم الربط والموردين (modules/integrations/integrationsRender.js) 💎
// 🌟 التحديثات المعمارية:
// 1. Repaint Bottleneck Fix 🛡️: تغليف عملية رسم كل مورد داخل try/catch لحماية الواجهة.
// 2. Defects Modal Renderer 📊: إضافة دالة لرسم نافذة الأكواد التالفة.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { IntegrationsTemplates } from './integrationsTemplates.js';
import { EventBus } from '../../adminUtils.js';

export const IntegrationsRender = {
    
    initListeners: function() {
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
    },
    
    // 🚀 [الإضافة المعمارية]: رسم نافذة الأكواد التالفة
    renderDefectsModal: function(supplierName, defects) {
        const oldOverlay = document.getElementById('supplier-defects-overlay');
        if (oldOverlay) oldOverlay.remove();
        
        const html = IntegrationsTemplates.supplierDefectsModal(supplierName, defects);
        document.body.insertAdjacentHTML('beforeend', html);
        
        const overlay = document.getElementById('supplier-defects-overlay');
        if (overlay) {
            // إضافة كلاس active لتشغيل الأنيميشن
            setTimeout(() => { overlay.classList.add('active'); }, 10);
        }
    }
};