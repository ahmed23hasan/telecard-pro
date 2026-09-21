// ============================================================================
// 📈 محرك رسم وتحليل المبيعات (modules/dashboard/salesRender.js) - Ultimate Hybrid V18.5 💎
// 🎯 الوظيفة: استهلاك البيانات المركزية، الفلترة الزمنية، ورسم التقارير والتصدير
// 🚀 التحديثات المعمارية (V18.5 - Session Integrity Patch): 
// 1. Strict Session Fix 🔒: استبدال localStorage بـ sessionStorage لتوافق سياسة الأمان.
// 2. Export NaN Shield 🛡️: معالجة القيم المفقودة في التصدير لمنع انهيار الإكسل.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { UIService } from '../../core/uiService.js';
import { FinancialEngine } from '../../core/financialEngine.js'; 
import { DashboardTemplates } from './dashboardTemplates.js'; 

export const SalesRender = {
    // 🚀 [توافق الأمان]: استخدام sessionStorage
    state: { timeRange: sessionStorage.getItem('telecard_sales_filter') || '30days' },
    
    _latestStatsCache: null, 
    _listenersBound: false,
    _isRendering: false,

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
            sessionStorage.setItem('telecard_sales_filter', range); // 🚀 [توافق الأمان]
            this.renderSales();
        });

        // 🚀 [التصحيح المعماري]: تحديث ألوان مخططات المبيعات لحظياً عند تبديل الثيم
        const themeObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class' && document.getElementById('view-sales')?.classList.contains('active') && this._latestStatsCache) {
                    this.renderCharts(this._latestStatsCache.curr.daily, this._latestStatsCache.curr.sources, this.state.timeRange);
                }
            });
        });
        themeObserver.observe(document.body, { attributes: true });
    },
    changeTimeRange: function(range) {
        this.state.timeRange = range;
        sessionStorage.setItem('telecard_sales_filter', range); // 🚀 [توافق الأمان]
        this.renderSales();
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
                    catsTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-20">لا توجد مبيعات في هذه الفترة.</td></tr>`;
                } else {
                    catsTbody.innerHTML = sortedCats.map(c => {
                        const marginRaw = FinancialEngine.safeDiv(c.profit, c.revenue);
                        const margin = FinancialEngine.safeMul(marginRaw, 100);
                        return `
                            <tr>
                                <td class="fw-bold" title="${Utils.escapeHTML(c.name)}">${Utils.escapeHTML(c.name)}</td>
                                <td class="num-en">${Utils.enNum(c.count)}</td>
                                <td class="num-en text-primary" dir="ltr">${RenderHelpers.formatMoney(c.revenue, 'USD')}</td>
                                <td class="num-en text-gold fw-bold" dir="ltr">${RenderHelpers.formatMoney(c.profit, 'USD')}</td>
                                <td class="num-en text-muted" dir="ltr">${RenderHelpers.formatMoney(c.count > 0 ? FinancialEngine.safeDiv(c.revenue, c.count) : 0, 'USD')}</td>
                                <td class="num-en ${margin >= 20 ? 'text-success' : 'text-warning'}" dir="ltr">${Utils.enNum(margin, 1)}%</td>
                            </tr>`;
                    }).join('');
                }
            }

            let tiersTableContainer = document.getElementById('sales-tiers-container');
            if (!tiersTableContainer) {
                const tablesGrid = document.querySelector('.sales-tables-grid');
                if (tablesGrid) {
                    tablesGrid.insertAdjacentHTML('beforebegin', `
                        <div class="card mb-20 sales-card-padded" id="sales-tiers-container">
                            <div class="card-title text-success mb-15"><i class="fa-solid fa-crown"></i> تحليل المبيعات والأرباح حسب مستويات العملاء (Tiers)</div>
                            <div class="table-responsive">
                                <table class="modern-table">
                                    <thead><tr><th>المستوى</th><th>الطلبات</th><th>الإيرادات</th><th>الربح الصافي</th><th>هامش الربح</th></tr></thead>
                                    <tbody id="sales-detailed-tiers"></tbody>
                                </table>
                            </div>
                        </div>
                    `);
                }
            }
            
            const tiersTbody = document.getElementById('sales-detailed-tiers');
            if (tiersTbody) {
                const sortedTiers = Object.values(biData.curr.tiers || {}).sort((a, b) => b.profit - a.profit);
                
                if (sortedTiers.length === 0) {
                    tiersTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-20">لا توجد مبيعات في هذه الفترة.</td></tr>`;
                } else {
                    tiersTbody.innerHTML = sortedTiers.map(t => {
                        const marginRaw = FinancialEngine.safeDiv(t.profit, t.revenue);
                        const margin = FinancialEngine.safeMul(marginRaw, 100);
                        return `
                            <tr>
                                <td class="fw-bold"><i class="fa-solid fa-user-tag text-muted me-2"></i> ${Utils.escapeHTML(t.name)}</td>
                                <td class="num-en">${Utils.enNum(t.count)}</td>
                                <td class="num-en text-primary" dir="ltr">${RenderHelpers.formatMoney(t.revenue, 'USD')}</td>
                                <td class="num-en text-gold fw-bold" dir="ltr">${RenderHelpers.formatMoney(t.profit, 'USD')}</td>
                                <td class="num-en ${margin >= 20 ? 'text-success' : 'text-warning'}" dir="ltr">${Utils.enNum(margin, 1)}%</td>
                            </tr>`;
                    }).join('');
                }
            }

            const podiumContainer = document.getElementById('sales-podium');
            const sortedProds = Object.entries(biData.curr.products || {})
                .map(([id, p]) => ({ ...p, id }))
                .sort((a, b) => b.profit - a.profit);
            
            if (podiumContainer) {
                if (sortedProds.length > 0) {
                    const getProdImg = (id) => { const p = AdminData.data.prodsMap?.[id]; return p && p.img ? p.img : null; };

                    // 🚀 بناء مرن يعوض المراكز المفقودة بوهميات للحفاظ على التصميم
                    const buildRankHtml = (prod, rankClass, num, badgeIcon) => {
                        if (!prod) return `<div class="podium-item ${rankClass} opacity-50"><div class="podium-avatar-wrap"><div class="podium-rank-num">${num}</div></div><div class="podium-info"><span class="podium-name text-muted">---</span><span class="podium-val text-muted num-en" dir="ltr">$0.00</span></div></div>`;
                        const img = getProdImg(prod.id);
                        const avatarContent = img ? `<div class="podium-rank-num" style="padding:0; overflow:hidden;"><img src="${Utils.escapeHTML(img)}" style="width:100%; height:100%; object-fit:cover;"></div>` : `<div class="podium-rank-num">${num}</div>`;
                        return `<div class="podium-item ${rankClass}"><div class="podium-avatar-wrap">${avatarContent}<div class="rank-badge">${badgeIcon}</div></div><div class="podium-info"><span class="podium-name text-truncate">${Utils.escapeHTML(prod.name)}</span><span class="podium-val text-gold num-en" dir="ltr">${RenderHelpers.formatMoney(prod.profit, 'USD', 2)}</span></div></div>`;
                    };

                    podiumContainer.innerHTML = `${buildRankHtml(sortedProds[1], 'rank-2', '2', '<i class="fa-solid fa-medal"></i>')}${buildRankHtml(sortedProds[0], 'rank-1', '1', '<i class="fa-solid fa-crown text-gold"></i>')}${buildRankHtml(sortedProds[2], 'rank-3', '3', '<i class="fa-solid fa-award"></i>')}`;
                } else {
                    podiumContainer.innerHTML = `<div class="text-center text-muted w-100 py-20"><i class="fa-solid fa-ghost fs-2 mb-10 opacity-50"></i><br>لا توجد مبيعات!</div>`;
                }
            }

            const allProdsTbody = document.getElementById('sales-rest-prods');
            if (allProdsTbody) {
                if (sortedProds.length === 0) {
                    allProdsTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">لا توجد مبيعات.</td></tr>`;
                } else {
                    allProdsTbody.innerHTML = sortedProds.map(p => {
                        const marginRaw = FinancialEngine.safeDiv(p.profit, p.revenue);
                        const margin = FinancialEngine.safeMul(marginRaw, 100);
                        return `
                            <tr>
                                <td class="fs-12 fw-bold text-truncate" style="max-width: 150px;" title="${Utils.escapeHTML(p.name)}">${Utils.escapeHTML(p.name)}</td>
                                <td class="num-en">${Utils.enNum(p.count)}</td>
                                <td class="num-en text-primary" dir="ltr">${RenderHelpers.formatMoney(p.revenue, 'USD')}</td>
                                <td class="num-en text-gold fw-bold" dir="ltr">${RenderHelpers.formatMoney(p.profit, 'USD')}</td>
                                <td class="num-en ${margin >= 20 ? 'text-success' : 'text-warning'}" dir="ltr">${Utils.enNum(margin, 1)}%</td>
                            </tr>`;
                    }).join('');
                }
            }

            this.renderCharts(biData.curr.daily || {}, biData.curr.sources || { api: 0, auto: 0, manual: 0 }, this.state.timeRange);

        } catch (error) {
            console.error("🚨 خطأ في تحليل ورسم المبيعات السحابية:", error);
            UIService?.showToast?.("فشل استخراج تقارير المبيعات", "error");
        } finally {
            this._isRendering = false;
            if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(false);
        }
    },

    renderCharts: function(dailyAggregations = {}, sources, range) {
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

            if (this._detailedChartInst) { try { this._detailedChartInst.destroy(); } catch(e){} }
            detailedChartEl.innerHTML = ''; 
            this._detailedChartInst = new window.ApexCharts(detailedChartEl, areaOptions);
            this._detailedChartInst.render();
        }

        const sourceChartEl = document.querySelector('#sales-source-chart');
        if (sourceChartEl && sources && document.body.contains(sourceChartEl)) {
            const donutOptions = {
                chart: { type: 'donut', height: 320, background: 'transparent', fontFamily: 'Cairo' },
                series: [sources.api || 0, sources.auto || 0, sources.manual || 0],
                labels: ['توصيل API', 'صندوق الأكواد', 'شحن يدوي'],
                colors: ['#38bdf8', '#10b981', '#f59e0b'],
                theme: { mode: themeMode },
                plotOptions: { donut: { size: '75%' } },
                dataLabels: { enabled: false },
                tooltip: { y: { formatter: function(val) { return "$" + val.toFixed(2) } } },
                legend: { position: 'bottom' }
            };

            if (this._sourceChartInst) { try { this._sourceChartInst.destroy(); } catch(e){} }
            sourceChartEl.innerHTML = '';
            this._sourceChartInst = new window.ApexCharts(sourceChartEl, donutOptions);
            this._sourceChartInst.render();
        }
    },

    exportSalesToExcel: async function() {
        const btn = document.querySelector('[data-action="export-excel"][data-type="sales"]');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التصدير...';
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
                // 🚀 [الإصلاح المعماري]: تغليف القيم بدالة Number لحماية التصدير من الانهيار (NaN/Undefined)
                const revenue = Number(p.revenue || 0).toFixed(2);
                const cost = Number(p.cost || 0).toFixed(2);
                const profit = Number(p.profit || 0).toFixed(2);
                
                csv += `"${productName}",${p.count},${revenue},${cost},${profit}\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            
            const readableNames = { 'all': 'كل_الأوقات', 'today': 'اليوم', '7days': 'آخر_7_أيام', '30days': 'آخر_30_يوم', '90days': 'آخر_90_يوم' };
            const safeName = readableNames[this.state.timeRange] || 'تقرير';
            const fileName = `تقرير_المبيعات_${safeName}_${new Date().toISOString().split('T')[0]}.csv`;
            
            link.setAttribute("href", window.URL.createObjectURL(blob));
            link.setAttribute("download", fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            UIService.showToast(`تم تصدير تقرير المبيعات بنجاح`, "success");
        } catch (error) {
            console.error("Export Error:", error);
            UIService?.showToast?.("حدث خطأ في الاتصال أثناء بناء التقرير", "error");
        } finally {
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-file-excel"></i> تصدير ';
                btn.disabled = false;
            }
        }
    }
};