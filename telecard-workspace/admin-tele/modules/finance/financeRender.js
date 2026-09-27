// ============================================================================
// 💰 محرك رسم المالية (modules/finance/financeRender.js) - Cloud-Native V18.7 💎
// 🚀 التحديث الأقصى (V18.7 - Infinite Shield & Sidebar Sync): 
// 1. Infinite Loop Shield 🛡️: إيقاف زر جلب المزيد بشكل قطعي إذا أرجع السيرفر (null).
// 2. Sidebar Sync 🔄: تحديث شارة الإيداعات المعلقة في القائمة الجانبية (Sidebar) لحظياً.
// 3. Server-Side Export Trap Fix 📊: استيراد الإيداعات للتصدير من السيرفر مباشرة.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { normalizeRates } from '../../adminConfig.js'; 
import { RenderHelpers } from '../../core/renderHelpers.js';
import { UIService } from '../../core/uiService.js'; 
import { FinancialEngine } from '../../core/financialEngine.js'; 
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const FinanceRender = {
    depositsLimit: 50,
    tabState: 'all',
    filters: {},
    _currentFilteredData: [],

    _listenersBound: false,
    initListeners: function() {
        if (this._listenersBound) return;
        this._listenersBound = true;
        
        EventBus.on('state-update', (newState) => {
            if (newState.filters && newState.filters.deposits) this.filters = newState.filters.deposits;
        });
        EventBus.on('req-clear-render-filters', () => {
            this.tabState = 'all';
            this.depositsLimit = 50;
        });
    },
    filterByTab: function(status, btnElement) {
        this.tabState = status;
        this.depositsLimit = 50;
        const container = document.getElementById('tabs-deposits');
        if(container) {
            container.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
            if(btnElement) btnElement.classList.add('active');
        }
        this.renderDeposits();
    },

    loadMoreDeposits: async function() {
    const btn = document.querySelector('.btn-load-more');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحميل من السحابة...';
        btn.disabled = true;
    }
    
    try {
        // 🚀 [الحل المعماري]: إرسال الفلاتر (التاريخ والحالة) للسيرفر مباشرة للبحث الحقيقي
        let conditions = [];
        if (this.tabState && this.tabState !== 'all' && this.tabState !== 'pending') {
            conditions.push(['status', '==', this.tabState]);
        }
        if (this.filters.start) conditions.push(['time', '>=', this.filters.start]);
        if (this.filters.end) conditions.push(['time', '<=', this.filters.end + 86399999]);
        
        const res = await FirebaseAdapter.fetchMoreWithCursor(
            'telecard_deposits', conditions, 'time', AdminData.cursors.deposits, 50
        );
        
        if (res && res.data && res.data.length > 0) {
            AdminData.data.deposits = [...AdminData.data.deposits, ...res.data];
            res.data.forEach(d => { AdminData.data.depositsMap[String(d.id)] = d; });
            
            // 🛡️ [إصلاح التكرار اللانهائي]: تحديث المؤشر فقط إذا كان هناك المزيد
            if (res.newLastDoc) {
                AdminData.cursors.deposits = res.newLastDoc;
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
            // 🛡️ إغلاق الزر نهائياً إذا لم يرجع السيرفر أي بيانات
            AdminData.cursors.deposits = null;
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-check"></i> لا توجد إيداعات مطابقة';
                btn.classList.add('disabled', 'text-muted');
                btn.disabled = true;
            }
        }
    } catch (error) {
        console.error("🚨 فشل جلب المزيد من الإيداعات السحابية:", error);
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> حاول مجدداً';
        }
    } finally {
        if (btn) btn.disabled = false;
    }
},    renderDeposits: function() {
        const list = document.getElementById('deposits-container'); 
        if(!list) return;
        
        const f = this.filters || {};
        
        // 🚀 [التحديث المعماري - Merge Shield]: حماية الـ Pagination من مسح الـ Snapshot المفاجئ
        let currentSnapshotData = Array.isArray(AdminData.data.deposits) ? AdminData.data.deposits : [];
        let accumulatedData = Array.isArray(this._currentFilteredData) ? this._currentFilteredData : [];
        
        const combinedMap = new Map();
// 🚀 [الحل المعماري]: تنظيف البيانات الوهمية (Ghosts)
accumulatedData.forEach(d => {
    if (currentSnapshotData.some(live => live.id === d.id)) {
        combinedMap.set(d.id, d);
    }
});
currentSnapshotData.forEach(d => combinedMap.set(d.id, d));        
        let data = Array.from(combinedMap.values());

        if(f.search || f.start || f.end) {
            const startD = f.start ? Number(f.start) : null;
            const endD = f.end ? Number(f.end) + 86399999 : null; 

            data = data.filter(d => {
                let mS = true, mD = true;
                if(f.search) {
                    const s = String(f.search).toLowerCase();
                    const userRec = AdminData.data.usersMap?.[d.userId] || {};
                    const dId = userRec.displayId ? String(userRec.displayId).toLowerCase() : String(d.userId).toLowerCase();
                    const savedName = d.userDataSnapshot?.fullName || d.userName || '';
                    mS = String(d.id).toLowerCase().includes(s) || 
                         savedName.toLowerCase().includes(s) ||
                         dId.includes(s); 
                }
                
                const itemTime = RenderHelpers.parseTime(d.time || d.createdAt);
                if(startD && itemTime < startD) mD = false;
                if(endD && itemTime > endD) mD = false;
                
                return mS && mD;
            });
        }

        const counts = { all: data.length, pending: 0, approved: 0, rejected: 0, refunded: 0 };
        data.forEach(d => { let st = d.status || 'pending'; if(counts[st] !== undefined) counts[st]++; });
        
        ['all', 'pending', 'approved', 'rejected', 'refunded'].forEach(st => {
            const el = document.getElementById(`count-dep-${st}`);
            if(el) { el.innerText = Utils.enNum(counts[st]); el.setAttribute('lang', 'en'); }
        });

        // 🚀 [تحديث الشارة الجانبية - Sidebar Sync]: إشعار المدير بالإيداعات المعلقة
        const sidebarBadge = document.getElementById('badge-dep');
        if (sidebarBadge) {
            sidebarBadge.innerText = counts.pending;
            sidebarBadge.style.display = counts.pending > 0 ? 'inline-block' : 'none';
        }

        const currentTab = this.tabState || 'all';
        if(currentTab !== 'all') data = data.filter(d => (d.status || 'pending') === currentTab);

        data.sort((a, b) => {
            const isA_Pending = (a.status === 'pending') ? 1 : 0;
            const isB_Pending = (b.status === 'pending') ? 1 : 0;
            if (isA_Pending !== isB_Pending) return isB_Pending - isA_Pending;  
            const timeA = RenderHelpers.parseTime(a.time || a.createdAt);
            const timeB = RenderHelpers.parseTime(b.time || b.createdAt);
            return timeB - timeA;
        });

        this._currentFilteredData = data;

        const hasMoreInCloud = AdminData.cursors.deposits !== null && AdminData.cursors.deposits !== undefined && !f.search;
        
        if(!data.length && !hasMoreInCloud) { 
            list.innerHTML = AdminTemplates.emptyDeposits(); 
            return; 
        }

        const paginatedDeposits = data.slice(0, this.depositsLimit);

        let newHtml = paginatedDeposits.map(d => {
            const userRec = AdminData.data.usersMap?.[d.userId];
            const userName = d.userDataSnapshot?.fullName || d.userName || (userRec ? RenderHelpers._getTxName(userRec) : 'مستخدم جديد');
            const bankName = d.method || d.methodName || 'إيداع';
            
            const payCurr = (d.currency || '').toUpperCase();
            const targetCurr = (d.targetCurrency || payCurr).toUpperCase();
            const target = Utils.escapeHTML(targetCurr);
            
            const feeVal = Number(d.feePct ?? d.fee ?? 0);
            const feeType = d.feeType || 'fee';
            const feeUnit = d.feeUnit || d.unit || d.calcMethod || 'percent';
            
            const feeAmount = Number(d.feeAmount ?? (feeUnit === 'percent' ? (Number(d.amount || 0) * (feeVal / 100)) : feeVal));
            
            let calculatedNetPay = Number(d.amount || 0);
            if (feeType === 'bonus') calculatedNetPay += feeAmount;
            else calculatedNetPay -= feeAmount;
            
            const netPayCurr = Number(d.netPayCurr ?? calculatedNetPay);
            const fxRate = Number(d.fxRate ?? (typeof FinancialEngine !== 'undefined' ? FinancialEngine.convertViaUSD(1, payCurr, targetCurr, AdminData.data.rates, 'deposit') : 1));
            const netBase = Number((d.creditedAmount !== undefined && d.creditedAmount !== null) ? d.creditedAmount : (netPayCurr * fxRate));

            return AdminTemplates.depositCard(d, userName, bankName, target, netBase);
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

    renderWalletsOverview: async function() {
        const container = document.getElementById('wallets-overview-grid');
        if(!container) return;
        
        let liquidityData = AdminData.getWalletsLiquidity();
        
        if (!liquidityData || (liquidityData.totalUsd === 0 && Object.keys(liquidityData.details).length === 0)) {
            container.innerHTML = '<div class="text-center p-20 text-muted"><i class="fa-solid fa-circle-notch fa-spin icon-me-2"></i> جاري تجميع سيولة المحافظ من السحابة...</div>';
            liquidityData = await AdminData.fetchWalletsLiquidityAsync();
        }
        
        const htmlArray = [];
        Object.keys(liquidityData.details).forEach(cc => {
            const d = liquidityData.details[cc];
            const rateInfo = AdminData.data.ratesMap?.[cc] || AdminData.data.rates.find(r => r.code === cc);
            if (rateInfo || d.count > 0) htmlArray.push(AdminTemplates.walletCard(cc, d, rateInfo));
        });
        htmlArray.push(AdminTemplates.walletTotal(liquidityData.totalUsd));
        container.innerHTML = htmlArray.join('');
    },

    renderRates: function() {
        const grid = document.getElementById('rates-grid');
        if(!grid) return;
        const rates = normalizeRates(AdminData.data.rates);
        const defaultDisplayCurr = AdminData.data.settings?.defaultCurrency || 'USD';
        grid.innerHTML = rates.map(c => AdminTemplates.rateCard(c, (c.code === defaultDisplayCurr))).join('');
    },

    renderPaymentList: function() {
        const list = document.getElementById('pay-grid'); 
        if(!list) return;
        list.innerHTML = (AdminData.data.payments || []).map(p => AdminTemplates.paymentItem(p)).join('');
    },

    renderPayDetailList: function(detailsArray) {
        const list = document.getElementById('pay-det-list');
        if(!list) return;
        if(!detailsArray || detailsArray.length === 0) { list.innerHTML = AdminTemplates.emptyPayDetails(); return; }
        list.innerHTML = detailsArray.map((item, i) => {
            const text = typeof item === 'string' ? item : (item.text || '');
            const isCopyable = typeof item === 'string' ? true : (item.copyable !== false);
            return AdminTemplates.payDetailItem(item, i, text, isCopyable);
        }).join('');
    },

    // 🚀 [التحديث المعماري - Pagination Export Trap]: تصدير شامل بالاعتماد على الاستعلام المباشر من السحابة
        exportDepositsToExcel: async function() {
    const btn = document.querySelector('[data-action="export-excel"][data-type="deposits"]');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري استخراج البيانات...';
        btn.disabled = true;
    }
    
    try {
        // 🚀 [الحل المعماري]: نستخدم الدالة السحابية لجلب البيانات بأمان بدلاً من المتصفح
        const payload = {
            limit: 5000,
            status: this.tabState !== 'all' ? this.tabState : null,
            startDateMs: this.filters.start || null,
            endDateMs: this.filters.end || null
        };
        
        const response = await FirebaseAdapter.callFunction('adminGetDepositsList', payload);
        
        if (!response || !response.success || !response.data || response.data.length === 0) {
            UIService?.showToast?.("لا توجد إيداعات لتصديرها وفق الفلتر الحالي", "warning");
            return;
        }
        
        const dataToExport = response.data;
        let csvContent = "\uFEFFرقم الإيداع,التاريخ,اسم العميل,المعرف القصير,البنك/الطريقة,المبلغ المدخل,العملة الاصلية,الصافي بالمحفظة,عملة المحفظة,الحالة\n";
        
        // 🚀 دالة تعقيم آمنة
        const sanitizeCSV = (str) => {
            if (str === null || str === undefined) return "";
            let c = String(str).replace(/"/g, '""');
            if (/[,\n\r"]/.test(c) || /^[=@+-]/.test(c)) {
                c = `"${/^[=@+-]/.test(c) ? "'" + c : c}"`;
            }
            return c;
        };
        
        dataToExport.forEach(d => {
            const dateStr = RenderHelpers.formatSafeDate(d.time || d.createdAt);
            const userRec = AdminData.data.usersMap?.[d.userId] || { id: d.userId };
            
            const displayIdRaw = String(userRec.displayId || userRec.uid || userRec.id || 'UKNWN').substring(0, 8).toUpperCase();
            const customerName = sanitizeCSV(d.userDataSnapshot?.fullName || d.userName || userRec.fullName || userRec.name || d.userId);
            
            const method = sanitizeCSV(d.method || d.methodName || 'إيداع غير محدد');
            const amount = Number(d.amount || 0).toFixed(2);
            const curr = sanitizeCSV((d.currency || 'USD').toUpperCase());
            
            const targetCurr = sanitizeCSV((d.targetCurrency || curr).toUpperCase());
            
            let netCreditedRaw = Number(d.creditedAmount || d.amount || 0);
            if (d.status === 'rejected') netCreditedRaw = 0;
            const netCredited = netCreditedRaw.toFixed(2);
            
            const status = d.status === 'approved' ? 'مقبول' : (d.status === 'rejected' ? 'مرفوض' : (d.status === 'refunded' ? 'مسترجع' : d.status));
            
            let rawId = String(d.displayId || d.id || '').replace(/^DEP-/i, '').trim();
            const shortId = rawId.length > 8 ? rawId.slice(-8).toUpperCase() : rawId.toUpperCase();
            
            csvContent += `DEP-${shortId},${dateStr},${customerName},${displayIdRaw},${method},${amount},${curr},${netCredited},${targetCurr},${status}\n`;
        });
        
        const filename = `Deposits_Report_${new Date().toISOString().split('T')[0]}.csv`;
        this._downloadBlob(csvContent, filename);
        
    } catch (error) {
        console.error("Export Deposits Error:", error);
        UIService?.showToast?.("فشل استخراج التقرير السحابي. تأكد من نشر الدالة الجديدة.", "error");
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