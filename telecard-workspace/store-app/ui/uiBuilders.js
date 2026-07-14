// ============================================================================
// 🧱 مصنع قوالب الواجهات الأمامية (uiBuilders.js) - Clean Architecture
// 🎯 الوظيفة: تحويل البيانات الخام (Data) إلى نصوص HTML جاهزة للرسم
// 🚀 الفائدة: فصل التصميم (UI) عن منطق الرسم (Logic) لتسريع الأداء وتسهيل الصيانة
// ============================================================================

import { Utils } from '../utils.js';
import { RenderHelpers } from '../core/renderHelpers.js';

export const UIBuilders = {

    /**
     * 1️⃣ بناء كرت حركة المحفظة (إيداع / شراء)
     */
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
                <div class="th-icon ${iconColorClass}">
                    <i class="fa-solid ${iconName}"></i>
                </div>
                <div class="th-body">
                    <div class="th-details-col">
                        <div class="th-row-top"><span class="tx-name-text">${safeTxName}</span></div>
                        <div class="th-row-bottom"><span class="th-date num-en">${formattedDate}</span></div>
                    </div>
                    <div class="th-amount-col">
                        <span class="th-order num-en is-copyable" data-action="copy-text" data-text="${shortTxId}" title="اضغط لنسخ رقم العملية">
                            <i class="fa-regular fa-copy" style="margin-right:4px; font-size:10px; opacity:0.7;"></i> ${shortTxId}
                        </span>
                        <div class="th-amount ${amountClass}">${amountPrefix}${RenderHelpers.formatMoney(tx.amountVal, tx.amountCurrency)}</div>
                        ${runningBalanceHtml} 
                    </div>
                </div>
            </div>`;
    },

    /**
     * 2️⃣ بناء كرت الطلب (Order Card)
     */
    buildOrderCard: function(o, idx, displayCurr, highlightId = null, productNamePassed = null) {
        const getCleanInputRows = (str) => {
            if (!str || str === '---' || typeof str === 'object') return [];
            const rawStr = String(str);
            if (rawStr.includes('|')) return rawStr.split('|').map(s => s.split(':').pop().trim());
            if (rawStr.includes(':')) return [rawStr.split(':').pop().trim()];
            return [rawStr.trim()];
        };
        
        const status = o.status || 'pending';
        const statusClass = status === 'completed' ? 'completed' :
            (status === 'rejected' ? 'rejected' :
                (['returned', 'refunded'].includes(status) ? 'returned' :
                    (status === 'processing' ? 'processing' : 'pending')));
        
        const productName = Utils.escapeHtml(productNamePassed || o.product || 'منتج غير معروف');
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
            discountBadgeHtml = `
                <div class="oh-discount-badge ${isCombo ? 'badge-combo' : (isCoupon ? 'badge-coupon' : 'badge-sale')}">
                    <i class="fa-solid ${isCombo ? 'fa-gift' : (isCoupon ? 'fa-ticket' : 'fa-tag')}"></i> 
                    <span>${isCombo ? 'توفير مضاعف' : (isCoupon ? 'كوبون' : 'تخفيض')}</span>
                    <span class="num-en">(-${RenderHelpers.formatMoney(totalDiscLocal, displayCurr)})</span>
                </div>`;
        }
        
        const isHighlighted = (highlightId && String(o.id) === String(highlightId)) ? 'jump-highlight' : '';
        
        return `
            <div class="oh-card ${isHighlighted}" style="--anim-idx: ${idx}" data-action="open-detail" data-type="order" data-id="${o.id}">
                <div class="oh-right">
                    ${discountBadgeHtml} 
                    <div class="oh-title">${productName}</div> 
                    <div class="oh-inputs-stack">
                        ${inputRows.map(row => `<div class="oh-input-line num-en">${Utils.escapeHtml(row)}</div>`).join('')}
                    </div>
                    <div class="oh-date-time num-en">${RenderHelpers.formatSafeDate(o.time || o.createdAt)}</div>
                </div>
                <div class="oh-left">
                    <div class="oh-status-box">
                        <span class="oh-status ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="oh-price-box" dir="ltr">
                        <div class="oh-amount">${RenderHelpers.formatMoney(Number(o.price || 0), displayCurr)}</div>
                        ${qtyHtml}
                    </div>
                    <div class="oh-order-box" dir="ltr">
                        <span class="oh-order-number num-en">${RenderHelpers.formatOrderId(o)}</span>
                    </div>
                </div>
            </div>`;
    },

    /**
     * 3️⃣ بناء كرت عملية الدفع / الشحن (Payment/Deposit Card)
     */
    buildPaymentCard: function(d, userDisplayName, userIdString, baseCurrency) {
        const isDeduction = (d.creditedAmount !== undefined && Number(d.creditedAmount) < 0) || (d.method && String(d.method).includes('خصم'));
        
        let stClass = 'st-pending', stText = 'قيد المراجعة', icon = 'fa-clock';
        if (['approved', 'completed'].includes(d.status)) { 
            if (isDeduction) { stClass = 'st-rejected'; stText = 'مخصوم'; icon = 'fa-arrow-up-long'; } 
            else { stClass = 'st-approved'; stText = 'مقبول'; icon = 'fa-check'; }
        } else if (d.status === 'rejected') { 
            stClass = 'st-rejected'; stText = 'مرفوض'; icon = 'fa-xmark'; 
        } else if (['refunded', 'returned'].includes(d.status)) { 
            stClass = 'st-refunded'; stText = 'مسترجع'; icon = 'fa-rotate-left'; 
        }

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
                        <div class="ph-icon-box">
                            <i class="fa-solid ${icon} ph-icon"></i>
                        </div>
                        <div class="ph-info-text">
                            <span class="ph-method-name">${Utils.escapeHtml(d.method || 'شحن رصيد')}</span>
                            <span class="ph-date-mini num-en">${formattedDate.replace('|', '<span class="date-sep">|</span>')}</span>
                        </div>
                    </div>
                    <div class="ph-center-zone">
                        <span class="ph-amount-header num-en ${amountColorClass}">${amountPrefix} ${RenderHelpers.formatMoney(rawAmount, currency)}</span>
                        <span class="ph-status-mini">${stText}</span>
                    </div>
                    <div class="ph-left-sec">
                        <div class="ph-arrow-btn"><i class="fa-solid fa-chevron-down"></i></div>
                    </div>
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
                            <div class="uid-capsule is-copyable" data-action="copy-text" data-text="${userIdString}">
                                <span class="num-en">${userIdString}</span>
                            </div>
                        </div>
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-solid fa-tags"></i> ${feeLabel}</div>
                            <div class="ph-item-val num-en">${feeValueHtml}</div>
                        </div>
                        <div class="ph-item item-highlight">
                            <div class="ph-item-label"><i class="fa-solid fa-wallet"></i> الرصيد المضاف</div>
                            <div class="ph-item-val num-en ${amountColorClass}">
                                ${RenderHelpers.formatMoney(displayNetAmount, (d.targetCurrency || baseCurrency).toUpperCase())}
                            </div>
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
    },

    /**
     * 4️⃣ بناء محتوى كارت المنتج (Product Card)
     */
    buildProductCardInner: function(safeName, priceSectionHtml, imgObj, visualElementsHtml, nameExpandedStyle) {
        return `
            <svg class="snake-border" viewBox="0 0 120 165" preserveAspectRatio="none">
                <rect x="0.7" y="0.7" width="118.6" height="163.6"></rect>
            </svg>
            <div class="card-image ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">
                ${visualElementsHtml} 
                ${imgObj.html}
            </div>
            <div class="card-info">
                <div class="product-name" style="${nameExpandedStyle}">${safeName}</div>
                ${priceSectionHtml}
            </div>`;
    },

    /**
     * 5️⃣ بناء فاتورة الإيصال (PDF Receipt Template)
     */
    buildPDFReceipt: function(config, brandHTML) {
        const contentHTML = config.type === 'deposit' ? `
            ${brandHTML}
            <div class="r-title-box">
                <div class="r-title">Deposit Receipt</div>
                <div class="r-id">${config.data.displayId}</div>
            </div>
            <div class="r-grid">
                <div class="r-item"><span class="r-label">Customer Name</span><span class="r-value">${Utils.escapeHtml(config.data.userName)}</span></div>
                <div class="r-item"><span class="r-label">Customer ID</span><span class="r-value">${Utils.escapeHtml(config.data.userDisplayId)}</span></div>
                <div class="r-item"><span class="r-label">Payment Method</span><span class="r-value">${Utils.escapeHtml(config.data.method)}</span></div>
                <div class="r-item"><span class="r-label">Date & Time</span><span class="r-value">${config.data.dateTime}</span></div>
                <div class="r-item"><span class="r-label">Base Amount</span><span class="r-value">${RenderHelpers.formatMoney(config.data.amount, config.data.currency)}</span></div>
                <div class="r-item"><span class="r-label">Fee (${config.data.feePercent}%)</span><span class="r-value" style="color:#ef4444;">-${RenderHelpers.formatMoney(config.data.feeVal, config.data.currency)}</span></div>
            </div>
            <div class="r-total-box">
                <div class="r-total-label">Net Added Balance</div>
                <div class="r-total-val">${RenderHelpers.formatMoney(config.data.netVal, config.data.targetCurrency)}</div>
            </div>
        ` : `
            ${brandHTML}
            <div class="r-title-box">
                <div class="r-title">Order Receipt</div>
                <div class="r-id">${config.data.displayId}</div>
            </div>
            <div class="r-grid">
                <div class="r-item"><span class="r-label">Product</span><span class="r-value">${Utils.escapeHtml(config.data.product)}</span></div>
                <div class="r-item"><span class="r-label">Status</span><span class="r-value">${Utils.escapeHtml(config.data.status)}</span></div>
                <div class="r-item"><span class="r-label">Customer Name</span><span class="r-value">${Utils.escapeHtml(config.data.userName)}</span></div>
                <div class="r-item"><span class="r-label">Date & Time</span><span class="r-value">${config.data.dateTime}</span></div>
                <div class="r-item"><span class="r-label">Quantity</span><span class="r-value">${config.data.qty}</span></div>
                <div class="r-item"><span class="r-label">Account Details</span><span class="r-value">${Utils.escapeHtml(config.data.input)}</span></div>
            </div>
            ${config.data.code ? `<div class="r-item-full"><span class="r-label">Completed Order Code</span><span class="r-value r-code-val">${Utils.escapeHtml(config.data.code)}</span></div>` : ''}
            <div class="r-total-box">
                <div class="r-total-label">Total Amount</div>
                <div class="r-total-val">${RenderHelpers.formatMoney(config.data.price, config.data.priceCurrency)}</div>
            </div>
        `;

        const storeNameMatch = brandHTML.match(/<div class="store-name">([^<]+)<\/div>/);
        const storeNameText = storeNameMatch ? storeNameMatch[1] : 'Store';

        return `
            <!DOCTYPE html>
            <html lang="en" dir="ltr">
            <head>
                <meta charset="UTF-8">
                <title>${config.filename}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
                    @page { size: A4 portrait; margin: 15mm; }
                    body { font-family: 'Share Tech Mono', sans-serif; background: #ffffff; color: #0f172a; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .receipt-container { max-width: 100%; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 25px; }
                    .header-section { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 20px; margin-bottom: 25px; }
                    .store-name { font-size: 26px; font-weight: 800; color: #0f172a; }
                    .r-title-box { background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #eab308; margin-bottom: 25px; text-align: center; }
                    .r-title { font-size: 18px; color: #ca8a04; font-weight: bold; margin-bottom: 5px; }
                    .r-id { font-size: 18px; color: #0f172a; font-weight: bold; }
                    .r-grid { display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 25px; }
                    .r-item { width: calc(50% - 7.5px); background: #f8fafc; padding: 12px; border-radius: 8px; border-left: 4px solid #eab308; box-sizing: border-box; }
                    .r-item-full { width: 100%; background: #fffbeb; padding: 15px; border-radius: 8px; border: 1px dashed #eab308; text-align: center; box-sizing: border-box; }
                    .r-label { font-size: 13px; color: #64748b; display: block; margin-bottom: 5px; font-weight: 600; }
                    .r-value { font-size: 15px; color: #0f172a; font-weight: bold; word-break: break-word; }
                    .r-code-val { font-size: 20px; color: #ca8a04; letter-spacing: 2px; }
                    .r-total-box { background: #eab308; padding: 20px; border-radius: 8px; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; color: #fff; }
                    .r-total-label { font-size: 18px; font-weight: bold; color: #fff; }
                    .r-total-val { font-size: 24px; font-weight: 900; color: #fff; }
                    .r-footer { text-align: center; margin-top: 30px; font-size: 13px; color: #94a3b8; }
                </style>
            </head>
            <body>
                <div class="receipt-container">
                    ${contentHTML}
                    <div class="r-footer">Thank you for trusting ${storeNameText} | Certified Electronic Receipt</div>
                </div>
            </body>
            </html>
        `;
    },

    /**
     * 6️⃣ بناء قائمة الأكواد المستلمة
     */
    buildCodesList: function(codeString) {
        if (!codeString) return '';
        const rawCodes = codeString.split(/\||\n/).map(c => c.trim()).filter(Boolean);
        return rawCodes.map(code => {
            const safeCode = Utils.escapeHtml(code);
            return `
            <div class="copyable-code-box lux-code-box success-lux-box" data-action="copy-text" data-text="${safeCode}" style="margin-bottom: 8px;">
                <span class="num-en">${safeCode}</span>
                <i class="fa-regular fa-copy"></i>
            </div>`;
        }).join('');
    },

    /**
     * 7️⃣ بناء شريط رسوم وحدود الإيداع
     */
    buildLimitsBar: function(feeVal, payCurr, feeUnit, feeType, minVal, maxVal) {
        let itemsHtml = [];
        if (feeVal > 0) {
            const isFixed = (feeUnit === 'fixed' || feeUnit === 'amount');
            const isBonus = (feeType === 'bonus');
            const icon    = isBonus ? 'fa-gift' : 'fa-coins';
            const label   = isBonus ? 'بونص' : 'عمولة';
            const sign    = isBonus ? '+' : '-';
            const cssClass = isBonus ? 'bonus' : 'commission';

            const feeDisplay = isFixed 
                ? RenderHelpers.formatMoney(feeVal, payCurr) 
                : `<span class="money-pro"><span class="num-en">${feeVal.toFixed(1)}%</span></span>`;

            itemsHtml.push(`
                <div class="bar-item ${cssClass}">
                    <span class="item-label"><i class="fa-solid ${icon}"></i> ${label}</span>
                    <span class="item-value"><span class="math-sign">${sign}</span>${feeDisplay}</span>
                </div>`);
        }
        if (minVal > 0) {
            itemsHtml.push(`
                <div class="bar-item">
                    <span class="item-label"><i class="fa-solid fa-arrow-down"></i> أدنى حد</span>
                    <span class="item-value">${RenderHelpers.formatMoney(minVal, payCurr)}</span>
                </div>`);
        }
        if (maxVal > 0) {
            itemsHtml.push(`
                <div class="bar-item">
                    <span class="item-label"><i class="fa-solid fa-arrow-up"></i> أعلى حد</span>
                    <span class="item-value">${RenderHelpers.formatMoney(maxVal, payCurr)}</span>
                </div>`);
        }
        return itemsHtml;
    },

    /**
     * 8️⃣ بناء نموذج الدفع (Deposit Form)
     */
    buildDepositForm: function(p, copyContainer, isSingleCurrency, currentPayCurrency, currItemsHtml, baseCurr) {
        return `
            <div class="bal-modal-container-new">
                <div class="bal-payment-title">${Utils.escapeHtml(p.name)}</div>
                ${copyContainer}
                <div class="compact-limits-bar" id="bal-limits-bar"></div>
                <div class="bal-inputs-section">
                    <div class="micro-currency-row">
                        <div class="micro-currency-label"><i class="fa-solid fa-wallet"></i> عملة الإيداع</div>
                        <div class="split-dropdown" id="bal-currency-dropdown">
                            <div class="micro-currency-trigger" style="${isSingleCurrency ? 'cursor: default;' : ''}">
                                <span id="bal-selected-currency" class="num-en">${currentPayCurrency}</span>
                                ${isSingleCurrency ? '' : '<i class="fa-solid fa-chevron-down" style="font-size: 11px;"></i>'}
                            </div>
                            <div class="dropdown-menu" id="bal-currency-list" style="${isSingleCurrency ? 'display:none;' : ''}">
                                ${currItemsHtml}
                            </div>
                        </div>
                    </div>
                 <div class="bal-input-field-new" id="bal-amount-wrap">
                    <span class="bal-input-currency-new" id="bal-amount-curr">${currentPayCurrency}</span>
                    <input type="text" id="bal-amount" class="bal-input-new num-en" placeholder="0.00" inputmode="decimal" autocomplete="one-time-code" readonly onfocus="this.removeAttribute('readonly');" spellcheck="false" autocorrect="off">
                    <label class="bal-floating-label">أدخل مبلغ للإيداع</label>
                </div>
                <span id="bal-amount-error" class="bal-error-text-new d-none"></span>
                    <div class="bal-input-field-new" id="bal-net-wrap">
                        <span class="bal-input-currency-new" id="bal-net-curr">${baseCurr}</span>
                        <div class="bal-input-new bal-result-field-new num-en" id="calc-net">0.00</div>
                        <label class="bal-floating-label">سيضاف لمحفظتك</label>
                    </div>
                </div>
                <div id="bal-upload-container" style="display: ${p.reqProof !== false ? 'block' : 'none'}; margin-top: 10px;">
                    <button class="bal-upload-btn-new" id="bal-upload-box">
                        <i class="fa-solid fa-cloud-arrow-up"></i>
                        <span>أرفق إشعار الدفع</span>
                    </button>
                    <input type="file" id="bal-file" accept="image/*,application/pdf" style="display:none;">
                    <img id="bal-img-preview" class="bal-receipt-preview-new" style="display:none;">
                </div>
                <button id="btn-submit-deposit" class="bal-submit-btn-new btn-pro" data-action="submit-balance" disabled>
                    <span class="btn-content"><i class="fa-solid fa-paper-plane"></i> إرسال الطلب</span>
                    <span class="btn-spinner"><i class="fa-solid fa-spinner fa-spin"></i></span>
                </button>         
            </div>
        `;
    }
};
