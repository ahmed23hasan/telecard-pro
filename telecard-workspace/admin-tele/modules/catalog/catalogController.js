// ============================================================================
// 🧠 متحكم الكتالوج (modules/catalog/catalogController.js) - النسخة V10.1 💎
// 🎯 الوظيفة: المنطق التجاري للمنتجات، الأقسام، الدول، وصناديق الأكواد (Vault)
// 🌟 التحديث الأقصى: 
// 1. [Server-Side Vault]: نقل التشفير والحفظ كلياً للسيرفر لمنع تشنج متصفح الأدمن.
// 2. [Fail-Fast UI]: منع الأدمن من حفظ أسعار فلكية تتجاوز 10,000$.
// 3. [Decoupling]: هندسة نظيفة ومعزولة للتحكم بمخزون المتجر.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { TelecardPricingEngine } from '../../adminConfig.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const CatalogController = {
    tempPackages: [],

    // =========================================================
    // 📦 1. إدارة المنتجات والأقسام
    // =========================================================
    openProductModal: function(id = null) {
        let strId = id ? String(id) : null;
        
        // ⚡ جلب سريع بـ O(1) بدلاً من البحث في المصفوفة
        if (!strId && !AdminData.currFolder) {
            EventBus.emit('req-show-toast', {message:'يرجى الدخول إلى قسم أولاً لإضافة المنتج.', type:'warning'});
            return;
        }
        
        EventBus.emit('req-update-state', { tempEditId: strId, tempImg: null });
        
        const p = strId ? (AdminData.data.prodsMap?.[strId] || (AdminData.data.prods || []).find(x => String(x.id) === strId)) : null;
        this.tempPackages = p ? (p.options || []) : [];
        EventBus.emit('req-update-state', { tempPackages: this.tempPackages });
        
        AdminUI?.CatalogUI?.setupProductModal?.(p, AdminData.data.vault || []);
        EventBus.emit('req-render-prod-config');
        AdminRender?.renderPkgList?.();
        this.updatePricePreview();
        EventBus.emit('req-open-modal', 'prod');
    },

    updatePricePreview: function() {
        const type = Utils.getVal('pr-type', 'simple');
        const cost = parseFloat(Utils.getVal('pr-cost', 0)) || 0;
        const tiers = AdminData.data.tiers || [];
        AdminUI?.CatalogUI?.renderPricePreview?.(type, cost, tiers, this.tempPackages, TelecardPricingEngine);
    },

    saveProd: async function() {
        const name = Utils.escapeHTML(Utils.getVal('pr-name'));
        const type = Utils.getVal('pr-type');
        
        if (!name) return EventBus.emit('req-show-toast', {message:'يرجى إدخال اسم المنتج', type:'error'});

        const rawCost = parseFloat(Utils.getVal('pr-cost')) || 0;
        if (rawCost <= 0 && type !== 'select') {
            return EventBus.emit('req-show-toast', {message:'لا يمكن أن تكون التكلفة 0 للمنتجات الفردية', type:'error'});
        }

        // 🛡️ [تنبيه أمان الواجهة]: تطبيق قاعدة (Fail-Fast) لمنع الإدخال الفلكي في الواجهة!
        const MAX_PRICE_LIMIT = 10000;
        if (rawCost > MAX_PRICE_LIMIT) {
            return EventBus.emit('req-show-toast', { 
                message: `مرفوض: لا يمكن إضافة منتج سعر تكلفته يتجاوز ${MAX_PRICE_LIMIT}$ لحماية النظام.`, 
                type: 'error' 
            });
        }

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري معالجة وحفظ بيانات المنتج...');

        try {
            const hasImg = AdminUI?.CatalogUI?.hasImage?.('pr-img-wrap');
            const tempEditId = AdminData.tempEditId;
            const oldImg = tempEditId ? AdminData.data.prodsMap?.[tempEditId]?.img : null;
            
            let finalImg = oldImg || '';
            if (hasImg) {
                const fileInput = document.getElementById('pr-img-input');
                if (fileInput?.files?.[0]) {
                    EventBus.emit('req-show-toast', {message:'جاري رفع الصورة للسحابة...', type:'info'});
                    finalImg = await FirebaseAdapter.uploadImage(fileInput.files[0], 'products', null, oldImg);
                }
            }

            const vaultPoolId = Utils.getVal('pr-vault');
            const isEdit = !!tempEditId;
            const newProdId = isEdit ? String(tempEditId) : 'prod_' + Date.now();

            let newProd = {
                id: newProdId,
                catId: AdminData.currFolder != null ? String(AdminData.currFolder) : null,
                name: name,
                description: Utils.escapeHTML(Utils.getVal('pr-desc')),
                type: type,
                img: finalImg,
                costPrice: rawCost,
                vaultPoolId: vaultPoolId,
                hideGridPrice: Utils.getCheck('pr-hide-price')
            };

            const l1 = Utils.escapeHTML(Utils.getVal('h-lbl1')) || 'حقل إدخال';
            const l2 = Utils.escapeHTML(Utils.getVal('h-lbl2')) || 'كلمة المرور';

            if (type === 'simple') {
                newProd.allowQty = Utils.getCheck('pr-allow-qty');
                newProd.simpleMax = parseInt(Utils.getVal('pr-simple-max')) || 10;
            } else if (type === 'single') newProd.input1Label = l1;
            else if (type === 'double') { newProd.input1Label = l1; newProd.input2Label = l2; }
            else if (type === 'counter') {
                newProd.minQty = parseInt(Utils.getVal('pr-min')) || 1;
                newProd.maxQty = parseInt(Utils.getVal('pr-max')) || 100;
                newProd.input1Label = l1;
            } else if (type === 'select') {
                if (this.tempPackages.length === 0) throw new Error('يرجى إضافة باقة (خيار) واحد على الأقل للمنتج المتعدد.');
                newProd.options = this.tempPackages;
                newProd.input1Label = l1;
            }

            if (isEdit) {
                const idx = AdminData.data.prods.findIndex(x => String(x.id) === newProdId);
                if (idx > -1) { newProd.order = AdminData.data.prods[idx].order; AdminData.data.prods[idx] = newProd; }
            } else {
                const sameCatProds = AdminData.data.prods.filter(p => String(p.catId) === String(AdminData.currFolder));
                newProd.order = sameCatProds.length > 0 ? Math.max(...sameCatProds.map(p => Number(p.order) || -1)) + 1 : 0;
                AdminData.data.prods.push(newProd);
            }

            // ⚡ التحديث الفوري للـ Map
            if (!AdminData.data.prodsMap) AdminData.data.prodsMap = {};
            AdminData.data.prodsMap[newProd.id] = newProd;

            await AdminData?.saveProducts?.();
            
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-prods',
                modalId: 'prod',
                logAction: isEdit ? 'EDIT_PROD' : 'ADD_PROD',
                logDetails: `تحديث منتج: ${name}`,
                toastMsg: 'تم حفظ المنتج بنجاح'
            });
            
        } catch (error) {
            EventBus.emit('req-show-toast', {message:'فشل الحفظ: ' + (error.message || 'خطأ غير معروف'), type:'error'});
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    saveCat: async function() {
        const name = Utils.escapeHTML(Utils.getVal('c-name'));
        if (!name) return EventBus.emit('req-show-toast', {message:'يرجى إدخال اسم القسم', type:'warning'});

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إنشاء وتوثيق القسم سحابياً...');

        try {
            const hasImg = AdminUI?.CatalogUI?.hasImage?.('c-img-wrap');
            const tempEditId = AdminData.tempEditId;
            const oldImg = tempEditId ? AdminData.data.catsMap?.[tempEditId]?.img : null;
            
            let finalImg = oldImg || '';
            if (hasImg) {
                const fileInput = document.getElementById('c-img-input');
                if (fileInput?.files?.[0]) finalImg = await FirebaseAdapter.uploadImage(fileInput.files[0], 'categories', null, oldImg);
            }

            const isEdit = !!tempEditId;
            const catId = isEdit ? String(tempEditId) : 'cat_' + Date.now();

            if (isEdit) {
                const c = AdminData.data.cats.find(x => String(x.id) === catId);
                if (c) { c.name = name; c.img = finalImg; }
            } else {
                const sameParentCats = AdminData.data.cats.filter(c => String(c.parentId) === String(AdminData.currFolder));
                const maxOrder = sameParentCats.length > 0 ? Math.max(...sameParentCats.map(c => Number(c.order) || -1)) + 1 : 0;
                AdminData.data.cats.push({ id: catId, name: name, parentId: AdminData.currFolder != null ? String(AdminData.currFolder) : null, img: finalImg, order: maxOrder });
            }

            await AdminData?.saveCategories?.();
            
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-prods',
                modalId: 'cat',
                logAction: isEdit ? 'EDIT_CAT' : 'ADD_CAT',
                logDetails: `تحديث قسم: ${name}`,
                toastMsg: 'تم حفظ القسم بنجاح'
            });
            
        } catch (error) {
            EventBus.emit('req-show-toast', {message:'فشل الحفظ: ' + error.message, type:'error'});
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    deleteProduct: async function(id) {
        if (AdminUI && await AdminUI.showConfirm('هل أنت متأكد من حذف هذا المنتج نهائياً؟')) {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري مسح بيانات المنتج...');
            
            try {
                const prod = AdminData.data.prodsMap?.[id] || AdminData.data.prods.find(p => String(p.id) === String(id));
                const prodName = prod?.name || 'المنتج';
                
                if (prod?.img) await FirebaseAdapter.deleteImageByUrl(prod.img).catch(() => {});
                
                AdminData.data.prods = AdminData.data.prods.filter(p => String(p.id) !== String(id));
                if(AdminData.data.prodsMap) delete AdminData.data.prodsMap[id];

                await AdminData?.saveProducts?.();
                
                if (AdminData?.addLog) AdminData.addLog('DELETE_PROD', `تم حذف المنتج: ${prodName}`);
                EventBus.emit('req-render-prods');
                EventBus.emit('req-show-toast', { message: 'تم مسح المنتج وصورته بنجاح', type: 'success' });
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },
    
    deleteCategory: async function(id) {
    if (AdminUI && await AdminUI.showConfirm('تحذير: سيتم حذف القسم وكل المنتجات والأقسام الفرعية التابعة له. المتابعة؟')) {
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حرق بيانات القسم وتوابعه سحابياً...');
        
        try {
            const catId = String(id);
            const categoryToDelete = AdminData.data.catsMap?.[catId] || AdminData.data.cats.find(c => String(c.id) === catId);
            const catName = categoryToDelete?.name || 'القسم';
            
            // 🛡️ [الترقيع الماسي]: خوارزمية (Recursive Flat) لجمع كل الأقسام الفرعية مهما كان عمقها
            let allChildCatIds = new Set();
            const findChildren = (parentId) => {
                const children = AdminData.data.cats.filter(c => String(c.parentId) === String(parentId));
                children.forEach(child => {
                    allChildCatIds.add(String(child.id));
                    findChildren(child.id); // البحث في العمق
                });
            };
            findChildren(catId);
            
            const affectedProds = AdminData.data.prods.filter(p => String(p.catId) === catId || allChildCatIds.has(String(p.catId)));
            const affectedCats = AdminData.data.cats.filter(c => allChildCatIds.has(String(c.id)));
            
            const imagesToBurn = [categoryToDelete?.img, ...affectedCats.map(c => c.img), ...affectedProds.map(p => p.img)].filter(Boolean);
            
            if (imagesToBurn.length > 0) {
                Promise.allSettled(imagesToBurn.map(imgUrl => FirebaseAdapter.deleteImageByUrl(imgUrl)));
            }
            
            AdminData.data.cats = AdminData.data.cats.filter(c => String(c.id) !== catId && !allChildCatIds.has(String(c.id)));
            AdminData.data.prods = AdminData.data.prods.filter(p => String(p.catId) !== catId && !allChildCatIds.has(String(p.catId)));
            
            await AdminData?.saveCategories?.();
            await AdminData?.saveProducts?.();
            
            // إذا كان المدير بداخل القسم المحذوف، أو أحد أبنائه، أخرجه للقسم الرئيسي (Root)
            if (String(AdminData.currFolder) === catId || allChildCatIds.has(String(AdminData.currFolder))) {
                EventBus.emit('req-update-state', { currFolder: null });
            }
            
            if (AdminData?.addLog) AdminData.addLog('DELETE_CAT', `تم تدمير القسم: ${catName} ومحتوياته بالكامل.`);
            EventBus.emit('req-render-prods');
            EventBus.emit('req-show-toast', { message: 'تم إبادة القسم وتوابعه سحابياً بنجاح', type: 'success' });
            
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    }
},
// 🛡️ [إضافة مفقودة]: حفظ ترتيب الكتالوج بعد سحب العناصر
saveNewOrder: async function(newOrderData) {
    if (!newOrderData || !Array.isArray(newOrderData) || newOrderData.length === 0) return;
    
    let catsChanged = false;
    let prodsChanged = false;
    
    newOrderData.forEach(item => {
        if (item.type === 'cat') {
            const cat = AdminData.data.catsMap?.[item.id] || AdminData.data.cats.find(c => String(c.id) === String(item.id));
            if (cat && cat.order !== item.order) {
                cat.order = item.order;
                catsChanged = true;
            }
        } else if (item.type === 'prod') {
            const prod = AdminData.data.prodsMap?.[item.id] || AdminData.data.prods.find(p => String(p.id) === String(item.id));
            if (prod && prod.order !== item.order) {
                prod.order = item.order;
                prodsChanged = true;
            }
        }
    });
    
    // حفظ الداتا في الخلفية بدون لودر لكي لا نزعج المدير
    if (catsChanged) await AdminData?.saveCategories?.();
    if (prodsChanged) await AdminData?.saveProducts?.();
},
    changeGridLayout: async function(cols) {
        const parsedCols = parseInt(cols) || 2;
        const folderId = AdminData.currFolder;
        if (!folderId || folderId === 'root') {
            if (!AdminData.data.settings) AdminData.data.settings = {};
            AdminData.data.settings.rootLayout = parsedCols;
            await AdminData?.saveSystemSettings?.();
        } else {
            const cat = AdminData.data.catsMap?.[folderId] || AdminData.data.cats.find(c => String(c.id) === String(folderId));
            if (cat) { cat.layout = parsedCols; await AdminData?.saveCategories?.(); }
        }
        EventBus.emit('req-show-toast', {message:'تم حفظ التخطيط بنجاح', type:'success'});
        AdminUI?.CatalogUI?.updateGridCssCols?.(parsedCols);
    },

    toggleGridSync: async function(isChecked) {
        if (!AdminData.data.settings) AdminData.data.settings = {};
        AdminData.data.settings.syncGridLayout = isChecked;
        await AdminData?.saveSystemSettings?.();
        EventBus.emit('req-show-toast', {message: isChecked ? 'سيتم تطبيق التخطيط على متجر العملاء' : 'سيعود المتجر للتخطيط الافتراضي', type: 'info'});
    },

    addPackage: function() {
        const name = Utils.escapeHTML(Utils.getVal('pkg-name'));
        const price = Utils.getVal('pkg-price');
        if (name && price) {
            this.tempPackages.push({name, price: parseFloat(price)});
            EventBus.emit('req-update-state', { tempPackages: this.tempPackages });
            AdminRender?.renderPkgList?.();
            AdminUI?.CatalogUI?.clearPackageInputs?.();
            this.updatePricePreview();
        }
    },

    removePkg: function(i) {
        this.tempPackages.splice(i, 1);
        EventBus.emit('req-update-state', { tempPackages: this.tempPackages });
        AdminRender?.renderPkgList?.();
        this.updatePricePreview();
    },

    // =========================================================
    // 🌍 2. إدارة الدول ومناطق الخدمة
    // =========================================================
    saveCountry: async function() {
        const editId = Utils.getVal('country-edit-id');
        const nameAr = Utils.escapeHTML(Utils.getVal('country-name'));
        const code = Utils.escapeHTML(Utils.getVal('country-code')).toUpperCase();
        const flagEmoji = Utils.escapeHTML(Utils.getVal('country-flag'));
        const dialCode = Utils.escapeHTML(Utils.getVal('country-dial'));

        if (!nameAr || !code || !dialCode) return EventBus.emit('req-show-toast', { message: 'يرجى تعبئة الحقول الأساسية', type: 'error' });

        if (!AdminData.data.countries) AdminData.data.countries = [];
        
        const isDuplicate = AdminData.data.countries.some(c => 
            String(c.code).toUpperCase() === code || String(c.id).toUpperCase() === code
        );

        if (!editId && isDuplicate) {
            return EventBus.emit('req-show-toast', { message: 'كود الدولة موجود مسبقاً في مناطق الخدمة!', type: 'error' });
        }

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري التحديث السحابي لبيانات الدولة...');

        try {
            const oldCountry = editId ? AdminData.data.countriesMap?.[editId] || AdminData.data.countries.find(c => String(c.id) === String(editId)) : null;
            const newCountry = { 
                id: editId || code, code, name: nameAr, flag: flagEmoji, dialCode: dialCode, 
                currency: oldCountry ? (oldCountry.currency || 'USD') : 'USD', 
                phoneLen: parseInt(Utils.getVal('country-phone-len')) || 10, 
                isActive: Utils.getCheck('country-active'), isBanned: Utils.getCheck('country-banned') 
            };

            if (editId) {
                const idx = AdminData.data.countries.findIndex(c => String(c.id) === String(editId));
                if (idx > -1) AdminData.data.countries[idx] = newCountry;
            } else { AdminData.data.countries.push(newCountry); }

            await AdminData?.saveCountries?.();
            
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-countries',
                modalId: 'country',
                logAction: editId ? 'EDIT_COUNTRY' : 'ADD_COUNTRY',
                logDetails: `دولة: ${nameAr}`,
                toastMsg: 'تم حفظ الدولة بنجاح'
            });
        } catch (error) {
            EventBus.emit('req-show-toast', { message: 'حدث خطأ غير متوقع أثناء حفظ الدولة', type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    
    deleteCountry: async function(id) {
        if (AdminData.data.countries && AdminData.data.countries.length <= 1) {
            return EventBus.emit('req-show-toast', { message: 'يجب أن يحتوي المتجر على دولة واحدة على الأقل.', type: 'error' });
        }

        if (AdminUI && await AdminUI.showConfirm('هل أنت متأكد من حذف هذه الدولة نهائياً؟')) {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الحذف...');
            try {
                const countryName = AdminData.data.countriesMap?.[id]?.name || 'الدولة';
                AdminData.data.countries = AdminData.data.countries.filter(c => String(c.id) !== String(id));
                await AdminData?.saveCountries?.();
                if (AdminData?.addLog) AdminData.addLog('DELETE_COUNTRY', `تم حذف الدولة: ${countryName}`);
                EventBus.emit('req-render-countries');
                EventBus.emit('req-show-toast', { message: 'تم الحذف بنجاح', type: 'success' });
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    // =========================================================
    // 🏦 3. إدارة صناديق الأكواد (Vault) - Server Integrated 🚀
    // =========================================================
    saveVaultPool: async function() {
        const id = Utils.getVal('v-pool-id');
        const name = Utils.escapeHTML(Utils.getVal('v-name'));
        const rawText = Utils.getVal('v-codes');

        if (!name) return EventBus.emit('req-show-toast', { message: 'يرجى إدخال اسم الصندوق', type: 'error' });

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري فرز وتشفير الأكواد سحابياً...');

        try {
            const lines = rawText.split('\n').map(c => c.trim()).filter(Boolean);
            
            // إنشاء الـ ID إذا لم يكن موجوداً
            const finalPoolId = id && id !== '' ? id : 'vpool_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            
            // 🚀 التحديث الجذري V10.1: تفويض المهمة الثقيلة للسيرفر (Cloud Function)
            // السيرفر هو من سيقوم بإنشاء الـ Subcollection وتشفير الأكواد بـ MD5 لحماية المتصفح من الانهيار
            const result = await FirebaseAdapter.callFunction('adminSaveVaultCodes', {
                poolId: finalPoolId,
                poolName: name,
                alertLimit: Number(Utils.getVal('v-alert-limit', 5)) || 5,
                codesList: lines
            });

            if (result && result.success) {
                // إجبار النظام على جلب البيانات الجديدة من السيرفر
                await AdminData.loadData();
                EventBus.emit('req-finish-action', {
                    renderEvent: 'req-render-vault',
                    modalId: 'vault',
                    logAction: id ? 'EDIT_VAULT' : 'ADD_VAULT',
                    logDetails: `صندوق أكواد: ${name}`,
                    toastMsg: `تم حفظ الصندوق بنجاح! ${result.addedCount} كود جديد.`
                });
            } else {
                throw new Error(result.message || "فشلت عملية المزامنة مع السيرفر.");
            }

        } catch (error) {
            EventBus.emit('req-show-toast', { message: `حدث خطأ: ${error.message}`, type: 'error' });
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    deleteVaultPool: async function(id) {
        if (AdminUI && await AdminUI.showConfirm('تحذير: سيتم حذف صندوق الأكواد بالكامل. يفضل ترك هذه المهمة لعملية التنظيف السحابي (Cloud Function). متأكد؟')) {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إتلاف الصندوق سحابياً...');
            try {
                // 🛡️ التحديث المعماري V10.1: استدعاء السيرفر لتدمير المستند والمجموعة الفرعية معاً!
                const result = await FirebaseAdapter.callFunction('adminDeleteVaultPool', { poolId: String(id) });
                
                if (result && result.success) {
                    await AdminData.loadData();
                    EventBus.emit('req-render-vault');
                    EventBus.emit('req-show-toast', { message: 'تم التدمير بنجاح', type: 'success' });
                }
            } catch (error) {
                EventBus.emit('req-show-toast', { message: `فشل الحذف: ${error.message}`, type: 'error' });
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    }
};