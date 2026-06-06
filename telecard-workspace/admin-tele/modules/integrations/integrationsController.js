// ============================================================================
// 🧠 متحكم الربط والموردين (modules/integrations/integrationsController.js) - Pro 🚀
// 🎯 الوظيفة: إدارة واجهة الموردين والتواصل مع المحرك السحابي (Supplier Engine)
// 🌟 التحديث: توحيد البوابة المركزية (Adapter) + حماية الـ Timeout + شاشات احترافية
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';
// 🌟 استيراد البوابة المركزية فقط (لا حاجة لاستيراد فايربيز يدوياً بعد الآن)
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const IntegrationsController = {

    // ==========================================
    // 🛡️ 1. حفظ بيانات المورد (عبر البوابة السحابية)
    // ==========================================
    saveSupplier: async function(id = null) {
        const name = Utils.getVal('supp-name');
        const type = Utils.getVal('supp-type');
        const baseUrl = Utils.getVal('supp-url');
        const token = Utils.getVal('supp-token');
        const margin = parseFloat(Utils.getVal('supp-margin')) || 0;
        const autoSyncEl = document.getElementById('supp-auto-sync');
        const autoSync = autoSyncEl ? autoSyncEl.checked : false;

        if (!name || !baseUrl) {
            EventBus.emit('req-show-toast', { message: 'يرجى ملء البيانات الأساسية للمورد (الاسم والرابط)', type: 'error' });
            return;
        }

        // 🌟 شاشة تحميل احترافية
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تشفير وحفظ بيانات المورد سحابياً...');

        try {
            // 🌟 1. استدعاء السيرفر عبر البوابة المدرعة (محمية بـ Timeout + موجهة لـ us-east1)
            const result = await FirebaseAdapter.callFunction('secureSaveSupplier', { 
                id, name, type, baseUrl, token, defaultMargin: margin, autoSync 
            });
            
            if (result && result.success) {
                const finalId = result.id;

                // 2. تحديث محلي سريع للواجهة (الباسورد/التوكن لا يُحفظ محلياً أبداً)
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

                // حفظ التحديثات في الذاكرة المحلية (بدون التوكن)
                if (AdminData.saveSystemSettings) await AdminData.saveSystemSettings();

                AppController.finishAction('req-render-integrations', 'modal', id ? 'UPDATE_SUPPLIER' : 'ADD_SUPPLIER', `تحديث المورد: ${name}`, 'تم حفظ بيانات المورد بأمان تام');
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
            // 🌟 استخدام البوابة المركزية لتحديث حالة المورد في قاعدة البيانات
            await FirebaseAdapter.set('telecard_suppliers', String(id), {
                isActive: isChecked,
                updatedAt: Date.now()
            });

            // تحديث الحالة المحلية والذاكرة
            supp.isActive = isChecked;
            if (AdminData.saveSystemSettings) await AdminData.saveSystemSettings();

            EventBus.emit('req-show-toast', { 
                message: isChecked ? `تم تفعيل المورد (${supp.name}) بنجاح` : `تم إيقاف المورد (${supp.name}) مؤقتاً`, 
                type: 'success' 
            });

        } catch (error) {
            console.error("Toggle Supplier Error:", error);
            // نظام تراجع (Rollback): إذا فشل الاتصال، نعيد الزر لشكله القديم
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

        // 🌟 شاشة تحميل واضحة لمنع الأدمن من العبث أثناء جلب آلاف المنتجات
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, `جاري مزامنة المنتجات من سيرفرات (${supp.name})، قد يستغرق الأمر بعض الوقت...`);

        try {
            // 🌟 استدعاء المزامنة السحابية عبر البوابة المدرعة (محمية من التعليق)
            const result = await FirebaseAdapter.callFunction('syncSupplierData', { supplierId: id });

            if (result && result.success) {
                // تحديث العدادات والإحصائيات محلياً
                supp.lastSync = Date.now(); 
                supp.importedCount = result.importedCount || 0;
                
                if (AdminData.saveSystemSettings) await AdminData.saveSystemSettings();
                
                AppController.finishAction(
                    'req-render-integrations', 
                    null, 
                    'SYNC_SUPPLIER', 
                    `مزامنة المورد: ${supp.name} (${result.importedCount} منتج)`, 
                    result.message || `تمت المزامنة بنجاح!`
                );
            }
        } catch (error) {
            console.error("Sync Failed:", error);
            // 🌟 رسالة خطأ دقيقة تظهر للمشرف
            let errorMsg = error.message || 'فشلت المزامنة. تأكد من صحة الرابط ومفتاح الـ API.';
            if (errorMsg.includes('Timeout')) errorMsg = `سيرفر المورد (${supp.name}) لا يستجيب حالياً (Timeout).`;
            
            EventBus.emit('req-show-toast', { message: errorMsg, type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    // ==========================================
    // 🔍 4. دالة مساعدة لجلب المورد من الذاكرة
    // ==========================================
    getSupplier: (id) => (AdminData.data.suppliers || []).find(s => String(s.id) === String(id))
};