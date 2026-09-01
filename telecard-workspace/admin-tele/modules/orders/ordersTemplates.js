// ============================================================================
// 📦 قوالب الطلبات (modules/orders/ordersTemplates.js) - النسخة الماسية V16.2 💎
// 🎯 الوظيفة: توليد الـ HTML بنظام الهيكلة المرنة (Flexbox) لبطاقات ونوافذ الطلبات
// 🚀 التحديث الأقصى: 
// 1. API Override Shield: إضافة درع تحذيري وزر تعويض للطلبات المرتبطة بـ API لمنع تضارب التسليم.
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { AdminData } from '../../adminData.js'; 

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;

export const OrdersTemplates = {
    
    // 🛡️ [أزرار الفلترة الذكية لمصدر الطلبات]
    ordersSourceFilters: (activeState) => `
        <div class="orders-source-filters mb-15 d-flex gap-2 flex-wrap align-items-center p-10" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;">
            <span class="fs-12 fw-bold text-muted me-2"><i class="fa-solid fa-filter"></i> مصدر الطلبات:</span>
            <button class="btn btn-sm ${activeState === 'all' ? 'btn-primary' : 'btn-ghost'}" data-action="filter-orders-source" data-val="all">
                <i class="fa-solid fa-layer-group"></i> الكل
            </button>
            <button class="btn btn-sm ${activeState === 'api' ? 'btn-primary' : 'btn-ghost'}" data-action="filter-orders-source" data-val="api">
                <i class="fa-solid fa-robot ${activeState === 'api' ? '' : 'text-info'}"></i> عبر الـ API
            </button>
            <button class="btn btn-sm ${activeState === 'auto' ? 'btn-primary' : 'btn-ghost'}" data-action="filter-orders-source" data-val="auto">
                <i class="fa-solid fa-bolt ${activeState === 'auto' ? '' : 'text-success'}"></i> تسليم آلي
            </button>
            <button class="btn btn-sm ${activeState === 'manual' ? 'btn-primary' : 'btn-ghost'}" data-action="filter-orders-source" data-val="manual">
                <i class="fa-solid fa-hand-paper ${activeState === 'manual' ? '' : 'text-warning'}"></i> تنفيذ يدوي
            </button>
        </div>
    `,

    // 🛡️ [حالة الفراغ]
    emptyOrders: () => `
        <div class="empty-state">
            <i class="fa-solid fa-box-open"></i>
            <span>لا توجد طلبات تطابق الفلتر الحالي</span>
        </div>
    `,

    // 🛡️ [كارت الطلب في الشبكة]
    orderCard: (o, userName, inputData) => {
        const exactStatus = o.status || 'pending';
        const isComp = exactStatus === 'completed', isRej = exactStatus === 'rejected', isRef = (exactStatus === 'refunded' || exactStatus === 'returned');
        const cardCls = isComp ? 'completed' : (isRej ? 'rejected' : (isRef ? 'refunded' : 'pending'));
        const lockCls = (isRej || isRef) ? 'locked' : '';
        const qty = o.qty || 1;

        const rawTime = o.time || o.createdAt;
        const timeHtml = RenderHelpers.formatSafeDate(rawTime);

        const userRec = AdminData.data.usersMap?.[o.userId] || {};
        const shortId = RenderHelpers.formatUserId(userRec);

        const isIdAsName = String(userName).trim() === String(shortId).trim() || String(userName).trim() === String(o.userId).trim();
        const clientIdentityHtml = isIdAsName 
            ? `<div class="o-card-user"><i class="fa-solid fa-user o-card-user-icon"></i> <span class="uid-capsule copyable-admin" title="انقر لنسخ رقم العميل" data-action="copy-text" data-copy-text="${_esc(shortId)}"><i class="fa-solid fa-hashtag"></i>${_esc(shortId)}</span></div>`
            : `<div class="o-card-user"><i class="fa-solid fa-user o-card-user-icon"></i> <span class="user-name-text">${_esc(userName)}</span> <span class="uid-capsule copyable-admin" title="انقر لنسخ رقم العميل" data-action="copy-text" data-copy-text="${_esc(shortId)}"><i class="fa-solid fa-hashtag"></i>${_esc(shortId)}</span></div>`;

        let inputHtml = '';
        if (inputData) {
            inputHtml = `
            <div class="o-card-body-row">
                <div class="o-card-input-data copyable-admin" title="انقر لنسخ بيانات الطلب" data-action="copy-text" data-copy-text="${_esc(o.input)}">
                    <div class="o-card-input-lbl"><i class="fa-solid fa-keyboard"></i> بيانات الطلب</div>
                    <div class="o-card-input-val num-en" dir="ltr" lang="en">${_esc(inputData)}</div>
                </div>
            </div>`;
        }

        let sign = '-'; let priceColor = 'text-warning';
        if (isRef || isRej) { sign = '+'; priceColor = 'text-success'; } 
        else if (isComp) { sign = '-'; priceColor = 'text-danger'; }

        const absPrice = Math.abs(o.price || 0);
        const cCode = (o.currency || o.priceCurrency || 'USD').replace('$', 'USD');
        
        let finalPriceHtml = o.dualPriceTxt 
            ? `<span class="${priceColor}">${sign} ${o.dualPriceTxt.replace(/[-+]/g, '').trim()}</span>`
            : `<span class="single-price ${priceColor}">${sign} ${RenderHelpers.formatMoney(absPrice, cCode, 2)}</span>`;

        const orderIdHtml = RenderHelpers.formatOrderId(o);

        const isApi = (o.isApi === true || o.source === 'api');
        const isAuto = (!isApi && o.deliveredCode && o.deliveredCode.length > 0);
        
        let sourceBadgeHtml = '';
        if (isApi) sourceBadgeHtml = `<span class="badge-tag fs-10 ms-2" style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-robot"></i> API</span>`;
        else if (isAuto) sourceBadgeHtml = `<span class="badge-tag fs-10 ms-2" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-bolt"></i> آلي</span>`;
        else sourceBadgeHtml = `<span class="badge-tag fs-10 ms-2" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-hand-paper"></i> يدوي</span>`;

        return `
        <div id="order-card-${_esc(o.id)}" class="o-card ${cardCls} ${lockCls}" data-status="${exactStatus}" data-action="open-order-drawer" data-id="${_esc(o.id)}">
            <div class="corner-tag-id num-en copyable-admin" dir="ltr" lang="en" title="المعرف الكامل: ${_esc(o.id)} (انقر للنسخ)" data-action="copy-text" data-copy-text="${_esc(o.id)}">#${orderIdHtml}</div>
            <div class="corner-tag-time num-en" dir="ltr" lang="en"><i class="fa-regular fa-clock"></i> ${timeHtml}</div>
            <div class="o-card-header-row">
                <div class="o-card-img-fallback"><i class="fa-solid fa-cube"></i></div>
                <div class="o-card-content">
                    <div class="o-card-title">${_esc(o.product || 'منتج')} <span class="badge-qty copyable-admin" dir="ltr" lang="en" title="انقر لنسخ الكمية" data-action="copy-text" data-copy-text="${qty}">x${_enNum(qty)}</span> ${sourceBadgeHtml}</div>
                    <div class="o-card-meta">
                        ${clientIdentityHtml}
                        <div class="flex-center-gap"><span class="o-card-price num-en" dir="ltr" lang="en">${finalPriceHtml}</span></div>
                    </div>
                </div>
            </div>
            ${inputHtml}
        </div>`;
    },

    // 🛡️ [رأس النافذة الجانبية]
    orderDrawerHeader: (orderId) => {
        const formattedOrderId = RenderHelpers.formatOrderId(orderId);
        return `
        <div class="dh-title-wrap">
            <div class="dh-title">تفاصيل الطلب</div>
            <div class="dr-order-stamp num-en copyable-admin" dir="ltr" lang="en" title="المعرف الكامل: ${_esc(orderId)} (انقر للنسخ)" data-action="copy-text" data-copy-text="${_esc(orderId)}">
                #${formattedOrderId}
            </div>
        </div>
        <div class="drawer-close" data-action="close-drawer" data-type="order">
            <i class="fa-solid fa-xmark"></i>
        </div>`;
    },
    
    // 🛡️ [عناصر الصور]
    drawerAvatar: (imgSrc, firstLetter) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-avatar dr-avatar-fit zoomable-img" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-avatar">${_esc(firstLetter)}</div>`,
        
    drawerProdImg: (imgSrc) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-prod-img zoomable-img" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-prod-placeholder"><i class="fa-solid fa-box"></i></div>`,

    // 🛡️ [مدة الإنجاز]
    orderDurationRow: (durationTxt) => `
        <div class="dr-receipt-row">
            <span class="dr-receipt-lbl"><i class="fa-solid fa-stopwatch text-info"></i> وقت المعالجة والرد</span>
            <span class="dr-receipt-val num-en text-info copyable-admin" dir="ltr" lang="en" data-action="copy-text" data-copy-text="${_esc(durationTxt)}">${_esc(durationTxt)}</span>
        </div>
    `,

    // 🛡️ [مدخلات العميل]
    orderInputsCard: (parsedInputs) => { 
        const inputsHtml = parsedInputs.map(inp => `
            <div class="copy-row copyable-admin" data-action="copy-text" data-copy-text="${_esc(inp.value)}">
                <div class="cr-content">
                    <span class="cr-label">${_esc(inp.label)}</span>
                    <span class="cr-value num-en" dir="ltr" lang="en">${_esc(inp.value)}</span>
                </div>
                <div class="cr-icon"><i class="fa-solid fa-copy"></i></div>
            </div>`).join(''); 
        return `
        <div class="dr-card">
            <div class="dr-inputs-title"><i class="fa-solid fa-keyboard text-primary"></i> بيانات الطلب المُدخلة</div>
            <div class="dr-inputs-list">${inputsHtml}</div>
        </div>`; 
    },

    // 🛡️ [الكود المُسلم آلياً]
    orderCodeCard: (codeText) => `
        <div class="dr-card dr-system-box">
            <div class="dr-inputs-title text-success"><i class="fa-solid fa-bolt"></i> التسليم الآلي (الكود المُسلّم)</div>
            <div class="copy-row success-copy-row copyable-admin" data-action="copy-text" data-copy-text="${_esc(codeText)}">
                <div class="cr-content cr-content-center w-100">
                    <span class="cr-value num-en" dir="ltr" lang="en">${_esc(codeText)}</span>
                </div>
                <div class="cr-icon text-success"><i class="fa-solid fa-copy"></i></div>
            </div>
        </div>
    `,

    // 🛡️ [ملاحظات الإدارة]
    adminReplyCard: (replyText, customTitle = 'رد المتجر المـُرسل') => `
        <div class="dr-card dr-admin-reply">
            <div class="dr-inputs-title text-info"><i class="fa-solid fa-comment-dots"></i> ${customTitle}</div>
            <div class="admin-reply-content copyable-admin" data-action="copy-text" data-copy-text="${_esc(replyText)}">
                ${_esc(replyText).replace(/\n/g, '<br>')}
            </div>
        </div>
    `,

    // 🛡️ [السطر المحاسبي العادي]
    orderReceiptRow: (iconClass, label, valHtml) => `
        <div class="dr-receipt-row">
            <span class="dr-receipt-lbl"><i class="${iconClass}"></i> ${label}</span>
            <span class="dr-receipt-val" dir="ltr">${valHtml}</span>
        </div>
    `,

    // 🛡️ [التقرير المالي الذكي للطلب - مفكوك ومقروء بوضوح]
    financialSnapshotBlock: (snap, status) => {
        const isCompleted = status === 'completed';
        const isRefundedOrRejected = ['refunded', 'rejected', 'returned'].includes(status);
        
        const sCost = Number(snap.totalCost ?? snap.costUsd ?? 0);
        const sTierPrice = Number(snap.totalOriginalPrice ?? snap.tierPriceUsd ?? 0);
        const sOfferDisc = Number(snap.offerDiscount ?? 0);
        const sCouponDisc = Number(snap.couponDiscount ?? 0);
        const sFinalPrice = Number(snap.totalFinalPrice ?? snap.finalPriceUsd ?? 0);
        const sProfit = Number(snap.totalProfit ?? snap.netProfitUsd ?? 0);
        const sMargin = Number(snap.marginPct ?? 0);
        
        const profitClass = sProfit >= 0 ? 'text-success' : 'text-danger';
        const profitSign = sProfit > 0 ? '+' : '';
        
        let finalSign = '-';
        let finalColorClass = 'text-warning';
        let finalBgClass = '';
        let finalLabel = '<i class="fa-solid fa-hand-holding-dollar"></i> المخصوم (معلق)';
        
        if (isRefundedOrRejected) { 
            finalSign = '+'; 
            finalColorClass = 'text-success'; 
            finalBgClass = 'highlight-success'; 
            finalLabel = '<i class="fa-solid fa-hand-holding-dollar"></i> إجمالي المسترجع للمحفظة'; 
        } else if (isCompleted) { 
            finalSign = '-'; 
            finalColorClass = 'text-danger'; 
            finalBgClass = 'highlight-danger'; 
            finalLabel = '<i class="fa-solid fa-hand-holding-dollar"></i> المخصوم من المحفظة'; 
        }
        
        let discountsHtml = '';
        if (snap.offerName && sOfferDisc > 0) {
            discountsHtml += `
                <div class="fs-11 text-muted mb-5">
                    <i class="fa-solid fa-bolt text-warning"></i> تخفيض عرض (${_esc(snap.offerName)}): 
                    <span class="num-en text-danger" dir="ltr">-${RenderHelpers.formatMoney(sOfferDisc, 'USD', 2)}</span>
                </div>`;
        }
        if (snap.couponCode && sCouponDisc > 0) {
            discountsHtml += `
                <div class="fs-11 text-muted">
                    <i class="fa-solid fa-ticket text-primary"></i> كوبون (${_esc(snap.couponCode)}): 
                    <span class="num-en text-danger" dir="ltr">-${RenderHelpers.formatMoney(sCouponDisc, 'USD', 2)}</span>
                </div>`;
        }
        
        const firewallHtml = (snap.isFirewallActive || snap.isFirewallViolated) 
            ? `<div class="mt-10 p-8" style="background: var(--glass-bg); border: 1px dashed var(--danger); border-radius: 6px; font-size: 11px; color: var(--danger);">
                <i class="fa-solid fa-shield-halved"></i> <b>تنبيه حماية:</b> تم منع البيع بخسارة! تم رفع السعر ليعادل رأس المال.
               </div>` 
            : '';
            
        const formattedTierName = snap.tierName ? `(مستوى ${_esc(snap.tierName)})` : '(السعر المخصص)';
        
        return `
            <div class="financial-snapshot-box mb-15" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 12px;">
                <div class="fs-12 fw-bold text-primary mb-10"><i class="fa-solid fa-microchip"></i> التحليل المالي الذكي للطلب</div>
                
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-box-open text-warning"></i> تكلفة المنتج (رأس المال)</span>
                    <span class="dr-receipt-val num-en text-warning" dir="ltr" lang="en">${RenderHelpers.formatMoney(sCost, 'USD', 2)}</span>
                </div>
                
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-crown text-gold"></i> سعر البيع الأصلي <span class="text-muted fs-11">${formattedTierName}</span></span>
                    <span class="dr-receipt-val num-en" dir="ltr" lang="en">${RenderHelpers.formatMoney(sTierPrice, 'USD', 2)}</span>
                </div>
                
                ${discountsHtml ? `<div class="mt-10 mb-10 p-10" style="background: var(--primary-glow); border: 1px solid var(--line-color); border-radius: 6px;">${discountsHtml}</div>` : ''}
                
                <div class="dr-receipt-row mt-10 ${finalBgClass}" style="border-top: 1px dashed var(--border); padding-top: 10px;">
                    <span class="dr-receipt-lbl fw-bold ${finalColorClass}">${finalLabel}</span>
                    <span class="dr-receipt-val price num-en fw-bold ${finalColorClass}" dir="ltr" lang="en">${finalSign} ${RenderHelpers.formatMoney(Math.abs(sFinalPrice), 'USD', 2)}</span>
                </div>
                
                <div class="dr-receipt-row mt-10">
                    <span class="dr-receipt-lbl fw-bold"><i class="fa-solid fa-chart-pie ${profitClass}"></i> الربح الصافي</span>
                    <span class="dr-receipt-val num-en fw-bold ${profitClass}" dir="ltr" lang="en">
                        ${isCompleted ? profitSign + RenderHelpers.formatMoney(sProfit, 'USD', 2) : '<span class="text-muted fs-11">يُحسب عند الاكتمال</span>'} 
                        <span class="fs-11 text-muted">(${_enNum(sMargin, 1)}%)</span>
                    </span>
                </div>
                
                ${firewallHtml}
            </div>
        `;
    },

    // 🛡️ [النافذة الجانبية الكاملة للطلب - تم الفصل البصري للسجلات الجنائية]
    orderDrawerBody: (data) => {
        const isRefRej = ['refunded', 'rejected', 'returned'].includes(data.statusClass);
        const isComp = data.statusClass === 'completed';
        
        let fSign = isRefRej ? '+' : '-'; 
        let fColor = isRefRej ? 'text-success' : (isComp ? 'text-danger' : 'text-warning'); 
        let fBg = isRefRej ? 'highlight-success' : (isComp ? 'highlight-danger' : ''); 
        let fLabel = isRefRej ? '<i class="fa-solid fa-hand-holding-dollar"></i> إجمالي المسترجع' : '<i class="fa-solid fa-hand-holding-dollar"></i> المخصوم من المحفظة';
        
        const isIdAsNameDrawer = String(data.displayUser).trim() === String(data.userDisplayId).trim() || String(data.displayUser).trim() === String(data.userId).trim();
        const drawerIdentityHtml = isIdAsNameDrawer 
            ? `<span class="uid-capsule copyable-admin" title="انقر للنسخ" data-action="copy-text" data-copy-text="${_esc(data.userDisplayId)}"><i class="fa-solid fa-hashtag"></i>${_esc(data.userDisplayId)}</span>` 
            : `<span class="dr-client-name">${_esc(data.displayUser)}</span><span class="uid-capsule copyable-admin" title="انقر للنسخ" data-action="copy-text" data-copy-text="${_esc(data.userDisplayId)}"><i class="fa-solid fa-hashtag"></i>${_esc(data.userDisplayId)}</span>`;
        
        return `
        <!-- الكارت الخاص ببيانات العميل -->
        <div class="dr-card dr-client" data-action="view-user" data-id="${_esc(data.userId)}">
            <div class="dr-client-left">
                ${data.avatarHtml}
                <div>${drawerIdentityHtml}</div>
            </div>
            <i class="fa-solid fa-chevron-left dr-client-icon"></i>
        </div>

        <div class="dr-card">
            <!-- الكارت الخاص ببيانات المنتج -->
            <div class="dr-prod-header">
                ${data.imgHtml}
                <div class="dr-prod-name">
                    ${_esc(data.prodName)} 
                    <span class="badge-qty" dir="ltr">x${_esc(data.qty)}</span> 
                    ${data.sourceBadgeHtml || ''}
                </div>
            </div>
            
            <!-- صندوق الفاتورة المالية (إما الذكي أو العادي) -->
            ${data.financialSnapshotHtml ? data.financialSnapshotHtml : `
            <div class="dr-receipt-box mb-15">
                <div class="dr-receipt-row ${fBg}" style="padding: 10px; border-radius: 8px;">
                    <span class="dr-receipt-lbl ${fColor}">${fLabel}</span>
                    <span class="dr-receipt-val price num-en fw-bold ${fColor}" dir="ltr">${fSign} ${data.priceTxt}</span>
                </div>
                ${data.exactPriceTxt ? `<div class="dr-receipt-row"><span class="dr-receipt-lbl"><i class="fa-solid fa-dollar-sign text-success"></i> المعادل بالدولار</span><span class="dr-receipt-val num-en text-success" dir="ltr">${_esc(data.exactPriceTxt)}</span></div>` : ''}
                ${data.couponRowHtml || ''} 
                ${data.originalPriceRowHtml || ''}
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-box-open text-warning"></i> التكلفة الإجمالية</span>
                    <span class="dr-receipt-val num-en text-warning" dir="ltr">${_esc(data.unitCostTxt)}</span>
                </div>
            </div>
            `}
            
            <!-- صندوق التتبع الجنائي والنظامي (System Logs) -->
            <div class="dr-receipt-box" style="border-top: 1px solid var(--border); padding-top: 15px;">
                <div class="dr-inputs-title text-muted mb-10"><i class="fa-solid fa-server"></i> بيانات التتبع الجنائي (System Logs)</div>
                
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-circle-info"></i> حالة الطلب</span>
                    <span class="oh-status ${data.statusClass}">${_esc(data.sText)}</span>
                </div>
                
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-regular fa-calendar-plus"></i> توقيت إنشاء الطلب</span>
                    <span class="dr-receipt-val num-en copyable-admin" dir="ltr" data-action="copy-text" data-copy-text="${_esc(data.dateTxt)}">${_esc(data.dateTxt)}</span>
                </div>          
                
                ${data.executionTimeRowHtml || ''}
                ${data.durationHtml || ''}
                ${data.apiTrackingRowHtml || ''}
                ${data.extraMetaHtml || ''}
                
                ${data.fxRateStr ? `
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-calculator text-warning"></i> سعر الصرف المطبق</span>
                    <span class="dr-receipt-val num-en text-warning" dir="ltr">${_esc(data.fxRateStr)}</span>
                </div>` : ''}
            </div>
        </div>
        
        <!-- ملحقات الطلب من مدخلات ورسائل -->
        ${data.inputsCardHtml || ''} 
        ${data.codeHtml || ''} 
        ${data.replyHtml || ''}`;
    },
    
    // 🛡️ [أزرار المعالجة في أسفل النافذة - API Override Shield]
    orderDrawerFooter: (status, orderId, isApi = false) => {
        if (status === 'pending' || status === 'processing') {
            if (isApi) {
                return `
                <button class="btn btn-warning" data-action="submit-order" data-type="accept" data-id="${_esc(orderId)}" title="تحذير: هذا سيوقف أتمتة المورد وتضطر لتسليمه يدوياً">
                    <i class="fa-solid fa-triangle-exclamation"></i> تخطي الـ API (إكمال يدوي)
                </button>
                <button class="btn btn-red" data-action="submit-order" data-type="reject" data-id="${_esc(orderId)}">
                    <i class="fa-solid fa-xmark"></i> رفض الطلب
                </button>`;
            } else {
                return `
                <button class="btn btn-green" data-action="submit-order" data-type="accept" data-id="${_esc(orderId)}">
                    <i class="fa-solid fa-check"></i> قبول
                </button>
                <button class="btn btn-red" data-action="submit-order" data-type="reject" data-id="${_esc(orderId)}">
                    <i class="fa-solid fa-xmark"></i> رفض
                </button>`;
            }
        } else if (status === 'completed') {
            return `
            <button class="btn btn-refund-sky" data-action="request-order-refund" data-id="${_esc(orderId)}">
                <i class="fa-solid fa-rotate-left"></i> استرجاع وإلغاء الطلب
            </button>`;
        } else {
            return `
            <div class="drawer-locked-msg">
                <i class="fa-solid fa-lock icon-ms-1"></i> هذا الطلب مغلق (${status === 'rejected' ? 'مرفوض' : 'مسترجع'})
            </div>`;
        }
    }
};
