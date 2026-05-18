// ============================================================================
// 📢 قوالب التسويق والعروض (modules/marketing/marketingTemplates.js)
// 🎯 الوظيفة: توليد الـ HTML بنظام المجموعات العمودية لضمان ثبات الأزرار
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;
const _fmtDate = Utils.formatDate;

export const MarketingTemplates = {
    emptyCoupons: () => `<div class="empty-state"><i class="fa-solid fa-ticket-simple"></i><p>لا يوجد أي كوبونات حالياً. اضغط على إنشاء للبدء!</p></div>`,

    couponCard: (coupon, uiData) => {
        const isPercent = coupon.type === 'percentage';
        const isExpired = coupon.expiryDate && Date.now() > coupon.expiryDate;
        const isMaxedOut = coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses;
        let exactStatus = 'active', statusHtml = '';

        if (!coupon.isActive) { exactStatus = 'inactive'; statusHtml = '<span class="promo-badge b-red"><i class="fa-solid fa-ban"></i> متوقف</span>'; } 
        else if (isExpired) { exactStatus = 'expired'; statusHtml = '<span class="promo-badge b-warning"><i class="fa-solid fa-clock"></i> منتهي</span>'; } 
        else if (isMaxedOut) { exactStatus = 'depleted'; statusHtml = '<span class="promo-badge b-warning"><i class="fa-solid fa-battery-empty"></i> نفذت</span>'; } 
        else { exactStatus = 'active'; statusHtml = '<span class="promo-badge b-success pulse-badge"><i class="fa-solid fa-check"></i> نشط</span>'; }

        const valText = isPercent ? `${_enNum(coupon.value)}%` : RenderHelpers.formatMoney(coupon.value, 'USD', 2);
        const usageText = coupon.maxUses > 0 ? `${_enNum(coupon.usedCount)} / ${_enNum(coupon.maxUses)}` : `${_enNum(coupon.usedCount)} / ∞`;
        const perUserText = coupon.maxPerUser > 0 ? _enNum(coupon.maxPerUser) : '∞';

        return `
        <div class="promo-card" data-status="${exactStatus}">
            <div class="promo-header">
                <div class="promo-header-content">
                    <div class="promo-icon icon-coupon"><i class="fa-solid fa-ticket"></i></div>
                    <div class="promo-title-box">
                        <div class="promo-title copyable-admin num-en text-upper" dir="ltr" title="اضغط لنسخ الكود" data-action="copy-text" data-copy-text="${_esc(coupon.code)}">
                            ${_esc(coupon.code)} <i class="fa-regular fa-copy copy-icon-hint" style="font-size:11px; opacity:0.5; margin-left:4px;"></i>
                        </div>
                        <div class="promo-subtitle sub-coupon">كوبون خصم</div>
                    </div>
                </div>
                
                <div class="promo-actions">
                    <div class="promo-btns-group">
                        <button class="promo-btn-mini promo-btn-edit" data-action="edit-item" data-type="coupon" data-id="${_esc(coupon.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                        <button class="promo-btn-mini promo-btn-del" data-action="delete-item" data-type="coupon" data-id="${_esc(coupon.id)}" title="حذف"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <div class="promo-switch-group">
                        <label class="switch promo-switch" title="تفعيل/إيقاف">
                            <input type="checkbox" ${coupon.isActive ? 'checked' : ''} data-action="toggle-coupon-status" data-id="${_esc(coupon.id)}">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="promo-details-grid">
                <div class="promo-col"><span class="promo-lbl">قيمة الخصم</span><span class="promo-val text-gold num-en" dir="ltr" lang="en">${valText}</span></div>
                <div class="promo-col"><span class="promo-lbl">الاستخدام الإجمالي</span><span class="promo-val num-en" dir="ltr" lang="en">${usageText}</span></div>
            </div>
            <div class="promo-details-grid">
                <div class="promo-col"><span class="promo-lbl">حد الاستخدام للعميل</span><span class="promo-val num-en" dir="ltr" lang="en">${perUserText}</span></div>
                <div class="promo-col"><span class="promo-lbl">الحد الأدنى للطلب</span><span class="promo-val num-en" dir="ltr" lang="en">${coupon.minOrder > 0 ? RenderHelpers.formatMoney(coupon.minOrder, 'USD', 2) : '∞'}</span></div>
            </div>
            <div class="promo-meta">
                <span class="text-muted fs-11"><i class="fa-regular fa-clock"></i> ينتهي: <span class="num-en" dir="ltr" lang="en">${coupon.expiryDate ? new Date(coupon.expiryDate).toLocaleDateString('en-GB') : '∞'}</span></span>
                ${statusHtml}
            </div>
        </div>`;
    },

    offerCard: (o) => {
        const now = Date.now();
        let statusHtml = '', exactStatus = 'active';
        if (!o.isActive) { exactStatus = 'inactive'; statusHtml = '<span class="promo-badge b-red"><i class="fa-solid fa-ban"></i> متوقف</span>'; } 
        else if (o.expiryDate && o.expiryDate < now) { exactStatus = 'expired'; statusHtml = '<span class="promo-badge b-warning"><i class="fa-solid fa-clock"></i> منتهي</span>'; } 
        else { exactStatus = 'active'; statusHtml = '<span class="promo-badge b-success pulse-badge"><i class="fa-solid fa-check"></i> نشط</span>'; }

        let typeText = '', valText = '';
        if (o.type === 'real') { typeText = 'تخفيض حقيقي'; valText = `${_enNum(o.value)}%`; }
        else if (o.type === 'fake') { typeText = 'وهمي (مشطوب)'; valText = `${_enNum(o.value)}%`; }
        else if (o.type === 'fixed') { typeText = 'سعر ثابت'; valText = `$${_enNum(o.value)}`; }
        else if (o.type === 'badge_only') { typeText = 'شارة ترويجية'; valText = '---'; }

        const tiersCount = (o.targetTiers && o.targetTiers.length > 0) ? _enNum(o.targetTiers.length) : '0';
        const prodsCount = (o.targetProds && o.targetProds.length > 0) ? _enNum(o.targetProds.length) : '0';
        let visualBadgeHtml = '<span class="text-muted">بدون شارة</span>';
        if (o.visualConfig && o.visualConfig.grid && o.visualConfig.grid.badgeStyle !== 'none') {
            const v = o.visualConfig.grid;
            // 🌟 الإضافة السحرية: ترجمة اسم اللون القديم إلى كلاس الستايل الجديد المضيء
            const mappedColorClass = String(v.badgeColor).replace('theme-ruby', 'badge-red')
                                                         .replace('theme-sapphire', 'badge-blue')
                                                         .replace('theme-emerald', 'badge-green')
                                                         .replace('theme-gold', 'badge-gold')
                                                         .replace('theme-sunset', 'badge-red')
                                                         .replace('theme-ocean', 'badge-blue')
                                                         .replace('theme-amethyst', 'badge-purple')
                                                         .replace('theme-cyber', 'badge-purple')
                                                         .replace('theme-carbon', 'badge-black')
                                                         .replace('theme-obsidian', 'badge-black');
            
            visualBadgeHtml = `<div class="${v.badgeStyle} ${mappedColorClass}" style="position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 2px 8px; font-size: 9px; transform: none; box-shadow: var(--shadow-soft); border-radius: 4px; line-height: 1;">${_esc(v.badgeText)}</div>`;
        }

        return `
        <div class="promo-card" data-status="${exactStatus}">
            <div class="promo-header">
                <div class="promo-header-content">
                    <div class="promo-icon icon-offer"><i class="fa-solid fa-bolt"></i></div>
                    <div class="promo-title-box">
                        <div class="promo-title" title="${_esc(o.name)}">${_esc(o.name)}</div>
                        <div class="promo-subtitle sub-offer">${typeText}</div>
                    </div>
                </div>

                <div class="promo-actions">
                    <div class="promo-btns-group">
                        <button class="promo-btn-mini promo-btn-edit" data-action="edit-item" data-type="offer" data-id="${_esc(o.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                        <button class="promo-btn-mini promo-btn-del" data-action="delete-item" data-type="offer" data-id="${_esc(o.id)}" title="حذف"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <div class="promo-switch-group">
                        <label class="switch promo-switch" title="تفعيل/إيقاف">
                            <input type="checkbox" ${o.isActive ? 'checked' : ''} data-action="toggle-offer-status" data-id="${_esc(o.id)}">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="promo-details-grid">
                <div class="promo-col"><span class="promo-lbl">قيمة العرض</span><span class="promo-val fw-bold text-white num-en" dir="ltr" lang="en">${valText}</span></div>
                <div class="promo-col"><span class="promo-lbl">الشكل المرئي</span><span class="promo-val" style="height: 25px; display: flex; align-items: center;">${visualBadgeHtml}</span></div>
            </div>
            <div class="promo-details-grid">
                <div class="promo-col"><span class="promo-lbl">المستويات المشمولة</span><span class="promo-val num-en" dir="ltr" lang="en">${tiersCount}</span></div>
                <div class="promo-col"><span class="promo-lbl">المنتجات المشمولة</span><span class="promo-val num-en" dir="ltr" lang="en">${prodsCount}</span></div>
            </div>
            <div class="promo-meta">
                <span class="text-muted fs-11"><i class="fa-regular fa-clock"></i> ينتهي: <span class="num-en" dir="ltr" lang="en">${o.expiryDate ? new Date(o.expiryDate).toLocaleDateString('en-GB') : '∞'}</span></span>
                ${statusHtml}
            </div>
        </div>`;
    },

    emptyUnifiedAlerts: () => `<div class="empty-state"><i class="fa-solid fa-bell-slash"></i><span>لا توجد إشعارات أو رسائل منبثقة نشطة حالياً.</span></div>`,
    
    unifiedAlertCard: (alert) => {
        const isPopup = alert.isPopup || alert.type === 'popup'; 
        const icon = isPopup ? 'fa-bolt text-warning' : 'fa-bell text-secondary';
        const typeText = isPopup ? 'رسالة منبثقة (Popup)' : 'إشعار جرس';
        let targetText = 'للجميع', targetIcon = 'fa-users';
        if (alert.targetType === 'tier') { targetText = `مستوى مخصص`; targetIcon = 'fa-crown text-gold'; } 
        else if (alert.targetType === 'user') { targetText = `عميل مخصص`; targetIcon = 'fa-user text-info'; }

        const isExpired = alert.expiresAt && Date.now() > alert.expiresAt;
        const statusHtml = isExpired ? '<span class="promo-badge b-warning"><i class="fa-solid fa-clock"></i> منتهي</span>' : '<span class="promo-badge b-success pulse-badge"><i class="fa-solid fa-check"></i> نشط</span>';
        const targetIdHtml = alert.targetId ? `<span class="num-en text-warning" dir="ltr">#${_esc(alert.targetId)}</span>` : '';

        let extraPopupDetails = '';
        if (isPopup) {
            extraPopupDetails = `<div class="promo-details-grid" style="border-top: 1px dashed var(--border-color); padding-top: 10px; margin-top: 10px;"><div class="promo-col"><span class="promo-lbl text-warning"><i class="fa-solid fa-eye"></i> سقف الظهور</span><span class="promo-val fw-bold num-en" dir="ltr" lang="en">${alert.maxViews || 3} مرات</span></div>${alert.couponCode ? `<div class="promo-col"><span class="promo-lbl text-success"><i class="fa-solid fa-ticket"></i> كود الخصم</span><span class="promo-val fw-bold text-success num-en" dir="ltr" lang="en">${_esc(alert.couponCode)}</span></div>` : ''}</div>${alert.actionLink ? `<div class="promo-details-grid mt-5"><div class="promo-col w-100"><span class="promo-lbl text-info"><i class="fa-solid fa-link"></i> رابط التوجيه (CTA)</span><a href="${_esc(alert.actionLink)}" target="_blank" class="promo-val text-info text-truncate" style="max-width: 250px; display: inline-block;" dir="ltr">${_esc(alert.actionLink)}</a></div></div>` : ''}`;
        }

        return `
        <div class="promo-card" data-status="${isExpired ? 'expired' : 'active'}">
            <div class="promo-header">
                <div class="promo-header-content">
                    <div class="promo-icon ${isPopup ? 'icon-offer' : 'icon-coupon'}"><i class="fa-solid ${icon}"></i></div>
                    <div class="promo-title-box">
                        <div class="promo-title" title="${_esc(alert.title || 'بدون عنوان')}">${_esc(alert.title || 'بدون عنوان')}</div>
                        <div class="promo-subtitle sub-offer">${typeText}</div>
                    </div>
                </div>
                <div class="promo-actions">
                    <div class="promo-btns-group">
                        <button class="promo-btn-mini promo-btn-del" data-action="delete-item" data-type="alert" data-id="${_esc(alert.id)}" title="حذف"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>

            <div class="promo-details-grid">
                <div class="promo-col"><span class="promo-lbl">الاستهداف</span><span class="promo-val fw-bold"><i class="fa-solid ${targetIcon} icon-me-2"></i> ${targetText} ${targetIdHtml}</span></div>
                <div class="promo-col"><span class="promo-lbl">تاريخ الإنشاء</span><span class="promo-val num-en" dir="ltr" lang="en">${alert.createdAt ? _fmtDate(alert.createdAt) : '---'}</span></div>
            </div>
            <div class="promo-details-grid">
                <div class="promo-col w-100"><span class="promo-lbl">نص الرسالة</span><span class="promo-val text-muted">${_esc(alert.message)}</span></div>
            </div>
            ${extraPopupDetails}
            <div class="promo-meta mt-10">
                <span class="text-muted fs-11"><i class="fa-regular fa-clock"></i> ينتهي: <span class="num-en" dir="ltr" lang="en">${alert.expiresAt ? new Date(alert.expiresAt).toLocaleDateString('en-GB') : '∞'}</span></span>
                ${statusHtml}
            </div>
        </div>`;
    }
};
