// ============================================================================
// 🧠 متحكم المطورين والربط (modules/developer/developerController.js) - Pro 🚀
// 🎯 الوظيفة: معالجة العمليات المنطقية للـ API و Webhooks بأعلى معايير الأمان
// 🌟 التحديث: شاشات حماية (Loaders) + تراجع آمن (Rollback) + دقة سجلات النظام
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';
import { AdminUI } from '../../adminUI.js';

export const DeveloperController = {
    
    // =========================================================
    // 🔑 1. توليد مفتاح API جديد للعميل
    // =========================================================
    generateApiKey: async function(userId) {
        if (!userId) return;
        
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;
        
        const displayName = user.fullName || user.username || user.name || 'العميل';
        
        // رسالة تأكيد إذا كان يمتلك مفتاحاً قديماً
        if (user.apiKey) {
            const confirmMsg = `العميل (${displayName}) يمتلك مفتاحاً نشطاً بالفعل.\n\n⚠️ تجديد المفتاح سيؤدي إلى إيقاف اتصال متاجره الحالية فوراً ولن تعود تعمل حتى يتم وضع المفتاح الجديد.\n\nهل أنت متأكد من رغبتك بالتجديد؟`;
            const confirm = await AdminUI.showConfirm(confirmMsg, 'تحذير أمني خطير');
            if (!confirm) return;
        }
        
        // 🌟 التحديث الأمني: توليد مفتاح مشفر حقيقي وآمن جداً (Cryptographically Secure)
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        const secureString = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        const newKey = 'tc_live_' + secureString;
        
        const oldKey = user.apiKey; // لحفظ خط الرجعة
        
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري توليد وتشفير المفتاح سحابياً...');
        
        try {
            user.apiKey = newKey;
            await AdminData?.saveUsers?.();
            
            if (AdminData?.addLog) {
                AdminData.addLog('API_KEY_GENERATED', `تم توليد مفتاح ربط (API) جديد للعميل: ${displayName}`);
            }
            EventBus.emit('req-show-toast', { message: `تم توليد وتوثيق المفتاح للعميل (${displayName}) بنجاح`, type: 'success' });
            
            // إعادة رسم نافذة العميل لظهور المفتاح الجديد
            EventBus.emit('action-triggered', { action: 'view-user', id: userId });
            setTimeout(() => EventBus.emit('action-triggered', { action: 'switch-user-tab', tab: 'developer' }), 50);
            
        } catch (error) {
            console.error("API Key Generation Error:", error);
            user.apiKey = oldKey; // 🌟 تراجع آمن (Rollback) في حال فشل السيرفر
            EventBus.emit('req-show-toast', { message: 'تعذر حفظ المفتاح في السحابة، يرجى المحاولة مجدداً.', type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    
    // =========================================================
    // 🛑 2. إبطال (حذف) مفتاح الـ API
    // =========================================================
    revokeApiKey: async function(userId) {
        if (!userId) return;
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user || !user.apiKey) return;
        
        const displayName = user.fullName || user.username || user.name || 'العميل';
        
        const confirm = await AdminUI.showConfirm(`هل أنت متأكد من إبطال مفتاح العميل (${displayName})؟\nلن يتمكن العميل من الاتصال بمتجرك عبر الـ API بعد الآن.`, 'تأكيد إبطال المفتاح');
        if (!confirm) return;
        
        const oldKey = user.apiKey; // لحفظ خط الرجعة
        
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إبطال صلاحيات المفتاح سحابياً...');
        
        try {
            delete user.apiKey;
            await AdminData?.saveUsers?.();
            
            if (AdminData?.addLog) {
                AdminData.addLog('API_KEY_REVOKED', `تم إبطال مفتاح الربط (API) للعميل: ${displayName}`);
            }
            EventBus.emit('req-show-toast', { message: 'تم إبطال المفتاح وإيقاف الاتصال الخارجي للعميل', type: 'success' });
            
            EventBus.emit('action-triggered', { action: 'view-user', id: userId });
            setTimeout(() => EventBus.emit('action-triggered', { action: 'switch-user-tab', tab: 'developer' }), 50);
            
        } catch (error) {
            console.error("API Key Revocation Error:", error);
            user.apiKey = oldKey; // 🌟 تراجع آمن
            EventBus.emit('req-show-toast', { message: 'تعذر إبطال المفتاح سحابياً، يرجى المحاولة مجدداً.', type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    
    // =========================================================
    // 🔗 3. حفظ رابط الـ Webhook الخاص بالعميل
    // =========================================================
    saveWebhookUrl: async function(userId) {
        if (!userId) return;
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;
        
        const displayName = user.fullName || user.username || user.name || 'العميل';
        const inputEl = document.getElementById(`dev-webhook-url-${userId}`);
        const newUrl = inputEl ? inputEl.value.trim() : '';
        
        // تحقق مبدئي من صحة الرابط (مهم جداً أمنياً لمنع الروابط الخبيثة)
        if (newUrl !== '' && !newUrl.startsWith('http')) {
            EventBus.emit('req-show-toast', { message: 'إجراء مرفوض: يجب أن يبدأ رابط الـ Webhook بـ http أو https', type: 'error' });
            return;
        }
        
        const oldUrl = user.webhookUrl || ''; // لحفظ خط الرجعة
        
        // إذا لم يتغير الرابط لا داعي لإرهاق السيرفر
        if (oldUrl === newUrl) {
            EventBus.emit('req-show-toast', { message: 'لم تقم بإجراء أي تغييرات على الرابط', type: 'info' });
            return;
        }
        
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري توثيق نقطة الاتصال سحابياً...');
        
        try {
            user.webhookUrl = newUrl;
            await AdminData?.saveUsers?.();
            
            if (AdminData?.addLog) {
                AdminData.addLog('WEBHOOK_SAVED', `تم تحديث رابط إشعارات Webhook للعميل: ${displayName}`);
            }
            EventBus.emit('req-show-toast', { message: newUrl === '' ? 'تم مسح وإلغاء نقطة الاتصال' : 'تم حفظ وتوثيق رابط الإشعارات بنجاح', type: 'success' });
            
        } catch (error) {
            console.error("Webhook Save Error:", error);
            user.webhookUrl = oldUrl; // 🌟 تراجع آمن
            EventBus.emit('req-show-toast', { message: 'تعذر حفظ الرابط سحابياً، يرجى المحاولة مجدداً.', type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    }
};