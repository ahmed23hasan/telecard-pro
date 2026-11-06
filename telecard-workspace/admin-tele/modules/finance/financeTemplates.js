// ============================================================================
// 💰 قوالب المالية والإيداعات (modules/finance/financeTemplates.js) - Enterprise V20.2 💎
// ============================================================================
// 🌟 التحديثات المعمارية:
// 1. Dual Price Typography 🏷️: استبدال .dual-price-sub بالكلاسات المعتمدة (.fs-11.text-muted).
// 2. Upload Box Architecture 🖼️: إعادة هيكلة صندوق رفع شعار البوابة وربط حدث النقر بالحاوية الرئيسية
//    واعتماد الأيقونة الذهبية .upload-icon-gold والنص التوضيحي .upload-hint-text.
// 3. Stamp Badge Standardization 🎖️: تنظيف الكلاسات غير المعرّفة من ختم رقم الإيداع بالدرج الجانبي.
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
            dualAmountHtml = `<span class="${priceColor}">${sign} ${RenderHelpers.formatMoney(absNetBase, target, 2)}</span> <span class="fs-11 text-muted font-numeric" dir="ltr">(${RenderHelpers.formatMoney(absLocal, localCurr, 2)})</span>`;
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
            return `<div class="fs-12 text-main"> • عملة <b>${_esc(c.currency)}</b>: رصيد عالق <span class="num-en font-numeric" dir="ltr">${_esc(stuckVal)}</span> <span class="text-muted fs-11">(${_esc(c.reason)})</span></div>`;
        }).join('');
        
        return `<div class="wallet-card warning-liability interactive-scale w-100 mb-15">
                    <div class="wc-title text-danger fw-bold"><i class="fa-solid fa-triangle-exclamation me-1"></i> تحذير محاسبي: سيولة غير محسوبة!</div>
                    <div class="wc-meta text-main mt-5">توجد أرصدة للعملاء لم يتم تحويلها وإضافتها للإجمالي بالدولار بسبب غياب سعر الصرف:</div>
                    <div class="mt-5">${detailsHtml}</div>
                    <div class="wc-meta text-danger mt-5 fw-bold"><i class="fa-solid fa-gear me-1"></i> يرجى التوجه لإعدادات العملات وإصلاح أسعار الصرف.</div>
                </div>`;
    },

    currencySettingRow: (code, displayCode, oldFeeType, oldFeeUnit, oldFee, oldMin, oldMax, oldMinFee, oldMaxFee) => {
        const isBonus = (oldFeeType === 'bonus');
        const themeColor = isBonus ? 'text-success' : 'text-danger';

        return `
        <div class="curr-setting-row" id="curr-setting-${_esc(code)}" data-code="${_esc(code)}">
            <div class="curr-setting-title">
                <i class="fa-solid fa-coins text-gold"></i>
                <span>إعدادات ${isBonus ? 'بونص' : 'عمولة'} وحدود عملة ${_esc(code)}</span>
                <span class="rate-code-hint font-numeric" dir="ltr" lang="en">(${_esc(displayCode)})</span>
            </div>
            
            <div class="curr-setting-grid">
                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl">نظام المعاملة</label>
                    <select id="pay-feetype-${_esc(code)}" class="form-input select-shared" dir="rtl" data-action="change-fee-type" data-code="${_esc(code)}" data-val="${_esc(oldFeeType)}">
                        <option value="fee" ${!isBonus ? 'selected' : ''}>عمولة خصم (-)</option>
                        <option value="bonus" ${isBonus ? 'selected' : ''}>بونص إضافي (+)</option>
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
                    <label class="form-label curr-setting-lbl ${themeColor}" id="lbl-fee-val-${_esc(code)}">
                        ${isBonus ? '<i class="fa-solid fa-gift me-1"></i> نسبة / قيمة البونص' : 'قيمة العمولة المقتطعة'}
                    </label>
                    <input type="text" inputmode="decimal" id="pay-fee-${_esc(code)}" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="0.0" value="${_esc(oldFee)}">
                </div>

                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl ${themeColor}" id="lbl-fee-max-${_esc(code)}">
                        ${isBonus ? 'أقصى بونص إضافي (سقف الهدية)' : 'أعلى سقف للعمولة المقتطعة'}
                    </label>
                    <input type="text" inputmode="decimal" id="pay-maxfee-${_esc(code)}" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="0.00" value="${_esc(oldMaxFee)}">
                </div>

                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl text-main">أدنى حد للإيداع</label>
                    <input type="text" inputmode="decimal" id="pay-min-${_esc(code)}" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="0.00" value="${_esc(oldMin)}">
                </div>
                
                <div class="form-group mb-0">
                    <label class="form-label curr-setting-lbl text-main">أعلى حد للإيداع</label>
                    <input type="text" inputmode="decimal" id="pay-max-${_esc(code)}" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="0.00" value="${_esc(oldMax)}">
                </div>

                <div class="form-group mb-0 curr-grid-full">
                    <label class="form-label curr-setting-lbl ${themeColor}" id="lbl-fee-min-${_esc(code)}">
                        ${isBonus ? 'أدنى بونص ممنوح' : 'أدنى عمولة مقتطعة (قاع)'}
                    </label>
                    <input type="text" inputmode="decimal" id="pay-minfee-${_esc(code)}" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="0.00" value="${_esc(oldMinFee)}">
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
                                ${isActive ? '<span class="v-stat-chip chip-success fs-10"><i class="fa-solid fa-check-circle"></i> مفعلة</span>' : '<span class="v-stat-chip chip-danger fs-10"><i class="fa-solid fa-ban"></i> متوقفة</span>'}
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
                    <div class="pay-det-text">${_esc(text).replace(/\n/g, '<br>')}${isCopyable ? '<div><span class="pay-badge-copyable"><i class="fa-solid fa-copy me-1"></i> قابل للنسخ بالمتجر</span></div>' : '<div><span class="pay-badge-viewonly"><i class="fa-solid fa-eye me-1"></i> عنوان للعرض فقط</span></div>'}</div>
                    <div class="flex-align-center gap-2">
                        <button class="btn btn-ghost btn-compact btn-pay-det-copy interactive-scale" data-action="copy-text" data-copy-text="${_esc(text)}" title="نسخ للإدارة"><i class="fa-solid fa-copy"></i></button>
                        <button class="btn btn-pay-det-del interactive-scale" data-action="remove-pay-detail" data-index="${i}" title="حذف"><i class="fa-solid fa-trash"></i></button>
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
                
                <div class="rate-top-row">
                    <div class="rate-main-wrapper">
                        <div class="rate-symbol-box font-numeric" dir="ltr" lang="en">${RenderHelpers.getCurrencySymbolText(c.code)}</div>
                        <div class="rate-title-row">
                            <img src="${flagUrl}" class="rate-flag-mini" alt="${_esc(c.code)}">
                            <span class="rate-name-text">${_esc(c.name)}</span>
                            <span class="num-en rate-code-hint font-numeric" dir="ltr" lang="en">(${_esc(c.code)})</span>
                            ${isBase ? '<span class="rate-base-badge">المرساة</span>' : ''}
                        </div>
                    </div>
                    
                    <div class="rate-actions">
                        ${setDisplayBtn}
                        ${!isBase ? `
                            <button class="action-mini btn-edit-mini interactive-scale" data-action="open-edit-currency" data-code="${_esc(c.code)}" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                            <button class="action-mini btn-del-mini interactive-scale" data-action="delete-currency" data-code="${_esc(c.code)}" title="حذف"><i class="fa-solid fa-trash"></i></button>
                        ` : ''}
                    </div>
                </div>

                <div class="rate-values-row">
                    <span class="rate-val-group">سعر البيع: <span class="num-en val-sell font-numeric" dir="ltr" lang="en">${_enNum(c.priceRate)}</span></span>
                    <span class="rate-val-group">سعر الإيداع: <span class="num-en val-buy font-numeric" dir="ltr" lang="en">${_enNum(c.depRate)}</span></span>
                    <span class="rate-usd-hint font-numeric" dir="ltr">(مقابل 1$)</span>
                </div>
            </div>`;
    },

    drawerBankImg: (imgSrc) => imgSrc 
        ? `<img src="${_esc(imgSrc)}" class="dr-prod-img zoomable-img interactive-scale" data-action="open-img-viewer" data-src="${_esc(imgSrc)}">` 
        : `<div class="dr-prod-placeholder"><i class="fa-solid fa-building-columns"></i></div>`,

    depositReceiptCard: (receiptSrc) => `
        <button type="button" class="dr-card dr-system-box dr-receipt-container receipt-btn-transparent interactive-scale pulse-badge" data-action="open-img-viewer" data-src="${_esc(receiptSrc)}">
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
                <div class="flex-align-center">
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
            <button class="btn btn-primary interactive-scale flex-1" data-action="submit-deposit" data-type="approve" data-id="${_esc(depId)}">
                <i class="fa-solid fa-check me-1"></i> قبول واعتماد
            </button>
            <button class="btn btn-outline-danger interactive-scale flex-1" data-action="submit-deposit" data-type="reject" data-id="${_esc(depId)}">
                <i class="fa-solid fa-xmark me-1"></i> رفض
            </button>`;
        } 
        else if (isAdminManualMethod || status === 'deducted') {
            return `
            <div class="drawer-locked-msg">
                <i class="fa-solid fa-user-shield me-1"></i> عملية إدارية مباشرة (يمكنك الإيداع أو الخصم من ملف العميل)
            </div>`;
        }
        else if (status === 'approved') {
            return `
            <button class="btn btn-outline-danger interactive-scale flex-1" data-action="reevaluate-deposit" data-id="${_esc(depId)}">
                <i class="fa-solid fa-rotate-left me-1"></i> استرجاع وخصم الرصيد
            </button>`;
        } 
        else {
            const statusName = status === 'rejected' ? 'مرفوض' : 'مسترجع (ملغي)';
            return `
            <div class="drawer-locked-msg">
                <i class="fa-solid fa-lock me-1"></i> هذا السجل مغلق (${statusName})
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
                <input type="text" id="cur-code" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="مثال: EUR">
            </div>
            <div class="form-group">
                <label class="form-label">اسم العملة</label>
                <input type="text" id="cur-name" class="form-input" placeholder="مثال: يورو أوروبي">
            </div>
            <div class="form-group">
                <label class="form-label">رمز العرض (Symbol)</label>
                <input type="text" id="cur-symbol" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="مثال: €">
            </div>
            
            <div class="d-flex gap-2 mb-15">
                <div class="form-group mb-0 flex-1">
                    <label class="form-label text-success">سعر البيع (مقابل 1$)</label>
                    <input type="text" inputmode="decimal" id="cur-price-rate" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="مثال: 0.92">
                </div>
                <div class="form-group mb-0 flex-1">
                    <label class="form-label text-danger">سعر الإيداع (مقابل 1$)</label>
                    <input type="text" inputmode="decimal" id="cur-dep-rate" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="مثال: 0.95">
                </div>
            </div>

            <div class="modal-actions-row border-top-solid mt-15 pt-15">
                <button type="button" class="btn btn-primary interactive-scale" data-action="save-currency">حفظ العملة</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">إلغاء</button>
            </div>
        </div>
    `,

    paymentEditModal: () => `
        <div class="modal-content modal-lg prod-modal-lg">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title" id="pay-modal-title"><i class="fa-solid fa-building-columns me-1"></i> إعدادات بوابة الدفع</h2>
            
            <div class="sub-tabs-container fh-tabs-container mb-15 d-flex gap-2 p-8">
                <button type="button" class="btn btn-compact btn-primary pay-tab-btn flex-1 active interactive-scale" id="btn-tab-pay-general" data-action="switch-pay-tab" data-tab="pay-tab-general">
                    <i class="fa-solid fa-building-columns me-1"></i> بيانات البوابة والتحويل
                </button>
                <button type="button" class="btn btn-compact btn-ghost pay-tab-btn flex-1 interactive-scale" id="btn-tab-pay-finance" data-action="switch-pay-tab" data-tab="pay-tab-finance">
                    <i class="fa-solid fa-coins me-1"></i> العملات والرسوم والحدود
                </button>
            </div>

            <div id="pay-tab-general" class="pay-tab-pane">
                <div class="card mb-15 p-15">
                    <h3 class="ud-section-title mb-12"><i class="fa-solid fa-id-card text-primary me-1"></i> هوية وسيلة الدفع</h3>
                    <div class="form-group mb-12">
                        <label class="form-label">اسم طريقة الدفع (يظهر للمشتري)</label>
                        <input type="text" id="pay-name" class="form-input" placeholder="مثال: حوالة بنكية، زين كاش، بايير...">
                    </div>
                    
                    <div class="form-group mb-0">
                        <label class="form-label">شعار الطريقة (أيقونة البوابة)</label>
                        <div class="upload-area interactive-scale" id="pay-img-wrap" data-action="trigger-click" data-target="pay-img-input">
                            <i class="fa-solid fa-cloud-arrow-up mb-5 upload-icon-gold upload-icon-lg"></i>
                            <span class="upload-hint-text">اضغط لرفع شعار البوابة</span>
                            <input type="file" id="pay-img-input" class="hide-element" accept="image/*" data-action="upload-img" data-preview="pay-img" data-wrap="pay-img-wrap">
                            <img id="pay-img" class="hide-element">
                            <button type="button" class="btn-remove-img interactive-scale" data-action="clear-img" data-preview="pay-img" data-wrap="pay-img-wrap" data-input="pay-img-input"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>
                </div>

                <div class="card mb-15 p-15">
                    <h3 class="ud-section-title mb-12"><i class="fa-solid fa-list-check text-warning me-1"></i> تفاصيل التحويل (رقم الحسابات / الآيبان)</h3>
                    
                    <div class="pay-add-account-card mb-15">
                     <div class="form-group mb-10">
                            <label class="form-label fs-11">رقم الحساب، الآيبان (IBAN)، أو عنوان المحفظة</label>
                            <input type="text" id="pay-det-input" class="form-input pay-account-input" data-onenter="add-pay-detail" placeholder="أدخل رقم الحساب أو الآيبان هنا...">
                        </div>                  
                        <div class="pay-add-account-footer">
                            <div class="pay-copy-switch-wrap">
                                <label class="switch interactive-scale">
                                    <input type="checkbox" id="pay-det-copyable" checked>
                                    <span class="slider"></span>
                                </label>
                                <span class="fs-12 fw-bold text-main"><i class="fa-solid fa-copy text-gold me-1"></i> ميزة النسخ السريع للمشتري</span>
                            </div>

                            <button type="button" class="btn btn-primary btn-add-account interactive-scale" data-action="add-pay-detail">
                                <i class="fa-solid fa-plus me-1"></i> إضافة الحساب
                            </button>
                        </div>
                    </div>

                    <div id="pay-det-list" class="pay-det-grid"></div>
                </div>

                <div class="card mb-15 p-15">
                    <h3 class="ud-section-title mb-12"><i class="fa-solid fa-receipt text-success me-1"></i> متطلبات إثبات التحويل من المشتري</h3>
                    <div class="form-group mb-15">
                        <label class="form-label">تسمية حقل الإثبات (Placeholder للمشتري)</label>
                        <input type="text" id="pay-input-placeholder" class="form-input" placeholder="مثال: أدخل رقم الحوالة، أو اسم المرسل...">
                    </div>
                    
                    <div class="setting-item-row mb-0">
                        <div class="setting-text">
                            <span class="fs-13 fw-bold text-main">إجبار المشتري على إرفاق صورة إيصال التحويل</span>
                            <p class="fs-11 text-muted m-0">عند التفعيل، لن يتمكن العميل من إرسال طلب الشحن حتى يرفع صورة وصل التحويل البنكي.</p>
                        </div>
                        <div class="setting-control">
                            <label class="switch interactive-scale">
                                <input type="checkbox" id="pay-req-proof" checked>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div id="pay-tab-finance" class="pay-tab-pane hide-element">
                <div class="card mb-15 p-15">
                    <h3 class="ud-section-title mb-12"><i class="fa-solid fa-coins text-gold me-1"></i> العملات المقبولة في هذه البوابة</h3>
                    <p class="fs-11 text-muted mb-12">حدد العملات التي تدعم هذه البوابة الإيداع بها لتخصيص عمولاتها وحدودها أدناه:</p>
                    <div class="pay-pro-currs"></div>
                </div>
                
                <div id="currency-settings-container" class="hide-element">
                    <div id="currency-settings-list" class="d-flex flex-column"></div>
                </div>
            </div>

            <div class="modal-actions-row border-top-solid mt-15 pt-15">
                <button type="button" class="btn btn-primary interactive-scale" data-action="save-pay">حفظ البوابة</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">إلغاء</button>
            </div>
        </div>
    `,

    depositDrawerModal: () => `
        <div id="deposit-drawer" class="order-drawer drawer-container" data-action="ignore-click">
            <div class="drawer-header">
                <div class="dh-title-wrap drawer-title-group">
                    <h2 class="dh-title drawer-title">مراجعة الإيداع</h2>
                    <div id="drawer-dep-id" class="dr-order-stamp num-en font-numeric" dir="ltr"></div>
                </div>
                <div class="drawer-close drawer-close-btn interactive-scale" data-action="close-deposit-drawer">
                    <i class="fa-solid fa-xmark"></i>
                </div>
            </div>
            
            <div class="drawer-scroll-area custom-scrollbar">
                <div class="drawer-body" id="drawer-dep-body-content">
                </div>
                
                <div class="dr-card drawer-note-area mt-15">
                    <div class="form-group mb-0">
                        <label class="form-label fs-12"><i class="fa-solid fa-pen-to-square me-1"></i> ملاحظة للإدارة أو العميل (اختياري)</label>
                        <textarea id="dep-drawer-note" class="form-input dr-textarea" placeholder="اكتب ملاحظة لسبب الرفض أو القبول هنا..."></textarea>
                    </div>
                </div>
                
                <div class="drawer-footer" id="drawer-dep-footer-actions">
                </div>
            </div>
        </div>
    `
};
