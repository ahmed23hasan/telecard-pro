// ============================================================================
// 🎨 محرك رسم التسويق (modules/marketing/marketingRender.js) - Enterprise V20.1 💎
// 🎯 الوظيفة: رسم العروض المركزية، الكوبونات، الإشعارات المنبثقة، والبنرات الإعلانية.
// 🚀 التحديثات المعمارية (V20.1 - Zero-Jank Tree & Clean Memory Patch):
// 1. Zero Double-Escaping 🛡️: إزالة التشفير المزدوج لأسماء المنتجات والأقسام في شجرة الاستهداف.
// 2. Zero-Order Fix 📊: إصلاح فرز البنرات لضمان بقاء الترتيب (0) في البداية بدلاً من تحويله لـ 9999.
// 3. Category Parity 🔄: استخدام (categoryId || catId) لمنع ظهور المنتجات كأيتام.
// 4. API Tiers Exclusion 🛡️: استبعاد مستويات الجملة من شجرة الاستهداف.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { MarketingTemplates } from './marketingTemplates.js';
import { EventBus } from '../../adminUtils.js';

export const MarketingRender = {
  
  _listenersBound: false,
  initListeners: function() {
  if (this._listenersBound) return;
  this._listenersBound = true;
  
  EventBus.on('req-render-banners', () => this.renderBanners());
  EventBus.on('req-render-offers', () => this.renderOffers());
  EventBus.on('req-render-coupons', () => this.renderCoupons());
  EventBus.on('req-render-alerts', () => this.renderUnifiedAlerts());
  EventBus.on('req-update-preview', () => {
    window.AdminUI?.MarketingUI?.updateTickerPreviewUI?.();
    window.AdminUI?.updateBrandPreview?.();
  });
},
  // =========================================================
  // 🖼️ 1. رسم البنرات الإعلانية
  // =========================================================
  renderBanners: function() {
    const list = document.getElementById('banner-grid');
    if (!list) return;
    
    const banners = AdminData.data.banners || [];
    if (banners.length === 0) {
      list.innerHTML = MarketingTemplates.emptyBanners();
      return;
    }
    
    const getOrder = (item) => (Number.isFinite(Number(item?.order)) ? Number(item.order) : 9999);
    
    list.innerHTML = [...banners]
      .sort((a, b) => getOrder(a) - getOrder(b))
      .map((b, index) => MarketingTemplates.bannerItem(b, index)).join('');
    
    EventBus.emit('req-init-sortable', { container: list, type: 'banner' });
  },
  
  // =========================================================
  // 🛍️ 2. رسم العروض المركزية (Offers)
  // =========================================================
  renderOffers: function() {
    const grid = document.getElementById('offers-grid');
    const countOffers = document.getElementById('count-offers');
    
    const offers = Array.isArray(AdminData.data.offers) ? AdminData.data.offers : [];
    if (countOffers) countOffers.innerText = offers.length;
    
    if (!grid) return;
    if (offers.length === 0) {
      grid.innerHTML = MarketingTemplates.emptyOffers();
      return;
    }
    
    grid.innerHTML = offers.map(offer => MarketingTemplates.offerCard(offer)).join('');
  },
  
  // =========================================================
  // 🎟️ 3. رسم الكوبونات (Coupons)
  // =========================================================
  renderCoupons: function() {
    const countCoupons = document.getElementById('count-coupons');
    const grid = document.getElementById('coupons-grid');
    
    const coupons = Array.isArray(AdminData.data.coupons) ? AdminData.data.coupons : [];
    if (countCoupons) countCoupons.innerText = coupons.length;
    
    if (!grid) return;
    if (coupons.length === 0) {
      grid.innerHTML = MarketingTemplates.emptyCoupons();
      return;
    }
    
    grid.innerHTML = coupons.map(coupon => {
      const uiData = {
        prodName: coupon.targetProds?.length > 0 ? `${coupon.targetProds.length} منتجات` : 'الكل',
        tierName: coupon.targetTiers?.length > 0 ? `${coupon.targetTiers.length} مستويات` : 'الكل'
      };
      return MarketingTemplates.couponCard(coupon, uiData);
    }).join('');
  },
  
  // =========================================================
  // 🔔 4. رسم الإشعارات والتنبيهات الموحدة (Alerts)
  // =========================================================
  renderUnifiedAlerts: function() {
    const grid = document.getElementById('alerts-grid');
    if (!grid) return;
    
    const alerts = AdminData.data.alerts || [];
    if (alerts.length === 0) {
      grid.innerHTML = MarketingTemplates.emptyUnifiedAlerts();
      return;
    }
    
    grid.innerHTML = [...alerts].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map(a => MarketingTemplates.unifiedAlertCard(a)).join('');
  },
  
  // =========================================================
  // 🌳 5. شجرة الاستهداف الذكية (Smart Tree) للكوبونات والعروض
  // =========================================================
  populateSmartTreeTargets: function(prefix, savedTiers = [], savedProds = []) {
    const d = AdminData.data;
    const tiersContainer = document.getElementById(`${prefix}-tiers`),
      prodsContainer = document.getElementById(`${prefix}-prods`);
    
    if (!tiersContainer || !prodsContainer) return;
    
    const savedTiersSet = new Set(savedTiers.map(String));
    const savedProdsSet = new Set(savedProds.map(String));
    
    // 🛡️ عرض مستويات التجزئة فقط (لأن مستويات الـ API مستثناة من العروض والكوبونات في السيرفر)
    const retailTiersOnly = (d.tiers || []).filter(t => t && t.type !== 'api');
    let tiersHtml = retailTiersOnly.map(t =>
      MarketingTemplates.smartTreeTier(t.id, t.name, t.icon || 'fa-user', savedTiersSet.has(String(t.id)))
    ).join('');
    
    tiersContainer.innerHTML = `${tiersHtml || MarketingTemplates.emptyTreeTiers()}`;
    
    const catMap = {};
    (d.cats || []).forEach(c => catMap[c.id] = { name: c.name, prods: [] });
    
    const orphanProds = [];
    (d.prods || []).forEach(p => {
      // 🚀 استخدام categoryId ليتطابق مع السيرفر بدقة
      const safeCatId = String(p.categoryId || (Array.isArray(p.categoryIds) && p.categoryIds[0]) || p.catId || '');
      if (safeCatId && catMap[safeCatId]) catMap[safeCatId].prods.push(p);
      else orphanProds.push(p);
    });
    
    let treeHtml = Object.keys(catMap).map(catId => {
      const category = catMap[catId];
      if (category.prods.length === 0) return '';
      
      // 🛡️ [إصلاح التشفير المزدوج]: تمرير p.name كما هو
      let childrenHtml = category.prods.map(p =>
        MarketingTemplates.smartTreeChild(p.id, p.name, p.img || p.image, savedProdsSet.has(String(p.id)), String(p.id).slice(-4))
      ).join('');
      
      const checkedCount = category.prods.filter(p => savedProdsSet.has(String(p.id))).length;
      const isAllChecked = checkedCount === category.prods.length && checkedCount > 0;
      const isIndeterminate = checkedCount > 0 && checkedCount < category.prods.length;
      
      // 🛡️ [إصلاح التشفير المزدوج]: تمرير category.name كما هو
      let parentHtml = MarketingTemplates.smartTreeParent(catId, category.name, childrenHtml, isAllChecked);
      
      if (isIndeterminate) {
        parentHtml = parentHtml.replace('class="tree-checkbox tree-parent-cb"', 'class="tree-checkbox tree-parent-cb set-indeterminate"');
      }
      
      return parentHtml;
    }).join('');
    
    if (orphanProds.length > 0) {
      // 🛡️ [إصلاح التشفير المزدوج]: تمرير p.name كما هو
      let orphanHtml = orphanProds.map(p =>
        MarketingTemplates.smartTreeChild(p.id, p.name, p.img || p.image, savedProdsSet.has(String(p.id)), String(p.id).slice(-4))
      ).join('');
      
      const checkedCount = orphanProds.filter(p => savedProdsSet.has(String(p.id))).length;
      const isAllOrphansChecked = checkedCount === orphanProds.length && checkedCount > 0;
      const isOrphanIndeterminate = checkedCount > 0 && checkedCount < orphanProds.length;
      
      let parentOrphanHtml = MarketingTemplates.smartTreeParent('orphans', 'منتجات بدون قسم', orphanHtml, isAllOrphansChecked);
      
      if (isOrphanIndeterminate) {
        parentOrphanHtml = parentOrphanHtml.replace('class="tree-checkbox tree-parent-cb"', 'class="tree-checkbox tree-parent-cb set-indeterminate"');
      }
      
      treeHtml += parentOrphanHtml;
    }
    
    prodsContainer.innerHTML = `${treeHtml || MarketingTemplates.emptyTreeProds()}`;
    
    // 🚀 التفعيل البرمجي لحالة (Indeterminate) بضربة واحدة
    document.querySelectorAll(`#${prefix}-prods .set-indeterminate`).forEach(cb => {
      cb.indeterminate = true;
    });
  }
};
