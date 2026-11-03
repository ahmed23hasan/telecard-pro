// ============================================================================
// 📈 محرك رسم وتحليل المبيعات (modules/dashboard/salesRender.js) - Ultimate Hybrid V20.1 💎
// 🎯 الوظيفة: استهلاك البيانات المركزية، الفلترة الزمنية، ورسم التقارير والتصدير
// 🚀 التحديثات المعمارية (V20.1 - Fast BI Stats & Source Chart Fix): 
// 1. Fast BI Stats ⚡: تسريع تقرير كبار العملاء عبر قراءة telecard_user_stats بدلاً من سحب آلاف الطلبات!
// 2. Source Chart Fix 🍩: ربط المخطط الدائري بالمصادر الحقيقية وحمايته من القيم السالبة.
// 3. Math & Memory Shields 🛡️: تصفير ذاكرة المخططات فور تدميرها، وحماية الـ Margin من القسمة على صفر.
// 4. Ghost & Zero-Spend Filter 👻: استبعاد العملاء المحذوفين والإنفاق الصفري من منصة الشرف وقراءة الصور بأمان.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { UIService } from '../../core/uiService.js';
import { FinancialEngine } from '../../core/financialEngine.js'; 
import { DashboardTemplates } from './dashboardTemplates.js'; 
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';
import { collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const SalesRender = {
    state: { timeRange: sessionStorage.getItem('telecard_sales_filter') || '30days' },
    
    _latestStatsCache: null, 
    _listenersBound: false,
    _isRendering: false,
    _lastThemeState: null,

    initListeners: function() {
        if (this._listenersBound) return; 
        this._listenersBound = true;

        EventBus.on('req-render-sales', () => {
            const selectEl = document.querySelector('[data-action="change-sales-range"]');
            if (selectEl) selectEl.value = this.state.timeRange;
            this.renderSales();
        });
        
        EventBus.on('change-sales-range', (data) => {
            const range = data.val || data;
            this.state.timeRange = range;
            sessionStorage.setItem('telecard_sales_filter', range); 
            this.renderSales();
        });

        // 🚀 [الإصلاح المعماري 2]: ربط الحدث الصحيح المسجل في systemActions.js لمنع تحذير (حدث غير مبرمج)
        EventBus.on('req-load-top-customers', () => this.loadTopCustomersReport());

        this._lastThemeState = document.body.classList.contains('light-mode');
        const themeObserver = new MutationObserver((mutations) => {
            const currentThemeState = document.body.classList.contains('light-mode');
            if (this._lastThemeState !== currentThemeState) {
                this._lastThemeState = currentThemeState;
                if (document.getElementById('view-sales')?.classList.contains('active') && this._latestStatsCache) {
                    this.renderCharts(this._latestStatsCache.curr.daily, this._latestStatsCache.curr.sources, this.state.timeRange);
                }
            }
        });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    },
    
    changeTimeRange: function(range) {
        this.state.timeRange = range;
        sessionStorage.setItem('telecard_sales_filter', range);
        this.renderSales();
    },

    loadTopCustomersReport: async function() {
        const btn = document.getElementById('btn-load-top-customers');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> جاري استخراج التقرير السحابي...';
            btn.disabled = true;
        }

        try {
            const range = this.state.timeRange;
            let topUsersFull = [];

            // 🚀 [الإصلاح المعماري 1]: قراءة جدول الإحصائيات مع فلترة الأشباح (isDeleted) والإنفاق الصفري
            if (range === 'all') {
                const snap = await getDocs(query(collection(FirebaseAdapter.db, 'telecard_users'), orderBy('totalSpent', 'desc'), limit(60)));
                topUsersFull = snap.docs
                    .filter(doc => doc.data().isDeleted !== true && Number(doc.data().totalSpent || 0) > 0)
                    .slice(0, 50)
                    .map(doc => {
                        const d = doc.data();
                        return { id: doc.id, displayId: d.displayId || String(doc.id).substring(0, 8), name: d.fullName || d.username || 'عميل مميز', spent: d.totalSpent || 0 };
                    });
            } 
            else if (range === 'this_month' || range === 'last_month') {
                const nowObj = new Date();
                let targetDate = new Date(Date.UTC(nowObj.getUTCFullYear(), nowObj.getUTCMonth(), 1));
                if (range === 'last_month') {
                    targetDate = new Date(Date.UTC(nowObj.getUTCFullYear(), nowObj.getUTCMonth() - 1, 1));
                }
                const monthKey = `${targetDate.getUTCFullYear()}_${String(targetDate.getUTCMonth() + 1).padStart(2, '0')}`;

                const snap = await getDocs(query(collection(FirebaseAdapter.db, 'telecard_user_stats'), where('monthKey', '==', monthKey), orderBy('spentThisMonth', 'desc'), limit(50)));
                
                topUsersFull = snap.docs
                    .filter(doc => Number(doc.data().spentThisMonth || 0) > 0)
                    .map(doc => {
                        const d = doc.data();
                        const realUser = AdminData.data.usersMap?.[d.userId] || {};
                        return { id: d.userId, displayId: d.userDisplayId || realUser.displayId || String(d.userId).substring(0, 8), name: d.userName || realUser.fullName || 'عميل', spent: d.spentThisMonth || 0 };
                    });
            } 
            else {
                // للفترات المخصصة (7 أيام أو 90 يوماً)، نعتمد على جلب الطلبات المحدودة
                let startTime = 0;
                if (range === 'today') startTime = Date.now() - 86400000;
                else if (range === '7days') startTime = Date.now() - (7 * 86400000);
                else if (range === '30days') startTime = Date.now() - (30 * 86400000);
                else if (range === '90days') startTime = Date.now() - (90 * 86400000);

                const res = await FirebaseAdapter.callFunction('adminGetOrdersList', { limit: 1000, status: 'completed', startDateMs: startTime });

                if (res && res.success && res.data) {
                    const userMapLocal = {};
        res.data.forEach(o => {
            const uid = String(o.userId);
            if (AdminData.data.usersMap?.[uid]?.isDeleted === true) return;
            if (!userMapLocal[uid]) userMapLocal[uid] = { spent: 0, name: o.userDataSnapshot?.fullName || o.userName || 'عميل', displayId: o.userDataSnapshot?.displayId || uid.substring(0, 8) };
const exactPrice = Number(o.priceBaseUsd ?? o.pricingSnapshot?.finalPriceUsd ?? o.pricingSnapshot?.finalPrice ?? o.price ?? 0);
                        userMapLocal[uid].spent = FinancialEngine.safeAdd(userMapLocal[uid].spent, exactPrice);
                    });
                    
                    topUsersFull = Object.entries(userMapLocal)
                        .map(([id, data]) => ({ id, ...data }))
                        .filter(u => u.spent > 0) // فلترة الإنفاق الصفري
                        .sort((a, b) => b.spent - a.spent)
                        .slice(0, 50);
                }
            }

            let html = '';
            if (topUsersFull.length === 0) {
                html = DashboardTemplates.emptyTopCustomers();
            } else {
                html = topUsersFull.map((u, i) => {
                    const safeName = Utils.escapeHTML(u.name);
                    const cleanName = safeName.replace(/[\u064B-\u065F]/g, '').trim(); 
                    const fallbackChar = Array.from(cleanName)[0] || '?';

                    return `
                        <div class="d-flex align-items-center justify-content-between p-10 mb-10 top-customer-row interactive-scale">
                            <div class="d-flex align-items-center gap-3">
                                <span class="fs-14 fw-bold text-muted font-numeric" dir="ltr" style="min-width: 25px;">#${i + 1}</span>
                                <div class="avatar-fallback-icon">${fallbackChar}</div>
                                <div>
                                    <div class="fw-bold text-truncate" style="max-width: 150px;" title="${safeName}">${safeName}</div>
                                    <div class="fs-11 text-muted num-en font-numeric" dir="ltr">${Utils.escapeHTML(u.displayId)}</div>
                                </div>
                            </div>
                            <div class="text-gold fw-bold num-en font-numeric" dir="ltr">${RenderHelpers.formatMoney(u.spent, 'USD', 2)}</div>
                        </div>
                    `;
                }).join('');
            }

            const periodNames = { 'all': 'كل الأوقات', 'today': 'اليوم', '7days': 'آخر 7 أيام', '30days': 'آخر 30 يوم', '90days': 'آخر 90 يوم', 'this_month': 'هذا الشهر', 'last_month': 'الشهر الماضي' };
            UIService.showReportModal(`أفضل 50 عميلاً (${periodNames[this.state.timeRange] || 'الفترة المحددة'})`, html);

        } catch (error) {
            console.error("🚨 خطأ في جلب تقرير كبار العملاء:", error);
            UIService.showToast("تعذر جلب التقرير السحابي", "error");
        } finally {
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-list-ol me-1"></i> تقرير كبار العملاء (الكامل)';
                btn.disabled = false;
            }
        }
    },

    renderSales: async function() {
        const salesView = document.getElementById('view-sales');
        if (!salesView || !salesView.classList.contains('active')) return;

        if (this._isRendering) return;
        this._isRendering = true;

        if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(true, 'جاري تحليل المبيعات السحابية...');

        try {
            const biData = await AdminData.fetchSalesBIAsync(this.state.timeRange);
            if (!biData || !biData.curr) return;

            this._latestStatsCache = biData;

            const summaryContainer = document.getElementById('sales-executive-summary');
            if (summaryContainer) {
                summaryContainer.className = 'dash-circ-grid mb-20'; 
                summaryContainer.innerHTML = DashboardTemplates.salesExecutiveSummary(biData.curr, biData.prev, this.state.timeRange);
            }

            const catsTbody = document.getElementById('sales-detailed-cats');
            if (catsTbody) {
                const sortedCats = Object.values(biData.curr.categories || {}).sort((a, b) => b.profit - a.profit);
                
                if (sortedCats.length === 0) {
                    catsTbody.innerHTML = DashboardTemplates.emptySalesTable(6);
                } else {
                    catsTbody.innerHTML = sortedCats.map(c => {
                        // 🚀 الحماية من القسمة على صفر
                        const marginRaw = c.revenue > 0 ? FinancialEngine.safeDiv(c.profit, c.revenue) : 0;
                        const margin = FinancialEngine.safeMul(marginRaw, 100);
                        return `
                            <tr>
                                <td class="fw-bold text-truncate max-w-150" title="${Utils.escapeHTML(c.name)}">${Utils.escapeHTML(c.name)}</td>
                                <td class="num-en font-numeric" dir="ltr">${Utils.enNum(c.count)}</td>
                                <td class="num-en font-numeric text-primary" dir="ltr">${RenderHelpers.formatMoney(c.revenue, 'USD')}</td>
                                <td class="num-en font-numeric text-gold fw-bold" dir="ltr">${RenderHelpers.formatMoney(c.profit, 'USD')}</td>
                                <td class="num-en font-numeric text-muted" dir="ltr">${RenderHelpers.formatMoney(c.count > 0 ? FinancialEngine.safeDiv(c.revenue, c.count) : 0, 'USD')}</td>
                                <td class="num-en font-numeric ${margin >= 20 ? 'text-success' : 'text-warning'}" dir="ltr">${Utils.enNum(margin, 1)}%</td>
                            </tr>`;
                    }).join('');
                }
            }

            const tiersTbody = document.getElementById('sales-detailed-tiers');
            if (tiersTbody) {
                const sortedTiers = Object.values(biData.curr.tiers || {}).sort((a, b) => b.profit - a.profit);
                
                if (sortedTiers.length === 0) {
                    tiersTbody.innerHTML = DashboardTemplates.emptySalesTable(5);
                } else {
                    tiersTbody.innerHTML = sortedTiers.map(t => {
                        // 🚀 الحماية من القسمة على صفر
                        const marginRaw = t.revenue > 0 ? FinancialEngine.safeDiv(t.profit, t.revenue) : 0;
                        const margin = FinancialEngine.safeMul(marginRaw, 100);
                        return `
                            <tr>
                                <td class="fw-bold"><i class="fa-solid fa-user-tag text-muted me-2"></i> ${Utils.escapeHTML(t.name)}</td>
                                <td class="num-en font-numeric" dir="ltr">${Utils.enNum(t.count)}</td>
                                <td class="num-en font-numeric text-primary" dir="ltr">${RenderHelpers.formatMoney(t.revenue, 'USD')}</td>
                                <td class="num-en font-numeric text-gold fw-bold" dir="ltr">${RenderHelpers.formatMoney(t.profit, 'USD')}</td>
                                <td class="num-en font-numeric ${margin >= 20 ? 'text-success' : 'text-warning'}" dir="ltr">${Utils.enNum(margin, 1)}%</td>
                            </tr>`;
                    }).join('');
                }
            }

            const podiumContainer = document.getElementById('sales-podium');
            
            const sortedProds = Object.entries(biData.curr.products || {})
                .map(([id, p]) => ({ ...p, id }))
                .sort((a, b) => {
                    if (b.profit === a.profit) return b.revenue - a.revenue;
                    return b.profit - a.profit;
                });
            
            if (podiumContainer) {
                if (sortedProds.length > 0) {
                    // 🚀 [الإصلاح المعماري]: قراءة مسار الصورة img أو image لمنع اختفائها من المنصة
                    const getProdImg = (id) => { const p = AdminData.data.prodsMap?.[id]; return p ? (p.img || p.image || null) : null; };

                    const buildRankHtml = (prod, rankClass, num, badgeIcon) => {
                        if (!prod) return `<div class="podium-item ${rankClass} opacity-50"><div class="podium-avatar-wrap"><div class="podium-rank-num font-numeric" dir="ltr">${num}</div></div><div class="podium-info"><span class="podium-name text-muted">---</span><span class="podium-val text-muted num-en font-numeric" dir="ltr">$0.00</span></div></div>`;
                        const img = getProdImg(prod.id);
                        const avatarContent = img ? `<img src="${Utils.escapeHTML(img)}" class="podium-img"><div class="podium-rank-num font-numeric" dir="ltr">${num}</div>` : `<div class="podium-rank-num font-numeric" dir="ltr">${num}</div>`;

                        const displayValue = prod.profit > 0 ? prod.profit : prod.revenue;

                        return `<div class="podium-item ${rankClass}"><div class="podium-avatar-wrap">${avatarContent}<div class="rank-badge">${badgeIcon}</div></div><div class="podium-info"><span class="podium-name text-truncate" title="${Utils.escapeHTML(prod.name)}">${Utils.escapeHTML(prod.name)}</span><span class="podium-val text-gold num-en font-numeric" dir="ltr">${RenderHelpers.formatMoney(displayValue, 'USD', 2)}</span></div></div>`;
                    };

                    podiumContainer.innerHTML = `${buildRankHtml(sortedProds[1], 'rank-2', '2', '<i class="fa-solid fa-medal"></i>')}${buildRankHtml(sortedProds[0], 'rank-1', '1', '<i class="fa-solid fa-crown text-gold"></i>')}${buildRankHtml(sortedProds[2], 'rank-3', '3', '<i class="fa-solid fa-award"></i>')}`;
                    
                    const existingBtnContainer = document.getElementById('top-customers-btn-wrap');
                    if (existingBtnContainer) existingBtnContainer.remove();

                    // 🚀 استخدام data-action للتوافق مع CSP بدلاً من السطر الداخلي onclick
                    podiumContainer.insertAdjacentHTML('afterend', `
                        <div id="top-customers-btn-wrap" class="text-center mt-20">
                            <button class="btn btn-ghost text-warning interactive-scale" id="btn-load-top-customers" data-action="load-top-customers">
                                <i class="fa-solid fa-list-ol me-1"></i> تقرير كبار العملاء (الكامل)
                            </button>
                        </div>
                    `);

                } else {
                    podiumContainer.innerHTML = DashboardTemplates.emptySalesPodium();
                }
            }

            const allProdsTbody = document.getElementById('sales-rest-prods');
            if (allProdsTbody) {
                if (sortedProds.length === 0) {
                    allProdsTbody.innerHTML = DashboardTemplates.emptySalesTable(5);
                } else {
                    allProdsTbody.innerHTML = sortedProds.map(p => {
                        // 🚀 الحماية من القسمة على صفر
                        const marginRaw = p.revenue > 0 ? FinancialEngine.safeDiv(p.profit, p.revenue) : 0;
                        const margin = FinancialEngine.safeMul(marginRaw, 100);
                        return `
                            <tr>
                                <td class="fs-12 fw-bold text-truncate max-w-150" title="${Utils.escapeHTML(p.name)}">${Utils.escapeHTML(p.name)}</td>
                                <td class="num-en font-numeric" dir="ltr">${Utils.enNum(p.count)}</td>
                                <td class="num-en font-numeric text-primary" dir="ltr">${RenderHelpers.formatMoney(p.revenue, 'USD')}</td>
                                <td class="num-en font-numeric text-gold fw-bold" dir="ltr">${RenderHelpers.formatMoney(p.profit, 'USD')}</td>
                                <td class="num-en font-numeric ${margin >= 20 ? 'text-success' : 'text-warning'}" dir="ltr">${Utils.enNum(margin, 1)}%</td>
                            </tr>`;
                    }).join('');
                }
            }

            this.renderCharts(biData.curr.daily || {}, biData.curr.sources || {}, this.state.timeRange);

        } catch (error) {
            console.error("🚨 خطأ في تحليل ورسم المبيعات السحابية:", error);
            UIService?.showToast?.("فشل استخراج تقارير المبيعات", "error");
        } finally {
            this._isRendering = false;
            if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(false);
        }
    },

    renderCharts: function(dailyAggregations = {}, sources = {}, range) {
        if (typeof window.ApexCharts === 'undefined') return;

        let daysToLoop = 30;
        if (range === 'today') daysToLoop = 2; 
        else if (range === '7days') daysToLoop = 7;
        else if (range === '90days') daysToLoop = 90;
        else if (range === 'all') daysToLoop = 30; 

        const dates = [], revenues = [], profits = [];
        const todayUTCStart = FinancialEngine.getStartOfUTCDay(Date.now());

        for (let i = daysToLoop - 1; i >= 0; i--) {
            const d = new Date(todayUTCStart - (i * 86400000));
            // 🚀 استخدام دوال الـ UTC لتطابق مفاتيح السيرفر بدقة
            const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
            dates.push(`${d.getUTCDate()} ${d.toLocaleString('ar-EG', { month: 'short', timeZone: 'UTC' })}`);
            
            revenues.push(Number((dailyAggregations[dayKey]?.revenue || 0).toFixed(2)));
            profits.push(Number((dailyAggregations[dayKey]?.profit || 0).toFixed(2)));
        }

        const isLight = document.body.classList.contains('light-mode');
        const themeMode = isLight ? 'light' : 'dark';
        const textColor = isLight ? '#64748b' : '#94a3b8';

        const detailedChartEl = document.querySelector('#sales-detailed-chart');
        if (detailedChartEl && document.body.contains(detailedChartEl)) {
            const areaOptions = {
                chart: { type: 'area', height: 320, toolbar: { show: false }, background: 'transparent', fontFamily: 'Cairo' },
                theme: { mode: themeMode },
                colors: ['#38bdf8', '#10b981'],
                dataLabels: { enabled: false }, 
                series: [{ name: 'الإيرادات', data: revenues }, { name: 'الأرباح', data: profits }],
                stroke: { curve: 'smooth', width: 2 },
                fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 } },
                xaxis: { categories: dates, tickAmount: Math.min(daysToLoop, 6), labels: { style: { colors: textColor } } },
                yaxis: { labels: { style: { colors: textColor }, formatter: (v) => '$' + v } },
                grid: { borderColor: isLight ? '#e2e8f0' : '#1e293b', strokeDashArray: 4 },
                legend: { position: 'top', horizontalAlign: 'right' }
            };

            if (this._detailedChartInst) { 
                try { this._detailedChartInst.destroy(); } catch(e){} 
                this._detailedChartInst = null;
            }
            detailedChartEl.innerHTML = ''; 
            this._detailedChartInst = new window.ApexCharts(detailedChartEl, areaOptions);
            this._detailedChartInst.render();
        }

        const sourceChartEl = document.querySelector('#sales-source-chart');
        if (sourceChartEl && document.body.contains(sourceChartEl)) {
            // 🚀 [الإصلاح المعماري 3]: قراءة مصادر الأرباح المباشرة من السيرفر مع الحماية من القيم السالبة
            const vaultVal = Math.max(0, Number(sources.vault || 0));
            const supplierVal = Math.max(0, Number(sources.supplier || 0));
            const manualVal = Math.max(0, Number(sources.manual || 0));
            const total = vaultVal + supplierVal + manualVal;

            if (total <= 0) {
                if (this._sourceChartInst) { 
                    try { this._sourceChartInst.destroy(); } catch(e){} 
                    this._sourceChartInst = null;
                }
                sourceChartEl.innerHTML = `
                    <div class="d-flex align-items-center justify-content-center h-100 min-h-100 w-100">
                        ${RenderHelpers.emptyState('fa-solid fa-chart-pie text-muted', 'لا توجد بيانات للمخطط', 'سيظهر الرسم البياني بمجرد تسجيل مبيعات جديدة.')}
                    </div>`;
                return;
            }

            const donutOptions = {
                chart: { type: 'donut', height: 320, background: 'transparent', fontFamily: 'Cairo' },
                series: [vaultVal, supplierVal, manualVal],
                labels: ['أرباح الخزنة الذاتية', 'أرباح الموردين', 'أرباح التنفيذ اليدوي'],
                colors: ['#10b981', '#38bdf8', '#f59e0b'],
                theme: { mode: themeMode },
                plotOptions: { donut: { size: '75%' } },
                dataLabels: { enabled: false },
                tooltip: { y: { formatter: function(val) { return "$" + val.toFixed(2) } } },
                legend: { position: 'bottom' }
            };

            if (this._sourceChartInst) { 
                try { this._sourceChartInst.destroy(); } catch(e){} 
                this._sourceChartInst = null;
            }
            sourceChartEl.innerHTML = '';
            this._sourceChartInst = new window.ApexCharts(sourceChartEl, donutOptions);
            this._sourceChartInst.render();
        }
    },
    exportSalesToExcel: async function() {
        const btn = document.querySelector('[data-action="export-excel"][data-type="sales"]');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> جاري التصدير...';
            btn.disabled = true;
        }

        try {
            let stats = this._latestStatsCache;
            
            if (!stats) {
                UIService.showToast("جاري جلب البيانات من السيرفر للتصدير...", "info");
                stats = await AdminData.fetchSalesBIAsync(this.state.timeRange);
                if (!stats) {
                    UIService.showToast("فشل استخراج التقرير السحابي", "error");
                    return;
                }
            }

            if (!stats.curr || !stats.curr.products || Object.keys(stats.curr.products).length === 0) {
                UIService.showToast("لا توجد بيانات مبيعات لتصديرها", "error");
                return;
            }

            let csv = "\uFEFFالمنتج,الكمية المباعة,إجمالي الإيرادات,إجمالي التكاليف,صافي الربح\n";
            
            const sanitizeCSV = (str) => { 
                let c = String(str).replace(/"/g, '""').replace(/,/g, " "); 
                if (/^[=@+-]/.test(c)) c = "'" + c; 
                return c; 
            };

            Object.values(stats.curr.products).forEach(p => {
                const productName = sanitizeCSV(p.name || 'منتج غير معروف');
                const revenue = Number(p.revenue || 0).toFixed(2);
                const cost = Number(p.cost || 0).toFixed(2);
                const profit = Number(p.profit || 0).toFixed(2);
                
                csv += `"${productName}",${p.count},${revenue},${cost},${profit}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            
            const readableNames = { 'all': 'كل_الأوقات', 'today': 'اليوم', '7days': 'آخر_7_أيام', '30days': 'آخر_30_يوم', '90days': 'آخر_90_يوم', 'this_month': 'هذا_الشهر', 'last_month': 'الشهر_الماضي' };
            const safeName = readableNames[this.state.timeRange] || 'تقرير';
            const fileName = `تقرير_المبيعات_${safeName}_${new Date().toISOString().split('T')[0]}.csv`;
            
            const objUrl = window.URL.createObjectURL(blob);
link.setAttribute("href", objUrl);
link.setAttribute("download", fileName);
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
window.URL.revokeObjectURL(objUrl);

            UIService.showToast(`تم تصدير تقرير المبيعات بنجاح`, "success");
        } catch (error) {
            console.error("Export Error:", error);
            UIService?.showToast?.("حدث خطأ في الاتصال أثناء بناء التقرير", "error");
        } finally {
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-file-excel me-1"></i> تصدير ';
                btn.disabled = false;
            }
        }
    }
};
