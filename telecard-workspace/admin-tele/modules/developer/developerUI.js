// ============================================================================
// 🎨 واجهة المطورين التفاعلية (modules/developer/developerUI.js) - V19.7 💎
// 🎯 الوظيفة: إدارة الرسم الجزئي (Partial Re-render) والتفاعلات البصرية
// 🚀 التحديثات المعمارية: 
// 1. MVC Purification 🧹: استلام مهام الرسم التي تم طردها من المتحكم.
// 2. Event Delegation 🔗: إدارة إظهار وإخفاء كلمات المرور بأمان.
// ============================================================================

import { DeveloperTemplates } from './developerTemplates.js';

export const DeveloperUI = {
  
  // 🚀 إعادة رسم التبويب لحظياً بدون إعادة تحميل النافذة
  refreshDeveloperTabLocally: function(user) {
    const devTabContent = document.getElementById('tab-developer');
    if (devTabContent) {
      devTabContent.innerHTML = DeveloperTemplates.apiKeysCard(user) + DeveloperTemplates.webhookCard(user);
    }
  },
  
  // 🚀 إظهار وإخفاء المفتاح السري بشكل آمن (بدون Inline JS)
  togglePasswordVisibility: function(targetId) {
    const inputEl = document.getElementById(targetId);
    if (inputEl) {
      inputEl.type = inputEl.type === 'password' ? 'text' : 'password';
    }
  }
};