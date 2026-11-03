// ============================================================================
// 📦 محرك رسم المنتجات والكتالوج (modules/catalog/catalogRender.js) - Cloud-Native V20.0 💎
// 🎯 الوظيفة: رسم الأقسام، المنتجات، إعدادات المنتجات، الخزنة المركزية، والبلدان
// 🚀 التحديثات المعمارية (V20.0 - Unified Schema & Safe Folder Matching): 
// 1. Safe Category Matching 📂: دعم (categoryId || catId) لمنع اختفاء المنتجات المضافة حديثاً.
// 2. Schema Alignment 🔗: قراءة الصور الموحدة (img/image) والترتيب الموحد (order/sortOrder).
// 3. Vault Accountant Card Sync 💰: رسم بطاقات الخزنة مع تكلفة الكود الواحد وقيمة الأصول المجمدة.
// 4. Render Token & UI Protection 🛡️: منع تداخل دورات الرسم السريعة وحماية خيط الواجهة.
// 5. Simple Product Preview Fix 🐛: إظهار معاينة أسعار المستويات للمنتجات البسيطة.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { CatalogTemplates } from './catalogTemplates.js'; 
import { Utils, EventBus } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

export const CatalogRender = {
    state: { currFolder: null, dragEditMode: false, tempPackages: [] },
    _renderToken: 0,
    _listenersBound: false,
    
    initListeners: function() {
        if (this._listenersBound) return;
        this._listenersBound = true;
        
        EventBus.on('state-update', (newState) => { this.state = { ...this.state, ...newState }; });
        EventBus.on('req-update-price-preview', () => {
            const type = Utils.getVal('pr-type', 'simple');
            const cost = parseFloat(Utils.getVal('pr-cost', 0)) || 0;
            const tiers = AdminData.data.tiers || [];
            window.AdminUI?.CatalogUI?.renderPricePreview?.(type, cost, tiers, this.state.tempPackages || [], window.FinancialEngine);
        });
        EventBus.on('req-toggle-simple-qty', () => {
            const isChecked = document.getElementById('pr-allow-qty')?.checked || false;
            window.AdminUI?.CatalogUI?.toggleSimpleQty?.(isChecked);
        });
    },

    // =========================================================
    // 📦 1. رسم شبكة المنتجات والأقسام
    // =========================================================
    renderProds: function(forceRender = false) {
        try {
            const grid = document.getElementById('prod-grid');
            if (!grid) return;
            
            if (this.state.dragEditMode && !forceRender) return;
            
            const act = document.getElementById('prod-actions');
            const bread = document.getElementById('prod-bread');
            const currCatId = this.state.currFolder != null ? String(this.state.currFolder) : null;
            
            let currentLayout = (currCatId === null || currCatId === 'root') ?
                (AdminData.data.settings?.rootLayout || 2) : 2;
            
            if (currCatId && currCatId !== 'root') {
                const cat = AdminData.data.catsMap?.[currCatId];
                if (cat?.layout) currentLayout = cat.layout;
            }
            
            grid.style.setProperty('--layout-cols', currentLayout);
            const dragClass = this.state.dragEditMode ? 'drag-enabled' : '';

            grid.innerHTML = '<div class="w-100 text-center p-20 text-muted"><i class="fa-solid fa-circle-notch fa-spin"></i> جاري رسم المنتجات...</div>';

            this._renderToken = Date.now();
            const currentToken = this._renderToken;

            requestAnimationFrame(() => {
                if (currCatId === null) {
                    if (bread) bread.innerText = 'الأقسام الرئيسية';
                    if (act) act.innerHTML = CatalogTemplates.catRootActions(currentLayout);
                    grid.className = 'items-grid cats-grid sortable-container'; 
                    
                    const mainCats = (AdminData.data.cats || [])
                        .filter(c => !c.parentId || String(c.parentId) === 'null' || String(c.parentId) === '')
                        .sort((a, b) => (Number(a.order ?? a.sortOrder ?? 9999)) - (Number(b.order ?? b.sortOrder ?? 9999)));
                    
                    if (mainCats.length === 0) {
                        grid.innerHTML = CatalogTemplates.emptyRootCatalog();
                    } else {
                        grid.innerHTML = mainCats.map((c, i) => CatalogTemplates.catCard(c, i, currCatId, dragClass)).join('');
                    }
                    
                    EventBus.emit('req-init-sortable', { container: grid, type: 'cat' });
                } else {
                    const parent = AdminData.data.catsMap?.[currCatId];
                    
                    if (!parent) {
                        this.state.currFolder = null;
                        EventBus.emit('req-update-state', { currFolder: null }); 
                        return this.renderProds(true); 
                    }
                    
                    if (bread) bread.innerText = parent.name;
                    if (act) act.innerHTML = CatalogTemplates.catSubActions(currentLayout);
                    
                    const childCats = (AdminData.data.cats || [])
                        .filter(c => String(c.parentId) === currCatId)
                        .sort((a, b) => (Number(a.order ?? a.sortOrder ?? 9999)) - (Number(b.order ?? b.sortOrder ?? 9999)));
                    
                    const prods = (AdminData.data.prods || [])
                        .filter(p => String(p.categoryId || p.catId || '') === currCatId)
                        .sort((a, b) => (Number(a.order ?? a.sortOrder ?? 9999)) - (Number(b.order ?? b.sortOrder ?? 9999)));
                    
                    grid.className = 'prod-grid-stack';
                    if (!childCats.length && !prods.length) {
                        grid.innerHTML = CatalogTemplates.emptyFolder();
                    } else {
                        let catsHtml = childCats.map((c, i) => CatalogTemplates.catCard(c, i, currCatId, dragClass)).join('');
                        grid.innerHTML = CatalogTemplates.gridContainer(catsHtml, ''); 
                        
                        const chunkSize = 100; 
                        let currentIndex = 0;

                        const renderProdChunk = () => {
                            if (this._renderToken !== currentToken) return;
                            if (String(currCatId) !== String(AdminData.currFolder)) return;
                            
                            const chunk = prods.slice(currentIndex, currentIndex + chunkSize);
                            if (chunk.length === 0) {
                                const catCont = grid.querySelector('.cats-grid.sortable-container');
                                const prodCont = grid.querySelector('.prods-grid.sortable-container');
                                if (catCont) EventBus.emit('req-init-sortable', { container: catCont, type: 'cat' });
                                if (prodCont) EventBus.emit('req-init-sortable', { container: prodCont, type: 'prod' });
                                return;
                            }

                            const chunkHtml = chunk.map((p, i) => {
                                const baseCard = CatalogTemplates.prodCard(p, currentIndex + i, dragClass);
                                const offerBadge = RenderHelpers._getActiveOfferBadge ? RenderHelpers._getActiveOfferBadge(p.id) : null;
                                return offerBadge ? baseCard.replace('<div class="item-info">', `<div class="item-info">${offerBadge}`) : baseCard;
                            }).join('');

                            const targetProdGrid = grid.querySelector('.prods-grid');
                            if (currentIndex === 0 && targetProdGrid) {
                                targetProdGrid.innerHTML = chunkHtml;
                            } else if (targetProdGrid) {
                                targetProdGrid.insertAdjacentHTML('beforeend', chunkHtml);
                            }

                            currentIndex += chunkSize;
                            requestAnimationFrame(renderProdChunk); 
                        };

                        requestAnimationFrame(renderProdChunk);
                    }
                }
                
                const syncToggle = document.getElementById('sync-grid-store');
                if (syncToggle) syncToggle.checked = !!AdminData.data.settings?.syncGridLayout;
            });

        } catch (error) {
            console.error("🚨 [CatalogRender] خطأ في رسم المنتجات:", error);
        }
    },

    // =========================================================
    // ⚙️ 2. رسم إعدادات شكل حقول المنتج (Mockups)
    // =========================================================
    renderProdConfig: function() {
        try {
            const typeEl = document.getElementById('pr-type'); 
            if(!typeEl) return;
            
            const type = typeEl.value;
            const container = document.getElementById('mock-container'), 
                  qtyArea = document.getElementById('qty-area'), 
                  pkgArea = document.getElementById('pkg-area'), 
                  prevArea = document.getElementById('preview-area'), 
                  mainPrice = document.getElementById('main-price-area'), 
                  simpleOps = document.getElementById('simple-options');
            
            // 🚀 [الإصلاح المعماري]: إظهار المعاينة للمنتجات البسيطة
            [qtyArea, pkgArea, simpleOps].forEach(el => el?.classList.add('hide-element'));
            prevArea?.classList.remove('hide-element'); 
            if (mainPrice) mainPrice.classList.toggle('hide-element', type === 'select');
            
            const parentVaultGroup = document.getElementById('parent-vault-group');
            if (parentVaultGroup) parentVaultGroup.classList.toggle('hide-element', type === 'select');
            
            const suppSelect = document.getElementById('pr-supplier');
            const extWrap = document.getElementById('pr-supplier-ext-wrap');
            if (extWrap) extWrap.classList.toggle('hide-element', !suppSelect?.value || type === 'select');

            const l1 = Utils.getVal('h-lbl1') || (['single', 'counter', 'select'].includes(type) ? 'أدخل رقم اللاعب (ID)' : type === 'double' ? 'اسم المستخدم / الإيميل' : 'حقل إدخال');
            const l2 = Utils.getVal('h-lbl2') || 'كلمة المرور';

            let html = '';
            if(type === 'simple') { 
                simpleOps?.classList.remove('hide-element'); 
                EventBus.emit('req-toggle-simple-qty'); 
            } 
            else if(type === 'single') html = CatalogTemplates.mockInput(1, l1); 
            else if(type === 'double') html = CatalogTemplates.mockInput(1, l1) + CatalogTemplates.mockInput(2, l2); 
            else if(type === 'counter') { qtyArea?.classList.remove('hide-element'); html = CatalogTemplates.mockInput(1, l1); } 
            else if(type === 'select') { pkgArea?.classList.remove('hide-element'); html = CatalogTemplates.mockInput(1, l1); } 
            
            if(container) {
                container.innerHTML = html;
                container.classList.toggle('hide-element', type === 'simple');
            }
            
            EventBus.emit('req-update-price-preview');
        } catch (error) {
            console.error("🚨 [CatalogRender] خطأ في رسم إعدادات المنتج:", error);
        }
    },

    renderPkgList: function() {
        const list = document.getElementById('pkg-list'); 
        if(!list) return;
        
        const pkgs = this.state.tempPackages || [];
        if (pkgs.length === 0) {
            list.innerHTML = CatalogTemplates.emptyPackages();
            return;
        }
        
        list.innerHTML = pkgs.map((p, i) => CatalogTemplates.pkgItem(p, i)).join(''); 
    },

    // =========================================================
    // 🏦 3. رسم الخزنة المركزية (Vault)
    // =========================================================
    renderVault: function() {
        try {
            const grid = document.getElementById('vault-grid');
            if (!grid) return;
            
            const vault = AdminData.data.vault || [];
            if (!vault.length) {
                grid.innerHTML = CatalogTemplates.emptyVault(); 
                return;
            }
            
            const linkedProdsMap = {};
            (AdminData.data.prods || []).forEach(p => {
                if (p.vaultPoolId) {
                    linkedProdsMap[p.vaultPoolId] = (linkedProdsMap[p.vaultPoolId] || 0) + 1;
                }
                if (Array.isArray(p.options)) {
                    p.options.forEach(opt => {
                        if (opt && opt.vaultPoolId) {
                            linkedProdsMap[opt.vaultPoolId] = (linkedProdsMap[opt.vaultPoolId] || 0) + 1;
                        }
                    });
                }
            });
            
            grid.innerHTML = vault.map(pool => {
                const availableCount = Number(pool.stockCount || 0);
                const defectCount = Number(pool.burnedCount || 0);
                const totalAdded = Number(pool.totalCount || availableCount);
                
                let soldCount = Math.max(0, totalAdded - availableCount - defectCount);
                const totalCountForHealth = availableCount + soldCount;
                const healthPercent = totalCountForHealth > 0 ? Math.round((availableCount / totalCountForHealth) * 100) : (availableCount > 0 ? 100 : 0);
                const linkedProds = linkedProdsMap[String(pool.id)] || 0;
                
                return CatalogTemplates.vaultCard(pool, availableCount, soldCount, linkedProds, defectCount, healthPercent); 
            }).join('');
        } catch (error) {
            console.error("🚨 [CatalogRender] خطأ في رسم الخزنة:", error);
        }
    },

    // =========================================================
    // 🌍 4. رسم البلدان (Countries)
    // =========================================================
    renderCountries: function() {
        try {
            const container = document.getElementById('countries-grid'); 
            if(!container) return;
            
            const countries = AdminData.data.countries || [];
            if(countries.length === 0) { 
                container.innerHTML = CatalogTemplates.emptyCountries(); 
                return; 
            }

            container.innerHTML = countries.map(c => {
                const displayCountry = {
                    ...c,
                    flag: c.flag || '🇸🇦',
                    currency: c.currency || 'SAR',
                    dialCode: c.dialCode || '+966',
                    code: c.code || 'SA'
                };
                return CatalogTemplates.countryCard(displayCountry); 
            }).join('');
        } catch (error) {
            console.error("🚨 [CatalogRender] خطأ في رسم البلدان:", error);
        }
    }
};
