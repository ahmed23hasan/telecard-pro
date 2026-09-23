// ============================================================================
// 📊 محرك رسم لوحة القيادة (modules/dashboard/dashboardRender.js) - Ultimate V17.13 🚀
// 🎯 الوظيفة: رسم الإحصائيات، الرادار الجنائي، سجل النشاطات، ومراقبة الأمان.
// 🚀 التحديثات المعمارية (V17.13 - Smart Bell Aggregator Patch): 
// 1. Template Reference Fix 💥: استيراد واستخدام DashboardTemplates بدلاً من AdminTemplates المفقودة.
// 2. Render Mutex Locks 🔒: إضافة أقفال للرسم لمنع تداخل المخططات (Race Conditions).
// 3. Smart Bell 🔔: تفعيل محرك الجمع الذكي (Aggregator) لإظهار الرقم الدقيق للمهام في جرس الإشعارات.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { DashboardTemplates } from './dashboardTemplates.js'; 
import { RenderHelpers } from '../../core/renderHelpers.js';
import { FinancialEngine } from '../../core/financialEngine.js'; 
import { EventBus, Utils } from '../../adminUtils.js';

export const DashboardRender = {
    leaderboardFilter: 'all', 
    _mainChartInst: null, 
    
    // 🛡️ دروع الحماية المعمارية
    _listenersBound: false,
    _isRenderingDash: false,
    _isRenderingChart: false,

    initListeners: function() {
        if (this._listenersBound) return; 
        this._listenersBound = true;

        EventBus.on('req-render-dash', () => this.renderDashboard());
        EventBus.on('req-render-logs', () => this.renderLogs());
        
        EventBus.on('change-leaderboard-filter', (data) => {
            this.changeLeaderboardFilter(data.val || data);
        });

        // 🚀 [التصحيح المعماري]: مراقبة تغيير الثيم لإعادة رسم المخطط بألوان صحيحة دون تجميد
        const themeObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class' && document.getElementById('view-dash')?.classList.contains('active')) {
                    this.renderMainChart();
                }
            });
        });
        themeObserver.observe(document.body, { attributes: true });
    },

    changeLeaderboardFilter: function(period) {
        this.leaderboardFilter = period;
        this.renderDashboard(); 
    },

    renderDashboard: async function() {
        const dashView = document.getElementById('view-dash');
        if (!dashView || !dashView.classList.contains('active') || typeof AdminData.fetchDashboardStatsAsync !== 'function') return;

        // 🛡️ منع تداخل عمليات الرسم السحابية (Race Condition Shield)
        if (this._isRenderingDash) return;
        this._isRenderingDash = true;

        const capsGrid = document.getElementById('dash-capsules');
        if (capsGrid) {
            capsGrid.innerHTML = `<div class="w-100 text-center py-40"><i class="fa-solid fa-circle-notch fa-spin fa-3x text-primary mb-15"></i><h4 class="text-muted">جاري جلب إحصائيات السحابة...</h4></div>`;
        }

        try {
            const stats = await AdminData.fetchDashboardStatsAsync(this.leaderboardFilter);
            
            if (!stats || !stats.wallets) {
                throw new Error("بيانات السيرفر غير مكتملة أو مفقودة.");
            }
            
            let walletsCapsules = '';
            if (!stats.wallets.details || Object.keys(stats.wallets.details).length === 0) {
                walletsCapsules = DashboardTemplates.dashEmptyWallets(); 
            } else {
                walletsCapsules += DashboardTemplates.dashWalletCapsule('إجمالي التزامات المحافظ', stats.wallets.totalUsd, 'USD'); 
                const details = stats.wallets.details;
                Object.keys(details).forEach(cc => {
                    const d = details[cc];
                    if (d.count > 0 || d.name !== 'عملة غير مدرجة') {
                        walletsCapsules += DashboardTemplates.dashWalletCapsule(`محفظة ${cc}`, d.sum, cc); 
                    }
                });
            }

            let couponsHtml = (stats.promoStats && DashboardTemplates.dashCouponsSection) ? DashboardTemplates.dashCouponsSection(stats.promoStats) : ''; 
            
            let communityHtml = '';
            if (DashboardTemplates.dashCommunitySection) { 
                const topSpenders = stats.users?.topThree || [];
                const podiumHtml = DashboardTemplates.dashPodium(topSpenders); 
                
                const theMostActive = topSpenders.length > 0 ? topSpenders[0] : null;
                const activeUserHtml = DashboardTemplates.dashActiveUserCapsule(theMostActive); 
                
                communityHtml = DashboardTemplates.dashCommunitySection(podiumHtml, activeUserHtml, this.leaderboardFilter); 
            }

            if (capsGrid) { 
                capsGrid.className = ''; 
                capsGrid.innerHTML = DashboardTemplates.dashGrid(stats, walletsCapsules, couponsHtml, communityHtml); 
            }

            const sysSettings = AdminData.data.settings || {};
            const totalBannedIps = Array.isArray(sysSettings.bannedIps) ? sysSettings.bannedIps.length : 0;
            const totalBannedDevices = Array.isArray(sysSettings.bannedDevices) ? sysSettings.bannedDevices.length : 0;

            const displayAlerts = Array.isArray(stats.alerts) ? [...stats.alerts] : [];

            const pendingOrders = stats.pendingCounts?.orders || 0;
            const pendingDeposits = stats.pendingCounts?.deposits || 0;
            const pendingKYC = stats.pendingCounts?.kyc || 0;
            const pendingComplaints = stats.pendingCounts?.complaints || 0;

            // 🎯 إضافة الحقل badgeCount لنقل الأرقام الحقيقية لمحرك الجمع الخاص بالجرس
            if (pendingOrders > 0) displayAlerts.unshift({ id: 'act_ord', badgeCount: pendingOrders, type: 'warning', icon: 'fa-box-open', text: `بانتظارك <b class="text-white num-en" dir="ltr">${pendingOrders}</b> طلبات منتجات تحتاج للتنفيذ.`, action: `data-action="nav-with-filter" data-section="orders" data-status="pending"` });
            if (pendingDeposits > 0) displayAlerts.unshift({ id: 'act_dep', badgeCount: pendingDeposits, type: 'success', icon: 'fa-money-bill-transfer', text: `بانتظارك <b class="text-white num-en" dir="ltr">${pendingDeposits}</b> طلبات إيداع للمحفظة.`, action: `data-action="nav-with-filter" data-section="deposits" data-status="pending"` });
            if (pendingKYC > 0) displayAlerts.unshift({ id: 'act_kyc', badgeCount: pendingKYC, type: 'info', icon: 'fa-id-card-clip', text: `يوجد <b class="num-en text-info" dir="ltr">${pendingKYC}</b> طلبات توثيق هوية بانتظار المراجعة.`, action: `data-action="nav" data-target="kyc-system"` });
            
            if (pendingComplaints > 0) {
                displayAlerts.unshift({ id: 'act_complaint', badgeCount: pendingComplaints, type: 'danger', icon: 'fa-star-half-stroke', text: `تنبيه هام: يوجد <b class="text-white num-en" dir="ltr">${pendingComplaints}</b> عميل غاضب بانتظار تدخلك!`, action: `data-action="nav-to-complaints"` });
            }

            if (totalBannedIps > 0 || totalBannedDevices > 0) {
                // الجدار الناري نعتبره تنبيهاً واحداً
                displayAlerts.unshift({ id: 'firewall_active', badgeCount: 1, type: 'danger', icon: 'fa-shield-virus', text: `الجدار الناري نشط! يتصدى لـ <b class="text-white num-en" dir="ltr">${totalBannedIps}</b> IP و <b class="text-white num-en" dir="ltr">${totalBannedDevices}</b> جهاز محظور.`, action: `data-action="nav" data-target="sys"` });
            }

            const alertsCont = document.getElementById('dash-smart-alerts');
            if (alertsCont) {
                if (displayAlerts.length === 0) {
                    alertsCont.innerHTML = DashboardTemplates.dashEmptyAlerts(); 
                } else {
                    alertsCont.innerHTML = displayAlerts.map(a => {
                        let type = a.type || 'info', icon = a.icon || 'fa-info-circle', text = a.text || '', action = a.action || '';
                        const timeStr = (a.time && a.time !== 0) ? RenderHelpers.formatSafeDate(a.time) : '';

                        if (a.id === 'vault_empty') { type = 'danger'; icon = 'fa-box-open'; text = `مخزون حرج: صندوق <b class="text-danger">${Utils.escapeHTML(a.poolName)}</b> فارغ تماماً!`; action = `data-action="edit-item" data-type="vault" data-id="${a.poolId}"`; } 
                        else if (a.id === 'vault_low') { type = 'warning'; icon = 'fa-hourglass-half'; text = `نقص مخزون: تبقى <b class="num-en text-warning" dir="ltr">${a.count}</b> أكواد في <b class="text-white">${Utils.escapeHTML(a.poolName)}</b>`; action = `data-action="edit-item" data-type="vault" data-id="${a.poolId}"`; } 
                        else if (a.id === 'coupon_used') { type = 'success'; icon = 'fa-tag'; text = `استخدم العميل <b class="text-white">${Utils.escapeHTML(a.user)}</b> الكوبون <span class="badge-qty badge-success" dir="ltr">${Utils.escapeHTML(a.code)}</span>`; action = `data-action="open-order-drawer" data-id="${a.orderId}"`; } 
                        else if (a.id === 'security_stable') { type = 'security'; icon = 'fa-shield-check'; text = `حالة النظام الأمنية مستقرة - لا يوجد أي نشاط مشبوه.`; }

                        return DashboardTemplates.dashAlertItem(type, icon, text, action, timeStr); 
                    }).join('');
                }
            }
            
            this.updateTopBellBadge(displayAlerts);
            if (typeof this.renderMainChart === 'function') this.renderMainChart();

        } catch (error) {
            console.error("🚨 فشل جلب لوحة القيادة السحابية:", error);
            if (capsGrid) capsGrid.innerHTML = `<div class="w-100 text-center py-40 text-danger"><i class="fa-solid fa-triangle-exclamation fa-3x mb-15"></i><h4>تعذر جلب الإحصائيات من السيرفر.</h4></div>`;
        } finally {
            this._isRenderingDash = false;
        }
    },

    updateTopBellBadge: function(displayAlerts) {
        const topBellBadge = document.getElementById('global-alert-badge');
        if (!topBellBadge || !displayAlerts || displayAlerts.length === 0) {
            if (topBellBadge) { topBellBadge.classList.add('hide-element'); topBellBadge.classList.remove('active'); }
            return;
        }
        
        // 🎯 الجمع الاحترافي: جمع الأرقام الحقيقية لكل مهمة (طلبات + إيداعات + kyc + إلخ)
        const currentAlertCount = displayAlerts.reduce((sum, a) => sum + (a.badgeCount || 1), 0);
        
        // جلب البيانات المخزنة من الجلسة
        const lastSeenTime = Number(sessionStorage.getItem('telecard_last_seen_alert_time')) || 0;
        const lastSeenCount = Number(sessionStorage.getItem('telecard_last_seen_alert_count')) || 0;
        
        const latestAlertTime = Math.max(...displayAlerts.map(a => RenderHelpers.parseTime(a.time || 0)));
        
        // 🚀 متى نظهر الشارة الحمراء؟ 
        // 1. إذا وصل تنبيه جديد له وقت (أحدث من آخر رؤية)
        // 2. أو إذا زاد عدد المهام المعلقة عن آخر مرة فتح فيها المدير الجرس
        if (latestAlertTime > lastSeenTime || currentAlertCount > lastSeenCount || lastSeenTime === 0) { 
            topBellBadge.innerText = currentAlertCount > 99 ? "+99" : currentAlertCount; 
            topBellBadge.classList.remove('hide-element'); 
            topBellBadge.classList.add('active'); 
        } else { 
            topBellBadge.classList.add('hide-element'); 
            topBellBadge.classList.remove('active'); 
        }

        const bellContainer = topBellBadge.parentElement; 
        if (bellContainer && !bellContainer.hasAttribute('data-alert-bound')) {
            bellContainer.setAttribute('data-alert-bound', 'true');
            bellContainer.addEventListener('click', function() { 
                // حفظ الوقت الحالي وعدد المهام الحالي عند فتح الجرس
                sessionStorage.setItem('telecard_last_seen_alert_time', Date.now()); 
                sessionStorage.setItem('telecard_last_seen_alert_count', currentAlertCount); 
                topBellBadge.classList.add('hide-element'); 
                topBellBadge.classList.remove('active'); 
            });
        }
    },

    renderMainChart: async function() { 
        const chartDiv = document.querySelector("#main-revenue-chart");
        if (!chartDiv || typeof window.ApexCharts === 'undefined') return;

        if (this._isRenderingChart) return;
        this._isRenderingChart = true;

        try {
            const biData = await AdminData.fetchSalesBIAsync('7days');
            const dailyAggregations = biData?.curr?.daily || {};

            const last7Days = [], salesData = [], profitData = [];
            const todayUTCStart = FinancialEngine.getStartOfUTCDay(Date.now());

            for (let i = 6; i >= 0; i--) {
                const d = new Date(todayUTCStart - (i * 86400000)); 
                const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
                last7Days.push(d);
                
                salesData.push(Number((dailyAggregations[dayKey]?.revenue || 0).toFixed(2)));
                profitData.push(Number((dailyAggregations[dayKey]?.profit || 0).toFixed(2)));
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
                yaxis: { labels: { formatter: (value) => Utils.enNum(value) + ' ' + currText } },
                grid: { borderColor: isLightMode ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', strokeDashArray: 4 },
                theme: { mode: themeMode }, tooltip: { theme: themeMode }
            };

            if (this._mainChartInst) {
                try { this._mainChartInst.destroy(); } catch (e) { console.warn("Chart destroy failed"); }
            }
            
            if (document.body.contains(chartDiv)) {
                chartDiv.innerHTML = '';
                this._mainChartInst = new window.ApexCharts(chartDiv, options);
                this._mainChartInst.render();
            }

        } catch (error) {
            console.error("🚨 فشل في رسم المخطط البياني:", error);
        } finally {
            this._isRenderingChart = false;
        }
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
                <td><div class="log-user-cell"><i class="fa-solid fa-user-shield text-primary"></i> <span>${Utils.escapeHTML(displayAdminName)}</span></div></td>
                <td><span class="log-action-badge num-en ${badgeClass}" dir="ltr" style="padding: 4px 10px; border-radius: 6px; border-width: 1px; border-style: solid; font-size: 11px;">${Utils.escapeHTML(action)}</span></td>
                <td class="log-details-cell">${Utils.escapeHTML(log.details)}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    }
};
