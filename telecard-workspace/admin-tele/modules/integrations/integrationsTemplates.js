// ============================================================================
// 🔌 قوالب الربط التلقائي والموردين (modules/integrations/integrationsTemplates.js) - V18.5
// 🚀 التحديث: 
// 1. Safe Modal Closure 🛡️: تغيير زر الإغلاق ليعتمد على مسارات الـ Routing الصحيحة بدلاً من كود onClick البدائي.
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

const _esc = Utils.escapeHTML;

export const IntegrationsTemplates = {
    
    emptySuppliers: () => `
        <div class="empty-state mt-20">
            <i class="fa-solid fa-plug-circle-xmark text-muted mb-10 empty-state-icon-lg"></i>
            <span class="fs-14 fw-bold">لم تقم بربط أي مورد خارجي بعد</span>
            <p class="text-muted fs-12 mt-5">أضف موردين لسحب منتجاتهم وتحديث الأسعار والمخزون أوتوماتيكياً.</p>
        </div>
    `,
    
    supplierCard: (supplier) => {
        const isActive = supplier.isActive !== false;
        const statusClass = isActive ? 'completed' : 'rejected';
        const statusIcon = isActive ? '<i class="fa-solid fa-link"></i> متصل' : '<i class="fa-solid fa-link-slash"></i> متوقف';
        
        let typeName = 'API مخصص';
        if (supplier.type === 'salla') typeName = 'منصة سلة';
        else if (supplier.type === 'zid') typeName = 'منصة زد';
        else if (supplier.type === 'standard_api') typeName = 'متجر قياسي (API)';
        
        const currencyText = supplier.currency ? supplier.currency.toUpperCase() : 'USD';
        const marginText = supplier.defaultMargin ? `${supplier.defaultMargin}%` : '0%';
        
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
                        <label class="switch promo-switch">
                            <input type="checkbox" ${isActive ? 'checked' : ''} data-action="toggle-supplier" data-id="${_esc(supplier.id)}">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="promo-details-grid">
                <div class="promo-col">
                    <span class="promo-lbl"><i class="fa-solid fa-box"></i> المنتجات المستوردة</span>
                    <span class="promo-val num-en" dir="ltr">${supplier.importedCount || 0}</span>
                </div>
                <div class="promo-col">
                    <span class="promo-lbl"><i class="fa-solid fa-clock-rotate-left"></i> آخر مزامنة</span>
                    <span class="promo-val num-en" dir="ltr">${supplier.lastSync ? RenderHelpers.formatSafeDate(supplier.lastSync) : 'لم تتم بعد'}</span>
                </div>
            </div>
            
            <div class="promo-details-grid" style="border-top: 1px dashed var(--border-color); padding-top: 10px; margin-top: 5px;">
                <div class="promo-col">
                    <span class="promo-lbl"><i class="fa-solid fa-coins text-warning"></i> عملة المورد</span>
                    <span class="promo-val num-en text-warning" dir="ltr">${currencyText}</span>
                </div>
                <div class="promo-col">
                    <span class="promo-lbl"><i class="fa-solid fa-percent text-success"></i> هامش الربح الافتراضي</span>
                    <span class="promo-val num-en text-success" dir="ltr">+${marginText}</span>
                </div>
            </div>
            
            <!-- 🚀 [الإضافة الجديدة]: زر عرض الأكواد التالفة -->
            <div class="mt-10 pt-10" style="border-top: 1px dashed var(--border-color);">
                <button class="btn btn-ghost btn-sm w-100 text-danger supp-defect-btn" style="background: rgba(239, 68, 68, 0.05);" data-action="view-supplier-defects" data-id="${_esc(supplier.id)}" data-name="${_esc(supplier.name)}">
                    <i class="fa-solid fa-bug"></i> سجل الأكواد التالفة (للمطالبة بالتعويض)
                </button>
            </div>

            <div class="flex-center-gap mt-10">
                <button class="btn btn-ghost flex-1 supp-sync-btn" data-action="sync-supplier" data-id="${_esc(supplier.id)}">
                    <i class="fa-solid fa-rotate"></i> مزامنة
                </button>
                <button class="btn btn-info flex-1 supp-edit-btn" data-action="open-supplier-edit" data-id="${_esc(supplier.id)}">
                    <i class="fa-solid fa-pen"></i> إعدادات
                </button>
            </div>
        </div>`;
    },
    
    supplierModal: (s = null) => `
        <div class="form-group">
            <label class="form-label">اسم المورد (للتنظيم الداخلي)</label>
            <input type="text" id="supp-name" class="form-input" placeholder="مثال: مورد البطاقات الرئيسي" value="${s ? _esc(s.name) : ''}">
        </div>
        
        <div class="form-group">
            <label class="form-label">نوع الربط (المنصة)</label>
            <select id="supp-type" class="form-input">
                <option value="custom" ${s && s.type === 'custom' ? 'selected' : ''}>Telecard API (تليكارد القديم)</option>
                <option value="standard_api" ${s && s.type === 'standard_api' ? 'selected' : ''}>متجر قياسي API (Star Store وأمثاله)</option>
                <option value="salla" ${s && s.type === 'salla' ? 'selected' : ''}>منصة سلة (Salla)</option>
                <option value="zid" ${s && s.type === 'zid' ? 'selected' : ''}>منصة زد (Zid)</option>
            </select>
        </div>
        
        <div class="form-group">
            <label class="form-label">رابط الـ API (Base URL)</label>
            <input type="url" id="supp-url" class="form-input num-en" dir="ltr" lang="en" placeholder="https://api.supplier.com/v1" value="${s ? _esc(s.baseUrl) : ''}">
        </div>
        
        <div class="form-group">
            <label class="form-label">مفتاح الربط (API Key / Bearer Token)</label>
            <input type="password" id="supp-token" class="form-input num-en" dir="ltr" lang="en" placeholder="${s ? '•••••••••••••••• (اتركه فارغاً للاحتفاظ بالمفتاح القديم)' : 'ضع المفتاح السري هنا...'}" value="">
        </div>
        
        <div class="form-row-2 flex-gap-10 mt-15">
            <div class="form-group flex-1">
                <label class="form-label text-info">عملة أسعار المورد</label>
                <select id="supp-currency" class="form-input num-en" dir="ltr">
                    <option value="USD" ${!s || s.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
                    <option value="SAR" ${s && s.currency === 'SAR' ? 'selected' : ''}>SAR (ر.س)</option>
                    <option value="AED" ${s && s.currency === 'AED' ? 'selected' : ''}>AED (د.إ)</option>
                    <option value="KWD" ${s && s.currency === 'KWD' ? 'selected' : ''}>KWD (د.ك)</option>
                    <option value="EGP" ${s && s.currency === 'EGP' ? 'selected' : ''}>EGP (ج.م)</option>
                    <option value="TRY" ${s && s.currency === 'TRY' ? 'selected' : ''}>TRY (₺)</option>
                    <option value="EUR" ${s && s.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                </select>
            </div>
            
            <div class="form-group flex-1">
                <label class="form-label text-success">إضافة هامش ربح افتراضي (%)</label>
                <input type="text" inputmode="decimal" id="supp-margin" class="form-input num-en" dir="ltr" lang="en" placeholder="10" value="${s ? _esc(s.defaultMargin || '10') : '10'}">
            </div>
        </div>
        
        <div class="toggle-box tc-toggle-row mt-10">
            <span class="toggle-lbl"><i class="fa-solid fa-bolt text-warning"></i> تفعيل المزامنة التلقائية (مخزون وأسعار)</span>
            <label class="switch">
                <input type="checkbox" id="supp-auto-sync" ${!s || s.autoSync ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        </div>
        
        <button class="btn btn-primary btn-full mt-20" data-action="save-supplier" data-id="${s ? s.id : ''}">
            <i class="fa-solid fa-floppy-disk"></i> حفظ بيانات المورد
        </button>
    `,
    
    supplierDefectsModal: (supplierName, defects) => {
        let rowsHtml = '';
        
        if (defects.length === 0) {
            rowsHtml = `<tr><td colspan="4" class="text-center text-muted py-20"><i class="fa-solid fa-check-circle text-success fs-3 mb-10"></i><br>سجل هذا المورد نظيف. لا توجد أكواد تالفة!</td></tr>`;
        } else {
            rowsHtml = defects.map(d => {
                const dateStr = RenderHelpers.formatSafeDate(d.reportedAt);
                const safeCode = Utils.escapeHTML(d.codeText);
                const costStr = RenderHelpers.formatMoney(d.costUsd, 'USD', 2);
                
                return `
                <tr>
                    <td class="num-en text-danger fw-bold" dir="ltr">${safeCode}</td>
                    <td class="num-en text-warning" dir="ltr">${costStr}</td>
                    <td class="num-en fs-11 text-muted" dir="ltr">${dateStr}</td>
                    <td>
                        <button class="btn btn-ghost btn-sm text-primary" data-action="open-order-drawer" data-id="${Utils.escapeHTML(d.orderId)}">
                            <i class="fa-solid fa-up-right-from-square"></i> عرض الطلب
                        </button>
                    </td>
                </tr>`;
            }).join('');
        }
        
        // 🚀 [التحديث المعماري]: إضافة data-action لإغلاق النافذة بأمان
        return `
        <div id="supplier-defects-overlay" class="modal-overlay" style="display: flex;">
            <div class="modal-content modal-lg">
                <div class="modal-close-btn" data-action="close-supplier-defects"><i class="fa-solid fa-xmark"></i></div>
                <h2 class="main-title text-danger"><i class="fa-solid fa-bug"></i> سجل الأكواد التالفة (API)</h2>
                
                <div class="alert-info mb-15">
                    <i class="fa-solid fa-circle-info"></i> هذه الأكواد تم سحبها من المورد <b>(${Utils.escapeHTML(supplierName)})</b>، وتم استرجاعها للعملاء لاحقاً لكونها تالفة أو مستخدمة. استخدم هذا السجل لمطالبة المورد بالتعويض.
                </div>

                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                    <table class="modern-table">
                        <thead>
                            <tr>
                                <th>الكود التالف</th>
                                <th>سعر التكلفة (خسارة)</th>
                                <th>تاريخ الإبلاغ</th>
                                <th>الإجراء</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }
};
