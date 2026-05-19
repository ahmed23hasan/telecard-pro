// ============================================================================
// ⚙️ خريطة مسارات النظام (System Actions Router)
// 🎯 الوظيفة: الأحداث المشتركة، النوافذ، الملاحة، التقويم، وإعدادات النظام العامة
// 🌟 التحديث: فك الارتباط الدائري (Circular Dependency) عبر EventBus
// ============================================================================

import { AdminUI, AdminCalendar } from '../adminUI.js';
import { AdminRender } from '../adminRender.js';
import { EventBus } from '../adminUtils.js';
import { BackupSystem } from './backupService.js'; 

// استيراد المتحكمات الفرعية لتوجيه أوامر التعديل والحذف
import { CatalogController } from '../modules/catalog/catalogController.js';
import { FinanceController } from '../modules/finance/financeController.js';
import { MarketingController } from '../modules/marketing/marketingController.js';
import { UsersController } from '../modules/users/usersController.js';

export const SystemActions = {
    // --- 1. النظام الأساسي والملاحة ---
    'logout': () => EventBus.emit('req-logout'),
    'nav': (data) => EventBus.emit('req-navigate', { page: data.target, btnEl: data.element }),
    'nav-with-filter': (data) => EventBus.emit('req-navigate-filter', { section: data.section, status: data.status }),
    'toggle-sidebar': () => AdminUI?.toggleSidebar?.(),
    'toggle-theme': () => AdminUI?.toggleTheme?.(),
    'refresh': (data) => EventBus.emit('req-refresh', { type: data.type || data.target }),
    'refresh-dash': () => EventBus.emit('req-refresh', { type: 'dash' }),
    'render-users': () => EventBus.emit('req-refresh', { type: 'users' }),
    
    // --- 2. إعدادات النظام والهوية ---
    'save-system': () => EventBus.emit('req-save-system'),
    'toggle-system': (data) => EventBus.emit('req-toggle-system', { type: data.type, element: data.element }),
    'save-support': () => EventBus.emit('req-save-support'),
    'save-terms': () => EventBus.emit('req-save-terms'),
    'save-admin-profile': () => EventBus.emit('req-save-admin-profile'),
    'auto-save-settings': () => MarketingController.autoSaveSettings?.(), 
    
    // --- 3. النوافذ المشتركة ---
    'open-modal': (data) => AdminUI?.openModal?.(data.target),
    'close-modal': () => AdminUI?.closeModal?.(),
    'close-drawer': (data) => {
        if (data.type === 'deposit') AdminUI?.closeDepositDrawer?.();
        else AdminUI?.closeOrderDrawer?.();
    },
    'open-img-viewer': (data) => AdminUI?.openImageViewer?.(data.src),
    'close-img-viewer': () => AdminUI?.closeImageViewer?.(),
    
    // --- 4. الموجه الديناميكي (Dynamic Editors) ---
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
            EventBus.emit('req-delete-item', { type: data.type, id: data.id });
        }
    },
    
    // --- 5. الفلاتر والتقويم ---
    'apply-filters': (data) => EventBus.emit('req-apply-filters', { section: data.section }),
    'quick-date': (data) => EventBus.emit('req-quick-date', { range: data.range, section: data.section }),
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
    'export-excel': (data) => AdminRender?.exportDataToExcel?.(data.type || data.target),
    'export-data': () => BackupSystem?.exportData?.(),
    'copy-text': (data) => AdminUI?.copyText?.(data.copyText, data.originalEvent, data.element),
    'copy-to-clipboard': (data) => AdminUI?.copyToClipboard?.(data.element),
    'trigger-click': (data) => document.getElementById(data.target)?.click(),
    'clear-img': (data) => AdminUI?.clearImg?.(data.preview, data.wrap, data.input, data.originalEvent),
    'upload-img': (data) => AdminUI?.handleImageUpload?.(data.element, data.preview, data.wrap)
};
