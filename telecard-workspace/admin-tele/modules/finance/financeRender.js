// ============================================================================
// 💰 محرك رسم المالية (modules/finance/financeRender.js) - النسخة الماسية V4.4 💎
// 🎯 الوظيفة: رسم الإيداعات، بوابات الدفع، المحافظ، والعملات، وتصديرها
// 🚀 التحديث الأقصى: تأمين التصدير المحاسبي بـ Raw IDs ومنع التصدير الأعمى
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { normalizeRates, convertViaUSD } from '../../adminConfig.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { UIService } from '../../core/uiService.js'; 

export const FinanceRender = {
    depositsLimit: 50,
    tabState: 'all',
    filters: {},
    _currentFilteredData: [], // 🛡️ مصفوفة حفظ الفلترة لمنع التصدير الأعمى

    initListeners: function() {
        EventBus.on('state-update', (newState) => {
            if(newState.filters && newState.filters.deposits) this.filters = newState.filters.deposits;
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

    loadMoreDeposits: function() {
        this.depositsLimit += 50;
        this.renderDeposits(true); 
    },

    renderDeposits: function(isAppend = false) {
        const list = document.getElementById('deposits-container'); 
        if(!list) return;
        
        const f = this.filters || {};
        let data = Array.isArray(AdminData.data.deposits) ? [...AdminData.data.deposits] : [];

        if(f.search || f.start || f.end) {
            const startD = f.start ? new Date(f.start).setHours(0,0,0,0) : null;
            const endD = f.end ? new Date(f.end).setHours(23,59,59,999) : null;
            data = data.filter(d => {
                let mS = true, mD = true;
                if(f.search) {
                    const s = String(f.search).toLowerCase();
                    const userRec = AdminData.data.usersMap?.[d.userId] || (AdminData.data.users || []).find(u => String(u.id) === String(d.userId));
                    const dId = userRec && userRec.displayId ? String(userRec.displayId).toLowerCase() : '';
                    
                    mS = String(d.id).toLowerCase().includes(s) || 
                         String(d.userName).toLowerCase().includes(s) ||
                         dId.includes(s); 
                }
                
                const itemTime = RenderHelpers.parseTime(d.time || d.createdAt);
                if(startD && itemTime < startD) mD = false;
                if(endD && itemTime > endD) mD = false;
                
                return mS && mD;
            });
        }

        if (!isAppend) {
            const counts = { all: data.length, pending: 0, approved: 0, rejected: 0, refunded: 0 };
            data.forEach(d => { let st = d.status || 'pending'; if(counts[st] !== undefined) counts[st]++; });
            ['all', 'pending', 'approved', 'rejected', 'refunded'].forEach(st => {
                const el = document.getElementById(`count-dep-${st}`);
                if(el) { el.innerText = Utils.enNum(counts[st]); el.setAttribute('lang', 'en'); }
            });
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

        // 🛡️ حفظ البيانات المفلترة لتصديرها للإكسل بدقة
        this._currentFilteredData = data;

        if(!data.length) { 
            if(!isAppend) list.innerHTML = AdminTemplates.emptyDeposits(); 
            return; 
        }

        const totalFiltered = data.length;
        const paginatedDeposits = isAppend ? data.slice(this.depositsLimit - 50, this.depositsLimit) : data.slice(0, this.depositsLimit);

        let newHtml = paginatedDeposits.map(d => {
            const userRec = AdminData.data.usersMap?.[d.userId] || (AdminData.data.users || []).find(u => String(u.id) === String(d.userId));
            const userName = userRec ? RenderHelpers._getTxName(userRec) : (d.userName || 'مستخدم جديد');
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
            const fxRate = Number(d.fxRate ?? (typeof convertViaUSD !== 'undefined' ? convertViaUSD(1, payCurr, targetCurr, AdminData.data.rates, 'deposit') : 1));
            const netBase = Number((d.creditedAmount !== undefined && d.creditedAmount !== null) ? d.creditedAmount : (netPayCurr * fxRate));

            return AdminTemplates.depositCard(d, userName, bankName, target, netBase);
        }).join('');

        const loadMoreHtml = (totalFiltered > this.depositsLimit) ? `
            <div class="load-more-container mt-15 mb-15 w-100 text-center" id="load-more-deps-btn">
                <button class="btn btn-ghost btn-load-more" data-action="load-more-deposits">
                    <i class="fa-solid fa-angle-down"></i> عرض المزيد (${totalFiltered - this.depositsLimit} متبقية)
                </button>
            </div>` : '';

        if (isAppend) {
            const oldBtn = document.getElementById('load-more-deps-btn');
            if (oldBtn) oldBtn.remove();
            list.insertAdjacentHTML('beforeend', newHtml + loadMoreHtml);
        } else {
            list.innerHTML = newHtml + loadMoreHtml;
        }
    },

    renderWalletsOverview: function() {
        const container = document.getElementById('wallets-overview-grid');
        if(!container) return;
        const liquidityData = AdminData.getWalletsLiquidity();
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
        
        grid.innerHTML = rates.map(c => {
            const isDefaultDisplay = (c.code === defaultDisplayCurr);
            return AdminTemplates.rateCard(c, isDefaultDisplay);
        }).join('');
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

    exportDepositsToExcel: function() {
        // 🛡️ التحديث: التصدير يتم للبيانات المفلترة التي يراها المدير حالياً
        const dataToExport = this._currentFilteredData || [];
        if (dataToExport.length === 0) { 
            UIService.showToast("لا توجد إيداعات تطابق الفلتر لتصديرها", "error"); 
            return; 
        }
        
        let csvContent = "\uFEFFرقم الإيداع,التاريخ,اسم العميل,المعرف القصير,البنك/الطريقة,المبلغ,العملة,الحالة\n";
        
        dataToExport.forEach(d => {
            const dateStr = RenderHelpers.formatSafeDate(d.time || d.createdAt);
            const sanitizeCSV = (str) => { let c = String(str).replace(/,/g, " "); if (/^[=@+-]/.test(c)) c = "'" + c; return c; };

            // ⚡ جلب العميل فورا بـ O(1) من الخريطة
            const userRec = AdminData.data.usersMap?.[d.userId] || (AdminData.data.users || []).find(u => String(u.id) === String(d.userId));
            
            // 🛡️ يجب تصدير المعرف الحقيقي الخام (Raw ID) للإكسل لأغراض التتبع المحاسبي، وليس المعرف المقصوص
            const displayId = userRec ? String(userRec.uid || userRec.id) : String(d.userId);
            const customerName = sanitizeCSV(userRec ? (userRec.fullName || userRec.name || d.userName) : (d.userName || d.userId));

            const method = sanitizeCSV(d.method || d.methodName || 'إيداع غير محدد');
            const amount = Number(d.amount || 0).toFixed(2);
            const curr = sanitizeCSV((d.currency || 'USD').toUpperCase());
            const status = d.status === 'approved' ? 'مقبول' : (d.status === 'rejected' ? 'مرفوض' : (d.status === 'refunded' ? 'مسترجع' : d.status));
            
            const formattedDepositId = RenderHelpers.formatDepositId(d);
            
            csvContent += `${formattedDepositId},${dateStr},${customerName},${displayId},${method},${amount},${curr},${status}\n`;
        });
        
        const filename = `Deposits_Report_${new Date().toISOString().split('T')[0]}.csv`;
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = window.URL.createObjectURL(blob);
        link.setAttribute("href", url); 
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link); 
        link.click(); 
        document.body.removeChild(link); 
        window.URL.revokeObjectURL(url);
        
        UIService.showToast("تم تحميل التقرير بنجاح", "success");
    }
};
