// ============================================================================
// 📊 قوالب لوحة القيادة والمبيعات (modules/dashboard/dashboardTemplates.js)
// 🚀 التحديث: فصل قالب "الرادار الذكي" ليكون مستقلاً تماماً عن المنطق
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;

export const DashboardTemplates = {
    dashEmptyWallets: () => `<div class="dash-circ-card" data-action="nav" data-target="wallets"><div class="circ-icon bg-warning"><i class="fa-solid fa-wallet"></i></div><div class="circ-data"><h3 class="num-en text-warning">0</h3><span>لا توجد أرصدة للعملاء</span></div></div>`,
    
    dashWalletCapsule: (title, val, currencyCode) => `<div class="dash-circ-card" data-action="nav" data-target="wallets"><div class="circ-icon bg-success"><i class="fa-solid fa-coins"></i></div><div class="circ-data"><h3 class="num-en text-success dash-wallet-val" dir="ltr" lang="en">${RenderHelpers.formatMoney(val, currencyCode, 2)}</h3><span>${_esc(title)}</span></div></div>`,
    
    dashCouponsSection: (promoStats) => `
        <div class="dash-group-header">
            <h4><i class="fa-solid fa-tags text-purple"></i> مركز تحليل العروض والخصومات الشامل</h4>
            <div class="group-line"></div>
        </div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card" data-action="nav" data-target="coupons"><div class="circ-icon bg-danger"><i class="fa-solid fa-percent"></i></div><div class="circ-data"><h3 class="num-en text-danger" dir="ltr" lang="en">${RenderHelpers.formatMoney(promoStats.totalDiscountAmount, 'USD', 2)}</h3><span>الخصومات الممنوحة</span></div></div>
            <div class="dash-circ-card" data-action="nav" data-target="coupons"><div class="circ-icon bg-gold"><i class="fa-solid fa-sack-dollar"></i></div><div class="circ-data"><h3 class="num-en text-gold" dir="ltr" lang="en">${RenderHelpers.formatMoney(promoStats.discountedRevenue, 'USD', 2)}</h3><span>عائدات الخصومات</span></div></div>
            <div class="dash-circ-card" data-action="nav" data-target="coupons"><div class="circ-icon bg-success"><i class="fa-solid fa-cart-arrow-down"></i></div><div class="circ-data"><h3 class="num-en text-success" dir="ltr" lang="en">${_enNum(promoStats.totalDiscountedOrders)}</h3><span>الطلبات المخفضة</span></div></div>
            <div class="dash-circ-card" data-action="nav" data-target="coupons"><div class="circ-icon bg-purple"><i class="fa-solid fa-ticket"></i></div><div class="circ-data"><h3 class="num-en text-purple" dir="ltr">${_esc(promoStats.topCoupon)}</h3><span>الكوبون الأكثر استخداماً</span></div></div>
            <div class="dash-circ-card" data-action="nav" data-target="coupons"><div class="circ-icon bg-info"><i class="fa-solid fa-bolt"></i></div><div class="circ-data"><h3 class="num-en text-info" dir="ltr">${_esc(promoStats.topOffer)}</h3><span>حملة التخفيض الأنجح</span></div></div>
        </div>
    `,
    
    dashCommunitySection: (podiumHtml, activeUserHtml, currentFilter = 'all') => `<div class="dash-group-header dash-header-with-filter"><h4><i class="fa-solid fa-trophy text-gold"></i> مجتمع الأبطال (لوحة الشرف)</h4><select class="form-input select-micro" data-action="change-leaderboard-filter"><option value="all" ${currentFilter === 'all' ? 'selected' : ''}>كل الأوقات</option><option value="this_month" ${currentFilter === 'this_month' ? 'selected' : ''}>هذا الشهر</option><option value="last_month" ${currentFilter === 'last_month' ? 'selected' : ''}>الشهر الماضي</option></select></div><div class="dash-community-layout">${podiumHtml}<div class="dash-community-sidebar">${activeUserHtml}</div></div>`,
    
    dashPodium: (topUsers) => {
        if (!topUsers || topUsers.length === 0) return `<div class="podium-container"><div class="empty-alert text-muted align-self-center"><i class="fa-solid fa-trophy"></i><span>لا توجد بيانات كافية</span></div></div>`;
        const ranks = [{ user: topUsers[1], rankClass: 'rank-2', badge: '<i class="fa-solid fa-medal"></i>', num: '2' }, { user: topUsers[0], rankClass: 'rank-1', badge: '<i class="fa-solid fa-crown"></i>', num: '1' }, { user: topUsers[2], rankClass: 'rank-3', badge: '<i class="fa-solid fa-award"></i>', num: '3' }];
        let html = `<div><div class="podium-section-title"><i class="fa-solid fa-crown"></i> أبطال المتجر (الأكثر شراءً)</div><div class="podium-container">`;
        ranks.forEach(item => {
            if (item.user) {
                html += `<div class="podium-item ${item.rankClass} clickable" data-action="view-user" data-id="${_esc(item.user.id)}"><div class="podium-avatar-wrap"><div class="podium-rank-num">${item.num}</div><div class="rank-badge">${item.badge}</div></div><div class="podium-info"><span class="uid-capsule copyable-admin" data-action="copy-text" data-copy-text="${_esc(item.user.displayId)}" title="رقم العميل"><i class="fa-solid fa-hashtag"></i>${_esc(item.user.displayId)}</span><span class="podium-value text-gold num-en" dir="ltr">${RenderHelpers.formatMoney(item.user.spent, 'USD', 2)}</span></div></div>`;
            }
        });
        return html + '</div></div>';
    },
    
    dashActiveUserCapsule: (user) => {
        if (!user) return `<div class="dash-circ-card highlight-active"><div class="circ-icon bg-orange"><i class="fa-solid fa-fire-flame-curved"></i></div><div class="circ-data"><h3 class="text-orange">---</h3><span>لا يوجد نشاط مسجل</span></div></div>`;
        const avatar = user.img ? `<img src="${_esc(user.img)}" class="usr-avatar-img">` : `<i class="fa-solid fa-fire"></i>`;
        return `<div class="dash-circ-card highlight-active clickable" data-action="view-user" data-id="${_esc(user.id)}"><div class="circ-icon bg-warning">${avatar}</div><div class="circ-data"><span>العميل الأكثر نشاطاً</span><div class="mt-15"><span class="uid-capsule copyable-admin" data-action="copy-text" data-copy-text="${_esc(user.displayId)}" title="رقم العميل"><i class="fa-solid fa-hashtag"></i>${_esc(user.displayId)}</span></div></div></div>`;
    },
    
    dashGrid: (stats, walletsCapsules, couponsHtml, communityHtml) => `
        <div class="dash-group-header"><h4><i class="fa-solid fa-money-bill-trend-up text-gold"></i> النبض المالي</h4><div class="group-line"></div></div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card cap-profit" data-action="nav-with-filter" data-section="orders" data-status="completed"><div class="circ-icon bg-gold"><i class="fa-solid fa-sack-dollar"></i></div><div class="circ-data"><h3 class="num-en text-gold" dir="ltr" lang="en">${RenderHelpers.formatMoney(stats.financials.totalProfit, 'USD', 2)}</h3><span>صافي الأرباح</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="orders" data-status="completed"><div class="circ-icon bg-primary"><i class="fa-solid fa-chart-line"></i></div><div class="circ-data"><h3 class="num-en text-primary" dir="ltr" lang="en">${RenderHelpers.formatMoney(stats.financials.totalRevenue, 'USD', 2)}</h3><span>إجمالي المبيعات</span></div></div>
        </div>
        
        <div class="dash-group-header"><h4><i class="fa-solid fa-vault text-success"></i> سيولة المحافظ</h4><div class="group-line"></div></div>
        <div class="dash-circ-grid" id="dash-wallets-grid">${walletsCapsules}</div>
        
        ${couponsHtml || ''}
        
        <div class="dash-group-header"><h4><i class="fa-solid fa-box-open text-primary"></i> حركة الطلبات</h4><div class="group-line"></div></div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="orders" data-status="all"><div class="circ-icon bg-primary"><i class="fa-solid fa-cubes"></i></div><div class="circ-data"><h3 class="num-en text-main" dir="ltr" lang="en">${_enNum(stats.orders.total)}</h3><span>إجمالي الطلبات</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="orders" data-status="completed"><div class="circ-icon bg-success"><i class="fa-solid fa-check-double"></i></div><div class="circ-data"><h3 class="num-en text-success" dir="ltr" lang="en">${_enNum(stats.orders.completed)}</h3><span>طلبات مكتملة</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="orders" data-status="rejected"><div class="circ-icon bg-danger"><i class="fa-solid fa-xmark"></i></div><div class="circ-data"><h3 class="num-en text-danger" dir="ltr" lang="en">${_enNum(stats.orders.rejected)}</h3><span>طلبات مرفوضة</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="orders" data-status="refunded"><div class="circ-icon bg-info"><i class="fa-solid fa-rotate-left"></i></div><div class="circ-data"><h3 class="num-en text-info" dir="ltr" lang="en">${_enNum(stats.orders.refunded)}</h3><span>طلبات مسترجعة</span></div></div>
        </div>
        
        <div class="dash-group-header"><h4><i class="fa-solid fa-money-bill-transfer text-success"></i> حركة الإيداعات</h4><div class="group-line"></div></div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="deposits" data-status="all"><div class="circ-icon bg-primary"><i class="fa-solid fa-file-invoice-dollar"></i></div><div class="circ-data"><h3 class="num-en text-main" dir="ltr" lang="en">${_enNum(stats.deposits.total)}</h3><span>كل الإيداعات</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="deposits" data-status="approved"><div class="circ-icon bg-success"><i class="fa-solid fa-check"></i></div><div class="circ-data"><h3 class="num-en text-success" dir="ltr" lang="en">${_enNum(stats.deposits.approved)}</h3><span>مقبولة ومودعة</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="deposits" data-status="rejected"><div class="circ-icon bg-danger"><i class="fa-solid fa-ban"></i></div><div class="circ-data"><h3 class="num-en text-danger" dir="ltr" lang="en">${_enNum(stats.deposits.rejected)}</h3><span>إيداعات مرفوضة</span></div></div>
        </div>
        
        <div class="dash-group-header"><h4><i class="fa-solid fa-users text-info"></i> إحصائيات المستخدمين</h4><div class="group-line"></div></div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="users" data-status="all"><div class="circ-icon bg-info"><i class="fa-solid fa-users"></i></div><div class="circ-data"><h3 class="num-en text-info" dir="ltr" lang="en">${_enNum(stats.users.total || 0)}</h3><span>العملاء المسجلين</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="users" data-status="active"><div class="circ-icon bg-success"><i class="fa-solid fa-user-check"></i></div><div class="circ-data"><h3 class="num-en text-success" dir="ltr" lang="en">${_enNum(stats.users.active || 0)}</h3><span>العملاء النشطين</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="users" data-status="restricted"><div class="circ-icon bg-warning"><i class="fa-solid fa-user-lock"></i></div><div class="circ-data"><h3 class="num-en text-warning" dir="ltr" lang="en">${_enNum(stats.users.restricted || 0)}</h3><span>العملاء المقيدين</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="users" data-status="banned"><div class="circ-icon bg-danger"><i class="fa-solid fa-user-slash"></i></div><div class="circ-data"><h3 class="num-en text-danger" dir="ltr" lang="en">${_enNum(stats.users.banned || 0)}</h3><span>العملاء المحظورين</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="users" data-status="banned_ips"><div class="circ-icon bg-danger"><i class="fa-solid fa-network-wired"></i></div><div class="circ-data"><h3 class="num-en text-danger" dir="ltr" lang="en">${_enNum(stats.users.bannedIps || 0)}</h3><span>إجمالي IP المحظورة</span></div></div>
        </div>
        ${communityHtml || ''}
    `,
    
    dashEmptyAlerts: () => `<div class="empty-alert text-muted"><i class="fa-solid fa-check-circle"></i> النظام مستقر، لا توجد تنبيهات.</div>`,
    
    // 🌟 هذا هو القالب النظيف الذي سيستدعيه الريندر
    dashAlertItem: (type, icon, text, actionStr, timeStr) => `
        <div class="smart-alert-item alert-${type} ${actionStr ? 'clickable' : ''}" ${actionStr || ''}>
            ${timeStr ? `<div class="alert-time num-en" dir="ltr"><i class="fa-regular fa-clock"></i> ${timeStr}</div>` : ''}
            <div class="alert-content-wrap">
                <i class="fa-solid ${icon}"></i>
                <span>${text}</span>
            </div>
        </div>
    `
};