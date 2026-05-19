// ============================================================================
// 🧠 متحكم الربط والموردين (modules/integrations/integrationsController.js)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';

export const IntegrationsController = {

    // 1. حفظ أو تحديث بيانات المورد
    saveSupplier: async function(id = null) {
        const name = Utils.getVal('supp-name');
        const type = Utils.getVal('supp-type');
        const baseUrl = Utils.getVal('supp-url');
        const token = Utils.getVal('supp-token');
        const margin = parseFloat(Utils.getVal('supp-margin')) || 0;
        const autoSync = document.getElementById('supp-auto-sync')?.checked;

        if (!name || !baseUrl) {
            EventBus.emit('req-show-toast', { message: 'يرجى ملء البيانات الأساسية للمورد', type: 'error' });
            return;
        }

        const supplierData = {
            id: id || 'supp_' + Date.now(),
            name, type, baseUrl, token, 
            defaultMargin: margin,
            autoSync,
            isActive: true,
            importedCount: id ? (this.getSupplier(id)?.importedCount || 0) : 0,
            lastSync: id ? (this.getSupplier(id)?.lastSync || null) : null
        };

        if (id) {
            const idx = AdminData.data.suppliers.findIndex(s => String(s.id) === String(id));
            if (idx > -1) AdminData.data.suppliers[idx] = supplierData;
        } else {
            if (!AdminData.data.suppliers) AdminData.data.suppliers = [];
            AdminData.data.suppliers.push(supplierData);
        }

        await AdminData.saveSettings?.(); // حفظ في الذاكرة
        AppController.finishAction('req-render-integrations', 'modal', id ? 'UPDATE_SUPPLIER' : 'ADD_SUPPLIER', `المورد: ${name}`, 'تم حفظ بيانات المورد بنجاح');
    },

    // 2. تفعيل أو تعطيل المورد
    toggleSupplier: async function(id, isChecked) {
        const supp = this.getSupplier(id);
        if (supp) {
            supp.isActive = isChecked;
            await AdminData.saveSettings?.();
            EventBus.emit('req-show-toast', { 
                message: isChecked ? `تم تفعيل المورد ${supp.name}` : `تم تعطيل المورد ${supp.name}`, 
                type: 'info' 
            });
        }
    },

    // 3. محاكاة عملية المزامنة (Mock Sync)
    syncSupplier: async function(id) {
        const supp = this.getSupplier(id);
        if (!supp) return;

        EventBus.emit('req-show-loader', true);
        
        // محاكاة تأخير الشبكة (2 ثانية)
        setTimeout(async () => {
            supp.lastSync = Date.now();
            supp.importedCount = (supp.importedCount || 0) + Math.floor(Math.random() * 5); // زيادة وهمية للتجربة
            
            await AdminData.saveSettings?.();
            EventBus.emit('req-show-loader', false);
            AppController.finishAction('req-render-integrations', null, 'SYNC_SUPPLIER', `مزامنة المورد: ${supp.name}`, 'تمت المزامنة وتحديث الأسعار بنجاح');
        }, 2000);
    },

    getSupplier: (id) => (AdminData.data.suppliers || []).find(s => String(s.id) === String(id))
};
