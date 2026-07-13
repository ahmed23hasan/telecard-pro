// ============================================================================
// 🧱 مصنع قوالب الواجهات الأمامية (uiBuilders.js) - Clean Architecture
// 🎯 الوظيفة: تحويل البيانات الخام (Data) إلى نصوص HTML جاهزة للرسم
// 🚀 الفائدة: فصل التصميم (UI) عن منطق الرسم (Logic) لتسريع الأداء وتسهيل الصيانة
// ============================================================================

import { Utils } from '../utils.js';
import { RenderHelpers } from '../core/renderHelpers.js';
import { LiveStoreData } from '../dataManager.js';

export const UIBuilders = {

    // 1️⃣ بناء كرت حركة المحفظة (إيداع / شراء)
    buildWalletCard: function(tx, walletCurr, isFilterActive) {
        const isDep = tx.type === 'deposit';
        let amountPrefix = '', amountClass = '', cardClass = '', iconName = '', iconColorClass = '';
        let formattedDate = RenderHelpers.formatSafeDate(tx.time || tx.createdAt);

        if (isDep) {
            if (tx.status === 'approved') {
                amountPrefix = tx.isDeduction ? '-' : '+';
                amountClass = tx.isDeduction ? 'amt-out' : 'amt-in';
                cardClass = tx.isDeduction ? 'out' : 'in';
                iconName = tx.isDeduction ? 'fa-arrow-up-long' : 'fa-arrow-down-long';
                iconColorClass = tx.isDeduction ? 'icon-out' : 'icon-green'; 
            } else {
                amountClass = 'amt-neutral'; cardClass = 'neutral';
                if (tx.status === 'pending') { iconName = 'fa-clock'; iconColorClass = 'icon-gold'; } 
                else if (tx.status === 'rejected') { iconName = 'fa-circle-xmark'; iconColorClass = 'icon-red'; }
                else if (['refunded', 'returned'].includes(tx.status)) { iconName = 'fa-rotate-left'; iconColorClass = 'icon-cyan'; }
            }
        } else {
            if (['rejected', 'refunded', 'returned'].includes(tx.status)) {
                amountClass = 'amt-neutral'; cardClass = 'neutral';
                iconName = ['refunded', 'returned'].includes(tx.status) ? 'fa-rotate-left' : 'fa-circle-xmark';
                iconColorClass = ['refunded', 'returned'].includes(tx.status) ? 'icon-cyan' : 'icon-red';
            } else if (tx.status === 'pending') {
                amountPrefix = '-'; amountClass = 'amt-neutral'; cardClass = 'neutral'; iconName = 'fa-clock'; iconColorClass = 'icon-gold';
            } else {
                amountPrefix = '-'; amountClass = 'amt-out'; cardClass = 'out'; iconName = 'fa-arrow-up-long'; iconColorClass = 'icon-out'; 
            }
        }
        
        const jumpType = isDep ? 'deposit' : 'purchase';
        const shortTxId = isDep ? RenderHelpers.formatDepositId(tx) : RenderHelpers.formatOrderId(tx);

        let runningBalanceHtml = '';
        if (!isFilterActive && tx.balanceAfter !== undefined && tx.balanceAfter !== null) {
            runningBalanceHtml = `<div class="th-balance-after">${RenderHelpers.formatMoney(tx.balanceAfter, walletCurr)}</div>`;
        }

        const safeTxName = Utils.escapeHtml(isDep ? (tx.method || 'إيداع رصيد') : (tx.product || 'طلب شراء'));

        return `
        <div class="th-card ${cardClass} clickable-tx-card" data-action="jump-transaction" data-id="${tx.id}" data-type="${jumpType}" title="انقر لعرض التفاصيل">
            <div class="th-icon ${iconColorClass}"><i class="fa-solid ${iconName}"></i></div>
            <div class="th-body">
                <div class="th-details-col">
                    <div class="th-row-top"><span class="tx-name-text">${safeTxName}</span></div>
                    <div class="th-row-bottom"><span class="th-date num-en">${formattedDate}</span></div>
                </div>
                <div class="th-amount-col">
                    <span class="th-order num-en is-copyable" data-action="copy-text" data-text="${shortTxId}" title="اضغط لنسخ رقم العملية"><i class="fa-regular fa-copy" style="margin-right:4px; font-size:10px; opacity:0.7;"></i> ${shortTxId}</span>
                    <div class="th-amount ${amountClass}">${amountPrefix}${RenderHelpers.formatMoney(tx.amountVal, tx.amountCurrency)}</div>
                    ${runningBalanceHtml} 
                </div>
            </div>
        </div>`;
    },

    // 2️⃣ بناء كرت الطلب
    buildOrderCard: function(o, idx, displayCurr, highlightId = null) {
        const getCleanInputRows = (str) => {
            if (!str || str === '---' || typeof str === 'object') return [];
            const rawStr = String(str);
            if (rawStr.includes('|')) return rawStr.split('|').map(s => s.split(':').pop().trim());
            if (rawStr.includes(':')) return [rawStr.split(':').pop().trim()];
            return [rawStr.trim()];
        };
        
        const status = o.status || 'pending'; 
        const statusClass = status === 'completed' ? 'completed' : (status === 'rejected' ? 'rejected' : (['returned', 'refunded'].includes(status) ? 'returned' : (status === 'processing' ? 'processing' : 'pending')));
        const productName = Utils.escapeHtml(o.product || (LiveStoreData.prods || []).find(p => String(p.id) === String(o.prodId))?.name || 'منتج');
        const qty = parseFloat(o.qty) || 1; 
        const qtyHtml = qty > 1 ? `<span class="oh-qty-badge num-en">x${qty}</span>` : '';
        const inputRows = getCleanInputRows(o.input);
        
        let statusLabel = '<i class="fa-regular fa-clock"></i> قيد التنفيذ';
        if (status === 'completed') statusLabel = '<i class="fa-solid fa-circle-check"></i> مكتمل';
        else if (status === 'processing') statusLabel = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التنفيذ';
        else if (status === 'rejected') statusLabel = '<i class="fa-solid fa-circle-xmark"></i> مرفوض';
        else if (['returned', 'refunded'].includes(status)) statusLabel = '<i class="fa-solid fa-rotate-left"></i> مسترجع';
        
        const totalDiscLocal = Number(o.couponDiscount || 0) + Number(o.saleDiscount || 0);
        let discountBadgeHtml = '';
        if (totalDiscLocal > 0) {
            const isCombo = (Number(o.couponDiscount || 0) > 0 && Number(o.saleDiscount || 0) > 0);
            const isCoupon = Number(o.couponDiscount || 0) > 0;
            discountBadgeHtml = `<div class="oh-discount-badge ${isCombo ? 'badge-combo' : (isCoupon ? 'badge-coupon' : 'badge-sale')}"><i class="fa-solid ${isCombo ? 'fa-gift' : (isCoupon ? 'fa-ticket' : 'fa-tag')}"></i> <span>${isCombo ? 'توفير مضاعف' : (isCoupon ? 'كوبون' : 'تخفيض')}</span><span class="num-en">(-${RenderHelpers.formatMoney(totalDiscLocal, displayCurr)})</span></div>`;
        }

        const isHighlighted = (highlightId && String(o.id) === String(highlightId)) ? 'jump-highlight' : '';

        return `
        <div class="oh-card ${isHighlighted}" style="--anim-idx: ${idx}" data-action="open-detail" data-type="order" data-id="${o.id}">
            <div class="oh-right">
                ${discountBadgeHtml} 
                <div class="oh-title">${productName}</div> 
                <div class="oh-inputs-stack">${inputRows.map(row => `<div class="oh-input-line num-en">${Utils.escapeHtml(row)}</div>`).join('')}</div>
                <div class="oh-date-time num-en">${RenderHelpers.formatSafeDate(o.time || o.createdAt)}</div>
            </div>
            <div class="oh-left">
                <div class="oh-status-box"><span class="oh-status ${statusClass}">${statusLabel}</span></div>
                <div class="oh-price-box" dir="ltr"><div class="oh-amount">${RenderHelpers.formatMoney(Number(o.price || 0), displayCurr)}</div>${qtyHtml}</div>
                <div class="oh-order-box" dir="ltr"><span class="oh-order-number num-en">${RenderHelpers.formatOrderId(o)}</span></div>
            </div>
        </div>`;
    },

    // 3️⃣ بناء كرت عملية الدفع / الشحن
    buildPaymentCard: function(d, userDisplayName, userIdString, baseCurrency) {
        const isDeduction = (d.creditedAmount !== undefined && Number(d.creditedAmount) < 0) || (d.method && String(d.method).includes('خصم'));
        
        let stClass = 'st-pending', stText = 'قيد المراجعة', icon = 'fa-clock';
        if (['approved', 'completed'].includes(d.status)) { 
            if (isDeduction) { stClass = 'st-rejected'; stText = 'مخصوم'; icon = 'fa-arrow-up-long'; } 
            else { stClass = 'st-approved'; stText = 'مقبول'; icon = 'fa-check'; }
        } else if (d.status === 'rejected') { stClass = 'st-rejected'; stText = 'مرفوض'; icon = 'fa-xmark'; } 
        else if (['refunded', 'returned'].includes(d.status)) { stClass = 'st-refunded'; stText = 'مسترجع'; icon = 'fa-rotate-left'; }

        const currency = (d.currency || 'USD').toUpperCase();
        const rawAmount = Math.abs(parseFloat(d.amount) || 0); 
        const displayNetAmount = d.creditedAmount !== undefined ? Math.abs(parseFloat(d.creditedAmount)) : rawAmount;
        const feeVal = parseFloat(d.fees || d.fee || 0); 
        
        let feeLabel = 'الرسوم الإضافية';
        let feeValueHtml = '<span class="text-muted">لا يوجد</span>';
        if (feeVal > 0) {
            const isBonus = (d.feeType === 'bonus');
            feeLabel = isBonus ? 'بونص إضافي' : 'العمولة';
            const feeColor = isBonus ? 'text-success' : 'text-danger';
            const feeSign = isBonus ? '+' : '-';
            feeValueHtml = `<span class="${feeColor}" dir="ltr">${feeSign} ${RenderHelpers.formatMoney(feeVal, currency)}</span>`;
        }
        
        const formattedDate = RenderHelpers.formatSafeDate(d.time || d.createdAt);
        const shortDepositId = RenderHelpers.formatDepositId(d);
        const amountColorClass = isDeduction ? 'text-danger' : (stClass === 'st-approved' ? 'text-success' : '');
        const amountPrefix = isDeduction ? '-' : (stClass === 'st-approved' ? '+' : '');

        return `
            <div class="pay-history-card ${stClass}">
                <div class="ph-header" data-action="toggle-accordion">
                    <div class="ph-right-sec">
                        <div class="ph-icon-box"><i class="fa-solid ${icon} ph-icon"></i></div>
                        <div class="ph-info-text">
                            <span class="ph-method-name">${Utils.escapeHtml(d.method || 'شحن رصيد')}</span>
                            <span class="ph-date-mini num-en">${formattedDate.replace('|', '<span class="date-sep">|</span>')}</span>
                        </div>
                    </div>
                    <div class="ph-center-zone">
                        <span class="ph-amount-header num-en ${amountColorClass}">${amountPrefix} ${RenderHelpers.formatMoney(rawAmount, currency)}</span>
                        <span class="ph-status-mini">${stText}</span>
                    </div>
                    <div class="ph-left-sec"><div class="ph-arrow-btn"><i class="fa-solid fa-chevron-down"></i></div></div>
                </div>
                <div class="ph-details-body">
                    <div class="ph-sep-line"></div>
                    <div class="ph-data-list">
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-solid fa-hashtag"></i> رقم العملية</div>
                            <div class="ph-item-val num-en ph-id is-copyable" data-action="copy-text" data-text="${shortDepositId}">${shortDepositId}</div>
                        </div>
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-solid fa-user"></i> اسم المرسل</div>
                            <div class="ph-item-val">${userDisplayName}</div>
                        </div>
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-solid fa-id-card"></i> معرّف العميل</div>
                            <div class="uid-capsule is-copyable" data-action="copy-text" data-text="${userIdString}"><span class="num-en">${userIdString}</span></div>
                        </div>
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-solid fa-tags"></i> ${feeLabel}</div>
                            <div class="ph-item-val num-en">${feeValueHtml}</div>
                        </div>
                        <div class="ph-item item-highlight">
                            <div class="ph-item-label"><i class="fa-solid fa-wallet"></i> الرصيد المضاف</div>
                            <div class="ph-item-val num-en ${amountColorClass}">${RenderHelpers.formatMoney(displayNetAmount, (d.targetCurrency || baseCurrency).toUpperCase())}</div>
                        </div>
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-solid fa-clock"></i> التاريخ والوقت</div>
                            <div class="ph-item-val num-en">${formattedDate}</div>
                        </div>
                    </div>
                    ${d.adminNote ? `
                        <div class="ph-admin-note ${d.status === 'rejected' ? 'note-rejected' : 'note-approved'}">
                            <i class="fa-solid fa-headset"></i>
                            <div class="ph-admin-note-content">
                                <span class="ph-admin-note-title">رسالة الإدارة:</span>
                                <div class="admin-reply-text">${Utils.escapeHtml(d.adminNote)}</div>
                            </div>
                        </div>` : ''}
                    <div class="ph-footer-action">
                        <button class="btn-receipt-export" data-action="export-receipt" data-id="${d.id}">
                            <i class="fa-solid fa-file-export"></i> تصدير الإيصال
                        </button>
                    </div>
                </div>
            </div>`;
    }
};
