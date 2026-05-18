// ============================================================================
// 🎨 قوالب الواجهة الأساسية (core/uiTemplates.js) - النواة الصلبة
// ============================================================================

import { Utils } from '../adminUtils.js';

// 🌟 دالة الحماية المركزية (Sanitization) لمنع ثغرات XSS
const _esc = Utils.escapeHTML;

export const UITemplates = {
    // 🛡️ تغليف المتغيرات بـ _esc لحماية النظام من حقن الأكواد الخبيثة
    toastContent: (icon, message) => `<i class="fa-solid ${_esc(icon)} toast-icon"></i><span>${_esc(message)}</span>`,
    
    countryModalTitle: (isEdit) => isEdit ? '<i class="fa-solid fa-globe"></i> تعديل الدولة' : '<i class="fa-solid fa-globe"></i> إضافة دولة',
    vaultModalTitle: (isEdit) => isEdit ? '<i class="fa-solid fa-pen"></i> تعديل صندوق الأكواد' : '<i class="fa-solid fa-plus"></i> إنشاء صندوق أكواد جديد',
    
    mockEditInput: (num, currentVal) => `<input type="text" id="mock-input-${_esc(num)}" class="inline-edit-input" value="${_esc(currentVal)}">`,
    dragEditBtnContent: (isActive) => isActive ? '<i class="fa-solid fa-lock-open"></i> ترتيب' : '<i class="fa-solid fa-lock"></i> ترتيب',
    
    calEmptyDay: () => `<div class="day-cell empty"></div>`,
    calDayCell: (day, isSelected, dayEn) => `<div class="day-cell ${isSelected ? 'selected' : ''}" data-action="cal-select-day" data-val="${_esc(day)}"><span class="num-en" dir="ltr" lang="en">${_esc(dayEn)}</span></div>`,
    calMonthList: (monthsArr, currentMonthIndex) => monthsArr.map((m, i) => `<div class="list-item ${i === currentMonthIndex ? 'selected' : ''}" data-action="cal-set-month" data-val="${i}">${_esc(m)}</div>`).join(''),
    
    calYearList: (currY, enNumFn) => {
        let html = '';
        for(let y = currY - 5; y <= currY + 5; y++) {
            html += `<div class="list-item num-en ${y === currY ? 'selected' : ''}" dir="ltr" lang="en" data-action="cal-set-year" data-val="${y}">${enNumFn ? _esc(enNumFn(y)) : y}</div>`;
        }
        return html;
    },

    msgSaveFail: (prop) => `فشل حفظ بيانات ${_esc(prop)}`,
    msgExportStart: () => `جاري تجهيز النسخة...`,
    msgExportSuccess: () => `تم حفظ النسخة الاحتياطية بنجاح`,
    msgExportFail: () => `تعذر حفظ النسخة الاحتياطية`,
    msgImportStart: () => `جاري استعادة البيانات...`,
    msgImportSuccess: () => `تم استعادة البيانات بنجاح! جاري التحديث...`,
    msgImportFail: () => `الملف تالف أو غير صالح`,

    // 🛡️ تفعيل الحماية على البيانات القادمة من قاعدة البيانات
    alertVaultEmpty: (poolName) => `صندوق "${_esc(poolName)}" فارغ تماماً!`,
    alertVaultLow: (poolName, availCount) => `نقص مخزون "${_esc(poolName)}" (<span class="num-en" dir="ltr" lang="en">${_esc(availCount)}</span> متبقي)`,
    alertOfferExpiring: (offerName) => `حملة التخفيض "<span class="text-warning">${_esc(offerName)}</span>" ستنتهي قريباً`,
    alertSecurityStable: () => `حالة النظام الأمنية مستقرة - لا توجد اختراقات.`, 
    alertCouponUsed: (user, code) => `استخدم العميل <b class="text-white">${_esc(user)}</b> الكوبون <span class="num-en badge-purple">${_esc(code)}</span>`
};
