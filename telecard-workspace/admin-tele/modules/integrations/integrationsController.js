// ============================================================================
// 🧠 متحكم الربط والموردين (modules/integrations/integrationsController.js) - V18.6 💎
// 🚀 التحديثات المعمارية (V18.6 - Sync UI Lock): 
// 1. UI Sync Lock 🔒: تجميد أزرار بطاقة المورد (المزامنة، الإعدادات، التوالف) أثناء الاتصال بالسيرفر لمنع التضارب.
// 2. Defects Fetcher 🕵️‍♂️: إضافة دالة لجلب الأكواد التالفة (API) من السيرفر وعرضها.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const IntegrationsController = {

    _actionLocks: new Set(), 

    saveSupplier: async function(id = null) {
        if (this._actionLocks.has('save-supplier')) return;

        const name = Utils.escapeHTML(Utils.getVal('supp-name'));
        const type = Utils.escapeHTML(Utils.getVal('supp-type'));
        const baseUrl = Utils.escapeHTML(Utils.getVal('supp-url'));
        let token = Utils.escapeHTML(Utils.getVal('supp-token'));
        const margin = parseFloat(Utils.getVal('supp-margin')) || 0;
        
        const currency = Utils.escapeHTML(Utils.getVal('supp-currency')) || 'USD';
        const autoSync = Utils.getCheck('supp-auto-sync');

        if (!name || !baseUrl) {
            EventBus.emit('req-show-toast', { message: 'يرجى ملء البيانات الأساسية للمورد (الاسم والرابط)', type: 'error' });
            return;
        }

        this._actionLocks.add('save-supplier');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تشفير وحفظ بيانات المورد سحابياً...');

        try {
            if (id && (!token || token.includes('••••'))) {
                token = ''; 
            }

            const result = await FirebaseAdapter.callFunction('secureSaveSupplier', { 
                id, name, type, baseUrl, token, defaultMargin: margin, autoSync, currency 
            });
            
            if (result && result.success) {
                const finalId = result.id || id || 'supp_' + Date.now();

                const supplierData = { 
                    id: finalId, name, type, baseUrl, defaultMargin: margin, autoSync, isActive: true, currency,
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

                EventBus.emit('req-finish-action', {
                    renderEvent: 'req-render-integrations',
                    modalId: 'supplier',
                    logAction: id ? 'UPDATE_SUPPLIER' : 'ADD_SUPPLIER',
                    logDetails: `تحديث المورد: ${name}`,
                    toastMsg: 'تم حفظ بيانات المورد بأمان تام'
                });
            } else {
                throw new Error(result?.message || 'رفض السيرفر العملية');
            }
        } catch (error) {
            console.error("Save Supplier Error:", error);
            EventBus.emit('req-show-toast', { message: `فشل الحفظ: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete('save-supplier');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    toggleSupplier: async function(id, isChecked) {
        if (this._actionLocks.has(`toggle-${id}`)) return;
        
        const supp = this.getSupplier(id);
        if (!supp) return;

        this._actionLocks.add(`toggle-${id}`);

        try {
            await FirebaseAdapter.updateDocument('telecard_suppliers', String(id), { 
                isActive: isChecked, 
                updatedAt: Date.now() 
            });

            supp.isActive = isChecked;
            
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
        } finally {
            this._actionLocks.delete(`toggle-${id}`);
        }
    },

    syncSupplier: async function(id) {
        if (this._actionLocks.has(`sync-${id}`)) return;

        const supp = this.getSupplier(id);
        if (!supp) return;

        if (!supp.isActive) {
            EventBus.emit('req-show-toast', { message: 'لا يمكن مزامنة مورد وهو في حالة "متوقف". يرجى تفعيله أولاً.', type: 'warning' });
            return;
        }

        this._actionLocks.add(`sync-${id}`);
        
        // 🚀 [الإصلاح المعماري 3]: تجميد كافة الأزرار والمفاتيح الخاصة بهذا المورد في الواجهة أثناء المزامنة
        const cardElementsToDisable = document.querySelectorAll(`[data-id="${id}"]`);
        cardElementsToDisable.forEach(el => {
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
                el.disabled = true;
                el.classList.add('opacity-50');
                el.style.pointerEvents = 'none';
            }
        });

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, `جاري مزامنة المنتجات من سيرفرات (${supp.name})، الرجاء عدم إغلاق النافذة...`);

        try {
            const result = await FirebaseAdapter.callFunction('syncSupplierData', { supplierId: id });

            if (result && result.success) {
                supp.lastSync = Date.now(); 
                supp.importedCount = result.importedCount || 0;
                
                setTimeout(() => {
                    EventBus.emit('req-refresh', { type: 'products' });
                    EventBus.emit('req-refresh', { type: 'vault' });
                }, 1500);

                EventBus.emit('req-finish-action', {
                    renderEvent: 'req-render-integrations',
                    modalId: null,
                    logAction: 'SYNC_SUPPLIER',
                    logDetails: `مزامنة المورد: ${supp.name} (${result.importedCount} منتج تم، ${result.deletedCount} معطل، ${result.revokedCount} كود تالف)`,
                    toastMsg: result.message || `تمت المزامنة بنجاح!`
                });
            } else {
                throw new Error(result?.message || 'فشلت عملية المزامنة السحابية.');
            }
        } catch (error) {
            console.error("Sync Failed:", error);
            let errorMsg = error.message || 'فشلت المزامنة. تأكد من صحة الرابط ومفتاح الـ API.';
            if (errorMsg.includes('Timeout')) errorMsg = `سيرفر المورد (${supp.name}) استغرق وقتاً طويلاً. لا تقلق، السيرفر لا يزال يعمل في الخلفية وسيتم تحديث المنتجات قريباً.`;
            
            EventBus.emit('req-show-toast', { message: errorMsg, type: 'error' });
        } finally {
            this._actionLocks.delete(`sync-${id}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            
            // 🚀 فك التجميد عن الأزرار في حال فشل المزامنة وعدم إعادة رسم الواجهة
            cardElementsToDisable.forEach(el => {
                if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
                    el.disabled = false;
                    el.classList.remove('opacity-50');
                    el.style.pointerEvents = 'auto';
                }
            });
        }
    },

    viewSupplierDefects: async function(supplierId, supplierName) {
        if (this._actionLocks.has('view-defects')) return;
        this._actionLocks.add('view-defects');
        
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري جلب السجل الجنائي للمورد من السحابة...');
        
        try {
            const result = await FirebaseAdapter.fetchMoreWithCursor(
                'telecard_supplier_defects', 
                [['supplierId', '==', String(supplierId)]], 
                'reportedAt', 
                null, 
                100 
            );

            const defects = result.data || [];
            
            import('./integrationsRender.js').then(({ IntegrationsRender }) => {
                if (IntegrationsRender && IntegrationsRender.renderDefectsModal) {
                    IntegrationsRender.renderDefectsModal(supplierName, defects);
                }
            });
            
        } catch (error) {
            console.error("Failed to fetch supplier defects:", error);
            EventBus.emit('req-show-toast', { message: 'فشل جلب الأكواد التالفة للمورد', type: 'error' });
        } finally {
            this._actionLocks.delete('view-defects');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    getSupplier: (id) => AdminData.data.suppliersMap?.[id] || (AdminData.data.suppliers || []).find(s => String(s.id) === String(id))
};
