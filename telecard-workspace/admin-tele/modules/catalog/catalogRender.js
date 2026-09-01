// ============================================================================
// 📦 محرك رسم المنتجات والكتالوج (modules/catalog/catalogRender.js) - Enterprise V15.1 💎
// 🎯 الوظيفة: رسم الأقسام، المنتجات، إعدادات المنتجات، الخزنة المركزية، والبلدان
// 🚀 التحديثات المعمارية: 
// 1. Defective Codes Sync: ربط عداد الأكواد التالفة بحقل (burnedCount) القادم من السيرفر.
// 2. Empty States UX: تحسين واجهة الباقات (الخيارات) برسالة مساعدة عند الإفراغ.
// 3. Phantom Sales Fix: إيقاف استنتاج الأكواد المباعة رياضياً لمنع تضارب مبيعات الموردين.
// 4. Brittle Regex Fix: تمرير كلاسات السحب برمجياً للـ Templates لحماية الواجهة من الانهيار.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
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

        if (currCatId === null) {
            bread.innerText = 'الأقسام الرئيسية';
            act.innerHTML = AdminTemplates.catRootActions(currentLayout);
            grid.className = 'items-grid cats-grid sortable-container'; 
            
            const mainCats = (AdminData.data.cats || []).filter(c => !c.parentId || String(c.parentId) === 'null' || String(c.parentId) === '')
                .sort((a, b) => (Number(a.order || 9999)) - (Number(b.order || 9999)));
            
            grid.innerHTML = mainCats.map((c, i) => AdminTemplates.catCard(c, i, currCatId, dragClass)).join('');
            
            EventBus.emit('req-init-sortable', { container: grid, type: 'cat' });
        } else {
            const parent = AdminData.data.catsMap?.[currCatId];
            
            if (!parent) {
                this.state.currFolder = null;
                EventBus.emit('req-update-state', { currFolder: null }); 
                return this.renderProds(true); 
            }
            
            bread.innerText = parent.name;
            act.innerHTML = AdminTemplates.catSubActions(currentLayout);
            
            const childCats = (AdminData.data.cats || []).filter(c => String(c.parentId) === currCatId)
                .sort((a, b) => (Number(a.order || 9999)) - (Number(b.order || 9999)));
            const prods = (AdminData.data.prods || []).filter(p => String(p.catId) === currCatId)
                .sort((a, b) => (Number(a.order || 9999)) - (Number(b.order || 9999)));
            
            grid.className = 'prod-grid-stack';
            if (!childCats.length && !prods.length) {
                grid.innerHTML = AdminTemplates.emptyFolder();
            } else {
                let catsHtml = childCats.map((c, i) => AdminTemplates.catCard(c, i, currCatId, dragClass)).join('');
                
                let prodsHtml = prods.map((p, i) => {
                    const baseCard = AdminTemplates.prodCard(p, i, dragClass);
                    const offerBadge = RenderHelpers._getActiveOfferBadge(p.id);
                    return offerBadge ? baseCard.replace('<div class="item-info">', `<div class="item-info">${offerBadge}`) : baseCard;
                }).join('');
                
                grid.innerHTML = AdminTemplates.gridContainer(catsHtml, prodsHtml);
            }
            
            requestAnimationFrame(() => {
                const catCont = grid.querySelector('.cats-grid.sortable-container');
                const prodCont = grid.querySelector('.prods-grid.sortable-container');
                if (catCont) EventBus.emit('req-init-sortable', { container: catCont, type: 'cat' });
                if (prodCont) EventBus.emit('req-init-sortable', { container: prodCont, type: 'prod' });
            });
        }
        
        const syncToggle = document.getElementById('sync-grid-store');
        if (syncToggle) syncToggle.checked = !!AdminData.data.settings?.syncGridLayout;
    },

    // =========================================================
    // ⚙️ 2. رسم إعدادات شكل حقول المنتج (Mockups)
    // =========================================================
    renderProdConfig: function() {
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
        else if(type === 'single') html = AdminTemplates.mockInput(1, l1);
        else if(type === 'double') html = AdminTemplates.mockInput(1, l1) + AdminTemplates.mockInput(2, l2);
        else if(type === 'counter') { qtyArea?.classList.remove('hide-element'); html = AdminTemplates.mockInput(1, l1); }
        else if(type === 'select') { pkgArea?.classList.remove('hide-element'); html = AdminTemplates.mockInput(1, l1); }
        
        if(container) container.innerHTML = html;
        
        EventBus.emit('req-update-price-preview');
    },

    renderPkgList: function() {
        const list = document.getElementById('pkg-list'); 
        if(!list) return;
        
        const pkgs = this.state.tempPackages || [];
        if (pkgs.length === 0) {
            list.innerHTML = '<div class="text-center p-15 text-muted fs-11" style="background: rgba(0,0,0,0.1); border-radius: 8px;"><i class="fa-solid fa-layer-group mb-5 fs-16 d-block"></i> لم يتم إضافة أي باقات حتى الآن. استخدم النموذج أعلاه للإضافة.</div>';
            return;
        }
        
        list.innerHTML = pkgs.map((p, i) => AdminTemplates.pkgItem(p, i)).join('');
    },

    // =========================================================
    // 🏦 3. رسم الخزنة المركزية (Vault)
    // =========================================================
    renderVault: function() {
        const grid = document.getElementById('vault-grid'); 
        if(!grid) return;
        
        const vault = AdminData.data.vault || [];
        if(!vault.length) { 
            grid.innerHTML = AdminTemplates.emptyVault(); 
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
            const soldCount = Number(pool.soldCount || 0); 
            
            // 🚀 [التصحيح المعماري]: قراءة عداد الأكواد التالفة مباشرة من السيرفر
            const defectCount = Number(pool.burnedCount || 0); 
            
            const totalCountForHealth = availableCount + soldCount;
            const healthPercent = totalCountForHealth > 0 ? Math.round((availableCount / totalCountForHealth) * 100) : (availableCount > 0 ? 100 : 0);
            const linkedProds = linkedProdsMap[String(pool.id)] || 0;
            
            return AdminTemplates.vaultCard(pool, availableCount, soldCount, linkedProds, defectCount, healthPercent);
        }).join('');
    },

    // =========================================================
    // 🌍 4. رسم البلدان (Countries)
    // =========================================================
    renderCountries: function() {
        const container = document.getElementById('countries-grid'); 
        if(!container) return;
        
        const countries = AdminData.data.countries || [];
        if(countries.length === 0) { 
            container.innerHTML = AdminTemplates.emptyCountries(); 
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
            return AdminTemplates.countryCard(displayCountry);
        }).join('');
    }
};
