// ============================================================================
// 🗺️ خريطة مسارات المطورين (modules/developer/developerActions.js)
// 💡 الوظيفة: استلام نقرات أزرار الـ API وتوجيهها للمتحكم
// ============================================================================

import { DeveloperController } from './developerController.js';

export const DeveloperActions = {
    'generate-api-key': (data) => DeveloperController.generateApiKey?.(data.id),
    'revoke-api-key': (data) => DeveloperController.revokeApiKey?.(data.id),
    'save-webhook-url': (data) => DeveloperController.saveWebhookUrl?.(data.id)
};
