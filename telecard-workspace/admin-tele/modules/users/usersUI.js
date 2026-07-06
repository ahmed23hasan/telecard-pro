// ============================================================================
// 👥 وحدة المستخدمين والتوثيق (modules/users/usersUI.js) - النسخة الماسية V4.4 💎
// 🎯 الوظيفة: إدارة التفاعلات المرئية فقط (Visual Interactions)
// 🚀 التحديث الأقصى: القضاء على الـ O(N) وإصلاح الـ TypeError المسببة لانهيار الواجهة
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { UsersTemplates } from './usersTemplates.js'; // 🌟 إضافة استيراد قوالب المستخدمين
import { Utils, EventBus } from '../../adminUtils.js';
import { UIService } from '../../core/uiService.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

export const UsersUI = {
    tempKycConfig: null,

    // ---------------------------------------------------------
    // 👑 1. إدارة المستويات (Tiers)
    // ---------------------------------------------------------
    
    openTierModal: function(id = null) {
        EventBus.emit('set-temp-edit-id', id);
        // ⚡ جلب فوري بـ O(1) للمستوى من الخريطة بدلاً من البحث الخطي البطيء
        const tier = id ? (AdminData.data.tiersMap?.[id] || AdminData.data.tiers.find(t => String(t.id) === String(id))) : null;
        this.setupTierModal(tier);
        EventBus.emit('req-open-modal', 'tier');
    },

    setupTierModal: function(tier) {
        const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
        
        safeSetVal('t-name', tier ? tier.name : '');
        safeSetVal('t-profit', tier ? tier.profit_percent : '');
        safeSetVal('t-min', tier ? tier.min_profit_usd : '');
        safeSetVal('t-cond', tier ? tier.threshold : '');
        safeSetVal('t-dur', tier ? tier.duration_days : '');
        
        const defaultCheckbox = document.getElementById('t-default');
        if (defaultCheckbox) defaultCheckbox.checked = tier ? !!tier.isDefault : false;

        document.querySelectorAll('.badge-opt').forEach(el => el.classList.remove('active'));
        const iconClass = tier ? (tier.icon || 'fa-user') : 'fa-user';
        const iconEl = document.querySelector(`.badge-opt[data-val="${iconClass}"]`);
        if (iconEl) {
            iconEl.classList.add('active');
        } else {
            const firstIcon = document.querySelector('.badge-opt');
            if (firstIcon) firstIcon.classList.add('active');
        }
        safeSetVal('t-icon', iconClass);
    },

    animateBalanceUpdate: function(newBal, curCode, type) {
        const modalBalVal = document.querySelector('#tab-wallet.ud-balance-card-pro.val'); 
        if (modalBalVal) {
            modalBalVal.innerHTML = `${Utils.enNum(newBal, 2)} <span class="cur">${curCode}</span>`;
            const popClass = type === 'add' ? 'bal-pop-up' : 'bal-pop-down';
            modalBalVal.classList.add(popClass);
            setTimeout(() => { modalBalVal.classList.remove(popClass); }, 300);
        }
    },

    selectTierBadge: function(element, iconClass) {
        const container = element.closest('.badge-selector');
        if(container) { container.querySelectorAll('.badge-opt').forEach(el => el.classList.remove('active')); }
        element.classList.add('active');
        const hiddenInput = document.getElementById('t-icon');
        if(hiddenInput) hiddenInput.value = iconClass;
    },

    toggleDefaultTierSecure: function(checkbox) {
        if (checkbox.checked) {
            checkbox.checked = false; 
            const warningMsg = "⚠️ تحذير أمان هام!\n\nتعيين هذا المستوى كـ 'افتراضي' سيؤدي إلى تغيير إعدادات العملاء الجدد.\n\nهل أنت متأكد؟";
            UIService.showConfirm(warningMsg, 'تأكيد تغيير المستوى الافتراضي').then((agreed) => {
                if (agreed) {
                    checkbox.checked = true;
                    UIService.showToast("تم التأكيد، يرجى الحفظ", "warning");
                }
            });
        }
    },

    openTierUsers: (tierId) => EventBus.emit('req-show-tier-users', tierId),

    backToTiers: function() {
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        const tiersSection = document.getElementById('view-tiers');
        if(tiersSection) tiersSection.classList.add('active');
        const btn = document.querySelector('.nav-item[onclick*="tiers"]');
        EventBus.emit('req-navigate', { page: 'tiers', btnEl: btn });
    },

    filterTierUsersLive: function(inputEl) {
        const term = (inputEl.value || '').toLowerCase().trim();
        const container = document.getElementById('tier-users-container');
        if (!container) return;

        const cards = container.querySelectorAll('.tier-user-card');
        let visibleCount = 0;

        cards.forEach(card => {
            const text = card.innerText.toLowerCase();
            if (text.includes(term)) {
                card.style.display = 'flex';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        let emptyState = document.getElementById('tier-users-empty-search');
        if (visibleCount === 0 && term !== '') {
            if (!emptyState) {
                emptyState = document.createElement('div');
                emptyState.id = 'tier-users-empty-search';
                emptyState.className = 'empty-state mt-20';
                emptyState.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i><span>لا توجد نتائج تطابق بحثك...</span>`;
                container.appendChild(emptyState);
            }
        } else if (emptyState) {
            emptyState.remove();
        }
    },

    // ---------------------------------------------------------
    // 👤 2. إدارة ملفات المستخدمين (Users)
    // ---------------------------------------------------------
    
    // 🌟 النافذة الاحترافية لعرض السجل المالي الشامل (الدفتر الموحد)
    renderFullHistoryModal: function(userId, fullHistory) {
        const modal = document.getElementById('user-full-history-modal');
        if (!modal) return;

        const generateListHtml = (list) => {
            if (!list || list.length === 0) return UsersTemplates.emptyUserActivity();
            return list.map(tx => UsersTemplates.userActivityItem(tx)).join('');
        };

        const countBadge = document.getElementById('fh-count-badge');
        if (countBadge) countBadge.innerText = fullHistory.length;

        document.getElementById('fh-all').innerHTML = generateListHtml(fullHistory);
        document.getElementById('fh-deposits').innerHTML = generateListHtml(fullHistory.filter(tx => tx.txType === 'deposit'));
        document.getElementById('fh-orders').innerHTML = generateListHtml(fullHistory.filter(tx => tx.txType === 'order'));

        modal.classList.add('active');

        if (!modal._boundTabs) {
            const tabs = modal.querySelectorAll('.fh-tab');
            const panes = modal.querySelectorAll('.fh-pane');
            
            tabs.forEach(tab => {
                tab.addEventListener('click', (e) => {
                    tabs.forEach(t => t.classList.remove('active'));
                    panes.forEach(p => p.style.display = 'none');
                    
                    const targetTab = e.currentTarget;
                    targetTab.classList.add('active');
                    
                    const targetPane = modal.querySelector('#' + targetTab.dataset.target);
                    if(targetPane) targetPane.style.display = 'block';
                });
            });
            modal._boundTabs = true;
        }
    },

    showTierSelection: function(userId) {
        // ⚡ جلب فوري بـ O(1) للعميل من خريطة العملاء
        const u = AdminData.data.usersMap?.[userId] || (AdminData.data.users || []).find(x => String(x.id) === String(userId));
        if(!u) return;

        let modal = document.getElementById('tier-selection-modal');
        if(!modal) {
            modal = document.createElement('div');
            modal.id = 'tier-selection-modal';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }
        
        const tiers = AdminData.data.tiers || [];
        // 🛡️ [إصلاح حرج 1]: استدعاء القالب من الموديل الصحيح UsersTemplates لتفادي انهيار الواجهة
        modal.innerHTML = UsersTemplates.tierSelectionModal(u, tiers);
        modal.classList.add('active');
    },

    selectTierOption: function(element) {
        document.querySelectorAll('.tier-option').forEach(opt => opt.classList.remove('selected'));
        element.classList.add('selected');
        EventBus.emit('tier-option-selected', element.dataset.tierId);
    },

    closeTierSelection: function() {
        const modal = document.getElementById('tier-selection-modal');
        if(modal) modal.classList.remove('active');
    },

    openUserEditModal: function(userId) {
        // ⚡ جلب فوري بـ O(1) للعميل من الخريطة
        const u = AdminData.data.usersMap?.[userId] || (AdminData.data.users || []).find(x => String(x.id) === String(userId));
        if(!u) return UIService.showToast('لم يتم العثور على العميل', 'error');

        const container = document.getElementById('user-edit-form-container');
        if(container) {
            // 🛡️ [إصلاح حرج 2]: استدعاء القالب من الموديل الصحيح UsersTemplates لتفادي انهيار الواجهة
            container.innerHTML = UsersTemplates.userEditForm(u);
        }

        const modal = document.getElementById('m-user-edit');
        if(modal) modal.classList.add('active'); 
    },

    closeUserEditModal: function() {
        const modal = document.getElementById('m-user-edit');
        if(modal) modal.classList.remove('active'); 
    },

    clearCustomNotifInput: function() {
        const input = document.getElementById('user-custom-notif');
        if (input) {
            input.value = '';
        }
    },

    // ---------------------------------------------------------
    // 🛡️ 3. مركز التوثيق والأمان (KYC System)
    // ---------------------------------------------------------

    filterKycRequests: function(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const container = document.getElementById('kyc-requests-container');
        if (!container) return;

        const cards = container.querySelectorAll('.kyc-request-card');
        let visibleCount = 0;

        cards.forEach(card => {
            const text = card.innerText.toLowerCase();
            if (text.includes(term)) {
                card.style.display = 'flex';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        let emptySearch = document.getElementById('kyc-search-empty-state');
        if (visibleCount === 0 && term !== '') {
            if (!emptySearch) {
                emptySearch = document.createElement('div');
                emptySearch.id = 'kyc-search-empty-state';
                emptySearch.className = 'empty-state mt-20';
                emptySearch.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i><span>لا توجد نتائج تطابق بحثك...</span>`;
                container.appendChild(emptySearch);
            }
        } else if (emptySearch) {
            emptySearch.remove();
        }
    },

    updateSidebarKycBadge: function(count) {
        const badge = document.getElementById('nav-kyc-count');
        if (!badge) return;
        
        if (count > 0) {
            badge.textContent = count > 99 ? '+99' : count;
            badge.style.display = 'flex';
            badge.classList.add('animate__animated', 'animate__pulse');
            setTimeout(() => badge.classList.remove('animate__animated', 'animate__pulse'), 1000);
        } else {
            badge.style.display = 'none';
        }
    },

    updateKycMode: async function(mode) {
        if (!this.tempKycConfig) {
            const settings = AdminData.data.settings || {};
            this.tempKycConfig = JSON.parse(JSON.stringify(settings.kycConfig || { mode: 'off', targetedTiers: [] }));
        }

        const currentMode = this.tempKycConfig.mode;
        if (currentMode === mode) return;

        let msg = '';
        let title = 'تأكيد تغيير مستوى الأمان';
        
        if (mode === 'all') {
            msg = '⚠️ تحذير: هل أنت متأكد من فرض توثيق الهوية (KYC) على جميع العملاء؟\nلن يتمكن أي عميل من الشراء حتى يقوم برفع هويته وتتم الموافقة عليها.';
        } else if (mode === 'specific' || mode === 'spec') {
            msg = 'هل تريد تخصيص نظام التوثيق ليتم فرضه على مستويات (Tiers) محددة فقط؟';
        } else {
            msg = 'هل أنت متأكد من إيقاف نظام التوثيق بالكامل لجميع العملاء exchange؟';
        }

        const confirmed = await UIService.showConfirm(msg, title);
        if (!confirmed) return; 

        this.tempKycConfig.mode = mode;
        
        document.querySelectorAll('.kyc-mode-btn').forEach(btn => btn.classList.remove('active'));
        const targetBtn = document.querySelector(`.kyc-mode-btn[data-mode="${mode}"]`);
        if (targetBtn) targetBtn.classList.add('active');

        const tiersSelection = document.getElementById('kyc-tiers-selection');
        if (tiersSelection) {
            if (mode === 'specific' || mode === 'spec') {
                tiersSelection.classList.remove('hide-element');
            } else {
                tiersSelection.classList.add('hide-element');
            }
        }

        UIService.showToast('تم تغيير وضع الأمان، لا تنسَ الضغط على زر الحفظ لتطبيقه فعلياً', 'warning');
    },

    toggleKycForTier: function(tierId, isChecked) {
        if (!this.tempKycConfig) {
            const settings = AdminData.data.settings || {};
            this.tempKycConfig = JSON.parse(JSON.stringify(settings.kycConfig || { mode: 'off', targetedTiers: [] }));
        }
        if (!this.tempKycConfig.targetedTiers) this.tempKycConfig.targetedTiers = [];
        
        const safeTierId = String(tierId);
        if (isChecked) {
            if (!this.tempKycConfig.targetedTiers.includes(safeTierId)) this.tempKycConfig.targetedTiers.push(safeTierId);
        } else {
            this.tempKycConfig.targetedTiers = this.tempKycConfig.targetedTiers.filter(id => id !== safeTierId);
        }
    },

    saveKycSettings: function() {
        if (!this.tempKycConfig) return;
        EventBus.emit('req-save-kyc-config', this.tempKycConfig);
        this.tempKycConfig = null;
    }
};