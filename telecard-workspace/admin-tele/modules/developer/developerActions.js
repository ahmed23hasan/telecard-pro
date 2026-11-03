// ============================================================================
// 🗺️ خريطة مسارات المطورين (modules/developer/developerActions.js) - V19.7 💎
// 🚀 التحديثات المعمارية: 
// 1. Broken Link Fix 🔗: إصلاح اسم المسار (save-webhook) ليتطابق مع القالب.
// 2. CSP Compliance 🛡️: إضافة مسار (toggle-password) للتخلص من الـ Inline JS.
// ============================================================================

import { DeveloperController } from './developerController.js';
import { AdminUI } from '../../adminUI.js';

export const DeveloperActions = {
    'generate-api-key': (data) => DeveloperController.generateApiKey?.(data.id),
    'revoke-api-key': (data) => DeveloperController.revokeApiKey?.(data.id),
    'save-webhook': (data) => DeveloperController.saveWebhookUrl?.(data.id),
    
    // 🚀 المسار الجديد للتحكم البصري النظيف
    'toggle-password-visibility': (data) => AdminUI?.DeveloperUI?.togglePasswordVisibility?.(data.target)
};