// ============================================================================
// 👥 قوالب المستخدمين والتوثيق (modules/users/usersTemplates.js) - النسخة الماسية V4.4 💎
// 🎯 الوظيفة: توليد الـ HTML النقي المدمج بالبيانات (Data Binding)
// 🚀 التحديث الأقصى: القضاء على تداخل المصفوفات والـ O(N) وسحق خطأ الانهيار الحرج كلياً
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { AdminData } from '../../adminData.js';

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;

const _getIcon = (iconStr, defaultIcon = 'fa-user') => {
    let raw = (iconStr || defaultIcon).trim();
    let parts = raw.split(' ').filter(Boolean);
    let family = 'fa-solid'; 
    let iconName = '';

    parts.forEach(p => {
        if (['fa-solid', 'fa-brands', 'fa-regular', 'fa-light', 'fa-duotone'].includes(p)) family = p;
        else if (p.startsWith('fa-')) iconName = p;
        else iconName = 'fa-' + p; 
    });

    if (!iconName) iconName = defaultIcon.startsWith('fa-') ? defaultIcon : 'fa-' + defaultIcon;
    return _esc(`${family} ${iconName}`);
};

export const UsersTemplates = {
    userSortLabel: (isAsc) => isAsc ? '<span class="sort-icon-group"><i class="fa-solid fa-long-arrow-alt-up"></i><i class="fa-solid fa-long-arrow-alt-down icon-dimmed icon-ms-n2"></i></span>' : '<span class="sort-icon-group"><i class="fa-solid fa-long-arrow-alt-up icon-dimmed icon-me-n2"></i><i class="fa-solid fa-long-arrow-alt-down"></i></span>',
    emptyUsers: () => `<div class="empty-state"><i class="fa-solid fa-users-slash"></i><span>لا يوجد مستخدمون حتى الآن</span></div>`,
    
    userCard: (u, sortType = 'newest', thisMonthKey = '', lastMonthKey = '', index = 0) => {
        const name = _esc(RenderHelpers._getExplicitName(u));
        const exactStatus = u.isBanned ? 'banned' : (u.isRestricted ? 'restricted' : 'active');
        const statusClass = `status-${exactStatus}`;
        
        const kycBadge = u.kycStatus === 'approved' ? `<i class="fa-solid fa-shield-check text-success mx-1" title="حساب موثق (KYC)"></i>` : '';
        
        const avatarInner = u.img 
            ? `<img src="${_esc(u.img)}" class="usr-avatar-img zoomable-img" data-action="open-img-viewer" data-src="${_esc(u.img)}">` 
            : `<span>${name !== '---' ? name.charAt(0) : '?'}</span>`;
        const avatarHtml = `<div class="usr-avatar">${avatarInner}<div class="usr-status-dot"></div></div>`;
        
        const rankNum = index + 1;
        let rankClass = 'rank-default';
        if (sortType !== 'newest') { 
            if (rankNum === 1) rankClass = 'rank-gold'; else if (rankNum === 2) rankClass = 'rank-silver'; else if (rankNum === 3) rankClass = 'rank-bronze';
        }
        const rankBadgeHtml = `<div class="usr-rank-badge ${rankClass}" dir="ltr">${rankNum}</div>`;

        let displaySpend = '';
        if (sortType === 'spend_all') displaySpend = `<div class="usr-leader-spend"><i class="fa-solid fa-trophy text-gold"></i> الإجمالي: <span class="num-en text-gold" dir="ltr">${RenderHelpers.formatMoney(u.totalSpent || 0, 'USD', 2)}</span></div>`;
        else if (sortType === 'spend_month') displaySpend = `<div class="usr-leader-spend"><i class="fa-solid fa-fire text-orange"></i> هذا الشهر: <span class="num-en text-orange" dir="ltr">${RenderHelpers.formatMoney(Number(u.monthlySpent?.[currentMonthKey] || 0), 'USD', 2)}</span></div>`;
        else if (sortType === 'spend_last_month') displaySpend = `<div class="usr-leader-spend"><i class="fa-solid fa-calendar-check text-info"></i> الشهر الماضي: <span class="num-en text-info" dir="ltr">${RenderHelpers.formatMoney(Number(u.monthlySpent?.[lastMonthKey] || 0), 'USD', 2)}</span></div>`;
        else if (sortType === 'orders_all') displaySpend = `<div class="usr-leader-spend"><i class="fa-solid fa-box-open text-primary"></i> إجمالي الطلبات: <span class="num-en text-primary" dir="ltr">${_enNum(u.totalOrdersCount || 0)}</span></div>`;
        else if (sortType === 'orders_month') displaySpend = `<div class="usr-leader-spend"><i class="fa-solid fa-bolt text-success"></i> طلبات هذا الشهر: <span class="num-en text-success" dir="ltr">${_enNum(Number(u.monthlyOrders?.[thisMonthKey] || 0))}</span></div>`;
        else if (sortType === 'orders_last_month') displaySpend = `<div class="usr-leader-spend"><i class="fa-solid fa-check-double text-purple"></i> طلبات الشهر الماضي: <span class="num-en text-purple" dir="ltr">${_enNum(Number(u.monthlyOrders?.[lastMonthKey] || 0))}</span></div>`;

        const currText = (u.baseCurrency || u.base_currency || 'USD').toUpperCase().replace('$', 'USD');
        return `<div id="user-card-${_esc(u.id)}" class="usr-card ${statusClass}" data-id="${_esc(u.id)}" data-status="${exactStatus}" data-action="view-user">
                    ${rankBadgeHtml}
                    <div class="usr-top">${avatarHtml}<h4 class="usr-name">${name}${kycBadge}</h4></div>
                    ${displaySpend}
                    <div class="usr-bottom">
                        <div class="usr-meta"><span class="usr-username" dir="ltr">${u.username ? '@' + _esc(u.username) : '---'}</span><span class="uid-capsule" title="رقم العميل"><i class="fa-solid fa-hashtag"></i>${_esc(RenderHelpers.formatUserId(u))}</span></div>
                        <div class="usr-wallet"><span class="w-lbl">الرصيد الحالي</span><div class="w-amount"><span class="w-val num-en" dir="ltr" lang="en">${RenderHelpers.formatMoney(parseFloat(u.walletBalance ?? u.balance ?? 0), currText, 2)}</span></div></div>
                    </div>
                </div>`;
    },

    emptyUserActivity: () => `<div class="ud-empty-state"><i class="fa-solid fa-receipt"></i><span>لا توجد حركات مالية (طلبات أو إيداعات) مسجلة لهذا العميل.</span></div>`,
    
    userActivityItem: (tx) => {
        const isOrder = tx.txType === 'order';
        const iconClass = isOrder ? 'fa-box-open' : 'fa-wallet';
        const sign = isOrder ? '-' : '+';
        const amountColorStyle = isOrder ? 'color: #cbd5e1 !important;' : 'color: #10b981 !important;'; 
        
        const classMap = { 
            pending: 'pending', 
            processing: 'processing', 
            completed: 'completed', 
            approved: 'completed',  
            rejected: 'rejected',   
            refunded: 'refunded',   
            returned: 'refunded'
        };
        const statusClass = classMap[tx.status] || 'pending';
        
        const statusMap = { pending:'قيد المراجعة', processing:'جاري التنفيذ', completed:'مكتمل', rejected:'مرفوض', refunded:'مسترجع', approved: 'مقبول' };
        const sText = statusMap[tx.status] || tx.status;
        
        const amount = isOrder ? (tx.price || 0) : (tx.amount || 0);
        const currency = tx.currency || 'USD';
        const shortId = isOrder ? RenderHelpers.formatOrderId(tx) : (RenderHelpers.formatDepositId ? RenderHelpers.formatDepositId(tx) : String(tx.displayId || tx.id).substring(0,8));

        const formatMoneyCompact = (amt, curr) => {
            const num = Number(amt) || 0;
            const rawDisplayCur = RenderHelpers.getCurrencySymbolText(curr);
            const safeDisplayCur = _esc(rawDisplayCur);
            
            if (num >= 1e6) {
                const formattedNum = num.toLocaleString('en-US', {
                    notation: 'compact',
                    compactDisplay: 'short',
                    maximumFractionDigits: 2
                });
                return `<span class="money-pro" title="${num.toLocaleString('en-US')} ${safeDisplayCur}"><bdi class="num-en money-val">${formattedNum}</bdi><bdi class="cur-symbol cur-single">${safeDisplayCur}</bdi></span>`;
            } else {
                return RenderHelpers.formatMoney(amt, curr, 2);
            }
        };

        return `<div class="ud-order-item d-flex align-items-center justify-content-between gap-3 p-3" style="cursor: pointer; transition: background 0.2s; min-height: 70px;" onmouseover="this.style.background='rgba(var(--primary-rgb), 0.05)'" onmouseout="this.style.background='transparent'" data-action="open-tx-detail" data-id="${_esc(tx.id)}" data-type="${_esc(tx.txType)}">
            <div style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">
                <div class="ud-order-id num-en d-flex align-items-center gap-2" dir="ltr" lang="en" style="font-weight: 700; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
                    <i class="fa-solid ${iconClass} ${isOrder ? 'text-muted' : 'text-success'}"></i> #${_esc(shortId)}
                </div>
                <div class="ud-order-date num-en text-muted" dir="ltr" lang="en" style="font-size: 11px;">
                    ${(tx.time || tx.date) ? RenderHelpers.formatSafeDate(tx.time || tx.date) : '---'}
                </div>
            </div>
            <div class="text-left d-flex flex-column align-items-end" style="flex-shrink: 0; max-width: 60%; word-break: break-all;">
                <div class="ud-order-price num-en" dir="ltr" lang="en" style="font-weight: 800; font-size: 14px; white-space: normal; text-align: left; line-height: 1.2; ${amountColorStyle}">
                    ${sign}${formatMoneyCompact(amount, currency)}
                </div>
                <span class="status-badge ${statusClass}" style="margin-top: 4px; white-space: nowrap;">${sText}</span>
            </div>
        </div>`;
    },
    
    userFullHistoryBtn: (id) => `<button class="btn btn-ghost ud-btn-full-ghost mt-10" data-action="view-user-full-history" data-id="${_esc(id)}" style="background: rgba(var(--primary-rgb), 0.05); color: var(--primary); border: 1px dashed rgba(var(--primary-rgb), 0.3); font-weight: 800;">
        الانتقال لسجل الطلبات الكامل <i class="fa-solid fa-arrow-left"></i>
    </button>`,

    userDetailBody: (u, uiData, ordersHtml) => {
        const sm = u.isIpBanned ? { t: 'حظر IP', i: 'network-wired', c: 'danger' } : (u.isBanned ? { t: 'محظور', i: 'ban', c: 'danger' } : (u.isRestricted ? { t: 'مقيّد', i: 'lock', c: 'warning' } : { t: 'نشط', i: 'check-circle', c: 'success' }));
        
        const kycBadgeObj = {
            approved: { t: 'مكتمل (موثق)', i: 'shield-check', c: 'status-badge-check-circle' },
            pending: { t: 'قيد المراجعة', i: 'hourglass-half', c: 'status-badge-lock' },
            rejected: { t: 'مرفوض', i: 'shield-xmark', c: 'status-badge-ban' },
            none: { t: 'غير موثق', i: 'shield', c: 'status-badge-default' }
        }[u.kycStatus || 'none'] || { t: 'غير موثق', i: 'shield', c: 'status-badge-default' };

        let kycDocsHtml = '';
        if (u.kycData && (u.kycData.frontImg || u.kycData.backImg || u.kycData.selfieImg)) {
            kycDocsHtml = `
                <div class="flex-gap-10 mt-15 flex-wrap">
                    ${u.kycData.frontImg ? `<button class="btn btn-ghost btn-sm flex-1" data-action="open-img-viewer" data-src="${_esc(u.kycData.frontImg)}"><i class="fa-solid fa-id-card"></i> الوجه الأمامي</button>` : ''}
                    ${u.kycData.backImg ? `<button class="btn btn-ghost btn-sm flex-1" data-action="open-img-viewer" data-src="${_esc(u.kycData.backImg)}"><i class="fa-solid fa-id-card"></i> الوجه الخلفي</button>` : ''}
                    ${u.kycData.selfieImg ? `<button class="btn btn-ghost btn-sm flex-1" data-action="open-img-viewer" data-src="${_esc(u.kycData.selfieImg)}"><i class="fa-solid fa-camera"></i> السيلفي</button>` : ''}
                </div>
            `;
        }

        return `
            <div id="tab-overview" class="ud-tab-content active">
                <div class="ud-section-header ud-header-clean mt-5 mb-10 ud-header-flex">
                    <div class="flex-center-gap">${u.img ? `<img src="${_esc(u.img)}" class="zoomable-img ud-header-avatar" data-action="open-img-viewer" data-src="${_esc(u.img)}">` : ''}<h3 class="ud-section-title"><i class="fa-solid fa-user-tie"></i> البيانات الشخصية</h3></div>
                    <button class="btn btn-ghost btn-sm ud-btn-edit-pro" data-action="open-user-edit" data-id="${u.id}"><i class="fa-solid fa-pen"></i> تعديل</button>
                </div>
                <div class="ud-info-list">
                    <div class="ud-info-row"><span class="ud-info-lbl"><i class="fa-regular fa-id-badge"></i> الاسم الكامل</span><span class="ud-info-val ud-copyable" title="انقر للنسخ" data-action="copy-to-clipboard">${_esc(uiData.rawName)}</span></div>
                    <div class="ud-info-row"><span class="ud-info-lbl"><i class="fa-solid fa-at"></i> اسم المستخدم</span><span class="ud-info-val num-en ud-copyable" dir="ltr" lang="en" title="انقر للنسخ" data-action="copy-to-clipboard">${u.username ? '@' + _esc(u.username) : '---'}</span></div>
                    <div class="ud-info-row"><span class="ud-info-lbl"><i class="fa-solid fa-fingerprint"></i> معرف العميل (ID)</span><span class="ud-info-val" title="رقم العميل"><span class="uid-capsule font-lg"><i class="fa-solid fa-hashtag"></i>${_esc(RenderHelpers.formatUserId(u))}</span></span></div>
                    <div class="ud-info-row"><span class="ud-info-lbl"><i class="fa-solid fa-envelope"></i> البريد</span><span class="ud-info-val num-en ${u.email ? 'ud-copyable' : 'text-muted'}" dir="ltr" lang="en" ${u.email ? 'title="انقر للنسخ" data-action="copy-to-clipboard"' : ''}>${u.email ? _esc(u.email) : '----'}</span></div>
                    <div class="ud-info-row"><span class="ud-info-lbl"><i class="fa-solid fa-clock"></i> رقم الهاتف</span><span class="ud-info-val num-en ${u.phone ? 'ud-copyable' : 'text-muted'}" dir="ltr" lang="en" ${u.phone ? 'title="انقر للنسخ" data-action="copy-to-clipboard"' : ''}>${u.phone ? _esc(u.phone) : '----'}</span></div>
                    <div class="ud-info-row"><span class="ud-info-lbl"><i class="fa-solid fa-gem"></i> مستوى العميل</span><span class="ud-info-val ud-copyable" title="انقر للنسخ" data-action="copy-to-clipboard"><i class="fa-solid fa-crown"></i> ${_esc(uiData.tierName)}</span></div>
                    <div class="ud-info-row"><span class="ud-info-lbl"><i class="fa-solid fa-coins"></i> عملة الحساب</span><span class="ud-info-val num-en ud-copyable" dir="ltr" lang="en" title="انقر للنسخ" data-action="copy-to-clipboard">${uiData.safeCurrency}</span></div>
                    <div class="ud-info-row"><span class="ud-info-lbl"><i class="fa-solid fa-earth-americas"></i> الدولة</span><span class="ud-info-val ud-copyable" title="انقر للنسخ" data-action="copy-to-clipboard">${_esc(u.countryName || u.country || 'غير محدد')}</span></div>
                    <div class="ud-info-row"><span class="ud-info-lbl"><i class="fa-regular fa-calendar-check"></i> التسجيل</span><span class="ud-info-val ud-copyable ${uiData.joinDate === 'غير متوفر' ? '' : 'num-en'}" dir="ltr" lang="en" title="انقر للنسخ" data-action="copy-to-clipboard">${uiData.joinDate}</span></div>
                </div>
                <div class="ud-section mt-15">
                    <div class="ud-section-header ud-header-clean"><h3 class="ud-section-title"><i class="fa-solid fa-bell"></i> إرسال تنبيه للعميل</h3></div>
                    <div class="ud-form-col mt-10">
                        <textarea id="user-custom-notif" class="form-input ud-textarea" placeholder="اكتب رسالة التنبيه هنا لتظهر للعميل في حسابه..."></textarea>
                        <button class="btn btn-primary ud-btn-full mt-10" data-action="send-custom-notif" data-id="${u.id}"><i class="fa-solid fa-paper-plane"></i> إرسال التنبيه</button>
                    </div>
                </div>
            </div>
            
            <div id="tab-wallet" class="ud-tab-content">
                <div class="ud-balance-card-pro">
                    <div class="lbl">الرصيد الحالي بالمحفظة</div>
                    <div class="val num-en" dir="ltr" lang="en">${RenderHelpers.formatMoney(uiData.bal, uiData.safeCurrency, 2)}</div>
                    <div class="bal-actions">
                        <button class="btn btn-primary" data-action="adjust-balance" data-type="add" data-id="${u.id}"><i class="fa-solid fa-plus"></i> إيداع</button>
                        <button class="btn btn-red" data-action="adjust-balance" data-type="subtract" data-id="${u.id}"><i class="fa-solid fa-minus"></i> خصم</button>
                    </div>
                </div>
                <div class="ud-section">
                    <div class="ud-section-header ud-header-clean"><h3 class="ud-section-title"><i class="fa-solid fa-chart-pie"></i> الإحصائيات المالية</h3></div>
                    <div class="ud-stats-grid mt-10">
                        <div class="ud-info-row ud-stat-box"><span class="ud-info-lbl"><i class="fa-solid fa-sack-dollar"></i> المشتريات</span><span class="ud-info-val num-en ud-stat-val-success" dir="ltr" lang="en">${RenderHelpers.formatMoney(uiData.totalSpent, uiData.safeCurrency, 2)}</span></div>
                        <div class="ud-info-row ud-stat-box"><span class="ud-info-lbl"><i class="fa-solid fa-boxes-stacked"></i> الطلبات</span><span class="ud-info-val num-en" dir="ltr" lang="en">${_enNum(uiData.totalOrdersCount)} طلب</span></div>
                    </div>
                </div>
            </div>
            
            <div id="tab-orders" class="ud-tab-content">${ordersHtml}</div>
            
            <div id="tab-security" class="ud-tab-content">
                <div class="ud-section">
                    <div class="ud-section-header ud-header-clean"><h3 class="ud-section-title text-danger"><i class="fa-solid fa-user-shield"></i> الأمان والحالة</h3></div>
                    
                    <div class="ud-status-wrapper mt-10"><span class="ud-info-lbl ud-status-lbl">حالة الحساب:</span><div class="ud-status-badge status-badge-${sm.i} text-${sm.c}"><i class="fa-solid fa-${sm.i}"></i> ${sm.t}</div></div>
                    
                    <button class="btn btn-ghost mt-10 w-100 text-primary" style="border: 1px solid rgba(56, 189, 248, 0.2); background: rgba(56, 189, 248, 0.05);" data-action="send-password-reset" data-id="${u.id}">
                        <i class="fa-solid fa-envelope-open-text"></i> إرسال رابط استعادة كلمة المرور لبريد العميل
                    </button>
                    
                    <div class="ud-status-wrapper mt-15"><span class="ud-info-lbl ud-status-lbl">عنوان IP الأخير:</span><span class="num-en ud-copyable font-lg" dir="ltr" title="انقر للنسخ" data-action="copy-to-clipboard">${u.lastIp || u.ipAddress || u.ip ? _esc(u.lastIp || u.ipAddress || u.ip) : 'غير متوفر'}</span></div>
                    
                    <div class="mt-15 p-15" style="background: rgba(0,0,0,0.2); border: 1px dashed var(--border-color); border-radius: 8px;">
                        <div class="flex-between align-items-center mb-10">
                            <span class="fs-13 fw-bold text-warning"><i class="fa-solid fa-fingerprint"></i> الأجهزة المسجلة (Device Prints):</span>
                            <span class="badge-qty">${Array.isArray(u.devicePrints) ? u.devicePrints.length : 0} أجهزة</span>
                        </div>
                        
                        ${Array.isArray(u.devicePrints) && u.devicePrints.length > 0 ? 
                            `<div class="d-flex flex-wrap gap-2 mb-10">
                                ${u.devicePrints.map(dp => `<span class="badge-tag num-en fs-10" dir="ltr" style="background: rgba(255,255,255,0.05);">${dp.substring(0,8)}...</span>`).join('')}
                            </div>` 
                            : `<div class="text-muted fs-11 mb-10">لم يتم التقاط أي بصمة جهاز لهذا العميل بعد.</div>`
                        }

                        ${uiData.relatedAccounts && uiData.relatedAccounts.length > 0 ? `
                            <div class="alert-box alert-danger mt-10" style="padding: 10px;">
                                <div class="fs-12 fw-bold mb-5"><i class="fa-solid fa-triangle-exclamation"></i> رادار الحسابات المتعددة:</div>
                                <div class="fs-11">تم اكتشاف أن هذا العميل دخل من نفس أجهزة العملاء التاليين:</div>
                                <div class="mt-5 d-flex flex-wrap gap-2">
                                    ${uiData.relatedAccounts.map(acc => `
                                        <span class="badge-tag clickable ${acc.isBanned ? 'bg-danger text-white' : 'bg-warning text-dark'}" data-action="view-user" data-id="${acc.id}">
                                            <i class="fa-solid ${acc.isBanned ? 'fa-ban' : 'fa-link'}"></i> ${_esc(acc.name)}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : `
                            <div class="alert-box alert-success mt-10" style="padding: 8px 10px;">
                                <div class="fs-11"><i class="fa-solid fa-shield-check"></i> العميل نظيف (لا يوجد حسابات مشتركة).</div>
                            </div>
                        `}
                    </div>

                    <div class="ud-actions-col mt-15">
                        <button class="btn ud-btn-restrict" data-action="restrict-user" data-id="${u.id}"><i class="fa-solid fa-lock"></i> ${u.isRestricted ? 'رفع التقييد' : 'تقييد الحساب (منع الشراء)'}</button>
                        <button class="btn ud-btn-ban" data-action="ban-user" data-id="${u.id}"><i class="fa-solid fa-bolt"></i> ${u.isBanned ? 'رفع الحظر' : 'إعدام الحساب والأجهزة سحابياً'}</button>
                        <button class="btn ud-btn-ban-ip" data-action="ban-user-ip" data-id="${u.id}" data-ip="${u.lastIp || u.ipAddress || u.ip || ''}"><i class="fa-solid fa-network-wired"></i> ${u.isIpBanned ? 'رفع حظر الـ IP' : 'حظر الـ IP (منع الشبكة)'}</button>
                        <div class="ud-divider-dashed"></div>
                        <button class="btn ud-btn-delete" data-action="delete-user" data-id="${u.id}"><i class="fa-solid fa-trash"></i> حذف العميل</button>
                    </div>
                </div>

                <div class="ud-section mt-15">
                    <div class="ud-section-header ud-header-clean"><h3 class="ud-section-title text-success"><i class="fa-solid fa-passport"></i> بيانات توثيق الهوية (KYC)</h3></div>
                    <div class="ud-status-wrapper mt-10">
                        <span class="ud-info-lbl ud-status-lbl">حالة التوثيق:</span>
                        <div class="ud-status-badge ${kycBadgeObj.c}"><i class="fa-solid fa-${kycBadgeObj.i}"></i> ${kycBadgeObj.t}</div>
                    </div>
                    ${kycDocsHtml}

                    ${(u.kycStatus === 'approved' || u.kycStatus === 'pending' || kycDocsHtml !== '') ? `
                    <div class="mt-15 pt-15" style="border-top: 1px dashed var(--border);">
                        <button class="btn btn-red btn-full" data-action="revoke-kyc" data-id="${u.id}">
                            <i class="fa-solid fa-triangle-exclamation"></i> إبطال التوثيق وحذف المستندات (تزوير/مخالفة)
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>

            <div id="tab-developer" class="ud-tab-content">
                <div class="ud-section">
                    <div class="ud-section-header ud-header-clean">
                        <h3 class="ud-section-title text-primary"><i class="fa-solid fa-code"></i> بوابة المطورين والربط (API)</h3>
                    </div>
                    <p class="text-muted fs-12 mt-10 mb-15">إعدادات الربط البرمجي (B2B) للسماح لمتجر العميل بالاتصال بمتجرك وسحب المنتجات أو تنفيذ الطلبات آلياً بشكل مباشر.</p>
                    
                    <div class="ud-status-wrapper mt-10 flex-column align-items-start gap-10">
                        <span class="ud-info-lbl ud-status-lbl"><i class="fa-solid fa-key"></i> مفتاح الربط النشط (API Key):</span>
                        ${u.apiKey ? `
                        <div class="flex-center-gap w-100">
                            <input type="text" class="form-input num-en" dir="ltr" readonly value="${_esc(u.apiKey)}">
                            <button class="btn btn-ghost" data-action="copy-text" data-copy-text="${_esc(u.apiKey)}" title="نسخ المفتاح">
                                <i class="fa-solid fa-copy"></i>
                            </button>
                        </div>
                        ` : `<div class="w-100 text-center py-10 text-muted fs-12" style="background: var(--glass-bg); border-radius: 8px;">لا يوجد مفتاح ربط نشط لهذا العميل</div>`}
                    </div>
                    
                    <div class="flex-center-gap mt-15">
                        ${u.apiKey ? `<button class="btn btn-red flex-1" data-action="revoke-api-key" data-id="${u.id}"><i class="fa-solid fa-trash"></i> إبطال</button>` : ''}
                        <button class="btn btn-primary flex-1" data-action="generate-api-key" data-id="${u.id}"><i class="fa-solid fa-arrows-rotate"></i> ${u.apiKey ? 'تجديد المفتاح' : 'توليد مفتاح جديد'}</button>
                    </div>

                    <div class="ud-divider-dashed mt-20 mb-15"></div>

                    <div class="ud-section-header ud-header-clean">
                        <h3 class="ud-section-title text-success"><i class="fa-solid fa-satellite-dish"></i> إشعارات المتجر (Webhooks)</h3>
                    </div>
                    <p class="text-muted fs-12 mt-10 mb-15">أدخل رابط الاستماع (Webhook URL) الخاص بمتجر العميل لإرسال تنبيهات فورية إليه عند تغير حالة الطلبات أو نفاذ المخزون.</p>
                    
                    <div class="ud-form-col">
                        <input type="url" id="dev-webhook-url-${u.id}" class="form-input num-en" dir="ltr" placeholder="https://client-store.com/api/webhook" value="${_esc(u.webhookUrl || '')}">
                        <button class="btn btn-green ud-btn-full mt-10" data-action="save-webhook-url" data-id="${u.id}"><i class="fa-solid fa-floppy-disk"></i> حفظ الرابط</button>
                    </div>
                </div>
            </div>`;
    },
    tierCard: (t, userCount, tStats = { profit: 0, revenue: 0 }) => `<div id="tier-card-${_esc(t.id)}" class="tier-card ${t.autoAdvance ? 'auto-on' : 'auto-off'}" data-tier-id="${_esc(t.id)}">
                <div class="tc-head">
                    <div class="tc-info"><div class="tc-icon-box"><i class="${_getIcon(t.icon, 'fa-user')}"></i></div><div class="tc-name"><h2>${_esc(t.name || t.id)}</h2>${t.isDefault ? '<span class="tc-badge">افتراضي</span>' : ''}</div></div>
                    <div class="flex-center-gap">
                        ${!t.isDefault ? `<div class="action-mini btn-del-mini" data-action="delete-tier" data-id="${_esc(t.id)}" title="حذف المستوى"><i class="fa-solid fa-trash"></i></div>` : ''}
                        <div class="action-mini btn-edit-mini" data-action="open-tier-edit" data-id="${_esc(t.id)}" title="تعديل المستوى"><i class="fa-solid fa-pen"></i></div>
                    </div>
                </div>
                <div class="tc-body">
                    <div class="tc-cell"><span class="cell-lbl"><i class="fa-solid fa-sack-dollar text-gold"></i> صافي ربح المستوى</span><span class="cell-val num-en text-gold fw-bold" dir="ltr" lang="en">${RenderHelpers.formatMoney(tStats.profit, 'USD', 2)}</span></div>
                    <div class="tc-cell"><span class="cell-lbl"><i class="fa-solid fa-chart-line text-success"></i> إجمالي الإيرادات</span><span class="cell-val num-en text-success fw-bold" dir="ltr" lang="en">${RenderHelpers.formatMoney(tStats.revenue, 'USD', 2)}</span></div>
                    
                    <div class="tc-cell"><span class="cell-lbl">نسبة الربح المطبقة</span><span class="cell-val num-en" dir="ltr" lang="en">%${_enNum(t.profit_percent, 2)}</span></div>
                    <div class="tc-cell"><span class="cell-lbl">القاع</span><span class="cell-val">${t.min_profit_usd ? `<span class="num-en tc-gold-txt" dir="ltr" lang="en">${RenderHelpers.formatMoney(t.min_profit_usd, 'USD', 2)}</span>` : '-'}</span></div>
                    <div class="tc-cell"><span class="cell-lbl">الشرط المالي</span><span class="cell-val num-en" dir="ltr" lang="en">${RenderHelpers.formatMoney(t.threshold, 'USD', 2)}</span></div>
                    <div class="tc-cell"><span class="cell-lbl">المهلة الزمنية</span><span class="cell-val">${t.duration_days ? `<span class="num-en inline-val" dir="ltr" lang="en">${_enNum(t.duration_days)}&nbsp;day</span>` : '∞'}</span></div>
                    <div class="toggle-box tc-toggle-row"><span class="toggle-lbl">الانتقال التلقائي</span><label class="switch"><input type="checkbox" ${t.autoAdvance ? 'checked' : ''} data-action="toggle-tier-auto" data-id="${_esc(t.id)}"><span class="slider"></span></label></div>
                </div>
                <div class="tc-foot"><div class="count-badge"><i class="fa-solid fa-users"></i><span class="num-en count-val" dir="ltr" lang="en">${_enNum(userCount)}</span><span>عميل</span></div><button class="btn btn-ghost tier-users-toggle" data-action="open-tier-users" data-id="${_esc(t.id)}"><i class="fa-solid fa-users"></i> إدارة العملاء</button></div>
            </div>`,

    tierUsersSectionBody: () => `<div class="tier-users-header"><button class="btn btn-ghost" data-action="back-to-tiers"><i class="fa-solid fa-arrow-right"></i> العودة للمستويات</button><h2 id="tier-users-title">عملاء المستوى</h2></div><div class="tier-info-card"><div class="tic-icon-box"><i class="fa-solid fa-user"></i></div><div class="tic-info"><h3 id="tier-name">المستوى</h3><div class="tier-stats"></div></div></div><div id="tier-users-container" class="tier-users-grid"></div>`,
    
    tierInfoStats: (tier, tStats = { profit: 0, revenue: 0 }) => `<span class="tier-stat-item"><strong class="stat-lbl-group"><i class="fa-solid fa-sack-dollar stat-icon text-gold"></i> صافي الأرباح:</strong> <span class="num-en text-gold fw-bold" dir="ltr" lang="en">${RenderHelpers.formatMoney(tStats.profit, 'USD', 2)}</span></span><span class="tier-stat-item"><strong class="stat-lbl-group"><i class="fa-solid fa-chart-line stat-icon text-success"></i> نسبة الربح:</strong> <span class="num-en" dir="ltr" lang="en">%${_enNum(tier.profit_percent || 0, 2)}</span></span><span class="tier-stat-item"><strong class="stat-lbl-group"><i class="fa-solid fa-bullseye stat-icon"></i> الشرط المالي:</strong> <span class="num-en" dir="ltr" lang="en">${RenderHelpers.formatMoney(tier.threshold || 0, 'USD', 2)}</span></span>`,
    
    tierUsersSearchBox: () => `<div class="filter-pro-container mb-15 tier-search-box-wrapper"><div class="filter-input-group w-100 mb-0"><i class="fa-solid fa-magnifying-glass"></i><input type="text" class="form-input" placeholder="بحث سريع عن عميل..." data-action="filter-tier-users"></div></div>`,
    emptyTierUsers: () => `<div class="empty-state mt-15"><i class="fa-solid fa-users"></i><span>لا يوجد عملاء في هذا المستوى</span></div>`,
    
    tierUserCard: (u, spent, target, pct, isTopTier, nextTierName, tier) => {
        const safeName = _esc(RenderHelpers._getExplicitName(u));
        const fallbackChar = safeName && safeName !== '---' ? safeName.charAt(0) : '?';
        const exactStatus = u.isBanned ? 'banned' : (u.isRestricted ? 'restricted' : 'active');
        const tierColor = tier.color || 'var(--primary)';

        const avatarHtml = `
            <div class="tc-icon-box">
                ${u.img ? `<img src="${_esc(u.img)}" class="tuc-avatar-img">` : fallbackChar}
                <div class="status-indicator-dot status-${exactStatus}"></div>
            </div>`;

        return `
        <div id="tier-user-${_esc(u.id)}" class="tier-user-card pro-interactive-card" data-id="${_esc(u.id)}" data-action="view-user">
            <div class="tuc-main-header">
                <div class="tuc-head">
                    ${avatarHtml}
                    <div class="tuc-info">
                        <h4>${safeName}</h4>
                        <span class="uid-capsule"><i class="fa-solid fa-hashtag"></i>${_esc(RenderHelpers.formatUserId(u))}</span>
                    </div>
                </div>
                <div class="tuc-change-capsule" data-action="change-tier" data-id="${_esc(u.id)}" title="تغيير المستوى">
                    تغيير المستوى
                </div>
            </div>

            <div class="tuc-content-zone">
                ${!isTopTier ? `
                    <div class="tuc-progress-wrapper">
                        <div class="tuc-progress-info">
                            <div class="prog-item"><span class="p-lbl">المدفوع</span><span class="p-val num-en" dir="ltr" lang="en">${RenderHelpers.formatMoney(spent, 'USD', 2)}</span></div>
                            <div class="prog-item text-left"><span class="p-lbl">الهدف</span><span class="p-val num-en text-info" dir="ltr" lang="en">${RenderHelpers.formatMoney(target, 'USD', 2)}</span></div>
                        </div>
                        <div class="tuc-progress-bar-container">
                            <div class="tuc-bar-bg"><div class="tuc-bar-fill" style="width: ${pct}%; background: ${tierColor}; box-shadow: 0 0 10px ${tierColor}60;"></div></div>
                            <span class="tuc-pct-badge num-en" dir="ltr" lang="en">${pct}%</span>
                        </div>
                    </div>
                ` : `
                    <div class="tuc-status-box status-achieved" style="border-color: ${tierColor}; background: ${tierColor}08;">
                        <div class="status-label-main" style="color: ${tierColor};"><i class="fa-solid fa-trophy"></i> محقق للشرط المالي</div>
                    </div>
                `}
            </div>
        </div>`;
    },
    
    kycSearchBox: () => `
        <div class="filter-pro-container mb-20 kyc-search-wrapper">
            <div class="filter-input-group w-100 mb-0">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="kyc-search-input" class="form-input" placeholder="البحث برقم العميل، الاسم، أو رقم الهوية..." data-action="filter-kyc-requests">
            </div>
        </div>
    `,

    kycPendingHeader: (count) => `
        <div class="kyc-section-header">
            <h3><i class="fa-solid fa-file-shield text-warning"></i> طلبات بانتظار المراجعة</h3>
            <span class="kyc-count-capsule">${count}</span>
        </div>
    `,

    kycRequestCard: function(user) {
        const safeName = _esc(RenderHelpers._getExplicitName(user));
        const fallbackChar = safeName && safeName !== '---' ? safeName.charAt(0) : '?';
        const exactStatus = user.isBanned ? 'banned' : (user.isRestricted ? 'restricted' : 'active');
        
        let tierName = 'عادي (افتراضي)'; 
        let tierIcon = 'fa-solid fa-user'; 
        let tierColor = 'var(--text-muted)';
        
        if (AdminData && AdminData.data && AdminData.data.tiersMap) {
            // ⚡ التحديث الفائق: استدعاء العضوية بـ O(1) من الخريطة بدلاً من البحث البطيء
            const tierObj = AdminData.data.tiersMap[user.tierId];
            if (tierObj) { 
                tierName = _esc(tierObj.nameAr || tierObj.name); 
                tierIcon = _getIcon(tierObj.icon, 'fa-user'); 
                tierColor = tierObj.color || 'var(--gold)'; 
            }
        }
        
        const avatarInner = user.img 
            ? `<img src="${_esc(user.img)}" class="tuc-avatar-img zoomable-img" data-action="open-img-viewer" data-src="${_esc(user.img)}">` 
            : fallbackChar;

        const avatarHtml = `
            <div class="tc-icon-box">
                ${avatarInner}
                <div class="status-indicator-dot status-${exactStatus}"></div>
            </div>
        `;

        const kyc = user.kycData || {};
        const kycFullName = kyc.fullName || kyc.full_name || kyc.name || kyc.firstName || user.fullName || user.name || 'لم يقم بإدخال الاسم';
        const kycIdNumber = kyc.idNumber || kyc.id_number || kyc.nationalId || kyc.national_id || kyc.documentNumber || kyc.document_number || 'لم يقم بإدخال الرقم';

        let docsHtml = '';
        const kycDocs = kyc.docs || [];
        let imagesToRender = [];
        if (kycDocs.length > 0) {
            imagesToRender = kycDocs.map((d, i) => ({ url: typeof d === 'string' ? d : d.url, label: typeof d === 'string' ? `مستند ${i+1}` : d.label }));
        } else {
            if (kyc.frontImg) imagesToRender.push({url: kyc.frontImg, label: 'الوجه الأمامي'});
            if (kyc.backImg) imagesToRender.push({url: kyc.backImg, label: 'الوجه الخلفي'});
            if (kyc.selfieImg) imagesToRender.push({url: kyc.selfieImg, label: 'صورة السيلفي'});
        }

        if (imagesToRender.length > 0) {
            docsHtml = `<div class="kyc-images-grid">`;
            imagesToRender.forEach(doc => {
                docsHtml += `
                    <div class="kyc-img-box" data-action="open-img-viewer" data-src="${_esc(doc.url)}">
                        <img src="${_esc(doc.url)}">
                        <span>${_esc(doc.label)}</span>
                    </div>`;
            });
            docsHtml += `</div>`;
        } else {
            docsHtml = `<div class="kyc-empty-docs"><i class="fa-solid fa-folder-open"></i> لا توجد مرفقات</div>`;
        }

        return `
        <div class="kyc-request-card" id="kyc-req-${_esc(user.id)}">
            <div class="kyc-req-header clickable-header" data-action="view-user" data-id="${_esc(user.id)}" title="فتح ملف العميل الشامل">
                ${avatarHtml}
                <div class="kyc-req-user-info">
                    <h4>${safeName}</h4>
                    <div class="d-flex align-items-center gap-2 mt-1">
                        <span class="uid-capsule m-0"><i class="fa-solid fa-hashtag"></i>${_esc(RenderHelpers.formatUserId(user))}</span>
                        <span class="fs-11 fw-bold kyc-tier-badge" style="color: ${tierColor};"><i class="${tierIcon}"></i> ${tierName}</span>
                    </div>
                </div>
                <div class="kyc-req-status-badge">
                    <i class="fa-solid fa-clock-rotate-left"></i> قيد المراجعة
                </div>
            </div>

            <div class="kyc-req-body">
                <div class="kyc-submitted-data">
                    <div class="kyc-data-row">
                        <span class="kyc-data-lbl"><i class="fa-regular fa-id-card"></i> الاسم في الهوية:</span>
                        <span class="kyc-data-val">${_esc(kycFullName)}</span>
                    </div>
                    <div class="kyc-data-row">
                        <span class="kyc-data-lbl"><i class="fa-solid fa-fingerprint"></i> رقم الهوية/الجواز:</span>
                        <span class="kyc-data-val num-en" dir="ltr">${_esc(kycIdNumber)}</span>
                    </div>
                </div>

                <h5 class="kyc-section-title mt-10">المستندات المرفقة:</h5>
                ${docsHtml}
                
                ${kyc.notes ? `
                <div class="kyc-notes-box mt-10">
                    <div class="kyc-notes-lbl"><i class="fa-solid fa-comment-dots"></i> ملاحظات العميل:</div>
                    <p class="kyc-notes-text">${_esc(kyc.notes)}</p>
                </div>
                ` : ''}
            </div>

            <div class="kyc-req-footer">
                <button class="btn btn-kyc-reject" data-action="handle-kyc" data-id="${_esc(user.id)}" data-decision="reject">
                    <i class="fa-solid fa-times-circle"></i> رفض الطلب
                </button>
                <button class="btn btn-kyc-accept" data-action="handle-kyc" data-id="${_esc(user.id)}" data-decision="approve">
                    <i class="fa-solid fa-check-circle"></i> قبول وتوثيق
                </button>
            </div>
        </div>`;
    },
    kycDashboard: function(config, tiers) {
        const mode = config.mode || 'off'; 
        const isSpec = (mode === 'specific' || mode === 'spec');
        
        let tiersHtml = `<div id="kyc-tiers-selection" class="mt-4 animate__animated animate__fadeIn ${!isSpec ? 'hide-element' : ''}">
            <h6 class="mb-3 fw-bold text-main">تحديد المستويات المستهدفة:</h6>
            <div class="tiers-selection-list d-grid gap-2">
                 ${tiers.map(t => {
                    const isTargeted = (config.targetedTiers || []).map(id => String(id)).includes(String(t.id));
                    const safeIcon = _getIcon(t.icon, 'fa-medal');
                    return `<div class="tier-kyc-item"><div class="d-flex align-items-center gap-3 flex-1 overflow-hidden"><i class="${safeIcon} fs-5" style="color: ${t.color || 'var(--gold)'}; flex-shrink: 0;"></i><span class="fw-bold text-truncate text-main">${t.nameAr || t.name}</span></div><label class="switch m-0 flex-shrink-0"><input type="checkbox" data-action="toggle-kyc-tier" data-id="${t.id}" ${isTargeted ? 'checked' : ''}><span class="slider"></span></label></div>`;
                }).join('')}
            </div>
        </div>`;

        return `<div class="kyc-dashboard-card">
                    <div class="kyc-master-switch-box">
                        <h5 class="fw-bold text-main mb-15"><i class="fa-solid fa-sliders text-primary"></i> وضع التوثيق الحالي:</h5>
                        <div class="kyc-mode-grid">
                            <div class="kyc-mode-btn off-mode ${mode === 'off' ? 'active' : ''}" data-action="update-kyc-mode" data-mode="off"><i class="fa-solid fa-power-off"></i> إيقاف التوثيق</div>
                            <div class="kyc-mode-btn all-mode ${mode === 'all' ? 'active' : ''}" data-action="update-kyc-mode" data-mode="all"><i class="fa-solid fa-globe"></i> فرض على الجميع</div>
                            <div class="kyc-mode-btn spec-mode ${isSpec ? 'active' : ''}" data-action="update-kyc-mode" data-mode="specific"><i class="fa-solid fa-list-check"></i> مستويات محددة</div>
                        </div>
                    </div>
                    ${tiersHtml}
                    <div class="kyc-save-btn-wrap">
                        <button class="btn btn-primary px-5 fw-bold" data-action="save-kyc"><i class="fa-solid fa-floppy-disk"></i> حفظ إعدادات الأمان</button>
                    </div>
                </div>`; 
    },

    emptyKycState: function(type = 'empty') {
        const isDone = type === 'done';
        const icon = isDone ? 'fa-clipboard-check text-success' : 'fa-user-shield text-muted';
        const title = isDone ? 'تم مراجعة كافة الطلبات بنجاح' : 'لا توجد طلبات توثيق بعد';
        const desc = isDone ? 'عمل رائع! صندوق الوارد الخاص بالتوثيق نظيف تماماً الآن.' : 'لم يقم أي عميل برفع بيانات الهوية الخاصة به حتى الآن.';
        
        return `<div class="empty-state mt-15"><div class="empty-icon mb-10"><i class="fa-solid ${icon} fa-3x ${!isDone ? 'opacity-50' : ''}"></i></div><div class="empty-text fw-bold fs-16 text-main">${title}</div><div class="empty-sub text-muted fs-12 mt-5">${desc}</div></div>`;
    },

    tierSelectionModal: (u, tiers) => {
        const safeName = _esc(u.fullName || u.name || u.username || 'مستخدم');
        
        // ⚡ التحديث الفائق: جلب المستوى الحالي بـ O(1) من الخريطة
        const currentTier = AdminData.data.tiersMap?.[u.tierId] || tiers.find(t => String(t.id) === String(u.tierId));
        const currentTierName = currentTier ? _esc(currentTier.name) : 'غير محدد';
        
        const listHtml = tiers.map(tier => {
            const isCurrent = String(tier.id) === String(u.tierId);
            return UsersTemplates.tierOptionItem(tier, isCurrent, _esc(tier.name || 'مستوى'), _getIcon(tier.icon, 'fa-user'));
        }).join('');

        return `
        <div class="modal-content tier-modal-content">
            <div class="modal-close-btn" data-action="close-tier-selection"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title mb-15"><i class="fa-solid fa-ranking-star"></i> اختيار المستوى الجديد</h2>
            <div class="tsm-info-box">
                <div class="tsm-info-row"><i class="fa-solid fa-user text-info"></i><strong>العميل:</strong> <span>${safeName}</span></div>
                <div class="tsm-info-row"><i class="fa-solid fa-crown text-gold"></i><strong>المستوى الحالي:</strong> <span>${currentTierName}</span></div>
            </div>
            <div id="tier-selection-list" class="tsm-list-container">${listHtml}</div>
            <div class="tsm-actions">
                <button class="btn btn-primary flex-1" data-action="confirm-tier-selection">تأكيد</button>
                <button class="btn btn-ghost flex-1" data-action="close-tier-selection">إلغاء</button>
            </div>
        </div>`;
    },

    tierOptionItem: (tier, isCurrent, safeName, safeIcon) => {
        return `<div class="tier-option ${isCurrent ? 'current' : ''}" data-tier-id="${tier.id}" data-action="select-tier-option"><div class="flex-center-gap-10"><div class="tc-icon-box-sm"><i class="${safeIcon}"></i></div><div><div class="tsm-tier-name">${safeName}</div><div class="tsm-tier-meta" dir="ltr" lang="en">نسبة الربح: %${_enNum(tier.profit_percent||0, 2)} | شرط: ${RenderHelpers.formatMoney(tier.threshold||0, 'USD', 2)}</div></div>${isCurrent ? '<i class="fa-solid fa-check tsm-check-icon"></i>' : ''}</div></div>`;
    },

    userEditForm: (u) => `
        <div class="form-group">
            <label class="form-label">الاسم الكامل</label>
            <input type="text" id="user-edit-name" class="form-input" value="${_esc(u.fullName || u.name || '')}">
        </div>
        <div class="form-group">
            <label class="form-label">البريد الإلكتروني</label>
            <input type="email" id="user-edit-email" class="form-input num-en" dir="ltr" lang="en" value="${_esc(u.email || '')}">
        </div>
        <div class="form-row-2 flex-gap-10">
            <div class="form-group flex-1">
                <label class="form-label">رقم الهاتف</label>
                <input type="text" id="user-edit-phone" class="form-input num-en" dir="ltr" lang="en" value="${_esc(u.phone || '')}">
            </div>
            <div class="form-group flex-1">
                <label class="form-label">الدولة</label>
                <input type="text" id="user-edit-country" class="form-input" value="${_esc(u.countryName || u.country || '')}">
            </div>
        </div>
        <button class="btn btn-primary btn-full mt-15" data-action="save-user-edits" data-id="${u.id}">
            <i class="fa-solid fa-floppy-disk"></i> حفظ التعديلات
        </button>`
};

