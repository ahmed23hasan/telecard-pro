// ============================================================================
// 📊 قوالب لوحة القيادة والمبيعات (modules/dashboard/dashboardTemplates.js) - V15.1 👑
// 🎯 الوظيفة: توليد الـ HTML للأدوات المالية، الإحصائيات، ومؤشرات النمو
// 🚀 التحديث الأقصى: 
// 1. Growth Engine: دمج مؤشرات (الأسهم الخضراء والحمراء) لمقارنة الفترات الزمنية.
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;

export const DashboardTemplates = {
    
    // 🌟 [محرك حساب النمو - Growth Engine]
    growthBadge: (curr, prev) => {
        if (prev === 0 && curr === 0) return '<span class="fs-11 text-muted" dir="ltr">0%</span>';
        if (prev === 0) return '<span class="fs-11 text-success fw-bold" dir="ltr"><i class="fa-solid fa-arrow-trend-up"></i> 100%</span>';
        
        const pct = ((curr - prev) / prev) * 100;
        const formatted = _enNum(Math.abs(pct), 1) + '%';
        
        if (pct > 0) return `<span class="fs-11 text-success fw-bold" dir="ltr" title="مقارنة بالفترة السابقة"><i class="fa-solid fa-arrow-trend-up"></i> +${formatted}</span>`;
        if (pct < 0) return `<span class="fs-11 text-danger fw-bold" dir="ltr" title="مقارنة بالفترة السابقة"><i class="fa-solid fa-arrow-trend-down"></i> -${formatted}</span>`;
        return `<span class="fs-11 text-muted fw-bold" dir="ltr">0%</span>`;
    },

    // 🌟 [لوحة ملخص المبيعات مع مؤشرات النمو]
    salesExecutiveSummary: function(currStats, prevStats, range) {
        const isComparing = range !== 'all';
        const growthRev = isComparing ? this.growthBadge(currStats.revenue, prevStats.revenue) : '';
        const growthCost = isComparing ? this.growthBadge(currStats.cost, prevStats.cost) : '';
        const growthProf = isComparing ? this.growthBadge(currStats.profit, prevStats.profit) : '';
        const growthCount = isComparing ? this.growthBadge(currStats.count, prevStats.count) : '';

        return `
            <div class="dash-circ-card">
                <div class="circ-icon bg-primary"><i class="fa-solid fa-money-bill-trend-up"></i></div>
                <div class="circ-data">
                    <div class="flex-between align-items-center w-100 mb-5">
                        <h3 class="num-en text-primary m-0" dir="ltr">${RenderHelpers.formatMoney(currStats.revenue, 'USD', 2)}</h3>
                        ${growthRev}
                    </div>
                    <span>إجمالي الإيرادات</span>
                </div>
            </div>
            <div class="dash-circ-card">
                <div class="circ-icon bg-danger"><i class="fa-solid fa-hand-holding-dollar"></i></div>
                <div class="circ-data">
                    <div class="flex-between align-items-center w-100 mb-5">
                        <h3 class="num-en text-danger m-0" dir="ltr">${RenderHelpers.formatMoney(currStats.cost, 'USD', 2)}</h3>
                        ${growthCost}
                    </div>
                    <span>إجمالي التكاليف</span>
                </div>
            </div>
            <div class="dash-circ-card">
                <div class="circ-icon bg-gold"><i class="fa-solid fa-sack-dollar"></i></div>
                <div class="circ-data">
                    <div class="flex-between align-items-center w-100 mb-5">
                        <h3 class="num-en text-gold m-0" dir="ltr">${RenderHelpers.formatMoney(currStats.profit, 'USD', 2)}</h3>
                        ${growthProf}
                    </div>
                    <span>الربح الصافي</span>
                </div>
            </div>
            <div class="dash-circ-card">
                <div class="circ-icon bg-warning"><i class="fa-solid fa-box-open"></i></div>
                <div class="circ-data">
                    <div class="flex-between align-items-center w-100 mb-5">
                        <h3 class="num-en text-warning m-0" dir="ltr">${_enNum(currStats.count)}</h3>
                        ${growthCount}
                    </div>
                    <span>الطلبات الناجحة</span>
                </div>
            </div>
        `;
    },

    // 💰 قوالب المحافظ والسيولة
    dashEmptyWallets: () => `
        <div class="dash-circ-card" data-action="nav" data-target="wallets">
            <div class="circ-icon bg-warning"><i class="fa-solid fa-wallet"></i></div>
            <div class="circ-data"><h3 class="num-en text-warning">0</h3><span>لا توجد أرصدة للعملاء</span></div>
        </div>`,
    
    dashWalletCapsule: (title, val, currencyCode) => `
        <div class="dash-circ-card" data-action="nav" data-target="wallets">
            <div class="circ-icon bg-success"><i class="fa-solid fa-coins"></i></div>
            <div class="circ-data">
                <h3 class="num-en text-success dash-wallet-val" dir="ltr" lang="en">${RenderHelpers.formatMoney(val, currencyCode, 2)}</h3>
                <span>${_esc(title)}</span>
            </div>
        </div>`,
    
    dashCouponsSection: (promoStats) => `
        <div class="dash-group-header">
            <h4><i class="fa-solid fa-tags text-purple"></i> مركز تحليل العروض والخصومات الشامل</h4>
            <div class="group-line"></div>
        </div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card" data-action="nav" data-target="coupons"><div class="circ-icon bg-danger"><i class="fa-solid fa-percent"></i></div><div class="circ-data"><h3 class="num-en text-danger" dir="ltr">${RenderHelpers.formatMoney(promoStats.totalDiscountAmount, 'USD', 2)}</h3><span>الخصومات الممنوحة</span></div></div>
            <div class="dash-circ-card" data-action="nav" data-target="coupons"><div class="circ-icon bg-gold"><i class="fa-solid fa-sack-dollar"></i></div><div class="circ-data"><h3 class="num-en text-gold" dir="ltr">${RenderHelpers.formatMoney(promoStats.discountedRevenue, 'USD', 2)}</h3><span>عائدات الخصومات</span></div></div>
            <div class="dash-circ-card" data-action="nav" data-target="coupons"><div class="circ-icon bg-success"><i class="fa-solid fa-cart-arrow-down"></i></div><div class="circ-data"><h3 class="num-en text-success" dir="ltr">${_enNum(promoStats.totalDiscountedOrders)}</h3><span>الطلبات المخفضة</span></div></div>
            <div class="dash-circ-card" data-action="nav" data-target="coupons"><div class="circ-icon bg-purple"><i class="fa-solid fa-ticket"></i></div><div class="circ-data"><h3 class="num-en text-purple" dir="ltr">${_esc(promoStats.topCoupon || '---')}</h3><span>الكوبون الأقوى</span></div></div>
        </div>`,
    
    dashCommunitySection: (podiumHtml, activeUserHtml, currentFilter = 'all') => `
        <div class="dash-group-header dash-header-with-filter">
            <h4><i class="fa-solid fa-trophy text-gold"></i> مجتمع الأبطال (لوحة الشرف)</h4>
            <select class="form-input select-micro" data-action="change-leaderboard-filter">
                <option value="all" ${currentFilter === 'all' ? 'selected' : ''}>كل الأوقات</option>
                <option value="this_month" ${currentFilter === 'this_month' ? 'selected' : ''}>هذا الشهر</option>
                <option value="last_month" ${currentFilter === 'last_month' ? 'selected' : ''}>الشهر الماضي</option>
            </select>
        </div>
        <div class="dash-community-layout">
            ${podiumHtml}
            <div class="dash-community-sidebar">${activeUserHtml}</div>
        </div>`,
    
    dashPodium: (topUsers) => {
        if (!topUsers || topUsers.length === 0) {
            return `<div class="podium-container"><div class="empty-alert text-muted align-self-center"><i class="fa-solid fa-trophy"></i><span>لا توجد بيانات كافية</span></div></div>`;
        }
        
        const podiumSchema = [
            { index: 1, rankClass: 'rank-2', num: '2' },
            { index: 0, rankClass: 'rank-1', num: '1' },
            { index: 2, rankClass: 'rank-3', num: '3' }
        ];
        
        let html = `<div><div class="podium-section-title"><i class="fa-solid fa-crown text-gold"></i> أبطال المتجر (الأكثر شراءً)</div><div class="podium-container">`;
        
        podiumSchema.forEach(slot => {
            const user = topUsers[slot.index];
            if (user) {
                html += `
                    <div class="podium-item ${slot.rankClass} animate__animated animate__zoomIn clickable" data-action="view-user" data-id="${_esc(user.id)}">
                        <div class="podium-avatar-wrap">
                            <div class="podium-rank-num">${slot.num}</div>
                        </div>
                        <div class="podium-info">
                            <span class="podium-name text-truncate">${_esc(user.name)}</span>
                            <span class="podium-value text-gold num-en" dir="ltr">${RenderHelpers.formatMoney(user.spent, 'USD', 2)}</span>
                        </div>
                    </div>`;
            } else {
                html += `<div class="podium-item ${slot.rankClass} podium-ghost"></div>`;
            }
        });
        
        return html + '</div></div>';
    },
    
    dashActiveUserCapsule: (user) => {
        if (!user) return `<div class="dash-circ-card highlight-active"><div class="circ-icon bg-orange"><i class="fa-solid fa-fire-flame-curved"></i></div><div class="circ-data"><h3 class="text-orange">---</h3><span>لا يوجد نشاط مسجل</span></div></div>`;
        return `
            <div class="dash-circ-card highlight-active clickable" data-action="view-user" data-id="${_esc(user.id)}">
                <div class="circ-icon bg-warning"><i class="fa-solid fa-fire-flame-curved"></i></div>
                <div class="circ-data">
                    <span>العميل الأكثر نشاطاً</span>
                    <div class="mt-15">
                        <span class="uid-capsule copyable-admin" data-action="copy-text" data-copy-text="${_esc(user.displayId)}" title="رقم العميل"><i class="fa-solid fa-hashtag"></i>${_esc(user.displayId)}</span>
                    </div>
                </div>
            </div>`;
    },
    
    dashGrid: (stats, walletsCapsules, couponsHtml, communityHtml) => `
        <div class="dash-group-header"><h4><i class="fa-solid fa-money-bill-trend-up text-gold"></i> النبض المالي</h4><div class="group-line"></div></div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card cap-profit" data-action="nav-with-filter" data-section="orders" data-status="completed"><div class="circ-icon bg-gold"><i class="fa-solid fa-sack-dollar"></i></div><div class="circ-data"><h3 class="num-en text-gold" dir="ltr">${RenderHelpers.formatMoney(stats.financials.totalProfit, 'USD', 2)}</h3><span>صافي الأرباح</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="orders" data-status="completed"><div class="circ-icon bg-primary"><i class="fa-solid fa-chart-line"></i></div><div class="circ-data"><h3 class="num-en text-primary" dir="ltr">${RenderHelpers.formatMoney(stats.financials.totalRevenue, 'USD', 2)}</h3><span>إجمالي المبيعات</span></div></div>
        </div>
        
        <div class="dash-group-header"><h4><i class="fa-solid fa-vault text-success"></i> سيولة المحافظ</h4><div class="group-line"></div></div>
        <div class="dash-circ-grid" id="dash-wallets-grid">${walletsCapsules}</div>
        
        ${couponsHtml || ''}
        
        <div class="dash-group-header"><h4><i class="fa-solid fa-box-open text-primary"></i> حركة الطلبات</h4><div class="group-line"></div></div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="orders" data-status="all"><div class="circ-icon bg-primary"><i class="fa-solid fa-cubes"></i></div><div class="circ-data"><h3 class="num-en text-main">${_enNum(stats.orders.total)}</h3><span>إجمالي الطلبات</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="orders" data-status="completed"><div class="circ-icon bg-success"><i class="fa-solid fa-check-double"></i></div><div class="circ-data"><h3 class="num-en text-success">${_enNum(stats.orders.completed)}</h3><span>طلبات مكتملة</span></div></div>
        </div>
        
        <div class="dash-group-header"><h4><i class="fa-solid fa-users text-info"></i> إحصائيات المستخدمين</h4><div class="group-line"></div></div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="users" data-status="all"><div class="circ-icon bg-info"><i class="fa-solid fa-users"></i></div><div class="circ-data"><h3 class="num-en text-info">${_enNum(stats.users.total || 0)}</h3><span>العملاء المسجلين</span></div></div>
            <div class="dash-circ-card" data-action="nav-with-filter" data-section="users" data-status="banned"><div class="circ-icon bg-danger"><i class="fa-solid fa-user-slash"></i></div><div class="circ-data"><h3 class="num-en text-danger">${_enNum(stats.users.banned || 0)}</h3><span>المحظورين</span></div></div>
        </div>
        ${communityHtml || ''}
    `,
    
    dashEmptyAlerts: () => `<div class="empty-alert text-muted"><i class="fa-solid fa-check-circle"></i> النظام مستقر، لا توجد تنبيهات أو مهام معلقة.</div>`,
    
    dashAlertItem: (type, icon, text, actionStr, timeStr) => `
        <div class="smart-alert-item alert-${type} ${actionStr ? 'clickable' : ''}" ${actionStr || ''}>
            ${timeStr ? `<div class="alert-time num-en" dir="ltr"><i class="fa-regular fa-clock"></i> ${timeStr}</div>` : ''}
            <div class="alert-content-wrap">
                <i class="fa-solid ${icon}"></i>
                <span>${text}</span>
            </div>
        </div>`
};
