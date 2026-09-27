// ============================================================================
// 🎨 محرك رسم التسويق (modules/marketing/marketingRender.js) - Enterprise V18.11 💎
// الوظيفة: رسم العروض المركزية، الكوبونات، الإشعارات المنبثقة، والبنرات الإعلانية.
// 🚀 التحديثات المعمارية:
// 1. Template Mismatch Fix 💥: استيراد MarketingTemplates الصحيحة لمنع الشاشة البيضاء.
// 2. Memory Leak Shield 🛡️: إضافة قفل _listenersBound لمنع تكرار الأحداث وانهيار المتصفح.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { MarketingTemplates } from './marketingTemplates.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

export const MarketingRender = {
  
  _listenersBound: false,
  initListeners: function() {
    if (this._listenersBound) return;
    this._listenersBound = true;
    
    EventBus.on('req-render-banners', () => this.renderBanners());
    EventBus.on('req-render-offers', () => this.renderOffers());
    EventBus.on('req-render-coupons', () => this.renderCoupons());
    EventBus.on('req-render-alerts', () => this.renderUnifiedAlerts());
  },
  
  // =========================================================
  // 🖼️ 1. رسم البنرات الإعلانية
  // =========================================================
  renderBanners: function() {
    const list = document.getElementById('banner-grid');
    if (!list) return;
    
    list.innerHTML = [...(AdminData.data.banners || [])]
      .sort((a, b) => (Number(a.order) || 9999) - (Number(b.order) || 9999))
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
      grid.innerHTML = `لا توجد حملات حالياً.`;
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
    
    const promoStats = AdminData.data.system?.globalStats?.promoStats || { couponUsageMap: {} };
    
    grid.innerHTML = coupons.map(coupon => {
      const uiData = {
        prodName: coupon.targetProds?.length > 0 ? `${coupon.targetProds.length} منتجات` : 'الكل',
        tierName: coupon.targetTiers?.length > 0 ? `${coupon.targetTiers.length} مستويات` : 'الكل',
        liveUsedCount: promoStats.couponUsageMap[coupon.code] || 0
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
    
    // 🛡️ [التصحيح المعماري 1]: تحويل المصفوفات البطيئة لكائنات Set (O(1)) لحماية الذاكرة 
    const savedTiersSet = new Set(savedTiers.map(String));
    const savedProdsSet = new Set(savedProds.map(String));
    
    let tiersHtml = (d.tiers || []).map(t =>
      MarketingTemplates.smartTreeTier(t.id, Utils.escapeHTML(t.name), t.icon || 'fa-user', savedTiersSet.has(String(t.id)))
    ).join('');
    tiersContainer.innerHTML = `${tiersHtml || 'لا توجد مستويات'}`;
    
    const catMap = {};
    (d.cats || []).forEach(c => catMap[c.id] = { name: c.name, prods: [] });
    
    const orphanProds = [];
    (d.prods || []).forEach(p => {
      if (p.catId && catMap[p.catId]) catMap[p.catId].prods.push(p);
      else orphanProds.push(p);
    });
    
    let treeHtml = Object.keys(catMap).map(catId => {
      const category = catMap[catId];
      if (category.prods.length === 0) return '';
      
      let childrenHtml = category.prods.map(p =>
        MarketingTemplates.smartTreeChild(p.id, Utils.escapeHTML(p.name), p.img, savedProdsSet.has(String(p.id)), String(p.id).slice(-4))
      ).join('');
      
      return MarketingTemplates.smartTreeParent(catId, Utils.escapeHTML(category.name), childrenHtml, category.prods.some(p => savedProdsSet.has(String(p.id))));
    }).join('');
    
    if (orphanProds.length > 0) {
      let orphanHtml = orphanProds.map(p =>
        MarketingTemplates.smartTreeChild(p.id, Utils.escapeHTML(p.name), p.img, savedProdsSet.has(String(p.id)), String(p.id).slice(-4))
      ).join('');
      
      treeHtml += MarketingTemplates.smartTreeParent('orphans', 'منتجات بدون قسم', orphanHtml, orphanProds.some(p => savedProdsSet.has(String(p.id))));
    }
    
    prodsContainer.innerHTML = `${treeHtml || 'لا توجد منتجات'}`;
  }
};