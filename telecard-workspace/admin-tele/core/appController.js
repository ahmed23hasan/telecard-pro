// ============================================================================
// 🧠 الموجه المركزي للنظام (core/appController.js) - Master Orchestrator 🚀
// الوظيفة: إقلاع النظام، الملاحة، إدارة حالة النظام، والربط المركزي للأحداث
// 🌟 التحديث: توحيد شاشات الحماية (Loaders)، تأمين رفع الصور، ومعالجة الأخطاء
// ============================================================================

import { AdminData } from '../adminData.js';
import { AdminUI } from '../adminUI.js';
import { AdminRender } from '../adminRender.js';
import { Utils, EventBus } from '../adminUtils.js';

import { RenderHelpers } from './renderHelpers.js'; 

import { OrdersActions } from '../modules/orders/ordersActions.js';
import { FinanceActions } from '../modules/finance/financeActions.js';
import { UsersActions } from '../modules/users/usersActions.js';
import { CatalogActions } from '../modules/catalog/catalogActions.js';
import { MarketingActions } from '../modules/marketing/marketingActions.js';
import { SystemActions } from './systemActions.js';

import { CatalogController } from '../modules/catalog/catalogController.js';
import { MarketingController } from '../modules/marketing/marketingController.js';
import { FirebaseAdapter } from './firebaseAdapter.js';

import { DeveloperActions } from '../modules/developer/developerActions.js';
import { IntegrationsActions } from '../modules/integrations/integrationsActions.js';

const getSystemRouters = () => ({
    ...OrdersActions, ...FinanceActions, ...UsersActions, 
    ...CatalogActions, ...MarketingActions, ...SystemActions,
    ...DeveloperActions,
    ...IntegrationsActions 
});

