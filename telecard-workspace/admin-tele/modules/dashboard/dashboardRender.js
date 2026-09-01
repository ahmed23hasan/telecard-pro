// ============================================================================
// 📊 محرك رسم لوحة القيادة (modules/dashboard/dashboardRender.js) - Ultimate V15.3 🚀
// 🎯 الوظيفة: رسم الإحصائيات، الرادار الجنائي، سجل النشاطات، ومراقبة الأمان
// 🚀 التحديث الأقصى: 
// 1. Smart CRM Routing: توجيه إنذار الشكاوى مباشرة لتبويب العملاء الغاضبين بدلاً من الإشعارات العامة.
// 2. CRM Integration: دمج رادار الشكاوى والتقييمات المنخفضة ليظهر فوراً في مركز المهام.
// 3. Memory Freeze Fix: تحديد سقف سجلات النشاط لـ 100 حركة.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { FinancialEngine } from '../../core/financialEngine.js'; 
import { EventBus } from '../../adminUtils.js';

export const DashboardRender = {
    leaderboardFilter: 'all', 
    _mainChartInst: null, 

    initListeners: function() {
        EventBus.on('req-render-dash', () => this.renderDashboard());
        EventBus.on('req-render-logs', () => this.renderLogs());
    },

    changeLeaderboardFilter: function(period) {
        this.leaderboardFilter = period;
        this.renderDashboard(); 
    },

    renderDashboard: function() {
        const dashView = document.getElementById('view-dash');
        if (!dashView || !dashView.classList.contains('active') || typeof AdminData.getDashboardStats !== 'function') return;

        const stats = AdminData.getDashboardStats(this.leaderboardFilter);
        
        let walletsCapsules = '';
        if (!stats.wallets || Object.keys(stats.wallets.details).length === 0) {
            walletsCapsules = AdminTemplates.dashEmptyWallets();
        } else {
            walletsCapsules += AdminTemplates.dashWalletCapsule('إجمالي التزامات المحافظ', stats.wallets.totalUsd, 'USD');
            const details = stats.wallets.details;
            Object.keys(details).forEach(cc => {
                const d = details[cc];
                if (d.count > 0 || d.name !== 'عملة غير مدرجة') {
                    walletsCapsules += AdminTemplates.dashWalletCapsule(`محفظة ${cc}`, d.sum, cc);
                }
            });
        }

        let couponsHtml = (stats.promoStats && AdminTemplates.dashCouponsSection) ? AdminTemplates.dashCouponsSection(stats.promoStats) : '';
        
        let communityHtml = '';
        if (AdminTemplates.dashCommunitySection) {
            const topSpenders = stats.users.topThree || [];
            const podiumHtml = AdminTemplates.dashPodium(topSpenders);
            
            const theMostActive = topSpenders.length > 0 ? topSpenders[0] : null;
            const activeUserHtml = AdminTemplates.dashActiveUserCapsule(theMostActive);
            
            communityHtml = AdminTemplates.dashCommunitySection(podiumHtml, activeUserHtml, this.leaderboardFilter);
        }

        const capsGrid = document.getElementById('dash-capsules');
        if (capsGrid) { 
            capsGrid.className = ''; 
            capsGrid.innerHTML = AdminTemplates.dashGrid(stats, walletsCapsules, couponsHtml, communityHtml); 
        }

        // =========================================================
        // 🚨 الرادار الجنائي، التنبيهات، ومركز المهام (Action Center)
        // =========================================================
        const sysSettings = AdminData.data.settings || {};
        const totalBannedIps = Array.isArray(sysSettings.bannedIps) ? sysSettings.bannedIps.length : 0;
        const totalBannedDevices = Array.isArray(sysSettings.bannedDevices) ? sysSettings.bannedDevices.length : 0;
        
        if (!stats.alerts) stats.alerts = [];

        // 🌟 جلب الطلبات والمهام المعلقة
        const pendingOrders = (AdminData.data.orders || []).filter(o => o.status === 'pending' || o.status === 'processing').length;
        const pendingDeposits = (AdminData.data.deposits || []).filter(d => d.status === 'pending').length;
        const pendingKYC = (AdminData.data.users || []).filter(u => u.kycStatus === 'pending').length;
        const pendingComplaints = (AdminData.data.reviews || []).filter(r => r.status === 'pending' && r.rating <= 2).length;

        // دفع التنبيهات للرادار
        if (pendingOrders > 0) stats.alerts.unshift({ id: 'act_ord', type: 'warning', icon: 'fa-box-open', text: `بانتظارك <b class="text-white num-en" dir="ltr">${pendingOrders}</b> طلبات منتجات تحتاج للتنفيذ.`, action: `data-action="nav-with-filter" data-section="orders" data-status="pending"` });
        if (pendingDeposits > 0) stats.alerts.unshift({ id: 'act_dep', type: 'success', icon: 'fa-money-bill-transfer', text: `بانتظارك <b class="text-white num-en" dir="ltr">${pendingDeposits}</b> طلبات إيداع للمحفظة.`, action: `data-action="nav-with-filter" data-section="deposits" data-status="pending"` });
        if (pendingKYC > 0) stats.alerts.unshift({ id: 'act_kyc', type: 'info', icon: 'fa-id-card-clip', text: `يوجد <b class="num-en text-info" dir="ltr">${pendingKYC}</b> طلبات توثيق هوية بانتظار المراجعة.`, action: `data-action="nav" data-target="kyc-system"` });
        
        // 🚀 [الإصلاح الماسي]: توجيه الإنذار للمسار المباشر للشكاوى
        if (pendingComplaints > 0) {
            stats.alerts.unshift({ id: 'act_complaint', type: 'danger', icon: 'fa-star-half-stroke', text: `تنبيه هام: يوجد <b class="text-white num-en" dir="ltr">${pendingComplaints}</b> عميل غاضب (تقييم منخفض) بانتظار تدخلك!`, action: `data-action="nav-to-complaints"` });
        }

        if (totalBannedIps > 0 || totalBannedDevices > 0) {
            stats.alerts.unshift({ id: 'firewall_active', type: 'danger', icon: 'fa-shield-virus', text: `الجدار الناري نشط! يتصدى لـ <b class="text-white num-en" dir="ltr">${totalBannedIps}</b> IP و <b class="text-white num-en" dir="ltr">${totalBannedDevices}</b> جهاز محظور.`, action: `data-action="nav" data-target="sys"` });
        }

        const alertsCont = document.getElementById('dash-smart-alerts');
        if (alertsCont) {
            if (stats.alerts.length === 0) {
                alertsCont.innerHTML = AdminTemplates.dashEmptyAlerts();
            } else {
                alertsCont.innerHTML = stats.alerts.map(a => {
                    let type = a.type || 'info', icon = a.icon || 'fa-info-circle', text = a.text || '', action = a.action || '';
                    const timeStr = (a.time && a.time !== 0) ? RenderHelpers.formatSafeDate(a.time) : '';

                    if (a.id === 'vault_empty') { type = 'danger'; icon = 'fa-box-open'; text = `مخزون حرج: صندوق <b class="text-danger">${RenderHelpers._esc(a.poolName)}</b> فارغ تماماً!`; action = `data-action="edit-item" data-type="vault" data-id="${a.poolId}"`; } 
                    else if (a.id === 'vault_low') { type = 'warning'; icon = 'fa-hourglass-half'; text = `نقص مخزون: تبقى <b class="num-en text-warning" dir="ltr">${a.count}</b> أكواد في <b class="text-white">${RenderHelpers._esc(a.poolName)}</b>`; action = `data-action="edit-item" data-type="vault" data-id="${a.poolId}"`; } 
                    else if (a.id === 'coupon_used') { type = 'success'; icon = 'fa-tag'; text = `استخدم العميل <b class="text-white">${RenderHelpers._esc(a.user)}</b> الكوبون <span class="badge-qty badge-success" dir="ltr">${RenderHelpers._esc(a.code)}</span>`; action = `data-action="open-order-drawer" data-id="${a.orderId}"`; } 
                    else if (a.id === 'security_stable') { type = 'security'; icon = 'fa-shield-check'; text = `حالة النظام الأمنية مستقرة - لا يوجد أي نشاط مشبوه.`; }

                    return AdminTemplates.dashAlertItem(type, icon, text, action, timeStr);
                }).join('');
            }
        }
        
        this.updateTopBellBadge(stats);
        if (typeof this.renderMainChart === 'function') this.renderMainChart();
    },

    updateTopBellBadge: function(stats) {
        const topBellBadge = document.getElementById('global-alert-badge');
        if (!topBellBadge) return;
        
        const currentCount = stats.alerts ? stats.alerts.length : 0;
        let seenCount = Number(localStorage.getItem('telecard_seen_alerts')) || 0;
        
        if (currentCount < seenCount) { 
            seenCount = currentCount; 
            localStorage.setItem('telecard_seen_alerts', seenCount); 
        }
        
        const unreadCount = currentCount - seenCount;

        if (unreadCount > 0) { 
            topBellBadge.innerText = RenderHelpers._enNum(unreadCount); 
            topBellBadge.classList.remove('hide-element'); 
            topBellBadge.classList.add('active'); 
        } else { 
            topBellBadge.classList.add('hide-element'); 
            topBellBadge.classList.remove('active'); 
        }

        const bellContainer = topBellBadge.parentElement; 
        if (bellContainer && !bellContainer.hasAttribute('data-alert-bound')) {
            bellContainer.setAttribute('data-alert-bound', 'true');
            bellContainer.addEventListener('click', () => { 
                localStorage.setItem('telecard_seen_alerts', currentCount); 
                topBellBadge.classList.add('hide-element'); 
                topBellBadge.classList.remove('active'); 
            });
        }
    },

    renderMainChart: function() { 
        const chartDiv = document.querySelector("#main-revenue-chart");
        if (!chartDiv || typeof window.ApexCharts === 'undefined') return;

        const dailyAggregations = {};
        
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        
        const recentCompletedOrders = (AdminData.data.orders || []).filter(o => {
            if (o.status !== 'completed') return false;
            const timeMs = RenderHelpers.parseTime(o.time || o.createdAt || Date.now());
            return timeMs >= sevenDaysAgo;
        });
        
        recentCompletedOrders.forEach(o => {
            const timeMs = RenderHelpers.parseTime(o.time || o.createdAt || Date.now());
            const dateObj = new Date(timeMs);
            
            const dKey = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
            
            if (!dailyAggregations[dKey]) dailyAggregations[dKey] = { revenue: 0, profit: 0 };
            const pricing = o.pricingSnapshot;
            
            const rev = Number(pricing?.finalPriceUsd || pricing?.finalPrice || o.baseUsd || o.price || 0);
            const prof = Number(pricing?.netProfitUsd || pricing?.profit || 0);
            
            dailyAggregations[dKey].revenue = FinancialEngine.safeAdd(dailyAggregations[dKey].revenue, rev);
            dailyAggregations[dKey].profit = FinancialEngine.safeAdd(dailyAggregations[dKey].profit, prof);
        });

        const last7Days = [], salesData = [], profitData = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); 
            d.setUTCDate(d.getUTCDate() - i);
            const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
            last7Days.push(d);
            
            salesData.push((dailyAggregations[dayKey]?.revenue || 0).toFixed(2));
            profitData.push((dailyAggregations[dayKey]?.profit || 0).toFixed(2));
        }

        const daysNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const categories = last7Days.map(d => daysNames[d.getUTCDay()]);

        const isLightMode = document.body.classList.contains('light-mode');
        const themeMode = isLightMode ? 'light' : 'dark';
        const currText = RenderHelpers.getCurrencySymbolText('USD');

        const options = {
            series: [{ name: 'الإيرادات', data: salesData }, { name: 'الأرباح', data: profitData }],
            chart: { height: 280, type: 'area', fontFamily: 'Cairo, sans-serif', foreColor: isLightMode ? '#64748b' : '#94a3b8', toolbar: { show: false }, background: 'transparent' },
            colors: ['#38bdf8', '#10b981'],
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
            dataLabels: { enabled: false }, stroke: { curve: 'smooth', width: 2 },
            xaxis: { categories: categories, axisBorder: { show: false }, axisTicks: { show: false } },
            yaxis: { labels: { formatter: (value) => RenderHelpers._enNum(value) + ' ' + currText } },
            grid: { borderColor: isLightMode ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', strokeDashArray: 4 },
            theme: { mode: themeMode }, tooltip: { theme: themeMode }
        };

        if (this._mainChartInst) {
            try { this._mainChartInst.destroy(); } catch (e) { console.warn("Chart destroy failed"); }
        }
        
        chartDiv.innerHTML = '';
        this._mainChartInst = new window.ApexCharts(chartDiv, options);
        this._mainChartInst.render();
    },

    renderLogs: function() {
        const tbody = document.getElementById('logs-table-body');
        if (!tbody) return;
        
        const allLogs = AdminData.data.logs || [];
        const logs = allLogs.slice(0, 100); 
        
        if (logs.length === 0) { 
            tbody.innerHTML = `<tr><td colspan="4" class="text-center empty-table-cell"><i class="fa-solid fa-inbox fa-3x mb-10 opacity-50"></i><br>لا توجد نشاطات مسجلة</td></tr>`; 
            return; 
        }

        let html = '';
        logs.forEach(log => {
            let badgeClass = 'badge-default';
            const action = (log.action || '').toUpperCase();
            
            if(action.includes('ADD') || action.includes('APPROVE') || action.includes('ACCEPT')) { 
                badgeClass = 'badge-success bg-success-10 text-success border-success-15'; 
            } 
            else if(action.includes('DELETE') || action.includes('REJECT') || action.includes('BAN') || action.includes('REVOKE')) { 
                badgeClass = 'badge-danger bg-danger-10 text-danger border-danger-15'; 
            } 
            else if(action.includes('EDIT') || action.includes('UPDATE') || action.includes('RESTRICT') || action.includes('SYNC')) { 
                badgeClass = 'badge-warning bg-warning-10 text-warning border-warning-15'; 
            } 
            else if(action.includes('ORDER') || action.includes('PAYMENT') || action.includes('BALANCE') || action.includes('KYC')) { 
                badgeClass = 'badge-info bg-info-10 text-info border-info-15'; 
            }

            const safeDateTime = RenderHelpers.formatSafeDate(log.timestamp);
            
            const adminUser = AdminData.data.usersMap?.[log.adminUid];
            const displayAdminName = log.admin || (adminUser ? (adminUser.fullName || adminUser.firstName || adminUser.name || adminUser.username) : 'مدير النظام');


            html += `<tr>
                <td><div class="log-date-cell"><span class="d-date num-en" dir="ltr">${safeDateTime}</span></div></td>
                <td><div class="log-user-cell"><i class="fa-solid fa-user-shield text-primary"></i> <span>${RenderHelpers._esc(displayAdminName)}</span></div></td>
                <td><span class="log-action-badge num-en ${badgeClass}" dir="ltr" style="padding: 4px 10px; border-radius: 6px; border-width: 1px; border-style: solid; font-size: 11px;">${RenderHelpers._esc(action)}</span></td>
                <td class="log-details-cell">${RenderHelpers._esc(log.details)}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    }
};
