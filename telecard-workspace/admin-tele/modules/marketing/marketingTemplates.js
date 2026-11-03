// ============================================================================
// 📢 قوالب التسويق والعروض (modules/marketing/marketingTemplates.js) - Enterprise V20.1 💎
// 🎯 الوظيفة: توليد الـ HTML بنظام المجموعات العمودية والنوافذ الديناميكية
// 🚀 التحديثات المعمارية (V20.1 - Zero DOM Clash & Modals Migration):
// 1. Smart Tree Parent Fix 🌳: فصل زر التوسيع في الشجرة عن مدخل الـ Checkbox لمنع التحديد الخاطئ عند النقر على السهم.
// 2. Quick Select Actions ⚡: إضافة أزرار (تحديد/إلغاء الكل) في شجرة الكوبونات والعروض.
// 3. Modals Extraction 📦: اقتلاع نوافذ (العروض، الكوبونات، الإشعارات، البنرات) من الـ HTML.
// ============================================================================

import { AdminData } from '../../adminData.js'; 
import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;

export const MarketingTemplates = {
    // ==========================================
    // 🚀 حالات الفراغ الموحدة (Unified Empty States)
    // ==========================================
    emptyCoupons: () => RenderHelpers.emptyState('fa-solid fa-ticket-simple text-muted', 'لا توجد كوبونات', 'لا يوجد أي كوبونات حالياً. اضغط على إنشاء للبدء!'),
    emptyOffers: () => RenderHelpers.emptyState('fa-solid fa-bolt-slash text-muted', 'لا توجد عروض', 'لا توجد حملات تخفيض مركزية نشطة حالياً. أنشئ عرضك الأول!'),
    emptyBanners: () => RenderHelpers.emptyState('fa-solid fa-images text-muted', 'لا توجد لافتات', 'لا توجد لافتات إعلانية (Banners) مرفوعة. أضف بنر ليتفاعل معه العملاء.'),
    emptyTreeTiers: () => RenderHelpers.emptyState('fa-solid fa-users-slash text-muted', 'لا توجد مستويات', 'لا توجد مستويات مسجلة للاختيار منها.'),
    emptyTreeProds: () => RenderHelpers.emptyState('fa-solid fa-box-open text-muted', 'لا توجد منتجات', 'لا توجد منتجات مسجلة للاختيار منها.'),
    emptyUnifiedAlerts: () => RenderHelpers.emptyState('fa-solid fa-bell-slash text-muted', 'لا توجد إشعارات', 'لا توجد إشعارات أو رسائل منبثقة نشطة حالياً.'),

    // ==========================================
    // 🎟️ الكروت والمكونات الأساسية
    // ==========================================
    couponCard: (coupon, uiData) => {
        const isPercent = coupon.type === 'percentage';
        const isExpired = coupon.expiryDate && Date.now() > coupon.expiryDate;
        const isMaxedOut = coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses;
        
        let exactStatus = 'active', statusHtml = '';

        if (!coupon.isActive) { 
            exactStatus = 'inactive'; 
            statusHtml = '<span class="promo-badge b-red"><i class="fa-solid fa-ban me-1"></i> متوقف</span>'; 
        } else if (isExpired) { 
            exactStatus = 'expired'; 
            statusHtml = '<span class="promo-badge b-warning"><i class="fa-solid fa-clock me-1"></i> منتهي</span>'; 
        } else if (isMaxedOut) { 
            exactStatus = 'depleted'; 
            statusHtml = '<span class="promo-badge b-warning"><i class="fa-solid fa-battery-empty me-1"></i> نفذت</span>'; 
        } else { 
            exactStatus = 'active'; 
            statusHtml = '<span class="promo-badge b-success pulse-badge"><i class="fa-solid fa-check me-1"></i> نشط</span>'; 
        }

        const valText = isPercent ? `${_enNum(coupon.value)}%` : RenderHelpers.formatMoney(coupon.value, 'USD', 2);
        const usageText = coupon.maxUses > 0 ? `${_enNum(coupon.usedCount)} / ${_enNum(coupon.maxUses)}` : `${_enNum(coupon.usedCount)} / ∞`;
        const perUserText = coupon.maxPerUser > 0 ? _enNum(coupon.maxPerUser) : '∞';
        const maxDiscText = (isPercent && coupon.maxDiscount > 0) ? RenderHelpers.formatMoney(coupon.maxDiscount, 'USD', 2) : '∞';

        return `
        <div class="promo-card" data-status="${exactStatus}">
            <div class="promo-header">
                <div class="promo-header-content">
                    <div class="promo-icon icon-coupon"><i class="fa-solid fa-ticket"></i></div>
                    <div class="promo-title-box">
                        <div class="promo-title copyable-admin num-en font-numeric text-upper interactive-scale" dir="ltr" title="اضغط لنسخ الكود" data-action="copy-text" data-copy-text="${_esc(coupon.code)}">
                            ${_esc(coupon.code)} <i class="fa-regular fa-copy copy-icon-hint fs-11 ms-1 icon-dimmed"></i>
                        </div>
                        <div class="promo-subtitle sub-coupon">كوبون خصم</div>
                    </div>
                </div>
                
                <div class="promo-actions">
                    <div class="promo-btns-group flex-center-gap" style="gap: 5px;">
                        <button class="action-mini btn-edit-mini interactive-scale" data-action="edit-item" data-type="coupon" data-id="${_esc(coupon.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-mini btn-del-mini interactive-scale" data-action="delete-item" data-type="coupon" data-id="${_esc(coupon.id)}" title="حذف"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <div class="promo-switch-group">
                        <label class="switch promo-switch interactive-scale" title="تفعيل/إيقاف">
                            <input type="checkbox" ${coupon.isActive ? 'checked' : ''} data-action="toggle-coupon-status" data-id="${_esc(coupon.id)}">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="promo-details-grid">
                <div class="promo-col"><span class="promo-lbl">قيمة الخصم</span><span class="promo-val text-gold num-en font-numeric" dir="ltr" lang="en">${valText}</span></div>
                <div class="promo-col"><span class="promo-lbl">الاستخدام الإجمالي</span><span class="promo-val num-en font-numeric" dir="ltr" lang="en">${usageText}</span></div>
            </div>
            <div class="promo-details-grid">
                <div class="promo-col"><span class="promo-lbl">حد الاستخدام للعميل</span><span class="promo-val num-en font-numeric" dir="ltr" lang="en">${perUserText}</span></div>
                <div class="promo-col"><span class="promo-lbl">أقصى مبلغ خصم</span><span class="promo-val num-en text-danger font-numeric" dir="ltr" lang="en">${maxDiscText}</span></div>
            </div>
            ${(coupon.requiresAdminAttention && coupon.syncNote) ? `<div class="alert-box alert-danger mt-10 p-10 fs-11"><i class="fa-solid fa-triangle-exclamation me-1"></i> ${_esc(coupon.syncNote)}</div>` : ''}
            <div class="promo-meta">
                <span class="text-muted fs-11"><i class="fa-regular fa-clock me-1"></i> ينتهي: <span class="num-en font-numeric" dir="ltr" lang="en">${coupon.expiryDate ? RenderHelpers.formatSafeDate(coupon.expiryDate) : '∞'}</span></span>
                ${statusHtml}
            </div>
        </div>`;
    },

    offerCard: (o) => {
        const now = Date.now();
        let exactStatus = 'active', statusHtml = '';

        if (!o.isActive) { 
            exactStatus = 'inactive'; 
            statusHtml = '<span class="promo-badge b-red"><i class="fa-solid fa-ban me-1"></i> متوقف</span>'; 
        } else if (o.expiryDate && o.expiryDate < now) { 
            exactStatus = 'expired'; 
            statusHtml = '<span class="promo-badge b-warning"><i class="fa-solid fa-clock me-1"></i> منتهي</span>'; 
        } else { 
            exactStatus = 'active'; 
            statusHtml = '<span class="promo-badge b-success pulse-badge"><i class="fa-solid fa-check me-1"></i> نشط</span>'; 
        }

        let typeText = '', valText = '';
        if (o.type === 'real' || o.type === 'percentage') { typeText = 'تخفيض حقيقي'; valText = `${_enNum(o.value)}%`; }      
        else if (o.type === 'fake') { typeText = 'وهمي (مشطوب)'; valText = `${_enNum(o.value)}%`; }
        else if (o.type === 'fixed') { typeText = 'خصم مبلغ ثابت'; valText = `-$${_enNum(o.value)}`; }
        else if (o.type === 'badge_only') { typeText = 'شارة ترويجية'; valText = '---'; }

        const tiersCount = (o.targetTiers && o.targetTiers.length > 0) ? _enNum(o.targetTiers.length) : '0';
        const prodsCount = (o.targetProds && o.targetProds.length > 0) ? _enNum(o.targetProds.length) : '0';
        
        let visualBadgeHtml = '<span class="text-muted">بدون شارة</span>';
        if (o.visualConfig && o.visualConfig.grid && o.visualConfig.grid.badgeStyle !== 'none') {
            const v = o.visualConfig.grid;
            const mappedColorClass = String(v.badgeColor)
                .replace('theme-ruby', 'badge-red')
                .replace('theme-sapphire', 'badge-blue')
                .replace('theme-emerald', 'badge-green')
                .replace('theme-gold', 'badge-gold')
                .replace('theme-sunset', 'badge-red')
                .replace('theme-ocean', 'badge-blue')
                .replace('theme-amethyst', 'badge-purple')
                .replace('theme-cyber', 'badge-purple')
                .replace('theme-carbon', 'badge-black')
                .replace('theme-obsidian', 'badge-black');
            
            visualBadgeHtml = `<div class="${v.badgeStyle} ${mappedColorClass} visual-badge-dummy">${_esc(v.badgeText)}</div>`;
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
                    <div class="promo-btns-group flex-center-gap" style="gap: 5px;">
                        <button class="action-mini btn-edit-mini interactive-scale" data-action="edit-item" data-type="offer" data-id="${_esc(o.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-mini btn-del-mini interactive-scale" data-action="delete-item" data-type="offer" data-id="${_esc(o.id)}" title="حذف"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <div class="promo-switch-group">
                        <label class="switch promo-switch interactive-scale" title="تفعيل/إيقاف">
                            <input type="checkbox" ${o.isActive ? 'checked' : ''} data-action="toggle-offer-status" data-id="${_esc(o.id)}">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="promo-details-grid">
                <div class="promo-col"><span class="promo-lbl">قيمة العرض</span><span class="promo-val fw-bold text-white num-en font-numeric" dir="ltr" lang="en">${valText}</span></div>
                <div class="promo-col"><span class="promo-lbl">الشكل المرئي</span><span class="promo-val visual-badge-preview-col">${visualBadgeHtml}</span></div>
            </div>
            <div class="promo-details-grid">
                <div class="promo-col"><span class="promo-lbl">المستويات المشمولة</span><span class="promo-val num-en font-numeric" dir="ltr" lang="en">${tiersCount}</span></div>
                <div class="promo-col"><span class="promo-lbl">المنتجات المشمولة</span><span class="promo-val num-en font-numeric" dir="ltr" lang="en">${prodsCount}</span></div>
            </div>
            ${(o.requiresAdminAttention && o.syncNote) ? `<div class="alert-box alert-danger mt-10 p-10 fs-11"><i class="fa-solid fa-triangle-exclamation me-1"></i> ${_esc(o.syncNote)}</div>` : ''}
            <div class="promo-meta">
                <span class="text-muted fs-11"><i class="fa-regular fa-clock me-1"></i> ينتهي: <span class="num-en font-numeric" dir="ltr" lang="en">${o.expiryDate ? RenderHelpers.formatSafeDate(o.expiryDate) : '∞'}</span></span>
                ${statusHtml}
            </div>
        </div>`;
    },
    
    unifiedAlertCard: (alert) => {
        const isPopup = alert.isPopup || alert.type === 'popup'; 
        const icon = isPopup ? 'fa-bolt text-warning' : 'fa-bell text-secondary';
        const typeText = isPopup ? 'رسالة منبثقة (Popup)' : 'إشعار جرس';
        
        let targetText = 'للجميع', targetIcon = 'fa-users', targetIdHtml = '';

        if (alert.targetType === 'tier') { 
            targetText = `مستوى مخصص`; 
            targetIcon = 'fa-crown text-gold'; 
            targetIdHtml = alert.targetId ? `<span class="num-en text-warning font-numeric ms-1" dir="ltr">#${_esc(alert.targetId)}</span>` : '';
        } else if (alert.targetType === 'user') { 
            targetText = `عميل مخصص`; 
            targetIcon = 'fa-user text-info'; 
            const targetUser = AdminData.data.usersMap?.[alert.targetId];
            const dId = targetUser ? RenderHelpers.formatUserId(targetUser) : String(alert.targetId || '').substring(0,8);
            targetIdHtml = `<span class="num-en text-warning copyable-admin interactive-scale font-numeric ms-1" data-action="copy-text" data-copy-text="${_esc(dId)}" dir="ltr" title="نسخ رقم العميل">#${_esc(dId)}</span>`;
        }

        const isExpired = alert.expiresAt && Date.now() > alert.expiresAt;
        const statusHtml = isExpired 
            ? '<span class="promo-badge b-warning"><i class="fa-solid fa-clock me-1"></i> منتهي</span>' 
            : '<span class="promo-badge b-success pulse-badge"><i class="fa-solid fa-check me-1"></i> نشط</span>';

        let extraPopupDetails = '';
        if (isPopup) {
            extraPopupDetails = `
            <div class="promo-details-grid popup-details-divider">
                <div class="promo-col">
                    <span class="promo-lbl text-warning"><i class="fa-solid fa-eye me-1"></i> سقف الظهور</span>
                    <span class="promo-val fw-bold num-en font-numeric" dir="ltr" lang="en">${alert.maxViews || 3} مرات</span>
                </div>
                ${alert.couponCode ? `
                <div class="promo-col">
                    <span class="promo-lbl text-success"><i class="fa-solid fa-ticket me-1"></i> كود الخصم</span>
                    <span class="promo-val fw-bold text-success num-en font-numeric" dir="ltr" lang="en">${_esc(alert.couponCode)}</span>
                </div>` : ''}
            </div>
            ${alert.actionLink ? `
            <div class="promo-details-grid mt-5">
                <div class="promo-col w-100">
                    <span class="promo-lbl text-info"><i class="fa-solid fa-link me-1"></i> رابط التوجيه (CTA)</span>
                    <a href="${_esc(alert.actionLink)}" target="_blank" class="promo-val text-info text-truncate popup-link-preview font-numeric" dir="ltr">${_esc(alert.actionLink)}</a>
                </div>
            </div>` : ''}`;
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
                    <div class="promo-btns-group flex-center-gap" style="gap: 5px;">
                        <button class="action-mini btn-del-mini interactive-scale" data-action="delete-alert" data-id="${_esc(alert.id)}" title="حذف الإشعار"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>

            <div class="promo-details-grid">
                <div class="promo-col"><span class="promo-lbl">الاستهداف</span><span class="promo-val fw-bold"><i class="fa-solid ${targetIcon} me-1"></i> ${targetText} ${targetIdHtml}</span></div>
                <div class="promo-col"><span class="promo-lbl">تاريخ الإنشاء</span><span class="promo-val num-en font-numeric" dir="ltr" lang="en">${alert.createdAt ? RenderHelpers.formatSafeDate(alert.createdAt) : '---'}</span></div>
            </div>
            <div class="promo-details-grid">
                <div class="promo-col w-100"><span class="promo-lbl">نص الرسالة</span><span class="promo-val text-muted">${_esc(alert.message)}</span></div>
            </div>
            ${extraPopupDetails}
            <div class="promo-meta mt-10">
                <span class="text-muted fs-11"><i class="fa-regular fa-clock me-1"></i> ينتهي: <span class="num-en font-numeric" dir="ltr" lang="en">${alert.expiresAt ? RenderHelpers.formatSafeDate(alert.expiresAt) : '∞'}</span></span>
                ${statusHtml}
            </div>
        </div>`;
    },

    bannerItem: (b, index) => {
        return `
        <div class="banner-card interactive-scale" data-id="${_esc(b.id)}">
            <div class="banner-drag-handle" title="سحب لترتيب البنرات"><i class="fa-solid fa-grip-vertical"></i></div>
            <div class="bc-img-wrap"><img src="${_esc(b.img)}" class="zoomable-img" data-action="open-img-viewer" data-src="${_esc(b.img)}"></div>
            <div class="bc-info">
                ${b.link ? `<div class="bc-link text-truncate num-en font-numeric" dir="ltr" lang="en"><i class="fa-solid fa-link me-1"></i> ${_esc(b.link)}</div>` : '<div class="bc-link text-muted"><i class="fa-solid fa-link-slash me-1"></i> بدون رابط</div>'}
            </div>
            <button class="btn btn-outline-danger btn-compact bc-del interactive-scale" data-action="delete-item" data-type="banner" data-id="${_esc(b.id)}"><i class="fa-solid fa-trash"></i></button>
        </div>`;
    },

    smartTreeTier: (id, name, icon, isChecked) => `
        <label class="tree-item-row tier-tree-item">
            <input type="checkbox" class="tree-checkbox tree-tier-cb" value="${_esc(id)}" ${isChecked ? 'checked' : ''}>
            <i class="${_esc(icon)} text-gold ms-2"></i>
            <span class="fs-13 fw-bold">${_esc(name)}</span>
        </label>
    `,

    // 🚀 [الإصلاح المعماري 1] - فصل زر الشجرة لمنع التحديد العرضي
    smartTreeParent: (id, name, childrenHtml, isAllChecked) => `
        <div class="tree-group">
            <div class="tree-item-row tree-parent-row d-flex align-items-center">
                <input type="checkbox" class="tree-checkbox tree-parent-cb" value="${_esc(id)}" ${isAllChecked ? 'checked' : ''} data-action="handleTreeParentCheck">
                <button type="button" class="tree-toggle-icon interactive-scale border-0 bg-transparent" data-action="toggleTreeNode"><i class="fa-solid fa-chevron-down"></i></button>
                <span class="fs-13 fw-bold text-primary flex-1 cursor-pointer" data-action="toggleTreeNode">${_esc(name)}</span>
            </div>
            <div class="tree-children-container">
                ${childrenHtml}
            </div>
        </div>
    `,

    smartTreeChild: (id, name, img, isChecked, shortId) => `
        <label class="tree-item-row tree-child-row">
            <input type="checkbox" class="tree-checkbox tree-child-cb" value="${_esc(id)}" ${isChecked ? 'checked' : ''} data-action="handleTreeChildCheck">
            ${img ? `<img src="${_esc(img)}" class="tree-thumb">` : `<div class="tree-thumb-fallback"><i class="fa-solid fa-box"></i></div>`}
            <div class="flex-col">
                <span class="fs-12 fw-bold text-main">${_esc(name)}</span>
                <span class="fs-10 text-muted"><span class="num-en text-warning font-numeric" dir="ltr">#${_esc(shortId)}</span></span>
            </div>
        </label>
    `,

    // ==========================================
    // 📦 النوافذ المسحوبة ديناميكياً (Modals Migration)
    // ==========================================

    couponEditModal: () => `
        <div class="modal-content modal-md">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title" id="coupon-modal-title"><i class="fa-solid fa-ticket me-1"></i> إدارة الكوبون</h2>

            <div class="form-group">
                <label class="form-label">كود الكوبون</label>
                <div class="flex-gap-10">
                    <input type="text" id="coupon-code" class="form-input font-numeric text-upper flex-1" dir="ltr" placeholder="مثال: VIP2024">
                    <button type="button" class="btn btn-warning interactive-scale w-auto" data-action="gen-coupon"><i class="fa-solid fa-shuffle me-1"></i> توليد</button>
                </div>
            </div>

            <div class="form-row-2 flex-gap-10">
                <div class="form-group flex-1">
                    <label class="form-label">نوع الخصم</label>
                    <select id="coupon-type" class="form-input select-shared">
                        <option value="percentage">نسبة مئوية (%)</option>
                        <option value="fixed">مبلغ ثابت ($)</option>
                    </select>
                </div>
                <div class="form-group flex-1">
                    <label class="form-label">قيمة الخصم</label>
                    <input type="text" inputmode="decimal" id="coupon-value" class="form-input font-numeric" dir="ltr" placeholder="0">
                </div>
                <div class="form-group flex-1">
                    <label class="form-label">أقصى خصم ($)</label>
                    <input type="text" inputmode="decimal" id="coupon-max-discount" class="form-input font-numeric" dir="ltr" placeholder="0 = غير محدود">
                </div>
            </div>
            <div class="form-row-2 flex-gap-15 mt-10">
                <div class="form-group flex-1">
                    <div class="flex-between align-items-center mb-5">
                        <label class="form-label mb-0">المستويات المسموح لها</label>
                        <button type="button" class="btn btn-ghost btn-compact interactive-scale" data-action="toggle-tree-all" data-target="coupon-target-tiers">تحديد/إلغاء الكل</button>
                    </div>
                    <div id="coupon-target-tiers" class="smart-tree-container custom-scrollbar" style="max-height: 200px;"></div>
                    <small class="text-danger d-block mt-5 fw-bold fs-10"><i class="fa-solid fa-circle-exclamation me-1"></i> إجباري: يجب تحديد مستوى واحد على الأقل</small>
                </div>

                <div class="form-group flex-1">
                    <div class="flex-between align-items-center mb-5">
                        <label class="form-label mb-0">المنتجات المشمولة</label>
                        <button type="button" class="btn btn-ghost btn-compact interactive-scale" data-action="toggle-tree-all" data-target="coupon-target-prods">تحديد/إلغاء الكل</button>
                    </div>
                    <div id="coupon-target-prods" class="smart-tree-container custom-scrollbar" style="max-height: 200px;"></div>
                    <small class="text-danger d-block mt-5 fw-bold fs-10"><i class="fa-solid fa-circle-exclamation me-1"></i> إجباري: تحديد منتج أو قسم واحد على الأقل</small>
                </div>
            </div>

            <div class="form-row-2 flex-gap-10 mt-10">
                <div class="form-group flex-1">
                    <label class="form-label">تاريخ ووقت الانتهاء (اختياري)</label>
                    <div class="custom-field interactive-scale w-100" data-action="open-calendar" data-type="expiry" data-section="coupon" data-time="true">
                        <div class="field-content">
                            <i class="fa-regular fa-calendar text-warning"></i>
                            <span class="field-text placeholder-text font-numeric" id="date-expiry-coupon">DD/MM/YYYY HH:MM</span>
                        </div>
                        <input type="hidden" id="coupon-expiry">
                    </div>
                </div>
                <div class="form-group flex-1">
                    <label class="form-label">الحد الأدنى للطلب ($)</label>
                    <input type="text" inputmode="decimal" id="coupon-min-order" class="form-input font-numeric" dir="ltr" placeholder="0 = بدون حد">
                </div>
            </div>

            <div class="form-row-2 flex-gap-10">
                <div class="form-group flex-1">
                    <label class="form-label">الحد الأقصى للاستخدام الكلي</label>
                    <input type="text" inputmode="numeric" pattern="[0-9]*" id="coupon-max-uses" class="form-input font-numeric" dir="ltr" placeholder="0 = غير محدود">
                </div>
                <div class="form-group flex-1">
                    <label class="form-label">أقصى استخدام للعميل الواحد</label>
                    <input type="text" inputmode="numeric" pattern="[0-9]*" id="coupon-max-per-user" class="form-input font-numeric" dir="ltr" placeholder="0 = غير محدود">
                </div>
            </div>

            <div class="form-group mt-10">
                <label class="form-label">مخصص لعملاء محددين (معرفاتهم) - اختياري</label>
                <input type="text" inputmode="text" id="coupon-allowed-users" class="form-input font-numeric" dir="ltr" placeholder="مثال: 123, 456 (مفصول بفاصلة)">
            </div>

            <div class="setting-item-row p-8-12 mt-10">
                <div>
                    <span class="switch-title">حالة الكوبون</span>
                    <span class="switch-desc">تفعيل أو إيقاف الكوبون مؤقتاً</span>
                </div>
                <label class="switch interactive-scale"><input type="checkbox" id="coupon-active" checked><span class="slider"></span></label>
            </div>

            <div class="modal-actions-row border-top-solid mt-15 pt-15">
                <button type="button" class="btn btn-primary interactive-scale" data-action="save-coupon">حفظ الكوبون</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">إلغاء</button>
            </div>
        </div>
    `,

    offerEditModal: () => `
        <div class="modal-content modal-xl">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title" id="offer-modal-title"><i class="fa-solid fa-bolt me-1"></i> مُنشئ العروض والحملات (Visual Engine)</h2>
            
            <input type="hidden" id="offer-id">

            <div class="builder-tabs">
                <button type="button" class="b-tab-btn interactive-scale active" data-action="builder-tab" data-tab="data"><i class="fa-solid fa-database"></i> 1. البيانات الأساسية</button>
                <button type="button" class="b-tab-btn interactive-scale" data-action="builder-tab" data-tab="grid"><i class="fa-solid fa-store"></i> 2. تصميم المتجر</button>
                <button type="button" class="b-tab-btn interactive-scale" data-action="builder-tab" data-tab="story"><i class="fa-solid fa-layer-group"></i> 3. تصميم القصص</button>
            </div>

            <div id="b-pane-data" class="builder-pane active">
                <div class="form-group">
                    <label class="form-label">اسم الحملة (للإدارة وللعميل)</label>
                    <input type="text" id="offer-name" class="form-input" placeholder="مثال: عروض رمضان، حسم خاص للجملة...">
                </div>

                <div class="form-row-2 flex-gap-10">
                    <div class="form-group flex-1">
                        <label class="form-label">نوع صندوق العرض</label>
                        <select id="offer-type" class="form-input select-shared" data-action="toggle-offer-fields">
                            <option value="real">تخفيض حقيقي (يُخصم من الربح الفعلي)</option>
                            <option value="fake">تخفيض وهمي (سعر مشطوب شكلي)</option>
                            <option value="fixed">خصم بمبلغ ثابت ($) من سعر المنتج</option>
                            <option value="badge_only">شارة فقط (بدون تغيير السعر)</option>
                        </select>
                    </div>
                    <div class="form-group flex-1" id="offer-value-group">
                        <label class="form-label" id="offer-value-label">قيمة الخصم</label>
                        <input type="text" inputmode="decimal" id="offer-value" class="form-input font-numeric" dir="ltr" placeholder="0">
                    </div>
                </div>

                <div class="form-row-2 flex-gap-15 mt-10">
                    <div class="form-group flex-1">
                        <div class="flex-between align-items-center mb-5">
                            <label class="form-label mb-0">المستويات المستهدفة</label>
                            <button type="button" class="btn btn-ghost btn-compact interactive-scale" data-action="toggle-tree-all" data-target="offer-target-tiers">تحديد/إلغاء الكل</button>
                        </div>
                        <div id="offer-target-tiers" class="smart-tree-container custom-scrollbar" style="border: 1px solid var(--border); padding: 10px; border-radius: 8px; max-height: 200px;"></div>
                    </div>
                    <div class="form-group flex-1">
                        <div class="flex-between align-items-center mb-5">
                            <label class="form-label mb-0">المنتجات المشمولة</label>
                            <button type="button" class="btn btn-ghost btn-compact interactive-scale" data-action="toggle-tree-all" data-target="offer-target-prods">تحديد/إلغاء الكل</button>
                        </div>
                        <div id="offer-target-prods" class="smart-tree-container custom-scrollbar" style="border: 1px solid var(--border); padding: 10px; border-radius: 8px; max-height: 200px;"></div>
                    </div>
                </div>

                <div class="form-row-2 flex-gap-10 mt-10">
                    <div class="form-group flex-1">
                        <label class="form-label">وقت انتهاء العرض (اختياري)</label>
                        <div class="custom-field interactive-scale w-100" data-action="open-calendar" data-type="expiry" data-section="offer" data-time="true">
                            <div class="field-content">
                                <i class="fa-regular fa-calendar text-warning"></i>
                                <span class="field-text placeholder-text font-numeric" id="date-expiry-offer">DD/MM/YYYY HH:MM</span>
                            </div>
                            <input type="hidden" id="offer-expiry">
                        </div>
                    </div>
                    <div class="form-group flex-1 setting-item-row mt-15" style="border-color: var(--border);">
                        <div><span class="switch-title">حالة العرض</span></div>
                        <label class="switch interactive-scale"><input type="checkbox" id="offer-active" checked><span class="slider"></span></label>
                    </div>
                </div>
            </div>

            <div id="b-pane-grid" class="builder-pane">
                <div class="ve-workspace">
                    <div class="ve-controls">
                        <div class="form-group mb-10">
                            <label class="form-label text-primary"><i class="fa-solid fa-pen me-1"></i> النص المكتوب داخل الشارة</label>
                            <input type="text" id="grid-badge-text" class="form-input" placeholder="مثال: خصم 50% أو HOT" data-action="render-grid-preview">
                        </div>

                        <div class="form-group">
                            <label class="form-label"><i class="fa-solid fa-shapes me-1"></i> مكتبة أشكال الشارات (Badges)</label>
                            <div class="style-selector-grid" id="grid-badge-style-container">
                                <div class="style-card interactive-scale active" data-val="none" data-action="set-grid-style" data-type="badge">
                                    <div class="sc-preview" style="background: transparent; border: 1px dashed rgba(255,255,255,0.3);"><i class="fa-solid fa-ban text-muted"></i></div>
                                    <span class="sc-name">بدون شارة</span>
                                </div>
                                <div class="style-card interactive-scale" data-val="badge-base-solid" data-action="set-grid-style" data-type="badge">
                                    <div class="sc-preview theme-ruby" style="border-radius: 6px;">نص</div>
                                    <span class="sc-name">كلاسيك صلبة</span>
                                </div>
                                <div class="style-card interactive-scale" data-val="badge-base-leaf" data-action="set-grid-style" data-type="badge">
                                    <div class="sc-preview theme-emerald" style="border-radius: 12px 0 12px 0;">نص</div>
                                    <span class="sc-name">ورقة شجر</span>
                                </div>
                                <div class="style-card interactive-scale" data-val="badge-base-float" data-action="set-grid-style" data-type="badge">
                                    <div class="sc-preview theme-sapphire" style="border-radius: 20px; border: 2px solid #0f172a;">نص</div>
                                    <span class="sc-name">فقاعة عائمة</span>
                                </div>
                                <div class="style-card interactive-scale" data-val="badge-base-cut" data-action="set-grid-style" data-type="badge">
                                    <div class="sc-preview theme-gold" style="clip-path: polygon(100% 0, 100% 100%, 50% 80%, 0 100%, 0 0);">نص</div>
                                    <span class="sc-name">شريط مقصوص</span>
                                </div>
                                <div class="style-card interactive-scale" data-val="badge-base-stamp" data-action="set-grid-style" data-type="badge">
                                    <div class="sc-preview theme-ruby" style="border-radius: 50%; width: 35px; height: 35px; border: 1px dashed #fff; transform: rotate(-15deg);">نص</div>
                                    <span class="sc-name">ختم مائل</span>
                                </div>
                                <div class="style-card interactive-scale" data-val="badge-base-glass" data-action="set-grid-style" data-type="badge">
                                    <div class="sc-preview" style="border-radius: 20px; background: rgba(255,255,255,0.2); backdrop-filter: blur(4px);">نص</div>
                                    <span class="sc-name">زجاج مغبش</span>
                                </div>
                                <div class="style-card interactive-scale" data-val="badge-base-3d" data-action="set-grid-style" data-type="badge">
                                    <div class="sc-preview theme-ocean" style="border-radius: 20px; transform: rotate(-5deg); box-shadow: 0 3px 0 #0369a1;">نص</div>
                                    <span class="sc-name">كبسولة 3D</span>
                                </div>
                            </div>
                        </div>

                        <div class="form-row-2 flex-gap-15 mb-15">
                            <div class="flex-2">
                                <label class="form-label"><i class="fa-solid fa-palette me-1"></i> لون الشارة (Theme)</label>
                                <div class="color-swatch-grid" id="grid-color-selectors">
                                    <div class="color-swatch interactive-scale theme-ruby active" data-color="theme-ruby" data-action="set-grid-color"></div>
                                    <div class="color-swatch interactive-scale theme-sunset" data-color="theme-sunset" data-action="set-grid-color"></div>
                                    <div class="color-swatch interactive-scale theme-gold" data-color="theme-gold" data-action="set-grid-color"></div>
                                    <div class="color-swatch interactive-scale theme-emerald" data-color="theme-emerald" data-action="set-grid-color"></div>
                                    <div class="color-swatch interactive-scale theme-ocean" data-color="theme-ocean" data-action="set-grid-color"></div>
                                    <div class="color-swatch interactive-scale theme-sapphire" data-color="theme-sapphire" data-action="set-grid-color"></div>
                                    <div class="color-swatch interactive-scale theme-amethyst" data-color="theme-amethyst" data-action="set-grid-color"></div>
                                    <div class="color-swatch interactive-scale theme-carbon" data-color="theme-carbon" data-action="set-grid-color"></div>
                                </div>
                            </div>
                            <div class="flex-1">
                                <label class="form-label text-center"><i class="fa-solid fa-crosshairs me-1"></i> موقع الشارة</label>
                                <div class="pos-grid-map" id="grid-badge-pos">
                                    <div class="pos-dot interactive-scale active" data-pos="pos-tl" data-action="set-grid-pos" data-type="badge"><i class="fa-solid fa-arrow-up-left"></i></div>
                                    <div class="pos-dot interactive-scale" data-pos="pos-tc" data-action="set-grid-pos" data-type="badge"><i class="fa-solid fa-arrow-up"></i></div>
                                    <div class="pos-dot interactive-scale" data-pos="pos-tr" data-action="set-grid-pos" data-type="badge"><i class="fa-solid fa-arrow-up-right"></i></div>
                                    <div class="pos-dot interactive-scale" data-pos="pos-bl" data-action="set-grid-pos" data-type="badge"><i class="fa-solid fa-arrow-down-left"></i></div>
                                    <div class="pos-dot interactive-scale" data-pos="pos-bc" data-action="set-grid-pos" data-type="badge"><i class="fa-solid fa-arrow-down"></i></div>
                                    <div class="pos-dot interactive-scale" data-pos="pos-br" data-action="set-grid-pos" data-type="badge"><i class="fa-solid fa-arrow-down-right"></i></div>
                                </div>
                            </div>
                        </div>

                        <hr style="border-color: var(--border); margin: 10px 0;">

                        <div class="form-row-2 flex-gap-15 mb-15">
                            <div class="flex-2">
                                <label class="form-label"><i class="fa-solid fa-stopwatch me-1"></i> مكتبة أشكال المؤقت الزمني</label>
                                <div class="style-selector-grid" id="grid-timer-style-container" style="max-height: 150px; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));">
                                    <div class="style-card interactive-scale active" data-val="none" data-action="set-grid-style" data-type="timer">
                                        <div class="sc-preview" style="background: transparent; border: none;"><i class="fa-solid fa-ban text-muted fs-16"></i></div>
                                        <span class="sc-name">بدون مؤقت</span>
                                    </div>
                                    <div class="style-card interactive-scale" data-val="timer-neon-glow" data-action="set-grid-style" data-type="timer">
                                        <div class="sc-preview" style="background: #0f172a; color: #38bdf8; border: 1px solid #38bdf8; border-radius: 8px;">12:30</div>
                                        <span class="sc-name">نيون أزرق</span>
                                    </div>
                                    <div class="style-card interactive-scale" data-val="timer-bc-pill" data-action="set-grid-style" data-type="timer">
                                        <div class="sc-preview theme-ruby" style="border-radius: 6px;">12:30</div>
                                        <span class="sc-name">كبسولة حمراء</span>
                                    </div>
                                    <div class="style-card interactive-scale" data-val="timer-digital" data-action="set-grid-style" data-type="timer">
                                        <div class="sc-preview" style="background: #000; color: #10b981; border: 1px solid #333; font-family: monospace;">12:30</div>
                                        <span class="sc-name">رقمي (LCD)</span>
                                    </div>
                                    <div class="style-card interactive-scale" data-val="timer-minimal" data-action="set-grid-style" data-type="timer">
                                        <div class="sc-preview" style="background: transparent; border: none; border-bottom: 2px solid #FFD700;">12:30</div>
                                        <span class="sc-name">خط بسيط</span>
                                    </div>
                                </div>
                            </div>
                            <div class="flex-1">
                                <label class="form-label text-center"><i class="fa-solid fa-crosshairs me-1"></i> موقع المؤقت</label>
                                <div class="pos-grid-map" id="grid-timer-pos">
                                    <div class="pos-dot disabled"><i class="fa-solid fa-ban"></i></div>
                                    <div class="pos-dot interactive-scale" data-pos="pos-tc" data-action="set-grid-pos" data-type="timer"><i class="fa-solid fa-arrow-up"></i></div>
                                    <div class="pos-dot disabled"><i class="fa-solid fa-ban"></i></div>
                                    <div class="pos-dot interactive-scale" data-pos="pos-bl" data-action="set-grid-pos" data-type="timer"><i class="fa-solid fa-arrow-down-left"></i></div>
                                    <div class="pos-dot interactive-scale active" data-pos="pos-bc" data-action="set-grid-pos" data-type="timer"><i class="fa-solid fa-arrow-down"></i></div>
                                    <div class="pos-dot interactive-scale" data-pos="pos-br" data-action="set-grid-pos" data-type="timer"><i class="fa-solid fa-arrow-down-right"></i></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="ve-preview-sticky">
                        <div class="fs-13 fw-bold text-primary mb-15"><i class="fa-solid fa-eye me-1"></i> معاينة على المتجر</div>
                        <div class="promo-icon-wrapper" id="grid-preview-box" style="width: 150px; height: 150px; border-radius: 12px; background: #1e293b; overflow: visible;">
                            <div id="grid-live-badge"></div>
                            <div id="grid-live-timer"></div>
                            <div class="img-wrap" style="border-radius: 12px;">
                                <div style="width: 100%; height: 100%; background: linear-gradient(45deg, #1e293b, #334155); display: flex; align-items: center; justify-content: center; color: #64748b;"><i class="fa-solid fa-image fa-2x"></i></div>
                            </div>
                        </div>
                        <div id="grid-collision-warning" class="fs-10 text-danger mt-15 fw-bold text-center hide-element">
                            <i class="fa-solid fa-triangle-exclamation me-1"></i> الشارة والمؤقت متداخلان!
                        </div>
                    </div>
                </div>
            </div>

            <div id="b-pane-story" class="builder-pane">
                <div class="setting-item-row mb-15" style="background: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.3);">
                    <div>
                        <span class="switch-title" style="color: #3b82f6;"><i class="fa-solid fa-layer-group me-1"></i> إبراز في شريط الحالات العلوي (Story Bar)</span>
                    </div>
                    <label class="switch interactive-scale"><input type="checkbox" id="offer-in-story" data-action="toggle-story-builder"><span class="slider"></span></label>
                </div>

                <div class="ve-workspace hide-element" id="story-builder-container" style="margin-top: 0;">
                    <div class="ve-controls">
                        <div id="story-prods-container" class="form-group mb-15">
                            <label class="form-label text-warning" style="font-size: 13px;"><i class="fa-solid fa-star me-1"></i> اختر المنتجات لتظهر في الستوري</label>
                            <div id="story-selection-prods" class="smart-tree-container custom-scrollbar" style="border: 1px solid var(--border); padding: 10px; border-radius: 8px; max-height: 200px; background: var(--input-bg);"></div>
                            <small class="text-muted d-block mt-5 fs-11"><i class="fa-solid fa-circle-info me-1"></i> ستظهر هنا فقط المنتجات التي اخترتها في التبويب الأول.</small>
                        </div>

                        <div class="sb-section">
                            <div class="sb-title"><i class="fa-solid fa-shapes me-1"></i> شكل أيقونة القصة الأساسية</div>
                            <div class="sb-grid">
                                <div class="sb-btn interactive-scale active" data-action="update-story-shape" data-val="shape-square"><i class="fa-solid fa-square" style="border-radius: 4px;"></i><span>مربع حواف</span></div>
                                <div class="sb-btn interactive-scale" data-action="update-story-shape" data-val="shape-squircle"><i class="fa-solid fa-square" style="border-radius: 14px;"></i><span>مربع آبل</span></div>
                                <div class="sb-btn interactive-scale" data-action="update-story-shape" data-val="shape-circle"><i class="fa-solid fa-circle"></i><span>دائرة</span></div>
                                <div class="sb-btn interactive-scale" data-action="update-story-shape" data-val="shape-teardrop"><i class="fa-solid fa-droplet"></i><span>دمعة</span></div>
                                <div class="sb-btn interactive-scale" data-action="update-story-shape" data-val="shape-leaf"><i class="fa-solid fa-leaf"></i><span>ورقة شجر</span></div>
                            </div>
                        </div>
                    </div>

                    <div class="ve-preview-sticky">
                        <div class="fs-13 fw-bold text-primary mb-15"><i class="fa-solid fa-eye me-1"></i> معاينة الأيقونة العلوية</div>
                        <div style="display: flex; flex-direction: column; align-items: center;">
                            <div class="promo-icon-wrapper shape-square" id="sb-preview-icon" style="border-radius: 12px; width: 75px; height: 75px; overflow: visible; border: 2.5px solid var(--primary);">
                                <div id="sb-preview-badge"></div>
                                <div id="sb-preview-timer"></div>
                                <div class="img-wrap shape-square" id="sb-preview-image-box">
                                    <div id="sb-live-img" style="width: 100%; height: 100%; background: #334155;"></div>
                                </div>
                            </div>
                            <div class="fs-11 fw-bold mt-10" style="color:#cbd5e1;" id="sb-live-title">اسم العرض</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal-actions-row border-top-solid mt-20 pt-15">
                <button type="button" class="btn btn-primary interactive-scale" data-action="save-offer">حفظ الحملة واعتمادها</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">إلغاء</button>
            </div>
        </div>
    `,

    alertEditModal: () => `
        <div class="modal-content modal-md">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title" id="alert-modal-title"><i class="fa-solid fa-paper-plane me-1"></i> إرسال تنبيه جديد</h2>
            
            <div class="form-row-2 flex-gap-10">
                <div class="form-group flex-1">
                    <label class="form-label">نوع التنبيه</label>
                    <select id="alert-type" class="form-input select-shared" data-action="toggle-alert-type">
                        <option value="notification">إشعار جرس (هادئ)</option>
                        <option value="popup">رسالة منبثقة (Popup)</option>
                    </select>
                </div>
                <div class="form-group flex-1">
                    <label class="form-label">الاستهداف (لمن؟)</label>
                    <select id="alert-target-type" class="form-input select-shared" data-action="toggle-alert-tgt">
                        <option value="all">لجميع العملاء</option>
                        <option value="tier">لمستوى محدد</option>
                        <option value="user">لعميل محدد (ID)</option>
                    </select>
                </div>
            </div>

            <div id="popup-advanced-fields" class="hide-element mt-15" style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 12px; border: 1px dashed var(--border-color);">
                <div class="form-row-2 flex-gap-10">
                    <div class="form-group flex-1">
                        <label class="form-label text-warning"><i class="fa-solid fa-eye me-1"></i> سقف الظهور للعميل</label>
                        <input type="text" inputmode="numeric" pattern="[0-9]*" id="alert-max-views" class="form-input font-numeric" dir="ltr" value="3">
                    </div>
                    <div class="form-group flex-1">
                        <label class="form-label"><i class="fa-solid fa-ticket me-1"></i> كود الخصم (إن وجد)</label>
                        <input type="text" id="alert-coupon-code" class="form-input font-numeric" dir="ltr" placeholder="WINTER50">
                    </div>
                </div>
                <div class="form-group mt-10 mb-0">
                    <label class="form-label"><i class="fa-solid fa-link me-1"></i> رابط التوجيه / الزر (CTA)</label>
                    <input type="url" id="alert-action-link" class="form-input font-numeric" dir="ltr" placeholder="https://telecard.com/offers">
                    <small class="text-muted fs-11 mt-5">عند النقر على المنبثقة، سيتم توجيه العميل لهذا الرابط.</small>
                </div>
            </div>

            <div id="alert-target-tier-box" class="form-group hide-element mt-10">
                <label class="form-label">اختر المستوى المستهدف</label>
                <select id="alert-target-tier" class="form-input select-shared"></select>
            </div>
            
            <div id="alert-target-user-box" class="form-group hide-element mt-10">
                <label class="form-label">رقم العميل (ID)</label>
                <input type="text" id="alert-target-user" class="form-input font-numeric" dir="ltr" placeholder="مثال: 105">
            </div>

            <div class="form-group mt-10">
                <label class="form-label">عنوان الرسالة</label>
                <input type="text" id="alert-title" class="form-input" placeholder="مثال: تنبيه هام! أو خصم خاص!">
            </div>

            <div class="form-group">
                <label class="form-label">نص الرسالة</label>
                <textarea id="alert-body" class="form-input" rows="3" placeholder="اكتب تفاصيل التنبيه أو الإعلان هنا..."></textarea>
            </div>

            <div class="form-group">
                <label class="form-label">وقت انتهاء الصلاحية (اختياري)</label>
                <div class="custom-field interactive-scale w-100" data-action="open-calendar" data-type="expiry" data-section="alert" data-time="true">
                    <div class="field-content">
                        <i class="fa-regular fa-calendar text-warning"></i>
                        <span class="field-text placeholder-text font-numeric" id="date-expiry-alert">DD/MM/YYYY HH:MM</span>
                    </div>
                    <input type="hidden" id="alert-expiry">
                </div>
            </div>

            <div class="modal-actions-row border-top-solid mt-15 pt-15">
                <button type="button" class="btn btn-primary interactive-scale" data-action="send-alert">إرسال التنبيه</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">إلغاء</button>
            </div>
        </div>
    `,

    bannerEditModal: () => `
        <div class="modal-content">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title"><i class="fa-solid fa-image me-1"></i> إضافة لافتة (Banner)</h2>
            
            <div class="upload-area interactive-scale" id="ban-img-wrap" data-action="trigger-click" data-target="ban-img-input">
                <div class="btn-remove-img interactive-scale" data-action="clear-img" data-preview="ban-img" data-wrap="ban-img-wrap" data-input="ban-img-input"><i class="fa-solid fa-xmark"></i></div>
                <i class="fa-solid fa-cloud-arrow-up"></i><span>اختر صورة</span>
                <img id="ban-img" class="preview-img">
            </div>
        <input type="file" id="ban-img-input" class="hide-element" accept="image/png, image/webp, image/jpeg, image/gif" data-action="upload-img" data-preview="ban-img" data-wrap="ban-img-wrap">            
            <div class="form-group mt-15">
                <label class="form-label">رابط عند الضغط (اختياري)</label>
                <input type="text" id="ban-link" class="form-input font-numeric" dir="ltr" placeholder="https://...">
            </div>
            
            <div class="modal-actions-row border-top-solid mt-15 pt-15">
                <button type="button" class="btn btn-primary interactive-scale" data-action="save-banner">إضافة</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">إلغاء</button>
            </div>
        </div>
    `,

    batchCollisionModal: (collisions) => {
        const listHtml = collisions.map(c => `
            <label class="copy-row cursor-pointer collision-item-row">
                <input type="checkbox" class="col-chk-item collision-chkbox" value="${_esc(c.prodId)}" checked>
                <div class="cr-content w-100 align-items-start">
                    <span class="fw-bold text-main fs-13 text-truncate collision-prod-name">${_esc(c.prodName)}</span>
                    <div class="fs-11 text-danger mt-5"><i class="fa-solid fa-link"></i> مرتبط بـ: ${_esc(c.oldOfferName)}</div>
                </div>
            </label>
        `).join('');

        return `
            <div class="modal-content tier-modal-content">
                <div class="modal-close-btn interactive-scale" id="col-btn-close-icon"><i class="fa-solid fa-xmark"></i></div>
                <h2 class="main-title mb-15 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> تضارب في التخفيضات!</h2>
                
                <div class="tsm-list-container custom-scrollbar mb-20 collision-list-container">
                    ${listHtml}
                </div>

                <div class="modal-actions-row border-top-solid mt-15 pt-15">
                    <button type="button" class="btn btn-primary interactive-scale" id="col-btn-confirm">تأكيد السحب</button>
                    <button type="button" class="btn btn-outline-danger interactive-scale" id="col-btn-cancel">إلغاء</button>
                </div>
            </div>
        `;
    }
};
