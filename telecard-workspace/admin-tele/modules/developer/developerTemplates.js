// ============================================================================
// 👥 قوالب بوابة المطورين والـ API (modules/developer/developerTemplates.js) - V20.0 💎
// 🎯 الوظيفة: إدارة مفاتيح الـ API وإشعارات الويب هوك للعملاء
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

const _esc = Utils.escapeHTML;

export const DeveloperTemplates = {
    
    apiKeysCard: (user) => {
        const hasKey = user.apiKeyHash && String(user.apiKeyHash).trim() !== '';
        
        return `
        <div class="card mb-15">
            <div class="card-header no-border-bottom mb-10">
                <h3 class="card-title text-primary"><i class="fa-solid fa-key me-1"></i> مفاتيح الـ API</h3>
            </div>
            
            <p class="text-muted fs-12 mb-15">استخدم هذا المفتاح للسماح لمتاجر وسيرفرات العميل بالاتصال بمتجرك وسحب المنتجات أو تنفيذ الطلبات.</p>
            
            ${hasKey ? `
            <div class="api-key-status-box mb-15">
                <div class="flex-between w-100">
                    <span class="fs-12 fw-bold text-primary flex-align-center">
                        <i class="fa-solid fa-lock me-1"></i> حالة المفتاح:
                    </span>
                    <span class="v-stat-chip chip-success fs-10">
                        <i class="fa-solid fa-shield-check"></i> نشط ومُشفّر سحابياً
                    </span>
                </div>
                <p class="fs-11 text-primary mt-10 mb-0"><i class="fa-solid fa-circle-info me-1"></i> المفتاح الخام لا يُحفظ في قاعدة البيانات لدواعي أمنية. إذا فُقد المفتاح، يجب توليد مفتاح جديد.</p>
            </div>
            
            <div class="modal-actions-row mt-15">
                <button type="button" class="btn btn-primary interactive-scale flex-1" data-action="generate-api-key" data-id="${_esc(user.id)}">
                    <i class="fa-solid fa-arrows-rotate me-1"></i> توليد مفتاح جديد
                </button>
                <button type="button" class="btn btn-outline-danger interactive-scale flex-1" data-action="revoke-api-key" data-id="${_esc(user.id)}">
                    <i class="fa-solid fa-ban me-1"></i> إبطال المفتاح نهائياً
                </button>
            </div>
            ` : `
            <div class="text-center w-100">
                ${RenderHelpers.emptyState('fa-solid fa-key text-muted', 'لا يوجد مفتاح ربط', 'هذا العميل لا يملك مفتاح API نشط للاتصال بمتجرك.')}
                <button type="button" class="btn btn-primary mt-15 interactive-scale" data-action="generate-api-key" data-id="${_esc(user.id)}">
                    <i class="fa-solid fa-plus me-1"></i> توليد مفتاح ربط جديد
                </button>
            </div>
            `}
        </div>`;
    },
    
    webhookCard: (user) => {
        const webhookUrl = user.webhookUrl || '';
        const webhookSecret = user.webhookSecret || '';
        const hasSavedSecret = Boolean(webhookSecret || user.hasWebhookSecret);
        const secretPlaceholder = hasSavedSecret ?
            '•••••••••••••••• (محفوظ سحابياً - اتركه فارغاً للاحتفاظ به)' :
            'أدخل مفتاح التوقيع أو اتركه فارغاً لتوليده تلقائياً...';
        const inputId = `dev-webhook-secret-${_esc(user.id)}`;
        return `
        <div class="card mb-15">
            <div class="card-header no-border-bottom mb-10">
                <h3 class="card-title text-success"><i class="fa-solid fa-satellite-dish me-1"></i> إشعارات المتجر (Webhooks)</h3>
            </div>
            
            <p class="text-muted fs-12 mb-15">أدخل رابط الاستماع (Webhook URL) الخاص بمتجر العميل والمفتاح السري. سنقوم بإرسال تنبيهات فورية لهذا الرابط عند تغير حالة الطلبات.</p>
            
            <div class="form-group">
                <label class="form-label">رابط الـ Webhook الخاص بالعميل (URL)</label>
                <input type="url" id="dev-webhook-url-${_esc(user.id)}" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="https://client-store.com/api/webhook" value="${_esc(webhookUrl)}">
            </div>
            
            <div class="form-group mt-15">
                <label class="form-label text-success"><i class="fa-solid fa-shield-halved me-1"></i> مفتاح التوقيع الرقمي (Webhook Secret)</label>
                <div class="flex-center-gap w-100">
                    <input type="password" id="${inputId}" class="form-input num-en flex-1 mb-0 font-numeric" dir="ltr" lang="en" placeholder="${secretPlaceholder}" value="${_esc(webhookSecret)}">
                    <button type="button" class="btn btn-ghost btn-compact interactive-scale" data-action="toggle-password-visibility" data-target="${inputId}" title="إظهار/إخفاء">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </div>
                <small class="text-muted d-block mt-5 fs-10"><i class="fa-solid fa-circle-info me-1"></i> يُستخدم للتحقق (HMAC-SHA256) من أن الطلب قادم منك ولم يتم التلاعب به.</small>
            </div>

            <div class="modal-actions-row mt-15">
                <button type="button" class="btn btn-success interactive-scale w-100" data-action="save-webhook" data-id="${_esc(user.id)}">
                    <i class="fa-solid fa-floppy-disk me-1"></i> حفظ إعدادات الـ Webhook
                </button>
            </div>
        </div>`;
    },
    
    developerTabContent: (user) => `
        <div id="tab-developer" class="ud-tab-content">
            ${DeveloperTemplates.apiKeysCard(user)}
            ${DeveloperTemplates.webhookCard(user)}
        </div>
    `
};