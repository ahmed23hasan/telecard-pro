// ============================================================================
// 🖥️ محرك الرسم والتحكم (renderManager.js) - الإصدار المؤسسي V18.1.0 💎
// 🎯 الوظيفة: المايسترو لمعالجة البيانات، الفلترة، الحماية، والتوجيه المرئي
// 🚀 التحديثات المعمارية الصارمة (V18.1.0 - Master Patch):
// 1. Selector Injection Fix: استخدام Array.some لمنع تحطم الـ DOM بسبب روابط الصور المعقدة.
// 2. CPU Hang Guard: التدمير الفوري لإطار html2canvas عند التعليق للحفاظ على البطارية.
// 3. SRP Pagination Fix: الاعتماد الكلي على DataManager لجلب السجلات.
// 4. CORS Fallback: حماية تصدير الإيصالات من التلوث (Tainted Canvas).
// 5. Layout Shift Guard: تأجيل تحديث متغيرات الـ CSS لتتزامن مع رسم الـ DOM.
// ============================================================================

import { DB_KEYS, CACHE_KEYS } from './config.js'; 
import * as Utils from './utils.js'; 
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js';
import { Components } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';
import { UIBuilders } from './ui/uiBuilders.js'; 

window.StoreRenderApp = window.StoreRenderApp || {
    imgCache: new Set(),
    timerInterval: null,
    
    revealImg: function(img) {
        if (!img) return;
        img.classList.remove('img-loading-state');
        img.classList.add('img-loaded-flat');
        
        if (img.parentElement) {
            img.parentElement.classList.add('shimmer-stop-override');
        }
    },
    
    onImgLoad: function(img) {
        if (!img) return;
        
        const key = img.getAttribute('data-key');
        if (key) {
            if (this.imgCache.has(key)) {
                this.imgCache.delete(key);
            } else if (this.imgCache.size > 500) {
                let deletedCount = 0;
                
                // 🛡️ الترقيع الماسي للأداء: جلب الروابط النشطة مرة واحدة فقط لمنع استنزاف المعالج (O(1) Lookup)
                const activeImages = new Set(Array.from(document.querySelectorAll('img')).map(el => el.src));
                
                for (const k of this.imgCache) {
                    if (k.startsWith('blob:')) {
                        // التحقق السريع من الـ Set بدلاً من إرهاق الـ DOM
                        if (!activeImages.has(k)) {
                            URL.revokeObjectURL(k);
                            this.imgCache.delete(k);
                            deletedCount++;
                        }
                    } else {
                        this.imgCache.delete(k);
                        deletedCount++;
                    }
                    
                    if (deletedCount >= 50) break;
                }
            }
            this.imgCache.add(key);
        }
        
        if (img.complete && img.naturalHeight > 0) {
            this.revealImg(img);
            return;
        }
        
        if ('decode' in img) {
            img.decode().then(() => this.revealImg(img)).catch(() => this.revealImg(img));
        } else {
            this.revealImg(img);
        }
    },
    
    handleImgError: function(img, type) {
        if (!img) return;
        img.classList.add('img-error-hidden');
        img.alt = '';
        
        const wrapper = img.parentElement;
        if (!wrapper) return;
        
        wrapper.classList.add('shimmer-stop-override');
        
        let fallback = wrapper.querySelector('.fallback-icon-ready');
        if (fallback) {
            fallback.style.display = 'flex';
        } else {
            let iconClass = type === 'cat' ? 'fa-layer-group' : (type === 'pay' ? 'fa-building-columns' : 'fa-box-open');
            let divClass = type === 'pay' ? 'pay-icon-default' : 'default-prod-icon';
            const fallbackDiv = document.createElement('div');
            fallbackDiv.className = `${divClass} fallback-icon-ready`;
            fallbackDiv.innerHTML = `<i class="fa-solid ${Utils.escapeHtml(iconClass)}"></i>`;
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
    _priceCache: new Map(), 
    
    _debounceTimers: {},
    _debounce: function(key, fn, delay = 150) {
        return (...args) => {
            clearTimeout(this._debounceTimers[key]);
            this._debounceTimers[key] = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    _safeClass: function(str) {
        return typeof str === 'string' ? str.replace(/[^a-zA-Z0-9-_%]/g, '') : '';
    },

    _renderHtmlToFragment: function(htmlString) {
        const template = document.createElement('template');
        template.innerHTML = htmlString;
        return template.content; 
    },
    
    _getMappedColor: function(colorStr) {
        const safeColor = typeof colorStr === 'string' ? colorStr : 'badge-blue';
        return this._safeClass(safeColor.replace('theme-ruby', 'badge-red').replace('theme-sunset', 'badge-red').replace('theme-sapphire', 'badge-blue').replace('theme-ocean', 'badge-blue').replace('theme-emerald', 'badge-green').replace('theme-gold', 'badge-gold').replace('theme-amethyst', 'badge-purple').replace('theme-cyber', 'badge-purple').replace('theme-carbon', 'badge-black').replace('theme-obsidian', 'badge-black'));
    },
    
    _getMappedPosition: function(posStr, defaultPos) {
        const safePos = typeof posStr === 'string' ? posStr : defaultPos;
        const posMap = { 'pos-tl': 'top-left', 'pos-tc': 'top-center', 'pos-tr': 'top-right', 'pos-bl': 'bottom-left', 'pos-bc': 'bottom-center', 'pos-br': 'bottom-right' };
        return posMap[safePos] || this._safeClass(safePos);
    },
    
    _applyGridLayout: function(gridElement, settings = {}, overrideCols = null, gridType = 'prods') {
        if (!gridElement) return;
        
        let defaultCols = gridType === 'cats' ? '2' : '3';
        let adminGlobalLayout = gridType === 'cats' ? settings.rootLayout : null;
        const finalCols = String(overrideCols || adminGlobalLayout || defaultCols);
        
        // 🛡️ Layout Shift Guard: تأجيل تعديل المتغير ليتزامن مع الرسم النظيف للـ DOM
        requestAnimationFrame(() => {
            gridElement.style.setProperty('--layout-cols', finalCols); 
        });
    },

    _getImgLoadVars: function(rawUrl) {
        if (!rawUrl) return { imgClass: '', wrapperClass: '', lazyAttrs: '', imgStyle: '', wrapperStyle: '', cacheKey: '' };
        let cacheKey = rawUrl;
        const isCached = window.StoreRenderApp.imgCache.has(cacheKey);
        return {
            cacheKey: cacheKey, imgClass: 'img-loading-state', wrapperClass: '',
            lazyAttrs: isCached ? 'loading="eager" decoding="sync" fetchpriority="high"' : 'loading="lazy" decoding="async"',
            imgStyle: '', wrapperStyle: ''
        };
    },

    _generateImageHTML: function(rawUrl, safeName, type, isHighPriority = false) {
        let defaultIcon = type === 'cat' ? 'fa-layer-group' : (type === 'pay' ? 'fa-building-columns' : 'fa-box-open');
        let defaultClass = type === 'pay' ? 'pay-icon-default' : 'default-prod-icon';
        let extraClass = type === 'story' ? ' story-fallback-icon' : '';

        const fallbackHTML = `<div class="${defaultClass} fallback-icon-ready${extraClass}" style="display: none;"><i class="fa-solid ${Utils.escapeHtml(defaultIcon)}"></i></div>`;

        if (!rawUrl) return { html: fallbackHTML.replace('display: none;', 'display: flex;'), wrapperClass: ' shimmer-stop-override', wrapperStyle: '' };

        const safeUrl = typeof Utils !== 'undefined' && Utils.safeUrl ? Utils.safeUrl(rawUrl) : String(rawUrl).replace(/"/g, '&quot;');
        
        const imgVars = this._getImgLoadVars(rawUrl);
        const priorityAttr = isHighPriority ? 'fetchpriority="high"' : '';
        const imgClass = type === 'pay' ? `pay-icon-img ${imgVars.imgClass}` : imgVars.imgClass;
        
        let imgHTML = `<img src="${safeUrl}" data-key="${imgVars.cacheKey}" class="${imgClass}" ${imgVars.lazyAttrs} alt="${safeName}" ${priorityAttr} data-img-type="${type}" onload="window.StoreRenderApp.onImgLoad(this)" onerror="window.StoreRenderApp.handleImgError(this, '${type}')">`;
        imgHTML += fallbackHTML;
        
        return { html: imgHTML, wrapperClass: imgVars.wrapperClass, wrapperStyle: imgVars.wrapperStyle };
    },

    _generateProductCardHTML: function(p, idx) {
        let pricingInfo = null;
        const activeOffer = DataManager.getActiveOffer(p.id);
        
        try { 
            const tierId = DataManager.user?.tierId || '1';
            const displayCurr = DataManager.selectedCurr || 'USD';
            const offerKey = activeOffer ? activeOffer.id : 'none';
            
            const cacheKey = `${p.id}_${tierId}_${displayCurr}_${offerKey}`;
            
            if (this._priceCache.has(cacheKey)) {
                pricingInfo = this._priceCache.get(cacheKey);
                this._priceCache.delete(cacheKey);
                this._priceCache.set(cacheKey, pricingInfo);
            } else {
                pricingInfo = DataManager.getPricingLocal(p, 1, null, null); 
                this._priceCache.set(cacheKey, pricingInfo);
                
                if (this._priceCache.size > 2000) {
                    const oldestKey = this._priceCache.keys().next().value;
                    this._priceCache.delete(oldestKey);
                }
            }
        } catch(e) { 
            console.error("🚨 Pricing Error:", p.name, e.message); 
        }
        
        if (!pricingInfo) return ''; 
        
        let priceSectionHtml = '', nameExpandedClass = '';
        if (p.hideGridPrice !== true) {
            priceSectionHtml = `<div class="product-price">${pricingInfo.unitText}</div>`;
        } else {
            nameExpandedClass = 'product-name-expanded';
        }
        
        const safeName = Utils.safeText(p.name);
        const imgObj = this._generateImageHTML(p.img, safeName, 'prod');
        
        let visualElementsHtml = '';
        
        if (activeOffer?.visualConfig?.grid) {
            const v = activeOffer.visualConfig.grid;
            const mappedBadgePos = this._getMappedPosition(v.badgePos, 'top-right');
            const mappedTimerPos = this._getMappedPosition(v.timerPos, 'bottom-center');
            const colorClass = this._getMappedColor(v.badgeColor);
            
            if (v.badgeStyle && v.badgeStyle !== 'none') {
                visualElementsHtml += `<div class="offer-badge-base ${this._safeClass(v.badgeStyle)} ${colorClass} ${mappedBadgePos}">${Utils.escapeHtml(v.badgeText)}</div>`;
            }
            if (v.timerStyle && v.timerStyle !== 'none') {
                let timerContent = activeOffer.expiryDate ? `<span class="live-countdown num-en" data-expire="${activeOffer.expiryDate}">--:--:--</span>` : '--:--:--';
                let tIcon = v.timerStyle === 'timer-digital' ? 'fa-stopwatch' : 'fa-clock';
                visualElementsHtml += `<div class="${this._safeClass(v.timerStyle)} ${mappedTimerPos}"><i class="fa-regular ${tIcon}"></i> ${timerContent}</div>`;
            }
        } else if (p.badgeText) {
            visualElementsHtml += `<div class="offer-badge-base prod-badge badge-${this._safeClass(p.badgeColor) || 'blue'}">${Utils.safeText(p.badgeText)}</div>`;
        }
        
        return `<div class="product-card" data-action="open-product" data-id="${p.id}" style="--anim-idx: ${idx}">${UIBuilders.buildProductCardInner(safeName, priceSectionHtml, imgObj, visualElementsHtml, nameExpandedClass)}</div>`;
    },

    _appendLoadMoreButton: function(container, type, uid, totalCount, limitKey) {
        const hasMoreData = DataManager.cursors && DataManager.cursors[type];
        if (totalCount > this.limits[limitKey] || hasMoreData) {
            const loadMoreBtn = document.createElement('div');
            loadMoreBtn.className = 'load-more-container mt-15 mb-15 text-center w-100';
            const originalHtml = `<i class="fa-solid fa-angle-down"></i> عرض المزيد`;
            loadMoreBtn.innerHTML = `<button class="load-more-btn">${originalHtml}</button>`;
            
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
                    
                    let isTimeout = false;
                    const watchdog = setTimeout(() => {
                        isTimeout = true;
                        btn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> فشل الاتصال، حاول مجدداً`;
                        btn.disabled = false; btn.dataset.locked = 'false';
                        setTimeout(() => { if (btn.dataset.locked === 'false') btn.innerHTML = originalHtml; }, 3000);
                    }, 12000); 
                    
                    try {
                        const res = await DataManager.loadMoreHistoricalData(type, uid, 15);
                        
                        if (!btn.isConnected || isTimeout) return;
                        clearTimeout(watchdog);
                        
                        if (res.success && res.data && res.data.length > 0) {
                            const mergedData = [...this._historicalData[type], ...res.data];
                            this._historicalData[type] = mergedData.length > 500 ? mergedData.slice(-500) : mergedData;
                            
                            this.limits[limitKey] += 15;
                            
                            if (type === 'orders') this.renderOrders(true);
                            else if (type === 'deposits') this.renderPayments(true);
                            else if (type === 'wallet') this.renderWallet(true);
                        } else {
                            btn.innerHTML = `لا توجد بيانات أقدم`;
                            setTimeout(() => loadMoreBtn.remove(), 2000);
                        }
                    } catch (err) {
                        if (!btn.isConnected || isTimeout) return;
                        clearTimeout(watchdog);
                        btn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> حدث خطأ، أعد المحاولة`;
                        btn.disabled = false; btn.dataset.locked = 'false';
                        setTimeout(() => { if (btn.dataset.locked === 'false') btn.innerHTML = originalHtml; }, 3000);
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
        
        const layoutConfig = (LiveStoreData.settings?.rootLayout || 'default');
        const currentCatHash = JSON.stringify(rootCats.map(c => c.id + (c.img || ''))) + "_" + layoutConfig;
        const isAlreadyHome = document.body.classList.contains('is-home');
        const isCategoryView = (UIManager.currentCategoryId === null);
        const hasContent = grid && grid.innerHTML.includes('cat-card');
        
        if (!isBackAction && isAlreadyHome && isCategoryView && hasContent) {
            if (this._lastHomeHash === currentCatHash) {
                UIManager.closeSidebar?.();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
        }
        
        this._lastHomeHash = currentCatHash;
        document.body.classList.add('is-home');
        document.body.classList.remove('is-favorites');
        
        if (titleEl) { titleEl.classList.remove('show-correct-title'); titleEl.innerText = 'الأقسام الرئيسية'; }
        
        const performRender = () => {
            UIManager.toggleHeroSection?.(true); 
            UIManager.navHistory = []; 
            UIManager.currentCategoryId = null; 
            UIManager.resetGridScroll?.(); 
            UIManager.resetUI?.(true); 
            UIManager.renderTicker?.();
            
            if (!isBackAction && window.history.replaceState) window.history.replaceState(null, '', ' ');
            
            if (grid) {
                UIManager.setGridMode?.('grid-cats');
                this._applyGridLayout(grid, LiveStoreData.settings || {}, null, 'cats');
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
                const finalCats = LiveStoreData.cats || [];
                if (finalCats.length === 0 && grid) {
                    grid.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-store-slash"></i><h3>المتجر قيد التحديث</h3><p>يرجى العودة بعد قليل.</p></div>`;
                } else if (finalCats.length > 0) {
                    const combinedHtml = finalCats.map(c => {
                        const safeName = Utils.safeText(c.name);
                        const imgObj = this._generateImageHTML(c.img, safeName, 'cat', true);
                        return `<div class="cat-card" data-action="open-category" data-id="${c.id}"><div class="cat-img-box ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">${imgObj.html}</div><div class="cat-name-box"><div class="cat-name">${safeName}</div></div></div>`;
                    }).join('');
                    grid.replaceChildren(this._renderHtmlToFragment(combinedHtml));
                }
            }
            
            UIManager.initSlider?.();
        };
        performRender();
    },

    renderHomeSkeletons: function() {
        const grid = document.getElementById('store-grid');
        if (!grid) return;
        
        UIManager.setGridMode?.('grid-cats');
        this._applyGridLayout(grid, LiveStoreData.settings || {}, null, 'cats');
        
        let skeletonCount = 3;
        try {
            const cachedCount = localStorage.getItem('tc_cats_count');
            if (cachedCount && parseInt(cachedCount) > 0) skeletonCount = parseInt(cachedCount);
        } catch (e) {}
        
        let catSkeletons = '';
        for (let i = 0; i < skeletonCount; i++) {
            catSkeletons += `
                <div class="cat-card skeleton-mode" style="cursor: default; pointer-events: none;">
                    <div class="cat-img-box skeleton-box" style="border: none;"></div>
                    <div class="cat-name-box" style="border: none; background: var(--bg-glass-heavy);">
                        <div class="skeleton-box" style="height: 12px; width: 60%; border-radius: 6px;"></div>
                    </div>
                </div>`;
        }
        
        grid.replaceChildren(this._renderHtmlToFragment(catSkeletons));
    },
    
    renderProductSkeletons: function(containerId, overrideCount = null) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        UIManager.setGridMode?.('grid-prods');

        let activeCols = null;
        if (UIManager.currentCategoryId && LiveStoreData.cats) {
            const cat = LiveStoreData.cats.find(c => String(c.id) === String(UIManager.currentCategoryId));
            if (cat && cat.layout) activeCols = cat.layout;
        }
        this._applyGridLayout(container, LiveStoreData.settings || {}, activeCols, 'prods');
        
        let skeletonsHTML = '';
        for (let i = 0; i < (overrideCount || 8); i++) {
            skeletonsHTML += `<div class="product-skeleton-card skeleton-clean"><div class="prod-img-skeleton skeleton-box"></div><div class="prod-info-skeleton"><div class="product-name skeleton-box skeleton-text-name"></div><div class="product-price skeleton-box skeleton-text-price"></div></div></div>`;
        }
        container.replaceChildren(this._renderHtmlToFragment(skeletonsHTML));
    },

    initTimersEngine: function() {
        if (document.querySelectorAll('.live-countdown').length === 0) {
            if (window.StoreRenderApp.timerInterval) {
                clearInterval(window.StoreRenderApp.timerInterval);
                window.StoreRenderApp.timerInterval = null;
            }
            return; 
        }

        if (window.StoreRenderApp.timerInterval) return;
        
        window.StoreRenderApp.timerInterval = setInterval(() => {
            if (document.hidden) return; 
            requestAnimationFrame(() => {
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
                        if (item.innerText !== "انتهى العرض") item.innerText = "انتهى العرض";
                    } else {
                        const h = Math.floor(diff / (1000 * 60 * 60)), m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)), s = Math.floor((diff % (1000 * 60)) / 1000);
                        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                        if (item.innerText !== timeStr) item.innerText = timeStr; 
                    }
                });
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
                    if (adminShape.includes('%') || adminShape.includes('px')) { 
                        shapeStyle = `border-radius: ${Utils.escapeHtml(adminShape)} !important;`; 
                    } else { 
                        shapeClass = this._safeClass(adminShape.startsWith('shape-') ? adminShape : `shape-${adminShape}`); 
                    }

                    let badgeHtml = '', timerHtml = '', bColorClass = ''; 

                    if (v.grid) {
                        bColorClass = this._getMappedColor(v.grid.badgeColor);
                        if (v.grid.badgeStyle && v.grid.badgeStyle !== 'none') {
                            badgeHtml = `<div class="story-badge ${this._safeClass(v.grid.badgeStyle)} ${bColorClass} ${this._getMappedPosition(v.grid.badgePos, 'bottom-center')}">${Utils.escapeHtml(v.grid.badgeText || '')}</div>`;
                        }
                        if (v.grid.timerStyle && v.grid.timerStyle !== 'none') {
                            const timerContent = offer.expiryDate ? `<span class="live-countdown num-en" data-expire="${offer.expiryDate}">--:--:--</span>` : '--:--:--';
                            const tIcon = ['timer-bc-pill', 'timer-minimal'].includes(v.grid.timerStyle) ? `<i class="fa-regular fa-clock"></i> ` : (v.grid.timerStyle === 'timer-digital' ? `<i class="fa-solid fa-stopwatch"></i> ` : '');
                            timerHtml = `<div class="${this._safeClass(v.grid.timerStyle)} ${this._getMappedPosition(v.grid.timerPos, 'top-center')}">${tIcon}${timerContent}</div>`;
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
        UIManager.toggleHeroSection?.(false);

        const grid = document.getElementById('store-grid');
        
        UIManager.resetGridScroll?.(); 
        UIManager.resetUI?.(true); 
        
        const titleEl = document.getElementById('grid-title');
        
        if(titleEl) { 
            titleEl.innerText = this._getCategoryName(id); 
            titleEl.classList.add('show-correct-title'); 
        }

        const subs = (LiveStoreData.cats || []).filter(c => String(c.parentId) === String(id)).sort((a,b) => (a.order||0)-(b.order||0));
        
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
            backBtn.onclick = (e) => { e.preventDefault(); UIManager._manualGoBack?.(); };
        }

        if(grid) {
            const catCols = (LiveStoreData.cats || []).find(c => String(c.id) === String(id))?.layout || null;
            const gridType = items.length > 0 ? 'prods' : 'cats';
            this._applyGridLayout(grid, LiveStoreData.settings || {}, catCols, gridType);

            let combinedHtml = '';
            if(subs.length > 0) {
                UIManager.setGridMode?.('grid-cats');
                combinedHtml += subs.map(c => {
                    const safeName = Utils.safeText(c.name);
                    const imgObj = this._generateImageHTML(c.img, safeName, 'cat');
                    return `<div class="cat-card" data-action="open-category" data-id="${c.id}"><div class="cat-img-box ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">${imgObj.html}</div><div class="cat-name-box"><div class="cat-name">${safeName}</div></div></div>`;
                }).join('');
            }
            if(items.length > 0) {
                UIManager.setGridMode?.('grid-prods');
                combinedHtml += items.map((p, idx) => this._generateProductCardHTML(p, idx)).join('');
            }
            
            requestAnimationFrame(() => {
                if (renderId !== this.currentRenderId) return; 
                if (combinedHtml) {
                    grid.replaceChildren(this._renderHtmlToFragment(combinedHtml)); 
                    if(items.length > 0 && Components?.initProductShine) Components.initProductShine();
                    this.initTimersEngine();
                } else {
                    grid.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-box-open"></i><h3>لا توجد منتجات</h3></div>`;
                }
            });
        }
    },
    
    searchStoreTerm: function(q) {
        if(!q || !q.trim()) { this.renderHome(); return; }
        const renderId = ++this.currentRenderId;
        
        UIManager.toggleHeroSection?.(false);
        document.body.classList.remove('is-home', 'is-favorites'); 

        const term = q.trim().toLowerCase();
        const cleanTerm = term.replace(/[-_.:,]/g, ' ');
        const searchTerms = cleanTerm.split(/\s+/).filter(t => t.length > 0);

        const matchedCats = (LiveStoreData.cats || []).filter(c => c.name?.toLowerCase().replace(/[-_.:,]/g, ' ').includes(cleanTerm));
        
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
        if (UIManager.currentCategoryId) {
            const currentCat = (LiveStoreData.cats || []).find(c => String(c.id) === String(UIManager.currentCategoryId));
            if (currentCat && currentCat.layout) activeCols = currentCat.layout;
        }
        
        const gridType = matchedProds.length > 0 ? 'prods' : 'cats';
        this._applyGridLayout(grid, LiveStoreData.settings || {}, activeCols, gridType);

        UIManager.resetGridScroll?.(); UIManager.setGridMode?.(null);

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
            UIManager.setGridMode?.(matchedProds.length > 0 ? 'grid-prods' : 'grid-cats');
            if(Components?.initProductShine) Components.initProductShine();
            this.initTimersEngine(); 
        });
    },

    renderFavorites: function() {
        const renderId = ++this.currentRenderId;
        document.body.classList.remove('is-home'); document.body.classList.add('is-favorites'); 
        UIManager.toggleHeroSection?.(false);
        
        const favIds = DataManager.favs ? Array.from(DataManager.favs).map(String) : [];
        const favProds = (LiveStoreData.prods || []).filter(p => favIds.includes(String(p.id)));
        
        const grid = document.getElementById('store-grid');
        if (!grid) return;
        
        UIManager.setGridMode?.(null); UIManager.resetGridScroll?.();
        
        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if (backBtn) {
            backBtn.style.display = 'flex'; setTimeout(() => backBtn.classList.add('show'), 10);
            backBtn.setAttribute('data-action', 'go-back');
            backBtn.onclick = (e) => { e.preventDefault(); UIManager.closeFavorites?.(); };
        }
        
        const gridTitle = document.getElementById('grid-title');
        if (gridTitle) { gridTitle.innerText = 'المفضلة'; gridTitle.classList.add('show-correct-title'); }
        
        if (favProds.length === 0) {
            grid.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-heart-circle-plus"></i><h3>لا توجد منتجات مفضلة بعد</h3></div>`;
            UIManager.setGridMode?.('grid-prods'); return;
        }
        
        const combinedHtml = favProds.map((p, idx) => this._generateProductCardHTML(p, idx)).join('');
        
        requestAnimationFrame(() => {
            if (renderId !== this.currentRenderId) return; 
            grid.replaceChildren(this._renderHtmlToFragment(combinedHtml)); 
            UIManager.setGridMode?.('grid-prods');
            
            let activeCols = null;
            if (favProds.length > 0 && LiveStoreData.cats) {
                const parentCatId = Array.isArray(favProds[0].catId) ? String(favProds[0].catId[0]) : String(favProds[0].catId || favProds[0].categoryId);
                const parentCat = LiveStoreData.cats.find(c => String(c.id) === parentCatId);
                if (parentCat && parentCat.layout) activeCols = parentCat.layout;
            }
            this._applyGridLayout(grid, LiveStoreData.settings || {}, activeCols, 'prods');
            if (Components?.initProductShine) Components.initProductShine();
            this.initTimersEngine(); 
        });
    },

    renderWallet: function(forceRender = false) {
        if (!forceRender) {
            if (!this._walletDebounced) this._walletDebounced = this._debounce('wallet', () => this.renderWallet(true), 250);
            return this._walletDebounced();
        }

        const filterData = Utils.getSearchAndDateFilters('wallet', 'wallet');
        if (filterData.error) { UIManager.showToast?.(filterData.error, 'error'); return; }
        const { q, dStart, dEnd, tStart, tEnd } = filterData;

        const list = document.getElementById('wallet-list'); 
        if(!list) return; 

        const user = DataManager.user || { id: 0, balance: 0, totalSpent: 0, totalDeposit: 0, baseCurrency: 'USD' };
        const walletCurr = (user.baseCurrency || user.base_currency || 'USD').toUpperCase();
        
        const uid = localStorage.getItem(CACHE_KEYS.ACTIVE_UID) || (DataManager.user ? String(DataManager.user.id) : null);
        if (!uid || uid === '0' || uid === 'undefined') {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-wallet"></i><h3>يرجى تسجيل الدخول</h3></div>`; return;
        }

        this._historicalData = this._historicalData || { deposits: [], orders: [] };
        this.limits = this.limits || { payments: 15, wallet: 15, orders: 15 };

        const rawDeposits = [...(LiveStoreData.deposits || []), ...(this._historicalData.deposits || [])];
        const rawOrders = [...(LiveStoreData.orders || []), ...(this._historicalData.orders || [])];
        
        const uniqueDeposits = Array.from(new Map(rawDeposits.map(item => [String(item.id), item])).values());
        const uniqueOrders = Array.from(new Map(rawOrders.map(item => [String(item.id), item])).values());

        const deposits = uniqueDeposits.filter(d => String(d.userId) === String(uid)).map(d => {
            const credited = d.creditedAmount !== undefined ? Number(d.creditedAmount) : Number(d.amount || 0);
            const safeTime = Utils.parseSafeTime(d.time || d.createdAt);
            return {
                ...d, type: 'deposit', amountVal: Math.abs(credited), amountCurrency: d.targetCurrency || walletCurr,
                searchKey: `شحن deposit ${credited} #${d.displayId || d.id} ${RenderHelpers.formatDepositId(d).toLowerCase()}`,
                isDeduction: credited < 0, sortTime: safeTime 
            };
        });
        
        const orders = uniqueOrders.filter(o => String(o.userId) === String(uid)).map(o => {
            const safeTime = Utils.parseSafeTime(o.time || o.createdAt);
            return {
                ...o, type: 'purchase', amountVal: Number(o.price || 0), amountCurrency: o.priceCurrency || walletCurr, 
                searchKey: `شراء purchase ${o.product} ${o.price} #${o.displayId || o.id} ${RenderHelpers.formatOrderId(o).toLowerCase()}`,
                sortTime: safeTime 
            };
        });

        let allTransactions = [...deposits, ...orders];

        allTransactions.sort((a, b) => {
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
        const container = document.getElementById('bal-pay-grid') || document.getElementById('bal-methods-container');
        if (!container) return;
        
        const validPayments = (LiveStoreData.payments || []).filter(p => p?.name?.trim() && p.isActive !== false && p.is_active !== false).sort((a,b) => (a.order || 0) - (b.order || 0));

        if (validPayments.length === 0) {
            if (container.dataset.syncDone === 'true') {
                container.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-building-columns"></i><h3>لا توجد طرق دفع متاحة حالياً</h3></div>`; 
                return;
            }

            if (!container.querySelector('.fa-circle-notch')) {
                container.innerHTML = `
                    <div class="empty-state-v2" style="min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: none; background: transparent;">
                        <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 32px; color: var(--gold-main); margin-bottom: 15px;"></i>
                        <h3 style="color: var(--text-muted); font-size: 14px; font-weight: 600;">جاري تجهيز بوابات الدفع...</h3>
                    </div>`;
            }
            
            if (!container.dataset.fallbackTimer) {
                const timerId = setTimeout(() => {
                    container.dataset.syncDone = 'true';
                    delete container.dataset.fallbackTimer;
                    if (window.RenderManager && window.RenderManager.renderPayMethods) window.RenderManager.renderPayMethods();
                    else if (this.renderPayMethods) this.renderPayMethods();
                }, 3500);
                container.dataset.fallbackTimer = timerId; 
            }
            return;
        }

        if (container.dataset.fallbackTimer) {
            clearTimeout(Number(container.dataset.fallbackTimer));
            delete container.dataset.fallbackTimer;
        }
        
        container.dataset.syncDone = 'true';
        
        let html = '';
        const uid = localStorage.getItem(CACHE_KEYS.ACTIVE_UID) || (window.DataManager?.user ? String(window.DataManager.user.id) : null);
        const pendingMethodKeys = (LiveStoreData.deposits || []).filter(d => String(d.userId) === String(uid) && d.status === 'pending').map(d => String(d.methodId || d.method).toLowerCase());

        validPayments.forEach(p => {
            try {
                const safeName = Utils.escapeHtml(p.name);
                const isLocked = pendingMethodKeys.includes(String(p.id).toLowerCase()) || pendingMethodKeys.includes(String(p.name).toLowerCase());
                
                let imgHtml = '';
                if (this._generateImageHTML) {
                    const imgObj = this._generateImageHTML(p.img, safeName, 'pay');
                    imgHtml = `<div class="pay-icon-wrapper ${imgObj.wrapperClass}">${imgObj.html}</div>`;
                } else {
                    imgHtml = `<div class="pay-icon-wrapper"><img src="${p.img || ''}" alt="${safeName}"></div>`;
                }

                if (isLocked) {
                    html += `<div class="pay-card-select method-locked" onclick="window.UIManager?.showToast('لديك طلب إيداع قيد المعالجة بهذه الطريقة.', 'warning')">${imgHtml}<div class="pay-card-content"><h3 class="pay-card-name">${safeName}</h3><span class="method-locked-warning"><i class="fa-solid fa-hourglass-half"></i> طلب قيد المعالجة</span></div><i class="fa-solid fa-lock pay-card-arrow"></i></div>`;
                } else {
                    html += `<div class="pay-card-select clickable" data-action="select-pay" data-id="${p.id}">${imgHtml}<div class="pay-card-content"><h3 class="pay-card-name">${safeName}</h3></div><i class="fa-solid fa-chevron-left pay-card-arrow"></i></div>`;
                }
            } catch(e) {}
        });
        
        container.innerHTML = html;
    },

    renderPayments: function(forceRender = false) {
        if (!forceRender) {
            if (!this._payDebounced) this._payDebounced = this._debounce('pay', () => this.renderPayments(true), 250);
            return this._payDebounced();
        }

        const list = document.getElementById('mypay-list');
        if(!list) return;
        
        const filterData = Utils.getSearchAndDateFilters('pay', 'pay');
        if (filterData.error) { UIManager.showToast?.(filterData.error, 'error'); return; }
        const { q, dStart, dEnd, tStart, tEnd } = filterData;

        const uid = localStorage.getItem(CACHE_KEYS.ACTIVE_UID) || (DataManager.user ? String(DataManager.user.uid || DataManager.user.id) : null);
        if (!uid || uid === '0' || uid === 'undefined') {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-file-invoice-dollar"></i><h3>يرجى تسجيل الدخول</h3></div>`; return;
        }

        const user = DataManager.user || { id: 0 };
        const baseCurrency = (user.baseCurrency || 'USD').toUpperCase();
        
        this._historicalData = this._historicalData || { deposits: [], orders: [] };
        this.limits = this.limits || { payments: 15, wallet: 15, orders: 15 };

        const rawDeposits = [...(LiveStoreData.deposits || []), ...(this._historicalData.deposits || [])];
        const uniqueDeposits = Array.from(new Map(rawDeposits.map(item => [String(item.id), item])).values());
        
        let myDeposits = uniqueDeposits.filter(d => String(d.userId) === String(uid)).map(d => ({ ...d, sortTime: Utils.parseSafeTime(d.time || d.createdAt) }));

        const filters = DataManager.filters || { payments: 'all' };
        if (filters.payments !== 'all') myDeposits = myDeposits.filter(d => filters.payments === 'rejected' ? ['rejected', 'refunded', 'returned'].includes(d.status) : d.status === filters.payments);

        if (q) myDeposits = myDeposits.filter(d => String(d.id).toLowerCase().includes(q) || (d.displayId && String(d.displayId).toLowerCase().includes(q)) || RenderHelpers.formatDepositId(d).toLowerCase().includes(q) || (d.method && d.method.toLowerCase().includes(q)));
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

        const userDisplayName = Utils.escapeHtml(user.username ? `@${user.username}` : (user.fullName || 'العميل'));
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
        if (filterData.error) { UIManager.showToast?.(filterData.error, 'error'); return; }
        const { q, dStart, dEnd, tStart, tEnd } = filterData;
        
        const list = document.getElementById('orders-list'); 
        if (!list) return; 
        
        const uid = localStorage.getItem(CACHE_KEYS.ACTIVE_UID) || (DataManager.user ? String(DataManager.user.id) : null);
        if (!uid || uid === '0' || uid === 'undefined') {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-box-open"></i><h3>يرجى تسجيل الدخول</h3></div>`; return;
        }

        this._historicalData = this._historicalData || { deposits: [], orders: [] };
        this.limits = this.limits || { payments: 15, wallet: 15, orders: 15 };

        const rawOrders = [...(LiveStoreData.orders || []), ...(this._historicalData.orders || [])];
        const uniqueOrders = Array.from(new Map(rawOrders.map(item => [String(item.id), item])).values());

        let orders = uniqueOrders.filter(o => String(o.userId) === String(uid)).map(o => ({ ...o, sortTime: Utils.parseSafeTime(o.time || o.createdAt) }));

        const filters = DataManager.filters || { orders: 'all' };
        if (filters.orders !== 'all') orders = orders.filter(o => o.status === filters.orders);
        
        if (q) orders = orders.filter(o => String(o.id).toLowerCase().includes(q) || (o.displayId && String(o.displayId).toLowerCase().includes(q)) || RenderHelpers.formatOrderId(o).toLowerCase().includes(q) || (o.product && o.product.toLowerCase().includes(q)));
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

    generateReceiptImage: async function(config) {
        return new Promise(async (resolve) => {
            const containerId = 'receipt-render-box-' + Date.now();
            let isResolved = false;
            
            const cleanup = () => {
                const orphanedContainer = document.getElementById(containerId);
                if (orphanedContainer) {
                    try { orphanedContainer.remove(); } catch(e){}
                }
            };

            const watchdog = setTimeout(() => {
                if(isResolved) return;
                console.error("🚨 انقضى وقت تحضير الإيصال (Timeout). السيرفر أو المتصفح لا يستجيب.");
                // 🛡️ تدمير الإطار الداخلي لإجبار html2canvas على التوقف وعدم استنزاف البطارية
                const orphanedContainer = document.getElementById(containerId);
                if (orphanedContainer) {
                    orphanedContainer.innerHTML = ''; // تدمير المحتوى
                }
                cleanup();
                resolve(false); 
            }, 10000); 

            try {
                const settings = LiveStoreData.settings || {};
                const storeName = settings.storeName || 'TeleCard';
                const storeLogo = settings.storeLogoLight || settings.storeLogo || '';
                
                let safeLogoHtml = storeLogo ? `<img src="${Utils.escapeHtml(storeLogo)}" style="max-height: 55px; max-width: 160px; object-fit: contain;" crossorigin="anonymous">` : '';
                const brandHTML = { html: `<div class="header-section"><div class="store-name">${Utils.escapeHtml(storeName)}</div>${safeLogoHtml}</div>` };
                
                const fullHTML = UIBuilders.buildPDFReceipt(config, brandHTML.html);
                
                const container = document.createElement('div');
                container.id = containerId;
                container.className = 'receipt-render-container'; 
                container.innerHTML = fullHTML;
                
                document.body.appendChild(container);

                window.getComputedStyle(container).fontFamily;

                if (document.fonts && document.fonts.ready) {
                    await document.fonts.ready;
                }
                
                await new Promise(res => requestAnimationFrame(res));

                if (typeof html2canvas === 'undefined') throw new Error("مكتبة html2canvas مفقودة!");
                
                let canvas;
                try {
                    // 🛡️ المحاولة الأولى: التصدير المثالي (مع اللوجو)
                    canvas = await html2canvas(container, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        logging: false, 
                        allowTaint: false, // يجب أن يكون false للتصدير الناجح 
                        windowWidth: 420 
                    });
                } catch (canvasErr) {
    console.warn("⚠️ [Receipt Engine] CORS Image Issue Detected. Retrying with fallback...");
    // 🛡️ CORS Fallback: إخفاء الصور مع الحفاظ على الأبعاد لمنع تشوه تصميم الإيصال
    const imgs = container.querySelectorAll('img');
    imgs.forEach(img => img.style.visibility = 'hidden');
    
    canvas = await html2canvas(container, {
        scale: 2,
        useCORS: false,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 420
    });
}                
                const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));
                
                canvas.width = 0; canvas.height = 0;
                
                const safeFileName = config.filename || 'receipt.jpg';
                const title = `إيصال - ${storeName}`;
                
                await Utils.smartShareOrDownload(blob, safeFileName, title, 'مرفق تفاصيل العملية الخاصة بك.');
                
                isResolved = true;
                clearTimeout(watchdog); 
                resolve(true);

            } catch (err) { 
                console.error("🚨 Receipt Image Generation Error:", err);
                isResolved = true;
                clearTimeout(watchdog); 
                resolve(false); 
            } finally {
                cleanup(); 
            }
        });
    },

    exportReceipt: async function(orderId, btnElement = null) {
        if (btnElement && btnElement.disabled) return; 
        
        const o = (LiveStoreData.orders || []).find(x => String(x.id) === String(orderId));
        if (!o) return;
        
        let originalHtml = '';
        if (btnElement) { 
            btnElement.disabled = true; 
            originalHtml = btnElement.innerHTML; 
            btnElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحضير...`; 
        }
        
        try {
            const finalPrice = Number(o.pricingSnapshot?.finalPrice || o.price || 0);
            const originalPrice = Number(o.pricingSnapshot?.originalPrice || o.price || 0);
            const rawUserName = typeof UIManager !== 'undefined' && UIManager._getFullName ? UIManager._getFullName(DataManager.user) : (DataManager.user?.fullName || 'العميل');


            const success = await this.generateReceiptImage({
                type: 'order', 
                filename: `Order_${RenderHelpers.formatOrderId(o)}.jpg`,
                data: {
                    id: o.id, displayId: RenderHelpers.formatOrderId(o),
                    userName: Utils.escapeHtml(rawUserName), 
                    userDisplayId: RenderHelpers.formatUserId(DataManager.user),
                    status: o.status, product: o.product, 
                    price: finalPrice, originalPrice: originalPrice, priceCurrency: o.priceCurrency || 'USD', 
                    qty: o.qty || 1, 
                    input: Utils.escapeHtml(o.input || '---'),
                    dateTime: RenderHelpers.formatSafeDate(Utils.parseSafeTime(o.time || o.createdAt)), code: (o.status === 'completed' && o.deliveredCode !== 'null') ? o.deliveredCode : null
                }
            });
            
            if (!success) UIManager.showToast?.('تعذر تصدير الإيصال، يرجى المحاولة لاحقاً', 'error');
        } finally {
            if (btnElement) { 
                btnElement.disabled = false; 
                btnElement.innerHTML = originalHtml; 
            }
        }
    },
    
    exportPaymentReceipt: async function(depositId, btnElement = null) {
        if (btnElement && btnElement.disabled) return; 

        const d = (LiveStoreData.deposits || []).find(x => String(x.id) === String(depositId));
        if (!d) return;
        
        let originalHtml = '';
        if (btnElement) { 
            btnElement.disabled = true; 
            originalHtml = btnElement.innerHTML; 
            btnElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحضير...`; 
        }
        
        try {
            const rawAmt = Number(d.amount || 0);
            const credAmt = d.creditedAmount !== undefined ? Number(d.creditedAmount) : rawAmt;
            const calcFee = Math.abs(rawAmt - credAmt);
            const isBonus = credAmt > rawAmt;
            const rawUserName = typeof UIManager !== 'undefined' && UIManager._getFullName ? UIManager._getFullName(DataManager.user) : (DataManager.user?.fullName || 'العميل');


            const success = await this.generateReceiptImage({
                type: 'deposit', 
                filename: `Deposit_${RenderHelpers.formatDepositId(d)}.jpg`,
                data: {
                    id: d.id, displayId: RenderHelpers.formatDepositId(d),
                    userName: Utils.escapeHtml(rawUserName), 
                    userDisplayId: RenderHelpers.formatUserId(DataManager.user),
                    method: d.method || '---', amount: rawAmt, currency: d.currency || 'USD',
                    feePercent: d.feesPercent || 0, feeVal: calcFee, feeType: isBonus ? 'bonus' : 'fee', 
                    netVal: credAmt, targetCurrency: d.targetCurrency || 'USD',
                    dateTime: RenderHelpers.formatSafeDate(Utils.parseSafeTime(d.time || d.createdAt))
                }
            });
            
            if (!success) UIManager.showToast?.('تعذر تصدير الإيصال، يرجى المحاولة لاحقاً', 'error');
        } finally {
            if (btnElement) { 
                btnElement.disabled = false; 
                btnElement.innerHTML = originalHtml; 
            }
        }
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
        
        const serverLastReadTime = DataManager.user?.lastReadAlertTime ? Utils.parseSafeTime(DataManager.user.lastReadAlertTime) : 0;
        let readIds = [];
        
        if (DataManager.user && Array.isArray(DataManager.user.readAlerts)) {
            readIds = DataManager.user.readAlerts.map(String);
        } else {
            try { readIds = JSON.parse(localStorage.getItem(DB_KEYS.NOTIF_READ_LIST) || "[]").map(String); } catch (e) {}
        }
        
        allAlerts.sort((a, b) => {
            const timeDiff = Utils.parseSafeTime(b.createdAt || b.time) - Utils.parseSafeTime(a.createdAt || a.time);
            return timeDiff !== 0 ? timeDiff : String(b.id || '').localeCompare(String(a.id || ''));
        });
        
        const unreadCount = allAlerts.filter(a => !readIds.includes(String(a.id)) && !a.isRead && Utils.parseSafeTime(a.createdAt || a.time) > serverLastReadTime).length;
        if (window.UIManager?.updateNotifBadges) window.UIManager.updateNotifBadges(unreadCount);
        
        let html = unreadCount > 0 ? `<div class="nc-top-action-bar"><span class="nc-unread-count-text">لديك <span class="nc-unread-count-num">${unreadCount}</span> جديد</span><button class="btn btn-ghost nc-mark-read-btn" data-action="mark-all-read">تحديد الكل كمقروء</button></div>` : '';
        
        html += allAlerts.slice(0, 30).map(alert => {
            try {
                const isRead = readIds.includes(String(alert.id)) || alert.isRead || Utils.parseSafeTime(alert.createdAt || alert.time) <= serverLastReadTime;
                return `<div class="nc-item ${isRead ? 'is-read' : 'unread'}" data-action="mark-single-read" data-id="${alert.id}"><div class="nc-icon"><i class="fa-solid ${(alert.jumpTarget === 'order') ? 'fa-box-open' : (Utils.escapeHtml(alert.icon) || 'fa-bullhorn')}"></i></div><div class="nc-content"><div class="nc-header"><h4 class="nc-title">${Utils.escapeHtml(alert.title || 'إشعار جديد')}</h4><span class="nc-time">${RenderHelpers.formatSafeDate(alert.createdAt || alert.time).split(' | ')[0]}</span></div><p class="nc-msg">${Utils.escapeHtml(alert.message || '')}</p></div>${!isRead ? '<div class="unread-indicator-dot"></div>' : ''}</div>`;
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
            try {
                return UIBuilders.buildCountryItem(c);
            } catch (e) { return ''; }
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
