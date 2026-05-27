// ============================================================================
// 🖥️ محرك رسم الربط والموردين (modules/integrations/integrationsRender.js)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { IntegrationsTemplates } from './integrationsTemplates.js'; // 🌟 الإصلاح: استيراد القوالب الصحيحة
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
            // 🌟 الإصلاح: استخدام IntegrationsTemplates
            container.innerHTML = IntegrationsTemplates.emptySuppliers();
            return;
        }

        // 🌟 الإصلاح: استخدام IntegrationsTemplates
        const htmlArray = suppliers.map(supp => IntegrationsTemplates.supplierCard(supp));
        container.innerHTML = htmlArray.join('');
    }
};
