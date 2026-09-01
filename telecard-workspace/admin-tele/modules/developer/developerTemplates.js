// ============================================================================
// 👥 قوالب بوابة المطورين والـ API (modules/developer/developerTemplates.js) - النسخة V4.3 💎
// 🎯 الوظيفة: توليد الـ HTML النقي المدمج بالبيانات (Data Binding) للمطورين
// 🚀 التحديث الأقصى: 
// 1. Visual Security: إخفاء مفتاح الـ API داخل حقل مشفر لمنع التصوير العرضي للشاشة.
// ============================================================================

import { Utils } from '../../adminUtils.js';

const _esc = Utils.escapeHTML;

export const DeveloperTemplates = {
    
    apiKeysCard: (user) => {
        const apiKey = user.apiKey || '';
        const hasKey = apiKey.trim() !== '';
        
        return `
        <div class="card mb-15">
            <div class="card-header">
                <h3 class="card-title text-primary"><i class="fa-solid fa-key"></i> مفاتيح الـ API</h3>
            </div>
            <div class="card-body">
                <div class="ud-info-list">
                    <p class="text-muted fs-12 mb-15">استخدم هذا المفتاح للسماح لمتاجر وسيرفرات العميل بالاتصال بمتجرك وسحب المنتجات أو تنفيذ الطلبات.</p>
                    
                    ${hasKey ? `
                    <div class="ud-info-row highlight-primary">
                        <span class="ud-info-lbl text-primary"><i class="fa-solid fa-lock"></i> المفتاح النشط حالياً</span>
                        <div class="flex-center-gap w-100 mt-5">
                            <!-- 🚀 إخفاء المفتاح بصرياً للحماية من اختلاس النظر -->
                            <input type="password" id="dev-api-key-${_esc(user.id)}" class="form-input num-en flex-1" dir="ltr" readonly value="${_esc(apiKey)}">
                            
                            <button class="btn btn-ghost" onclick="const inp = document.getElementById('dev-api-key-${_esc(user.id)}'); inp.type = inp.type === 'password' ? 'text' : 'password';" title="إظهار/إخفاء المفتاح">
                                <i class="fa-solid fa-eye"></i>
                            </button>

                            <button class="btn btn-ghost" data-action="copy-text" data-copy-text="${_esc(apiKey)}" title="نسخ المفتاح بالكامل">
                                <i class="fa-solid fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    <div class="mt-15 flex-center-gap">
                        <button class="btn btn-red flex-1" data-action="revoke-api-key" data-id="${_esc(user.id)}">
                            <i class="fa-solid fa-trash"></i> إبطال المفتاح
                        </button>
                        <button class="btn btn-primary flex-1" data-action="generate-api-key" data-id="${_esc(user.id)}">
                            <i class="fa-solid fa-arrows-rotate"></i> تجديد المفتاح
                        </button>
                    </div>
                    ` : `
                    <div class="empty-state p-20">
                        <i class="fa-solid fa-key text-muted fs-3 mb-10"></i>
                        <span class="fs-12">لا يوجد مفتاح ربط نشط لهذا العميل</span>
                        <button class="btn btn-primary mt-10" data-action="generate-api-key" data-id="${_esc(user.id)}">
                            <i class="fa-solid fa-plus"></i> توليد مفتاح جديد
                        </button>
                    </div>
                    `}
                </div>
            </div>
        </div>`;
    },
    
    webhookCard: (user) => {
        const webhookUrl = user.webhookUrl || '';
        
        return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title text-success"><i class="fa-solid fa-satellite-dish"></i> إشعارات المتجر (Webhooks)</h3>
            </div>
            <div class="card-body">
                <p class="text-muted fs-12 mb-15">أدخل رابط الاستماع (Webhook URL) الخاص بمتجر العميل. سنقوم بإرسال تنبيهات فورية لهذا الرابط عند تغير حالة الطلبات أو نفاذ المخزون.</p>
                
                <div class="form-group">
                    <label class="form-label">رابط الـ Webhook الخاص بالعميل (URL)</label>
                    <input type="url" id="dev-webhook-url-${_esc(user.id)}" class="form-input num-en" dir="ltr" lang="en" placeholder="https://client-store.com/api/telecard-webhook" value="${_esc(webhookUrl)}">
                </div>
                
                <button class="btn btn-green mt-10 w-100" data-action="save-webhook-url" data-id="${_esc(user.id)}">
                    <i class="fa-solid fa-floppy-disk"></i> حفظ رابط التنبيهات
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
