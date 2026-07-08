// ============================================================================
// 📈 محرك رسم وتحليل المبيعات (modules/dashboard/salesRender.js) - النسخة الماسية V4.4 💎
// 🎯 الوظيفة: استهلاك البيانات المركزية، الفلترة الزمنية، ورسم التقارير والتصدير
// 🚀 التحديث الأقصى: القضاء على الـ O(N) في رادار التتويج وحماية الذاكرة الرسومية من Infinity
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { UIService } from '../../core/uiService.js';
import { FinancialEngine } from '../../core/financialEngine.js'; // 🛡️ استيراد المحرك المالي للحماية من NaN

export const SalesRender = {
    state: { timeRange: 'all' },

    initListeners: function() {
        EventBus.on('change-sales-range', (range) => {
            this.state.timeRange = range;
            this.renderSales();
        });
    },

    changeTimeRange: function(range) {
        this.state.timeRange = range;
        this.renderSales();
    },

    renderSales: function() {
        const salesView = document.getElementById('view-sales');
        if (!salesView || !salesView.classList.contains('active')) return;

        const stats = AdminData.getFilteredSalesStats(this.state.timeRange);
        if (!stats) return;

        const summaryContainer = document.getElementById('sales-executive-summary');
        if (summaryContainer) {
            summaryContainer.className = 'dash-circ-grid mb-20'; 
            summaryContainer.innerHTML = `
                <div class="dash-circ-card">
                    <div class="circ-icon bg-primary"><i class="fa-solid fa-money-bill-trend-up"></i></div>
                    <div class="circ-data">
                        <h3 class="num-en text-primary" dir="ltr">${RenderHelpers.formatMoney(stats.revenue, 'USD', 2)}</h3>
                        <span>إجمالي الإيرادات</span>
                    </div>
                </div>
                <div class="dash-circ-card">
                    <div class="circ-icon bg-danger"><i class="fa-solid fa-hand-holding-dollar"></i></div>
                    <div class="circ-data">
                        <h3 class="num-en text-danger" dir="ltr">${RenderHelpers.formatMoney(stats.cost, 'USD', 2)}</h3>
                        <span>إجمالي التكاليف</span>
                    </div>
                </div>
                <div class="dash-circ-card">
                    <div class="circ-icon bg-gold"><i class="fa-solid fa-sack-dollar"></i></div>
                    <div class="circ-data">
                        <h3 class="num-en text-gold" dir="ltr">${RenderHelpers.formatMoney(stats.profit, 'USD', 2)}</h3>
                        <span>الربح الصافي</span>
                    </div>
                </div>
                <div class="dash-circ-card">
                    <div class="circ-icon bg-warning"><i class="fa-solid fa-box-open"></i></div>
                    <div class="circ-data">
                        <h3 class="num-en text-warning" dir="ltr">${Utils.enNum(stats.count)}</h3>
                        <span>الطلبات الناجحة</span>
                    </div>
                </div>
            `;
        }

        const catsTbody = document.getElementById('sales-detailed-cats');
        if (catsTbody) {
            const sortedCats = Object.values(stats.categories).sort((a, b) => b.profit - a.profit);
            
            if (sortedCats.length === 0) {
                catsTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-20">لا توجد مبيعات في هذه الفترة.</td></tr>`;
            } else {
                catsTbody.innerHTML = sortedCats.map(c => {
                    // 🛡️ [إصلاح حرج]: حساب الهامش باستخدام المحرك المالي لمنع أخطاء Infinity و NaN
                    const marginRaw = FinancialEngine.safeDiv(c.profit, c.revenue);
                    const margin = FinancialEngine.safeMul(marginRaw, 100);
                    
                    const safeCatName = Utils.escapeHTML(c.name);
                    return `
                        <tr>
                            <td class="fw-bold" title="${safeCatName}">${safeCatName}</td>
                            <td class="num-en">${Utils.enNum(c.count)}</td>
                            <td class="num-en text-primary" dir="ltr">${RenderHelpers.formatMoney(c.revenue, 'USD')}</td>
                            <td class="num-en text-gold fw-bold" dir="ltr">${RenderHelpers.formatMoney(c.profit, 'USD')}</td>
                            <td class="num-en text-muted" dir="ltr">${RenderHelpers.formatMoney(c.count > 0 ? FinancialEngine.safeDiv(c.revenue, c.count) : 0, 'USD')}</td>
                            <td class="num-en ${margin >= 20 ? 'text-success' : 'text-warning'}" dir="ltr">${Utils.enNum(margin, 1)}%</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        const podiumContainer = document.getElementById('sales-podium');
        
        const sortedProds = Object.entries(stats.products)
            .map(([id, p]) => ({ ...p, id }))
            .sort((a, b) => b.profit - a.profit);
        
        if (podiumContainer) {
            if (sortedProds.length > 0) {
                
                // ⚡ التحديث الفائق O(1): جلب الصورة فورا من الخريطة
                const getProdImg = (id) => {
                    const p = AdminData.data.prodsMap?.[id];
                    return p && p.img ? p.img : null;
                };

                const buildRankHtml = (prod, rankClass, num, badgeIcon) => {
                    if (!prod) return '';

                    const img = getProdImg(prod.id);
                    const avatarContent = img 
                        ? `<div class="podium-rank-num" style="padding:0; overflow:hidden;"><img src="${Utils.escapeHTML(img)}" style="width:100%; height:100%; object-fit:cover;"></div>` 
                        : `<div class="podium-rank-num">${num}</div>`;

                    const safeProdName = Utils.escapeHTML(prod.name);
                    return `
                    <div class="podium-item ${rankClass}">
                        <div class="podium-avatar-wrap">
                            ${avatarContent}
                            <div class="rank-badge">${badgeIcon}</div>
                        </div>
                        <div class="podium-info">
                            <span class="podium-name" title="${safeProdName}">${safeProdName}</span>
                            <span class="podium-val text-gold num-en" dir="ltr">${RenderHelpers.formatMoney(prod.profit, 'USD', 2)}</span>
                        </div>
                    </div>`;
                };

                podiumContainer.innerHTML = `
                    ${buildRankHtml(sortedProds[1], 'rank-2', '2', '<i class="fa-solid fa-medal"></i>')}
                    ${buildRankHtml(sortedProds[0], 'rank-1', '1', '<i class="fa-solid fa-crown text-gold"></i>')}
                    ${buildRankHtml(sortedProds[2], 'rank-3', '3', '<i class="fa-solid fa-award"></i>')}
                `;
            } else {
                podiumContainer.innerHTML = `<div class="text-center text-muted w-100 py-20"><i class="fa-solid fa-ghost fs-2 mb-10 opacity-50"></i><br>لا توجد مبيعات في هذه الفترة!</div>`;
            }
        }

        const allProdsTbody = document.getElementById('sales-rest-prods');
        if (allProdsTbody) {
            if (sortedProds.length === 0) {
                allProdsTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">لا توجد مبيعات.</td></tr>`;
            } else {
                allProdsTbody.innerHTML = sortedProds.map(p => {
                    // 🛡️ [إصلاح حرج]: حساب الهامش باستخدام المحرك المالي
                    const marginRaw = FinancialEngine.safeDiv(p.profit, p.revenue);
                    const margin = FinancialEngine.safeMul(marginRaw, 100);
                    const safeName = Utils.escapeHTML(p.name);
                    
                    return `
                        <tr>
                            <td class="fs-12 fw-bold" title="${safeName}">${safeName}</td>
                            <td class="num-en">${Utils.enNum(p.count)}</td>
                            <td class="num-en text-primary" dir="ltr">${RenderHelpers.formatMoney(p.revenue, 'USD')}</td>
                            <td class="num-en text-gold fw-bold" dir="ltr">${RenderHelpers.formatMoney(p.profit, 'USD')}</td>
                            <td class="num-en ${margin >= 20 ? 'text-success' : 'text-warning'}" dir="ltr">${Utils.enNum(margin, 1)}%</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        this.renderCharts();
    },

    renderCharts: function() {
        if (typeof window.ApexCharts === 'undefined') return;

        const allCompletedOrders = (AdminData.data.orders || []).filter(o => o.status === 'completed');
        const nowTime = Date.now();
        
        let manualCount = 0;
        let apiCount = 0;
        const dailyAggregations = {};

        allCompletedOrders.forEach(o => {
            if (o.isApiOrder || o.source === 'api') apiCount++;
            else manualCount++;

            const timeMs = RenderHelpers.parseTime(o.time || o.createdAt || nowTime);
            const dateObj = new Date(timeMs);
            const dKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
            
            if (!dailyAggregations[dKey]) dailyAggregations[dKey] = { revenue: 0, profit: 0 };
            
            const pricing = o.pricingSnapshot;
            const rev = Number(pricing?.finalPriceUsd || pricing?.finalPrice || o.baseUsd || o.price || 0);
            const prof = Number(pricing?.netProfitUsd || pricing?.profit || 0);
            
            dailyAggregations[dKey].revenue = FinancialEngine.safeAdd(dailyAggregations[dKey].revenue, rev);
            dailyAggregations[dKey].profit = FinancialEngine.safeAdd(dailyAggregations[dKey].profit, prof);
        });

        const dates = [], revenues = [], profits = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            dates.push(`${d.getDate()} ${d.toLocaleString('ar-EG', { month: 'short' })}`);
            
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
                xaxis: { categories: dates, tickAmount: 6, labels: { style: { colors: textColor } } },
                yaxis: { labels: { style: { colors: textColor }, formatter: (v) => '$' + v } },
                grid: { borderColor: isLight ? '#e2e8f0' : '#1e293b', strokeDashArray: 4 },
                legend: { position: 'top', horizontalAlign: 'right' }
            };

            if (this._detailedChartInst) {
                try { this._detailedChartInst.destroy(); } catch(e){}
            }
            detailedChartEl.innerHTML = ''; 
            this._detailedChartInst = new window.ApexCharts(detailedChartEl, areaOptions);
            this._detailedChartInst.render();
        }

        const sourceChartEl = document.querySelector('#sales-source-chart');
        if (sourceChartEl) {
            const donutOptions = {
                chart: { type: 'donut', height: 320, background: 'transparent' },
                series: [manualCount, apiCount],
                labels: ['طلب يدوي', 'طلب API'],
                colors: ['#f59e0b', '#8b5cf6'],
                theme: { mode: themeMode },
                plotOptions: { donut: { size: '75%' } },
                legend: { position: 'bottom' }
            };

            if (this._sourceChartInst) {
                try { this._sourceChartInst.destroy(); } catch(e){}
            }
            sourceChartEl.innerHTML = '';
            this._sourceChartInst = new window.ApexCharts(sourceChartEl, donutOptions);
            this._sourceChartInst.render();
        }
    },

    exportSalesToExcel: function() {
        const stats = AdminData.getFilteredSalesStats(this.state.timeRange);
        if (!stats || Object.keys(stats.products).length === 0) {
            UIService.showToast("لا توجد بيانات مبيعات لتصديرها", "error");
            return;
        }

        let csv = "\uFEFFالمنتج,الكمية المباعة,إجمالي الإيرادات,إجمالي التكاليف,صافي الربح\n";
        
        const sanitizeCSV = (str) => { 
            let c = String(str).replace(/"/g, '""').replace(/,/g, " "); 
            if (/^[=@+-]/.test(c)) c = "'" + c; 
            return c; 
        };

        Object.values(stats.products).forEach(p => {
            const productName = sanitizeCSV(p.name || 'منتج غير معروف');
            csv += `"${productName}",${p.count},${p.revenue.toFixed(2)},${p.cost.toFixed(2)},${p.profit.toFixed(2)}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const fileName = `Sales_Report_${this.state.timeRange}_${new Date().toISOString().split('T')[0]}.csv`;
        
        link.setAttribute("href", window.URL.createObjectURL(blob));
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        UIService.showToast(`تم تصدير تقرير المبيعات بنجاح`, "success");
    }
};