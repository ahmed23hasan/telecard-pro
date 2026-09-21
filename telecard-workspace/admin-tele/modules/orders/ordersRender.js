// ============================================================================
// 📦 محرك رسم الطلبات (modules/orders/ordersRender.js) - Cloud-Native V17.8 💎
// 🚀 التحديثات المعمارية (V17.8 - Export & Pagination Fix):
// 1. Infinite Loop Shield 🛡️: إيقاف زر جلب المزيد بشكل قطعي إذا أرجع السيرفر (null).
// 2. Accounting Export Fix 🗄️: تصفير الربح والتكلفة للطلبات المرفوضة/المسترجعة في ملف الإكسل.
// 3. Cloud Export Integration ☁️: تصدير الإكسل يسحب البيانات من الدالة السحابية مباشرة.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { OrdersTemplates } from './ordersTemplates.js'; 
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const OrdersRender = {
    ordersLimit: 50,
    tabState: 'all',
    sourceState: 'all', 
    filters: {},
    _currentFilteredData: [], 

    initListeners: function() {
        EventBus.on('state-update', (newState) => {
            if(newState.filters && newState.filters.orders) this.filters = newState.filters.orders;
        });
        EventBus.on('req-clear-render-filters', () => {
            this.tabState = 'all';
            this.sourceState = 'all'; 
            this.ordersLimit = 50;
        });
    },

    filterBySource: function(sourceVal) {
        this.sourceState = sourceVal;
        this.ordersLimit = 50; 
        this.renderOrders(); 
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

    loadMoreOrders: async function() {
        const btn = document.querySelector('.btn-load-more');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحميل من السحابة...';
            btn.disabled = true;
        }

        try {
            const res = await FirebaseAdapter.fetchMoreWithCursor(
                'telecard_orders', [], 'time', AdminData.cursors.orders, 50
            );

            if (res && res.data && res.data.length > 0) {
                AdminData.data.orders = [...AdminData.data.orders, ...res.data];
                res.data.forEach(o => { AdminData.data.ordersMap[String(o.id)] = o; });
                
                // 🛡️ [إصلاح التكرار اللانهائي]: تحديث المؤشر فقط إذا كان هناك المزيد
                AdminData.cursors.orders = res.newLastDoc || null;
                this.ordersLimit += 50;
                this.renderOrders(); 
                
                if (!res.newLastDoc && btn) {
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> لا توجد طلبات أقدم';
                    btn.classList.add('disabled', 'text-muted');
                    btn.disabled = true;
                }
            } else {
                // 🛡️ إغلاق الزر نهائياً إذا لم يرجع السيرفر أي بيانات
                AdminData.cursors.orders = null;
                if (btn) {
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> لا توجد طلبات أقدم';
                    btn.classList.add('disabled', 'text-muted');
                    btn.disabled = true;
                }
            }
        } catch (error) {
            console.error("🚨 فشل جلب المزيد من الطلبات السحابية:", error);
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> حاول مجدداً';
                btn.disabled = false;
            }
        }
    },

    renderOrders: function() {
        const list = document.getElementById('orders-container'); 
        if(!list) return;
        
        const f = this.filters || {};
        let currentSnapshotData = Array.isArray(AdminData.data.orders) ? AdminData.data.orders : [];
        let accumulatedData = Array.isArray(this._currentFilteredData) ? this._currentFilteredData : [];
        
        const combinedMap = new Map();
        accumulatedData.forEach(o => combinedMap.set(o.id, o));
        currentSnapshotData.forEach(o => combinedMap.set(o.id, o)); 
        
        let data = Array.from(combinedMap.values());

        if(f.search || f.start || f.end) {
            const startD = f.start ? Number(f.start) : null;
            const endD = f.end ? Number(f.end) + 86399999 : null; 

            data = data.filter(o => {
                let mS = true, mD = true;
                if(f.search) {
                    const s = String(f.search).toLowerCase();
                    const userRec = AdminData.data.usersMap?.[o.userId] || {};
                    const dId = userRec.displayId ? String(userRec.displayId).toLowerCase() : String(o.userId).toLowerCase();
                    const savedName = o.userDataSnapshot?.fullName || o.userName || '';
                    
                    mS = String(o.id).includes(s) || 
                         (o.product && String(o.product).toLowerCase().includes(s)) || 
                         savedName.toLowerCase().includes(s) ||
                         dId.includes(s); 
                }
                
                const itemTime = RenderHelpers.parseTime(o.time || o.createdAt);
                if(startD && itemTime < startD) mD = false;
                if(endD && itemTime > endD) mD = false;
                
                return mS && mD;
            });
        }

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
        const paginatedOrders = data.slice(0, this.ordersLimit);

        let newHtml = paginatedOrders.map(o => {
            const userRec = AdminData.data.usersMap?.[o.userId];
            const userName = o.userDataSnapshot?.fullName || o.userName || (userRec ? RenderHelpers._getTxName(userRec) : 'مستخدم جديد');
            
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

        const hasMoreInCloud = AdminData.cursors.orders !== null && AdminData.cursors.orders !== undefined;
        const hasMoreInLocal = this._currentFilteredData.length > this.ordersLimit;

        const loadMoreHtml = (hasMoreInCloud || hasMoreInLocal) ? `
            <div class="load-more-container mt-15 mb-15 w-100 text-center" id="load-more-orders-btn">
                <button class="btn btn-ghost btn-load-more" data-action="load-more-orders">
                    <i class="fa-solid fa-angle-down"></i> جلب المزيد من الطلبات ☁️
                </button>
            </div>` : '';

        const sourceFiltersHtml = OrdersTemplates.ordersSourceFilters(this.sourceState || 'all');

        if(!data.length && !hasMoreInCloud) { 
            list.innerHTML = sourceFiltersHtml + OrdersTemplates.emptyOrders(); 
        } else {
            list.innerHTML = sourceFiltersHtml + newHtml + loadMoreHtml;
        }
    },

    // 🚀 [التحديث المعماري]: دالة تصدير مرتبطة بالسيرفر لجلب وتصدير آلاف الطلبات متجاوزة قيود Pagination
    exportToExcel: async function() {
        const btn = document.querySelector('[data-action="export-excel"][data-type="orders"]');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري استخراج البيانات...';
            btn.disabled = true;
        }

        try {
            // سحب البيانات من السيرفر مباشرة لتجاهل قيود الـ Pagination المحلية
            const payload = {
                limit: 5000, 
                status: this.tabState !== 'all' ? this.tabState : null,
                startDateMs: this.filters.start || null,
                endDateMs: this.filters.end || null
            };

            const response = await FirebaseAdapter.callFunction('adminGetOrdersList', payload);
            
            if (!response || !response.success || !response.data || response.data.length === 0) {
                EventBus.emit('req-show-toast', { message: "لا توجد طلبات لتصديرها وفقاً للفلتر الحالي.", type: "warning" });
                return;
            }

            const dataToExport = response.data;
            let csvContent = "\uFEFFرقم الطلب,التاريخ,اسم العميل,المعرف القصير,المنتج,الكمية,السعر الاجمالي($),التكلفة($),الربح($),المصدر,الحالة\n";
            
            dataToExport.forEach(o => {
                const dateStr = RenderHelpers.formatSafeDate(o.time || o.createdAt);
                const sanitizeCSV = (str) => { let c = String(str).replace(/,/g, " "); if (/^[=@+-]/.test(c)) c = "'" + c; return c; };

                const userRec = AdminData.data.usersMap?.[o.userId] || { id: o.userId };
                const displayId = RenderHelpers.formatUserId(userRec);
                
                const customerName = sanitizeCSV(o.userDataSnapshot?.fullName || o.userName || userRec.fullName || userRec.name || o.userId);
                const product = sanitizeCSV(o.product || 'منتج غير معروف');
                const qty = Number(o.qty || 1);
                
                let totalCost = 0, exactPrice = Number(o.baseUsd || o.price || 0), profit = 0;
                
                if (o.pricingSnapshot) {
                    totalCost = Number(o.pricingSnapshot.costUsd || o.pricingSnapshot.cost || 0);
                    exactPrice = Number(o.pricingSnapshot.finalPriceUsd || o.pricingSnapshot.finalPrice || exactPrice);
                    // في الإكسل نصدر الربح الخام للمحاسبة بغض النظر عن الحالة
                    profit = Number(o.pricingSnapshot.netProfitUsd || o.pricingSnapshot.profit || 0); 
                } else {
                    totalCost = Number(o.costPrice || o.unitCost || 0) * qty;
                    profit = exactPrice - totalCost;
                }

                // 🚀 [التصحيح المحاسبي]: تصفير الربح والتكلفة للطلبات غير المكتملة لمنع تشوه الإحصائيات المالية
                if (o.status !== 'completed') {
                    profit = 0;
                    totalCost = 0;
                }
                
                let source = 'يدوي';
                if (o.isApi || o.source === 'api') source = 'API';
                else if (o.deliveredCode && o.deliveredCode.length > 0) source = 'تسليم آلي';

                const status = o.status === 'completed' ? 'مكتمل' : (o.status === 'rejected' ? 'مرفوض' : (o.status === 'refunded' ? 'مسترجع' : o.status));

                csvContent += `${o.id},${dateStr},${customerName},${displayId},${product},${qty},${exactPrice.toFixed(2)},${totalCost.toFixed(2)},${profit.toFixed(2)},${source},${status}\n`;
            });
            
            const filename = `Sales_Orders_Report_${new Date().toISOString().split('T')[0]}.csv`;
            this._downloadBlob(csvContent, filename);

        } catch (error) {
            console.error("Export Error:", error);
            EventBus.emit('req-show-toast', { message: "فشل استخراج تقرير الطلبات من السيرفر.", type: "error" });
        } finally {
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-file-excel"></i> تصدير Excel';
                btn.disabled = false;
            }
        }
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