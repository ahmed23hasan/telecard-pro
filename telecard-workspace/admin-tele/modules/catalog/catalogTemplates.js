// ============================================================================
// 📦 قوالب المنتجات والكتالوج (modules/catalog/catalogTemplates.js)
// 🎯 الوظيفة: توليد الـ HTML المتقدم للأقسام، المنتجات، الخزنة، والبلدان
// 🌟 التحديث: إصلاح قابلية النقر لفتح الأقسام والمنتجات مباشرة (UX Fix)
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

const _esc = Utils.escapeHTML;
const _enNum = Utils.enNum;

export const CatalogTemplates = {

    /**
     * 1. حقول المحاكاة (Mockups) لمعاينة شكل المدخلات في صفحة المنتج
     */
    mockInput: (num, label) => `
        <div class="mock-input cursor-pointer click-shrink" data-action="toggle-mock-edit" data-val="${num}" title="اضغط لتعديل التسمية">
            <span id="mock-txt-${num}" class="mock-label">${_esc(label)}</span>
            <div class="mock-edit-btn">
                <i id="mock-icon-${num}" class="fa-solid fa-pen"></i>
            </div>
        </div>
    `,

    /**
     * 2. أشرطة الأدوات (Toolbar Actions) للأقسام الرئيسية والفرعية
     */
    catRootActions: (layoutCols = 2) => `
        <div class="flex-center-gap">
            <select class="form-input select-micro" data-action="change-grid-layout" title="تخطيط الشبكة">
                <option value="1" ${layoutCols == 1 ? 'selected' : ''}>1 بالسطر</option>
                <option value="2" ${layoutCols == 2 ? 'selected' : ''}>2 بالسطر</option>
                <option value="3" ${layoutCols == 3 ? 'selected' : ''}>3 بالسطر</option>
                <option value="4" ${layoutCols == 4 ? 'selected' : ''}>4 بالسطر</option>
            </select>
            <button class="btn btn-primary btn-add-cat" data-action="open-cat-modal">
                <i class="fa-solid fa-plus"></i> إضافة قسم
            </button>
            <button type="button" id="drag-edit-mode-btn" class="click-shrink" data-action="toggle-drag-edit" title="تفعيل ترتيب العناصر">
                <i class="fa-solid fa-lock"></i> ترتيب
            </button>
        </div>
    `,

    catSubActions: (layoutCols = 2) => `
        <div class="flex-center-gap">
            <select class="form-input select-micro" data-action="change-grid-layout">
                <option value="1" ${layoutCols == 1 ? 'selected' : ''}>1 بالسطر</option>
                <option value="2" ${layoutCols == 2 ? 'selected' : ''}>2 بالسطر</option>
                <option value="3" ${layoutCols == 3 ? 'selected' : ''}>3 بالسطر</option>
                <option value="4" ${layoutCols == 4 ? 'selected' : ''}>4 بالسطر</option>
            </select>
            <button class="btn btn-ghost px-10" data-action="cat-back" title="رجوع">
                <i class="fa-solid fa-arrow-right"></i>
            </button>
            <button class="btn btn-primary" data-action="open-cat-modal">
                <i class="fa-solid fa-folder-plus"></i> قسم فرعي
            </button>
            <button class="btn btn-primary" data-action="open-prod-modal">
                <i class="fa-solid fa-box-archive"></i> منتج جديد
            </button>
            <button type="button" id="drag-edit-mode-btn" data-action="toggle-drag-edit">
                <i class="fa-solid fa-lock"></i> ترتيب
            </button>
        </div>
    `,

    /**
     * 3. كروت العناصر (Cards)
     */
    catCard: (c, index, currCatId) => {
        const orderValue = (c.order !== undefined) ? Number(c.order) : index;
        const iconClass = currCatId === null ? 'root' : 'sub';
        const iconName = currCatId === null ? 'fa-folder' : 'fa-folder-open';
        
        return `
        <div id="cat-card-${_esc(c.id)}" class="item-box click-shrink" data-action="enter-folder" data-type="cat" data-id="${_esc(c.id)}" data-order="${orderValue}" data-enter="${_esc(c.id)}">
            <div class="item-actions">
                <div class="action-mini btn-edit-mini" data-action="open-cat-modal" data-id="${_esc(c.id)}"><i class="fa-solid fa-pen"></i></div>
                <div class="action-mini btn-del-mini" data-action="delete-item" data-type="cat" data-id="${_esc(c.id)}"><i class="fa-solid fa-trash"></i></div>
            </div>
            <div class="item-img">
                ${c.img ? `<img src="${_esc(c.img)}" class="zoomable-img" draggable="false" data-action="open-img-viewer" data-src="${_esc(c.img)}">` : `<i class="fa-solid ${iconName} cat-folder-icon ${iconClass}"></i>`}
            </div>
            <div class="item-info">${_esc(c.name)}</div>
            <div class="order-indicator num-en">${_enNum(index + 1)}</div>
        </div>`;
    },

    prodCard: (p, index) => {
        const orderValue = (p.order !== undefined) ? Number(p.order) : index;
        // استخدام RenderHelpers الموحد لعرض السعر بشكل احترافي
        const safePrice = (p.type === 'select') ? 'باقات متعددة' : RenderHelpers.formatMoney(p.price || p.unitCost || p.costPrice || 0, 'USD', 2);
        
        return `
        <div id="prod-card-${_esc(p.id)}" class="item-box click-shrink" data-action="open-prod-modal" data-type="prod" data-id="${_esc(p.id)}" data-order="${orderValue}">
            <div class="item-actions">
                <div class="action-mini btn-edit-mini" data-action="open-prod-modal" data-id="${_esc(p.id)}"><i class="fa-solid fa-pen"></i></div>
                <div class="action-mini btn-del-mini" data-action="delete-item" data-type="prod" data-id="${_esc(p.id)}"><i class="fa-solid fa-trash"></i></div>
            </div>
            <div class="item-img">
                ${p.img ? `<img src="${_esc(p.img)}" class="zoomable-img" draggable="false" data-action="open-img-viewer" data-src="${_esc(p.img)}">` : `<i class="fa-solid fa-cube"></i>`}
            </div>
            <div class="item-info">
                <div class="item-name-text">${_esc(p.name)}</div>
                <span class="prod-price-hint num-en" dir="ltr">${safePrice}</span>
            </div>
            <div class="order-indicator num-en">${_enNum(index + 1)}</div>
        </div>`;
    },

    /**
     * 4. الخزنة المركزية (Central Vault)
     */
    vaultCard: (pool, availCount, soldCount, linkedProdsCount, defectiveCount) => {
        let status = 'active';
        if (availCount === 0) status = 'empty';
        else if (availCount <= Number(pool.alertLimit || 5)) status = 'low';

        return `
        <div class="vault-pro-card vault-${status} click-shrink" data-id="${_esc(pool.id)}" data-status="${status}">
            <div class="vault-actions">
                <button class="v-btn v-edit" data-action="open-vault-modal" data-id="${_esc(pool.id)}" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                <button class="v-btn v-del" data-action="delete-item" data-type="vault" data-id="${_esc(pool.id)}" title="حذف"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="vault-icon-wrap">
                <i class="fa-solid ${status === 'empty' ? 'fa-box-open' : (status === 'low' ? 'fa-triangle-exclamation' : 'fa-vault')}"></i>
            </div>
            <div class="vault-details">
                <h3 class="vault-title">${_esc(pool.name)}</h3>
                <div class="vault-stats-row">
                    <div class="v-stat-chip ${status === 'empty' ? 'chip-danger' : (status === 'low' ? 'chip-warning' : 'chip-success')}" title="متاح">
                        <i class="fa-solid fa-check-circle"></i>
                        <span class="num-en">${_enNum(availCount)}</span>
                    </div>
                    <div class="v-stat-chip chip-sold" title="مباع">
                        <i class="fa-solid fa-cart-shopping"></i>
                        <span class="num-en">${_enNum(soldCount)}</span>
                    </div>
                    <div class="v-stat-chip chip-danger clickable" data-action="view-defective-codes" data-id="${_esc(pool.id)}" title="الأكواد التالفة">
                        <i class="fa-solid fa-bug"></i>
                        <span class="num-en">${_enNum(defectiveCount)}</span>
                    </div>
                </div>
                <div class="vault-stats-row mt-5">
                    <div class="v-stat-chip chip-info w-100 vault-chip-center" title="المنتجات المربوطة">
                        <i class="fa-solid fa-link"></i> منتجات مرتبطة: <span class="num-en mx-1">${_enNum(linkedProdsCount)}</span>
                    </div>
                </div>
            </div>
        </div>`;
    },
    
    /**
     * حاوية الشبكة المدمجة (للأقسام والمنتجات معاً)
     */
    gridContainer: (catsHtml, prodsHtml) => `
        ${catsHtml ? `<div class="items-grid cats-grid sortable-container ignore-elements mb-15">${catsHtml}</div>` : ''}
        ${prodsHtml ? `<div class="items-grid prods-grid sortable-container ignore-elements">${prodsHtml}</div>` : ''}
    `,

    defectiveModal: (poolName, codes) => {
        const codesHtml = codes.map(c => `
            <div class="copy-row success-copy-row" data-action="copy-text" data-copy-text="${_esc(c.text)}" title="اضغط للنسخ">
                <div class="cr-content cr-content-center w-100">
                    <span class="cr-value num-en text-danger" dir="ltr">${_esc(c.text)}</span>
                </div>
                <div class="cr-icon text-danger"><i class="fa-solid fa-copy"></i></div>
            </div>
        `).join('');

        return `
        <div id="defective-codes-overlay" class="modal-overlay">
            <div class="modal-content modal-md">
                <div class="modal-close-btn" data-action="close-defective-modal"><i class="fa-solid fa-xmark"></i></div>
                <h2 class="main-title text-danger"><i class="fa-solid fa-triangle-exclamation"></i> الأكواد التالفة / المسترجعة</h2>
                
                <div class="alert-info mb-15">
                    <i class="fa-solid fa-circle-info"></i> هذه الأكواد تم استرجاعها من قبل العملاء أو تم تعليمها كتالفة من قبل النظام.
                </div>

                <div class="form-group">
                    <label class="form-label">الصندوق: <span class="text-main fw-bold">${_esc(poolName)}</span></label>
                    <div class="dr-inputs-list mt-10" style="max-height: 300px; overflow-y: auto;">
                        ${codesHtml || '<div class="text-center py-20 text-muted">لا توجد أكواد تالفة حالياً</div>'}
                    </div>
                </div>
                
                <button class="btn btn-ghost btn-full mt-15" data-action="close-defective-modal">إغلاق</button>
            </div>
        </div>`;
    },

    /**
     * 5. شجرة المنتجات الذكية (Smart Tree)
     */
    smartTreeParent: (catId, catName, childrenHtml, isExpanded) => `
        <div class="tree-node ${isExpanded ? 'is-expanded' : ''}" id="tree-node-${catId}">
            <div class="tree-parent-row click-shrink">
                <i class="fa-solid fa-chevron-down tree-toggle-icon" data-action="toggle-tree-node"></i>
                <input type="checkbox" class="tree-checkbox tree-parent-cb" data-cat-id="${catId}" data-action="tree-parent-check">
                <div class="fw-bold text-main flex-1" data-action="toggle-tree-node">
                    <i class="fa-solid fa-folder-open text-info icon-me-2"></i> ${catName}
                </div>
            </div>
            <div class="tree-children">${childrenHtml}</div>
        </div>`,

    smartTreeChild: (prodId, prodName, imgSrc, isChecked, shortId) => `
        <label class="tree-item-row click-shrink">
            <input type="checkbox" class="tree-checkbox tree-child-cb" value="${prodId}" ${isChecked ? 'checked' : ''} data-action="tree-child-check">
            ${imgSrc ? `<img src="${imgSrc}" class="tree-thumb">` : `<div class="tree-thumb-fallback"><i class="fa-solid fa-box"></i></div>`}
            <div class="flex-col">
                <span class="fs-12 fw-bold text-main">${_esc(prodName)}</span>
                <span class="fs-10 text-muted">ID: <span class="num-en text-warning">#${shortId}</span></span>
            </div>
        </label>`,

    smartTreeTier: (tierId, tierName, icon, isChecked) => `
        <label class="tree-item-row click-shrink">
            <input type="checkbox" class="tree-checkbox tree-tier-cb" value="${tierId}" ${isChecked ? 'checked' : ''}>
            <div class="tree-thumb-fallback text-gold">
                <i class="fa-solid ${_esc(icon || 'fa-user')}"></i>
            </div>
            <span class="fs-12 fw-bold text-main">${_esc(tierName)}</span>
        </label>`,

    /**
     * 6. القوالب الإضافية والحالات الفارغة
     */
    pkgItem: (p, i) => `
        <div class="pkg-item animate__animated animate__fadeIn">
            <div class="flex-1"><span class="fw-bold">${_esc(p.name)}</span></div>
            <div class="num-en px-10 text-gold fw-bold">${RenderHelpers.formatMoney(p.price || 0, 'USD', 2)}</div>
            <button type="button" class="btn btn-red btn-xs pkg-del" data-action="remove-pkg" data-index="${i}">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>`,

    bannerItem: (b, index) => `
        <div id="banner-card-${_esc(b.id)}" class="item-box banner-item click-shrink" data-id="${_esc(b.id)}" data-order="${b.order ?? index}">
            <div class="item-actions">
                <div class="action-mini btn-del-mini" data-action="delete-item" data-type="banner" data-id="${_esc(b.id)}"><i class="fa-solid fa-trash"></i></div>
            </div>
            <div class="item-img">
                <img src="${_esc(b.img)}" class="zoomable-img" draggable="false" data-action="open-img-viewer" data-src="${_esc(b.img)}">
            </div>
            <div class="banner-order-badge num-en">${_enNum(index + 1)}</div>
        </div>`,

        countryCard: (c) => `
        <div class="country-card-item">
            <div class="country-header">
                <div class="country-info-group">
                    <div class="country-flag-lg">${_esc(c.flag || '🇸🇦')}</div>
                    <div>
                        <div class="country-name-lg">${_esc(c.name || 'دولة غير محددة')}</div>
                        <div class="country-meta-text">
                            <span class="num-en" dir="ltr">${_esc(c.dialCode || '+966')}</span>
                            <span class="meta-sep">|</span>
                            <span class="num-en">${_esc(c.currency || 'SAR')}</span>
                            <span class="meta-sep">|</span>
                            <span class="num-en">ISO: ${_esc(c.code || 'SA')}</span>
                        </div>
                    </div>
                </div>
                <div class="country-actions-side">
                    <div class="action-mini btn-edit-mini" data-action="open-country-modal" data-id="${_esc(c.id)}"><i class="fa-solid fa-pen"></i></div>
                    <div class="action-mini btn-del-mini" data-action="delete-item" data-type="country" data-id="${_esc(c.id)}"><i class="fa-solid fa-trash"></i></div>
                </div>
            </div>
        </div>`,
    emptyFolder: () => `<div class="empty-state"><i class="fa-solid fa-folder-open"></i><span>القسم فارغ.. ابدأ بإضافة منتجاتك الآن</span></div>`,
    emptyCountries: () => `<div class="empty-state"><i class="fa-solid fa-flag-checkered"></i><span>لم يتم تفعيل أي دول بعد.</span></div>`,
    emptyVault: () => `<div class="empty-state"><i class="fa-solid fa-vault"></i><span>الخزنة لا تحتوي على صناديق.</span></div>`,
    emptyCoupons: () => `<div class="empty-state"><i class="fa-solid fa-ticket"></i><span>لا توجد كوبونات فعالة حالياً.</span></div>`,

    dragEditBtnContent: (active) => active ? `<i class="fa-solid fa-unlock text-success"></i> حفظ الترتيب` : `<i class="fa-solid fa-lock"></i> ترتيب العناصر`,

    mockEditInput: (num, val) => `<input type="text" id="mock-input-${num}" class="inline-edit-input num-en" value="${_esc(val)}" spellcheck="false" dir="rtl">`
};
