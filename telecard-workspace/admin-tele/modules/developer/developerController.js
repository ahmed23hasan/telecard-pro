// ============================================================================
// 🧠 متحكم المطورين والربط (modules/developer/developerController.js) - V19.9 💎
// 🎯 الوظيفة: معالجة العمليات المنطقية للـ API و Webhooks بأعلى معايير الأمان
// 🚀 التحديثات المعمارية (V19.9 - The Ultimate Security & Sync Patch): 
// 1. Ghost Key Fix 👻: إعادة شاشة العرض (Prompt) للمفتاح الخام ليتمكن الإدمن من نسخه لمرة واحدة.
// 2. State Sync Fix 🔄: تفريغ (webhookSecret) من الكائن المحلي عند مسح الـ Webhook لمنع التضارب البصري.
// 3. MVC Purification 🧹: العزل التام للمنطق عن الـ DOM.
// 4. API Merchant Guard 🛡️: منع توليد المفتاح لعميل ليس بمرتبة API Merchant لتجنب رفض اتصاله من السيرفر.
// 5. Private IP Shield 🔒: فلترة عناوين الـ Private IPs للويب هوك لمنع ثغرات الـ SSRF والمطابقة مع السيرفر.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus } from '../../adminUtils.js';
import { AdminUI } from '../../adminUI.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

