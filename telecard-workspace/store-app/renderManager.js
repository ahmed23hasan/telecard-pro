// ============================================================================
// 🖥️ محرك الرسم والتحكم المرئي (renderManager.js) - الإصدار المؤسسي V21.1.0 🚀
// 🎯 الوظيفة: المايسترو لمعالجة البيانات، الفلترة، الرسم المتزامن، وتصدير الإيصالات.
// 🚀 التحديثات المعمارية الصارمة (V21.1.0 - Production Visual Engine):
// 1. Single Escaping Normalization 🛡️: إزالة التشفير المزدوج (Double HTML Escaping) في الطلبات والفواتير لمنع تشوه الرموز.
// 2. Canonical Sort Order 📊: اعتماد دالة _getSortOrder لدعم sortOrder و order بالتوافق التام مع السيرفر.
// 3. Zero Ghost Requests 🚫: منع طلب <img src="#"> عند غياب صورة بوابة الدفع وإظهار الأيقونة البديلة فوراً.
// 4. Granular Tier & Expiry Cache ⚡: دعم الباقات الفرعية options وفحص انتهاء أسعار المستويات المؤقتة في مفتاح _priceCache.
// 5. Tier-Targeted Stories 🎬: احترام مصفوفة targetTiers واستثناء مستخدمي الـ API في شريط قصص العروض.
// 6. Strict Tab Segregation 📂: فصل فلتر المرفوض عن المسترجع تماماً، وتصنيف الخصم الإداري (deducted) بدقة ضمن الصادر.
// 7. Accurate Skeleton Detection 🏛️: منع اعتبار شاشات الهيكل العظمي (skeleton-mode) محتوى حقيقياً في renderHome.
// 8. Historical Data Sync 📄: دمج سجلات "عرض المزيد" مع LiveStoreData لضمان استقرار تفاصيل وتصدير العمليات القديمة.
// ============================================================================

import { DB_KEYS, CACHE_KEYS } from './config.js'; 
import * as Utils from './utils.js'; 
import { DataManager, LiveStoreData } from './dataManager.js';
import { UIManager, UIState } from './ui/uiManager.js';
import { Components } from './components.js';
import { RenderHelpers } from './core/renderHelpers.js';
import { UIBuilders } from './ui/uiBuilders.js'; 

