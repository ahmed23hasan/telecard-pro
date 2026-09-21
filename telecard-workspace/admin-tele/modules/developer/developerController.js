// ============================================================================
// 🧠 متحكم المطورين والربط (modules/developer/developerController.js) - V18.7 💎
// 🎯 الوظيفة: معالجة العمليات المنطقية للـ API و Webhooks بأعلى معايير الأمان
// 🚀 التحديثات المعمارية (V18.7 - Enterprise Mutex & Sync Patch): 
// 1. Mutex Action Locks 🔒: إضافة درع الأقفال لمنع الاختناق (Race Conditions) وتوليد مفاتيح متزامنة.
// 2. Seamless Tab Routing 🔄: إصلاح خلل إعادة الرسم (Flash Crash) وضمان الانتقال السلس لتبويب المطورين.
// 3. Webhook Integrity Shield 🛡️: إضافة رسالة تأكيد حاسمة قبل التدمير الكلي لروابط الـ Webhook والـ Secret.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { AdminUI } from '../../adminUI.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

// 🛡️ دالة التشفير المدمجة المتوافقة مع السيرفر
const generateSha256Hash = async (text) => {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const DeveloperController = {
    
    _actionLocks: new Set(), // 🛡️ درع الحماية المركزي لمنع التكرار

    // =========================================================
    // 🔑 1. توليد مفتاح API جديد للعميل
    // =========================================================
    generateApiKey: async function(userId) {
        if (!userId || this._actionLocks.has(`gen-key-${userId}`)) return;
        
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;
        
        const displayName = user.fullName || user.username || user.name || 'العميل';
        
        if (user.apiKey) {
            const confirmMsg = `العميل (${displayName}) يمتلك مفتاحاً نشطاً بالفعل.\n\n⚠️ تجديد المفتاح سيؤدي إلى إيقاف اتصال متاجره الحالية فوراً ولن تعود تعمل حتى يتم وضع المفتاح الجديد.\n\nهل أنت متأكد من رغبتك بالتجديد؟`;
            const confirm = await AdminUI.showConfirm(confirmMsg, 'تحذير أمني خطير');
            if (!confirm) return;
        }
        
        this._actionLocks.add(`gen-key-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري توليد وتشفير المفتاح سحابياً...');
        
        try {
            // توليد مفتاح عشوائي آمن
            const array = new Uint8Array(24);
            window.crypto.getRandomValues(array);
            const secureString = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
            const newKey = 'tc_live_' + secureString;

            const hashedKey = await generateSha256Hash(newKey);
            
            await FirebaseAdapter.updateDocument('telecard_users', String(userId), {
                apiKey: newKey,
                apiKeyHash: hashedKey
            });
            
            // تحديث الذاكرة المحلية فقط بعد نجاح الحفظ السحابي
            user.apiKey = newKey;
            user.apiKeyHash = hashedKey; 
            
            if (AdminData?.addLog) {
                AdminData.addLog('API_KEY_GENERATED', `تم توليد مفتاح ربط (API) جديد للعميل: ${displayName}`);
            }
            EventBus.emit('req-show-toast', { message: `تم توليد وتوثيق المفتاح للعميل (${displayName}) بنجاح`, type: 'success' });
            
            // 🔄 [التحديث المعماري]: إعادة الرسم السلسة بدون وميض
            EventBus.emit('action-triggered', { action: 'view-user', id: userId, preventModalOpen: true });
            setTimeout(() => {
                EventBus.emit('action-triggered', { action: 'switch-user-tab', tab: 'developer' });
            }, 100);
            
        } catch (error) {
            console.error("API Key Generation Error:", error);
            EventBus.emit('req-show-toast', { message: 'تعذر حفظ المفتاح في السحابة، يرجى المحاولة مجدداً.', type: 'error' });
        } finally {
            this._actionLocks.delete(`gen-key-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    
    // =========================================================
    // 🛑 2. إبطال (حذف) مفتاح الـ API والتطهير الشامل
    // =========================================================
    revokeApiKey: async function(userId) {
        if (!userId || this._actionLocks.has(`rev-key-${userId}`)) return;
        
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user || !user.apiKey) return;
        
        const displayName = user.fullName || user.username || user.name || 'العميل';
        
        const confirm = await AdminUI.showConfirm(`هل أنت متأكد من إبطال مفتاح العميل (${displayName})؟\nلن يتمكن العميل من الاتصال بمتجرك عبر الـ API بعد الآن.`, 'تأكيد إبطال المفتاح');
        if (!confirm) return;
        
        this._actionLocks.add(`rev-key-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إبطال صلاحيات المفتاح سحابياً...');
        
        try {
            // 🚀 استخدام FirebaseAdapter.deleteField() للتدمير الجذري
            const deleteMarker = FirebaseAdapter.deleteField();

            await FirebaseAdapter.updateDocument('telecard_users', String(userId), {
                apiKey: deleteMarker,
                apiKeyHash: deleteMarker,
                webhookUrl: deleteMarker,
                webhookSecret: deleteMarker
            });
            
            // تنظيف الذاكرة المحلية
            delete user.apiKey;
            delete user.apiKeyHash;
            delete user.webhookUrl;
            delete user.webhookSecret;
            
            if (AdminData?.addLog) {
                AdminData.addLog('API_KEY_REVOKED', `تم إبطال مفتاح الربط (API) والـ Webhooks للعميل: ${displayName}`);
            }
            EventBus.emit('req-show-toast', { message: 'تم إبطال المفتاح وتطهير الاتصالات الخارجية للعميل', type: 'success' });
            
            // 🔄 [التحديث المعماري]: إعادة الرسم السلسة بدون وميض
            EventBus.emit('action-triggered', { action: 'view-user', id: userId, preventModalOpen: true });
            setTimeout(() => {
                EventBus.emit('action-triggered', { action: 'switch-user-tab', tab: 'developer' });
            }, 100);
            
        } catch (error) {
            console.error("API Key Revocation Error:", error);
            EventBus.emit('req-show-toast', { message: 'تعذر إبطال المفتاح سحابياً، يرجى المحاولة مجدداً.', type: 'error' });
        } finally {
            this._actionLocks.delete(`rev-key-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    
    // =========================================================
    // 🔗 3. حفظ رابط الـ Webhook وتوليد مفتاح التوقيع
    // =========================================================
    saveWebhookUrl: async function(userId) {
        if (!userId || this._actionLocks.has(`save-wh-${userId}`)) return;
        
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;
        
        const displayName = user.fullName || user.username || user.name || 'العميل';
        const inputEl = document.getElementById(`dev-webhook-url-${userId}`);
        const newUrl = inputEl ? inputEl.value.trim() : '';
        const oldUrl = user.webhookUrl || '';
        
        if (newUrl === oldUrl) {
            EventBus.emit('req-show-toast', { message: 'لم تقم بإجراء أي تغييرات على الرابط', type: 'info' });
            return;
        }

        // 🛡️ التنبيه الأمني عند تفريغ وحذف رابط ה- Webhook
        if (newUrl === '' && oldUrl !== '') {
            const confirmMsg = `أنت تقوم بمسح نقطة اتصال الـ Webhook الحالية.\n\n⚠️ هذا سيؤدي إلى حذف (مفتاح التوقيع السري Webhook Secret) المرتبط بها ولن تتمكن من استرجاعه.\n\nهل أنت متأكد؟`;
            const confirm = await AdminUI.showConfirm(confirmMsg, 'حذف نقطة الاتصال');
            if (!confirm) {
                if (inputEl) inputEl.value = oldUrl; // إعادة القيمة للواجهة
                return;
            }
        }
        
        if (newUrl !== '') {
            try {
                const parsedUrl = new URL(newUrl);
                if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                    throw new Error("Invalid Protocol");
                }
            } catch (err) {
                EventBus.emit('req-show-toast', { message: 'الرابط غير صالح! يجب أن يكون رابطاً حقيقياً يبدأ بـ http أو https', type: 'error' });
                return;
            }
        }
        
        this._actionLocks.add(`save-wh-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري توثيق نقطة الاتصال سحابياً...');
        
        try {
            const deleteMarker = FirebaseAdapter.deleteField();
            let updatePayload = { webhookUrl: newUrl === '' ? deleteMarker : newUrl };
            
            if (newUrl !== '' && !user.webhookSecret) {
                const whArray = new Uint8Array(16);
                window.crypto.getRandomValues(whArray);
                updatePayload.webhookSecret = 'whsec_' + Array.from(whArray, byte => byte.toString(16).padStart(2, '0')).join('');
            } else if (newUrl === '') {
                updatePayload.webhookSecret = deleteMarker;
            }

            await FirebaseAdapter.updateDocument('telecard_users', String(userId), updatePayload);
            
            // تحديث الذاكرة المحلية
            if (newUrl === '') {
                delete user.webhookUrl;
                delete user.webhookSecret;
            } else {
                user.webhookUrl = newUrl;
                if (updatePayload.webhookSecret) user.webhookSecret = updatePayload.webhookSecret;
            }
            
            if (AdminData?.addLog) {
                AdminData.addLog('WEBHOOK_SAVED', `تم تحديث رابط إشعارات Webhook للعميل: ${displayName}`);
            }
            EventBus.emit('req-show-toast', { message: newUrl === '' ? 'تم مسح وإلغاء نقطة الاتصال' : 'تم حفظ وتوثيق رابط الإشعارات بنجاح', type: 'success' });
            
            // 🔄 [التحديث المعماري]: إعادة الرسم السلسة بدون وميض
            EventBus.emit('action-triggered', { action: 'view-user', id: userId, preventModalOpen: true });
            setTimeout(() => {
                EventBus.emit('action-triggered', { action: 'switch-user-tab', tab: 'developer' });
            }, 100);

        } catch (error) {
            console.error("Webhook Save Error:", error);
            if (inputEl) inputEl.value = oldUrl;
            EventBus.emit('req-show-toast', { message: 'تعذر حفظ الرابط سحابياً، تم التراجع محلياً.', type: 'error' });
        } finally {
            this._actionLocks.delete(`save-wh-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    }
};
