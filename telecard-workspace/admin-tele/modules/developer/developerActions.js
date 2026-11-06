// ============================================================================
// 🗺️ خريطة مسارات المطورين (modules/developer/developerActions.js) - V20.2 💎
// 🚀 التحديثات المعمارية: 
// 1. Single Responsibility 🎯: احتكار معالجة مسارات الـ API والـ Webhooks كمسؤول وحيد.
// 2. CSP Compliance 🛡️: توجيه أحداث إظهار وإخفاء السر إلى DeveloperUI دون Inline JS.
// ============================================================================

import { DeveloperController } from './developerController.js';
import { AdminUI } from '../../adminUI.js';

export const DeveloperActions = {
    'generate-api-key': (data) => DeveloperController.generateApiKey?.(data.id),
    'revoke-api-key': (data) => DeveloperController.revokeApiKey?.(data.id),
    'save-webhook': (data) => DeveloperController.saveWebhookUrl?.(data.id),
    'toggle-password-visibility': (data) => AdminUI?.DeveloperUI?.togglePasswordVisibility?.(data.target)
};
