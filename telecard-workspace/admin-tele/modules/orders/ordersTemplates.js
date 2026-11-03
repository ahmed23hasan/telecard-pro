// ============================================================================
// 📦 قوالب الطلبات (modules/orders/ordersTemplates.js) - النسخة الماسية V16.0 💎
// 🎯 الوظيفة: توليد بطاقات الطلبات، الدرج الجانبي الجنائي، والتحليل المالي الذكي.
// 🚀 التحديث (V16.0 - Accurate Source Badges & Late Supplier Code Alert):
// 1. Unified Source Detection 🔌: التمييز الدقيق بين (API / مورد / آلي خزنة / يدوي) حتى للطلبات المعلقة والمرفوضة.
// 2. Late Supplier Code Badge 🚨: إظهار تنبيه بصري مباشر على البطاقة الخارجية إذا وصل كود متأخر من المورد لطلب مرفوض.
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { AdminData } from '../../adminData.js'; 

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;

export const OrdersTemplates = {
    
    ordersSourceFilters: (activeState) => `
        <div class="mb-15">
            <div class="flex-between align-items-center w-100 mb-15 px-2">
                <div class="filter-label-framed">
                    <i class="fa-solid fa-filter me-1"></i> تصفية حسب المصدر
                </div>
                <button class="btn btn-outline-danger btn-compact interactive-scale" data-action="reject-all-pending" title="رفض جميع الطلبات اليدوية المعلقة وإرجاع الرصيد للعملاء">
                    <i class="fa-solid fa-ban me-1"></i> رفض المعلقة
                </button>
            </div>
            
            <div class="main-tabs-header mb-0">
                <button class="main-tab-btn interactive-scale ${activeState === 'all' ? 'active tab-warning' : ''}" data-action="filter-orders-source" data-val="all">
                    الكل
                </button>
                <button class="main-tab-btn interactive-scale ${activeState === 'api' ? 'active tab-info' : ''}" data-action="filter-orders-source" data-val="api">
                    <i class="fa-solid fa-robot me-1 ${activeState === 'api' ? '' : 'text-info'}"></i> عبر الـ API
                </button>
                <button class="main-tab-btn interactive-scale ${activeState === 'auto' ? 'active tab-success' : ''}" data-action="filter-orders-source" data-val="auto">
                    <i class="fa-solid fa-bolt me-1 ${activeState === 'auto' ? '' : 'text-success'}"></i> تسليم آلي / مورد
                </button>
                <button class="main-tab-btn interactive-scale ${activeState === 'manual' ? 'active tab-danger' : ''}" data-action="filter-orders-source" data-val="manual">
                    <i class="fa-solid fa-hand-paper me-1 ${activeState === 'manual' ? '' : 'text-warning'}"></i> تنفيذ يدوي
                </button>
            </div>
        </div>
    `,

    emptyOrders: () => RenderHelpers.emptyState('fa-solid fa-box-open text-muted', 'لا توجد طلبات', 'لا توجد طلبات تطابق الفلتر أو الحالة الحالية.'),

    orderCard: (o, userName, inputData) => {
        const exactStatus = o.status || 'pending';
        const isComp = exactStatus === 'completed', isRej = exactStatus === 'rejected', isRef = (exactStatus === 'refunded' || exactStatus === 'returned');
        const cardCls = isComp ? 'completed' : (isRej ? 'rejected' : (isRef ? 'refunded' : 'pending'));
        const lockCls = (isRej || isRef) ? 'locked' : '';
        const qty = o.qty || 1;

        const rawTime = o.time || o.createdAt;
        const timeHtml = RenderHelpers.formatSafeDate(rawTime);

        const userRec = AdminData.data.usersMap?.[o.userId] || { id: o.userId, displayId: o.userDataSnapshot?.displayId };
        const shortId = RenderHelpers.formatUserId(userRec);

        const isIdAsName = String(userName).trim() === String(shortId).replace(/<[^>]*>?/gm, '').trim() || String(userName).trim() === String(o.userId).trim();
        const clientIdentityHtml = isIdAsName 
            ? `<div class="o-card-user"><i class="fa-solid fa-user o-card-user-icon me-1"></i> <div class="uid-capsule uid-capsule-flat font-numeric" dir="ltr">${shortId}</div></div>`
            : `<div class="o-card-user"><i class="fa-solid fa-user o-card-user-icon me-1"></i> <span class="user-name-text">${_esc(userName)}</span> <div class="uid-capsule uid-capsule-flat me-1 font-numeric" dir="ltr">${shortId}</div></div>`;

        let inputHtml = '';
        if (inputData) {
            inputHtml = `
            <div class="o-card-body-row">
                <div class="o-card-input-data copyable-admin interactive-scale" title="انقر لنسخ بيانات الطلب" data-action="copy-text" data-copy-text="${_esc(o.input)}">
                    <div class="o-card-input-lbl"><i class="fa-solid fa-keyboard me-1"></i> بيانات الطلب</div>
                    <div class="o-card-input-val num-en font-numeric" dir="ltr" lang="en">${_esc(inputData)}</div>
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
        const isSupplier = Boolean(o.supplierId);
        const isAuto = (!isApi && !isSupplier && Boolean(o.vaultPoolId || o.isAutoDelivered));
        
        let sourceBadgeHtml = '';
        if (isApi) sourceBadgeHtml += `<span class="badge bg-dark text-warning fs-10 ms-2"><i class="fa-solid fa-code me-1"></i> API</span>`;
        if (isSupplier) sourceBadgeHtml += `<span class="badge bg-info-subtle text-info border border-info-subtle fs-10 ms-1"><i class="fa-solid fa-plug me-1"></i> مورد</span>`;
        else if (isAuto) sourceBadgeHtml += `<span class="badge bg-success-subtle text-success border border-success-subtle fs-10 ms-2"><i class="fa-solid fa-robot me-1"></i> آلي</span>`;
        else if (!isApi) sourceBadgeHtml += `<span class="badge bg-warning-subtle text-warning border border-warning-subtle fs-10 ms-2"><i class="fa-solid fa-hand-paper me-1"></i> يدوي</span>`;

        if (o.lateSupplierCode) {
            sourceBadgeHtml += `<span class="badge bg-danger text-white fs-10 ms-1" title="وصل كود من المورد بعد رفض الطلب! افتح التفاصيل"><i class="fa-solid fa-triangle-exclamation me-1"></i> كود متأخر</span>`;
        }

        return `
        <div id="order-card-${_esc(o.id)}" class="o-card interactive-scale ${cardCls} ${lockCls}" data-status="${exactStatus}" data-action="open-order-drawer" data-id="${_esc(o.id)}">

            <div class="corner-tag-id num-en font-numeric copyable-admin" dir="ltr" lang="en" title="المعرف الكامل: ${_esc(o.id)} (انقر للنسخ)" data-action="copy-text" data-copy-text="${_esc(o.id)}">${orderIdHtml}</div>
            <div class="corner-tag-time num-en font-numeric" dir="ltr" lang="en"><i class="fa-regular fa-clock me-1"></i> ${timeHtml}</div>
            <div class="o-card-header-row">
                <div class="o-card-img-fallback"><i class="fa-solid fa-cube"></i></div>
                <div class="o-card-content">
                    <div class="o-card-title">${_esc(o.product || 'منتج')} <span class="badge-qty copyable-admin font-numeric" dir="ltr" lang="en" title="انقر لنسخ الكمية" data-action="copy-text" data-copy-text="${qty}">x${_enNum(qty)}</span> ${sourceBadgeHtml}</div>
                    <div class="o-card-meta">
                        ${clientIdentityHtml}
                        <div class="flex-center-gap"><span class="o-card-price num-en font-numeric" dir="ltr" lang="en">${finalPriceHtml}</span></div>
                    </div>
                </div>
            </div>
            ${inputHtml}
        </div>`;
    },

    orderDrawerHeader: (orderObj) => {
        const orderId = orderObj.id;
        const formattedOrderId = RenderHelpers.formatOrderId(orderObj);
        return `
        <div class="dh-title-wrap">
            <div class="dh-title">تفاصيل الطلب</div>
            <div class="dr-order-stamp num-en font-numeric copyable-admin" dir="ltr" lang="en" title="المعرف الكامل: ${_esc(orderId)} (انقر للنسخ)" data-action="copy-text" data-copy-text="${_esc(orderId)}">
                #${formattedOrderId}
            </div>
        </div>
        <div class="drawer-close interactive-scale" data-action="close-drawer" data-type="order">
            <i class="fa-solid fa-xmark"></i>
        </div>`;
    },
    
    drawerAvatar: (imgSrc, firstLetter) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-avatar dr-avatar-fit zoomable-img interactive-scale" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-avatar">${_esc(firstLetter)}</div>`,
        
    drawerProdImg: (imgSrc) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-prod-img zoomable-img interactive-scale" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-prod-placeholder"><i class="fa-solid fa-box"></i></div>`,

    orderDurationRow: (durationTxt) => `
        <div class="dr-receipt-row">
            <span class="dr-receipt-lbl"><i class="fa-solid fa-stopwatch text-info me-1"></i> وقت المعالجة والرد</span>
            <span class="dr-receipt-val num-en text-info copyable-admin font-numeric" dir="ltr" lang="en" data-action="copy-text" data-copy-text="${_esc(durationTxt)}">${_esc(durationTxt)}</span>
        </div>
    `,

    orderInputsCard: (parsedInputs) => { 
        const inputsHtml = parsedInputs.map(inp => `
            <div class="copy-row copyable-admin interactive-scale" data-action="copy-text" data-copy-text="${_esc(inp.value)}">
                <div class="cr-content">
                    <span class="cr-label">${_esc(inp.label)}</span>
                    <span class="cr-value num-en font-numeric" dir="ltr" lang="en">${_esc(inp.value)}</span>
                </div>
                <div class="cr-icon"><i class="fa-solid fa-copy"></i></div>
            </div>`).join(''); 
        return `
        <div class="dr-card" style="border-color: var(--primary); background: linear-gradient(145deg, var(--primary-glow), var(--bg-card));">
            <div class="dr-inputs-title text-primary"><i class="fa-solid fa-keyboard me-1"></i> بيانات الطلب المُدخلة</div>
            <div class="dr-inputs-list">${inputsHtml}</div>
        </div>`; 
    },

    orderCodeCard: (codeText) => `
        <div class="dr-card dr-system-box">
            <div class="dr-inputs-title text-success"><i class="fa-solid fa-bolt me-1"></i> التسليم الآلي (الكود المُسلّم)</div>
            <div class="copy-row success-copy-row copyable-admin interactive-scale" data-action="copy-text" data-copy-text="${_esc(codeText)}">
                <div class="cr-content cr-content-center w-100">
                    <span class="cr-value num-en font-numeric" dir="ltr" lang="en">${_esc(codeText)}</span>
                </div>
                <div class="cr-icon text-success"><i class="fa-solid fa-copy"></i></div>
            </div>
        </div>
    `,

    adminReplyCard: (replyText, customTitle = 'رد المتجر المـُرسل') => `
        <div class="dr-card dr-admin-reply">
            <div class="dr-inputs-title text-info"><i class="fa-solid fa-comment-dots me-1"></i> ${customTitle}</div>
            <div class="admin-reply-content copyable-admin interactive-scale" data-action="copy-text" data-copy-text="${_esc(replyText)}">
                ${_esc(replyText).replace(/\n/g, '<br>')}
            </div>
        </div>
    `,

    orderReceiptRow: (iconClass, label, valHtml) => `
        <div class="dr-receipt-row">
            <span class="dr-receipt-lbl"><i class="${iconClass} me-1"></i> ${label}</span>
            <span class="dr-receipt-val font-numeric" dir="ltr">${valHtml}</span>
        </div>
    `,

    financialSnapshotBlock: (snap = {}, status, order = {}) => {
        const isCompleted = status === 'completed';
        const isRefundedOrRejected = ['refunded', 'rejected', 'returned'].includes(status);
        
        const localCurr = String(order.priceCurrency || 'USD').toUpperCase();
const localDeducted = Number(order.priceLocalDeducted ?? order.price ?? 0);
const baseUsd = Number(order.priceBaseUsd ?? snap.totalFinalPrice ?? 0);
const usdRatio = (localCurr !== 'USD' && localDeducted > 0 && baseUsd > 0) ? (baseUsd / localDeducted) : 1;

const sFinalPrice = baseUsd > 0 ? baseUsd : Number((snap.finalPrice ?? order.price ?? 0) * usdRatio);
const sCost = Number(snap.totalCostUsd ?? snap.costUsd ?? 0);
const sOfferDisc = Number(snap.totalOfferDiscount ?? ((Number(snap.offerDiscount || 0)) * usdRatio));
const sCouponDisc = Number(snap.totalCouponDiscount ?? ((Number(snap.couponDiscount || 0)) * usdRatio));
const rawOrigLocal = Number(snap.totalOriginalPrice ?? snap.originalPrice ?? 0);
const sTierPrice = rawOrigLocal > 0 ? (snap.totalOriginalPrice !== undefined ? rawOrigLocal : (rawOrigLocal * usdRatio)) : (sFinalPrice + sOfferDisc + sCouponDisc);
const sProfit = Number(snap.totalNetProfitUsd ?? snap.netProfitUsd ?? (sCost > 0 ? Math.max(0, sFinalPrice - sCost) : 0));
const sMargin = Number(snap.marginPct ?? (sFinalPrice > 0 && sCost > 0 ? ((sProfit / sFinalPrice) * 100) : 0));
        const localSubHtml = (localCurr !== 'USD' && localDeducted > 0)
            ? ` <span class="fs-11 text-muted">(${RenderHelpers.formatMoney(localDeducted, localCurr, 2)})</span>`
            : '';
        
        const profitClass = sProfit >= 0 ? 'text-success' : 'text-danger';
        const profitSign = sProfit > 0 ? '+' : '';
        
        let finalSign = '-';
        let finalColorClass = 'text-warning';
        let finalBgClass = '';
        let finalLabel = '<i class="fa-solid fa-hand-holding-dollar me-1"></i> المخصوم (معلق)';
        
        if (isRefundedOrRejected) { 
            finalSign = '+'; 
            finalColorClass = 'text-success'; 
            finalBgClass = 'highlight-success'; 
            finalLabel = '<i class="fa-solid fa-hand-holding-dollar me-1"></i> إجمالي المسترجع للمحفظة'; 
        } else if (isCompleted) { 
            finalSign = '-'; 
            finalColorClass = 'text-danger'; 
            finalBgClass = 'highlight-danger'; 
            finalLabel = '<i class="fa-solid fa-hand-holding-dollar me-1"></i> المخصوم من المحفظة'; 
        }
        
        let discountsHtml = '';
        if (snap.offerName) {
            discountsHtml += `
                <div class="fs-11 text-muted mb-5">
                    <i class="fa-solid fa-bolt text-warning me-1"></i> عرض ترويجي (${_esc(snap.offerName)})
                    ${sOfferDisc > 0 ? `<span class="num-en text-danger font-numeric" dir="ltr">-${RenderHelpers.formatMoney(sOfferDisc, 'USD', 2)}</span>` : ''}
                </div>`;
        }
        if (snap.couponCode) {
            discountsHtml += `
                <div class="fs-11 text-muted">
                    <i class="fa-solid fa-ticket text-primary me-1"></i> كوبون خصم (${_esc(snap.couponCode)})
                    ${sCouponDisc > 0 ? `<span class="num-en text-danger font-numeric" dir="ltr">-${RenderHelpers.formatMoney(sCouponDisc, 'USD', 2)}</span>` : ''}
                </div>`;
        }
        
        const firewallHtml = (snap.isFirewallActive || snap.isFirewallViolated) 
            ? `<div class="mt-10 p-8 firewall-alert-box">
                <i class="fa-solid fa-shield-halved me-1"></i> <b>تنبيه حماية:</b> تم منع البيع بخسارة! تم رفع السعر ليعادل رأس المال.
               </div>` 
            : '';
            
        const resolvedTierName = snap.tierName || order.tierName;
        const formattedTierName = resolvedTierName ? `(${_esc(resolvedTierName)})` : '(السعر الأساسي)';
        
        return `
            <div class="financial-snapshot-box mb-15 financial-snapshot-container" style="border-color: var(--primary); background: linear-gradient(145deg, var(--primary-glow), var(--bg-card));">
                <div class="fs-13 fw-bold text-primary mb-10"><i class="fa-solid fa-microchip me-1"></i> التحليل المالي الذكي للطلب</div>
                
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-box-open text-warning me-1"></i> التكلفة الإجمالية (رأس المال)</span>
                    <span class="dr-receipt-val num-en text-warning font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(sCost, 'USD', 2)}</span>
                </div>
                
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-crown text-gold me-1"></i> الإجمالي للطلب <span class="text-muted fs-11">${formattedTierName}</span></span>
                    <span class="dr-receipt-val num-en font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(sTierPrice, 'USD', 2)}</span>
                </div>
                
                ${discountsHtml ? `<div class="mt-10 mb-10 p-10 discounts-container-box">${discountsHtml}</div>` : ''}
                
                <div class="dr-receipt-row mt-10 ${finalBgClass} receipt-row-divider">
                    <span class="dr-receipt-lbl fw-bold ${finalColorClass}">${finalLabel}</span>
                    <span class="dr-receipt-val price num-en fw-bold ${finalColorClass} font-numeric" dir="ltr" lang="en">${finalSign} ${RenderHelpers.formatMoney(Math.abs(sFinalPrice), 'USD', 2)}${localSubHtml}</span>
                </div>
                
                <div class="dr-receipt-row mt-10">
                    <span class="dr-receipt-lbl fw-bold"><i class="fa-solid fa-chart-pie ${profitClass} me-1"></i> الربح الصافي</span>
                    <span class="dr-receipt-val num-en fw-bold ${profitClass} font-numeric" dir="ltr" lang="en">
                        ${isCompleted ? profitSign + RenderHelpers.formatMoney(sProfit, 'USD', 2) : '<span class="text-muted fs-11">يُحسب عند الاكتمال</span>'} 
                        <span class="fs-11 text-muted">(${_enNum(sMargin, 1)}%)</span>
                    </span>
                </div>
                
                ${firewallHtml}
            </div>
        `;
    },

    orderDrawerBody: (data) => {
        const isRefRej = ['refunded', 'rejected', 'returned'].includes(data.statusClass);
        const isComp = data.statusClass === 'completed';
        
        let fSign = isRefRej ? '+' : '-';
        let fColor = isRefRej ? 'text-success' : (isComp ? 'text-danger' : 'text-warning');
        let fBg = isRefRej ? 'highlight-success' : (isComp ? 'highlight-danger' : '');
        let fLabel = isRefRej ? '<i class="fa-solid fa-hand-holding-dollar me-1"></i> إجمالي المسترجع' : '<i class="fa-solid fa-hand-holding-dollar me-1"></i> المخصوم من المحفظة';
        
        const safeDisplayUser = _esc(data.displayUser);
        const isIdAsNameDrawer = String(data.displayUser).trim() === String(data.userId).trim();
        
        const drawerIdentityHtml = isIdAsNameDrawer ?
            `<div class="uid-capsule uid-capsule-flat font-numeric" dir="ltr">${data.userDisplayId}</div>` :
            `<span class="dr-client-name">${safeDisplayUser}</span><div class="uid-capsule uid-capsule-flat me-1 font-numeric" dir="ltr">${data.userDisplayId}</div>`;

        return `
        <div class="dr-card dr-client interactive-scale" data-action="view-user" data-id="${_esc(data.userId)}">
            <div class="dr-client-left">
                ${data.avatarHtml}
                <div class="d-flex align-items-center">${drawerIdentityHtml}</div>
            </div>
            <i class="fa-solid fa-chevron-left dr-client-icon"></i>
        </div>

        <div class="dr-card">
            <div class="dr-prod-header">
                ${data.imgHtml}
                <div class="dr-prod-name">
                    ${_esc(data.prodName)} 
                    <span class="badge-qty copyable-admin interactive-scale font-numeric" dir="ltr" data-action="copy-text" data-copy-text="${_esc(data.qty)}">x${_esc(data.qty)}</span> 
                    ${data.sourceBadgeHtml || ''}
                </div>
            </div>
            
            ${data.financialSnapshotHtml ? data.financialSnapshotHtml : `
            <div class="dr-receipt-box mb-15">
                <div class="dr-receipt-row ${fBg} receipt-row-highlight">
                    <span class="dr-receipt-lbl ${fColor}">${fLabel}</span>
                    <span class="dr-receipt-val price num-en fw-bold ${fColor} font-numeric" dir="ltr">${fSign}${data.priceTxt}</span>
                </div>
                ${data.exactPriceTxt ? `<div class="dr-receipt-row"><span class="dr-receipt-lbl"><i class="fa-solid fa-dollar-sign text-success me-1"></i> المعادل بالدولار</span><span class="dr-receipt-val num-en text-success font-numeric" dir="ltr">${_esc(data.exactPriceTxt)}</span></div>` : ''}
                ${data.couponRowHtml || ''}${data.originalPriceRowHtml || ''}

                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-box-open text-warning me-1"></i> التكلفة الإجمالية</span>
                    <span class="dr-receipt-val num-en text-warning font-numeric" dir="ltr">${_esc(data.unitCostTxt)}</span>
                </div>
            </div>
            `}
            
            <div class="dr-receipt-box tracking-box-divider">
                <div class="dr-inputs-title text-muted mb-10"><i class="fa-solid fa-server me-1"></i> بيانات التتبع الجنائي (System Logs)</div>
                
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-circle-info me-1"></i> حالة الطلب</span>
                    <span class="oh-status ${data.statusClass}">${_esc(data.sText)}</span>
                </div>
                
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-regular fa-calendar-plus me-1"></i> توقيت إنشاء الطلب</span>
                    <span class="dr-receipt-val num-en copyable-admin interactive-scale font-numeric" dir="ltr" data-action="copy-text" data-copy-text="${_esc(data.dateTxt)}">${_esc(data.dateTxt)}</span>
                </div>          
                
                ${data.executionTimeRowHtml || ''}
                ${data.durationHtml || ''}
                ${data.apiTrackingRowHtml || ''}
                ${data.extraMetaHtml || ''}
                
                ${data.fxRateStr ? `
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-calculator text-warning me-1"></i> سعر الصرف المطبق</span>
                    <span class="dr-receipt-val num-en text-warning font-numeric" dir="ltr">${_esc(data.fxRateStr)}</span>
                </div>` : ''}
            </div>
        </div>
        
        ${data.inputsCardHtml || ''} 
        ${data.codeHtml || ''} 
        ${data.replyHtml || ''}`;
    },
    
    orderDrawerFooter: (status, orderId, isApi = false) => {
        if (status === 'pending' || status === 'processing') {
            if (isApi) {
                return `
                <div class="modal-actions-row m-0 p-0 border-0">
                    <button class="btn btn-primary interactive-scale w-100" data-action="submit-order" data-type="accept" data-id="${_esc(orderId)}" title="تحذير: هذا سيوقف أتمتة المورد وتضطر لتسليمه يدوياً">
                        <i class="fa-solid fa-triangle-exclamation me-1"></i> تخطي الـ API (إكمال يدوي)
                    </button>
                    <button class="btn btn-outline-danger interactive-scale w-100" data-action="submit-order" data-type="reject" data-id="${_esc(orderId)}">
                        <i class="fa-solid fa-xmark me-1"></i> رفض
                    </button>
                </div>`;
            } else {
                return `
                <div class="modal-actions-row m-0 p-0 border-0">
                    <button class="btn btn-primary interactive-scale w-100" data-action="submit-order" data-type="accept" data-id="${_esc(orderId)}">
                        <i class="fa-solid fa-check me-1"></i> قبول وتسليم
                    </button>
                    <button class="btn btn-outline-danger interactive-scale w-100" data-action="submit-order" data-type="reject" data-id="${_esc(orderId)}">
                        <i class="fa-solid fa-xmark me-1"></i> رفض
                    </button>
                </div>`;
            }
        } else if (status === 'completed') {
            return `
            <div class="modal-actions-row m-0 p-0 border-0">
                <button class="btn btn-outline-danger interactive-scale w-100" data-action="request-order-refund" data-id="${_esc(orderId)}">
                    <i class="fa-solid fa-rotate-left me-1"></i> استرجاع وإلغاء الطلب
                </button>
            </div>`;
        } else {
            return `
            <div class="drawer-locked-msg">
                <i class="fa-solid fa-lock icon-ms-1"></i> هذا الطلب مغلق (${status === 'rejected' ? 'مرفوض' : 'مسترجع'})
            </div>`;
        }
    },

    orderDrawerModal: () => `
        <div class="order-drawer" id="order-drawer" data-action="ignore-click">
            <div class="drawer-header" id="drawer-header-content">
            </div>
            
            <div class="drawer-scroll-area custom-scrollbar">
                <div class="drawer-body" id="drawer-body-content">
                </div>
                
                <div class="dr-card mt-15" id="order-note-wrapper">
                    <!-- 🚀 1. حقل كود البطاقة للطلبات اليدوية -->
                    <div class="form-group mb-10" id="order-delivered-code-group">
                        <label class="form-label fs-12 text-success fw-bold">
                            <i class="fa-solid fa-barcode me-1"></i> كود البطاقة / الكوبون المـُسلّم للعميل (اختياري)
                        </label>
                        <input type="text" id="order-modal-delivered-code" class="form-input num-en font-numeric" dir="ltr" placeholder="أدخل كود البطاقة هنا (مثال: ABCD-1234-EFGH)">
                        <small class="text-muted fs-10 d-block mt-4"><i class="fa-solid fa-circle-info me-1"></i> اتركه فارغاً إذا كان المنتج شحناً مباشراً للألعاب (بدون كود).</small>
                    </div>

                    <!-- 💬 2. خانة الملاحظة النصية تحته مباشرة -->
                    <div class="form-group mb-0">
                        <label class="form-label fs-12"><i class="fa-solid fa-pen-to-square me-1"></i> ملاحظة للإدارة أو العميل (اختياري)</label>
                        <textarea class="form-input dr-textarea" id="order-modal-note" placeholder="اكتب سبب الرفض أو رسالة مرفقة مع الطلب..." rows="2"></textarea>
                    </div>
                </div>                <div class="drawer-footer" id="drawer-footer-actions">
                </div>
            </div>
        </div>
    `
};