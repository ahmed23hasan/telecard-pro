// ============================================================================
// ⚙️ خريطة مسارات النظام (System Actions Router) - Enterprise V15.6 💎
// 🎯 الوظيفة: الأحداث المشتركة، النوافذ، الملاحة، التقويم، وإعدادات النظام العامة
// 🚀 التحديثات:
// 1. Radar Routing: إضافة مسارات تفعيل الإشعارات وتفضيلات غرفة العمليات.
// ============================================================================

import { AdminUI, AdminCalendar } from '../adminUI.js';
import { AdminRender } from '../adminRender.js';
import { EventBus } from '../adminUtils.js';
import { BackupSystem } from './backupService.js';

export const SystemActions = {
    // --- 1. النظام الأساسي والملاحة ---
    'logout': () => EventBus.emit('req-logout'),
    'nav': (data) => EventBus.emit('req-navigate', { page: data.target, btnEl: data.element }),
    'nav-with-filter': (data) => EventBus.emit('req-navigate-filter', { section: data.section, status: data.status }),
    
    'nav-to-complaints': () => {
        EventBus.emit('req-navigate', { page: 'notifs' });
        setTimeout(() => EventBus.emit('switch-notifs-tab', { tab: 'complaints' }), 100);
    },

    'go-back': () => EventBus.emit('req-go-back'),
    'toggle-sidebar': () => AdminUI?.toggleSidebar?.(),
    'toggle-theme': () => AdminUI?.toggleTheme?.(),
    'refresh': (data) => EventBus.emit('req-refresh', { type: data.type || data.target }),
    'refresh-dash': () => EventBus.emit('req-refresh', { type: 'dash' }),
    'render-users': () => EventBus.emit('req-refresh', { type: 'users' }),
    
    // --- 2. إعدادات النظام والهوية والرادار ---
    'save-system': () => EventBus.emit('req-save-system'),
    'toggle-system': (data) => EventBus.emit('req-toggle-system', { type: data.type, element: data.element }),
    'save-support': () => EventBus.emit('req-save-support'),
    'save-terms': () => EventBus.emit('req-save-terms'),
    'add-term-card': () => AdminUI?.addTermCardUI?.(),
    'select-term-icon': (data) => AdminUI?.selectTermIconUI?.(data.element, data.val),
    'save-admin-profile': () => EventBus.emit('req-save-admin-profile'),
    'auto-save-settings': () => EventBus.emit('req-auto-save-settings'),

    // 🚀 [مسارات الرادار وغرفة العمليات]:
    'enable-admin-notifs': () => EventBus.emit('req-enable-notifs'),
    'dismiss-admin-notifs': () => EventBus.emit('req-dismiss-notifs'),
    'save-admin-prefs': () => EventBus.emit('req-save-admin-prefs'),

    'save-about-us': () => EventBus.emit('save-about-us'),
    'save-social-links': () => EventBus.emit('save-social-links'),
    'switch-notifs-tab': (data) => EventBus.emit('switch-notifs-tab', { tab: data.tab }),
    'filter-reviews': () => EventBus.emit('filter-reviews'),
    
    'force-sync': () => EventBus.emit('req-force-sync'),
    'force-sync-pricing': () => EventBus.emit('req-force-sync-pricing'), 

    // --- 3. النوافذ المشتركة ---
    'open-modal': (data) => AdminUI?.openModal?.(data.target),
    'close-modal': (data) => AdminUI?.closeModal?.(data.target || data.id || null),
    
    'close-drawer': (data) => {
        if (data.type === 'deposit') AdminUI?.closeDepositDrawer?.();
        else AdminUI?.closeOrderDrawer?.();
    },
    'open-img-viewer': (data) => AdminUI?.openImageViewer?.(data.src),
    'close-img-viewer': () => AdminUI?.closeImageViewer?.(),
    'open-tx-detail': (data) => {
        const txId = String(data.id);
        if (data.type === 'order') AdminUI?.openOrderDrawer?.(txId);
        else if (data.type === 'deposit') AdminUI?.openDepositDrawer?.(txId);
    },
    
    // --- 4. الموجه الديناميكي (Dynamic Editors) ---
    'edit-item': (data) => EventBus.emit('req-edit-item', { type: data.type, id: data.id }),
    
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
    'upload-img': (data) => AdminUI?.handleImageUpload?.(data.element, data.preview, data.wrap),
    
    // --- 7. الجدار الناري والقائمة السوداء (Firewall & Blacklist) ---
    'add-global-ban-ip': () => EventBus.emit('req-add-ban-ip'),
    'remove-global-ban-ip': (data) => EventBus.emit('req-remove-ban-ip', { ip: data.ip }),
    'remove-global-ban-device': (data) => EventBus.emit('req-remove-ban-device', { device: data.device })
};
