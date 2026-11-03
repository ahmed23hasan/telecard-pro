// ============================================================================
// 🧠 الموجه المركزي للنظام (core/appController.js) - Enterprise V19.3 💎
// 🎯 الوظيفة: إقلاع النظام، الملاحة، إدارة حالة النظام، والربط المركزي للأحداث
// 🚀 التحديثات المعمارية (V19.3 - Raw Data Save & Anti-Double Escape):
// 1. Raw Data Persistence 💾: حفظ النصوص الخام (غير المشفرة) في Firestore لمنع التشفير المزدوج والتشوهات البصرية.
// 2. Auth Timeout Enforcement ⏱️: إنهاء الجلسة فعلياً (logoutAdmin) عند تجاوز مهلة التحقق من التوثيق.
// 3. Zero-Leak Firewall UI 🧱: توجيه دوال حظر/فك حظر الـ IP والأجهزة لتحديث وقراءة الوثيقة السرية (active_configs) مباشرة لمنع التسريب.
// 4. Zero-Read Badges 🚀: إزالة الاستدعاءات المكررة لتحديث الشارات والاعتماد كلياً على adminData.
// 5. Search Timer Clash Fix ⏱️: توحيد استدعاء السيرفر عند البحث وإلغاء المؤقتات المعلقة لمنع التعارض.
// ============================================================================

import { AdminData } from '../adminData.js';
import { AdminUI } from '../adminUI.js';
import { AdminRender } from '../adminRender.js';
import { Utils, EventBus } from '../adminUtils.js';

