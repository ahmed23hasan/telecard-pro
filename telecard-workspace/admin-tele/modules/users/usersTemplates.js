// ============================================================================
// 👥 قوالب المستخدمين والتوثيق (modules/users/usersTemplates.js) - Enterprise V19.9 💎
// 🎯 الوظيفة: توليد الـ HTML النقي المدمج بالبيانات لملفات العملاء والتوثيق
// 🌟 التحديثات المعمارية:
// 1. Standard Order Badges 🏷️: استبدال .status-badge بالكلاس المعتمد في admin.css وهو .oh-status.
// 2. Standardized Chips 💎: توحيد كبسولات حالة الحساب والتوثيق عبر .v-stat-chip (.chip-success, .chip-warning, .chip-danger, .chip-sold).
// 3. Animation Cleanup 🧹: إزالة فئات الحركة الوهمية غير المعرفة (animate__animated animate__fadeIn).
// 4. Modal Overrides Sync ⚙️: تصحيح كلاس تعطيل خيار تثبيت المستوى إلى .disabled بدلاً من .btn-disabled.
// 5. Native CSS Hidden 🛡️: استبدال خاصية hidden بكلاس النظام المركزي .hide-element.
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { AdminData } from '../../adminData.js';
import { DeveloperTemplates } from '../developer/developerTemplates.js';

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

const _formatMoneyCompact = (amt, curr) => {
    const num = Number(amt) || 0;
    const safeDisplayCur = _esc(RenderHelpers.getCurrencySymbolText(curr));
    if (num >= 1e6) {
        const formattedNum = num.toLocaleString('en-US', { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 2 });
        return `<span class="money-pro font-numeric" dir="ltr" title="${num.toLocaleString('en-US')} ${safeDisplayCur}"><bdi class="num-en money-val">${formattedNum}</bdi><bdi class="cur-symbol cur-single">${safeDisplayCur}</bdi></span>`;
    } else { 
        return RenderHelpers.formatMoney(amt, curr, 2); 
    }
};

