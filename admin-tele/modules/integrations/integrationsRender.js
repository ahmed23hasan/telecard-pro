// ============================================================================
// 🖥️ محرك رسم الربط والموردين (modules/integrations/integrationsRender.js)
// 🎯 الوظيفة: جلب بيانات الموردين من الذاكرة ورسمهم على الشاشة
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { EventBus } from '../../adminUtils.js';

export const IntegrationsRender = {
    
    // تسجيل المستمعات (Listeners)
    initListeners: function() {
        EventBus.on('req-render-integrations', () => this.renderSuppliers());
    },

    // دالة الرسم الأساسية
    renderSuppliers: function() {
        // البحث عن الصفحة في الـ HTML (سنضيفها في الخطوة القادمة)
        const view = document.getElementById('view-integrations');
        if (!view || !view.classList.contains('active')) return;

        const container = document.getElementById('suppliers-grid');
        if (!container) return;

        // جلب الموردين من الذاكرة المركزية
        const suppliers = AdminData.data.suppliers || [];

        // إذا لم يكن هناك موردين، نعرض حالة "فارغ"
        if (suppliers.length === 0) {
            container.innerHTML = AdminTemplates.emptySuppliers();
            return;
        }

        // إذا كان هناك موردين، نقوم بتوليد الكروت الخاص بهم
        const htmlArray = suppliers.map(supp => AdminTemplates.supplierCard(supp));
        container.innerHTML = htmlArray.join('');
    }
};
