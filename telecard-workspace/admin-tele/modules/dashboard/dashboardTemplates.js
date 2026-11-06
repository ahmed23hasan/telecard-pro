// ============================================================================
// 📊 قوالب لوحة القيادة والمبيعات (modules/dashboard/dashboardTemplates.js) - Ultimate Pro V20.2 👑
// 🎯 الوظيفة: توليد الـ HTML للأدوات المالية، الإحصائيات، ومؤشرات النمو
// 🌟 التحديثات المعمارية:
// 1. Animation & Redundant Wrappers Cleanup 🧹: إزالة فئات الحركة الوهمية غير المعرفة (animate__animated animate__fadeIn)
//    وحذف حاوية التوسيط الزائدة داخل .active-heroes-card لاعتماد خصائص Flexbox المركزية من admin.css مباشرة.
// 2. Strict CSS & Palette Alignment 📐: الحفاظ على فئات المنصة القياسية (.podium-ghost) وكبسولات الملخص التنفيذي.
// 3. Resilient Metrics & Growth Badges 💎: حماية مؤشرات النمو وشارات الأبطال من أخطاء القسمة على صفر والتشفير المزدوج.
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;

export const DashboardTemplates = {
    
    // 🌟 1. شارة النمو (نسبة التغير) مع الحماية من القسمة على صفر
    growthBadge: (curr, prev) => {
        const c = Number(curr) || 0;
        const p = Number(prev) || 0;
        
        if (p === 0 && c === 0) return '<span class="fs-11 text-muted font-numeric" dir="ltr" lang="en">0%</span>';
        if (p === 0 && c > 0) return '<span class="fs-11 text-success fw-bold font-numeric" dir="ltr" lang="en"><i class="fa-solid fa-arrow-trend-up me-1"></i> +100%</span>';
        if (p === 0 && c < 0) return '<span class="fs-11 text-danger fw-bold font-numeric" dir="ltr" lang="en"><i class="fa-solid fa-arrow-trend-down me-1"></i> -100%</span>';
        
        const pct = (Math.abs(p) > 0) ? ((c - p) / Math.abs(p)) * 100 : 0;
        const formatted = _enNum(Math.abs(pct), 1) + '%';
        
        if (pct > 0) return `<span class="text-success fw-bold font-numeric" dir="ltr" lang="en" title="مقارنة بالفترة السابقة"><i class="fa-solid fa-arrow-trend-up ms-1"></i> +${formatted}</span>`;
        if (pct < 0) return `<span class="text-danger fw-bold font-numeric" dir="ltr" lang="en" title="مقارنة بالفترة السابقة"><i class="fa-solid fa-arrow-trend-down ms-1"></i> -${formatted}</span>`;
        return `<span class="text-muted fw-bold font-numeric" dir="ltr" lang="en">0%</span>`;
    },
    
    // 🌟 2. كبسولات المبيعات العلوية
    salesExecutiveSummary: function(currStats, prevStats, range) {
    const safeCurr = currStats || {};
    const safePrev = prevStats || {};
    const currOrdersCount = Number(safeCurr.count ?? safeCurr.completed_count ?? 0);
    const prevOrdersCount = Number(safePrev.count ?? safePrev.completed_count ?? 0);
    
    const isComparing = range !== 'all' && Boolean(prevStats);
    const growthRev = isComparing ? this.growthBadge(safeCurr.revenue, safePrev.revenue) : '<span class="text-muted">---</span>';
    const growthCost = isComparing ? this.growthBadge(safeCurr.cost, safePrev.cost) : '<span class="text-muted">---</span>';
    const growthProf = isComparing ? this.growthBadge(safeCurr.profit, safePrev.profit) : '<span class="text-muted">---</span>';
    const growthCount = isComparing ? this.growthBadge(currOrdersCount, prevOrdersCount) : '<span class="text-muted">---</span>';
    
    return `
                <div class="super-cap cap-revenue">
                    <span class="sc-title">إجمالي الإيرادات</span>
                    <span class="sc-val num-en font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(safeCurr.revenue, 'USD', 2)}</span>
                    <span class="sc-sub">${growthRev}</span>
                </div>
                <div class="super-cap cap-rejected">
                    <span class="sc-title">إجمالي التكاليف</span>
                    <span class="sc-val text-danger num-en font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(safeCurr.cost, 'USD', 2)}</span>
                    <span class="sc-sub">${growthCost}</span>
                </div>
                <div class="super-cap cap-profit">
                    <span class="sc-title">الربح الصافي</span>
                    <span class="sc-val text-gold num-en font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(safeCurr.profit, 'USD', 2)}</span>
                    <span class="sc-sub">${growthProf}</span>
                </div>
                <div class="super-cap cap-orders">
                    <span class="sc-title">الطلبات الناجحة</span>
                    <span class="sc-val text-success num-en font-numeric" dir="ltr" lang="en">${_enNum(currOrdersCount)}</span>
                    <span class="sc-sub">${growthCount}</span>
                </div>
            `;
},
    dashEmptyWallets: () => `
        <div class="dash-circ-card interactive-scale" data-action="nav" data-target="wallets">
            <div class="circ-icon bg-warning"><i class="fa-solid fa-wallet"></i></div>
            <div class="circ-data"><h3 class="num-en text-warning font-numeric" dir="ltr" lang="en">0</h3><span>لا توجد أرصدة للعملاء</span></div>
        </div>`,
    
    dashWalletCapsule: (title, val, currencyCode) => `
        <div class="dash-circ-card interactive-scale" data-action="nav" data-target="wallets">
            <div class="circ-icon bg-success"><i class="fa-solid fa-coins"></i></div>
            <div class="circ-data">
                <h3 class="num-en text-success dash-wallet-val font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(val, currencyCode, 2)}</h3>
                <span>${_esc(title)}</span>
            </div>
        </div>`,
    
    dashCouponsSection: (promoStats) => `
        <div class="dash-group-header">
            <h4><i class="fa-solid fa-tags text-purple me-1"></i> مركز تحليل العروض والخصومات الشامل</h4>
            <div class="group-line"></div>
        </div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card interactive-scale" data-action="nav" data-target="coupons"><div class="circ-icon bg-danger"><i class="fa-solid fa-percent"></i></div><div class="circ-data"><h3 class="num-en text-danger font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(promoStats.totalDiscountAmount, 'USD', 2)}</h3><span>الخصومات الممنوحة</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav" data-target="coupons"><div class="circ-icon bg-gold"><i class="fa-solid fa-sack-dollar"></i></div><div class="circ-data"><h3 class="num-en text-gold font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(promoStats.discountedRevenue, 'USD', 2)}</h3><span>عائدات الخصومات</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav" data-target="coupons"><div class="circ-icon bg-success"><i class="fa-solid fa-cart-arrow-down"></i></div><div class="circ-data"><h3 class="num-en text-success font-numeric" dir="ltr" lang="en">${_enNum(promoStats.totalDiscountedOrders)}</h3><span>الطلبات المخفضة</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav" data-target="coupons"><div class="circ-icon bg-purple"><i class="fa-solid fa-ticket"></i></div><div class="circ-data"><h3 class="num-en text-purple font-numeric" dir="ltr" lang="en">${_esc(promoStats.topCoupon || '---')}</h3><span>الكوبون الأقوى</span></div></div>
        </div>`,
    
    dashCommunitySection: (podiumHtml, activeUserHtml, currentFilter = 'all') => `
        <div class="dash-group-header dash-header-with-filter">
            <h4><i class="fa-solid fa-trophy text-gold me-1"></i> مجتمع الأبطال (لوحة الشرف)</h4>
            <select class="form-input select-micro select-shared" data-action="change-leaderboard-filter">
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
            return `<div class="podium-container w-100">${RenderHelpers.emptyState('fa-solid fa-trophy text-muted', 'لا توجد بيانات كافية', 'لم يتم تسجيل مبيعات كافية لعرض الأبطال.')}</div>`;
        }
        
        const podiumSchema = [
            { index: 1, rankClass: 'rank-2', num: '2', icon: '<i class="fa-solid fa-medal"></i>' },
            { index: 0, rankClass: 'rank-1', num: '1', icon: '<i class="fa-solid fa-crown text-gold"></i>' },
            { index: 2, rankClass: 'rank-3', num: '3', icon: '<i class="fa-solid fa-award"></i>' }
        ];
        
        let html = `<div><div class="podium-section-title"><i class="fa-solid fa-crown text-gold me-1"></i> أبطال المتجر (الأكثر شراءً)</div><div class="podium-container">`;
        
        podiumSchema.forEach(slot => {
            const user = topUsers[slot.index];
            if (user) {
                const safeName = _esc(user.userDataSnapshot?.fullName || user.name || 'عميل');
                const avatarContent = user.img ?
                    `<img src="${_esc(user.img)}" class="podium-img"><div class="podium-rank-num font-numeric" dir="ltr" lang="en">${slot.num}</div>` :
                    `<div class="podium-rank-num font-numeric" dir="ltr" lang="en">${slot.num}</div>`;
                
                html += `
                    <div class="podium-item ${slot.rankClass} interactive-scale" data-action="view-user" data-id="${_esc(user.id)}">
                        <div class="podium-avatar-wrap">
                            ${avatarContent}
                            <div class="rank-badge">${slot.icon}</div>
                        </div>
                        <div class="podium-info">
                            <span class="podium-name">${safeName}</span>
                            <span class="podium-val text-gold num-en font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(user.spent, 'USD', 2)}</span>
                        </div>
                    </div>`;
            } else {
                html += `<div class="podium-item ${slot.rankClass} podium-ghost"></div>`;
            }
        });
        
        return html + '</div></div>';
    },
    
    dashActiveUsersList: (activeUsers) => {
        const sectionTitle = `
            <div class="dash-group-header">
                <h4><i class="fa-solid fa-fire-flame-curved text-warning me-1"></i> الأبطال الأكثر نشاطاً (طلبات)</h4>
                <div class="group-line"></div>
            </div>`;
        
        if (!activeUsers || activeUsers.length === 0) {
            return `
                <div class="w-100">
                    ${sectionTitle}
                    <div class="active-heroes-card">
                        ${RenderHelpers.emptyState('fa-solid fa-bolt-lightning text-muted', 'سجل النشاط فارغ', 'لم يتم تنفيذ أي طلبات بعد.')}
                    </div>
                </div>`;
        }
        
        let listHtml = activeUsers.map((u, i) => `
                <div class="active-hero-item interactive-scale" data-action="view-user" data-id="${_esc(u.id)}">
                    <div class="flex-align-center gap-2">
                        <div class="micro-rank-badge font-numeric" dir="ltr" lang="en">${i + 1}</div>
                        <div class="d-flex flex-column">
                            <span class="fs-13 fw-bold max-w-120" title="${_esc(u.name)}">${_esc(u.name)}</span>
                            <span class="fs-11 text-muted num-en font-numeric" dir="ltr" lang="en">#${_esc(u.displayId)}</span>
                        </div>
                    </div>
                    <div class="text-warning fw-bold num-en font-numeric" dir="ltr" lang="en" title="عدد الطلبات المنفذة">
                        <i class="fa-solid fa-bolt me-1"></i>${_enNum(u.count)}
                    </div>
                </div>
            `).join('');
        
        return `
                <div class="w-100">
                    ${sectionTitle}
                    <div class="active-heroes-card">
                        ${listHtml}
                    </div>
                </div>`;
    }, 

    // 🌟 9. شبكة لوحة القيادة
    dashGrid: (stats, walletsCapsules, couponsHtml, communityHtml) => {
        const fin = stats.financials || {};
        const ord = stats.orders || {};
        const dep = stats.deposits || {};
        const usr = stats.users || {};

        const totalProfit = Number(fin.totalProfit || 0);
        const apiProfit = Number(fin.apiProfit || 0);
        const retailProfit = fin.retailProfit !== undefined ? Number(fin.retailProfit || 0) : Math.max(0, totalProfit - apiProfit);

        const vaultProfit = Number(fin.vaultProfit || 0);
        const supplierProfit = Number(fin.supplierProfit || 0);
        const manualProfit = Number(fin.manualProfit || 0);

        return `
        <!-- ========================================== -->
        <!-- 💵 1. النبض المالي وتوزيع القنوات (تجزئة vs جملة) -->
        <!-- ========================================== -->
        <div class="dash-group-header">
            <h4><i class="fa-solid fa-money-bill-trend-up text-gold me-1"></i> النبض المالي وقنوات البيع</h4>
            <div class="group-line"></div>
        </div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card cap-profit interactive-scale" data-action="nav-with-filter" data-section="orders" data-status="completed">
                <div class="circ-icon bg-gold"><i class="fa-solid fa-sack-dollar"></i></div>
                <div class="circ-data">
                    <h3 class="num-en text-gold font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(totalProfit, 'USD', 2)}</h3>
                    <span>إجمالي أرباح المتجر</span>
                </div>
            </div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="orders" data-status="completed">
                <div class="circ-icon bg-primary"><i class="fa-solid fa-shop"></i></div>
                <div class="circ-data">
                    <h3 class="num-en text-primary font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(retailProfit, 'USD', 2)}</h3>
                    <span>أرباح مبيعات التجزئة (أفراد)</span>
                </div>
            </div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="orders" data-source="api">
                <div class="circ-icon bg-dark text-warning"><i class="fa-solid fa-code"></i></div>
                <div class="circ-data">
                    <h3 class="num-en text-warning font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(apiProfit, 'USD', 2)}</h3>
                    <span>أرباح مبيعات الجملة (API)</span>
                </div>
            </div>
        </div>

        <!-- ========================================== -->
        <!-- 🏭 2. مصادر الأرباح حسب طريقة التنفيذ الفعلي -->
        <!-- ========================================== -->
        <div class="dash-group-header">
            <h4><i class="fa-solid fa-boxes-packing text-primary me-1"></i> مصادر الأرباح (طريقة التنفيذ)</h4>
            <div class="group-line"></div>
        </div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="orders" data-source="auto">
                <div class="circ-icon bg-success"><i class="fa-solid fa-vault"></i></div>
                <div class="circ-data">
                    <h3 class="num-en text-success font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(vaultProfit, 'USD', 2)}</h3>
                    <span>أرباح الخزنة المحلية (مخزون)</span>
                </div>
            </div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="orders" data-source="auto">
                <div class="circ-icon bg-info"><i class="fa-solid fa-plug"></i></div>
                <div class="circ-data">
                    <h3 class="num-en text-info font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(supplierProfit, 'USD', 2)}</h3>
                    <span>أرباح الموردين المباشرين (API)</span>
                </div>
            </div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="orders" data-source="manual">
                <div class="circ-icon bg-orange"><i class="fa-solid fa-hand-holding-dollar"></i></div>
                <div class="circ-data">
                    <h3 class="num-en text-warning font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(manualProfit, 'USD', 2)}</h3>
                    <span>أرباح التنفيذ اليدوي</span>
                </div>
            </div>
        </div>

        <!-- ========================================== -->
        <!-- 🏦 3. سيولة المحافظ والأصول المجمدة -->
        <!-- ========================================== -->
        <div class="dash-group-header">
            <h4><i class="fa-solid fa-coins text-success me-1"></i> سيولة المحافظ والأصول المجمدة</h4>
            <div class="group-line"></div>
        </div>
        <div class="dash-circ-grid" id="dash-wallets-grid">
            ${walletsCapsules}
            <div class="dash-circ-card interactive-scale" data-action="nav" data-target="vault">
                <div class="circ-icon bg-info"><i class="fa-solid fa-snowflake"></i></div>
                <div class="circ-data">
                    <h3 class="num-en text-info font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(fin.frozenAssetsUsd || 0, 'USD', 2)}</h3>
                    <span>الأصول المجمدة (صناديق الخزنة)</span>
                </div>
            </div>
        </div>

        ${couponsHtml || ''}

        <!-- ========================================== -->
        <!-- 📦 4. حركة الطلبات -->
        <!-- ========================================== -->
        <div class="dash-group-header">
            <h4><i class="fa-solid fa-box-open text-primary me-1"></i> حركة الطلبات</h4>
            <div class="group-line"></div>
        </div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="orders" data-status="all"><div class="circ-icon bg-primary"><i class="fa-solid fa-cubes"></i></div><div class="circ-data"><h3 class="num-en text-main font-numeric" dir="ltr" lang="en">${_enNum(ord.total || 0)}</h3><span>إجمالي الطلبات</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="orders" data-status="completed"><div class="circ-icon bg-success"><i class="fa-solid fa-check-double"></i></div><div class="circ-data"><h3 class="num-en text-success font-numeric" dir="ltr" lang="en">${_enNum(ord.completed || 0)}</h3><span>طلبات مكتملة</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="orders" data-source="api"><div class="circ-icon bg-dark text-warning"><i class="fa-solid fa-server"></i></div><div class="circ-data"><h3 class="num-en text-warning font-numeric" dir="ltr" lang="en">${_enNum(ord.apiCount || 0)}</h3><span>طلبات الجملة (API)</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="orders" data-status="pending"><div class="circ-icon bg-warning"><i class="fa-solid fa-clock"></i></div><div class="circ-data"><h3 class="num-en text-warning font-numeric" dir="ltr" lang="en">${_enNum(ord.pending || 0)}</h3><span>قيد التنفيذ (معلقة)</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="orders" data-status="refunded"><div class="circ-icon bg-ref"><i class="fa-solid fa-undo"></i></div><div class="circ-data"><h3 class="num-en text-ref font-numeric" dir="ltr" lang="en">${_enNum(ord.refunded || 0)}</h3><span>طلبات مسترجعة</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="orders" data-status="rejected"><div class="circ-icon bg-danger"><i class="fa-solid fa-ban"></i></div><div class="circ-data"><h3 class="num-en text-danger font-numeric" dir="ltr" lang="en">${_enNum(ord.rejected || 0)}</h3><span>طلبات مرفوضة</span></div></div>
        </div>

        <!-- ========================================== -->
        <!-- 💳 5. حركة الإيداعات -->
        <!-- ========================================== -->
        <div class="dash-group-header">
            <h4><i class="fa-solid fa-money-bill-transfer text-success me-1"></i> حركة الإيداعات</h4>
            <div class="group-line"></div>
        </div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="deposits" data-status="approved"><div class="circ-icon bg-success"><i class="fa-solid fa-sack-dollar"></i></div><div class="circ-data"><h3 class="num-en text-success font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(dep.totalAmount || 0, 'USD', 2)}</h3><span>حجم الإيداعات المجازة</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="deposits" data-status="approved"><div class="circ-icon bg-info"><i class="fa-solid fa-wallet"></i></div><div class="circ-data"><h3 class="num-en text-info font-numeric" dir="ltr" lang="en">${_enNum(dep.approvedCount || 0)}</h3><span>عمليات شحن مقبولة</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="deposits" data-status="pending"><div class="circ-icon bg-warning"><i class="fa-solid fa-clock"></i></div><div class="circ-data"><h3 class="num-en text-warning font-numeric" dir="ltr" lang="en">${_enNum(dep.pending || 0)}</h3><span>إيداعات معلقة</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="deposits" data-status="refunded"><div class="circ-icon bg-ref"><i class="fa-solid fa-undo"></i></div><div class="circ-data"><h3 class="num-en text-ref font-numeric" dir="ltr" lang="en">${_enNum(dep.refunded || 0)}</h3><span>إيداعات مسترجعة</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="deposits" data-status="rejected"><div class="circ-icon bg-danger"><i class="fa-solid fa-ban"></i></div><div class="circ-data"><h3 class="num-en text-danger font-numeric" dir="ltr" lang="en">${_enNum(dep.rejected || 0)}</h3><span>إيداعات مرفوضة</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav-with-filter" data-section="deposits" data-status="all"><div class="circ-icon bg-purple"><i class="fa-solid fa-user-shield"></i></div><div class="circ-data"><h3 class="num-en text-purple font-numeric" dir="ltr" lang="en">${_enNum(dep.adminCount || 0)}</h3><span>إيداعات الإدارة (يدوي)</span></div></div>
        </div>
        
        <!-- ========================================== -->
        <!-- 👥 6. إحصائيات وأمان المستخدمين -->
        <!-- ========================================== -->
        <div class="dash-group-header">
            <h4><i class="fa-solid fa-users text-info me-1"></i> إحصائيات وأمان المستخدمين</h4>
            <div class="group-line"></div>
        </div>
        <div class="dash-circ-grid">
            <div class="dash-circ-card interactive-scale" data-action="nav" data-target="users"><div class="circ-icon bg-info"><i class="fa-solid fa-users"></i></div><div class="circ-data"><h3 class="num-en text-info font-numeric" dir="ltr" lang="en">${_enNum(usr.total || 0)}</h3><span>العملاء المسجلين</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav" data-target="users"><div class="circ-icon bg-success"><i class="fa-solid fa-user-check"></i></div><div class="circ-data"><h3 class="num-en text-success font-numeric" dir="ltr" lang="en">${_enNum(usr.activeMonth || 0)}</h3><span>عملاء نشطين (هذا الشهر)</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav" data-target="users"><div class="circ-icon bg-danger"><i class="fa-solid fa-user-slash"></i></div><div class="circ-data"><h3 class="num-en text-danger font-numeric" dir="ltr" lang="en">${_enNum(usr.banned || 0)}</h3><span>العملاء المحظورين</span></div></div>
            <div class="dash-circ-card interactive-scale" data-action="nav" data-target="sys"><div class="circ-icon bg-dark"><i class="fa-solid fa-network-wired"></i></div><div class="circ-data"><h3 class="num-en text-main font-numeric" dir="ltr" lang="en">${_enNum(usr.bannedIps || 0)}</h3><span>عناوين IP محظورة</span></div></div>
        </div>

        ${communityHtml || ''}
    `;
    },

    dashEmptyAlerts: () => RenderHelpers.emptyState('fa-solid fa-check-circle text-success', 'النظام مستقر', 'لا توجد تنبيهات أو مهام معلقة في الوقت الحالي.'),
    
    dashAlertItem: (type, icon, text, actionStr, timeStr) => `
        <div class="smart-alert-item alert-${type} ${actionStr ? 'clickable interactive-scale' : ''}" ${actionStr || ''}>
            ${timeStr ? `<div class="alert-time num-en font-numeric" dir="ltr" lang="en"><i class="fa-regular fa-clock me-1"></i> ${timeStr}</div>` : ''}
            <div class="alert-content-wrap">
                <i class="fa-solid ${icon} me-1"></i>
                <span>${text}</span>
            </div>
        </div>`,
    
    emptyLogsTable: () => `
        <tr>
            <td colspan="4" class="empty-table-cell">
                ${RenderHelpers.emptyState('fa-solid fa-inbox text-muted', 'لا توجد نشاطات', 'لم يتم تسجيل أي نشاطات في هذا السجل.')}
            </td>
        </tr>
    `,
    
    emptySalesTable: (colspanNum) => `
        <tr>
            <td colspan="${colspanNum}" class="empty-table-cell">
                ${RenderHelpers.emptyState('fa-solid fa-file-invoice-dollar text-muted', 'لا توجد مبيعات', 'لا توجد مبيعات مسجلة في هذه الفترة.')}
            </td>
        </tr>
    `,
    
    emptySalesPodium: () => RenderHelpers.emptyState('fa-solid fa-ghost text-muted', 'لا توجد مبيعات!', 'لم يتم تسجيل أي مبيعات لعرضها هنا.'),
    
    emptyTopCustomers: () => RenderHelpers.emptyState('fa-solid fa-users-slash text-muted', 'لا يوجد عملاء مميزين', 'لا توجد مبيعات مسجلة في هذه الفترة.')
};
