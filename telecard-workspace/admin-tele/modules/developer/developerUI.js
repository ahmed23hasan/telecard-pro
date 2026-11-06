// ============================================================================
// 🎨 واجهة المطورين التفاعلية (modules/developer/developerUI.js) - V20.2 💎
// 🎯 الوظيفة: إدارة الرسم الجزئي (Partial Re-render) والتفاعلات البصرية
// 🚀 التحديثات المعمارية: 
// 1. MVC Purification 🧹: استلام مهام الرسم المعزولة تماماً عن المتحكم.
// 2. Icon Toggle Sync 👁️: تبديل شكل ولون أيقونة العين (fa-eye ↔ fa-eye-slash) بالتزامن مع كشف القناع.
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
  
  // 🚀 إظهار وإخفاء المفتاح السري وتبديل الأيقونة بأسلوب الـ CSP المعتمد
  togglePasswordVisibility: function(targetId) {
    const inputEl = document.getElementById(targetId);
    if (inputEl) {
      const isPass = inputEl.type === 'password';
      inputEl.type = isPass ? 'text' : 'password';
      const btnIcon = document.querySelector(`[data-action="toggle-password-visibility"][data-target="${targetId}"] i`);
      if (btnIcon) {
        btnIcon.className = isPass ? 'fa-solid fa-eye-slash text-warning' : 'fa-solid fa-eye';
      }
    }
  }
};
