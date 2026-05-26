// ============================================================================
// 🖥️ محرك الرسم وبناء الواجهات (renderManager.js) - ES6 Module
// 🎯 الوظيفة: رسم الأقسام، المنتجات، المحفظة، المدفوعات، الطلبات، والـ PDF
// 🚀 التحديث: تطبيق معمارية (SSOT) وتوحيد قراءة وتنسيق التواريخ عبر RenderHelpers
// ============================================================================

import { DB_KEYS } from './config.js'; 
import { Utils } from './utils.js';
import { DataManager, LiveStoreData, StoreDB } from './dataManager.js';
import { UIManager } from './ui/uiManager.js'; 
import { Components } from './components.js'; 
import { RenderHelpers } from './core/renderHelpers.js'; 

export const RenderManager = {
    highlightId: null,

    // =========================================================
    // 🛠️ دوال مساعدة داخلية (Private Helpers)
    // =========================================================
    
    _getMappedColor: function(colorStr) {
        return String(colorStr || 'badge-red')
            .replace('theme-ruby', 'badge-red').replace('theme-sunset', 'badge-red')
            .replace('theme-sapphire', 'badge-blue').replace('theme-ocean', 'badge-blue')
            .replace('theme-emerald', 'badge-green')
            .replace('theme-gold', 'badge-gold')
            .replace('theme-amethyst', 'badge-purple').replace('theme-cyber', 'badge-purple')
            .replace('theme-carbon', 'badge-black').replace('theme-obsidian', 'badge-black');
    },

    _getMappedPosition: function(posStr, defaultPos) {
        const posMap = { 'pos-tl': 'top-left', 'pos-tc': 'top-center', 'pos-tr': 'top-right', 'pos-bl': 'bottom-left', 'pos-bc': 'bottom-center', 'pos-br': 'bottom-right' };
        return posMap[posStr] || posStr || defaultPos;
    },

    _applyGridLayout: function(gridElement, settings = {}, overrideCols = null) {
        if (!gridElement) return;
        
        if (settings.syncGridLayout) {
            const cols = overrideCols || settings.rootLayout || 2;
            gridElement.style.setProperty('--layout-cols', cols);
            localStorage.setItem('store_layout_cols', cols); 
        } else {
            gridElement.style.removeProperty('--layout-cols');
            localStorage.removeItem('store_layout_cols');
        }
    },

    // =========================================================
    // 🏠 1. رسم الصفحة الرئيسية (الأقسام الرئيسية)
    // =========================================================
    renderHome: function(isBackAction = false) {
        const grid = document.getElementById('store-grid');
        const titleEl = document.getElementById('grid-title');
        
        document.body.classList.add('is-home');
        
        if(titleEl) {
            titleEl.classList.remove('show-correct-title');
            titleEl.innerText = ''; 
        }

        if (typeof this.renderHomeSkeletons === 'function') {
            this.renderHomeSkeletons();
        }

        setTimeout(() => {
            UIManager.toggleHeroSection(true);
            UIManager.navHistory = []; 
            UIManager.currentCategoryId = null;

            if (!isBackAction && window.history.replaceState) {
                window.history.replaceState(null, '', ' ');
            }
            
            UIManager.resetGridScroll();
            UIManager.resetUI();
            UIManager.renderTicker();
            
            const cats = LiveStoreData.cats || [];
            const settings = LiveStoreData.settings || {}; 
            
            if(grid) {
                grid.innerHTML = '';
                UIManager.setGridMode('grid-cats');
                this._applyGridLayout(grid, settings, null);
            }

            if(titleEl) titleEl.innerText = 'الأقسام الرئيسية';

            const backBtn = document.getElementById('header-back-btn') || document.querySelector('.modern-back-btn') || document.getElementById('smart-back-btn');
            if(backBtn) {
                backBtn.classList.remove('show');
                backBtn.style.display = 'none';
            }

            const fragment = document.createDocumentFragment();
            const rootCats = cats.filter(c => !c.parentId).sort((a,b) => (a.order||0)-(b.order||0));
            
            if (rootCats.length === 0) {
                if (grid) {
                    grid.innerHTML = `
                        <div class="empty-state-v2">
                            <i class="fa-solid fa-store-slash"></i>
                            <h3>المتجر قيد التجهيز</h3>
                            <p>لا توجد أقسام أو منتجات متاحة في الوقت الحالي، نرجو زيارتنا لاحقاً.</p>
                        </div>`;
                }
            } else {
                rootCats.forEach(c => {
                     const div = document.createElement('div');
                     div.className = 'cat-card';
                     div.setAttribute('data-action', 'open-category');
                     div.setAttribute('data-id', c.id);
                     
                     const safeName = Utils.safeText(c.name);
                     
                     const imgHTML = c.img 
                        ? `<img src="${Utils.escapeHtml(c.img)}" alt="${safeName}" onerror="this.parentElement.innerHTML='<div class=\\'default-prod-icon\\'><i class=\\'fa-solid fa-layer-group\\'></i></div>'">` 
                        : `<div class="default-prod-icon"><i class="fa-solid fa-layer-group"></i></div>`;
                     
                     div.innerHTML = `<div class="cat-img-box">${imgHTML}</div><div class="cat-name-box"><div class="cat-name">${safeName}</div></div>`;
                     fragment.appendChild(div);
                });

                if(grid) grid.appendChild(fragment); 
            }
            
            UIManager.initSlider();

        }, 500); 
    },

    renderHomeSkeletons: function() {
        const grid = document.getElementById('store-grid');
        if (grid) {
            if (typeof UIManager !== 'undefined' && UIManager.setGridMode) {
                UIManager.setGridMode('grid-cats');
            }

            const settings = (LiveStoreData && LiveStoreData.settings) ? LiveStoreData.settings : {};
            let activeCols = window.innerWidth > 768 ? 4 : 2; 

            if (settings.syncGridLayout) {
                activeCols = settings.rootLayout || parseInt(localStorage.getItem('store_layout_cols')) || 2;
                grid.style.setProperty('--layout-cols', activeCols);
            } else {
                grid.style.removeProperty('--layout-cols');
            }

            let count = activeCols * 3; 
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
        
        if (typeof UIManager !== 'undefined' && UIManager.setGridMode) {
            UIManager.setGridMode('grid-prods');
        }

        const settings = (LiveStoreData && LiveStoreData.settings) ? LiveStoreData.settings : {};
        let activeCols = window.innerWidth > 768 ? 4 : 2; 

        if (settings.syncGridLayout) {
            activeCols = settings.rootLayout || parseInt(localStorage.getItem('store_layout_cols')) || 2;
            if (typeof UIManager !== 'undefined' && UIManager.currentCategoryId && LiveStoreData.cats) {
                const cat = LiveStoreData.cats.find(c => Number(c.id) === Number(UIManager.currentCategoryId));
                if (cat && cat.layout) activeCols = cat.layout;
            }
            container.style.setProperty('--layout-cols', activeCols);
        } else {
            container.style.removeProperty('--layout-cols');
        }
        
        let count = overrideCount || (activeCols * 4);

        container.innerHTML = '';
        let skeletonsHTML = '';
        for (let i = 0; i < count; i++) {
            skeletonsHTML += `
                <div class="product-skeleton-card" style="border: none !important; box-shadow: none !important; background: transparent !important;">
                    <div class="prod-img-skeleton skeleton-box"></div>
                    <div class="prod-info-skeleton skeleton-box" style="background: transparent !important; border: none !important;">
                        <div class="product-name skeleton-box" style="height: 12px; width: 70%; margin: 5px auto;"></div>
                        <div class="product-price skeleton-box" style="height: 14px; width: 40%; margin: auto;"></div>
                    </div>
                </div>`;
        }
        container.innerHTML = skeletonsHTML;
    },

    _createProductCard: function(p, idx) {
        const rates = DataManager.getRates();
        const displayCurrency = DataManager.selectedCurr || 'USD';

        let pricing = { unitUsd: 0, oldPriceUsd: null, originalTotalUsd: 0 };
        try { 
            pricing = DataManager.calculateFinalPrice(p, DataManager.user, 1, null, null); 
        } catch(e){
            console.error("Pricing Error:", e);
        }

        let priceSectionHtml = '';
        let nameExpandedStyle = '';
        
        if (p.hideGridPrice !== true) {
            const currentValLocal = Utils.convertViaUSD(pricing.unitUsd, 'USD', displayCurrency, rates, 'pricing');
            priceSectionHtml = `<div class="product-price">${RenderHelpers.formatMoney(currentValLocal, displayCurrency)}</div>`;
        } else {
            nameExpandedStyle = 'white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.4; margin: auto 0;';
        }

        const safeName = Utils.safeText(p.name);
        
        let imgSrcHtml = '';
        if (p.img) {
            imgSrcHtml = `
                <img src="${Utils.escapeHtml(p.img)}" alt="${safeName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='';">
                <div class="default-prod-icon" style="display: none;"><i class="fa-solid fa-box-open"></i></div>
            `;
        } else {
            imgSrcHtml = `<div class="default-prod-icon"><i class="fa-solid fa-box-open"></i></div>`;
        }

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
                if (activeOffer.expiryDate) {
                    timerContent = `<span class="live-countdown num-en" data-expire="${activeOffer.expiryDate}">--:--:--</span>`;
                }
                let tIcon = v.timerStyle === 'timer-digital' ? 'fa-stopwatch' : 'fa-clock';
                visualElementsHtml += `<div class="${v.timerStyle} ${mappedTimerPos}"><i class="fa-regular ${tIcon}"></i> ${timerContent}</div>`;
            }
        } 
        else if (p.badgeText) { 
            visualElementsHtml += `<div class="offer-badge-base prod-badge badge-${p.badgeColor || 'red'}">${Utils.safeText(p.badgeText)}</div>`;
        }

        const div = document.createElement('div'); 
        div.className = 'product-card'; 
        
        div.setAttribute('data-action', 'open-product');
        div.setAttribute('data-id', p.id);
        
        if (idx !== undefined) div.style.setProperty('--anim-idx', idx);
        
        div.innerHTML = `
            <svg class="snake-border" viewBox="0 0 120 165" preserveAspectRatio="none"><rect x="0.7" y="0.7" width="118.6" height="163.6"></rect></svg>
            <div class="card-image">
                ${visualElementsHtml} 
                ${imgSrcHtml}
            </div>
            <div class="card-info">
                <div class="product-name" style="${nameExpandedStyle}">${safeName}</div>
                ${priceSectionHtml}
            </div>`;

        return div;
    },

    updateStoreTimers: function() {
        const timers = document.querySelectorAll('.live-countdown');
        if (timers.length === 0) return;
        
        const now = (typeof DataManager !== 'undefined' && typeof DataManager.getNow === 'function') ? DataManager.getNow() : Date.now();
        
        timers.forEach(el => {
            const expire = Number(el.dataset.expire);
            if (!expire) return;
            const diff = expire - now;
            if (diff <= 0) {
                el.innerText = "انتهى العرض";
                return;
            }
            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);
            
            el.innerText = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        });
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
                        const bText = Utils.escapeHtml(v.grid.badgeText || '');
                        badgeHtml = `<div class="story-badge ${v.grid.badgeStyle} ${bColorClass} ${mappedBadgePos}">${bText}</div>`;
                    }

                    if (v.grid.timerStyle && v.grid.timerStyle !== 'none') {
                        const mappedTimerPos = this._getMappedPosition(v.grid.timerPos, 'top-center');
                        let timerContent = '--:--:--';
                        if (offer.expiryDate) timerContent = `<span class="live-countdown num-en" data-expire="${offer.expiryDate}">--:--:--</span>`;
                        let tIcon = '';
                        if (['timer-bc-pill', 'timer-minimal'].includes(v.grid.timerStyle)) tIcon = `<i class="fa-regular fa-clock"></i> `;
                        if (v.grid.timerStyle === 'timer-digital') tIcon = `<i class="fa-solid fa-stopwatch"></i> `;
                        
                        timerHtml = `<div class="${v.grid.timerStyle} ${mappedTimerPos}">${tIcon}${timerContent}</div>`;
                    }
                }

                let storyImgHtml = '';
                if (prod.img) {
                    storyImgHtml = `
                        <img src="${Utils.escapeHtml(prod.img)}" alt="${Utils.escapeHtml(prod.name)}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div class="default-prod-icon" style="display: none; width: 100%; height: 100%;"><i class="fa-solid fa-box-open"></i></div>
                    `;
                } else {
                    storyImgHtml = `<div class="default-prod-icon" style="display: flex; width: 100%; height: 100%;"><i class="fa-solid fa-box-open"></i></div>`;
                }

                storiesHtml += `
                <div class="story-item clickable" data-action="open-product" data-id="${prod.id}">
                    <div class="story-ring ${shapeClass} ${bColorClass}" style="${shapeStyle}">
                        <div class="story-img-wrapper ${shapeClass}" style="${shapeStyle}">
                            ${storyImgHtml}
                        </div>
                        ${badgeHtml}
                        ${timerHtml}
                    </div>
                    <span class="story-title">${Utils.escapeHtml(prod.name)}</span>
                </div>`;
            });
        });

        if (storiesHtml) {
            storiesContainer.innerHTML = `<div class="stories-wrapper-scroll">${storiesHtml}</div>`;
            storiesContainer.style.display = 'block';
            if (this.updateStoreTimers) this.updateStoreTimers(); 
        } else {
            storiesContainer.style.display = 'none';
        }
    },
    
    _getCategoryName: function(id) {
        try {
            const target = (LiveStoreData.cats || []).find(c => Number(c.id) === Number(id));
            return target ? target.name : 'القسم';
        } catch(e) { return 'القسم'; }
    },

    _renderContent: function(id) {
        UIManager.currentCategoryId = id;
        document.body.classList.remove('is-home');
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

        const subs = cats.filter(c => Number(c.parentId) === Number(id)).sort((a,b) => (a.order||0)-(b.order||0));
        const items = prods.filter(p => Number(p.catId) === Number(id)).sort((a,b) => (a.order||0)-(b.order||0));

        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if(backBtn) {
            backBtn.style.display = 'flex'; 
            const newBtn = backBtn.cloneNode(true); 
            backBtn.parentNode.replaceChild(newBtn, backBtn);
            setTimeout(() => newBtn.classList.add('show'), 10);
            newBtn.setAttribute('data-action', 'go-back');
            newBtn.onclick = (e) => { e.preventDefault(); UIManager._manualGoBack(); };
        }

        if(grid) {
            const currentCat = cats.find(c => Number(c.id) === Number(id));
            const catCols = currentCat?.layout || settings.rootLayout || null;
            
            this._applyGridLayout(grid, settings, catCols);

            const fragment = document.createDocumentFragment();

            if(subs.length > 0) {
                UIManager.setGridMode('grid-cats');
                subs.forEach(c => {
                    const safeName = Utils.safeText(c.name);
                    const imgHTML = c.img 
                        ? `<img src="${Utils.escapeHtml(c.img)}" onerror="this.parentElement.innerHTML='<div class=\\'default-prod-icon\\'><i class=\\'fa-solid fa-layer-group\\'></i></div>'">` 
                        : `<div class="default-prod-icon"><i class="fa-solid fa-layer-group"></i></div>`;
                    
                    const div = document.createElement('div'); div.className = 'cat-card';
                    div.innerHTML = `<div class="cat-img-box">${imgHTML}</div><div class="cat-name-box"><div class="cat-name">${safeName}</div></div>`;
                    div.setAttribute('data-action', 'open-category');
                    div.setAttribute('data-id', c.id);
                    fragment.appendChild(div);
                });
            }
            if(items.length > 0) {
                UIManager.setGridMode('grid-prods');
                items.forEach((p, idx) => {
                    fragment.appendChild(this._createProductCard(p, idx));
                });
            }
            
            grid.appendChild(fragment);

            if(items.length > 0) {
                if(Components?.initProductShine) Components.initProductShine();
            }
            
            if(subs.length === 0 && items.length === 0) {
                grid.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-box-open"></i><h3>لا توجد منتجات</h3></div>`;
            }
        }
    },

    searchStoreTerm: function(q) {
        if(!q || !q.trim()) { this.renderHome(); return; }
        
        UIManager.toggleHeroSection(false);

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
            const currentCat = (LiveStoreData.cats || []).find(c => Number(c.id) === Number(UIManager.currentCategoryId));
            if (currentCat && currentCat.layout) activeCols = currentCat.layout;
        }
        this._applyGridLayout(grid, settings, activeCols);

        UIManager.resetGridScroll();
        UIManager.setGridMode(null);

        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if(backBtn) {
            backBtn.style.display = 'flex'; 
            const newBtn = backBtn.cloneNode(true); 
            backBtn.parentNode.replaceChild(newBtn, backBtn);
            setTimeout(() => newBtn.classList.add('show'), 10);
            newBtn.onclick = () => { 
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
            const safeName = Utils.safeText(c.name);
            const imgHTML = c.img 
                ? `<img src="${Utils.escapeHtml(c.img)}" onerror="this.parentElement.innerHTML='<div class=\\'default-prod-icon\\'><i class=\\'fa-solid fa-layer-group\\'></i></div>'">` 
                : `<div class="default-prod-icon"><i class="fa-solid fa-layer-group"></i></div>`;
            
            const div = document.createElement('div'); div.className = 'cat-card';
            div.innerHTML = `<div class="cat-img-box">${imgHTML}</div><div class="cat-name-box"><div class="cat-name">${safeName}</div></div>`;
            div.setAttribute('data-action', 'open-category');
            div.setAttribute('data-id', c.id);
            fragment.appendChild(div);
        });

        matchedProds.forEach((p, idx) => {
            fragment.appendChild(this._createProductCard(p, idx));
        });
        
        grid.appendChild(fragment);

        UIManager.setGridMode(matchedProds.length > 0 ? 'grid-prods' : 'grid-cats');
        if(Components?.initProductShine) Components.initProductShine();
    },

    _getEffectiveLayoutCols: function() {
        const settings = LiveStoreData.settings || {};
        
        if (typeof UIManager !== 'undefined' && UIManager.currentCategoryId) {
            const currentCat = (LiveStoreData.cats || []).find(c => Number(c.id) === Number(UIManager.currentCategoryId));
            if (currentCat && currentCat.layout) return currentCat.layout;
        }

        if (settings.rootLayout) return settings.rootLayout;

        const saved = localStorage.getItem('store_layout_cols');
        if (saved) return parseInt(saved);

        return window.innerWidth > 768 ? 4 : 2;
    },

    // =========================================================
    // 🌟 نافذة المفضلة الفاخرة
    // =========================================================
    renderFavorites: function() {
        document.body.classList.remove('is-home');
        UIManager.toggleHeroSection(false);

        const favIds = DataManager.favs ? Array.from(DataManager.favs).map(Number) : [];
        const prods = LiveStoreData.prods || [];
        const settings = LiveStoreData.settings || {};
        const favProds = prods.filter(p => favIds.some(favId => Number(favId) === Number(p.id)));
        
        const grid = document.getElementById('store-grid'); 
        if(!grid) return;
        
        grid.style.opacity = '1';
        grid.style.transform = 'translateY(0)';
        grid.innerHTML = '';
        
        UIManager.setGridMode(null);
        UIManager.resetGridScroll();

        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if(backBtn) {
            backBtn.style.display = 'flex';
            const newBtn = backBtn.cloneNode(true);
            backBtn.parentNode.replaceChild(newBtn, backBtn);
            setTimeout(() => newBtn.classList.add('show'), 10);
            newBtn.onclick = () => UIManager.closeFavorites();
        }

        const gridTitle = document.getElementById('grid-title');
        if(gridTitle) {
            gridTitle.innerText = 'المفضلة';
            gridTitle.classList.add('show-correct-title');
        }

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
        favProds.forEach((p, idx) => fragment.appendChild(this._createProductCard(p, idx)));
        grid.appendChild(fragment);
        
        UIManager.setGridMode('grid-prods');

        let activeCols = null;

        if (favProds.length > 0 && LiveStoreData.cats) {
            const firstProdCatId = favProds[0].catId;
            const parentCat = LiveStoreData.cats.find(c => Number(c.id) === Number(firstProdCatId));
            if (parentCat && parentCat.layout) {
                activeCols = parseInt(parentCat.layout);
            }
        }

        if (!activeCols || isNaN(activeCols)) {
            activeCols = parseInt(localStorage.getItem('store_layout_cols')) || parseInt(settings.rootLayout) || (window.innerWidth > 768 ? 4 : 2);
        }

        if (settings.syncGridLayout) {
            grid.style.setProperty('--layout-cols', activeCols);
        } else {
            grid.style.removeProperty('--layout-cols');
        }
        
        if (Components?.initProductShine) Components.initProductShine();
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

    // ========================================================================
    // 💳 المحفظة والإيداعات والطلبات (تم الإصلاح لمنع تجميد النظام)
    // ========================================================================
    renderWallet: function() {
        if (typeof DataManager.updateWalletStats === 'function') {
            DataManager.updateWalletStats();
        }
        
        const filterData = Utils.getSearchAndDateFilters('wallet', 'wallet');
        if (filterData.error) { UIManager.showToast(filterData.error, 'error'); return; }
        const { q, dStart, dEnd, tStart, tEnd } = filterData;

        const list = document.getElementById('wallet-list'); 
        if(!list) return;
        list.innerHTML = '';

        const user = DataManager.user || { id: 0, balance: 0, totalSpent: 0, totalDeposit: 0, baseCurrency: 'USD' };
        const walletCurr = (user.baseCurrency || user.base_currency || 'USD').toUpperCase();
        const uid = localStorage.getItem('telecard_active_user_uid') || String(user.id);
        
        const deps = LiveStoreData.deposits || [];
        const ords = LiveStoreData.orders || [];

        const getTime = (item) => RenderHelpers.parseTime(item.time || item.createdAt);

        // ✅ تم إصلاح الـ Syntax القاتل وحذف الفاصلة المنقوطة
        const deposits = deps.filter(d => String(d.userId) === String(uid)).map(d => {
            const credited = d.creditedAmount !== undefined ? Number(d.creditedAmount) : Number(d.amount || 0);
            return {
                ...d, type: 'deposit', amountVal: Math.abs(credited),
                amountCurrency: d.targetCurrency || walletCurr,
                searchKey: `شحن deposit ${credited} #${d.displayId || d.id}`,
                isDeduction: credited < 0
            };
        });
        
        // ✅ استخدام uid السحابي بدلاً من الأرقام
        const orders = ords.filter(o => String(o.userId) === String(uid)).map(o => ({
            ...o, type: 'purchase', amountVal: Number(o.price || 0), amountCurrency: o.priceCurrency || walletCurr, searchKey: `شراء purchase ${o.product} ${o.price} #${o.displayId || o.id}`
        }));

        let allTransactions = [...deposits, ...orders];
        
        const spentDisp = document.getElementById('wallet-total-spent');
        if(spentDisp) spentDisp.innerHTML = RenderHelpers.formatMoney(user.totalSpent || 0, walletCurr);
        
        const depDisp = document.getElementById('wallet-total-deposit');
        if(depDisp) depDisp.innerHTML = RenderHelpers.formatMoney(user.totalDeposit || 0, walletCurr);

        allTransactions.sort((a, b) => getTime(a) - getTime(b));

        let historySum = 0;
        allTransactions.forEach(tx => {
            let amt = parseFloat(tx.amountVal) || 0;
            if (tx.type === 'deposit' && tx.status === 'approved') {
                if (tx.isDeduction) historySum -= amt; else historySum += amt;
            } else if (tx.type === 'purchase' && !['rejected', 'refunded', 'returned'].includes(tx.status)) {
                historySum -= amt;
            }
        });

        let currentRunningBalance = (Number(user.balance) || 0) - historySum;
        const processedList = allTransactions.map(tx => {
            let amount = parseFloat(tx.amountVal) || 0;
            if (tx.type === 'deposit' && tx.status === 'approved') {
                if (tx.isDeduction) currentRunningBalance -= amount; else currentRunningBalance += amount;
            } else if (tx.type === 'purchase' && !['rejected', 'refunded', 'returned'].includes(tx.status)) {
                currentRunningBalance -= amount;
            }
            return { ...tx, balanceAfter: currentRunningBalance };
        }).reverse();

        let finalView = processedList;
        const filters = DataManager.filters || { wallet: 'all' };
        if(filters.wallet !== 'all') finalView = finalView.filter(t => t.type === filters.wallet);
        
        if(q) finalView = finalView.filter(t => t.searchKey.toLowerCase().includes(q));
        
        if(tStart) finalView = finalView.filter(t => getTime(t) >= tStart);
        if(tEnd) finalView = finalView.filter(t => getTime(t) <= tEnd);
        
        if (!q && !dStart && !dEnd) finalView = finalView.slice(0, 15);

        let generatedHTML = '';
        finalView.forEach(tx => {
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
            
            let balanceAfterHtml = '';
            if (!isDep || tx.status === 'approved') {
                balanceAfterHtml = `<div class="th-balance-after">${RenderHelpers.formatMoney(tx.balanceAfter, walletCurr)}</div>`;
            } else {
                balanceAfterHtml = `<div class="th-balance-after" style="opacity: 0.3; letter-spacing: 2px;">---</div>`;
            }

            const jumpType = isDep ? 'deposit' : 'purchase';
const shortTxId = isDep ? RenderHelpers.formatDepositId(tx) : RenderHelpers.formatOrderId(tx);

            generatedHTML += `
            <div class="th-card ${cardClass} clickable-tx-card" data-action="jump-transaction" data-id="${tx.id}" data-type="${jumpType}" title="انقر لعرض التفاصيل">
                <div class="th-icon ${iconColorClass}">
                    <i class="fa-solid ${iconName}"></i>
                </div>
                
                <div class="th-body">
                    <div class="th-details-col">
                        <div class="th-row-top">
                            <span class="tx-name-text">${isDep ? (tx.method || 'إيداع رصيد') : (tx.product || 'طلب شراء')}</span>
                        </div>
                        <div class="th-row-bottom">
                            <span class="th-date num-en">${formattedDate}</span>
                        </div>
                    </div>

                    <div class="th-amount-col">
                        <span class="th-order num-en">${shortTxId}</span>

                        <div class="th-amount ${amountClass}">${amountPrefix}${RenderHelpers.formatMoney(tx.amountVal, tx.amountCurrency)}</div>
                        ${balanceAfterHtml}
                    </div>
                </div>
            </div>`;
        }); 

        if (finalView.length === 0) {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-wallet"></i><h3>لا توجد حركات</h3></div>`;
            return;
        }
     
        list.innerHTML = generatedHTML;
    },

    renderPayMethods: function() {
        const container = document.getElementById('bal-pay-grid') || document.getElementById('bal-methods-container') || document.querySelector('.bal-methods-grid') || document.getElementById('pay-methods-list');
        if (!container) return;

        container.innerHTML = '';
        
        const payments = LiveStoreData.payments || [];
        const validPayments = payments.filter(p => p?.name?.trim() && p.isActive !== false);

        if (validPayments.length === 0) {
            container.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-building-columns"></i><h3>لا توجد طرق دفع</h3><p>نعتذر، لا توجد بوابات دفع متاحة حالياً.</p></div>`;
            return;
        }

        const fragment = document.createDocumentFragment();

        validPayments.forEach(p => {
            const safeName = Utils.escapeHtml(p.name);
            const imgHtml = p.img 
                ? `<img src="${Utils.escapeHtml(p.img)}" class="pay-icon-img" alt="${safeName}" onerror="this.parentElement.innerHTML='<div class=\\'pay-icon-default\\'><i class=\\'fa-solid fa-building-columns\\'></i></div>'">` 
                : `<div class="pay-icon-default"><i class="fa-solid fa-building-columns"></i></div>`;
            
            const card = document.createElement('div');
            card.className = 'pay-card-select';
            
            card.setAttribute('data-action', 'select-pay');
            card.setAttribute('data-id', p.id);
            
            card.innerHTML = `
                <div class="pay-icon-wrapper">
                    ${imgHtml}
                </div>
                <div class="pay-card-content">
                    <h3 class="pay-card-name">${safeName}</h3>
                </div>
                <i class="fa-solid fa-chevron-left pay-card-arrow"></i>
            `;
            
            fragment.appendChild(card);
        });
        
        container.appendChild(fragment);
    },

    renderPayments: function() {
        const list = document.getElementById('mypay-list');
        const template = document.getElementById('payment-card-template');
        if(!list || !template) return;
        
        const filterData = Utils.getSearchAndDateFilters('pay', 'pay');
        if (filterData.error) { UIManager.showToast(filterData.error, 'error'); return; }
        const { q, dStart, dEnd, tStart, tEnd } = filterData;

        const uid = localStorage.getItem('telecard_active_user_uid');
        const user = DataManager.user || { id: 0 };
        const allDeposits = LiveStoreData.deposits || [];
        
        // ✅ استخدام uid السحابي
        let myDeposits = allDeposits.filter(d => String(d.userId) === String(uid));

        const getTime = (item) => RenderHelpers.parseTime(item.time || item.createdAt);

        const filters = DataManager.filters || { payments: 'all' };
        if (filters.payments !== 'all') myDeposits = myDeposits.filter(d => d.status === filters.payments);
        
        if (q) myDeposits = myDeposits.filter(d => d.id.toString().includes(q) || d.method?.toLowerCase().includes(q));
        
        if (tStart) myDeposits = myDeposits.filter(d => getTime(d) >= tStart);
        if (tEnd) myDeposits = myDeposits.filter(d => getTime(d) <= tEnd);

        myDeposits.sort((a,b) => getTime(b) - getTime(a));
        
        list.innerHTML = '';

        if (myDeposits.length === 0) {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-file-invoice-dollar"></i><h3>لا توجد عمليات</h3></div>`;
            return;
        }

        const fragment = document.createDocumentFragment();

        myDeposits.forEach(d => {
            const clone = template.content.cloneNode(true);
            const card = clone.querySelector('.pay-history-card');
            const header = clone.querySelector('.ph-header');
            
            let stClass = 'st-pending', stText = 'قيد المراجعة', icon = 'fa-clock';
            if (['approved', 'completed'].includes(d.status)) { stClass = 'st-approved'; stText = 'مقبول'; icon = 'fa-check'; } 
            else if (d.status === 'rejected') { stClass = 'st-rejected'; stText = 'مرفوض'; icon = 'fa-xmark'; }
            else if (['refunded', 'returned'].includes(d.status)) { stClass = 'st-refunded'; stText = 'مسترجع'; icon = 'fa-rotate-left'; }

            card.classList.add(stClass);
            clone.querySelector('.ph-icon').classList.add('fa-solid', icon);
            clone.querySelector('.ph-status-mini').textContent = stText;

            const currency = (d.currency || 'USD').toUpperCase();
            const rawAmount = parseFloat(d.amount) || 0; 
            const feesVal = parseFloat(d.fees || d.fee || 0);
            const feesPct = parseFloat(d.feesPercent || d.feePct || 0);
            const totalVal = rawAmount + (d.feeType === 'bonus' ? 0 : feesVal); 

            const displayNetAmount = d.creditedAmount !== undefined ? d.creditedAmount : rawAmount;
            const displayNetCurrency = (d.targetCurrency || currency).toUpperCase();

            clone.querySelector('.ph-method-name').textContent = d.method || 'شحن رصيد';
            
            clone.querySelector('.ph-amount-header').innerHTML = RenderHelpers.formatMoney(rawAmount, currency);
            clone.querySelector('.ph-total').innerHTML = RenderHelpers.formatMoney(totalVal, currency);
            clone.querySelector('.ph-fees').innerHTML = RenderHelpers.formatMoney(feesVal, currency);
            clone.querySelector('.ph-net').innerHTML = RenderHelpers.formatMoney(displayNetAmount, displayNetCurrency);
            
            clone.querySelector('.ph-fee-pct').textContent = `(${feesPct}%)`;

            let formattedDate = RenderHelpers.formatSafeDate(d.time || d.createdAt);
            const miniDateEl = clone.querySelector('.ph-date-mini');
            if(miniDateEl) miniDateEl.innerHTML = formattedDate.replace(' | ', ' <span class="date-sep">|</span> ');

            const shortDepositId = RenderHelpers.formatDepositId(d);
const idEl = clone.querySelector('.ph-id');
idEl.textContent = shortDepositId;
    idEl.setAttribute('data-action', 'copy-text');
            idEl.setAttribute('data-text', shortDepositId);
            clone.querySelector('.ph-sender').innerHTML = (UIManager && UIManager._getTxNameWithID) ? UIManager._getTxNameWithID(user) : 'العميل';
            clone.querySelector('.ph-full-time').textContent = formattedDate;

            if(d.receiptImage || d.receipt){
                const imgBox = clone.querySelector('.ph-receipt-img-box');
                if(imgBox) { imgBox.style.display = 'block'; imgBox.querySelector('img').src = Utils.escapeHtml(d.receiptImage || d.receipt); }
            }

            header.setAttribute('data-action', 'toggle-accordion');

            if (d.adminNote?.trim()) {
                const safeAdminNote = Utils.escapeHtml(d.adminNote);
                const noteStateClass = d.status === 'rejected' ? 'note-rejected' : (['approved', 'completed'].includes(d.status) ? 'note-approved' : '');
                const noteDiv = document.createElement('div');
                noteDiv.className = `ph-admin-note ${noteStateClass}`;
                noteDiv.innerHTML = `<i class="fa-solid fa-headset"></i><div class="ph-admin-note-content"><div style="flex: 1;"><span class="ph-admin-note-title">رسالة من الإدارة:</span><div class="admin-reply-text">${safeAdminNote}</div></div><button class="reply-copy-btn" data-action="copy-text" data-text="${safeAdminNote.replace(/"/g, '&quot;')}"><i class="fa-regular fa-copy"></i></button></div>`;
                const detailsBody = clone.querySelector('.ph-details-body') || card;
                const footerAction = clone.querySelector('.ph-footer-action');
                if (footerAction) detailsBody.insertBefore(noteDiv, footerAction); else detailsBody.appendChild(noteDiv);
            }
            fragment.appendChild(clone);
        });
        
        list.appendChild(fragment);
    },

    renderOrders: function() {
        if (typeof window.updateBottomNavState === 'function') window.updateBottomNavState('orders');

        const filterData = Utils.getSearchAndDateFilters('order', 'order');
        if (filterData.error) { UIManager.showToast(filterData.error, 'error'); return; }
        const { q, dStart, dEnd, tStart, tEnd } = filterData;
        
        const list = document.getElementById('orders-list'); 
        if (!list) return;
        list.innerHTML = '';
        
        const uid = localStorage.getItem('telecard_active_user_uid');
        const allOrders = LiveStoreData.orders || [];
        const prods = LiveStoreData.prods || [];

        const getTime = (item) => RenderHelpers.parseTime(item.time || item.createdAt);

        // ✅ استخدام uid السحابي
        let orders = allOrders.filter(o => String(o.userId) === String(uid));

        const filters = DataManager.filters || { orders: 'all' };
        if (filters.orders !== 'all') orders = orders.filter(o => o.status === filters.orders);
        
        if (q) orders = orders.filter(o => o.id.toString().includes(q) || o.product?.toLowerCase().includes(q)); 
        
        if (tStart) orders = orders.filter(o => getTime(o) >= tStart);
        if (tEnd) orders = orders.filter(o => getTime(o) <= tEnd);

        orders.sort((a, b) => getTime(b) - getTime(a));
        
        if (!q && !dStart && !dEnd) orders = orders.slice(0, 15);

        if (orders.length === 0) {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-box-open"></i><h3>لا توجد طلبات</h3></div>`;
            return; 
        }
      
        const getCleanInputRows = (str) => {
            if (!str || str === '---' || typeof str === 'object') return [];
            const rawStr = String(str);
            if (rawStr.includes('|')) return rawStr.split('|').map(s => s.split(':').pop().trim());
            if (rawStr.includes(':')) return [rawStr.split(':').pop().trim()];
            return [rawStr.trim()];
        };
        
        const fragment = document.createDocumentFragment();
        
        orders.forEach((o, idx) => {
            const status = o.status || 'pending'; 
            const statusClass = status === 'completed' ? 'completed' : (status === 'rejected' ? 'rejected' : (['returned', 'refunded'].includes(status) ? 'returned' : 'pending'));
            const prod = prods.find(p => p.id === o.prodId) || {};
            const productName = o.product || prod.name || 'منتج';
            
            const localPrice = Number(o.price || 0);
            const displayCurr = (o.priceCurrency || 'USD').toUpperCase();
            const amountHtml = RenderHelpers.formatMoney(localPrice, displayCurr);
            
            const qty = parseFloat(o.qty) || 1; 
            const qtyHtml = qty > 1 ? `<span class="oh-qty-badge num-en">x${qty}</span>` : '';

            const inputRows = getCleanInputRows(o.input);
            
            let statusLabel = '<i class="fa-regular fa-clock"></i> قيد التنفيذ';
            if (status === 'completed') statusLabel = '<i class="fa-solid fa-circle-check"></i> مكتمل';
            else if (status === 'processing') statusLabel = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التنفيذ';
            else if (status === 'rejected') statusLabel = '<i class="fa-solid fa-circle-xmark"></i> مرفوض';
            else if (['returned', 'refunded'].includes(status)) statusLabel = '<i class="fa-solid fa-rotate-left"></i> مسترجع';
            
            const cDiscountLocal = Number(o.couponDiscount || 0);
            const oDiscountLocal = Number(o.saleDiscount || 0);
            const totalDiscLocal = cDiscountLocal + oDiscountLocal;

            let discountBadgeHtml = '';
            if (totalDiscLocal > 0) {
                const isCombo  = (cDiscountLocal > 0 && oDiscountLocal > 0);
                const isCoupon = cDiscountLocal > 0;
                const colorClass = isCombo ? 'badge-combo' : (isCoupon ? 'badge-coupon' : 'badge-sale');
                const discIcon   = isCombo ? 'fa-gift'      : (isCoupon ? 'fa-ticket' : 'fa-tag');
                const discText   = isCombo ? 'توفير مضاعف' : (isCoupon ? 'كوبون' : 'تخفيض');

                discountBadgeHtml = `<div class="oh-discount-badge ${colorClass}"><i class="fa-solid ${discIcon}"></i> <span>${discText}</span><span class="num-en">(-${RenderHelpers.formatMoney(totalDiscLocal, displayCurr)})</span></div>`;
            }

            const cardElement = document.createElement('div');
            const isJumped = (this.highlightId && String(o.id) === String(this.highlightId)) ? 'jump-highlight' : '';
            cardElement.className = `oh-card ${isJumped}`.trim();
            cardElement.style.setProperty('--anim-idx', idx);
            cardElement.setAttribute('data-action', 'open-detail');
            cardElement.setAttribute('data-type', 'order');
            cardElement.setAttribute('data-id', o.id);

            const shortOrderId = RenderHelpers.formatOrderId(o);

            let formattedDate = RenderHelpers.formatSafeDate(o.time || o.createdAt);

            cardElement.innerHTML = `
                <div class="oh-right">
                    ${discountBadgeHtml} 
                    <div class="oh-title">${Utils.escapeHtml(productName)}</div> 
                    <div class="oh-inputs-stack">${inputRows.map(row => `<div class="oh-input-line num-en">${Utils.escapeHtml(row)}</div>`).join('')}</div>
                    <div class="oh-date-time num-en">${formattedDate}</div>
                </div>
                <div class="oh-left">
                    <div class="oh-status-box"><span class="oh-status ${statusClass}">${statusLabel}</span></div>
                    <div class="oh-price-box" dir="ltr"><div class="oh-amount">${amountHtml}</div>${qtyHtml}</div>
                    <div class="oh-order-box" dir="ltr"><span class="oh-order-number num-en">${shortOrderId}</span>
</div>
                </div>`;

            fragment.appendChild(cardElement);
        }); 
        
        list.appendChild(fragment);
    },

        generatePDFReceipt: async function(config) {
        const printContainer = document.createElement('div');
        printContainer.id = 'pdf-export-container'; 

        const settings = LiveStoreData.settings || {};
        const storeName = settings.storeName || 'المتجر';
        const storeLogoForPDF = settings.storeLogoLight || settings.storeLogo || '';
        
        let nameColor = '#111827'; 
        if (settings.nameColorType === 'solid' && settings.nameColor1) nameColor = settings.nameColor1;

        const brandHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                ${storeLogoForPDF ? `<img src="${Utils.escapeHtml(storeLogoForPDF)}" style="max-height: 40px; width: auto; object-fit: contain;">` : ''}
                <div style="color: ${nameColor}; font-size: 22px; font-weight: 900;">${Utils.escapeHtml(storeName)}</div>
            </div>`;

        const receiptHTML = config.type === 'deposit' ? `
            <div class="receipt-diamond" dir="rtl">
                <div class="header">
                    <div>${brandHTML}</div>
                    <div style="text-align: left;"><div class="doc-title">إيصال إيداع</div><div class="doc-id">${config.data.displayId}</div></div>
                </div>
                <div class="body">
                    <div class="info-grid">
                        <div class="grid-item"><span class="label">اسم المرسل</span><span class="value">${Utils.escapeHtml(config.data.userName)}</span></div>
                        <div class="grid-item"><span class="label">رقم العميل</span><span class="value en">${Utils.escapeHtml(config.data.userDisplayId)}</span></div>
                        <div class="grid-item"><span class="label">طريقة الدفع</span><span class="value">${Utils.escapeHtml(config.data.method)}</span></div>
                        <div class="grid-item"><span class="label">إجمالي المبلغ</span><span class="value">${RenderHelpers.formatMoney(config.data.amount, config.data.currency)}</span></div>
                        <div class="grid-item"><span class="label">العمولة (${config.data.feePercent}%)</span><span class="value">-${RenderHelpers.formatMoney(config.data.feeVal, config.data.currency)}</span></div>
                        <div class="grid-item"><span class="label">التاريخ والوقت</span><span class="value en">${config.data.dateTime}</span></div>
                    </div>
                    <div class="deposit-summary">
                        <div class="label" style="margin-bottom: 10px;">المبلغ المضاف للمحفظة</div>
                        <div class="dep-val">${RenderHelpers.formatMoney(config.data.netVal, config.data.targetCurrency)}</div>
                    </div>
                </div>
                <div class="footer"><div class="footer-text">${Utils.escapeHtml(storeName)} &copy; ${new Date().getFullYear()} | إيصال إلكتروني معتمد</div></div>
            </div>
        ` : `
            <div class="receipt-diamond" dir="rtl">
                <div class="header">
                    <div>${brandHTML}</div>
                    <div style="text-align: left;"><div class="doc-title">إيصال بيع منتج</div><div class="doc-id">${config.data.displayId}</div></div>
                </div>
                <div class="body">
                    <div class="info-grid">
                        <div class="grid-item"><span class="label">اسم العميل</span><span class="value">${Utils.escapeHtml(config.data.userName)}</span></div>
                        <div class="grid-item"><span class="label">رقم العميل</span><span class="value en">${Utils.escapeHtml(config.data.userDisplayId)}</span></div>
                        <div class="grid-item"><span class="label">حالة الطلب</span><span class="value">${Utils.escapeHtml(config.data.status)}</span></div>
                        <div class="grid-item"><span class="label">المنتج</span><span class="value">${Utils.escapeHtml(config.data.product)}</span></div>
                        <div class="grid-item"><span class="label">السعر الإجمالي</span><span class="value">${RenderHelpers.formatMoney(config.data.price, config.data.priceCurrency)}</span></div>
                        <div class="grid-item"><span class="label">الكمية</span><span class="value en">${config.data.qty}</span></div>
                        <div class="grid-item"><span class="label">بيانات الحساب</span><span class="value">${Utils.escapeHtml(config.data.input)}</span></div>
                        <div class="grid-item"><span class="label">الوقت والتاريخ</span><span class="value en">${config.data.dateTime}</span></div>
                        ${config.data.code ? `<div class="grid-item pdf-code-box"><span class="label">الكود المستلم</span><span class="value en">${Utils.escapeHtml(config.data.code)}</span></div>` : ''}
                    </div>
                </div>
                <div class="footer"><div class="footer-text">${Utils.escapeHtml(storeName)} &copy; ${new Date().getFullYear()} | إيصال إلكتروني معتمد</div></div>
            </div>`;

        const wrapper = document.createElement('div');
        wrapper.className = 'receipt-container';
        wrapper.innerHTML = receiptHTML;
        printContainer.appendChild(wrapper);
        document.body.appendChild(printContainer);

        try {
            if (!window.html2canvas) await import('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
            if (!window.jspdf) await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

            const receiptContent = printContainer.querySelector('.receipt-diamond');
            const canvas = await window.html2canvas(receiptContent, { scale: 2, useCORS: true });
            const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
            pdf.save(config.filename);
            printContainer.remove();
        } catch(err) {
            console.error('PDF Error:', err);
            printContainer.remove();
        }
    },
        exportReceipt: function(orderId) {
        const o = (LiveStoreData.orders || []).find(x => String(x.id) === String(orderId));
        if(!o) return;

        // 🌟 استخدام المحرك المركزي لتوحيد الآيدي للطلب والعميل
        const finalDisplayId = RenderHelpers.formatOrderId(o);
        const userShortId = RenderHelpers.formatUserId(DataManager.user);

        this.generatePDFReceipt({
            type: 'order', filename: `Order_${finalDisplayId}.pdf`,
            data: {
                id: o.id, displayId: finalDisplayId,
                userName: (typeof UIManager !== 'undefined' && UIManager._getFullName) ? UIManager._getFullName(DataManager.user) : 'العميل',
                userDisplayId: userShortId,
                status: o.status, product: o.product, price: o.price, priceCurrency: o.priceCurrency,
                qty: o.qty || 1, input: o.input || '---', dateTime: RenderHelpers.formatSafeDate(o.time),
                code: (o.status === 'completed' && o.deliveredCode !== 'null') ? o.deliveredCode : null
            }
        });
    },

    exportPaymentReceipt: function(depositId) {
        const d = (LiveStoreData.deposits || []).find(x => String(x.id) === String(depositId));
        if(!d) return;

        // 🌟 استخدام المحرك المركزي لتوحيد الآيدي للإيداع والعميل
        const finalDisplayId = RenderHelpers.formatDepositId(d);
        const userShortId = RenderHelpers.formatUserId(DataManager.user);

        this.generatePDFReceipt({
            type: 'deposit', filename: `Deposit_${finalDisplayId}.pdf`,
            data: {
                id: d.id, displayId: finalDisplayId,
                userName: (typeof UIManager !== 'undefined' && UIManager._getFullName) ? UIManager._getFullName(DataManager.user) : (DataManager.user?.name || 'العميل'),
                userDisplayId: userShortId, method: d.method || '---',
                amount: d.amount, currency: d.currency, feePercent: d.feesPercent || 0,
                feeVal: d.fees || 0, netVal: d.creditedAmount || d.amount,
                targetCurrency: d.targetCurrency || 'USD', dateTime: RenderHelpers.formatSafeDate(d.time)
            }
        });
    },
    renderNotifCenterList: function() {
        const container = document.getElementById('notif-center-list');
        if (!container) return;

        const allAlerts = DataManager.getAllUserAlerts ? DataManager.getAllUserAlerts() : [];
        const readIds = JSON.parse(localStorage.getItem(DB_KEYS.NOTIF_READ_LIST) || "[]").map(String);

        if (allAlerts.length === 0) {
            container.innerHTML = `<div class="nc-empty-state"><i class="fa-regular fa-bell-slash"></i><p>لا توجد إشعارات</p></div>`;
            return;
        }

        const unreadCount = allAlerts.filter(a => !readIds.includes(String(a.id))).length;
        let topBar = unreadCount > 0 ? `
            <div class="nc-top-action-bar">
                <span>لديك ${unreadCount} إشعار جديد</span>
                <button class="btn btn-ghost nc-mark-read-btn" data-action="mark-all-alerts-read">تحديد كمقروء</button>
            </div>` : '';

        const html = allAlerts.map(alert => {
            const isRead = readIds.includes(String(alert.id));
            const iconClass = (alert.jumpTarget === 'order') ? 'fa-box-open' : 'fa-bullhorn';
            
            return `
            <div class="nc-item ${isRead ? '' : 'unread'}" data-action="mark-alert-read" data-id="${alert.id}">
                <div class="nc-icon"><i class="fa-solid ${iconClass}"></i></div>
                <div class="nc-content">
                    <div class="nc-header"><h4 class="nc-title">${Utils.escapeHtml(alert.title)}</h4></div>
                    <p class="nc-msg">${Utils.escapeHtml(alert.message)}</p>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = topBar + html;
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
            const countryName = Utils.escapeHtml(c.name || c.nameAr || 'دولة غير محددة');
            const countryFlag = c.flag || c.flagEmoji || '🌍'; 
            const dialCode = c.dialCode || '';
            const phoneLen = c.phoneLen || 10;

            return `
            <div class="dropdown-item" data-action="select-country" data-name="${countryName}" data-code="${dialCode}" data-len="${phoneLen}">
                <span style="margin-left: 8px;">${countryFlag}</span>
                <span style="flex: 1;">${countryName}</span>
                <span class="num-en" style="color: var(--text-muted);">${dialCode}</span>
            </div>`;
        }).join('');
    }
};
