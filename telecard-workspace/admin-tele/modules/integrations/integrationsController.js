// ============================================================================
// 🧠 متحكم الربط والموردين (modules/integrations/integrationsController.js)
// 🎯 الوظيفة: إدارة واجهة الموردين والتواصل مع المحرك السحابي (Supplier Engine)
// 🌟 التحديث: الترقية لـ Firebase v10 Modular SDK لحل مشكلة (firebase is not defined)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

// 🌟 استيراد مكتبات فايربيز الإصدار الحديث (v10)
import { getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const IntegrationsController = {

    // ==========================================
    // 🛡️ 1. حفظ بيانات المورد (آمن سحابياً)
    // ==========================================
    saveSupplier: async function(id = null) {
        const name = Utils.getVal('supp-name');
        const type = Utils.getVal('supp-type');
        const baseUrl = Utils.getVal('supp-url');
        const token = Utils.getVal('supp-token');
        const margin = parseFloat(Utils.getVal('supp-margin')) || 0;
        const autoSyncEl = document.getElementById('supp-auto-sync');
        const autoSync = autoSyncEl ? autoSyncEl.checked : false;

        // تحقق مبدئي من صحة الإدخال
        if (!name || !baseUrl) {
            EventBus.emit('req-show-toast', { message: 'يرجى ملء البيانات الأساسية للمورد (الاسم والرابط)', type: 'error' });
            return;
        }

        EventBus.emit('req-show-loader', true);

        try {
            // 🌟 1. استدعاء الدالة السحابية بالطريقة الحديثة (v10)
            const app = getApp();
            const functions = getFunctions(app);
            const saveCloud = httpsCallable(functions, 'secureSaveSupplier');
            
            const response = await saveCloud({ id, name, type, baseUrl, token, defaultMargin: margin, autoSync });
            
            // استلام الـ ID النهائي (سواء كان قديماً أو جديداً تم توليده في السحابة)
            const finalId = response.data.id;

            // 2. تحديث محلي سريع للواجهة (نحن لا نحفظ الـ token محلياً إطلاقاً لأسباب أمنية)
            const supplierData = { 
                id: finalId, 
                name, 
                type, 
                baseUrl, 
                defaultMargin: margin, 
                autoSync, 
                isActive: true,
                importedCount: id ? (this.getSupplier(id)?.importedCount || 0) : 0,
                lastSync: id ? (this.getSupplier(id)?.lastSync || null) : null
            };

            if (!AdminData.data.suppliers) AdminData.data.suppliers = [];

            if (id) {
                const idx = AdminData.data.suppliers.findIndex(s => String(s.id) === String(id));
                if (idx > -1) {
                    AdminData.data.suppliers[idx] = Object.assign(AdminData.data.suppliers[idx], supplierData);
                }
            } else {
                AdminData.data.suppliers.push(supplierData);
            }

            // حفظ التحديثات في الذاكرة المحلية
            if (AdminData.saveSystemSettings) await AdminData.saveSystemSettings();


            AppController.finishAction('req-render-integrations', 'modal', id ? 'UPDATE_SUPPLIER' : 'ADD_SUPPLIER', `المورد: ${name}`, 'تم حفظ بيانات المورد بأمان تام');
            
        } catch (error) {
            console.error("Save Supplier Error:", error);
            EventBus.emit('req-show-toast', { message: 'حدث خطأ أثناء الاتصال بالسيرفر لحفظ المورد.', type: 'error' });
        } finally {
            EventBus.emit('req-show-loader', false);
        }
    },

    // ==========================================
    // ⚡ 2. تفعيل أو تعطيل المورد
    // ==========================================
    toggleSupplier: async function(id, isChecked) {
        const supp = this.getSupplier(id);
        if (!supp) return;

        try {
            // 🌟 1. تحديث قاعدة البيانات السحابية مباشرة بالطريقة الحديثة (v10)
            const suppRef = doc(FirebaseAdapter.db, 'telecard_suppliers', String(id));
            await updateDoc(suppRef, {
                isActive: isChecked,
                updatedAt: serverTimestamp()
            });

            // 2. تحديث الحالة المحلية والذاكرة
            supp.isActive = isChecked;
            if (AdminData.saveSettings) await AdminData.saveSettings();

            EventBus.emit('req-show-toast', { 
                message: isChecked ? `تم تفعيل المورد: ${supp.name}` : `تم إيقاف المورد: ${supp.name}`, 
                type: isChecked ? 'success' : 'info' 
            });

        } catch (error) {
            console.error("Toggle Supplier Error:", error);
            // نظام تراجع (Rollback): إذا فشل الاتصال، نعيد الزر لشكله القديم
            EventBus.emit('req-show-toast', { message: 'فشل تغيير حالة المورد، يرجى التحقق من الاتصال.', type: 'error' });
            EventBus.emit('req-render-integrations'); 
        }
    },

    // ==========================================
    // 🚀 3. عملية المزامنة السحابية الحقيقية (Cloud Sync)
    // ==========================================
    syncSupplier: async function(id) {
        const supp = this.getSupplier(id);
        if (!supp) return;

        // لا يمكن مزامنة مورد معطل
        if (!supp.isActive) {
            EventBus.emit('req-show-toast', { message: 'لا يمكن مزامنة مورد وهو في حالة "متوقف". يرجى تفعيله أولاً.', type: 'warning' });
            return;
        }

        EventBus.emit('req-show-loader', true);

        try {
            // 🌟 استدعاء المزامنة السحابية بالطريقة الحديثة (v10)
            const app = getApp();
            const functions = getFunctions(app);
            const syncData = httpsCallable(functions, 'syncSupplierData');
            
            const response = await syncData({ supplierId: id });
            const result = response.data;

            if (result.success) {
                // تحديث العدادات والإحصائيات بناءً على رد السيرفر الفعلي
                supp.lastSync = Date.now(); 
                supp.importedCount = result.importedCount || 0;
                
                if (AdminData.saveSettings) await AdminData.saveSettings();
                
                AppController.finishAction('req-render-integrations', null, 'SYNC_SUPPLIER', `مزامنة المورد: ${supp.name}`, result.message);
            }
        } catch (error) {
            console.error("Sync Failed:", error);
            EventBus.emit('req-show-toast', { 
                message: error.message || 'فشلت المزامنة. تأكد من صحة الرابط ومفتاح الـ API.', 
                type: 'error' 
            });
        } finally {
            EventBus.emit('req-show-loader', false);
        }
    },

    // ==========================================
    // 🔍 4. دالة مساعدة لجلب المورد من الذاكرة
    // ==========================================
    getSupplier: (id) => (AdminData.data.suppliers || []).find(s => String(s.id) === String(id))
};
