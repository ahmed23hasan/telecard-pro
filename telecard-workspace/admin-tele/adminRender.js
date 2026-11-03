// ============================================================================
// 🖥️ موزع محرك الرسم (adminRender.js) - Enterprise V19.7 🚀
// 🎯 الوظيفة: المايسترو الذي يوجه طلبات الرسم للوحدات المعزولة (Micro-Frontends).
// 🌟 التحديثات المعمارية (V19.7 - Pure Dispatcher Patch): 
// 1. MVC Purification 🧹: إزالة دوال الـ UI والـ DOM (مثل viewUser) لمنع تداخل الصلاحيات.
// 2. Dead Code Elimination 🗑️: إزالة دالة (updatePreview) لتتولى الـ MarketingUI مسؤوليتها بالكامل.
// 3. Server-Side Bridge 🌉: توجيه طلبات الجلب السحابي (Load More) بشكل مباشر للوحدات.
// 4. Rate Limiting 🛡️: تطبيق (Throttle) على دالة updateBadges لمنع استنزاف قراءات فايربيز.
// ============================================================================

import { EventBus, Utils } from './adminUtils.js'; 
import { AdminData } from './adminData.js';
import { RenderHelpers } from './core/renderHelpers.js';
import { FirebaseAdapter, auth } from './core/firebaseAdapter.js';

// 📦 استيراد محركات الرسم للوحدات المعزولة
import { OrdersRender } from './modules/orders/ordersRender.js';
import { FinanceRender } from './modules/finance/financeRender.js';
import { UsersRender } from './modules/users/usersRender.js';
import { DashboardRender } from './modules/dashboard/dashboardRender.js';
import { CatalogRender } from './modules/catalog/catalogRender.js';
import { SalesRender } from './modules/dashboard/salesRender.js'; 
import { MarketingRender } from './modules/marketing/marketingRender.js'; 
import { IntegrationsRender } from './modules/integrations/integrationsRender.js'; 

// 🚀 تهيئة مستمعات الأحداث الخاصة بكل وحدة بشكل مستقل
OrdersRender?.initListeners?.();
FinanceRender?.initListeners?.();
UsersRender?.initListeners?.();
CatalogRender?.initListeners?.();
MarketingRender?.initListeners?.(); 
IntegrationsRender?.initListeners?.(); 
DashboardRender?.initListeners?.();
SalesRender?.initListeners?.(); 

// 🛡️ [حماية التكاليف]: متغير سري لتتبع آخر تحديث للشارات ومنع الاستنزاف
let lastBadgeUpdate = 0;