// 🛡️ محرك المراقبة الذكي (IntersectionObserver) لتحرير الذاكرة وتأجيل تحميل الصور
window.StoreImageObserver = window.StoreImageObserver || new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                observer.unobserve(img);
            }
        }
    });
}, { rootMargin: '250px' });

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
        if (img.hasAttribute('data-src')) return; 
        
        const key = img.getAttribute('data-key');
        if (key) {
            if (this.imgCache.has(key)) {
                this.imgCache.delete(key);
            } else if (this.imgCache.size > 500) {
                let deletedCount = 0;
                for (const k of this.imgCache) {
                    if (k.startsWith('blob:')) URL.revokeObjectURL(k);
                    this.imgCache.delete(k);
                    deletedCount++;
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

    _getSortOrder: function(item) {
        const val = Number(item?.sortOrder ?? item?.order ?? 0);
        return Number.isFinite(val) ? val : 0;
    },

    _isProductInCategory: function(prod, targetCatId) {
        if (!prod || !targetCatId) return false;
        const prodCats = [].concat(prod.categoryId, prod.categoryIds).filter(Boolean).map(String);
        return prodCats.includes(String(targetCatId));
    },

    _hideOfferStoriesBar: function() {
        const storiesContainer = document.getElementById('offer-stories-bar');
        if (storiesContainer) {
            storiesContainer.style.display = 'none';
            storiesContainer.innerHTML = '';
        }
    },

    _renderHtmlToFragment: function(htmlString) {
        const template = document.createElement('template');
        template.innerHTML = htmlString;
        
        if (window.StoreImageObserver) {
            const lazyImages = template.content.querySelectorAll('img[data-src]');
            lazyImages.forEach(img => window.StoreImageObserver.observe(img));
        }
        
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
        
        requestAnimationFrame(() => {
            gridElement.style.setProperty('--layout-cols', finalCols); 
        });
    },

    _getImgLoadVars: function(rawUrl) {
        return {
            cacheKey: rawUrl || '',
            imgClass: 'img-loading-state', 
            wrapperClass: '',
            lazyAttrs: '', 
            imgStyle: '',
            wrapperStyle: ''
        };
    },

    _generateImageHTML: function(rawUrl, safeName, type, isHighPriority = false) {
        let defaultIcon = type === 'cat' ? 'fa-layer-group' : (type === 'pay' ? 'fa-building-columns' : 'fa-box-open');
        let defaultClass = type === 'pay' ? 'pay-icon-default' : 'default-prod-icon';
        let extraClass = type === 'story' ? ' story-fallback-icon' : '';
        
        const fallbackHTML = `<div class="${defaultClass} fallback-icon-ready${extraClass}" style="display: none;"><i class="fa-solid ${Utils.escapeHtml(defaultIcon)}"></i></div>`;
        
        const cleanRaw = (rawUrl && typeof rawUrl === 'string') ? rawUrl.trim() : '';
        if (!cleanRaw || cleanRaw === 'null' || cleanRaw === 'undefined' || cleanRaw === '#') {
            return { html: fallbackHTML.replace('display: none;', 'display: flex;'), wrapperClass: ' shimmer-stop-override', wrapperStyle: '' };
        }
        
        const safeUrl = typeof Utils !== 'undefined' && Utils.safeUrl ? Utils.safeUrl(cleanRaw) : cleanRaw.replace(/"/g, '&quot;');
        if (!safeUrl || safeUrl === '#') {
            return { html: fallbackHTML.replace('display: none;', 'display: flex;'), wrapperClass: ' shimmer-stop-override', wrapperStyle: '' };
        }

        const cacheKey = cleanRaw;
        const isCached = window.StoreRenderApp.imgCache.has(cacheKey);
        
        if (isCached || type === 'pay') {
            const imgClass = type === 'pay' ? 'pay-icon-img' : 'img-loaded-flat';
            const imgHTML = `<img src="${safeUrl}" data-key="${cacheKey}" class="${imgClass}" loading="eager" alt="${safeName}" data-img-type="${type}" onerror="window.StoreRenderApp.handleImgError(this, '${type}')">`;
            return { html: imgHTML + fallbackHTML, wrapperClass: 'shimmer-stop-override', wrapperStyle: '' };
        }
        
        const useLazyObserver = !isHighPriority;
        const onloadAttr = 'onload="window.StoreRenderApp.onImgLoad(this)"';
        const imgClass = 'img-loading-state';
        const placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
        
        const imgHTML = `<img ${useLazyObserver ? `src="${placeholder}" data-src="${safeUrl}"` : `src="${safeUrl}" loading="eager"`} data-key="${cacheKey}" class="${imgClass}" alt="${safeName}" data-img-type="${type}" ${onloadAttr} onerror="window.StoreRenderApp.handleImgError(this, '${type}')">`;
        
        return { html: imgHTML + fallbackHTML, wrapperClass: '', wrapperStyle: '' };
    }, 

    _generateProductCardHTML: function(p, idx) {
        let pricingInfo = null;
        const activeOffer = DataManager.getActiveOffer(p.id);
        
        try { 
            const tierId = DataManager.user?.tierId || 'TIER_DEFAULT';
            const displayCurr = DataManager.selectedCurr || 'USD';
            const offerKey = activeOffer ? `${activeOffer.id}_${activeOffer.value || 0}` : 'none';
            
            const firstOpt = (p.type === 'select' && Array.isArray(p.options))
                ? (p.options.find(o => o && o.isActive !== false && String(o.isAvailable) !== 'false') || p.options[0])
                : null;
            const targetPricingObj = firstOpt || p;
            const basePriceSnap = targetPricingObj.tierPrices?.[tierId] ?? targetPricingObj.fixedPriceUsd ?? targetPricingObj.price ?? p.price ?? 0;
            const expInfo = targetPricingObj.tierPriceExpiries?.[tierId] || p.tierPriceExpiries?.[tierId];
            const tierExpMs = expInfo?.expiresAt ? Utils.parseSafeTime(expInfo.expiresAt) : 0;
            const isTierExp = (tierExpMs > 0 && DataManager.getNow() >= tierExpMs) ? '1' : '0';
            
            const cacheKey = `${p.id}_${basePriceSnap}_${p.updatedAt || 0}_${tierId}_${isTierExp}_${displayCurr}_${offerKey}`;
            
            if (this._priceCache.has(cacheKey)) {
                pricingInfo = this._priceCache.get(cacheKey);
            } else {
                pricingInfo = DataManager.getPricingLocal(p, 1, null, null); 
                this._priceCache.set(cacheKey, pricingInfo);
                
                if (this._priceCache.size > 2000) {
                    const oldestKey = this._priceCache.keys().next().value;
                    this._priceCache.delete(oldestKey);
                }
            }
        } catch(e) { 
            console.error(`🚨 [Render Engine] Pricing Error in Product: ${p.name}`, e.message); 
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
                let timerContent = activeOffer.expiryDate ? `<span class="live-countdown num-en" data-expire="${Utils.parseSafeTime(activeOffer.expiryDate)}">--:--:--</span>` : '--:--:--';
                let tIcon = v.timerStyle === 'timer-digital' ? 'fa-stopwatch' : 'fa-clock';
                visualElementsHtml += `<div class="${this._safeClass(v.timerStyle)} ${mappedTimerPos}"><i class="fa-regular ${tIcon}"></i> ${timerContent}</div>`;
            }
        } else if (p.badgeText) {
            visualElementsHtml += `<div class="offer-badge-base prod-badge badge-${this._safeClass(p.badgeColor) || 'blue'}">${Utils.safeText(p.badgeText)}</div>`;
        }

        const isOut = p.isAvailable === false || String(p.isAvailable) === 'false' ||
            (p.type === 'select' && Array.isArray(p.options) && !p.options.some(o => o && o.isActive !== false && o.isAvailable !== false && String(o.isAvailable) !== 'false'));
        if (isOut) {
            visualElementsHtml += `<div class="offer-badge-base prod-badge badge-red top-left"><i class="fa-solid fa-ban"></i> غير متوفر</div>`;
        }

        return `<div class="product-card ${isOut ? 'opacity-75' : ''}" data-action="open-product" data-id="${p.id}" style="--anim-idx: ${idx}">${UIBuilders.buildProductCardInner(safeName, priceSectionHtml, imgObj, visualElementsHtml, nameExpandedClass)}</div>`;
    },

    _mergeHistoricalIntoLive: function(type, newItems) {
        if (!Array.isArray(newItems) || newItems.length === 0) return;
        const targetKey = type === 'orders' ? 'orders' : 'deposits';
        this._historicalData[targetKey] = [...(this._historicalData[targetKey] || []), ...newItems].slice(-500);
        const combined = [...(LiveStoreData[targetKey] || []), ...newItems];
        LiveStoreData[targetKey] = Array.from(new Map(combined.map(item => [String(item.id), item])).values());
    },

    _appendLoadMoreButton: function(container, type, uid, totalCount, limitKey) {
        const hasMoreData = DataManager.cursors && (
            type === 'wallet'
                ? Boolean(DataManager.cursors.orders || DataManager.cursors.deposits)
                : Boolean(DataManager.cursors[type])
        );

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
                        let fetchedAny = false;
                        if (type === 'wallet') {
                            const [ordRes, depRes] = await Promise.all([
                                DataManager.cursors.orders ? DataManager.loadMoreHistoricalData('orders', uid, 15) : Promise.resolve({ success: true, data: [] }),
                                DataManager.cursors.deposits ? DataManager.loadMoreHistoricalData('deposits', uid, 15) : Promise.resolve({ success: true, data: [] })
                            ]);
                            if (!btn.isConnected || isTimeout) return;
                            clearTimeout(watchdog);

                            if (ordRes.data && ordRes.data.length > 0) {
                                this._mergeHistoricalIntoLive('orders', ordRes.data);
                                fetchedAny = true;
                            }
                            if (depRes.data && depRes.data.length > 0) {
                                this._mergeHistoricalIntoLive('deposits', depRes.data);
                                fetchedAny = true;
                            }
                        } else {
                            const res = await DataManager.loadMoreHistoricalData(type, uid, 15);
                            if (!btn.isConnected || isTimeout) return;
                            clearTimeout(watchdog);

                            if (res.success && res.data && res.data.length > 0) {
                                this._mergeHistoricalIntoLive(type, res.data);
                                fetchedAny = true;
                            }
                        }

                        if (fetchedAny) {
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
        const rootCats = cats.filter(c => !c.parentId).sort((a, b) => this._getSortOrder(a) - this._getSortOrder(b));
        
        const layoutConfig = (LiveStoreData.settings?.rootLayout || 'default');
        const currentCatHash = JSON.stringify(rootCats.map(c => c.id + (c.img || ''))) + "_" + layoutConfig;
        const isAlreadyHome = UIState.baseView === 'home' && document.body.classList.contains('is-home');
        const isCategoryView = (UIManager.currentCategoryId === null);
        const hasContent = grid && grid.innerHTML.includes('cat-card') && !grid.innerHTML.includes('skeleton-mode');
        
        if (!isBackAction && isAlreadyHome && isCategoryView && hasContent) {
            if (this._lastHomeHash === currentCatHash) {
                UIManager.closeSidebar?.();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
        }
        
        this._lastHomeHash = currentCatHash;
        this._hideOfferStoriesBar();
        UIManager.setBaseView('home', { categoryId: null, searchQuery: '' });
        
        if (titleEl) { titleEl.classList.remove('show-correct-title'); titleEl.innerText = 'الأقسام الرئيسية'; }
        
        const performRender = () => {
            UIManager.toggleHeroSection?.(true); 
            UIManager.navHistory = []; 
            UIState.navHistory = [];
            UIManager.currentCategoryId = null; 
            UIManager.resetGridScroll?.(); 
            UIManager.renderTicker?.();
            
            if (!isBackAction && UIState.activeModals.length === 0 && window.history.replaceState) {
                window.history.replaceState(null, '', ' ');
            }
            
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
                } else if (finalCats.length > 0 && grid) {
                    const sortedFinal = finalCats.filter(c => !c.parentId).sort((a, b) => this._getSortOrder(a) - this._getSortOrder(b));
                    const combinedHtml = (sortedFinal.length > 0 ? sortedFinal : finalCats).map(c => {
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
        
        let skeletonCount = 4;
        try {
            const cachedCount = localStorage.getItem(CACHE_KEYS.CATS_COUNT);
            if (cachedCount && parseInt(cachedCount, 10) > 0) skeletonCount = parseInt(cachedCount, 10);
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
        
        requestAnimationFrame(() => {
            grid.replaceChildren(this._renderHtmlToFragment(catSkeletons));
        });
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
        
        requestAnimationFrame(() => {
            container.replaceChildren(this._renderHtmlToFragment(skeletonsHTML));
        });
    },

    initTimersEngine: function() {
        const timers = document.getElementsByClassName('live-countdown');
        
        if (timers.length === 0) {
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
                if (timers.length === 0) {
                    clearInterval(window.StoreRenderApp.timerInterval);
                    window.StoreRenderApp.timerInterval = null;
                    return;
                }
                const now = (typeof DataManager !== 'undefined' && typeof DataManager.getNow === 'function') ? DataManager.getNow() : Date.now();

                for (let i = 0; i < timers.length; i++) {
                    const item = timers[i];
                    const expireTime = Number(item.dataset.expire);
                    const diff = expireTime - now;
                    
                    if (diff <= 0 || isNaN(diff)) {
                        if (item.innerText !== "انتهى العرض") item.innerText = "انتهى العرض";
                    } else {
                        const h = Math.floor(diff / (1000 * 60 * 60)), m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)), s = Math.floor((diff % (1000 * 60)) / 1000);
                        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                        if (item.innerText !== timeStr) item.innerText = timeStr; 
                    }
                }
            });
        }, 1000);
    },

    renderOfferStories: function(categoryId) {
        let storiesContainer = document.getElementById('offer-stories-bar');
        if (!storiesContainer) {
            const grid = document.getElementById('store-grid');
            if (!grid || !grid.parentNode) return;
            storiesContainer = document.createElement('div');
            storiesContainer.id = 'offer-stories-bar';
            grid.parentNode.insertBefore(storiesContainer, grid);
        }

        const now = (typeof DataManager !== 'undefined' && typeof DataManager.getNow === 'function') ? DataManager.getNow() : Date.now();
        const userTier = typeof DataManager.getUserTier === 'function' ? DataManager.getUserTier(DataManager.user) : null;
        if (userTier && userTier.type === 'api') {
            storiesContainer.innerHTML = '';
            storiesContainer.style.display = 'none';
            return;
        }

        const activeOffers = (LiveStoreData.offers || []).filter(o => {
            if (!o || !o.isActive || !o.visualConfig?.storyEnabled) return false;
            const startMs = o.startDate ? Utils.parseSafeTime(o.startDate) : 0;
            const expMs = o.expiryDate ? Utils.parseSafeTime(o.expiryDate) : 0;
            if ((startMs > 0 && now < startMs) || (expMs > 0 && now >= expMs)) return false;
            if (Array.isArray(o.targetTiers) && o.targetTiers.length > 0 && userTier?.id) {
                if (!o.targetTiers.map(String).includes(String(userTier.id))) return false;
            }
            return true;
        });

        if (activeOffers.length === 0) { storiesContainer.innerHTML = ''; storiesContainer.style.display = 'none'; return; }

        let storiesHtml = '';
        activeOffers.forEach(offer => {
            try {
                const v = offer.visualConfig;
                const storyProdsArray = v.storyProducts?.length > 0 ? v.storyProducts.map(String) : (offer.targetProds || []).map(String);
                const targetedProds = (LiveStoreData.prods || []).filter(p => {
                    return this._isProductInCategory(p, categoryId) && storyProdsArray.includes(String(p.id));
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
                            const timerContent = offer.expiryDate ? `<span class="live-countdown num-en" data-expire="${Utils.parseSafeTime(offer.expiryDate)}">--:--:--</span>` : '--:--:--';
                            const tIcon = ['timer-bc-pill', 'timer-minimal'].includes(v.grid.timerStyle) ? `<i class="fa-regular fa-clock"></i> ` : (v.grid.timerStyle === 'timer-digital' ? `<i class="fa-solid fa-stopwatch"></i> ` : '');
                            timerHtml = `<div class="${this._safeClass(v.grid.timerStyle)} ${this._getMappedPosition(v.grid.timerPos, 'top-center')}">${tIcon}${timerContent}</div>`;
                        }
                    }

                    const imgObj = this._generateImageHTML(prod.img, Utils.escapeHtml(prod.name), 'story');
                    storiesHtml += `<div class="story-item clickable" data-action="open-product" data-id="${prod.id}"><div class="story-ring ${shapeClass} ${bColorClass}" style="${shapeStyle}"><div class="story-img-wrapper ${shapeClass} ${imgObj.wrapperClass}" style="${shapeStyle} ${imgObj.wrapperStyle}">${imgObj.html}</div>${badgeHtml}${timerHtml}</div><span class="story-title">${Utils.escapeHtml(prod.name)}</span></div>`;
                });
            } catch (e) {
                console.error("🚨 [Render Engine] فشل رسم القصة:", e);
            }
        });

        if (storiesHtml) {
            requestAnimationFrame(() => {
                storiesContainer.replaceChildren(this._renderHtmlToFragment(`<div class="stories-wrapper-scroll">${storiesHtml}</div>`));
                storiesContainer.style.display = 'block';
                this.initTimersEngine(); 
            });
        } else {
            storiesContainer.style.display = 'none';
            storiesContainer.innerHTML = '';
        }
    },
    
    _getCategoryName: function(id) {
        try { const target = (LiveStoreData.cats || []).find(c => String(c.id) === String(id)); return target ? target.name : 'القسم'; } catch(e) { return 'القسم'; }
    },
    
    _renderContent: function(id) {
        const renderId = ++this.currentRenderId;
        UIManager.setBaseView('category', { categoryId: id, searchQuery: '' });
        UIManager.toggleHeroSection?.(false);
        this.renderOfferStories(id);

        const grid = document.getElementById('store-grid');
        UIManager.resetGridScroll?.(); 
        
        const titleEl = document.getElementById('grid-title');
        if(titleEl) { 
            titleEl.innerText = this._getCategoryName(id); 
            titleEl.classList.add('show-correct-title'); 
        }

        const subs = (LiveStoreData.cats || []).filter(c => String(c.parentId) === String(id)).sort((a, b) => this._getSortOrder(a) - this._getSortOrder(b));
        const items = (LiveStoreData.prods || []).filter(p => this._isProductInCategory(p, id)).sort((a, b) => this._getSortOrder(a) - this._getSortOrder(b));

        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if(backBtn) {
            backBtn.style.display = 'flex'; setTimeout(() => backBtn.classList.add('show'), 10);
            backBtn.setAttribute('data-action', 'go-back');
            backBtn.onclick = null;
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
                combinedHtml += items.map((p, idx) => {
                    try { return this._generateProductCardHTML(p, idx); }
                    catch(e) { 
                        console.error("🚨 [Render Engine] فشل رسم المنتج:", p.name, e); 
                        return `<div class="product-card error-card" style="padding:15px; border:1px solid var(--danger); background:rgba(255,0,0,0.05); text-align:center;"><i class="fa-solid fa-triangle-exclamation"></i> غير متاح</div>`; 
                    }
                }).join('');
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
        
        this._hideOfferStoriesBar();
        UIManager.setBaseView('search', { searchQuery: q.trim() });
        UIManager.toggleHeroSection?.(false);

        const term = q.trim().toLowerCase();
        const cleanTerm = term.replace(/[-_.:,]/g, ' ');
        const searchTerms = cleanTerm.split(/\s+/).filter(t => t.length > 0);

        const matchedCats = (LiveStoreData.cats || []).filter(c => c.name?.toLowerCase().replace(/[-_.:,]/g, ' ').includes(cleanTerm));
        
        const activeCatIds = new Set((LiveStoreData.cats || []).map(c => String(c.id)));
        
        const matchedProds = (LiveStoreData.prods || []).filter(p => {
            const prodCats = [].concat(p.categoryId, p.categoryIds).filter(Boolean).map(String);
            const isCatActive = prodCats.some(cid => activeCatIds.has(cid));
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

        UIManager.resetGridScroll?.();
        UIManager.setGridMode?.(null);

        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if(backBtn) {
            backBtn.style.display = 'flex'; setTimeout(() => backBtn.classList.add('show'), 10);
            backBtn.setAttribute('data-action', 'go-back');
            backBtn.onclick = null;
        }

        const titleEl = document.getElementById('grid-title');
        if(titleEl) {
            titleEl.innerText = 'نتائج البحث';
            titleEl.classList.add('show-correct-title');
        }

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
            combinedHtml += matchedProds.map((p, idx) => {
                try { return this._generateProductCardHTML(p, idx); }
                catch(e) { return `<div class="product-card error-card" style="padding:15px; border:1px solid var(--danger); background:rgba(255,0,0,0.05); text-align:center;"><i class="fa-solid fa-triangle-exclamation"></i> غير متاح</div>`; }
            }).join('');
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
        this._hideOfferStoriesBar();
        UIManager.setBaseView('favorites', { categoryId: null, searchQuery: '' });
        UIManager.toggleHeroSection?.(false);
        
        const favIds = DataManager.favs ? Array.from(DataManager.favs).map(String) : [];
        const favProds = (LiveStoreData.prods || []).filter(p => favIds.includes(String(p.id)));
        
        const grid = document.getElementById('store-grid');
        if (!grid) return;
        
        UIManager.setGridMode?.(null);
        UIManager.resetGridScroll?.();
        
        const backBtn = document.getElementById('smart-back-btn') || document.querySelector('.modern-back-btn');
        if (backBtn) {
            backBtn.style.display = 'flex'; setTimeout(() => backBtn.classList.add('show'), 10);
            backBtn.setAttribute('data-action', 'go-back');
            backBtn.onclick = null;
        }
        
        const gridTitle = document.getElementById('grid-title');
        if (gridTitle) { gridTitle.innerText = 'المفضلة'; gridTitle.classList.add('show-correct-title'); }
        
        if (favProds.length === 0) {
            requestAnimationFrame(() => {
                UIManager.setGridMode?.('grid-prods'); 
                grid.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-heart-circle-plus"></i><h3>لا توجد منتجات مفضلة بعد</h3></div>`;
            });
            return;
        }
        
        const combinedHtml = favProds.map((p, idx) => {
            try { return this._generateProductCardHTML(p, idx); }
            catch(e) { return `<div class="product-card error-card" style="padding:15px; border:1px solid var(--danger); background:rgba(255,0,0,0.05); text-align:center;"><i class="fa-solid fa-triangle-exclamation"></i> غير متاح</div>`; }
        }).join('');
        
        requestAnimationFrame(() => {
            if (renderId !== this.currentRenderId) return; 
            
            let activeCols = null;
            if (favProds.length > 0 && LiveStoreData.cats) {
                const prodCats = [].concat(favProds[0].categoryId, favProds[0].categoryIds).filter(Boolean).map(String);
                const parentCatId = prodCats[0] || '';
                const parentCat = LiveStoreData.cats.find(c => String(c.id) === parentCatId);
                if (parentCat && parentCat.layout) activeCols = parentCat.layout;
            }
            
            this._applyGridLayout(grid, LiveStoreData.settings || {}, activeCols, 'prods');
            UIManager.setGridMode?.('grid-prods');
            grid.replaceChildren(this._renderHtmlToFragment(combinedHtml)); 
            
            if (Components?.initProductShine) Components.initProductShine();
            this.initTimersEngine(); 
        });
    },

    renderWallet: function(forceRender = false) {
        if (!forceRender) {
            if (!this._walletDebounced) this._walletDebounced = this._debounce('wallet', () => this.renderWallet(true), 250);
            return this._walletDebounced();
        }

        const filterData = Utils.getSearchAndDateFilters('wallet', 'wallet', DataManager.getNow());
        if (filterData.error) { UIManager.showToast?.(filterData.error, 'error'); return; }
        const { q, dStart, dEnd, tStart, tEnd } = filterData;

        const list = document.getElementById('wallet-list'); 
        if(!list) return; 

        const user = DataManager.user || { id: 0, walletBalance: 0, totalSpent: 0, totalDeposit: 0, baseCurrency: 'USD' };
        const walletCurr = (user.baseCurrency || 'USD').toUpperCase();
        
        const uid = DataManager.activeUid;
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
            const safeStatus = String(d.status || 'pending').toLowerCase();
            const isDeduct = safeStatus === 'deducted' || credited < 0 || Boolean(d.method && String(d.method).includes('خصم'));
            return {
                ...d, type: 'deposit', amountVal: Math.abs(credited), amountCurrency: d.targetCurrency || walletCurr,
                searchKey: `شحن deposit ${credited} #${d.displayId || d.id} ${RenderHelpers.formatDepositId(d).toLowerCase()}`,
                isDeduction: isDeduct, sortTime: safeTime 
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
            const rawHtml = visibleWallet.map(tx => { 
                try { return UIBuilders.buildWalletCard(tx, walletCurr, isFilterActive); } 
                catch (e) { 
                    console.error('🚨 [Render Engine] فشل رسم حركة المحفظة:', e); 
                    return '<div class="sys-error-card" style="padding:15px; margin-bottom:10px; background:var(--bg-glass); border-radius:12px; color:var(--danger); text-align:center;"><i class="fa-solid fa-triangle-exclamation"></i> سجل غير صالح</div>'; 
                } 
            }).join('');
            
            list.replaceChildren(this._renderHtmlToFragment(rawHtml));
            if (!q && !dStart && !dEnd) this._appendLoadMoreButton(list, 'wallet', uid, totalWalletCount, 'wallet');
        });
    },

    renderPayMethods: function() {
        const container = document.getElementById('bal-pay-grid') || document.getElementById('bal-methods-container');
        if (!container) return;
        
        const validPayments = (LiveStoreData.payments || []).filter(p => p?.name?.trim() && p.isActive !== false && p.is_active !== false).sort((a, b) => this._getSortOrder(a) - this._getSortOrder(b));
        
        if (validPayments.length === 0) {
            if (container.dataset.syncDone === 'true') {
                container.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-building-columns"></i><h3>لا توجد طرق دفع متاحة حالياً</h3></div>`;
                return;
            }
            if (!container.querySelector('.fa-circle-notch')) {
                container.innerHTML = `<div class="empty-state-v2" style="min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: none; background: transparent;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size: 32px; color: var(--primary); margin-bottom: 15px;"></i><h3 style="color: var(--text-muted); font-size: 14px; font-weight: 600;">جاري تجهيز بوابات الدفع...</h3></div>`;
            }
            if (!container.dataset.fallbackTimer) {
                const timerId = setTimeout(() => {
                    container.dataset.syncDone = 'true';
                    delete container.dataset.fallbackTimer;
                    this.renderPayMethods();
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
        const uid = DataManager.activeUid;
        const pendingMethodKeys = (LiveStoreData.deposits || [])
            .filter(d => String(d.userId) === String(uid) && d.status === 'pending')
            .map(d => String(d.methodId || d.method).toLowerCase());
        
        validPayments.forEach(p => {
            try {
                const safeName = Utils.escapeHtml(p.name);
                const isLocked = pendingMethodKeys.includes(String(p.id).toLowerCase()) || pendingMethodKeys.includes(String(p.name).toLowerCase());
                
                const rawImg = (p.img && typeof p.img === 'string') ? p.img.trim() : '';
                const safeUrl = (rawImg && rawImg !== 'null' && rawImg !== '#') ? (Utils.safeUrl ? Utils.safeUrl(rawImg) : rawImg) : '#';
                const hasValidImg = Boolean(safeUrl && safeUrl !== '#');
                
                const imgHtml = `
                    <div class="pay-icon-wrapper shimmer-stop-override">
                        ${hasValidImg ? `<img src="${safeUrl}" 
                             alt="${safeName}" 
                             class="pay-icon-img" 
                             style="opacity: 1 !important; visibility: visible !important;" 
                             loading="eager" 
                             decoding="async"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : ''}
                        <div class="pay-icon-default fallback-icon-ready" style="display: ${hasValidImg ? 'none' : 'flex'};">
                            <i class="fa-solid fa-building-columns"></i>
                        </div>
                    </div>`;
                
                if (isLocked) {
                    html += `<div class="pay-card-select method-locked" data-action="locked-pay-toast">${imgHtml}<div class="pay-card-content"><h3 class="pay-card-name">${safeName}</h3><span class="method-locked-warning"><i class="fa-solid fa-hourglass-half"></i> طلب قيد المعالجة</span></div><i class="fa-solid fa-lock pay-card-arrow"></i></div>`;
                } else {
                    html += `<div class="pay-card-select clickable" data-action="select-pay" data-id="${p.id}">${imgHtml}<div class="pay-card-content"><h3 class="pay-card-name">${safeName}</h3></div><i class="fa-solid fa-chevron-left pay-card-arrow"></i></div>`;
                }
            } catch (e) { console.error("🚨 [Render Engine] فشل رسم بوابة الدفع:", e); }
        });
        
        requestAnimationFrame(() => {
            container.innerHTML = html;
        });
    },

    renderOrders: function(forceRender = false) {
        if (!forceRender) { 
            if (!this._ordersDebounced) { 
                this._ordersDebounced = this._debounce('orders', () => this.renderOrders(true), 250); 
            } 
            return this._ordersDebounced(); 
        }

        const renderId = ++this.currentRenderId; 
        UIManager.syncBottomNavUI?.();
        
        const filterData = Utils.getSearchAndDateFilters('order', 'order', DataManager.getNow()); 
        if (filterData.error) { UIManager.showToast?.(filterData.error, 'error'); return; } 
        const { q, dStart, dEnd, tStart, tEnd } = filterData; 
        
        const list = document.getElementById('orders-list'); 
        if (!list) return; 
        
        const uid = DataManager.activeUid; 
        if (!uid || uid === '0' || uid === 'undefined') { 
            list.innerHTML = `<div class="empty-state-v2"> <i class="fa-solid fa-box-open"></i> <h3>يرجى تسجيل الدخول</h3> </div>`; 
            return; 
        } 
        
        this._historicalData = this._historicalData || { deposits: [], orders: [] }; 
        this.limits = this.limits || { payments: 15, wallet: 15, orders: 15 }; 
        
        const rawOrders = [ ...(LiveStoreData.orders || []), ...(this._historicalData.orders || []) ]; 
        const uniqueOrders = Array.from(new Map(rawOrders.map(item => [String(item.id), item])).values()); 
        
        let orders = uniqueOrders
            .filter(o => String(o.userId) === String(uid))
            .map(o => ({ ...o, sortTime: Utils.parseSafeTime(o.time || o.createdAt) })); 
            
        const filters = DataManager.filters || { orders: 'all' }; 
        
        if (filters.orders !== 'all') { 
            orders = orders.filter(o => {
                const st = String(o.status || 'pending').toLowerCase();
                if (filters.orders === 'pending') return ['pending', 'processing'].includes(st);
                if (filters.orders === 'refunded') return ['refunded', 'returned'].includes(st);
                return st === filters.orders;
            }); 
        } 
        
        if (q) { 
            orders = orders.filter(o => 
                String(o.id).toLowerCase().includes(q) || 
                (o.displayId && String(o.displayId).toLowerCase().includes(q)) || 
                RenderHelpers.formatOrderId(o).toLowerCase().includes(q) || 
                (o.product && o.product.toLowerCase().includes(q)) 
            ); 
        } 
        if (tStart) { orders = orders.filter(o => o.sortTime >= tStart); } 
        if (tEnd) { orders = orders.filter(o => o.sortTime <= tEnd); } 
        
        orders.sort((a, b) => { 
            const timeDiff = b.sortTime - a.sortTime; 
            return timeDiff !== 0 ? timeDiff : String(b.id || '').localeCompare(String(a.id || '')); 
        }); 
        
        const totalOrdersCount = orders.length; 
        const displayLimit = (!q && !dStart && !dEnd) ? this.limits.orders : Math.min(orders.length, 50); 
        const visibleOrders = orders.slice(0, displayLimit); 
        
        if (visibleOrders.length === 0) { 
            list.innerHTML = `<div class="empty-state-v2"> <i class="fa-solid fa-box-open"></i> <h3>لا توجد طلبات</h3> </div>`; 
            return; 
        } 
        
        requestAnimationFrame(() => { 
            if (renderId !== this.currentRenderId) return; 
            
            const rawHtml = visibleOrders.map((o, idx) => { 
                try { 
                    const prodName = o.product || (LiveStoreData.prods || []).find( p => String(p.id) === String(o.prodId) )?.name || 'منتج'; 
                    return UIBuilders.buildOrderCard( o, idx, (o.priceCurrency || 'USD').toUpperCase(), this.highlightId, prodName ); 
                } catch (e) { 
                    console.error('🚨 [Render Engine] فشل رسم الطلب:', e); 
                    return '<div class="sys-error-card" style="padding:15px; margin-bottom:10px; background:var(--bg-glass); border-radius:12px; color:var(--danger); text-align:center;"><i class="fa-solid fa-triangle-exclamation"></i> طلب تالف</div>'; 
                } 
            }).join(''); 
            
            list.replaceChildren(this._renderHtmlToFragment(rawHtml)); 
            
            if (!q && !dStart && !dEnd) { 
                this._appendLoadMoreButton(list, 'orders', uid, totalOrdersCount, 'orders'); 
            } 
            
            if (this.highlightId) { 
                const highlightedCard = list.querySelector('.jump-highlight');
                if (highlightedCard) {
                    setTimeout(() => highlightedCard.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                }
                if (this._highlightTimer) { clearTimeout(this._highlightTimer); } 
                this._highlightTimer = setTimeout(() => { this.highlightId = null; this._highlightTimer = null; }, 2500); 
            } 
        }); 
    },

    renderPayments: function(forceRender = false) {
        if (!forceRender) {
            if (!this._paymentsDebounced) {
                this._paymentsDebounced = this._debounce('payments', () => this.renderPayments(true), 250);
            }
            return this._paymentsDebounced();
        }

        const renderId = ++this.currentRenderId;
        
        const filterData = Utils.getSearchAndDateFilters('pay', 'pay', DataManager.getNow());
        if (filterData.error) { UIManager.showToast?.(filterData.error, 'error'); return; }
        const { q, dStart, dEnd, tStart, tEnd } = filterData;

        const list = document.getElementById('mypay-list'); 
        if (!list) return;

        const uid = DataManager.activeUid;
        if (!uid || uid === '0' || uid === 'undefined') {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-file-invoice-dollar"></i><h3>يرجى تسجيل الدخول</h3></div>`;
            return;
        }

        this._historicalData = this._historicalData || { deposits: [], orders: [] };
        this.limits = this.limits || { payments: 15, wallet: 15, orders: 15 };

        const rawDeposits = [...(LiveStoreData.deposits || []), ...(this._historicalData.deposits || [])];
        const uniqueDeposits = Array.from(new Map(rawDeposits.map(item => [String(item.id), item])).values());

        let payments = uniqueDeposits
            .filter(d => String(d.userId) === String(uid))
            .map(d => ({ ...d, sortTime: Utils.parseSafeTime(d.time || d.createdAt) }));

        const filters = DataManager.filters || { payments: 'all' };

        if (filters.payments !== 'all') {
            payments = payments.filter(d => {
                const status = String(d.status || 'pending').toLowerCase();
                if (filters.payments === 'approved') return ['approved', 'completed'].includes(status);
                if (filters.payments === 'rejected') return ['rejected', 'refunded', 'returned', 'deducted'].includes(status);
                return status === filters.payments;
            });
        }

        if (q) {
            payments = payments.filter(d => 
                String(d.id).toLowerCase().includes(q) || 
                (d.displayId && String(d.displayId).toLowerCase().includes(q)) || 
                RenderHelpers.formatDepositId(d).toLowerCase().includes(q) || 
                (d.method && d.method.toLowerCase().includes(q))
            );
        }
        if (tStart) payments = payments.filter(d => d.sortTime >= tStart);
        if (tEnd) payments = payments.filter(d => d.sortTime <= tEnd);

        payments.sort((a, b) => {
            const timeDiff = b.sortTime - a.sortTime;
            return timeDiff !== 0 ? timeDiff : String(b.id || '').localeCompare(String(a.id || ''));
        });

        const totalCount = payments.length;
        const displayLimit = (!q && !dStart && !dEnd) ? this.limits.payments : Math.min(payments.length, 50);
        const visiblePayments = payments.slice(0, displayLimit);

        if (visiblePayments.length === 0) {
            list.innerHTML = `<div class="empty-state-v2"><i class="fa-solid fa-file-invoice-dollar"></i><h3>لا توجد سجلات حالياً</h3></div>`;
            return;
        }

        requestAnimationFrame(() => {
            if (renderId !== this.currentRenderId) return;

            const rawUserName = UIManager._getFullName ? UIManager._getFullName(DataManager.user) : (DataManager.user?.fullName || 'العميل');
            const userIdString = RenderHelpers.formatUserId(DataManager.user);
            const baseCurrency = (DataManager.user?.baseCurrency || 'USD').toUpperCase();

            const rawHtml = visiblePayments.map((d) => {
                try {
                    return UIBuilders.buildPaymentCard(d, rawUserName, userIdString, baseCurrency, this.highlightId);
                } catch (e) {
                    console.error('🚨 [Render Engine] فشل رسم عملية الدفع:', e);
                    return '<div class="sys-error-card" style="padding:15px; margin-bottom:10px; background:var(--bg-glass); border-radius:12px; color:var(--danger); text-align:center;"><i class="fa-solid fa-triangle-exclamation"></i> عملية تالفة</div>';
                }
            }).join('');

            list.replaceChildren(this._renderHtmlToFragment(rawHtml));

            if (!q && !dStart && !dEnd) {
                this._appendLoadMoreButton(list, 'deposits', uid, totalCount, 'payments');
            }

            if (this.highlightId) {
                const highlightedCard = list.querySelector('.jump-highlight');
                if (highlightedCard) {
                    setTimeout(() => highlightedCard.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                }
                if (this._highlightTimer) clearTimeout(this._highlightTimer);
                this._highlightTimer = setTimeout(() => { this.highlightId = null; this._highlightTimer = null; }, 2500);
            }
        });
    },

    // ============================================================================
    // 🖨️ محرك تصدير الفواتير الاحترافي (Real Viewport Masking Technique)
    // ============================================================================
    generateReceiptImage: async function(config) {
        return new Promise(async (resolve) => {
            const containerId = 'receipt-render-box-' + Date.now();
            const maskId = 'receipt-mask-' + Date.now();
            let isResolved = false;
            let isAborted = false; 
            
            const cleanup = () => {
                const container = document.getElementById(containerId);
                const mask = document.getElementById(maskId);
                if (container) container.remove();
                if (mask) mask.remove();
            };
            
            const watchdog = setTimeout(() => {
                if (isResolved) return;
                isAborted = true; 
                console.error("🚨 انقضى وقت تحضير الإيصال. تم إجهاض العملية.");
                cleanup();
                resolve(false);
            }, 15000);
            
            try {
                const settings = LiveStoreData.settings || {};
                const storeName = settings.storeName || 'TeleCard';
                const storeLogo = settings.storeLogoLight || settings.storeLogo || '';
                
                let safeLogoHtml = storeLogo ? `<img src="${Utils.escapeHtml(storeLogo)}" style="max-height: 55px; max-width: 160px; object-fit: contain;" crossorigin="anonymous">` : '';
                const brandHTML = { html: `<div class="header-section"><div class="store-name">${Utils.escapeHtml(storeName)}</div>${safeLogoHtml}</div>` };
                
                const fullHTML = UIBuilders.buildPDFReceipt({ ...config, storeName }, brandHTML.html);
                
                const maskOverlay = document.createElement('div');
                maskOverlay.id = maskId;
                maskOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: var(--bg-body, #0f172a); z-index: 999999; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff;';
                maskOverlay.innerHTML = `<i class="fa-solid fa-file-invoice fa-bounce" style="font-size: 32px; color: var(--primary, #3b82f6); margin-bottom: 15px;"></i><h3 style="font-family: inherit; font-size: 16px;">جاري توثيق الإيصال...</h3>`;
                document.body.appendChild(maskOverlay);

                const container = document.createElement('div');
                container.id = containerId;
                container.style.cssText = 'position: fixed; top: 0; left: 0; width: 420px; z-index: 999998; background-color: #f8fafc; pointer-events: none; margin: 0; transform: none;';
                container.innerHTML = fullHTML;
                document.body.appendChild(container);
                
                const imgs = Array.from(container.querySelectorAll('img'));
                await Promise.all(imgs.map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise(res => { img.onload = res; img.onerror = res; });
                }));
                if (document.fonts && document.fonts.ready) await document.fonts.ready;
                
                await new Promise(res => requestAnimationFrame(() => setTimeout(res, 150)));
                
                if (typeof domtoimage === 'undefined') throw new Error("مكتبة dom-to-image-more مفقودة!");
                if (isAborted) return;
                
                let blob;
                const domToImageOptions = {
                    bgcolor: '#f8fafc',
                    width: 420,
                    cacheBust: true,
                    style: { margin: '0', left: '0', top: '0', transform: 'none' }
                };

                const renderTimeout = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("DOM_RENDER_TIMEOUT")), 10000)
                );

                try {
                    blob = await Promise.race([
                        domtoimage.toBlob(container, domToImageOptions),
                        renderTimeout
                    ]);
                } catch (canvasErr) {
                    console.warn("⚠️ [Receipt Engine] CORS Issue or Timeout Detected. Retrying without images...");
                    
                    const corruptedImgs = container.querySelectorAll('img');
                    corruptedImgs.forEach(img => img.style.display = 'none');
                    
                    const fallbackTimeout = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error("FALLBACK_RENDER_TIMEOUT")), 4000) 
                    );
                    
                    blob = await Promise.race([
                        domtoimage.toBlob(container, domToImageOptions),
                        fallbackTimeout
                    ]);
                }
                
                if (isAborted) return; 
                
                cleanup();
                
                const safeFileName = config.filename || 'receipt.jpg';
                const title = `إيصال إلكتروني - ${storeName}`;
                const blobUrl = URL.createObjectURL(blob);
                
                const dialogId = 'receipt-action-dialog';
                let dialog = document.getElementById(dialogId);
                if (dialog) dialog.remove();
                
                dialog = document.createElement('div');
                dialog.id = dialogId;
                dialog.className = 'sys-dialog-wrapper active master-overlay';
                dialog.style.zIndex = '9999999';
                
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                const canShare = isMobile && navigator.canShare && navigator.canShare({ files: [new File([blob], safeFileName, { type: blob.type })] });
                
                dialog.innerHTML = UIBuilders.buildReceiptActionDialog(blobUrl, canShare);
                document.body.appendChild(dialog);
                
                UIManager.sfx?.('success');
                
                if (canShare) {
                    document.getElementById('btn-native-share')?.addEventListener('click', async () => {
                        try {
                            const file = new File([blob], safeFileName, { type: blob.type });
                            await navigator.share({ title: title, text: 'مرفق الإيصال الإلكتروني لتفاصيل العملية.', files: [file] });
                        } catch (err) {
                            if (err.name !== 'AbortError') console.warn("Share failed", err);
                        }
                    });
                }
                
                document.getElementById('btn-native-download')?.addEventListener('click', () => {
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = safeFileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    UIManager.showToast?.('تم بدء تحميل الإيصال بنجاح', 'success');
                });
                
                const closeDialog = () => {
                    dialog.classList.remove('active');
                    setTimeout(() => { dialog.remove(); URL.revokeObjectURL(blobUrl); }, 300);
                };
                
                dialog.querySelector('.sys-dialog-overlay')?.addEventListener('click', closeDialog);
                document.getElementById('btn-close-receipt-dialog')?.addEventListener('click', closeDialog);
                
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
        
        const allOrders = [...(LiveStoreData.orders || []), ...(this._historicalData?.orders || [])];
        const o = allOrders.find(x => String(x.id) === String(orderId));
        if (!o) return;
        
        let originalHtml = '';
        if (btnElement) { 
            btnElement.disabled = true; 
            originalHtml = btnElement.innerHTML; 
            btnElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحضير...`; 
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const finalPrice = Number(o.pricingSnapshot?.finalPrice ?? o.price ?? 0);
            const originalPrice = Number(o.pricingSnapshot?.originalPrice ?? o.price ?? 0);
            const rawUserName = UIManager._getFullName ? UIManager._getFullName(DataManager.user) : (DataManager.user?.fullName || 'العميل');

            const success = await this.generateReceiptImage({
                type: 'order', 
                filename: `Order_${RenderHelpers.formatOrderId(o)}.jpg`,
                data: {
                    id: o.id, displayId: RenderHelpers.formatOrderId(o),
                    userName: rawUserName, 
                    userDisplayId: RenderHelpers.formatUserId(DataManager.user),
                    status: o.status, product: o.product, 
                    price: finalPrice, originalPrice: originalPrice, priceCurrency: o.priceCurrency || 'USD', 
                    qty: o.qty || 1, 
                    input: o.input || '---',
                    dateTime: RenderHelpers.formatSafeDate(Utils.parseSafeTime(o.time || o.createdAt)),
                    code: (o.status === 'completed' && o.deliveredCode !== 'null') ? o.deliveredCode : null
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

        const allDeposits = [...(LiveStoreData.deposits || []), ...(this._historicalData?.deposits || [])];
        const d = allDeposits.find(x => String(x.id) === String(depositId));
        if (!d) return;
        
        let originalHtml = '';
        if (btnElement) { 
            btnElement.disabled = true; 
            originalHtml = btnElement.innerHTML; 
            btnElement.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحضير...`; 
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const rawAmt = Math.abs(Number(d.amount || 0));
            const credAmt = d.creditedAmount !== undefined ? Math.abs(Number(d.creditedAmount)) : rawAmt;
            const feeVal = Number(d.feeAmount || 0);
            const feePercent = Number(d.feePct || 0);
            const isBonus = d.feeType === 'bonus';
            const rawUserName = UIManager._getFullName ? UIManager._getFullName(DataManager.user) : (DataManager.user?.fullName || 'العميل');

            const success = await this.generateReceiptImage({
                type: 'deposit', 
                filename: `Deposit_${RenderHelpers.formatDepositId(d)}.jpg`,
                data: {
                    id: d.id, displayId: RenderHelpers.formatDepositId(d),
                    userName: rawUserName, 
                    userDisplayId: RenderHelpers.formatUserId(DataManager.user),
                    method: d.method || '---', amount: rawAmt, currency: d.currency || d.targetCurrency || 'USD',
                    feePercent: feePercent, feeVal: feeVal, feeType: isBonus ? 'bonus' : 'fee', 
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
            UIManager.updateNotifBadges?.(0);
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
        UIManager.updateNotifBadges?.(unreadCount);
        
        let html = unreadCount > 0 ? `<div class="nc-top-action-bar"><span class="nc-unread-count-text">لديك <span class="nc-unread-count-num">${unreadCount}</span> جديد</span><button class="btn btn-ghost nc-mark-read-btn" data-action="mark-all-read">تحديد الكل كمقروء</button></div>` : '';
        
        html += allAlerts.slice(0, 30).map(alert => {
            try {
                const isRead = readIds.includes(String(alert.id)) || alert.isRead || Utils.parseSafeTime(alert.createdAt || alert.time) <= serverLastReadTime;
                const targetType = Utils.escapeHtml(alert.targetType || '');
                const targetId = Utils.escapeHtml(alert.targetId || '');
                const iconClass = targetType === 'order' ? 'fa-box-open' : (targetType === 'deposit' ? 'fa-wallet' : (Utils.escapeHtml(alert.icon) || 'fa-bullhorn'));
                return `<div class="nc-item ${isRead ? 'is-read' : 'unread'}" data-action="mark-single-read" data-id="${Utils.escapeHtml(alert.id)}" data-target-type="${targetType}" data-target-id="${targetId}"><div class="nc-icon"><i class="fa-solid ${iconClass}"></i></div><div class="nc-content"><div class="nc-header"><h4 class="nc-title">${Utils.escapeHtml(alert.title || 'إشعار جديد')}</h4><span class="nc-time">${RenderHelpers.formatSafeDate(alert.createdAt || alert.time).split(' | ')[0]}</span></div><p class="nc-msg">${Utils.escapeHtml(alert.message || '')}</p></div>${!isRead ? '<div class="unread-indicator-dot"></div>' : ''}</div>`;
            } catch(e) { 
                console.error('🚨 [Render Engine] فشل رسم الإشعار:', e); 
                return '<div class="nc-item is-read"><div class="nc-content"><p class="nc-msg text-danger">تعذر تحميل الإشعار لخطأ تقني</p></div></div>'; 
            }
        }).join('');
        
        requestAnimationFrame(() => container.replaceChildren(this._renderHtmlToFragment(html)));
    },    

    renderCountryList: function(countries) {
        const listTarget = document.getElementById('countries-list-target');
        if (!listTarget) return;
        
        const active = (countries || []).filter(c => c.isActive !== false && !c.isBanned);
        if (active.length === 0) { listTarget.innerHTML = '<div class="dropdown-item">لا توجد دول متاحة</div>'; return; }
        
        const rawHtml = active.map(c => {
            try { return UIBuilders.buildCountryItem(c); } 
            catch (e) { 
                console.error('🚨 [Render Engine] فشل رسم الدولة:', e); 
                return '<div class="dropdown-item text-danger">دولة غير متاحة</div>'; 
            }
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
            try { return `<div class="term-item-row"><div class="tir-header"><div class="tir-icon"><i class="${Utils.escapeHtml(`fa-solid ${term.icon?.startsWith('fa-') ? term.icon : 'fa-' + (term.icon || 'file-signature')}`)}"></i></div><h3 class="tir-title">${Utils.escapeHtml(term.title || `البند ${index + 1}`)}</h3></div><div class="tir-body"><p class="tir-text">${Utils.escapeHtml(term.text || '')}</p></div></div>`; } 
            catch(e) { 
                console.error('🚨 [Render Engine] فشل رسم السياسة:', e); 
                return `<div class="term-item-row text-danger">بند غير متاح</div>`; 
            }
        }).join('')}</div>`;

        requestAnimationFrame(() => container.replaceChildren(this._renderHtmlToFragment(rawHtml)));
    }
};

if (typeof globalThis !== 'undefined' && !globalThis.RenderManager) {
    Object.defineProperty(globalThis, 'RenderManager', {
        value: RenderManager,
        writable: false,
        configurable: false
    });
}
