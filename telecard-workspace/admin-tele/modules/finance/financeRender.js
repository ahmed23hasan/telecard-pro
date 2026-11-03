// ============================================================================
// 💰 محرك رسم المالية (modules/finance/financeRender.js) - Cloud-Native V19.0 💎
// 🚀 التحديثات المعمارية (V19.0 - Zero-Bleed Cloud Search, Pending Tab Fix & Persistent Counters): 
// 1. Pending Tab Fix 🐛: إصلاح إرسال status='pending' للسيرفر لجلب كافة الإيداعات المعلقة بدقة.
// 2. Zero-Bleed Cloud Search 🔍: ربط البحث والتاريخ بالسيرفر مع منع الاستدعاءات المكررة وعند مسح البحث.
// 3. Persistent Tab & Sidebar Counters 📊: حماية عدادات التبويبات وشارة القائمة الجانبية (#badge-dep) من التصفير عبر الكلاسات القياسية.
// 4. Liquidity Fetch Guard 🛡️: منع تكرار استدعاء سيولة المحافظ السحابي إذا كان الرصيد الكلي صفراً.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { FinanceTemplates } from './financeTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { normalizeRates } from '../../adminConfig.js'; 
import { RenderHelpers } from '../../core/renderHelpers.js';
import { UIService } from '../../core/uiService.js'; 
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const FinanceRender = {
    depositsLimit: 50,
    tabState: 'all',
    filters: {},
    _currentFilteredData: [],
    _tabCountsCache: { all: 0, pending: 0, approved: 0, rejected: 0, refunded: 0 },
    _lastCloudQuerySig: '||',
    _cloudSearchTimer: null,
    _isFetchingCloud: false,
    _liquidityFetchedOnce: false,

    _listenersBound: false,
    initListeners: function() {
        if (this._listenersBound) return;
        this._listenersBound = true;
        
        EventBus.on('state-update', (newState) => {
            if (newState.filters && newState.filters.deposits) {
                this.filters = { ...newState.filters.deposits };
                this._checkAndScheduleCloudReload();
            }
        });
        EventBus.on('req-clear-render-filters', () => {
            this.tabState = 'all';
            this.depositsLimit = 50;
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
    
    if (!datesChanged && searchStr.length > 0 && searchStr.length < 3) {
        return;
    }
    
    if (!datesChanged && searchStr === '' && prevParts[0] !== '') {
        this._lastCloudQuerySig = this._getCloudQuerySignature();
        this.renderDeposits();
        return;
    }
    
    if (!datesChanged && /^(#?DEP-|#?TC-|#?ADMBAL-)/i.test(searchStr)) {
        const cleanId = searchStr.replace(/^(#|DEP-)\s*/i, '').trim().toUpperCase();
        if (AdminData.data?.depositsMap?.[cleanId]) {
            this._lastCloudQuerySig = this._getCloudQuerySignature();
            return;
        }
    }
    
    const newSig = this._getCloudQuerySignature();
    if (newSig === this._lastCloudQuerySig) return;
    
    if (this._cloudSearchTimer) clearTimeout(this._cloudSearchTimer);
    this._cloudSearchTimer = setTimeout(() => {
        this.triggerCloudFilterReload();
    }, 450);
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
    
    this.depositsLimit = 50;
    AdminData.cursors.deposits = null;
    
    if (datesChanged || searchCleared) {
        AdminData.data.deposits = [];
        this._currentFilteredData = [];
    }
    this.loadMoreDeposits();
},    adjustTabCountersOnStatusChange: function(oldStatus, newStatus) {
        if (oldStatus === newStatus) return;
        if (this._tabCountsCache[oldStatus] !== undefined && this._tabCountsCache[oldStatus] > 0) {
            this._tabCountsCache[oldStatus]--;
        }
        if (this._tabCountsCache[newStatus] !== undefined) {
            this._tabCountsCache[newStatus]++;
        }
    },

    filterByTab: function(status, btnElement) {
        this.tabState = status;
        this.depositsLimit = 50;
        
        AdminData.cursors.deposits = null;
        AdminData.data.deposits = [];
        this._currentFilteredData = [];
        
        const container = document.getElementById('tabs-deposits');
        if(container) {
            container.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
            if(btnElement) btnElement.classList.add('active');
        }
        
        const list = document.getElementById('deposits-container');
        if (list) list.innerHTML = '<div class="w-100 text-center p-20 text-muted"><i class="fa-solid fa-circle-notch fa-spin"></i> جاري جلب البيانات السحابية...</div>';
        
        this.loadMoreDeposits(); 
    },

    loadMoreDeposits: async function() {
        if (this._isFetchingCloud) return;
        this._isFetchingCloud = true;

        const btn = document.querySelector('#load-more-deps-btn .btn-load-more') || document.querySelector('.btn-load-more');
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
                lastTimeMs: AdminData.cursors.deposits?.lastTimeMs || null,
                lastDocId: AdminData.cursors.deposits?.lastDocId || null
            };
            
            const res = await FirebaseAdapter.callFunction('adminGetDepositsList', payload);
            
            if (res && res.success && res.data && res.data.length > 0) {
                const currentDepsMap = new Map((AdminData.data.deposits || []).map(d => [d.id, d]));
                if (!AdminData.data.depositsMap) AdminData.data.depositsMap = {};
                res.data.forEach(d => {
                    if (activeSearchTerm) {
                        d._matchedCloudSearch = activeSearchTerm.toLowerCase();
                    }
                    currentDepsMap.set(d.id, d);
                    AdminData.data.depositsMap[String(d.id)] = d;
                });
                
                AdminData.data.deposits = Array.from(currentDepsMap.values());
                
                if (res.pagination && res.pagination.hasMore) {
                    AdminData.cursors.deposits = res.pagination;
                } else {
                    AdminData.cursors.deposits = null;
                    if (btn) {
                        btn.innerHTML = '<i class="fa-solid fa-check"></i> لا توجد إيداعات أقدم';
                        btn.classList.add('disabled', 'text-muted');
                        btn.disabled = true;
                    }
                }
                
                this.depositsLimit += 50;
                this.renderDeposits();
            } else {
                AdminData.cursors.deposits = null;
                if (btn) {
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> لا توجد إيداعات مطابقة';
                    btn.classList.add('disabled', 'text-muted');
                    btn.disabled = true;
                }
                this.renderDeposits(); 
            }
        } catch (error) {
            console.error("🚨 فشل جلب المزيد من الإيداعات السحابية:", error);
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> حاول مجدداً';
            }
        } finally {
            this._isFetchingCloud = false;
            if (btn && AdminData.cursors.deposits) btn.disabled = false;
        }
    },

    renderDeposits: function() {
        const list = document.getElementById('deposits-container'); 
        if(!list) return;
        
        this._checkAndScheduleCloudReload();

        const f = this.filters || {};
        let currentSnapshotData = Array.isArray(AdminData.data.deposits) ? AdminData.data.deposits : [];
        let accumulatedData = Array.isArray(this._currentFilteredData) ? this._currentFilteredData : [];
        
        const combinedMap = new Map();
        accumulatedData.forEach(d => {
            if (currentSnapshotData.some(live => live.id === d.id)) {
                combinedMap.set(d.id, d);
            }
        });
        currentSnapshotData.forEach(d => combinedMap.set(d.id, d));        
        let data = Array.from(combinedMap.values());

        if(f.search) {
            const rawSearch = String(f.search).trim().toLowerCase();
            const s = rawSearch.replace(/^(#|dep-|usr-|id:?)\s*/i, '').trim();
            if (s) {
                data = data.filter(d => {
                    if (d._matchedCloudSearch === rawSearch) return true;

                    const userRec = AdminData.data.usersMap?.[d.userId] || {};
                    const idLower = String(d.id || '').toLowerCase();
                    const dispIdLower = String(d.displayId || '').toLowerCase();
                    const uIdLower = String(d.userId || '').toLowerCase();
                    const uDispLower = String(userRec.displayId || d.userDataSnapshot?.displayId || String(d.userId || '').substring(0, 8)).toLowerCase();
                    const savedNameLower = String(d.userDataSnapshot?.fullName || d.userName || userRec.fullName || '').toLowerCase();
                    const usernameLower = String(userRec.username || '').toLowerCase();
                    const emailLower = String(d.userDataSnapshot?.email || userRec.email || '').toLowerCase();
                    const phoneLower = String(d.userDataSnapshot?.phone || userRec.phone || '').toLowerCase();
                    const methodLower = String(d.method || d.methodName || '').toLowerCase();

                    return idLower.includes(s) || 
                           dispIdLower.includes(s) ||
                           uIdLower.includes(s) ||
                           uDispLower.includes(s) ||
                           savedNameLower.includes(s) ||
                           usernameLower.includes(s.replace(/^@/, '')) ||
                           emailLower.includes(s) ||
                           phoneLower.includes(s) ||
                           methodLower.includes(s); 
                });
            }
        }

        if (f.start || f.end) {
            const startMs = f.start ? Number(f.start) : null;
            const rawEnd = f.end ? Number(f.end) : null;
            const endMs = rawEnd ? ((rawEnd % 86400000 === 0) ? (rawEnd + 86399999) : rawEnd) : null;
            data = data.filter(d => {
                const tMs = RenderHelpers.parseTime(d.time || d.createdAt);
                if (startMs && tMs < startMs) return false;
                if (endMs && tMs > endMs) return false;
                return true;
            });
        }

        const localCounts = { all: data.length, pending: 0, approved: 0, rejected: 0, refunded: 0 };
        data.forEach(d => {
            let st = d.status || 'pending';
            if (localCounts[st] !== undefined) localCounts[st]++;
        });

        const dashDeps = AdminData.data?.dashboardStats?.deposits || AdminData.stats?.deposits || null;
        const isUnfilteredView = !f.search && !f.start && !f.end;
        const currentTab = this.tabState || 'all';

        if (dashDeps && isUnfilteredView) {
            this._tabCountsCache.pending = currentTab === 'pending' ? localCounts.pending : Number(dashDeps.pending ?? localCounts.pending);
            this._tabCountsCache.approved = Math.max(Number(dashDeps.approvedCount || 0), localCounts.approved);
            this._tabCountsCache.rejected = Math.max(Number(dashDeps.rejected || 0), localCounts.rejected);
            this._tabCountsCache.refunded = Math.max(Number(dashDeps.refunded || 0), localCounts.refunded);
            const sumAll = this._tabCountsCache.pending + this._tabCountsCache.approved + this._tabCountsCache.rejected + this._tabCountsCache.refunded;
            this._tabCountsCache.all = Math.max(sumAll, localCounts.all);
        } else if (isUnfilteredView) {
            if (currentTab === 'all') {
                ['all', 'pending', 'approved', 'rejected', 'refunded'].forEach(st => {
                    this._tabCountsCache[st] = Math.max(this._tabCountsCache[st] || 0, localCounts[st]);
                });
            } else {
                this._tabCountsCache[currentTab] = Math.max(this._tabCountsCache[currentTab] || 0, localCounts[currentTab]);
                const sumTabs = (this._tabCountsCache.pending || 0) + (this._tabCountsCache.approved || 0) + (this._tabCountsCache.rejected || 0) + (this._tabCountsCache.refunded || 0);
                this._tabCountsCache.all = Math.max(this._tabCountsCache.all || 0, sumTabs);
            }
        }

        const displayCounts = isUnfilteredView ? this._tabCountsCache : localCounts;
        ['all', 'pending', 'approved', 'rejected', 'refunded'].forEach(st => {
            const el = document.getElementById(`count-dep-${st}`);
            if(el) { el.innerText = Utils.enNum(displayCounts[st] || 0); el.setAttribute('lang', 'en'); }
        });

        // 🚀 تم الإصلاح: شارة القائمة الجانبية تعتمد دائماً على العدد الكلي بالاعتماد على الكلاسات الموحدة
        const sidebarBadge = document.getElementById('badge-dep');
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
            data = data.filter(d => (d.status || 'pending') === currentTab);
        }

        data.sort((a, b) => {
            const isA_Pending = (a.status === 'pending') ? 1 : 0;
            const isB_Pending = (b.status === 'pending') ? 1 : 0;
            if (isA_Pending !== isB_Pending) return isB_Pending - isA_Pending;  
            const timeA = RenderHelpers.parseTime(a.time || a.createdAt);
            const timeB = RenderHelpers.parseTime(b.time || b.createdAt);
            return timeB - timeA;
        });

        this._currentFilteredData = data;

        const hasMoreInCloud = AdminData.cursors.deposits !== null && AdminData.cursors.deposits !== undefined;
        
        if(!data.length && !hasMoreInCloud) { 
            list.innerHTML = FinanceTemplates.emptyDeposits(); 
            return; 
        }

        const paginatedDeposits = data.slice(0, this.depositsLimit);

        let newHtml = paginatedDeposits.map(d => {
            const userRec = AdminData.data.usersMap?.[d.userId];
            const userName = d.userDataSnapshot?.fullName || d.userName || (userRec ? RenderHelpers._getTxName(userRec) : 'مستخدم جديد');
            const bankName = d.method || d.methodName || 'إيداع';
            
            const payCurr = (d.currency || '').toUpperCase();
            const targetCurr = (d.targetCurrency || payCurr || 'USD').toUpperCase();
            const target = Utils.escapeHTML(targetCurr);
            
            const netBase = Number(d.creditedAmount || 0);

            return FinanceTemplates.depositCard(d, userName, bankName, target, netBase);
        }).join('');

        const hasMoreInLocal = this._currentFilteredData.length > this.depositsLimit;
        const loadMoreHtml = (hasMoreInCloud || hasMoreInLocal) ? `
            <div class="load-more-container mt-15 mb-15 w-100 text-center" id="load-more-deps-btn">
                <button class="btn btn-ghost btn-load-more" data-action="load-more-deposits">
                    <i class="fa-solid fa-angle-down"></i> جلب المزيد من السحابة ☁️
                </button>
            </div>` : '';

        list.innerHTML = newHtml + loadMoreHtml;
    },

    renderWalletsOverview: async function(forceRefresh = false) {
            const container = document.getElementById('wallets-overview-grid');
            if (!container) return;
            
            let liquidityData = AdminData.getWalletsLiquidity ? AdminData.getWalletsLiquidity() : null;
            const alreadyLoadedByDash = Boolean(AdminData.data?.dashboardStats?.wallets && liquidityData && liquidityData.details);
            
            if (forceRefresh || (!this._liquidityFetchedOnce && !alreadyLoadedByDash) || !liquidityData || !liquidityData.details) {
                container.innerHTML = '<div class="text-center p-20 text-muted"><i class="fa-solid fa-circle-notch fa-spin icon-me-2"></i> جاري تجميع سيولة المحافظ من السحابة...</div>';
                if (typeof AdminData.fetchWalletsLiquidityAsync === 'function') {
                    liquidityData = await AdminData.fetchWalletsLiquidityAsync();
                    this._liquidityFetchedOnce = true;
                }
            } else if (alreadyLoadedByDash) {
                this._liquidityFetchedOnce = true;
            }        
        if (!liquidityData || !liquidityData.details) {
            liquidityData = { totalUsd: 0, details: {}, hasUncalculated: false, uncalculatedCurrencies: [] };
        }

        const htmlArray = [];
        
        if (liquidityData.hasUncalculated && Array.isArray(liquidityData.uncalculatedCurrencies) && liquidityData.uncalculatedCurrencies.length > 0) {
            htmlArray.push(FinanceTemplates.liquidityWarningBanner(liquidityData.uncalculatedCurrencies));
        }
        
        Object.keys(liquidityData.details).forEach(cc => {
            const d = liquidityData.details[cc];
            const sumVal = (d && typeof d === 'object') ? Number(d.sum || 0) : Number(d || 0);
            const countVal = (d && typeof d === 'object') ? Number(d.count || 0) : 0;
            const rateInfo = AdminData.data.ratesMap?.[cc] || (AdminData.data.rates || []).find(r => r && r.code === cc);
            if (rateInfo || sumVal > 0 || countVal > 0) {
                htmlArray.push(FinanceTemplates.walletCard(cc, d, rateInfo));
            }
        });
        
        htmlArray.push(FinanceTemplates.walletTotal(liquidityData.totalUsd || 0));
        container.innerHTML = htmlArray.join('');
    },

    renderRates: function() {
        const grid = document.getElementById('rates-grid');
        if(!grid) return;
        const rates = normalizeRates(AdminData.data.rates);
        const defaultDisplayCurr = AdminData.data.settings?.defaultCurrency || 'USD';
        grid.innerHTML = rates.map(c => FinanceTemplates.rateCard(c, (c.code === defaultDisplayCurr))).join('');
    },

    renderPaymentList: function() {
        const list = document.getElementById('pay-grid'); 
        if(!list) return;
        
        const payments = AdminData.data.payments || [];
        if (payments.length === 0) {
            list.innerHTML = FinanceTemplates.emptyPayments();
            return;
        }
        
        list.innerHTML = payments.map(p => FinanceTemplates.paymentItem(p)).join('');
    },

    renderPayDetailList: function(detailsArray) {
        const list = document.getElementById('pay-det-list');
        if(!list) return;
        if(!detailsArray || detailsArray.length === 0) { list.innerHTML = FinanceTemplates.emptyPayDetails(); return; }
        list.innerHTML = detailsArray.map((item, i) => {
            const text = typeof item === 'string' ? item : (item.text || '');
            const isCopyable = typeof item === 'string' ? true : (item.copyable !== false);
            return FinanceTemplates.payDetailItem(item, i, text, isCopyable);
        }).join('');
    },

    exportDepositsToExcel: async function() {
        const btn = document.querySelector('[data-action="export-excel"][data-type="deposits"]');
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
                
                const response = await FirebaseAdapter.callFunction('adminGetDepositsList', payload);
                
                if (!response || !response.success || !response.data || response.data.length === 0) {
                    hasMoreToFetch = false;
                    break;
                }
                
                allExportData = allExportData.concat(response.data);
                
                if (response.pagination && response.pagination.hasMore) {
                    currentLastTimeMs = response.pagination.lastTimeMs;
                    currentLastDocId = response.pagination.lastDocId;
                    
                    if (btn) btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جُمع ${allExportData.length} سجل...`;
                } else {
                    hasMoreToFetch = false;
                }
            }
            
            if (allExportData.length === 0) {
                UIService?.showToast?.("لا توجد إيداعات لتصديرها وفق الفلتر الحالي", "warning");
                return;
            }
            
            let csvContent = "\uFEFFرقم الإيداع,التاريخ,اسم العميل,المعرف القصير,البنك/الطريقة,المبلغ المدخل,العملة الاصلية,العمولة/البونص,الصافي بالمحفظة,عملة المحفظة,سعر الصرف,الحالة\n";
            
            const sanitizeCSV = (str) => {
                if (str === null || str === undefined) return "";
                let c = String(str).replace(/"/g, '""');
                if (/[,\n\r"]/.test(c) || /^[=@+-]/.test(c)) {
                    c = `"${/^[=@+-]/.test(c) ? "'" + c : c}"`;
                }
                return c;
            };
            
            allExportData.forEach(d => {
                const dateStr = RenderHelpers.formatSafeDate(d.time || d.createdAt).replace(' | ', ' ');
                const userRec = AdminData.data.usersMap?.[d.userId] || { id: d.userId };
                
                const displayIdRaw = String(userRec.displayId || d.userDataSnapshot?.displayId || userRec.uid || userRec.id || 'UKNWN').substring(0, 8).toUpperCase();
                const customerName = sanitizeCSV(d.userDataSnapshot?.fullName || d.userName || userRec.fullName || userRec.name || d.userId);
                
                const method = sanitizeCSV(d.method || d.methodName || 'إيداع غير محدد');
                const amountNum = Number(d.amount || 0);
                const amount = amountNum.toFixed(2);
                const curr = sanitizeCSV((d.currency || 'USD').toUpperCase());
                
                const targetCurr = sanitizeCSV((d.targetCurrency || curr).toUpperCase());
                
                const feeType = d.feeType || 'fee'; 
                const feeUnit = d.feeUnit || d.unit || d.calcMethod || 'percent';
                const feeVal = Number(d.feePct ?? d.fee ?? 0);
                const feeAmountNum = Number(d.feeAmount ?? (feeUnit === 'percent' ? (amountNum * (feeVal / 100)) : feeVal));
                
                const feeSign = feeType === 'bonus' ? '+' : '-';
                const feeText = feeAmountNum > 0 ? `${feeSign}${feeAmountNum.toFixed(2)}` : '0.00';
                
                const netCredited = Number(d.creditedAmount || 0).toFixed(2);
                const fxRate = Number(d.fxRate || 1).toFixed(4);
                const status = d.status === 'approved' ? 'مقبول' : (d.status === 'rejected' ? 'مرفوض' : (d.status === 'refunded' ? 'مسترجع' : (d.status === 'pending' ? 'معلق' : (d.status === 'deducted' ? 'خصم إداري' : d.status))));
                
                let cleanBody = String(d.displayId || d.id || '').replace(/^(DEP-|TC-|ADMBAL-)/i, '').trim();
                const shortId = cleanBody ? cleanBody.split('-')[0].substring(0, 8).toUpperCase() : '---';

                csvContent += `DEP-${shortId},${dateStr},${customerName},${displayIdRaw},${method},${amount},${curr},${feeText},${netCredited},${targetCurr},${fxRate},${status}\n`;            
            });
            
            const filename = `Deposits_Report_${new Date().toISOString().split('T')[0]}.csv`;
            this._downloadBlob(csvContent, filename);
            
        } catch (error) {
            console.error("Export Deposits Error:", error);
            UIService?.showToast?.("فشل استخراج التقرير السحابي. تأكد من جودة الاتصال.", "error");
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
        link.setAttribute("href", url); 
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link); link.click(); document.body.removeChild(link); window.URL.revokeObjectURL(url);
        UIService?.showToast?.("تم تحميل التقرير بنجاح", "success");
    }
};