export const AdminRender = {
        // ==========================================
        // 📦 كشف المحركات الفرعية للوحدات (Sub-Renderers Exposure)
        // ==========================================
        OrdersRender,
        FinanceRender,
        UsersRender,
        DashboardRender,
        SalesRender,
        CatalogRender,
        MarketingRender,
        IntegrationsRender,
        
        // ==========================================
        // 🔗 روابط مساعدة الرسم الموحدة (Helpers Bridge)
        // ==========================================
        _getTxName: (u) => RenderHelpers._getTxName(u),
        _getExplicitName: (u) => RenderHelpers._getTxName(u),
        getCurrencySymbolText: (c) => RenderHelpers.getCurrencySymbolText(c),
        formatMoney: (...args) => RenderHelpers.formatMoney(...args),
        _getActiveOfferBadge: (id) => RenderHelpers._getActiveOfferBadge(id),
        
        // ==========================================
        // 📦 تفويض محركات الأقسام (Modules Routing)
        // ==========================================
        
        // 🛒 وحدة الطلبات
        loadMoreOrders: () => OrdersRender.loadMoreOrders(),
        renderOrders: (isAppend) => OrdersRender.renderOrders(isAppend),
        exportOrdersToExcel: () => OrdersRender.exportToExcel(),
        
        // 💳 وحدة المالية
        loadMoreDeposits: () => FinanceRender.loadMoreDeposits(),
        renderDeposits: (isAppend) => FinanceRender.renderDeposits(isAppend),
        renderWalletsOverview: () => FinanceRender.renderWalletsOverview(),
        renderRates: () => FinanceRender.renderRates(),
        renderPaymentList: () => FinanceRender.renderPaymentList(),
        renderPayDetailList: (arr) => FinanceRender.renderPayDetailList(arr),
        exportDepositsToExcel: () => FinanceRender.exportDepositsToExcel(),
        
        // 👥 وحدة المستخدمين
        loadMoreUsers: () => UsersRender.loadMoreUsers(),    updateUserSortLabel: () => UsersRender.updateUserSortLabel(),
    renderUsers: () => UsersRender.renderUsers(),
    renderTiers: () => UsersRender.renderTiers(),
    renderTierUsersPage: () => UsersRender.renderTierUsersPage(),
    renderKycSystem: () => UsersRender.renderKycSystem(),

    // 📊 وحدة لوحة القيادة والمبيعات
    changeLeaderboardFilter: (p) => DashboardRender.changeLeaderboardFilter(p),
    renderDashboard: () => DashboardRender.renderDashboard(),
    renderMainChart: () => DashboardRender.renderMainChart(),
    renderLogs: () => DashboardRender.renderLogs(),
    renderSales: () => SalesRender.renderSales(), 
    exportSalesToExcel: () => SalesRender.exportSalesToExcel(),

    // 📦 وحدة الكتالوج (المنتجات)
    renderProds: () => CatalogRender.renderProds(),
    renderProdConfig: () => CatalogRender.renderProdConfig(),
    renderPkgList: () => CatalogRender.renderPkgList(),
    renderVault: () => CatalogRender.renderVault(),
    renderCountries: () => CatalogRender.renderCountries(),

    // 📢 وحدة التسويق
    renderBanners: () => MarketingRender.renderBanners(),
    populateSmartTreeTargets: (...args) => MarketingRender.populateSmartTreeTargets(...args),
    renderCoupons: () => MarketingRender.renderCoupons(),
    renderOffers: () => MarketingRender.renderOffers(),
    renderUnifiedAlerts: () => MarketingRender.renderUnifiedAlerts(),

    // 🔌 وحدة الربط
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

    _isUpdatingBadges: false,

    updateBadges: async function(force = false) {
        const now = Date.now();
        if (this._isUpdatingBadges) return;
        if (!force && (now - lastBadgeUpdate < 180000)) return;

        this._isUpdatingBadges = true;
        try {
            const [depStats, ordStats, kycStats] = await Promise.all([
                FirebaseAdapter.getAggregatedStats('telecard_deposits', [['status', '==', 'pending']], { total: { type: 'count' } }),
                FirebaseAdapter.getAggregatedStats('telecard_orders', [['status', 'in', ['pending', 'processing']]], { total: { type: 'count' } }),
                FirebaseAdapter.getAggregatedStats('telecard_users', [['kycStatus', '==', 'pending']], { total: { type: 'count' } })
            ]);

            const d = depStats?.total || 0;
            const o = ordStats?.total || 0;
            const k = kycStats?.total || 0;

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
            if (window.AdminUI?.UsersUI?.updateSidebarKycBadge) {
                window.AdminUI.UsersUI.updateSidebarKycBadge(k);
            }
            
            lastBadgeUpdate = Date.now();
        } catch (error) {
            console.warn("⚠️ فشل جلب الشارات الحية، يرجى التحقق من الاتصال.");
        } finally {
            this._isUpdatingBadges = false;
        }
    },    // 🚀 [الحل المعماري لعمى الشارات]: إنقاص العداد محلياً (Optimistic UI) 
    // لراحة عين المدير دون استنزاف قراءات السيرفر
    decrementLocalBadge: function(type) {
        const badgeId = type === 'order' ? 'badge-ord' : 'badge-dep';
        const badge = document.getElementById(badgeId);
        if (badge && !badge.classList.contains('hide-element')) {
            let currentVal = parseInt(badge.innerText.replace(/,/g, '')) || 0;
            if (currentVal > 1) {
                badge.innerText = Utils.enNum(currentVal - 1);
            } else {
                // إخفاء الشارة تماماً إذا وصل العدد للصفر
                badge.classList.add('hide-element');
                badge.classList.remove('active');
            }
        }
    },

    updateProfileUI: function() {
        const p = AdminData.data.adminProfile || {};
        const adminEmail = p.email || auth?.currentUser?.email || '';
        const imgSrc = (p.img && p.img.trim() !== '') ? p.img : 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff';
        ['head-name', 'sb-name-txt'].forEach(id => { const el = document.getElementById(id); if (el) el.innerText = p.name || 'مدير النظام'; });
        ['head-avatar', 'sb-avatar-img'].forEach(id => { const el = document.getElementById(id); if (el) el.src = imgSrc; });
        if(document.getElementById('adm-name')) document.getElementById('adm-name').value = p.name || '';
        if(document.getElementById('adm-email')) document.getElementById('adm-email').value = adminEmail;
        if(document.getElementById('adm-pass')) document.getElementById('adm-pass').value = '';
        const prev = document.getElementById('adm-img-prev');
        if (prev) { prev.src = imgSrc; prev.classList.remove('hide-element'); if (prev.parentElement) prev.parentElement.classList.toggle('has-img', Boolean(p.img && p.img.trim() !== '')); }
    },

    // 🚀 [الرادار]: حقن حالة الإشعارات السحابية في مفاتيح التبديل
    updatePrefsUI: function() {
        const prefs = AdminData.data.adminProfile?.pushPrefs || {
            orders: true, deposits: true, kyc: true, vault: true, complaints: true, system_alerts: true
        };
        const safeCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
        
        safeCheck('pref-orders', prefs.orders !== false);
        safeCheck('pref-deposits', prefs.deposits !== false);
        safeCheck('pref-kyc', prefs.kyc !== false);
        safeCheck('pref-vault', prefs.vault !== false);
        safeCheck('pref-complaints', prefs.complaints !== false);
        safeCheck('pref-system-alerts', prefs.system_alerts !== false);
    },    // ==========================================
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
        
        // 🚀 [تنظيف الروابط الميتة (Dead Links)]: تم إزالة أحداث الـ UI من هنا (مثل req-update-preview)
        
        EventBus.on('req-render-prod-config', () => this.renderProdConfig());
        EventBus.on('req-update-profile-ui', () => this.updateProfileUI());
        
        // 🚀 [الرادار]: الاستماع لحدث فتح نافذة الرادار لتحديث الـ UI
        EventBus.on('req-update-prefs-ui', () => this.updatePrefsUI());
    }
};

if (typeof window !== 'undefined') { 
    window.AdminRender = AdminRender; 
}
