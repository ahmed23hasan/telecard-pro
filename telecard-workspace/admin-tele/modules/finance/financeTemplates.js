// ============================================================================
// 💰 قوالب المالية والإيداعات (modules/finance/financeTemplates.js) - Enterprise V19.5 💎
// 🚀 التحديث الأقصى (V19.5 - Server Schema Alignment & Admin Tx Guard): 
// 1. Liquidity Banner Fix 🛡️: قراءة حقل السيرفر الصحيح (stuckLocalBalance) لمنع ظهور undefined.
// 2. Wallet Card Resilience 💵: دعم عرض بيانات السيولة سواء كانت رقماً مباشراً من السيرفر أو كائناً مجمعاً.
// 3. Admin Deposit Footer Guard 🔒: تمييز العمليات الإدارية (إيداع/خصم إداري) في الدرج لمنع التضارب مع السيرفر.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;

export const FinanceTemplates = {
    emptyDeposits: () => RenderHelpers.emptyState('fa-solid fa-money-bill-transfer text-muted', 'لا توجد إيداعات', 'لا توجد إيداعات تطابق الفلتر أو التبويب الحالي.'),
    emptyPayments: () => RenderHelpers.emptyState('fa-solid fa-building-columns text-muted', 'لا توجد بوابات دفع', 'لم تقم بإضافة بوابات دفع. أضف بوابة لتمكين العملاء من شحن محافظهم.'),
    emptyPayDetails: () => RenderHelpers.emptyState('fa-solid fa-inbox text-muted', 'لا توجد تفاصيل', 'لم تقم بإضافة تفاصيل دفع (مثل رقم الحساب) حتى الآن.'),

    depositCard: (d, userName, bankName, targetCurr, netBase) => {
        const exactStatus = d.status || 'pending';
        const isAppr = (exactStatus === 'approved' || exactStatus === 'deducted');
        const isRej = exactStatus === 'rejected';
        const isRef = exactStatus === 'refunded';
        const cardCls = isAppr ? 'completed' : (isRej ? 'rejected' : (isRef ? 'refunded' : 'pending'));
        const localAmount = Number(d.amount || 0);
        const localCurr = (d.currency || '').toUpperCase().replace('$', 'USD');
        const target = (targetCurr || 'USD').toUpperCase().replace('$', 'USD');
        
        const rawTime = d.time || d.createdAt;
        const timeHtml = RenderHelpers.formatSafeDate(rawTime);

        const userRec = AdminData.data.usersMap?.[d.userId] || { id: d.userId, displayId: d.userDataSnapshot?.displayId };
        const shortId = RenderHelpers.formatUserId(userRec);

        const isIdAsName = String(userName).trim() === String(shortId).replace(/<[^>]*>?/gm, '').trim() || String(userName).trim() === String(d.userId).trim();
        const clientIdentityHtml = isIdAsName 
            ? `<div class="o-card-user"><i class="fa-solid fa-user o-card-user-icon me-1"></i> <div class="uid-capsule uid-capsule-flat font-numeric" dir="ltr">${shortId}</div></div>`
            : `<div class="o-card-user"><i class="fa-solid fa-user o-card-user-icon me-1"></i> <span class="user-name-text">${_esc(userName)}</span> <div class="uid-capsule uid-capsule-flat me-1 font-numeric" dir="ltr">${shortId}</div></div>`;

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
if (localCurr && localCurr !== target) {
    dualAmountHtml = `<span class="${priceColor}">${sign} ${RenderHelpers.formatMoney(absNetBase, target, 2)}</span> <span class="dual-price-sub font-numeric" dir="ltr">(${RenderHelpers.formatMoney(absLocal, localCurr, 2)})</span>`;
} else {
    dualAmountHtml = `<span class="single-price ${priceColor}">${sign} ${RenderHelpers.formatMoney(absNetBase, target, 2)}</span>`;
}
        const formattedDepositId = RenderHelpers.formatDepositId(d);

        return `<div id="deposit-card-${_esc(d.id)}" class="dep-card interactive-scale ${cardCls} ${(isRej || isRef) ? 'locked' : ''}" data-status="${exactStatus}" data-action="open-deposit-drawer" data-id="${_esc(d.id)}">
                    <div class="corner-tag-id num-en font-numeric" dir="ltr" lang="en"><span class="text-muted">#</span>${formattedDepositId}</div>
                    <div class="corner-tag-time num-en font-numeric" dir="ltr" lang="en"><i class="fa-regular fa-clock me-1"></i> ${timeHtml}</div>
                    
                    <div class="o-card-header-row">
                        ${d.methodLogo ? `<img src="${_esc(d.methodLogo)}" class="o-card-img zoomable-img" draggable="false" data-action="open-img-viewer" data-src="${_esc(d.methodLogo)}">` : `<div class="o-card-img-fallback"><i class="fa-solid fa-building-columns"></i></div>`}
                        
                        <div class="o-card-content">
                            <div class="o-card-title">${d.network ? `${_esc(bankName)} • ${_esc(d.network)}` : _esc(bankName)}</div>
                            <div class="o-card-meta">
                                ${clientIdentityHtml}
                                <div class="flex-center-gap">
                                    ${d.receipt ? `<button type="button" class="btn-receipt-mini interactive-scale" title="عرض الإيصال" data-action="open-img-viewer" data-src="${_esc(d.receipt)}"><i class="fa-solid fa-file-invoice-dollar"></i></button>` : ''}
                                    <span class="o-card-price num-en font-numeric" dir="ltr" lang="en">${dualAmountHtml}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
    },

    walletCard: (cc, d, rateInfo) => {
        const displayName = rateInfo ? (rateInfo.name || rateInfo.code || cc) : cc;
        const titleText = rateInfo ? `محفظة ${displayName} (${cc})` : `محفظة ${cc} (محذوفة)`;
        const sumVal = (d && typeof d === 'object') ? Number(d.sum || 0) : Number(d || 0);
        const countVal = (d && typeof d === 'object' && d.count !== undefined) ? d.count : null;
        
        return `<div class="wallet-card interactive-scale">
                    <div class="wc-title">${_esc(titleText)}</div>
                    <div class="wc-amount num-en font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(sumVal, cc, 2)}</div>
                    ${countVal !== null ? `<div class="wc-meta"><i class="fa-solid fa-users me-1"></i> عدد المستخدمين: <span class="num-en font-numeric ms-1" dir="ltr" lang="en">${_enNum(countVal)}</span></div>` : ''}
                </div>`;
    },

    walletTotal: (totalUsd) => `<div class="wallet-card total-liability interactive-scale">
                    <div class="wc-title">إجمالي التزامات المحافظ (محوّل للدولار)</div>
                    <div class="wc-amount num-en font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(totalUsd, 'USD', 2)}</div>
                    <div class="wc-meta"><i class="fa-solid fa-shield-halved me-1"></i> إجمالي السيولة المطلوبة لتغطية أرصدة العملاء</div>
                </div>`,

    liquidityWarningBanner: (uncalculatedCurrencies) => {
        let detailsHtml = uncalculatedCurrencies.map(c => {
            const stuckVal = c.stuckLocalBalance ?? c.totalBalance ?? 0;
            return `<div class="fs-12"> • عملة <b>${_esc(c.currency)}</b>: رصيد عالق <span class="num-en font-numeric" dir="ltr">${_esc(stuckVal)}</span> <span class="text-muted fs-11">(${_esc(c.reason)})</span></div>`;
        }).join('');
        
        return `<div class="wallet-card warning-liability interactive-scale w-100 mb-15 bg-danger-subtle border-danger">
                    <div class="wc-title text-danger fw-bold"><i class="fa-solid fa-triangle-exclamation me-1"></i> تحذير محاسبي: سيولة غير محسوبة!</div>
                    <div class="wc-meta text-dark mt-10">توجد أرصدة للعملاء لم يتم تحويلها وإضافتها للإجمالي بالدولار بسبب غياب سعر الصرف:</div>
                    <div class="mt-5">${detailsHtml}</div>
                    <div class="wc-meta text-danger mt-10 fw-bold"><i class="fa-solid fa-gear me-1"></i> يرجى التوجه لإعدادات العملات وإصلاح أسعار الصرف.</div>
                </div>`;
    },

    currencySettingRow: (code, displayCode, oldFeeType, oldFeeUnit, oldFee, oldMin, oldMax, oldMinFee, oldMaxFee) => {
        return `
        <div class="curr-setting-row currency-setting-row" id="curr-setting-${_esc(code)}" data-code="${_esc(code)}">
            <div class="curr-setting-title">إعدادات عملة ${_esc(code)} <span class="text-muted fs-11 num-en font-numeric ms-1" dir="ltr">(${_esc(displayCode)})</span></div>
            
            <div class="curr-setting-inputs">
                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl">النوع</label>
                    <select id="pay-feetype-${_esc(code)}" class="form-input select-shared" dir="rtl" data-val="${_esc(oldFeeType)}">
                        <option value="fee" ${oldFeeType !== 'bonus' ? 'selected' : ''}>عمولة (-)</option>
                        <option value="bonus" ${oldFeeType === 'bonus' ? 'selected' : ''}>بونص (+)</option>
                    </select>
                </div>

                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl text-warning">طريقة الاحتساب</label>
                    <select id="pay-feeunit-${_esc(code)}" class="form-input select-shared" dir="rtl">
                        <option value="percent" ${oldFeeUnit !== 'fixed' ? 'selected' : ''}>نسبة مئوية (%)</option>
                        <option value="fixed" ${oldFeeUnit === 'fixed' ? 'selected' : ''}>مبلغ ثابت (${_esc(displayCode)})</option>
                    </select>
                </div>
                
                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl">القيمة</label>
                    <input type="text" inputmode="decimal" id="pay-fee-${_esc(code)}" class="form-input num-en font-numeric" dir="ltr" lang="en" value="${_esc(oldFee)}" placeholder="0.0">
                </div>

                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl text-danger">أدنى عمولة/بونص</label>
                    <input type="text" inputmode="decimal" id="pay-minfee-${_esc(code)}" class="form-input num-en font-numeric" dir="ltr" lang="en" value="${_esc(oldMinFee)}" placeholder="0.00">
                </div>
                
                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl text-danger">أعلى عمولة/بونص</label>
                    <input type="text" inputmode="decimal" id="pay-maxfee-${_esc(code)}" class="form-input num-en font-numeric" dir="ltr" lang="en" value="${_esc(oldMaxFee)}" placeholder="0.00">
                </div>

                <div class="form-group mb-0 col-span-1-5">
                    <label class="form-label curr-setting-lbl text-success">أدنى حد للإيداع</label>
                    <input type="text" inputmode="decimal" id="pay-min-${_esc(code)}" class="form-input num-en font-numeric" dir="ltr" lang="en" value="${_esc(oldMin)}" placeholder="0.00">
                </div>
                
                <div class="form-group mb-0 col-span-1-5">
                    <label class="form-label curr-setting-lbl text-success">أعلى حد للإيداع</label>
                    <input type="text" inputmode="decimal" id="pay-max-${_esc(code)}" class="form-input num-en font-numeric" dir="ltr" lang="en" value="${_esc(oldMax)}" placeholder="0.00">
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
                                ${p.img ? `<img src="${_esc(p.img)}" class="zoomable-img pay-card-img interactive-scale" draggable="false" data-action="open-img-viewer" data-src="${_esc(p.img)}">` : `<i class="fa-solid fa-building-columns text-muted"></i>`}
                            </div>
                            <div class="tc-name">
                                <h2>${_esc(p.name || 'طريقة دفع')}</h2>
                                ${isActive ? '<span class="tc-badge text-success"><i class="fa-solid fa-check-circle me-1"></i> مفعلة</span>' : '<span class="tc-badge text-danger"><i class="fa-solid fa-ban me-1"></i> متوقفة</span>'}
                            </div>
                        </div>
                        <div class="pay-card-actions flex-center-gap">
                            <button class="action-mini btn-edit-mini interactive-scale" data-action="edit-payment" data-id="${_esc(p.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                            <button class="action-mini btn-del-mini interactive-scale" data-action="delete-payment" data-id="${_esc(p.id)}" title="حذف"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="tc-body">
                        <div class="toggle-box tc-toggle-row">
                            <span class="toggle-lbl"><i class="fa-solid fa-power-off me-1"></i> تفعيل طريقة الدفع للمشترين</span>
                            <label class="switch interactive-scale">
                                <input type="checkbox" ${isActive ? 'checked' : ''} data-action="toggle-payment-status" data-id="${_esc(p.id)}">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>`;
    },

    payDetailItem: (item, i, text, isCopyable) => `<div class="pay-det-item pay-det-box">
                    <div class="pay-det-text">${_esc(text).replace(/\n/g, '<br>')}${isCopyable ? '<div class="mt-6"><span class="pay-badge-copyable"><i class="fa-solid fa-copy me-1"></i> قابل للنسخ بالمتجر</span></div>' : '<div class="mt-6"><span class="pay-badge-viewonly"><i class="fa-solid fa-eye me-1"></i> عنوان للعرض فقط</span></div>'}</div>
                    <div class="d-flex flex-column gap-2">
                        <button class="btn btn-ghost btn-compact btn-pay-det-copy interactive-scale" data-action="copy-text" data-copy-text="${_esc(text)}" title="نسخ للإدارة"><i class="fa-solid fa-copy"></i></button>
                        <button class="btn btn-outline-danger btn-compact btn-pay-det-del interactive-scale" data-action="remove-pay-detail" data-index="${i}" title="حذف"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`,    

    rateCard: (c, isDefaultDisplay = false) => {
        const isBase = c.isBase || c.code === 'USD';
        
        const displayBadge = isDefaultDisplay 
            ? `<div class="rate-display-guest-badge"><i class="fa-solid fa-star me-1"></i> عملة العرض للضيوف</div>` 
            : '';

        const setDisplayBtn = isDefaultDisplay 
            ? `<button class="btn-rate-star active" title="هذه هي عملة العرض الحالية للضيوف"><i class="fa-solid fa-star"></i></button>`
            : `<button class="btn-rate-star interactive-scale" data-action="set-default-display" data-code="${_esc(c.code)}" title="تعيين كعملة عرض افتراضية للضيوف"><i class="fa-regular fa-star"></i></button>`;

        const flagUrl = typeof RenderHelpers !== 'undefined' && RenderHelpers.getCurrencyFlagUrl 
            ? RenderHelpers.getCurrencyFlagUrl(c.code) 
            : '';

        return `<div id="rate-card-${_esc(c.code)}" class="rate-card-box ${isBase ? 'rate-card-base' : ''} ${isDefaultDisplay ? 'is-default-display' : ''}">
                ${displayBadge}
                
                <div class="rate-main-wrapper">
                    <div class="rate-symbol-box font-numeric" dir="ltr" lang="en">${RenderHelpers.getCurrencySymbolText(c.code)}</div>
                    
                    <div class="rate-info-col">
                        <div class="rate-title-row">
                            <img src="${flagUrl}" class="rate-flag-mini" alt="${_esc(c.code)}">
                            <span class="rate-name-text">${_esc(c.name)}</span>
                            <span class="num-en rate-code-hint font-numeric" dir="ltr" lang="en">(${_esc(c.code)})</span>
                            ${isBase ? '<span class="rate-base-badge">المرساة</span>' : ''}
                        </div>
                        
                        <div class="rate-values-row">
                            <span class="rate-val-group">سعر البيع: <span class="num-en val-sell font-numeric" dir="ltr" lang="en">${_enNum(c.priceRate)}</span></span>
                            <span class="rate-val-group">سعر الإيداع: <span class="num-en val-buy font-numeric" dir="ltr" lang="en">${_enNum(c.depRate)}</span></span>
                            <span class="rate-usd-hint font-numeric" dir="ltr">(مقابل 1$)</span>
                        </div>
                    </div>
                </div>
                
                <div class="rate-actions">
                    ${setDisplayBtn}
                    ${!isBase ? `
                        <button class="action-mini btn-edit-mini interactive-scale" data-action="open-edit-currency" data-code="${_esc(c.code)}" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-mini btn-del-mini interactive-scale" data-action="delete-currency" data-code="${_esc(c.code)}" title="حذف"><i class="fa-solid fa-trash"></i></button>
                    ` : ''}
                </div>
            </div>`;
    },

    drawerBankImg: (imgSrc) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-prod-img zoomable-img interactive-scale" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-prod-placeholder"><i class="fa-solid fa-building-columns"></i></div>`,

    depositReceiptCard: (receiptSrc) => `
        <button type="button" class="dr-card dr-receipt-container receipt-btn-transparent interactive-scale pulse-badge border-success-30 bg-success-subtle" data-action="open-img-viewer" data-src="${_esc(receiptSrc)}">
            <div class="dr-receipt-label text-success"><i class="fa-solid fa-file-invoice-dollar me-1"></i> إيصال التحويل المرفق (مهم جداً)</div>
            <img src="${_esc(receiptSrc)}" class="zoomable-img dr-receipt-img mt-10">
            <div class="dr-receipt-hint text-success mt-10"><i class="fa-solid fa-magnifying-glass-plus me-1"></i> اضغط لتكبير الإيصال والتأكد من البيانات</div>
        </button>`,
        
    depositDrawerBody: (data) => {
        const safeDisplayUser = _esc(data.displayUser);
        const isIdAsNameDrawer = String(data.displayUser).trim() === String(data.userId).trim();
        
        const drawerIdentityHtml = isIdAsNameDrawer ?
            `<div class="uid-capsule uid-capsule-flat font-numeric" dir="ltr">${data.userDisplayId}</div>` :
            `<span class="dr-client-name">${safeDisplayUser}</span><div class="uid-capsule uid-capsule-flat me-1 font-numeric" dir="ltr">${data.userDisplayId}</div>`;        
            
        return `
        <div class="dr-card dr-client interactive-scale" data-action="view-user" data-id="${_esc(data.userId)}">
            <div class="dr-client-left">
                ${data.avatarHtml}
                <div class="d-flex align-items-center">
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
                    ${data.network ? `<div class="dr-network-lbl"><i class="fa-solid fa-network-wired me-1"></i> الشبكة: <span class="font-numeric" dir="ltr">${_esc(data.network)}</span></div>` : ''}
                </div>
            </div>
            
            <div class="dr-receipt-box">
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-money-bill-wave me-1"></i> المبلغ المدخل</span>
                    <span class="dr-receipt-val num-en font-numeric" dir="ltr" lang="en">${data.amountTxt}</span>
                </div>
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl">
                        <i class="fa-solid ${_esc(data.feeIcon)} ${_esc(data.feeColorClass)} me-1"></i> ${_esc(data.feeLabel)} 
                        <span class="num-en fs-12 ${_esc(data.feeColorClass)} fee-pct-spacing font-numeric ms-1" dir="ltr" lang="en">${_esc(data.feePctTxt || '')}</span>
                    </span>
                    <span class="dr-receipt-val ${_esc(data.feeColorClass)} ${_esc(data.feeNumClass)} font-numeric" dir="ltr" lang="en">${data.feeStr}</span>
                </div>
                <div class="dr-receipt-row ${_esc(data.netBgClass || 'highlight-success')}">
                    <span class="dr-receipt-lbl ${_esc(data.netColorClass || 'text-success')}"><i class="fa-solid fa-sack-dollar me-1"></i> صافي الأثر المالي</span>
                    <span class="dr-receipt-val price ${_esc(data.netColorClass || 'text-success')} num-en font-numeric" dir="ltr" lang="en">${data.netBaseTxt}</span>
                </div>
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-calculator text-warning me-1"></i> سعر الصرف</span>
                    <span class="dr-receipt-val num-en text-warning font-numeric" dir="ltr" lang="en">${data.fxStr}</span>
                </div>
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-solid fa-circle-info me-1"></i> الحالة</span>
                    <span class="oh-status ${_esc(data.statusClass)}">${_esc(data.sText)}</span>
                </div>
                <div class="dr-receipt-row">
                    <span class="dr-receipt-lbl"><i class="fa-regular fa-clock me-1"></i> الوقت</span>
                    <span class="dr-receipt-val num-en font-numeric" dir="ltr" lang="en">${_esc(data.dateTxt)}</span>
                </div>
            </div>
        </div>
        ${data.receiptHtml}
        ${data.replyHtml}`;
    },

    depositDrawerFooter: (status, depId, isDeduction = false, isAdminManualMethod = false) => {
        if (status === 'pending') {
            return `
            <div class="modal-actions-row m-0 p-0 border-0">
                <button class="btn btn-primary interactive-scale w-100" data-action="submit-deposit" data-type="approve" data-id="${_esc(depId)}">
                    <i class="fa-solid fa-check me-1"></i> قبول واعتماد
                </button>
                <button class="btn btn-outline-danger interactive-scale w-100" data-action="submit-deposit" data-type="reject" data-id="${_esc(depId)}">
                    <i class="fa-solid fa-xmark me-1"></i> رفض
                </button>
            </div>`;
        } 
        else if (isAdminManualMethod || status === 'deducted') {
            return `
            <div class="drawer-locked-msg">
                <i class="fa-solid fa-user-shield icon-ms-1"></i> عملية إدارية مباشرة (يمكنك الإيداع أو الخصم من ملف العميل)
            </div>`;
        }
        else if (status === 'approved') {
            return `
            <div class="modal-actions-row m-0 p-0 border-0">
                <button class="btn btn-outline-danger interactive-scale w-100" data-action="reevaluate-deposit" data-id="${_esc(depId)}">
                    <i class="fa-solid fa-rotate-left me-1"></i> استرجاع وخصم الرصيد
                </button>
            </div>`;
        } 
        else {
            const statusName = status === 'rejected' ? 'مرفوض' : 'مسترجع (ملغي)';
            return `
            <div class="drawer-locked-msg">
                <i class="fa-solid fa-lock icon-ms-1"></i> هذا السجل مغلق (${statusName})
            </div>`;
        }
    },

    currencyEditModal: () => `
        <div class="modal-content modal-md">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title" id="cur-modal-title"><i class="fa-solid fa-money-bill-transfer me-1"></i> إضافة عملة جديدة</h2>
            
            <input type="hidden" id="cur-old-code" value="">
            
            <div class="form-group">
                <label class="form-label">رمز العملة (Code)</label>
                <input type="text" id="cur-code" class="form-input num-en font-numeric text-uppercase" dir="ltr" placeholder="مثال: EUR">
            </div>
            <div class="form-group">
                <label class="form-label">اسم العملة</label>
                <input type="text" id="cur-name" class="form-input" placeholder="مثال: يورو أوروبي">
            </div>
            <div class="form-group">
                <label class="form-label">رمز العرض (Symbol)</label>
                <input type="text" id="cur-symbol" class="form-input num-en font-numeric" dir="ltr" placeholder="مثال: €">
            </div>
            
            <div class="d-flex gap-2 mb-15">
                <div class="form-group mb-0 flex-1">
                    <label class="form-label text-success">سعر البيع (مقابل 1$)</label>
                    <input type="text" inputmode="decimal" id="cur-price-rate" class="form-input num-en font-numeric" dir="ltr" placeholder="مثال: 0.92">
                </div>
                <div class="form-group mb-0 flex-1">
                    <label class="form-label text-danger">سعر الإيداع (مقابل 1$)</label>
                    <input type="text" inputmode="decimal" id="cur-dep-rate" class="form-input num-en font-numeric" dir="ltr" placeholder="مثال: 0.95">
                </div>
            </div>

            <div class="modal-actions-row border-top-solid mt-15 pt-15">
                <button type="button" class="btn btn-primary interactive-scale" data-action="save-currency">حفظ العملة</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">إلغاء</button>
            </div>
        </div>
    `,

    paymentEditModal: () => `
        <div class="modal-content modal-lg">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title" id="pay-modal-title"><i class="fa-solid fa-building-columns me-1"></i> إعدادات بوابة الدفع</h2>
            
            <div class="form-group">
                <label class="form-label">اسم طريقة الدفع</label>
                <input type="text" id="pay-name" class="form-input" placeholder="مثال: حوالة بنكية، زين كاش...">
            </div>
            
            <div class="form-group">
                <label class="form-label">شعار الطريقة (أيقونة)</label>
                <div class="upload-wrapper" id="pay-img-wrap">
                    <div class="upload-box interactive-scale cursor-pointer" data-action="trigger-click" data-target="pay-img-input">
                        <i class="fa-solid fa-cloud-arrow-up fa-2x text-muted mb-10"></i>
                        <span class="text-muted">اضغط لرفع شعار البوابة</span>
                    </div>
                    <input type="file" id="pay-img-input" class="hide-element" accept="image/*" data-action="upload-img" data-preview="pay-img" data-wrap="pay-img-wrap">
                    <img id="pay-img" src="" class="upload-preview hide-element">
                    <button type="button" class="btn btn-danger btn-compact btn-remove-img interactive-scale" data-action="clear-img" data-preview="pay-img" data-wrap="pay-img-wrap" data-input="pay-img-input"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>            <div class="ud-divider-dashed my-15"></div>
            
            <h3 class="fs-14 fw-bold mb-10"><i class="fa-solid fa-list-check me-1"></i> تفاصيل وعناوين الدفع</h3>
            <div class="d-flex gap-2 mb-10">
                <input type="text" id="pay-det-input" class="form-input mb-0 flex-1" placeholder="أدخل رقم الحساب، أو عنوان المحفظة...">
                <label class="d-flex align-items-center gap-2 m-0 bg-body p-2 rounded border cursor-pointer">
                    <input type="checkbox" id="pay-det-copyable" checked>
                    <span class="fs-12 text-nowrap">قابل للنسخ</span>
                </label>
                <button type="button" class="btn btn-primary interactive-scale" data-action="add-pay-detail"><i class="fa-solid fa-plus"></i></button>
            </div>
            <div id="pay-det-list" class="pay-det-grid mb-15"></div>

            <div class="form-group">
                <label class="form-label">تسمية حقل الإثبات (Placeholder للمشتري)</label>
                <input type="text" id="pay-input-placeholder" class="form-input" placeholder="مثال: أدخل رقم الحوالة، أو اسم المرسل...">
            </div>
            
            <div class="form-check-inline interactive-scale mb-15">
                <input type="checkbox" id="pay-req-proof" checked>
                <label for="pay-req-proof">إجبار المشتري على إرفاق صورة إيصال التحويل</label>
            </div>

            <div class="ud-divider-dashed my-15"></div>

            <h3 class="fs-14 fw-bold mb-10"><i class="fa-solid fa-coins me-1"></i> العملات المدعومة والرسوم</h3>
            <div class="pay-pro-currs mb-15"></div>
            
            <div id="currency-settings-container" class="hide-element">
                <div id="currency-settings-list" class="d-flex flex-column gap-3"></div>
            </div>

            <div class="modal-actions-row border-top-solid mt-15 pt-15">
                <button type="button" class="btn btn-primary interactive-scale" data-action="save-pay">حفظ البوابة</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">إلغاء</button>
            </div>
        </div>
    `,

    depositDrawerModal: () => `
        <div id="deposit-drawer" class="drawer-container">
            <div class="drawer-header">
                <div class="drawer-close-btn interactive-scale" data-action="close-deposit-drawer">
                    <i class="fa-solid fa-chevron-right"></i>
                </div>
                <div class="drawer-title-group">
                    <h2 class="drawer-title">مراجعة الإيداع</h2>
                    <div id="drawer-dep-id" class="drawer-dep-id-badge num-en font-numeric" dir="ltr"></div>
                </div>
            </div>
            
            <div class="drawer-scroll-area custom-scrollbar">
                <div class="drawer-body" id="drawer-dep-body-content">
                </div>
                
                <div class="dr-card mt-15">
                    <div class="form-group mb-0">
                        <label class="form-label fs-12"><i class="fa-solid fa-pen-to-square me-1"></i> ملاحظة للإدارة أو العميل (اختياري)</label>
                        <textarea id="dep-drawer-note" class="form-input dr-textarea" placeholder="اكتب ملاحظة لسبب الرفض أو القبول هنا..."></textarea>
                    </div>
                </div>
            </div>
            
            <div class="drawer-footer" id="drawer-dep-footer-actions">
            </div>
        </div>
    `
};