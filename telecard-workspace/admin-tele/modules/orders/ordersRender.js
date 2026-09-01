// ============================================================================
// 📦 محرك رسم الطلبات (modules/orders/ordersRender.js) - النسخة الماسية V15.0 💎
// 🚀 التحديث الأقصى: 
// 1. Intersection Filtering: دمج فلتر المصدر (API/يدوي) مع حالة الطلب بسلاسة تامة.
// 2. DOM Injection: حقن أزرار الفلترة برمجياً أعلى قائمة الطلبات.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { OrdersTemplates } from './ordersTemplates.js'; // 🛡️ استيراد القالب الصحيح المحدث

export const OrdersRender = {
    ordersLimit: 50,
    tabState: 'all',
    sourceState: 'all', // 🌟 متغير جديد لتتبع حالة فلتر المصدر
    filters: {},
    _currentFilteredData: [], 

    initListeners: function() {
        EventBus.on('state-update', (newState) => {
            if(newState.filters && newState.filters.orders) this.filters = newState.filters.orders;
        });
        EventBus.on('req-clear-render-filters', () => {
            this.tabState = 'all';
            this.sourceState = 'all'; // 🌟 تصفير فلتر المصدر
            this.ordersLimit = 50;
        });
    },

    // 🚀 [دالة الفلترة الجديدة للمصادر]
    filterBySource: function(sourceVal) {
        this.sourceState = sourceVal;
        this.ordersLimit = 50; 
        this.renderOrders(); // إعادة الرسم بالتقاطع الجديد
    },

    filterByTab: function(status, btnElement) {
        this.tabState = status;
        this.ordersLimit = 50;
        const container = document.getElementById('tabs-orders');
        if(container) {
            container.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
            if(btnElement) btnElement.classList.add('active');
        }
        this.renderOrders();
    },

    loadMoreOrders: function() {
        this.ordersLimit += 50;
        this.renderOrders(true);
    },

    renderOrders: function(isAppend = false) {
        const list = document.getElementById('orders-container'); 
        if(!list) return;
        
        let data = [];

        if (isAppend) {
            data = this._currentFilteredData || [];
        } else {
            const f = this.filters || {};
            data = Array.isArray(AdminData.data.orders) ? [...AdminData.data.orders] : [];

            // 1. فلترة البحث والتاريخ (الأساس)
            if(f.search || f.start || f.end) {
                const startD = f.start ? Number(f.start) : null;
                const endD = f.end ? Number(f.end) + 86399999 : null; 

                data = data.filter(o => {
                    let mS = true, mD = true;
                    if(f.search) {
                        const s = String(f.search).toLowerCase();
                        const userRec = AdminData.data.usersMap?.[o.userId] || (AdminData.data.users || []).find(u => String(u.id) === String(o.userId));
                        const dId = userRec && userRec.displayId ? String(userRec.displayId).toLowerCase() : '';
                        
                        mS = String(o.id).includes(s) || 
                             (o.product && String(o.product).toLowerCase().includes(s)) || 
                             (o.userName && String(o.userName).toLowerCase().includes(s)) ||
                             dId.includes(s); 
                    }
                    
                    const itemTime = RenderHelpers.parseTime(o.time || o.createdAt);
                    if(startD && itemTime < startD) mD = false;
                    if(endD && itemTime > endD) mD = false;
                    
                    return mS && mD;
                });
            }

            // 2. 🤖⚡🤚 فلترة المصدر (The Intersection Magic)
            if (this.sourceState && this.sourceState !== 'all') {
                data = data.filter(o => {
                    const isApi = (o.isApi === true || o.source === 'api');
                    const isAuto = (!isApi && o.deliveredCode && o.deliveredCode.length > 0);
                    const isManual = (!isApi && !isAuto);

                    if (this.sourceState === 'api') return isApi;
                    if (this.sourceState === 'auto') return isAuto;
                    if (this.sourceState === 'manual') return isManual;
                    return true;
                });
            }

            // 3. تحديث العدادات العلوية (بناءً على الفلترة السابقة)
            const counts = { all: data.length, pending: 0, completed: 0, rejected: 0, refunded: 0 };
            
            data.forEach(o => { 
                let st = o.status || 'pending'; 
                if (st === 'pending' || st === 'processing') { 
                    counts.pending++; 
                } else if (counts[st] !== undefined) { 
                    counts[st]++; 
                } 
            });

            ['all', 'pending', 'completed', 'rejected', 'refunded'].forEach(st => {
                const el = document.getElementById(`count-ord-${st}`);
                if(el) { el.innerText = Utils.enNum(counts[st]); el.setAttribute('lang', 'en'); }
            });

            // 4. فلترة حالة الطلب (تبويبات مكتمل، معلق)
            const currentTab = this.tabState || 'all';
            if(currentTab !== 'all') {
                data = data.filter(o => {
                    const s = o.status || 'pending';
                    if (currentTab === 'pending') return s === 'pending' || s === 'processing';
                    return s === currentTab;
                });
            }

            data.sort((a, b) => {
                const isA_ActionNeeded = (a.status === 'pending' || a.status === 'processing') ? 1 : 0;
                const isB_ActionNeeded = (b.status === 'pending' || b.status === 'processing') ? 1 : 0;
                if (isA_ActionNeeded !== isB_ActionNeeded) return isB_ActionNeeded - isA_ActionNeeded; 
                
                const timeA = RenderHelpers.parseTime(a.time || a.createdAt);
                const timeB = RenderHelpers.parseTime(b.time || b.createdAt);
                return timeB - timeA;
            });

            this._currentFilteredData = data;
        }

        const totalFiltered = data.length;
        const paginatedOrders = isAppend ? data.slice(this.ordersLimit - 50, this.ordersLimit) : data.slice(0, this.ordersLimit);

        let newHtml = paginatedOrders.map(o => {
            const userRec = AdminData.data.usersMap?.[o.userId] || (AdminData.data.users || []).find(u => String(u.id) === String(o.userId));
            const userName = userRec ? RenderHelpers._getTxName(userRec) : (o.userName || 'مستخدم جديد');
            
            const cleanInput = (str) => { 
                if(!str || str.trim() === '') return null;
                if(str.includes('|')) return str.split('|').map(s => s.split(':').pop().trim()).join(' | '); 
                if(str.includes(':')) return str.split(':').pop().trim(); 
                return str.trim(); 
            };
            
            let exactPriceUsd = 0;
            let localPrice = Number(o.price || 0);
            const curr = Utils.escapeHTML((o.priceCurrency || 'USD').toUpperCase());

            if (o.pricingSnapshot) {
                exactPriceUsd = Number(o.pricingSnapshot.finalPriceUsd || o.pricingSnapshot.finalPrice || 0);
            } else { exactPriceUsd = Number(o.baseUsd || o.price || 0); }

            let dualPriceHtml = (curr !== 'USD') 
                ? `${RenderHelpers.formatMoney(exactPriceUsd, 'USD', 2)} <span class="dual-price-sub">(${RenderHelpers.formatMoney(localPrice, curr, 2)})</span>`
                : `${RenderHelpers.formatMoney(exactPriceUsd, 'USD', 2)}`;

            const orderWithDualPrice = { ...o, dualPriceTxt: dualPriceHtml };
            return OrdersTemplates.orderCard(orderWithDualPrice, userName, cleanInput(o.input));
        }).join('');

        const loadMoreHtml = (totalFiltered > this.ordersLimit) ? `
            <div class="load-more-container mt-15 mb-15 w-100 text-center" id="load-more-orders-btn">
                <button class="btn btn-ghost btn-load-more" data-action="load-more-orders">
                    <i class="fa-solid fa-angle-down"></i> عرض المزيد (${totalFiltered - this.ordersLimit} متبقية)
                </button>
            </div>` : '';

        // 🌟 إنشاء شريط أزرار الفلترة للمصادر ليتم حقنه دائماً
        const sourceFiltersHtml = !isAppend ? OrdersTemplates.ordersSourceFilters(this.sourceState || 'all') : '';

        if (isAppend) {
            const oldBtn = document.getElementById('load-more-orders-btn');
            if (oldBtn) oldBtn.remove();
            list.insertAdjacentHTML('beforeend', newHtml + loadMoreHtml);
        } else {
            if(!data.length) { 
                list.innerHTML = sourceFiltersHtml + OrdersTemplates.emptyOrders(); 
            } else {
                list.innerHTML = sourceFiltersHtml + newHtml + loadMoreHtml;
            }
        }
    },

    exportToExcel: function() {
        const dataToExport = this._currentFilteredData || [];
        if (dataToExport.length === 0) { 
            EventBus.emit('req-show-toast', { message: "لا توجد طلبات تطابق الفلتر لتصديرها", type: "error" }); return; 
        }

        let csvContent = "\uFEFFرقم الطلب,التاريخ,اسم العميل,المعرف القصير,المنتج,الكمية,السعر الاجمالي($),التكلفة($),الربح($),المصدر,الحالة\n";
        
        dataToExport.forEach(o => {
            const dateStr = RenderHelpers.formatSafeDate(o.time || o.createdAt);
            const sanitizeCSV = (str) => { let c = String(str).replace(/,/g, " "); if (/^[=@+-]/.test(c)) c = "'" + c; return c; };

            const userRec = AdminData.data.usersMap?.[o.userId] || (AdminData.data.users || []).find(u => String(u.id) === String(o.userId));
            const displayId = RenderHelpers.formatUserId(userRec);
            const customerName = sanitizeCSV(userRec ? (userRec.fullName || userRec.name || o.userName) : (o.userName || o.userId));
            const product = sanitizeCSV(o.product || 'منتج غير معروف');
            const qty = Number(o.qty || 1);
            
            let totalCost = 0, exactPrice = Number(o.baseUsd || o.price || 0), profit = 0;
            if (o.pricingSnapshot) {
                totalCost = Number(o.pricingSnapshot.costUsd || o.pricingSnapshot.cost || 0);
                exactPrice = Number(o.pricingSnapshot.finalPriceUsd || o.pricingSnapshot.finalPrice || exactPrice);
                profit = (o.status === 'completed') ? Number(o.pricingSnapshot.netProfitUsd || o.pricingSnapshot.profit || 0) : 0;
            } else {
                totalCost = Number(o.costPrice || o.unitCost || 0) * qty;
                profit = (o.status === 'completed') ? (exactPrice - totalCost) : 0;
            }
            
            // 🤖 [تصدير المصدر بدقة للإكسل لتوافق الفلاتر الجديدة]
            let source = 'يدوي';
            if (o.isApi || o.source === 'api') source = 'API';
            else if (o.deliveredCode && o.deliveredCode.length > 0) source = 'تسليم آلي';

            const status = o.status === 'completed' ? 'مكتمل' : (o.status === 'rejected' ? 'مرفوض' : (o.status === 'refunded' ? 'مسترجع' : o.status));

            csvContent += `${o.id},${dateStr},${customerName},${displayId},${product},${qty},${exactPrice.toFixed(2)},${totalCost.toFixed(2)},${profit.toFixed(2)},${source},${status}\n`;
        });
        
        const filename = `Sales_Orders_Report_${new Date().toISOString().split('T')[0]}.csv`;
        this._downloadBlob(csvContent, filename);
    },

    _downloadBlob: function(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = window.URL.createObjectURL(blob);
        link.setAttribute("href", url); link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link); link.click(); document.body.removeChild(link); window.URL.revokeObjectURL(url);
        EventBus.emit('req-show-toast', { message: "تم تحميل التقرير بنجاح", type: "success" });
    }
};
