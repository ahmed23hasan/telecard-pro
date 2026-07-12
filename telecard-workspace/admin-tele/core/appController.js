// ============================================================================
// 🧠 الموجه المركزي للنظام (core/appController.js) - Master Orchestrator V9.5 🚀
// الوظيفة: إقلاع النظام، الملاحة، إدارة حالة النظام، والربط المركزي للأحداث
// 🌟 التحديث الأقصى: إغلاق ثغرة Session Bypass، ترشيد مساحة الأدمن، وحماية الحظر
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
import { FirebaseAdapter, auth } from './firebaseAdapter.js'; // 🛡️ استيراد auth للتحقق الحقيقي

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
        
        // 🚨 1. بوابة الأمان أولاً (تحقق صارم)
        const isAuthSafe = await this.setupAuthGate();
        if (!isAuthSafe) return; 

        try {
            AdminUI?.initTheme?.();
            this.setupEventBusListeners();
            AdminRender?.initListeners?.(); 
            
            if (AdminUI?.onResize) {
                window.addEventListener('resize', AdminUI.onResize.bind(AdminUI));
                AdminUI.onResize();
            }
            
            // 🚀 2. الآن، وبما أننا متأكدون من هويته، نحمل البيانات بأمان
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
            
            // 3. توجيه الأدمن للوحة القيادة
            this.nav?.('dash', null);
            
            window.addEventListener('storage', async () => {
                await AdminData?.loadData?.();
                RenderHelpers?.init?.(AdminData.data); 
                AdminRender?.updateBadges?.();
            });

            this.isInitialized = true;
        } catch (error) { 
            const actualErrorMsg = error.message || error.toString();
            console.error("🚨 خطأ داخلي أثناء رسم الواجهات:", actualErrorMsg); 
            AdminUI?.showToast?.("خطأ يعيق رسم البيانات: " + actualErrorMsg, 'error', 7000);
        } 
        finally { 
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
        }
    },

    // 🛡️ [تحديث أمني V9.5]: التحقق الحقيقي من Firebase Auth لمنع تجاوز الـ Storage
    setupAuthGate: function() {
        return new Promise((resolve) => {
            const isSessionFlagged = sessionStorage.getItem('telecard_admin_auth') === 'true'; 
            
            auth.onAuthStateChanged((user) => {
                if (user && isSessionFlagged) {
                    user.getIdTokenResult().then((idTokenResult) => {
                        // يجب أن يمتلك كليم (admin: true) أو يكون هو الجذر (Root Owner)
                        const isRealAdmin = idTokenResult.claims.admin === true || user.uid === 'e064MQJyn6dhU9mNXZvXItc7VYg2';
                        
                        if (isRealAdmin) {
                            resolve(true); // السماح بالدخول
                        } else {
                            console.warn("🚨 محاولة دخول بصلاحيات غير إدارية!");
                            this.logoutAdmin();
                            resolve(false);
                        }
                    }).catch(() => {
                        this.logoutAdmin();
                        resolve(false);
                    });
                } else {
                    console.warn("🚨 جلسة غير صالحة أو مفقودة!");
                    this.logoutAdmin();
                    resolve(false);
                }
            });
            
            // Timeout الطوارئ إذا انقطع الإنترنت
            setTimeout(() => { resolve(false); }, 5000);
        });
    },

    logoutAdmin: function() { 
        sessionStorage.removeItem('telecard_admin_auth'); 
        if (auth) auth.signOut().catch(()=>{}); // تسجيل خروج من فايربيز أيضاً
        window.location.replace('login.html'); 
    },

    setupEventBusListeners: function() {
        // --- 1. أحداث النظام والملاحة الأساسية ---
        EventBus.on('req-logout', () => this.logoutAdmin());
        EventBus.on('req-navigate', (data) => this.nav?.(data.page, data.btnEl));
        EventBus.on('req-navigate-filter', (data) => this.navWithFilter?.(data.section, data.status));
        EventBus.on('req-refresh', (data) => this.refresh?.(data.type));
        // --- مستمعات العودة وإغلاق النوافذ (تم إضافتها لحل مشكلة السهم) ---
        EventBus.on('req-go-back', () => this.back());
        EventBus.on('req-close-modal', (data) => AdminUI?.closeModal?.(data?.id || null));
        // --- 2. أحداث حفظ الإعدادات والهوية ---
        EventBus.on('req-save-system', () => this.saveSystem());
        EventBus.on('req-save-admin-profile', () => this.saveAdminProfile());
        EventBus.on('req-toggle-system', (data) => this.confirmSystemToggle?.(data.type, data.element));
        EventBus.on('req-save-support', () => this.saveSupportSettings?.());
        EventBus.on('req-save-terms', () => this.saveTerms?.());
        
        EventBus.on('req-auto-save-settings', () => { MarketingController.autoSaveSettings?.(); });
        
        // --- 3. أحداث الحذف والفلاتر ---
        EventBus.on('req-delete-item', (data) => this.delItem?.(data.type, data.id));
        EventBus.on('req-apply-filters', (data) => this.applyFilters?.(data.section));
        EventBus.on('req-quick-date', (data) => this.setQuickDateFilter?.(data.range, data.section));
        
        // --- 4. أوامر الجدار الناري والقائمة السوداء (Firewall) 🛡️ ---
        EventBus.on('req-add-ban-ip', () => this.addGlobalBanIp());
        EventBus.on('req-remove-ban-ip', (data) => this.removeGlobalBanIp(data.ip));
        EventBus.on('req-remove-ban-device', (data) => this.removeGlobalBanDevice(data.device));
        
        // --- 5. الموجه الديناميكي للأقسام (Dynamic Routing) 💎 ---
        EventBus.on('req-edit-item', (data) => {
            if (data.type === 'cat') AdminUI?.CatalogUI?.openCategoryModal?.(data.id);
            else if (data.type === 'prod') CatalogController.openProductModal?.(data.id);
            else if (data.type === 'pay') AdminUI?.FinanceUI?.openPaymentModal?.(data.id);
            else if (data.type === 'country') AdminUI?.CatalogUI?.openCountryModal?.(data.id);
            else if (data.type === 'coupon') MarketingController.openCouponModal?.(data.id);
            else if (data.type === 'offer') MarketingController.openOfferModal?.(data.id);
            else if (data.type === 'vault') AdminUI?.CatalogUI?.openVaultModal?.(data.id);
            else if (data.type === 'tier') AdminUI?.UsersUI?.openTierModal?.(data.id);
        });

        EventBus.on('req-update-state', (newState) => this.updateState(newState));
        EventBus.on('req-finish-action', (data) => {
            this.finishAction(data.renderEvent, data.modalId, data.logAction, data.logDetails, data.toastMsg, data.toastType);
        });
        
        // --- 6. معالج أحداث HTML الديناميكية (Action Trigger) ---
        EventBus.on('action-triggered', async (data) => {
            const routers = getSystemRouters();
            if (routers[data.action]) await routers[data.action](data);
            else console.warn(`⚠️ حدث غير مبرمج في النظام: ${data.action}`);
        });
      // --- 7. أحداث النوافذ والـ UI ---
EventBus.on('req-show-toast', (data) => AdminUI?.showToast?.(data.message, data.type || 'success'));
EventBus.on('req-open-modal', (modalId) => AdminUI?.openModal?.(modalId));
EventBus.on('modals-closed', () => this.updateState({ tempEditId: null, tempPackages: [], tempPayDetails: [] }));
EventBus.on('set-temp-edit-id', (id) => this.updateState({ tempEditId: id !== null ? String(id) : null }));
EventBus.on('tier-option-selected', (tierId) => this.updateState({ selectedTierId: tierId }));

// 🧲 [تمت الإضافة هنا]: تشغيل محرك السحب والإفلات للكتالوج
EventBus.on('req-init-sortable', (data) => AdminUI?.CatalogUI?.initSortableEngine?.(data.container, data.type));

// --- 8. إعدادات الأمان والتوثيق (KYC) ---      // --- 8. إعدادات الأمان والتوثيق (KYC) ---
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

            if (id === 'sys') {
                this.renderFirewallBlacklist();
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
            
            if (type === 'sys' || document.getElementById('view-sys')?.classList.contains('active')) {
                this.renderFirewallBlacklist();
            }
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    back: function() {
    if (this.currFolder) {
        const curr = AdminData.data.catsMap?.[this.currFolder] || this.data.cats.find(x => String(x.id) === String(this.currFolder));
        if (curr && curr.parentId && curr.parentId !== 'null') {
            this.updateState({ currFolder: String(curr.parentId) });
        } else {
            // إذا لم يكن هناك قسم أب، نعود للشاشة الرئيسية
            this.updateState({ currFolder: null });
        }
        EventBus.emit('req-render-prods');
    } else {
        // إذا كنا في الرئيسية ونريد العودة، نغلق أي نافذة مفتوحة
        AdminUI?.closeModal?.();
    }
},
    // ==========================================
    // 🛡️ إدارة الجدار الناري والقائمة السوداء (Firewall & Blacklist)
    // ==========================================
    
    renderFirewallBlacklist: function() {
        const ipContainer = document.getElementById('global-banned-ips-container');
        const deviceContainer = document.getElementById('global-banned-devices-container');
        if (!ipContainer || !deviceContainer) return;

        const settings = AdminData.data.settings || {};
        const bannedIps = Array.isArray(settings.bannedIps) ? settings.bannedIps : [];
        const bannedDevices = Array.isArray(settings.bannedDevices) ? settings.bannedDevices : [];

        if (bannedIps.length === 0) {
            ipContainer.innerHTML = '<span class="text-muted fs-11"><i class="fa-solid fa-check text-success"></i> لا توجد عناوين IP محظورة.</span>';
        } else {
            ipContainer.innerHTML = bannedIps.map(ip => `
                <div class="badge-tag bg-danger text-white num-en d-flex align-items-center gap-2" dir="ltr">
                    ${ip} 
                    <i class="fa-solid fa-xmark clickable ms-2" data-action="remove-global-ban-ip" data-ip="${ip}" title="فك الحظر"></i>
                </div>
            `).join('');
        }

        if (bannedDevices.length === 0) {
            deviceContainer.innerHTML = '<span class="text-muted fs-11"><i class="fa-solid fa-check text-success"></i> لا توجد أجهزة مفخخة.</span>';
        } else {
            deviceContainer.innerHTML = bannedDevices.map(dev => `
                <div class="badge-tag bg-info text-white num-en d-flex align-items-center gap-2" dir="ltr">
                    ${dev.substring(0, 10)}... 
                    <i class="fa-solid fa-xmark clickable ms-2" data-action="remove-global-ban-device" data-device="${dev}" title="فك الحظر"></i>
                </div>
            `).join('');
        }
    },

    addGlobalBanIp: async function() {
        const input = document.getElementById('new-ban-ip-input');
        if (!input) return;
        const newIp = input.value.trim();
        
        if (!newIp) return AdminUI.showToast('الرجاء إدخال عنوان IP', 'error');
        
        const isValidIPv4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}$/.test(newIp);
        const isValidIPv6 = /^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$/.test(newIp) || newIp === '::1'; 
        
        if (!isValidIPv4 && !isValidIPv6) {
            return AdminUI.showToast('صيغة الـ IP غير صحيحة، يرجى إدخال IP حقيقي', 'error');
        }

        // 🛡️ [حماية انتحار الجدار الناري]: تحذير شديد قبل حظر أي IP
        if (AdminUI && !await AdminUI.showConfirm(`تنبيه أمني خطير!\nهل أنت متأكد من حظر هذا الـ IP (${newIp})؟\nإذا كان هذا الـ IP يخصك أو يخص سيرفر النظام، فلن تتمكن من دخول اللوحة بعد الآن!`, 'تأكيد الحظر')) return;
        
        if (!AdminData.data.settings) AdminData.data.settings = {};
        if (!AdminData.data.settings.bannedIps) AdminData.data.settings.bannedIps = [];
        
        if (AdminData.data.settings.bannedIps.includes(newIp)) {
            return AdminUI.showToast('هذا الـ IP محظور مسبقاً', 'warning');
        }
        
        if (AdminUI.toggleLoader) AdminUI.toggleLoader(true, 'جاري حظر الـ IP سحابياً...');
        try {
            AdminData.data.settings.bannedIps.push(newIp);
            await AdminData.saveSystemSettings();
            input.value = '';
            this.renderFirewallBlacklist();
            AdminUI.showToast(`تم حظر الشبكة: ${newIp}`, 'success');
            if (AdminData.addLog) AdminData.addLog('FIREWALL_ADD_IP', `إضافة IP للقائمة السوداء: ${newIp}`);
        } catch (e) {
            AdminUI.showToast('حدث خطأ أثناء الحظر', 'error');
        } finally {
            if (AdminUI.toggleLoader) AdminUI.toggleLoader(false);
        }
    },    

    removeGlobalBanIp: async function(ip) {
        if (!AdminUI) return;
        if (!await AdminUI.showConfirm(`هل أنت متأكد من فك الحظر عن الشبكة (${ip})؟`, 'إزالة من القائمة السوداء')) return;

        if (AdminUI.toggleLoader) AdminUI.toggleLoader(true, 'جاري فك الحظر...');
        try {
            AdminData.data.settings.bannedIps = AdminData.data.settings.bannedIps.filter(item => item !== ip);
            await AdminData.saveSystemSettings();
            this.renderFirewallBlacklist();
            AdminUI.showToast(`تم فك الحظر عن الـ IP بنجاح`, 'success');
            if (AdminData.addLog) AdminData.addLog('FIREWALL_REMOVE_IP', `إزالة IP من القائمة السوداء: ${ip}`);
        } catch (e) {
            AdminUI.showToast('حدث خطأ أثناء فك الحظر', 'error');
        } finally {
            if (AdminUI.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    removeGlobalBanDevice: async function(device) {
        if (!AdminUI) return;
        if (!await AdminUI.showConfirm(`هل أنت متأكد من فك الحظر عن هذا الجهاز؟\n(${device})`, 'إزالة من القائمة السوداء')) return;

        if (AdminUI.toggleLoader) AdminUI.toggleLoader(true, 'جاري فك الحظر...');
        try {
            AdminData.data.settings.bannedDevices = AdminData.data.settings.bannedDevices.filter(item => item !== device);
            await AdminData.saveSystemSettings();
            this.renderFirewallBlacklist();
            AdminUI.showToast(`تم فك الحظر عن الجهاز بنجاح`, 'success');
            if (AdminData.addLog) AdminData.addLog('FIREWALL_REMOVE_DEVICE', `إزالة جهاز من القائمة السوداء`);
        } catch (e) {
            AdminUI.showToast('حدث خطأ أثناء فك الحظر', 'error');
        } finally {
            if (AdminUI.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

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
    
    // 🛡️ [تحديث أمني 9.5]: ترشيد مساحة الأدمن (استبدال دائم وحفظ المال)
    saveAdminProfile: async function() { 
        const name = Utils.escapeHTML(Utils.getVal('adm-name')), 
              email = Utils.escapeHTML(Utils.getVal('adm-email')), 
              pass = Utils.escapeHTML(Utils.getVal('adm-pass')); 
              
        if (!name || !email) return AdminUI?.showToast('الاسم والبريد مطلوبان', 'error'); 
        
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
                    const oldImgUrl = this.data.adminProfile?.img || null;
                    // تم تمرير اسم مخصص للصورة + الرابط القديم لحذفه
                    finalImg = await FirebaseAdapter.uploadImage(fileToUpload, 'admin', 'admin_profile_pic.webp', oldImgUrl);
                } else {
                    finalImg = this.data.adminProfile.img || '';
                }
            } else {
                // إذا مسح الصورة، نحذف القديمة من السيرفر
                const oldImgUrl = this.data.adminProfile?.img || null;
                if (oldImgUrl && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                    FirebaseAdapter.deleteImageByUrl(oldImgUrl).catch(()=>{});
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