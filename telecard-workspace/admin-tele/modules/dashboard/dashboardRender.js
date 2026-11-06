// ============================================================================
// 📊 محرك رسم لوحة القيادة (modules/dashboard/dashboardRender.js) - Ultimate V20.6 🚀
// 🎯 الوظيفة: رسم الإحصائيات، الرادار الجنائي، سجل النشاطات، ومراقبة الأمان.
// 🌟 التحديثات المعمارية:
// 1. Smart Bell Signature Engine 🔔: نظام بصمة الإشعارات الدائم في localStorage لمنع تكرار ظهور عداد الجرس للإشعارات المقروءة بعد إعادة تشغيل الموقع.
// 2. Unified Theme Colors 🎨: استبدال .text-white بـ .text-main لضمان وضوح نصوص الرادار في الوضعين الليلي والنهاري.
// 3. Alert & Badge Standardization 🏷️: استبدال .border-warning بـ .alert-warning، وضبط افتراضي شارات السجل إلى .badge-info.
// 4. Request Token Concurrency (reqId) 🛡️: منع تداخل الطلبات (Race Conditions) وتأمين ثبات بيانات الـ UI مع فلتر لوحة الشرف.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { DashboardTemplates } from './dashboardTemplates.js'; 
import { RenderHelpers } from '../../core/renderHelpers.js';
import { FinancialEngine } from '../../core/financialEngine.js'; 
import { EventBus, Utils } from '../../adminUtils.js';

