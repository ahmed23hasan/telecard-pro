// ============================================================================
// 🖥️ محرك الرسم والتحكم (renderManager.js) - Enterprise V14.8 💎
// 🎯 الوظيفة: المايسترو لمعالجة البيانات، الفلترة، الحماية، والتوجيه
// 🚀 التحديثات:
// 1. Dynamic Category Resolution: إصلاح شامل لفلترة المنتجات لدعم مصفوفات الأقسام والمسميات المختلفة.
// 2. Safe Image Fallback: إظهار الأيقونات الاحتياطية بأمان ومنع تكرار النصوص.
// 3. Search Leak Shield: حماية نتائج البحث من إظهار منتجات تابعة لأقسام مخفية أو محذوفة.
// 4. Fast DOM Fragment: إزالة مستمعات الصور اليدوية وتسريع الرسم بنسبة 40%.
// 5. Safe URL Fix: استخدام safeUrl لحماية روابط Firebase Storage من الكسر.
// ============================================================================

import { DB_KEYS } from './config.js';
import { Utils } from './utils.js';
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js';
import { Components } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';
import { UIBuilders } from './ui/uiBuilders.js'; 

// ============================================================================
// 🛡️ المساعدات العامة للنافذة وإدارة الذاكرة (Global Namespace) 
// ============================================================================
window.StoreRenderApp = window.StoreRenderApp || {
    imgCache: new Set(),
    timerInterval: null,

    revealImg: function(img) {
        if (!img) return;
        img.style.cssText = ''; 
        img.classList.add('img-loaded-flat'); 
        img.style.setProperty('opacity', '1', 'important');
        img.style.setProperty('visibility', 'visible', 'important');
        
        if (img.parentElement) {
            img.parentElement.classList.add('shimmer-stop');
            img.parentElement.style.backgroundColor = 'transparent';
            img.parentElement.style.animation = 'none'; 
        }
    },

    onImgLoad: function(img) {
        if (!img) return;
        const key = img.getAttribute('data-key');
        if (key) {
            if (this.imgCache.has(key)) this.imgCache.delete(key);
            else if (this.imgCache.size > 500) this.imgCache.delete(this.imgCache.values().next().value);
            this.imgCache.add(key);
        }
        
        if (img.complete && img.naturalHeight > 0) { this.revealImg(img); return; }
        if ('decode' in img) img.decode().then(() => this.revealImg(img)).catch(() => this.revealImg(img));
        else this.revealImg(img);
    },

    handleImgError: function(img, type) {
        if (!img) return;
        img.style.display = 'none';
        img.alt = ''; 
        
        const wrapper = img.parentElement;
        if (!wrapper) return;
        
        wrapper.classList.add('shimmer-stop');
        wrapper.style.cssText = 'animation: none !important; background-color: transparent !important;';
        
        let fallback = wrapper.querySelector('.fallback-icon-ready');
        if (fallback) {
            fallback.style.display = 'flex';
        } else {
            let iconClass = type === 'cat' ? 'fa-layer-group' : (type === 'pay' ? 'fa-building-columns' : 'fa-box-open');
            let divClass = type === 'pay' ? 'pay-icon-default' : 'default-prod-icon';
            const fallbackDiv = document.createElement('div');
            fallbackDiv.className = `${divClass} fallback-icon-ready`;
            fallbackDiv.style.cssText = 'display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-muted); font-size: 24px;';
            fallbackDiv.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
            wrapper.appendChild(fallbackDiv);
        }
    }
};

