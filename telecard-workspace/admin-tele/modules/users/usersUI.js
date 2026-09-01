// ============================================================================
// 👥 وحدة المستخدمين والتوثيق (modules/users/usersUI.js) - Enterprise V16.2 💎
// 🎯 الوظيفة: إدارة التفاعلات المرئية فقط (Visual Interactions)
// 🚀 التحديث الأقصى: 
// 1. Ghost Event Fix: توجيه زر "إدارة العملاء" في المستويات لمحرك الرسم مباشرة لإنهاء مشكلة الزر الميت.
// 2. Dead Code Elimination: إزالة كود الـ Modal القديم واعتماد السجل الموحد.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { UsersTemplates } from './usersTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { UIService } from '../../core/uiService.js';
import { UsersRender } from './usersRender.js'; // 🚀 استيراد المحرك الصحيح لربط المسارات

export const UsersUI = {
    tempKycConfig: null,
    
    // ---------------------------------------------------------
    // 👑 1. إدارة المستويات (Tiers)
    // ---------------------------------------------------------
    openTierModal: function(id = null) {
        EventBus.emit('set-temp-edit-id', id);
        const tier = id ? (AdminData.data.tiersMap?.[id] || AdminData.data.tiers.find(t => String(t.id) === String(id))) : null;
        this.setupTierModal(tier);
        EventBus.emit('req-open-modal', 'tier');
    },
    
    setupTierModal: function(tier) {
        const safeSetVal = (elId, val) => {
            const el = document.getElementById(elId);
            if (el) el.value = val;
        };
        
        safeSetVal('t-id', tier ? tier.id : '');
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
    
    // 🚀 [الإصلاح الماسي]: استدعاء دالة الرسم مباشرة لفتح صفحة العملاء للمستوى المحدد
    openTierUsers: function(tierId) {
        if (UsersRender && typeof UsersRender.showTierUsersPage === 'function') {
            UsersRender.showTierUsersPage(tierId);
        } else {
            console.error("UsersRender.showTierUsersPage is not defined");
            UIService.showToast('حدث خطأ في توجيه الواجهة', 'error');
        }
    },
    
    backToTiers: function() {
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        const tiersSection = document.getElementById('view-tiers');
        if (tiersSection) tiersSection.classList.add('active');
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
    
    showTierSelection: function(userId) {
        const u = AdminData.data.usersMap?.[userId] || (AdminData.data.users || []).find(x => String(x.id) === String(userId));
        if (!u) return;
        
        let modal = document.getElementById('tier-selection-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'tier-selection-modal';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }
        
        const tiers = AdminData.data.tiers || [];
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
        if (modal) modal.classList.remove('active');
    },
    
    // ---------------------------------------------------------
    // 👤 2. إدارة ملفات المستخدمين (Users)
    // ---------------------------------------------------------
    openUserEditModal: function(userId) {
        const u = AdminData.data.usersMap?.[userId] || (AdminData.data.users || []).find(x => String(x.id) === String(userId));
        if (!u) return UIService.showToast('لم يتم العثور على العميل', 'error');
        
        const container = document.getElementById('user-edit-form-container');
        if (container) container.innerHTML = UsersTemplates.userEditForm(u);
        
        const modal = document.getElementById('m-user-edit');
        if (modal) modal.classList.add('active');
    },
    
    closeUserEditModal: function() {
        const modal = document.getElementById('m-user-edit');
        if (modal) modal.classList.remove('active');
    },
    
    clearCustomNotifInput: function() {
        const input = document.getElementById('user-custom-notif');
        if (input) input.value = '';
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
        
        // قراءة حالة أزرار الأمان الجديدة
        const forceBioEl = document.getElementById('policy-force-bio');
        const force2FAEl = document.getElementById('policy-force-2fa');
        
        const securityPolicy = {
            forceBiometrics: forceBioEl ? forceBioEl.checked : false,
            force2FA: force2FAEl ? force2FAEl.checked : false
        };

        // إرسال البيانات (KYC + Security) للموجه المركزي للحفظ
        EventBus.emit('req-save-kyc-config', {
            kycConfig: this.tempKycConfig,
            securityPolicy: securityPolicy
        });
        
        this.tempKycConfig = null;
    }

};
