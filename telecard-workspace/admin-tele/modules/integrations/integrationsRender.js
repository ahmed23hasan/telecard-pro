// ============================================================================
// 🖥️ محرك رسم الربط والموردين (modules/integrations/integrationsRender.js) 💎
// ============================================================================

import { AdminData } from '../../adminData.js';
import { IntegrationsTemplates } from './integrationsTemplates.js';
import { EventBus } from '../../adminUtils.js';

export const IntegrationsRender = {
    
    initListeners: function() {
        EventBus.on('req-render-integrations', () => this.renderSuppliers());
    },
    
    renderSuppliers: function() {
        const view = document.getElementById('view-integrations');
        if (!view || !view.classList.contains('active')) return;
        
        const container = document.getElementById('suppliers-grid');
        if (!container) return;
        
        const suppliers = AdminData.data.suppliers || [];
        
        if (suppliers.length === 0) {
            container.innerHTML = IntegrationsTemplates.emptySuppliers();
            return;
        }
        
        // 🌟 بناء HTML بشكل نظيف ودفعة واحدة لتخفيف استهلاك المتصفح (Repaint Optimization)
        const htmlString = suppliers.map(supp => IntegrationsTemplates.supplierCard(supp)).join('');
        container.innerHTML = htmlString;
    }
};