// ============================================================================
// 📊 محرك رسم لوحة القيادة (modules/dashboard/dashboardRender.js)
// 🎯 الوظيفة: رسم الإحصائيات الرئيسية، التنبيهات السريعة، وسجل النشاطات (Logs) فقط
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

export const DashboardRender = {
    leaderboardFilter: 'all', 

    initListeners: function() {
        // يمكن إضافة مستمعات خاصة بلوحة القيادة هنا مستقبلاً
    },

    changeLeaderboardFilter: function(period) {
        this.leaderboardFilter = period;
        this.renderDashboard(); 
    },

    // =========================================================
    // 📈 1. رسم لوحة القيادة الرئيسية (Dashboard)
    // =========================================================
    renderDashboard: function() {
        const dashView = document.getElementById('view-dash');
        if (!dashView || !dashView.classList.contains('active') || typeof AdminData.getDashboardStats !== 'function') return;

        const stats = AdminData.getDashboardStats(this.leaderboardFilter);
        
        // 1. سيولة المحافظ
        let walletsCapsules = '';
        if (!stats.walletsData || Object.keys(stats.walletsData.details).length === 0) {
            walletsCapsules = AdminTemplates.dashEmptyWallets();
        } else {
            walletsCapsules += AdminTemplates.dashWalletCapsule('إجمالي التزامات المحافظ', stats.walletsData.totalUsd, 'USD');
            const details = stats.walletsData.details;
            Object.keys(details).forEach(cc => {
                const d = details[cc];
                if (d.count > 0 || d.name !== 'عملة غير مدرجة') {
                    walletsCapsules += AdminTemplates.dashWalletCapsule(`محفظة ${d.name}`, d.sum, cc);
                }
            });
        }

        // 2. الكوبونات والعروض
        let couponsHtml = (stats.promoStats && AdminTemplates.dashCouponsSection) ? AdminTemplates.dashCouponsSection(stats.promoStats) : '';
        
        // 3. لوحة شرف العملاء
        let communityHtml = '';
        if (AdminTemplates.dashCommunitySection) {
            const podiumHtml = AdminTemplates.dashPodium(stats.users.topThreeSpenders);
            const activeUserHtml = AdminTemplates.dashActiveUserCapsule(stats.users.mostActiveUser);
            communityHtml = AdminTemplates.dashCommunitySection(podiumHtml, activeUserHtml, this.leaderboardFilter);
        }

        // 4. دمج كل المكونات في الشبكة
        const capsGrid = document.getElementById('dash-capsules');
        if (capsGrid) { 
            capsGrid.className = ''; 
            capsGrid.innerHTML = AdminTemplates.dashGrid(stats, walletsCapsules, couponsHtml, communityHtml); 
        }

        // 5. التنبيهات الذكية السريعة للوحة القيادة (Smart Alerts)
        const buildAlertHtml = (a) => {
            let type = 'info', icon = 'fa-info-circle', text = '', action = '';
            
            if (a.id === 'vault_empty') { 
                type = 'danger'; icon = 'fa-box-open'; 
                text = AdminTemplates.alertVaultEmpty(RenderHelpers._esc(a.poolName)); 
                action = `data-action="edit-item" data-type="vault" data-id="${a.poolId}"`; 
            } 
            else if (a.id === 'vault_low') { 
                type = 'warning'; icon = 'fa-hourglass-half'; 
                text = AdminTemplates.alertVaultLow(RenderHelpers._esc(a.poolName), a.count); 
                action = `data-action="edit-item" data-type="vault" data-id="${a.poolId}"`; 
            } 
            else if (a.id === 'coupon_used') { 
                type = 'success'; icon = 'fa-tag'; 
                text = AdminTemplates.alertCouponUsed(RenderHelpers._esc(a.user), RenderHelpers._esc(a.code)); 
                action = `data-action="open-order-drawer" data-id="${a.orderId}"`; 
            } 
            else if (a.id === 'offer_expiring') { 
                type = 'warning'; icon = 'fa-bolt'; 
                text = AdminTemplates.alertOfferExpiring(RenderHelpers._esc(a.name)); 
                action = `data-action="nav" data-target="coupons"`; 
            } 
            else if (a.id === 'security_stable') { 
                type = 'security'; icon = 'fa-shield-halved'; 
                text = AdminTemplates.alertSecurityStable(); 
            }
            return AdminTemplates.dashAlertItem({ type, icon, text, time: a.time || Date.now(), action });
        };

        const alertsCont = document.getElementById('dash-smart-alerts');
        if (alertsCont) {
            alertsCont.innerHTML = (!stats.alerts || stats.alerts.length === 0) ? AdminTemplates.dashEmptyAlerts() : stats.alerts.map(a => buildAlertHtml(a)).join('');
        }

        this.updateTopBellBadge(stats);
        if(typeof this.renderMainChart === 'function') this.renderMainChart();
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

    // =========================================================
    // 📊 2. رسم المخطط البياني الرئيسي للوحة القيادة
    // =========================================================
    renderMainChart: function() {
        const chartDiv = document.querySelector("#main-revenue-chart");
        if (!chartDiv || typeof window.ApexCharts === 'undefined') return;

        const gStats = (AdminData.data.system && AdminData.data.system.globalStats) ? AdminData.data.system.globalStats : null;
        const last7Days = [], salesData = [], profitData = [];
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            last7Days.push(d);
            if (gStats && gStats.daily[dayKey]) { 
                salesData.push(gStats.daily[dayKey].revenue || 0); 
                profitData.push(gStats.daily[dayKey].profit || 0); 
            } else { 
                salesData.push(0); 
                profitData.push(0); 
            }
        }

        const daysNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const categories = last7Days.map(d => daysNames[d.getDay()]);

        chartDiv.innerHTML = ""; 
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
        new window.ApexCharts(chartDiv, options).render();
    },

    // =========================================================
    // 📝 3. رسم سجل النشاطات (System Logs)
    // =========================================================
    renderLogs: function() {
        const tbody = document.getElementById('logs-table-body');
        if (!tbody) return;
        const logs = AdminData.data.logs || [];
        if (logs.length === 0) { 
            tbody.innerHTML = `<tr><td colspan="4" class="text-center empty-table-cell"><i class="fa-solid fa-inbox fa-3x mb-10 opacity-50"></i><br>لا توجد نشاطات مسجلة</td></tr>`; 
            return; 
        }

        let html = '';
        logs.forEach(log => {
            const dateObj = new Date(log.timestamp);
            let badgeClass = 'badge-default';
            const action = log.action.toUpperCase();
            
            if(action.includes('ADD') || action.includes('APPROVE') || action.includes('ACCEPT')) { 
                badgeClass = 'badge-success bg-success-10 text-success border-success-15'; 
            } 
            else if(action.includes('DELETE') || action.includes('REJECT') || action.includes('BAN')) { 
                badgeClass = 'badge-danger bg-danger-10 text-danger border-danger-15'; 
            } 
            else if(action.includes('EDIT') || action.includes('UPDATE') || action.includes('RESTRICT')) { 
                badgeClass = 'badge-warning bg-warning-10 text-warning border-warning-15'; 
            } 
            else if(action.includes('ORDER') || action.includes('PAYMENT') || action.includes('BALANCE')) { 
                badgeClass = 'badge-info bg-info-10 text-info border-info-15'; 
            }

            html += `<tr>
                <td><div class="log-date-cell"><span class="d-date num-en" dir="ltr">${dateObj.toLocaleDateString('en-GB')}</span><span class="d-time num-en" dir="ltr">${dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute:'2-digit', hour12: false })}</span></div></td>
                <td><div class="log-user-cell"><i class="fa-solid fa-user-shield text-primary"></i> <span>${RenderHelpers._esc(log.admin)}</span></div></td>
                <td><span class="log-action-badge num-en ${badgeClass}" dir="ltr" style="padding: 4px 10px; border-radius: 6px; border-width: 1px; border-style: solid; font-size: 11px;">${RenderHelpers._esc(action)}</span></td>
                <td class="log-details-cell">${RenderHelpers._esc(log.details)}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    }
};
