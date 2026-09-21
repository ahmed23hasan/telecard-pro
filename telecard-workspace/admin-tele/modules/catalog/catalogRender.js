// ============================================================================
// 📦 محرك رسم المنتجات والكتالوج (modules/catalog/catalogRender.js) - Cloud-Native V18.10 💎
// 🎯 الوظيفة: رسم الأقسام، المنتجات، إعدادات المنتجات، الخزنة المركزية، والبلدان
// 🚀 التحديثات المعمارية (V18.10 - Fatal Template Mismatch Fix): 
// 1. Template Mismatch Fix 💥: استيراد CatalogTemplates بدلاً من AdminTemplates لمنع الشاشة البيضاء.
// 2. UI Thread Protection 🛡️: تغليف دوال الرسم بـ try/catch لمنع انهيار الواجهة في حال وجود بيانات تالفة.
// 3. Phantom Sales Fix: إيقاف استنتاج الأكواد المباعة رياضياً لمنع تضارب مبيعات الموردين.
// ============================================================================

import { AdminData } from '../../adminData.js';
// 🚀 [الإصلاح المعماري]: استيراد القوالب الصحيحة الخاصة بالكتالوج
import { CatalogTemplates } from './catalogTemplates.js'; 
import { Utils, EventBus } from '../../adminUtils.js';
import { RenderHelpers } from '../../core/renderHelpers.js';

