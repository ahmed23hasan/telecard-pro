// ============================================================================
// ⚙️ خريطة مسارات النظام (System Actions Router)
// 🎯 الوظيفة: الأحداث المشتركة، النوافذ، الملاحة، التقويم، وإعدادات النظام العامة
// 🌟 التحديث: تنظيف المسارات، منع التداخل، واستخدام المعمارية الصحيحة (Facade)
// ============================================================================

import { AppController } from './appController.js';
import { AdminUI, AdminCalendar } from '../adminUI.js';
import { AdminRender } from '../adminRender.js';
import { EventBus } from '../adminUtils.js';
import { BackupSystem } from './backupService.js'; // الاستيراد الصحيح للنواة

// استيراد المتحكمات الفرعية لتوجيه أوامر التعديل والحذف
import { CatalogController } from '../modules/catalog/catalogController.js';
import { FinanceController } from '../modules/finance/financeController.js';
import { MarketingController } from '../modules/marketing/marketingController.js';
import { UsersController } from '../modules/users/usersController.js';

export const SystemActions = {
    // --- 1. النظام الأساسي والملاحة ---
    'logout': () => AppController.logoutAdmin?.(),
    'nav': (data) => AppController.nav?.(data.target, data.element),
    'nav-with-filter': (data) => AppController.navWithFilter?.(data.section, data.status),
    'toggle-sidebar': () => AdminUI?.toggleSidebar?.(),
    'toggle-theme': () => AdminUI?.toggleTheme?.(),
    'refresh': (data) => AppController.refresh?.(data.type || data.target),
    'refresh-dash': () => AppController.refresh?.('dash'),
    'render-users': () => AppController.refresh?.('users'),
    
    // --- 2. إعدادات النظام والهوية ---
    'save-system': () => AppController.saveSystem?.(),
    'toggle-system': (data) => AppController.confirmSystemToggle?.(data.type, data.element),
    'save-support': () => AppController.saveSupportSettings?.(),
    'save-terms': () => AppController.saveTerms?.(),
    'save-admin-profile': () => AppController.saveAdminProfile?.(),
    'auto-save-settings': () => MarketingController.autoSaveSettings?.(), // تم التوجيه للمتحكم الصحيح
    
    // --- 3. النوافذ المشتركة ---
    'open-modal': (data) => AdminUI?.openModal?.(data.target),
    'close-modal': () => AdminUI?.closeModal?.(),
    'close-drawer': (data) => {
        // توجيه الإغلاق عبر البوابة الرئيسية (Facade)
        if (data.type === 'deposit') AdminUI?.closeDepositDrawer?.();
        else AdminUI?.closeOrderDrawer?.();
    },
    'open-img-viewer': (data) => AdminUI?.openImageViewer?.(data.src),
    'close-img-viewer': () => AdminUI?.closeImageViewer?.(),
    
    // --- 4. الموجه الديناميكي (Dynamic Editors) - 🌟 خالي من التداخل ---
    'edit-item': (data) => {
        if (data.type === 'cat') AdminUI?.CatalogUI?.openCategoryModal?.(data.id);
        else if (data.type === 'prod') CatalogController.openProductModal?.(data.id);
        else if (data.type === 'pay') AdminUI?.FinanceUI?.openPaymentModal?.(data.id);
        else if (data.type === 'country') AdminUI?.CatalogUI?.openCountryModal?.(data.id);
        else if (data.type === 'coupon') MarketingController.openCouponModal?.(data.id);
        else if (data.type === 'offer') MarketingController.openOfferModal?.(data.id);
        else if (data.type === 'vault') AdminUI?.CatalogUI?.openVaultModal?.(data.id);
        else if (data.type === 'tier') AdminUI?.UsersUI?.openTierModal?.(data.id);
    },
    'delete-item': async (data) => {
        if (data.id && AdminUI && await AdminUI.showConfirm('هل أنت متأكد من الحذف نهائياً؟ لا يمكن التراجع.')) {
            await AppController.delItem(data.type, data.id);
        }
    },
    
    // --- 5. الفلاتر والتقويم ---
    'apply-filters': (data) => AppController.applyFilters?.(data.section),
    'quick-date': (data) => AppController.setQuickDateFilter?.(data.range, data.section),
    'open-calendar': (data) => AdminCalendar?.open?.(data.type, data.section, data.time === 'true'),
    'cal-select-day': (data) => AdminCalendar?.selectDay?.(Number(data.val)),
    'cal-set-month': (data) => AdminCalendar?.setMonth?.(Number(data.val)),
    'cal-set-year': (data) => AdminCalendar?.setYear?.(Number(data.val)),
    'cal-toggle-months': () => AdminCalendar?.toggleMonths?.(),
    'cal-toggle-years': () => AdminCalendar?.toggleYears?.(),
    'cal-change-month': (data) => AdminCalendar?.changeMonth?.(Number(data.val)),
    'cal-change-year': (data) => AdminCalendar?.changeYear?.(Number(data.val)),
    'cal-clear': () => AdminCalendar?.clear?.(),
    'cal-confirm': () => AdminCalendar?.confirm?.(),
    
    // --- 6. الأدوات العامة ---
    'scroll-to-alerts': () => AdminUI?.scrollToAlerts?.(),
    'change-leaderboard-filter': (data) => AdminRender?.changeLeaderboardFilter?.(data.val || data.element.value),
    'change-leaderboard-filter': (data) => AdminRender?.changeLeaderboardFilter?.(data.val || data.element.value),
    'export-excel': (data) => AdminRender?.exportDataToExcel?.(data.type || data.target),
    'export-data': () => BackupSystem?.exportData?.(),
    'copy-text': (data) => AdminUI?.copyText?.(data.copyText, data.originalEvent, data.element),
    'copy-to-clipboard': (data) => AdminUI?.copyToClipboard?.(data.element),
    'trigger-click': (data) => document.getElementById(data.target)?.click(),
    'clear-img': (data) => AdminUI?.clearImg?.(data.preview, data.wrap, data.input, data.originalEvent),
    'upload-img': (data) => AdminUI?.handleImageUpload?.(data.element, data.preview, data.wrap)
};