import { VAPID_KEY, normalizeRates } from '../adminConfig.js';

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
import { arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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
    _isInitializing: false,
    _isLoggingOut: false,
    _authGateUnsub: null,
    
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
        if (this.isInitialized || this._isInitializing) return;
        this._isInitializing = true;

        try {
            // 1. التحقق من التوثيق (Gate)
            const isAuthSafe = await this.setupAuthGate();
            if (!isAuthSafe) return; 

            // 2. إعداد الواجهة والمستمعين
            AdminUI?.initTheme?.();
            this.setupEventBusListeners();
            AdminRender?.initListeners?.(); 
            
            if (AdminUI?.onResize) {
                window.addEventListener('resize', AdminUI.onResize.bind(AdminUI));
                AdminUI.onResize();
            }
            
            // 3. جلب البيانات المركزية
            if (AdminData?.loadData) {
                try {
                    await AdminData.loadData(auth?.currentUser?.uid); 
                } catch (loadError) {
                    console.error("🚨 فشل حرج أثناء استيراد البيانات من السحابة:", loadError);
                    AdminUI?.showToast?.("خطأ في الاتصال بقاعدة البيانات. تأكد من جودة الإنترنت وحاول مجدداً.", 'error', 7000);
                    return; 
                }

                // 4. تهيئة الرسومات بعد ضمان نجاح البيانات
                RenderHelpers?.init?.(AdminData.data);
                
                // 🚀 تمت إزالة updateBadges المكرر للاعتماد على جلب لوحة القيادة الذكي
                AdminRender?.updateProfileUI?.();
                
                // 5. حساب عدد الـ KYC مع الاستفادة القصوى من kycPendingUsers كمصدر أساسي
                const pendingKycCount = Math.max(
                    (AdminData.data.kycPendingUsers || []).length,
                    (AdminData.data.users || []).filter(u => u.kycStatus === 'pending').length
                );
                if (AdminUI?.UsersUI?.updateSidebarKycBadge) {
                    AdminUI.UsersUI.updateSidebarKycBadge(pendingKycCount);
                }
            }
            
            // 6. الملاحة للصفحة الرئيسية (Dashboard)
            this.nav?.('dash', null);
            
            // 7. مستمع التزامن الأمني بين التبويبات (يرصد تسجيل الخروج فقط دون استنزاف القراءات)
            window.addEventListener('storage', (e) => {
                if (e.key === 'telecard_admin_auth' && !e.newValue) {
                    window.location.replace('login.html');
                }
            });

            this.isInitialized = true;

            // 8. إعداد إشعارات الدفع (FCM) بعد استقرار الواجهة
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
            this._isInitializing = false;
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
        }
    },

    setupAuthGate: function() {
        return new Promise((resolve) => {
            let isResolved = false; 

            if (this._authGateUnsub) {
                try { this._authGateUnsub(); } catch (e) {}
                this._authGateUnsub = null;
            }

            this._authGateUnsub = auth.onIdTokenChanged(async (user) => {
                if (this._isLoggingOut) return;
                if (user) {
                    try {
                        const idTokenResult = await user.getIdTokenResult();
                        const isRealAdmin = idTokenResult.claims.admin === true;
                        
                        if (isRealAdmin) {
                            if (!isResolved) {
                                isResolved = true;
                                resolve(true); 
                            }
                        } else {
                            console.warn("🚨 تم سحب الصلاحيات أو الحساب غير مصرح له!");
                            if (!isResolved) { isResolved = true; resolve(false); }
                            this.logoutAdmin(); 
                        }
                    } catch (error) {
                        if (!isResolved) { isResolved = true; resolve(false); }
                        this.logoutAdmin();
                    }
                } else {
                    console.warn("🚨 جلسة غير صالحة أو مفقودة!");
                    if (!isResolved) { isResolved = true; resolve(false); }
                    this.logoutAdmin();
                }
            });
            
            setTimeout(() => { 
                if (!isResolved) {
                    isResolved = true;
                    console.error("⏳ انتهى وقت انتظار المصادقة السحابية.");
                    this.logoutAdmin();
                    resolve(false); 
                }
            }, 15000);
        });
    },    

    logoutAdmin: async function() { 
        if (this._isLoggingOut) return;
        this._isLoggingOut = true;

        if (this._authGateUnsub) {
            try { this._authGateUnsub(); } catch (e) {}
            this._authGateUnsub = null;
        }

        sessionStorage.removeItem('telecard_admin_auth');
        localStorage.removeItem('telecard_admin_auth');
        localStorage.removeItem('telecard_admin_last_activity');
        
        if (AdminData && AdminData.data) {
            AdminData.data = {};
            AdminData.cursors = {};
            AdminData._snapshots = {};
            AdminData.walletsCache = { totalUsd: 0, details: {} };
        }

        if (typeof FirebaseAdapter !== 'undefined') FirebaseAdapter.killAllListeners();
        if (typeof EventBus !== 'undefined') EventBus.clearAll();
        
        if (auth) {
            try { await auth.signOut(); } 
            catch (e) { console.error("خطأ في تسجيل الخروج السحابي:", e); }
        }
        
        try {
            if (window.indexedDB && window.indexedDB.databases) {
                window.indexedDB.databases().then(dbs => {
                    dbs.forEach(db => {
                        if (db.name.includes('firebase')) window.indexedDB.deleteDatabase(db.name);
                    });
                }).catch(()=>{});
            }
        } catch(e) {}
        
        window.location.replace('login.html');
    },
    setupEventBusListeners: function() {
        EventBus.on('req-logout', () => this.logoutAdmin());
        EventBus.on('req-navigate', (data) => this.nav?.(data.page, data.btnEl));
        EventBus.on('req-navigate-filter', (data) => this.navWithFilter?.(data.section, data.status, data.source));
        EventBus.on('req-refresh', (data) => this.refresh?.(data.type));
        EventBus.on('req-go-back', () => this.back());
        EventBus.on('req-close-modal', (data) => AdminUI?.closeModal?.(data?.id || null));
        
        EventBus.on('critical-fx-alert', async (data) => {
            const fxCode = String(data.code).toUpperCase();
            const lockKey = `fx_alert_cooldown_${fxCode}`;
            const lastAlertTime = parseInt(localStorage.getItem(lockKey) || '0');
            const now = Date.now();
            
            if (now - lastAlertTime > 1800000) {
                localStorage.setItem(lockKey, now.toString());
                AdminUI?.showToast?.(`⚠️ تنبيه حرج: سعر صرف العملة (${fxCode}) متعطل أو صفري! يرجى إصلاحه فوراً من الإعدادات لمنع توقف الطلبات.`, 'error', 10000);
                if (AdminData?.addLog) AdminData.addLog('CRITICAL_FX_ERROR', `توقف التسعير: سعر الصرف للعملة (${fxCode}) يساوي صفر!`);
            }
        });

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
EventBus.on('req-reset-admin-password', () => this.resetAdminPassword());    EventBus.on('req-toggle-system', (data) => this.confirmSystemToggle?.(data.type, data.element));
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
        
        EventBus.on('filter-date-changed', (data) => {
            if (!data || !data.section) return;
            if (!this.filters) this.filters = {};
            if (!this.filters[data.section]) this.filters[data.section] = { search: '', start: null, end: null };
            const d = data.dateObj;
            if (d instanceof Date && !isNaN(d.getTime())) {
                const utcStartOfDay = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
                if (data.type === 'start') this.filters[data.section].start = utcStartOfDay;
                else if (data.type === 'end') this.filters[data.section].end = utcStartOfDay + 86399999;
                document.querySelectorAll(`.qf-btn[data-section="${data.section}"]`).forEach(btn => btn.classList.remove('active', 'border-gold', 'text-gold'));
                this.applyFilters(data.section);
            }
        });

        EventBus.on('filter-date-cleared', (data) => {
            if (!data || !data.section || !this.filters?.[data.section]) return;
            if (data.type === 'start') this.filters[data.section].start = null;
            else if (data.type === 'end') this.filters[data.section].end = null;
            this.applyFilters(data.section);
        });
        
        EventBus.on('req-add-ban-ip', () => this.addGlobalBanIp());
        EventBus.on('req-remove-ban-ip', (data) => this.removeGlobalBanIp(data.ip));
        EventBus.on('req-remove-ban-device', (data) => this.removeGlobalBanDevice(data.device));
        
        EventBus.on('req-edit-item', (data) => {
            if (data.type === 'cat') AdminUI?.CatalogUI?.openCategoryModal?.(data.id);
            else if (data.type === 'prod') CatalogController.openProductModal?.(data.id);
            else if (data.type === 'pay') AdminUI?.FinanceUI?.openPaymentModal?.(data.id);
            else if (data.type === 'country') AdminUI?.CatalogUI?.openCountryModal?.(data.id);
            else if (data.type === 'coupon') AdminUI?.MarketingUI?.openCouponModal?.(data.id);
            else if (data.type === 'offer') AdminUI?.MarketingUI?.openOfferModal?.(data.id);         
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
            if (data.action === 'reply-complaint') { this.replyToComplaint(data.id); return; }

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

    // 🚀 [الإصلاح المعماري 3] - توحيد الفلاتر لحل مشكلة السباق بين الـ Timers والاستدعاءات المباشرة
    applyFilters: async function(section) {
        if (!this.filters) this.filters = {};
        if (!this.filters[section]) this.filters[section] = { search: '', start: null, end: null };

        const searchInput = document.getElementById(`${section}-search-input`) || document.getElementById(`search-${section}`);
        const searchVal = searchInput ? searchInput.value.trim() : '';

        this.filters[section].search = searchVal;
        
        if (section === 'orders') {
            const { OrdersRender } = await import('../modules/orders/ordersRender.js');
            if (OrdersRender) {
                if (OrdersRender._cloudSearchTimer) clearTimeout(OrdersRender._cloudSearchTimer);
                OrdersRender.filters = { ...this.filters.orders };
                OrdersRender.triggerCloudFilterReload();
            }
        }
        else if (section === 'deposits') {
            const { FinanceRender } = await import('../modules/finance/financeRender.js');
            if (FinanceRender) {
                if (FinanceRender._cloudSearchTimer) clearTimeout(FinanceRender._cloudSearchTimer);
                FinanceRender.filters = { ...this.filters.deposits };
                FinanceRender.triggerCloudFilterReload();
            }
        }
    },

    setQuickDateFilter: function(range, section) {
        if (!this.filters) this.filters = {};
        if (!this.filters[section]) this.filters[section] = { search: '', start: null, end: null };
        
        let start = null, end = null;
        const now = new Date();
        const startOfTodayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const endOfTodayUTC = startOfTodayUTC + 86399999; 
        
        if (range === 'today') {
            start = startOfTodayUTC;
            end = endOfTodayUTC;
        } else if (range === 'week') {
            start = startOfTodayUTC - (6 * 86400000); 
            end = endOfTodayUTC;
        } else if (range === 'month') {
            start = startOfTodayUTC - (29 * 86400000); 
            end = endOfTodayUTC;
        }
               
        this.filters[section].start = start;
        this.filters[section].end = end;
        this.updateState({ filters: this.filters });
        
        document.querySelectorAll(`.qf-btn[data-section="${section}"]`).forEach(btn => {
            btn.classList.remove('active', 'border-gold', 'text-gold');
        });
        const activeBtn = document.querySelector(`.qf-btn[data-section="${section}"][data-range="${range}"]`);
        if (activeBtn) activeBtn.classList.add('active', 'border-gold', 'text-gold');
        
        AdminUI?.updateQuickDateUI?.(null, null, section);

this.applyFilters(section);    },

    navWithFilter: function(section, status, source = null) {
        this.nav(section);
        setTimeout(() => {
            if (source && section === 'orders') {
                EventBus.emit('action-triggered', { action: 'filter-orders-source', val: source });
            } else if (status && section !== 'users') {
                EventBus.emit('action-triggered', { action: `filter-${section}`, val: status });
            }
        }, 120);
    },

    nav: async function(id, el) {
        if (window.innerWidth < 992) { AdminUI?.closeSidebar?.(); }
        this.clearAllSearchAndFilters();
        AdminUI?.switchSystemView?.(id);
        
        requestAnimationFrame(() => {
            if (['rates', 'tiers', 'ads', 'sys', 'terms'].includes(id)) { AdminUI?.setupSettingsViews?.(id, this.data); }
            if (id === 'sys') { this.renderFirewallBlacklist(); }
            if (id === 'ads') { this.hydrateAdsSection(); }
if (id === 'coupons') { AdminUI?.MarketingUI?.switchPromoTab?.('coupons', document.querySelector('#tabs-promotions [data-tab="coupons"]')); }
if (id === 'notifs') { this.switchNotifsTab('alerts'); }
            const renderMap = {
                'dash': 'req-render-dash', 'sales': 'req-render-sales', 'deposits': 'req-render-deposits',
                'orders': 'req-render-orders', 'products': 'req-render-prods', 'payments': 'req-render-payments',
                'tiers': 'req-render-tiers', 'wallets': 'req-render-wallets', 'rates': 'req-render-rates',
                'notifs': 'req-render-alerts', 'countries': 'req-render-countries', 'vault': 'req-render-vault',
                'coupons': 'req-render-coupons', 'offers': 'req-render-offers', 'logs': 'req-render-logs',
                'integrations': 'req-render-integrations'
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

        safeImgSet('store-logo-wrap', 'store-logo-preview', settings.storeLogo || this.data.system?.storeLogo);
        safeImgSet('store-logo-light-wrap', 'store-logo-light-preview', settings.storeLogoLight || this.data.system?.storeLogoLight);
        safeImgSet('store-favicon-wrap', 'store-favicon-preview', settings.storeFavicon || this.data.system?.storeFavicon);
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
            <button type="button" class="btn btn-red btn-sm px-10 dyn-social-del-btn" title="حذف"><i class="fa-solid fa-trash"></i></button>
        `;
        row.querySelector('.dyn-social-del-btn')?.addEventListener('click', () => row.remove());
        container.appendChild(row);
    },

    // 🛡️ التحديث المطلوب: استبدال دوال escapeHTML لحفظ النصوص خام في قاعدة البيانات
    saveSocialLinks: async function() {
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ الروابط...');
        try {
            if (!this.data.settings) this.data.settings = {};
            
            const desc = document.getElementById('social-desc')?.value.trim() || '';
            const links = [];
            
            for (const row of document.querySelectorAll('.social-dynamic-row')) {
                const icon = (row.querySelector('.dyn-social-icon')?.value || 'fa-link').trim();
                const name = row.querySelector('.dyn-social-name')?.value.trim();
                const url = row.querySelector('.dyn-social-url')?.value.trim();
                
                if (name && url) {
                    if (!/^https?:\/\//i.test(url)) {
                        AdminUI?.showToast(`الرابط (${name}) يجب أن يبدأ بـ https:// أو http://`, 'error');
                        return;
                    }
                    links.push({
                        icon: icon,
                        name: name,
                        url: url.trim() 
                    });
                }
            }

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
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري جلب أحدث البيانات من السيرفر...');
        try {
            const syncStaticCol = (prop, list) => {
                AdminData.data[prop] = Array.isArray(list) ? list.filter(Boolean) : [];
                AdminData._buildSingleMap?.(prop);
                AdminData._updateSnapshot?.(prop);
            };

            if (type === 'dash' || !type) {
                // 🚀 تمت إزالة updateBadges(true) لمنع القراءة المزدوجة
                EventBus.emit('req-render-dash', { force: true });
            } else if (type === 'sales') {
                EventBus.emit('req-render-sales');
            } else if (type === 'orders') {
                AdminData.cursors.orders = null;
                AdminData.data.orders = [];
                AdminData.data.ordersMap = {};
                await AdminRender?.loadMoreOrders?.();
                AdminRender?.updateBadges?.(true);
            } else if (type === 'deposits') {
                AdminData.cursors.deposits = null;
                AdminData.data.deposits = [];
                AdminData.data.depositsMap = {};
                await AdminRender?.loadMoreDeposits?.();
                AdminRender?.updateBadges?.(true);
            } else if (type === 'users') {
                AdminData.cursors.users = null;
                AdminData.data.users = [];
                AdminData.data.usersMap = {};
                await AdminRender?.loadMoreUsers?.();
            } else if (type === 'logs') {
    const rLogs = await FirebaseAdapter.callFunction('adminGetLogsList', { limit: 50 });
    if (rLogs && rLogs.success) {
        AdminData.data.logs = Array.isArray(rLogs.data) ? rLogs.data : [];
        AdminData.data.systemErrors = Array.isArray(rLogs.systemErrors) ? rLogs.systemErrors : [];
        AdminData.cursors.logs = rLogs.pagination || null;
    }
    EventBus.emit('req-render-logs');            } else if (type === 'wallets') {
                await AdminData.fetchWalletsLiquidityAsync();
                EventBus.emit('req-render-wallets');
            } else if (type === 'rates') {
                const rRates = await FirebaseAdapter.getAll('telecard_rates');
                const normalized = typeof normalizeRates === 'function' ? normalizeRates(rRates) : rRates;
                syncStaticCol('rates', Array.isArray(normalized) ? normalized : Object.values(normalized || {}));
                EventBus.emit('req-render-rates');
            } else if (type === 'products') {
                const [rCats, rProds, rVault] = await Promise.all([
                    FirebaseAdapter.getAll('telecard_cats'),
                    FirebaseAdapter.getAll('telecard_prods'),
                    FirebaseAdapter.getAll('telecard_vault')
                ]);
                syncStaticCol('cats', rCats);
                syncStaticCol('prods', (rProds || []).map(p => ({
                    ...p,
                    costPrice: Number(p.costPrice || 0),
                    price: Number(p.price || 0),
                    isFixedPrice: !!p.isFixedPrice,
                    requiresAdminAttention: !!p.requiresAdminAttention,
                    syncNote: p.syncNote || ''
                })));
                syncStaticCol('vault', rVault);
                EventBus.emit('req-render-prods');
            } else if (type === 'vault') {
                const rVault = await FirebaseAdapter.getAll('telecard_vault');
                syncStaticCol('vault', rVault);
                EventBus.emit('req-render-vault');
            } else if (type === 'complaints') {
                const rReviews = await FirebaseAdapter.getAll('telecard_reviews', 500);
                syncStaticCol('reviews', rReviews);
                this.renderComplaints();
            } else if (type === 'integrations') {
                const rSuppliers = await FirebaseAdapter.getAll('telecard_suppliers');
                syncStaticCol('suppliers', rSuppliers);
                EventBus.emit('req-render-integrations');
            } else {
                await AdminData?.loadData?.(auth?.currentUser?.uid);
                await this.nav(type);
            }

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

        // 🛡️ [الجدار الناري المحكم]: قراءة قوائم الحظر من active_configs
        const activeConfigs = AdminData.data.activeConfigs || {};
        const bannedIps = Array.isArray(activeConfigs.bannedIps) ? activeConfigs.bannedIps : (Array.isArray(AdminData.data.settings?.bannedIps) ? AdminData.data.settings.bannedIps : []);
        const bannedDevices = Array.isArray(activeConfigs.bannedDevices) ? activeConfigs.bannedDevices : (Array.isArray(AdminData.data.settings?.bannedDevices) ? AdminData.data.settings.bannedDevices : []);

        if (bannedIps.length === 0) {
            ipContainer.innerHTML = '<span class="text-muted fs-11"><i class="fa-solid fa-check text-success"></i> لا توجد عناوين IP محظورة.</span>';
        } else {
            ipContainer.innerHTML = bannedIps.map(ip => {
                const safeIp = Utils.escapeHTML(ip);
                return `
                <div class="badge-tag bg-danger text-white num-en d-flex align-items-center gap-2" dir="ltr">
                    ${safeIp} 
                    <i class="fa-solid fa-xmark clickable ms-2" data-action="remove-global-ban-ip" data-ip="${safeIp}" title="فك الحظر"></i>
                </div>
            `}).join('');
        }

        if (bannedDevices.length === 0) {
            deviceContainer.innerHTML = '<span class="text-muted fs-11"><i class="fa-solid fa-check text-success"></i> لا توجد أجهزة مفخخة.</span>';
        } else {
            deviceContainer.innerHTML = bannedDevices.map(dev => {
                const safeDev = Utils.escapeHTML(dev);
                const shortDev = Utils.escapeHTML(String(dev).substring(0, 10));
                return `
                <div class="badge-tag bg-info text-white num-en d-flex align-items-center gap-2" dir="ltr">
                    ${shortDev}... 
                    <i class="fa-solid fa-xmark clickable ms-2" data-action="remove-global-ban-device" data-device="${safeDev}" title="فك الحظر"></i>
                </div>
            `}).join('');
        }
    },

    addGlobalBanIp: async function() {
        const input = document.getElementById('new-ban-ip-input');
        if (!input) return;
        const newIp = input.value.trim();
        
        if (!newIp) return AdminUI.showToast('الرجاء إدخال عنوان IP', 'error');
        
        const isValidIPv4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)){3}$/.test(newIp);
        const isValidIPv6 = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/.test(newIp);
        
        if (!isValidIPv4 && !isValidIPv6) {
            return AdminUI.showToast('صيغة الـ IP غير صحيحة، يرجى إدخال IP حقيقي', 'error');
        }
        
        if (AdminUI && !await AdminUI.showConfirm(`تنبيه أمني خطير!
هل أنت متأكد من حظر هذا الـ IP (${newIp})؟
إذا كان هذا الـ IP يخصك أو يخص سيرفر النظام، فلن تتمكن من دخول اللوحة بعد الآن!`, 'تأكيد الحظر')) return;
        
        if (AdminUI.toggleLoader) AdminUI.toggleLoader(true, 'جاري حظر الـ IP سحابياً...');
        try {
            // 🛡️ استخدام set (مع merge: true) لضمان عملها حتى لو لم تكن وثيقة active_configs منشأة بعد
            await FirebaseAdapter.set('telecard_system', 'active_configs', {
                bannedIps: arrayUnion(newIp)
            });
            
            if (!AdminData.data.activeConfigs) AdminData.data.activeConfigs = {};
            if (!Array.isArray(AdminData.data.activeConfigs.bannedIps)) AdminData.data.activeConfigs.bannedIps = [];
            if (!AdminData.data.activeConfigs.bannedIps.includes(newIp)) {
                AdminData.data.activeConfigs.bannedIps.push(newIp);
            }
            if (AdminData.data.settings) {
                AdminData.data.settings.bannedIps = [...AdminData.data.activeConfigs.bannedIps];
            }
            
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
                await FirebaseAdapter.set('telecard_system', 'active_configs', {
                    bannedIps: arrayRemove(ip)
                });
                
                if (AdminData.data.activeConfigs && Array.isArray(AdminData.data.activeConfigs.bannedIps)) {
                    AdminData.data.activeConfigs.bannedIps = AdminData.data.activeConfigs.bannedIps.filter(item => item !== ip);
                }
                if (AdminData.data.settings && Array.isArray(AdminData.data.settings.bannedIps)) {
                    AdminData.data.settings.bannedIps = AdminData.data.settings.bannedIps.filter(item => item !== ip);
                }
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
            if (!await AdminUI.showConfirm(`هل أنت متأكد من فك الحظر عن هذا الجهاز؟
(${device})`, 'إزالة من القائمة السوداء')) return;
            
            if (AdminUI.toggleLoader) AdminUI.toggleLoader(true, 'جاري فك الحظر...');
            try {
                await FirebaseAdapter.set('telecard_system', 'active_configs', {
                    bannedDevices: arrayRemove(device)
                });
                
                if (AdminData.data.activeConfigs && Array.isArray(AdminData.data.activeConfigs.bannedDevices)) {
                    AdminData.data.activeConfigs.bannedDevices = AdminData.data.activeConfigs.bannedDevices.filter(item => item !== device);
                }
                if (AdminData.data.settings && Array.isArray(AdminData.data.settings.bannedDevices)) {
                    AdminData.data.settings.bannedDevices = AdminData.data.settings.bannedDevices.filter(item => item !== device);
                }
                this.renderFirewallBlacklist();
                
                AdminUI.showToast(`تم فك الحظر عن الجهاز بنجاح`, 'success');
                if (AdminData.addLog) AdminData.addLog('FIREWALL_REMOVE_DEVICE', `إزالة جهاز من القائمة السوداء`);
            } catch (e) {
                AdminUI.showToast('حدث خطأ أثناء فك الحظر', 'error');
            } finally {
                if (AdminUI.toggleLoader) AdminUI.toggleLoader(false);
            }
        },    forceSyncPricingCache: async function() {
        if (AdminUI && await AdminUI.showConfirm(`هل أنت متأكد من إعادة بناء كاش التسعير والبوابات السحابي؟
استخدم هذا الخيار (كزر طوارئ) فقط إذا لاحظت عدم تحديث الأسعار في واجهة المتجر.`, 'ترميم الكاش السحابي')) {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري ترميم الكاش السحابي للأسعار والبوابات... (قد تستغرق هذه العملية عدة دقائق، يرجى عدم إغلاق الصفحة)');
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

    // 🛡️ التحديث المطلوب: استبدال دوال escapeHTML لحفظ النصوص خام في قاعدة البيانات
    saveSystem: async function() { 
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حفظ إعدادات النظام...');
        try {
            if (!this.data.system) this.data.system = {}; 
            this.data.system = { 
                ...this.data.system,
                maint: Utils.getCheck('sys-maint-toggle'), 
                msg: Utils.getVal('sys-maint-msg'), 
                date: Utils.getVal('sys-maint'), 
                freeze: Utils.getCheck('sys-freeze-toggle'), 
                freezeMsg: Utils.getVal('sys-freeze-msg') 
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
            
            const rawSuppLink = String(Utils.getVal('supp-link') || '').trim();
            const isSafeSuppVal = !rawSuppLink || /^https?:\/\//i.test(rawSuppLink) || /^\+?[0-9\s-]{7,18}$/.test(rawSuppLink);
            if (!isSafeSuppVal) {
                AdminUI?.showToast('يرجى إدخال رابط يبدأ بـ https:// أو رقم هاتف صحيح', 'error');
                return;
            }
            this.data.settings.supportLink = rawSuppLink;
            
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

    // 🛡️ التحديث المطلوب: إزالة escapeHTML لمنع التشفير المزدوج
    saveAboutUs: async function() {
        const aboutTextEl = document.getElementById('store-about-us');
        if (!aboutTextEl) return;
        const aboutText = aboutTextEl.value.trim();
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

        grid.innerHTML = reviews.sort((a,b) => RenderHelpers.parseUnifiedTime(b) - RenderHelpers.parseUnifiedTime(a)).map(r => {
            const isResolved = r.status === 'resolved';
            const isGood = r.rating >= 4;
            const user = AdminData.data.usersMap?.[r.userId] || { name: r.userName || r.userFullName || 'عميل غير معروف' };
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
                ${(r.comment || r.text) ? `<p class="fs-13 text-muted mb-15 p-10" style="background: var(--bg-body); border-radius: 6px;">"${Utils.escapeHTML(r.comment || r.text)}"</p>` : ''}
                
                ${isResolved ? 
                `<div class="p-10 bg-success-10 text-success border-success-15" style="border-radius: 6px; font-size: 12px;">
                    <i class="fa-solid fa-reply"></i> <b>رد الإدارة:</b> ${Utils.escapeHTML(r.adminReply)}
                </div>` 
                : (!isGood ? `
                <div id="reply-box-${Utils.escapeHTML(r.id)}" class="mt-10">
                    <textarea id="reply-text-${Utils.escapeHTML(r.id)}" class="form-input mb-10" rows="2" placeholder="اكتب رسالة اعتذار للعميل أو كود خصم للتعويض..."></textarea>
                    <button type="button" class="btn btn-primary w-100" data-action="reply-complaint" data-id="${Utils.escapeHTML(r.id)}">
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
                await FirebaseAdapter.updateDocument('telecard_reviews', reviewId, {
                    status: 'resolved',
                    adminReply: reply,
                    resolvedAt: Date.now()
                });
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
    
    // 🛡️ التحديث المطلوب: إزالة escapeHTML من حفظ اسم المدير
    saveAdminProfile: async function(profileData) {
        const name = (profileData?.name || Utils.getVal('adm-name')).trim();
        const hasImg = profileData?.hasImg !== undefined ? profileData.hasImg : document.getElementById('adm-img-wrap')?.classList.contains('has-img');
        
        if (!name) return AdminUI?.showToast('الاسم مطلوب', 'error');
        
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث الملف الشخصي...');
        
        try {
            let finalImg = '';
            const oldImgUrl = this.data.adminProfile?.img || null;
            
            if (hasImg) {
                if (AdminUI?.tempImg && AdminUI.tempImg.startsWith('data:image')) {
                    AdminUI?.showToast('جاري رفع الصورة المضغوطة...', 'info');
                    
                    const mimeMatch = AdminUI.tempImg.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
                    const detectedMime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
                    const detectedExt = detectedMime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
                    const processedBlob = typeof AdminUI.base64ToBlob === 'function' ?
                        AdminUI.base64ToBlob(AdminUI.tempImg, detectedMime) :
                        await (await fetch(AdminUI.tempImg)).blob();
                    const finalFileToUpload = new File([processedBlob], `admin_profile_${auth?.currentUser?.uid || Date.now()}.${detectedExt}`, { type: detectedMime });
                    
                    if (oldImgUrl && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                        await FirebaseAdapter.deleteImageByUrl(oldImgUrl).catch(() => {});
                    }
                    
                    finalImg = await FirebaseAdapter.uploadImage(finalFileToUpload, 'admin', null, true);
                } else if (profileData?.file || document.getElementById('adm-img-file')?.files?.[0]) {
                    const fallbackFile = profileData?.file || document.getElementById('adm-img-file')?.files?.[0];
                    const ext = fallbackFile.name.includes('.') ? fallbackFile.name.split('.').pop().toLowerCase() : 'jpg';
                    const customName = `admin_profile_${auth?.currentUser?.uid || Date.now()}.${ext}`;
                    
                    if (oldImgUrl && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                        await FirebaseAdapter.deleteImageByUrl(oldImgUrl).catch(() => {});
                    }
                    finalImg = await FirebaseAdapter.uploadImage(fallbackFile, 'admin', customName, true);
                } else {
                    finalImg = oldImgUrl || '';
                }
            } else {
                if (oldImgUrl && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                    await FirebaseAdapter.deleteImageByUrl(oldImgUrl).catch(() => {});
                }
                finalImg = '';
            }
            
            this.data.adminProfile = {
                ...this.data.adminProfile,
                name,
                img: finalImg
            };
            
            await AdminData?.saveAdminProfile?.(auth?.currentUser?.uid);
            EventBus.emit('req-update-profile-ui');
            AdminUI?.closeModal?.('profile');
            AdminUI?.showToast('تم حفظ الملف الشخصي بنجاح', 'success');
            
        } catch (error) {
            AdminUI?.showToast(error.message || 'تعذر تحديث الملف الشخصي', 'error');
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    
    resetAdminPassword: async function() {
        const adminEmail = (auth?.currentUser?.email || this.data.adminProfile?.email || '').trim();
        if (!adminEmail) {
            return AdminUI?.showToast('تعذر العثور على البريد الإلكتروني لحساب الإدارة الحالي.', 'error');
        }
        
        if (AdminUI && !await AdminUI.showConfirm(`سيتم إرسال رابط رسمي ومشفر من Firebase لتغيير كلمة المرور إلى بريدك الإلكتروني:\n\n${adminEmail}\n\nهل تريد المتابعة؟`, 'تغيير كلمة مرور المدير')) {
            return;
        }
        
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إرسال رابط تغيير كلمة المرور إلى بريدك...');
        try {
            await sendPasswordResetEmail(auth, adminEmail);
            AdminUI?.showToast(`تم إرسال رابط تغيير كلمة المرور إلى (${adminEmail}) بنجاح! تفقد بريدك الوارد.`, 'success', 6000);
            if (AdminData?.addLog) AdminData.addLog('ADMIN_PASSWORD_RESET_REQ', `طلب رابط تغيير كلمة المرور للبريد: ${adminEmail}`);
        } catch (error) {
            let errMsg = 'تعذر إرسال الرابط. تأكد من اتصالك بالإنترنت.';
            if (error.code === 'auth/too-many-requests') {
                errMsg = 'تم إرسال عدة طلبات مؤخراً، يرجى الانتظار قليلاً قبل المحاولة مجدداً.';
            }
            AdminUI?.showToast(errMsg, 'error');
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    setupAdminPushNotifications: async function(forcePrompt = false) {
        if (typeof window === 'undefined' || !window.Notification) return;

        if (forcePrompt && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return;
        }

        if (Notification.permission === 'granted') {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري ربط جهازك بغرفة العمليات...');
            try {
                const token = await FirebaseAdapter.requestFCMToken(VAPID_KEY);

                if (token) {
                    let currentTokens = Array.isArray(this.data.adminProfile?.fcmTokens) ? [...this.data.adminProfile.fcmTokens] : [];
                    if (!currentTokens.includes(token)) {
                        currentTokens.push(token);
                        if (currentTokens.length > 5) currentTokens = currentTokens.slice(-5); 
                        
                        if (!this.data.adminProfile) this.data.adminProfile = {};
                        this.data.adminProfile.fcmTokens = currentTokens;
                        
                        await AdminData.saveAdminProfile(auth?.currentUser?.uid);
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

    saveAdminPreferences: async function() {
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث إعدادات غرفة العمليات...');
        try {
            const pushPrefs = {
                orders: Utils.getCheck('pref-orders', true),
                deposits: Utils.getCheck('pref-deposits', true),
                kyc: Utils.getCheck('pref-kyc', true),
                vault: Utils.getCheck('pref-vault', true),
                complaints: Utils.getCheck('pref-complaints', true),
                system_alerts: Utils.getCheck('pref-system-alerts', this.data.adminProfile?.pushPrefs?.system_alerts ?? true)
            };

            let currentTokens = Array.isArray(this.data.adminProfile?.fcmTokens) ? [...this.data.adminProfile.fcmTokens] : [];
            
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
            
            await AdminData?.saveAdminProfile?.(auth?.currentUser?.uid);
            
            AdminUI?.showToast('تم تحديث إعدادات الرادار السحابي بنجاح 🚀', 'success');
            AdminUI?.closeModal?.('admin-prefs'); 
        } catch (error) {
            AdminUI?.showToast('تعذر حفظ إعدادات الإشعارات', 'error');
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    // 🚀 [الإصلاح المعماري 3: Double Delete Confirm Fix] - نافذة التأكيد مخصصة للبنر فقط هنا لمنع التضارب
    delItem: async function(type, id) {
        const strId = String(id);
        
        if (type === 'tier') return import('../modules/users/usersController.js').then(m => m.UsersController.deleteTier(strId));
        
        if (type === 'vault') return CatalogController.deleteVaultPool(strId);
        if (type === 'country') return CatalogController.deleteCountry(strId);
        if (type === 'cat') return CatalogController.deleteCategory(strId); 
        if (type === 'prod') return CatalogController.deleteProduct(strId); 
        if (type === 'coupon') return MarketingController.deleteCoupon(strId);
        if (type === 'offer') return MarketingController.deleteOffer(strId);
        
        if (type === 'banner') {
            if (AdminUI && !await AdminUI.showConfirm('هل أنت متأكد من حذف هذه اللافتة الإعلانية نهائياً؟')) return;
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
