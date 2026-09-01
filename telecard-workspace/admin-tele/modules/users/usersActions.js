// ============================================================================
// 🗺️ خريطة مسارات المستخدمين (Users Actions Router) - النسخة الماسية V16.1 💎
// 🚀 التحديث الأقصى: 
// 1. Ghost Router Fix: توجيه الأوامر للمحرك الحديث UsersRender بدلاً من AdminRender الميت.
// 2. Missing Routes: إضافة مسارات (fetch-user-history) لجلب سجلات العميل السحابية.
// ============================================================================

import { UsersController } from './usersController.js';
import { UsersRender } from './usersRender.js'; // 🛡️ استيراد المحرك الصحيح
import { AdminUI } from '../../adminUI.js';
import { EventBus } from '../../adminUtils.js';

export const UsersActions = {
    // --- 1. الإدارة العامة للمستخدمين ---
    // 🚀 [الإصلاح]: التوجيه إلى UsersRender لضمان عمل الـ CRM والسجل المالي المدمج
    'view-user': (data) => UsersRender?.viewUser?.(data.id),
    'switch-user-tab': (data) => UsersRender?.switchUserTab?.(data.tab),
    
    // 🚀 [الإصلاح]: مسارات جلب السجل المالي من السيرفر (كانت مفقودة)
    'fetch-user-history': (data) => UsersController.fetchUserHistory?.(data.id, data.loadMore),
    'load-more-user-history': (data) => UsersController.fetchUserHistory?.(data.id, true),
    
    'open-user-edit': (data) => AdminUI?.UsersUI?.openUserEditModal?.(data.id),
    'close-user-edit': () => AdminUI?.UsersUI?.closeUserEditModal?.(),
    'save-user-edits': (data) => UsersController.saveUserEdits?.(data.id),
    'delete-user': (data) => UsersController.deleteUser?.(data.id),
    'restrict-user': (data) => UsersController.restrictUser?.(data.id),
    'ban-user': (data) => UsersController.banUser?.(data.id),
    'ban-user-ip': (data) => UsersController.banUserIp?.(data.id, data.ip),
    'adjust-balance': (data) => UsersController.openBalanceAdjust?.(data.type, data.id),
    'send-custom-notif': (data) => UsersController.sendCustomNotification?.(data.id),
    'send-password-reset': (data) => UsersController.sendPasswordReset?.(data.id),
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
