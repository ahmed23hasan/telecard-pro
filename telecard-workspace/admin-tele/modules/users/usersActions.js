// ============================================================================
// 🗺️ خريطة مسارات المستخدمين (Users Actions Router) - النسخة الماسية V4.2 💎
// 💡 الوظيفة: استلام أحداث العملاء، المستويات، ونظام التوثيق الأمني (KYC)
// 🚀 التحديث المعماري: كسر الارتباط الدائري الميت تماماً بحذف الاستيراد غير المستخدم
// ============================================================================

import { UsersController } from './usersController.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';

// 🚀 [نقاء هندسي]: تم حذف استيراد AppController تماماً لحماية لوحة الإدارة من الانهيار عند الإقلاع

export const UsersActions = {
    // --- 1. الإدارة العامة للمستخدمين ---
    'view-user': (data) => AdminRender?.viewUser?.(data.id),
    'open-user-edit': (data) => AdminUI?.UsersUI?.openUserEditModal?.(data.id),
    'close-user-edit': () => AdminUI?.UsersUI?.closeUserEditModal?.(),
    'view-user-full-history': (data) => UsersController.openUserFullHistory?.(data.id),
    
    // 🔗 توجيه الأحداث إلى UsersController المطور بـ O(1)
    'save-user-edits': (data) => UsersController.saveUserEdits?.(data.id),
    'delete-user': (data) => UsersController.deleteUser?.(data.id),
    'restrict-user': (data) => UsersController.restrictUser?.(data.id),
    'ban-user': (data) => UsersController.banUser?.(data.id),
    'ban-user-ip': (data) => UsersController.banUserIp?.(data.id, data.ip),
    'adjust-balance': (data) => UsersController.openBalanceAdjust?.(data.type, data.id),
    'send-custom-notif': (data) => UsersController.sendCustomNotification?.(data.id),
    
    // 🔐 إرسال رابط استعادة كلمة المرور المطور
    'send-password-reset': (data) => UsersController.sendPasswordReset?.(data.id),
    
    'switch-user-tab': (data) => AdminRender?.switchUserTab?.(data.tab),
    'toggle-user-sort': () => UsersController.toggleUserSort?.(),
    'change-user-sort': (data) => UsersController.changeUserSort?.(data.val || data.element.value),
    'search-users': (data) => UsersController.searchUsers?.(data.val),
    
    // --- 2. إدارة المستويات (Tiers) ---
    'open-tier-edit': (data) => AdminUI?.UsersUI?.openTierModal?.(data.id),
    'save-tier': () => UsersController.saveTier?.(),
    'delete-tier': (data) => UsersController.deleteTier?.(data.id),
    'select-tier-badge': (data) => AdminUI?.UsersUI?.selectTierBadge?.(data.element, data.val),
    'toggle-default-tier': (data) => AdminUI?.UsersUI?.toggleDefaultTierSecure?.(data.element),
    'toggle-tier-auto': (data) => UsersController.toggleTierAutoFor?.(data.id, data.element.checked),
    
    // 🌟 التحديث الاحترافي لحفظ حالة الـ IDs قبل فتح النافذة وعند الاختيار
    'change-tier': (data) => {
        UsersController.selectedUserId = data.id;
        UsersController.selectedTierId = null;
        AdminUI?.UsersUI?.showTierSelection?.(data.id);
    },
    'select-tier-option': (data) => {
        UsersController.selectedTierId = data.element.dataset.tierId;
        AdminUI?.UsersUI?.selectTierOption?.(data.element);
    },
    'close-tier-selection': () => {
        UsersController.selectedUserId = null;
        UsersController.selectedTierId = null;
        AdminUI?.UsersUI?.closeTierSelection?.();
    },
    
    'confirm-tier-selection': () => UsersController.confirmTierSelection?.(),
    'open-tier-users': (data) => AdminUI?.UsersUI?.openTierUsers?.(data.id),
    'back-to-tiers': () => AdminUI?.UsersUI?.backToTiers?.(),
    'filter-tier-users': (data) => AdminUI?.UsersUI?.filterTierUsersLive?.(data.element),
    
    // --- 3. نظام التوثيق (KYC) ---
    'save-kyc': () => AdminUI?.UsersUI?.saveKycSettings?.(),
    'handle-kyc': (data) => UsersController.processKycDecision?.(data.id, data.decision),
    
    'revoke-kyc': (data) => UsersController.revokeUserKyc?.(data.id),
    'update-kyc-mode': (data) => AdminUI?.UsersUI?.updateKycMode?.(data.mode),
    'toggle-kyc-tier': (data) => AdminUI?.UsersUI?.toggleKycForTier?.(data.id, data.element.checked),
    'filter-kyc-requests': (data) => AdminUI?.UsersUI?.filterKycRequests?.(data.val)
};