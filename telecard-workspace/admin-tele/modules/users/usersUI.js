// ============================================================================
// 👥 وحدة المستخدمين والتوثيق (modules/users/usersUI.js) - Cloud-Native V19.7 💎
// 🎯 الوظيفة: إدارة التفاعلات المرئية والنوافذ الديناميكية
// 🚀 التحديثات المعمارية (V19.7 - Hybrid Cloud Tier Search & Focus Guard): 
// 1. Hybrid Tier Search 🔍: فلترة محلية لحظية (0ms) مع بحث سحابي تلقائي (Debounced) إذا لم يوجد العميل ضمن أول 50 بطاقة.
// 2. Dynamic Creation 📦: خلق النوافذ برمجياً عند الطلب فقط لتقليل استهلاك الذاكرة.
// 3. Smart Garbage Collector 🧹: إضافة كلاس (dynamic-auto-destroy) لتدمير النوافذ ذاتياً بعد الإغلاق.
// 4. Zero Jitter Shield 🛡️: إجبار المتصفح على حساب الأبعاد (offsetWidth) قبل الظهور لمنع التمدد.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { UsersTemplates } from './usersTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { UIService } from '../../core/uiService.js';
import { UsersRender } from './usersRender.js'; 

export const UsersUI = {
    tempKycConfig: null,
    _tierSearchTimer: null,
    _hadCloudTierSearch: false,
    
    // ---------------------------------------------------------
    // 👑 1. إدارة المستويات (Tiers)
    // ---------------------------------------------------------
    openTierModal: function(id = null) {
        EventBus.emit('set-temp-edit-id', id);
        const tier = id ? (AdminData.data.tiersMap?.[id] || (AdminData.data.tiers || []).find(t => String(t.id) === String(id))) : null;
        
        let modal = document.getElementById('m-tier');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'm-tier';
            modal.className = 'modal-overlay dynamic-auto-destroy';
            document.body.appendChild(modal);
        }

        modal.innerHTML = UsersTemplates.tierEditModal(tier || {});
        this.setupTierModal(tier);
        void modal.offsetWidth;

        requestAnimationFrame(() => {
            modal.classList.add('active');
        });
        
        EventBus.emit('req-open-modal', 'tier');
    },
    
    setupTierModal: function(tier) {
        const safeSetVal = (elId, val) => {
            const el = document.getElementById(elId);
            if (el) el.value = val !== undefined && val !== null ? val : '';
        };
        
        safeSetVal('t-id', tier ? tier.id : '');
        safeSetVal('t-name', tier ? tier.name : '');
        safeSetVal('t-type', tier ? (tier.type || 'retail') : 'retail');
        safeSetVal('t-profit', tier ? tier.profitPercent : '');
        safeSetVal('t-min', tier ? tier.minProfitUsd : '');
        safeSetVal('t-cond', tier ? tier.threshold : '');
        safeSetVal('t-dur', tier ? tier.durationDays : '');
        
        const defaultCheckbox = document.getElementById('t-default');
        if (defaultCheckbox) defaultCheckbox.checked = tier ? !!tier.isDefault : false;
        
        document.querySelectorAll('.badge-opt').forEach(el => el.classList.remove('active'));
        
        const iconClass = tier ? (tier.icon || tier.badge || 'fa-user') : 'fa-user';
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
        const modalBalVal = document.querySelector('#tab-wallet .ud-balance-card-pro .val');
        if (modalBalVal) {
            modalBalVal.innerHTML = `${Utils.enNum(newBal, 2)} <span class="cur">${curCode}</span>`;
            const popClass = type === 'add' ? 'bal-pop-up' : 'bal-pop-down';
            modalBalVal.classList.add(popClass);
            setTimeout(() => { modalBalVal.classList.remove(popClass); }, 300);
        }
    },
    
    selectTierBadge: function(element, iconClass) {
        const container = element.closest('.badge-selector');
        if (container) {
            container.querySelectorAll('.badge-opt').forEach(el => el.classList.remove('active'));
        }
        element.classList.add('active');
        const hiddenInput = document.getElementById('t-icon');
        if (hiddenInput) hiddenInput.value = iconClass;
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
    
    openTierUsers: function(tierId) {
        this._hadCloudTierSearch = false;
        if (UsersRender && typeof UsersRender.showTierUsersPage === 'function') {
            UsersRender.showTierUsersPage(tierId);
        } else {
            UIService.showToast('حدث خطأ في توجيه الواجهة', 'error');
        }
    },
    
    viewUser: function(id, preventModalOpen = false) {
        if (UsersRender && typeof UsersRender.viewUser === 'function') {
            UsersRender.viewUser(id, preventModalOpen);
        }
    },
    
    backToTiers: function() {
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        const tiersSection = document.getElementById('view-tiers');
        if (tiersSection) tiersSection.classList.add('active');
        const btn = document.querySelector('.nav-item[data-target="tiers"]');
        EventBus.emit('req-navigate', { page: 'tiers', btnEl: btn });
    },    
    
    filterTierUsersLive: function(inputEl) {
        if (!inputEl) return;
        const term = (inputEl.value || '').toLowerCase().trim();
        const container = document.getElementById('tier-users-container');
        if (!container) return;
        
        const cards = container.querySelectorAll('.tier-user-card');
        let visibleCount = 0;
        
        cards.forEach(card => {
            const text = card.innerText.toLowerCase();
            if (text.includes(term)) {
                card.classList.remove('hide-element');
                visibleCount++;
            } else {
                card.classList.add('hide-element');
            }
        });
        
        let emptyState = document.getElementById('tier-users-empty-search');
        if (visibleCount === 0 && term !== '') {
            if (!emptyState) {
                emptyState = document.createElement('div');
                emptyState.id = 'tier-users-empty-search';
                emptyState.className = 'empty-state mt-20';
                emptyState.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i><span>جاري البحث في السحابة...</span>`;
                container.appendChild(emptyState);
            }
        } else if (emptyState) {
            emptyState.remove();
        }

        // 🚀 بحث سحابي تلقائي إذا لم يكن العميل ضمن الـ 50 بطاقة المعروضة محلياً، أو عند مسح البحث السحابي السابق
        if (this._tierSearchTimer) clearTimeout(this._tierSearchTimer);
        if ((visibleCount === 0 && term.length >= 2) || (term === '' && this._hadCloudTierSearch)) {
            this._tierSearchTimer = setTimeout(() => {
                this._hadCloudTierSearch = (term !== '');
                if (UsersRender && typeof UsersRender.renderTierUsersPage === 'function') {
                    UsersRender.renderTierUsersPage(false, true);
                }
            }, 450);
        }
    },
    
    showTierSelection: async function(userId) {
    const strId = String(userId);
    let u = AdminData.data.usersMap?.[strId] ||
        (AdminData.data.users || []).find(x => String(x.id) === strId) ||
        (AdminData.data.kycPendingUsers || []).find(x => String(x.id) === strId);
    if (!u) {
        UIService.showToast('تعذر العثور على العميل لتغيير مستواه', 'error');
        return;
    }
    
    let modal = document.getElementById('tier-selection-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tier-selection-modal';
        modal.className = 'modal-overlay dynamic-auto-destroy';
        document.body.appendChild(modal);
    }
    
    const tiers = AdminData.data.tiers || [];
    modal.innerHTML = UsersTemplates.tierSelectionModal(u, tiers);
    
    void modal.offsetWidth;
    
    requestAnimationFrame(() => {
        modal.classList.add('active');
    });
},    selectTierOption: function(element) {
        document.querySelectorAll('.tier-option').forEach(opt => opt.classList.remove('selected'));
        element.classList.add('selected');
        
        const tierId = element.dataset.tierId;
        const tier = AdminData.data.tiersMap?.[tierId] || (AdminData.data.tiers || []).find(t => String(t.id) === String(tierId));
        
        const checkbox = document.getElementById('tier-manual-override');
        const container = document.getElementById('tier-override-container');
        
        if (checkbox && container && tier) {
            if (tier.type === 'api') {
                checkbox.checked = true;
                checkbox.disabled = true;
                container.style.opacity = '0.6';
                container.style.cursor = 'not-allowed';
            } else {
                checkbox.disabled = false;
                container.style.opacity = '1';
                container.style.cursor = 'pointer';
            }
        }

        EventBus.emit('tier-option-selected', tierId);
    },

    closeTierSelection: function() {
        if (window.AdminUI && window.AdminUI.closeModal) {
            window.AdminUI.closeModal('tier-selection-modal');
        }
    },
    
    // ---------------------------------------------------------
    // 👤 2. إدارة ملفات المستخدمين (Users)
    // ---------------------------------------------------------
    openUserEditModal: function(userId) {
    const strId = String(userId);
    const u = AdminData.data.usersMap?.[strId] ||
        (AdminData.data.users || []).find(x => String(x.id) === strId) ||
        (AdminData.data.kycPendingUsers || []).find(x => String(x.id) === strId);
    if (!u) return UIService.showToast('لم يتم العثور على العميل', 'error');
    
    let modal = document.getElementById('m-user-edit');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'm-user-edit';
        modal.className = 'modal-overlay dynamic-auto-destroy';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = UsersTemplates.userEditModal(u);
    void modal.offsetWidth;
    
    requestAnimationFrame(() => {
        modal.classList.add('active');
    });
},    closeUserEditModal: function() {
        if (window.AdminUI && window.AdminUI.closeModal) {
            window.AdminUI.closeModal('m-user-edit');
        }
    },
    
    clearCustomNotifInput: function() {
        const input = document.getElementById('user-custom-notif');
        if (input) input.value = '';
    },
    
    // ---------------------------------------------------------
    // 🛡️ 3. مركز التوثيق والأمان (KYC System)
    // ---------------------------------------------------------
    filterKycRequests: function(searchTerm) {
        const term = (searchTerm || '').toLowerCase().trim();
        const container = document.getElementById('kyc-requests-container');
        if (!container) return;
        
        const cards = container.querySelectorAll('.kyc-request-card');
        let visibleCount = 0;
        
        cards.forEach(card => {
            const text = card.innerText.toLowerCase();
            if (text.includes(term)) {
                card.classList.remove('hide-element');
                visibleCount++;
            } else {
                card.classList.add('hide-element');
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
            badge.classList.remove('hide-element');
            badge.classList.add('animate__animated', 'animate__pulse');
            setTimeout(() => badge.classList.remove('animate__animated', 'animate__pulse'), 1000);
        } else {
            badge.classList.add('hide-element');
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
            msg = 'هل أنت متأكد من إيقاف نظام التوثيق بالكامل لجميع العملاء؟';
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
            if (!this.tempKycConfig.targetedTiers.includes(safeTierId)) {
                this.tempKycConfig.targetedTiers.push(safeTierId);
            }
        } else {
            this.tempKycConfig.targetedTiers = this.tempKycConfig.targetedTiers.filter(id => id !== safeTierId);
        }
    },
    
    saveKycSettings: function() {
        if (!this.tempKycConfig) {
            const settings = AdminData.data.settings || {};
            this.tempKycConfig = JSON.parse(JSON.stringify(settings.kycConfig || { mode: 'off', targetedTiers: [] }));
        }
        
        const forceBioEl = document.getElementById('policy-force-bio');
        const force2FAEl = document.getElementById('policy-force-2fa');
        
        const securityPolicy = {
            forceBiometrics: forceBioEl ? forceBioEl.checked : false,
            force2FA: force2FAEl ? force2FAEl.checked : false
        };

        EventBus.emit('req-save-kyc-config', {
            kycConfig: this.tempKycConfig,
            securityPolicy: securityPolicy
        });
        
        this.tempKycConfig = null;
    }
};