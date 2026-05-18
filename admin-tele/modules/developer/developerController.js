// ============================================================================
// 🧠 متحكم المطورين والربط (modules/developer/developerController.js)
// 🎯 الوظيفة: معالجة العمليات المنطقية للـ API و Webhooks
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';
import { AdminUI } from '../../adminUI.js';

export const DeveloperController = {

    // 1. توليد مفتاح API جديد للعميل
    generateApiKey: async function(userId) {
        if (!userId) return;
        
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        // رسالة تأكيد إذا كان يمتلك مفتاحاً قديماً
        if (user.apiKey) {
            const confirm = await AdminUI.showConfirm('هذا العميل يمتلك مفتاحاً نشطاً. تجديد المفتاح سيؤدي إلى إيقاف اتصال متاجره الحالية فوراً. هل أنت متأكد؟', 'تحذير أمني');
            if (!confirm) return;
        }

        // توليد مفتاح عشوائي مشفر (مؤقت لحين الانتقال لـ Firebase)
        const randomString = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const newKey = 'tc_live_' + randomString;

        user.apiKey = newKey;
        await AdminData?.saveUsers?.();

        AdminData?.addLog?.('API_KEY_GENERATED', `تم توليد مفتاح ربط (API) جديد للعميل: ${user.name || user.id}`);
        EventBus.emit('req-show-toast', { message: 'تم توليد مفتاح الربط بنجاح', type: 'success' });
        
        // إعادة رسم نافذة العميل لظهور المفتاح الجديد
        EventBus.emit('action-triggered', { action: 'view-user', id: userId });
        setTimeout(() => EventBus.emit('action-triggered', { action: 'switch-user-tab', tab: 'developer' }), 50);
    },

    // 2. إبطال (حذف) المفتاح
    revokeApiKey: async function(userId) {
        if (!userId) return;
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user || !user.apiKey) return;

        const confirm = await AdminUI.showConfirm('هل أنت متأكد من إبطال هذا المفتاح؟ لن يتمكن العميل من الاتصال بمتجرك عبر الـ API بعد الآن.', 'إبطال المفتاح');
        if (!confirm) return;

        delete user.apiKey;
        await AdminData?.saveUsers?.();

        AdminData?.addLog?.('API_KEY_REVOKED', `تم إبطال مفتاح الربط (API) للعميل: ${user.name || user.id}`);
        EventBus.emit('req-show-toast', { message: 'تم إبطال المفتاح وإيقاف الاتصال', type: 'success' });
        
        EventBus.emit('action-triggered', { action: 'view-user', id: userId });
        setTimeout(() => EventBus.emit('action-triggered', { action: 'switch-user-tab', tab: 'developer' }), 50);
    },

    // 3. حفظ رابط الـ Webhook
    saveWebhookUrl: async function(userId) {
        if (!userId) return;
        const user = AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;

        const inputEl = document.getElementById(`dev-webhook-url-${userId}`);
        const newUrl = inputEl ? inputEl.value.trim() : '';

        // تحقق مبدئي من صحة الرابط
        if (newUrl !== '' && !newUrl.startsWith('http')) {
            EventBus.emit('req-show-toast', { message: 'يرجى إدخال رابط صحيح يبدأ بـ http أو https', type: 'error' });
            return;
        }

        user.webhookUrl = newUrl;
        await AdminData?.saveUsers?.();

        AdminData?.addLog?.('WEBHOOK_SAVED', `تم تحديث رابط إشعارات Webhook للعميل: ${user.name || user.id}`);
        EventBus.emit('req-show-toast', { message: 'تم حفظ رابط الإشعارات بنجاح', type: 'success' });
    }
};
