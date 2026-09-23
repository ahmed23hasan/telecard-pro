// ============================================================================
// 🧠 متحكم الكتالوج (modules/catalog/catalogController.js) - Cloud-Native V18.12 💎
// 🎯 الوظيفة: المنطق التجاري للمنتجات، الأقسام، الدول، وصناديق الأكواد (Vault)
// 🚀 التحديثات المعمارية (V18.12 - Atomic Vault Stats Patch):
// 1. Atomic Vault Stats 📈: تبسيط جلب أرباح الصندوق للاعتماد على العدادات الذرية (Point-Read) لمنع استنزاف القراءات.
// 2. API Package Shield 🛡️: قفل الباقات اليدوية (Packages) عند ربط المنتج بمورد خارجي.
// 3. Orphaned Data Cleanup 🧹: تنظيف الكوبونات والعروض صامتاً عند إبادة المنتجات والأقسام.
// 4. Category Hijacking Fix 🛡️: الحفاظ على القسم الأصلي للمنتج عند التعديل.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { FinancialEngine } from '../../core/financialEngine.js'; 
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';
import { UIService } from '../../core/uiService.js'; 

export const CatalogController = {
    tempPackages: [],
    defectiveCursor: null,
    _actionLocks: new Set(), 

    openProductModal: function(id = null) {
        let strId = id ? String(id) : null;
        
        if (!strId && !AdminData.currFolder) {
            EventBus.emit('req-show-toast', {message:'يرجى الدخول إلى قسم أولاً لإضافة المنتج.', type:'warning'});
            return;
        }
        
        EventBus.emit('req-update-state', { tempEditId: strId, tempImg: null });
        
        const p = strId ? (AdminData.data.prodsMap?.[strId] || (AdminData.data.prods || []).find(x => String(x.id) === strId)) : null;
        
        this.tempPackages = p && Array.isArray(p.options) ? JSON.parse(JSON.stringify(p.options)) : [];
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
        AdminUI?.CatalogUI?.renderPricePreview?.(type, cost, tiers, this.tempPackages, FinancialEngine);
    },

    // 🚀 [التحديث المعماري الأهم]: الدالة الآن تجلب مستنداً واحداً فقط بدلاً من آلاف الفواتير!
    fetchVaultFinancials: async function(poolId) {
        try {
            // أولاً، نحاول قراءة القيمة من الذاكرة المحلية (0 Reads)
            const localPool = AdminData.data.vault?.find(v => String(v.id) === String(poolId));
            
            // إذا كانت العدادات موجودة في الذاكرة وموثوقة، نستخدمها فوراً
            if (localPool && localPool.totalProfit !== undefined && localPool.totalRevenue !== undefined) {
                return {
                    profit: Number(localPool.totalProfit || 0),
                    revenue: Number(localPool.totalRevenue || 0)
                };
            }

            // في حال عدم وجودها (أو للتحقق)، نطلب المستند الحي من فايربيز (1 Read فقط!)
            const liveVaultSnap = await FirebaseAdapter.getById('telecard_vault', String(poolId));
            if (liveVaultSnap) {
                // تحديث الذاكرة المحلية
                if (localPool) {
                    localPool.totalProfit = liveVaultSnap.totalProfit;
                    localPool.totalRevenue = liveVaultSnap.totalRevenue;
                }
                return {
                    profit: Number(liveVaultSnap.totalProfit || 0),
                    revenue: Number(liveVaultSnap.totalRevenue || 0)
                };
            }
            
            return { profit: 0, revenue: 0 };
        } catch (error) {
            console.error("🚨 فشل جلب أرباح الصندوق:", error);
            return { profit: 0, revenue: 0 };
        }
    },

    saveProd: async function() {
        if (this._actionLocks.has('save-prod')) return;

        const name = Utils.escapeHTML(Utils.getVal('pr-name'));
        const type = Utils.getVal('pr-type');
        const supplierId = (Utils.getVal('pr-supplier') || '').trim();
        const externalId = (Utils.getVal('pr-supplier-prod-id') || '').trim();
        
        if (!name) return EventBus.emit('req-show-toast', {message:'يرجى إدخال اسم المنتج', type:'error'});

        const rawCost = parseFloat(Utils.getVal('pr-cost')) || 0;
        if (rawCost <= 0 && type !== 'select' && !supplierId) {
            return EventBus.emit('req-show-toast', {message:'لا يمكن أن تكون التكلفة 0 للمنتجات المحلية', type:'error'});
        }

        const MAX_PRICE_LIMIT = FinancialEngine.CONFIG.MAX_PRICE_LIMIT;
        if (rawCost > MAX_PRICE_LIMIT) {
            return EventBus.emit('req-show-toast', { message: `مرفوض: تجاوز الحد الأقصى للسعر.`, type: 'error' });
        }

        this._actionLocks.add('save-prod');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري معالجة وحفظ بيانات المنتج...');

        try {
            const hasImg = AdminUI?.CatalogUI?.hasImage?.('pr-img-wrap');
            const tempEditId = AdminData.tempEditId;
            const isEdit = !!tempEditId;
            
            const oldProd = isEdit ? AdminData.data.prodsMap?.[tempEditId] : null;
            const oldImg = oldProd?.img || null;
            
            let finalImg = oldImg || '';
            if (hasImg) {
                const fileInput = document.getElementById('pr-img-input');
                const fileToUpload = fileInput?.files?.[0];

                if (fileToUpload) {
                    EventBus.emit('req-show-toast', {message:'جاري ضغط ومعالجة صورة المنتج...', type:'info'});
                    
                    const compressedBase64 = await new Promise(resolve => {
                        if (UIService && UIService.processImage) UIService.processImage(fileToUpload, resolve);
                        else resolve(null);
                    });

                    let fileForUpload = fileToUpload;
                    if (compressedBase64 && compressedBase64.startsWith('data:image')) {
                        const mimeType = fileToUpload.type === 'image/png' ? 'image/png' : 'image/jpeg';
                        const byteString = atob(compressedBase64.split(',')[1]);
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                        const blob = new Blob([ab], { type: mimeType });
                        fileForUpload = new File([blob], fileToUpload.name, { type: mimeType });
                    }

                    if (oldImg && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                        await FirebaseAdapter.deleteImageByUrl(oldImg).catch(()=>{});
                    }
                    finalImg = await FirebaseAdapter.uploadImage(fileForUpload, 'products', null, true);
                }
            } else if (oldImg) {
                await FirebaseAdapter.deleteImageByUrl(oldImg).catch(()=>{});
                finalImg = '';
            }

            const vaultPoolId = Utils.getVal('pr-vault');
            const newProdId = isEdit ? String(tempEditId) : 'prod_' + Date.now();

            const defaultTier = AdminData.data.tiers?.find(t => t.isDefault) || AdminData.data.tiers?.[0];
            let fallbackPrice = rawCost;
            
            const isFixed = document.getElementById('pr-fixed-price')?.checked || false;

            if (defaultTier && type !== 'select' && !isFixed) {
                const pricing = FinancialEngine.calculatePrice({ product: { costPrice: rawCost }, tier: defaultTier });
                fallbackPrice = pricing.finalPrice;
            } else if (isFixed) {
                fallbackPrice = parseFloat(Utils.getVal('pr-fixed-val', rawCost)) || rawCost; 
            }

            let updatedFields = {
                id: newProdId, 
                catId: isEdit ? (oldProd.catId || null) : (AdminData.currFolder != null ? String(AdminData.currFolder) : null),
                name: name, 
                description: Utils.escapeHTML(Utils.getVal('pr-desc')),
                type: type, 
                img: finalImg, 
                costPrice: rawCost, 
                price: fallbackPrice, 
                vaultPoolId: vaultPoolId || null, 
                hideGridPrice: Utils.getCheck('pr-hide-price'),
                isFixedPrice: isFixed,
                supplierId: supplierId || null, 
                externalId: externalId || null, 
                isActive: isEdit ? (oldProd.isActive !== undefined ? oldProd.isActive : true) : true,
                isAvailable: isEdit ? (oldProd.isAvailable !== undefined ? oldProd.isAvailable : true) : true
            };

            const l1 = Utils.escapeHTML(Utils.getVal('h-lbl1')) || 'حقل إدخال';
            const l2 = Utils.escapeHTML(Utils.getVal('h-lbl2')) || 'كلمة المرور';

            if (type === 'simple') {
                updatedFields.allowQty = Utils.getCheck('pr-allow-qty');
                updatedFields.simpleMax = parseInt(Utils.getVal('pr-simple-max')) || 10;
            } else if (type === 'single') updatedFields.input1Label = l1;
            else if (type === 'double') { updatedFields.input1Label = l1; updatedFields.input2Label = l2; }
            else if (type === 'counter') {
                updatedFields.minQty = parseInt(Utils.getVal('pr-min')) || 1;
                updatedFields.maxQty = parseInt(Utils.getVal('pr-max')) || 100;
                updatedFields.input1Label = l1;
            } else if (type === 'select') {
                if (this.tempPackages.length === 0 && !supplierId) {
                    throw new Error('يرجى إضافة باقة (خيار) واحد على الأقل للمنتج المحلي المتعدد.');
                }
                
                updatedFields.options = JSON.parse(JSON.stringify(this.tempPackages)); 
                updatedFields.input1Label = l1;
            }

            let finalProductObj;

            if (isEdit) {
                const idx = AdminData.data.prods.findIndex(x => String(x.id) === newProdId);
                if (idx > -1) { 
                    finalProductObj = { ...AdminData.data.prods[idx], ...updatedFields };
                    AdminData.data.prods[idx] = finalProductObj; 
                }
            } else {
                const sameCatProds = AdminData.data.prods.filter(p => String(p.catId) === String(AdminData.currFolder));
                updatedFields.order = sameCatProds.length > 0 ? Math.max(...sameCatProds.map(p => Number(p.order) || -1)) + 1 : 0;
                finalProductObj = updatedFields;
                AdminData.data.prods.push(finalProductObj);
            }

            if (!AdminData.data.prodsMap) AdminData.data.prodsMap = {};
            AdminData.data.prodsMap[finalProductObj.id] = finalProductObj;

            await AdminData?.saveProducts?.();
            
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-prods', modalId: 'prod', logAction: isEdit ? 'EDIT_PROD' : 'ADD_PROD',
                logDetails: `تحديث منتج: ${name}`, toastMsg: 'تم حفظ المنتج بنجاح وتحديثه في المتجر!'
            });
            
        } catch (error) {
            EventBus.emit('req-show-toast', {message:'فشل الحفظ: ' + (error.message || 'خطأ غير معروف'), type:'error'});
        } finally {
            this._actionLocks.delete('save-prod');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            this.tempPackages = [];
            EventBus.emit('req-update-state', { tempPackages: [] });
        }
    },    

    _cleanupOrphanedMarketing: async function(deletedProdIds, deletedCatIds) {
        let marketingChanged = false;

        if (AdminData.data.coupons) {
            AdminData.data.coupons.forEach(c => {
                if (c.targetProds && deletedProdIds.length > 0) {
                    const origLen = c.targetProds.length;
                    c.targetProds = c.targetProds.filter(id => !deletedProdIds.includes(id));
                    if (c.targetProds.length !== origLen) marketingChanged = true;
                }
                if (c.targetCategories && deletedCatIds.length > 0) {
                    const origLen = c.targetCategories.length;
                    c.targetCategories = c.targetCategories.filter(id => !deletedCatIds.includes(id));
                    if (c.targetCategories.length !== origLen) marketingChanged = true;
                }
            });
        }

        if (AdminData.data.offers) {
            AdminData.data.offers.forEach(o => {
                if (o.targetProds && deletedProdIds.length > 0) {
                    const origLen = o.targetProds.length;
                    o.targetProds = o.targetProds.filter(id => !deletedProdIds.includes(id));
                    if (o.targetProds.length !== origLen) marketingChanged = true;
                }
            });
        }

        if (marketingChanged) {
            await Promise.allSettled([
                AdminData.saveCoupons ? AdminData.saveCoupons() : Promise.resolve(),
                AdminData.saveOffers ? AdminData.saveOffers() : Promise.resolve()
            ]);
        }
    },

    deleteProduct: async function(id) {
        if (this._actionLocks.has('delete-prod')) return;

        const prod = AdminData.data.prodsMap?.[id] || AdminData.data.prods.find(p => String(p.id) === String(id));
        
        if (prod?.supplierId) {
            const confirmApi = await AdminUI.showConfirm('⚠️ تحذير معماري:\nهذا المنتج مربوط بمورد (API). حذفه من هنا سيجعله يعود للحياة مجدداً في المزامنة القادمة!\n\nلإخفائه نهائياً، يفضل "تعطيله" من زر التفعيل بدلاً من حذفه.\n\nهل تريد إجباره على الحذف على أي حال؟', 'منتج مورد (API)');
            if (!confirmApi) return;
        } else {
            const confirmLocal = await AdminUI.showConfirm('هل أنت متأكد من حذف هذا المنتج نهائياً؟');
            if (!confirmLocal) return;
        }

        this._actionLocks.add('delete-prod');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري مسح بيانات المنتج...');
        
        try {
            if (prod?.img) await FirebaseAdapter.deleteImageByUrl(prod.img).catch(() => {});
            
            AdminData.data.prods = AdminData.data.prods.filter(p => String(p.id) !== String(id));
            if(AdminData.data.prodsMap) delete AdminData.data.prodsMap[id];

            await AdminData?.saveProducts?.();
            await this._cleanupOrphanedMarketing([String(id)], []);

            if (AdminData?.addLog) AdminData.addLog('DELETE_PROD', `تم حذف المنتج: ${prod?.name}`);
            
            setTimeout(() => {
                EventBus.emit('req-render-offers');
                EventBus.emit('req-render-coupons');
            }, 500);

            EventBus.emit('req-render-prods');
            EventBus.emit('req-show-toast', { message: 'تم مسح المنتج بنجاح', type: 'success' });
        } finally {
            this._actionLocks.delete('delete-prod');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    deleteCategory: async function(id) {
        if (this._actionLocks.has('delete-cat')) return;

        const catId = String(id);
        const categoryToDelete = AdminData.data.catsMap?.[catId] || AdminData.data.cats.find(c => String(c.id) === catId);
        
        let allChildCatIds = new Set();
        const findChildren = (parentId) => {
            const children = AdminData.data.cats.filter(c => String(c.parentId) === String(parentId));
            children.forEach(child => { allChildCatIds.add(String(child.id)); findChildren(child.id); });
        };
        findChildren(catId);
        
        const affectedProds = AdminData.data.prods.filter(p => String(p.catId) === catId || allChildCatIds.has(String(p.catId)));
        const affectedCats = AdminData.data.cats.filter(c => allChildCatIds.has(String(c.id)));
        
        const hasApiProducts = affectedProds.some(p => p.supplierId != null);
        
        let warningMsg = `تحذير: سيتم حذف القسم "${categoryToDelete?.name || 'المحدد'}" نهائياً.`;
        if (affectedCats.length > 0 || affectedProds.length > 0) {
            warningMsg += `\nسيؤدي هذا أيضاً إلى حذف:\n`;
            if (affectedCats.length > 0) warningMsg += `- ${affectedCats.length} أقسام فرعية.\n`;
            if (affectedProds.length > 0) warningMsg += `- ${affectedProds.length} منتجات مرتبط بها.\n`;
        }
        
        if (hasApiProducts) {
            warningMsg += `\n\n⚠️ تنبيه كارثي: هذا القسم يحتوي على منتجات API! إذا قمت بحذفه، سيعيد المورد إنشاء هذه المنتجات في الصفحة الرئيسية للمتجر (فوضى). يرجى تعطيل الربط أولاً.`;
        }
        
        warningMsg += `\nهل أنت متأكد من المتابعة؟`;

        if (AdminUI && await AdminUI.showConfirm(warningMsg)) {
            this._actionLocks.add('delete-cat');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حرق بيانات القسم وتوابعه سحابياً...');
            try {
                const imagesToBurn = [categoryToDelete?.img, ...affectedCats.map(c => c.img), ...affectedProds.map(p => p.img)].filter(Boolean);
                if (imagesToBurn.length > 0) Promise.allSettled(imagesToBurn.map(imgUrl => FirebaseAdapter.deleteImageByUrl(imgUrl)));
                
                const deletedProdIds = affectedProds.map(p => String(p.id));
                const deletedCatIds = [catId, ...Array.from(allChildCatIds)];

                AdminData.data.cats = AdminData.data.cats.filter(c => String(c.id) !== catId && !allChildCatIds.has(String(c.id)));
                AdminData.data.prods = AdminData.data.prods.filter(p => String(p.catId) !== catId && !allChildCatIds.has(String(p.catId)));
                
                if (AdminData.data.catsMap) {
                    delete AdminData.data.catsMap[catId];
                    allChildCatIds.forEach(childId => delete AdminData.data.catsMap[childId]);
                }
                if (AdminData.data.prodsMap) affectedProds.forEach(p => delete AdminData.data.prodsMap[p.id]);
                
                await AdminData?.saveCategories?.();
                await AdminData?.saveProducts?.();
                
                await this._cleanupOrphanedMarketing(deletedProdIds, deletedCatIds);
                
                if (String(AdminData.currFolder) === catId || allChildCatIds.has(String(AdminData.currFolder))) EventBus.emit('req-update-state', { currFolder: null });
                if (AdminData?.addLog) AdminData.addLog('DELETE_CAT', `تم تدمير القسم ومحتوياته بالكامل.`);
                
                setTimeout(() => {
                    EventBus.emit('req-render-offers');
                    EventBus.emit('req-render-coupons');
                }, 500);

                EventBus.emit('req-render-prods');
                EventBus.emit('req-show-toast', { message: 'تم إبادة القسم وتوابعه سحابياً بنجاح', type: 'success' });
            } finally {
                this._actionLocks.delete('delete-cat');
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            }
        }
    },

    saveCat: async function() {
        if (this._actionLocks.has('save-cat')) return;

        const name = Utils.escapeHTML(Utils.getVal('c-name'));
        if (!name) return EventBus.emit('req-show-toast', { message: 'يرجى إدخال اسم القسم', type: 'warning' });
        
        this._actionLocks.add('save-cat');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري التوثيق سحابياً...');
        
        try {
            const hasImg = AdminUI?.CatalogUI?.hasImage?.('c-img-wrap');
            const tempEditId = AdminData.tempEditId;
            const oldImg = tempEditId ? AdminData.data.catsMap?.[tempEditId]?.img : null;
            
            let finalImg = oldImg || '';
            if (hasImg) {
                const fileInput = document.getElementById('c-img-input');
                const fileToUpload = fileInput?.files?.[0];

                if (fileToUpload) {
                    EventBus.emit('req-show-toast', {message:'جاري ضغط ومعالجة صورة القسم...', type:'info'});
                    
                    const compressedBase64 = await new Promise(resolve => {
                        if (UIService && UIService.processImage) UIService.processImage(fileToUpload, resolve);
                        else resolve(null);
                    });

                    let fileForUpload = fileToUpload;
                    if (compressedBase64 && compressedBase64.startsWith('data:image')) {
                        const mimeType = fileToUpload.type === 'image/png' ? 'image/png' : 'image/jpeg';
                        const byteString = atob(compressedBase64.split(',')[1]);
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                        const blob = new Blob([ab], { type: mimeType });
                        fileForUpload = new File([blob], fileToUpload.name, { type: mimeType });
                    }

                    if (oldImg && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                        await FirebaseAdapter.deleteImageByUrl(oldImg).catch(()=>{});
                    }
                    finalImg = await FirebaseAdapter.uploadImage(fileForUpload, 'categories', null, true);
                }
            } else if (oldImg) {
                await FirebaseAdapter.deleteImageByUrl(oldImg).catch(()=>{});
                finalImg = '';
            }
            
            const isEdit = !!tempEditId;
            const catId = isEdit ? String(tempEditId) : 'cat_' + Date.now();
            
            if (isEdit) {
                const c = AdminData.data.cats.find(x => String(x.id) === catId);
                if (c) { c.name = name; c.img = finalImg; }
            } else {
                const sameParentCats = AdminData.data.cats.filter(c => String(c.parentId) === String(AdminData.currFolder));
                const maxOrder = sameParentCats.length > 0 ? Math.max(...sameParentCats.map(c => Number(c.order) || -1)) + 1 : 0;
                AdminData.data.cats.push({ id: catId, name: name, parentId: AdminData.currFolder != null ? String(AdminData.currFolder) : null, img: finalImg, order: maxOrder, isActive: true });
            }
            
            if (!AdminData.data.catsMap) AdminData.data.catsMap = {};
            const updatedCat = AdminData.data.cats.find(x => String(x.id) === catId);
            if (updatedCat) AdminData.data.catsMap[catId] = updatedCat;
            
            await AdminData?.saveCategories?.();
            EventBus.emit('req-finish-action', { renderEvent: 'req-render-prods', modalId: 'cat', logAction: isEdit ? 'EDIT_CAT' : 'ADD_CAT', logDetails: `تحديث قسم: ${name}`, toastMsg: 'تم حفظ القسم بنجاح' });
        } catch (error) {
            EventBus.emit('req-show-toast', { message: 'فشل الحفظ: ' + error.message, type: 'error' });
        } finally {
            this._actionLocks.delete('save-cat');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    forceSyncStore: async function() {
        if (this._actionLocks.has('force-sync')) return;

        if (AdminUI && await AdminUI.showConfirm('مزامنة المتجر بالكامل؟')) {
            this._actionLocks.add('force-sync');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الإرسال...');
            try {
                if (!AdminData || typeof AdminData.forceSyncCatalog !== 'function') throw new Error("غير مدعومة.");
                const result = await AdminData.forceSyncCatalog();
                if (result && result.success) {
                    EventBus.emit('req-show-toast', { message: result.message || 'تمت المزامنة بنجاح!', type: 'success' });
                } else throw new Error(result ? result.message : "لم يستجب السيرفر.");
            } catch (error) { 
                EventBus.emit('req-show-toast', { message: `فشل المزامنة: ${error.message}`, type: 'error' }); 
            } finally { 
                this._actionLocks.delete('force-sync');
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
            }
        }
    },

    saveNewOrder: async function(newOrderData) {
        if (!newOrderData || !Array.isArray(newOrderData) || newOrderData.length === 0) return;
        if (this._actionLocks.has('save-order')) return;
        
        this._actionLocks.add('save-order');

        try {
            let catsChanged = false, prodsChanged = false;
            
            newOrderData.forEach(item => {
                if (item.type === 'cat') {
                    const cat = AdminData.data.catsMap?.[item.id] || AdminData.data.cats.find(c => String(c.id) === String(item.id));
                    if (cat && cat.order !== item.order) { cat.order = item.order; catsChanged = true; }
                } else if (item.type === 'prod') {
                    const prod = AdminData.data.prodsMap?.[item.id] || AdminData.data.prods.find(p => String(p.id) === String(item.id));
                    if (prod && prod.order !== item.order) { prod.order = item.order; prodsChanged = true; }
                }
            });
            
            if (catsChanged) await AdminData?.saveCategories?.();
            if (prodsChanged) await AdminData?.saveProducts?.();
        } finally {
            this._actionLocks.delete('save-order');
        }
    },

    changeGridLayout: async function(cols) {
        if (this._actionLocks.has('change-layout')) return;
        this._actionLocks.add('change-layout');

        try {
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
            EventBus.emit('req-show-toast', {message:'تم حفظ التخطيط', type:'success'});
            AdminUI?.CatalogUI?.updateGridCssCols?.(parsedCols);
        } finally {
            this._actionLocks.delete('change-layout');
        }
    },

    toggleGridSync: async function(isChecked) {
        if (this._actionLocks.has('toggle-sync')) return;
        this._actionLocks.add('toggle-sync');

        try {
            if (!AdminData.data.settings) AdminData.data.settings = {};
            AdminData.data.settings.syncGridLayout = isChecked;
            await AdminData?.saveSystemSettings?.();
            EventBus.emit('req-show-toast', {message: 'تم الحفظ', type: 'info'});
        } finally {
            this._actionLocks.delete('toggle-sync');
        }
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

    saveCountry: async function() {
        if (this._actionLocks.has('save-country')) return;

        const editId = Utils.getVal('country-edit-id');
        const nameAr = Utils.escapeHTML(Utils.getVal('country-name'));
        
        const code = Utils.escapeHTML(Utils.getVal('country-code')).trim().toUpperCase();
        const flagEmoji = Utils.escapeHTML(Utils.getVal('country-flag'));
        const dialCode = Utils.escapeHTML(Utils.getVal('country-dial')).trim();

        if (!nameAr || !code || !dialCode) return EventBus.emit('req-show-toast', { message: 'يرجى تعبئة الحقول الأساسية', type: 'error' });

        if (!AdminData.data.countries) AdminData.data.countries = [];
        
        const isDuplicate = AdminData.data.countries.some(c => 
            (String(c.code).trim().toUpperCase() === code || String(c.id).trim().toUpperCase() === code) && 
            String(c.id) !== String(editId)
        );

        if (isDuplicate) {
            return EventBus.emit('req-show-toast', { message: 'كود الدولة موجود مسبقاً في مناطق الخدمة!', type: 'error' });
        }

        this._actionLocks.add('save-country');
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

            if (!AdminData.data.countriesMap) AdminData.data.countriesMap = {};
            AdminData.data.countriesMap[newCountry.id] = newCountry;

            await AdminData?.saveCountries?.();
            
            EventBus.emit('req-finish-action', { renderEvent: 'req-render-countries', modalId: 'country', logAction: editId ? 'EDIT_COUNTRY' : 'ADD_COUNTRY', logDetails: `دولة: ${nameAr}`, toastMsg: 'تم حفظ الدولة بنجاح' });
        } catch (error) { 
            EventBus.emit('req-show-toast', { message: 'حدث خطأ أثناء حفظ الدولة', type: 'error' }); 
        } finally { 
            this._actionLocks.delete('save-country');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
        }
    },

    deleteCountry: async function(id) {
        if (this._actionLocks.has('delete-country')) return;

        if (AdminData.data.countries && AdminData.data.countries.length <= 1) return EventBus.emit('req-show-toast', { message: 'يجب أن يحتوي المتجر على دولة واحدة على الأقل.', type: 'error' });

        if (AdminUI && await AdminUI.showConfirm('هل أنت متأكد من حذف هذه الدولة نهائياً؟')) {
            this._actionLocks.add('delete-country');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الحذف...');
            try {
                const countryName = AdminData.data.countriesMap?.[id]?.name || 'الدولة';
                AdminData.data.countries = AdminData.data.countries.filter(c => String(c.id) !== String(id));
                if (AdminData.data.countriesMap) delete AdminData.data.countriesMap[id];
                
                await AdminData?.saveCountries?.();
                EventBus.emit('req-render-countries');
                EventBus.emit('req-show-toast', { message: 'تم الحذف بنجاح', type: 'success' });
            } finally { 
                this._actionLocks.delete('delete-country');
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
            }
        }
    },

    saveVaultPool: async function() {
        if (this._actionLocks.has('save-vault')) return;

        const id = Utils.getVal('v-pool-id');
        const name = Utils.escapeHTML(Utils.getVal('v-name'));
        const rawText = Utils.getVal('v-codes');

        if (!name) return EventBus.emit('req-show-toast', { message: 'يرجى إدخال اسم الصندوق', type: 'error' });
        
        this._actionLocks.add('save-vault');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري فرز وتشفير الأكواد سحابياً...');

        try {
            const lines = rawText.split('\n').map(c => c.trim()).filter(Boolean);
            const finalPoolId = id && id !== '' ? id : 'vpool_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            
            const result = await FirebaseAdapter.callFunction('adminSaveVaultCodes', {
                poolId: finalPoolId, poolName: name, alertLimit: Number(Utils.getVal('v-alert-limit', 5)) || 5, codesList: lines
            });

            if (result && result.success) {
                if (!AdminData.data.vault) AdminData.data.vault = [];
                const existingPoolIndex = AdminData.data.vault.findIndex(v => String(v.id) === finalPoolId);
                const addedCount = result.addedCount || lines.length;

                if (existingPoolIndex > -1) {
                    AdminData.data.vault[existingPoolIndex].name = name;
                    AdminData.data.vault[existingPoolIndex].alertLimit = Number(Utils.getVal('v-alert-limit', 5)) || 5;
                    AdminData.data.vault[existingPoolIndex].totalCount = Number(AdminData.data.vault[existingPoolIndex].totalCount || 0) + addedCount;
                } else {
                    AdminData.data.vault.push({ id: finalPoolId, name: name, alertLimit: Number(Utils.getVal('v-alert-limit', 5)) || 5, totalCount: addedCount });
                }

                EventBus.emit('req-finish-action', { renderEvent: 'req-render-vault', modalId: 'vault', logAction: id ? 'EDIT_VAULT' : 'ADD_VAULT', logDetails: `صندوق أكواد: ${name}`, toastMsg: `تم الحفظ بنجاح! ${addedCount} كود جديد.` });
            } else throw new Error(result.message || "فشلت عملية المزامنة مع السيرفر.");
        } catch (error) { 
            EventBus.emit('req-show-toast', { message: `حدث خطأ: ${error.message}`, type: 'error' }); 
        } finally { 
            this._actionLocks.delete('save-vault');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
        }
    },

    deleteVaultPool: async function(id) {
        if (this._actionLocks.has('delete-vault')) return;

        if (AdminUI && await AdminUI.showConfirm('تحذير: سيتم حذف صندوق الأكواد بالكامل. متأكد؟')) {
            this._actionLocks.add('delete-vault');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إتلاف الصندوق سحابياً...');
            
            try {
                const result = await FirebaseAdapter.callFunction('adminDeleteVaultPool', { poolId: String(id) });
                
                if (result && result.success) {
                    if (AdminData.data.vault) AdminData.data.vault = AdminData.data.vault.filter(v => String(v.id) !== String(id));
                    EventBus.emit('req-render-vault');
                    EventBus.emit('req-show-toast', { message: 'تم التدمير بنجاح', type: 'success' });
                }
            } catch (error) { 
                EventBus.emit('req-show-toast', { message: `فشل الحذف: ${error.message}`, type: 'error' }); 
            } finally { 
                this._actionLocks.delete('delete-vault');
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
            }
        }
    },
    
    viewDefectiveCodes: async function(poolIdStr, isLoadMore = false) {
        const lockKey = isLoadMore ? 'view-defective-page' : 'view-defective';
        if (this._actionLocks.has(lockKey)) return;

        const poolId = String(poolIdStr);
        const pool = AdminData.data.vault?.find(v => String(v.id) === poolId);
        
        if (!pool) return EventBus.emit('req-show-toast', { message: 'الصندوق غير موجود', type: 'error' });
        
        if (!isLoadMore) {
            this.defectiveCursor = null; 
        }
        
        this._actionLocks.add(lockKey);

        if (AdminUI?.toggleLoader && !isLoadMore) AdminUI.toggleLoader(true, 'جاري جلب الأكواد التالفة بدقة من السحابة...');
        try {
            const result = await FirebaseAdapter.fetchMoreWithCursor(
                `telecard_vault/${poolId}/keys`, 
                [['isBurned', '==', true]],      
                'refundedAt', 
                this.defectiveCursor, 
                100 
            );
            
            this.defectiveCursor = result.newLastDoc;
            const hasMore = !!this.defectiveCursor;
            
            window._loadMoreDefective = () => this.viewDefectiveCodes(poolId, true);

            AdminUI?.CatalogUI?.renderDefectiveCodesModal?.(pool.name, result.data || [], isLoadMore, hasMore, poolId);
        } catch (e) {
            EventBus.emit('req-show-toast', { message: 'فشل جلب السجلات من السحابة', type: 'error' });
        } finally {
            this._actionLocks.delete(lockKey);
            if (AdminUI?.toggleLoader && !isLoadMore) AdminUI.toggleLoader(false);
        }
    }
};