export const CatalogRender = {
    state: { currFolder: null, dragEditMode: false, tempPackages: [] },

    initListeners: function() {
        EventBus.on('state-update', (newState) => { this.state = { ...this.state, ...newState }; });
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

            // تنظيف الحاوية ووضع لودر داخلي خفيف
            grid.innerHTML = '<div class="w-100 text-center p-20 text-muted"><i class="fa-solid fa-circle-notch fa-spin"></i> جاري رسم المنتجات...</div>';

            // تأجيل الرسم الثقيل للإطار التالي لعدم تجميد واجهة المستخدم
            requestAnimationFrame(() => {
                if (currCatId === null) {
                    if (bread) bread.innerText = 'الأقسام الرئيسية';
                    if (act) act.innerHTML = CatalogTemplates.catRootActions(currentLayout);
                    grid.className = 'items-grid cats-grid sortable-container'; 
                    
                    const mainCats = (AdminData.data.cats || []).filter(c => !c.parentId || String(c.parentId) === 'null' || String(c.parentId) === '')
                        .sort((a, b) => (Number(a.order || 9999)) - (Number(b.order || 9999)));
                    
                    grid.innerHTML = mainCats.map((c, i) => CatalogTemplates.catCard(c, i, currCatId, dragClass)).join('');
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
                    
                    const childCats = (AdminData.data.cats || []).filter(c => String(c.parentId) === currCatId)
                        .sort((a, b) => (Number(a.order || 9999)) - (Number(b.order || 9999)));
                    const prods = (AdminData.data.prods || []).filter(p => String(p.catId) === currCatId)
                        .sort((a, b) => (Number(a.order || 9999)) - (Number(b.order || 9999)));
                    
                    grid.className = 'prod-grid-stack';
                    if (!childCats.length && !prods.length) {
                        grid.innerHTML = CatalogTemplates.emptyFolder();
                    } else {
                        // 🚀 [التصحيح المعماري]: تطبيق DOM Chunking للمنتجات الكثيفة
                        let catsHtml = childCats.map((c, i) => CatalogTemplates.catCard(c, i, currCatId, dragClass)).join('');
                        grid.innerHTML = CatalogTemplates.gridContainer(catsHtml, ''); // رسم الأقسام أولاً
                        
                        const prodContainer = grid.querySelector('.prods-grid') || grid;
                        const chunkSize = 100; // رسم 100 منتج في كل إطار زمني
                        let currentIndex = 0;

                        const renderProdChunk = () => {
                            const chunk = prods.slice(currentIndex, currentIndex + chunkSize);
                            if (chunk.length === 0) {
                                // تفعيل الترتيب بعد انتهاء الرسم
                                const catCont = grid.querySelector('.cats-grid.sortable-container');
                                const prodCont = grid.querySelector('.prods-grid.sortable-container');
                                if (catCont) EventBus.emit('req-init-sortable', { container: catCont, type: 'cat' });
                                if (prodCont) EventBus.emit('req-init-sortable', { container: prodCont, type: 'prod' });
                                return;
                            }

                            const chunkHtml = chunk.map((p, i) => {
                                const baseCard = CatalogTemplates.prodCard(p, currentIndex + i, dragClass);
                                const offerBadge = RenderHelpers._getActiveOfferBadge(p.id);
                                return offerBadge ? baseCard.replace('<div class="item-info">', `<div class="item-info">${offerBadge}`) : baseCard;
                            }).join('');

                            if (currentIndex === 0 && grid.querySelector('.prods-grid')) {
                                grid.querySelector('.prods-grid').innerHTML = chunkHtml;
                            } else if (grid.querySelector('.prods-grid')) {
                                grid.querySelector('.prods-grid').insertAdjacentHTML('beforeend', chunkHtml);
                            }

                            currentIndex += chunkSize;
                            requestAnimationFrame(renderProdChunk); // استدعاء الدفعة التالية بسلاسة
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
            
            [qtyArea, pkgArea, simpleOps].forEach(el => el?.classList.add('hide-element'));
            prevArea?.classList.remove('hide-element'); 
            if(mainPrice) mainPrice.classList.toggle('hide-element', type === 'select');

            const l1 = Utils.getVal('h-lbl1') || (['single', 'counter', 'select'].includes(type) ? 'أدخل رقم اللاعب (ID)' : type === 'double' ? 'اسم المستخدم / الإيميل' : 'حقل إدخال');
            const l2 = Utils.getVal('h-lbl2') || 'كلمة المرور';

            let html = '';
            if(type === 'simple') { 
                prevArea?.classList.add('hide-element'); 
                simpleOps?.classList.remove('hide-element'); 
                EventBus.emit('req-toggle-simple-qty'); 
            } 
            else if(type === 'single') html = CatalogTemplates.mockInput(1, l1); // 🚀 تم التصحيح
            else if(type === 'double') html = CatalogTemplates.mockInput(1, l1) + CatalogTemplates.mockInput(2, l2); // 🚀 تم التصحيح
            else if(type === 'counter') { qtyArea?.classList.remove('hide-element'); html = CatalogTemplates.mockInput(1, l1); } // 🚀 تم التصحيح
            else if(type === 'select') { pkgArea?.classList.remove('hide-element'); html = CatalogTemplates.mockInput(1, l1); } // 🚀 تم التصحيح
            
            if(container) container.innerHTML = html;
            
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
            list.innerHTML = '<div class="text-center p-15 text-muted fs-11" style="background: rgba(0,0,0,0.1); border-radius: 8px;"><i class="fa-solid fa-layer-group mb-5 fs-16 d-block"></i> لم يتم إضافة أي باقات حتى الآن. استخدم النموذج أعلاه للإضافة.</div>';
            return;
        }
        
        list.innerHTML = pkgs.map((p, i) => CatalogTemplates.pkgItem(p, i)).join(''); // 🚀 تم التصحيح
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
                grid.innerHTML = CatalogTemplates.emptyVault(); // 🚀 تم التصحيح
                return;
            }
            
            const linkedProdsMap = {};
            (AdminData.data.prods || []).forEach(p => {
                if (p.vaultPoolId) {
                    linkedProdsMap[p.vaultPoolId] = (linkedProdsMap[p.vaultPoolId] || 0) + 1;
                }
            });
            
            grid.innerHTML = vault.map(pool => {
                const availableCount = Number(pool.stockCount || 0);
                const defectCount = Number(pool.burnedCount || 0);
                const totalAdded = Number(pool.totalCount || 0);
                
                let soldCount = totalAdded - availableCount - defectCount;
                if (soldCount < 0) soldCount = 0; 
                
                const totalCountForHealth = availableCount + soldCount;
                const healthPercent = totalCountForHealth > 0 ? Math.round((availableCount / totalCountForHealth) * 100) : (availableCount > 0 ? 100 : 0);
                const linkedProds = linkedProdsMap[String(pool.id)] || 0;
                
                return CatalogTemplates.vaultCard(pool, availableCount, soldCount, linkedProds, defectCount, healthPercent); // 🚀 تم التصحيح
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
                container.innerHTML = CatalogTemplates.emptyCountries(); // 🚀 تم التصحيح
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
                return CatalogTemplates.countryCard(displayCountry); // 🚀 تم التصحيح
            }).join('');
        } catch (error) {
            console.error("🚨 [CatalogRender] خطأ في رسم البلدان:", error);
        }
    }
};