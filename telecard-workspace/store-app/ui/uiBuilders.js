// ============================================================================
// 🧱 مصنع قوالب الواجهات الأمامية (uiBuilders.js) - الإصدار المؤسسي V18.9.0 💎
// 🎯 الوظيفة: تحويل البيانات الخام إلى قوالب HTML نقية وآمنة برمجياً 100%
// 🚀 التحديثات المعمارية الصارمة (V18.9.0 - UI Engine & XSS Patch):
// 1. PDF Crash Shield 🛡️: تأمين دوال بناء الإيصالات بكائنات احتياطية لمنع توقف التصدير عند فقدان البيانات.
// 2. Strict Attribute Escaping 🛡️: تعقيم فائق للسمات (data-id, class) لمنع كسر وسوم الـ HTML (DOM XSS).
// 3. Safe URL Enforcement 🛡️: منع حقن (javascript:) في أزرار الإيصالات والصور.
// 4. Absolute NaN Shield 🛡️: تغليف كافة العمليات الحسابية بدالة أمان لضمان إرجاع 0.00 بدلاً من NaN.
// ============================================================================

import * as Utils from '../utils.js'; 
import { RenderHelpers } from '../core/renderHelpers.js';

export const UIBuilders = {

    // ============================================================================
    // 🛡️ طبقة التعقيم الداخلية (Internal Sanitization Layer)
    // ============================================================================
    
    _safeAttr: function(val) {
        if (val === null || val === undefined) return '';
        return String(val).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    _safeNum: function(val, fallback = 0) {
        const parsed = parseFloat(val);
        return (isNaN(parsed) || !isFinite(parsed)) ? fallback : parsed;
    },

    _safeUrlLink: function(url) {
        if (!url) return '#';
        const strUrl = String(url).trim();
        // منع ثغرات javascript: أو vbscript: أو data:text/html
        if (/^(javascript|vbscript|data(?!\:image)):/i.test(strUrl)) return '#';
        return Utils.safeUrl ? Utils.safeUrl(strUrl) : strUrl;
    },

    _safeMultiLine: function(text) {
        if (!text) return '';
        return Utils.escapeHtml(String(text)).replace(/\n/g, '<br>');
    },

    // ============================================================================
    // 1️⃣ بناء كرت حركة المحفظة (إيداع / شراء)
    // ============================================================================
    buildWalletCard: function(tx, walletCurr, isFilterActive) {
        if (!tx) return '';
        const isDep = tx.type === 'deposit';
        let amountPrefix = '', amountClass = '', cardClass = '', iconName = '', iconColorClass = '';
        
        const safeTimeMs = Utils.parseSafeTime(tx.time || tx.createdAt);
        const formattedDate = RenderHelpers.formatSafeDate(safeTimeMs);

        const safeStatus = String(tx.status || 'pending').toLowerCase();

        if (isDep) {
            if (safeStatus === 'approved') {
                amountPrefix = tx.isDeduction ? '-' : '+';
                amountClass = tx.isDeduction ? 'amt-out' : 'amt-in';
                cardClass = tx.isDeduction ? 'out' : 'in';
                iconName = tx.isDeduction ? 'fa-arrow-up-long' : 'fa-arrow-down-long';
                iconColorClass = tx.isDeduction ? 'icon-out' : 'icon-green'; 
            } else {
                amountClass = 'amt-neutral'; cardClass = 'neutral';
                if (safeStatus === 'pending') { iconName = 'fa-clock'; iconColorClass = 'icon-gold'; } 
                else if (safeStatus === 'rejected') { iconName = 'fa-circle-xmark'; iconColorClass = 'icon-red'; }
                else if (['refunded', 'returned'].includes(safeStatus)) { iconName = 'fa-rotate-left'; iconColorClass = 'icon-cyan'; }
            }
        } else {
            if (['rejected', 'refunded', 'returned'].includes(safeStatus)) {
                amountClass = 'amt-neutral'; cardClass = 'neutral';
                iconName = ['refunded', 'returned'].includes(safeStatus) ? 'fa-rotate-left' : 'fa-circle-xmark';
                iconColorClass = ['refunded', 'returned'].includes(safeStatus) ? 'icon-cyan' : 'icon-red';
            } else if (safeStatus === 'pending') {
                amountPrefix = '-'; amountClass = 'amt-neutral'; cardClass = 'neutral'; iconName = 'fa-clock'; iconColorClass = 'icon-gold';
            } else {
                amountPrefix = '-'; amountClass = 'amt-out'; cardClass = 'out'; iconName = 'fa-arrow-up-long'; iconColorClass = 'icon-out'; 
            }
        }
        
        const jumpType = isDep ? 'deposit' : 'purchase';
        const shortTxId = isDep ? RenderHelpers.formatDepositId(tx) : RenderHelpers.formatOrderId(tx);
        const safeTxIdAttr = this._safeAttr(tx.id || '');

        let runningBalanceHtml = '';
        if (!isFilterActive && typeof tx.balanceAfter !== 'undefined') {
            const safeBalAfter = this._safeNum(tx.balanceAfter);
            runningBalanceHtml = `<div class="th-balance-after">${RenderHelpers.formatMoney(safeBalAfter, String(walletCurr).toUpperCase())}</div>`;
        }

        const safeTxName = Utils.escapeHtml(isDep ? (tx.method || 'إيداع رصيد') : (tx.product || 'طلب شراء'));
        const safeAmount = this._safeNum(tx.amountVal);
        const safeCurrency = this._safeAttr(tx.amountCurrency || 'USD').toUpperCase();

        return `
            <div class="th-card ${cardClass} clickable-tx-card" data-action="jump-transaction" data-id="${safeTxIdAttr}" data-type="${jumpType}" title="انقر لعرض التفاصيل">
                <div class="th-icon ${iconColorClass}"><i class="fa-solid ${iconName}"></i></div>
                <div class="th-body">
                    <div class="th-details-col">
                        <div class="th-row-top"><span class="tx-name-text">${safeTxName}</span></div>
                        <div class="th-row-bottom"><span class="th-date num-en">${formattedDate}</span></div>
                    </div>
                    <div class="th-amount-col">
                        <span class="th-order num-en is-copyable" data-action="copy-text" data-text="${this._safeAttr(shortTxId)}" title="اضغط لنسخ رقم العملية">
                            <i class="fa-regular fa-copy" style="margin-right:4px; font-size:10px; opacity:0.7;"></i> ${shortTxId}
                        </span>
                        <div class="th-amount ${amountClass}">${amountPrefix}${RenderHelpers.formatMoney(safeAmount, safeCurrency)}</div>
                        ${runningBalanceHtml} 
                    </div>
                </div>
            </div>`;
    },

    // ============================================================================
    // 2️⃣ بناء كرت الطلب (Order Card)
    // ============================================================================
    buildOrderCard: function(o, idx, displayCurr, highlightId = null, productNamePassed = null) {
        if (!o) return '';
        const getCleanInputRows = (str) => {
            if (!str || str === '---' || typeof str === 'object') return [];
            return String(str).split('|').map(s => s.trim()).filter(Boolean);
        };
        
        const safeStatus = String(o.status || 'pending').toLowerCase();
        const statusClass = safeStatus === 'completed' ? 'completed' :
            (safeStatus === 'rejected' ? 'rejected' :
                (['returned', 'refunded'].includes(safeStatus) ? 'returned' :
                    (safeStatus === 'processing' ? 'processing' : 'pending')));
        
        const productName = Utils.escapeHtml(productNamePassed || o.product || 'منتج غير معروف');
        const qty = this._safeNum(o.qty, 1);
        const qtyHtml = qty > 1 ? `<span class="oh-qty-badge num-en">x${qty}</span>` : '';
        const inputRows = getCleanInputRows(o.input);
        
        let statusLabel = '<i class="fa-regular fa-clock"></i> قيد التنفيذ';
        if (safeStatus === 'completed') statusLabel = '<i class="fa-solid fa-circle-check"></i> مكتمل';
        else if (safeStatus === 'processing') statusLabel = '<i class="fa-solid fa-gears"></i> جاري التنفيذ';
        else if (safeStatus === 'rejected') statusLabel = '<i class="fa-solid fa-circle-xmark"></i> مرفوض';
        else if (['returned', 'refunded'].includes(safeStatus)) statusLabel = '<i class="fa-solid fa-rotate-left"></i> مسترجع';
        
        const safeCouponDisc = this._safeNum(o.pricingSnapshot?.couponDiscount || o.couponDiscount);
        const safeSaleDisc = this._safeNum(o.pricingSnapshot?.offerDiscount || o.saleDiscount);
        const totalDiscLocal = Number((safeCouponDisc + safeSaleDisc).toFixed(4));
        
        let discountBadgeHtml = '';
        if (totalDiscLocal > 0) {
            const isCombo = (safeCouponDisc > 0 && safeSaleDisc > 0);
            const isCoupon = (safeCouponDisc > 0);
            discountBadgeHtml = `
                <div class="oh-discount-badge ${isCombo ? 'badge-combo' : (isCoupon ? 'badge-coupon' : 'badge-sale')}">
                    <i class="fa-solid ${isCombo ? 'fa-gift' : (isCoupon ? 'fa-ticket' : 'fa-tag')}"></i> 
                    <span>${isCombo ? 'توفير مضاعف' : (isCoupon ? 'تم تطبيق كوبون' : 'يشمله تخفيض')}</span>
                </div>`;
        }

        const safeOrderIdAttr = this._safeAttr(o.id || '');
        const isHighlighted = (highlightId && String(o.id) === String(highlightId)) ? 'jump-highlight' : '';
        const safeTimeMs = Utils.parseSafeTime(o.time || o.createdAt);
        const safePrice = this._safeNum(o.price);
        
        return `
            <div class="oh-card ${isHighlighted}" style="--anim-idx: ${this._safeAttr(idx)}" data-action="open-detail" data-type="order" data-id="${safeOrderIdAttr}">
                <div class="oh-right">
                    ${discountBadgeHtml} 
                    <div class="oh-title">${productName}</div> 
                    <div class="oh-inputs-stack">${inputRows.map(row => `<div class="oh-input-line num-en">${Utils.escapeHtml(row)}</div>`).join('')}</div>
                    <div class="oh-date-time num-en">${RenderHelpers.formatSafeDate(safeTimeMs)}</div>
                </div>
                <div class="oh-left">
                    <div class="oh-status-box"><span class="oh-status ${statusClass}">${statusLabel}</span></div>
                    <div class="oh-price-box" dir="ltr"><div class="oh-amount">${RenderHelpers.formatMoney(safePrice, String(displayCurr).toUpperCase())}</div>${qtyHtml}</div>
                    <div class="oh-order-box" dir="ltr"><span class="oh-order-number num-en">${RenderHelpers.formatOrderId(o)}</span></div>
                </div>
            </div>`;
    },

    // ============================================================================
    // 3️⃣ بناء كرت عملية الدفع (Payment/Deposit Card)
    // ============================================================================
    buildPaymentCard: function(d, userDisplayName, userIdString, baseCurrency) {
        if (!d) return '';
        const isDeduction = (d.creditedAmount !== undefined && Number(d.creditedAmount) < 0) || (d.method && String(d.method).includes('خصم'));
        
        let stClass = 'st-pending', stText = 'قيد المراجعة', icon = 'fa-clock';
        const safeStatus = String(d.status || 'pending').toLowerCase();
        
        if (['approved', 'completed'].includes(safeStatus)) { 
            if (isDeduction) { stClass = 'st-rejected'; stText = 'مخصوم'; icon = 'fa-arrow-up-long'; } 
            else { stClass = 'st-approved'; stText = 'مقبول'; icon = 'fa-check'; }
        } else if (safeStatus === 'rejected') { stClass = 'st-rejected'; stText = 'مرفوض'; icon = 'fa-xmark'; } 
        else if (['refunded', 'returned'].includes(safeStatus)) { stClass = 'st-refunded'; stText = 'مسترجع'; icon = 'fa-rotate-left'; }

        const currency = this._safeAttr(d.currency || 'USD').toUpperCase();
        const targetCurr = this._safeAttr(d.targetCurrency || baseCurrency || 'USD').toUpperCase();
        
        const rawAmount = Math.abs(this._safeNum(d.amount)); 
        const displayNetAmount = d.creditedAmount !== undefined ? Math.abs(this._safeNum(d.creditedAmount)) : rawAmount;
        const feeVal = this._safeNum(d.fees || d.fee); 
        
        let feeLabel = 'الرسوم الإضافية';
        let feeValueHtml = '<span class="text-muted">لا يوجد</span>';
        if (feeVal > 0) {
            const isBonus = (d.feeType === 'bonus');
            feeLabel = isBonus ? 'بونص إضافي' : 'العمولة';
            const feeColor = isBonus ? 'text-success' : 'text-danger';
            feeValueHtml = `<span class="${feeColor}" dir="ltr">${isBonus ? '+' : '-'} ${RenderHelpers.formatMoney(feeVal, currency)}</span>`;
        }
        
        let exchangeRateHtml = '';
        if (currency !== targetCurr && d.exchangeRate) {
            const safeExchangeRate = this._safeNum(d.exchangeRate);
            exchangeRateHtml = `
            <div class="ph-item">
                <div class="ph-item-label"><i class="fa-solid fa-money-bill-transfer"></i> سعر الصرف المطبق</div>
                <div class="ph-item-val num-en ph-rate-val" dir="ltr">1 ${targetCurr} = ${safeExchangeRate.toFixed(4)} ${currency}</div>
            </div>`;
        }

        const finalUserName = (!userDisplayName || String(userDisplayName).trim() === '') ? 'العميل' : userDisplayName;
        let balAfter = d.balanceAfter !== undefined ? d.balanceAfter : (d.postBalance !== undefined ? d.postBalance : d.newBalance); 
        
        let balanceAfterHtml = '';
        if (balAfter !== undefined && balAfter !== null && balAfter !== '') {
            balanceAfterHtml = `
                <div class="ph-item ph-balance-box">
                    <div class="ph-item-label ph-balance-label"><i class="fa-solid fa-piggy-bank"></i> رصيد المحفظة الحالي</div>
                    <div class="ph-item-val num-en ph-balance-val" dir="ltr">${RenderHelpers.formatMoney(this._safeNum(balAfter), targetCurr)}</div>
                </div>`;
        }

        const safeReceiptUrl = this._safeUrlLink(d.receipt);
        let receiptHtml = '';
        if (safeReceiptUrl && safeReceiptUrl !== '#') {
            receiptHtml = `
            <div class="ph-item align-center mt-10">
                <div class="ph-item-label"><i class="fa-solid fa-file-invoice"></i> المرفقات (إشعار الدفع)</div>
                <div class="ph-item-val">
                    <a href="${safeReceiptUrl}" target="_blank" rel="noopener noreferrer" class="hover-scale ph-receipt-link" title="اضغط لعرض الإشعار">
                        <img src="${safeReceiptUrl}" class="ph-receipt-img" alt="إشعار الدفع">
                    </a>
                </div>
            </div>`;
        }

        const safeTimeMs = Utils.parseSafeTime(d.time || d.createdAt);
        const formattedDate = RenderHelpers.formatSafeDate(safeTimeMs);
        const shortDepositId = RenderHelpers.formatDepositId(d);
        const amountColorClass = isDeduction ? 'text-danger' : (stClass === 'st-approved' ? 'text-success' : '');
        const amountPrefix = isDeduction ? '-' : (stClass === 'st-approved' ? '+' : '');
        const safeDepositIdAttr = this._safeAttr(d.id || '');

        return `
            <div class="pay-history-card ${stClass}">
                <div class="ph-header" data-action="toggle-accordion">
                    <div class="ph-right-sec">
                        <div class="ph-icon-box"><i class="fa-solid ${icon} ph-icon"></i></div>
                        <div class="ph-info-text">
                            <span class="ph-method-name">${Utils.escapeHtml(d.method || 'شحن رصيد')}</span>
                            <span class="ph-date-mini num-en" style="font-size: 11px;">${formattedDate.replace('|', '&nbsp;|&nbsp;')}</span>
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
                            <div class="ph-item-val num-en ph-id is-copyable" data-action="copy-text" data-text="${this._safeAttr(shortDepositId)}">${shortDepositId}</div>
                        </div>
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-regular fa-calendar-check"></i> الوقت والتاريخ</div>
                            <div class="ph-item-val num-en ph-rate-val" dir="ltr">${formattedDate.replace('|', '&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>
                        </div>

                        <div class="ph-sep-line" style="margin: 10px 0; opacity: 0.3;"></div>
                        
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-solid fa-user-tag"></i> اسم العميل</div>
                            <div class="ph-item-val fw-bold">${Utils.escapeHtml(finalUserName)}</div>
                        </div>
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-solid fa-id-card"></i> معرف الحساب</div>
                            <div class="ph-item-val num-en is-copyable" data-action="copy-text" data-text="${this._safeAttr(userIdString)}">${Utils.escapeHtml(userIdString)} <i class="fa-regular fa-copy" style="font-size:11px; margin-right:4px;"></i></div>
                        </div>
                        
                        <div class="ph-sep-line" style="margin: 10px 0; opacity: 0.3;"></div>
                        
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-solid fa-tags"></i> ${feeLabel}</div>
                            <div class="ph-item-val num-en">${feeValueHtml}</div>
                        </div>
                        ${exchangeRateHtml}
                        <div class="ph-item item-highlight">
                            <div class="ph-item-label"><i class="fa-solid fa-hand-holding-dollar"></i> المبلغ الصافي المضاف</div>
                            <div class="ph-item-val num-en ${amountColorClass} fw-bold fs-15">${RenderHelpers.formatMoney(displayNetAmount, targetCurr)}</div>
                        </div>
                        
                        ${balanceAfterHtml}
                        ${receiptHtml}
                    </div>
                    
                    ${d.adminNote && String(d.adminNote).trim() !== '' ? `
                        <div class="ph-admin-note ${safeStatus === 'rejected' ? 'note-rejected' : 'note-approved'} ph-margin-top">
                            <i class="fa-solid fa-headset"></i>
                            <div class="ph-admin-note-content"><span class="ph-admin-note-title">رسالة الإدارة:</span><div class="admin-reply-text">${this._safeMultiLine(d.adminNote)}</div></div>
                        </div>` : ''}
                    
                    <div class="ph-footer-action ph-margin-top">
                        <button class="btn-receipt-export" data-action="export-receipt" data-id="${safeDepositIdAttr}"><i class="fa-solid fa-file-export"></i> تصدير الإيصال PDF</button>
                    </div>
                </div>
            </div>`;
    },

    // ============================================================================
    // 4️⃣ بناء محتوى كارت المنتج
    // ============================================================================
    buildProductCardInner: function(safeName, priceSectionHtml, imgObj, visualElementsHtml, nameExpandedStyle) {
        return `
            <svg class="snake-border" viewBox="0 0 120 165" preserveAspectRatio="none"><rect x="0.7" y="0.7" width="118.6" height="163.6"></rect></svg>
            <div class="card-image ${this._safeAttr(imgObj.wrapperClass)}" style="${this._safeAttr(imgObj.wrapperStyle)}">${visualElementsHtml} ${imgObj.html}</div>
            <div class="card-info">
                <div class="product-name" style="${this._safeAttr(nameExpandedStyle)}">${safeName}</div>
                ${priceSectionHtml}
            </div>`;
    },

    // ============================================================================
    // 5️⃣ بناء فاتورة الإيصال PDF (الديناميكية المجهزة للطباعة)
    // ============================================================================
    buildPDFReceipt: function(config, brandHTML) {
        // 🛡️ التحديث المعماري: كائن احتياطي (Fail-Safe) لمنع توقف التصدير إذا ضاعت البيانات
        const data = config?.data || {};
        const storeNameText = Utils.escapeHtml(config?.storeName || 'المتجر');
        let contentHTML = '';

        if (config?.type === 'deposit') {
            const isBonus = data.feeType === 'bonus';
            const feeValNum = this._safeNum(data.feeVal);
            const safeCurrency = this._safeAttr(data.currency || 'USD').toUpperCase();
            
            let feeDisplayLabel = isBonus ? 'بونص إضافي' : 'رسوم مخصومة';
            if (data.feePercent) feeDisplayLabel += ` (${Utils.escapeHtml(data.feePercent)}%)`;
            
            let feeValueHtml = '';
            if (feeValNum === 0) {
                feeValueHtml = `<span class="r-value" style="color: #64748b;">${RenderHelpers.formatMoney(0, safeCurrency)}</span>`;
            } else if (isBonus) {
                feeValueHtml = `<span class="r-value num-en" dir="ltr" style="color: #16a34a;">+${RenderHelpers.formatMoney(feeValNum, safeCurrency)}</span>`;
            } else {
                feeValueHtml = `<span class="r-value num-en" dir="ltr" style="color: #ef4444;">-${RenderHelpers.formatMoney(feeValNum, safeCurrency)}</span>`;
            }

            contentHTML = `
                ${brandHTML}
                <div class="r-title-box">
                    <div class="r-title">إيصال شحن محفظة</div>
                    <div class="r-id num-en">#${Utils.escapeHtml(data.displayId || '---')}</div>
                </div>
                <div class="r-grid">
                    <div class="r-item"><span class="r-label">اسم العميل</span><span class="r-value">${Utils.escapeHtml(data.userName || '---')}</span></div>
                    <div class="r-item"><span class="r-label">معرف الحساب (ID)</span><span class="r-value num-en">${Utils.escapeHtml(data.userDisplayId || '---')}</span></div>
                    <div class="r-item"><span class="r-label">طريقة الدفع</span><span class="r-value">${Utils.escapeHtml(data.method || '---')}</span></div>
                    <div class="r-item"><span class="r-label">تاريخ ووقت العملية</span><span class="r-value num-en" dir="ltr">${Utils.escapeHtml(data.dateTime || '---').replace(/\|/g, '&nbsp;&nbsp;|&nbsp;&nbsp;')}</span></div>
                    <div class="r-item"><span class="r-label">المبلغ الأساسي</span><span class="r-value num-en" dir="ltr">${RenderHelpers.formatMoney(this._safeNum(data.amount), safeCurrency)}</span></div>
                    <div class="r-item"><span class="r-label">${feeDisplayLabel}</span>${feeValueHtml}</div>
                </div>
                <div class="r-total-box">
                    <div class="r-total-label">صافي الرصيد المضاف</div>
                    <div class="r-total-val num-en" dir="ltr">${RenderHelpers.formatMoney(this._safeNum(data.netVal), String(data.targetCurrency || 'USD').toUpperCase())}</div>
                </div>
            `;
        } else {
            const safeCurrency = this._safeAttr(data.priceCurrency || 'USD').toUpperCase();
            const safeOrigPrice = this._safeNum(data.originalPrice);
            const safeFinalPrice = this._safeNum(data.price);
            
            const originalPriceHtml = safeOrigPrice > safeFinalPrice ? 
                `<div class="r-item"><span class="r-label">السعر الأساسي (قبل الخصم)</span><span class="r-value num-en" dir="ltr" style="text-decoration: line-through; color: #94a3b8;">${RenderHelpers.formatMoney(safeOrigPrice, safeCurrency)}</span></div>` : '';
            
            const formattedInput = this._safeMultiLine(data.input || '---').replace(/\|/g, '<br>');
            const formattedCode = data.code ? this._safeMultiLine(data.code).replace(/\|/g, '<br>') : '';

            contentHTML = `
                ${brandHTML}
                <div class="r-title-box">
                    <div class="r-title">فاتورة طلب شراء</div>
                    <div class="r-id num-en">#${Utils.escapeHtml(data.displayId || '---')}</div>
                </div>
                <div class="r-grid">
                    <div class="r-item r-item-full" style="border-right: 4px solid #3b82f6;"><span class="r-label">المنتج</span><span class="r-value" style="font-size: 18px;">${Utils.escapeHtml(data.product || '---')}</span></div>
                    <div class="r-item"><span class="r-label">حالة الطلب</span><span class="r-value">${Utils.escapeHtml(data.status || '---')}</span></div>
                    <div class="r-item"><span class="r-label">الكمية</span><span class="r-value num-en">${this._safeNum(data.qty, 1)}</span></div>
                    <div class="r-item"><span class="r-label">اسم العميل</span><span class="r-value">${Utils.escapeHtml(data.userName || '---')}</span></div>
                    <div class="r-item"><span class="r-label">تاريخ ووقت العملية</span><span class="r-value num-en" dir="ltr">${Utils.escapeHtml(data.dateTime || '---').replace(/\|/g, '&nbsp;&nbsp;|&nbsp;&nbsp;')}</span></div>
                    <div class="r-item r-item-full" style="background: #f1f5f9; border-color: #cbd5e1;"><span class="r-label">بيانات الحساب / المدخلات</span><span class="r-value num-en" dir="ltr" style="line-height: 1.8;">${formattedInput}</span></div>
                    ${originalPriceHtml}
                </div>
                ${formattedCode ? `<div class="r-item-full" style="background: #eff6ff; border: 1px dashed #3b82f6;"><span class="r-label" style="color: #1d4ed8;">بيانات التسليم / الأكواد المستلمة</span><span class="r-value r-code-val num-en" dir="ltr" style="line-height: 1.8;">${formattedCode}</span></div>` : ''}
                <div class="r-total-box">
                    <div class="r-total-label">إجمالي المبلغ المدفوع</div>
                    <div class="r-total-val num-en" dir="ltr">${RenderHelpers.formatMoney(safeFinalPrice, safeCurrency)}</div>
                </div>
            `;
        }

        return `
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>${Utils.escapeHtml(config?.filename || 'Receipt')}</title>
                <style>
                    @page { size: A4 portrait; margin: 15mm; }
                    body { 
                        font-family: 'Cairo', system-ui, -apple-system, sans-serif; 
                        background: #f8fafc; 
                        color: #0f172a; 
                        margin: 0; padding: 0; 
                        -webkit-print-color-adjust: exact; print-color-adjust: exact; 
                    }
                    .receipt-container { 
                        max-width: 100%; margin: 0 auto; 
                        background: #ffffff;
                        border: 1px solid #e2e8f0; 
                        border-radius: 16px; 
                        padding: 35px; 
                        box-shadow: 0 10px 25px rgba(0,0,0,0.05);
                    }
                    .header-section { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 20px; margin-bottom: 25px; }
                    .store-name { font-size: 28px; font-weight: 900; color: #0f172a; }
                    
                    .r-title-box { background: rgba(234, 179, 8, 0.1); padding: 20px; border-radius: 12px; border: 1px solid #eab308; margin-bottom: 30px; text-align: center; }
                    .r-title { font-size: 24px; color: #ca8a04; font-weight: 900; margin-bottom: 8px; }
                    .r-id { font-size: 18px; color: #0f172a; font-weight: 700; letter-spacing: 1px; }
                    
                    .r-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; }
                    .r-item { background: #f8fafc; padding: 16px; border-radius: 10px; border-right: 4px solid #eab308; box-sizing: border-box; }
                    .r-item-full { grid-column: 1 / -1; width: 100%; text-align: center; }
                    
                    .r-label { font-size: 14px; color: #64748b; display: block; margin-bottom: 8px; font-weight: 600; }
                    .r-value { font-size: 16px; color: #0f172a; font-weight: 700; word-break: break-word; }
                    .r-code-val { font-size: 20px; color: #1d4ed8; font-weight: 900; letter-spacing: 1px; }
                    
                    .r-total-box { background: #0f172a; padding: 25px; border-radius: 12px; margin-top: 25px; display: flex; justify-content: space-between; align-items: center; color: #fff; box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.3); }
                    .r-total-label { font-size: 20px; font-weight: 700; color: #e2e8f0; }
                    .r-total-val { font-size: 28px; font-weight: 900; color: #eab308; }
                    
                    .r-footer { text-align: center; margin-top: 40px; font-size: 14px; color: #94a3b8; font-weight: 600; border-top: 1px solid #e2e8f0; padding-top: 20px; }
                    .num-en { font-family: system-ui, -apple-system, sans-serif; }
                </style>
            </head>
            <body>
                <div class="receipt-container">
                    ${contentHTML}
                    <div class="r-footer">
                        شكراً لثقتكم في ${storeNameText} | إيصال إلكتروني معتمد
                    </div>
                </div>
            </body>
            </html>
        `;
    },

    // ============================================================================
    // 6️⃣ بناء قائمة الأكواد المستلمة
    // ============================================================================
    buildCodesList: function(codeString) {
        if (!codeString || codeString === 'null') return '';
        return String(codeString).split(/\||\n/).map(c => c.trim()).filter(Boolean).map(code => {
            const safeCode = Utils.escapeHtml(code);
            return `<div class="copyable-code-box lux-code-box success-lux-box" data-action="copy-text" data-text="${this._safeAttr(code)}" style="margin-bottom: 8px;"><span class="num-en">${safeCode}</span><i class="fa-regular fa-copy"></i></div>`;
        }).join('');
    },

    // ============================================================================
    // 7️⃣ بناء شريط حدود الإيداع
    // ============================================================================
    buildLimitsBar: function(feeVal, payCurr, feeUnit, feeType, minVal, maxVal) {
        let itemsHtml = [];
        const safeCurr = this._safeAttr(payCurr || 'USD').toUpperCase();
        const safeFeeVal = this._safeNum(feeVal);
        const safeMin = this._safeNum(minVal);
        const safeMax = this._safeNum(maxVal);
        
        if (safeFeeVal > 0) {
            const isBonus = (feeType === 'bonus');
            itemsHtml.push(`<div class="bar-item ${isBonus ? 'bonus' : 'commission'}"><span class="item-label"><i class="fa-solid ${isBonus ? 'fa-gift' : 'fa-coins'}"></i> ${isBonus ? 'بونص' : 'عمولة'}</span><span class="item-value"><span class="math-sign">${isBonus ? '+' : '-'}</span>${(feeUnit === 'fixed' || feeUnit === 'amount') ? RenderHelpers.formatMoney(safeFeeVal, safeCurr) : `<span class="money-pro"><span class="num-en">${safeFeeVal.toFixed(1)}%</span></span>`}</span></div>`);
        }
        if (safeMin > 0) itemsHtml.push(`<div class="bar-item"><span class="item-label"><i class="fa-solid fa-arrow-down"></i> أدنى حد</span><span class="item-value">${RenderHelpers.formatMoney(safeMin, safeCurr)}</span></div>`);
        if (safeMax > 0) itemsHtml.push(`<div class="bar-item"><span class="item-label"><i class="fa-solid fa-arrow-up"></i> أعلى حد</span><span class="item-value">${RenderHelpers.formatMoney(safeMax, safeCurr)}</span></div>`);
        return itemsHtml;
    },

    // ============================================================================
    // 8️⃣ بناء نموذج الإيداع (Deposit Form)
    // ============================================================================
    buildDepositForm: function(p, copyContainer, isSingleCurrency, currentPayCurrency, currItemsHtml, baseCurr) {
        if (!p) return '';
        const safeBaseCurr = this._safeAttr(baseCurr || 'USD').toUpperCase(); 
        const safePayCurr = this._safeAttr(currentPayCurrency || 'USD').toUpperCase();
        
        return `
            <div class="bal-modal-container-new">
                <div class="bal-payment-title">${Utils.escapeHtml(p.name || 'طريقة الدفع')}</div>
                ${copyContainer}
                <div class="compact-limits-bar" id="bal-limits-bar"></div>
                <div class="bal-inputs-section">
                    <div class="micro-currency-row">
                        <div class="micro-currency-label"><i class="fa-solid fa-wallet"></i> عملة الإيداع</div>
                        <div class="split-dropdown" id="bal-currency-dropdown">
                            <div class="micro-currency-trigger" ${isSingleCurrency ? '' : 'data-action="toggle-bal-curr-menu"'} style="${isSingleCurrency ? 'cursor: default;' : ''}">
                                <span id="bal-selected-currency" class="num-en">${safePayCurr}</span>
                                ${isSingleCurrency ? '' : '<i class="fa-solid fa-chevron-down" style="font-size: 11px;"></i>'}
                            </div>
                            <div class="dropdown-menu" id="bal-currency-list" style="${isSingleCurrency ? 'display:none;' : ''}">${currItemsHtml}</div>
                        </div>
                    </div>
                <div class="bal-input-field-new" id="bal-amount-wrap">
                    <span class="bal-input-currency-new" id="bal-amount-curr">${safePayCurr}</span>
                    <input type="text" id="bal-amount" class="bal-input-new num-en" dir="ltr" placeholder="0.00" inputmode="decimal" autocomplete="one-time-code" spellcheck="false" autocorrect="off">
                    <label class="bal-floating-label">أدخل مبلغ للإيداع</label>
                </div>
                <span id="bal-amount-error" class="bal-error-text-new d-none"></span>
                    <div class="bal-input-field-new" id="bal-net-wrap">
                        <span class="bal-input-currency-new" id="bal-net-curr">${safeBaseCurr}</span>
                        <div class="bal-input-new bal-result-field-new num-en" id="calc-net" dir="ltr">0.00</div>
                        <label class="bal-floating-label">سيضاف لمحفظتك</label>
                    </div>
                </div>

<div id="bal-upload-container" style="display: ${p.reqProof !== false ? 'block' : 'none'}; margin-top: 10px;">
    <button type="button" class="bal-upload-btn-new" id="bal-upload-box" data-action="trigger-click" data-target="bal-file">
        <i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>
    </button>
    <input type="file" id="bal-file" accept="image/*,application/pdf" style="display:none;">
    
    <div id="bal-file-clear" class="hide-element" data-action="clear-bal-file" style="cursor:pointer; color: #ef4444; text-align:center; margin-top:10px; font-size:13px; font-weight:600;">
        <i class="fa-solid fa-trash-can"></i> حذف المرفق وإعادة الرفع
    </div>
    
    <img id="bal-img-preview" class="bal-receipt-preview-new" style="display:none;">
</div>

                <button id="btn-submit-deposit" class="bal-submit-btn-new btn-pro" data-action="submit-balance" disabled>
                    <span class="btn-content"><i class="fa-solid fa-paper-plane"></i> إرسال الطلب</span>
                    <span class="btn-spinner"><i class="fa-solid fa-spinner fa-spin"></i></span>
                </button>         
            </div>`;
    },

    // ============================================================================
    // 🌍 بناء عنصر دولة واحدة للقائمة المنسدلة
    // ============================================================================
    buildCountryItem: function(c) {
        if (!c) return '';
        const safeName = Utils.escapeHtml(c.name || c.nameAr || 'غير محددة');
        const safeFlag = Utils.escapeHtml(c.flag || c.flagEmoji || '🌍');
        const safeCode = Utils.escapeHtml(c.dialCode || '');
        const safeLen = this._safeNum(c.phoneLen, 10);
        
        return `
        <div class="dropdown-item" data-action="select-country" data-name="${this._safeAttr(safeName)}" data-code="${this._safeAttr(safeCode)}" data-len="${safeLen}">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="country-flag" style="font-size: 16px;">${safeFlag}</span>
                <span class="country-name">${safeName}</span>
            </div>
            <span class="num-en country-code" style="color: var(--text-muted); opacity: 0.8; font-weight: 800;">${safeCode}</span>
        </div>`;
    },

    // ============================================================================
    // 9️⃣ بناء تفاصيل العملية (Transaction Detail - Order/Deposit)
    // ============================================================================
    buildTransactionDetail: function(type, id, LiveStoreData, DataManager) {
        const formatInputData = (rawVal) => { 
            if (rawVal === null || rawVal === undefined || rawVal === '' || rawVal === '---') {
                return '<span class="num-en">---</span>';
            }
            const str = String(rawVal).trim();
            if (str.includes('|')) { 
                const parts = str.split('|').map(s => s.trim()).filter(Boolean);
                return `<div class="nm-input-stack">${parts.map(p => `<span class="num-en nm-input-capsule">${Utils.escapeHtml(p)}</span>`).join('')}</div>`;
            } 
            return `<span class="num-en nm-input-capsule">${Utils.escapeHtml(str)}</span>`; 
        };

        let html = '';

        if(type === 'deposit') {
            const d = (LiveStoreData.deposits || []).find(x => String(x.id) === String(id));
            if(!d) return `<div class="tx-error-box"><i class="fa-solid fa-triangle-exclamation"></i> عذراً، لم يتم العثور على الإيداع.</div>`;

            const shortDepositId = RenderHelpers.formatDepositId(d);
            const safeStatus = String(d.status || 'pending').toLowerCase();
            const safeDepositIdAttr = this._safeAttr(id);
            
            let stClass = 'pending'; let stTxt = safeStatus === 'pending' ? 'قيد المراجعة' : safeStatus; let stIcon = 'fa-clock';
            if(safeStatus === 'approved' || safeStatus === 'completed') { stClass = 'completed'; stTxt = 'مقبول'; stIcon = 'fa-check-circle'; }
            else if(safeStatus === 'rejected') { stClass = 'rejected'; stTxt = 'مرفوض'; stIcon = 'fa-times-circle'; }
            
            let replyHtml = '';
            if (d.adminNote && String(d.adminNote).trim() !== '' && d.adminNote !== 'null') {
                const safeResponse = this._safeMultiLine(d.adminNote);
                replyHtml = `
                <div class="nm-reply-box">
                    <div class="nm-reply-content">
                        <span class="nm-reply-head"><i class="fa-solid fa-headset"></i> ملاحظات الإدارة</span>
                        <div class="nm-reply-body admin-reply-text">${safeResponse}</div>
                    </div>
                    <button class="reply-copy-btn" data-action="copy-text" data-text="${this._safeAttr(d.adminNote)}" title="نسخ الرد">
                        <i class="fa-regular fa-copy"></i>
                    </button>
                </div>`;
            }

            let creditedRow = '';
            if (d.creditedAmount !== undefined) {
                const safeCredited = this._safeNum(d.creditedAmount);
                creditedRow = `<div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-wallet"></i> الرصيد المضاف</span><div class="nm-val">${RenderHelpers.formatMoney(safeCredited, this._safeAttr(d.targetCurrency || 'USD').toUpperCase())}</div></div>`;
            }

            const safeReceiptUrl = this._safeUrlLink(d.receipt);
            const receiptHtml = (safeReceiptUrl && safeReceiptUrl !== '#') ? `<a href="${safeReceiptUrl}" target="_blank" rel="noopener noreferrer" class="text-decoration-none"><div class="nm-universal-card nm-receipt-card cursor-zoom-in" data-url="${safeReceiptUrl}"><img src="${safeReceiptUrl}" class="nm-receipt-img hover-scale" alt="Receipt"><div class="nm-receipt-card-info"><i class="fa-solid fa-magnifying-glass-plus"></i> اضغط لعرض الإيصال كاملاً</div></div></a>` : '';

            const safeTimeMs = Utils.parseSafeTime(d.time || d.createdAt);
            const safeAmount = this._safeNum(d.amount);

            html = `
            <div class="nm-container">
                <div class="nm-universal-card">
                    <div class="nm-title-frame"><div class="nm-prod-title">تفاصيل الإيداع</div></div>
                    <div class="nm-card-body">
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-coins"></i> المبلغ المودع</span><div class="nm-val">${RenderHelpers.formatMoney(safeAmount, this._safeAttr(d.currency || 'USD').toUpperCase())}</div></div>
                        ${creditedRow}
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-building-columns"></i> طريقة الدفع</span><div class="nm-val"><span class="num-en">${Utils.escapeHtml(d.method || 'غير محدد')}</span></div></div>
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-circle-info"></i> الحالة</span><div class="nm-status-badge-lux ${stClass}"><i class="fa-solid ${stIcon}"></i> ${stTxt}</div></div>
                        <div class="nm-row-compact smart-copy-line is-copyable" data-action="copy-text" data-text="${this._safeAttr(shortDepositId)}">
                            <span class="nm-label nm-pointer-none"><i class="fa-solid fa-hashtag"></i> رقم العملية</span>
                            <div class="uid-capsule nm-pointer-none"><i class="fa-solid fa-id-card"></i><span class="num-en">${shortDepositId}</span></div>
                        </div>
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-calendar"></i> التاريخ</span><span class="nm-val num-en">${RenderHelpers.formatSafeDate(safeTimeMs)}</span></div>
                    </div>
                </div>
                ${replyHtml} ${receiptHtml}
            </div>`;
        } else {
            const user = DataManager.user;
            const o = (LiveStoreData.orders || []).find(x => String(x.id) === String(id) && user && String(x.userId) === String(user.id));
            if(!o) return `<div class="tx-error-box"><i class="fa-solid fa-triangle-exclamation"></i> لا يمكن العثور على الطلب.</div>`;

            const shortOrderId = RenderHelpers.formatOrderId(o);
            const safeStatus = String(o.status || 'pending').toLowerCase();
            const isRet = (safeStatus === 'refunded' || safeStatus === 'returned');
            const safeOrderIdAttr = this._safeAttr(id);
            
            let stTxt = 'قيد التنفيذ'; let stClass = 'pending'; let stIcon = 'fa-clock';

            if (safeStatus === 'completed') { stTxt = 'مكتمل'; stClass = 'completed'; stIcon = 'fa-circle-check'; } 
            else if (safeStatus === 'rejected') { stTxt = 'مرفوض'; stClass = 'rejected'; stIcon = 'fa-circle-xmark'; } 
            else if (isRet) { stTxt = 'مسترجع'; stClass = 'returned'; stIcon = 'fa-rotate-left'; }
            
            let durationHtml = '';
            if (safeStatus !== 'completed' && safeStatus !== 'rejected' && !isRet) {
                durationHtml = `<div class="nm-duration-pill"><i class="fa-solid fa-bolt"></i><span class="mx-1">مدة انجاز الطلب: </span><i class="fa-regular fa-clock opacity-90"></i></div>`;
            } else {
                let finalEndTime = o.actionTime || o.completedTime || o.updatedAt || o.time;
                let durationStr = '---';
                if (Utils.calculateOrderDuration) {
                    try {
                        durationStr = Utils.calculateOrderDuration(o.time, finalEndTime) || '---';
                    } catch (e) {
                        console.warn("فشل حساب مدة الطلب", e);
                    }
                }
                durationHtml = `<div class="nm-duration-pill"><i class="fa-solid fa-bolt"></i><span dir="ltr" class="nm-font-en-fix">مدة الانجاز: ${Utils.escapeHtml(durationStr)}</span></div>`;
            }

            let replyHtml = '';
            if (o.response && String(o.response).trim() !== '' && o.response !== 'null') {
                const safeResponse = this._safeMultiLine(o.response);
                replyHtml += `<div class="nm-reply-box"><div class="nm-reply-content"><span class="nm-reply-head"><i class="fa-solid fa-headset"></i> رد المتجر</span><div class="nm-reply-body admin-reply-text">${safeResponse}</div></div></div>`;
            }
            if (safeStatus === 'completed' && o.deliveredCode && String(o.deliveredCode).trim() !== '' && o.deliveredCode !== 'null') {
                replyHtml += `<div class="nm-reply-box auto-delivery-box"><div class="nm-reply-content"><span class="nm-reply-head"><i class="fa-solid fa-bolt"></i> تسليم فوري</span><div class="nm-reply-body nm-auto-delivery-scroll">${this.buildCodesList(o.deliveredCode)}</div></div></div>`;
            }

            // 🛡️ الحماية المطلقة من ظهور NaN في الفواتير
            const cDiscountLocal = this._safeNum(o.pricingSnapshot?.couponDiscount, o.couponDiscount);
            const oDiscountLocal = this._safeNum(o.pricingSnapshot?.offerDiscount, o.saleDiscount);
            const origLocal = this._safeNum(o.pricingSnapshot?.originalPrice, o.price);
            const finalLocal = this._safeNum(o.pricingSnapshot?.finalPrice, o.price);
            
            const displayCurr = this._safeAttr(o.currency || o.priceCurrency || 'USD').toUpperCase();
            const formatFn = (amt) => RenderHelpers.formatMoney(this._safeNum(amt), displayCurr);
            
            let priceSectionHtml = '';
            if (cDiscountLocal > 0 || oDiscountLocal > 0) {
                let breakdown = `<div class="nm-receipt-line"><span class="line-lbl"><i class="fa-solid fa-box-open"></i> السعر الأساسي</span><span class="old-amt num-en" dir="ltr">${formatFn(origLocal)}</span></div>`;
                if (oDiscountLocal > 0) breakdown += `<div class="nm-receipt-line sale-line"><span class="line-lbl"><i class="fa-solid fa-tag"></i> تخفيض العرض</span><span class="num-en" dir="ltr">-${formatFn(oDiscountLocal)}</span></div>`;
                if (cDiscountLocal > 0) breakdown += `<div class="nm-receipt-line discount-line"><span class="line-lbl"><i class="fa-solid fa-ticket"></i> كوبون (${Utils.escapeHtml(o.pricingSnapshot?.couponCode || 'مفعل')})</span><span class="num-en" dir="ltr">-${formatFn(cDiscountLocal)}</span></div>`;
                priceSectionHtml = `<div class="nm-row-compact col-layout"><div class="nm-receipt-integrated"><div class="nm-receipt-details-box">${breakdown}</div><div class="nm-receipt-main-row"><span class="nm-label"><i class="fa-solid fa-file-invoice-dollar"></i> الإجمالي</span><span class="nm-receipt-main-total num-en" dir="ltr">${formatFn(finalLocal)}</span></div></div></div>`;
            } else {
                priceSectionHtml = `<div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-coins"></i> السعر الاجمالي</span><div class="nm-val" dir="ltr">${formatFn(finalLocal)}</div></div>`;
            }

            const safeTimeMs = Utils.parseSafeTime(o.time || o.createdAt);
            const safeQty = this._safeNum(o.qty, 1);

            html = `
            <div class="nm-container">
                ${durationHtml}
                <div class="nm-universal-card">
                    <div class="nm-title-frame"><div class="nm-prod-title">${Utils.escapeHtml(o.product || 'منتج')}</div></div>
                    <div class="nm-card-body">
                        <div class="nm-row-compact smart-copy-line is-copyable" data-action="copy-text" data-text="${this._safeAttr(shortOrderId)}">
                            <span class="nm-label nm-pointer-none"><i class="fa-solid fa-hashtag"></i> رقم الطلب</span>
                            <div class="nm-val scl-text nm-pointer-none" dir="ltr"><span class="num-en">${shortOrderId}</span><i class="fa-regular fa-copy scl-icon"></i></div>
                        </div>
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-circle-info"></i> الحالة</span><div class="nm-status-badge-lux ${stClass}"><i class="fa-solid ${stIcon}"></i> ${stTxt}</div></div>
                        ${priceSectionHtml} 
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-layer-group"></i> الكمية</span><div class="nm-val" dir="ltr"><span class="num-en">${safeQty}</span></div></div>
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-clock"></i> التاريخ</span><div class="nm-val" dir="ltr"><span class="num-en">${RenderHelpers.formatSafeDate(safeTimeMs)}</span></div></div>
                        <div class="nm-row-compact align-start"><span class="nm-label"><i class="fa-solid fa-bullseye"></i> الحساب</span><div class="nm-val" dir="ltr">${formatInputData(o.input)}</div></div>
                    </div>
                </div>
                <div class="nm-data-box"><div class="nm-btn-print-magic" data-action="export-receipt" data-id="${safeOrderIdAttr}"><i class="fa-solid fa-file-pdf"></i> تصدير الإيصال</div></div>
                ${replyHtml}
            </div>`;
        }        
        return html;
    },

    // ============================================================================
    // 10. بناء نافذة إجراءات الإيصال (Receipt Action Dialog)
    // ============================================================================
    buildReceiptActionDialog: function(blobUrl, canShare) {
        let shareBtnHtml = canShare ? `
            <button id="btn-native-share" class="alert-btn" style="margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="fa-solid fa-share-nodes"></i> مشاركة الفاتورة
            </button>
        ` : '';

        // زر التحميل الثانوي
        let downloadBtnClass = canShare ? 'btn-logout-ghost' : 'alert-btn';
        let downloadIconColor = canShare ? '' : 'style="color: var(--gold-text);"';

        return `
            <div class="sys-dialog-overlay"></div>
            <div class="sys-dialog-card" style="padding: 25px 20px;">
                
                <div class="sys-dialog-icon" style="color: var(--success); background: var(--success-bg); border: 1px solid rgba(var(--success-rgb), 0.3);">
                    <i class="fa-solid fa-file-invoice"></i>
                </div>
                
                <h3 class="sys-dialog-title">الإيصال الإلكتروني</h3>
                <p class="sys-dialog-msg" style="margin-bottom: 20px;">تم توثيق العملية وتصدير الإيصال بنجاح. يرجى تحديد الإجراء المطلوب.</p>

                <div style="background: var(--bg-glass-dark); padding: 8px; border-radius: var(--radius-md); border: var(--border-nested); margin-bottom: 20px;">
                    <img src="${blobUrl}" style="width: 100%; max-height: 220px; object-fit: contain; border-radius: var(--radius-sm);" alt="معاينة الإيصال">
                </div>

                <div class="sys-dialog-actions" style="display: flex; flex-direction: column; width: 100%;">
                    ${shareBtnHtml}
                    <button id="btn-native-download" class="${downloadBtnClass}" style="display: flex; justify-content: center; align-items: center; gap: 8px; width: 100%; margin: 0;">
                        <i class="fa-solid fa-download" ${downloadIconColor}></i> حفظ في الجهاز
                    </button>
                </div>
                
                <button id="btn-close-receipt-dialog" class="adv-close-btn">إغلاق النافذة</button>
            </div>
        `;
    }

};
