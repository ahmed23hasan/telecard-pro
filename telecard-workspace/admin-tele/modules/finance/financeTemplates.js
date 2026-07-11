// ============================================================================
// 💰 قوالب المالية والإيداعات (modules/finance/financeTemplates.js) - النسخة الماسية V4.4 💎
// 🚀 التحديث: سد ثغرة الانهيار الحرج لدرج الإيداع (drawerBankImg) وسحق التكرار لـ O(1)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;

export const FinanceTemplates = {
    emptyDeposits: () => `<div class="empty-state"><i class="fa-solid fa-money-bill-transfer"></i><span>لا توجد إيداعات تطابق الفلتر أو التبويب الحالي</span></div>`,

    depositCard: (d, userName, bankName, targetCurr, netBase) => {
        const exactStatus = d.status || 'pending';
        const isAppr = exactStatus === 'approved', isRej = exactStatus === 'rejected', isRef = exactStatus === 'refunded';
        const cardCls = isAppr ? 'completed' : (isRej ? 'rejected' : (isRef ? 'refunded' : 'pending'));
        const localAmount = Number(d.amount || 0);
        const localCurr = (d.currency || '').toUpperCase().replace('$', 'USD');
        const target = (targetCurr || 'USD').toUpperCase().replace('$', 'USD');
        
        const rawTime = d.time || d.createdAt;
        const timeHtml = RenderHelpers.formatSafeDate(rawTime);

        // 🌟 ⚡ التحديث الفائق: استدعاء العميل فورا بـ O(1)
        const userRec = AdminData.data.usersMap?.[d.userId] || (AdminData.data.users || []).find(u => String(u.id) === String(d.userId)) || {};
        const shortId = RenderHelpers.formatUserId(userRec);

        const isIdAsName = String(userName).trim() === String(shortId).trim() || String(userName).trim() === String(d.userId).trim();
        const clientIdentityHtml = isIdAsName 
            ? `<div class="o-card-user"><i class="fa-solid fa-user o-card-user-icon"></i> <span class="uid-capsule copyable-admin" title="انقر لنسخ رقم العميل" data-action="copy-text" data-copy-text="${_esc(shortId)}"><i class="fa-solid fa-hashtag"></i>${_esc(shortId)}</span></div>`
            : `<div class="o-card-user"><i class="fa-solid fa-user o-card-user-icon"></i> <span class="user-name-text">${_esc(userName)}</span> <span class="uid-capsule copyable-admin" title="انقر لنسخ رقم العميل" data-action="copy-text" data-copy-text="${_esc(shortId)}"><i class="fa-solid fa-hashtag"></i>${_esc(shortId)}</span></div>`;

        const absNetBase = Math.abs(netBase);
        const absLocal = Math.abs(localAmount);
        let sign = '';
        let priceColor = '';

        if (isRef) {
            sign = (netBase < 0) ? '+' : '-';
            priceColor = (netBase < 0) ? 'text-success' : 'text-danger';
        } else if (isAppr) {
            sign = (netBase < 0) ? '-' : '+';
            priceColor = (netBase < 0) ? 'text-danger' : 'text-success';
        } else {
            sign = (netBase < 0) ? '-' : '+';
            priceColor = isRej ? 'text-muted' : 'text-warning';
        }

        let dualAmountHtml = '';
        if (localCurr !== 'USD' && localCurr !== target) {
            dualAmountHtml = `<span class="${priceColor}">${sign} ${RenderHelpers.formatMoney(absNetBase, target, 2)}</span> <span class="dual-price-sub">(${RenderHelpers.formatMoney(absLocal, localCurr, 2)})</span>`;
        } else {
            dualAmountHtml = `<span class="single-price ${priceColor}">${sign} ${RenderHelpers.formatMoney(absNetBase, target, 2)}</span>`;
        }

        const formattedDepositId = RenderHelpers.formatDepositId(d);

        return `<div id="deposit-card-${_esc(d.id)}" class="o-card ${cardCls} ${(isRej || isRef) ? 'locked' : ''}" data-status="${exactStatus}" data-action="open-deposit-drawer" data-id="${_esc(d.id)}">
                    <div class="corner-tag-id num-en copyable-admin" dir="ltr" lang="en" title="انقر لنسخ رقم الإيداع" data-action="copy-text" data-copy-text="${formattedDepositId}">${formattedDepositId}</div>
                    <div class="corner-tag-time num-en" dir="ltr" lang="en"><i class="fa-regular fa-clock"></i> ${timeHtml}</div>
                    
                    <div class="o-card-header-row">
                        ${d.methodLogo ? `<img src="${_esc(d.methodLogo)}" class="o-card-img zoomable-img" draggable="false" data-action="open-img-viewer" data-src="${_esc(d.methodLogo)}">` : `<div class="o-card-img-fallback"><i class="fa-solid fa-building-columns"></i></div>`}
                        
                        <div class="o-card-content">
                            <div class="o-card-title">${d.network ? `${_esc(bankName)} • ${_esc(d.network)}` : _esc(bankName)}</div>
                            <div class="o-card-meta">
                                ${clientIdentityHtml}
                                <div class="flex-center-gap">
                                    ${d.receipt ? `<button type="button" class="btn-receipt-mini" title="عرض الإيصال" data-action="open-img-viewer" data-src="${_esc(d.receipt)}"><i class="fa-solid fa-file-invoice-dollar"></i></button>` : ''}
                                    <span class="o-card-price num-en" dir="ltr" lang="en">${dualAmountHtml}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
    },

    walletCard: (cc, d, rateInfo) => `<div class="wallet-card">
                    <div class="wc-title">${_esc(rateInfo ? `محفظة ${rateInfo.name} (${cc})` : `محفظة ${cc} (محذوفة)`)}</div>
                    <div class="wc-amount num-en" dir="ltr" lang="en">${RenderHelpers.formatMoney(d.sum, cc, 2)}</div>
                    <div class="wc-meta"><i class="fa-solid fa-users"></i> عدد المستخدمين: <span class="num-en" dir="ltr" lang="en">${_enNum(d.count)}</span></div>
                </div>`,

    walletTotal: (totalUsd) => `<div class="wallet-card total-liability">
                    <div class="wc-title">إجمالي التزامات المحافظ (محوّل للدولار)</div>
                    <div class="wc-amount num-en" dir="ltr" lang="en">${RenderHelpers.formatMoney(totalUsd, 'USD', 2)}</div>
                    <div class="wc-meta"><i class="fa-solid fa-shield-halved"></i> إجمالي السيولة المطلوبة لتغطية أرصدة العملاء</div>
                </div>`,

    currencySettingRow: (code, displayCode, oldFeeType, oldFeeUnit, oldFee, oldMin, oldMax) => {
        return `
        <div class="curr-setting-row" id="curr-setting-${_esc(code)}">
            <div class="curr-setting-title">إعدادات عملة ${_esc(code)} <span class="text-muted fs-11 num-en" dir="ltr">(${_esc(displayCode)})</span></div>
            
            <div class="curr-setting-inputs">
                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl">النوع</label>
                    <select id="pay-feetype-${_esc(code)}" class="form-input num-en" dir="rtl">
                        <option value="fee" ${oldFeeType !== 'bonus' ? 'selected' : ''}>عمولة (-)</option>
                        <option value="bonus" ${oldFeeType === 'bonus' ? 'selected' : ''}>بونص (+)</option>
                    </select>
                </div>

                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl text-warning">طريقة الاحتساب</label>
                    <select id="pay-feeunit-${_esc(code)}" class="form-input num-en" dir="rtl">
                        <option value="percent" ${oldFeeUnit !== 'fixed' ? 'selected' : ''}>نسبة مئوية (%)</option>
                        <option value="fixed" ${oldFeeUnit === 'fixed' ? 'selected' : ''}>مبلغ ثابت (${_esc(displayCode)})</option>
                    </select>
                </div>
                
                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl">القيمة</label>
                    <input type="text" inputmode="decimal" id="pay-fee-${_esc(code)}" class="form-input num-en" dir="ltr" lang="en" value="${_esc(oldFee)}" placeholder="0.0">
                </div>

                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl">حد أدنى</label>
                    <input type="text" inputmode="decimal" id="pay-min-${_esc(code)}" class="form-input num-en" dir="ltr" lang="en" value="${_esc(oldMin)}" placeholder="0.00">
                </div>
                
                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl">حد أعلى</label>
                    <input type="text" inputmode="decimal" id="pay-max-${_esc(code)}" class="form-input num-en" dir="ltr" lang="en" value="${_esc(oldMax)}" placeholder="0.00">
                </div>
            </div>
        </div>`;
    },

    paymentItem: (p) => {
        const isActive = p.isActive !== false;
        return `<div id="pay-card-${_esc(p.id)}" class="tier-card ${isActive ? 'auto-on' : 'auto-off'}" data-type="pay" data-status="${isActive ? 'active' : 'inactive'}">
                    <div class="tc-head">
                        <div class="tc-info">
                            <div class="tc-icon-box">
                                ${p.img ? `<img src="${_esc(p.img)}" class="zoomable-img pay-card-img" draggable="false" data-action="open-img-viewer" data-src="${_esc(p.img)}">` : `<i class="fa-solid fa-building-columns text-muted"></i>`}
                            </div>
                            <div class="tc-name">
                                <h2>${_esc(p.name || 'طريقة دفع')}</h2>
                                ${isActive ? '<span class="tc-badge text-success"><i class="fa-solid fa-check-circle"></i> مفعلة</span>' : '<span class="tc-badge text-danger"><i class="fa-solid fa-ban"></i> متوقفة</span>'}
                            </div>
                        </div>
                        <div class="pay-card-actions">
                            <div class="action-mini btn-edit-mini" data-action="edit-item" data-type="pay" data-id="${_esc(p.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></div>
                            <div class="action-mini btn-del-mini" data-action="delete-item" data-type="pay" data-id="${_esc(p.id)}" title="حذف"><i class="fa-solid fa-trash"></i></div>
                        </div>
                    </div>
                    <div class="tc-body">
                        <div class="toggle-box tc-toggle-row">
                            <span class="toggle-lbl"><i class="fa-solid fa-power-off"></i> تفعيل طريقة الدفع للمشترين</span>
                            <label class="switch">
                                <input type="checkbox" ${isActive ? 'checked' : ''} data-action="toggle-payment-status" data-id="${_esc(p.id)}">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>`;
    },

    emptyPayDetails: () => `<div class="pay-det-empty"><i class="fa-solid fa-inbox"></i><br>لا توجد تفاصيل بعد.</div>`,

    payDetailItem: (item, i, text, isCopyable) => `<div class="pay-det-item pay-det-box">
                    <div class="pay-det-text">${_esc(text).replace(/\n/g, '<br>')}${isCopyable ? '<div class="mt-6"><span class="pay-badge-copyable"><i class="fa-solid fa-copy"></i> قابل للنسخ بالمتجر</span></div>' : '<div class="mt-6"><span class="pay-badge-viewonly"><i class="fa-solid fa-eye"></i> عنوان للعرض فقط</span></div>'}</div>
                    <button class="btn btn-red btn-xs btn-pay-det-del" data-action="remove-pay-detail" data-index="${i}"><i class="fa-solid fa-trash"></i></button>
                </div>`,    

    rateCard: (c, isDefaultDisplay = false) => {
        const isBase = c.isBase || c.code === 'USD';
        
        const displayBadge = isDefaultDisplay 
            ? `<div class="rate-display-guest-badge"><i class="fa-solid fa-star"></i> عملة العرض للضيوف</div>` 
            : '';

        const setDisplayBtn = isDefaultDisplay 
            ? `<button class="btn-rate-star active" title="هذه هي عملة العرض الحالية للضيوف"><i class="fa-solid fa-star"></i></button>`
            : `<button class="btn-rate-star" data-action="set-default-display" data-code="${_esc(c.code)}" title="تعيين كعملة عرض افتراضية للضيوف"><i class="fa-regular fa-star"></i></button>`;

        const flagUrl = typeof RenderHelpers !== 'undefined' && RenderHelpers.getCurrencyFlagUrl 
            ? RenderHelpers.getCurrencyFlagUrl(c.code) 
            : '';

        return `<div id="rate-card-${_esc(c.code)}" class="rate-card-box ${isBase ? 'rate-card-base' : ''} ${isDefaultDisplay ? 'is-default-display' : ''}">
                ${displayBadge}
                
                <div class="rate-main-wrapper">
                    <div class="rate-symbol-box" dir="ltr" lang="en">${RenderHelpers.getCurrencySymbolText(c.code)}</div>
                    
                    <div class="rate-info-col">
                        <div class="rate-title-row">
                            <img src="${flagUrl}" class="rate-flag-mini" alt="${_esc(c.code)}">
                            <span class="rate-name-text">${_esc(c.name)}</span>
                            <span class="num-en rate-code-hint" dir="ltr" lang="en">(${_esc(c.code)})</span>
                            ${isBase ? '<span class="rate-base-badge">المرساة</span>' : ''}
                        </div>
                        
                        <div class="rate-values-row">
                            <span class="rate-val-group">سعر البيع: <span class="num-en val-sell" dir="ltr" lang="en">${_enNum(c.priceRate)}</span></span>
                            <span class="rate-val-group">سعر الإيداع: <span class="num-en val-buy" dir="ltr" lang="en">${_enNum(c.depRate)}</span></span>
                            <span class="rate-usd-hint">(مقابل 1$)</span>
                        </div>
                    </div>
                </div>
                
                <div class="rate-actions">
                    ${setDisplayBtn}
                    ${!isBase ? `
                        <button class="btn btn-ghost btn-rate-edit" data-action="open-edit-currency" data-code="${_esc(c.code)}" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-red btn-rate-del" data-action="delete-currency" data-code="${_esc(c.code)}" title="حذف"><i class="fa-solid fa-trash"></i></button>
                    ` : ''}
                </div>
            </div>`;
    },

    // 🛡️ [الترقيع الماسي]: إضافة زر عرض صورة الإيصال للبنك
    drawerBankImg: (imgSrc) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-prod-img zoomable-img" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-prod-placeholder"><i class="fa-solid fa-building-columns"></i></div>`,

    // 🛡️ الترقيع: تحويل الكارد لزر لمنع انهيار النموذج
    depositReceiptCard: (receiptSrc) => `
        <button type="button" class="dr-card dr-receipt-container" data-action="open-img-viewer" data-src="${_esc(receiptSrc)}" style="background: transparent; border: none; width: 100%; padding: 0;">
            <div class="dr-receipt-label"><i class="fa-solid fa-file-invoice-dollar text-success"></i> إيصال التحويل المرفق</div>
            <img src="${_esc(receiptSrc)}" class="zoomable-img dr-receipt-img">
            <div class="dr-receipt-hint"><i class="fa-solid fa-magnifying-glass-plus"></i> اضغط لتكبير الإيصال</div>
        </button>`,
        
    depositDrawerBody: (data) => {
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
                ${data.bankImgHtml}
                <div>
                    <div class="dr-prod-name">${_esc(data.bankName)}</div>
                    ${data.network ? `<div class="dr-network-lbl"><i class="fa-solid fa-network-wired"></i> الشبكة: ${_esc(data.network)}</div>` : ''}
                </div>
            </div>
            
            <div class="dr-receipt-box">
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-money-bill-wave"></i> المبلغ المدخل</span>
                    <span class="dr-receipt-val num-en" dir="ltr" lang="en">${data.amountTxt}</span>
                </div>
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl">
                        <i class="fa-solid ${_esc(data.feeIcon)} ${_esc(data.feeColorClass)}"></i> ${_esc(data.feeLabel)} 
                        <span class="num-en fs-12 ${_esc(data.feeColorClass)} fee-pct-spacing" dir="ltr" lang="en">${_esc(data.feePctTxt || '')}</span>
                    </span>
                    <span class="dr-receipt-val ${_esc(data.feeColorClass)} ${_esc(data.feeNumClass)}" dir="ltr" lang="en">${data.feeStr}</span>
                </div>
                <div class="dr-receipt-row ${_esc(data.netBgClass || 'highlight-success')}">
                    <span class="dr-receipt-lbl ${_esc(data.netColorClass || 'text-success')}"><i class="fa-solid fa-sack-dollar"></i> صافي الأثر المالي</span>
                    <span class="dr-receipt-val price ${_esc(data.netColorClass || 'text-success')} num-en" dir="ltr" lang="en">${data.netBaseTxt}</span>
                </div>
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-calculator text-warning"></i> سعر الصرف</span>
                    <span class="dr-receipt-val num-en text-warning" dir="ltr" lang="en">${data.fxStr}</span>
                </div>
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-circle-info"></i> الحالة</span>
                    <span class="oh-status ${_esc(data.statusClass)}">${_esc(data.sText)}</span>
                </div>
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-regular fa-clock"></i> الوقت</span>
                    <span class="dr-receipt-val num-en" dir="ltr" lang="en">${_esc(data.dateTxt)}</span>
                </div>
            </div>
        </div>
        ${data.receiptHtml}
        ${data.replyHtml}`;
    },

    depositDrawerFooter: (status, depId, isDeduction = false) => {
        if (status === 'pending') {
            return `
            <button class="btn btn-green" data-action="submit-deposit" data-type="approve" data-id="${_esc(depId)}">
                <i class="fa-solid fa-check"></i> قبول واعتماد
            </button>
            <button class="btn btn-red" data-action="submit-deposit" data-type="reject" data-id="${_esc(depId)}">
                <i class="fa-solid fa-xmark"></i> رفض
            </button>`;
        } 
        else if (status === 'approved') {
            if (isDeduction) {
                return `
                <button class="btn btn-green" data-action="reevaluate-deposit" data-id="${_esc(depId)}">
                    <i class="fa-solid fa-rotate-left"></i> إلغاء عملية الخصم (إعادة الرصيد)
                </button>`;
            } else {
                return `
                <button class="btn btn-refund-sky" data-action="reevaluate-deposit" data-id="${_esc(depId)}">
                    <i class="fa-solid fa-rotate-left"></i> استرجاع وخصم الرصيد
                </button>`;
            }
        } 
        else {
            const statusName = status === 'rejected' ? 'مرفوض' : 'مسترجع (ملغي)';
            return `
            <div class="drawer-locked-msg">
                <i class="fa-solid fa-lock icon-ms-1"></i> هذا السجل مغلق (${statusName})
            </div>`;
        }
    }
};