export const AppController = {
    isInitialized: false,
    
    get data() { return AdminData?.data || {}; },
    get filters() { return AdminData?.filters || {}; },
    
    currFolder: null, tempPackages: [], tempEditId: null, tempPayDetails: [],
    sortUsers: 'desc', userSortCategory: 'newest', userSearch: '',
    selectedUserId: null, selectedTierId: null,

    updateState: function(newState) {
        for (let key in newState) { try { this[key] = newState[key]; } catch(e) { } }
        EventBus.emit('state-update', newState);
    },

    init: async function() {
        if (this.isInitialized) return; 
        try {
            AdminUI?.initTheme?.();
            this.setupEventBusListeners();
            AdminRender?.initListeners?.(); 
            
            if (AdminUI?.onResize) {
                window.addEventListener('resize', AdminUI.onResize.bind(AdminUI));
                AdminUI.onResize();
            }
            
            if (AdminData?.loadData) {
                await AdminData.loadData();
                RenderHelpers?.init?.(AdminData.data);
                
                AdminRender?.updateBadges?.();
                AdminRender?.updateProfileUI?.();
                const pendingKycCount = (AdminData.data.users || []).filter(u => u.kycStatus === 'pending').length;
                
                if (AdminUI?.UsersUI?.updateSidebarKycBadge) {
                    AdminUI.UsersUI.updateSidebarKycBadge(pendingKycCount);
                }
            }
            
            this.setupAuthGate();
            
            window.addEventListener('storage', async () => {
                await AdminData?.loadData?.();
                RenderHelpers?.init?.(AdminData.data); 
                AdminRender?.updateBadges?.();
            });

            this.isInitialized = true;
        } catch (error) { 
            const actualErrorMsg = error.message || error.toString();
            console.error("🚨 خطأ داخلي أثناء رسم الواجهات:", actualErrorMsg); 
            
            if (typeof AdminUI !== 'undefined' && AdminUI.showToast) {
                AdminUI.showToast("خطأ يعيق رسم البيانات: " + actualErrorMsg, 'error', 7000);
            } else {
                alert("خطأ يعيق رسم البيانات: " + actualErrorMsg);
            }
        } 
        finally { 
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
        }
    },

    setupAuthGate: function() {
        const isLogged = sessionStorage.getItem('telecard_admin_auth') === 'true'; 
        if (!isLogged) {
            window.location.replace('login.html');
            return;
        }
        this.nav?.('dash', null);
    },
    
    logoutAdmin: function() { 
        sessionStorage.removeItem('telecard_admin_auth'); 
        window.location.replace('login.html'); 
    },

    setupEventBusListeners: function() {
        EventBus.on('req-logout', () => this.logoutAdmin());
        EventBus.on('req-save-system', () => this.saveSystem());
        EventBus.on('req-save-admin-profile', () => this.saveAdminProfile());
        
        EventBus.on('req-navigate-filter', (data) => this.navWithFilter?.(data.section, data.status));
        EventBus.on('req-refresh', (data) => this.refresh?.(data.type));
        EventBus.on('req-toggle-system', (data) => this.confirmSystemToggle?.(data.type, data.element));
        EventBus.on('req-save-support', () => this.saveSupportSettings?.());
        EventBus.on('req-save-terms', () => this.saveTerms?.());
        EventBus.on('req-delete-item', (data) => this.delItem?.(data.type, data.id));
        EventBus.on('req-apply-filters', (data) => this.applyFilters?.(data.section));
        EventBus.on('req-quick-date', (data) => this.setQuickDateFilter?.(data.range, data.section));
        
        EventBus.on('action-triggered', async (data) => {
            const routers = getSystemRouters();
            if (routers[data.action]) await routers[data.action](data);
            else console.warn(`⚠️ حدث غير مبرمج في النظام: ${data.action}`);
        });
        
        EventBus.on('req-navigate', (data) => this.nav?.(data.page, data.btnEl));
        EventBus.on('req-show-toast', (data) => AdminUI?.showToast?.(data.message, data.type || 'success'));
        EventBus.on('modals-closed', () => this.updateState({ tempEditId: null, tempPackages: [], tempPayDetails: [] }));
        
        EventBus.on('req-open-modal', (modalId) => AdminUI?.openModal?.(modalId));
        EventBus.on('set-temp-edit-id', (id) => this.updateState({ tempEditId: id !== null ? String(id) : null }));
        
        EventBus.on('tier-option-selected', (tierId) => this.updateState({ selectedTierId: tierId }));
        
        EventBus.on('req-save-kyc-config', async (newKycConfig) => {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ إعدادات التوثيق...');
            try {
                if (!AdminData.data.settings) AdminData.data.settings = {};
                AdminData.data.settings.kycConfig = newKycConfig;
                await AdminData.saveSystemSettings();
                AdminUI?.showToast('تم اعتماد إعدادات التوثيق وحفظ الأمان بنجاح!', 'success');
            } catch (e) {
                AdminUI?.showToast('حدث خطأ أثناء حفظ الإعدادات', 'error');
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        });
    },

    finishAction: function(renderEvent, modalId, logAction, logDetails, toastMsg, toastType = 'success') {
        if (modalId) AdminUI?.closeModal?.(modalId);
        else AdminUI?.closeModal?.();

        if (renderEvent) EventBus.emit(renderEvent);
        if (logAction && logDetails && AdminData?.addLog) AdminData.addLog(logAction, logDetails);
        if (toastMsg) AdminUI?.showToast?.(toastMsg, toastType);
    },

    clearAllSearchAndFilters: function() {
        if (this.filters) {
            if (this.filters.deposits) this.filters.deposits = { search: '', start: null, end: null };
            if (this.filters.orders) this.filters.orders = { search: '', start: null, end: null };
        }
        this.updateState({ userSearch: '' });
        AdminUI?.clearAllSearchAndFiltersUI?.(); 
    },

    applyFilters: function(section) {
        if (!this.filters) this.filters = {};
        if (!this.filters[section]) this.filters[section] = { search: '', start: null, end: null };

        const searchInput = document.getElementById(`${section}-search-input`) || document.getElementById(`search-${section}`);
        const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';

        this.filters[section].search = searchVal;
        this.updateState({ filters: this.filters });
        
        if (section === 'orders') EventBus.emit('req-render-orders');
        else if (section === 'deposits') EventBus.emit('req-render-deposits');
    },
    
    setQuickDateFilter: function(range, section) {
        if (!this.filters) this.filters = {};
        if (!this.filters[section]) this.filters[section] = { search: '', start: null, end: null };
        
        let start = null, end = null;
        const now = new Date();
        
        if (range === 'today') {
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            end = start + 86399999;
        } else if (range === 'week') {
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).getTime();
            end = now.getTime();
        } else if (range === 'month') {
            start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).getTime();
            end = now.getTime();
        } 
        
        this.filters[section].start = start;
        this.filters[section].end = end;
        this.updateState({ filters: this.filters });
        
        document.querySelectorAll(`.qf-btn[data-section="${section}"]`).forEach(btn => {
            btn.classList.remove('active', 'border-gold', 'text-gold');
        });
        const activeBtn = document.querySelector(`.qf-btn[data-section="${section}"][data-range="${range}"]`);
        if (activeBtn) activeBtn.classList.add('active', 'border-gold', 'text-gold');
        
        const calText = document.getElementById(`date-filter-${section}`);
        if(calText) { calText.innerText = 'DD/MM/YYYY'; calText.classList.add('placeholder-text'); calText.closest('.custom-field')?.classList.remove('active'); }

        if (section === 'orders') EventBus.emit('req-render-orders');
        else if (section === 'deposits') EventBus.emit('req-render-deposits');
    },

    navWithFilter: function(section, status) {
        this.nav(section);
        setTimeout(() => AdminRender?.filterByTab?.(section, status), 100);
    },

    nav: async function(id, el) {
        if (window.innerWidth < 992) { AdminUI?.closeSidebar?.(); }
        this.clearAllSearchAndFilters();
        AdminUI?.switchSystemView?.(id);
        
        requestAnimationFrame(() => {
            if (['rates', 'tiers', 'ads', 'sys', 'terms'].includes(id)) { 
                AdminUI?.setupSettingsViews?.(id, this.data); 
            }

            const renderMap = {
                'dash': 'req-render-dash', 'sales': 'req-render-sales', 'deposits': 'req-render-deposits',
                'orders': 'req-render-orders', 'products': 'req-render-prods', 'payments': 'req-render-payments',
                'tiers': 'req-render-tiers', 'wallets': 'req-render-wallets', 'rates': 'req-render-rates',
                'notifs': 'req-render-alerts', 'countries': 'req-render-countries', 'vault': 'req-render-vault',
                'coupons': 'req-render-coupons', 'offers': 'req-render-offers', 'logs': 'req-render-logs'
            };
            
            if (id === 'users') { EventBus.emit('req-update-user-sort'); EventBus.emit('req-render-users'); }
            if (id === 'kyc-system') { EventBus.emit('req-render-kyc'); }
            if (renderMap[id]) EventBus.emit(renderMap[id]);
        }); 
    },
    
    refresh: async function(type) {
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري التحديث...');
        try {
            await AdminData?.loadData?.(true);
            const refreshMap = { 'deposits': 'req-render-deposits', 'orders': 'req-render-orders', 'users': 'req-render-users', 'products': 'req-render-prods', 'logs': 'req-render-logs', 'wallets': 'req-render-wallets' };
            if (refreshMap[type]) EventBus.emit(refreshMap[type]); else await this.nav(type || 'dash');
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    back: function() { 
        if (this.currFolder) { 
            const curr = this.data.cats.find(x => String(x.id) === String(this.currFolder)); 
            if (curr) { 
                this.updateState({ currFolder: curr.parentId !== null && curr.parentId !== 'null' ? String(curr.parentId) : null }); 
                EventBus.emit('req-render-prods'); 
            } 
        } 
    },
    
    enter: function(id) { 
        this.updateState({ currFolder: id !== null ? String(id) : null }); 
        EventBus.emit('req-render-prods'); 
    },

    // ==========================================
    // ⚙️ إعدادات النظام العامة والحذف (محمية بالـ Loaders)
    // ==========================================
    saveSystem: async function() { 
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ إعدادات النظام...');
        try {
            if (!this.data.system) this.data.system = {}; 
            this.data.system = { 
                ...this.data.system,
                maint: Utils.getCheck('sys-maint-toggle'), 
                msg: Utils.escapeHTML(Utils.getVal('sys-maint-msg')), 
                date: Utils.getVal('sys-maint'), 
                freeze: Utils.getCheck('sys-freeze-toggle'), 
                freezeMsg: Utils.escapeHTML(Utils.getVal('sys-freeze-msg')) 
            }; 
            await AdminData?.saveSystemSettings?.(); 
            AdminUI?.showToast('تم حفظ إعدادات النظام بنجاح', 'success');
        } catch(e) {
            AdminUI?.showToast('فشل حفظ الإعدادات', 'error');
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    confirmSystemToggle: async function(type, checkbox) {
        const isChecked = checkbox.checked; 
        checkbox.checked = !isChecked; 
        let msg = type === 'maint' ? (isChecked ? '⚠️ متأكد من إغلاق المتجر؟' : 'فتح المتجر؟') : (isChecked ? '⚠️ تجميد العمليات المالية؟' : 'إلغاء التجميد؟');
        if (AdminUI && await AdminUI.showConfirm(msg)) { 
            checkbox.checked = isChecked; 
            this.saveSystem(); 
        }
    },
    
    saveSupportSettings: async function() { 
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ إعدادات الدعم...');
        try {
            const activeIcon = document.querySelector('.is-opt.active'); 
            const activeAnim = document.querySelector('.anim-opt.active'); 
            this.data.settings.supportLink = Utils.escapeHTML(Utils.getVal('supp-link')); 
            this.data.settings.supportIcon = activeIcon ? activeIcon.dataset.val : 'fa-whatsapp'; 
            this.data.settings.supportAnimation = activeAnim ? activeAnim.dataset.val : 'none'; 
            await AdminData?.saveSystemSettings?.(); 
            AdminUI?.showToast('تم حفظ إعدادات الدعم بنجاح', 'success');
        } catch(e) {
            AdminUI?.showToast('فشل حفظ الإعدادات', 'error');
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    
    saveTerms: async function() { 
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, "جاري رفع الشروط للسحابة...");
        try {
            const termsArray = AdminUI?.getTermsDataFromUI?.() || [];
            if (!this.data.settings) this.data.settings = {};
            this.data.settings.terms = termsArray;

            const success = await AdminData?.saveSystemSettings?.();
            if (success) {
                AdminUI?.showToast?.('تم حفظ الشروط والأحكام بنجاح!', 'success');
                if (AdminData?.addLog) AdminData.addLog('UPDATE_TERMS', 'قام بتحديث الشروط والأحكام (الكروت الذكية).');
            } else {
                AdminUI?.showToast?.('حدث خطأ أثناء حفظ الشروط في السحابة', 'error');
            }
        } catch (error) {
            console.error("❌ خطأ أثناء حفظ الشروط:", error);
            AdminUI?.showToast?.('حدث خطأ غير متوقع!', 'error');
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    
    saveAdminProfile: async function() { 
        const name = Utils.escapeHTML(Utils.getVal('adm-name')), 
              email = Utils.escapeHTML(Utils.getVal('adm-email')), 
              pass = Utils.escapeHTML(Utils.getVal('adm-pass')); 
              
        if (!name || !email) return AdminUI?.showToast('الاسم والبريد مطلوبان', 'error'); 
        
        // 🌟 تشغيل اللودر لحماية رفع الصورة
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث الملف الشخصي...');

        try {
            const wrap = document.getElementById('adm-img-wrap'); 
            const hasImg = wrap?.classList.contains('has-img'); 
            
            let finalImg = '';
            if (hasImg) {
                const fileInput = document.getElementById('adm-img-file');
                const fileToUpload = fileInput?.files?.[0];

                if (fileToUpload) {
                    AdminUI?.showToast('جاري رفع صورتك الشخصية...', 'info');
                    finalImg = await FirebaseAdapter.uploadImage(fileToUpload, 'admin');
                } else {
                    finalImg = this.data.adminProfile.img || '';
                }
            }
            this.data.adminProfile = { name, email, pass, img: finalImg }; 
            
            await AdminData?.saveAdminProfile?.(); 
            EventBus.emit('req-update-profile-ui'); 
            AdminUI?.showToast('تم حفظ الملف الشخصي بنجاح', 'success'); 
        } catch (error) {
            AdminUI?.showToast('تعذر تحديث الملف الشخصي', 'error');
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    delItem: async function(type, id) {
        const strId = String(id);
        
        if (type === 'vault') return CatalogController.deleteVaultPool(strId);
        if (type === 'country') return CatalogController.deleteCountry(strId);
        if (type === 'cat') return CatalogController.deleteCategory(strId); 
        if (type === 'prod') return CatalogController.deleteProduct(strId); 
        if (type === 'coupon') return MarketingController.deleteCoupon(strId);
        if (type === 'offer') return MarketingController.deleteOffer(strId);
        
        let itemName = "عنصر";
        
        // 🌟 حماية الحذف بشاشة تحميل (لأنها تتضمن حذف صور من السحابة)
        if (type === 'pay') {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري مسح البوابة السحابية...');
            try {
                const itm = this.data.payments.find(x => String(x.id) === strId);
                if (itm) {
                    itemName = itm.name;
                    if (itm.img && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                        try { await FirebaseAdapter.deleteImageByUrl(itm.img); } catch(e){}
                    }
                }
                this.data.payments = this.data.payments.filter(x => String(x.id) !== strId);
                await AdminData.savePayments();
                this.finishAction('req-render-payments', null, `DELETE_PAY`, `تم حذف بوابة الدفع: ${itemName}`, 'تم الحذف بنجاح');
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
        else if (type === 'banner') {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري مسح البنر الإعلاني...');
            try {
                const bnr = this.data.banners.find(x => String(x.id) === strId);
                if (bnr && bnr.img && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                    try { await FirebaseAdapter.deleteImageByUrl(bnr.img); } catch(e){}
                }
                this.data.banners = this.data.banners.filter(x => String(x.id) !== strId);
                await AdminData.saveBanners();
                this.finishAction('req-render-banners', null, `DELETE_BANNER`, `تم حذف لافتة إعلانية`, 'تم الحذف بنجاح');
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    }
};