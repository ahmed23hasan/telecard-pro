// ============================================================================
// 🧱 مصنع قوالب الواجهات الأمامية (uiBuilders.js) - Ultimate V16.0 💎
// 🎯 الوظيفة: تحويل البيانات الخام (Data) إلى نصوص HTML جاهزة للرسم بأمان تام
// 🚀 التحديثات المعمارية (V16.0):
// 1. Strict XSS Shield: إزالة الـ (Fallback) الكارثي للروابط الخام وإجبار التصفية.
// 2. Context Safety: استبدال `this` بـ `UIBuilders` لمنع انهيار الواجهة عند الـ Destructuring.
// 3. Defensive Dates: تغليف كل التواريخ بـ `parseSafeTime` لمنع ظهور [object Object] للعملاء.
// ============================================================================

import * as Utils from '../utils.js'; 
import { RenderHelpers } from '../core/renderHelpers.js';

export const UIBuilders = {

    /** 1️⃣ بناء كرت حركة المحفظة (إيداع / شراء) */
    buildWalletCard: function(tx, walletCurr, isFilterActive) {
        if (!tx) return '';
        const isDep = tx.type === 'deposit';
        let amountPrefix = '', amountClass = '', cardClass = '', iconName = '', iconColorClass = '';
        
        // 🛡️ الإصلاح 3: تحصين التاريخ قبل إرساله للرسم
        const safeTimeMs = Utils.parseSafeTime(tx.time || tx.createdAt);
        const formattedDate = RenderHelpers.formatSafeDate(safeTimeMs);

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
        if (!isFilterActive && typeof tx.balanceAfter === 'number' && !isNaN(tx.balanceAfter)) {
            runningBalanceHtml = `<div class="th-balance-after">${RenderHelpers.formatMoney(tx.balanceAfter, walletCurr)}</div>`;
        }

        const safeTxName = Utils.escapeHtml(isDep ? (tx.method || 'إيداع رصيد') : (tx.product || 'طلب شراء'));

        return `
            <div class="th-card ${cardClass} clickable-tx-card" data-action="jump-transaction" data-id="${Utils.escapeHtml(tx.id || '')}" data-type="${jumpType}" title="انقر لعرض التفاصيل">
                <div class="th-icon ${iconColorClass}"><i class="fa-solid ${iconName}"></i></div>
                <div class="th-body">
                    <div class="th-details-col">
                        <div class="th-row-top"><span class="tx-name-text">${safeTxName}</span></div>
                        <div class="th-row-bottom"><span class="th-date num-en">${formattedDate}</span></div>
                    </div>
                    <div class="th-amount-col">
                        <span class="th-order num-en is-copyable" data-action="copy-text" data-text="${shortTxId}" title="اضغط لنسخ رقم العملية">
                            <i class="fa-regular fa-copy" style="margin-right:4px; font-size:10px; opacity:0.7;"></i> ${shortTxId}
                        </span>
                        <div class="th-amount ${amountClass}">${amountPrefix}${RenderHelpers.formatMoney(tx.amountVal || 0, tx.amountCurrency)}</div>
                        ${runningBalanceHtml} 
                    </div>
                </div>
            </div>`;
    },

    /** 2️⃣ بناء كرت الطلب (Order Card) */
    buildOrderCard: function(o, idx, displayCurr, highlightId = null, productNamePassed = null) {
        if (!o) return '';
        const getCleanInputRows = (str) => {
            if (!str || str === '---' || typeof str === 'object') return [];
            return String(str).split('|').map(s => s.trim()).filter(s => s !== '');
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
        else if (status === 'processing') statusLabel = '<i class="fa-solid fa-gears"></i> جاري التنفيذ';
        else if (status === 'rejected') statusLabel = '<i class="fa-solid fa-circle-xmark"></i> مرفوض';
        else if (['returned', 'refunded'].includes(status)) statusLabel = '<i class="fa-solid fa-rotate-left"></i> مسترجع';
        
        const safeCouponDisc = parseFloat(o.pricingSnapshot?.couponDiscount || o.couponDiscount) || 0;
        const safeSaleDisc = parseFloat(o.pricingSnapshot?.offerDiscount || o.saleDiscount) || 0;
        
        const totalDiscLocal = Number((safeCouponDisc + safeSaleDisc).toFixed(4));
        
        let discountBadgeHtml = '';
        if (totalDiscLocal > 0) {
            const isCombo = (safeCouponDisc > 0 && safeSaleDisc > 0);
            const isCoupon = (safeCouponDisc > 0);
            discountBadgeHtml = `
                <div class="oh-discount-badge ${isCombo ? 'badge-combo' : (isCoupon ? 'badge-coupon' : 'badge-sale')}">
                    <i class="fa-solid ${isCombo ? 'fa-gift' : (isCoupon ? 'fa-ticket' : 'fa-tag')}"></i> 
                    <span>${isCombo ? 'توفير مضاعف' : (isCoupon ? 'كوبون' : 'تخفيض')}</span>
                    <span class="num-en">(-${RenderHelpers.formatMoney(totalDiscLocal, displayCurr)})</span>
                </div>`;
        }
        
        const isHighlighted = (highlightId && String(o.id) === String(highlightId)) ? 'jump-highlight' : '';
        const safeTimeMs = Utils.parseSafeTime(o.time || o.createdAt);
        
        return `
            <div class="oh-card ${isHighlighted}" style="--anim-idx: ${idx}" data-action="open-detail" data-type="order" data-id="${Utils.escapeHtml(o.id || '')}">
                <div class="oh-right">
                    ${discountBadgeHtml} 
                    <div class="oh-title">${productName}</div> 
                    <div class="oh-inputs-stack">${inputRows.map(row => `<div class="oh-input-line num-en">${Utils.escapeHtml(row)}</div>`).join('')}</div>
                    <div class="oh-date-time num-en">${RenderHelpers.formatSafeDate(safeTimeMs)}</div>
                </div>
                <div class="oh-left">
                    <div class="oh-status-box"><span class="oh-status ${statusClass}">${statusLabel}</span></div>
                    <div class="oh-price-box" dir="ltr"><div class="oh-amount">${RenderHelpers.formatMoney(Number(o.price || 0), displayCurr)}</div>${qtyHtml}</div>
                    <div class="oh-order-box" dir="ltr"><span class="oh-order-number num-en">${RenderHelpers.formatOrderId(o)}</span></div>
                </div>
            </div>`;
    },

    /** 3️⃣ بناء كرت عملية الدفع (Payment/Deposit Card) */
    buildPaymentCard: function(d, userDisplayName, userIdString, baseCurrency) {
        if (!d) return '';
        const isDeduction = (d.creditedAmount !== undefined && Number(d.creditedAmount) < 0) || (d.method && String(d.method).includes('خصم'));
        
        let stClass = 'st-pending', stText = 'قيد المراجعة', icon = 'fa-clock';
        if (['approved', 'completed'].includes(d.status)) { 
            if (isDeduction) { stClass = 'st-rejected'; stText = 'مخصوم'; icon = 'fa-arrow-up-long'; } 
            else { stClass = 'st-approved'; stText = 'مقبول'; icon = 'fa-check'; }
        } else if (d.status === 'rejected') { stClass = 'st-rejected'; stText = 'مرفوض'; icon = 'fa-xmark'; } 
        else if (['refunded', 'returned'].includes(d.status)) { stClass = 'st-refunded'; stText = 'مسترجع'; icon = 'fa-rotate-left'; }

        const currency = (d.currency || 'USD').toUpperCase();
        const safeBaseCurrency = (baseCurrency || 'USD').toUpperCase();
        const targetCurr = (d.targetCurrency || safeBaseCurrency).toUpperCase();
        const rawAmount = Math.abs(parseFloat(d.amount) || 0); 
        const displayNetAmount = d.creditedAmount !== undefined ? Math.abs(parseFloat(d.creditedAmount)) : rawAmount;
        const feeVal = parseFloat(d.fees || d.fee || 0); 
        
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
            exchangeRateHtml = `
            <div class="ph-item">
                <div class="ph-item-label"><i class="fa-solid fa-money-bill-transfer"></i> سعر الصرف المطبق</div>
                <div class="ph-item-val num-en" dir="ltr" style="color: var(--text-muted); font-size: 13px;">1 ${targetCurr} = ${Number(d.exchangeRate).toFixed(4)} ${currency}</div>
            </div>`;
        }

        const finalUserName = (!userDisplayName || userDisplayName.trim() === '') ? 'العميل' : userDisplayName;
        let balAfter = d.balanceAfter !== undefined ? d.balanceAfter : (d.postBalance !== undefined ? d.postBalance : d.newBalance); 
        
        let balanceAfterHtml = '';
        if (balAfter !== undefined && balAfter !== null && balAfter !== '') {
            balanceAfterHtml = `
                <div class="ph-item" style="background: rgba(var(--primary-rgb), 0.05); border: 1px dashed rgba(var(--primary-rgb), 0.3); border-radius: 8px; margin-top: 8px; padding: 10px;">
                    <div class="ph-item-label" style="color: var(--primary);"><i class="fa-solid fa-piggy-bank"></i> رصيد المحفظة الحالي</div>
                    <div class="ph-item-val num-en" style="color: var(--primary); font-weight: 900; font-size: 15px;" dir="ltr">${RenderHelpers.formatMoney(balAfter, targetCurr)}</div>
                </div>`;
        }

        // 🛡️ الإصلاح 1: إغلاق ثغرة الحقن للروابط (XSS)
        const safeReceiptUrl = d.receipt ? Utils.safeUrl(d.receipt) : '';
        let receiptHtml = '';
        if (safeReceiptUrl && safeReceiptUrl !== '#') {
            receiptHtml = `
            <div class="ph-item align-center mt-10">
                <div class="ph-item-label"><i class="fa-solid fa-file-invoice"></i> المرفقات (إشعار الدفع)</div>
                <div class="ph-item-val">
                    <a href="${safeReceiptUrl}" target="_blank" rel="noopener noreferrer" class="hover-scale" style="width: 45px; height: 45px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.15); display: inline-block; box-shadow: 0 4px 10px rgba(0,0,0,0.2); transition: transform 0.2s;" title="اضغط لعرض الإشعار">
                        <img src="${safeReceiptUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="إشعار الدفع">
                    </a>
                </div>
            </div>`;
        }

        const safeTimeMs = Utils.parseSafeTime(d.time || d.createdAt);
        const formattedDate = RenderHelpers.formatSafeDate(safeTimeMs);
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
                            <div class="ph-item-val num-en ph-id is-copyable" data-action="copy-text" data-text="${shortDepositId}">${shortDepositId}</div>
                        </div>
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-regular fa-calendar-check"></i> الوقت والتاريخ</div>
                            <div class="ph-item-val num-en" dir="ltr" style="font-size: 12.5px;">${formattedDate.replace('|', '&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>
                        </div>

                        <div class="ph-sep-line" style="margin: 10px 0; opacity: 0.3;"></div>
                        
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-solid fa-user-tag"></i> اسم العميل</div>
                            <div class="ph-item-val" style="font-weight: 700;">${Utils.escapeHtml(finalUserName)}</div>
                        </div>
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-solid fa-id-card"></i> معرف الحساب</div>
                            <div class="ph-item-val num-en is-copyable" data-action="copy-text" data-text="${Utils.escapeHtml(userIdString)}">${Utils.escapeHtml(userIdString)} <i class="fa-regular fa-copy" style="font-size:11px; margin-right:4px;"></i></div>
                        </div>
                        
                        <div class="ph-sep-line" style="margin: 10px 0; opacity: 0.3;"></div>
                        
                        <div class="ph-item">
                            <div class="ph-item-label"><i class="fa-solid fa-tags"></i> ${feeLabel}</div>
                            <div class="ph-item-val num-en">${feeValueHtml}</div>
                        </div>
                        ${exchangeRateHtml}
                        <div class="ph-item item-highlight">
                            <div class="ph-item-label"><i class="fa-solid fa-hand-holding-dollar"></i> المبلغ الصافي المضاف</div>
                            <div class="ph-item-val num-en ${amountColorClass}" style="font-size: 15px;">${RenderHelpers.formatMoney(displayNetAmount, targetCurr)}</div>
                        </div>
                        
                        ${balanceAfterHtml}
                        ${receiptHtml}
                    </div>
                    
                    ${d.adminNote ? `
                        <div class="ph-admin-note ${d.status === 'rejected' ? 'note-rejected' : 'note-approved'}" style="margin-top: 15px;">
                            <i class="fa-solid fa-headset"></i>
                            <div class="ph-admin-note-content"><span class="ph-admin-note-title">رسالة الإدارة:</span><div class="admin-reply-text">${Utils.escapeHtml(d.adminNote)}</div></div>
                        </div>` : ''}
                    
                    <div class="ph-footer-action" style="margin-top: 15px;">
                        <button class="btn-receipt-export" data-action="export-receipt" data-id="${Utils.escapeHtml(d.id || '')}"><i class="fa-solid fa-file-export"></i> تصدير الإيصال PDF</button>
                    </div>
                </div>
            </div>`;
    },

    /** 4️⃣ بناء محتوى كارت المنتج */
    buildProductCardInner: function(safeName, priceSectionHtml, imgObj, visualElementsHtml, nameExpandedStyle) {
        return `
            <svg class="snake-border" viewBox="0 0 120 165" preserveAspectRatio="none"><rect x="0.7" y="0.7" width="118.6" height="163.6"></rect></svg>
            <div class="card-image ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">${visualElementsHtml} ${imgObj.html}</div>
            <div class="card-info">
                <div class="product-name" style="${nameExpandedStyle}">${safeName}</div>
                ${priceSectionHtml}
            </div>`;
    },

    /** 5️⃣ بناء فاتورة الإيصال PDF (الديناميكية) */
    buildPDFReceipt: function(config, brandHTML) {
        const storeNameText = Utils.escapeHtml(config.storeName || 'المتجر');
        let contentHTML = '';

        if (config.type === 'deposit') {
            const isBonus = config.data.feeType === 'bonus';
            const feeValNum = Number(config.data.feeVal) || 0;
            
            let feeDisplayLabel = isBonus ? 'بونص إضافي' : 'رسوم مخصومة';
            if (config.data.feePercent) feeDisplayLabel += ` (${Utils.escapeHtml(config.data.feePercent)}%)`;
            
            let feeValueHtml = '';
            if (feeValNum === 0) {
                feeValueHtml = `<span class="r-value" style="color: #64748b;">${RenderHelpers.formatMoney(0, config.data.currency)}</span>`;
            } else if (isBonus) {
                feeValueHtml = `<span class="r-value num-en" dir="ltr" style="color: #16a34a;">+${RenderHelpers.formatMoney(feeValNum, config.data.currency)}</span>`;
            } else {
                feeValueHtml = `<span class="r-value num-en" dir="ltr" style="color: #ef4444;">-${RenderHelpers.formatMoney(feeValNum, config.data.currency)}</span>`;
            }

            contentHTML = `
                ${brandHTML}
                <div class="r-title-box">
                    <div class="r-title">إيصال شحن محفظة</div>
                    <div class="r-id num-en">#${Utils.escapeHtml(config.data.displayId)}</div>
                </div>
                <div class="r-grid">
                    <div class="r-item"><span class="r-label">اسم العميل</span><span class="r-value">${Utils.escapeHtml(config.data.userName)}</span></div>
                    <div class="r-item"><span class="r-label">معرف الحساب (ID)</span><span class="r-value num-en">${Utils.escapeHtml(config.data.userDisplayId)}</span></div>
                    <div class="r-item"><span class="r-label">طريقة الدفع</span><span class="r-value">${Utils.escapeHtml(config.data.method)}</span></div>
                    <div class="r-item"><span class="r-label">تاريخ ووقت العملية</span><span class="r-value num-en" dir="ltr">${Utils.escapeHtml(config.data.dateTime).replace('|', '&nbsp;&nbsp;|&nbsp;&nbsp;')}</span></div>
                    <div class="r-item"><span class="r-label">المبلغ الأساسي</span><span class="r-value num-en" dir="ltr">${RenderHelpers.formatMoney(config.data.amount, config.data.currency)}</span></div>
                    <div class="r-item"><span class="r-label">${feeDisplayLabel}</span>${feeValueHtml}</div>
                </div>
                <div class="r-total-box">
                    <div class="r-total-label">صافي الرصيد المضاف</div>
                    <div class="r-total-val num-en" dir="ltr">${RenderHelpers.formatMoney(config.data.netVal, config.data.targetCurrency)}</div>
                </div>
            `;
        } else {
            const originalPriceHtml = config.data.originalPrice > config.data.price ? 
                `<div class="r-item"><span class="r-label">السعر الأساسي (قبل الخصم)</span><span class="r-value num-en" dir="ltr" style="text-decoration: line-through; color: #94a3b8;">${RenderHelpers.formatMoney(config.data.originalPrice, config.data.priceCurrency)}</span></div>` : '';
            
            const formattedInput = Utils.escapeHtml(config.data.input).replace(/\|/g, '<br>');
            const formattedCode = config.data.code ? Utils.escapeHtml(config.data.code).replace(/\||\n/g, '<br>') : '';

            contentHTML = `
                ${brandHTML}
                <div class="r-title-box">
                    <div class="r-title">فاتورة طلب شراء</div>
                    <div class="r-id num-en">#${Utils.escapeHtml(config.data.displayId)}</div>
                </div>
                <div class="r-grid">
                    <div class="r-item r-item-full" style="border-right: 4px solid #3b82f6;"><span class="r-label">المنتج</span><span class="r-value" style="font-size: 18px;">${Utils.escapeHtml(config.data.product)}</span></div>
                    <div class="r-item"><span class="r-label">حالة الطلب</span><span class="r-value">${Utils.escapeHtml(config.data.status)}</span></div>
                    <div class="r-item"><span class="r-label">الكمية</span><span class="r-value num-en">${Utils.escapeHtml(config.data.qty)}</span></div>
                    <div class="r-item"><span class="r-label">اسم العميل</span><span class="r-value">${Utils.escapeHtml(config.data.userName)}</span></div>
                    <div class="r-item"><span class="r-label">تاريخ ووقت العملية</span><span class="r-value num-en" dir="ltr">${Utils.escapeHtml(config.data.dateTime).replace('|', '&nbsp;&nbsp;|&nbsp;&nbsp;')}</span></div>
                    <div class="r-item r-item-full" style="background: #f1f5f9; border-color: #cbd5e1;"><span class="r-label">بيانات الحساب / المدخلات</span><span class="r-value num-en" dir="ltr" style="line-height: 1.8;">${formattedInput}</span></div>
                    ${originalPriceHtml}
                </div>
                ${formattedCode ? `<div class="r-item-full" style="background: #eff6ff; border: 1px dashed #3b82f6;"><span class="r-label" style="color: #1d4ed8;">بيانات التسليم / الأكواد المستلمة</span><span class="r-value r-code-val num-en" dir="ltr" style="line-height: 1.8;">${formattedCode}</span></div>` : ''}
                <div class="r-total-box">
                    <div class="r-total-label">إجمالي المبلغ المدفوع</div>
                    <div class="r-total-val num-en" dir="ltr">${RenderHelpers.formatMoney(config.data.price, config.data.priceCurrency)}</div>
                </div>
            `;
        }

        return `
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>${Utils.escapeHtml(config.filename)}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
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

    /** 6️⃣ بناء قائمة الأكواد المستلمة */
    buildCodesList: function(codeString) {
        if (!codeString) return '';
        return codeString.split(/\||\n/).map(c => c.trim()).filter(Boolean).map(code => {
            return `<div class="copyable-code-box lux-code-box success-lux-box" data-action="copy-text" data-text="${Utils.escapeHtml(code)}" style="margin-bottom: 8px;"><span class="num-en">${Utils.escapeHtml(code)}</span><i class="fa-regular fa-copy"></i></div>`;
        }).join('');
    },

    /** 7️⃣ بناء شريط حدود الإيداع */
    buildLimitsBar: function(feeVal, payCurr, feeUnit, feeType, minVal, maxVal) {
        let itemsHtml = [];
        if (feeVal > 0) {
            const isBonus = (feeType === 'bonus');
            itemsHtml.push(`<div class="bar-item ${isBonus ? 'bonus' : 'commission'}"><span class="item-label"><i class="fa-solid ${isBonus ? 'fa-gift' : 'fa-coins'}"></i> ${isBonus ? 'بونص' : 'عمولة'}</span><span class="item-value"><span class="math-sign">${isBonus ? '+' : '-'}</span>${(feeUnit === 'fixed' || feeUnit === 'amount') ? RenderHelpers.formatMoney(feeVal, payCurr) : `<span class="money-pro"><span class="num-en">${feeVal.toFixed(1)}%</span></span>`}</span></div>`);
        }
        if (minVal > 0) itemsHtml.push(`<div class="bar-item"><span class="item-label"><i class="fa-solid fa-arrow-down"></i> أدنى حد</span><span class="item-value">${RenderHelpers.formatMoney(minVal, payCurr)}</span></div>`);
        if (maxVal > 0) itemsHtml.push(`<div class="bar-item"><span class="item-label"><i class="fa-solid fa-arrow-up"></i> أعلى حد</span><span class="item-value">${RenderHelpers.formatMoney(maxVal, payCurr)}</span></div>`);
        return itemsHtml;
    },

    /** 8️⃣ بناء نموذج الإيداع (Deposit Form) */
    buildDepositForm: function(p, copyContainer, isSingleCurrency, currentPayCurrency, currItemsHtml, baseCurr) {
        if (!p) return '';
        const safeBaseCurr = (baseCurr || 'USD').toUpperCase(); 
        
        return `
            <div class="bal-modal-container-new">
                <div class="bal-payment-title">${Utils.escapeHtml(p.name || 'طريقة الدفع')}</div>
                ${copyContainer}
                <div class="compact-limits-bar" id="bal-limits-bar"></div>
                <div class="bal-inputs-section">
                    <div class="micro-currency-row">
                        <div class="micro-currency-label"><i class="fa-solid fa-wallet"></i> عملة الإيداع</div>
                        <div class="split-dropdown" id="bal-currency-dropdown">
                            <div class="micro-currency-trigger" style="${isSingleCurrency ? 'cursor: default;' : ''}">
                                <span id="bal-selected-currency" class="num-en">${Utils.escapeHtml(currentPayCurrency)}</span>
                                ${isSingleCurrency ? '' : '<i class="fa-solid fa-chevron-down" style="font-size: 11px;"></i>'}
                            </div>
                            <div class="dropdown-menu" id="bal-currency-list" style="${isSingleCurrency ? 'display:none;' : ''}">${currItemsHtml}</div>
                        </div>
                    </div>
                <div class="bal-input-field-new" id="bal-amount-wrap">
                    <span class="bal-input-currency-new" id="bal-amount-curr">${Utils.escapeHtml(currentPayCurrency)}</span>
                    <input type="text" id="bal-amount" class="bal-input-new num-en" dir="ltr" placeholder="0.00" inputmode="decimal" autocomplete="one-time-code" spellcheck="false" autocorrect="off">
                    <label class="bal-floating-label">أدخل مبلغ للإيداع</label>
                </div>
                <span id="bal-amount-error" class="bal-error-text-new d-none"></span>
                    <div class="bal-input-field-new" id="bal-net-wrap">
                        <span class="bal-input-currency-new" id="bal-net-curr">${Utils.escapeHtml(safeBaseCurr)}</span>
                        <div class="bal-input-new bal-result-field-new num-en" id="calc-net" dir="ltr">0.00</div>
                        <label class="bal-floating-label">سيضاف لمحفظتك</label>
                    </div>
                </div>
                <div id="bal-upload-container" style="display: ${p.reqProof !== false ? 'block' : 'none'}; margin-top: 10px;">
                    <button class="bal-upload-btn-new" id="bal-upload-box">
                        <i class="fa-solid fa-cloud-arrow-up"></i><span>أرفق إشعار الدفع</span>
                    </button>
                    <input type="file" id="bal-file" accept="image/*,application/pdf" style="display:none;">
                    <img id="bal-img-preview" class="bal-receipt-preview-new" style="display:none;">
                </div>
                <button id="btn-submit-deposit" class="bal-submit-btn-new btn-pro" data-action="submit-balance" disabled>
                    <span class="btn-content"><i class="fa-solid fa-paper-plane"></i> إرسال الطلب</span>
                    <span class="btn-spinner"><i class="fa-solid fa-spinner fa-spin"></i></span>
                </button>         
            </div>`;
    },

    /** 9️⃣ بناء تفاصيل العملية (Transaction Detail - Order/Deposit) */
    buildTransactionDetail: function(type, id, LiveStoreData, DataManager) {
        const formatInputData = (str) => { 
            if(!str || str === '---') return '<span class="num-en">---</span>'; 
            if(str.includes('|')) { 
                const parts = str.split('|').map(s => s.trim());
                return `<div class="nm-input-stack">${parts.map(p => `<span class="num-en nm-input-capsule">${Utils.escapeHtml(p)}</span>`).join('')}</div>`;
            } 
            return `<span class="num-en nm-input-capsule">${Utils.escapeHtml(str)}</span>`; 
        };

        let html = '';

        if(type === 'deposit') {
            const d = (LiveStoreData.deposits || []).find(x => String(x.id) === String(id));
            if(!d) return `<div class="tx-error-box"><i class="fa-solid fa-triangle-exclamation"></i> عذراً، لم يتم العثور على الإيداع.</div>`;

            const shortDepositId = RenderHelpers.formatDepositId(d);
            let stClass = 'pending'; let stTxt = d.status === 'pending' ? 'قيد المراجعة' : d.status; let stIcon = 'fa-clock';
            if(d.status === 'approved' || d.status === 'completed') { stClass = 'completed'; stTxt = 'مقبول'; stIcon = 'fa-check-circle'; }
            else if(d.status === 'rejected') { stClass = 'rejected'; stTxt = 'مرفوض'; stIcon = 'fa-times-circle'; }
            
            let replyHtml = '';
            if (d.adminNote && d.adminNote.trim() !== '') {
                const safeResponse = Utils.escapeHtml(d.adminNote);
                const copySafeText = safeResponse.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n').replace(/\r/g, '');
                replyHtml = `<div class="nm-reply-box"><div class="nm-reply-content"><span class="nm-reply-head"><i class="fa-solid fa-headset"></i> ملاحظات الإدارة</span><div class="nm-reply-body admin-reply-text">${safeResponse}</div></div><button class="reply-copy-btn" data-action="copy-text" data-text="${copySafeText}" title="نسخ الرد"><i class="fa-regular fa-copy"></i></button></div>`;
            }

            let creditedRow = '';
            if (d.creditedAmount !== undefined) {
                creditedRow = `<div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-wallet"></i> الرصيد المضاف</span><div class="nm-val">${RenderHelpers.formatMoney(d.creditedAmount, d.targetCurrency || 'USD')}</div></div>`;
            }

            // 🛡️ الإصلاح 1: إغلاق ثغرة XSS
            const safeReceiptUrl = d.receipt ? Utils.safeUrl(d.receipt) : '';
            const receiptHtml = (safeReceiptUrl && safeReceiptUrl !== '#') ? `<a href="${safeReceiptUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;"><div class="nm-universal-card nm-receipt-card" style="cursor: zoom-in;" data-url="${safeReceiptUrl}"><img src="${safeReceiptUrl}" class="nm-receipt-img hover-scale" alt="Receipt"><div style="text-align:center; font-size:11px; margin-top:8px; color:var(--text-muted); font-weight:700;"><i class="fa-solid fa-magnifying-glass-plus"></i> اضغط لعرض الإيصال كاملاً</div></div></a>` : '';

            // 🛡️ الإصلاح 3: تحصين التاريخ
            const safeTimeMs = Utils.parseSafeTime(d.time || d.createdAt);

            html = `
            <div class="nm-container">
                <div class="nm-universal-card">
                    <div class="nm-title-frame"><div class="nm-prod-title">تفاصيل الإيداع</div></div>
                    <div class="nm-card-body">
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-coins"></i> المبلغ المودع</span><div class="nm-val">${RenderHelpers.formatMoney(d.amount, d.currency || 'USD')}</div></div>
                        ${creditedRow}
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-building-columns"></i> طريقة الدفع</span><div class="nm-val"><span class="num-en">${Utils.escapeHtml(d.method || 'غير محدد')}</span></div></div>
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-circle-info"></i> الحالة</span><div class="nm-status-badge-lux ${stClass}"><i class="fa-solid ${stIcon}"></i> ${stTxt}</div></div>
                        <div class="nm-row-compact smart-copy-line is-copyable" data-action="copy-text" data-text="${shortDepositId}">
                            <span class="nm-label" style="pointer-events: none;"><i class="fa-solid fa-hashtag"></i> رقم العملية</span>
                            <div class="uid-capsule" style="pointer-events: none;"><i class="fa-solid fa-id-card"></i><span class="num-en">${shortDepositId}</span></div>
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
            const isRet = (o.status === 'refunded' || o.status === 'returned');
            let stTxt = 'قيد التنفيذ'; let stClass = 'pending'; let stIcon = 'fa-clock';

            if (o.status === 'completed') { stTxt = 'مكتمل'; stClass = 'completed'; stIcon = 'fa-circle-check'; } 
            else if (o.status === 'rejected') { stTxt = 'مرفوض'; stClass = 'rejected'; stIcon = 'fa-circle-xmark'; } 
            else if (isRet) { stTxt = 'مسترجع'; stClass = 'returned'; stIcon = 'fa-rotate-left'; }
            
            let durationHtml = '';
            if (o.status !== 'completed' && o.status !== 'rejected' && !isRet) {
                durationHtml = `<div class="nm-duration-pill"><i class="fa-solid fa-bolt"></i><span class="mx-1">مدة انجاز الطلب: </span><i class="fa-regular fa-clock opacity-90"></i></div>`;
            } else {
                let finalEndTime = o.actionTime || o.completedTime || o.updatedAt || o.time;
                let durationStr = Utils.calculateOrderDuration ? Utils.calculateOrderDuration(o.time, finalEndTime) : '---';
                durationHtml = `<div class="nm-duration-pill"><i class="fa-solid fa-bolt"></i><span dir="ltr" class="nm-font-en-fix">مدة الانجاز: ${durationStr}</span></div>`;
            }

            let replyHtml = '';
            if (o.response && o.response !== 'null') {
                const safeResponse = Utils.escapeHtml(o.response);
                replyHtml += `<div class="nm-reply-box"><div class="nm-reply-content"><span class="nm-reply-head"><i class="fa-solid fa-headset"></i> رد المتجر</span><div class="nm-reply-body admin-reply-text">${safeResponse}</div></div></div>`;
            }
            if (o.status === 'completed' && o.deliveredCode && o.deliveredCode !== 'null') {
                // 🛡️ الإصلاح 2: استدعاء آمن يحفظ الـ Context
                replyHtml += `<div class="nm-reply-box auto-delivery-box"><div class="nm-reply-content"><span class="nm-reply-head"><i class="fa-solid fa-bolt"></i> تسليم فوري</span><div class="nm-reply-body" style="max-height: 200px; overflow-y: auto;">${UIBuilders.buildCodesList(o.deliveredCode)}</div></div></div>`;
            }

            const cDiscountLocal = Number(o.pricingSnapshot?.couponDiscount || o.couponDiscount || 0);
            const oDiscountLocal = Number(o.pricingSnapshot?.offerDiscount || o.saleDiscount || 0);
            const origLocal = Number(o.pricingSnapshot?.originalPrice || o.price || 0);
            const finalLocal = Number(o.pricingSnapshot?.finalPrice || o.price || 0);
            
            const displayCurr = (o.currency || o.priceCurrency || 'USD').toUpperCase();
            const formatFn = (amt) => RenderHelpers.formatMoney(amt, displayCurr);
            
            let priceSectionHtml = '';
            if (cDiscountLocal > 0 || oDiscountLocal > 0) {
                let breakdown = `<div class="nm-receipt-line"><span class="line-lbl"><i class="fa-solid fa-box-open"></i> السعر الأساسي</span><span class="old-amt num-en" dir="ltr">${formatFn(origLocal)}</span></div>`;
                if (oDiscountLocal > 0) breakdown += `<div class="nm-receipt-line sale-line"><span class="line-lbl"><i class="fa-solid fa-tag"></i> تخفيض العرض</span><span class="num-en" dir="ltr">-${formatFn(oDiscountLocal)}</span></div>`;
                if (cDiscountLocal > 0) breakdown += `<div class="nm-receipt-line discount-line"><span class="line-lbl"><i class="fa-solid fa-ticket"></i> كوبون (${Utils.escapeHtml(o.pricingSnapshot?.couponCode || 'مفعل')})</span><span class="num-en" dir="ltr">-${formatFn(cDiscountLocal)}</span></div>`;
                priceSectionHtml = `<div class="nm-row-compact col-layout"><div class="nm-receipt-integrated"><div class="nm-receipt-details-box">${breakdown}</div><div class="nm-receipt-main-row"><span class="nm-label"><i class="fa-solid fa-file-invoice-dollar"></i> الإجمالي</span><span class="nm-receipt-main-total num-en" dir="ltr">${formatFn(finalLocal)}</span></div></div></div>`;
            } else {
                priceSectionHtml = `<div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-coins"></i> السعر الاجمالي</span><div class="nm-val" dir="ltr">${formatFn(finalLocal)}</div></div>`;
            }

            // 🛡️ الإصلاح 3: تحصين التاريخ
            const safeTimeMs = Utils.parseSafeTime(o.time || o.createdAt);

            html = `
            <div class="nm-container">
                ${durationHtml}
                <div class="nm-universal-card">
                    <div class="nm-title-frame"><div class="nm-prod-title">${Utils.escapeHtml(o.product || 'منتج')}</div></div>
                    <div class="nm-card-body">
                        <div class="nm-row-compact smart-copy-line is-copyable" data-action="copy-text" data-text="${shortOrderId}">
                            <span class="nm-label" style="pointer-events: none;"><i class="fa-solid fa-hashtag"></i> رقم الطلب</span>
                            <div class="nm-val scl-text" dir="ltr" style="pointer-events: none;"><span class="num-en">${shortOrderId}</span><i class="fa-regular fa-copy scl-icon"></i></div>
                        </div>
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-circle-info"></i> الحالة</span><div class="nm-status-badge-lux ${stClass}"><i class="fa-solid ${stIcon}"></i> ${stTxt}</div></div>
                        ${priceSectionHtml} 
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-layer-group"></i> الكمية</span><div class="nm-val" dir="ltr"><span class="num-en">${o.qty || 1}</span></div></div>
                        <div class="nm-row-compact"><span class="nm-label"><i class="fa-solid fa-clock"></i> التاريخ</span><div class="nm-val" dir="ltr"><span class="num-en">${RenderHelpers.formatSafeDate(safeTimeMs)}</span></div></div>
                        <div class="nm-row-compact align-start"><span class="nm-label"><i class="fa-solid fa-bullseye"></i> الحساب</span><div class="nm-val" dir="ltr">${formatInputData(o.input)}</div></div>
                    </div>
                </div>
                <div class="nm-data-box"><div class="nm-btn-print-magic" data-action="export-receipt" data-id="${Utils.escapeHtml(id)}"><i class="fa-solid fa-file-pdf"></i> تصدير الإيصال</div></div>
                ${replyHtml}
            </div>`;
        }        
        return html;
    }
};