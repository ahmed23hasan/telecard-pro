// ============================================================================
// 🧠 متحكم الربط والموردين (modules/integrations/integrationsController.js) - V15.0 💎
// 🎯 الوظيفة: إدارة واجهة الموردين والتواصل مع المحرك السحابي (Supplier Engine)
// 🌟 التحديث الأقصى: 
// 1. Audit Trail Fix: تسجيل عمليات الإيقاف والتفعيل في السجل لضمان المساءلة الرقابية.
// 2. فك الارتباط الدائري، ترقية البحث لـ O(1)، وتوحيد الـ UI Events.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const IntegrationsController = {

    // ==========================================
    // 🛡️ 1. حفظ بيانات المورد (عبر البوابة السحابية)
    // ==========================================
    saveSupplier: async function(id = null) {
        const name = Utils.escapeHTML(Utils.getVal('supp-name'));
        const type = Utils.escapeHTML(Utils.getVal('supp-type'));
        const baseUrl = Utils.escapeHTML(Utils.getVal('supp-url'));
        const token = Utils.escapeHTML(Utils.getVal('supp-token'));
        const margin = parseFloat(Utils.getVal('supp-margin')) || 0;
        
        const autoSync = Utils.getCheck('supp-auto-sync');

        if (!name || !baseUrl) {
            EventBus.emit('req-show-toast', { message: 'يرجى ملء البيانات الأساسية للمورد (الاسم والرابط)', type: 'error' });
            return;
        }

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تشفير وحفظ بيانات المورد سحابياً...');

        try {
            const result = await FirebaseAdapter.callFunction('secureSaveSupplier', { 
                id, name, type, baseUrl, token, defaultMargin: margin, autoSync 
            });
            
            if (result && result.success) {
                const finalId = result.id;

                const supplierData = { 
                    id: finalId, name, type, baseUrl, defaultMargin: margin, autoSync, isActive: true,
                    importedCount: id ? (this.getSupplier(id)?.importedCount || 0) : 0,
                    lastSync: id ? (this.getSupplier(id)?.lastSync || null) : null
                };

                if (!AdminData.data.suppliers) AdminData.data.suppliers = [];

                if (id) {
                    const idx = AdminData.data.suppliers.findIndex(s => String(s.id) === String(id));
                    if (idx > -1) AdminData.data.suppliers[idx] = Object.assign(AdminData.data.suppliers[idx], supplierData);
                } else {
                    AdminData.data.suppliers.push(supplierData);
                }

                if (!AdminData.data.suppliersMap) AdminData.data.suppliersMap = {};
                AdminData.data.suppliersMap[finalId] = supplierData;

                if (AdminData.saveSystemSettings) await AdminData.saveSystemSettings();

                EventBus.emit('req-finish-action', {
                    renderEvent: 'req-render-integrations',
                    modalId: 'modal', 
                    logAction: id ? 'UPDATE_SUPPLIER' : 'ADD_SUPPLIER',
                    logDetails: `تحديث المورد: ${name}`,
                    toastMsg: 'تم حفظ بيانات المورد بأمان تام'
                });
            }
        } catch (error) {
            console.error("Save Supplier Error:", error);
            EventBus.emit('req-show-toast', { message: `فشل الحفظ: ${error.message}`, type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    // ==========================================
    // ⚡ 2. تفعيل أو تعطيل المورد
    // ==========================================
    toggleSupplier: async function(id, isChecked) {
        const supp = this.getSupplier(id);
        if (!supp) return;

        try {
            await FirebaseAdapter.set('telecard_suppliers', String(id), {
                isActive: isChecked,
                updatedAt: Date.now()
            });

            supp.isActive = isChecked;
            if (AdminData.saveSystemSettings) await AdminData.saveSystemSettings();

            // 🛡️ [سد الثغرة الأمنية]: توثيق الحدث في السجلات الجنائية للإدارة
            if (AdminData.addLog) {
                AdminData.addLog('TOGGLE_SUPPLIER', `تم ${isChecked ? 'تفعيل' : 'إيقاف'} المورد: ${supp.name}`);
            }

            EventBus.emit('req-show-toast', { 
                message: isChecked ? `تم تفعيل المورد (${supp.name}) بنجاح` : `تم إيقاف المورد (${supp.name}) مؤقتاً`, 
                type: 'success' 
            });

        } catch (error) {
            console.error("Toggle Supplier Error:", error);
            EventBus.emit('req-show-toast', { message: 'فشل تغيير حالة المورد، تأكد من الاتصال بالإنترنت.', type: 'error' });
            EventBus.emit('req-render-integrations'); 
        }
    },

    // ==========================================
    // 🚀 3. عملية المزامنة السحابية الحقيقية (Cloud Sync)
    // ==========================================
    syncSupplier: async function(id) {
        const supp = this.getSupplier(id);
        if (!supp) return;

        if (!supp.isActive) {
            EventBus.emit('req-show-toast', { message: 'لا يمكن مزامنة مورد وهو في حالة "متوقف". يرجى تفعيله أولاً.', type: 'warning' });
            return;
        }

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, `جاري مزامنة المنتجات من سيرفرات (${supp.name})، قد يستغرق الأمر بعض الوقت...`);

        try {
            const result = await FirebaseAdapter.callFunction('syncSupplierData', { supplierId: id });

            if (result && result.success) {
                supp.lastSync = Date.now(); 
                supp.importedCount = result.importedCount || 0;
                
                if (AdminData.saveSystemSettings) await AdminData.saveSystemSettings();
                
                EventBus.emit('req-finish-action', {
                    renderEvent: 'req-render-integrations',
                    modalId: null,
                    logAction: 'SYNC_SUPPLIER',
                    logDetails: `مزامنة المورد: ${supp.name} (${result.importedCount} منتج)`,
                    toastMsg: result.message || `تمت المزامنة بنجاح!`
                });
            }
        } catch (error) {
            console.error("Sync Failed:", error);
            let errorMsg = error.message || 'فشلت المزامنة. تأكد من صحة الرابط ومفتاح الـ API.';
            if (errorMsg.includes('Timeout')) errorMsg = `سيرفر المورد (${supp.name}) لا يستجيب حالياً (Timeout).`;
            
            EventBus.emit('req-show-toast', { message: errorMsg, type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    // ==========================================
    // 🔍 4. البحث الفوري (O(1) Engine)
    // ==========================================
    getSupplier: (id) => AdminData.data.suppliersMap?.[id] || (AdminData.data.suppliers || []).find(s => String(s.id) === String(id))
};
