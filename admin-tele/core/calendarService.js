// ============================================================================
// 📅 خدمة التقويم المتقدمة (core/calendarService.js) - النواة الصلبة
// 🎯 الوظيفة: محرك اختيار التواريخ والوقت (مستقل تماماً عن أي ميزة أخرى)
// ============================================================================

import { AdminTemplates } from '../adminTemplates.js';
import { Utils, EventBus } from '../adminUtils.js';

export const CalendarService = {
    targetType: null, 
    targetSection: null, 
    currentDate: new Date(),
    selectedDate: null,
    withTime: false, 
    months: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],

        open: function(type, section, withTime = false, currentFilterValue = null) {
        this.targetType = type;
        this.targetSection = section;
        this.withTime = !!withTime;
        
        const timeEl = document.getElementById('cal-time-selector');
        if(timeEl) {
            if(this.withTime) timeEl.classList.remove('hide-element');
            else timeEl.classList.add('hide-element');
        }

        let savedVal = null;
        if(section === 'coupon' || section === 'offer') {
            savedVal = document.getElementById(`${section}-${type}`)?.value;
        } else {
            savedVal = currentFilterValue;
        }

        if (savedVal) {
            this.selectedDate = new Date(Number(savedVal) || savedVal);
            this.currentDate = new Date(Number(savedVal) || savedVal);
            if(this.withTime) {
                const hEl = document.getElementById('cal-hour');
                const mEl = document.getElementById('cal-minute');
                if(hEl) hEl.value = String(this.selectedDate.getHours()).padStart(2, '0');
                if(mEl) mEl.value = String(this.selectedDate.getMinutes()).padStart(2, '0');
            }
        } else {
            this.selectedDate = null;
            this.currentDate = new Date();
            if(this.withTime) {
                const hEl = document.getElementById('cal-hour');
                const mEl = document.getElementById('cal-minute');
                if(hEl) hEl.value = '23';
                if(mEl) mEl.value = '59';
            }
        }

        this.renderCalendar();
        
        const modal = document.getElementById('cal-modal');
        if(modal) {
            // 🌟 تنظيف التنسيقات المدمجة السابقة للسماح للـ CSS بتوسيط النافذة
            modal.style.top = '';
            modal.style.left = '';
            modal.classList.add('show');
        }
    },
    close: function() {
        const modal = document.getElementById('cal-modal');
        if(modal) {
            modal.classList.remove('show');
            const mList = document.getElementById('cal-month-list');
            const yList = document.getElementById('cal-year-list');
            if(mList) mList.classList.remove('active');
            if(yList) yList.classList.remove('active');
        }
    },

    renderCalendar: function() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        const monthTxt = document.getElementById('cal-month-text');
        const yearTxt = document.getElementById('cal-year-text');
        if(monthTxt) monthTxt.innerText = this.months[month];
        if(yearTxt) {
            yearTxt.innerText = Utils.enNum(year); 
            yearTxt.setAttribute('dir', 'ltr');
            yearTxt.setAttribute('lang', 'en');
        }

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const grid = document.getElementById('cal-days-grid');
        if(!grid) return;
        
        let daysHtml = [];
        for (let i = 0; i < firstDay; i++) daysHtml.push(AdminTemplates.calEmptyDay());

        for (let i = 1; i <= daysInMonth; i++) {
            const isSelected = this.selectedDate && this.selectedDate.getDate() === i && this.selectedDate.getMonth() === month && this.selectedDate.getFullYear() === year;
            daysHtml.push(AdminTemplates.calDayCell(i, isSelected, Utils.enNum(i)));
        }
        grid.innerHTML = daysHtml.join('');
    },

    changeMonth: function(dir) { this.currentDate.setMonth(this.currentDate.getMonth() + dir); this.renderCalendar(); },
    changeYear: function(dir) { this.currentDate.setFullYear(this.currentDate.getFullYear() + dir); this.renderCalendar(); },
    selectDay: function(day) { this.selectedDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), day); this.renderCalendar(); },

    confirm: function() {
        if (this.selectedDate) {
            if (this.withTime) {
                const hEl = document.getElementById('cal-hour'); const mEl = document.getElementById('cal-minute');
                const hh = Math.min(23, Math.max(0, parseInt(hEl?.value) || 0)); const mm = Math.min(59, Math.max(0, parseInt(mEl?.value) || 0));
                this.selectedDate.setHours(hh, mm, 0, 0);
            }
            const y = this.selectedDate.getFullYear();
            const m = String(this.selectedDate.getMonth() + 1).padStart(2, '0');
            const d = String(this.selectedDate.getDate()).padStart(2, '0');
            
            if (['coupon', 'offer', 'sys'].includes(this.targetSection)) {
                const ts = this.selectedDate.getTime();
                const hiddenInp = document.getElementById(`${this.targetSection}-${this.targetType}`);
                if(hiddenInp) hiddenInp.value = ts;
                
                let displayStr = `${d}/${m}/${y}`;
                if(this.withTime) {
                    const hhStr = String(this.selectedDate.getHours()).padStart(2, '0');
                    const mmStr = String(this.selectedDate.getMinutes()).padStart(2, '0');
                    displayStr += ` ${hhStr}:${mmStr}`;
                }

                const txtEl = document.getElementById(`date-${this.targetType}-${this.targetSection}`);
                if(txtEl) { txtEl.innerText = displayStr; txtEl.classList.remove('placeholder-text'); txtEl.closest('.custom-field')?.classList.add('active'); }
                if (this.targetSection === 'sys') EventBus.emit('req-save-system');
            } else {
                const dateStr = `${y}-${m}-${d}`;
                EventBus.emit('filter-date-changed', { section: this.targetSection, type: this.targetType, dateStr: dateStr, dateObj: this.selectedDate });
                const txtEl = document.getElementById(`date-${this.targetType}-${this.targetSection}`);
                if(txtEl) { txtEl.innerText = `${d}/${m}/${y}`; txtEl.classList.remove('placeholder-text'); txtEl.closest('.custom-field')?.classList.add('active'); }
            }
        }
        this.close();
    },

    clear: function() {
        if (['coupon', 'offer', 'sys'].includes(this.targetSection)) {
            const hiddenInp = document.getElementById(`${this.targetSection}-${this.targetType}`);
            if(hiddenInp) hiddenInp.value = "";
            const txtEl = document.getElementById(`date-${this.targetType}-${this.targetSection}`);
            if(txtEl) { txtEl.innerText = this.withTime ? "DD/MM/YYYY HH:MM" : "DD/MM/YYYY"; txtEl.classList.add('placeholder-text'); txtEl.closest('.custom-field')?.classList.remove('active'); }
            if (this.targetSection === 'sys') EventBus.emit('req-save-system');
        } else {
            EventBus.emit('filter-date-cleared', { section: this.targetSection, type: this.targetType });
            const txtEl = document.getElementById(`date-${this.targetType}-${this.targetSection}`);
            if(txtEl) { txtEl.innerText = 'DD/MM/YYYY'; txtEl.classList.add('placeholder-text'); txtEl.closest('.custom-field')?.classList.remove('active'); }
        }
        this.close();
    },

    toggleMonths: function() {
        const list = document.getElementById('cal-month-list');
        if(!list) return;
        list.classList.toggle('active');
        if (list.classList.contains('active')) list.innerHTML = AdminTemplates.calMonthList(this.months, this.currentDate.getMonth());
    },
    
    setYear: function(y) { this.currentDate.setFullYear(y); document.getElementById('cal-year-list')?.classList.remove('active'); this.renderCalendar(); },
    setMonth: function(m) { this.currentDate.setMonth(m); document.getElementById('cal-month-list')?.classList.remove('active'); this.renderCalendar(); }
};
