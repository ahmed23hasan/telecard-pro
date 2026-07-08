// ============================================================================
// 📦 محرك رسم المنتجات والكتالوج (modules/catalog/catalogRender.js) - Pro 🚀
// 🎯 الوظيفة: رسم الأقسام، المنتجات، إعدادات المنتجات، الخزنة المركزية، والبلدان
// 🌟 التحديث الأقصى: 
// 1. [Subcollections Compatibility]: توافق رادار المخزون مع الـ Cloud Counters.
// 2. [O(1) Optimization]: بناء فهارس سريعة قبل الرسم لتحسين الأداء.
// 3. [Visual Stability]: منع الارتعاش أثناء إعادة الترتيب.
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
    renderProds: function() {
        const grid = document.getElementById('prod-grid'); 
        if(!grid) return;
        
        // 🌟 استقرار بصري (Anti-Flicker): لا نُعيد الرسم إذا كان الأدمن يقوم بالترتيب
        if (this.state.dragEditMode) return;
        
        const act = document.getElementById('prod-actions');
        const bread = document.getElementById('prod-bread');
        const currCatId = this.state.currFolder != null ? String(this.state.currFolder) : null;

        let currentLayout = (currCatId === null || currCatId === 'root') 
            ? (AdminData.data.settings?.rootLayout || 2) 
            : 2;

        if (currCatId && currCatId !== 'root') {
            const cat = AdminData.data.catsMap?.[currCatId]; // ⚡ جلب O(1)
            if (cat?.layout) currentLayout = cat.layout;
        }

        grid.style.setProperty('--layout-cols', currentLayout);

        if(currCatId === null) {
            bread.innerText = 'الأقسام الرئيسية';
            act.innerHTML = AdminTemplates.catRootActions(currentLayout);
            grid.className = 'items-grid cats-grid';
            
            const mainCats = (AdminData.data.cats || []).filter(c => !c.parentId || String(c.parentId) === 'null' || String(c.parentId) === '')
                .sort((a,b) => (Number(a.order || 9999)) - (Number(b.order || 9999)));
            
            grid.innerHTML = mainCats.map((c, i) => AdminTemplates.catCard(c, i, currCatId)).join('');
            EventBus.emit('req-init-sortable', { container: grid, type: 'cat' });
        } else {
            const parent = AdminData.data.catsMap?.[currCatId]; // ⚡ جلب O(1)
            if(!parent) { 
                this.state.currFolder = null; 
                EventBus.emit('state-update', { currFolder: null }); 
                return this.renderProds(); 
            }
            
            bread.innerText = parent.name;
            act.innerHTML = AdminTemplates.catSubActions(currentLayout);
            
            const childCats = (AdminData.data.cats || []).filter(c => String(c.parentId) === currCatId)
                .sort((a,b) => (Number(a.order || 9999)) - (Number(b.order || 9999)));
            const prods = (AdminData.data.prods || []).filter(p => String(p.catId) === currCatId)
                .sort((a,b) => (Number(a.order || 9999)) - (Number(b.order || 9999)));

            grid.className = 'prod-grid-stack';
            if(!childCats.length && !prods.length) { 
                grid.innerHTML = AdminTemplates.emptyFolder(); 
            } else {
                let catsHtml = childCats.map((c, i) => AdminTemplates.catCard(c, i, currCatId)).join('');
                let prodsHtml = prods.map((p, i) => {
                    const baseCard = AdminTemplates.prodCard(p, i);
                    const offerBadge = RenderHelpers._getActiveOfferBadge(p.id);
                    return offerBadge ? baseCard.replace('<div class="item-info">', `<div class="item-info">${offerBadge}`) : baseCard;
                }).join('');
                grid.innerHTML = AdminTemplates.gridContainer(catsHtml, prodsHtml);
            }
            
            const catCont = grid.querySelector('.cats-grid.sortable-container'); 
            const prodCont = grid.querySelector('.prods-grid.sortable-container');
            if(catCont) EventBus.emit('req-init-sortable', { container: catCont, type: 'cat' });
            if(prodCont) EventBus.emit('req-init-sortable', { container: prodCont, type: 'prod' });
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
        list.innerHTML = (this.state.tempPackages || []).map((p, i) => AdminTemplates.pkgItem(p, i)).join('');
    },

    // =========================================================
    // 🏦 3. رسم الخزنة المركزية (Vault) - Optimized for Subcollections
    // =========================================================
    renderVault: function() {
        const grid = document.getElementById('vault-grid'); 
        if(!grid) return;
        
        const vault = AdminData.data.vault || [];
        if(!vault.length) { 
            grid.innerHTML = AdminTemplates.emptyVault(); 
            return; 
        }
        
        // ⚡ بناء فهرس لعد المنتجات المرتبطة بـ O(N) مرة واحدة فقط خارج الـ Loop
        const linkedProdsMap = {};
        (AdminData.data.prods || []).forEach(p => {
            if (p.vaultPoolId) {
                linkedProdsMap[p.vaultPoolId] = (linkedProdsMap[p.vaultPoolId] || 0) + 1;
            }
        });
        
        grid.innerHTML = vault.map(pool => {
            // 🛡️ التحديث الجذري: قراءة العداد القادم من السيرفر مباشرة (Subcollection Counters)
            const availableCount = Number(pool.stockCount || 0); 
            // بما أن الأكواد المباعة تنقل، نعتبر المباع صفر للواجهة أو نستخدم عداداً إذا كان موجوداً
            const soldCount = Number(pool.soldCount || 0); 
            const defectCount = Number(pool.defectCount || 0);
            
            const totalCount = availableCount + soldCount + defectCount;
            const healthPercent = totalCount > 0 ? Math.round((availableCount / totalCount) * 100) : 0;
            const linkedProds = linkedProdsMap[String(pool.id)] || 0;
            
            // تمرير الأرقام الدقيقة للقالب
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