// ============================================================================
// 📦 قوالب الطلبات (modules/orders/ordersTemplates.js)
// 🎯 الوظيفة: توليد الـ HTML بنظام الهيكلة المرنة (Flexbox) وبدون ترقيعات
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;
const _fmtDate = Utils.formatDate;

export const OrdersTemplates = {
    emptyOrders: () => `<div class="empty-state"><i class="fa-solid fa-box-open"></i><span>لا توجد طلبات تطابق الفلتر أو التبويب الحالي</span></div>`,

    orderCard: (o, userName, inputData) => {
        const exactStatus = o.status || 'pending';
        const isComp = exactStatus === 'completed', isRej = exactStatus === 'rejected', isRef = (exactStatus === 'refunded' || exactStatus === 'returned');
        const cardCls = isComp ? 'completed' : (isRej ? 'rejected' : (isRef ? 'refunded' : 'pending'));
        const lockCls = (isRej || isRef) ? 'locked' : '';
        const qty = o.qty || 1;

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

        // 🌟 المحرك البصري المالي للكرت (الأثر الفعلي على المحفظة)
        let sign = '';
        let priceColor = '';

        if (isRef || isRej) {
            sign = '+';
            priceColor = 'text-success'; // تم إعادة المبلغ للمحفظة
        } else if (isComp) {
            sign = '-';
            priceColor = 'text-danger'; // تم الخصم النهائي
        } else {
            sign = '-';
            priceColor = 'text-warning'; // قيد الانتظار
        }

        const absPrice = Math.abs(o.price || 0);
        const cCode = (o.currency || o.priceCurrency || 'USD').replace('$', 'USD');
        
        let finalPriceHtml = '';
        if (o.dualPriceTxt) {
            // تنظيف أي إشارات قديمة وتركيب الإشارة الديناميكية الجديدة
            finalPriceHtml = `<span class="${priceColor}">${sign} ${o.dualPriceTxt.replace(/[-+]/g, '').trim()}</span>`;
        } else {
            finalPriceHtml = `<span class="single-price ${priceColor}">${sign} ${RenderHelpers.formatMoney(absPrice, cCode, 2)}</span>`;
        }

        return `
        <div id="order-card-${_esc(o.id)}" class="o-card ${cardCls} ${lockCls}" data-status="${exactStatus}" data-action="open-order-drawer" data-id="${_esc(o.id)}">
            <div class="corner-tag-id num-en copyable-admin" dir="ltr" lang="en" title="انقر لنسخ رقم الطلب" data-action="copy-text" data-copy-text="${_esc(o.id)}">#ORD_${_esc(o.id)}</div>
            <div class="corner-tag-time num-en" dir="ltr" lang="en"><i class="fa-regular fa-clock"></i> ${o.time ? _fmtDate(o.time) : '---'}</div>
            
            <div class="o-card-header-row">
                <div class="o-card-img-fallback"><i class="fa-solid fa-cube"></i></div>
                <div class="o-card-content">
                    <div class="o-card-title">${_esc(o.product || 'منتج')} <span class="badge-qty copyable-admin" dir="ltr" lang="en" title="انقر لنسخ الكمية" data-action="copy-text" data-copy-text="${qty}">x${_enNum(qty)}</span></div>
                    <div class="o-card-meta">
                        <div class="o-card-user"><i class="fa-solid fa-user o-card-user-icon"></i> <span class="user-name-text">${_esc(userName)}</span> <span class="uid-capsule" title="انقر لنسخ رقم العميل" data-action="copy-text" data-copy-text="${_esc(o.userId)}"><i class="fa-solid fa-hashtag"></i>${_esc(o.userId)}</span></div>
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

    orderDrawerHeader: (orderId) => `
        <div class="dh-title-wrap">
            <div class="dh-title">تفاصيل الطلب</div>
            <div class="dr-order-stamp num-en copyable-admin" dir="ltr" lang="en" data-action="copy-text" data-copy-text="${orderId}">#${orderId}</div>
        </div>
        <div class="drawer-close" data-action="close-drawer" data-type="order">
            <i class="fa-solid fa-xmark"></i>
        </div>`,
        
    drawerAvatar: (imgSrc, firstLetter) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-avatar dr-avatar-fit zoomable-img" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-avatar">${firstLetter}</div>`,

    drawerProdImg: (imgSrc) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-prod-img zoomable-img" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-prod-placeholder"><i class="fa-solid fa-box"></i></div>`,

    drawerBankImg: (imgSrc) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-prod-img zoomable-img" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-prod-placeholder"><i class="fa-solid fa-building-columns"></i></div>`,

    orderDurationRow: (durationTxt) => `
        <div class="dr-receipt-row">
            <span class="dr-receipt-lbl"><i class="fa-solid fa-stopwatch text-info"></i> مدة الإنجاز</span>
            <span class="dr-receipt-val num-en text-info copyable-admin" dir="ltr" lang="en" data-action="copy-text" data-copy-text="${durationTxt}">${durationTxt}</span>
        </div>`,

    orderInputsCard: (parsedInputs) => {
        const inputsHtml = parsedInputs.map(inp => `
            <div class="copy-row copyable-admin" data-action="copy-text" data-copy-text="${inp.value}">
                <div class="cr-content">
                    <span class="cr-label">${inp.label}</span>
                    <span class="cr-value num-en" dir="ltr" lang="en">${inp.value}</span>
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
            <div class="copy-row success-copy-row copyable-admin" data-action="copy-text" data-copy-text="${codeText}">
                <div class="cr-content cr-content-center w-100">
                    <span class="cr-value num-en" dir="ltr" lang="en">${codeText}</span>
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
        
        const profitClass = snap.profit >= 0 ? 'text-success' : 'text-danger';
        const profitSign = snap.profit > 0 ? '+' : '';
        
        // 🌟 المحرك البصري لصافي المحفظة داخل صندوق التحليل الذكي
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
        if (snap.offerName) discountsHtml += `<div class="fs-11 text-muted mb-5"><i class="fa-solid fa-bolt text-warning"></i> تخفيض عرض (${_esc(snap.offerName)}): <span class="num-en text-danger" dir="ltr">-${RenderHelpers.formatMoney(snap.offerDiscount || 0, 'USD', 4)}</span></div>`;
        if (snap.couponCode) discountsHtml += `<div class="fs-11 text-muted"><i class="fa-solid fa-ticket text-purple"></i> كوبون خصم (${_esc(snap.couponCode)}): <span class="num-en text-danger" dir="ltr">-${RenderHelpers.formatMoney(snap.couponDiscount || 0, 'USD', 4)}</span></div>`;

        const firewallHtml = snap.isFirewallActive || snap.isFirewallTriggered ? `<div class="mt-10 p-8" style="background: var(--glass-bg); border: 1px dashed var(--danger); border-radius: 6px; font-size: 11px; color: var(--danger);"><i class="fa-solid fa-shield-halved"></i> <b>تنبيه حماية:</b> تم منع البيع بخسارة! تم رفع السعر ليعادل رأس المال.</div>` : '';

        // 🌟 تنسيق اسم المستوى بالأقواس والشرطة السفلية
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
                <span class="dr-receipt-val num-en text-warning" dir="ltr" lang="en">${RenderHelpers.formatMoney(snap.cost, 'USD', 4)}</span>
            </div>
            
            <div class="dr-receipt-row">
                <span class="dr-receipt-lbl"><i class="fa-solid fa-crown text-gold"></i> سعر البيع <span class="text-muted fs-11">${formattedTierName}</span></span>
                <span class="dr-receipt-val num-en" dir="ltr" lang="en">${RenderHelpers.formatMoney(snap.tierPrice || snap.originalPrice || snap.baseSellPrice, 'USD', 4)}</span>
            </div>

            ${discountsHtml ? `<div class="mt-10 mb-10 p-10" style="background: var(--primary-glow); border: 1px solid var(--line-color); border-radius: 6px;">${discountsHtml}</div>` : ''}

            <div class="dr-receipt-row mt-10 ${finalBgClass}" style="border-top: 1px dashed var(--border); padding-top: 10px;">
                <span class="dr-receipt-lbl fw-bold ${finalColorClass}">${finalLabel}</span>
                <span class="dr-receipt-val price num-en fw-bold ${finalColorClass}" dir="ltr" lang="en">${finalSign} ${RenderHelpers.formatMoney(Math.abs(snap.finalPrice), 'USD', 4)}</span>
            </div>

            <div class="dr-receipt-row mt-10">
                <span class="dr-receipt-lbl fw-bold"><i class="fa-solid fa-chart-pie ${profitClass}"></i> الربح الصافي</span>
                <span class="dr-receipt-val num-en fw-bold ${profitClass}" dir="ltr" lang="en">${isCompleted ? profitSign + RenderHelpers.formatMoney(snap.profit, 'USD', 4) : '<span class="text-muted fs-11">يُحسب عند الاكتمال</span>'} <span class="fs-11 text-muted">(${_enNum(snap.marginPct, 1)}%)</span></span>
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

        return `
        <div class="dr-card dr-client" data-action="view-user" data-id="${data.userId}">
            <div class="dr-client-left">
                ${data.avatarHtml}
                <div>
                    <span class="dr-client-name">${data.displayUser}</span>
                    <span class="uid-capsule" title="رقم العميل"><i class="fa-solid fa-hashtag"></i>${data.userId}</span>
                </div>
            </div>
            <i class="fa-solid fa-chevron-left dr-client-icon"></i>
        </div>

        <div class="dr-card">
            <div class="dr-prod-header">
                ${data.imgHtml}
                <div class="dr-prod-name">
                    ${data.prodName} 
                    <span class="badge-qty copyable-admin" dir="ltr" lang="en" data-action="copy-text" data-copy-text="${data.qty}">x${data.qty}</span>
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
                    <span class="dr-receipt-val num-en text-success" dir="ltr" lang="en">${data.exactPriceTxt}</span>
                </div>` : ''}
                ${data.couponRowHtml || ''}
                ${data.originalPriceRowHtml || ''}
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-box-open text-warning"></i> التكلفة الإجمالية</span>
                    <span class="dr-receipt-val num-en text-warning" dir="ltr" lang="en">${data.unitCostTxt}</span>
                </div>
            </div>
            `}

            <div class="dr-receipt-box" style="${data.financialSnapshotHtml ? 'border-top: 1px solid var(--border); padding-top: 15px;' : ''}">
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-circle-info"></i> الحالة</span>
                    <span class="oh-status ${data.statusClass}">${data.sText}</span>
                </div>
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-regular fa-clock"></i> توقيت الطلب</span>
                    <span class="dr-receipt-val num-en copyable-admin" dir="ltr" lang="en" data-action="copy-text" data-copy-text="${data.dateTxt}">${data.dateTxt}</span>
                </div>          
                ${data.durationHtml || ''}
                ${data.fxRateStr ? `
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-calculator text-warning"></i> سعر الصرف</span>
                    <span class="dr-receipt-val num-en text-warning" dir="ltr" lang="en">${data.fxRateStr}</span>
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
            <button class="btn btn-green" data-action="submit-order" data-type="accept" data-id="${orderId}">
                <i class="fa-solid fa-check"></i> قبول
            </button>
            <button class="btn btn-red" data-action="submit-order" data-type="reject" data-id="${orderId}">
                <i class="fa-solid fa-xmark"></i> رفض
            </button>`;
        } 
        else if (status === 'completed') {
            return `
            <button class="btn btn-refund-sky" data-action="request-order-refund" data-id="${orderId}">
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