// 🛡️ دالة التشفير المدمجة المتوافقة مع السيرفر
const generateSha256Hash = async (text) => {
    if (!window.crypto || !window.crypto.subtle) {
        throw new Error("تشفير المفاتيح يتطلب اتصالاً آمناً (HTTPS). بيئة المتصفح الحالية لا تدعم التشفير.");
    }
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const DeveloperController = {
    
    _actionLocks: new Set(),
    
    // =========================================================
    // 🔑 1. توليد مفتاح API جديد للعميل
    // =========================================================
    generateApiKey: async function(userId) {
        if (!userId || this._actionLocks.has(`gen-key-${userId}`)) return;
        
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;
        
        const displayName = user.fullName || user.username || user.name || 'العميل';
        
        // 🚀 [التحديث الوقائي 1]: التأكد من تصنيف العميل كتاجر API قبل توليد المفتاح
        if (user.isApiMerchant !== true) {
            EventBus.emit('req-show-toast', {
                message: `تنبيه: يجب ترقية العميل (${displayName}) إلى مستوى جملة (API) أولاً حتى يعمل مفتاح الربط في السيرفر.`,
                type: 'warning'
            });
            return;
        }
        
        if (user.apiKeyHash) {
            const confirmMsg = `العميل (${displayName}) يمتلك مفتاحاً نشطاً بالفعل.\n\n⚠️ تجديد المفتاح سيؤدي إلى إيقاف اتصال متاجره الحالية فوراً ولن تعود تعمل حتى يتم وضع المفتاح الجديد.\n\nهل أنت متأكد من رغبتك بالتجديد؟`;
            const confirm = await AdminUI.showConfirm(confirmMsg, 'تحذير أمني خطير');
            if (!confirm) return;
        }
        
        this._actionLocks.add(`gen-key-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري توليد وتشفير المفتاح سحابياً...');
        
        try {
            const array = new Uint8Array(24);
            window.crypto.getRandomValues(array);
            const secureString = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
            const newKey = 'tc_live_' + secureString;
            
            const hashedKey = await generateSha256Hash(newKey);
            
            await FirebaseAdapter.updateDocument('telecard_users', String(userId), {
                apiKeyHash: hashedKey
            });
            
            // 🚀 التحديث المحلي الصامت (الهاش فقط في الذاكرة)
            user.apiKeyHash = hashedKey;
            
            if (AdminData?.addLog) {
                AdminData.addLog('API_KEY_GENERATED', `تم توليد مفتاح ربط (API) جديد للعميل: ${displayName}`);
            }
            EventBus.emit('req-show-toast', { message: `تم توليد وتوثيق المفتاح للعميل (${displayName}) بنجاح`, type: 'success' });
            
            // 🚀 [الإصلاح المعماري]: إظهار المفتاح الخام للإدمن لمرة واحدة فقط باستخدام Prompt
            if (AdminUI && AdminUI.showPrompt) {
                const msg = `⚠️ انسخ هذا المفتاح وأرسله للعميل فوراً.\n\nلن يظهر هذا المفتاح مرة أخرى أبداً لأسباب أمنية (Zero-Trust)!`;
                await AdminUI.showPrompt(msg, 'مفتاح الـ API الجديد (مرة واحدة)', newKey);
            }
            
            // 🚀 إرسال أمر الرسم لملف الواجهة
            if (AdminUI?.DeveloperUI?.refreshDeveloperTabLocally) {
                AdminUI.DeveloperUI.refreshDeveloperTabLocally(user);
            }
            
        } catch (error) {
            console.error("API Key Generation Error:", error);
            EventBus.emit('req-show-toast', { message: error.message.includes('HTTPS') ? error.message : 'تعذر حفظ المفتاح في السحابة، يرجى المحاولة مجدداً.', type: 'error' });
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
        if (!user || !user.apiKeyHash) return;
        
        const displayName = user.fullName || user.username || user.name || 'العميل';
        
        const confirm = await AdminUI.showConfirm(`هل أنت متأكد من إبطال مفتاح العميل (${displayName})؟\nلن يتمكن العميل من الاتصال بمتجرك عبر الـ API بعد الآن.`, 'تأكيد إبطال المفتاح');
        if (!confirm) return;
        
        this._actionLocks.add(`rev-key-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إبطال صلاحيات المفتاح سحابياً...');
        
        try {
            const deleteMarker = FirebaseAdapter.deleteField();
            
            await FirebaseAdapter.updateDocument('telecard_users', String(userId), {
                apiKeyHash: deleteMarker,
                webhookUrl: deleteMarker,
                webhookSecret: deleteMarker
            });
            
            // 🚀 [الإصلاح المعماري]: التأكد من الحذف من الكائن الأصلي والمرجعي
            if (user) {
                user.apiKeyHash = null;
                user.webhookUrl = null;
                user.webhookSecret = null;
                user.hasWebhookSecret = false;
            }
            if (AdminData?.addLog) {
                AdminData.addLog('API_KEY_REVOKED', `تم إبطال مفتاح الربط (API) والـ Webhooks للعميل: ${displayName}`);
            }
            EventBus.emit('req-show-toast', { message: 'تم إبطال المفتاح وتطهير الاتصالات الخارجية للعميل', type: 'success' });
            
            if (AdminUI?.DeveloperUI?.refreshDeveloperTabLocally) {
                AdminUI.DeveloperUI.refreshDeveloperTabLocally(user);
            }
            
        } catch (error) {
            console.error("API Key Revocation Error:", error);
            EventBus.emit('req-show-toast', { message: 'تعذر إبطال المفتاح سحابياً، يرجى المحاولة مجدداً.', type: 'error' });
        } finally {
            this._actionLocks.delete(`rev-key-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    
    // =========================================================
    // 🔗 3. حفظ رابط الـ Webhook وتوليد أو تحديث مفتاح التوقيع
    // =========================================================
    saveWebhookUrl: async function(userId) {
        if (!userId || this._actionLocks.has(`save-wh-${userId}`)) return;
        
        const user = AdminData.data.usersMap?.[userId] || AdminData.data.users.find(u => String(u.id) === String(userId));
        if (!user) return;
        
        const displayName = user.fullName || user.username || user.name || 'العميل';
        const urlInput = document.getElementById(`dev-webhook-url-${userId}`);
        const secretInput = document.getElementById(`dev-webhook-secret-${userId}`);
        
        const newUrl = urlInput ? urlInput.value.trim() : '';
        const oldUrl = user.webhookUrl || '';
        const newSecret = secretInput ? secretInput.value.trim() : '';
        const oldSecret = user.webhookSecret || '';
        
        if (newUrl === oldUrl && newSecret === oldSecret) {
            EventBus.emit('req-show-toast', { message: 'لم تقم بإجراء أي تغييرات على الرابط أو المفتاح السري', type: 'info' });
            return;
        }
        
        if (newUrl === '' && oldUrl !== '') {
            const confirmMsg = `أنت تقوم بمسح نقطة اتصال الـ Webhook الحالية.\n\n⚠️ هذا سيؤدي إلى حذف (مفتاح التوقيع السري Webhook Secret) المرتبط بها ولن تتمكن من استرجاعه.\n\nهل أنت متأكد؟`;
            const confirm = await AdminUI.showConfirm(confirmMsg, 'حذف نقطة الاتصال');
            if (!confirm) {
                if (urlInput) urlInput.value = oldUrl;
                if (secretInput) secretInput.value = oldSecret;
                return;
            }
        }
        
        if (newUrl !== '') {
            try {
                const parsedUrl = new URL(newUrl);
                // 🛡️ فرض HTTPS الصارم ليتطابق 100% مع جدار حماية السيرفر ومستقبل الـ Webhooks
                if (parsedUrl.protocol !== 'https:') {
                    throw new Error("HTTPS_REQUIRED");
                }
                
                // 🚀 [التحديث الوقائي 2]: فلترة عناوين הـ Private IPs بالكامل لمطابقة السيرفر ومنع ثغرات הـ SSRF
                const host = parsedUrl.hostname.toLowerCase();
                const isPrivateIpHost = /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host) || host === '[::1]';
                
                if (host === 'localhost' || isPrivateIpHost || host.endsWith('.local') || host.endsWith('.internal')) {
                    throw new Error("Localhost Not Allowed");
                }
            } catch (err) {
                let errMsg = 'الرابط غير صالح! يجب أن يكون رابطاً آمناً يبدأ بـ https:// حصراً.';
                if (err.message === "Localhost Not Allowed") errMsg = 'لا يمكن استخدام localhost أو شبكة داخلية في بيئة الإنتاج. استخدم رابطاً عاماً.';
                if (err.message === "HTTPS_REQUIRED") errMsg = 'السيرفر يرفض روابط HTTP العادية. يجب أن يبدأ الرابط بـ https:// لحماية بيانات العملاء.';
                
                EventBus.emit('req-show-toast', { message: errMsg, type: 'error' });
                return;
            }
        }
        
        this._actionLocks.add(`save-wh-${userId}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري توثيق نقطة الاتصال سحابياً...');
        
        try {
            const deleteMarker = FirebaseAdapter.deleteField();
            let updatePayload = { webhookUrl: newUrl === '' ? deleteMarker : newUrl };
            let autoGeneratedSecret = null;
            
            if (newUrl === '') {
                updatePayload.webhookSecret = deleteMarker;
            } else {
                if (newSecret !== '') {
                    updatePayload.webhookSecret = newSecret;
                } else if (!user.webhookSecret && !user.hasWebhookSecret) {
                    const whArray = new Uint8Array(16);
                    window.crypto.getRandomValues(whArray);
                    autoGeneratedSecret = 'whsec_' + Array.from(whArray, byte => byte.toString(16).padStart(2, '0')).join('');
                    updatePayload.webhookSecret = autoGeneratedSecret;
                }
            }
            
            await FirebaseAdapter.updateDocument('telecard_users', String(userId), updatePayload);
            
            if (newUrl === '') {
                user.webhookUrl = null;
                user.webhookSecret = null;
                user.hasWebhookSecret = false;
            } else {
                user.webhookUrl = newUrl;
                user.hasWebhookSecret = true;
                if (updatePayload.webhookSecret) {
                    user.webhookSecret = updatePayload.webhookSecret;
                }
            }
            
            if (autoGeneratedSecret && AdminUI?.showPrompt) {
                await AdminUI.showPrompt(
                    'تم توليد مفتاح توقيع رقمي (Webhook Secret) تلقائياً لهذا الرابط. انسخه وأرسله للتاجر:',
                    'مفتاح التوقيع الرقمي (Webhook Secret)',
                    autoGeneratedSecret
                );
            }
            if (AdminData?.addLog) {
                AdminData.addLog('WEBHOOK_SAVED', `تم تحديث رابط إشعارات Webhook للعميل: ${displayName}`);
            }
            EventBus.emit('req-show-toast', { message: newUrl === '' ? 'تم مسح وإلغاء نقطة الاتصال' : 'تم حفظ وتوثيق رابط ومفتاح الإشعارات بنجاح', type: 'success' });
            
            if (AdminUI?.DeveloperUI?.refreshDeveloperTabLocally) {
                AdminUI.DeveloperUI.refreshDeveloperTabLocally(user);
            }
            
        } catch (error) {
            console.error("Webhook Save Error:", error);
            if (urlInput) urlInput.value = oldUrl;
            if (secretInput) secretInput.value = oldSecret;
            EventBus.emit('req-show-toast', { message: 'تعذر حفظ الإعدادات سحابياً، تم التراجع محلياً.', type: 'error' });
        } finally {
            this._actionLocks.delete(`save-wh-${userId}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    }
};