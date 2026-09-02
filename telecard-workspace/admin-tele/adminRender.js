// ============================================================================
// 🖥️ موزع محرك الرسم (adminRender.js) - نمط الواجهة النظيف (Facade) 🚀
// 🎯 الوظيفة: المايسترو الذي يوجه طلبات الرسم للوحدات المعزولة (Micro-Frontends).
// 🌟 التحديثات المعمارية: 
// 1. Radar Hydration: إضافة دالة updatePrefsUI لمزامنة تفضيلات الإشعارات الحية.
// 2. Event Binding: ربط حدث req-update-prefs-ui لملء نافذة الرادار عند فتحها.
// ============================================================================

import { EventBus, Utils } from './adminUtils.js'; 
import { AdminData } from './adminData.js';
import { RenderHelpers } from './core/renderHelpers.js';

import { OrdersRender } from './modules/orders/ordersRender.js';
import { FinanceRender } from './modules/finance/financeRender.js';
import { UsersRender } from './modules/users/usersRender.js';
import { DashboardRender } from './modules/dashboard/dashboardRender.js';
import { CatalogRender } from './modules/catalog/catalogRender.js';
import { SalesRender } from './modules/dashboard/salesRender.js'; 
import { MarketingRender } from './modules/marketing/marketingRender.js'; 
import { IntegrationsRender } from './modules/integrations/integrationsRender.js'; 

OrdersRender?.initListeners?.();
FinanceRender?.initListeners?.();
UsersRender?.initListeners?.();
CatalogRender?.initListeners?.();
MarketingRender?.initListeners?.(); 
IntegrationsRender?.initListeners?.(); 
DashboardRender?.initListeners?.();
SalesRender?.initListeners?.(); 