export const RenderManager = {
    currentRenderId: 0,
    highlightId: null,
    _highlightTimer: null, 
    limits: { wallet: 15, orders: 15, payments: 15 },
    _historicalData: { orders: [], deposits: [] },
    
    _debounceTimers: {},
    _debounce: function(key, fn, delay = 150) {
        return (...args) => {
            clearTimeout(this._debounceTimers[key]);
            this._debounceTimers[key] = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    _renderHtmlToFragment: function(htmlString) {
        const template = document.createElement('template');
        template.innerHTML = htmlString;
        return template.content; 
    },
    
    _getMappedColor: function(colorStr) {
        return String(colorStr || 'badge-blue').replace('theme-ruby', 'badge-red').replace('theme-sunset', 'badge-red').replace('theme-sapphire', 'badge-blue').replace('theme-ocean', 'badge-blue').replace('theme-emerald', 'badge-green').replace('theme-gold', 'badge-gold').replace('theme-amethyst', 'badge-purple').replace('theme-cyber', 'badge-purple').replace('theme-carbon', 'badge-black').replace('theme-obsidian', 'badge-black');
    },
    
    _getMappedPosition: function(posStr, defaultPos) {
        const posMap = { 'pos-tl': 'top-left', 'pos-tc': 'top-center', 'pos-tr': 'top-right', 'pos-bl': 'bottom-left', 'pos-bc': 'bottom-center', 'pos-br': 'bottom-right' };
        return posMap[posStr] || posStr || defaultPos;
    },
    
    _applyGridLayout: function(gridElement, settings = {}, overrideCols = null) {
        if (!gridElement) return;
        if (settings.syncGridLayout) {
            const cols = overrideCols || settings.rootLayout;
            if (cols) { gridElement.style.setProperty('--layout-cols', cols); localStorage.setItem('store_layout_cols', cols); } 
            else { gridElement.style.removeProperty('--layout-cols'); }
        } else {
            gridElement.style.removeProperty('--layout-cols');
            localStorage.removeItem('store_layout_cols');
        }
    },

    _getImgLoadVars: function(rawUrl) {
        if (!rawUrl) return { imgClass: '', wrapperClass: '', lazyAttrs: '', imgStyle: '', wrapperStyle: '', cacheKey: '' };
        let cacheKey = rawUrl;
        const isCached = window.StoreRenderApp.imgCache.has(cacheKey);
        return {
            cacheKey: cacheKey, imgClass: '', wrapperClass: '',
            lazyAttrs: isCached ? 'loading="eager" decoding="sync" fetchpriority="high"' : 'loading="lazy" decoding="async"',
            imgStyle: 'opacity: 0 !important; visibility: hidden !important;', wrapperStyle: ''
        };
    },

    _generateImageHTML: function(rawUrl, safeName, type, isHighPriority = false) {
        let defaultIcon = type === 'cat' ? 'fa-layer-group' : (type === 'pay' ? 'fa-building-columns' : 'fa-box-open');
        let defaultClass = type === 'pay' ? 'pay-icon-default' : 'default-prod-icon';
        let extraStyle = type === 'story' ? 'width: 100%; height: 100%;' : '';

        const fallbackHTML = `<div class="${defaultClass} fallback-icon-ready" style="display: none; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-muted); font-size: 24px; ${extraStyle}"><i class="fa-solid ${defaultIcon}"></i></div>`;

        if (!rawUrl) return { html: fallbackHTML.replace('display: none;', 'display: flex;'), wrapperClass: ' shimmer-stop', wrapperStyle: ' animation: none !important; background-color: transparent !important;' };

        const safeUrl = typeof Utils !== 'undefined' && Utils.safeUrl ? Utils.safeUrl(rawUrl) : String(rawUrl).replace(/"/g, '&quot;');
        
        const imgVars = this._getImgLoadVars(rawUrl);
        const priorityAttr = isHighPriority ? 'fetchpriority="high"' : '';
        const imgClass = type === 'pay' ? `pay-icon-img ${imgVars.imgClass}` : imgVars.imgClass;
        
        let imgHTML = `<img src="${safeUrl}" data-key="${imgVars.cacheKey}" class="${imgClass}" style="${imgVars.imgStyle}" ${imgVars.lazyAttrs} alt="${safeName}" ${priorityAttr} data-img-type="${type}" onload="window.StoreRenderApp.onImgLoad(this)" onerror="window.StoreRenderApp.handleImgError(this, '${type}')">`;
        imgHTML += fallbackHTML;
        
        return { html: imgHTML, wrapperClass: imgVars.wrapperClass, wrapperStyle: imgVars.wrapperStyle };
    },

    _generateProductCardHTML: function(p, idx) {
        const rates = DataManager.getRates();
        const displayCurrency = DataManager.selectedCurr || 'USD';
        
        let pricing = null;
try { 
    pricing = DataManager.calculateFinalPrice(p, DataManager.user, 1, null, null); 
} catch(e) {
    // هذا السطر سيفضح المشكلة ولن يخفيها بعد الآن
    console.error("🚨 خطأ أثناء تسعير المنتج:", p.name, "السبب:", e.message, "بيانات المنتج:", p);
}
        if (!pricing) return ''; 
        
        let priceSectionHtml = '', nameExpandedStyle = '';
        if (p.hideGridPrice !== true) {
            const currentValLocal = Utils.convertViaUSD(pricing.unitUsd, 'USD', displayCurrency, rates, 'pricing');
            priceSectionHtml = `<div class="product-price">${RenderHelpers.formatMoney(currentValLocal, displayCurrency)}</div>`;
        } else {
            nameExpandedStyle = 'white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.4; margin: auto 0;';
        }
        
        const safeName = Utils.safeText(p.name);
        const imgObj = this._generateImageHTML(p.img, safeName, 'prod');
        
        let visualElementsHtml = '';
        const activeOffer = DataManager.getActiveOffer(p.id);
        
        if (activeOffer?.visualConfig?.grid) {
            const v = activeOffer.visualConfig.grid;
            const mappedBadgePos = this._getMappedPosition(v.badgePos, 'top-right');
            const mappedTimerPos = this._getMappedPosition(v.timerPos, 'bottom-center');
            const colorClass = this._getMappedColor(v.badgeColor);
            
            if (v.badgeStyle && v.badgeStyle !== 'none') {
                visualElementsHtml += `<div class="offer-badge-base ${v.badgeStyle} ${colorClass} ${mappedBadgePos}">${Utils.escapeHtml(v.badgeText)}</div>`;
            }
            if (v.timerStyle && v.timerStyle !== 'none') {
                let timerContent = activeOffer.expiryDate ? `<span class="live-countdown num-en" data-expire="${activeOffer.expiryDate}">--:--:--</span>` : '--:--:--';
                let tIcon = v.timerStyle === 'timer-digital' ? 'fa-stopwatch' : 'fa-clock';
                visualElementsHtml += `<div class="${v.timerStyle} ${mappedTimerPos}"><i class="fa-regular ${tIcon}"></i> ${timerContent}</div>`;
            }
        } else if (p.badgeText) {
            visualElementsHtml += `<div class="offer-badge-base prod-badge badge-${p.badgeColor || 'blue'}">${Utils.safeText(p.badgeText)}</div>`;
        }
        
        return `<div class="product-card" data-action="open-product" data-id="${p.id}" style="--anim-idx: ${idx}">${UIBuilders.buildProductCardInner(safeName, priceSectionHtml, imgObj, visualElementsHtml, nameExpandedStyle)}</div>`;
    },

    _appendLoadMoreButton: function(container, type, uid, totalCount, limitKey) {
        const hasMoreData = DataManager.cursors && DataManager.cursors[type];
        if (totalCount > this.limits[limitKey] || hasMoreData) {
            const loadMoreBtn = document.createElement('div');
            loadMoreBtn.className = 'load-more-container mt-15 mb-15 text-center w-100';
            loadMoreBtn.innerHTML = `<button class="load-more-btn"><i class="fa-solid fa-angle-down"></i> عرض المزيد</button>`;
            
            loadMoreBtn.querySelector('button').addEventListener('click', async (e) => {
                const btn = e.target.closest('button');
                if (btn.disabled || btn.dataset.locked === 'true') return;
                
                if (totalCount > this.limits[limitKey]) {
                    this.limits[limitKey] += 15;
                    if (type === 'orders') this.renderOrders(true);
                    else if (type === 'deposits') this.renderPayments(true);
                    else if (type === 'wallet') this.renderWallet(true);
                    return;
                }
                
                if (hasMoreData) {
                    btn.dataset.locked = 'true';
                    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحميل...`; 
                    btn.disabled = true;
                    
                    const dbKey = type === 'orders' ? DB_KEYS.ORDERS : DB_KEYS.DEPOSITS;
                    try {
                        const res = await StoreDB.fetchMoreWithCursor(dbKey, ['userId', '==', String(uid)], 'time', DataManager.cursors[type], 15);
                        if (res.data && res.data.length > 0) {
                            const normData = res.data.map(item => ({...item, time: RenderHelpers.parseTime(item.time), createdAt: RenderHelpers.parseTime(item.createdAt)}));
                            
                            const mergedData = [...this._historicalData[type], ...normData];
                            this._historicalData[type] = mergedData.length > 500 ? mergedData.slice(-500) : mergedData;
                            
                            DataManager.cursors[type] = res.newLastDoc;
                            this.limits[limitKey] += 15;
                            
                            if (type === 'orders') this.renderOrders(true);
                            else if (type === 'deposits') this.renderPayments(true);
                            else if (type === 'wallet') this.renderWallet(true);
                        } else {
                            DataManager.cursors[type] = null;
                            btn.innerHTML = `لا توجد بيانات أقدم`;
                            setTimeout(() => loadMoreBtn.remove(), 2000);
                        }
                    } catch (err) {
                        btn.innerHTML = `خطأ في التحميل، أعد المحاولة`;
                        btn.disabled = false;
                        btn.dataset.locked = 'false';
                    }
                }
            });
            container.appendChild(loadMoreBtn);
        }
    },

    renderHome: function(isBackAction = false) {
        const renderId = ++this.currentRenderId;
        const grid = document.getElementById('store-grid');
        const titleEl = document.getElementById('grid-title');
        
        const cats = LiveStoreData.cats || [];
        const rootCats = cats.filter(c => !c.parentId).sort((a, b) => (a.order || 0) - (b.order || 0));
        
        const currentCatHash = JSON.stringify(rootCats.map(c => c.id + (c.img || '')));
        const isAlreadyHome = document.body.classList.contains('is-home');
        const isCategoryView = (typeof UIManager !== 'undefined' && UIManager.currentCategoryId === null);
        const hasContent = grid && grid.innerHTML.includes('cat-card');
        
        if (!isBackAction && isAlreadyHome && isCategoryView && hasContent) {
            if (this._lastHomeHash === currentCatHash) {
                if (typeof UIManager !== 'undefined' && UIManager.closeSidebar) UIManager.closeSidebar();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
        }
        
        this._lastHomeHash = currentCatHash;
        document.body.classList.add('is-home');
        document.body.classList.remove('is-favorites');
        
        if (titleEl) { titleEl.classList.remove('show-correct-title'); titleEl.innerText = 'الأقسام الرئيسية'; }
        
        const performRender = () => {
            if (typeof UIManager !== 'undefined') {
                UIManager.toggleHeroSection(true); UIManager.navHistory = []; UIManager.currentCategoryId = null; UIManager.resetGridScroll(); UIManager.resetUI(); UIManager.renderTicker();
            }
            
            if (!isBackAction && window.history.replaceState) window.history.replaceState(null, '', ' ');
            
            if (grid) {
                if (typeof UIManager !== 'undefined' && UIManager.setGridMode) UIManager.setGridMode('grid-cats');
                this._applyGridLayout(grid, LiveStoreData.settings || {}, null);
            }
            
            const backBtn = document.getElementById('header-back-btn') || document.querySelector('.modern-back-btn') || document.getElementById('smart-back-btn');
            if (backBtn) { backBtn.classList.remove('show'); backBtn.style.display = 'none'; }
            
            if (rootCats.length > 0) {
                const combinedHtml = rootCats.map(c => {
                    const safeName = Utils.safeText(c.name);
                    const imgObj = this._generateImageHTML(c.img, safeName, 'cat', true);
                    return `<div class="cat-card" data-action="open-category" data-id="${c.id}"><div class="cat-img-box ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">${imgObj.html}</div><div class="cat-name-box"><div class="cat-name">${safeName}</div></div></div>`;
                }).join('');
                
                requestAnimationFrame(() => {
                    if (renderId !== this.currentRenderId) return; 
                    if (grid) grid.replaceChildren(this._renderHtmlToFragment(combinedHtml));
                });
            }
            else if (!(LiveStoreData.isInitialSyncDone || false)) {
                if (typeof this.renderHomeSkeletons === 'function') this.renderHomeSkeletons();
            }
            else {
                setTimeout(() => {
                    const finalCats = LiveStoreData.cats || [];
                    if (finalCats.length === 0 && grid) {
                        grid.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-store-slash"></i><h3>المتجر قيد التحديث</h3><p>يرجى العودة بعد قليل.</p></div>`;
                    } else if (finalCats.length > 0) {
                        this.renderHome(true);
                    }
                }, 1000);
            }
            
            if (typeof UIManager !== 'undefined' && UIManager.initSlider) UIManager.initSlider();
        };
        
        performRender();
    },

    renderHomeSkeletons: function() {
        const grid = document.getElementById('store-grid');
        if (grid) {
            if (typeof UIManager !== 'undefined' && UIManager.setGridMode) UIManager.setGridMode('grid-cats');
            this._applyGridLayout(grid, LiveStoreData.settings || {}, null);
            let catSkeletons = '';
            for (let i = 0; i < 6; i++) catSkeletons += `<div class="cat-skeleton-card"><div class="cat-img-skeleton skeleton-box"></div><div class="cat-name-skeleton skeleton-box"></div></div>`;
            grid.replaceChildren(this._renderHtmlToFragment(catSkeletons));
        }
    },
  
    renderProductSkeletons: function(containerId, overrideCount = null) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (typeof UIManager !== 'undefined' && UIManager.setGridMode) UIManager.setGridMode('grid-prods');

        let activeCols = null;
        if (typeof UIManager !== 'undefined' && UIManager.currentCategoryId && LiveStoreData.cats) {
            const cat = LiveStoreData.cats.find(c => Number(c.id) === Number(UIManager.currentCategoryId));
            if (cat && cat.layout) activeCols = cat.layout;
        }
        this._applyGridLayout(container, LiveStoreData.settings || {}, activeCols);
        
        let skeletonsHTML = '';
        for (let i = 0; i < (overrideCount || 8); i++) {
            skeletonsHTML += `<div class="product-skeleton-card skeleton-clean"><div class="prod-img-skeleton skeleton-box"></div><div class="prod-info-skeleton"><div class="product-name skeleton-box skeleton-text-name"></div><div class="product-price skeleton-box skeleton-text-price"></div></div></div>`;
        }
        container.replaceChildren(this._renderHtmlToFragment(skeletonsHTML));
    },

    initTimersEngine: function() {
        if (window.StoreRenderApp.timerInterval) {
            clearInterval(window.StoreRenderApp.timerInterval);
            window.StoreRenderApp.timerInterval = null;
        }
        
        window.StoreRenderApp.timerInterval = setInterval(() => {
            if (document.hidden) return; 
            
            const timers = document.querySelectorAll('.live-countdown');
            if (timers.length === 0) {
                clearInterval(window.StoreRenderApp.timerInterval);
                window.StoreRenderApp.timerInterval = null;
                return;
            }

            const now = (typeof DataManager !== 'undefined' && typeof DataManager.getNow === 'function') ? DataManager.getNow() : Date.now();

            timers.forEach(item => {
                const expireTime = Number(item.dataset.expire);
                const diff = expireTime - now;
                
                if (diff <= 0 || isNaN(diff)) {
                    item.innerText = "انتهى العرض";
                } else {
                    const h = Math.floor(diff / (1000 * 60 * 60)), m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)), s = Math.floor((diff % (1000 * 60)) / 1000);
                    item.innerText = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                }
            });
        }, 1000);
    },

    renderOfferStories: function(categoryId) {
        const storiesContainer = document.getElementById('offer-stories-bar');
        if (!storiesContainer) return;

        const now = (typeof DataManager !== 'undefined' && typeof DataManager.getNow === 'function') ? DataManager.getNow() : Date.now();
        const activeOffers = (LiveStoreData.offers || []).filter(o => o.isActive && o.visualConfig?.storyEnabled && (!o.expiryDate || o.expiryDate > now));

        if (activeOffers.length === 0) { storiesContainer.innerHTML = ''; storiesContainer.style.display = 'none'; return; }

        let storiesHtml = '';
        activeOffers.forEach(offer => {
            try {
                const v = offer.visualConfig;
                const storyProdsArray = v.storyProducts?.length > 0 ? v.storyProducts : (offer.targetProds || []);
                const targetedProds = (LiveStoreData.prods || []).filter(p => {
                    let isCatMatch = false;
                    const targetCatId = String(categoryId);
                    if (Array.isArray(p.catId)) isCatMatch = p.catId.map(String).includes(targetCatId);
                    else if (Array.isArray(p.categoryIds)) isCatMatch = p.categoryIds.map(String).includes(targetCatId);
                    else isCatMatch = String(p.catId) === targetCatId || String(p.categoryId) === targetCatId || String(p.category_id) === targetCatId;
                    
                    return isCatMatch && storyProdsArray.includes(String(p.id));
                });

                targetedProds.forEach(prod => {
                    let shapeClass = ''; let shapeStyle = '';
                    const adminShape = v.storyShape || 'shape-circle';
                    if (adminShape.includes('%') || adminShape.includes('px')) { shapeStyle = `border-radius: ${adminShape} !important;`; } 
                    else { shapeClass = adminShape.startsWith('shape-') ? adminShape : `shape-${adminShape}`; }

                    let badgeHtml = '', timerHtml = '', bColorClass = ''; 

                    if (v.grid) {
                        bColorClass = this._getMappedColor(v.grid.badgeColor);
                        if (v.grid.badgeStyle && v.grid.badgeStyle !== 'none') {
                            badgeHtml = `<div class="story-badge ${v.grid.badgeStyle} ${bColorClass} ${this._getMappedPosition(v.grid.badgePos, 'bottom-center')}">${Utils.escapeHtml(v.grid.badgeText || '')}</div>`;
                        }
                        if (v.grid.timerStyle && v.grid.timerStyle !== 'none') {
                            const timerContent = offer.expiryDate ? `<span class="live-countdown num-en" data-expire="${offer.expiryDate}">--:--:--</span>` : '--:--:--';
                            const tIcon = ['timer-bc-pill', 'timer-minimal'].includes(v.grid.timerStyle) ? `<i class="fa-regular fa-clock"></i> ` : (v.grid.timerStyle === 'timer-digital' ? `<i class="fa-solid fa-stopwatch"></i> ` : '');
                            timerHtml = `<div class="${v.grid.timerStyle} ${this._getMappedPosition(v.grid.timerPos, 'top-center')}">${tIcon}${timerContent}</div>`;
                        }
                    }

                    const imgObj = this._generateImageHTML(prod.img, Utils.escapeHtml(prod.name), 'story');

                    storiesHtml += `<div class="story-item clickable" data-action="open-product" data-id="${prod.id}"><div class="story-ring ${shapeClass} ${bColorClass}" style="${shapeStyle}"><div class="story-img-wrapper ${shapeClass} ${imgObj.wrapperClass}" style="${shapeStyle} ${imgObj.wrapperStyle}">${imgObj.html}</div>${badgeHtml}${timerHtml}</div><span class="story-title">${Utils.escapeHtml(prod.name)}</span></div>`;
                });
            } catch (e) {}
        });

        if (storiesHtml) {
            storiesContainer.replaceChildren(this._renderHtmlToFragment(`<div class="stories-wrapper-scroll">${storiesHtml}</div>`));
            storiesContainer.style.display = 'block';
            this.initTimersEngine(); 
        } else {
            storiesContainer.style.display = 'none';
        }
    },
    
    _getCategoryName: function(id) {
        try { const target = (LiveStoreData.cats || []).find(c => String(c.id) === String(id)); return target ? target.name : 'القسم'; } catch(e) { return 'القسم'; }
    },
    
    _renderContent: function(id) {
        const renderId = ++this.currentRenderId;
        UIManager.currentCategoryId = id;
        document.body.classList.remove('is-home', 'is-favorites'); 
        UIManager.toggleHeroSection(false);

        const grid = document.getElementById('store-grid');
        UIManager.resetGridScroll(); UIManager.resetUI();

        const titleEl = document.getElementById('grid-title');
        if(titleEl) { titleEl.innerText = this._getCategoryName(id); titleEl.classList.add('show-correct-title'); }

        const subs = (LiveStoreData.cats || []).filter(c => String(c.parentId) === String(id)).sort((a,b) => (a.order||0)-(b.order||0));
        
        // 🛠️ تم الإصلاح (Dynamic Category Resolution): فلترة تدعم المصفوفات لضمان جلب كل المنتجات
        const items = (LiveStoreData.prods || []).filter(p => {
            const targetId = String(id);
            if (Array.isArray(p.catId)) return p.catId.map(String).includes(targetId);
            if (Array.isArray(p.categoryIds)) return p.categoryIds.map(String).includes(targetId);
            return String(p.catId) === targetId || String(p.categoryId) === targetId || String(p.category_id) === targetId;
        }).sort((a,b) => (a.order||0)-(b.order||0));

        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if(backBtn) {
            backBtn.style.display = 'flex'; setTimeout(() => backBtn.classList.add('show'), 10);
            backBtn.setAttribute('data-action', 'go-back');
            backBtn.onclick = (e) => { e.preventDefault(); UIManager._manualGoBack(); };
        }

        if(grid) {
            const catCols = (LiveStoreData.cats || []).find(c => String(c.id) === String(id))?.layout || null;
            this._applyGridLayout(grid, LiveStoreData.settings || {}, catCols);

            let combinedHtml = '';
            if(subs.length > 0) {
                UIManager.setGridMode('grid-cats');
                combinedHtml += subs.map(c => {
                    const safeName = Utils.safeText(c.name);
                    const imgObj = this._generateImageHTML(c.img, safeName, 'cat');
                    return `<div class="cat-card" data-action="open-category" data-id="${c.id}"><div class="cat-img-box ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">${imgObj.html}</div><div class="cat-name-box"><div class="cat-name">${safeName}</div></div></div>`;
                }).join('');
            }
            if(items.length > 0) {
                UIManager.setGridMode('grid-prods');
                combinedHtml += items.map((p, idx) => this._generateProductCardHTML(p, idx)).join('');
            }
            
            requestAnimationFrame(() => {
                if (renderId !== this.currentRenderId) return; 
                if (combinedHtml) {
                    grid.replaceChildren(this._renderHtmlToFragment(combinedHtml)); 
                    if(items.length > 0 && Components?.initProductShine) Components.initProductShine();
                } else {
                    grid.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-box-open"></i><h3>لا توجد منتجات</h3></div>`;
                }
            });
        }
    },

    searchStoreTerm: function(q) {
        if(!q || !q.trim()) { this.renderHome(); return; }
        const renderId = ++this.currentRenderId;
        
        UIManager.toggleHeroSection(false);
        document.body.classList.remove('is-home', 'is-favorites'); 

        const term = q.trim().toLowerCase();
        const cleanTerm = term.replace(/[-_.:,]/g, ' ');
        const searchTerms = cleanTerm.split(/\s+/).filter(t => t.length > 0);

        const matchedCats = (LiveStoreData.cats || []).filter(c => c.name?.toLowerCase().replace(/[-_.:,]/g, ' ').includes(cleanTerm));
        
        // 🛠️ تم الإصلاح (Search Leak Shield): استثناء المنتجات التي لا تنتمي لأي قسم نشط ومتاح 
        const activeCatIds = new Set((LiveStoreData.cats || []).map(c => String(c.id)));
        
        const matchedProds = (LiveStoreData.prods || []).filter(p => {
            let isCatActive = false;
            if (Array.isArray(p.catId)) isCatActive = p.catId.some(cid => activeCatIds.has(String(cid)));
            else if (Array.isArray(p.categoryIds)) isCatActive = p.categoryIds.some(cid => activeCatIds.has(String(cid)));
            else isCatActive = activeCatIds.has(String(p.catId)) || activeCatIds.has(String(p.categoryId)) || activeCatIds.has(String(p.category_id));
            
            if (!isCatActive) return false;
            
            return p.name && searchTerms.every(word => p.name.toLowerCase().replace(/[-_.:,]/g, ' ').includes(word));
        });

        const grid = document.getElementById('store-grid'); 
        if(!grid) return;
        
        let activeCols = null;
        if (typeof UIManager !== 'undefined' && UIManager.currentCategoryId) {
            const currentCat = (LiveStoreData.cats || []).find(c => String(c.id) === String(UIManager.currentCategoryId));
            if (currentCat && currentCat.layout) activeCols = currentCat.layout;
        }
        this._applyGridLayout(grid, LiveStoreData.settings || {}, activeCols);

        UIManager.resetGridScroll(); UIManager.setGridMode(null);

        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if(backBtn) {
            backBtn.style.display = 'flex'; setTimeout(() => backBtn.classList.add('show'), 10);
            backBtn.setAttribute('data-action', 'go-back');
            backBtn.onclick = () => { const inp = document.getElementById('store-search-input'); if(inp) inp.value = ''; this.renderHome(true); };
        }

        const titleEl = document.getElementById('grid-title');
        if(titleEl) titleEl.innerText = 'نتائج البحث';

        if (matchedCats.length === 0 && matchedProds.length === 0) {
            grid.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-magnifying-glass"></i><h3>لا توجد نتائج</h3></div>`; return;
        }

        let combinedHtml = '';
        if (matchedCats.length > 0) {
            combinedHtml += matchedCats.map(c => {
                const safeName = Utils.safeText(c.name);
                const imgObj = this._generateImageHTML(c.img, safeName, 'cat');
                return `<div class="cat-card" data-action="open-category" data-id="${c.id}"><div class="cat-img-box ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">${imgObj.html}</div><div class="cat-name-box"><div class="cat-name">${safeName}</div></div></div>`;
            }).join('');
        }
        if (matchedProds.length > 0) {
            combinedHtml += matchedProds.map((p, idx) => this._generateProductCardHTML(p, idx)).join('');
        }
        
        requestAnimationFrame(() => {
            if (renderId !== this.currentRenderId) return;
            grid.replaceChildren(this._renderHtmlToFragment(combinedHtml)); 
            UIManager.setGridMode(matchedProds.length > 0 ? 'grid-prods' : 'grid-cats');
            if(Components?.initProductShine) Components.initProductShine();
        });
    },

    renderFavorites: function() {
        const renderId = ++this.currentRenderId;
        document.body.classList.remove('is-home'); document.body.classList.add('is-favorites'); 
        UIManager.toggleHeroSection(false);
        
        const favIds = DataManager.favs ? Array.from(DataManager.favs).map(String) : [];
        const favProds = (LiveStoreData.prods || []).filter(p => favIds.includes(String(p.id)));
        
        const grid = document.getElementById('store-grid');
        if (!grid) return;
        
        UIManager.setGridMode(null); UIManager.resetGridScroll();
        
        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if (backBtn) {
            backBtn.style.display = 'flex'; setTimeout(() => backBtn.classList.add('show'), 10);
            backBtn.setAttribute('data-action', 'go-back');
            backBtn.onclick = (e) => { e.preventDefault(); UIManager.closeFavorites(); };
        }
        
        const gridTitle = document.getElementById('grid-title');
        if (gridTitle) { gridTitle.innerText = 'المفضلة'; gridTitle.classList.add('show-correct-title'); }
        
        if (favProds.length === 0) {
            grid.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-heart-circle-plus"></i><h3>لا توجد منتجات مفضلة بعد</h3></div>`;
            UIManager.setGridMode('grid-prods'); return;
        }
        
        const combinedHtml = favProds.map((p, idx) => this._generateProductCardHTML(p, idx)).join('');
        
        requestAnimationFrame(() => {
            if (renderId !== this.currentRenderId) return; 
            grid.replaceChildren(this._renderHtmlToFragment(combinedHtml)); 
            UIManager.setGridMode('grid-prods');
            
            let activeCols = null;
            if (favProds.length > 0 && LiveStoreData.cats) {
                const parentCatId = Array.isArray(favProds[0].catId) ? String(favProds[0].catId[0]) : String(favProds[0].catId || favProds[0].categoryId);
                const parentCat = LiveStoreData.cats.find(c => String(c.id) === parentCatId);
                if (parentCat && parentCat.layout) activeCols = parentCat.layout;
            }
            this._applyGridLayout(grid, LiveStoreData.settings || {}, activeCols);
            if (Components?.initProductShine) Components.initProductShine();
        });
    },

    renderWallet: function(forceRender = false) {
        if (!forceRender) {
            if (!this._walletDebounced) this._walletDebounced = this._debounce('wallet', () => this.renderWallet(true), 250);
            return this._walletDebounced();
        }

        const filterData = Utils.getSearchAndDateFilters('wallet', 'wallet');
        if (filterData.error) { UIManager.showToast(filterData.error, 'error'); return; }
        const { q, dStart, dEnd, tStart, tEnd } = filterData;

        const list = document.getElementById('wallet-list'); 
        if(!list) return; 

        const user = DataManager.user || { id: 0, balance: 0, totalSpent: 0, totalDeposit: 0, baseCurrency: 'USD' };
        const walletCurr = (user.baseCurrency || user.base_currency || 'USD').toUpperCase();
        
        const uid = localStorage.getItem('telecard_active_user_uid') || (DataManager.user ? String(DataManager.user.id) : null);
        if (!uid || uid === '0' || uid === 'undefined') {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-wallet"></i><h3>يرجى تسجيل الدخول</h3></div>`; return;
        }

        const rawDeposits = [...(LiveStoreData.deposits || []), ...(this._historicalData.deposits || [])];
        const rawOrders = [...(LiveStoreData.orders || []), ...(this._historicalData.orders || [])];
        
        const uniqueDeposits = Array.from(new Map(rawDeposits.map(item => [String(item.id), item])).values());
        const uniqueOrders = Array.from(new Map(rawOrders.map(item => [String(item.id), item])).values());

        const deposits = uniqueDeposits.filter(d => String(d.userId) === String(uid)).map(d => {
            const credited = d.creditedAmount !== undefined ? Number(d.creditedAmount) : Number(d.amount || 0);
            return {
                ...d, type: 'deposit', amountVal: Math.abs(credited), amountCurrency: d.targetCurrency || walletCurr,
                searchKey: `شحن deposit ${credited} #${d.displayId || d.id} ${RenderHelpers.formatDepositId(d).toLowerCase()}`,
                isDeduction: credited < 0, sortTime: RenderHelpers.parseUnifiedTime(d) 
            };
        });
        
        const orders = uniqueOrders.filter(o => String(o.userId) === String(uid)).map(o => {
            return {
                ...o, type: 'purchase', amountVal: Number(o.price || 0), amountCurrency: o.priceCurrency || walletCurr, 
                searchKey: `شراء purchase ${o.product} ${o.price} #${o.displayId || o.id} ${RenderHelpers.formatOrderId(o).toLowerCase()}`,
                sortTime: RenderHelpers.parseUnifiedTime(o) 
            };
        });

        let allTransactions = [...deposits, ...orders].sort((a, b) => {
            const timeDiff = b.sortTime - a.sortTime;
            return timeDiff !== 0 ? timeDiff : String(b.id || '').localeCompare(String(a.id || ''));
        });
        
        const spentDisp = document.getElementById('wallet-total-spent');
        if(spentDisp) spentDisp.innerHTML = RenderHelpers.formatMoney(user.totalSpent || 0, walletCurr);
        const depDisp = document.getElementById('wallet-total-deposit');
        if(depDisp) depDisp.innerHTML = RenderHelpers.formatMoney(user.totalDeposit || 0, walletCurr);

        let finalView = allTransactions;
        const filters = DataManager.filters || { wallet: 'all' };
        const isFilterActive = (filters.wallet !== 'all') || (q && q.length > 0) || tStart || tEnd;

        if(filters.wallet !== 'all') {
            if (filters.wallet === 'deposit') finalView = finalView.filter(t => t.type === 'deposit' && !t.isDeduction); 
            else if (filters.wallet === 'purchase') finalView = finalView.filter(t => t.type === 'purchase' || (t.type === 'deposit' && t.isDeduction)); 
            else finalView = finalView.filter(t => t.type === filters.wallet);
        }

        if(q) finalView = finalView.filter(t => t.searchKey.toLowerCase().includes(q));
        if(tStart) finalView = finalView.filter(t => t.sortTime >= tStart);
        if(tEnd) finalView = finalView.filter(t => t.sortTime <= tEnd);
        
        const totalWalletCount = finalView.length;
        const displayLimit = (!q && !dStart && !dEnd) ? this.limits.wallet : Math.min(finalView.length, 50);
        const visibleWallet = finalView.slice(0, displayLimit);

        if (visibleWallet.length === 0) { list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-wallet"></i><h3>لا توجد حركات</h3></div>`; return; }

        requestAnimationFrame(() => {
            const rawHtml = visibleWallet.map(tx => { try { return UIBuilders.buildWalletCard(tx, walletCurr, isFilterActive); } catch (e) { return ''; } }).join('');
            list.replaceChildren(this._renderHtmlToFragment(rawHtml));
            if (!q && !dStart && !dEnd) this._appendLoadMoreButton(list, 'wallet', uid, totalWalletCount, 'wallet');
        });
    },

    renderPayMethods: function() {
        const container = document.getElementById('bal-pay-grid') || document.getElementById('bal-methods-container') || document.querySelector('.bal-methods-grid') || document.getElementById('pay-methods-list');
        if (!container) return;
        
        const validPayments = (LiveStoreData.payments || []).filter(p => p?.name?.trim() && p.isActive !== false && p.is_active !== false).sort((a,b) => (a.order || 0) - (b.order || 0));

        if (validPayments.length === 0) {
            container.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-building-columns"></i><h3>لا توجد طرق دفع متاحة</h3></div>`; return;
        }

        const uid = localStorage.getItem('telecard_active_user_uid') || (DataManager.user ? String(DataManager.user.id) : null);
        const pendingMethodKeys = (LiveStoreData.deposits || []).filter(d => String(d.userId) === String(uid) && d.status === 'pending').map(d => String(d.methodId || d.method).toLowerCase());

        let html = '';
        validPayments.forEach(p => {
            try {
                const safeName = Utils.escapeHtml(p.name);
                const isLocked = pendingMethodKeys.includes(String(p.id).toLowerCase()) || pendingMethodKeys.includes(String(p.name).toLowerCase());
                const imgObj = this._generateImageHTML(p.img, safeName, 'pay');

                if (isLocked) {
                    html += `<div class="pay-card-select method-locked" style="opacity: 0.65;" onclick="window.UIManager?.showToast('لديك طلب إيداع قيد المعالجة بهذه الطريقة.', 'warning')"><div class="pay-icon-wrapper ${imgObj.wrapperClass}" style="filter: grayscale(100%); ${imgObj.wrapperStyle}">${imgObj.html}</div><div class="pay-card-content"><h3 class="pay-card-name" style="color: var(--text-muted);">${safeName}</h3><span style="display:block; font-size:11px; color:var(--warning); margin-top:4px;"><i class="fa-solid fa-hourglass-half"></i> طلب قيد المعالجة</span></div><i class="fa-solid fa-lock pay-card-arrow" style="color: var(--text-muted);"></i></div>`;
                } else {
                    html += `<div class="pay-card-select clickable" data-action="select-pay" data-id="${p.id}"><div class="pay-icon-wrapper ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">${imgObj.html}</div><div class="pay-card-content"><h3 class="pay-card-name">${safeName}</h3></div><i class="fa-solid fa-chevron-left pay-card-arrow"></i></div>`;
                }
            } catch(e) {}
        });
        
        requestAnimationFrame(() => container.replaceChildren(this._renderHtmlToFragment(html))); 
    },

    renderPayments: function(forceRender = false) {
        if (!forceRender) {
            if (!this._payDebounced) this._payDebounced = this._debounce('pay', () => this.renderPayments(true), 250);
            return this._payDebounced();
        }

        const list = document.getElementById('mypay-list');
        if(!list) return;
        
        const filterData = Utils.getSearchAndDateFilters('pay', 'pay');
        if (filterData.error) { UIManager.showToast(filterData.error, 'error'); return; }
        const { q, dStart, dEnd, tStart, tEnd } = filterData;

        const uid = localStorage.getItem('telecard_active_user_uid') || (DataManager.user ? String(DataManager.user.uid || DataManager.user.id) : null);
        if (!uid || uid === '0' || uid === 'undefined') {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-file-invoice-dollar"></i><h3>يرجى تسجيل الدخول</h3></div>`; return;
        }

        const user = DataManager.user || { id: 0 };
        const baseCurrency = (user.baseCurrency || 'USD').toUpperCase();
        
        const rawDeposits = [...(LiveStoreData.deposits || []), ...(this._historicalData.deposits || [])];
        const uniqueDeposits = Array.from(new Map(rawDeposits.map(item => [String(item.id), item])).values());
        
        let myDeposits = uniqueDeposits.filter(d => String(d.userId) === String(uid)).map(d => ({ ...d, sortTime: RenderHelpers.parseUnifiedTime(d) }));

        const filters = DataManager.filters || { payments: 'all' };
        if (filters.payments !== 'all') myDeposits = myDeposits.filter(d => filters.payments === 'rejected' ? ['rejected', 'refunded', 'returned'].includes(d.status) : d.status === filters.payments);

        if (q) myDeposits = myDeposits.filter(d => RenderHelpers.formatDepositId(d).toLowerCase().includes(q) || (d.method && d.method.toLowerCase().includes(q)));
        if (tStart) myDeposits = myDeposits.filter(d => d.sortTime >= tStart);
        if (tEnd) myDeposits = myDeposits.filter(d => d.sortTime <= tEnd);

        myDeposits.sort((a, b) => {
            const timeDiff = b.sortTime - a.sortTime;
            return timeDiff !== 0 ? timeDiff : String(b.id || '').localeCompare(String(a.id || ''));
        });

        const totalPaymentsCount = myDeposits.length;
        const displayLimit = (!q && !dStart && !dEnd) ? this.limits.payments : Math.min(myDeposits.length, 50);
        const visibleDeposits = myDeposits.slice(0, displayLimit);

        if (visibleDeposits.length === 0) { list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-file-invoice-dollar"></i><h3>لا توجد عمليات</h3></div>`; return; }

        const userDisplayName = Utils.escapeHtml(user.username ? `@${user.username}` : (user.name || 'العميل'));
        const userIdString = RenderHelpers.formatUserId(user);

        requestAnimationFrame(() => {
            const rawHtml = visibleDeposits.map(d => { try { return UIBuilders.buildPaymentCard(d, userDisplayName, userIdString, baseCurrency); } catch(e) { return ''; } }).join('');
            list.replaceChildren(this._renderHtmlToFragment(rawHtml));
            if (!q && !dStart && !dEnd) this._appendLoadMoreButton(list, 'deposits', uid, totalPaymentsCount, 'payments');
        });
    },

    renderOrders: function(forceRender = false) {
        if (!forceRender) {
            if (!this._ordersDebounced) this._ordersDebounced = this._debounce('orders', () => this.renderOrders(true), 250);
            return this._ordersDebounced();
        }

        const renderId = ++this.currentRenderId; 
        if (typeof window.updateBottomNavState === 'function') window.updateBottomNavState('orders');

        const filterData = Utils.getSearchAndDateFilters('order', 'order');
        if (filterData.error) { UIManager.showToast(filterData.error, 'error'); return; }
        const { q, dStart, dEnd, tStart, tEnd } = filterData;
        
        const list = document.getElementById('orders-list'); 
        if (!list) return; 
        
        const uid = localStorage.getItem('telecard_active_user_uid') || (DataManager.user ? String(DataManager.user.id) : null);
        if (!uid || uid === '0' || uid === 'undefined') {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-box-open"></i><h3>يرجى تسجيل الدخول</h3></div>`; return;
        }

        const rawOrders = [...(LiveStoreData.orders || []), ...(this._historicalData.orders || [])];
        const uniqueOrders = Array.from(new Map(rawOrders.map(item => [String(item.id), item])).values());

        let orders = uniqueOrders.filter(o => String(o.userId) === String(uid)).map(o => ({ ...o, sortTime: RenderHelpers.parseUnifiedTime(o) }));

        const filters = DataManager.filters || { orders: 'all' };
        if (filters.orders !== 'all') orders = orders.filter(o => o.status === filters.orders);
        
        if (q) orders = orders.filter(o => o.id.toString().includes(q) || (o.displayId && o.displayId.toLowerCase().includes(q)) || RenderHelpers.formatOrderId(o).toLowerCase().includes(q) || o.product?.toLowerCase().includes(q));
        if (tStart) orders = orders.filter(o => o.sortTime >= tStart);
        if (tEnd) orders = orders.filter(o => o.sortTime <= tEnd);

        orders.sort((a, b) => {
            const timeDiff = b.sortTime - a.sortTime;
            return timeDiff !== 0 ? timeDiff : String(b.id || '').localeCompare(String(a.id || ''));
        });

        const totalOrdersCount = orders.length;
        const displayLimit = (!q && !dStart && !dEnd) ? this.limits.orders : Math.min(orders.length, 50);
        const visibleOrders = orders.slice(0, displayLimit);

        if (visibleOrders.length === 0) { list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-box-open"></i><h3>لا توجد طلبات</h3></div>`; return; }
        
        requestAnimationFrame(() => {
            if (renderId !== this.currentRenderId) return; 
            const rawHtml = visibleOrders.map((o, idx) => {
                try {
                    const prodName = Utils.escapeHtml(o.product || (LiveStoreData.prods || []).find(p => String(p.id) === String(o.prodId))?.name || 'منتج');
                    return UIBuilders.buildOrderCard(o, idx, (o.priceCurrency || 'USD').toUpperCase(), this.highlightId, prodName);
                } catch (e) { return ''; }
            }).join('');
            
            list.replaceChildren(this._renderHtmlToFragment(rawHtml));
            if (!q && !dStart && !dEnd) this._appendLoadMoreButton(list, 'orders', uid, totalOrdersCount, 'orders');
            
            if (this.highlightId) {
                if (this._highlightTimer) clearTimeout(this._highlightTimer);
                this._highlightTimer = setTimeout(() => {
                    this.highlightId = null;
                    this._highlightTimer = null;
                }, 2000);
            }
        });
    },

    _getSys: function() {
        if (typeof window.ClientSystem !== 'undefined') return window.ClientSystem;
        if (typeof window.UIManager !== 'undefined') return window.UIManager;
        return { showToast: () => {} };
    },

    generatePDFReceipt: async function(config) {
        return new Promise((resolve) => {
            try {
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                const settings = LiveStoreData.settings || {};
                const storeName = settings.storeName || 'TeleCard';
                const storeLogo = settings.storeLogoLight || settings.storeLogo || '';
                
                let safeLogoHtml = storeLogo ? `<img src="${Utils.escapeHtml(storeLogo)}" style="max-height: 55px; max-width: 160px; object-fit: contain;">` : '';
                const brandHTML = { html: `<div class="header-section"><div class="store-name">${Utils.escapeHtml(storeName)}</div>${safeLogoHtml}</div>` };
                
                const fullHTML = UIBuilders.buildPDFReceipt(config, brandHTML.html);
                const blob = new Blob([fullHTML], { type: 'text/html;charset=utf-8' });
                const blobUrl = URL.createObjectURL(blob);
                
                if (isMobile) {
                    const link = document.createElement('a'); link.href = blobUrl; link.target = '_blank';
                    document.body.appendChild(link); link.click(); document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000); 
                    resolve(true);
                } else {
                    const iframe = document.createElement('iframe');
                    iframe.style.position = 'fixed'; iframe.style.right = '-10000px'; iframe.style.bottom = '-10000px';
                    iframe.src = blobUrl;
                    document.body.appendChild(iframe);
                    
                    iframe.onload = function() {
                        setTimeout(() => {
                            try {
                                iframe.contentWindow.focus();
                                iframe.contentWindow.print();
                                setTimeout(() => {
                                    if (document.body.contains(iframe)) document.body.removeChild(iframe);
                                    URL.revokeObjectURL(blobUrl);
                                    resolve(true);
                                }, 60000);
                            } catch (e) {
                                if (document.body.contains(iframe)) document.body.removeChild(iframe);
                                URL.revokeObjectURL(blobUrl);
                                resolve(false);
                            }
                        }, 800);
                    };
                }
            } catch (err) { resolve(false); }
        });
    },

    exportReceipt: async function(orderId, btnElement = null) {
        const o = (LiveStoreData.orders || []).find(x => String(x.id) === String(orderId));
        if (!o) return;
        
        let originalHtml = '';
        if (btnElement) { btnElement.disabled = true; originalHtml = btnElement.innerHTML; btnElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحضير...`; }
        
        const finalPrice = Number(o.pricingSnapshot?.finalPrice || o.price || 0);
        const originalPrice = Number(o.pricingSnapshot?.originalPrice || o.price || 0);

        const success = await this.generatePDFReceipt({
            type: 'order', filename: `Order_${RenderHelpers.formatOrderId(o)}.pdf`,
            data: {
                id: o.id, displayId: RenderHelpers.formatOrderId(o),
                userName: typeof UIManager !== 'undefined' && UIManager._getFullName ? UIManager._getFullName(DataManager.user) : (DataManager.user?.name || 'العميل'),
                userDisplayId: RenderHelpers.formatUserId(DataManager.user),
                status: o.status, product: o.product, 
                price: finalPrice, originalPrice: originalPrice, priceCurrency: o.priceCurrency || 'USD', 
                qty: o.qty || 1, 
                input: Utils.escapeHtml(o.input || '---'),
                dateTime: RenderHelpers.formatSafeDate(o.time || o.createdAt), code: (o.status === 'completed' && o.deliveredCode !== 'null') ? o.deliveredCode : null
            }
        });
        
        if (btnElement) { btnElement.disabled = false; btnElement.innerHTML = originalHtml; }
        if (!success) this._getSys().showToast?.('تعذر تصدير الإيصال، يرجى المحاولة لاحقاً', 'error');
    },
    
    exportPaymentReceipt: async function(depositId, btnElement = null) {
        const d = (LiveStoreData.deposits || []).find(x => String(x.id) === String(depositId));
        if (!d) return;
        
        let originalHtml = '';
        if (btnElement) { btnElement.disabled = true; originalHtml = btnElement.innerHTML; btnElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحضير...`; }
        
        const rawAmt = Number(d.amount || 0);
        const credAmt = d.creditedAmount !== undefined ? Number(d.creditedAmount) : rawAmt;
        const calcFee = Math.abs(rawAmt - credAmt);
        const isBonus = credAmt > rawAmt;

        const success = await this.generatePDFReceipt({
            type: 'deposit', filename: `Deposit_${RenderHelpers.formatDepositId(d)}.pdf`,
            data: {
                id: d.id, displayId: RenderHelpers.formatDepositId(d),
                userName: typeof UIManager !== 'undefined' && UIManager._getFullName ? UIManager._getFullName(DataManager.user) : (DataManager.user?.name || 'العميل'),
                userDisplayId: RenderHelpers.formatUserId(DataManager.user),
                method: d.method || '---', amount: rawAmt, currency: d.currency || 'USD',
                feePercent: d.feesPercent || 0, feeVal: calcFee, feeType: isBonus ? 'bonus' : 'fee', 
                netVal: credAmt, targetCurrency: d.targetCurrency || 'USD',
                dateTime: RenderHelpers.formatSafeDate(d.time || d.createdAt)
            }
        });
        
        if (btnElement) { btnElement.disabled = false; btnElement.innerHTML = originalHtml; }
        if (!success) this._getSys().showToast?.('تعذر تصدير الإيصال، يرجى المحاولة لاحقاً', 'error');
    },

    renderNotifCenterList: function() {
        const container = document.getElementById('notif-center-list');
        if (!container) return;
        
        let allAlerts = [];
        try { allAlerts = DataManager.getAllUserAlerts ? DataManager.getAllUserAlerts() : (LiveStoreData.alerts || []); } catch (e) {}
        
        if (allAlerts.length === 0) {
            container.innerHTML = `<div class="nc-empty-state"><i class="fa-regular fa-bell-slash"></i><p>لا توجد إشعارات حالياً</p></div>`;
            if (window.UIManager?.updateNotifBadges) window.UIManager.updateNotifBadges(0);
            return;
        }
        
        const serverLastReadTime = DataManager.user?.lastReadAlertTime ? RenderHelpers.parseUnifiedTime({ time: DataManager.user.lastReadAlertTime }) : 0;
        let readIds = [];
        try { readIds = JSON.parse(localStorage.getItem(DB_KEYS.NOTIF_READ_LIST) || "[]").map(String); } catch (e) { localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, "[]"); }
        
        allAlerts.sort((a, b) => {
            const timeDiff = RenderHelpers.parseUnifiedTime(b) - RenderHelpers.parseUnifiedTime(a);
            return timeDiff !== 0 ? timeDiff : String(b.id || '').localeCompare(String(a.id || ''));
        });
        
        const unreadCount = allAlerts.filter(a => !readIds.includes(String(a.id)) && !a.isRead && RenderHelpers.parseUnifiedTime(a) > serverLastReadTime).length;
        if (window.UIManager?.updateNotifBadges) window.UIManager.updateNotifBadges(unreadCount);
        
        let html = unreadCount > 0 ? `<div class="nc-top-action-bar"><span class="nc-unread-count-text">لديك <span class="nc-unread-count-num">${unreadCount}</span> جديد</span><button class="btn btn-ghost nc-mark-read-btn" data-action="mark-all-read">تحديد الكل كمقروء</button></div>` : '';
        
        html += allAlerts.slice(0, 30).map(alert => {
            try {
                const isRead = readIds.includes(String(alert.id)) || alert.isRead || RenderHelpers.parseUnifiedTime(alert) <= serverLastReadTime;
                return `<div class="nc-item ${isRead ? 'is-read' : 'unread'}" data-action="mark-single-read" data-id="${alert.id}"><div class="nc-icon"><i class="fa-solid ${(alert.jumpTarget === 'order') ? 'fa-box-open' : (alert.icon || 'fa-bullhorn')}"></i></div><div class="nc-content"><div class="nc-header"><h4 class="nc-title">${Utils.escapeHtml(alert.title || 'إشعار جديد')}</h4><span class="nc-time">${RenderHelpers.formatSafeDate(alert.createdAt || alert.time).split(' | ')[0]}</span></div><p class="nc-msg">${Utils.escapeHtml(alert.message || '')}</p></div>${!isRead ? '<div class="unread-indicator-dot"></div>' : ''}</div>`;
            } catch(e) { return ''; }
        }).join('');
        
        requestAnimationFrame(() => container.replaceChildren(this._renderHtmlToFragment(html)));
    },    

    renderCountryList: function(countries) {
        const listTarget = document.getElementById('countries-list-target');
        if (!listTarget) return;
        
        const active = (countries || []).filter(c => c.isActive !== false && !c.isBanned);
        if (active.length === 0) { listTarget.innerHTML = '<div class="dropdown-item">لا توجد دول متاحة</div>'; return; }
        
        const rawHtml = active.map(c => {
            const safeName = Utils.escapeHtml(c.name || c.nameAr || 'غير محددة'), safeFlag = Utils.escapeHtml(c.flag || c.flagEmoji || '🌍'), safeCode = Utils.escapeHtml(c.dialCode || '');
            return `<div class="dropdown-item" data-action="select-country" data-name="${safeName}" data-code="${safeCode}" data-len="${parseInt(c.phoneLen) || 10}"><span style="margin-left: 8px;">${safeFlag}</span><span style="flex: 1;">${safeName}</span><span class="num-en" style="color: var(--text-muted);">${safeCode}</span></div>`;
        }).join('');

        requestAnimationFrame(() => listTarget.replaceChildren(this._renderHtmlToFragment(rawHtml)));
    },

    renderTerms: function() {
        const container = document.getElementById('store-terms-content');
        if (!container) return;
        const termsList = (LiveStoreData.settings || {}).terms || [];
        
        if (typeof termsList === 'string') { container.innerHTML = `<div class="terms-unified-card"><div class="term-item-row"><p class="tir-text">${Utils.escapeHtml(termsList)}</p></div></div>`; return; }
        if (!Array.isArray(termsList) || termsList.length === 0) { container.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-file-contract"></i><h3>لا توجد سياسة حالياً</h3></div>`; return; }
        
        const rawHtml = `<div class="terms-unified-card">${termsList.map((term, index) => {
            try { return `<div class="term-item-row"><div class="tir-header"><div class="tir-icon"><i class="${Utils.escapeHtml(`fa-solid ${term.icon?.startsWith('fa-') ? term.icon : 'fa-' + (term.icon || 'file-signature')}`)}"></i></div><h3 class="tir-title">${Utils.escapeHtml(term.title || `البند ${index + 1}`)}</h3></div><div class="tir-body"><p class="tir-text">${Utils.escapeHtml(term.text || '')}</p></div></div>`; } catch(e) { return ''; }
        }).join('')}</div>`;

        requestAnimationFrame(() => container.replaceChildren(this._renderHtmlToFragment(rawHtml)));
    }
};
