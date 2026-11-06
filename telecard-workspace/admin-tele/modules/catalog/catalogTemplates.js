// ============================================================================
// 📦 قوالب المنتجات والكتالوج (modules/catalog/catalogTemplates.js) - Enterprise V20.5 💎
// 🎯 الوظيفة: توليد الـ HTML المتقدم للأقسام، المنتجات، الباقات الفرعية، الخزنة، والبلدان
// 🌟 التحديثات المعمارية:
// 1. Standard Header Selects 🗂️: اعتماد .select-micro.select-shared في أزرار تبديل تخطيط الشبكة.
// 2. Upload Box Architecture 🖼️: توحيد صناديق رفع صور الأقسام والمنتجات (#c-img-wrap و #pr-img-wrap) لتكون قابلة للنقر مباشرة مع الأيقونة الذهبية .upload-icon-gold والنص المعتمد .upload-hint-text.
// 3. Animation Cleanup 🧹: إزالة فئات الحركة الوهمية غير المعرفة (animate__animated animate__fadeIn) من عناصر الباقات.
// 4. Modal Overlays & Badges 💎: توحيد كبسولات الإغلاق وأيقونات الحذف (.btn-remove-img مع fa-xmark).
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;

export const CatalogTemplates = {
    
    emptyPackages: () => RenderHelpers.emptyState('fa-solid fa-layer-group text-muted', 'لا توجد باقات', 'لم يتم إضافة أي باقات حتى الآن. استخدم النموذج أعلاه للإضافة.'),
    emptyDefectiveCodes: () => RenderHelpers.emptyState('fa-solid fa-check-circle text-success', 'السجل نظيف', 'لا توجد أكواد تالفة حالياً!'),
    emptyFolder: () => RenderHelpers.emptyState('fa-solid fa-folder-open text-muted', 'القسم فارغ', 'ابدأ بإضافة منتجاتك الآن.'),
    emptyRootCatalog: () => RenderHelpers.emptyState('fa-solid fa-boxes-stacked text-muted', 'المتجر فارغ تماماً', 'ابدأ بإضافة قسم رئيسي لتتمكن من رفع منتجاتك.'),
    emptyCountries: () => RenderHelpers.emptyState('fa-solid fa-flag-checkered text-muted', 'لا توجد دول', 'لم يتم تفعيل أي دول بعد.'),
    emptyVault: () => RenderHelpers.emptyState('fa-solid fa-vault text-muted', 'الخزنة فارغة', 'الخزنة لا تحتوي على صناديق.'),
    emptyCoupons: () => RenderHelpers.emptyState('fa-solid fa-ticket text-muted', 'لا توجد كوبونات', 'لا توجد كوبونات فعالة حالياً.'),

    mockInput: (num, label) => `
        <div class="mock-input interactive-scale" data-action="toggle-mock-edit" data-val="${num}" title="اضغط لتعديل التسمية">
            <span id="mock-txt-${num}" class="mock-label">${_esc(label)}</span>
            <div class="mock-edit-btn interactive-scale">
                <i id="mock-icon-${num}" class="fa-solid fa-pen"></i>
            </div>
        </div>
    `,
    
    catRootActions: (layoutCols = 2) => `
        <div class="header-actions-row">
            <select class="select-micro select-shared" data-action="change-grid-layout" title="تخطيط الشبكة">
                <option value="1" ${layoutCols == 1 ? 'selected' : ''}>1 بالسطر</option>
                <option value="2" ${layoutCols == 2 ? 'selected' : ''}>2 بالسطر</option>
                <option value="3" ${layoutCols == 3 ? 'selected' : ''}>3 بالسطر</option>
                <option value="4" ${layoutCols == 4 ? 'selected' : ''}>4 بالسطر</option>
            </select>
            <button class="btn btn-primary btn-add-cat interactive-scale" data-action="open-cat-modal">
                <i class="fa-solid fa-plus me-1"></i> إضافة قسم
            </button>
            <button type="button" id="drag-edit-mode-btn" class="btn btn-ghost interactive-scale" data-action="toggle-drag-edit" title="تفعيل ترتيب العناصر">
                <i class="fa-solid fa-lock me-1"></i> ترتيب
            </button>
        </div>
    `,
    
    catSubActions: (layoutCols = 2) => `
        <div class="header-actions-row">
            <select class="select-micro select-shared" data-action="change-grid-layout">
                <option value="1" ${layoutCols == 1 ? 'selected' : ''}>1 بالسطر</option>
                <option value="2" ${layoutCols == 2 ? 'selected' : ''}>2 بالسطر</option>
                <option value="3" ${layoutCols == 3 ? 'selected' : ''}>3 بالسطر</option>
                <option value="4" ${layoutCols == 4 ? 'selected' : ''}>4 بالسطر</option>
            </select>
            <button class="btn btn-ghost btn-compact interactive-scale" data-action="cat-back" title="رجوع">
                <i class="fa-solid fa-arrow-right"></i>
            </button>
            <button class="btn btn-primary btn-add-cat interactive-scale" data-action="open-cat-modal">
                <i class="fa-solid fa-folder-plus me-1"></i> قسم فرعي
            </button>
            <button class="btn btn-primary btn-add-prod interactive-scale" data-action="open-prod-modal">
                <i class="fa-solid fa-box-archive me-1"></i> منتج جديد
            </button>
            <button type="button" id="drag-edit-mode-btn" class="btn btn-ghost interactive-scale" data-action="toggle-drag-edit">
                <i class="fa-solid fa-lock me-1"></i> ترتيب
            </button>
        </div>
    `,
    
    catCard: (c, index, currCatId, dragClass = '') => {
        const orderValue = (c.order !== undefined) ? Number(c.order) : (c.sortOrder !== undefined ? Number(c.sortOrder) : index);
        const iconClass = currCatId === null ? 'root' : 'sub';
        const iconName = currCatId === null ? 'fa-folder' : 'fa-folder-open';
        const catImg = c.img || c.image;
        
        return `
        <div id="cat-card-${_esc(c.id)}" class="item-box click-shrink ${dragClass}" data-action="enter-folder" data-type="cat" data-id="${_esc(c.id)}" data-order="${orderValue}" data-enter="${_esc(c.id)}">
            <div class="item-actions">
                <div class="action-mini btn-edit-mini interactive-scale" data-action="open-cat-modal" data-id="${_esc(c.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></div>
                <div class="action-mini btn-del-mini interactive-scale" data-action="delete-item" data-type="cat" data-id="${_esc(c.id)}" title="حذف"><i class="fa-solid fa-trash"></i></div>
            </div>
            <div class="item-img">
                ${catImg ? `<img src="${_esc(catImg)}" class="zoomable-img" draggable="false" data-action="open-img-viewer" data-src="${_esc(catImg)}">` : `<i class="fa-solid ${iconName} cat-folder-icon ${iconClass}"></i>`}
            </div>
            <div class="item-info">${_esc(c.name)}</div>
            <div class="order-indicator num-en font-numeric" dir="ltr">${_enNum(index + 1)}</div>
        </div>`;
    },
    
    prodCard: (p, index, dragClass = '') => {
        const orderValue = (p.order !== undefined) ? Number(p.order) : (p.sortOrder !== undefined ? Number(p.sortOrder) : index);
        const prodImg = p.img || p.image;
        
        let safePrice = '0.00 $';
        if (p.type === 'select') {
            const optsCount = Array.isArray(p.options) ? p.options.filter(o => o && o.isActive !== false).length : 0;
            safePrice = optsCount > 0 ? `${_enNum(optsCount)} باقات متوفرة` : 'باقات متعددة';
        } else {
            const displayPrice = Number(p.price || 0);
            if (displayPrice > 0 && displayPrice < 9999999) {
                const dec = displayPrice < 0.0001 ? 6 : (displayPrice < 0.01 ? 4 : 2);
                safePrice = RenderHelpers.formatMoney(displayPrice, 'USD', dec);
            } else {
                const cost = Number(p.costPrice || p.unitCost || 0);
                safePrice = cost > 0 ? `<span class="text-muted fs-10">(تكلفة)</span> ${RenderHelpers.formatMoney(cost, 'USD', 2)}` : 'يعتمد على المستوى';
            }
        }
        
        let statusBadgeHtml = '';
        if (p.requiresAdminAttention) {
            statusBadgeHtml = `<div class="admin-alert-badge-wrap"><span class="badge-micro badge-micro-danger" title="${_esc(p.syncNote || 'يتطلب تدخل الإدارة فوراً')}"><i class="fa-solid fa-triangle-exclamation"></i></span></div>`;
        } else if (p.isActive === false) {
            statusBadgeHtml = `<div class="admin-alert-badge-wrap"><span class="badge-micro badge-micro-dark" title="المنتج مخفي بالكامل عن واجهة العملاء"><i class="fa-solid fa-eye-slash"></i> مخفي</span></div>`;
        } else if (p.isAvailable === false || p.isManuallyPaused === true) {
            statusBadgeHtml = `<div class="admin-alert-badge-wrap"><span class="badge-micro badge-micro-warning" title="المنتج ظاهر للعملاء كـ (غير متوفر حالياً)"><i class="fa-solid fa-pause"></i> غير متوفر</span></div>`;
        }

        return `
        <div id="prod-card-${_esc(p.id)}" class="item-box click-shrink ${dragClass}" data-action="open-prod-modal" data-type="prod" data-id="${_esc(p.id)}" data-order="${orderValue}">
            ${statusBadgeHtml}
            <div class="item-actions">
                <div class="action-mini btn-edit-mini interactive-scale" data-action="open-prod-modal" data-id="${_esc(p.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></div>
                <div class="action-mini btn-del-mini interactive-scale" data-action="delete-item" data-type="prod" data-id="${_esc(p.id)}" title="حذف"><i class="fa-solid fa-trash"></i></div>
            </div>
            <div class="item-img">
                ${prodImg ? `<img src="${_esc(prodImg)}" class="zoomable-img" draggable="false" data-action="open-img-viewer" data-src="${_esc(prodImg)}">` : `<i class="fa-solid fa-cube"></i>`}
            </div>
            <div class="item-info">
                <div class="item-name-text">${_esc(p.name)}</div>
                <span class="prod-price-hint num-en font-numeric" dir="ltr">${safePrice}</span>
            </div>
            <div class="order-indicator num-en font-numeric" dir="ltr">${_enNum(index + 1)}</div>
        </div>`;
    },

    vaultCard: (pool, availCount, soldCount, linkedProdsCount, defectiveCount, healthPercent) => {
        let status = 'active';
        if (availCount === 0) status = 'empty';
        else if (availCount <= Number(pool.alertLimit || 5)) status = 'low';

        const unitCost = Number(pool.unitCostUsd ?? pool.costPrice ?? 0);
        const frozenTotalUsd = availCount > 0 && unitCost > 0 ? (availCount * unitCost) : 0;
        
        return `
        <div class="vault-pro-card vault-${status} click-shrink" data-id="${_esc(pool.id)}" data-status="${status}">
            <div class="vault-actions">
                <button class="action-mini btn-edit-mini interactive-scale" data-action="open-vault-modal" data-id="${_esc(pool.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                <button class="action-mini btn-del-mini interactive-scale" data-action="delete-item" data-type="vault" data-id="${_esc(pool.id)}" title="حذف"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="vault-icon-wrap">
                <i class="fa-solid ${status === 'empty' ? 'fa-box-open' : (status === 'low' ? 'fa-triangle-exclamation' : 'fa-vault')}"></i>
            </div>
            <div class="vault-details">
                <h3 class="vault-title">${_esc(pool.name)}</h3>
                <div class="vault-stats-row">
                    <div class="v-stat-chip ${status === 'empty' ? 'chip-danger' : (status === 'low' ? 'chip-warning' : 'chip-success')}" title="متاح (${healthPercent}%)">
                        <i class="fa-solid fa-check-circle"></i>
                        <span class="num-en font-numeric" dir="ltr">${_enNum(availCount)}</span>
                    </div>
                    <div class="v-stat-chip chip-sold" title="مستهلك/مسحوب">
                        <i class="fa-solid fa-cart-shopping"></i>
                        <span class="num-en font-numeric" dir="ltr">${_enNum(soldCount)}</span>
                    </div>
                    <div class="v-stat-chip chip-danger interactive-scale" data-action="view-defective-codes" data-id="${_esc(pool.id)}" title="الأكواد التالفة">
                        <i class="fa-solid fa-bug"></i>
                        <span class="num-en font-numeric" dir="ltr">${_enNum(defectiveCount)}</span>
                    </div>
                </div>
                <div class="vault-stats-row mt-5">
                    <div class="v-stat-chip chip-info flex-1 vault-chip-center" title="المنتجات المربوطة">
                        <i class="fa-solid fa-link"></i> مرتبط: <span class="num-en font-numeric ms-1" dir="ltr">${_enNum(linkedProdsCount)}</span>
                    </div>
                    <div class="v-stat-chip ${unitCost > 0 ? 'chip-success' : 'chip-warning'} flex-1 vault-chip-center" title="${unitCost > 0 ? `تكلفة القطعة: ${unitCost}$ | إجمالي الأصول المجمدة: ${frozenTotalUsd.toFixed(2)}$` : 'لم يتم تحديد تكلفة القطعة لحساب الأصول المجمدة'}">
                        <i class="fa-solid fa-sack-dollar"></i> <span class="num-en font-numeric ms-1" dir="ltr">${unitCost > 0 ? RenderHelpers.formatMoney(frozenTotalUsd, 'USD', 2) : 'بدون تكلفة'}</span>
                    </div>
                </div>
            </div>
        </div>`;
    },
    
    gridContainer: (catsHtml, prodsHtml = '') => `
        ${catsHtml ? `<div class="items-grid cats-grid sortable-container ignore-elements mb-15">${catsHtml}</div>` : ''}
        <div class="items-grid prods-grid sortable-container ignore-elements">${prodsHtml}</div>
    `,
    
    defectiveCodesList: (codes) => {
        return codes.map(c => {
            const rawText = c.codeText || c.text || '';
            const safeTextForHtml = rawText.replace(/"/g, '&quot;');
            
            const orderRef = c.refundedOrderId ? `<span class="badge-micro badge-micro-warning num-en font-numeric ms-2" dir="ltr" title="نسخ رقم الطلب" data-action="copy-text" data-copy-text="${_esc(c.refundedOrderId)}">#ORD-${_esc(c.refundedOrderId.substring(0,6))}</span>` : '';
            const reasonText = c.reason || c.revokedReason || c.syncNote ? `<div class="fs-11 text-muted mt-5"><i class="fa-solid fa-comment-dots text-danger me-1"></i> ${_esc(c.reason || c.revokedReason || c.syncNote)}</div>` : '';
            
            return `
                <div class="copy-row success-copy-row defective-code-row interactive-scale">
                    <div class="flex-between w-100">
                        <span class="cr-value num-en font-numeric text-danger fw-bold" dir="ltr" title="نسخ الكود" data-action="copy-text" data-copy-text="${safeTextForHtml}">${_esc(rawText)}</span>
                        ${orderRef}
                    </div>
                    ${reasonText}
                </div>
                `;
        }).join('');
    },    
    
    defectiveModal: (poolName, codesHtml, hasMore) => {
        const loadMoreBtn = hasMore ? `
            <div class="text-center mt-10" id="btn-load-more-defective">
                <button type="button" class="btn btn-ghost btn-compact interactive-scale" data-action="load-more-defective">
                    <i class="fa-solid fa-angle-down me-1"></i> جلب المزيد من السجلات ☁️
                </button>
            </div>
        ` : '';
        
        return `
        <div id="defective-codes-overlay" class="modal-overlay">
            <div class="modal-content modal-md">
                <div class="modal-close-btn interactive-scale" data-action="close-defective-modal"><i class="fa-solid fa-xmark"></i></div>
                <h2 class="main-title text-danger"><i class="fa-solid fa-triangle-exclamation me-1"></i> الأكواد التالفة / المسترجعة</h2>
                
                <div class="alert-info mb-15">
                    <i class="fa-solid fa-circle-info me-1"></i> هذه الأكواد تم استرجاعها من قبل العملاء أو تم تعليمها كتالفة من قبل النظام.
                </div>

                <div class="form-group">
                    <label class="form-label">الصندوق: <span class="text-main fw-bold ms-1">${_esc(poolName)}</span></label>
                    <div id="defective-codes-list" class="dr-inputs-list mt-10 defective-scroll-list">
                        ${codesHtml || CatalogTemplates.emptyDefectiveCodes()}
                    </div>
                    ${loadMoreBtn}
                </div>
                
                <div class="modal-actions-row border-top-solid mt-15 pt-15">
                    <button type="button" class="btn btn-outline-danger interactive-scale w-100" data-action="close-defective-modal">إغلاق</button>
                </div>
            </div>
        </div>`;
    },
    
    smartTreeParent: (catId, catName, childrenHtml, isExpanded) => `
        <div class="tree-node ${isExpanded ? 'is-expanded' : ''}" id="tree-node-${catId}">
            <div class="tree-parent-row click-shrink">
                <i class="fa-solid fa-chevron-down tree-toggle-icon interactive-scale" data-action="toggle-tree-node"></i>
                <input type="checkbox" class="tree-checkbox tree-parent-cb" data-cat-id="${catId}" data-action="tree-parent-check">
                <div class="fw-bold text-main flex-1" data-action="toggle-tree-node">
                    <i class="fa-solid fa-folder-open text-info me-1"></i> ${_esc(catName)}
                </div>
            </div>
            <div class="tree-children">${childrenHtml}</div>
        </div>`,
    
    smartTreeChild: (prodId, prodName, imgSrc, isChecked, shortId) => `
        <label class="tree-item-row click-shrink">
            <input type="checkbox" class="tree-checkbox tree-child-cb" value="${prodId}" ${isChecked ? 'checked' : ''} data-action="tree-child-check">
            ${imgSrc ? `<img src="${_esc(imgSrc)}" class="tree-thumb">` : `<div class="tree-thumb-fallback"><i class="fa-solid fa-box"></i></div>`}
            <div class="d-flex flex-column">
                <span class="fs-12 fw-bold text-main">${_esc(prodName)}</span>
                <span class="fs-10 text-muted">ID: <span class="num-en text-warning font-numeric ms-1" dir="ltr">#${shortId}</span></span>
            </div>
        </label>`,
    
    smartTreeTier: (tier, isChecked) => {
        const isApi = tier.type === 'api';
        const typeBadge = isApi 
            ? `<span class="v-stat-chip chip-warning ms-2 fs-10"><i class="fa-solid fa-code"></i> مسار API</span>`
            : '';
            
        return `
        <label class="tree-item-row click-shrink">
            <input type="checkbox" class="tree-checkbox tree-tier-cb" value="${tier.id}" ${isChecked ? 'checked' : ''}>
            <div class="tree-thumb-fallback text-gold">
                <i class="fa-solid ${_esc(tier.icon || 'fa-user')}"></i>
            </div>
            <span class="fs-12 fw-bold text-main flex-1 flex-align-center">
                ${_esc(tier.name)} ${typeBadge}
            </span>
        </label>`;
    },
    
    pkgItem: (p, i) => {
        const pkgCost = Number(p.costPrice ?? p.cost_price ?? p.price ?? 0);
        const isFixed = Boolean(p.isFixedPrice === true || String(p.isFixedPrice).toLowerCase() === 'true');
        const fixedPrice = isFixed ? Number(p.fixedPriceUsd ?? p.price ?? 0) : 0;
        const isPaused = Boolean(p.isManuallyPaused === true || p.isAvailable === false || p.isActive === false);
        const vaultBadge = p.vaultPoolId ? `<span class="v-stat-chip chip-success fs-10 ms-1" title="مرتبطة بصندوق خزنة"><i class="fa-solid fa-vault"></i> خزنة</span>` : '';
        const extBadge = p.externalId ? `<span class="v-stat-chip chip-info fs-10 ms-1 font-numeric" dir="ltr" title="كود الباقة عند المورد">#${_esc(p.externalId)}</span>` : '';
        const fixedBadge = (isFixed && fixedPrice > 0) ? `<span class="v-stat-chip chip-warning fs-10 ms-1 font-numeric" dir="ltr" title="سعر بيع ثابت">ثابت: ${RenderHelpers.formatMoney(fixedPrice, 'USD', 2)}</span>` : '';
        const pausedBadge = isPaused ? `<span class="v-stat-chip chip-danger fs-10 ms-1"><i class="fa-solid fa-ban"></i> غير متوفرة</span>` : '';

        return `
        <div class="pkg-item ${isPaused ? 'pkg-paused' : ''}">
            <div class="flex-1 overflow-hidden">
                <span class="fw-bold">${_esc(p.name)}</span>
                ${vaultBadge}${extBadge}${fixedBadge}${pausedBadge}
            </div>
            <div class="num-en p-8 text-gold fw-bold font-numeric" dir="ltr" title="تكلفة الباقة">
                <small class="text-muted fs-10">التكلفة:</small> ${RenderHelpers.formatMoney(pkgCost, 'USD', 2)}
            </div>
            <div class="d-flex gap-2">
                <button type="button" class="btn btn-ghost btn-compact interactive-scale" data-action="toggle-pkg-avail" data-index="${i}" title="${isPaused ? 'تفعيل الباقة وجعلها متوفرة' : 'إيقاف الباقة مؤقتاً (غير متوفرة)'}">
                    <i class="fa-solid ${isPaused ? 'fa-play text-success' : 'fa-pause text-warning'}"></i>
                </button>
                <button type="button" class="btn btn-ghost btn-compact interactive-scale" data-action="edit-pkg" data-index="${i}" title="تعديل الباقة">
                    <i class="fa-solid fa-pen text-info"></i>
                </button>
                <button type="button" class="btn btn-danger btn-compact pkg-del interactive-scale" data-action="remove-pkg" data-index="${i}" title="حذف الباقة">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>`;
    },
    
    bannerItem: (b, index) => `
        <div id="banner-card-${_esc(b.id)}" class="item-box banner-item click-shrink" data-id="${_esc(b.id)}" data-order="${b.order ?? index}">
            <div class="item-actions">
                <div class="action-mini btn-del-mini interactive-scale" data-action="delete-banner" data-id="${_esc(b.id)}" title="حذف"><i class="fa-solid fa-trash"></i></div>
            </div>
            <div class="item-img">
                <img src="${_esc(b.img)}" class="zoomable-img" draggable="false" data-action="open-img-viewer" data-src="${_esc(b.img)}">
            </div>
            <div class="order-indicator banner-order-badge num-en font-numeric" dir="ltr">${_enNum(index + 1)}</div>
        </div>`,
    
    countryCard: (c) => `
        <div class="country-card-item">
            <div class="country-header">
                <div class="country-info-group">
                    <div class="country-flag-lg">${_esc(c.flag || '🇸🇦')}</div>
                    <div>
                        <div class="country-name-lg">${_esc(c.name || 'دولة غير محددة')}</div>
                        <div class="country-meta-text">
                            <span class="num-en font-numeric" dir="ltr">${_esc(c.dialCode || '+966')}</span>
                            <span class="meta-sep">|</span>
                            <span class="num-en font-numeric" dir="ltr">${_esc(c.currency || 'SAR')}</span>
                            <span class="meta-sep">|</span>
                            <span class="num-en font-numeric" dir="ltr">ISO: ${_esc(c.code || 'SA')}</span>
                        </div>
                    </div>
                </div>
                <div class="country-actions-side">
                    <div class="action-mini btn-edit-mini interactive-scale" data-action="open-country-modal" data-id="${_esc(c.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></div>
                    <div class="action-mini btn-del-mini interactive-scale" data-action="delete-item" data-type="country" data-id="${_esc(c.id)}" title="حذف"><i class="fa-solid fa-trash"></i></div>
                </div>
            </div>
        </div>`,
    
    dragEditBtnContent: (active) => active ? `<i class="fa-solid fa-unlock text-success me-1"></i> حفظ الترتيب` : `<i class="fa-solid fa-lock me-1"></i> ترتيب العناصر`,
    
    mockEditInput: (num, val) => `<input type="text" id="mock-input-${num}" class="inline-edit-input num-en font-numeric" value="${_esc(val)}" spellcheck="false" dir="ltr">`,

    catEditModal: () => `
        <div class="modal-content modal-md">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title" id="cat-modal-title"><i class="fa-solid fa-folder-plus me-1"></i> إضافة قسم</h2>
            
            <div class="form-group">
                <label class="form-label">اسم القسم</label>
                <input type="text" id="c-name" class="form-input" placeholder="مثال: بطاقات شحن، ألعاب، برامج...">
            </div>
            <div class="form-group">
                <label class="form-label">صورة القسم (اختياري)</label>
                <div class="upload-area interactive-scale" id="c-img-wrap" data-action="trigger-click" data-target="c-img-input">
                    <i class="fa-solid fa-cloud-arrow-up mb-5 upload-icon-gold upload-icon-lg"></i>
                    <span class="upload-hint-text">اضغط لرفع صورة</span>
                    <input type="file" id="c-img-input" class="hide-element" accept="image/png, image/webp, image/jpeg, image/gif" data-action="upload-img" data-preview="c-img" data-wrap="c-img-wrap">
                    <img id="c-img" class="hide-element">
                    <button type="button" class="btn-remove-img interactive-scale" data-action="clear-img" data-preview="c-img" data-wrap="c-img-wrap" data-input="c-img-input"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>

            <div class="modal-actions-row border-top-solid mt-15 pt-15">
                <button type="button" class="btn btn-primary interactive-scale" data-action="save-cat">حفظ القسم</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">إلغاء</button>
            </div>
        </div>
    `,

    prodEditModal: () => `
        <div class="modal-content modal-lg prod-modal-lg">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title" id="prod-modal-title"><i class="fa-solid fa-box-open me-1"></i> إدارة المنتج</h2>

            <div class="sub-tabs-container fh-tabs-container mb-15 d-flex gap-2 p-8">
                <button type="button" class="btn btn-compact btn-primary prod-tab-btn flex-1 active interactive-scale" id="btn-tab-prod-data" data-action="switch-prod-tab" data-tab="prod-tab-data">
                    <i class="fa-solid fa-box-open me-1"></i> البيانات والتسعير
                </button>
                <button type="button" class="btn btn-compact btn-ghost prod-tab-btn flex-1 interactive-scale" id="btn-tab-prod-status" data-action="switch-prod-tab" data-tab="prod-tab-status">
                    <i class="fa-solid fa-sliders me-1"></i> حالة النشر والتوفر
                </button>
            </div>           
            
            <div id="prod-tab-data" class="prod-tab-pane">
                <div class="form-group">
                    <label class="form-label">اسم المنتج</label>
                    <input type="text" id="pr-name" class="form-input" placeholder="مثال: شدات ببجي 660">
                </div>

                <div class="flex-wrap-gap-2 mb-15">
                    <div class="form-group mb-0 flex-1">
                        <label class="form-label text-warning"><i class="fa-solid fa-link me-1"></i> المورد (API)</label>
                        <select id="pr-supplier" class="form-input select-shared" data-action="toggle-supplier-link">
                            <option value="">-- بدون ربط (منتج محلي) --</option>
                        </select>
                    </div>
                    <div class="form-group mb-0 flex-1 hide-element" id="pr-supplier-ext-wrap">
                        <label class="form-label text-info"><i class="fa-solid fa-fingerprint me-1"></i> كود المنتج عند المورد</label>
                        <input type="text" id="pr-supplier-prod-id" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="أدخل ID المنتج">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">نوع المنتج (شكل الحقول للعميل)</label>
                    <select id="pr-type" class="form-input select-shared" data-action="render-prod-config">
                        <option value="simple">منتج بسيط (بدون حقول)</option>
                        <option value="single">حقل إدخال واحد (ID)</option>
                        <option value="double">حقلين (يوزر + باسورد)</option>
                        <option value="counter">عداد كمية + حقل (ID)</option>
                        <option value="select">باقات متعددة + حقل (ID)</option>
                    </select>
                </div>

                <div id="main-price-area" class="mb-15">
                    <div class="flex-wrap-gap-2 mb-10">
                        <div class="form-group mb-0 flex-1 min-w-140">
                            <label class="form-label text-success fw-bold">
                                <i class="fa-solid fa-sack-dollar me-1"></i> التكلفة الفعلية للمنتج ($)
                            </label>
                            <input type="text" inputmode="decimal" id="pr-cost" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="0.00">
                        </div>
                        <div class="form-group mb-0 flex-1 min-w-140">
                            <div class="flex-between mb-5">
                                <label for="pr-fixed-price" class="form-label m-0 text-warning flex-align-center gap-2 interactive-scale">
                                    <input type="checkbox" id="pr-fixed-price" class="tree-checkbox"> تثبيت سعر البيع ($)
                                </label>
                            </div>
                            <input type="text" inputmode="decimal" id="pr-fixed-val" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="السعر الثابت $">
                        </div>
                    </div>
                </div>

                <div id="simple-options" class="card mb-15 p-12 bg-body">
                    <div class="setting-item-row mb-10">
                        <div class="setting-text">
                            <span class="fs-13 fw-bold text-main">السماح بتحديد الكمية</span>
                            <p class="fs-11 text-muted m-0">تمكين العميل من شراء أكثر من قطعة في الطلب الواحد.</p>
                        </div>
                        <div class="setting-control">
                            <label class="switch interactive-scale">
                                <input type="checkbox" id="pr-allow-qty" data-action="toggle-simple-qty">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    <div class="form-group mb-0 hide-element">
                        <label class="form-label fs-12 text-muted">الحد الأقصى للكمية في الطلب الواحد</label>
                        <input type="text" inputmode="numeric" pattern="[0-9]*" id="pr-simple-max" class="form-input num-en font-numeric" dir="ltr" lang="en" value="10">
                    </div>
                </div>

                <div id="qty-area" class="mb-15 hide-element d-flex gap-2">
                    <div class="form-group flex-1 m-0">
                        <label class="form-label text-warning">الحد الأدنى للعداد</label>
                        <input type="text" inputmode="numeric" pattern="[0-9]*" id="pr-min" class="form-input num-en font-numeric" dir="ltr" lang="en" value="1">
                    </div>
                    <div class="form-group flex-1 m-0">
                        <label class="form-label text-danger">الحد الأقصى</label>
                        <input type="text" inputmode="numeric" pattern="[0-9]*" id="pr-max" class="form-input num-en font-numeric" dir="ltr" lang="en" value="1000">
                    </div>
                </div>

                <div id="pkg-area" class="card mb-15 hide-element p-12 bg-body">
                    <label class="form-label fw-bold text-main mb-10"><i class="fa-solid fa-layer-group me-1 text-info"></i> باقات المنتج الفرعية (خيارات القائمة)</label>
                    <input type="hidden" id="pkg-edit-index" value="-1">
                    <div class="pkg-inputs-container d-flex flex-column gap-2 mb-10">
                        <div class="flex-wrap-gap-2">
                            <input type="text" id="pkg-name" class="form-input mb-0 flex-1 min-w-140" placeholder="اسم الباقة (مثال: 60 شدة)">
                            <input type="text" inputmode="decimal" id="pkg-price" class="form-input mb-0 flex-1 min-w-140 num-en font-numeric" dir="ltr" lang="en" placeholder="التكلفة ($)">
                            <input type="text" inputmode="decimal" id="pkg-fixed-price" class="form-input mb-0 flex-1 min-w-140 num-en font-numeric" dir="ltr" lang="en" placeholder="سعر ثابت ($) اختياري">
                        </div>
                        <div class="flex-wrap-gap-2 flex-align-center">
                            <select id="pkg-vault" class="form-input mb-0 flex-1 min-w-140 select-shared">
                                <option value="">-- بدون خزنة للباقة (يدوي / مورد) --</option>
                            </select>
                            <input type="text" id="pkg-ext-id" class="form-input mb-0 flex-1 min-w-140 num-en font-numeric" dir="ltr" lang="en" placeholder="كود الباقة عند المورد (اختياري)">
                            <button type="button" id="btn-add-pkg" class="btn btn-success interactive-scale" data-action="add-package" title="إضافة / تحديث الباقة">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    </div>
                    <div id="pkg-list" class="pkg-list custom-scrollbar"></div>
                </div>

                <div class="form-group mb-15" id="parent-vault-group">
                    <label class="form-label"><i class="fa-solid fa-vault text-muted me-1"></i> ربط المنتج بصندوق أكواد (تسليم آلي)</label>
                    <select id="pr-vault" class="form-input select-shared">
                        <option value="">-- بدون ربط (منتج يدوي) --</option>
                    </select>
                    <div class="fs-11 text-muted mt-5"><i class="fa-solid fa-circle-info me-1"></i> إذا قمت بالربط، سيتم سحب كود من الصندوق وتسليمه للعميل فور نجاح الدفع.</div>
                </div>

                <div class="form-group">
                    <label class="form-label">الوصف، التعليمات، أو رسالة تظهر بعد الشراء</label>
                    <textarea id="pr-desc" class="form-input" rows="3" placeholder="ملاحظات للعميل..."></textarea>
                </div>

                <div class="form-group">
                    <label class="form-label">صورة المنتج</label>
                    <div class="upload-area interactive-scale" id="pr-img-wrap" data-action="trigger-click" data-target="pr-img-input">
                        <i class="fa-solid fa-cloud-arrow-up mb-5 upload-icon-gold upload-icon-lg"></i>
                        <span class="upload-hint-text">اضغط لرفع صورة</span>
                        <input type="file" id="pr-img-input" class="hide-element" accept="image/png, image/webp, image/jpeg, image/gif" data-action="upload-img" data-preview="pr-img" data-wrap="pr-img-wrap">
                        <img id="pr-img" class="hide-element">
                        <button type="button" class="btn-remove-img interactive-scale" data-action="clear-img" data-preview="pr-img" data-wrap="pr-img-wrap" data-input="pr-img-input"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>

                <div id="preview-area" class="form-group">
                    <label class="form-label"><i class="fa-solid fa-eye text-primary me-1"></i> معاينة شكل المنتج للعميل</label>
                    <div class="card p-15 bg-body mb-0">
                        <div id="mock-container" class="d-flex flex-column gap-2 mb-15"></div>
                        <input type="hidden" id="h-lbl1" value="">
                        <input type="hidden" id="h-lbl2" value="">
                        <div id="universal-price-preview" class="mt-10 pt-15 border-top-dashed"></div>
                    </div>
                </div>
            </div>

            <div id="prod-tab-status" class="prod-tab-pane hide-element">
                <div class="card mb-15">
                    <div class="setting-item-row mb-0">
                        <div class="setting-text">
                            <h3 class="fs-14 fw-bold mb-5 text-main">
                                <i class="fa-solid fa-eye text-primary me-1"></i> إظهار المنتج في المتجر
                            </h3>
                            <p class="fs-12 text-muted m-0">تفعيل ظهور المنتج للعملاء في الكتالوج. عند إيقافه، يصبح المنتج كمسودة مخفية تماماً عن المتجر.</p>
                        </div>
                        <div class="setting-control">
                            <label class="switch interactive-scale">
                                <input type="checkbox" id="pr-active" checked>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="card mb-15">
                    <div class="setting-item-row mb-0">
                        <div class="setting-text">
                            <h3 class="fs-14 fw-bold mb-5 text-main">
                                <i class="fa-solid fa-circle-check text-success me-1"></i> متاح للطلب والشراء
                            </h3>
                            <p class="fs-12 text-muted m-0">السماح للعملاء بطلب المنتج. عند إيقافه، يظل المنتج معروضاً في المتجر ولكنه يحمل علامة (غير متوفر حالياً).</p>
                        </div>
                        <div class="setting-control">
                            <label class="switch interactive-scale">
                                <input type="checkbox" id="pr-available" checked>
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="card mb-15" id="pr-hide-price-row">
                    <div class="setting-item-row mb-0">
                        <div class="setting-text">
                            <h3 class="fs-14 fw-bold mb-5 text-main">
                                <i class="fa-solid fa-tag text-warning me-1"></i> إخفاء السعر في شبكة المنتجات
                            </h3>
                            <p class="fs-12 text-muted m-0">إخفاء كبسولة السعر في الواجهة الرئيسية للمنتجات التي يعتمد سعرها على مدخلات العميل داخل الصفحة.</p>
                        </div>
                        <div class="setting-control">
                            <label class="switch interactive-scale">
                                <input type="checkbox" id="pr-hide-price">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal-actions-row border-top-solid mt-15 pt-15">
                <button type="button" class="btn btn-primary interactive-scale" data-action="save-prod">حفظ المنتج</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">إلغاء</button>
            </div>
        </div>
    `,

    countryEditModal: () => `
        <div class="modal-content modal-md">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title" id="country-modal-title"><i class="fa-solid fa-globe me-1"></i> إدارة دولة</h2>
            
            <input type="hidden" id="country-edit-id" value="">

            <div class="form-group">
                <label class="form-label">اسم الدولة (بالعربية)</label>
                <input type="text" id="country-name" class="form-input" placeholder="مثال: السعودية" data-action="detect-country" data-oninput="detect-country">
            </div>

            <div class="d-flex gap-2 mb-15">
                <div class="form-group flex-1 mb-0">
                    <label class="form-label text-info">كود الدولة (ISO)</label>
                    <input type="text" id="country-code" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="مثال: SA">
                </div>
                <div class="form-group flex-1 mb-0">
                    <label class="form-label text-warning">علم الدولة (Emoji)</label>
                    <input type="text" id="country-flag" class="form-input" placeholder="مثال: 🇸🇦">
                </div>
            </div>

            <div class="d-flex gap-2 mb-15">
                <div class="form-group flex-1 mb-0">
                    <label class="form-label text-success">مفتاح الاتصال</label>
                    <input type="text" id="country-dial" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="مثال: +966">
                </div>
                <div class="form-group flex-1 mb-0">
                    <label class="form-label">طول رقم الهاتف</label>
                    <input type="text" inputmode="numeric" pattern="[0-9]*" id="country-phone-len" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="مثال: 9">
                </div>
            </div>

            <label for="country-active" class="form-check-inline interactive-scale mb-10">
                <input type="checkbox" id="country-active" class="tree-checkbox" checked>
                <span class="text-success fw-bold fs-12">تفعيل الدولة (تظهر للعملاء أثناء التسجيل)</span>
            </label>
            
            <label for="country-banned" class="form-check-inline interactive-scale mb-15">
                <input type="checkbox" id="country-banned" class="tree-checkbox">
                <span class="text-danger fw-bold fs-12"><i class="fa-solid fa-ban me-1"></i> حظر الدولة (منع أي تسجيل جديد منها)</span>
            </label>

            <div class="modal-actions-row border-top-solid mt-15 pt-15">
                <button type="button" class="btn btn-primary interactive-scale" data-action="save-country">حفظ الدولة</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">إلغاء</button>
            </div>
        </div>
    `,

    vaultEditModal: (pool = null) => {
    const isEdit = !!pool;
    return `
        <div class="modal-content modal-md">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title" id="vault-modal-title"><i class="fa-solid fa-vault me-1"></i> ${isEdit ? 'إدارة وإضافة أكواد للصندوق' : 'إنشاء صندوق جديد'}</h2>
            
            <input type="hidden" id="v-pool-id" value="${pool ? _esc(pool.id) : ''}">

            <div class="form-group">
                <label class="form-label">اسم الصندوق (للإدارة فقط)</label>
                <input type="text" id="v-name" class="form-input" placeholder="مثال: أكواد ببجي 660" value="${pool ? _esc(pool.name) : ''}">
            </div>

            <div class="d-flex gap-2 mb-15">
                <div class="form-group flex-1 mb-0">
                    <label class="form-label text-success"><i class="fa-solid fa-sack-dollar me-1"></i> تكلفة الكود الواحد ($)</label>
                    <input type="text" inputmode="decimal" id="v-unit-cost" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="مثال: 0.90" value="${pool ? (pool.unitCostUsd ?? pool.costPrice ?? '') : ''}">
                </div>
                <div class="form-group flex-1 mb-0">
                    <label class="form-label text-warning"><i class="fa-solid fa-bell me-1"></i> تنبيه نقص المخزون</label>
                    <input type="text" inputmode="numeric" pattern="[0-9]*" id="v-alert-limit" class="form-input num-en font-numeric" dir="ltr" lang="en" value="${pool ? (pool.alertLimit || 5) : 5}">
                </div>
            </div>

            <div class="form-group">
                <label class="form-label text-success"><i class="fa-solid fa-plus-circle me-1"></i> إضافة أكواد جديدة (كود في كل سطر)</label>
                <textarea id="v-codes" class="form-input vault-textarea num-en font-numeric" dir="ltr" lang="en" rows="5" placeholder="كود1\nكود2\nكود3..."></textarea>
                <div class="fs-11 text-muted mt-5"><i class="fa-solid fa-circle-info me-1"></i> الحد الأقصى للإضافة في الدفعة الواحدة هو 20,000 كود. يمكنك الحفظ بدون أكواد جديدة لتحديث اسم أو تكلفة الصندوق.</div>
            </div>

            <div id="v-stats-area" class="${isEdit ? '' : 'hide-element'}">
                <h4 class="fs-13 fw-bold mb-10 border-top-dashed pt-15"><i class="fa-solid fa-chart-simple me-1"></i> إحصائيات الصندوق والأصول المجمدة</h4>
                <div class="flex-wrap-gap-2">
                    <div class="stat-mini stat-mini-success flex-1 text-center p-10">
                        <div class="fs-11 text-success mb-5">الأكواد المتاحة</div>
                        <div id="v-stat-avail" class="num-en fw-900 fs-14 text-success font-numeric" dir="ltr">0</div>
                    </div>
                    <div class="stat-mini flex-1 text-center p-10">
                        <div class="fs-11 text-muted mb-5">تم بيعها/سحبها</div>
                        <div id="v-stat-sold" class="num-en fw-900 fs-14 font-numeric" dir="ltr">0</div>
                    </div>
                    <div class="stat-mini stat-mini-warning flex-1 text-center p-10">
                        <div class="fs-11 text-warning mb-5">الأصول المجمدة ($)</div>
                        <div id="v-stat-frozen" class="num-en fw-900 fs-14 text-warning font-numeric" dir="ltr">0.00 $</div>
                    </div>
                </div>
                <div id="v-financial-stats" class="mt-10 p-10 vault-financial-box">
                    <div class="flex-between mb-5">
                        <span class="fw-bold text-success"><i class="fa-solid fa-sack-dollar me-1"></i> صافي الأرباح المحققة:</span>
                        <span class="text-muted fs-11" id="v-stat-profit-val"><i class="fa-solid fa-circle-notch fa-spin text-success me-1"></i> جاري الحساب...</span>
                    </div>
                    <div class="flex-between">
                        <span class="text-muted"><i class="fa-solid fa-chart-line me-1"></i> إجمالي المبيعات:</span>
                        <span class="text-muted fs-11" id="v-stat-revenue-val">---</span>
                    </div>
                </div> 
                </div>

            <div class="modal-actions-row border-top-solid mt-15 pt-15">
                <button type="button" class="btn btn-primary interactive-scale" data-action="save-vault">حفظ الصندوق والأكواد</button>
                <button type="button" class="btn btn-outline-danger interactive-scale" data-action="close-modal">إلغاء</button>
            </div>
        </div>
    `;
}
    
};
