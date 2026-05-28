// ============================================================================
// 🧠 متحكم الكتالوج (modules/catalog/catalogController.js) - Cloud Optimized ☁️
// الوظيفة: المنطق التجاري للمنتجات، الأقسام، الدول، وصناديق الأكواد (Vault)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';
import { TelecardPricingEngine } from '../../adminConfig.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const CatalogController = {
    tempPackages: [],

    // =========================================================
    // 📦 1. إدارة المنتجات والأقسام
    // =========================================================
    openProductModal: function(id = null) {
        let strId = id ? String(id) : null;
        if (!strId && !AppController.currFolder) {
            EventBus.emit('req-show-toast', {message:'يرجى اختيار قسم أولاً ثم إضافة المنتج داخله.', type:'warning'});
            return;
        }
        AppController.updateState({ tempEditId: strId, tempImg: null });
        const p = strId ? (AdminData.data.prods || []).find(x => String(x.id) === strId) : null;
        this.tempPackages = p ? (p.options || []) : [];
        AppController.updateState({ tempPackages: this.tempPackages });
        
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
        
        if (!name) {
            EventBus.emit('req-show-toast', {message:'يرجى إدخال اسم المنتج', type:'error'});
            return;
        }

        const rawCost = parseFloat(Utils.getVal('pr-cost')) || 0;
        if (rawCost <= 0 && type !== 'select') {
            EventBus.emit('req-show-toast', {message:'لا يمكن أن تكون التكلفة 0 للمنتجات الفردية', type:'error'});
            return;
        }

        EventBus.emit('req-show-loader', true); 

        try {
            const hasImg = AdminUI?.CatalogUI?.hasImage?.('pr-img-wrap');
            const oldImg = AppController.tempEditId ? AdminData.data.prods.find(x => String(x.id) === String(AppController.tempEditId))?.img : null;
            
            // 🌟 محرك الرفع السحابي لصور المنتجات (تم الإصلاح بسحب الملف من الـ DOM مباشرة)
            let finalImg = '';
            if (hasImg) {
                const fileInput = document.getElementById('pr-img-input');
                const fileToUpload = fileInput?.files?.[0];

                if (fileToUpload) {
                    EventBus.emit('req-show-toast', {message:'جاري رفع صورة المنتج للسحابة...', type:'info'});
                    finalImg = await FirebaseAdapter.uploadImage(fileToUpload, 'products', null, oldImg);
                } else {
                    finalImg = oldImg || ''; // إبقاء الصورة القديمة إذا لم يتم تغييرها
                }
            }

            const vaultPoolId = Utils.getVal('pr-vault');

            let newProd = {
                id: AppController.tempEditId || String(Date.now()),
                catId: AppController.currFolder != null ? String(AppController.currFolder) : null,
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
            } else if (type === 'single') {
                newProd.input1Label = l1;
            } else if (type === 'double') {
                newProd.input1Label = l1;
                newProd.input2Label = l2;
            } else if (type === 'counter') {
                newProd.minQty = parseInt(Utils.getVal('pr-min')) || 1;
                newProd.maxQty = parseInt(Utils.getVal('pr-max')) || 100;
                newProd.input1Label = l1;
            } else if (type === 'select') {
                if (this.tempPackages.length === 0) {
                    EventBus.emit('req-show-loader', false);
                    EventBus.emit('req-show-toast', {message:'يرجى إضافة باقة (خيار) واحد على الأقل', type:'warning'});
                    return;
                }
                newProd.options = this.tempPackages;
                newProd.input1Label = l1;
            }

            const isEdit = !!AppController.tempEditId;
            if (isEdit) {
                const idx = AdminData.data.prods.findIndex(x => String(x.id) === String(AppController.tempEditId));
                if (idx > -1) {
                    newProd.order = AdminData.data.prods[idx].order;
                    AdminData.data.prods[idx] = newProd;
                }
            } else {
                const sameCatProds = AdminData.data.prods.filter(p => String(p.catId) === (AppController.currFolder != null ? String(AppController.currFolder) : null));
                newProd.order = sameCatProds.length > 0 ? Math.max(...sameCatProds.map(p => Number(p.order) || -1)) + 1 : 0;
                AdminData.data.prods.push(newProd);
            }

            await AdminData?.saveProducts?.();
            AdminData?.loadData?.(true); 
            
            AppController.finishAction('req-render-prods', null, isEdit ? 'EDIT_PROD' : 'ADD_PROD', `تم ${isEdit ? 'تعديل' : 'إضافة'} منتج: ${name}`, 'تم حفظ المنتج بنجاح');
            
        } catch (error) {
            console.error("Save Product Error:", error);
            EventBus.emit('req-show-toast', {message:'فشل الحفظ: ' + (error.message || 'خطأ غير معروف'), type:'error'});
        } finally {
            EventBus.emit('req-show-loader', false);
        }
    },

    saveCat: async function() {
        const name = Utils.escapeHTML(Utils.getVal('c-name'));
        if (!name) {
            EventBus.emit('req-show-toast', {message:'يرجى إدخال اسم القسم', type:'warning'});
            return;
        }

        EventBus.emit('req-show-loader', true);

        try {
            const hasImg = AdminUI?.CatalogUI?.hasImage?.('c-img-wrap');
            const oldImg = AppController.tempEditId ? AdminData.data.cats.find(c => String(c.id) === String(AppController.tempEditId))?.img : null;
            
            // 🌟 محرك الرفع السحابي لصور الأقسام (تم الإصلاح بسحب الملف من الـ DOM مباشرة)
            let finalImg = '';
            if (hasImg) {
                const fileInput = document.getElementById('c-img-input');
                const fileToUpload = fileInput?.files?.[0];

                if (fileToUpload) {
                    EventBus.emit('req-show-toast', {message:'جاري رفع صورة القسم للسحابة...', type:'info'});
                    finalImg = await FirebaseAdapter.uploadImage(fileToUpload, 'categories', null, oldImg);
                } else {
                    finalImg = oldImg || ''; 
                }
            }

            const isEdit = !!AppController.tempEditId;

            if (isEdit) {
                const c = AdminData.data.cats.find(x => String(x.id) === String(AppController.tempEditId));
                if (c) {
                    c.name = name;
                    c.img = finalImg;
                }
            } else {
                const sameParentCats = AdminData.data.cats.filter(c => String(c.parentId) === String(AppController.currFolder));
                const maxOrder = sameParentCats.length > 0 ? Math.max(...sameParentCats.map(c => Number(c.order) || -1)) + 1 : 0;
                AdminData.data.cats.push({
                    id: String(Date.now()),
                    name: name,
                    parentId: AppController.currFolder != null ? String(AppController.currFolder) : null,
                    img: finalImg,
                    order: maxOrder
                });
            }

            await AdminData?.saveCategories?.();
            AdminData?.loadData?.(true);
            
            AppController.finishAction('req-render-prods', null, isEdit ? 'EDIT_CAT' : 'ADD_CAT', `تم ${isEdit ? 'تعديل' : 'إضافة'} قسم: ${name}`, 'تم حفظ القسم بنجاح');
        } catch (error) {
            console.error("Save Category Error:", error);
            EventBus.emit('req-show-toast', {message:'فشل الحفظ: ' + (error.message || 'خطأ غير معروف'), type:'error'});
        } finally {
            EventBus.emit('req-show-loader', false);
        }
    },
    deleteProduct: async function(id) {
        if (AdminUI && await AdminUI.showConfirm('هل أنت متأكد من حذف هذا المنتج نهائياً؟')) {
            const prodId = String(id);
            const prod = AdminData.data.prods.find(p => String(p.id) === prodId);
            const prodName = prod?.name || 'المنتج';
            
            // 🌟 1. التنظيف السحابي العميق: مسح الصورة نهائياً لتوفير المساحة وتجنب التراكم (Ghost files)
            if (prod && prod.img && typeof FirebaseAdapter !== 'undefined' && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                try { await FirebaseAdapter.deleteImageByUrl(prod.img); } catch (e) { console.warn("Ghost image caught on product."); }
            }
            
            // 2. الحذف المنطقي وتحديث البيانات
            AdminData.data.prods = AdminData.data.prods.filter(p => String(p.id) !== prodId);
            await AdminData?.saveProducts?.();
            
            if (AdminData?.addLog) AdminData.addLog('DELETE_PROD', `تم حذف المنتج: ${prodName}`);
            
            EventBus.emit('req-render-prods');
            EventBus.emit('req-show-toast', { message: 'تم حذف المنتج بنجاح وتوفير المساحة السحابية', type: 'success' });
        }
    },
    
    deleteCategory: async function(id) {
        if (AdminUI && await AdminUI.showConfirm('هل أنت متأكد من حذف هذا القسم؟ (سيتم حذف المنتجات والأقسام الفرعية المرتبطة به مباشرة)')) {
            const catId = String(id);
            const categoryToDelete = AdminData.data.cats.find(c => String(c.id) === catId);
            const catName = categoryToDelete?.name || 'القسم';
            
            const childCatsIds = AdminData.data.cats.filter(c => String(c.parentId) === catId).map(c => String(c.id));
            const childCatsObjects = AdminData.data.cats.filter(c => String(c.parentId) === catId);
            const affectedProds = AdminData.data.prods.filter(p => String(p.catId) === catId || childCatsIds.includes(String(p.catId)));
            
            // 🌟 1. الرادار الماسح: حصد كل صور (القسم نفسه + الأقسام الفرعية + جميع منتجاتها المعلقة بها)
            const imagesToBurn = [];
            if (categoryToDelete?.img) imagesToBurn.push(categoryToDelete.img);
            childCatsObjects.forEach(c => { if (c.img) imagesToBurn.push(c.img); });
            affectedProds.forEach(p => { if (p.img) imagesToBurn.push(p.img); });
            
            // 🌟 2. توجيه ضربة جوية سحابية واحدة لحرق كافة هذه الصور بسباق مهام غير مرئي (Concurrent Cleanup)
            if (imagesToBurn.length > 0 && typeof FirebaseAdapter !== 'undefined' && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                Promise.allSettled(imagesToBurn.map(imgUrl => FirebaseAdapter.deleteImageByUrl(imgUrl)));
                console.log(`🧹 جاري محو ${imagesToBurn.length} ملف شبح سحابياً بالخلفية...`);
            }
            
            // 3. مسح الأقسام الفرعية والقسم الأب والمنتجات محلياً من السجل (المهمة التي قمت بتطويرها بنجاح)
            AdminData.data.cats = AdminData.data.cats.filter(c => String(c.parentId) !== catId && String(c.id) !== catId);
            AdminData.data.prods = AdminData.data.prods.filter(p => String(p.catId) !== catId && !childCatsIds.includes(String(p.catId)));
            
            await AdminData?.saveCategories?.();
            await AdminData?.saveProducts?.();
            
            if (AdminData?.addLog) AdminData.addLog('DELETE_CAT', `تم حذف القسم: ${catName} ومحتوياته وتنظيف مرفقاتهم.`);
            
            if (String(AppController.currFolder) === catId) {
                AppController.updateState({ currFolder: null });
            }
            
            EventBus.emit('req-render-prods');
            EventBus.emit('req-show-toast', { message: 'تم تفريغ القسم وإبادة صوره सحаبياً بنجاح!', type: 'success' });
        }
    },
    changeGridLayout: async function(cols) {
        const parsedCols = parseInt(cols) || 2;
        const folderId = AppController.currFolder;
        if (!folderId || folderId === 'root') {
            if (!AdminData.data.settings) AdminData.data.settings = {};
            AdminData.data.settings.rootLayout = parsedCols;
            await AdminData?.saveSystemSettings?.();
        } else {
            const cat = AdminData.data.cats.find(c => String(c.id) === String(folderId));
            if (cat) {
                cat.layout = parsedCols;
                await AdminData?.saveCategories?.();
            }
        }
        EventBus.emit('req-show-toast', {message:'تم حفظ التخطيط بنجاح', type:'success'});
        AdminUI?.CatalogUI?.updateGridCssCols?.(parsedCols);
    },

    toggleGridSync: async function(isChecked) {
        if (!AdminData.data.settings) AdminData.data.settings = {};
        AdminData.data.settings.syncGridLayout = isChecked;
        await AdminData?.saveSystemSettings?.();
        
        if (isChecked) {
            EventBus.emit('req-show-toast', {message: 'تم التفعيل: سيتم تطبيق التخطيط على المتجر', type: 'success'});
        } else {
            EventBus.emit('req-show-toast', {message: 'تم الإيقاف: سيعود المتجر للشكل الافتراضي', type: 'info'});
        }
    },

    addPackage: function() {
        const name = Utils.escapeHTML(Utils.getVal('pkg-name'));
        const price = Utils.getVal('pkg-price');
        if (name && price) {
            this.tempPackages.push({name, price: parseFloat(price)});
            AppController.updateState({ tempPackages: this.tempPackages });
            AdminRender?.renderPkgList?.();
            AdminUI?.CatalogUI?.clearPackageInputs?.();
            this.updatePricePreview();
        }
    },

    removePkg: function(i) {
        this.tempPackages.splice(i, 1);
        AppController.updateState({ tempPackages: this.tempPackages });
        AdminRender?.renderPkgList?.();
        this.updatePricePreview();
    },

    // =========================================================
    // 🌍 2. إدارة الدول ومناطق الخدمة والترميم التلقائي
    // =========================================================
    validateAndHealCountries: async function() {
        const countries = AdminData.data.countries || [];
        if(countries.length === 0) return;

        let needsMigration = false;
        const normalizedCountries = countries.map(c => {
            if (!c.flag || !c.currency) {
                needsMigration = true;
                return {
                    ...c,
                    flag: c.flag || '🇸🇦',
                    currency: c.currency || 'SAR',
                    dialCode: c.dialCode || '+966',
                    code: c.code || 'SA'
                };
            }
            return c;
        });

        if (needsMigration) {
            console.warn("⚠️ تم اكتشاف بيانات دول قديمة، جاري الترميم التلقائي في السحابة...");
            AdminData.data.countries = normalizedCountries;
            try {
                if (typeof AdminData.saveCountries === 'function') {
                    await AdminData.saveCountries();
                }
            } catch(err) {
                console.error("فشل الترحيل الصامت:", err);
            }
        }
    },

    saveCountry: async function() {
        const editId = Utils.getVal('country-edit-id');
        const nameAr = Utils.escapeHTML(Utils.getVal('country-name'));
        const code = Utils.escapeHTML(Utils.getVal('country-code')).toUpperCase();
        const flagEmoji = Utils.escapeHTML(Utils.getVal('country-flag'));
        const dialCode = Utils.escapeHTML(Utils.getVal('country-dial'));
        const phoneLen = parseInt(Utils.getVal('country-phone-len')) || 10;
        const isActive = Utils.getCheck('country-active');
        const isBanned = Utils.getCheck('country-banned');

        if (!nameAr || !code || !dialCode) {
            EventBus.emit('req-show-toast', { message: 'يرجى تعبئة الحقول الأساسية (الاسم، الكود، النداء)', type: 'error' });
            return;
        }

        if (!AdminData.data.countries) AdminData.data.countries = [];
        if (!editId && AdminData.data.countries.find(c => String(c.id).toUpperCase() === code)) {
            EventBus.emit('req-show-toast', { message: 'كود الدولة موجود مسبقاً!', type: 'error' });
            return;
        }

        EventBus.emit('req-show-loader', true);

        try {
            const oldCountry = editId ? AdminData.data.countries.find(c => String(c.id) === String(editId)) : null;
            
            const newCountry = { 
                id: editId || code, 
                code: code,                    
                name: nameAr,                  
                flag: flagEmoji,               
                dialCode: dialCode, 
                currency: oldCountry ? (oldCountry.currency || 'USD') : 'USD', 
                phoneLen: phoneLen, 
                isActive: isActive, 
                isBanned: isBanned 
            };

            if (editId) {
                const idx = AdminData.data.countries.findIndex(c => String(c.id) === String(editId));
                if (idx > -1) AdminData.data.countries[idx] = newCountry;
            } else {
                AdminData.data.countries.push(newCountry);
            }

            await AdminData?.saveCountries?.();
            AppController.finishAction('req-render-countries', null, editId ? 'EDIT_COUNTRY' : 'ADD_COUNTRY', `تم ${editId ? 'تعديل' : 'إضافة'} دولة: ${nameAr}`, 'تم حفظ الدولة بنجاح');
        } catch (error) {
            EventBus.emit('req-show-toast', { message: 'خطأ أثناء الحفظ', type: 'error' });
        } finally {
            EventBus.emit('req-show-loader', false);
        }
    },
    
    deleteCountry: async function(id) {
        if (AdminData.data.countries && AdminData.data.countries.length <= 1) {
            EventBus.emit('req-show-toast', { message: 'إجراء محظور: يجب أن يحتوي المتجر على دولة واحدة على الأقل لمنع انهيار واجهات الدفع.', type: 'error' });
            return false; 
        }

        if (AdminUI && await AdminUI.showConfirm('هل أنت متأكد من حذف هذه الدولة نهائياً؟')) {
            const countryId = String(id);
            const countryName = AdminData.data.countries.find(c => String(c.id) === countryId)?.name || 'الدولة';
            
            AdminData.data.countries = AdminData.data.countries.filter(c => String(c.id) !== countryId);
            await AdminData?.saveCountries?.();
            
            if (AdminData?.addLog) AdminData.addLog('DELETE_COUNTRY', `تم حذف الدولة: ${countryName}`);
            
            EventBus.emit('req-render-countries');
            EventBus.emit('req-show-toast', { message: 'تم حذف الدولة بنجاح', type: 'success' });
        }
    },

    // =========================================================
    // 🏦 3. إدارة صناديق الأكواد (Vault)
    // =========================================================
    saveVaultPool: async function() {
        const id = Utils.getVal('v-pool-id');
        const name = Utils.escapeHTML(Utils.getVal('v-name'));
        const alertLimit = Number(Utils.getVal('v-alert-limit', 5)) || 5;
        const rawText = Utils.getVal('v-codes');

        if (!name) {
            EventBus.emit('req-show-toast', { message: 'يرجى إدخال اسم الصندوق', type: 'error' });
            return;
        }

        EventBus.emit('req-show-loader', true);

        try {
            const lines = rawText.split('\n').map(c => c.trim()).filter(Boolean);
            let vaultArray = Array.isArray(AdminData.data.vault) ? AdminData.data.vault : [];
            let poolIndex = vaultArray.findIndex(p => String(p.id) === String(id));
            let existingPool = poolIndex > -1 ? vaultArray[poolIndex] : null;
            
            let retainedCodes = [];
            let currentAvailableObjects = [];

            if (existingPool && Array.isArray(existingPool.codes)) {
                existingPool.codes.forEach(c => {
                    if (typeof c === 'object' && (c.status === 'sold' || c.status === 'defective')) {
                        retainedCodes.push(c);
                    } else if (typeof c === 'object' && c.status === 'available') {
                        currentAvailableObjects.push(c);
                    } else if (typeof c === 'string') {
                        currentAvailableObjects.push({ id: 'old_' + Math.random().toString(36).substr(2, 9), text: Utils.escapeHTML(c), status: 'available', addedAt: Date.now() });
                    }
                });
            }

            let finalAvailableCodes = lines.map(text => {
                let existing = currentAvailableObjects.find(c => c.text === text);
                if (existing) return existing;
                return { id: 'code_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9), text: Utils.escapeHTML(text), status: 'available', addedAt: Date.now() };
            });

            const newPool = {
                id: existingPool ? existingPool.id : 'vpool_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                name: name,
                alertLimit: alertLimit,
                codes: [...finalAvailableCodes, ...retainedCodes],
                updatedAt: Date.now()
            };

            if (poolIndex > -1) {
                vaultArray[poolIndex] = newPool;
            } else {
                vaultArray.push(newPool);
            }

            AdminData.data.vault = vaultArray;
            const isSaved = AdminData ? await AdminData.saveVault() : false;

            if (isSaved) {
                AppController.finishAction('req-render-vault', null, poolIndex > -1 ? 'EDIT_VAULT' : 'ADD_VAULT', `تم ${poolIndex > -1 ? 'تعديل' : 'إضافة'} صندوق أكواد: ${name}`, 'تم حفظ الصندوق بنجاح');
            } else {
                EventBus.emit('req-show-toast', { message: 'حدث خطأ أثناء الحفظ', type: 'error' });
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: 'حدث خطأ غير متوقع', type: 'error' });
        } finally {
            EventBus.emit('req-show-loader', false);
        }
    },

    deleteVaultPool: async function(id) {
        if (AdminUI && await AdminUI.showConfirm('هل أنت متأكد من حذف صندوق الأكواد هذا؟ (سيتم حذف جميع الأكواد بداخله)')) {
            let vaultArray = Array.isArray(AdminData.data.vault) ? AdminData.data.vault : [];
            const pool = vaultArray.find(v => String(v.id) === String(id));
            AdminData.data.vault = vaultArray.filter(v => String(v.id) !== String(id));
            await AdminData?.saveVault?.();
            if (pool) AdminData?.addLog?.('DELETE_VAULT', `تم حذف صندوق الأكواد: ${pool.name}`);
            EventBus.emit('req-render-vault');
            EventBus.emit('req-show-toast', { message: 'تم حذف الصندوق بنجاح', type: 'success' });
        }
    },

    viewDefectiveCodes: function(poolId) {
        const pool = (AdminData.data.vault || []).find(v => String(v.id) === String(poolId));
        if (!pool) return;
        const defectiveCodes = (pool.codes || []).filter(c => typeof c === 'object' && c.status === 'defective');
        if (defectiveCodes.length === 0) {
            EventBus.emit('req-show-toast', { message: 'لا توجد أكواد تالفة في هذا الصندوق', type: 'info' });
            return;
        }
        AdminUI?.CatalogUI?.renderDefectiveCodesModal?.(pool.name, defectiveCodes);
    }
};
