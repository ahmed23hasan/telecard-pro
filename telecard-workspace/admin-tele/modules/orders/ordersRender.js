// ============================================================================
// 📦 محرك رسم الطلبات (modules/orders/ordersRender.js)
// 🎯 الوظيفة: التكفل برسم قوائم الطلبات، الفلترة، والتحميل التدريجي وتصدير الإكسل
// 🚀 التحديث: تأمين الفلترة والفرز وتصدير الإكسل باستخدام المترجم الزمني المركزي
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

export const OrdersRender = {
    ordersLimit: 50,
    tabState: 'all',
    filters: {},

    // استقبال التحديثات من المايسترو
    initListeners: function() {
        EventBus.on('state-update', (newState) => {
            if(newState.filters && newState.filters.orders) this.filters = newState.filters.orders;
        });
        EventBus.on('req-clear-render-filters', () => {
            this.tabState = 'all';
            this.ordersLimit = 50;
        });
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
        
        const f = this.filters || {};
        
        // 🌟 التعديل الجوهري: استخدام النسخ السطحي (Spread Operator) لحماية حالة البيانات
        let data = Array.isArray(AdminData.data.orders) ? [...AdminData.data.orders] : [];

        if(f.search || f.start || f.end) {
            const startD = f.start ? new Date(f.start).setHours(0,0,0,0) : null;
            const endD = f.end ? new Date(f.end).setHours(23,59,59,999) : null;
            data = data.filter(o => {
                let mS = true, mD = true;
                if(f.search) {
                    const s = String(f.search).toLowerCase();
                    // 🌟 التحديث الذكي: جلب العميل لمطابقة البحث مع الرقم القصير (displayId)
                    const userRec = (AdminData.data.users || []).find(u => String(u.id) === String(o.userId));
                    const dId = userRec && userRec.displayId ? String(userRec.displayId).toLowerCase() : '';
                    
                    mS = String(o.id).includes(s) || 
                         (o.product && String(o.product).toLowerCase().includes(s)) || 
                         (o.userName && String(o.userName).toLowerCase().includes(s)) ||
                         dId.includes(s); // 👈 إضافة البحث بالرقم القصير
                }
                
                // 🌟 استخدام المترجم الزمني المركزي لحماية المقارنة
                const itemTime = RenderHelpers.parseTime(o.time || o.createdAt);
                if(startD && itemTime < startD) mD = false;
                if(endD && itemTime > endD) mD = false;
                
                return mS && mD;
            });
        }

        if (!isAppend) {
            const counts = { all: data.length, pending: 0, completed: 0, rejected: 0, refunded: 0 };
            data.forEach(o => { 
                let st = o.status || 'pending'; 
                if(counts[st] !== undefined) counts[st]++; 
                else if (st === 'processing') counts.pending++; 
            });
            ['all', 'pending', 'completed', 'rejected', 'refunded'].forEach(st => {
                const el = document.getElementById(`count-ord-${st}`);
                if(el) { el.innerText = Utils.enNum(counts[st]); el.setAttribute('lang', 'en'); }
            });
        }

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
            
            // 🌟 استخدام المترجم الزمني لضمان فرز دقيق وخالٍ من الأخطاء
            const timeA = RenderHelpers.parseTime(a.time || a.createdAt);
            const timeB = RenderHelpers.parseTime(b.time || b.createdAt);
            return timeB - timeA;
        });

        if(!data.length) { 
            if(!isAppend) list.innerHTML = AdminTemplates.emptyOrders(); 
            return; 
        }

        const totalFiltered = data.length;
        const paginatedOrders = isAppend ? data.slice(this.ordersLimit - 50, this.ordersLimit) : data.slice(0, this.ordersLimit);

        let newHtml = paginatedOrders.map(o => {
            const userRec = (AdminData.data.users || []).find(u => String(u.id) === String(o.userId));
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
            return AdminTemplates.orderCard(orderWithDualPrice, userName, cleanInput(o.input));
        }).join('');

        const loadMoreHtml = (totalFiltered > this.ordersLimit) ? `
            <div class="load-more-container mt-15 mb-15 w-100 text-center" id="load-more-orders-btn">
                <button class="btn btn-ghost btn-load-more" data-action="load-more-orders">
                    <i class="fa-solid fa-angle-down"></i> عرض المزيد (${totalFiltered - this.ordersLimit} متبقية)
                </button>
            </div>` : '';

        if (isAppend) {
            const oldBtn = document.getElementById('load-more-orders-btn');
            if (oldBtn) oldBtn.remove();
            list.insertAdjacentHTML('beforeend', newHtml + loadMoreHtml);
        } else {
            list.innerHTML = newHtml + loadMoreHtml;
        }
    },

    exportToExcel: function() {
        const dataToExport = AdminData.data.orders || [];
        if (dataToExport.length === 0) { 
            EventBus.emit('req-show-toast', { message: "لا توجد طلبات لتصديرها", type: "error" }); return; 
        }

        // 🌟 التحديث: إضافة عمود "المعرف القصير" ليكون التقرير احترافياً
        let csvContent = "\uFEFFرقم الطلب,التاريخ,اسم العميل,المعرف القصير,المنتج,الكمية,السعر الاجمالي($),التكلفة($),الربح($),المصدر,الحالة\n";
        
        dataToExport.forEach(o => {
            // 🌟 استخدام المنسق الزمني المركزي للتقرير
            const dateStr = RenderHelpers.formatSafeDate(o.time || o.createdAt);
            const sanitizeCSV = (str) => { let c = String(str).replace(/,/g, " "); if (/^[=@+-]/.test(c)) c = "'" + c; return c; };

            // 🌟 التحديث: جلب بيانات العميل لاستخراج الرقم القصير والاسم
            const userRec = (AdminData.data.users || []).find(u => String(u.id) === String(o.userId));
            const displayId = userRec && userRec.displayId ? userRec.displayId : 'غير متوفر';
            const customerName = sanitizeCSV(userRec ? (userRec.name || o.userName) : (o.userName || o.userId));

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
            
            const source = (o.isApi || o.source === 'api') ? 'API' : 'يدوي';
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
