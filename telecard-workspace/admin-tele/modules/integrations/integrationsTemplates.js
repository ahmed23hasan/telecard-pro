// ============================================================================
// 🔌 قوالب الربط التلقائي والموردين (modules/integrations/integrationsTemplates.js)
// 🚀 التحديث الأقصى: 
// 1. Integration Link Fix: دعم محول (Standard API) لمتجر Star Store وأمثاله.
// 2. Timezone Fix: استيراد واستخدام المنسق المركزي لتوحيد التاريخ عالمياً.
// ============================================================================

import { Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js'; // 🛡️ استيراد المنسق المركزي للتواريخ

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
        
        // 🛡️ دعم تسمية المحول القياسي الجديد
        let typeName = 'API مخصص';
        if (supplier.type === 'salla') typeName = 'منصة سلة';
        else if (supplier.type === 'zid') typeName = 'منصة زد';
        else if (supplier.type === 'standard_api') typeName = 'متجر قياسي (API)';

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
            
            <div class="flex-center-gap mt-10">
                <button class="btn btn-ghost flex-1" data-action="sync-supplier" data-id="${_esc(supplier.id)}">
                    <i class="fa-solid fa-rotate"></i> مزامنة
                </button>
                <button class="btn btn-info flex-1" data-action="open-supplier-edit" data-id="${_esc(supplier.id)}">
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
            <input type="password" id="supp-token" class="form-input num-en" placeholder="ضع المفتاح السري هنا..." value="${s ? _esc(s.token) : ''}">
        </div>
        
        <div class="form-row-2 flex-gap-10 mt-15">
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
    `
};