export const UsersTemplates = {
    userSortLabel: (isAsc) => isAsc 
        ? '<span class="sort-icon-group"><i class="fa-solid fa-long-arrow-alt-up"></i><i class="fa-solid fa-long-arrow-alt-down icon-dimmed icon-ms-n2"></i></span>' 
        : '<span class="sort-icon-group"><i class="fa-solid fa-long-arrow-alt-up icon-dimmed icon-me-n2"></i><i class="fa-solid fa-long-arrow-alt-down"></i></span>',
    
    emptyUsers: () => RenderHelpers.emptyState('fa-solid fa-users-slash text-muted', 'لا يوجد مستخدمون', 'لم يقم أي عميل بالتسجيل في المتجر حتى الآن.'),
    emptyTiers: () => RenderHelpers.emptyState('fa-solid fa-layer-group text-muted', 'لا توجد مستويات', 'لا توجد مستويات مسجلة حالياً. أضف مستوى جديد.'),
    emptyUserActivity: () => RenderHelpers.emptyState('fa-solid fa-receipt text-muted', 'لا توجد حركات مالية', 'لم يقم هذا العميل بأي عمليات شراء أو إيداع بعد.'),
    emptyTierUsers: () => RenderHelpers.emptyState('fa-solid fa-users text-muted', 'لا يوجد عملاء', 'لا يوجد عملاء مخصصين لهذا المستوى حالياً.'),
    
    emptyKycState: function(type = 'empty') {
        const isDone = type === 'done';
        const icon = isDone ? 'fa-solid fa-clipboard-check text-success' : 'fa-solid fa-user-shield text-muted';
        const title = isDone ? 'تم مراجعة كافة الطلبات بنجاح' : 'لا توجد طلبات توثيق بعد';
        const desc = isDone ? 'عمل رائع! صندوق الوارد الخاص بالتوثيق نظيف تماماً الآن.' : 'لم يقم أي عميل برفع بيانات الهوية الخاصة به حتى الآن.';
        
        return RenderHelpers.emptyState(icon, title, desc);
    },

    radarBoxContent: function(relatedAccounts = []) {
        if (Array.isArray(relatedAccounts) && relatedAccounts.length > 0) {
            return `
                <div class="ud-radar-alert alert-danger mt-12 p-12">
                    <div class="fs-12 fw-bold text-danger mb-8 flex-align-center gap-2">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>رادار كشف الحسابات المشتركة (${relatedAccounts.length})</span>
                    </div>
                    <div class="fs-11 text-muted mb-10">تم رصد اشتراك هذا العميل مع الحسابات التالية:</div>
                    <div class="d-flex flex-column gap-2">
                        ${relatedAccounts.map(acc => `
                            <div class="ud-radar-item interactive-scale" data-action="view-user" data-id="${_esc(acc.id)}">
                                <span class="fs-12 fw-bold text-main flex-align-center gap-2">
                                    <i class="fa-solid ${acc.isBanned ? 'fa-ban text-danger' : 'fa-user text-warning'}"></i>
                                    <span>${_esc(acc.name)}</span>
                                </span>
                                <span class="v-stat-chip fs-10 ${acc.isBanned ? 'chip-danger' : 'chip-warning'}">
                                    ${_esc(acc.reason || 'حساب مشترك')}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        return `
            <div class="ud-radar-alert alert-success mt-12 p-10 text-center">
                <div class="fs-11 text-success fw-bold"><i class="fa-solid fa-shield-check me-1"></i> العميل نظيف (لا توجد حسابات أخرى مرتبطة به).</div>
            </div>
        `;
    },
    
    userCard: (u, sortType = 'newest', currentMonthKey = '', lastMonthKey = '', index = 0) => {
        const name = _esc(RenderHelpers._getTxName(u));
        const exactStatus = u.isBanned ? 'banned' : (u.isRestricted ? 'restricted' : 'active');
        const statusClass = `status-${exactStatus}`;
        
        const kycBadge = u.kycStatus === 'approved' 
            ? `<i class="fa-solid fa-shield-check text-success ms-1" title="حساب موثق (KYC)"></i>` : '';
            
        const apiBadge = u.isApiMerchant === true 
            ? `<i class="fa-solid fa-code text-warning ms-1" title="تاجر API"></i>` : '';
        
        const userImg = u.profileImage || u.img;
        const avatarInner = userImg 
            ? `<img src="${_esc(userImg)}" class="usr-avatar-img zoomable-img interactive-scale" data-action="open-img-viewer" data-src="${_esc(userImg)}">` 
            : `<span>${name !== '---' ? name.charAt(0) : '?'}</span>`;
        
        const avatarHtml = `<div class="usr-avatar">${avatarInner}<div class="usr-status-dot"></div></div>`;
        
        const rankNum = index + 1;
        let rankClass = 'rank-default';
        if (sortType !== 'newest') { 
            if (rankNum === 1) rankClass = 'rank-gold'; 
            else if (rankNum === 2) rankClass = 'rank-silver'; 
            else if (rankNum === 3) rankClass = 'rank-bronze'; 
        }
        const rankBadgeHtml = `<div class="usr-rank-badge ${rankClass} font-numeric" dir="ltr">${rankNum}</div>`;

        let displaySpend = '';
        if (sortType === 'spend_all') displaySpend = `<div class="usr-leader-spend"><i class="fa-solid fa-trophy text-gold"></i> الإجمالي: <span class="num-en text-gold font-numeric" dir="ltr">${RenderHelpers.formatMoney(u.totalSpent || 0, 'USD', 2)}</span></div>`;
        else if (sortType === 'orders_all') displaySpend = `<div class="usr-leader-spend"><i class="fa-solid fa-box-open text-primary"></i> إجمالي الطلبات: <span class="num-en text-primary font-numeric" dir="ltr">${_enNum(u.totalOrdersCount || 0)}</span></div>`;

        const currText = (u.baseCurrency || 'USD').toUpperCase().replace('$', 'USD');
        
        return `
        <div id="user-card-${_esc(u.id)}" class="usr-card interactive-scale ${statusClass}" data-id="${_esc(u.id)}" data-status="${exactStatus}" data-action="view-user">
            ${rankBadgeHtml}
            <div class="usr-top">
                ${avatarHtml}
                <h4 class="usr-name">${name}${apiBadge}${kycBadge}</h4>
            </div>
            ${displaySpend}
            <div class="usr-bottom">
                <div class="usr-meta">
                    <span class="usr-username font-numeric" dir="ltr">${u.username ? '@' + _esc(u.username) : '---'}</span>
                    <div class="uid-capsule uid-capsule-flat font-numeric" dir="ltr">
                        ${RenderHelpers.formatUserId(u)}
                    </div>
                </div>
                <div class="usr-wallet">
                    <span class="w-lbl">الرصيد الحالي</span>
                    <div class="w-amount">
                        <span class="w-val num-en font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(parseFloat(u.walletBalance ?? 0), currText, 2)}</span>
                    </div>
                </div>
            </div>
        </div>`;
    },
    
    userActivityItem: (tx) => {
        const isOrder = tx.txType === 'order';
        const rawAmount = isOrder ? (tx.priceLocalDeducted ?? tx.price ?? 0) : (tx.creditedAmount ?? tx.amount ?? 0);
        const isDeduct = !isOrder && (tx.status === 'deducted' || Number(rawAmount) < 0);
        const iconClass = isOrder ? 'fa-box-open' : 'fa-wallet';
        const sign = (isOrder || isDeduct) ? '-' : '+';
        const amountColorClass = (isOrder || isDeduct) ? 'tx-color-order' : 'tx-color-deposit';
        
        const classMap = { pending: 'pending', processing: 'processing', completed: 'completed', approved: 'completed', rejected: 'rejected', deducted: 'rejected', refunded: 'refunded', returned: 'refunded' };
        const statusClass = classMap[tx.status] || 'pending';
        
        const statusMap = { pending: 'قيد المراجعة', processing: 'جاري التنفيذ', completed: 'مكتمل', rejected: 'مرفوض', deducted: 'خصم إداري', refunded: 'مسترجع', returned: 'مرتجع', approved: 'مقبول' };
        const sText = statusMap[tx.status] || _esc(tx.status);
        
        const amount = Math.abs(Number(rawAmount) || 0);
        const currency = isOrder ? (tx.priceCurrency || tx.currency || 'USD') : (tx.targetCurrency || tx.currency || 'USD');
        const shortId = isOrder ? RenderHelpers.formatOrderId(tx) : (RenderHelpers.formatDepositId ? RenderHelpers.formatDepositId(tx) : _esc(String(tx.displayId || tx.id).substring(0, 8)));
        
        return `
        <div class="ud-order-item ud-tx-item interactive-scale" data-action="open-tx-detail" data-id="${_esc(tx.id)}" data-type="${_esc(tx.txType)}">
            <div class="tx-info-col">
                <div class="ud-order-id num-en flex-align-center gap-2 fw-bold font-numeric" dir="ltr" lang="en">
                    <i class="fa-solid ${iconClass} ${(isOrder || isDeduct) ? 'text-muted' : 'text-success'}"></i> ${shortId}
                </div>
                <div class="ud-order-date num-en text-muted fs-11 font-numeric" dir="ltr" lang="en">
                    ${(tx.time || tx.date || tx.createdAt) ? RenderHelpers.formatSafeDate(tx.time || tx.date || tx.createdAt) : '---'}
                </div>
            </div>
            <div class="tx-amount-col">
                <div class="ud-order-price num-en fw-800 fs-14 lh-12 ${amountColorClass} font-numeric" dir="ltr" lang="en">
                    ${sign}${_formatMoneyCompact(amount, currency)}
                </div>
                <span class="oh-status ${statusClass}">${sText}</span>
            </div>
        </div>`;
    },

    userDetailBody: (u, uiData) => {
        const sm = u.isIpBanned 
            ? { t: 'حظر IP', i: 'network-wired', c: 'chip-danger' } 
            : (u.isBanned ? { t: 'محظور', i: 'ban', c: 'chip-danger' } : (u.isRestricted ? { t: 'مقيّد', i: 'lock', c: 'chip-warning' } : { t: 'نشط', i: 'check-circle', c: 'chip-success' }));
        
        const kycBadgeObj = { 
            approved: { t: 'مكتمل (موثق)', i: 'shield-check', c: 'chip-success' }, 
            pending: { t: 'قيد المراجعة', i: 'hourglass-half', c: 'chip-warning' }, 
            rejected: { t: 'مرفوض', i: 'shield-xmark', c: 'chip-danger' }, 
            none: { t: 'غير موثق', i: 'shield', c: 'chip-sold' } 
        }[u.kycStatus || 'none'] || { t: 'غير موثق', i: 'shield', c: 'chip-sold' };

        const apiBadgeFull = u.isApiMerchant === true
            ? `<span class="v-stat-chip chip-warning ms-2 fs-10"><i class="fa-solid fa-code"></i> مسار API</span>` : '';

        let kycDocsHtml = '';
        if (u.kycData && (u.kycData.frontImg || u.kycData.backImg || u.kycData.selfieImg)) {
            kycDocsHtml = `
                <div class="flex-wrap-gap-2 mt-15">
                    ${u.kycData.frontImg ? `<button class="btn btn-ghost btn-compact flex-1 interactive-scale" data-action="open-img-viewer" data-src="${_esc(u.kycData.frontImg)}"><i class="fa-solid fa-id-card me-1"></i> الوجه الأمامي</button>` : ''}
                    ${u.kycData.backImg ? `<button class="btn btn-ghost btn-compact flex-1 interactive-scale" data-action="open-img-viewer" data-src="${_esc(u.kycData.backImg)}"><i class="fa-solid fa-id-card me-1"></i> الوجه الخلفي</button>` : ''}
                    ${u.kycData.selfieImg ? `<button class="btn btn-ghost btn-compact flex-1 interactive-scale" data-action="open-img-viewer" data-src="${_esc(u.kycData.selfieImg)}"><i class="fa-solid fa-camera me-1"></i> السيلفي</button>` : ''}
                </div>
            `;
        }

        const userReview = uiData.userReview;
        let ratingHtml = '';
        if (userReview) {
            const safeRating = Math.max(0, Math.min(5, Number(userReview.rating) || 0));
            const stars = '<i class="fa-solid fa-star text-warning"></i>'.repeat(safeRating) + 
                          '<i class="fa-regular fa-star text-warning"></i>'.repeat(5 - safeRating);
            const mood = safeRating >= 4 ? 'عميل راضٍ جداً 🟢' : (safeRating <= 2 ? 'عميل غاضب 🔴' : 'عميل محايد 🟡');
            
            ratingHtml = `
            <div class="ud-info-row review-box-warning">
                <span class="ud-info-lbl text-warning"><i class="fa-solid fa-star me-1"></i> تقييم العميل للمتجر</span>
                <span class="ud-info-val text-start">
                    <span class="mb-5 fs-14">${stars}</span>
                    <span class="fs-11 text-muted">${mood} ${(userReview.comment || userReview.text) ? ` - "${_esc(userReview.comment || userReview.text)}"` : ''}</span>
                </span>
            </div>`;
        } else {
            ratingHtml = `
            <div class="ud-info-row review-box-empty">
                <span class="ud-info-lbl text-muted"><i class="fa-regular fa-star me-1"></i> تقييم العميل للمتجر</span>
                <span class="ud-info-val text-muted fs-11">لم يقم بتقييم المتجر بعد</span>
            </div>`;
        }

        const userImg = u.profileImage || u.img;
        const safeUid = _esc(u.id);

        return `
            <!-- 🌟 تبويب 1: نظرة عامة -->
            <div id="tab-overview" class="ud-tab-content active">
                <div class="card mb-15 p-15">
                    <div class="ud-header-flex mb-15">
                        <div class="flex-center-gap">
                            ${userImg ? `<img src="${_esc(userImg)}" class="ud-header-avatar">` : ''}
                            <h3 class="ud-section-title m-0"><i class="fa-solid fa-user-tie text-primary me-1"></i> البيانات الشخصية</h3>
                        </div>
                        <button class="btn btn-ghost btn-compact interactive-scale" data-action="open-user-edit" data-id="${safeUid}">
                            <i class="fa-solid fa-pen me-1"></i> تعديل
                        </button>
                    </div>

                    <div class="ud-info-list">
                        <div class="ud-info-row">
                            <span class="ud-info-lbl"><i class="fa-regular fa-id-badge"></i> الاسم الكامل</span>
                            <span class="ud-info-val ud-copyable interactive-scale" title="انقر للنسخ" data-action="copy-to-clipboard">${_esc(uiData.rawName)}</span>
                        </div>
                        <div class="ud-info-row">
                            <span class="ud-info-lbl"><i class="fa-solid fa-at"></i> اسم المستخدم</span>
                            <span class="ud-info-val font-numeric ud-copyable interactive-scale" dir="ltr" title="انقر للنسخ" data-action="copy-to-clipboard">${u.username ? '@' + _esc(u.username) : '---'}</span>
                        </div>
                        <div class="ud-info-row">
                            <span class="ud-info-lbl"><i class="fa-solid fa-hashtag"></i> كود العميل المختصر (ID)</span>
                            <span class="ud-info-val font-numeric" dir="ltr">${RenderHelpers.formatUserId(u)}</span>
                        </div>
                        <div class="ud-info-row">
                            <span class="ud-info-lbl"><i class="fa-solid fa-database"></i> معرف قاعدة البيانات (UID)</span>
                            <span class="ud-info-val font-numeric ud-copyable interactive-scale" dir="ltr" title="انقر لنسخ المعرف الكامل" data-action="copy-to-clipboard">${_esc(u.uid || u.id)}</span>
                        </div>
                        <div class="ud-info-row">
                            <span class="ud-info-lbl"><i class="fa-solid fa-envelope"></i> البريد الإلكتروني</span>
                            <span class="ud-info-val font-numeric ${u.email ? 'ud-copyable interactive-scale' : 'text-muted'}" dir="ltr" ${u.email ? 'title="انقر للنسخ" data-action="copy-to-clipboard"' : ''}>${u.email ? _esc(u.email) : '----'}</span>
                        </div>
                        <div class="ud-info-row">
                            <span class="ud-info-lbl"><i class="fa-solid fa-phone"></i> رقم الهاتف</span>
                            <span class="ud-info-val font-numeric ${u.phone ? 'ud-copyable interactive-scale' : 'text-muted'}" dir="ltr" ${u.phone ? 'title="انقر للنسخ" data-action="copy-to-clipboard"' : ''}>${u.phone ? _esc(u.phone) : '----'}</span>
                        </div>
                        <div class="ud-info-row">
                            <span class="ud-info-lbl"><i class="fa-solid fa-gem"></i> مستوى العميل</span>
                            <span class="ud-info-val"><i class="fa-solid fa-crown text-gold me-1"></i> ${_esc(uiData.tierName)} ${apiBadgeFull}</span>
                        </div>
                        <div class="ud-info-row">
                            <span class="ud-info-lbl"><i class="fa-solid fa-coins"></i> عملة الحساب</span>
                            <span class="ud-info-val font-numeric">${uiData.safeCurrency}</span>
                        </div>
                        <div class="ud-info-row">
                            <span class="ud-info-lbl"><i class="fa-solid fa-earth-americas"></i> الدولة</span>
                            <span class="ud-info-val">${_esc(u.country || 'غير محدد')}</span>
                        </div>
                        <div class="ud-info-row">
                            <span class="ud-info-lbl"><i class="fa-regular fa-calendar-check"></i> تاريخ التسجيل</span>
                            <span class="ud-info-val font-numeric" dir="ltr">${uiData.joinDate}</span>
                        </div>
                        ${ratingHtml}
                    </div>
                </div>

                <!-- كرت إرسال التنبيه المفصول بمسافة واضحة -->
                <div class="card mb-15 p-15">
                    <h3 class="ud-section-title mb-12"><i class="fa-solid fa-bell text-warning me-1"></i> إرسال تنبيه مخصص للعميل</h3>
                    <textarea id="user-custom-notif" class="form-input ud-textarea mb-12" placeholder="اكتب رسالة التنبيه هنا لتظهر في حساب العميل..."></textarea>
                    <button class="btn btn-primary w-100 interactive-scale" data-action="send-custom-notif" data-id="${safeUid}">
                        <i class="fa-solid fa-paper-plane me-1"></i> إرسال التنبيه
                    </button>
                </div>
            </div>
            
            <!-- 🌟 تبويب 2: المحفظة -->
            <div id="tab-wallet" class="ud-tab-content">
                <div class="ud-balance-card-pro mb-15">
                    <div class="lbl"><i class="fa-solid fa-wallet me-1"></i> الرصيد الحالي بالمحفظة</div>
                    <div class="val font-numeric" dir="ltr">${RenderHelpers.formatMoney(uiData.bal, uiData.safeCurrency, 2)}</div>
                    <div class="bal-actions">
                        <button class="btn btn-success flex-1 interactive-scale" data-action="adjust-balance" data-type="add" data-id="${safeUid}">
                            <i class="fa-solid fa-plus me-1"></i> إيداع رصيد
                        </button>
                        <button class="btn btn-danger flex-1 interactive-scale" data-action="adjust-balance" data-type="deduct" data-id="${safeUid}">
                            <i class="fa-solid fa-minus me-1"></i> خصم رصيد
                        </button>
                    </div>
                </div>

                <div class="card mb-15 p-15">
                    <h3 class="ud-section-title mb-12"><i class="fa-solid fa-chart-pie text-primary me-1"></i> الإحصائيات المالية للعميل</h3>
                    <div class="ud-stats-grid">
                        <div class="ud-info-row ud-stat-box">
                            <span class="ud-info-lbl"><i class="fa-solid fa-sack-dollar text-gold"></i> المشتريات</span>
                            <span class="ud-info-val text-success font-numeric" dir="ltr">${RenderHelpers.formatMoney(uiData.totalSpent, 'USD', 2)}</span>
                        </div>
                        <div class="ud-info-row ud-stat-box">
                            <span class="ud-info-lbl"><i class="fa-solid fa-wallet text-info"></i> الإيداعات</span>
                            <span class="ud-info-val text-info font-numeric" dir="ltr">${RenderHelpers.formatMoney(u.totalDeposit || 0, 'USD', 2)}</span>
                        </div>
                        <div class="ud-info-row ud-stat-box">
                            <span class="ud-info-lbl"><i class="fa-solid fa-boxes-stacked text-warning"></i> الطلبات</span>
                            <span class="ud-info-val font-numeric" dir="ltr">${_enNum(uiData.totalOrdersCount)} طلب</span>
                        </div>
                    </div>
                </div>
                
                <div class="text-center">
                    <button class="btn btn-ghost w-100 text-warning fw-bold btn-audit-warning interactive-scale" data-action="audit-user-wallet" data-id="${safeUid}">
                        <i class="fa-solid fa-scale-balanced me-1"></i> تدقيق ومطابقة السجلات المالية
                    </button>
                    <small class="text-muted d-block mt-5 fs-11">استخدم التدقيق فقط إذا لاحظت اختلافاً بين إيداعات العميل وإحصائياته.</small>
                </div>
            </div>
            
            <!-- 🌟 تبويب 3: الطلبات -->
            <div id="tab-orders" class="ud-tab-content">
                <div class="card mb-15 p-15">
                    <h3 class="ud-section-title mb-12"><i class="fa-solid fa-receipt text-primary me-1"></i> الحركات المالية للعميل</h3>
                    <div class="sub-tabs-container fh-tabs-container mb-15 d-flex gap-2 p-8">
                        <button class="btn btn-compact btn-primary fh-tab flex-1 active interactive-scale" data-target="fh-orders">
                            <i class="fa-solid fa-box-open me-1"></i> المشتريات
                        </button>
                        <button class="btn btn-compact btn-ghost fh-tab flex-1 interactive-scale" data-target="fh-deposits">
                            <i class="fa-solid fa-wallet me-1"></i> الإيداعات
                        </button>
                    </div>
                    <div id="user-history-list" class="user-history-list mb-15 custom-scrollbar fh-scroll-list"></div>
                    <button class="btn btn-ghost btn-compact w-100 interactive-scale" id="btn-load-more-user-history" data-action="load-more-user-history" data-id="${safeUid}">
                        <i class="fa-solid fa-angle-down me-1"></i> عرض المزيد من السجلات
                    </button>
                </div>
            </div>
            
            <!-- 🌟 تبويب 4: الأمان والحالة -->
            <div id="tab-security" class="ud-tab-content">
                <div class="card mb-15 p-15">
                    <h3 class="ud-section-title text-danger mb-15"><i class="fa-solid fa-user-shield me-1"></i> حالة الحساب والأمان</h3>
                    
                    <div class="ud-info-list mb-15">
                        <div class="ud-info-row">
                            <span class="ud-info-lbl"><i class="fa-solid fa-shield-halved"></i> حالة الحساب</span>
                            <span class="ud-info-val"><span class="v-stat-chip ${sm.c}"><i class="fa-solid fa-${sm.i} me-1"></i> ${sm.t}</span></span>
                        </div>
                        <div class="ud-info-row">
                            <span class="ud-info-lbl"><i class="fa-solid fa-network-wired"></i> عنوان IP الأخير</span>
                            <span class="ud-info-val font-numeric ud-copyable interactive-scale" dir="ltr" data-action="copy-to-clipboard">${u.lastIp || u.ipAddress || u.ip ? _esc(u.lastIp || u.ipAddress || u.ip) : 'غير متوفر'}</span>
                        </div>
                    </div>

                    <button class="btn btn-ghost w-100 text-primary btn-password-reset interactive-scale mb-15" data-action="send-password-reset" data-id="${safeUid}">
                        <i class="fa-solid fa-envelope-open-text me-1"></i> إرسال رابط استعادة كلمة المرور لبريد العميل
                    </button>

                    <!-- 📱 قسم 1: الأجهزة المسجلة الخاصة بهذا العميل فقط -->
                    <div class="card device-prints-box mb-15 p-12 bg-body">
                        <div class="flex-between mb-8">
                            <span class="fs-12 fw-bold text-warning"><i class="fa-solid fa-mobile-screen me-1"></i> بصمات أجهزة العميل المسجلة:</span>
                            <span class="badge-qty font-numeric">${Array.isArray(u.devicePrints) ? u.devicePrints.length : 0} أجهزة</span>
                        </div>
                        ${Array.isArray(u.devicePrints) && u.devicePrints.length > 0 ? 
                            `<div class="flex-wrap-gap-2">
                                ${u.devicePrints.map(dp => `<span class="v-stat-chip badge-device-print font-numeric fs-11" dir="ltr"><i class="fa-solid fa-fingerprint me-1"></i> ${_esc(String(dp).substring(0,8))}...</span>`).join('')}
                            </div>` 
                            : `<div class="text-muted fs-11">لم تسجل أي بصمة جهاز لهذا العميل بعد.</div>`
                        }
                    </div>

                    <!-- 🚨 قسم 2: رادار الحسابات المشتركة المستقل بالكامل -->
                    <div id="ud-radar-box-target" class="mb-15">
                        ${UsersTemplates.radarBoxContent(uiData.relatedAccounts)}
                    </div>

                    <!-- أزرار الإجراءات الإدارية الموحدة -->
                    <h4 class="fs-12 fw-bold text-muted mb-10">إجراءات الحظر والتقييد الإداري:</h4>
                    <div class="ud-actions-col">
                        <button class="btn btn-warning interactive-scale" data-action="restrict-user" data-id="${safeUid}">
                            <i class="fa-solid fa-lock me-1"></i> ${u.isRestricted ? 'رفع التقييد عن الحساب' : 'تقييد الحساب (منع الشراء)'}
                        </button>
                        <button class="btn btn-danger interactive-scale" data-action="ban-user" data-id="${safeUid}">
                            <i class="fa-solid fa-bolt me-1"></i> ${u.isBanned ? 'إلغاء حظر الحساب' : 'إعدام الحساب والأجهزة سحابياً'}
                        </button>
                        <button class="btn btn-ghost text-danger interactive-scale" data-action="ban-user-ip" data-id="${safeUid}" data-ip="${_esc(u.lastIp || u.ipAddress || u.ip || '')}">
                            <i class="fa-solid fa-network-wired me-1"></i> ${u.isIpBanned ? 'رفع حظر الـ IP' : 'حظر الـ IP (منع الشبكة)'}
                        </button>
                        <div class="ud-divider-dashed"></div>
                        <button class="btn btn-danger interactive-scale" data-action="delete-user" data-id="${safeUid}">
                            <i class="fa-solid fa-trash me-1"></i> حذف بيانات الحساب نهائياً
                        </button>
                    </div>
                </div>

                <!-- كرت التوثيق KYC -->
                <div class="card mb-15 p-15">
                    <div class="flex-between mb-10">
                        <h3 class="ud-section-title text-success m-0"><i class="fa-solid fa-passport me-1"></i> بيانات توثيق الهوية (KYC)</h3>
                        <span class="v-stat-chip ${kycBadgeObj.c}"><i class="fa-solid fa-${kycBadgeObj.i} me-1"></i> ${kycBadgeObj.t}</span>
                    </div>
                    ${kycDocsHtml}

                    ${(u.kycStatus === 'approved' || u.kycStatus === 'pending' || kycDocsHtml !== '') ? `
                    <div class="mt-15 pt-15 border-top-dashed">
                        <button class="btn btn-danger w-100 interactive-scale" data-action="revoke-kyc" data-id="${safeUid}">
                            <i class="fa-solid fa-triangle-exclamation me-1"></i> إبطال التوثيق وحذف المستندات
                        </button>
                    </div>` : ''}
                </div>
            </div>

            ${u.isApiMerchant === true && typeof DeveloperTemplates !== 'undefined' && DeveloperTemplates.developerTabContent 
                ? DeveloperTemplates.developerTabContent(u) : ''}
        `;
    },

    tierCard: (t, userCount, tStats = { profit: 0, revenue: 0 }) => {
        const isApiTier = t.type === 'api';
        const tierTypeBadge = isApiTier
            ? `<span class="tc-badge chip-warning ms-1"><i class="fa-solid fa-code"></i> مسار API</span>`
            : `<span class="tc-badge chip-info ms-1"><i class="fa-solid fa-shop"></i> تجزئة (Retail)</span>`;

        return `
        <div id="tier-card-${_esc(t.id)}" class="tier-card interactive-scale ${t.autoAdvance ? 'auto-on' : 'auto-off'}" data-tier-id="${_esc(t.id)}">
            <div class="tc-head">
                <div class="tc-info">
                    <div class="tc-icon-box"><i class="${_getIcon(t.icon, 'fa-user')}"></i></div>
                    <div class="tc-name">
                        <h2>${_esc(t.name || t.id)}</h2>
                        <div class="flex-wrap-gap-2 mt-5">
                            ${t.isDefault ? '<span class="tc-badge">افتراضي</span>' : ''}
                            ${tierTypeBadge}
                        </div>
                    </div>
                </div>
                <div class="flex-center-gap">
                    ${!t.isDefault ? `<button class="action-mini btn-del-mini interactive-scale" data-action="delete-tier" data-id="${_esc(t.id)}" title="حذف المستوى"><i class="fa-solid fa-trash"></i></button>` : ''}
                    <button class="action-mini btn-edit-mini interactive-scale" data-action="open-tier-edit" data-id="${_esc(t.id)}" title="تعديل المستوى"><i class="fa-solid fa-pen"></i></button>
                </div>
            </div>
            <div class="tc-body">
                <div class="tc-cell"><span class="cell-lbl"><i class="fa-solid fa-sack-dollar text-gold me-1"></i> صافي ربح المستوى</span><span class="cell-val num-en text-gold fw-bold font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(tStats.profit, 'USD', 2)}</span></div>
                <div class="tc-cell"><span class="cell-lbl"><i class="fa-solid fa-chart-line text-success me-1"></i> إجمالي الإيرادات</span><span class="cell-val num-en text-success fw-bold font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(tStats.revenue, 'USD', 2)}</span></div>
                <div class="tc-cell"><span class="cell-lbl">نسبة الربح المطبقة</span><span class="cell-val num-en font-numeric" dir="ltr" lang="en">%${_enNum(t.profitPercent, 2)}</span></div>
                <div class="tc-cell"><span class="cell-lbl">القاع</span><span class="cell-val">${t.minProfitUsd ? `<span class="num-en tc-gold-txt font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(t.minProfitUsd, 'USD', 2)}</span>` : '-'}</span></div>
                
                <!-- 🚀 بوابات ذكية: إظهار مجاناً و ∞ للمستوى الافتراضي -->
                <div class="tc-cell"><span class="cell-lbl">شرط دخول المستوى</span><span class="cell-val num-en font-numeric" dir="ltr" lang="en">${(t.isDefault || t.id === 'TIER_DEFAULT') ? '<span class="text-success fw-bold">مجاناً</span>' : RenderHelpers.formatMoney(t.threshold, 'USD', 2)}</span></div>
                <div class="tc-cell"><span class="cell-lbl">مهلة تحقيق الشرط</span><span class="cell-val">${(t.isDefault || t.id === 'TIER_DEFAULT' || t.type === 'api') ? '∞' : (Number(t.durationDays) > 0 ? `<span class="num-en inline-val font-numeric" dir="ltr" lang="en">${_enNum(t.durationDays)}&nbsp;day</span>` : '∞')}</span></div>
                
                <div class="toggle-box tc-toggle-row">
                    <span class="toggle-lbl">الانتقال التلقائي</span>
                    ${isApiTier ? `
                        <span class="v-stat-chip chip-warning fs-10"><i class="fa-solid fa-lock me-1"></i> مجمد إجبارياً (API)</span>
                    ` : `
                        <label class="switch interactive-scale">
                            <input type="checkbox" ${t.autoAdvance !== false ? 'checked' : ''} data-action="toggle-tier-auto" data-id="${_esc(t.id)}">
                            <span class="slider"></span>
                        </label>
                    `}
                </div>
            </div>
            <div class="tc-foot">
                <div class="count-badge">
                    <i class="fa-solid fa-users"></i>
                    <span class="num-en count-val font-numeric" dir="ltr" lang="en">${_enNum(userCount)}</span>
                    <span>عميل</span>
                </div>
                <button class="btn btn-ghost btn-compact tier-users-toggle interactive-scale" data-action="open-tier-users" data-id="${_esc(t.id)}">
                    <i class="fa-solid fa-users me-1"></i> إدارة العملاء
                </button>
            </div>
        </div>`;
    },
        
    tierUsersSectionBody: () => `
        <div class="tier-users-header">
            <button class="btn btn-ghost btn-compact interactive-scale" data-action="back-to-tiers"><i class="fa-solid fa-arrow-right me-1"></i> العودة للمستويات</button>
            <h2 id="tier-users-title">عملاء المستوى</h2>
        </div>
        <div class="tier-info-card">
            <div class="tic-icon-box"><i class="fa-solid fa-user"></i></div>
            <div class="tic-info"><h3 id="tier-name">المستوى</h3><div class="tier-stats"></div></div>
        </div>
        <div id="tier-users-container" class="tier-users-table"></div>
    `,
    
    tierInfoStats: (tier, tStats = { profit: 0, revenue: 0 }) => `
        <span class="tier-stat-item interactive-scale"><strong class="stat-lbl-group"><i class="fa-solid fa-sack-dollar stat-icon text-gold"></i> صافي الأرباح:</strong> <span class="num-en text-gold fw-bold font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(tStats.profit, 'USD', 2)}</span></span>
        <span class="tier-stat-item interactive-scale"><strong class="stat-lbl-group"><i class="fa-solid fa-chart-line stat-icon text-success"></i> نسبة الربح:</strong> <span class="num-en font-numeric" dir="ltr" lang="en">%${_enNum(tier.profitPercent || 0, 2)}</span></span>
        <span class="tier-stat-item interactive-scale"><strong class="stat-lbl-group"><i class="fa-solid fa-bullseye stat-icon"></i> الشرط المالي:</strong> <span class="num-en font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(tier.threshold || 0, 'USD', 2)}</span></span>
    `,
    
    tierUsersSearchBox: () => `
        <div class="filter-pro-container mb-15 tier-search-box-wrapper">
            <div class="filter-input-group w-100 mb-0">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="tier-users-search-input" class="form-input" placeholder="بحث سريع أو سحابي عن عميل في هذا المستوى..." data-action="filter-tier-users" data-oninput="filter-tier-users">
            </div>
        </div>
    `,
    
    tierUserCard: (u, spent, target, pct, isTopTier, nextTierName, tier) => {
        const safeName = _esc(RenderHelpers._getTxName(u));
        const fallbackChar = safeName && safeName !== '---' ? safeName.charAt(0) : '?';
        const exactStatus = u.isBanned ? 'banned' : (u.isRestricted ? 'restricted' : 'active');
        const safePct = Math.max(0, Math.min(100, Number(pct) || 0));

        const userImg = u.profileImage || u.img;
        const avatarHtml = `
            <div class="tc-icon-box">
                ${userImg ? `<img src="${_esc(userImg)}" class="tuc-avatar-img">` : fallbackChar}
                <div class="status-indicator-dot status-${exactStatus}"></div>
            </div>`;

        return `
        <div id="tier-user-${_esc(u.id)}" class="tier-user-card pro-interactive-card interactive-scale" data-id="${_esc(u.id)}" data-action="view-user">
            <div class="tuc-main-header">
                <div class="tuc-head">
                    ${avatarHtml}
                    <div class="tuc-info">
                        <h4>${safeName}</h4>
                        <div class="uid-capsule uid-capsule-flat font-numeric" dir="ltr">
                            ${RenderHelpers.formatUserId(u)}
                        </div>
                    </div>
                </div>
                <div class="tuc-change-capsule interactive-scale" data-action="change-tier" data-id="${_esc(u.id)}" title="تغيير المستوى">
                    تغيير المستوى
                </div>
            </div>

            <div class="tuc-content-zone">
                ${!isTopTier ? `
                    <div class="tuc-progress-wrapper">
                        <div class="tuc-progress-info">
                            <div class="prog-item"><span class="p-lbl">المدفوع</span><span class="p-val num-en font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(spent, 'USD', 2)}</span></div>
                            <div class="prog-item"><span class="p-lbl">الهدف (${_esc(nextTierName || 'التالي')})</span><span class="p-val num-en text-info font-numeric" dir="ltr" lang="en">${RenderHelpers.formatMoney(target, 'USD', 2)}</span></div>
                        </div>
                        <div class="tuc-progress-bar-container">
                            <div class="tuc-bar-bg"><div class="tuc-bar-fill" style="width: ${safePct}%;"></div></div>
                            <span class="tuc-pct-badge num-en font-numeric" dir="ltr" lang="en">${safePct}%</span>
                        </div>
                    </div>
                ` : `
                    <div class="tuc-status-box status-achieved">
                        <div class="status-label-main"><i class="fa-solid fa-trophy me-1"></i> محقق للشرط المالي</div>
                    </div>
                `}
            </div>
        </div>`;
    },
    
    kycSearchBox: () => `
        <div class="filter-pro-container mb-20 kyc-search-wrapper">
            <div class="filter-input-group w-100 mb-0">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" id="kyc-search-input" class="form-input" placeholder="البحث برقم العميل، الاسم، أو رقم الهوية..." data-action="filter-kyc-requests" data-oninput="filter-kyc-requests">
            </div>
        </div>
    `,

    kycPendingHeader: (count) => `
        <div class="kyc-section-header">
            <h3><i class="fa-solid fa-file-shield text-warning me-1"></i> طلبات بانتظار المراجعة</h3>
            <span class="kyc-count-capsule font-numeric" dir="ltr">${count}</span>
        </div>
    `,

    kycRequestCard: function(user) {
        const safeName = _esc(RenderHelpers._getTxName(user));
        const fallbackChar = safeName && safeName !== '---' ? safeName.charAt(0) : '?';
        const exactStatus = user.isBanned ? 'banned' : (user.isRestricted ? 'restricted' : 'active');
        
        let tierName = 'عادي (افتراضي)'; 
        let tierIcon = 'fa-solid fa-user'; 
        
        if (AdminData && AdminData.data && AdminData.data.tiersMap) {
            const tierObj = AdminData.data.tiersMap[user.tierId];
            if (tierObj) { 
                tierName = _esc(tierObj.nameAr || tierObj.name); 
                tierIcon = _getIcon(tierObj.icon, 'fa-user'); 
            }
        }
        
        const kycUserImg = user.profileImage || user.img;
        const avatarInner = kycUserImg 
            ? `<img src="${_esc(kycUserImg)}" class="tuc-avatar-img zoomable-img interactive-scale" data-action="open-img-viewer" data-src="${_esc(kycUserImg)}">` 
            : fallbackChar;

        const avatarHtml = `
            <div class="tc-icon-box">
                ${avatarInner}
                <div class="status-indicator-dot status-${exactStatus}"></div>
            </div>
        `;

        const kyc = user.kycData || {};
        const kycFullName = kyc.fullName || user.fullName || user.name || 'لم يقم بإدخال الاسم';
        const kycIdNumber = kyc.idNumber || 'لم يقم بإدخال الرقم';

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
                    <div class="kyc-img-box interactive-scale" data-action="open-img-viewer" data-src="${_esc(doc.url)}">
                        <img src="${_esc(doc.url)}">
                        <span>${_esc(doc.label)}</span>
                    </div>`;
            });
            docsHtml += `</div>`;
        } else {
            docsHtml = `<div class="kyc-empty-docs"><i class="fa-solid fa-folder-open me-1"></i> لا توجد مرفقات</div>`;
        }

        return `
        <div class="kyc-request-card interactive-scale" id="kyc-req-${_esc(user.id)}">
            <div class="kyc-req-header clickable-header" data-action="view-user" data-id="${_esc(user.id)}" title="فتح ملف العميل الشامل">
                ${avatarHtml}
                <div class="kyc-req-user-info">
                    <h4>${safeName}</h4>
                    <div class="flex-align-center gap-2 mt-5">
                        <div class="uid-capsule m-0 uid-capsule-flat font-numeric" dir="ltr">
                            ${RenderHelpers.formatUserId(user)}
                        </div>
                        <span class="fs-11 fw-bold text-gold kyc-tier-badge">
                            <i class="${tierIcon} me-1"></i> ${tierName}
                        </span>
                    </div>
                </div>
                <div class="kyc-req-status-badge">
                    <i class="fa-solid fa-clock-rotate-left me-1"></i> قيد المراجعة
                </div>
            </div>

            <div class="kyc-req-body">
                <div class="kyc-submitted-data">
                    <div class="kyc-data-row">
                        <span class="kyc-data-lbl"><i class="fa-regular fa-id-card"></i> الاسم في الهوية:</span>
                        <span class="kyc-data-val">${_esc(kycFullName)}</span>
                    </div>
                    <div class="kyc-data-row">
                        <span class="kyc-data-lbl"><i class="fa-solid fa-passport"></i> رقم الهوية/الجواز:</span>
                        <span class="kyc-data-val num-en font-numeric" dir="ltr">${_esc(kycIdNumber)}</span>
                    </div>
                </div>

                <h5 class="kyc-section-title mt-10">المستندات المرفقة:</h5>
                ${docsHtml}
                
                ${kyc.notes ? `
                <div class="kyc-notes-box mt-10">
                    <div class="kyc-notes-lbl"><i class="fa-solid fa-comment-dots me-1"></i> ملاحظات العميل:</div>
                    <p class="kyc-notes-text">${_esc(kyc.notes)}</p>
                </div>
                ` : ''}
            </div>

            <div class="kyc-req-footer">
                <button class="btn btn-kyc-reject interactive-scale" data-action="handle-kyc" data-id="${_esc(user.id)}" data-decision="reject">
                    <i class="fa-solid fa-times-circle me-1"></i> رفض الطلب
                </button>
                <button class="btn btn-kyc-accept interactive-scale" data-action="handle-kyc" data-id="${_esc(user.id)}" data-decision="approve">
                    <i class="fa-solid fa-check-circle me-1"></i> قبول وتوثيق
                </button>
            </div>
        </div>`;
    },

    kycDashboard: function(config, tiers) {
        const mode = config.mode || 'off'; 
        const isSpec = (mode === 'specific' || mode === 'spec');
        
        const settings = AdminData.data.settings || {};
        const securityPolicy = settings.securityPolicy || { forceBiometrics: false, force2FA: false };
        
        let tiersHtml = `
        <div id="kyc-tiers-selection" class="mt-15 ${!isSpec ? 'hide-element' : ''}">
            <h6 class="mb-10 fs-13 fw-bold text-main">تحديد المستويات المستهدفة بالتوثيق:</h6>
            <div class="tiers-selection-list d-flex flex-column gap-2">
                 ${tiers.map(t => {
                    const isTargeted = (config.targetedTiers || []).map(id => String(id)).includes(String(t.id));
                    const safeIcon = _getIcon(t.icon, 'fa-medal');
                    return `
                    <div class="tier-kyc-item interactive-scale">
                        <div class="kyc-policy-content">
                            <i class="${safeIcon} kyc-policy-icon text-gold"></i>
                            <span class="fw-bold text-main fs-13">${_esc(t.nameAr || t.name)}</span>
                        </div>
                        <label class="switch interactive-scale">
                            <input type="checkbox" data-action="toggle-kyc-tier" data-id="${_esc(t.id)}" ${isTargeted ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>`;
                }).join('')}
            </div>
        </div>`;

        return `
        <div class="kyc-dashboard-card mb-15 border-success-30">
            <div class="kyc-master-switch-box">
                <h5 class="fw-bold text-main fs-14 mb-15"><i class="fa-solid fa-id-card text-primary me-1"></i> وضع توثيق الهوية (KYC) الحالي:</h5>
                <div class="kyc-mode-grid">
                    <div class="kyc-mode-btn off-mode interactive-scale ${mode === 'off' ? 'active' : ''}" data-action="update-kyc-mode" data-mode="off">
                        <i class="fa-solid fa-power-off"></i> إيقاف التوثيق
                    </div>
                    <div class="kyc-mode-btn all-mode interactive-scale ${mode === 'all' ? 'active' : ''}" data-action="update-kyc-mode" data-mode="all">
                        <i class="fa-solid fa-globe"></i> فرض على الجميع
                    </div>
                    <div class="kyc-mode-btn spec-mode interactive-scale ${isSpec ? 'active' : ''}" data-action="update-kyc-mode" data-mode="specific">
                        <i class="fa-solid fa-list-check"></i> مستويات محددة
                    </div>
                </div>
            </div>
            ${tiersHtml}
        </div>
        
        <div class="kyc-dashboard-card mb-15 border-success-30">
            <div class="kyc-master-switch-box mb-0">
                <h5 class="fw-bold text-success fs-14 mb-5"><i class="fa-solid fa-fingerprint me-1"></i> سياسات الأمان الإلزامية للمتجر</h5>
                <p class="text-muted fs-12 mb-15">تفعيل هذه الخيارات سيمنع العميل من الشراء أو الإيداع حتى يقوم بتفعيلها في جهازه.</p>
                
                <div class="tier-kyc-item mb-10 bg-body interactive-scale">
                    <div class="kyc-policy-content">
                        <i class="fa-solid fa-fingerprint kyc-policy-icon text-primary"></i>
                        <div class="flex-1">
                            <div class="fw-bold text-main fs-13 mb-5">إجبار العملاء على تفعيل البصمة الحيوية</div>
                            <div class="fs-11 text-muted">تقييد عمليات الشراء لمن لم يفعل خيار البصمة</div>
                        </div>
                    </div>
                    <label class="switch interactive-scale">
                        <input type="checkbox" id="policy-force-bio" ${securityPolicy.forceBiometrics ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
                
                <div class="tier-kyc-item mb-0 bg-body interactive-scale">
                    <div class="kyc-policy-content">
                        <i class="fa-solid fa-shield-halved kyc-policy-icon text-warning"></i>
                        <div class="flex-1">
                            <div class="fw-bold text-main fs-13 mb-5">إجبار العملاء على المصادقة الثنائية (2FA)</div>
                            <div class="fs-11 text-muted">تقييد عمليات الشراء لمن لم يفعل المصادقة الثنائية</div>
                        </div>
                    </div>
                    <label class="switch interactive-scale">
                        <input type="checkbox" id="policy-force-2fa" ${securityPolicy.force2FA ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        </div>

        <div class="kyc-save-btn-wrap">
            <button class="btn btn-primary w-100 fw-bold interactive-scale" data-action="save-kyc">
                <i class="fa-solid fa-floppy-disk me-1"></i> حفظ إعدادات الأمان والتوثيق
            </button>
        </div>`; 
    },

    tierSelectionModal: (u, tiers) => {
        const safeName = _esc(u.fullName || u.name || u.username || 'مستخدم');
        const currentTier = AdminData.data.tiersMap?.[u.tierId] || tiers.find(t => String(t.id) === String(u.tierId));
        const currentTierName = currentTier ? _esc(currentTier.name) : 'غير محدد';
        
        const isCurrentApi = currentTier && currentTier.type === 'api';
        const overrideAttributes = isCurrentApi ? 'checked disabled' : (u.manualTierOverride ? 'checked' : '');

        const listHtml = tiers.map(tier => {
            const isCurrent = String(tier.id) === String(u.tierId);
            return UsersTemplates.tierOptionItem(tier, isCurrent, _esc(tier.name || 'مستوى'), _getIcon(tier.icon, 'fa-user'));
        }).join('');

        return `
        <div class="modal-content tier-modal-content">
            <div class="modal-close-btn interactive-scale" data-action="close-tier-selection"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title mb-15"><i class="fa-solid fa-ranking-star me-1"></i> اختيار المستوى الجديد</h2>
            <div class="tsm-info-box">
                <div class="tsm-info-row"><i class="fa-solid fa-user text-info me-1"></i><strong>العميل:</strong> <span>${safeName}</span></div>
                <div class="tsm-info-row"><i class="fa-solid fa-crown text-gold me-1"></i><strong>المستوى الحالي:</strong> <span>${currentTierName}</span></div>
            </div>
            
            <div id="tier-selection-list" class="tsm-list-container">${listHtml}</div>
            
            <div class="tsm-override-box ${isCurrentApi ? 'disabled' : ''}" id="tier-override-container">
                <label class="flex-align-center gap-2 m-0 ${isCurrentApi ? '' : 'interactive-scale'}">
                    <input type="checkbox" id="tier-manual-override" class="tree-checkbox" ${overrideAttributes}>
                    <span class="fs-12 fw-bold text-main">تثبيت مستوى العميل يدوياً (منع الترقية والهبوط الآلي)</span>
                </label>
            </div>

            <div class="modal-actions-row mt-15 pt-15 border-top-solid">
                <button type="button" class="btn btn-primary interactive-scale" data-action="confirm-tier-selection">تأكيد</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-tier-selection">إلغاء</button>
            </div>
        </div>`;
    },

    tierOptionItem: (tier, isCurrent, safeName, safeIcon) => {
        const typeLabel = tier.type === 'api' 
            ? '<span class="v-stat-chip chip-warning fs-10 ms-1"><i class="fa-solid fa-code"></i> مسار API</span>' 
            : '';

        return `
        <div class="tier-option interactive-scale ${isCurrent ? 'selected current' : ''}" data-tier-id="${_esc(tier.id)}" data-action="select-tier-option">
            <div class="tier-option-inner">
                <div class="tc-icon-box-sm"><i class="${safeIcon}"></i></div>
                <div class="flex-1">
                    <div class="tsm-tier-name">${safeName} ${typeLabel}</div>
                    <div class="tsm-tier-meta font-numeric" dir="ltr" lang="en">نسبة الربح: %${_enNum(tier.profitPercent||0, 2)} | شرط: ${RenderHelpers.formatMoney(tier.threshold||0, 'USD', 2)}</div>
                </div>
                <i class="fa-solid fa-check tsm-check-icon"></i>
            </div>
        </div>`;
    },

    userEditForm: (u) => `
        <div class="form-group">
            <label class="form-label">الاسم الكامل</label>
            <input type="text" id="user-edit-name" class="form-input" value="${_esc(u.fullName || u.name || '')}">
        </div>
        <div class="form-group">
            <label class="form-label">البريد الإلكتروني</label>
            <input type="email" id="user-edit-email" class="form-input num-en font-numeric" dir="ltr" lang="en" value="${_esc(u.email || '')}">
        </div>
        <div class="flex-wrap-gap-2">
            <div class="form-group flex-1">
                <label class="form-label">رقم الهاتف</label>
                <input type="text" id="user-edit-phone" class="form-input num-en font-numeric" dir="ltr" lang="en" value="${_esc(u.phone || '')}">
            </div>
            <div class="form-group flex-1">
                <label class="form-label">الدولة</label>
                <input type="text" id="user-edit-country" class="form-input" value="${_esc(u.country || '')}">
            </div>
        </div>
        
        <div class="modal-actions-row mt-15 pt-15 border-top-solid">
            <button type="button" class="btn btn-primary interactive-scale" data-action="save-user-edits" data-id="${_esc(u.id)}">حفظ</button>
            <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-user-edit">إلغاء</button>
        </div>
    `,

    userDetailModal: (u, uiData) => `
        <div class="modal-content modal-lg prod-modal-lg ud-modal-pro">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title" id="ud-title"><i class="fa-solid fa-address-card me-1"></i> ملف العميل الشامل</h2>

            <div class="ud-modal-tabs mb-15">
                <button type="button" class="ud-tab-btn active interactive-scale" id="tab-btn-overview" data-action="switch-user-tab" data-tab="overview">
                    <i class="fa-solid fa-id-card"></i>
                    <span>نظرة عامة</span>
                </button>
                <button type="button" class="ud-tab-btn interactive-scale" id="tab-btn-wallet" data-action="switch-user-tab" data-tab="wallet">
                    <i class="fa-solid fa-wallet"></i>
                    <span>المحفظة</span>
                </button>
                <button type="button" class="ud-tab-btn interactive-scale" id="tab-btn-orders" data-action="switch-user-tab" data-tab="orders">
                    <i class="fa-solid fa-box-open"></i>
                    <span>الطلبات</span>
                </button>
                <button type="button" class="ud-tab-btn interactive-scale" id="tab-btn-security" data-action="switch-user-tab" data-tab="security">
                    <i class="fa-solid fa-shield-halved"></i>
                    <span>الأمان</span>
                </button>
                ${ u.isApiMerchant === true ? `
                <button type="button" class="ud-tab-btn interactive-scale" id="tab-btn-developer" data-action="switch-user-tab" data-tab="developer">
                    <i class="fa-solid fa-code"></i>
                    <span>المطورين</span>
                </button>` : '' }
            </div>
            
            <div id="ud-body" class="ud-modal-body">
                ${UsersTemplates.userDetailBody(u, uiData)}
            </div>
        </div>
    `,

    userEditModal: (u) => `
        <div class="modal-content modal-sm">
            <div class="modal-close-btn interactive-scale" data-action="close-user-edit">
                <i class="fa-solid fa-xmark"></i>
            </div>
            <h2 class="main-title"><i class="fa-solid fa-user-pen me-1"></i> تعديل بيانات العميل</h2>
            <div id="user-edit-form-container">
                ${UsersTemplates.userEditForm(u)}
            </div>
        </div>
    `,

    tierEditModal: (tier = {}) => {
        const isApi = tier.type === 'api';
        const isDefaultTier = Boolean(tier.id === 'TIER_DEFAULT' || tier.isDefault);
        return `
        <div class="modal-content modal-md">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title"><i class="fa-solid fa-crown me-1"></i> إعدادات المستوى</h2>
            
            <input type="hidden" id="t-id" value="">
            
            <div class="form-group">
                <label class="form-label">اسم المستوى</label>
                <input type="text" id="t-name" class="form-input" placeholder="مثال: عضوية كبار التجار">
            </div>

            <div class="form-group">
                <label class="form-label text-warning"><i class="fa-solid fa-route me-1"></i> مسار المستوى (نظام التسعير)</label>
                <select id="t-type" class="form-input select-shared" ${isDefaultTier ? 'disabled title="المستوى الافتراضي مخصص لمسار التجزئة دائماً"' : ''}>
                    <option value="retail" ${!isApi || isDefaultTier ? 'selected' : ''}>مسار التجزئة (أفراد - يدعم الكوبونات والترقية الآلية)</option>
                    <option value="api" ${isApi && !isDefaultTier ? 'selected' : ''}>مسار الجملة (تجار API - مجمد إجبارياً بدون كوبونات)</option>
                </select>
            </div>

            <div class="form-group">
                <label class="form-label">أيقونة الشارة</label>
                <div class="badge-selector custom-scrollbar">
                    <div class="badge-opt interactive-scale active" data-action="select-tier-badge" data-val="fa-user" title="مستخدم عادي"><i class="fa-solid fa-user"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-user-tie" title="مستخدم رسمي"><i class="fa-solid fa-user-tie"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-user-astronaut" title="مستخدم فضاء"><i class="fa-solid fa-user-astronaut"></i></div>
                    
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-crown" title="تاج"><i class="fa-solid fa-crown"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-gem" title="ألماس"><i class="fa-solid fa-gem"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-medal" title="ميدالية"><i class="fa-solid fa-medal"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-trophy" title="كأس"><i class="fa-solid fa-trophy"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-star" title="نجمة"><i class="fa-solid fa-star"></i></div>
                    
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-bolt" title="طاقة"><i class="fa-solid fa-bolt"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-fire" title="نار"><i class="fa-solid fa-fire"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-rocket" title="صاروخ"><i class="fa-solid fa-rocket"></i></div>
                    
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-briefcase" title="حقيبة أعمال"><i class="fa-solid fa-briefcase"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-handshake" title="شريك"><i class="fa-solid fa-handshake"></i></div>
                    
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-gamepad" title="جيمر"><i class="fa-solid fa-gamepad"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-dice" title="نرد"><i class="fa-solid fa-dice"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-ghost" title="شبح"><i class="fa-solid fa-ghost"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-skull" title="جمجمة"><i class="fa-solid fa-skull"></i></div>
                    
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-code" title="مطور / API"><i class="fa-solid fa-code"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-server" title="سيرفر"><i class="fa-solid fa-server"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-network-wired" title="ربط شبكي"><i class="fa-solid fa-network-wired"></i></div>
                    <div class="badge-opt interactive-scale" data-action="select-tier-badge" data-val="fa-microchip" title="شريحة أتمتة"><i class="fa-solid fa-microchip"></i></div>
                </div>
                <input type="hidden" id="t-icon" value="fa-user">
            </div>

            <div class="tier-compact-grid">
                <div class="compact-input-group">
                    <label for="t-profit">نسبة الربح %</label>
                    <input type="text" inputmode="decimal" id="t-profit" class="font-numeric" placeholder="5.0">
                </div>
                <div class="compact-input-group">
                    <label for="t-min">القاع ($)</label>
                    <input type="text" inputmode="decimal" id="t-min" class="font-numeric" placeholder="0.0">
                </div>
                ${!isDefaultTier ? `
                <div class="compact-input-group">
                    <label for="t-cond">شرط الدخول ($)</label>
                    <input type="text" inputmode="numeric" pattern="[0-9]*" id="t-cond" class="font-numeric" placeholder="100">
                </div>
                <div class="compact-input-group">
                    <label for="t-dur">مهلة الجمع (0 = ∞)</label>
                    <input type="text" inputmode="numeric" pattern="[0-9]*" id="t-dur" class="font-numeric" placeholder="30 أو 0 لـ ∞">
                </div>
                ` : `
                <input type="hidden" id="t-cond" value="0">
                <input type="hidden" id="t-dur" value="0">
                `}
            </div>

            <div class="alert-info mt-15 mb-0 fs-11">
                <i class="fa-solid fa-lightbulb text-warning me-1"></i>
                ${(tier.id === 'TIER_DEFAULT' || tier.isDefault)
                    ? `<span>هذا هو <b>المستوى الافتراضي الأساسي</b> (شرط الانضمام <b>0$</b> دائماً). يمكنك تعديل نسبة ربحه واسمه وأيقونته بحرية.</span>`
                    : `<span><b>قاعدة الترقية والتسعير:</b> يترقى العميل تلقائياً حسب تصاعد <b>(شرط الترقية $)</b>. كلما زاد شرط المبلغ لمستوى أعلى، يُنصح بتقليل <b>(نسبة الربح %)</b> ليحصل العميل المترقي على سعر أرخص.</span>`
                }
                <input type="checkbox" id="t-default" class="hide-element" ${(tier.id === 'TIER_DEFAULT' || tier.isDefault) ? 'checked' : ''}>
            </div>
            
            <div class="modal-actions-row mt-15 pt-15 border-top-solid">
                <button type="button" class="btn btn-primary interactive-scale" data-action="save-tier">
                    <i class="fa-solid fa-floppy-disk me-1"></i> حفظ المستوى
                </button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">
                    إلغاء
                </button>
            </div>
        </div>
        `;
    }
};
