// ============================================================================
// 🖥️ محرك الرسم وبناء الواجهات (renderManager.js) - النسخة الماسية (Pro V5.1)
// 🎯 الوظيفة: رسم الأقسام، المنتجات، المحفظة، المدفوعات، الطلبات، والـ PDF
// 👑 متوافق بالكامل مع هوية: TeleCard
// 🚀 التحديثات الهندسية (V5.1):
// 1. [Error Boundaries]: حماية الحلقات التكرارية لمنع انهيار القوائم (White Screen).
// 2. [CDN Fallbacks]: خوادم بديلة لمكتبات الـ PDF لضمان عمل الفواتير بنسبة 100%.
// 3. [Timer Cleanup]: تدمير المؤقتات التلقائي لمنع تسرب الذاكرة (Memory Leaks).
// 4. [Smooth Rendering]: استخدام requestAnimationFrame لرسم ناعم متوافق مع إيماءات الهواتف.
// ============================================================================

import { DB_KEYS } from './config.js';
import { Utils } from './utils.js';
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js';
import { Components } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';

// ============================================================================
// 🛡️ المساعدات العامة للنافذة وإدارة الذاكرة (Global Namespace) 
// ============================================================================
window.StoreRenderApp = window.StoreRenderApp || {
    imgCache: new Set(),
    timerInterval: null, // 🛡️ [UPDATE]: متغير لحفظ معرّف المؤقت للتحكم فيه

    revealImg: function(img) {
        if (!img) return;
        img.style.transform = 'translateZ(0)'; 
        img.style.visibility = 'visible';
        img.classList.add('img-loaded');
        img.style.transition = 'opacity 0.25s ease-out';
        img.style.opacity = '1';
        
        if (img.parentElement) {
            img.parentElement.style.transform = 'translateZ(0)'; 
            img.parentElement.classList.add('shimmer-stop');
            img.parentElement.style.animation = 'none';
            img.parentElement.style.transition = 'background-color 0.25s ease-out';
            img.parentElement.style.backgroundColor = 'transparent';
        }
    },

    onImgLoad: function(img) {
        if (!img) return;
        const key = img.getAttribute('data-key');
        if (key) {
            if (this.imgCache.has(key)) {
                this.imgCache.delete(key);
            } else if (this.imgCache.size > 500) {
                const oldestItem = this.imgCache.values().next().value;
                this.imgCache.delete(oldestItem);
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
        img.style.display = 'none';
        const wrapper = img.parentElement;
        if (!wrapper) return;
        
        let iconClass = 'fa-box-open';
        let divClass = 'default-prod-icon';
        
        if (type === 'cat') { iconClass = 'fa-layer-group'; }
        else if (type === 'pay') { iconClass = 'fa-building-columns'; divClass = 'pay-icon-default'; }
        
        wrapper.innerHTML = `<div class="${divClass}"><i class="fa-solid ${iconClass}"></i></div>`;
    }
};

// 🛡️ [UPDATE]: دالة ذكية لتحميل المكتبات مع روابط احتياطية (CDN Fallback)
const _loadExternalScriptWithFallback = async (srcArray) => {
    for (let src of srcArray) {
        if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
        try {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.crossOrigin = 'anonymous'; 
                script.onload = () => resolve();
                script.onerror = () => reject();
                document.head.appendChild(script);
            });
            return Promise.resolve(); // نجح التحميل
        } catch (e) {
            console.warn(`[TeleCard] Failed to load from ${src}, trying fallback...`);
        }
    }
    return Promise.reject(new Error("All script sources failed to load."));
};

