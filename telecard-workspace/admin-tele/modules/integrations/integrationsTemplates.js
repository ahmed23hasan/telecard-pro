// ============================================================================
// 🔌 قوالب الربط والموردين (modules/integrations/integrationsTemplates.js) - V20.1 💎
// 🎯 الوظيفة: توليد الـ HTML النقي لكروت الموردين، الرصيد الحي، والنوافذ الديناميكية.
// 🚀 التحديثات المعمارية (V20.1 - Cloud Catalog Explorer): 
// 1. Dynamic Rates Injection 💱: توليد قائمة عملات المورد ديناميكياً من أسعار الصرف (AdminData.rates).
// 2. Live Balance Monitor 💰: إضافة زر فحص الرصيد المباشر لدى المورد لحظياً من السيرفر.
// 3. Cloud Delete Button 🗑️: إضافة زر حذف المورد وفك ارتباط منتجاته سحابياً.
// 4. Cloud Catalog Explorer 🔍: إضافة زر "الكتالوج" لاستعراض وأخذ معرفات منتجات المورد بضغطة زر.
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { AdminData } from '../../adminData.js';

const _esc = Utils.escapeHTML;

export const IntegrationsTemplates = {
    
    emptySuppliers: () => RenderHelpers.emptyState(
        'fa-solid fa-plug text-muted',
        'لم تقم بربط أي مورد خارجي بعد',
        'أضف موردين لسحب منتجاتهم وتحديث الأسعار والمخزون أوتوماتيكياً.'
    ),
    
    supplierCard: (supplier) => {
    const isActive = supplier.isActive !== false;
    const statusClass = isActive ? 'completed' : 'rejected';
    const statusIcon = isActive ? '<i class="fa-solid fa-link me-1"></i> متصل' : '<i class="fa-solid fa-link-slash me-1"></i> متوقف';
    
    let typeName = 'API مخصص';
    if (supplier.type === 'salla') typeName = 'منصة سلة';
    else if (supplier.type === 'zid') typeName = 'منصة زد';
    else if (supplier.type === 'standard_api') typeName = 'متجر قياسي (API)';
    else if (supplier.type === 'custom_b2b' || supplier.type === 'custom') typeName = 'Telecard B2B';
    
    const currencyText = supplier.currency ? supplier.currency.toUpperCase() : 'USD';
    const marginText = supplier.defaultMargin ? `${supplier.defaultMargin}%` : '0%';
    const liveLinkedCount = Array.isArray(AdminData?.data?.prods) ?
        AdminData.data.prods.filter(p => p && String(p.supplierId || '') === String(supplier.id)).length :
        null;
    const importedProdsCount = liveLinkedCount !== null ?
        liveLinkedCount :
        Number(supplier.importedCount || supplier.linkedProductsCount || 0);
    
    return `
        <div class="card promo-card" data-status="${isActive ? 'active' : 'inactive'}">
            <div class="promo-header">
                <div class="promo-header-content">
                    <div class="promo-icon bg-info-10 text-info border-info-30">
                        <i class="fa-solid fa-store"></i>
                    </div>
                    <div class="promo-title-box">
                        <div class="promo-title">${_esc(supplier.name)}</div>
                        <span class="promo-subtitle sub-offer border-info-30 text-info bg-info-10">${_esc(typeName)}</span>
                    </div>
                </div>
                <div class="promo-actions">
                    <div class="status-badge ${statusClass} mb-5">${statusIcon}</div>
                    <div class="promo-switch-group">
                        <label class="switch promo-switch interactive-scale" title="تفعيل/إيقاف المورد">
                            <input type="checkbox" ${isActive ? 'checked' : ''} data-action="toggle-supplier" data-id="${_esc(supplier.id)}">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="promo-details-grid">
                <div class="promo-col">
                    <span class="promo-lbl"><i class="fa-solid fa-box me-1"></i> المنتجات المربوطة</span>
                    <span class="promo-val num-en font-numeric" dir="ltr">${importedProdsCount}</span>
                </div>
                <div class="promo-col">
                    <span class="promo-lbl"><i class="fa-solid fa-clock-rotate-left me-1"></i> آخر مزامنة (${supplier.autoSync ? `كل ${Number(supplier.syncIntervalMinutes || 120)} د` : 'يدوي'})</span>
                    <span class="promo-val num-en font-numeric" dir="ltr">${supplier.lastSync ? RenderHelpers.formatSafeDate(supplier.lastSync) : 'لم تتم بعد'}</span>
                </div>
            </div>
            
            <div class="promo-details-grid details-grid-divider">
                <div class="promo-col">
                    <span class="promo-lbl"><i class="fa-solid fa-coins text-warning me-1"></i> عملة المورد</span>
                    <span class="promo-val num-en text-warning font-numeric" dir="ltr">${currencyText}</span>
                </div>
                <div class="promo-col">
                    <span class="promo-lbl"><i class="fa-solid fa-percent text-success me-1"></i> هامش الربح الافتراضي</span>
                    <span class="promo-val num-en text-success font-numeric" dir="ltr">+${marginText}</span>
                </div>
            </div>
            
            <div class="mt-10 pt-10 btn-divider-top">
                <button class="btn btn-outline-danger w-100 supp-defect-btn interactive-scale" data-action="view-supplier-defects" data-id="${_esc(supplier.id)}" data-name="${_esc(supplier.name)}">
                    <i class="fa-solid fa-bug me-1"></i> سجل الأكواد التالفة (للمطالبة بالتعويض)
                </button>
            </div>

            <div class="flex-center-gap mt-10">
                <button class="btn btn-ghost flex-1 supp-sync-btn interactive-scale" data-action="sync-supplier" data-id="${_esc(supplier.id)}" title="مزامنة الأسعار والتوفر">
                    <i class="fa-solid fa-rotate me-1"></i> مزامنة
                </button>
                <button class="btn btn-ghost text-success flex-1 interactive-scale" data-action="check-supplier-balance" data-id="${_esc(supplier.id)}" title="فحص رصيدك لدى المورد">
                    <i class="fa-solid fa-wallet me-1"></i> الرصيد
                </button>
                <button class="btn btn-ghost text-info flex-1 interactive-scale" data-action="fetch-supplier-catalog" data-id="${_esc(supplier.id)}" title="استعراض منتجات المورد وأكوادها (IDs)">
                    <i class="fa-solid fa-list-check me-1"></i> الكتالوج
                </button>
                <button class="btn btn-info flex-1 supp-edit-btn interactive-scale" data-action="open-supplier-edit" data-id="${_esc(supplier.id)}" title="تعديل إعدادات المورد">
                    <i class="fa-solid fa-pen me-1"></i> إعدادات
                </button>
            </div>
        </div>`;
},    
    supplierModal: (s = null, ratesList = []) => {
        const tokenPlaceholder = (s && s.hasToken !== false) ?
            '•••••••••••••••• (اتركه فارغاً للاحتفاظ بالمفتاح القديم)' :
            'ضع المفتاح السري هنا...';
        
        const safeMarginVal = (s && s.defaultMargin !== undefined && s.defaultMargin !== null) ? _esc(s.defaultMargin) : '10';
        const switchId = 'supp-auto-sync';
        const titleHtml = s ? '<i class="fa-solid fa-user-gear me-1"></i> إعدادات المورد' : '<i class="fa-solid fa-user-plus me-1"></i> إضافة مورد جديد';
        
        const currentInterval = Number(s?.syncIntervalMinutes || 120);
        
        // 🚀 [توليد ديناميكي 100%]: جلب العملات المسجلة فعلياً في المتجر مع رموزها وأسمائها
        const rates = Array.isArray(ratesList) && ratesList.length > 0 ?
            ratesList :
            (AdminData?.data?.rates || [{ code: 'USD', name: 'دولار أمريكي', symbol: '$' }]);
        
        const currentSuppCurr = s ? String(s.currency || 'USD').toUpperCase() : 'USD';
        let isCurrFoundInRates = false;
        
        let currencyOptionsHtml = rates.map(r => {
            const code = String(r.code || '').toUpperCase();
            const symbol = r.symbol || code;
            const name = r.name || code;
            const isSelected = (code === currentSuppCurr);
            if (isSelected) isCurrFoundInRates = true;
            
            return `<option value="${_esc(code)}" ${isSelected ? 'selected' : ''}>${_esc(code)} (${_esc(symbol)}) - ${_esc(name)}</option>`;
        }).join('');
        
        // ⚠️ حماية استثنائية: إذا كانت عملة المورد غير موجودة في أسعار الصرف ننبه المدير فوراً
        if (s && !isCurrFoundInRates) {
            currencyOptionsHtml = `<option value="${_esc(currentSuppCurr)}" selected class="text-danger">⚠️ ${_esc(currentSuppCurr)} (غير مسجلة بأسعار الصرف!)</option>` + currencyOptionsHtml;
        }
        
        return `
        <div class="modal-content modal-md">
            <div class="modal-close-btn interactive-scale" data-action="close-modal"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title" id="supplier-modal-title">${titleHtml}</h2>
            
            <div class="form-group">
                <label class="form-label">اسم المورد (للتنظيم الداخلي)</label>
                <input type="text" id="supp-name" class="form-input" placeholder="مثال: مورد البطاقات الرئيسي" value="${s ? _esc(s.name) : ''}">
            </div>
            
            <div class="form-group">
                <label class="form-label">نوع الربط (المنصة)</label>
                <select id="supp-type" class="form-input select-shared">
                    <option value="custom_b2b" ${s && (s.type === 'custom_b2b' || s.type === 'custom') ? 'selected' : ''}>Telecard API (تليكارد B2B)</option>
                    <option value="standard_api" ${s && s.type === 'standard_api' ? 'selected' : ''}>متجر قياسي API (Star Store وأمثاله)</option>
                    <option value="salla" ${s && s.type === 'salla' ? 'selected' : ''}>منصة سلة (Salla)</option>
                    <option value="zid" ${s && s.type === 'zid' ? 'selected' : ''}>منصة زد (Zid)</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label">رابط الـ API (Base URL)</label>
                <input type="url" id="supp-url" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="https://api.supplier.com/v1" value="${s ? _esc(s.baseUrl) : ''}">
            </div>
            
            <div class="form-group">
                <label class="form-label">مفتاح الربط (API Key / Bearer Token)</label>
                <input type="password" id="supp-token" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="${tokenPlaceholder}" value="">
            </div>
            
            <div class="d-flex gap-2 flex-wrap mt-15">
                <div class="form-group flex-1">
                    <label class="form-label text-info">عملة أسعار المورد (من أسعار الصرف)</label>
                    <select id="supp-currency" class="form-input num-en font-numeric select-shared" dir="ltr">
                        ${currencyOptionsHtml}
                    </select>
                </div>
                
                <div class="form-group flex-1">
                    <label class="form-label text-success">إضافة هامش ربح افتراضي (%)</label>
                    <input type="text" inputmode="decimal" id="supp-margin" class="form-input num-en font-numeric" dir="ltr" lang="en" placeholder="10" value="${safeMarginVal}">
                </div>
            </div>
            
            <div class="toggle-box tc-toggle-row mt-10">
                <span class="toggle-lbl"><i class="fa-solid fa-bolt text-warning me-1"></i> تفعيل المزامنة التلقائية (مخزون وأسعار)</span>
                <label class="switch interactive-scale" for="${switchId}">
                    <input type="checkbox" id="${switchId}" ${!s || s.autoSync ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="form-group mt-10 mb-0">
                <label class="form-label text-warning"><i class="fa-solid fa-stopwatch me-1"></i> دورة المزامنة التلقائية</label>
                <select id="supp-sync-interval" class="form-input select-shared">
                    <option value="20" ${currentInterval === 20 ? 'selected' : ''}>كل 20 دقيقة (استهلاك قراءات مرتفع)</option>
                    <option value="30" ${currentInterval === 30 ? 'selected' : ''}>كل 30 دقيقة (نصف ساعة)</option>
                    <option value="60" ${currentInterval === 60 ? 'selected' : ''}>كل ساعة (60 دقيقة - متوازن)</option>
                    <option value="120" ${currentInterval === 120 ? 'selected' : ''}>كل ساعتين (120 دقيقة - موصى به لتوفير القراءات 💎)</option>
                    <option value="360" ${currentInterval === 360 ? 'selected' : ''}>كل 6 ساعات (توفير أقصى)</option>
                    <option value="720" ${currentInterval === 720 ? 'selected' : ''}>كل 12 ساعة</option>
                    <option value="1440" ${currentInterval === 1440 ? 'selected' : ''}>كل 24 ساعة (مرة يومياً)</option>
                </select>
            </div>
            
            <div class="modal-actions-row border-top-solid mt-15 pt-15 d-flex gap-2">
                <button type="button" class="btn btn-primary interactive-scale flex-2" data-action="save-supplier" data-id="${s ? s.id : ''}">حفظ المورد</button>
                ${s ? `<button type="button" class="btn btn-outline-danger interactive-scale flex-1" data-action="delete-supplier" data-id="${_esc(s.id)}"><i class="fa-solid fa-trash me-1"></i> حذف</button>` : ''}
                <button type="button" class="btn btn-ghost interactive-scale flex-1" data-action="close-modal">إلغاء</button>
            </div>
        </div>
        `;
    },
    
    supplierDefectsRows: (defects) => {
        if (!Array.isArray(defects) || defects.length === 0) return '';
        return defects.map(d => {
            const dateStr = RenderHelpers.formatSafeDate(d.reportedAt);
            const safeCode = Utils.escapeHTML(d.codeText);
            const costStr = RenderHelpers.formatMoney(d.costUsd, 'USD', 2);
            
            return `
            <tr>
                <td class="num-en text-danger fw-bold font-numeric" dir="ltr">${safeCode}</td>
                <td class="num-en text-warning font-numeric" dir="ltr">${costStr}</td>
                <td class="num-en fs-11 text-muted font-numeric" dir="ltr">${dateStr}</td>
                <td>
                    <button class="btn btn-ghost btn-compact text-primary interactive-scale" data-action="view-defect-order" data-id="${Utils.escapeHTML(d.orderId)}">
                        <i class="fa-solid fa-up-right-from-square me-1"></i> عرض الطلب
                    </button>
                </td>
            </tr>`;
        }).join('');
    },
    
    supplierDefectsModal: (supplierId, supplierName, defects, hasMore) => {
        let rowsHtml = '';
        
        if (!Array.isArray(defects) || defects.length === 0) {
            rowsHtml = `<tr><td colspan="4" class="p-0 border-0">${RenderHelpers.emptyState('fa-solid fa-check-circle text-success', 'السجل نظيف', 'سجل هذا المورد نظيف. لا توجد أكواد تالفة!')}</td></tr>`;
        } else {
            rowsHtml = IntegrationsTemplates.supplierDefectsRows(defects);
        }
        
        const loadMoreBtn = hasMore ? `
            <div class="text-center mt-15" id="btn-load-more-supp-defects">
                <button class="btn btn-ghost btn-compact interactive-scale" data-action="load-more-supplier-defects" data-id="${_esc(supplierId)}" data-name="${_esc(supplierName)}">
                    <i class="fa-solid fa-angle-down me-1"></i> جلب المزيد من السجلات ☁️
                </button>
            </div>
        ` : '';
        
        return `
        <div class="modal-content modal-lg">
            <div class="modal-close-btn interactive-scale" data-action="close-supplier-defects"><i class="fa-solid fa-xmark"></i></div>
            <h2 class="main-title text-danger"><i class="fa-solid fa-bug me-1"></i> سجل الأكواد التالفة (API)</h2>
            
            <div class="alert-info mb-15">
                <i class="fa-solid fa-circle-info me-1"></i> هذه الأكواد تم سحبها من المورد <b>(${Utils.escapeHTML(supplierName)})</b>، وتم استرجاعها للعملاء لاحقاً لكونها تالفة أو مستخدمة. استخدم هذا السجل لمطالبة المورد بالتعويض.
            </div>

            <div class="table-responsive defects-table-scroll">
                <table class="modern-table">
                    <thead>
                        <tr>
                            <th>الكود التالف</th>
                            <th>سعر التكلفة (خسارة)</th>
                            <th>تاريخ الإبلاغ</th>
                            <th>الإجراء</th>
                        </tr>
                    </thead>
                    <tbody id="supplier-defects-tbody">
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
            ${loadMoreBtn}
            
            <div class="modal-actions-row border-top-solid mt-15 pt-15">
                <button type="button" class="btn btn-outline-danger interactive-scale w-100" data-action="close-supplier-defects">إغلاق السجل</button>
            </div>
        </div>`;
    }
};
