// ============================================================================
// 🧠 الموجه المركزي للنظام (core/appController.js) - Enterprise V15.8 💎
// 🎯 الوظيفة: إقلاع النظام، الملاحة، إدارة حالة النظام، والربط المركزي للأحداث
// 🚀 التحديثات المعمارية:
// 1. Radar Preferences: فصل إعدادات الإشعارات (غرفة العمليات) عن الملف الشخصي.
// 2. Data-Wipe Shield: إصلاح ثغرة حفظ الملف الشخصي لمنع تدمير تفضيلات وتوكنز الرادار.
// 3. FCM Boot Trigger: تشغيل المراقبة الذكية وصلاحيات المتصفح عند الإقلاع.
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
import { FirebaseAdapter, auth } from './firebaseAdapter.js'; 

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
        for (let key in newState) {
            try {
                this[key] = newState[key];
                if (AdminData) AdminData[key] = newState[key];
            } catch (e) {}
        }
        EventBus.emit('state-update', newState);
    },
    
    init: async function() {
        if (this.isInitialized) return; 
        
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
            
            this.nav?.('dash', null);
            
            window.addEventListener('storage', async () => {
                await AdminData?.loadData?.();
                RenderHelpers?.init?.(AdminData.data); 
                AdminRender?.updateBadges?.();
            });

            this.isInitialized = true;

            // 🚀 [تفعيل الرادار الصامت أو طلب الصلاحية عند الإقلاع]
            setTimeout(() => {
                this.setupAdminPushNotifications();
                if (AdminUI?.showAdminPushPrompt) AdminUI.showAdminPushPrompt();
            }, 4000);

        } catch (error) { 
            const actualErrorMsg = error.message || error.toString();
            console.error("🚨 خطأ داخلي أثناء رسم الواجهات:", actualErrorMsg); 
            AdminUI?.showToast?.("خطأ يعيق رسم البيانات: " + actualErrorMsg, 'error', 7000);
        } 
        finally { 
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
        }
    },

    setupAuthGate: function() {
        return new Promise((resolve) => {
            const unsubscribe = auth.onAuthStateChanged((user) => {
                unsubscribe(); 
                
                if (user) {
                    user.getIdTokenResult().then((idTokenResult) => {
                        const isRealAdmin = idTokenResult.claims.admin === true;
                        
                        if (isRealAdmin) {
                            resolve(true); 
                        } else {
                            console.warn("🚨 تم إحباط محاولة دخول بصلاحيات غير إدارية!");
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
            
            setTimeout(() => { resolve(false); }, 15000);
        });
    },

    logoutAdmin: function() {
        sessionStorage.removeItem('telecard_admin_auth'); 
        if (typeof FirebaseAdapter !== 'undefined') FirebaseAdapter.killAllListeners();
        if (typeof EventBus !== 'undefined') EventBus.clearAll();
        if (auth) auth.signOut().catch(() => {});
        window.location.replace('login.html');
    },

    setupEventBusListeners: function() {
        EventBus.on('req-logout', () => this.logoutAdmin());
        EventBus.on('req-navigate', (data) => this.nav?.(data.page, data.btnEl));
        EventBus.on('req-navigate-filter', (data) => this.navWithFilter?.(data.section, data.status));
        EventBus.on('req-refresh', (data) => this.refresh?.(data.type));
        EventBus.on('req-go-back', () => this.back());
        EventBus.on('req-close-modal', (data) => AdminUI?.closeModal?.(data?.id || null));
        
        // 🚀 أحداث الرادار (غرفة العمليات)
        EventBus.on('req-enable-notifs', () => {
            document.getElementById('admin-push-prompt')?.remove();
            this.setupAdminPushNotifications(true);
        });
        EventBus.on('req-dismiss-notifs', () => {
            document.getElementById('admin-push-prompt')?.remove();
            localStorage.setItem('tc_admin_push_prompt', Date.now().toString());
        });
        EventBus.on('req-save-admin-prefs', () => this.saveAdminPreferences());

        EventBus.on('req-save-system', () => this.saveSystem());
        EventBus.on('req-force-sync-pricing', () => this.forceSyncPricingCache());
        EventBus.on('req-save-admin-profile', (payloadData) => this.saveAdminProfile(payloadData));
        EventBus.on('req-toggle-system', (data) => this.confirmSystemToggle?.(data.type, data.element));
        EventBus.on('req-save-support', () => this.saveSupportSettings?.());
        EventBus.on('req-save-terms', () => this.saveTerms?.());
        EventBus.on('req-auto-save-settings', () => { MarketingController.autoSaveSettings?.(); });
        
        EventBus.on('save-about-us', () => this.saveAboutUs());
        EventBus.on('save-social-links', () => this.saveSocialLinks()); 
        EventBus.on('add-social-link', () => this.addSocialLinkRow());
        EventBus.on('switch-notifs-tab', (data) => this.switchNotifsTab(data.tab));
        EventBus.on('reply-complaint', (data) => this.replyToComplaint(data.id));
        EventBus.on('filter-reviews', () => this.renderComplaints());
        
        EventBus.on('req-force-sync', () => { CatalogController.forceSyncStore?.(); });
        EventBus.on('req-delete-item', (data) => this.delItem?.(data.type, data.id));
        EventBus.on('req-apply-filters', (data) => this.applyFilters?.(data.section));
        EventBus.on('req-quick-date', (data) => this.setQuickDateFilter?.(data.range, data.section));
        
        EventBus.on('req-add-ban-ip', () => this.addGlobalBanIp());
        EventBus.on('req-remove-ban-ip', (data) => this.removeGlobalBanIp(data.ip));
        EventBus.on('req-remove-ban-device', (data) => this.removeGlobalBanDevice(data.device));
        
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
        
        EventBus.on('action-triggered', async (data) => {
            if (data.action === 'switch-notifs-tab') { this.switchNotifsTab(data.tab); return; }
            if (data.action === 'save-about-us') { this.saveAboutUs(); return; }
            if (data.action === 'save-social-links') { this.saveSocialLinks(); return; } 
            if (data.action === 'add-social-link') { this.addSocialLinkRow(); return; } 
            if (data.action === 'filter-reviews') { this.renderComplaints(); return; }

            const routers = getSystemRouters();
            if (routers[data.action]) await routers[data.action](data);
            else console.warn(`⚠️ حدث غير مبرمج في النظام: ${data.action}`);
        });

        EventBus.on('req-show-toast', (data) => AdminUI?.showToast?.(data.message, data.type || 'success'));
        EventBus.on('req-open-modal', (modalId) => AdminUI?.openModal?.(modalId));
        EventBus.on('modals-closed', () => this.updateState({ tempEditId: null, tempPackages: [], tempPayDetails: [] }));
        EventBus.on('set-temp-edit-id', (id) => this.updateState({ tempEditId: id !== null ? String(id) : null }));
        EventBus.on('tier-option-selected', (tierId) => this.updateState({ selectedTierId: tierId }));
        EventBus.on('req-init-sortable', (data) => AdminUI?.CatalogUI?.initSortableEngine?.(data.container, data.type));

        EventBus.on('req-save-kyc-config', async (dataPayload) => {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ إعدادات الأمان...');
            try {
                if (!AdminData.data.settings) AdminData.data.settings = {};
                AdminData.data.settings.kycConfig = dataPayload.kycConfig;
                AdminData.data.settings.securityPolicy = dataPayload.securityPolicy; 
                await AdminData.saveSystemSettings();
                AdminUI?.showToast('تم اعتماد إعدادات التوثيق والأمان بنجاح!', 'success');
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
            if (['rates', 'tiers', 'ads', 'sys', 'terms'].includes(id)) { AdminUI?.setupSettingsViews?.(id, this.data); }
            if (id === 'sys') { this.renderFirewallBlacklist(); }
            if (id === 'ads') { this.hydrateAdsSection(); }

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

    hydrateAdsSection: function() {
        const settings = this.data.settings || {};
        const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
        const safeCheck = (id, checked) => { const el = document.getElementById(id); if(el) el.checked = !!checked; };
        
        const safeImgSet = (wrapId, imgId, url) => {
            const wrap = document.getElementById(wrapId);
            const img = document.getElementById(imgId) || (wrap ? wrap.querySelector('img') : null);
            if (wrap && img) {
                if (url && url.trim() !== '') {
                    img.src = url;
                    img.classList.remove('hide-element');
                    img.style.display = 'block';
                    wrap.classList.add('has-img'); 
                } else {
                    img.src = '';
                    img.classList.add('hide-element');
                    img.style.display = 'none';
                    wrap.classList.remove('has-img');
                }
            }
        };

        safeImgSet('store-logo-wrap', 'store-logo-preview', settings.storeLogo);
        safeImgSet('store-favicon-wrap', 'store-favicon-preview', settings.storeFavicon);

        safeSet('store-about-us', settings.aboutUs || '');
        safeSet('store-name-input', settings.storeName || '');
        safeSet('store-name-weight', settings.storeNameWeight || '900');
        safeSet('store-color-type', settings.storeColorType || 'solid');
        safeSet('store-color-1', settings.storeColor1 || '#ffffff');
        safeSet('store-color-2', settings.storeColor2 || '#FFD700');
        safeCheck('store-name-shadow', settings.storeNameShadow);
        
        const sizeEl = document.getElementById('store-logo-size');
        if (sizeEl) {
            sizeEl.value = settings.storeLogoSize || 36;
            const sizeValEl = document.getElementById('logo-size-val');
            if (sizeValEl) sizeValEl.innerText = `${settings.storeLogoSize || 36}px`;
        }

        safeSet('promo-text', settings.tickerText || '');
        safeSet('promo-speed', settings.tickerSpeed || 'horizontal-normal');
        safeSet('slider-time', settings.sliderTime || 3);
        safeSet('slider-transition', settings.sliderTransition || 'fade');
        
        safeSet('social-desc', settings.socialDesc || settings.socialLinks?.desc || '');
        
        const container = document.getElementById('social-links-container');
        if (container) {
            container.innerHTML = ''; 
            const linksList = Array.isArray(settings.socialLinksList) ? settings.socialLinksList : [];
            
            if (settings.socialLinks && !Array.isArray(settings.socialLinks) && linksList.length === 0) {
                if (settings.socialLinks.whatsapp) linksList.push({icon: 'fa-whatsapp', name: 'مجتمع الواتساب', url: settings.socialLinks.whatsapp});
                if (settings.socialLinks.telegram) linksList.push({icon: 'fa-telegram', name: 'قناة التلغرام', url: settings.socialLinks.telegram});
                if (settings.socialLinks.facebook) linksList.push({icon: 'fa-facebook', name: 'صفحة الفيسبوك', url: settings.socialLinks.facebook});
                if (settings.socialLinks.instagram) linksList.push({icon: 'fa-instagram', name: 'حساب الانستغرام', url: settings.socialLinks.instagram});
            }

            if (linksList.length === 0) {
                this.addSocialLinkRow(); 
            } else {
                linksList.forEach(link => this.addSocialLinkRow(link));
            }
        }

        if (typeof EventBus !== 'undefined') EventBus.emit('action-triggered', { action: 'update-brand' });
    },

    addSocialLinkRow: function(linkData = { icon: 'fa-link', name: '', url: '' }) {
        const container = document.getElementById('social-links-container');
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'social-dynamic-row d-flex gap-2 align-items-center p-10';
        row.style.cssText = 'background: var(--bg-body); border: 1px solid var(--border-color); border-radius: 8px;';
        
        row.innerHTML = `
            <select class="form-input mb-0 flex-1 dyn-social-icon">
                <option value="fa-whatsapp" ${linkData.icon === 'fa-whatsapp' ? 'selected' : ''}>واتساب</option>
                <option value="fa-telegram" ${linkData.icon === 'fa-telegram' ? 'selected' : ''}>تلغرام</option>
                <option value="fa-facebook" ${linkData.icon === 'fa-facebook' ? 'selected' : ''}>فيسبوك</option>
                <option value="fa-instagram" ${linkData.icon === 'fa-instagram' ? 'selected' : ''}>انستغرام</option>
                <option value="fa-x-twitter" ${linkData.icon === 'fa-x-twitter' ? 'selected' : ''}>تويتر (X)</option>
                <option value="fa-youtube" ${linkData.icon === 'fa-youtube' ? 'selected' : ''}>يوتيوب</option>
                <option value="fa-tiktok" ${linkData.icon === 'fa-tiktok' ? 'selected' : ''}>تيك توك</option>
                <option value="fa-discord" ${linkData.icon === 'fa-discord' ? 'selected' : ''}>ديسكورد</option>
                <option value="fa-link" ${linkData.icon === 'fa-link' ? 'selected' : ''}>رابط عام</option>
            </select>
            <input type="text" class="form-input mb-0 flex-1 dyn-social-name" placeholder="الاسم (مثال: مجتمع واتساب)" value="${Utils.escapeHTML(linkData.name)}">
            <input type="url" class="form-input mb-0 flex-2 num-en dyn-social-url" dir="ltr" placeholder="https://..." value="${Utils.escapeHTML(linkData.url)}">
            <button type="button" class="btn btn-red btn-sm px-10" onclick="this.parentElement.remove()" title="حذف"><i class="fa-solid fa-trash"></i></button>
        `;
        container.appendChild(row);
    },

    saveSocialLinks: async function() {
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ الروابط...');
        try {
            if (!this.data.settings) this.data.settings = {};
            
            const desc = Utils.escapeHTML(document.getElementById('social-desc')?.value.trim() || '');
            const links = [];
            
            document.querySelectorAll('.social-dynamic-row').forEach(row => {
                const icon = row.querySelector('.dyn-social-icon')?.value;
                const name = row.querySelector('.dyn-social-name')?.value.trim();
                const url = row.querySelector('.dyn-social-url')?.value.trim();
                
                if (name && url) { 
                    links.push({
                        icon: Utils.escapeHTML(icon),
                        name: Utils.escapeHTML(name),
                        url: url.trim() 
                    });
                }
            });

            this.data.settings.socialDesc = desc;
            this.data.settings.socialLinksList = links;
            
            await AdminData?.saveSystemSettings?.();
            AdminUI?.showToast('تم حفظ قنوات التواصل بنجاح!', 'success');
        } catch (error) {
            AdminUI?.showToast('حدث خطأ أثناء الحفظ', 'error');
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    refresh: async function(type) {
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري التحديث...');
        try {
            await AdminData?.loadData?.(true);
            const refreshMap = { 'deposits': 'req-render-deposits', 'orders': 'req-render-orders', 'users': 'req-render-users', 'products': 'req-render-prods', 'logs': 'req-render-logs', 'wallets': 'req-render-wallets', 'complaints': 'filter-reviews' };
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
                this.updateState({ currFolder: null });
            }
            EventBus.emit('req-render-prods');
        } else {
            AdminUI?.closeModal?.();
        }
    },

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

    forceSyncPricingCache: async function() {
        if (AdminUI && await AdminUI.showConfirm('هل أنت متأكد من إعادة بناء كاش التسعير والبوابات السحابي؟\nاستخدم هذا الخيار (كزر طوارئ) فقط إذا لاحظت عدم تحديث الأسعار في واجهة المتجر.', 'ترميم الكاش السحابي')) {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري ترميم الكاش السحابي للأسعار والبوابات...');
            try {
                const result = await FirebaseAdapter.callFunction('adminForceSyncPricing', {});
                if (result && result.success) {
                    AdminUI?.showToast?.('تمت إعادة بناء الكاش بنجاح!', 'success');
                    if (AdminData?.addLog) AdminData.addLog('FORCE_SYNC_CACHE', 'تم ترميم كاش الأسعار والبوابات يدوياً');
                } else throw new Error(result ? result.message : "لم يستجب السيرفر.");
            } catch (error) {
                AdminUI?.showToast?.(`فشل ترميم الكاش: ${error.message}`, 'error');
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
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

    saveAboutUs: async function() {
        const aboutTextEl = document.getElementById('store-about-us');
        if (!aboutTextEl) return;
        const aboutText = Utils.escapeHTML(aboutTextEl.value.trim());
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ النص التعريفي...');
        try {
            if (!this.data.settings) this.data.settings = {};
            this.data.settings.aboutUs = aboutText;
            await AdminData?.saveSystemSettings?.();
            AdminUI?.showToast('تم حفظ صفحة (من نحن) وتحديث المتجر بنجاح!', 'success');
        } catch (error) {
            AdminUI?.showToast('حدث خطأ أثناء الحفظ', 'error');
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    switchNotifsTab: function(tabName) {
        const alertsCont = document.getElementById('notifs-alerts-container');
        const compCont = document.getElementById('notifs-complaints-container');
        const buttons = document.querySelectorAll('#tabs-support .main-tab-btn');
        
        if (buttons) buttons.forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        if (tabName === 'alerts') {
            if (alertsCont) alertsCont.classList.remove('hide-element');
            if (compCont) compCont.classList.add('hide-element');
        } else {
            if (alertsCont) alertsCont.classList.add('hide-element');
            if (compCont) compCont.classList.remove('hide-element');
            this.renderComplaints(); 
        }
    },

    renderComplaints: function() {
        const grid = document.getElementById('complaints-grid');
        const badge = document.getElementById('count-complaints');
        const filterEl = document.getElementById('reviews-filter');
        const filterVal = filterEl ? filterEl.value : 'pending_bad';
        
        if (!grid) return;

        let reviews = AdminData.data.reviews || [];
        
        const pendingCount = reviews.filter(r => r.status === 'pending' && r.rating <= 2).length;
        if (badge) badge.innerText = pendingCount;

        if (filterVal === 'pending_bad') {
            reviews = reviews.filter(r => r.status === 'pending' && r.rating <= 2);
        } else if (filterVal === 'resolved') {
            reviews = reviews.filter(r => r.status === 'resolved');
        }

        if (reviews.length === 0) {
            grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-check-double text-success"></i><span>لا توجد بيانات تطابق الفلتر الحالي.</span></div>`;
            return;
        }

        grid.innerHTML = reviews.sort((a,b) => b.time - a.time).map(r => {
            const isResolved = r.status === 'resolved';
            const isGood = r.rating >= 4;
            const user = AdminData.data.usersMap?.[r.userId] || { name: 'عميل غير معروف' };
            const borderColor = isGood ? 'border-success' : (isResolved ? 'resolved-complaint' : 'border-danger');
            
            return `
            <div class="card ${borderColor}">
                <div class="flex-between mb-10">
                    <span class="fw-bold"><i class="fa-solid fa-user"></i> ${Utils.escapeHTML(user.name || user.fullName)}</span>
                    <span class="badge-tag ${isGood ? 'bg-success' : (isResolved ? 'bg-info' : 'bg-danger')} text-white">
                        ${isGood ? '<i class="fa-solid fa-heart"></i> تقييم ممتاز' : (isResolved ? '<i class="fa-solid fa-check-double"></i> تمت المعالجة' : '<i class="fa-solid fa-clock"></i> بانتظار الرد')}
                    </span>
                </div>
                <div class="mb-10 fs-14">
                    <span class="text-warning">${'<i class="fa-solid fa-star"></i>'.repeat(r.rating)}${'<i class="fa-regular fa-star"></i>'.repeat(5 - r.rating)}</span>
                </div>
                ${r.text ? `<p class="fs-13 text-muted mb-15 p-10" style="background: var(--bg-body); border-radius: 6px;">"${Utils.escapeHTML(r.text)}"</p>` : ''}
                
                ${isResolved ? 
                `<div class="p-10 bg-success-10 text-success border-success-15" style="border-radius: 6px; font-size: 12px;">
                    <i class="fa-solid fa-reply"></i> <b>رد الإدارة:</b> ${Utils.escapeHTML(r.adminReply)}
                </div>` 
                : (!isGood ? `
                <div id="reply-box-${r.id}" class="mt-10">
                    <textarea id="reply-text-${r.id}" class="form-input mb-10" rows="2" placeholder="اكتب رسالة اعتذار للعميل أو كود خصم للتعويض..."></textarea>
                    <button class="btn btn-primary w-100" onclick="EventBus.emit('reply-complaint', { id: '${r.id}' })">
                        <i class="fa-solid fa-paper-plane"></i> إرسال الرد للعميل
                    </button>
                </div>
                ` : '')}
            </div>`;
        }).join('');
    },

    replyToComplaint: async function(reviewId) {
        const replyInput = document.getElementById(`reply-text-${reviewId}`);
        const reply = replyInput ? replyInput.value.trim() : '';
        
        if (!reply) {
            AdminUI?.showToast('يرجى كتابة رد للعميل أولاً', 'warning');
            return;
        }

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إرسال الرد للعميل...');
        try {
            if (typeof FirebaseAdapter !== 'undefined' && FirebaseAdapter.updateDocument) {
                await FirebaseAdapter.updateDocument('reviews', reviewId, {
                    status: 'resolved',
                    adminReply: reply,
                    resolvedAt: Date.now()
                });
            } else {
                console.warn("FirebaseAdapter.updateDocument is not defined. Simulating update for UI.");
            }

            const review = AdminData.data.reviews.find(r => r.id === reviewId);
            if (review) {
                review.status = 'resolved';
                review.adminReply = reply;
            }

            this.renderComplaints();
            AdminUI?.showToast('تم إرسال الرد بنجاح!', 'success');
            
        } catch (error) {
            console.error("Complaint Reply Error:", error);
            AdminUI?.showToast('حدث خطأ أثناء إرسال الرد', 'error');
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
                if (AdminData?.addLog) AdminData.addLog('UPDATE_TERMS', 'قام بتحديث الشروط والأحكام.');
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
    
    saveAdminProfile: async function(profileData) {
        const name = profileData?.name || Utils.escapeHTML(Utils.getVal('adm-name'));
        const email = profileData?.email || Utils.escapeHTML(Utils.getVal('adm-email'));
        const pass = profileData?.pass || Utils.escapeHTML(Utils.getVal('adm-pass'));
        const hasImg = profileData?.hasImg !== undefined ? profileData.hasImg : document.getElementById('adm-img-wrap')?.classList.contains('has-img');
        const fileToUpload = profileData?.file !== undefined ? profileData.file : document.getElementById('adm-img-file')?.files?.[0];

        if (!name || !email) return AdminUI?.showToast('الاسم والبريد مطلوبان', 'error');
        
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث الملف الشخصي...');
        
        try {
            let finalImg = '';
            const oldImgUrl = this.data.adminProfile?.img || null;
            
            if (hasImg) {
                if (fileToUpload) {
                    AdminUI?.showToast('جاري معالجة ورفع الصورة...', 'info');
                    if (oldImgUrl && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                        await FirebaseAdapter.deleteImageByUrl(oldImgUrl).catch(() => {});
                    }
                    const ext = fileToUpload.name.includes('.') ? fileToUpload.name.split('.').pop().toLowerCase() : 'jpg';
                    const customName = `admin_profile_${Date.now()}.${ext}`;
                    finalImg = await FirebaseAdapter.uploadImage(fileToUpload, 'admin', customName, true);
                } else {
                    finalImg = oldImgUrl || '';
                }
            } else {
                if (oldImgUrl && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                    await FirebaseAdapter.deleteImageByUrl(oldImgUrl).catch(() => {});
                }
                finalImg = '';
            }
            
            // 🚀 [الترقيع المعماري]: دمج البيانات لتفادي مسح إعدادات الرادار والتوكنز
            this.data.adminProfile = { 
                ...this.data.adminProfile, 
                name, 
                email, 
                pass, 
                img: finalImg 
            };
            
            await AdminData?.saveAdminProfile?.();
            EventBus.emit('req-update-profile-ui');
            AdminUI?.showToast('تم حفظ الملف الشخصي بنجاح', 'success');
        } catch (error) {
            AdminUI?.showToast(error.message || 'تعذر تحديث الملف الشخصي', 'error');
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    // 🚀 [الرادار المعماري]: تفعيل الرادار، طلب الصلاحية، وجمع التفضيلات
    setupAdminPushNotifications: async function(forcePrompt = false) {
        if (typeof window === 'undefined' || !window.Notification) return;

        if (forcePrompt && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return;
        }

        if (Notification.permission === 'granted') {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري ربط جهازك بغرفة العمليات...');
            try {
                // 🚀 تم دمج مفتاح VAPID الخاص بالمشروع
                const VAPID_KEY = "BDdFL5sHBs1j5RXsps4TahR2UN4qCRwZR2G769OJEGR_1gTj8D2MHsTRsMeSv_Spad22N6LYFsu0x9GhdARqEFk"; 
                const token = await FirebaseAdapter.requestFCMToken(VAPID_KEY);

                if (token) {
                    let currentTokens = Array.isArray(this.data.adminProfile?.fcmTokens) ? [...this.data.adminProfile.fcmTokens] : [];
                    if (!currentTokens.includes(token)) {
                        currentTokens.push(token);
                        // حماية الذاكرة السحابية: 5 أجهزة كحد أقصى للمدير
                        if (currentTokens.length > 5) currentTokens = currentTokens.slice(-5); 
                        
                        if (!this.data.adminProfile) this.data.adminProfile = {};
                        this.data.adminProfile.fcmTokens = currentTokens;
                        
                        await AdminData.saveAdminProfile();
                        AdminUI?.showToast('تم تفعيل الإنذار الفوري على هذا الجهاز بنجاح! 🚀', 'success');
                    }
                }
            } catch (e) {
                console.warn('⚠️ فشل تفعيل إشعارات الإدارة:', e);
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    // 🚀 [الرادار المعماري]: دالة مستقلة لحفظ تفضيلات الإشعارات فقط
    saveAdminPreferences: async function() {
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث إعدادات غرفة العمليات...');
        try {
            const pushPrefs = {
                orders: Utils.getCheck('pref-orders', true),
                deposits: Utils.getCheck('pref-deposits', true),
                kyc: Utils.getCheck('pref-kyc', false),
                vault: Utils.getCheck('pref-vault', true),
                complaints: Utils.getCheck('pref-complaints', true)
            };

            let currentTokens = Array.isArray(this.data.adminProfile?.fcmTokens) ? [...this.data.adminProfile.fcmTokens] : [];
            // 🚀 تم دمج مفتاح VAPID الخاص بالمشروع
            const VAPID_KEY = "BDdFL5sHBs1j5RXsps4TahR2UN4qCRwZR2G769OJEGR_1gTj8D2MHsTRsMeSv_Spad22N6LYFsu0x9GhdARqEFk"; 
            
            if (typeof window !== 'undefined' && window.Notification && Notification.permission !== 'denied') {
                const token = await FirebaseAdapter.requestFCMToken(VAPID_KEY);
                if (token && !currentTokens.includes(token)) {
                    currentTokens.push(token);
                    if (currentTokens.length > 5) currentTokens = currentTokens.slice(-5); 
                }
            }

            if (!this.data.adminProfile) this.data.adminProfile = {};
            this.data.adminProfile.pushPrefs = pushPrefs;
            this.data.adminProfile.fcmTokens = currentTokens;
            
            await AdminData?.saveAdminProfile?.();
            
            AdminUI?.showToast('تم تحديث إعدادات الرادار السحابي بنجاح 🚀', 'success');
            AdminUI?.closeModal?.('admin-prefs'); // إغلاق نافذة التفضيلات
        } catch (error) {
            AdminUI?.showToast('تعذر حفظ إعدادات الإشعارات', 'error');
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
                
                if (typeof FirebaseAdapter !== 'undefined' && FirebaseAdapter.callFunction) {
                    FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
                }

                this.finishAction('req-render-payments', null, `DELETE_PAY`, `تم حذف بوابة الدفع: ${itemName}`, 'تم الحذف بنجاح');
            } catch (error) {
                AdminUI?.showToast(error.message || 'فشل الحذف', 'error');
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
            } catch (error) {
                AdminUI?.showToast(error.message || 'فشل الحذف', 'error');
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    }
};
