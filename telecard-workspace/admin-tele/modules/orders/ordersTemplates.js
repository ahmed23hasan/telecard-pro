// ============================================================================
// 📦 قوالب الطلبات (modules/orders/ordersTemplates.js) - النسخة الماسية V4.3 💎
// 🎯 الوظيفة: توليد الـ HTML بنظام الهيكلة المرنة (Flexbox) وبدون ترقيعات
// 🚀 التحديث: القضاء على ثغرة التكرار المبطن في الكروت باستخدام الخرائط السريعة
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { AdminData } from '../../adminData.js'; 

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;

export const OrdersTemplates = {
    emptyOrders: () => `<div class="empty-state"><i class="fa-solid fa-box-open"></i><span>لا توجد طلبات تطابق الفلتر أو التبويب الحالي</span></div>`,

    orderCard: (o, userName, inputData) => {
        const exactStatus = o.status || 'pending';
        const isComp = exactStatus === 'completed', isRej = exactStatus === 'rejected', isRef = (exactStatus === 'refunded' || exactStatus === 'returned');
        const cardCls = isComp ? 'completed' : (isRej ? 'rejected' : (isRef ? 'refunded' : 'pending'));
        const lockCls = (isRej || isRef) ? 'locked' : '';
        const qty = o.qty || 1;

        const rawTime = o.time || o.createdAt;
        const timeHtml = RenderHelpers.formatSafeDate(rawTime);

        // 🌟 ⚡ التحديث الفائق: استدعاء العميل فورا بـ O(1) من الخريطة بدلا من التكرار المبطن البطيء
        const userRec = AdminData.data.usersMap?.[o.userId] || (AdminData.data.users || []).find(u => String(u.id) === String(o.userId)) || {};
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

        let sign = '';
        let priceColor = '';

        if (isRef || isRej) {
            sign = '+';
            priceColor = 'text-success'; 
        } else if (isComp) {
            sign = '-';
            priceColor = 'text-danger'; 
        } else {
            sign = '-';
            priceColor = 'text-warning'; 
        }

        const absPrice = Math.abs(o.price || 0);
        const cCode = (o.currency || o.priceCurrency || 'USD').replace('$', 'USD');
        
        let finalPriceHtml = '';
        if (o.dualPriceTxt) {
            finalPriceHtml = `<span class="${priceColor}">${sign} ${o.dualPriceTxt.replace(/[-+]/g, '').trim()}</span>`;
        } else {
            finalPriceHtml = `<span class="single-price ${priceColor}">${sign} ${RenderHelpers.formatMoney(absPrice, cCode, 2)}</span>`;
        }

        const orderIdHtml = RenderHelpers.formatOrderId(o);

        return `
        <div id="order-card-${_esc(o.id)}" class="o-card ${cardCls} ${lockCls}" data-status="${exactStatus}" data-action="open-order-drawer" data-id="${_esc(o.id)}">
            <div class="corner-tag-id num-en copyable-admin" dir="ltr" lang="en" title="انقر لنسخ رقم الطلب" data-action="copy-text" data-copy-text="${_esc(o.id)}">#${orderIdHtml}</div>
            
            <div class="corner-tag-time num-en" dir="ltr" lang="en"><i class="fa-regular fa-clock"></i> ${timeHtml}</div>
            
            <div class="o-card-header-row">
                <div class="o-card-img-fallback"><i class="fa-solid fa-cube"></i></div>
                <div class="o-card-content">
                    <div class="o-card-title">${_esc(o.product || 'منتج')} <span class="badge-qty copyable-admin" dir="ltr" lang="en" title="انقر لنسخ الكمية" data-action="copy-text" data-copy-text="${qty}">x${_enNum(qty)}</span></div>
                    <div class="o-card-meta">
                        ${clientIdentityHtml}
                        <div class="flex-center-gap"><span class="o-card-price num-en" dir="ltr" lang="en">${finalPriceHtml}</span></div>
                    </div>
                </div>
            </div>
            ${inputHtml}
        </div>`;
    },

    // =========================================================
    // 📦 قوالب درج الطلبات (Order Drawer Templates)
    // =========================================================

    orderDrawerHeader: (orderId) => {
        const formattedOrderId = RenderHelpers.formatOrderId(orderId);
        return `
        <div class="dh-title-wrap">
            <div class="dh-title">تفاصيل الطلب</div>
            <div class="dr-order-stamp num-en copyable-admin" dir="ltr" lang="en" data-action="copy-text" data-copy-text="${_esc(orderId)}">#${formattedOrderId}</div>
        </div>
        <div class="drawer-close" data-action="close-drawer" data-type="order">
            <i class="fa-solid fa-xmark"></i>
        </div>`;
    },
        
    drawerAvatar: (imgSrc, firstLetter) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-avatar dr-avatar-fit zoomable-img" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-avatar">${_esc(firstLetter)}</div>`,

    drawerProdImg: (imgSrc) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-prod-img zoomable-img" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-prod-placeholder"><i class="fa-solid fa-box"></i></div>`,

    drawerBankImg: (imgSrc) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-prod-img zoomable-img" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-prod-placeholder"><i class="fa-solid fa-building-columns"></i></div>`,

    orderDurationRow: (durationTxt) => `
        <div class="dr-receipt-row">
            <span class="dr-receipt-lbl"><i class="fa-solid fa-stopwatch text-info"></i> مدة الإنجاز</span>
            <span class="dr-receipt-val num-en text-info copyable-admin" dir="ltr" lang="en" data-action="copy-text" data-copy-text="${_esc(durationTxt)}">${_esc(durationTxt)}</span>
        </div>`,

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
            <div class="dr-inputs-title"><i class="fa-solid fa-keyboard text-primary"></i> بيانات الطلب</div>
            <div class="dr-inputs-list">${inputsHtml}</div>
        </div>`;
    },

    orderCodeCard: (codeText) => `
        <div class="dr-card dr-system-box">
            <div class="dr-inputs-title text-success"><i class="fa-solid fa-bolt"></i> التسليم الآلي (الكود المُسلّم)</div>
            <div class="copy-row success-copy-row copyable-admin" data-action="copy-text" data-copy-text="${_esc(codeText)}">
                <div class="cr-content cr-content-center w-100">
                    <span class="cr-value num-en" dir="ltr" lang="en">${_esc(codeText)}</span>
                </div>
                <div class="cr-icon text-success"><i class="fa-solid fa-copy"></i></div>
            </div>
        </div>`,

    adminReplyCard: (replyText, customTitle = 'رد المتجر المـُرسل') => `
        <div class="dr-card dr-admin-reply">
            <div class="dr-inputs-title text-info"><i class="fa-solid fa-comment-dots"></i> ${customTitle}</div>
            <div class="admin-reply-content copyable-admin" data-action="copy-text" data-copy-text="${_esc(replyText)}">
                ${_esc(replyText).replace(/\n/g, '<br>')}
            </div>
        </div>`,

    orderReceiptRow: (iconClass, label, valHtml) => `
        <div class="dr-receipt-row">
            <span class="dr-receipt-lbl"><i class="${iconClass}"></i> ${label}</span>
            <span class="dr-receipt-val" dir="ltr">${valHtml}</span>
        </div>`,
    
    financialSnapshotBlock: (snap, status) => {
        const isCompleted = status === 'completed';
        const isRefundedOrRejected = status === 'refunded' || status === 'rejected' || status === 'returned';
        
        const sCost = Number(snap.costUsd ?? snap.cost ?? 0);
        const sTierPrice = Number(snap.tierPriceUsd ?? snap.tierPrice ?? snap.originalPriceUsd ?? snap.originalPrice ?? snap.baseSellPrice ?? 0);
        const sOfferDisc = Number(snap.offerDiscountUsd ?? snap.offerDiscount ?? 0);
        const sCouponDisc = Number(snap.couponDiscountUsd ?? snap.couponDiscount ?? 0);
        const sFinalPrice = Number(snap.finalPriceUsd ?? snap.finalPrice ?? 0);
        const sProfit = Number(snap.netProfitUsd ?? snap.profit ?? 0);
        const sMargin = Number(snap.marginPct ?? 0);
        
        const profitClass = sProfit >= 0 ? 'text-success' : 'text-danger';
        const profitSign = sProfit > 0 ? '+' : '';
        
        let finalSign = '';
        let finalColorClass = '';
        let finalBgClass = '';
        let finalLabel = '';
        
        if (isRefundedOrRejected) {
            finalSign = '+';
            finalColorClass = 'text-success';
            finalBgClass = 'highlight-success';
            finalLabel = '<i class="fa-solid fa-hand-holding-dollar"></i> إجمالي المسترجع للمحفظة';
        } else if (isCompleted) {
            finalSign = '-';
            finalColorClass = 'text-danger';
            finalBgClass = 'highlight-danger';
            finalLabel = '<i class="fa-solid fa-hand-holding-dollar"></i> إجمالي المخصوم من المحفظة';
        } else {
            finalSign = '-';
            finalColorClass = 'text-warning';
            finalBgClass = '';
            finalLabel = '<i class="fa-solid fa-hand-holding-dollar"></i> إجمالي المخصوم (معلق)';
        }
        
        let discountsHtml = '';
        if (snap.offerName) discountsHtml += `<div class="fs-11 text-muted mb-5"><i class="fa-solid fa-bolt text-warning"></i> تخفيض عرض (${_esc(snap.offerName)}): <span class="num-en text-danger" dir="ltr">-${RenderHelpers.formatMoney(sOfferDisc, 'USD', 4)}</span></div>`;
        if (snap.couponCode) {
            discountsHtml += `<div class="nm-receipt-line discount-line">
                <span class="line-lbl"><i class="fa-solid fa-ticket"></i> كوبون (${_esc(snap.couponCode)})</span>
                <span class="num-en" dir="ltr">-${RenderHelpers.formatMoney(couponDiscount, 'USD')}</span>
            </div>`;
        }
        
        let priceSectionHtml = '';
        
        const hasCoupon = couponDiscount > 0;
        const hasSale = offerDiscount > 0;
        
        let breakdownDetails = `
            <div class="nm-receipt-line">
                <span class="line-lbl"><i class="fa-solid fa-box-open"></i> السعر الأساسي</span>
                <span class="old-amt num-en" dir="ltr">${RenderHelpers.formatMoney(originalPrice, 'USD')}</span>
            </div>`;
            
        if (hasSale) {
            breakdownDetails += `
            <div class="nm-receipt-line sale-line">
                <span class="line-lbl"><i class="fa-solid fa-tag"></i> تخفيض العرض</span>
                <span class="num-en" dir="ltr">-${RenderHelpers.formatMoney(offerDiscount, 'USD')}</span>
            </div>`;
        }
        
        const firewallHtml = snap.isFirewallActive || snap.isFirewallTriggered ? `<div class="mt-10 p-8" style="background: var(--glass-bg); border: 1px dashed var(--danger); border-radius: 6px; font-size: 11px; color: var(--danger);"><i class="fa-solid fa-shield-halved"></i> <b>تنبيه حماية:</b> تم منع البيع بخسارة! تم رفع السعر ليعادل رأس المال.</div>` : '';
        
        let formattedTierName = '(السعر المخصص)';
        if (snap.tierName) {
            let safeName = _esc(snap.tierName);
            safeName = safeName.replace(/\s*\(/g, '_').replace(/\)/g, '').trim();
            formattedTierName = `(مستوى ${safeName})`;
        }
        
        return `
            <div class="financial-snapshot-box mb-15" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 12px;">
                <div class="fs-12 fw-bold text-primary mb-10"><i class="fa-solid fa-microchip"></i> التحليل المالي الذكي للطلب</div>
                
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-box-open text-warning"></i> تكلفة المنتج (رأس المال)</span>
                    <span class="dr-receipt-val num-en text-warning" dir="ltr" lang="en">${RenderHelpers.formatMoney(sCost, 'USD', 4)}</span>
                </div>
                
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-crown text-gold"></i> سعر البيع <span class="text-muted fs-11">${formattedTierName}</span></span>
                    <span class="dr-receipt-val num-en" dir="ltr" lang="en">${RenderHelpers.formatMoney(sTierPrice, 'USD', 4)}</span>
                </div>

                ${discountsHtml ? `<div class="mt-10 mb-10 p-10" style="background: var(--primary-glow); border: 1px solid var(--line-color); border-radius: 6px;">${discountsHtml}</div>` : ''}

                <div class="dr-receipt-row mt-10 ${finalBgClass}" style="border-top: 1px dashed var(--border); padding-top: 10px;">
                    <span class="dr-receipt-lbl fw-bold ${finalColorClass}">${finalLabel}</span>
                    <span class="dr-receipt-val price num-en fw-bold ${finalColorClass}" dir="ltr" lang="en">${finalSign} ${RenderHelpers.formatMoney(Math.abs(sFinalPrice), 'USD', 4)}</span>
                </div>

                <div class="dr-receipt-row mt-10">
                    <span class="dr-receipt-lbl fw-bold"><i class="fa-solid fa-chart-pie ${profitClass}"></i> الربح الصافي</span>
                    <span class="dr-receipt-val num-en fw-bold ${profitClass}" dir="ltr" lang="en">${isCompleted ? profitSign + RenderHelpers.formatMoney(sProfit, 'USD', 4) : '<span class="text-muted fs-11">يُحسب عند الاكتمال</span>'} <span class="fs-11 text-muted">(${_enNum(sMargin, 1)}%)</span></span>
                </div>

                ${firewallHtml}
            </div>`;
    },

    orderDrawerBody: (data) => {
        const isRefRej = data.statusClass === 'refunded' || data.statusClass === 'rejected' || data.statusClass === 'returned';
        const isComp = data.statusClass === 'completed';
        
        let fallbackSign = isRefRej ? '+' : '-';
        let fallbackColor = isRefRej ? 'text-success' : (isComp ? 'text-danger' : 'text-warning');
        let fallbackBg = isRefRej ? 'highlight-success' : (isComp ? 'highlight-danger' : '');
        let fallbackLabel = isRefRej ? '<i class="fa-solid fa-hand-holding-dollar"></i> إجمالي المسترجع' : '<i class="fa-solid fa-hand-holding-dollar"></i> المخصوم من المحفظة';

        const cleanPriceTxt = data.priceTxt ? data.priceTxt.replace(/[-+]/g, '').trim() : '';

        const isIdAsNameDrawer = String(data.displayUser).trim() === String(data.userDisplayId).trim() || String(data.displayUser).trim() === String(data.userId).trim();
        const drawerIdentityHtml = isIdAsNameDrawer
            ? `<span class="uid-capsule copyable-admin" title="انقر للنسخ" data-action="copy-text" data-copy-text="${_esc(data.userDisplayId)}"><i class="fa-solid fa-hashtag"></i>${_esc(data.userDisplayId)}</span>`
            : `<span class="dr-client-name">${_esc(data.displayUser)}</span><span class="uid-capsule copyable-admin" title="انقر للنسخ" data-action="copy-text" data-copy-text="${_esc(data.userDisplayId)}"><i class="fa-solid fa-hashtag"></i>${_esc(data.userDisplayId)}</span>`;

        return `
        <div class="dr-card dr-client" data-action="view-user" data-id="${_esc(data.userId)}">
            <div class="dr-client-left">
                ${data.avatarHtml}
                <div>
                    ${drawerIdentityHtml}
                </div>
            </div>
            <i class="fa-solid fa-chevron-left dr-client-icon"></i>
        </div>

        <div class="dr-card">
            <div class="dr-prod-header">
                ${data.imgHtml}
                <div class="dr-prod-name">
                    ${_esc(data.prodName)} 
                    <span class="badge-qty copyable-admin" dir="ltr" lang="en" data-action="copy-text" data-copy-text="${_esc(data.qty)}">x${_esc(data.qty)}</span>
                </div>
            </div>
            
            ${data.financialSnapshotHtml ? data.financialSnapshotHtml : `
            <div class="dr-receipt-box">
                <div class="dr-receipt-row ${fallbackBg}" style="padding: 10px; border-radius: 8px;">
                    <span class="dr-receipt-lbl ${fallbackColor}">${fallbackLabel}</span>
                    <span class="dr-receipt-val price num-en fw-bold ${fallbackColor}" dir="ltr" lang="en">${fallbackSign} ${cleanPriceTxt}</span>
                </div>
                ${data.exactPriceTxt ? `
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-dollar-sign text-success"></i> المعادل بالدولار</span>
                    <span class="dr-receipt-val num-en text-success" dir="ltr" lang="en">${_esc(data.exactPriceTxt)}</span>
                </div>` : ''}
                ${data.couponRowHtml || ''}
                ${data.originalPriceRowHtml || ''}
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-box-open text-warning"></i> التكلفة الإجمالية</span>
                    <span class="dr-receipt-val num-en text-warning" dir="ltr" lang="en">${_esc(data.unitCostTxt)}</span>
                </div>
            </div>
            `}

            <div class="dr-receipt-box" style="${data.financialSnapshotHtml ? 'border-top: 1px solid var(--border); padding-top: 15px;' : ''}">
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-circle-info"></i> الحالة</span>
                    <span class="oh-status ${data.statusClass}">${_esc(data.sText)}</span>
                </div>
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-regular fa-clock"></i> توقيت الطلب</span>
                    <span class="dr-receipt-val num-en copyable-admin" dir="ltr" lang="en" data-action="copy-text" data-copy-text="${_esc(data.dateTxt)}">${_esc(data.dateTxt)}</span>
                </div>          
                ${data.durationHtml || ''}
                ${data.fxRateStr ? `
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-calculator text-warning"></i> سعر الصرف</span>
                    <span class="dr-receipt-val num-en text-warning" dir="ltr" lang="en">${_esc(data.fxRateStr)}</span>
                </div>` : ''}
            </div>
        </div>

        ${data.inputsCardHtml}
        ${data.codeHtml}   
        ${data.replyHtml}`;
    },

    orderDrawerFooter: (status, orderId) => {
        if (status === 'pending') {
            return `
            <button class="btn btn-green" data-action="submit-order" data-type="accept" data-id="${_esc(orderId)}">
                <i class="fa-solid fa-check"></i> قبول
            </button>
            <button class="btn btn-red" data-action="submit-order" data-type="reject" data-id="${_esc(orderId)}">
                <i class="fa-solid fa-xmark"></i> رفض
            </button>`;
        } 
        else if (status === 'completed') {
            return `
            <button class="btn btn-refund-sky" data-action="request-order-refund" data-id="${_esc(orderId)}">
                <i class="fa-solid fa-rotate-left"></i> استرجاع وإلغاء الطلب
            </button>`;
        } 
        else {
            const statusName = status === 'rejected' ? 'مرفوض' : 'مسترجع';
            return `
            <div class="drawer-locked-msg">
                <i class="fa-solid fa-lock icon-ms-1"></i> هذا الطلب مغلق (${statusName})
            </div>`;
        }
    },
};