export const AdminRender = {
    // ==========================================
    // 🔗 روابط مساعدة الرسم الموحدة (Helpers Bridge)
    // ==========================================
    _getTxName: (u) => RenderHelpers._getTxName(u),
    _getExplicitName: (u) => RenderHelpers._getExplicitName(u),
    getCurrencySymbolText: (c) => RenderHelpers.getCurrencySymbolText(c),
    formatMoney: (...args) => RenderHelpers.formatMoney(...args),
    _getActiveOfferBadge: (id) => RenderHelpers._getActiveOfferBadge(id),

    // ==========================================
    // 📦 تفويض محركات الأقسام (Modules Routing)
    // ==========================================
    
    loadMoreOrders: () => OrdersRender.loadMoreOrders(),
    renderOrders: (isAppend) => OrdersRender.renderOrders(isAppend),
    exportOrdersToExcel: () => OrdersRender.exportToExcel(),
    
    loadMoreDeposits: () => FinanceRender.loadMoreDeposits(),
    renderDeposits: (isAppend) => FinanceRender.renderDeposits(isAppend),
    renderWalletsOverview: () => FinanceRender.renderWalletsOverview(),
    renderRates: () => FinanceRender.renderRates(),
    renderPaymentList: () => FinanceRender.renderPaymentList(),
    renderPayDetailList: (arr) => FinanceRender.renderPayDetailList(arr),
    exportDepositsToExcel: () => FinanceRender.exportDepositsToExcel(),

    updateUserSortLabel: () => UsersRender.updateUserSortLabel(),
    renderUsers: () => UsersRender.renderUsers(),
    viewUser: (id, p) => UsersRender.viewUser(id, p),
    switchUserTab: (id) => UsersRender.switchUserTab(id), 
    renderTiers: () => UsersRender.renderTiers(),
    showTierUsersPage: (id) => UsersRender.showTierUsersPage(id),
    renderTierUsersPage: () => UsersRender.renderTierUsersPage(),
    renderKycSystem: () => UsersRender.renderKycSystem(),

    changeLeaderboardFilter: (p) => DashboardRender.changeLeaderboardFilter(p),
    renderDashboard: () => DashboardRender.renderDashboard(),
    renderMainChart: () => DashboardRender.renderMainChart(),
    renderLogs: () => DashboardRender.renderLogs(),
    renderSales: () => SalesRender.renderSales(), 
    exportSalesToExcel: () => SalesRender.exportSalesToExcel(),

    renderProds: () => CatalogRender.renderProds(),
    renderProdConfig: () => CatalogRender.renderProdConfig(),
    renderPkgList: () => CatalogRender.renderPkgList(),
    renderVault: () => CatalogRender.renderVault(),
    renderCountries: () => CatalogRender.renderCountries(),

    renderBanners: () => MarketingRender.renderBanners(),
    populateSmartTreeTargets: (...args) => MarketingRender.populateSmartTreeTargets(...args),
    renderCoupons: () => MarketingRender.renderCoupons(),
    renderOffers: () => MarketingRender.renderOffers(),
    renderUnifiedAlerts: () => MarketingRender.renderUnifiedAlerts(),

    renderSuppliers: () => IntegrationsRender.renderSuppliers(),

    // ==========================================
    // 🌟 دوال النظام المشتركة (Global UI Actions)
    // ==========================================
    filterByTab: function(type, status, btnElement) {
        if (type === 'orders') OrdersRender.filterByTab(status, btnElement);
        if (type === 'deposits') FinanceRender.filterByTab(status, btnElement);
    },

    exportDataToExcel: function(type) {
        if (type === 'deposits') this.exportDepositsToExcel();
        else if (type === 'sales') this.exportSalesToExcel(); 
        else this.exportOrdersToExcel();
    },

    updateBadges: function() {
        const d = (AdminData.data.deposits || []).filter(x => x.status === 'pending').length;
        const o = (AdminData.data.orders || []).filter(x => x.status === 'pending').length;
        const bDep = document.getElementById('badge-dep');
        const bOrd = document.getElementById('badge-ord');
        
        if (bDep) { 
            if (d > 0) { bDep.innerText = Utils.enNum(d); bDep.classList.add('active'); bDep.classList.remove('hide-element'); } 
            else { bDep.classList.remove('active'); bDep.classList.add('hide-element'); } 
        }
        if (bOrd) { 
            if (o > 0) { bOrd.innerText = Utils.enNum(o); bOrd.classList.add('active'); bOrd.classList.remove('hide-element'); } 
            else { bOrd.classList.remove('active'); bOrd.classList.add('hide-element'); } 
        }
    },

    updatePreview: function() {
        const txtEl = document.getElementById('promo-text');
        const animEl = document.getElementById('promo-speed');
        const prevTxt = document.querySelector('.tp-text');
        if (txtEl && animEl && prevTxt) { 
            prevTxt.innerText = txtEl.value || 'معاينة...'; 
            prevTxt.className = 'tp-text anim-' + Utils.escapeHTML(animEl.value); 
        }
    },

    updateProfileUI: function() {
        const p = AdminData.data.adminProfile; if (!p) return;
        const imgSrc = (p.img && p.img.trim() !== '') ? p.img : 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff';
        ['head-name', 'sb-name-txt'].forEach(id => { const el = document.getElementById(id); if (el) el.innerText = p.name || 'مدير النظام'; });
        ['head-avatar', 'sb-avatar-img'].forEach(id => { const el = document.getElementById(id); if (el) el.src = imgSrc; });
        if(document.getElementById('adm-name')) document.getElementById('adm-name').value = p.name || '';
        if(document.getElementById('adm-email')) document.getElementById('adm-email').value = p.email || '';
        if(document.getElementById('adm-pass')) document.getElementById('adm-pass').value = p.pass || '';
        const prev = document.getElementById('adm-img-prev');
        if (prev) { prev.src = imgSrc; prev.classList.remove('hide-element'); if (prev.parentElement) prev.parentElement.classList.toggle('has-img', p.img && p.img.trim() !== ''); }
    },

    // 🚀 [الرادار]: حقن حالة الإشعارات السحابية في مفاتيح التبديل
    updatePrefsUI: function() {
        const prefs = AdminData.data.adminProfile?.pushPrefs || {
            orders: true, deposits: true, kyc: false, vault: true, complaints: true
        };
        const safeCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
        
        safeCheck('pref-orders', prefs.orders !== false);
        safeCheck('pref-deposits', prefs.deposits !== false);
        safeCheck('pref-kyc', prefs.kyc === true);
        safeCheck('pref-vault', prefs.vault !== false);
        safeCheck('pref-complaints', prefs.complaints !== false);
    },

    // ==========================================
    // 🎧 تهيئة مستمعات الناقل المركزي (Event Bus Routing)
    // ==========================================
    initListeners: function() {
        EventBus.on('req-render-dash', () => this.renderDashboard());
        EventBus.on('req-render-sales', () => this.renderSales());
        EventBus.on('req-render-deposits', () => this.renderDeposits());
        EventBus.on('req-render-orders', () => this.renderOrders());
        EventBus.on('req-render-users', () => this.renderUsers());
        EventBus.on('req-update-user-sort', () => this.updateUserSortLabel());
        EventBus.on('req-render-prods', () => this.renderProds());
        EventBus.on('req-render-banners', () => this.renderBanners());
        EventBus.on('req-render-kyc', () => this.renderKycSystem());
        EventBus.on('req-render-offers', () => this.renderOffers());
        EventBus.on('req-render-payments', () => this.renderPaymentList());
        EventBus.on('req-render-tiers', () => this.renderTiers());
        EventBus.on('req-render-wallets', () => this.renderWalletsOverview());
        EventBus.on('req-render-alerts', () => this.renderUnifiedAlerts());
        EventBus.on('req-render-rates', () => this.renderRates());
        EventBus.on('req-render-countries', () => this.renderCountries());
        EventBus.on('req-render-vault', () => this.renderVault());
        EventBus.on('req-render-coupons', () => this.renderCoupons());
        EventBus.on('req-render-logs', () => this.renderLogs());
        EventBus.on('req-render-integrations', () => this.renderSuppliers());
        EventBus.on('req-update-preview', () => this.updatePreview());
        EventBus.on('req-show-tier-users', (tierId) => this.showTierUsersPage(tierId));
        EventBus.on('req-render-prod-config', () => this.renderProdConfig());
        EventBus.on('req-update-profile-ui', () => this.updateProfileUI());
        
        // 🚀 [الرادار]: الاستماع لحدث فتح نافذة الرادار لتحديث الـ UI
        EventBus.on('req-update-prefs-ui', () => this.updatePrefsUI());
    }
};