export const RenderManager = {
    highlightId: null,
    limits: { wallet: 15, orders: 15, payments: 15 },
    
    _debounceTimers: {},
    _debounce: function(key, fn, delay = 150) {
        return (...args) => {
            clearTimeout(this._debounceTimers[key]);
            this._debounceTimers[key] = setTimeout(() => fn.apply(this, args), delay);
        };
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
            if (cols) {
                gridElement.style.setProperty('--layout-cols', cols);
                localStorage.setItem('store_layout_cols', cols);
            } else {
                gridElement.style.removeProperty('--layout-cols');
            }
        } else {
            gridElement.style.removeProperty('--layout-cols');
            localStorage.removeItem('store_layout_cols');
        }
    },

    _getImgLoadVars: function(rawUrl) {
        if (!rawUrl) return { imgClass: '', wrapperClass: '', lazyAttrs: '', imgStyle: '', wrapperStyle: '', onload: '', cacheKey: '' };
        
        let cacheKey = rawUrl;
        const isCached = window.StoreRenderApp.imgCache.has(cacheKey);
        
        return {
            cacheKey: cacheKey,
            imgClass: '', 
            wrapperClass: '',
            lazyAttrs: isCached ? 'loading="eager" decoding="sync" fetchpriority="high"' : 'loading="lazy" decoding="async"',
            imgStyle: 'opacity: 0 !important; visibility: hidden !important;', 
            wrapperStyle: '', 
            onload: `window.StoreRenderApp.onImgLoad(this)` 
        };
    },

    _generateImageHTML: function(rawUrl, safeName, type, isHighPriority = false) {
        let wrapperClass = '';
        let wrapperStyle = '';
        let imgHTML = '';

        let defaultIcon = 'fa-box-open';
        let defaultClass = 'default-prod-icon';
        let extraStyle = '';

        if (type === 'cat') defaultIcon = 'fa-layer-group';
        else if (type === 'pay') { defaultIcon = 'fa-building-columns'; defaultClass = 'pay-icon-default'; }
        else if (type === 'story') extraStyle = 'width: 100%; height: 100%;';

        const fallbackHTML = `<div class="${defaultClass}" style="${type === 'story' ? 'display: flex; ' + extraStyle : ''}"><i class="fa-solid ${defaultIcon}"></i></div>`;

        if (rawUrl) {
            const safeUrl = Utils.escapeHtml(rawUrl);
            const imgVars = this._getImgLoadVars(rawUrl);
            wrapperClass = imgVars.wrapperClass;
            wrapperStyle = imgVars.wrapperStyle;
            const onloadAttr = imgVars.onload ? `onload="${imgVars.onload}"` : '';
            const priorityAttr = isHighPriority ? 'fetchpriority="high"' : '';
            const imgClass = type === 'pay' ? `pay-icon-img ${imgVars.imgClass}` : imgVars.imgClass;

            imgHTML = `<img src="${safeUrl}" data-key="${imgVars.cacheKey}" class="${imgClass}" style="${imgVars.imgStyle}" ${imgVars.lazyAttrs} alt="${safeName}" ${priorityAttr} ${onloadAttr} onerror="window.StoreRenderApp.handleImgError(this, '${type}')">`;
            
            if (type !== 'cat') {
                imgHTML += `<div class="${defaultClass}" style="display: none; ${extraStyle}"><i class="fa-solid ${defaultIcon}"></i></div>`;
            }
        } else {
            imgHTML = fallbackHTML;
        }

        return { html: imgHTML, wrapperClass, wrapperStyle };
    },

    renderHome: function(isBackAction = false) {
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
        
        if (titleEl) {
            titleEl.classList.remove('show-correct-title');
            titleEl.innerText = 'الأقسام الرئيسية';
        }
        
        const performRender = () => {
            if (typeof UIManager !== 'undefined') {
                UIManager.toggleHeroSection(true);
                UIManager.navHistory = [];
                UIManager.currentCategoryId = null;
                UIManager.resetGridScroll();
                UIManager.resetUI();
                UIManager.renderTicker();
            }
            
            if (!isBackAction && window.history.replaceState) {
                window.history.replaceState(null, '', ' ');
            }
            
            const settings = LiveStoreData.settings || {};
            const isSyncDone = LiveStoreData.isInitialSyncDone || false;
            
            if (grid) {
                grid.innerHTML = '';
                if (typeof UIManager !== 'undefined' && UIManager.setGridMode) UIManager.setGridMode('grid-cats');
                this._applyGridLayout(grid, settings, null);
            }
            
            const backBtn = document.getElementById('header-back-btn') || document.querySelector('.modern-back-btn') || document.getElementById('smart-back-btn');
            if (backBtn) {
                backBtn.classList.remove('show');
                backBtn.style.display = 'none';
            }
            
            if (rootCats.length > 0) {
                const fragment = document.createDocumentFragment();
                rootCats.forEach(c => {
                    try {
                        const safeName = Utils.safeText(c.name);
                        const imgObj = this._generateImageHTML(c.img, safeName, 'cat', true);
                        const div = document.createElement('div');
                        div.className = 'cat-card';
                        div.setAttribute('data-action', 'open-category');
                        div.setAttribute('data-id', c.id);
                        div.innerHTML = `<div class="cat-img-box ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">${imgObj.html}</div><div class="cat-name-box"><div class="cat-name">${safeName}</div></div>`;
                        fragment.appendChild(div);
                    } catch(e) { console.warn("[TeleCard] Skip bad category data", e); }
                });
                
                // 🛡️ [UPDATE]: الرسم السلس لحماية الواجهة من التقطيع
                requestAnimationFrame(() => {
                    if (grid) grid.appendChild(fragment);
                });
            }
            else if (!isSyncDone) {
                if (typeof this.renderHomeSkeletons === 'function') this.renderHomeSkeletons();
            }
            else {
                setTimeout(() => {
                    const finalCats = LiveStoreData.cats || [];
                    if (finalCats.length === 0 && grid) {
                        grid.innerHTML = `
                                <div class="empty-state-v2">
                                    <i class="fa-solid fa-store-slash"></i>
                                    <h3>المتجر قيد التحديث</h3>
                                    <p>نحن نقوم بإضافة أقسام ومنتجات جديدة حالياً في TeleCard، يرجى العودة بعد قليل.</p>
                                </div>`;
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
            const settings = (LiveStoreData && LiveStoreData.settings) ? LiveStoreData.settings : {};
            this._applyGridLayout(grid, settings, null);

            let count = 6; 
            let catSkeletons = '';
            for (let i = 0; i < count; i++) { 
                catSkeletons += `
                    <div class="cat-skeleton-card">
                        <div class="cat-img-skeleton skeleton-box"></div>
                        <div class="cat-name-skeleton skeleton-box"></div>
                    </div>`;
            }
            grid.innerHTML = catSkeletons;
        }

        const sliderContainer = document.getElementById('slider');
        if (sliderContainer && sliderContainer.innerHTML.trim() === '') {
            sliderContainer.innerHTML = `<div class="slider-skeleton skeleton-box"></div>`;
        }
    },
  
    renderProductSkeletons: function(containerId, overrideCount = null) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (typeof UIManager !== 'undefined' && UIManager.setGridMode) UIManager.setGridMode('grid-prods');

        const settings = (LiveStoreData && LiveStoreData.settings) ? LiveStoreData.settings : {};
        let activeCols = null;

        if (typeof UIManager !== 'undefined' && UIManager.currentCategoryId && LiveStoreData.cats) {
            const cat = LiveStoreData.cats.find(c => Number(c.id) === Number(UIManager.currentCategoryId));
            if (cat && cat.layout) activeCols = cat.layout;
        }
        this._applyGridLayout(container, settings, activeCols);
        
        let count = overrideCount || 8;
        container.innerHTML = '';
        let skeletonsHTML = '';
        
        for (let i = 0; i < count; i++) {
            skeletonsHTML += `
                <div class="product-skeleton-card skeleton-clean">
                    <div class="prod-img-skeleton skeleton-box"></div>
                    <div class="prod-info-skeleton">
                        <div class="product-name skeleton-box skeleton-text-name"></div>
                        <div class="product-price skeleton-box skeleton-text-price"></div>
                    </div>
                </div>`;
        }
        container.innerHTML = skeletonsHTML;
    },

    _createProductCard: function(p, idx) {
        const rates = DataManager.getRates();
        const displayCurrency = DataManager.selectedCurr || 'USD';

        let pricing = { unitUsd: 0, oldPriceUsd: null, originalTotalUsd: 0 };
        try { pricing = DataManager.calculateFinalPrice(p, DataManager.user, 1, null, null); } catch(e){ console.error("Pricing Error:", e); }

        let priceSectionHtml = '';
        let nameExpandedStyle = '';
        
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
                let timerContent = '--:--:--';
                if (activeOffer.expiryDate) timerContent = `<span class="live-countdown num-en" data-expire="${activeOffer.expiryDate}">--:--:--</span>`;
                let tIcon = v.timerStyle === 'timer-digital' ? 'fa-stopwatch' : 'fa-clock';
                visualElementsHtml += `<div class="${v.timerStyle} ${mappedTimerPos}"><i class="fa-regular ${tIcon}"></i> ${timerContent}</div>`;
            }
        } 
        else if (p.badgeText) { 
            visualElementsHtml += `<div class="offer-badge-base prod-badge badge-${p.badgeColor || 'blue'}">${Utils.safeText(p.badgeText)}</div>`;
        }

        const div = document.createElement('div'); 
        div.className = 'product-card'; 
        div.setAttribute('data-action', 'open-product');
        div.setAttribute('data-id', p.id);
        if (idx !== undefined) div.style.setProperty('--anim-idx', idx);
        
        div.innerHTML = `
            <svg class="snake-border" viewBox="0 0 120 165" preserveAspectRatio="none"><rect x="0.7" y="0.7" width="118.6" height="163.6"></rect></svg>
            <div class="card-image ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">
                ${visualElementsHtml} 
                ${imgObj.html}
            </div>
            <div class="card-info">
                <div class="product-name" style="${nameExpandedStyle}">${safeName}</div>
                ${priceSectionHtml}
            </div>`;

        return div;
    },

    // 🛡️ [UPDATE]: إدارة دورة حياة المؤقتات لمنع Memory Leaks
    updateStoreTimers: function() {
        const timers = document.querySelectorAll('.live-countdown');
        if (timers.length === 0) return;
        const now = (typeof DataManager !== 'undefined' && typeof DataManager.getNow === 'function') ? DataManager.getNow() : Date.now();
        
        timers.forEach(el => {
            try {
                const expire = Number(el.dataset.expire);
                if (!expire) return;
                const diff = expire - now;
                if (diff <= 0) { el.innerText = "انتهى العرض"; return; }
                const h = Math.floor(diff / (1000 * 60 * 60));
                const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((diff % (1000 * 60)) / 1000);
                el.innerText = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            } catch(e) {}
        });
    },

    initTimersEngine: function() {
        if (window.StoreRenderApp.timerInterval) {
            clearInterval(window.StoreRenderApp.timerInterval);
        }
        window.StoreRenderApp.timerInterval = setInterval(() => {
            const timers = document.querySelectorAll('.live-countdown');
            if (timers.length > 0) {
                this.updateStoreTimers();
            } else {
                clearInterval(window.StoreRenderApp.timerInterval);
                window.StoreRenderApp.timerInterval = null;
            }
        }, 1000);
    },

    renderOfferStories: function(categoryId) {
        const storiesContainer = document.getElementById('offer-stories-bar');
        if (!storiesContainer) return;

        const now = (typeof DataManager !== 'undefined' && typeof DataManager.getNow === 'function') ? DataManager.getNow() : Date.now();
        const activeOffers = (LiveStoreData.offers || []).filter(o => o.isActive && o.visualConfig?.storyEnabled && (!o.expiryDate || o.expiryDate > now));

        if (activeOffers.length === 0) {
            storiesContainer.innerHTML = ''; storiesContainer.style.display = 'none'; return;
        }

        let storiesHtml = '';
        activeOffers.forEach(offer => {
            try {
                const v = offer.visualConfig;
                const storyProdsArray = v.storyProducts?.length > 0 ? v.storyProducts : (offer.targetProds || []);
                const targetedProds = (LiveStoreData.prods || []).filter(p => String(p.catId) === String(categoryId) && storyProdsArray.includes(String(p.id)));

                targetedProds.forEach(prod => {
                    let shapeClass = ''; let shapeStyle = '';
                    const adminShape = v.storyShape || 'shape-circle';
                    if (adminShape.includes('%') || adminShape.includes('px')) { shapeStyle = `border-radius: ${adminShape} !important;`; } 
                    else { shapeClass = adminShape.startsWith('shape-') ? adminShape : `shape-${adminShape}`; }

                    let badgeHtml = ''; let timerHtml = ''; let bColorClass = ''; 

                    if (v.grid) {
                        bColorClass = this._getMappedColor(v.grid.badgeColor);
                        if (v.grid.badgeStyle && v.grid.badgeStyle !== 'none') {
                            const mappedBadgePos = this._getMappedPosition(v.grid.badgePos, 'bottom-center');
                            badgeHtml = `<div class="story-badge ${v.grid.badgeStyle} ${bColorClass} ${mappedBadgePos}">${Utils.escapeHtml(v.grid.badgeText || '')}</div>`;
                        }
                        if (v.grid.timerStyle && v.grid.timerStyle !== 'none') {
                            const mappedTimerPos = this._getMappedPosition(v.grid.timerPos, 'top-center');
                            let timerContent = '--:--:--';
                            if (offer.expiryDate) timerContent = `<span class="live-countdown num-en" data-expire="${offer.expiryDate}">--:--:--</span>`;
                            let tIcon = ['timer-bc-pill', 'timer-minimal'].includes(v.grid.timerStyle) ? `<i class="fa-regular fa-clock"></i> ` : (v.grid.timerStyle === 'timer-digital' ? `<i class="fa-solid fa-stopwatch"></i> ` : '');
                            timerHtml = `<div class="${v.grid.timerStyle} ${mappedTimerPos}">${tIcon}${timerContent}</div>`;
                        }
                    }

                    const imgObj = this._generateImageHTML(prod.img, Utils.escapeHtml(prod.name), 'story');

                    storiesHtml += `
                    <div class="story-item clickable" data-action="open-product" data-id="${prod.id}">
                        <div class="story-ring ${shapeClass} ${bColorClass}" style="${shapeStyle}">
                            <div class="story-img-wrapper ${shapeClass} ${imgObj.wrapperClass}" style="${shapeStyle} ${imgObj.wrapperStyle}">
                                ${imgObj.html}
                            </div>
                            ${badgeHtml}
                            ${timerHtml}
                        </div>
                        <span class="story-title">${Utils.escapeHtml(prod.name)}</span>
                    </div>`;
                });
            } catch (e) { console.warn("[TeleCard] Story render error:", e); }
        });

        if (storiesHtml) {
            storiesContainer.innerHTML = `<div class="stories-wrapper-scroll">${storiesHtml}</div>`;
            storiesContainer.style.display = 'block';
            this.initTimersEngine(); // 🛡️ [UPDATE]: تفعيل محرك المؤقتات الآمن
        } else {
            storiesContainer.style.display = 'none';
        }
    },
    
    _getCategoryName: function(id) {
        try {
            const target = (LiveStoreData.cats || []).find(c => String(c.id) === String(id));
            return target ? target.name : 'القسم';
        } catch(e) { return 'القسم'; }
    },
    
    _renderContent: function(id) {
        UIManager.currentCategoryId = id;
        document.body.classList.remove('is-home');
        document.body.classList.remove('is-favorites'); 
        UIManager.toggleHeroSection(false);

        const grid = document.getElementById('store-grid');
        if (grid) grid.innerHTML = '';
        UIManager.resetGridScroll();
        UIManager.resetUI();

        const cats = LiveStoreData.cats || [];
        const prods = LiveStoreData.prods || [];
        const settings = LiveStoreData.settings || {}; 
        
        const titleEl = document.getElementById('grid-title');
        if(titleEl) {
            titleEl.innerText = this._getCategoryName(id);
            titleEl.classList.add('show-correct-title'); 
        }

        const subs = cats.filter(c => String(c.parentId) === String(id)).sort((a,b) => (a.order||0)-(b.order||0));
        const items = prods.filter(p => String(p.catId) === String(id)).sort((a,b) => (a.order||0)-(b.order||0));

        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if(backBtn) {
            backBtn.style.display = 'flex'; 
            setTimeout(() => backBtn.classList.add('show'), 10);
            backBtn.setAttribute('data-action', 'go-back');
            backBtn.onclick = (e) => { e.preventDefault(); UIManager._manualGoBack(); };
        }

        if(grid) {
            const currentCat = cats.find(c => String(c.id) === String(id));
            const catCols = currentCat?.layout || null;
            this._applyGridLayout(grid, settings, catCols);

            const fragment = document.createDocumentFragment();

            if(subs.length > 0) {
                UIManager.setGridMode('grid-cats');
                subs.forEach(c => {
                    try {
                        const safeName = Utils.safeText(c.name);
                        const imgObj = this._generateImageHTML(c.img, safeName, 'cat');
                        
                        const div = document.createElement('div'); div.className = 'cat-card';
                        div.innerHTML = `<div class="cat-img-box ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">${imgObj.html}</div><div class="cat-name-box"><div class="cat-name">${safeName}</div></div>`;
                        div.setAttribute('data-action', 'open-category');
                        div.setAttribute('data-id', c.id);
                        fragment.appendChild(div);
                    } catch(e) {}
                });
            }
            if(items.length > 0) {
                UIManager.setGridMode('grid-prods');
                items.forEach((p, idx) => {
                    try { fragment.appendChild(this._createProductCard(p, idx)); } catch(e){}
                });
            }
            
            requestAnimationFrame(() => {
                grid.appendChild(fragment);
                if(items.length > 0 && Components?.initProductShine) Components.initProductShine();
                if(subs.length === 0 && items.length === 0) grid.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-box-open"></i><h3>لا توجد منتجات</h3></div>`;
            });
        }
    },

    searchStoreTerm: function(q) {
        if(!q || !q.trim()) { this.renderHome(); return; }
        UIManager.toggleHeroSection(false);
        document.body.classList.remove('is-home');
        document.body.classList.remove('is-favorites'); 

        const term = q.trim().toLowerCase();
        const cats = LiveStoreData.cats || [];
        const prods = LiveStoreData.prods || [];
        const settings = LiveStoreData.settings || {};

        const matchedCats = cats.filter(c => c.name?.toLowerCase().includes(term));
        const searchTerms = term.split(' ').filter(t => t.length > 0);
        const matchedProds = prods.filter(p => p.name && searchTerms.every(word => p.name.toLowerCase().includes(word)));

        const grid = document.getElementById('store-grid'); 
        if(!grid) return;
        grid.innerHTML = ''; 
        
        let activeCols = null;
        if (typeof UIManager !== 'undefined' && UIManager.currentCategoryId) {
            const currentCat = (LiveStoreData.cats || []).find(c => String(c.id) === String(UIManager.currentCategoryId));
            if (currentCat && currentCat.layout) activeCols = currentCat.layout;
        }
        this._applyGridLayout(grid, settings, activeCols);

        UIManager.resetGridScroll();
        UIManager.setGridMode(null);

        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if(backBtn) {
            backBtn.style.display = 'flex'; 
            setTimeout(() => backBtn.classList.add('show'), 10);
            backBtn.setAttribute('data-action', 'go-back');
            backBtn.onclick = () => { 
                const inp = document.getElementById('store-search-input');
                if(inp) inp.value = ''; 
                this.renderHome(true); 
            };
        }

        const titleEl = document.getElementById('grid-title');
        if(titleEl) titleEl.innerText = 'نتائج البحث';

        if (matchedCats.length === 0 && matchedProds.length === 0) {
            grid.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-magnifying-glass"></i><h3>لا توجد نتائج</h3></div>`; return;
        }

        const fragment = document.createDocumentFragment();

        matchedCats.forEach(c => {
            try {
                const safeName = Utils.safeText(c.name);
                const imgObj = this._generateImageHTML(c.img, safeName, 'cat');
                
                const div = document.createElement('div'); div.className = 'cat-card';
                div.innerHTML = `<div class="cat-img-box ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">${imgObj.html}</div><div class="cat-name-box"><div class="cat-name">${safeName}</div></div>`;
                div.setAttribute('data-action', 'open-category');
                div.setAttribute('data-id', c.id);
                fragment.appendChild(div);
            } catch(e){}
        });

        matchedProds.forEach((p, idx) => {
            try { fragment.appendChild(this._createProductCard(p, idx)); } catch(e){}
        });
        
        requestAnimationFrame(() => {
            grid.appendChild(fragment);
            UIManager.setGridMode(matchedProds.length > 0 ? 'grid-prods' : 'grid-cats');
            if(Components?.initProductShine) Components.initProductShine();
        });
    },

    renderFavorites: function() {
        document.body.classList.remove('is-home');
        document.body.classList.add('is-favorites'); 
        UIManager.toggleHeroSection(false);
        
        const favIds = DataManager.favs ? Array.from(DataManager.favs).map(String) : [];
        const prods = LiveStoreData.prods || [];
        const settings = LiveStoreData.settings || {};
        const favProds = prods.filter(p => favIds.includes(String(p.id)));
        
        const grid = document.getElementById('store-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        UIManager.setGridMode(null);
        UIManager.resetGridScroll();
        
        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if (backBtn) {
            backBtn.style.display = 'flex';
            setTimeout(() => backBtn.classList.add('show'), 10);
            backBtn.setAttribute('data-action', 'go-back');
            backBtn.onclick = (e) => { e.preventDefault(); UIManager.closeFavorites(); };
        }
        
        const gridTitle = document.getElementById('grid-title');
        if (gridTitle) { gridTitle.innerText = 'المفضلة'; gridTitle.classList.add('show-correct-title'); }
        
        if (favProds.length === 0) {
            grid.innerHTML = `
                <div class="empty-state-v2">
                    <i class="fa-solid fa-heart-circle-plus"></i>
                    <h3>لا توجد منتجات مفضلة بعد</h3>
                    <p>أضف المنتجات للمفضلة عبر الضغط على أيقونة القلب داخل نافذة الشراء، أو بالنقر مرتين على صورة المنتج.</p>
                </div>`;
            UIManager.setGridMode('grid-prods');
            return;
        }
        
        const fragment = document.createDocumentFragment();
        favProds.forEach((p, idx) => {
            try { fragment.appendChild(this._createProductCard(p, idx)); } catch(e){}
        });
        
        requestAnimationFrame(() => {
            grid.appendChild(fragment);
            UIManager.setGridMode('grid-prods');
            
            let activeCols = null;
            if (favProds.length > 0 && LiveStoreData.cats) {
                const parentCat = LiveStoreData.cats.find(c => String(c.id) === String(favProds[0].catId));
                if (parentCat && parentCat.layout) activeCols = parentCat.layout;
            }
            this._applyGridLayout(grid, settings, activeCols);
            if (Components?.initProductShine) Components.initProductShine();
        });
    },

    updateModalFavButton: function() {
        const btn = document.getElementById('pm-fav-btn');
        if(!btn || !DataManager.currentProd) return;
        const isFav = DataManager.isFavorite?.(DataManager.currentProd.id) ?? false;
        btn.classList.toggle('active', isFav);
        btn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
        const icon = btn.querySelector('i');
        if (icon) icon.className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
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
        
        const deps = LiveStoreData.deposits || [];
        const ords = LiveStoreData.orders || [];

        const deposits = deps.filter(d => String(d.userId) === String(uid)).map(d => {
            const credited = d.creditedAmount !== undefined ? Number(d.creditedAmount) : Number(d.amount || 0);
            const formattedDepId = RenderHelpers.formatDepositId(d).toLowerCase();
            return {
                ...d, type: 'deposit', amountVal: Math.abs(credited),
                amountCurrency: d.targetCurrency || walletCurr,
                searchKey: `شحن deposit ${credited} #${d.displayId || d.id} ${formattedDepId}`,
                isDeduction: credited < 0, sortTime: RenderHelpers.parseUnifiedTime(d) 
            };
        });
        
        const orders = ords.filter(o => String(o.userId) === String(uid)).map(o => {
            const formattedOrdId = RenderHelpers.formatOrderId(o).toLowerCase();
            return {
                ...o, type: 'purchase', amountVal: Number(o.price || 0), 
                amountCurrency: o.priceCurrency || walletCurr, 
                searchKey: `شراء purchase ${o.product} ${o.price} #${o.displayId || o.id} ${formattedOrdId}`,
                sortTime: RenderHelpers.parseUnifiedTime(o) 
            };
        });

        let allTransactions = [...deposits, ...orders];
        
        const spentDisp = document.getElementById('wallet-total-spent');
        if(spentDisp) spentDisp.innerHTML = RenderHelpers.formatMoney(user.totalSpent || 0, walletCurr);
        const depDisp = document.getElementById('wallet-total-deposit');
        if(depDisp) depDisp.innerHTML = RenderHelpers.formatMoney(user.totalDeposit || 0, walletCurr);

        allTransactions.sort((a, b) => b.sortTime - a.sortTime);

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

        if (visibleWallet.length === 0) {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-wallet"></i><h3>لا توجد حركات</h3></div>`; return;
        }

        let generatedHTML = '';
        visibleWallet.forEach(tx => {
            try { // 🛡️ [UPDATE]: Error Boundary
                const isDep = tx.type === 'deposit';
                let amountPrefix = '', amountClass = '', cardClass = '', iconName = '', iconColorClass = '';
                let formattedDate = RenderHelpers.formatSafeDate(tx.time || tx.createdAt);

                if (isDep) {
                    if (tx.status === 'approved') {
                        amountPrefix = tx.isDeduction ? '-' : '+';
                        amountClass = tx.isDeduction ? 'amt-out' : 'amt-in';
                        cardClass = tx.isDeduction ? 'out' : 'in';
                        iconName = tx.isDeduction ? 'fa-arrow-up-long' : 'fa-arrow-down-long';
                        iconColorClass = tx.isDeduction ? 'icon-out' : 'icon-green'; 
                    } else {
                        amountClass = 'amt-neutral'; cardClass = 'neutral';
                        if (tx.status === 'pending') { iconName = 'fa-clock'; iconColorClass = 'icon-gold'; } 
                        else if (tx.status === 'rejected') { iconName = 'fa-circle-xmark'; iconColorClass = 'icon-red'; }
                        else if (['refunded', 'returned'].includes(tx.status)) { iconName = 'fa-rotate-left'; iconColorClass = 'icon-cyan'; }
                    }
                } else {
                    if (['rejected', 'refunded', 'returned'].includes(tx.status)) {
                        amountClass = 'amt-neutral'; cardClass = 'neutral';
                        iconName = ['refunded', 'returned'].includes(tx.status) ? 'fa-rotate-left' : 'fa-circle-xmark';
                        iconColorClass = ['refunded', 'returned'].includes(tx.status) ? 'icon-cyan' : 'icon-red';
                    } else if (tx.status === 'pending') {
                        amountPrefix = '-'; amountClass = 'amt-neutral'; cardClass = 'neutral'; iconName = 'fa-clock'; iconColorClass = 'icon-gold';
                    } else {
                        amountPrefix = '-'; amountClass = 'amt-out'; cardClass = 'out'; iconName = 'fa-arrow-up-long'; iconColorClass = 'icon-out'; 
                    }
                }
                
                const jumpType = isDep ? 'deposit' : 'purchase';
                const shortTxId = isDep ? RenderHelpers.formatDepositId(tx) : RenderHelpers.formatOrderId(tx);

                let runningBalanceHtml = '';
                if (!isFilterActive && tx.balanceAfter !== undefined && tx.balanceAfter !== null) {
                    runningBalanceHtml = `<div class="th-balance-after">${RenderHelpers.formatMoney(tx.balanceAfter, walletCurr)}</div>`;
                }

                const safeTxName = Utils.escapeHtml(isDep ? (tx.method || 'إيداع رصيد') : (tx.product || 'طلب شراء'));

                generatedHTML += `
                <div class="th-card ${cardClass} clickable-tx-card" data-action="jump-transaction" data-id="${tx.id}" data-type="${jumpType}" title="انقر لعرض التفاصيل">
                    <div class="th-icon ${iconColorClass}"><i class="fa-solid ${iconName}"></i></div>
                    <div class="th-body">
                        <div class="th-details-col">
                            <div class="th-row-top"><span class="tx-name-text">${safeTxName}</span></div>
                            <div class="th-row-bottom"><span class="th-date num-en">${formattedDate}</span></div>
                        </div>
                        <div class="th-amount-col">
                            <span class="th-order num-en is-copyable" data-action="copy-text" data-text="${shortTxId}" title="اضغط لنسخ رقم العملية"><i class="fa-regular fa-copy" style="margin-right:4px; font-size:10px; opacity:0.7;"></i> ${shortTxId}</span>
                            <div class="th-amount ${amountClass}">${amountPrefix}${RenderHelpers.formatMoney(tx.amountVal, tx.amountCurrency)}</div>
                            ${runningBalanceHtml} 
                        </div>
                    </div>
                </div>`;
            } catch (e) { console.warn("[TeleCard] Tx render error ignored", e); }
        }); 

        requestAnimationFrame(() => {
            list.innerHTML = generatedHTML;

            const hasMoreData = DataManager.cursors && (DataManager.cursors.orders || DataManager.cursors.deposits);

            if (!q && !dStart && !dEnd && (totalWalletCount > this.limits.wallet || hasMoreData)) {
                const loadMoreBtn = document.createElement('div');
                loadMoreBtn.className = 'load-more-container mt-15 mb-15 text-center w-100';
                loadMoreBtn.innerHTML = `<button class="load-more-btn"><i class="fa-solid fa-angle-down"></i> عرض المزيد</button>`;
                
                loadMoreBtn.querySelector('button').onclick = async () => {
                    const btn = loadMoreBtn.querySelector('button');
                    if (totalWalletCount > this.limits.wallet) {
                        this.limits.wallet += 15; 
                        this.renderWallet(true); 
                        return;
                    }
                    
                    if (hasMoreData) {
                        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحميل...`;
                        btn.disabled = true;
                        const fetchPromises = [];
                        if (DataManager.cursors.deposits) fetchPromises.push(StoreDB.fetchMoreWithCursor(DB_KEYS.DEPOSITS, ['userId', '==', String(uid)], 'time', DataManager.cursors.deposits, 15).then(res => ({ type: 'dep', res })));
                        if (DataManager.cursors.orders) fetchPromises.push(StoreDB.fetchMoreWithCursor(DB_KEYS.ORDERS, ['userId', '==', String(uid)], 'time', DataManager.cursors.orders, 15).then(res => ({ type: 'ord', res })));

                        const results = await Promise.all(fetchPromises);
                        let addedSomething = false;

                        results.forEach(result => {
                            if (result.res.data && result.res.data.length > 0) {
                                addedSomething = true;
                                const normData = result.res.data.map(item => ({...item, time: RenderHelpers.parseTime(item.time), createdAt: RenderHelpers.parseTime(item.createdAt)}));
                                if (result.type === 'dep') {
                                    const existing = new Set(LiveStoreData.deposits.map(d => String(d.id)));
                                    LiveStoreData.deposits = [...LiveStoreData.deposits, ...normData.filter(d => !existing.has(String(d.id)))];
                                    DataManager.cursors.deposits = result.res.newLastDoc;
                                } else {
                                    const existing = new Set(LiveStoreData.orders.map(o => String(o.id)));
                                    LiveStoreData.orders = [...LiveStoreData.orders, ...normData.filter(o => !existing.has(String(o.id)))];
                                    DataManager.cursors.orders = result.res.newLastDoc;
                                }
                            } else {
                                if (result.type === 'dep') DataManager.cursors.deposits = null;
                                if (result.type === 'ord') DataManager.cursors.orders = null;
                            }
                        });

                        if (addedSomething) { this.limits.wallet += 15; this.renderWallet(true); } 
                        else { btn.innerHTML = `لا توجد حركات أقدم`; setTimeout(() => loadMoreBtn.remove(), 2000); }
                    }
                };
                list.appendChild(loadMoreBtn);
            }
        });
    },

    renderPayMethods: function() {
        const container = document.getElementById('bal-pay-grid') || document.getElementById('bal-methods-container') || document.querySelector('.bal-methods-grid') || document.getElementById('pay-methods-list');
        if (!container) return;
        container.innerHTML = '';
        
        const payments = LiveStoreData.payments || [];
        const validPayments = payments.filter(p => p?.name?.trim() && p.isActive !== false && p.is_active !== false);

        if (validPayments.length === 0) {
            container.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-building-columns"></i><h3>لا توجد طرق دفع متاحة</h3><p>نعمل على توفير طرق دفع قريباً في TeleCard.</p></div>`;
            return;
        }

        const uid = localStorage.getItem('telecard_active_user_uid') || (DataManager.user ? String(DataManager.user.id) : null);
        const pendingMethodKeys = (LiveStoreData.deposits || [])
            .filter(d => String(d.userId) === String(uid) && d.status === 'pending')
            .map(d => String(d.methodId || d.method).toLowerCase());

        const fragment = document.createDocumentFragment();

        validPayments.sort((a,b) => (a.order || 0) - (b.order || 0)).forEach(p => {
            try {
                const safeName = Utils.escapeHtml(p.name);
                const isLocked = pendingMethodKeys.includes(String(p.id).toLowerCase()) || pendingMethodKeys.includes(String(p.name).toLowerCase());
                
                const imgObj = this._generateImageHTML(p.img, safeName, 'pay');

                const card = document.createElement('div');
                if (isLocked) {
                    card.className = 'pay-card-select method-locked';
                    card.style.opacity = '0.65';
                    card.innerHTML = `
                        <div class="pay-icon-wrapper ${imgObj.wrapperClass}" style="filter: grayscale(100%); ${imgObj.wrapperStyle}">${imgObj.html}</div>
                        <div class="pay-card-content">
                            <h3 class="pay-card-name" style="color: var(--text-muted);">${safeName}</h3>
                            <span style="display:block; font-size:11px; color:var(--warning); margin-top:4px;"><i class="fa-solid fa-hourglass-half"></i> طلب قيد المعالجة</span>
                        </div><i class="fa-solid fa-lock pay-card-arrow" style="color: var(--text-muted);"></i>`;
                    card.onclick = () => { if (window.UIManager && window.UIManager.showToast) window.UIManager.showToast('لديك طلب إيداع قيد المعالجة بهذه الطريقة، يرجى الانتظار.', 'warning'); };
                } else {
                    card.className = 'pay-card-select clickable';
                    card.setAttribute('data-action', 'select-pay');
                    card.setAttribute('data-id', p.id);
                    card.innerHTML = `<div class="pay-icon-wrapper ${imgObj.wrapperClass}" style="${imgObj.wrapperStyle}">${imgObj.html}</div><div class="pay-card-content"><h3 class="pay-card-name">${safeName}</h3></div><i class="fa-solid fa-chevron-left pay-card-arrow"></i>`;
                }
                fragment.appendChild(card);
            } catch(e) {}
        });
        
        requestAnimationFrame(() => container.appendChild(fragment));
    },

    renderPayments: function(forceRender = false) {
        if (!forceRender) {
            if (!this._payDebounced) this._payDebounced = this._debounce('pay', () => this.renderPayments(true), 250);
            return this._payDebounced();
        }

        const list = document.getElementById('mypay-list');
        if(!list) return;
        
        if (!list.hasAttribute('data-receipt-listener')) {
            list.addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-receipt-export');
                if (btn) {
                    e.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    if (typeof ClientSystem !== 'undefined' && ClientSystem.exportPaymentReceipt) {
                        ClientSystem.exportPaymentReceipt(id, btn); 
                    }
                }
            });
            list.setAttribute('data-receipt-listener', 'true');
        }
        
        const filterData = Utils.getSearchAndDateFilters('pay', 'pay');
        if (filterData.error) { UIManager.showToast(filterData.error, 'error'); return; }
        const { q, dStart, dEnd, tStart, tEnd } = filterData;

        const uid = localStorage.getItem('telecard_active_user_uid') || (DataManager.user ? String(DataManager.user.uid || DataManager.user.id) : null);
        if (!uid || uid === '0' || uid === 'undefined') {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-file-invoice-dollar"></i><h3>يرجى تسجيل الدخول</h3></div>`; return;
        }

        const user = DataManager.user || { id: 0 };
        const baseCurrency = (user.baseCurrency || 'USD').toUpperCase();
        
        let myDeposits = (LiveStoreData.deposits || [])
            .filter(d => String(d.userId) === String(uid))
            .map(d => ({ ...d, sortTime: RenderHelpers.parseUnifiedTime(d) }));

        const filters = DataManager.filters || { payments: 'all' };
        if (filters.payments !== 'all') {
            myDeposits = myDeposits.filter(d => filters.payments === 'rejected' ? ['rejected', 'refunded', 'returned'].includes(d.status) : d.status === filters.payments);
        }

        if (q) myDeposits = myDeposits.filter(d => 
            RenderHelpers.formatDepositId(d).toLowerCase().includes(q) || 
            (d.method && d.method.toLowerCase().includes(q))
        );
        
        if (tStart) myDeposits = myDeposits.filter(d => d.sortTime >= tStart);
        if (tEnd) myDeposits = myDeposits.filter(d => d.sortTime <= tEnd);

        myDeposits.sort((a, b) => b.sortTime - a.sortTime);
        const totalPaymentsCount = myDeposits.length;
        const displayLimit = (!q && !dStart && !dEnd) ? this.limits.payments : Math.min(myDeposits.length, 50);
        const visibleDeposits = myDeposits.slice(0, displayLimit);

        if (visibleDeposits.length === 0) { 
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-file-invoice-dollar"></i><h3>لا توجد عمليات</h3></div>`; 
            return; 
        }

        let htmlBuffer = '';
        const userDisplayName = Utils.escapeHtml(user.username ? `@${user.username}` : (user.name || 'العميل'));
        const userIdString = RenderHelpers.formatUserId(user);

        visibleDeposits.forEach(d => {
            try { // 🛡️ [UPDATE]: Error Boundary
                const isDeduction = (d.creditedAmount !== undefined && Number(d.creditedAmount) < 0) || (d.method && String(d.method).includes('خصم'));
                
                let stClass = 'st-pending', stText = 'قيد المراجعة', icon = 'fa-clock';
                if (['approved', 'completed'].includes(d.status)) { 
                    if (isDeduction) { stClass = 'st-rejected'; stText = 'مخصوم'; icon = 'fa-arrow-up-long'; } 
                    else { stClass = 'st-approved'; stText = 'مقبول'; icon = 'fa-check'; }
                } else if (d.status === 'rejected') { stClass = 'st-rejected'; stText = 'مرفوض'; icon = 'fa-xmark'; } 
                else if (['refunded', 'returned'].includes(d.status)) { stClass = 'st-refunded'; stText = 'مسترجع'; icon = 'fa-rotate-left'; }

                const currency = (d.currency || 'USD').toUpperCase();
                const rawAmount = Math.abs(parseFloat(d.amount) || 0); 
                const displayNetAmount = d.creditedAmount !== undefined ? Math.abs(parseFloat(d.creditedAmount)) : rawAmount;
                const feeVal = parseFloat(d.fees || d.fee || 0); 
                
                let feeLabel = 'الرسوم الإضافية';
                let feeValueHtml = '<span class="text-muted">لا يوجد</span>';
                if (feeVal > 0) {
                    const isBonus = (d.feeType === 'bonus');
                    feeLabel = isBonus ? 'بونص إضافي' : 'العمولة';
                    const feeColor = isBonus ? 'text-success' : 'text-danger';
                    const feeSign = isBonus ? '+' : '-';
                    feeValueHtml = `<span class="${feeColor}" dir="ltr">${feeSign} ${RenderHelpers.formatMoney(feeVal, currency)}</span>`;
                }
                
                const formattedDate = RenderHelpers.formatSafeDate(d.time || d.createdAt);
                const shortDepositId = RenderHelpers.formatDepositId(d);
                const amountColorClass = isDeduction ? 'text-danger' : (stClass === 'st-approved' ? 'text-success' : '');
                const amountPrefix = isDeduction ? '-' : (stClass === 'st-approved' ? '+' : '');

                htmlBuffer += `
                    <div class="pay-history-card ${stClass}">
                        <div class="ph-header" data-action="toggle-accordion">
                            <div class="ph-right-sec">
                                <div class="ph-icon-box"><i class="fa-solid ${icon} ph-icon"></i></div>
                                <div class="ph-info-text">
                                    <span class="ph-method-name">${Utils.escapeHtml(d.method || 'شحن رصيد')}</span>
                                    <span class="ph-date-mini num-en">${formattedDate.replace('|', '<span class="date-sep">|</span>')}</span>
                                </div>
                            </div>
                            <div class="ph-center-zone">
                                <span class="ph-amount-header num-en ${amountColorClass}">${amountPrefix} ${RenderHelpers.formatMoney(rawAmount, currency)}</span>
                                <span class="ph-status-mini">${stText}</span>
                            </div>
                            <div class="ph-left-sec"><div class="ph-arrow-btn"><i class="fa-solid fa-chevron-down"></i></div></div>
                        </div>
                        <div class="ph-details-body">
                            <div class="ph-sep-line"></div>
                            <div class="ph-data-list">
                                <div class="ph-item">
                                    <div class="ph-item-label"><i class="fa-solid fa-hashtag"></i> رقم العملية</div>
                                    <div class="ph-item-val num-en ph-id is-copyable" data-action="copy-text" data-text="${shortDepositId}">${shortDepositId}</div>
                                </div>
                                <div class="ph-item">
                                    <div class="ph-item-label"><i class="fa-solid fa-user"></i> اسم المرسل</div>
                                    <div class="ph-item-val">${userDisplayName}</div>
                                </div>
                                <div class="ph-item">
                                    <div class="ph-item-label"><i class="fa-solid fa-id-card"></i> معرّف العميل</div>
                                    <div class="uid-capsule is-copyable" data-action="copy-text" data-text="${userIdString}"><span class="num-en">${userIdString}</span></div>
                                </div>
                                <div class="ph-item">
                                    <div class="ph-item-label"><i class="fa-solid fa-tags"></i> ${feeLabel}</div>
                                    <div class="ph-item-val num-en">${feeValueHtml}</div>
                                </div>
                                <div class="ph-item item-highlight">
                                    <div class="ph-item-label"><i class="fa-solid fa-wallet"></i> الرصيد المضاف</div>
                                    <div class="ph-item-val num-en ${amountColorClass}">${RenderHelpers.formatMoney(displayNetAmount, (d.targetCurrency || baseCurrency).toUpperCase())}</div>
                                </div>
                                <div class="ph-item">
                                    <div class="ph-item-label"><i class="fa-solid fa-clock"></i> التاريخ والوقت</div>
                                    <div class="ph-item-val num-en">${formattedDate}</div>
                                </div>
                            </div>
                            ${d.adminNote ? `
                                <div class="ph-admin-note ${d.status === 'rejected' ? 'note-rejected' : 'note-approved'}">
                                    <i class="fa-solid fa-headset"></i>
                                    <div class="ph-admin-note-content">
                                        <span class="ph-admin-note-title">رسالة الإدارة:</span>
                                        <div class="admin-reply-text">${Utils.escapeHtml(d.adminNote)}</div>
                                    </div>
                                </div>` : ''}
                            <div class="ph-footer-action">
                                <button class="btn-receipt-export" data-action="export-receipt" data-id="${d.id}">
                                    <i class="fa-solid fa-file-export"></i> تصدير الإيصال
                                </button>
                            </div>
                        </div>
                    </div>`;
            } catch(e) { console.warn("[TeleCard] Skip invalid payment rendering", e); }
        });

        requestAnimationFrame(() => {
            list.innerHTML = htmlBuffer;

            if (!q && !dStart && !dEnd && (totalPaymentsCount > this.limits.payments || (DataManager.cursors && DataManager.cursors.deposits))) {
                const loadMoreContainer = document.createElement('div');
                loadMoreContainer.className = 'text-center mt-15 mb-15';
                loadMoreContainer.innerHTML = `<button class="load-more-btn"><i class="fa-solid fa-angle-down"></i> عرض المزيد</button>`;
                loadMoreContainer.onclick = () => {
                    this.limits.payments += 15;
                    this.renderPayments(true);
                };
                list.appendChild(loadMoreContainer);
            }
        });
    },

    renderOrders: function(forceRender = false) {
        if (!forceRender) {
            if (!this._ordersDebounced) this._ordersDebounced = this._debounce('orders', () => this.renderOrders(true), 250);
            return this._ordersDebounced();
        }

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

        let orders = (LiveStoreData.orders || []).filter(o => String(o.userId) === String(uid)).map(o => ({ ...o, sortTime: RenderHelpers.parseUnifiedTime(o) }));

        const filters = DataManager.filters || { orders: 'all' };
        if (filters.orders !== 'all') orders = orders.filter(o => o.status === filters.orders);
        
        if (q) orders = orders.filter(o => o.id.toString().includes(q) || (o.displayId && o.displayId.toLowerCase().includes(q)) || RenderHelpers.formatOrderId(o).toLowerCase().includes(q) || o.product?.toLowerCase().includes(q));
        if (tStart) orders = orders.filter(o => o.sortTime >= tStart);
        if (tEnd) orders = orders.filter(o => o.sortTime <= tEnd);

        orders.sort((a, b) => b.sortTime - a.sortTime);
        const totalOrdersCount = orders.length;
        const displayLimit = (!q && !dStart && !dEnd) ? this.limits.orders : Math.min(orders.length, 50);
        const visibleOrders = orders.slice(0, displayLimit);

        if (visibleOrders.length === 0) { list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-box-open"></i><h3>لا توجد طلبات</h3></div>`; return; }
      
        list.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        const getCleanInputRows = (str) => {
            if (!str || str === '---' || typeof str === 'object') return [];
            const rawStr = String(str);
            if (rawStr.includes('|')) return rawStr.split('|').map(s => s.split(':').pop().trim());
            if (rawStr.includes(':')) return [rawStr.split(':').pop().trim()];
            return [rawStr.trim()];
        };
        
        visibleOrders.forEach((o, idx) => {
            try { // 🛡️ [UPDATE]: Error Boundary
                const status = o.status || 'pending'; 
                const statusClass = status === 'completed' ? 'completed' : (status === 'rejected' ? 'rejected' : (['returned', 'refunded'].includes(status) ? 'returned' : (status === 'processing' ? 'processing' : 'pending')));
                const productName = Utils.escapeHtml(o.product || (LiveStoreData.prods || []).find(p => String(p.id) === String(o.prodId))?.name || 'منتج');
                
                const displayCurr = (o.priceCurrency || 'USD').toUpperCase();
                const qty = parseFloat(o.qty) || 1; 
                const qtyHtml = qty > 1 ? `<span class="oh-qty-badge num-en">x${qty}</span>` : '';
                const inputRows = getCleanInputRows(o.input);
                
                let statusLabel = '<i class="fa-regular fa-clock"></i> قيد التنفيذ';
                if (status === 'completed') statusLabel = '<i class="fa-solid fa-circle-check"></i> مكتمل';
                else if (status === 'processing') statusLabel = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التنفيذ';
                else if (status === 'rejected') statusLabel = '<i class="fa-solid fa-circle-xmark"></i> مرفوض';
                else if (['returned', 'refunded'].includes(status)) statusLabel = '<i class="fa-solid fa-rotate-left"></i> مسترجع';
                
                const totalDiscLocal = Number(o.couponDiscount || 0) + Number(o.saleDiscount || 0);
                let discountBadgeHtml = '';
                if (totalDiscLocal > 0) {
                    const isCombo = (Number(o.couponDiscount || 0) > 0 && Number(o.saleDiscount || 0) > 0);
                    const isCoupon = Number(o.couponDiscount || 0) > 0;
                    discountBadgeHtml = `<div class="oh-discount-badge ${isCombo ? 'badge-combo' : (isCoupon ? 'badge-coupon' : 'badge-sale')}"><i class="fa-solid ${isCombo ? 'fa-gift' : (isCoupon ? 'fa-ticket' : 'fa-tag')}"></i> <span>${isCombo ? 'توفير مضاعف' : (isCoupon ? 'كوبون' : 'تخفيض')}</span><span class="num-en">(-${RenderHelpers.formatMoney(totalDiscLocal, displayCurr)})</span></div>`;
                }

                const cardElement = document.createElement('div');
                cardElement.className = `oh-card ${(this.highlightId && String(o.id) === String(this.highlightId)) ? 'jump-highlight' : ''}`.trim();
                cardElement.style.setProperty('--anim-idx', idx);
                cardElement.setAttribute('data-action', 'open-detail');
                cardElement.setAttribute('data-type', 'order');
                cardElement.setAttribute('data-id', o.id);

                cardElement.innerHTML = `
                    <div class="oh-right">
                        ${discountBadgeHtml} 
                        <div class="oh-title">${productName}</div> 
                        <div class="oh-inputs-stack">${inputRows.map(row => `<div class="oh-input-line num-en">${Utils.escapeHtml(row)}</div>`).join('')}</div>
                        <div class="oh-date-time num-en">${RenderHelpers.formatSafeDate(o.time || o.createdAt)}</div>
                    </div>
                    <div class="oh-left">
                        <div class="oh-status-box"><span class="oh-status ${statusClass}">${statusLabel}</span></div>
                        <div class="oh-price-box" dir="ltr"><div class="oh-amount">${RenderHelpers.formatMoney(Number(o.price || 0), displayCurr)}</div>${qtyHtml}</div>
                        <div class="oh-order-box" dir="ltr"><span class="oh-order-number num-en">${RenderHelpers.formatOrderId(o)}</span></div>
                    </div>`;
                fragment.appendChild(cardElement);
            } catch (e) { console.warn("[TeleCard] Skip corrupted order UI", e); }
        }); 
        
        requestAnimationFrame(() => {
            const hasMoreServerOrders = DataManager.cursors && DataManager.cursors.orders;
            if (!q && !dStart && !dEnd && (totalOrdersCount > this.limits.orders || hasMoreServerOrders)) {
                const loadMoreBtn = document.createElement('div');
                loadMoreBtn.className = 'load-more-container mt-15 mb-15 text-center w-100';
                loadMoreBtn.innerHTML = `<button class="load-more-btn"><i class="fa-solid fa-angle-down"></i> عرض المزيد</button>`;
                loadMoreBtn.querySelector('button').onclick = async () => {
                    const btn = loadMoreBtn.querySelector('button');
                    if (totalOrdersCount > this.limits.orders) { this.limits.orders += 15; this.renderOrders(true); return; }
                    if (hasMoreServerOrders) {
                        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحميل...`; btn.disabled = true;
                        const res = await StoreDB.fetchMoreWithCursor(DB_KEYS.ORDERS, ['userId', '==', String(uid)], 'time', DataManager.cursors.orders, 15);
                        if (res.data && res.data.length > 0) {
                            const newOrders = res.data.map(item => ({ ...item, time: RenderHelpers.parseTime(item.time), createdAt: RenderHelpers.parseTime(item.createdAt) }));
                            const existingOrdIds = new Set(LiveStoreData.orders.map(o => String(o.id)));
                            LiveStoreData.orders = [...LiveStoreData.orders, ...newOrders.filter(o => !existingOrdIds.has(String(o.id)))];
                            DataManager.cursors.orders = res.newLastDoc; 
                            this.limits.orders += 15; this.renderOrders(true);
                        } else {
                            DataManager.cursors.orders = null; btn.innerHTML = `لا توجد طلبات أقدم`; setTimeout(() => loadMoreBtn.remove(), 2000);
                        }
                    }
                };
                fragment.appendChild(loadMoreBtn);
            }
            list.appendChild(fragment);
        });
    },
    
    _getBase64Image: function(imgUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve(null); 
            img.src = imgUrl;
        });
    },

    // =========================================================
    // 🖨️ محرك تصدير الإيصالات الذكي مع حماية الخوادم
    // =========================================================
    
    _getSys: function() {
        if (typeof window.ClientSystem !== 'undefined') return window.ClientSystem;
        if (typeof window.UIManager !== 'undefined') return window.UIManager;
        return { showToast: () => {} };
    },

        generatePDFReceipt: async function(config) {
    const printContainer = document.createElement('div');
    printContainer.id = 'pdf-export-container';
    
    printContainer.style.position = 'absolute';
    printContainer.style.left = '-9999px';
    printContainer.style.top = '-9999px';
    
    const settings = LiveStoreData.settings || {};
    const storeName = settings.storeName || 'المتجر';
    const storeLogoForPDF = settings.storeLogoLight || settings.storeLogo || '';
    
    const accentColor = '#eab308';
    const bgDark = '#0f172a';
    const cardBg = '#1e293b';
    const textColor = '#f8fafc';
    const textMuted = '#94a3b8';
    const successColor = '#10b981';
    
    let safeLogoHtml = '';
    if (storeLogoForPDF) {
        try {
            const base64Logo = await this._getBase64Image(storeLogoForPDF);
            if (base64Logo) safeLogoHtml = `<img src="${base64Logo}" style="max-height: 45px; width: auto; object-fit: contain; margin-left: 10px;">`;
        } catch (e) {}
    }
    
    const brandHTML = `
            <div style="display: flex; align-items: center;">
                ${safeLogoHtml}
                <div style="color: ${textColor}; font-size: 24px; font-weight: 800; font-family: 'Cairo', sans-serif;">${Utils.escapeHtml(storeName)}</div>
            </div>`;
    
    const toEnNum = (str) => `<span style="font-family: 'Share Tech Mono', monospace; direction: ltr; display: inline-block;">${str}</span>`;
    
    // ✅ [الإصلاح المعماري لـ CSS]: استبدال Grid بـ Flexbox مدعوم 100% لتجنب التداخل والتراكب
    const styles = `
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800&family=Share+Tech+Mono&display=swap');
                .receipt-pro { font-family: 'Cairo', sans-serif; background-color: ${bgDark}; color: ${textColor}; width: 650px; padding: 30px; border-radius: 16px; position: relative; overflow: hidden; direction: rtl; border: 2px solid ${accentColor}; }
                .r-content { position: relative; z-index: 1; background: ${cardBg}; border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
                .r-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px dashed rgba(234, 179, 8, 0.3); padding-bottom: 15px; margin-bottom: 20px; }
                .r-title-box { text-align: left; background: rgba(234, 179, 8, 0.1); padding: 8px 15px; border-radius: 8px; border: 1px solid ${accentColor}; }
                .r-title { font-size: 13px; color: ${accentColor}; font-weight: 700; text-transform: uppercase; margin-bottom: 3px; }
                .r-id { font-size: 15px; color: ${textColor}; font-weight: bold; }
                
                /* استخدام Flexbox بأسطر آمنة بديلة عن Grid لضمان عدم تداخل الكروت */
                .r-flex-container { display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 20px; }
                .r-item { width: calc(50% - 8px); background: rgba(15, 23, 42, 0.6); padding: 12px; border-radius: 10px; border-right: 4px solid ${accentColor}; box-sizing: border-box; }
                .r-code-box { width: 100% !important; background: rgba(234, 179, 8, 0.05); border: 1px dashed ${accentColor}; text-align: center; margin-top: 5px; }
                
                .r-label { font-size: 12px; color: ${textMuted}; display: block; margin-bottom: 3px; font-weight: 600; }
                .r-value { font-size: 15px; color: ${textColor}; font-weight: 700; word-break: break-word; }
                .r-status-badge { display: inline-block; background: rgba(16, 185, 129, 0.15); color: ${successColor}; padding: 3px 10px; border-radius: 20px; font-size: 13px; border: 1px solid ${successColor}; }
                .r-total-box { display: flex; justify-content: space-between; align-items: center; background: ${accentColor}; padding: 15px; border-radius: 12px; margin-top: 10px; color: #000; }
                .r-total-label { font-size: 16px; font-weight: 800; color: #000; }
                .r-total-val { font-size: 24px; font-weight: 900; color: #000; }
                .r-footer { text-align: center; margin-top: 25px; font-size: 12px; color: ${textMuted}; font-weight: 600; }
                .r-code-val { font-size: 20px; color: ${accentColor}; letter-spacing: 2px; font-family: 'Share Tech Mono', monospace; }
            </style>
        `;
    
    const receiptHTML = config.type === 'deposit' ? `
            ${styles}
            <div class="receipt-pro">
                <div class="r-content">
                    <div class="r-header">
                        ${brandHTML}
                        <div class="r-title-box">
                            <div class="r-title">إيصال إيداع رصيد</div>
                            <div class="r-id">${toEnNum(config.data.displayId)}</div>
                        </div>
                    </div>
                    <div class="r-flex-container">
                        <div class="r-item"><span class="r-label">اسم العميل</span><span class="r-value">${Utils.escapeHtml(config.data.userName)}</span></div>
                        <div class="r-item"><span class="r-label">رقم العميل (ID)</span><span class="r-value">${toEnNum(Utils.escapeHtml(config.data.userDisplayId))}</span></div>
                        <div class="r-item"><span class="r-label">طريقة الدفع</span><span class="r-value">${Utils.escapeHtml(config.data.method)}</span></div>
                        <div class="r-item"><span class="r-label">التاريخ والوقت</span><span class="r-value">${toEnNum(config.data.dateTime)}</span></div>
                        <div class="r-item"><span class="r-label">إجمالي المبلغ</span><span class="r-value">${toEnNum(RenderHelpers.formatMoney(config.data.amount, config.data.currency))}</span></div>
                        <div class="r-item"><span class="r-label">العمولة (${toEnNum(config.data.feePercent + '%')})</span><span class="r-value" style="color:#ef4444;">-${toEnNum(RenderHelpers.formatMoney(config.data.feeVal, config.data.currency))}</span></div>
                    </div>
                    <div class="r-total-box">
                        <div class="r-total-label">الرصيد المضاف للمحفظة</div>
                        <div class="r-total-val">${toEnNum(RenderHelpers.formatMoney(config.data.netVal, config.data.targetCurrency))}</div>
                    </div>
                </div>
                <div class="r-footer">${Utils.escapeHtml(storeName)} &copy; ${toEnNum(new Date().getFullYear())} | جميع الأسعار بالدولار الأمريكي ($).</div>
            </div>` : `
            ${styles}
            <div class="receipt-pro">
                <div class="r-content">
                    <div class="r-header">
                        ${brandHTML}
                        <div class="r-title-box">
                            <div class="r-title">إيصال استلام طلب</div>
                            <div class="r-id">${toEnNum(config.data.displayId)}</div>
                        </div>
                    </div>
                    <div class="r-flex-container">
                        <div class="r-item"><span class="r-label">المنتج</span><span class="r-value">${Utils.escapeHtml(config.data.product)}</span></div>
                        <div class="r-item"><span class="r-label">حالة الطلب</span><span class="r-value"><span class="r-status-badge">${Utils.escapeHtml(config.data.status)}</span></span></div>
                        <div class="r-item"><span class="r-label">اسم العميل</span><span class="r-value">${Utils.escapeHtml(config.data.userName)}</span></div>
                        <div class="r-item"><span class="r-label">الوقت والتاريخ</span><span class="r-value">${toEnNum(config.data.dateTime)}</span></div>
                        <div class="r-item"><span class="r-label">بيانات الحساب</span><span class="r-value">${toEnNum(Utils.escapeHtml(config.data.input))}</span></div>
                        <div class="r-item"><span class="r-label">الكمية</span><span class="r-value">${toEnNum(config.data.qty)}</span></div>
                        ${config.data.code ? `<div class="r-item r-code-box"><span class="r-label">بيانات الطلب المكتمل</span><span class="r-value r-code-val">${toEnNum(Utils.escapeHtml(config.data.code))}</span></div>` : ''}
                    </div>
                    <div class="r-total-box">
                        <div class="r-total-label">المجموع الإجمالي</div>
                        <div class="r-total-val">${toEnNum(RenderHelpers.formatMoney(config.data.price, config.data.priceCurrency))}</div>
                    </div>
                </div>
                <div class="r-footer">شكراً لثقتكم بـ ${Utils.escapeHtml(storeName)}. جميع الأسعار بالدولار الأمريكي ($).</div>
            </div>`;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'receipt-container';
    wrapper.innerHTML = receiptHTML;
    printContainer.appendChild(wrapper);
    document.body.appendChild(printContainer);
    
    try {
        if (!window.html2canvas) {
            await _loadExternalScriptWithFallback([
                'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
                'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
            ]);
        }
        if (!window.jspdf) {
            await _loadExternalScriptWithFallback([
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
                'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
            ]);
        }
        
        // ✅ [الإصلاح الذكي للخطوط]: الانتظار الفعلي والآمن حتى تكتمل تحميل الخطوط في المتصفح 100% لمنع تكسر وتفكك الحروف العربية
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        } else {
            await new Promise(r => setTimeout(r, 600));
        }
        
        const receiptContent = printContainer.querySelector('.receipt-pro');
        const canvas = await window.html2canvas(receiptContent, {
            scale: 2.5, // رفع دقة الإيصال ليظهر بجودة فائقة (HD)
            useCORS: true,
            allowTaint: true,
            backgroundColor: bgDark,
            scrollX: 0,
            scrollY: 0,
            windowWidth: document.documentElement.offsetWidth,
            windowHeight: document.documentElement.offsetHeight
        });
        
        const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
        const imgWidth = 190;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, imgWidth, imgHeight);
        const pdfBlob = pdf.output('blob');
        
        const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        
        if (navigator.share && isMobile) {
            const file = new File([pdfBlob], config.filename, { type: 'application/pdf' });
            try {
                await navigator.share({ title: 'إيصال العملية', files: [file] });
                return true;
            } catch (e) {
                return true;
            }
        } else {
            const pdfUrl = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = pdfUrl;
            link.download = config.filename;
            link.click();
            setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
            return true;
        }
        
    } catch (err) {
        console.error('[Receipt Error]:', err);
        return false;
    } finally {
        printContainer.remove();
    }
},        exportReceipt: async function(orderId, btnElement = null) {
        const o = (LiveStoreData.orders || []).find(x => String(x.id) === String(orderId));
        if(!o) return;
        
        const sys = this._getSys();
        let originalHtml = '';
        
        if (btnElement && btnElement instanceof HTMLElement) {
            btnElement.disabled = true;
            originalHtml = btnElement.innerHTML;
            btnElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحضير...`;
        }

        const success = await this.generatePDFReceipt({
            type: 'order', filename: `Order_${RenderHelpers.formatOrderId(o)}.pdf`,
            data: { id: o.id, displayId: RenderHelpers.formatOrderId(o), userName: typeof UIManager !== 'undefined' && UIManager._getFullName ? UIManager._getFullName(DataManager.user) : 'العميل', userDisplayId: RenderHelpers.formatUserId(DataManager.user), status: o.status, product: o.product, price: o.price, priceCurrency: o.priceCurrency, qty: o.qty || 1, input: o.input || '---', dateTime: RenderHelpers.formatSafeDate(o.time), code: (o.status === 'completed' && o.deliveredCode !== 'null') ? o.deliveredCode : null }
        });

        if (btnElement && btnElement instanceof HTMLElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = originalHtml;
        }

        // تم إزالة إشعار النجاح، والإبقاء على إشعار الفشل فقط
        if (!success) {
            sys.showToast?.('تعذر تصدير الإيصال، يرجى المحاولة لاحقاً', 'error');
        }
    },

    exportPaymentReceipt: async function(depositId, btnElement = null) {
        const d = (LiveStoreData.deposits || []).find(x => String(x.id) === String(depositId));
        if(!d) return;

        const sys = this._getSys();
        let originalHtml = '';
        
        if (btnElement && btnElement instanceof HTMLElement) {
            btnElement.disabled = true;
            originalHtml = btnElement.innerHTML;
            btnElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحضير...`;
        }

        const success = await this.generatePDFReceipt({
            type: 'deposit', filename: `Deposit_${RenderHelpers.formatDepositId(d)}.pdf`,
            data: { id: d.id, displayId: RenderHelpers.formatDepositId(d), userName: typeof UIManager !== 'undefined' && UIManager._getFullName ? UIManager._getFullName(DataManager.user) : (DataManager.user?.name || 'العميل'), userDisplayId: RenderHelpers.formatUserId(DataManager.user), method: d.method || '---', amount: d.amount, currency: d.currency, feePercent: d.feesPercent || 0, feeVal: d.fees || 0, netVal: d.creditedAmount || d.amount, targetCurrency: d.targetCurrency || 'USD', dateTime: RenderHelpers.formatSafeDate(d.time) }
        });

        if (btnElement && btnElement instanceof HTMLElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = originalHtml;
        }

        // تم إزالة إشعار النجاح، والإبقاء على إشعار الفشل فقط
        if (!success) {
            sys.showToast?.('تعذر تصدير الإيصال، يرجى المحاولة لاحقاً', 'error');
        }
    },
    
    renderNotifCenterList: function() {
        const container = document.getElementById('notif-center-list');
        if (!container) return;
        
        let allAlerts = [];
        try {
            allAlerts = DataManager.getAllUserAlerts ? DataManager.getAllUserAlerts() : (LiveStoreData.alerts || []);
        } catch (e) {
            console.error("Error fetching alerts:", e);
        }
        
        if (allAlerts.length === 0) {
            container.innerHTML = `<div class="nc-empty-state"><i class="fa-regular fa-bell-slash"></i><p>لا توجد إشعارات حالياً</p></div>`;
            return;
        }
        
        let readIds = [];
        try {
            const storedReads = localStorage.getItem(DB_KEYS.NOTIF_READ_LIST);
            readIds = storedReads ? JSON.parse(storedReads).map(String) : [];
            
            if (readIds.length > 100) {
                readIds = readIds.slice(-100);
                localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, JSON.stringify(readIds));
            }
        } catch (e) {
            localStorage.setItem(DB_KEYS.NOTIF_READ_LIST, "[]");
        }
        
        allAlerts.sort((a, b) => {
            const timeA = RenderHelpers.parseUnifiedTime(a);
            const timeB = RenderHelpers.parseUnifiedTime(b);
            return timeB - timeA;
        });
        
        const displayLimit = 30;
        const visibleAlerts = allAlerts.slice(0, displayLimit);
        
        const unreadCount = allAlerts.filter(a => !readIds.includes(String(a.id)) && !a.isRead).length;
        
        let html = unreadCount > 0 ? `
                <div class="nc-top-action-bar">
                    <span class="nc-unread-count-text">لديك <span class="nc-unread-count-num">${unreadCount}</span> جديد</span>
                    <button class="btn btn-ghost nc-mark-read-btn" data-action="mark-all-read">تحديد الكل كمقروء</button>
                </div>` : '';
        
        html += visibleAlerts.map(alert => {
            try {
                const isRead = readIds.includes(String(alert.id)) || alert.isRead;
                const iconClass = (alert.jumpTarget === 'order') ? 'fa-box-open' : (alert.icon || 'fa-bullhorn');
                
                return `
                    <div class="nc-item ${isRead ? 'is-read' : 'unread'}" 
                         data-action="mark-single-read" 
                         data-id="${alert.id}">
                        <div class="nc-icon"><i class="fa-solid ${iconClass}"></i></div>
                        <div class="nc-content">
                            <div class="nc-header">
                                <h4 class="nc-title">${Utils.escapeHtml(alert.title || 'إشعار جديد')}</h4>
                                <span class="nc-time">${RenderHelpers.formatSafeDate(alert.createdAt || alert.time).split(' | ')[0]}</span>
                            </div>
                            <p class="nc-msg">${Utils.escapeHtml(alert.message || '')}</p>
                        </div>
                        ${!isRead ? '<div class="unread-indicator-dot"></div>' : ''}
                    </div>`;
            } catch(e) { return ''; }
        }).join('');
        
        requestAnimationFrame(() => container.innerHTML = html);
    },    

    renderCountryList: function(countries) {
        const listTarget = document.getElementById('countries-list-target');
        if (!listTarget) return;
        const active = (countries || []).filter(c => c.isActive !== false && !c.isBanned);
        if (active.length === 0) { listTarget.innerHTML = '<div class="dropdown-item">لا توجد دول متاحة</div>'; return; }
        
        listTarget.innerHTML = active.map(c => `<div class="dropdown-item" data-action="select-country" data-name="${Utils.escapeHtml(c.name || c.nameAr || 'غير محددة')}" data-code="${c.dialCode || ''}" data-len="${c.phoneLen || 10}"><span style="margin-left: 8px;">${c.flag || c.flagEmoji || '🌍'}</span><span style="flex: 1;">${Utils.escapeHtml(c.name || c.nameAr || 'غير محددة')}</span><span class="num-en" style="color: var(--text-muted);">${c.dialCode || ''}</span></div>`).join('');
    },

    renderTerms: function() {
        const container = document.getElementById('store-terms-content');
        if (!container) return;
        const termsList = (LiveStoreData.settings || {}).terms || [];
        
        if (typeof termsList === 'string') {
            container.innerHTML = `<div class="terms-unified-card"><div class="term-item-row"><p class="tir-text">${Utils.escapeHtml(termsList)}</p></div></div>`;
            return;
        }
        
        if (!Array.isArray(termsList) || termsList.length === 0) {
            container.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-file-contract"></i><h3>لا توجد سياسة حالياً في TeleCard</h3></div>`;
            return;
        }
        
        container.innerHTML = `<div class="terms-unified-card">${termsList.map((term, index) => {
            try {
                let iconName = term.icon || 'file-signature';
                if (!iconName.startsWith('fa-')) iconName = 'fa-' + iconName;
                const fullIconClass = `fa-solid ${iconName}`;

                return `
                    <div class="term-item-row">
                        <div class="tir-header">
                            <div class="tir-icon"><i class="${Utils.escapeHtml(fullIconClass)}"></i></div>
                            <h3 class="tir-title">${Utils.escapeHtml(term.title || `البند ${index + 1}`)}</h3>
                        </div>
                        <div class="tir-body">
                            <p class="tir-text">${Utils.escapeHtml(term.text || '')}</p>
                        </div>
                    </div>`;
            } catch(e) { return ''; }
        }).join('')}</div>`;
    }
};