export const DashboardRender = {
    leaderboardFilter: 'all', 
    logsTab: 'audit',
    _mainChartInst: null, 
    _cachedChartDaily: null,
    _lastChartFetchMs: 0,
    
    _listenersBound: false,
    _dashReqId: 0, // نظام الـ Request Token بدلاً من _isRenderingDash
    _isRenderingChart: false,
    _lastThemeState: null, 
    _lastDashFetchMs: 0,
    _lastFetchedLeaderboardFilter: null,

    initListeners: function() {
        if (this._listenersBound) return; 
        this._listenersBound = true;

        EventBus.on('req-render-dash', (opts) => {
            const forceRefresh = Boolean(opts && opts.force === true);
            this.renderDashboard(forceRefresh, false);
        });
        EventBus.on('req-render-logs', () => this.renderLogs());
        EventBus.on('req-clear-render-filters', () => {
            this.logsTab = 'audit';
        });
        EventBus.on('switch-logs-tab', (data) => {
            this.logsTab = data?.tab || 'audit';
            const tabsCont = document.getElementById('tabs-logs');
            if (tabsCont) {
                tabsCont.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
                const targetBtn = data?.element || tabsCont.querySelector(`[data-tab="${this.logsTab}"]`);
                if (targetBtn) targetBtn.classList.add('active');
            }
            this.renderLogs();
        });
        
        EventBus.on('change-leaderboard-filter', (data) => {
            this.changeLeaderboardFilter(data.val || data);
        });

        this._lastThemeState = document.body.classList.contains('light-mode');
        const themeObserver = new MutationObserver(() => {
            const currentThemeState = document.body.classList.contains('light-mode');
            
            if (this._lastThemeState !== currentThemeState) {
                this._lastThemeState = currentThemeState;
                if (document.getElementById('view-dash')?.classList.contains('active')) {
                    this.renderMainChart(false);
                }
            }
        });
        
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    },

    changeLeaderboardFilter: function(period) {
        this.leaderboardFilter = period;
        this.renderDashboard(true, true); 
    },

    renderDashboard: async function(forceRefresh = false, leaderboardOnly = false) {
        const dashView = document.getElementById('view-dash');
        if (!dashView || !dashView.classList.contains('active') || typeof AdminData.fetchDashboardStatsAsync !== 'function') return;

        const reqId = ++this._dashReqId; // توثيق الطلب لمنع الـ Race Condition
        const requestedFilter = this.leaderboardFilter || 'all'; // تجميد المتغير المحلي
        
        const refreshBtnIcon = document.querySelector('[data-action="refresh-dash"] i');
        if (forceRefresh) {
            if (refreshBtnIcon) refreshBtnIcon.classList.add('fa-spin');
            if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(true, 'جاري تحديث إحصائيات القيادة...');
        }

        const capsGrid = document.getElementById('dash-capsules');
        const alertsCont = document.getElementById('dash-smart-alerts');

        const nowMs = Date.now();
        const CACHE_TTL_MS = 180000; // 3 دقائق
        const canUseCachedStats = !forceRefresh &&
            AdminData.data?.dashboardStats &&
            this._lastFetchedLeaderboardFilter === requestedFilter &&
            (nowMs - this._lastDashFetchMs < CACHE_TTL_MS);

        if (!canUseCachedStats && capsGrid && !capsGrid.querySelector('.skeleton-box') && !capsGrid.querySelector('.dash-circ-grid')) {
            capsGrid.innerHTML = `
                <div class="skel-grid">
                    <div class="skeleton-box skel-card"><div class="skeleton-box skel-card-icon"></div><div class="skeleton-box skel-card-data"><div class="skeleton-box skel-data-1"></div><div class="skeleton-box skel-data-2"></div></div></div>
                    <div class="skeleton-box skel-card"><div class="skeleton-box skel-card-icon"></div><div class="skeleton-box skel-card-data"><div class="skeleton-box skel-data-1"></div><div class="skeleton-box skel-data-2"></div></div></div>
                    <div class="skeleton-box skel-card"><div class="skeleton-box skel-card-icon"></div><div class="skeleton-box skel-card-data"><div class="skeleton-box skel-data-1"></div><div class="skeleton-box skel-data-2"></div></div></div>
                </div>`;
        }

        if (typeof this.renderMainChart === 'function' && !leaderboardOnly) {
            this.renderMainChart(forceRefresh);
        }

        try {
            const stats = canUseCachedStats
                ? AdminData.data.dashboardStats
                : await AdminData.fetchDashboardStatsAsync(requestedFilter);

            // إلغاء الطلبات المتأخرة إذا قام المدير بتغيير الفلتر أثناء التحميل
            if (reqId !== this._dashReqId) return;

            if (!canUseCachedStats && stats) {
                this._lastDashFetchMs = Date.now();
                this._lastFetchedLeaderboardFilter = requestedFilter;
            }
            
            if (!stats || !stats.wallets) {
                throw new Error("بيانات السيرفر غير مكتملة أو مفقودة.");
            }
            
            let walletsCapsules = DashboardTemplates.dashWalletCapsule('إجمالي التزامات المحافظ', stats.wallets.totalUsd || 0, 'USD');
            const details = stats.wallets.details || {};
            Object.keys(details).forEach(cc => {
                const d = details[cc];
                const sumVal = (d && typeof d === 'object') ? Number(d.sum || 0) : Number(d || 0);
                const countVal = (d && typeof d === 'object') ? Number(d.count || 0) : 0;
                if (sumVal > 0 || countVal > 0) {
                    walletsCapsules += DashboardTemplates.dashWalletCapsule(`محفظة ${cc}`, sumVal, cc);
                }
            });

            let couponsHtml = (stats.promoStats && DashboardTemplates.dashCouponsSection) ? DashboardTemplates.dashCouponsSection(stats.promoStats) : '';

            let communityHtml = '';
            if (DashboardTemplates.dashCommunitySection) {
                const topSpenders = (stats.users?.topThree || []).filter(u => Number(u.spent || 0) > 0);
                const podiumHtml = DashboardTemplates.dashPodium(topSpenders);
                
                const activeUsersList = (stats.users?.mostActiveUsers || []).filter(u => Number(u.count || 0) > 0);
                const activeUserHtml = DashboardTemplates.dashActiveUsersList(activeUsersList);
                
                communityHtml = DashboardTemplates.dashCommunitySection(podiumHtml, activeUserHtml, requestedFilter); // استخدام requestedFilter المجمّد
            }

            if (capsGrid) {
                capsGrid.className = '';
                const offlineBanner = stats._isOfflineFallback ?
                    `<div class="alert-info alert-warning mb-15 text-warning"><i class="fa-solid fa-cloud-showers-heavy me-1"></i> <span>لم يتم الاتصال بدوال السيرفر السحابية بعد — يتم عرض القيم الصفرية الافتراضية لحين رفع الدوال.</span></div>` :
                    '';
                capsGrid.innerHTML = offlineBanner + DashboardTemplates.dashGrid(stats, walletsCapsules, couponsHtml, communityHtml);
            }

            const totalBannedIps = Number(stats.users?.bannedIps || 0);
            const sysSettings = AdminData.data.settings || {};
            const totalBannedDevices = Number(stats.users?.bannedDevices ?? (Array.isArray(sysSettings.bannedDevices) ? sysSettings.bannedDevices.length : 0));
            const displayAlerts = Array.isArray(stats.alerts)
                ? stats.alerts.filter(a => a && a.id !== 'security_stable').map(a => ({ ...a }))
                : [];

            const pendingOrders = Number(stats.pendingCounts?.orders || 0);
            const pendingDeposits = Number(stats.pendingCounts?.deposits || 0);
            const pendingKYC = Number(stats.pendingCounts?.kyc || 0);
            const pendingComplaints = Number(stats.pendingCounts?.complaints || 0);

            if (stats.wallets && stats.wallets.hasUncalculated) {
                displayAlerts.unshift({
                    id: 'wallet_warning',
                    sigKey: 'wallet_warning',
                    badgeCount: 1,
                    type: 'danger',
                    icon: 'fa-triangle-exclamation',
                    text: `تنبيه محاسبي: توجد أرصدة للعملاء ببعض العملات لم تُحسب قيمتها بالدولار بسبب غياب سعر الصرف!`,
                    action: `data-action="nav" data-target="rates"`
                });
            }            
            
            if (pendingOrders > 0) displayAlerts.unshift({ id: 'act_ord', sigKey: 'act_ord', badgeCount: pendingOrders, type: 'warning', icon: 'fa-box-open', text: `بانتظارك <b class="text-main num-en font-numeric" dir="ltr">${pendingOrders}</b> طلبات منتجات تحتاج للتنفيذ.`, action: `data-action="nav-with-filter" data-section="orders" data-status="pending"` });
            if (pendingDeposits > 0) displayAlerts.unshift({ id: 'act_dep', sigKey: 'act_dep', badgeCount: pendingDeposits, type: 'success', icon: 'fa-money-bill-transfer', text: `بانتظارك <b class="text-main num-en font-numeric" dir="ltr">${pendingDeposits}</b> طلبات إيداع للمحفظة.`, action: `data-action="nav-with-filter" data-section="deposits" data-status="pending"` });
            if (pendingKYC > 0) displayAlerts.unshift({ id: 'act_kyc', sigKey: 'act_kyc', badgeCount: pendingKYC, type: 'info', icon: 'fa-id-card-clip', text: `يوجد <b class="num-en text-info font-numeric" dir="ltr">${pendingKYC}</b> طلبات توثيق هوية بانتظار المراجعة.`, action: `data-action="nav" data-target="kyc-system"` });

            if (pendingComplaints > 0) {
                displayAlerts.unshift({ id: 'act_complaint', sigKey: 'act_complaint', badgeCount: pendingComplaints, type: 'danger', icon: 'fa-star-half-stroke', text: `تنبيه هام: يوجد <b class="text-main num-en font-numeric" dir="ltr">${pendingComplaints}</b> عميل غاضب بانتظار تدخلك!`, action: `data-action="nav-to-complaints"` });
            }

            if (totalBannedIps > 0 || totalBannedDevices > 0) {
                displayAlerts.push({ id: 'firewall_active', sigKey: `firewall_${totalBannedIps}_${totalBannedDevices}`, badgeCount: 0, type: 'danger', icon: 'fa-shield-virus', text: `الجدار الناري نشط! يتصدى لـ <b class="text-main num-en font-numeric" dir="ltr">${totalBannedIps}</b> IP و <b class="text-main num-en font-numeric" dir="ltr">${totalBannedDevices}</b> جهاز محظور.`, action: `data-action="nav" data-target="sys"` });
            }

            if (Array.isArray(stats.systemAlerts) && stats.systemAlerts.length > 0) { 
                stats.systemAlerts.forEach(sa => { 
                    let clickAction = `data-action="nav-to-sys-errors"`;
                    if (sa.userId) clickAction = `data-action="view-user" data-id="${Utils.escapeHTML(sa.userId)}"`;
                    else if (sa.orderId) clickAction = `data-action="open-tx-detail" data-type="order" data-id="${Utils.escapeHTML(sa.orderId)}"`;
                    else if (sa.prodId) clickAction = `data-action="open-prod-modal" data-id="${Utils.escapeHTML(sa.prodId)}"`;
                    else if (sa.target === 'users') clickAction = `data-action="nav" data-target="users"`;
                    else if (sa.target === 'orders') clickAction = `data-action="nav" data-target="orders"`;
                    else if (sa.target === 'products') clickAction = `data-action="nav" data-target="products"`;
                    else if (sa.target === 'offers' || sa.target === 'coupons') clickAction = `data-action="nav" data-target="coupons"`;

                    const safeTitle = sa.title || sa.action || 'تنبيه';
                    const safeDetails = sa.details || '';
                    
                    displayAlerts.unshift({ 
                        id: `sys_err_${sa.id}`, 
                        sigKey: `sys_err_${sa.id}_${RenderHelpers.parseTime(sa.time || 0, false)}`,
                        badgeCount: 1, 
                        type: 'danger', 
                        icon: 'fa-radiation', 
                        time: sa.time, 
                        text: `<b>${Utils.escapeHTML(safeTitle)}:</b> ${Utils.escapeHTML(safeDetails)}`, 
                        action: clickAction 
                    }); 
                }); 
            }
            
            if (alertsCont) {
                if (displayAlerts.length === 0) {
                    alertsCont.innerHTML = DashboardTemplates.dashEmptyAlerts(); 
                } else {
                    alertsCont.innerHTML = displayAlerts.map(a => {
                        let type = a.type || 'info', icon = a.icon || 'fa-info-circle', text = a.text || '', action = a.action || '';
                        const timeStr = (a.time && Number(a.time) > 0) ? RenderHelpers.formatSafeDate(a.time) : '';

                        if (a.id === 'vault_empty') {
                            a.sigKey = `vault_empty_${a.poolId}`;
                            a.badgeCount = 1;
                            type = 'danger';
                            icon = 'fa-box-open';
                            text = `مخزون حرج: صندوق <b class="text-danger">${Utils.escapeHTML(a.poolName)}</b> فارغ تماماً!`;
                            action = `data-action="edit-item" data-type="vault" data-id="${Utils.escapeHTML(a.poolId)}"`;
                        } else if (a.id === 'vault_low') {
                            a.sigKey = `vault_low_${a.poolId}_${a.count}`;
                            a.badgeCount = 1;
                            type = 'warning';
                            icon = 'fa-hourglass-half';
                            text = `نقص مخزون: تبقى <b class="num-en text-warning font-numeric" dir="ltr">${Utils.enNum(a.count)}</b> أكواد في <b class="text-main">${Utils.escapeHTML(a.poolName)}</b>`;
                            action = `data-action="edit-item" data-type="vault" data-id="${Utils.escapeHTML(a.poolId)}"`;
                        } else if (a.id === 'coupon_used') {
                            a.sigKey = `coupon_used_${a.orderId || a.code}`;
                            type = 'success';
                            icon = 'fa-tag';
                            text = `استخدم العميل <b class="text-main">${Utils.escapeHTML(a.user)}</b> الكوبون <span class="badge-qty font-numeric" dir="ltr">${Utils.escapeHTML(a.code)}</span>`;
                            action = `data-action="open-tx-detail" data-type="order" data-id="${Utils.escapeHTML(a.orderId)}"`;
                        } else if (a.id === 'security_stable') {
                            type = 'security';
                            icon = 'fa-shield-check';
                            text = `حالة النظام الأمنية مستقرة - لا يوجد أي نشاط مشبوه.`;
                        }

                        return DashboardTemplates.dashAlertItem(type, icon, text, action, timeStr); 
                    }).join('');
                }
            }
            
            this.updateTopBellBadge(displayAlerts);

        } catch (error) {
            if (reqId !== this._dashReqId) return; // حماية من أخطاء الطلبات الملغية
            console.error("🚨 فشل جلب لوحة القيادة السحابية:", error);
            if (capsGrid) capsGrid.innerHTML = RenderHelpers.emptyState('fa-solid fa-triangle-exclamation text-danger', 'تعذر جلب الإحصائيات من السيرفر', 'يرجى التحقق من الاتصال وتحديث الصفحة.');
            if (alertsCont) alertsCont.innerHTML = RenderHelpers.emptyState('fa-solid fa-plug-circle-xmark text-danger', 'تعذر الاتصال بالرادار السحابي', 'يرجى تحديث الصفحة.');
        } finally {
            if (reqId === this._dashReqId && forceRefresh) {
                if (refreshBtnIcon) refreshBtnIcon.classList.remove('fa-spin');
                if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(false);
            }
        }
    },

    updateTopBellBadge: function(displayAlerts) {
        const topBellBadge = document.getElementById('global-alert-badge');
        if (!topBellBadge) return;
        
        const activeAlerts = (displayAlerts || []).filter(a => a && a.id !== 'security_stable' && (a.badgeCount === undefined || Number(a.badgeCount) > 0));
        if (activeAlerts.length === 0) {
            topBellBadge.classList.add('hide-element');
            topBellBadge.classList.remove('active');
            localStorage.removeItem('telecard_seen_alerts_map');
            return;
        }
        
        let seenMap = {};
        try {
            seenMap = JSON.parse(localStorage.getItem('telecard_seen_alerts_map') || '{}') || {};
        } catch (e) {
            seenMap = {};
        }

        const currentMap = {};
        const nextSeenMap = {};
        let seenMapNeedsSync = false;
        let unseenCount = 0;

        activeAlerts.forEach(a => {
            const key = String(a.sigKey || a.id || '');
            if (!key) return;
            const countVal = a.badgeCount !== undefined ? Number(a.badgeCount) : 1;
            currentMap[key] = countVal;

            if (seenMap[key] !== undefined) {
                const prevSeenVal = Number(seenMap[key] || 0);
                if (countVal < prevSeenVal) {
                    nextSeenMap[key] = countVal;
                    seenMapNeedsSync = true;
                } else {
                    nextSeenMap[key] = prevSeenVal;
                    if (countVal > prevSeenVal) {
                        unseenCount += (countVal - prevSeenVal);
                    }
                }
            } else {
                unseenCount += countVal;
            }
        });

        if (Object.keys(seenMap).length !== Object.keys(nextSeenMap).length) {
            seenMapNeedsSync = true;
        }
        if (seenMapNeedsSync) {
            localStorage.setItem('telecard_seen_alerts_map', JSON.stringify(nextSeenMap));
        }
        
        if (unseenCount > 0) {
            topBellBadge.innerText = unseenCount > 99 ? "+99" : Utils.enNum(unseenCount);
            topBellBadge.classList.remove('hide-element');
            topBellBadge.classList.add('active');
        } else {
            topBellBadge.classList.add('hide-element');
            topBellBadge.classList.remove('active');
        }
        
        const bellContainer = topBellBadge.parentElement;
        if (bellContainer) {
            bellContainer._latestAlertsMap = currentMap;
            if (!bellContainer.hasAttribute('data-alert-bound')) {
                bellContainer.setAttribute('data-alert-bound', 'true');
                bellContainer.addEventListener('click', function() {
                    if (bellContainer._latestAlertsMap) {
                        localStorage.setItem('telecard_seen_alerts_map', JSON.stringify(bellContainer._latestAlertsMap));
                    }
                    topBellBadge.classList.add('hide-element');
                    topBellBadge.classList.remove('active');
                });
            }
        }
    },

    renderMainChart: async function(forceFetch = false) { 
        const chartDiv = document.querySelector("#main-revenue-chart");
        if (!chartDiv || typeof window.ApexCharts === 'undefined') return;

        if (this._isRenderingChart) return;
        this._isRenderingChart = true;

        try {
            const nowChartMs = Date.now();
            if (forceFetch || !this._cachedChartDaily || (nowChartMs - this._lastChartFetchMs >= 180000)) {
                const biData = await AdminData.fetchSalesBIAsync('7days');
                this._cachedChartDaily = biData?.curr?.daily || {};
                this._lastChartFetchMs = Date.now();
            }
            const dailyAggregations = this._cachedChartDaily || {};

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
                this._mainChartInst = null; 
            }
            
            if (document.body.contains(chartDiv)) {
                chartDiv.innerHTML = '';
                this._mainChartInst = new window.ApexCharts(chartDiv, options);
                this._mainChartInst.render();
            }

        } catch (error) {
            console.error("🚨 فشل في رسم المخطط البياني:", error);
            if (chartDiv) chartDiv.innerHTML = RenderHelpers.emptyState('fa-solid fa-chart-line text-muted', 'تعذر تحميل المخطط البياني', 'يرجى التحقق من اتصال السيرفر والمحاولة مجدداً.');
        } finally {
            this._isRenderingChart = false;
        }
    },

    renderLogs: function() {
        const tbody = document.getElementById('logs-table-body');
        if (!tbody) return;

        const tabsCont = document.getElementById('tabs-logs');
        if (tabsCont) {
            tabsCont.querySelectorAll('.main-tab-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.tab === this.logsTab);
            });
        }
        
        const sysErrors = Array.isArray(AdminData.data.systemErrors) && AdminData.data.systemErrors.length > 0
            ? AdminData.data.systemErrors
            : (AdminData.data.dashboardStats?.systemAlerts || []);
        
        const errCountEl = document.getElementById('count-sys-errors');
        if (errCountEl) {
            errCountEl.innerText = Utils.enNum(sysErrors.length);
        }
        
        if (this.logsTab === 'errors') {
            const sortedErrors = [...sysErrors].sort((a, b) => (b.timestamp || b.time || 0) - (a.timestamp || a.time || 0));
            if (sortedErrors.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="empty-table-cell">${RenderHelpers.emptyState('fa-solid fa-shield-check text-success', 'النظام خالٍ من الأخطاء', 'لا توجد أي أخطاء أو إنذارات مسجلة في النظام حالياً.')}</td></tr>`;
                return;
            }
            
            tbody.innerHTML = sortedErrors.map(err => {
                const safeDateTime = RenderHelpers.formatSafeDate(err.timestamp || err.time);
                const suppObj = err.supplierId ? AdminData.data.suppliersMap?.[err.supplierId] : null;
                const sourceName = (err.supplierId && err.supplierId !== 'system')
                    ? `المورد (${suppObj?.name || err.supplierId})`
                    : 'النظام الآلي 🤖';
                const actionCode = (err.action || 'SYSTEM_ERROR').toUpperCase();
                const titleHtml = (err.title && err.title !== err.action) ? `<b class="text-danger d-block mb-5">${Utils.escapeHTML(err.title)}</b>` : '';
                
                let inspectBtnHtml = '';
                if (err.orderId) {
                    inspectBtnHtml = `<button type="button" class="btn btn-ghost btn-compact text-warning ms-2 interactive-scale" data-action="open-tx-detail" data-type="order" data-id="${Utils.escapeHTML(err.orderId)}"><i class="fa-solid fa-eye me-1"></i> فتح الطلب</button>`;
                } else if (err.prodId) {
                    inspectBtnHtml = `<button type="button" class="btn btn-ghost btn-compact text-warning ms-2 interactive-scale" data-action="open-prod-modal" data-id="${Utils.escapeHTML(err.prodId)}"><i class="fa-solid fa-eye me-1"></i> فتح المنتج</button>`;
                } else if (err.userId) {
                    inspectBtnHtml = `<button type="button" class="btn btn-ghost btn-compact text-warning ms-2 interactive-scale" data-action="view-user" data-id="${Utils.escapeHTML(err.userId)}"><i class="fa-solid fa-eye me-1"></i> ملف العميل</button>`;
                }
                
                return `<tr>
                    <td><div class="log-date-cell"><span class="d-date num-en font-numeric" dir="ltr" lang="en">${safeDateTime}</span></div></td>
                    <td><div class="log-user-cell"><i class="fa-solid fa-triangle-exclamation text-danger me-1"></i> <span>${Utils.escapeHTML(sourceName)}</span></div></td>
                    <td><span class="log-action-badge num-en font-numeric badge-danger" dir="ltr" lang="en">${Utils.escapeHTML(actionCode)}</span></td>
                    <td class="log-details-cell">${titleHtml}<span>${Utils.escapeHTML(err.details)}</span>${inspectBtnHtml}</td>
                </tr>`;
            }).join('');
            return;
        }
        
        const allLogs = AdminData.data.logs || [];
        const logs = [...allLogs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 100);
        
        if (logs.length === 0) {
            tbody.innerHTML = DashboardTemplates.emptyLogsTable();
            return;
        }
        
        let html = '';
        logs.forEach(log => {
            let badgeClass = 'badge-info';
            const action = (log.action || '').toUpperCase();
            
            if (action.includes('ADD') || action.includes('APPROVE') || action.includes('ACCEPT')) {
                badgeClass = 'badge-success';
            } else if (action.includes('DELETE') || action.includes('REJECT') || action.includes('BAN') || action.includes('REVOKE')) {
                badgeClass = 'badge-danger';
            } else if (action.includes('EDIT') || action.includes('UPDATE') || action.includes('RESTRICT') || action.includes('SYNC')) {
                badgeClass = 'badge-warning';
            } else if (action.includes('ORDER') || action.includes('PAYMENT') || action.includes('BALANCE') || action.includes('KYC')) {
                badgeClass = 'badge-info';
            }
            
            const safeDateTime = RenderHelpers.formatSafeDate(log.timestamp);
            const adminUser = AdminData.data.usersMap?.[log.adminUid];
            const displayAdminName = log.admin || (adminUser ? (adminUser.fullName || adminUser.firstName || adminUser.name || adminUser.username) : (log.adminUid || 'مدير النظام'));
            
            html += `<tr>
                <td><div class="log-date-cell"><span class="d-date num-en font-numeric" dir="ltr" lang="en">${safeDateTime}</span></div></td>
                <td><div class="log-user-cell"><i class="fa-solid fa-user-shield text-primary me-1"></i> <span>${Utils.escapeHTML(displayAdminName)}</span></div></td>
                <td><span class="log-action-badge num-en font-numeric ${badgeClass}" dir="ltr" lang="en">${Utils.escapeHTML(action)}</span></td>
                <td class="log-details-cell">${Utils.escapeHTML(log.details)}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    }
};
