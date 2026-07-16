// ============================================================================
// 🖥️ محرك الرسم والتحكم (renderManager.js) - النسخة الماسية (Pro V5.4)
// 🎯 الوظيفة: المايسترو (Controller) لمعالجة البيانات، الفلترة، الحماية، والتوجيه
// 👑 متوافق بالكامل مع هوية: TeleCard
// 🚀 تحديثات (Clean Architecture):
// 1. [Separation of Concerns]: تم استخراج قوالب الـ HTML الكبيرة (المنتجات والـ PDF) للمصنع.
// 2. [Dependency Injection]: تمرير البيانات المكتملة فقط لبناة الواجهات (Pure Functions).
// 3. [Security]: حماية كاملة من ثغرات XSS في قوائم الدول والمدخلات.
// ============================================================================

import { DB_KEYS } from './config.js';
import { Utils } from './utils.js';
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js';
import { Components } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';
import { UIBuilders } from './ui/uiBuilders.js'; // ⬅️ استيراد مصنع الواجهات النقي

// ============================================================================
// 🛡️ المساعدات العامة للنافذة وإدارة الذاكرة (Global Namespace) 
// ============================================================================
window.StoreRenderApp = window.StoreRenderApp || {
    imgCache: new Set(),
    timerInterval: null,

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
        
        wrapper.classList.add('shimmer-stop');
        wrapper.style.animation = 'none';
        wrapper.style.backgroundColor = 'transparent';
        
        let iconClass = 'fa-box-open';
        let divClass = 'default-prod-icon';
        
        if (type === 'cat') { iconClass = 'fa-layer-group'; }
        else if (type === 'pay') { iconClass = 'fa-building-columns'; divClass = 'pay-icon-default'; }
        
        wrapper.innerHTML = `<div class="${divClass}"><i class="fa-solid ${iconClass}"></i></div>`;
    }
};

