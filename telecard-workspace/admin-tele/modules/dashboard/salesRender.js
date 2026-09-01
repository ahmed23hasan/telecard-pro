// ============================================================================
// 📈 محرك رسم وتحليل المبيعات (modules/dashboard/salesRender.js) - Enterprise V15.4 💎
// 🎯 الوظيفة: استهلاك البيانات المركزية، الفلترة الزمنية، ورسم التقارير والتصدير
// 🚀 التحديث الأقصى: 
// 1. Tier Name Resolution Fix: جلب أسماء المستويات الحقيقية من TiersMap بدلاً من الـ Snapshot لحل مشكلة (المستوى الافتراضي).
// 2. Chart Desync Fix: جعل الـ Charts ديناميكية تتجاوب مع (7، 30، 90 يوم) بدقة.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { UIService } from '../../core/uiService.js';
import { FinancialEngine } from '../../core/financialEngine.js'; 
import { DashboardTemplates } from './dashboardTemplates.js'; 

export const SalesRender = {
    state: { timeRange: localStorage.getItem('telecard_sales_filter') || '30days' },

    initListeners: function() {
        EventBus.on('req-render-sales', () => {
            const selectEl = document.querySelector('[data-action="change-sales-range"]');
            if (selectEl) selectEl.value = this.state.timeRange;
            this.renderSales();
        });
        
        EventBus.on('change-sales-range', (range) => {
            this.state.timeRange = range;
            localStorage.setItem('telecard_sales_filter', range);
            this.renderSales();
        });
    },

    changeTimeRange: function(range) {
        this.state.timeRange = range;
        localStorage.setItem('telecard_sales_filter', range);
        this.renderSales();
    },

    _computeAdvancedBI: function(range) {
        const orders = AdminData.data.orders || [];
        const now = Date.now();
        let currStart = 0, prevStart = 0, prevEnd = now;

        if (range === '7days') { currStart = now - 7*86400000; prevEnd = currStart; prevStart = prevEnd - 7*86400000; }
        else if (range === '30days') { currStart = now - 30*86400000; prevEnd = currStart; prevStart = prevEnd - 30*86400000; }
        else if (range === '90days') { currStart = now - 90*86400000; prevEnd = currStart; prevStart = prevEnd - 90*86400000; }

        let stats = {
            curr: { revenue: 0, cost: 0, profit: 0, count: 0, sources: { api: 0, auto: 0, manual: 0 }, tiers: {}, categories: {}, products: {} },
            prev: { revenue: 0, cost: 0, profit: 0, count: 0 }
        };

        orders.forEach(o => {
            if (o.status !== 'completed') return;
            const timeMs = RenderHelpers.parseTime(o.time || o.createdAt || now);

            let isCurr = timeMs >= currStart && timeMs <= now;
            let isPrev = timeMs >= prevStart && timeMs < prevEnd;
            if (range === 'all') isCurr = true;

            if (!isCurr && !isPrev) return;

            const pricing = o.pricingSnapshot;
            const rev = Number(pricing?.finalPriceUsd || pricing?.finalPrice || o.baseUsd || o.price || 0);
            const cost = Number(pricing?.costUsd || pricing?.cost || (o.costPrice || o.unitCost || 0) * (o.qty || 1));
            const prof = Number(pricing?.netProfitUsd || pricing?.profit || (rev - cost));

            if (isCurr) {
                stats.curr.revenue += rev; stats.curr.cost += cost; stats.curr.profit += prof; stats.curr.count++;

                const isApi = (o.isApi || o.source === 'api');
                const isAuto = (!isApi && o.deliveredCode && o.deliveredCode.length > 0);
                if (isApi) stats.curr.sources.api += prof;
                else if (isAuto) stats.curr.sources.auto += prof;
                else stats.curr.sources.manual += prof;

                // 🛡️ [الإصلاح الجذري للمستويات]: جلب الاسم من الخريطة (Map) مباشرة بدلاً من الاعتماد على الفاتورة القديمة
                const tierId = o.tierId || 'default';
                const realTierName = AdminData.data.tiersMap?.[tierId]?.name || pricing?.tierName || 'عادي (افتراضي)';
                
                if (!stats.curr.tiers[tierId]) stats.curr.tiers[tierId] = { name: realTierName, rev: 0, prof: 0, count: 0 };
                stats.curr.tiers[tierId].rev += rev; stats.curr.tiers[tierId].prof += prof; stats.curr.tiers[tierId].count++;

                const pId = o.prodId || 'unknown';
                const realProdName = AdminData.data.prodsMap?.[pId]?.name || o.product || 'منتج محذوف';
                if (!stats.curr.products[pId]) stats.curr.products[pId] = { name: realProdName, revenue: 0, cost: 0, profit: 0, count: 0 };
                stats.curr.products[pId].revenue += rev; stats.curr.products[pId].cost += cost; stats.curr.products[pId].profit += prof; stats.curr.products[pId].count++;
                
                const cId = o.catId || 'unknown';
                const realCatName = AdminData.data.catsMap?.[cId]?.name || o.category || 'قسم محذوف أو غير معروف';
                if (!stats.curr.categories[cId]) stats.curr.categories[cId] = { name: realCatName, revenue: 0, cost: 0, profit: 0, count: 0 };
                stats.curr.categories[cId].revenue += rev; stats.curr.categories[cId].cost += cost; stats.curr.categories[cId].profit += prof; stats.curr.categories[cId].count++;

            } else if (isPrev) {
                stats.prev.revenue += rev; stats.prev.cost += cost; stats.prev.profit += prof; stats.prev.count++;
            }
        });

        return stats;
    },

    renderSales: function() {
        const salesView = document.getElementById('view-sales');
        if (!salesView || !salesView.classList.contains('active')) return;

        const biData = this._computeAdvancedBI(this.state.timeRange);
        if (!biData) return;

        const summaryContainer = document.getElementById('sales-executive-summary');
        if (summaryContainer) {
            summaryContainer.className = 'dash-circ-grid mb-20'; 
            summaryContainer.innerHTML = DashboardTemplates.salesExecutiveSummary(biData.curr, biData.prev, this.state.timeRange);
        }

        const catsTbody = document.getElementById('sales-detailed-cats');
        if (catsTbody) {
            const sortedCats = Object.values(biData.curr.categories).sort((a, b) => b.profit - a.profit);
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
            const sortedTiers = Object.values(biData.curr.tiers).sort((a, b) => b.profit - a.profit);
            if (sortedTiers.length === 0) {
                tiersTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-20">لا توجد مبيعات في هذه الفترة.</td></tr>`;
            } else {
                tiersTbody.innerHTML = sortedTiers.map(t => {
                    const marginRaw = FinancialEngine.safeDiv(t.prof, t.rev);
                    const margin = FinancialEngine.safeMul(marginRaw, 100);
                    return `
                        <tr>
                            <td class="fw-bold"><i class="fa-solid fa-user-tag text-muted me-2"></i> ${Utils.escapeHTML(t.name)}</td>
                            <td class="num-en">${Utils.enNum(t.count)}</td>
                            <td class="num-en text-primary" dir="ltr">${RenderHelpers.formatMoney(t.rev, 'USD')}</td>
                            <td class="num-en text-gold fw-bold" dir="ltr">${RenderHelpers.formatMoney(t.prof, 'USD')}</td>
                            <td class="num-en ${margin >= 20 ? 'text-success' : 'text-warning'}" dir="ltr">${Utils.enNum(margin, 1)}%</td>
                        </tr>`;
                }).join('');
            }
        }

        const podiumContainer = document.getElementById('sales-podium');
        const sortedProds = Object.entries(biData.curr.products)
            .map(([id, p]) => ({ ...p, id }))
            .sort((a, b) => b.profit - a.profit);
        
        if (podiumContainer) {
            if (sortedProds.length > 0) {
                const getProdImg = (id) => { const p = AdminData.data.prodsMap?.[id]; return p && p.img ? p.img : null; };

                const buildRankHtml = (prod, rankClass, num, badgeIcon) => {
                    if (!prod) return '';
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

        this.renderCharts(biData.curr.sources, this.state.timeRange);
    },

    renderCharts: function(sources, range) {
        if (typeof window.ApexCharts === 'undefined') return;

        let daysToLoop = 30;
        if (range === '7days') daysToLoop = 7;
        else if (range === '90days') daysToLoop = 90;
        else if (range === 'all') daysToLoop = 30; 

        const dailyAggregations = {};
        const rangeTimeMs = Date.now() - (daysToLoop * 24 * 60 * 60 * 1000);
        
        const recentCompletedOrders = (AdminData.data.orders || []).filter(o => {
            if (o.status !== 'completed') return false;
            const timeMs = RenderHelpers.parseTime(o.time || o.createdAt || Date.now());
            return timeMs >= rangeTimeMs;
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

        const dates = [], revenues = [], profits = [];
        for (let i = daysToLoop - 1; i >= 0; i--) {
            const d = new Date(); 
            d.setUTCDate(d.getUTCDate() - i);
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
            dates.push(`${d.getUTCDate()} ${d.toLocaleString('ar-EG', { month: 'short' })}`);
            
            revenues.push((dailyAggregations[key]?.revenue || 0).toFixed(2));
            profits.push((dailyAggregations[key]?.profit || 0).toFixed(2));
        }

        const isLight = document.body.classList.contains('light-mode');
        const themeMode = isLight ? 'light' : 'dark';
        const textColor = isLight ? '#64748b' : '#94a3b8';

        const detailedChartEl = document.querySelector('#sales-detailed-chart');
        if (detailedChartEl) {
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
        if (sourceChartEl && sources) {
            const donutOptions = {
                chart: { type: 'donut', height: 320, background: 'transparent', fontFamily: 'Cairo' },
                series: [sources.api, sources.auto, sources.manual],
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

    exportSalesToExcel: function() {
        const stats = this._computeAdvancedBI(this.state.timeRange);
        if (!stats || Object.keys(stats.curr.products).length === 0) {
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
            csv += `"${productName}",${p.count},${p.revenue.toFixed(2)},${p.cost.toFixed(2)},${p.profit.toFixed(2)}\n`;
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
    }
};
