// ============================================================================
// 📦 محرك رسم الطلبات (modules/orders/ordersRender.js) - النسخة الماسية V16.3 💎
// 🎯 الوظيفة: عرض الطلبات، الفلترة الهجينة (محلي + سحابي 360°)، حفظ عدادات التبويبات.
// 🚀 التحديثات المعمارية (V16.3 - Zero Read Bleed & Active Badge Sync):
// 1. Zero-Read Source Filter ⚡: الفلترة بين (الكل/API/يدوي/آلي) تتم الآن محلياً بـ 0 قراءات سحابية طالما الطلبات في الذاكرة.
// 2. Double-Trigger Shield 🛡️: إحباط المؤقت التلقائي عند استدعاء السيرفر يدوياً لمنع تكرار القراءة لنفس البحث.
// 3. Active Badge Sync 🔴: مزامنة شارة القائمة الجانبية (badge-ord) مع عداد الطلبات المعلقة محلياً بشكل لحظي.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { AdminTemplates } from '../../adminTemplates.js'; 
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';
import { UIService } from '../../core/uiService.js'; 

export const OrdersRender = {
    ordersLimit: 50,
    tabState: 'all',
    sourceState: 'all', 
    filters: {},
    _currentFilteredData: [], 
    _tabCountsCache: { all: 0, pending: 0, completed: 0, rejected: 0, refunded: 0 },
    _lastCloudQuerySig: '||',
    _cloudSearchTimer: null,
    _isFetchingCloud: false,

    _listenersBound: false,
    initListeners: function() {
        if (this._listenersBound) return;
        this._listenersBound = true;
        
        EventBus.on('state-update', (newState) => {
            if (newState.filters && newState.filters.orders) {
                this.filters = { ...newState.filters.orders };
                this._checkAndScheduleCloudReload();
            }
        });
        EventBus.on('req-clear-render-filters', () => {
            this.tabState = 'all';
            this.sourceState = 'all';
            this.ordersLimit = 50;
            this.filters = {};
            this._lastCloudQuerySig = '||';
        });
    },

    _getCloudQuerySignature: function() {
        const f = this.filters || {};
        return `${String(f.search || '').trim()}|${f.start || ''}|${f.end || ''}`;
    },

    _checkAndScheduleCloudReload: function() {
    const f = this.filters || {};
    const searchStr = String(f.search || '').trim();
    const prevParts = (this._lastCloudQuerySig || '||').split('|');
    const datesChanged = (String(prevParts[1] || '') !== String(f.start || '')) || (String(prevParts[2] || '') !== String(f.end || ''));
    
    if (!datesChanged && searchStr.length > 0 && searchStr.length < 2) {
        return;
    }
    
    if (!datesChanged && searchStr === '' && prevParts[0] !== '') {
        this._lastCloudQuerySig = this._getCloudQuerySignature();
        this.renderOrders();
        return;
    }
    
    if (!datesChanged && /^(#?ORD-|#?TC-)/i.test(searchStr)) {
        const cleanId = searchStr.replace(/^(#|ORD-)\s*/i, '').trim().toUpperCase();
        const tcId = cleanId.startsWith('TC-') ? cleanId : `TC-${cleanId}`;
        if (AdminData.data?.ordersMap?.[cleanId] || AdminData.data?.ordersMap?.[tcId]) {
            this._lastCloudQuerySig = this._getCloudQuerySignature();
            return;
        }
    }
    
    const newSig = this._getCloudQuerySignature();
    if (newSig === this._lastCloudQuerySig) return;
    
    if (this._cloudSearchTimer) clearTimeout(this._cloudSearchTimer);
    this._cloudSearchTimer = setTimeout(() => {
        this.triggerCloudFilterReload();
    }, 400);
},
    triggerCloudFilterReload: function() {
        if (this._cloudSearchTimer) {
            clearTimeout(this._cloudSearchTimer);
            this._cloudSearchTimer = null;
        }
        
        const prevParts = (this._lastCloudQuerySig || '||').split('|');
        const newSig = this._getCloudQuerySignature();
        const newParts = newSig.split('|');
        this._lastCloudQuerySig = newSig;

        const datesChanged = (prevParts[1] !== newParts[1]) || (prevParts[2] !== newParts[2]);
        const searchCleared = (prevParts[0] !== '' && newParts[0] === '');

        this.ordersLimit = 50;
        AdminData.cursors.orders = null;

        if (datesChanged || searchCleared) {
            AdminData.data.orders = [];
            this._currentFilteredData = [];
        }
        this.loadMoreOrders();
    },

    adjustTabCountersOnStatusChange: function(oldStatus, newStatus) {
        const normalizeSt = (st) => {
            if (st === 'pending' || st === 'processing') return 'pending';
            if (st === 'refunded' || st === 'returned') return 'refunded';
            return st;
        };
        const fromKey = normalizeSt(oldStatus);
        const toKey = normalizeSt(newStatus);
        if (fromKey === toKey) return;

        if (this._tabCountsCache[fromKey] !== undefined && this._tabCountsCache[fromKey] > 0) {
            this._tabCountsCache[fromKey]--;
        }
        if (this._tabCountsCache[toKey] !== undefined) {
            this._tabCountsCache[toKey]++;
        }
    },

    filterBySource: function(sourceVal) {
        this.sourceState = sourceVal;
        this.ordersLimit = 50;
        this._currentFilteredData = [];
        
        // ⚡ فلترة محلية فورية بـ 0 قراءات سحابية إذا كانت الطلبات محملة بالفعل في الذاكرة
        if (Array.isArray(AdminData.data.orders) && AdminData.data.orders.length > 0) {
            this.renderOrders();
        } else {
            const list = document.getElementById('orders-container');
            if (list) list.innerHTML = '<div class="text-center p-20"><i class="fa-solid fa-circle-notch fa-spin"></i> جاري جلب الطلبات...</div>';
            this.loadMoreOrders();
        }
    },

    filterByTab: function(status, btnElement) {
        this.tabState = status;
        this.ordersLimit = 50;
        AdminData.cursors.orders = null; 
        AdminData.data.orders = [];
        this._currentFilteredData = []; 

        const container = document.getElementById('tabs-orders');
        if(container) {
            container.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
            if(btnElement) btnElement.classList.add('active');
        }
        
        const list = document.getElementById('orders-container');
        if (list) list.innerHTML = '<div class="text-center p-20"><i class="fa-solid fa-circle-notch fa-spin"></i> جاري جلب الطلبات...</div>';
        this.loadMoreOrders();
    },

    loadMoreOrders: async function() {
        if (this._isFetchingCloud) return;
        this._isFetchingCloud = true;

        const btn = document.querySelector('.btn-load-more');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحميل من السحابة...';
            btn.disabled = true;
        }
        
        try {
            this._lastCloudQuerySig = this._getCloudQuerySignature();
            const activeSearchTerm = this.filters.search ? String(this.filters.search).trim() : null;
            const payload = {
                limit: this.tabState === 'pending' ? 200 : 50,
                status: (this.tabState && this.tabState !== 'all') ? this.tabState : null,
                startDateMs: this.filters.start || null,
                endDateMs: this.filters.end || null,
                searchQuery: activeSearchTerm,
                lastTimeMs: AdminData.cursors.orders?.lastTimeMs || null,
                lastDocId: AdminData.cursors.orders?.lastDocId || null
            };
            
            const res = await FirebaseAdapter.callFunction('adminGetOrdersList', payload);
            
            if (res && res.success && res.data && res.data.length > 0) {
                const currentOrdersMap = new Map((AdminData.data.orders || []).map(o => [o.id, o]));
                if (!AdminData.data.ordersMap) AdminData.data.ordersMap = {};
                res.data.forEach(o => {
                    if (activeSearchTerm) {
                        o._matchedCloudSearch = activeSearchTerm.toLowerCase();
                    }
                    currentOrdersMap.set(o.id, o);
                    AdminData.data.ordersMap[String(o.id)] = o;
                });
                
                AdminData.data.orders = Array.from(currentOrdersMap.values());
                
                if (res.pagination && res.pagination.hasMore) {
                    AdminData.cursors.orders = res.pagination;
                } else {
                    AdminData.cursors.orders = null;
                    if (btn) {
                        btn.innerHTML = '<i class="fa-solid fa-check"></i> لا توجد طلبات أقدم';
                        btn.classList.add('disabled', 'text-muted');
                        btn.disabled = true;
                    }
                }
                
                this.ordersLimit += 50;
                this.renderOrders();
            } else {
                AdminData.cursors.orders = null;
                if (btn) {
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> لا توجد طلبات مطابقة';
                    btn.classList.add('disabled', 'text-muted');
                    btn.disabled = true;
                }
                this.renderOrders();
            }
        } catch (error) {
            console.error("🚨 فشل جلب المزيد من الطلبات السحابية:", error);
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> حاول مجدداً';
            }
        } finally {
            this._isFetchingCloud = false;
            if (btn && AdminData.cursors.orders) btn.disabled = false;
        }
    },

    renderOrders: function() {
        const list = document.getElementById('orders-container'); 
        if(!list) return;
        
        this._checkAndScheduleCloudReload();

        const f = this.filters || {};
        let currentSnapshotData = Array.isArray(AdminData.data.orders) ? AdminData.data.orders : [];
        let accumulatedData = Array.isArray(this._currentFilteredData) ? this._currentFilteredData : [];
        
        const combinedMap = new Map();
        accumulatedData.forEach(o => {
            if (currentSnapshotData.some(live => live.id === o.id)) {
                combinedMap.set(o.id, o);
            }
        });
        currentSnapshotData.forEach(o => combinedMap.set(o.id, o));   
        
        let data = Array.from(combinedMap.values());

        if(f.search) {
            const rawSearch = String(f.search).trim().toLowerCase();
            const s = rawSearch.replace(/^(#|ord-|usr-|id:?)\s*/i, '').trim();
            if (s) {
                data = data.filter(o => {
                    if (o._matchedCloudSearch === rawSearch) return true;

                    const userRec = AdminData.data.usersMap?.[o.userId] || {};
                    const idLower = String(o.id || '').toLowerCase();
                    const dispIdLower = String(o.displayId || '').toLowerCase();
                    const uIdLower = String(o.userId || '').toLowerCase();
                    const uDispLower = String(userRec.displayId || o.userDataSnapshot?.displayId || String(o.userId || '').substring(0, 8)).toLowerCase();
                    const prodLower = String(o.product || '').toLowerCase();
                    const savedNameLower = String(o.userDataSnapshot?.fullName || o.userName || userRec.fullName || '').toLowerCase();
                    const usernameLower = String(userRec.username || '').toLowerCase();
                    const emailLower = String(o.userDataSnapshot?.email || userRec.email || '').toLowerCase();
                    const phoneLower = String(o.userDataSnapshot?.phone || userRec.phone || '').toLowerCase();
                    const inputLower = String(o.input || '').toLowerCase();
                    const extOrderLower = String(o.externalOrderId || '').toLowerCase();

                    return idLower.includes(s) ||
                           dispIdLower.includes(s) ||
                           uIdLower.includes(s) ||
                           uDispLower.includes(s) ||
                           prodLower.includes(s) ||
                           savedNameLower.includes(s) ||
                           usernameLower.includes(s.replace(/^@/, '')) ||
                           emailLower.includes(s) ||
                           phoneLower.includes(s) ||
                           inputLower.includes(s) ||
                           extOrderLower.includes(s);
                });
            }
        }

        if (f.start || f.end) {
            const startMs = f.start ? Number(f.start) : null;
            const rawEnd = f.end ? Number(f.end) : null;
            const endMs = rawEnd ? ((rawEnd % 86400000 === 0) ? (rawEnd + 86399999) : rawEnd) : null;
            data = data.filter(o => {
                const tMs = RenderHelpers.parseTime(o.time || o.createdAt);
                if (startMs && tMs < startMs) return false;
                if (endMs && tMs > endMs) return false;
                return true;
            });
        }

        if (this.sourceState && this.sourceState !== 'all') {
            data = data.filter(o => {
                const isApi = Boolean(o.isApi === true || o.source === 'api');
                const isSupplier = Boolean(o.supplierId);
                const isAuto = (!isApi && Boolean(isSupplier || o.vaultPoolId || o.isAutoDelivered));
                const isManual = (!isApi && !isAuto);

                if (this.sourceState === 'api') return isApi;
                if (this.sourceState === 'auto') return isAuto;
                if (this.sourceState === 'manual') return isManual;
                return true;
            });
        }

        const localCounts = { all: data.length, pending: 0, completed: 0, rejected: 0, refunded: 0 };
        data.forEach(o => { 
            let st = o.status || 'pending'; 
            if (st === 'pending' || st === 'processing') { localCounts.pending++; } 
            else if (st === 'refunded' || st === 'returned') { localCounts.refunded++; }
            else if (localCounts[st] !== undefined) { localCounts[st]++; } 
        });

        const dashOrders = AdminData.data?.dashboardStats?.orders || AdminData.stats?.orders || null;
        const isUnfilteredView = !f.search && !f.start && !f.end && (!this.sourceState || this.sourceState === 'all');
        const currentTab = this.tabState || 'all';

        if (dashOrders && isUnfilteredView) {
            this._tabCountsCache.all = Math.max(Number(dashOrders.total || 0), localCounts.all);
            this._tabCountsCache.pending = currentTab === 'pending' ? localCounts.pending : Number(dashOrders.pending ?? localCounts.pending);
            this._tabCountsCache.completed = Math.max(Number(dashOrders.completed || 0), localCounts.completed);
            this._tabCountsCache.rejected = Math.max(Number(dashOrders.rejected || 0), localCounts.rejected);
            this._tabCountsCache.refunded = Math.max(Number(dashOrders.refunded || 0), localCounts.refunded);
        } else if (isUnfilteredView) {
            if (currentTab === 'all') {
                ['all', 'pending', 'completed', 'rejected', 'refunded'].forEach(st => {
                    this._tabCountsCache[st] = Math.max(this._tabCountsCache[st] || 0, localCounts[st]);
                });
            } else {
                this._tabCountsCache[currentTab] = Math.max(this._tabCountsCache[currentTab] || 0, localCounts[currentTab]);
                const sumTabs = (this._tabCountsCache.pending || 0) + (this._tabCountsCache.completed || 0) + (this._tabCountsCache.rejected || 0) + (this._tabCountsCache.refunded || 0);
                this._tabCountsCache.all = Math.max(this._tabCountsCache.all || 0, sumTabs);
            }
        }

        const displayCounts = isUnfilteredView ? this._tabCountsCache : localCounts;
        ['all', 'pending', 'completed', 'rejected', 'refunded'].forEach(st => {
            const el = document.getElementById(`count-ord-${st}`);
            if(el) { el.innerText = Utils.enNum(displayCounts[st] || 0); el.setAttribute('lang', 'en'); }
        });

        // 🚀 الإصلاح: ربط الشارة الجانبية (Badge) بعداد الطلبات المعلقة محلياً بشكل لحظي
        const sidebarBadge = document.getElementById('badge-ord');
        if (sidebarBadge) {
            const globalPendingCount = this._tabCountsCache.pending || 0;
            if (globalPendingCount > 0) {
                sidebarBadge.innerText = Utils.enNum(globalPendingCount);
                sidebarBadge.classList.add('active');
                sidebarBadge.classList.remove('hide-element');
            } else {
                sidebarBadge.classList.remove('active');
                sidebarBadge.classList.add('hide-element');
            }
        }

        if(currentTab !== 'all') {
            data = data.filter(o => {
                const s = o.status || 'pending';
                if (currentTab === 'pending') return s === 'pending' || s === 'processing';
                if (currentTab === 'refunded') return s === 'refunded' || s === 'returned';
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
            
            const exactPriceUsd = Number(o.priceBaseUsd ?? o.pricingSnapshot?.finalPriceUsd ?? o.pricingSnapshot?.finalPrice ?? 0);
            const localPrice = Number(o.priceLocalDeducted || 0);
            const curr = Utils.escapeHTML((o.priceCurrency || 'USD').toUpperCase());

            let dualPriceHtml = (curr !== 'USD') 
                ? `${RenderHelpers.formatMoney(exactPriceUsd, 'USD', 2)} <span class="dual-price-sub">(${RenderHelpers.formatMoney(localPrice, curr, 2)})</span>`
                : `${RenderHelpers.formatMoney(exactPriceUsd, 'USD', 2)}`;

            const orderWithDualPrice = { ...o, dualPriceTxt: dualPriceHtml };
            return AdminTemplates.orderCard(orderWithDualPrice, userName, cleanInput(o.input));
        }).join('');

        const hasMoreInCloud = AdminData.cursors.orders !== null && AdminData.cursors.orders !== undefined;
        const hasMoreInLocal = this._currentFilteredData.length > this.ordersLimit;

        const loadMoreHtml = (hasMoreInCloud || hasMoreInLocal) ? `
            <div class="load-more-container mt-15 mb-15 w-100 text-center" id="load-more-orders-btn">
                <button class="btn btn-ghost btn-load-more" data-action="load-more-orders">
                    <i class="fa-solid fa-angle-down"></i> جلب المزيد من الطلبات ☁
                </button>
            </div>` : '';

        const sourceFiltersHtml = AdminTemplates.ordersSourceFilters(this.sourceState || 'all');

        if(!data.length && !hasMoreInCloud) { 
            list.innerHTML = sourceFiltersHtml + AdminTemplates.emptyOrders(); 
        } else {
            list.innerHTML = sourceFiltersHtml + newHtml + loadMoreHtml;
        }
    },

    // ... (تكملة دالة التصدير للإكسيل كما هي في نسختك الأصلية)
    exportToExcel: async function() {
        // [كود التصدير يظل كما هو دون تغيير]
        const btn = document.querySelector('[data-action="export-excel"][data-type="orders"]');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري استخراج البيانات (قد يستغرق وقتاً)...';
            btn.disabled = true;
        }

        try {
            let allExportData = [];
            let hasMoreToFetch = true;
            let currentLastTimeMs = null;
            let currentLastDocId = null;

            while (hasMoreToFetch) {
                const payload = {
                    limit: 250, 
                    status: this.tabState !== 'all' ? this.tabState : null,
                    startDateMs: this.filters.start || null,
                    endDateMs: this.filters.end || null,
                    searchQuery: this.filters.search ? String(this.filters.search).trim() : null,
                    lastTimeMs: currentLastTimeMs,
                    lastDocId: currentLastDocId
                };

                const response = await FirebaseAdapter.callFunction('adminGetOrdersList', payload);
                
                if (!response || !response.success || !response.data || response.data.length === 0) {
                    hasMoreToFetch = false;
                    break;
                }

                allExportData = allExportData.concat(response.data);

                if (response.pagination && response.pagination.hasMore) {
                    currentLastTimeMs = response.pagination.lastTimeMs;
                    currentLastDocId = response.pagination.lastDocId;
                    if (btn) btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جُمع ${allExportData.length} طلب...`;
                } else {
                    hasMoreToFetch = false;
                }
            }

            if (this.sourceState && this.sourceState !== 'all') {
                allExportData = allExportData.filter(o => {
                    const isApi = Boolean(o.isApi === true || o.source === 'api');
                    const isSupplier = Boolean(o.supplierId);
                    const isAuto = (!isApi && Boolean(isSupplier || o.vaultPoolId || o.isAutoDelivered || (o.deliveredCode && o.deliveredCode.length > 0)));
                    const isManual = (!isApi && !isAuto);

                    if (this.sourceState === 'api') return isApi;
                    if (this.sourceState === 'auto') return isAuto;
                    if (this.sourceState === 'manual') return isManual;
                    return true;
                });
            }

            if (allExportData.length === 0) {
                UIService?.showToast?.("لا توجد طلبات لتصديرها وفقاً للفلتر الحالي.", "warning");
                return;
            }

            let csvContent = "\uFEFFرقم الطلب,التاريخ,اسم العميل,المعرف القصير,المنتج,الكمية,السعر الاجمالي($),التكلفة($),الربح($),المصدر,الحالة\n";
            
            const sanitizeCSV = (str) => { 
                if (str === null || str === undefined) return "";
                let c = String(str).replace(/"/g, '""'); 
                if (/[,\n\r"]/.test(c) || /^[=@+-]/.test(c)) { c = `"${/^[=@+-]/.test(c) ? "'" + c : c}"`; }
                return c; 
            };
            
            allExportData.forEach(o => {
                const rawDateStr = RenderHelpers.formatSafeDate(o.time || o.createdAt);
                const dateStr = rawDateStr.replace('|', ' '); 

                const userRec = AdminData.data.usersMap?.[o.userId] || { id: o.userId };
                const displayIdRaw = String(userRec.displayId || o.userDataSnapshot?.displayId || userRec.uid || userRec.id || 'UKNWN').substring(0, 8).toUpperCase();
                const customerName = sanitizeCSV(o.userDataSnapshot?.fullName || o.userName || userRec.fullName || userRec.name || o.userId);
                const product = sanitizeCSV(o.product || 'منتج غير معروف');
                const qty = Number(o.qty || 1);
                
                const exactPrice = Number(o.priceBaseUsd ?? o.pricingSnapshot?.finalPriceUsd ?? o.pricingSnapshot?.finalPrice ?? o.baseUsd ?? o.price ?? 0);
                let totalCost = Number(o.pricingSnapshot?.costUsd || o.pricingSnapshot?.cost || 0);
                let profit = Number(o.pricingSnapshot?.netProfitUsd || o.pricingSnapshot?.profit || 0); 

                const isApi = Boolean(o.isApi === true || o.source === 'api');
                const isSupplier = Boolean(o.supplierId);

                if (o.status !== 'completed') { profit = 0; totalCost = 0; }
                
                let source = 'يدوي';
                if (isApi) source = 'API';
                else if (isSupplier) source = 'مورد خارجي';
                else if (o.vaultPoolId || o.isAutoDelivered || (o.deliveredCode && o.deliveredCode.length > 0)) source = 'تسليم آلي';

                const status = o.status === 'completed' ? 'مكتمل' : (o.status === 'rejected' ? 'مرفوض' : ((o.status === 'refunded' || o.status === 'returned') ? 'مسترجع' : o.status));

                csvContent += `${o.id},${dateStr},${customerName},${displayIdRaw},${product},${qty},${exactPrice.toFixed(2)},${totalCost.toFixed(2)},${profit.toFixed(2)},${source},${status}\n`;
            });
            
            const filename = `Sales_Orders_Report_${new Date().toISOString().split('T')[0]}.csv`;
            this._downloadBlob(csvContent, filename);

        } catch (error) {
            console.error("Export Error:", error);
            UIService?.showToast?.("فشل استخراج تقرير الطلبات من السيرفر. تأكد من الاتصال.", "error");
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
        UIService?.showToast?.("تم تحميل التقرير بنجاح", "success");
    }
};