export const RenderManager = {
    currentRenderId: 0,
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
        let defaultIcon = 'fa-box-open';
        let defaultClass = 'default-prod-icon';
        let extraStyle = '';
        if (type === 'cat') defaultIcon = 'fa-layer-group';
        else if (type === 'pay') { defaultIcon = 'fa-building-columns'; defaultClass = 'pay-icon-default'; }
        else if (type === 'story') extraStyle = 'width: 100%; height: 100%;';

        const fallbackHTML = `<div class="${defaultClass}" style="${type === 'story' ? 'display: flex; ' + extraStyle : ''}"><i class="fa-solid ${defaultIcon}"></i></div>`;

        let wrapperClass = '';
        let wrapperStyle = '';
        let imgHTML = '';

        if (rawUrl) {
            const urlString = (typeof rawUrl === 'string') ? rawUrl : String(rawUrl || '');
            const safeUrl = urlString.replace(/"/g, '%22');
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
            wrapperClass += ' shimmer-stop';
            wrapperStyle += ' animation: none !important; background-color: transparent !important;';
        }
        return { html: imgHTML, wrapperClass, wrapperStyle };
    },

    // ============================================================================
    // 🔄 معالج التمرير وجلب البيانات الموحد (Central Pagination Handler)
    // ============================================================================
    _appendLoadMoreButton: function(container, type, uid, totalCount, limitKey) {
        const hasMoreData = DataManager.cursors && DataManager.cursors[type];
        if (totalCount > this.limits[limitKey] || hasMoreData) {
            const loadMoreBtn = document.createElement('div');
            loadMoreBtn.className = 'load-more-container mt-15 mb-15 text-center w-100';
            loadMoreBtn.innerHTML = `<button class="load-more-btn"><i class="fa-solid fa-angle-down"></i> عرض المزيد</button>`;
            
            loadMoreBtn.querySelector('button').addEventListener('click', async (e) => {
                const btn = e.target.closest('button');
                if (btn.disabled) return;
                
                if (totalCount > this.limits[limitKey]) {
                    this.limits[limitKey] += 15;
                    if (type === 'orders') this.renderOrders(true);
                    else if (type === 'deposits') this.renderPayments(true);
                    return;
                }
                
                if (hasMoreData) {
                    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحميل...`; 
                    btn.disabled = true;
                    const dbKey = type === 'orders' ? DB_KEYS.ORDERS : DB_KEYS.DEPOSITS;
                    try {
                        const res = await StoreDB.fetchMoreWithCursor(dbKey, ['userId', '==', String(uid)], 'time', DataManager.cursors[type], 15);
                        if (res.data && res.data.length > 0) {
                            const normData = res.data.map(item => ({...item, time: RenderHelpers.parseTime(item.time), createdAt: RenderHelpers.parseTime(item.createdAt)}));
                            const existing = new Set(LiveStoreData[type].map(x => String(x.id)));
                            LiveStoreData[type] = [...LiveStoreData[type], ...normData.filter(x => !existing.has(String(x.id)))];
                            DataManager.cursors[type] = res.newLastDoc;
                            this.limits[limitKey] += 15;
                            
                            if (type === 'orders') this.renderOrders(true);
                            else if (type === 'deposits') this.renderPayments(true);
                        } else {
                            DataManager.cursors[type] = null;
                            btn.innerHTML = `لا توجد بيانات أقدم`;
                            setTimeout(() => loadMoreBtn.remove(), 2000);
                        }
                    } catch (err) {
                        btn.innerHTML = `خطأ في التحميل`;
                        btn.disabled = false;
                    }
                }
            }, { once: true }); 
            
            container.appendChild(loadMoreBtn);
        }
    },

    // ============================================================================
    // 🎨 عمليات الرسم الأساسية (Core Render Methods)
    // ============================================================================

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
                
                requestAnimationFrame(() => {
                    if (renderId !== this.currentRenderId) return; 
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
        
        // 🚀 التعديل: الاعتماد على المصنع UIBuilders لإنشاء محتوى الكارت
        div.innerHTML = UIBuilders.buildProductCardInner(safeName, priceSectionHtml, imgObj, visualElementsHtml, nameExpandedStyle);

        return div;
    },

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
            this.initTimersEngine(); 
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
        const renderId = ++this.currentRenderId;
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
                if (renderId !== this.currentRenderId) return; 
                grid.appendChild(fragment);
                if(items.length > 0 && Components?.initProductShine) Components.initProductShine();
                if(subs.length === 0 && items.length === 0) grid.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-box-open"></i><h3>لا توجد منتجات</h3></div>`;
            });
        }
    },

    searchStoreTerm: function(q) {
        if(!q || !q.trim()) { this.renderHome(); return; }
        const renderId = ++this.currentRenderId;
        
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
            if (renderId !== this.currentRenderId) return;
            grid.appendChild(fragment);
            UIManager.setGridMode(matchedProds.length > 0 ? 'grid-prods' : 'grid-cats');
            if(Components?.initProductShine) Components.initProductShine();
        });
    },

    renderFavorites: function() {
        const renderId = ++this.currentRenderId;
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
            if (renderId !== this.currentRenderId) return; 
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

    // ============================================================================
    // 🏦 القوائم والبيانات المعتمدة على الـ UIBuilders (Clean Architecture)
    // ============================================================================

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

        allTransactions.sort((a, b) => {
            const timeDiff = b.sortTime - a.sortTime;
            if (timeDiff !== 0) return timeDiff;
            return String(b.id || '').localeCompare(String(a.id || ''));
        });

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

        requestAnimationFrame(() => {
            list.innerHTML = visibleWallet.map(tx => {
                try { return UIBuilders.buildWalletCard(tx, walletCurr, isFilterActive); } 
                catch (e) { return ''; }
            }).join('');

            const hasMoreData = DataManager.cursors && (DataManager.cursors.orders || DataManager.cursors.deposits);
            if (!q && !dStart && !dEnd && (totalWalletCount > this.limits.wallet || hasMoreData)) {
                const loadMoreBtn = document.createElement('div');
                loadMoreBtn.className = 'load-more-container mt-15 mb-15 text-center w-100';
                loadMoreBtn.innerHTML = `<button class="load-more-btn"><i class="fa-solid fa-angle-down"></i> عرض المزيد</button>`;
                
                loadMoreBtn.querySelector('button').addEventListener('click', async (e) => {
                    const btn = e.target.closest('button');
                    if (btn.disabled) return;
                    
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

                        try {
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
                        } catch (err) {
                            btn.innerHTML = `خطأ في التحميل`; btn.disabled = false;
                        }
                    }
                }, { once: true });
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

        myDeposits.sort((a, b) => {
            const timeDiff = b.sortTime - a.sortTime;
            if (timeDiff !== 0) return timeDiff;
            return String(b.id || '').localeCompare(String(a.id || ''));
        });

        const totalPaymentsCount = myDeposits.length;
        const displayLimit = (!q && !dStart && !dEnd) ? this.limits.payments : Math.min(myDeposits.length, 50);
        const visibleDeposits = myDeposits.slice(0, displayLimit);

        if (visibleDeposits.length === 0) { 
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-file-invoice-dollar"></i><h3>لا توجد عمليات</h3></div>`; 
            return; 
        }

        const userDisplayName = Utils.escapeHtml(user.username ? `@${user.username}` : (user.name || 'العميل'));
        const userIdString = RenderHelpers.formatUserId(user);

        requestAnimationFrame(() => {
            list.innerHTML = visibleDeposits.map(d => {
                try { return UIBuilders.buildPaymentCard(d, userDisplayName, userIdString, baseCurrency); }
                catch(e) { return ''; }
            }).join('');

            if (!q && !dStart && !dEnd) {
                this._appendLoadMoreButton(list, 'deposits', uid, totalPaymentsCount, 'payments');
            }
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

        let orders = (LiveStoreData.orders || []).filter(o => String(o.userId) === String(uid)).map(o => ({ ...o, sortTime: RenderHelpers.parseUnifiedTime(o) }));

        const filters = DataManager.filters || { orders: 'all' };
        if (filters.orders !== 'all') orders = orders.filter(o => o.status === filters.orders);
        
        if (q) orders = orders.filter(o => o.id.toString().includes(q) || (o.displayId && o.displayId.toLowerCase().includes(q)) || RenderHelpers.formatOrderId(o).toLowerCase().includes(q) || o.product?.toLowerCase().includes(q));
        if (tStart) orders = orders.filter(o => o.sortTime >= tStart);
        if (tEnd) orders = orders.filter(o => o.sortTime <= tEnd);

        orders.sort((a, b) => {
            const timeDiff = b.sortTime - a.sortTime;
            if (timeDiff !== 0) return timeDiff;
            return String(b.id || '').localeCompare(String(a.id || ''));
        });

        const totalOrdersCount = orders.length;
        const displayLimit = (!q && !dStart && !dEnd) ? this.limits.orders : Math.min(orders.length, 50);
        const visibleOrders = orders.slice(0, displayLimit);

        if (visibleOrders.length === 0) { 
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-box-open"></i><h3>لا توجد طلبات</h3></div>`; 
            return; 
        }
        
        requestAnimationFrame(() => {
            if (renderId !== this.currentRenderId) return; 
            
            list.innerHTML = visibleOrders.map((o, idx) => {
                try {
                    const prodName = Utils.escapeHtml(o.product || (LiveStoreData.prods || []).find(p => String(p.id) === String(o.prodId))?.name || 'منتج');
                    const displayCurr = (o.priceCurrency || 'USD').toUpperCase();
                    return UIBuilders.buildOrderCard(o, idx, displayCurr, this.highlightId, prodName);
                } catch (e) { return ''; }
            }).join('');

            if (!q && !dStart && !dEnd) {
                this._appendLoadMoreButton(list, 'orders', uid, totalOrdersCount, 'orders');
            }
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
    // 🖨️ محرك تصدير الإيصالات الذكي (PDF Engine)
    // =========================================================
    
    _getSys: function() {
        if (typeof window.ClientSystem !== 'undefined') return window.ClientSystem;
        if (typeof window.UIManager !== 'undefined') return window.UIManager;
        return { showToast: () => {} };
    },

    generatePDFReceipt: async function(config) {
    return new Promise((resolve) => {
        try {
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            let printWindow = null;
            
            // 🚀 الحل الاحترافي: فتح النافذة فوراً وبشكل متزامن قبل أي معالجة لتخطي حظر Safari الصارم
            if (isMobile) {
                printWindow = window.open('', '_blank');
                
                if (!printWindow) {
                    console.error("Popup blocked by browser");
                    const sys = typeof window.ClientSystem !== 'undefined' ? window.ClientSystem : (typeof window.UIManager !== 'undefined' ? window.UIManager : null);
                    if (sys && sys.showToast) sys.showToast('يرجى السماح بالنوافذ المنبثقة (Popups) لطباعة الفاتورة', 'warning');
                    resolve(false);
                    return;
                }
                
                // وضع لودر أنيق مؤقت ريثما يتم تجهيز وبناء الـ HTML
                printWindow.document.write(`
                        <html dir="rtl">
                        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
                        <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; background:#f8fafc; margin:0;">
                            <div style="text-align:center; color:#64748b;">
                                <svg style="width:40px; height:40px; animation:spin 1s linear infinite; fill:#FFD700; margin-bottom:15px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M304 48a48 48 0 1 0 -96 0 48 48 0 1 0 96 0zm0 416a48 48 0 1 0 -96 0 48 48 0 1 0 96 0zM48 304a48 48 0 1 0 0-96 48 48 0 1 0 0 96zm464-48a48 48 0 1 0 -96 0 48 48 0 1 0 96 0zM142.9 437A48 48 0 1 0 75 369.1 48 48 0 1 0 142.9 437zm0-294.2A48 48 0 1 0 75 75a48 48 0 1 0 67.9 67.9zM369.1 437A48 48 0 1 0 437 369.1 48 48 0 1 0 369.1 437z"/></svg>
                                <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
                                <h3 style="margin:0; font-size:16px;">جاري تجهيز الفاتورة...</h3>
                            </div>
                        </body>
                        </html>
                    `);
            }
            
            // ⚙️ معالجة البيانات وتجهيز الـ HTML
            const settings = LiveStoreData.settings || {};
            const storeName = settings.storeName || 'المتجر';
            const storeLogo = settings.storeLogoLight || settings.storeLogo || '';
            
            let safeLogoHtml = '';
            if (storeLogo) {
                safeLogoHtml = `<img src="${Utils.escapeHtml(storeLogo)}" style="max-height: 55px; max-width: 160px; object-fit: contain;">`;
            }
            
            const brandHTML = {
                storeName: storeName,
                html: `
                        <div class="header-section">
                            <div class="store-name">${Utils.escapeHtml(storeName)}</div>
                            ${safeLogoHtml}
                        </div>`
            };
            
            // استدعاء الـ HTML النظيف من المصنع
            const fullHTML = UIBuilders.buildPDFReceipt(config, brandHTML.html);
            
            if (isMobile && printWindow) {
                // استبدال محتوى النافذة (اللودر) بالـ HTML النهائي للفاتورة
                printWindow.document.open();
                printWindow.document.write(fullHTML);
                printWindow.document.close();
                
                // إعطاء المتصفح وقتاً لتحميل الصور والخطوط قبل إظهار نافذة الطباعة
                setTimeout(() => {
                    printWindow.focus();
                    printWindow.print();
                    resolve(true);
                }, 1000);
                
            } else if (!isMobile) {
                // أجهزة الكمبيوتر (Desktop): فتح الفاتورة وطباعتها بصمت داخل Iframe مخفي
                const iframe = document.createElement('iframe');
                iframe.style.position = 'fixed';
                iframe.style.right = '-10000px';
                iframe.style.bottom = '-10000px';
                document.body.appendChild(iframe);
                
                const iframeDoc = iframe.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write(fullHTML);
                iframeDoc.close();
                
                setTimeout(() => {
                    try {
                        iframe.contentWindow.focus();
                        
                        iframe.contentWindow.onafterprint = function() {
                            if (document.body.contains(iframe)) document.body.removeChild(iframe);
                            resolve(true);
                        };
                        
                        iframe.contentWindow.print();
                        
                        // تنظيف احتياطي للـ DOM
                        setTimeout(() => {
                            if (document.body.contains(iframe)) {
                                document.body.removeChild(iframe);
                                resolve(true);
                            }
                        }, 15000);
                        
                    } catch (e) {
                        console.error("Print Failed", e);
                        if (document.body.contains(iframe)) document.body.removeChild(iframe);
                        resolve(false);
                    }
                }, 800);
            }
            
        } catch (err) {
            console.error('[Receipt Native Print Error]:', err);
            resolve(false);
        }
    });
},
    exportReceipt: async function(orderId, btnElement = null) {
        const o = (LiveStoreData.orders || []).find(x => String(x.id) === String(orderId));
        if (!o) return;
        
        const sys = this._getSys();
        let originalHtml = '';
        
        if (btnElement && btnElement instanceof HTMLElement) {
            btnElement.disabled = true;
            originalHtml = btnElement.innerHTML;
            btnElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحضير...`;
        }
        
        const success = await this.generatePDFReceipt({
            type: 'order',
            filename: `Order_${RenderHelpers.formatOrderId(o)}.pdf`,
            data: {
                id: o.id,
                displayId: RenderHelpers.formatOrderId(o),
                userName: typeof UIManager !== 'undefined' && UIManager._getFullName ? UIManager._getFullName(DataManager.user) : (DataManager.user?.name || 'العميل'),
                userDisplayId: RenderHelpers.formatUserId(DataManager.user),
                status: o.status,
                product: o.product,
                price: o.price,
                priceCurrency: o.priceCurrency,
                qty: o.qty || 1,
                input: o.input || '---',
                dateTime: RenderHelpers.formatSafeDate(o.time || o.createdAt),
                code: (o.status === 'completed' && o.deliveredCode !== 'null') ? o.deliveredCode : null
            }
        });
        
        if (btnElement && btnElement instanceof HTMLElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = originalHtml;
        }
        
        if (!success) {
            sys.showToast?.('تعذر تصدير الإيصال، يرجى المحاولة لاحقاً', 'error');
        }
    },
    
    exportPaymentReceipt: async function(depositId, btnElement = null) {
        const d = (LiveStoreData.deposits || []).find(x => String(x.id) === String(depositId));
        if (!d) return;
        
        const sys = this._getSys();
        let originalHtml = '';
        
        if (btnElement && btnElement instanceof HTMLElement) {
            btnElement.disabled = true;
            originalHtml = btnElement.innerHTML;
            btnElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحضير...`;
        }
        
        const success = await this.generatePDFReceipt({
            type: 'deposit',
            filename: `Deposit_${RenderHelpers.formatDepositId(d)}.pdf`,
            data: {
                id: d.id,
                displayId: RenderHelpers.formatDepositId(d),
                userName: typeof UIManager !== 'undefined' && UIManager._getFullName ? UIManager._getFullName(DataManager.user) : (DataManager.user?.name || 'العميل'),
                userDisplayId: RenderHelpers.formatUserId(DataManager.user),
                method: d.method || '---',
                amount: d.amount,
                currency: d.currency,
                feePercent: d.feesPercent || 0,
                feeVal: d.fees || 0,
                netVal: d.creditedAmount || d.amount,
                targetCurrency: d.targetCurrency || 'USD',
                dateTime: RenderHelpers.formatSafeDate(d.time || d.createdAt)
            }
        });
        
        if (btnElement && btnElement instanceof HTMLElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = originalHtml;
        }
        
        if (!success) {
            sys.showToast?.('تعذر تصدير الإيصال، يرجى المحاولة لاحقاً', 'error');
        }
    },

    // ============================================================================
    // 🔔 الإشعارات المعمارية المحدثة (Server-Ready Notifications)
    // ============================================================================

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
        
        const serverLastReadTime = DataManager.user?.lastReadAlertTime ? RenderHelpers.parseUnifiedTime({ time: DataManager.user.lastReadAlertTime }) : 0;
        
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
            const timeDiff = RenderHelpers.parseUnifiedTime(b) - RenderHelpers.parseUnifiedTime(a);
            if (timeDiff !== 0) return timeDiff;
            return String(b.id || '').localeCompare(String(a.id || ''));
        });
        
        const displayLimit = 30;
        const visibleAlerts = allAlerts.slice(0, displayLimit);
        
        const unreadCount = allAlerts.filter(a => {
            const alertTime = RenderHelpers.parseUnifiedTime(a);
            return !readIds.includes(String(a.id)) && !a.isRead && alertTime > serverLastReadTime;
        }).length;
        
        let html = unreadCount > 0 ? `
                <div class="nc-top-action-bar">
                    <span class="nc-unread-count-text">لديك <span class="nc-unread-count-num">${unreadCount}</span> جديد</span>
                    <button class="btn btn-ghost nc-mark-read-btn" data-action="mark-all-read">تحديد الكل كمقروء</button>
                </div>` : '';
        
        html += visibleAlerts.map(alert => {
            try {
                const alertTime = RenderHelpers.parseUnifiedTime(alert);
                const isRead = readIds.includes(String(alert.id)) || alert.isRead || alertTime <= serverLastReadTime;
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
        if (active.length === 0) {
            listTarget.innerHTML = '<div class="dropdown-item">لا توجد دول متاحة</div>';
            return;
        }
        
        listTarget.innerHTML = active.map(c => {
            const safeName = Utils.escapeHtml(c.name || c.nameAr || 'غير محددة');
            const safeFlag = Utils.escapeHtml(c.flag || c.flagEmoji || '🌍');
            const safeCode = Utils.escapeHtml(c.dialCode || '');
            const safeLen = parseInt(c.phoneLen) || 10;
            
            return `
                    <div class="dropdown-item" 
                         data-action="select-country" 
                         data-name="${safeName}" 
                         data-code="${safeCode}" 
                         data-len="${safeLen}">
                        <span style="margin-left: 8px;">${safeFlag}</span>
                        <span style="flex: 1;">${safeName}</span>
                        <span class="num-en" style="color: var(--text-muted);">${safeCode}</span>
                    </div>`;
        }).join('');
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