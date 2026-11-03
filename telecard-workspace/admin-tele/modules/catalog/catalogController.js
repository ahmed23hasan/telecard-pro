// ============================================================================
// 🧠 متحكم الكتالوج (modules/catalog/catalogController.js) - Cloud-Native V20.2 💎
// 🎯 الوظيفة: المنطق التجاري للمنتجات، الباقات الفرعية، الأقسام، الدول، وصناديق الخزنة (Vault)
// 🚀 التحديثات المعمارية (V20.2 - Visibility, Pause Control & Sub-Package Integrity):
// 1. Visibility & Pause Status 👁️: دعم isManuallyPaused و isActive مع منع إعادة التفعيل التلقائي من السيرفر.
// 2. Sub-Package Vault Unbind Fix 🔓: إصلاح خطأ استمرار stockCount: 0 عند فك ارتباط الخزنة.
// 3. Raw String Preservation 💾: إزالة escapeHTML المسبق من الأسماء لمنع تشوه النصوص.
// 4. Unified Schema Parity 🔗: توحيد (categoryId, img/image, order/sortOrder, minQty/maxQty) مع السيرفر.
// 5. Single-Supplier & Unique-Vault Guard 🛡️: منع تعدد الموردين ومنع مشاركة الخزنة بين باقتين.
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
        const strId = id ? String(id) : null;
        
        if (!strId && !AdminData.currFolder) {
            EventBus.emit('req-show-toast', { message: 'يرجى الدخول إلى قسم أولاً لإضافة المنتج.', type: 'warning' });
            return;
        }
        
        AdminData.tempEditId = strId;
        EventBus.emit('set-temp-edit-id', strId);
        EventBus.emit('req-update-state', { tempEditId: strId, tempImg: null });
        
        const p = strId ? (AdminData.data.prodsMap?.[strId] || (AdminData.data.prods || []).find(x => String(x.id) === strId)) : null;
        
        this.tempPackages = (p && Array.isArray(p.options))
            ? JSON.parse(JSON.stringify(p.options)).map(opt => ({
                ...opt,
                costPrice: Number(opt?.costPrice ?? opt?.cost_price ?? opt?.price ?? 0)
            }))
            : [];
        EventBus.emit('req-update-state', { tempPackages: this.tempPackages });
        
        // 🚀 بناء نافذة المنتج ديناميكياً وتعبئة الحقول أولاً
        AdminUI?.CatalogUI?.openProductModal?.(strId);
        AdminRender?.renderProdConfig?.();
        AdminRender?.renderPkgList?.();
        this.updatePricePreview();
    },

    updatePricePreview: function() {
        const type = Utils.getVal('pr-type', 'simple');
        const cost = parseFloat(Utils.getVal('pr-cost', 0)) || 0;
        const tiers = AdminData.data.tiers || [];
        AdminUI?.CatalogUI?.renderPricePreview?.(type, cost, tiers, this.tempPackages, FinancialEngine);
    },

    fetchVaultFinancials: async function(poolId) {
        try {
            const localPool = AdminData.data.vault?.find(v => String(v.id) === String(poolId));
            
            if (localPool && localPool.totalProfit !== undefined && localPool.totalRevenue !== undefined) {
                return {
                    profit: Number(localPool.totalProfit || 0),
                    revenue: Number(localPool.totalRevenue || 0)
                };
            }

            const liveVaultSnap = await FirebaseAdapter.getById('telecard_vault', String(poolId));
            if (liveVaultSnap) {
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

    _checkVaultConflictAcrossStore: function(vaultPoolId, currentProdId, currentPkgIndex = -1) {
        if (!vaultPoolId) return null;
        const vId = String(vaultPoolId).trim();

        const parentVaultId = String(Utils.getVal('pr-vault') || '').trim();
        if (currentPkgIndex >= 0 && parentVaultId === vId) {
            return 'صندوق الخزنة هذا مختار بالفعل للمنتج الأب.';
        }

        const dupInSameProdIdx = this.tempPackages.findIndex((pkg, idx) => idx !== currentPkgIndex && pkg && String(pkg.vaultPoolId || '') === vId);
        if (dupInSameProdIdx > -1) {
            return `صندوق الخزنة هذا مربوط بالفعل بالباقة (${this.tempPackages[dupInSameProdIdx].name}) داخل نفس المنتج. يمنع النظام مشاركة نفس الخزنة بين باقتين.`;
        }

        const otherProd = (AdminData.data.prods || []).find(p => {
            if (!p || String(p.id) === String(currentProdId || '')) return false;
            if (String(p.vaultPoolId || '') === vId) return true;
            if (Array.isArray(p.options) && p.options.some(o => o && String(o.vaultPoolId || '') === vId)) return true;
            return false;
        });

        if (otherProd) {
            return `صندوق الخزنة هذا مرتبط مسبقاً بمنتج آخر (${otherProd.name}). يمنع النظام مشاركة نفس الخزنة بين منتجين.`;
        }
        return null;
    },

    saveProd: async function() {
        if (this._actionLocks.has('save-prod')) return;

        // 🛡️ التحديث المطلوب: حفظ النص النظيف بدون التشفير المزدوج
        const name = Utils.getVal('pr-name').trim();
        const type = Utils.getVal('pr-type') || 'simple';
        const supplierId = (Utils.getVal('pr-supplier') || '').trim();
        const externalId = (Utils.getVal('pr-supplier-prod-id') || '').trim();
        const vaultPoolId = (Utils.getVal('pr-vault') || '').trim();
        const tempEditId = AdminData.tempEditId;
        
        if (!name) return EventBus.emit('req-show-toast', { message: 'يرجى إدخال اسم المنتج', type: 'error' });

        if (supplierId && vaultPoolId) {
            return EventBus.emit('req-show-toast', { message: 'لا يمكن ربط المنتج بمورد خارجي وخزنة محلية في نفس الوقت.', type: 'error' });
        }

        if (vaultPoolId && type !== 'select') {
            const vConflict = this._checkVaultConflictAcrossStore(vaultPoolId, tempEditId, -1);
            if (vConflict) {
                return EventBus.emit('req-show-toast', { message: `⚠️ تعارض خزنة: ${vConflict}`, type: 'error' });
            }
        }

        const rawCost = parseFloat(Utils.getVal('pr-cost')) || 0;
        const isFixed = document.getElementById('pr-fixed-price')?.checked || false;
        const rawFixedVal = FinancialEngine.extractNum(Utils.getVal('pr-fixed-val', 0));
        const MAX_PRICE_LIMIT = FinancialEngine.CONFIG.MAX_PRICE_LIMIT;
        const minMarginFactor = 1 + (FinancialEngine.CONFIG.MIN_MARGIN_PERCENT / 100);

        if (type === 'select') {
            if (this.tempPackages.length === 0) {
                return EventBus.emit('req-show-toast', { message: 'يرجى إضافة باقة فرعية واحدة على الأقل للمنتج المتعدد.', type: 'error' });
            }
            const usedPkgVaults = new Set();
            for (let i = 0; i < this.tempPackages.length; i++) {
                const pkg = this.tempPackages[i];
                const pkgCost = Number(pkg.costPrice ?? pkg.cost_price ?? pkg.price ?? 0);
                if (!supplierId && pkgCost <= 0) {
                    return EventBus.emit('req-show-toast', { message: `لا يمكن حفظ الباقة (${pkg.name}) بتكلفة صفر (0$).`, type: 'error' });
                }
                if (pkgCost > MAX_PRICE_LIMIT) {
                    return EventBus.emit('req-show-toast', { message: `تكلفة الباقة (${pkg.name}) تتجاوز الحد الأقصى المسموح (${MAX_PRICE_LIMIT}$).`, type: 'error' });
                }
                const pkgIsFixed = Boolean(pkg.isFixedPrice === true || String(pkg.isFixedPrice).toLowerCase() === 'true');
                const pkgFixedUsd = Number(pkg.fixedPriceUsd ?? pkg.price ?? 0);
                if (pkgIsFixed && pkgCost > 0) {
                    const minSafePkgPrice = Number((pkgCost * minMarginFactor).toFixed(4));
                    if (pkgFixedUsd < minSafePkgPrice) {
                        return EventBus.emit('req-show-toast', { message: `السعر الثابت للباقة (${pkg.name}) يكسر رأس المال! الحد الأدنى الآمن هو ${minSafePkgPrice}$`, type: 'error' });
                    }
                }
                if (pkg.vaultPoolId) {
                    if (supplierId) {
                        return EventBus.emit('req-show-toast', { message: `الباقة (${pkg.name}) مربوطة بخزنة بينما المنتج الأب مربوط بمورد! يمنع الخلط بينهما.`, type: 'error' });
                    }
                    if (usedPkgVaults.has(String(pkg.vaultPoolId))) {
                        return EventBus.emit('req-show-toast', { message: `لا يمكن ربط نفس صندوق الخزنة بأكثر من باقة فرعية داخل نفس المنتج.`, type: 'error' });
                    }
                    usedPkgVaults.add(String(pkg.vaultPoolId));
                    const conflictMsg = this._checkVaultConflictAcrossStore(pkg.vaultPoolId, tempEditId, i);
                    if (conflictMsg) {
                        return EventBus.emit('req-show-toast', { message: `⚠️ تعارض خزنة في الباقة (${pkg.name}): ${conflictMsg}`, type: 'error' });
                    }
                }
            }
        } else {
            if (rawCost <= 0 && !supplierId) {
                return EventBus.emit('req-show-toast', { message: 'لا يمكن أن تكون التكلفة 0$ للمنتجات المحلية.', type: 'error' });
            }
            if (rawCost > MAX_PRICE_LIMIT) {
                return EventBus.emit('req-show-toast', { message: `مرفوض: التكلفة تتجاوز الحد الأقصى الآمن (${MAX_PRICE_LIMIT}$).`, type: 'error' });
            }
            if (isFixed) {
                if (rawFixedVal <= 0) {
                    return EventBus.emit('req-show-toast', { message: 'يرجى إدخال قيمة السعر الثابت بالدولار.', type: 'error' });
                }
                if (rawCost > 0) {
                    const sanitizeUnit = type === 'counter' ? FinancialEngine._internalSanitize : FinancialEngine.sanitizeAmount;
                    const minSafeFixed = sanitizeUnit(rawCost * minMarginFactor);
                    if (rawFixedVal < minSafeFixed) {
                        return EventBus.emit('req-show-toast', { message: `السعر الثابت المدخل (${rawFixedVal}$) أقل من التكلفة أو يكسر هامش الأمان! الحد الأدنى المسموح هو ${minSafeFixed}$`, type: 'error' });
                    }
                }            
            }
        }

        this._actionLocks.add('save-prod');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري معالجة وحفظ بيانات المنتج...');

        try {
            const hasImg = AdminUI?.CatalogUI?.hasImage?.('pr-img-wrap');
            const isEdit = !!tempEditId;
            
            const oldProd = isEdit ? (AdminData.data.prodsMap?.[tempEditId] || (AdminData.data.prods || []).find(p => String(p.id) === String(tempEditId))) : null;
            const oldImg = oldProd ? (oldProd.img || oldProd.image || null) : null;
            
            let finalImg = oldImg || '';
            if (hasImg) {
                const fileInput = document.getElementById('pr-img-input');
                const fileToUpload = fileInput?.files?.[0];

                if (fileToUpload) {
                    EventBus.emit('req-show-toast', { message: 'جاري ضغط ومعالجة صورة المنتج...', type: 'info' });
                    
                    const compressedBase64 = await new Promise(resolve => {
                        if (UIService && UIService.processImage) UIService.processImage(fileToUpload, resolve);
                        else resolve(null);
                    });

                    let fileForUpload = fileToUpload;
                    if (compressedBase64 && compressedBase64.startsWith('data:image')) {
                        const mimeMatch = compressedBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
                        const mimeType = mimeMatch ? mimeMatch[1] : (fileToUpload.type || 'image/jpeg');
                        const byteString = atob(compressedBase64.split(',')[1]);
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                        const blob = new Blob([ab], { type: mimeType });
                        fileForUpload = new File([blob], fileToUpload.name, { type: mimeType });
                    }

                    // 🚀 [الإصلاح المعماري]: إظهار اللودر للصور
                    if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري رفع صورة المنتج للسحابة...');
                    if (oldImg && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                        await FirebaseAdapter.deleteImageByUrl(oldImg).catch(()=>{});
                    }
                    finalImg = await FirebaseAdapter.uploadImage(fileForUpload, 'products', null, true);
                }
            } else if (oldImg) {
                await FirebaseAdapter.deleteImageByUrl(oldImg).catch(()=>{});
                finalImg = '';
            }

            const newProdId = isEdit ? String(tempEditId) : 'prod_' + Date.now();
            const defaultTier = AdminData.data.tiers?.find(t => t.isDefault && t.type !== 'api') || AdminData.data.tiers?.find(t => t.isDefault) || AdminData.data.tiers?.[0];

            let normalizedOptions = null;
            let effectiveParentCost = rawCost;
            let fallbackPrice = rawCost;

            // 🚀 [الإصلاح المعماري]: استخراج حالة الإخفاء والإيقاف اليدوي
            const isManualAvailChecked = Utils.getCheck('pr-available', true);
            const isManualActiveChecked = Utils.getCheck('pr-active', true);
            const isManuallyPaused = !isManualAvailChecked;

            // 🛡️ التحديث المطلوب: إصلاح مشكلة `stockCount` ودعم الإيقاف المؤقت (isManuallyPaused)
            if (type === 'select') {
                normalizedOptions = this.tempPackages.map((pkg, idx) => {
                    const pkgCost = Number(pkg.costPrice ?? pkg.cost_price ?? pkg.price ?? 0);
                    const pkgIsFixed = Boolean(pkg.isFixedPrice === true || String(pkg.isFixedPrice).toLowerCase() === 'true');
                    const pkgFixedVal = pkgIsFixed ? Number(pkg.fixedPriceUsd ?? pkg.price ?? pkgCost) : 0;

                    let calcOptPrice = pkgCost;
                    if (pkgIsFixed && pkgFixedVal > 0) {
                        calcOptPrice = pkgFixedVal;
                    } else if (defaultTier && pkgCost > 0) {
                        try {
                            const optPricing = FinancialEngine.calculatePrice({ product: { costPrice: pkgCost }, tier: defaultTier });
                            calcOptPrice = optPricing.finalPrice;
                        } catch (e) {
                            calcOptPrice = pkgCost;
                        }
                    }

                    const optVaultId = (!supplierId && pkg.vaultPoolId) ? String(pkg.vaultPoolId).trim() : null;
                    const isOptManuallyPaused = Boolean(pkg.isManuallyPaused === true);
                    let optStock = null;
                    let optAvail = !isOptManuallyPaused;

                    if (optVaultId) {
                        const vPool = AdminData.data.vaultMap?.[optVaultId] || (AdminData.data.vault || []).find(v => String(v.id) === optVaultId);
                        optStock = vPool ? Number(vPool.stockCount || 0) : 0;
                        optAvail = !isOptManuallyPaused && (optStock > 0);
                    } else if (supplierId && !isOptManuallyPaused) {
                        optAvail = pkg.isAvailable !== undefined ? Boolean(pkg.isAvailable) : true;
                    }

                    return {
                        name: String(pkg.name || '').trim(),
                        costPrice: pkgCost,
                        price: calcOptPrice,
                        isFixedPrice: pkgIsFixed,
                        ...(pkgIsFixed && pkgFixedVal > 0 ? { fixedPriceUsd: pkgFixedVal } : {}),
                        vaultPoolId: optVaultId,
                        supplierId: supplierId || null,
                        externalId: (supplierId && pkg.externalId) ? String(pkg.externalId).trim() : null,
                        sortOrder: idx,
                        order: idx,
                        isActive: pkg.isActive !== false,
                        isManuallyPaused: isOptManuallyPaused,
                        isAvailable: optAvail,
    ...(optStock !== null && { stockCount: optStock }),
    ...(pkg.tierPrices && { tierPrices: pkg.tierPrices }),
    ...(pkg.badgeText && { badgeText: pkg.badgeText }),
    ...(pkg.badgeColor && { badgeColor: pkg.badgeColor })
};                });

                const firstActiveOpt = normalizedOptions.find(o => o && o.isActive !== false) || normalizedOptions[0];
                if (firstActiveOpt) {
                    effectiveParentCost = Number(firstActiveOpt.costPrice || 0);
                    fallbackPrice = Number(firstActiveOpt.price || 0);
                }
            } else {
                if (isFixed) {
                    fallbackPrice = rawFixedVal;
                } else if (defaultTier && rawCost > 0) {
                    try {
                        const pricing = FinancialEngine.calculatePrice({ product: { type: type, costPrice: rawCost }, tier: defaultTier });
                        fallbackPrice = pricing.finalPrice;
                    } catch (e) {
                        fallbackPrice = rawCost;
                    }
                }
            }
            
            const resolvedCategoryId = isEdit
                ? String(oldProd?.categoryId || oldProd?.catId || AdminData.currFolder || '')
                : (AdminData.currFolder != null ? String(AdminData.currFolder) : null);

            const computedVaultIds = [...new Set([
                type !== 'select' ? (vaultPoolId || null) : null,
                ...(Array.isArray(normalizedOptions) ? normalizedOptions.map(o => o?.vaultPoolId) : [])
            ].filter(Boolean).map(String))];

            let parentAvail = !isManuallyPaused;
            let parentStock = (isEdit && !supplierId && vaultPoolId) ? oldProd?.stockCount : undefined;

            if (type !== 'select' && !supplierId && vaultPoolId) {
                const vPool = AdminData.data.vaultMap?.[vaultPoolId] || (AdminData.data.vault || []).find(v => String(v.id) === vaultPoolId);
                parentStock = vPool ? Number(vPool.stockCount || 0) : 0;
                parentAvail = !isManuallyPaused && (parentStock > 0);
            } else if (type === 'select' && Array.isArray(normalizedOptions)) {
                parentAvail = !isManuallyPaused && normalizedOptions.some(o => o && o.isActive !== false && o.isAvailable !== false);
            }

            // 🛡️ التحديث المطلوب: إزالة `deleteField` وحفظ isManuallyPaused و isActive
            let updatedFields = {
                id: newProdId, 
                categoryId: resolvedCategoryId,
                name: name, 
                description: Utils.getVal('pr-desc').trim(),
                type: type, 
                img: finalImg, 
                image: finalImg,
                costPrice: effectiveParentCost, 
                price: fallbackPrice, 
                vaultPoolId: (type !== 'select' && !supplierId && vaultPoolId) ? vaultPoolId : null, 
                linkedVaultIds: computedVaultIds,
                hideGridPrice: Utils.getCheck('pr-hide-price'),
                isFixedPrice: type !== 'select' ? isFixed : false,
                ...(type !== 'select' && isFixed ? { fixedPriceUsd: rawFixedVal } : { fixedPriceUsd: null }),
                supplierId: supplierId || null, 
                externalId: (type !== 'select' && supplierId && externalId) ? externalId : null, 
                isExternal: Boolean(supplierId),
                
                isAutoFrozen: false, 
                requiresAdminAttention: false,
                isManuallyPaused: isManuallyPaused,
                
                isActive: isManualActiveChecked,
                isAvailable: parentAvail,
                ...(parentStock !== undefined && { stockCount: parentStock })
            };

            const l1 = Utils.getVal('h-lbl1').trim() || 'حقل إدخال';
            const l2 = Utils.getVal('h-lbl2').trim() || 'كلمة المرور';
            
            if (type === 'simple') {
                const allowQty = Utils.getCheck('pr-allow-qty');
                const simpleMax = Math.min(100, Math.max(1, parseInt(Utils.getVal('pr-simple-max'), 10) || 10));
                updatedFields.allowQty = allowQty;
                updatedFields.simpleMax = simpleMax;
                updatedFields.minQty = 1;
                updatedFields.maxQty = allowQty ? simpleMax : 1;
            } else if (type === 'single') {
                updatedFields.input1Label = l1;
                updatedFields.minQty = 1;
                updatedFields.maxQty = 1;
            } else if (type === 'double') {
                updatedFields.input1Label = l1;
                updatedFields.input2Label = l2;
                updatedFields.minQty = 1;
                updatedFields.maxQty = 1;
            } else if (type === 'counter') {
                const minQ = Math.min(5000000, Math.max(1, parseInt(Utils.getVal('pr-min'), 10) || 1));
                const maxQ = Math.min(5000000, Math.max(minQ, parseInt(Utils.getVal('pr-max'), 10) || 100));
                updatedFields.minQty = minQ;
                updatedFields.maxQty = maxQ;
                updatedFields.input1Label = l1;
            } else if (type === 'select') {
                updatedFields.options = normalizedOptions; 
                updatedFields.input1Label = l1;
                updatedFields.minQty = 1;
                updatedFields.maxQty = 1;
            }

            let finalProductObj;

            if (isEdit) {
                const idx = AdminData.data.prods.findIndex(x => String(x.id) === newProdId);
                const existingOrder = oldProd?.order ?? oldProd?.sortOrder ?? 0;
                updatedFields.order = existingOrder;
                updatedFields.sortOrder = existingOrder;
                
                if (idx > -1) {
                    finalProductObj = { ...AdminData.data.prods[idx], ...updatedFields };
                    if (type !== 'select') finalProductObj.options = null;
                    finalProductObj.syncNote = null; 
                    if (!vaultPoolId || supplierId || type === 'select') finalProductObj.stockCount = null;
                    AdminData.data.prods[idx] = finalProductObj;
                } else {
                    finalProductObj = { ...updatedFields };
                    if (type !== 'select') delete finalProductObj.options;
                    AdminData.data.prods.push(finalProductObj);
                }           
            } else {
                const sameCatProds = (AdminData.data.prods || []).filter(p => String(p.categoryId || p.catId) === String(resolvedCategoryId));
                const nextOrder = sameCatProds.length > 0 ? Math.max(...sameCatProds.map(p => Number(p.order ?? p.sortOrder ?? -1))) + 1 : 0;
                updatedFields.order = nextOrder;
                updatedFields.sortOrder = nextOrder;
                
                finalProductObj = { ...updatedFields };
                if (type !== 'select') delete finalProductObj.options;
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
            EventBus.emit('req-show-toast', { message: 'فشل الحفظ: ' + (error.message || 'خطأ غير معروف'), type: 'error' });
        } finally {
            this._actionLocks.delete('save-prod');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            this.tempPackages = [];
            EventBus.emit('req-update-state', { tempPackages: [] });
        }
    },    

    deleteProduct: async function(id) {
        if (this._actionLocks.has('delete-prod')) return;

        const prod = AdminData.data.prodsMap?.[id] || AdminData.data.prods.find(p => String(p.id) === String(id));
        
        if (prod?.supplierId) {
            const confirmApi = await AdminUI.showConfirm('⚠ تحذير معماري:\nهذا المنتج مربوط بمورد (API). لإخفائه مؤقتاً يفضل تعطيله بدلاً من حذفه.\n\nهل تريد حذفه نهائياً على أي حال؟', 'منتج مورد (API)');
            if (!confirmApi) return;
        } else {
            const confirmLocal = await AdminUI.showConfirm('هل أنت متأكد من حذف هذا المنتج نهائياً؟');
            if (!confirmLocal) return;
        }

        this._actionLocks.add('delete-prod');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري مسح بيانات المنتج...');
        
        try {
            const prodImg = prod?.img || prod?.image;
            if (prodImg) await FirebaseAdapter.deleteImageByUrl(prodImg).catch(() => {});
            
            AdminData.data.prods = AdminData.data.prods.filter(p => String(p.id) !== String(id));
            if(AdminData.data.prodsMap) delete AdminData.data.prodsMap[id];

            await AdminData?.saveProducts?.();

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
        
        const affectedProds = AdminData.data.prods.filter(p => String(p.categoryId || p.catId) === catId || allChildCatIds.has(String(p.categoryId || p.catId)));
        const affectedCats = AdminData.data.cats.filter(c => allChildCatIds.has(String(c.id)));
        
        const hasApiProducts = affectedProds.some(p => p.supplierId != null);
        
        let warningMsg = `تحذير: سيتم حذف القسم "${categoryToDelete?.name || 'المحدد'}" نهائياً.`;
        if (affectedCats.length > 0 || affectedProds.length > 0) {
            warningMsg += `\nسيؤدي هذا أيضاً إلى حذف:\n`;
            if (affectedCats.length > 0) warningMsg += `- ${affectedCats.length} أقسام فرعية.\n`;
            if (affectedProds.length > 0) warningMsg += `- ${affectedProds.length} منتجات مرتبط بها.\n`;
        }
        
        if (hasApiProducts) {
            warningMsg += `\n\n⚠️ تنبيه: هذا القسم يحتوي على منتجات مرتبطة بمورد API.`;
        }
        
        warningMsg += `\nهل أنت متأكد من المتابعة؟`;

        if (AdminUI && await AdminUI.showConfirm(warningMsg)) {
            this._actionLocks.add('delete-cat');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري حرق بيانات القسم وتوابعه سحابياً...');
            try {
                const imagesToBurn = [categoryToDelete?.img || categoryToDelete?.image, ...affectedCats.map(c => c.img || c.image), ...affectedProds.map(p => p.img || p.image)].filter(Boolean);
                if (imagesToBurn.length > 0) Promise.allSettled(imagesToBurn.map(imgUrl => FirebaseAdapter.deleteImageByUrl(imgUrl)));

                AdminData.data.cats = AdminData.data.cats.filter(c => String(c.id) !== catId && !allChildCatIds.has(String(c.id)));
                AdminData.data.prods = AdminData.data.prods.filter(p => String(p.categoryId || p.catId) !== catId && !allChildCatIds.has(String(p.categoryId || p.catId)));
                
                if (AdminData.data.catsMap) {
                    delete AdminData.data.catsMap[catId];
                    allChildCatIds.forEach(childId => delete AdminData.data.catsMap[childId]);
                }
                if (AdminData.data.prodsMap) affectedProds.forEach(p => delete AdminData.data.prodsMap[p.id]);
                
                await AdminData?.saveCategories?.();
                await AdminData?.saveProducts?.();
                
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

        // 🛡️ التحديث المطلوب: إزالة التشفير المزدوج عن أسماء الأقسام
        const name = Utils.getVal('c-name').trim();
        if (!name) return EventBus.emit('req-show-toast', { message: 'يرجى إدخال اسم القسم', type: 'warning' });
        
        this._actionLocks.add('save-cat');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري التوثيق سحابياً...');
        
        try {
            const hasImg = AdminUI?.CatalogUI?.hasImage?.('c-img-wrap');
            const tempEditId = AdminData.tempEditId;
            const oldCat = tempEditId ? (AdminData.data.catsMap?.[tempEditId] || (AdminData.data.cats || []).find(x => String(x.id) === String(tempEditId))) : null;
            const oldImg = oldCat ? (oldCat.img || oldCat.image || null) : null;
            
            let finalImg = oldImg || '';
            if (hasImg) {
                const fileInput = document.getElementById('c-img-input');
                const fileToUpload = fileInput?.files?.[0];

                if (fileToUpload) {
                    EventBus.emit('req-show-toast', { message: 'جاري ضغط ومعالجة صورة القسم...', type: 'info' });
                    
                    const compressedBase64 = await new Promise(resolve => {
                        if (UIService && UIService.processImage) UIService.processImage(fileToUpload, resolve);
                        else resolve(null);
                    });

                    let fileForUpload = fileToUpload;
                    if (compressedBase64 && compressedBase64.startsWith('data:image')) {
                        const mimeMatch = compressedBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
                        const mimeType = mimeMatch ? mimeMatch[1] : (fileToUpload.type || 'image/jpeg');
                        const byteString = atob(compressedBase64.split(',')[1]);
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                        const blob = new Blob([ab], { type: mimeType });
                        fileForUpload = new File([blob], fileToUpload.name, { type: mimeType });
                    }

                    // 🚀 [الإصلاح المعماري]: إظهار اللودر للصور
                    if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري رفع صورة القسم للسحابة...');
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
                if (c) { c.name = name; c.img = finalImg; c.image = finalImg; }
            } else {
                const sameParentCats = AdminData.data.cats.filter(c => String(c.parentId) === String(AdminData.currFolder));
                const maxOrder = sameParentCats.length > 0 ? Math.max(...sameParentCats.map(c => Number(c.order ?? c.sortOrder ?? -1))) + 1 : 0;
                AdminData.data.cats.push({ id: catId, name: name, parentId: AdminData.currFolder != null ? String(AdminData.currFolder) : null, img: finalImg, image: finalImg, order: maxOrder, sortOrder: maxOrder, isActive: true });
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
        if (this._actionLocks.has('save-sort-order')) return;
        
        this._actionLocks.add('save-sort-order');
        
        try {
            let catsChanged = false;
            let prodsChanged = false;
            let bannersChanged = false;
            
            newOrderData.forEach(item => {
                if (!item || !item.id) return;
                const targetOrder = Number(item.order);
                if (isNaN(targetOrder)) return;
                const itemIdStr = String(item.id);
                
                if (item.type === 'cat') {
                    const cat = AdminData.data.catsMap?.[itemIdStr] ||
                        (AdminData.data.cats || []).find(c => String(c.id) === itemIdStr);
                    if (cat && (Number(cat.order ?? -1) !== targetOrder || Number(cat.sortOrder ?? -1) !== targetOrder)) {
                        cat.order = targetOrder;
                        cat.sortOrder = targetOrder;
                        catsChanged = true;
                    }
                } else if (item.type === 'prod') {
                    const prod = AdminData.data.prodsMap?.[itemIdStr] ||
                        (AdminData.data.prods || []).find(p => String(p.id) === itemIdStr);
                    if (prod && (Number(prod.order ?? -1) !== targetOrder || Number(prod.sortOrder ?? -1) !== targetOrder)) {
                        prod.order = targetOrder;
                        prod.sortOrder = targetOrder;
                        prodsChanged = true;
                    }
                } else if (item.type === 'banner') {
                    const bnr = (AdminData.data.banners || []).find(b => String(b.id) === itemIdStr);
                    if (bnr && Number(bnr.order ?? -1) !== targetOrder) {
                        bnr.order = targetOrder;
                        bannersChanged = true;
                    }
                }
            });
            
            if (catsChanged) await AdminData?.saveCategories?.();
            if (prodsChanged) await AdminData?.saveProducts?.();
            if (bannersChanged) await AdminData?.saveBanners?.();
            
            if (catsChanged || prodsChanged || bannersChanged) {
                if (AdminData?.addLog) {
                    AdminData.addLog('REORDER_CATALOG', `تم حفظ ترتيب العناصر الجديد سحابياً بنجاح.`);
                }
            }
        } catch (error) {
            console.error("Save Sort Order Error:", error);
            EventBus.emit('req-show-toast', { message: 'تعذر حفظ الترتيب الجديد في السحابة. تأكد من جودة الاتصال.', type: 'error' });
        } finally {
            this._actionLocks.delete('save-sort-order');
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
            EventBus.emit('req-show-toast', { message: 'تم حفظ التخطيط', type: 'success' });
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
            EventBus.emit('req-show-toast', { message: 'تم الحفظ', type: 'info' });
        } finally {
            this._actionLocks.delete('toggle-sync');
        }
    },

    addPackage: function() {
        const name = Utils.getVal('pkg-name').trim();
        const rawCost = parseFloat(Utils.getVal('pkg-price')) || 0;
        const rawFixedPrice = parseFloat(Utils.getVal('pkg-fixed-price')) || 0;
        const pkgVaultId = (Utils.getVal('pkg-vault') || '').trim() || null;
        const pkgExtId = (Utils.getVal('pkg-ext-id') || '').trim() || null;
        const parentSupplierId = (Utils.getVal('pr-supplier') || '').trim() || null;
        const editIdx = parseInt(Utils.getVal('pkg-edit-index', -1), 10);

        if (!name) {
            return EventBus.emit('req-show-toast', { message: 'يرجى إدخال اسم الباقة الفرعية.', type: 'warning' });
        }
        if (rawCost <= 0 && !parentSupplierId) {
            return EventBus.emit('req-show-toast', { message: 'يرجى إدخال التكلفة الفعلية للباقة بالدولار (أكبر من 0$).', type: 'error' });
        }
        if (pkgExtId && !parentSupplierId) {
            return EventBus.emit('req-show-toast', { message: '⚠️ لا يمكن ربط الباقة بكود مورد بدون اختيار المورد الأساسي للمنتج الأب بالأعلى أولاً!', type: 'error' });
        }
        if (parentSupplierId && pkgVaultId) {
            return EventBus.emit('req-show-toast', { message: '⚠️ لا يمكن ربط الباقة بخزنة محلية بينما المنتج الأب مربوط بمورد خارجي!', type: 'error' });
        }

        if (rawFixedPrice > 0 && rawCost > 0) {
            const minMarginFactor = 1 + (FinancialEngine.CONFIG.MIN_MARGIN_PERCENT / 100);
            const minSafePkgPrice = Number((rawCost * minMarginFactor).toFixed(4));
            if (rawFixedPrice < minSafePkgPrice) {
                return EventBus.emit('req-show-toast', { message: `السعر الثابت للباقة (${rawFixedPrice}$) يكسر رأس المال! الحد الأدنى الآمن هو ${minSafePkgPrice}$`, type: 'error' });
            }
        }

        if (pkgVaultId) {
            const conflictMsg = this._checkVaultConflictAcrossStore(pkgVaultId, AdminData.tempEditId, editIdx);
            if (conflictMsg) {
                return EventBus.emit('req-show-toast', { message: `⚠️ ${conflictMsg}`, type: 'error' });
            }
        }

        const defaultTier = AdminData.data.tiers?.find(t => t.isDefault && t.type !== 'api') || AdminData.data.tiers?.find(t => t.isDefault) || AdminData.data.tiers?.[0];
        let calcPkgPrice = rawCost;
        if (rawFixedPrice > 0) {
            calcPkgPrice = rawFixedPrice;
        } else if (defaultTier && rawCost > 0) {
            try {
                calcPkgPrice = FinancialEngine.calculatePrice({ product: { costPrice: rawCost }, tier: defaultTier }).finalPrice;
            } catch (e) {
                calcPkgPrice = rawCost;
            }
        }

        const existingPkg = (editIdx >= 0 && editIdx < this.tempPackages.length) ? this.tempPackages[editIdx] : null;
        
        // 🚀 [الإصلاح المعماري]: الحفاظ على حالة الإيقاف المؤقت
        const isManuallyPaused = Boolean(existingPkg?.isManuallyPaused === true);
        
        const pkgObj = {
            ...(existingPkg || {}),
            name,
            costPrice: rawCost,
            price: calcPkgPrice,
            isFixedPrice: rawFixedPrice > 0,
            ...(rawFixedPrice > 0 ? { fixedPriceUsd: rawFixedPrice } : { fixedPriceUsd: null }),
            vaultPoolId: pkgVaultId,
            supplierId: parentSupplierId,
            externalId: parentSupplierId ? pkgExtId : null,
            isActive: existingPkg?.isActive !== undefined ? existingPkg.isActive : true,
            isManuallyPaused: isManuallyPaused,
            isAvailable: isManuallyPaused ? false : (pkgVaultId ? (existingPkg?.isAvailable !== undefined ? existingPkg.isAvailable : true) : true)
        };
        
        if (!pkgVaultId) delete pkgObj.stockCount;

        if (editIdx >= 0 && editIdx < this.tempPackages.length) {
            this.tempPackages[editIdx] = pkgObj;
        } else {
            this.tempPackages.push(pkgObj);
        }

        EventBus.emit('req-update-state', { tempPackages: this.tempPackages });
        AdminRender?.renderPkgList?.();
        AdminUI?.CatalogUI?.clearPackageInputs?.();
        this.updatePricePreview();
    },

    editPackage: function(index) {
        if (index < 0 || index >= this.tempPackages.length) return;
        const pkg = this.tempPackages[index];
        AdminUI?.CatalogUI?.populatePackageForEdit?.(pkg, index);
    },

    removePkg: function(i) {
        this.tempPackages.splice(i, 1);
        EventBus.emit('req-update-state', { tempPackages: this.tempPackages });
        AdminRender?.renderPkgList?.();
        AdminUI?.CatalogUI?.clearPackageInputs?.();
        this.updatePricePreview();
    },

    // 🚀 [الإصلاح المعماري]: دالة تبديل حالة التوفر (تفعيل/إيقاف مؤقت)
    togglePackageAvailability: function(index) {
        if (index < 0 || index >= this.tempPackages.length) return;
        const pkg = this.tempPackages[index];
        if (!pkg) return;
        
        const currentlyPaused = Boolean(pkg.isManuallyPaused === true || pkg.isAvailable === false);
        pkg.isManuallyPaused = !currentlyPaused;
        pkg.isAvailable = currentlyPaused;
        
        EventBus.emit('req-update-state', { tempPackages: this.tempPackages });
        AdminRender?.renderPkgList?.();
    },

    saveCountry: async function() {
        if (this._actionLocks.has('save-country')) return;

        const editId = Utils.getVal('country-edit-id');
        
        const nameAr = Utils.getVal('country-name').trim();
        const code = Utils.getVal('country-code').trim().toUpperCase();
        const flagEmoji = Utils.getVal('country-flag').trim();
        const dialCode = Utils.getVal('country-dial').trim();

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
        
        // 🛡️ التحديث المطلوب: حفظ اسم الصندوق بالنص الخام (دون escapeHTML)
        const name = Utils.getVal('v-name').trim();
        const unitCostUsd = FinancialEngine.extractNum(Utils.getVal('v-unit-cost', 0));
        const alertLimit = Number(Utils.getVal('v-alert-limit', 5)) || 5;
        const rawText = Utils.getVal('v-codes');

        if (!name) return EventBus.emit('req-show-toast', { message: 'يرجى إدخال اسم الصندوق', type: 'error' });
        
        const lines = rawText.split('\n').map(c => c.trim()).filter(Boolean);
        if (lines.length > 20000) {
            return EventBus.emit('req-show-toast', { message: `مرفوض: حاولت إضافة ${lines.length} كود. الحد الأقصى للدفعة الواحدة هو 20,000 كود لحماية الذاكرة.`, type: 'error' });
        }

        if (lines.length > 0 && unitCostUsd <= 0) {
            return EventBus.emit('req-show-toast', { message: 'يرجى إدخال تكلفة الكود الواحد بالدولار ($) لحساب قيمة الأصول المجمدة في الخزنة بدقة.', type: 'warning' });
        }

        this._actionLocks.add('save-vault');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري فرز وتشفير الأكواد سحابياً...');

        try {
            const finalPoolId = id && id !== '' ? id : 'vpool_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            
            const result = await FirebaseAdapter.callFunction('adminSaveVaultCodes', {
                poolId: finalPoolId,
                poolName: name,
                alertLimit: alertLimit,
                unitCostUsd: unitCostUsd,
                codesList: lines
            });

            if (result && (result.success || lines.length === 0)) {
                if (!AdminData.data.vault) AdminData.data.vault = [];
                if (!AdminData.data.vaultMap) AdminData.data.vaultMap = {};

                const existingPoolIndex = AdminData.data.vault.findIndex(v => String(v.id) === finalPoolId);
                const addedCount = Number(result.addedCount || 0); 

                if (existingPoolIndex > -1) {
                    const poolObj = AdminData.data.vault[existingPoolIndex];
                    poolObj.name = name;
                    poolObj.alertLimit = alertLimit;
                    if (unitCostUsd > 0) poolObj.unitCostUsd = unitCostUsd;
                    poolObj.stockCount = Number(poolObj.stockCount || 0) + addedCount;
                    poolObj.totalCount = Number(poolObj.totalCount || poolObj.stockCount || 0) + addedCount;
                    AdminData.data.vaultMap[finalPoolId] = poolObj;
                } else {
                    const newPoolObj = {
                        id: finalPoolId,
                        name: name,
                        alertLimit: alertLimit,
                        unitCostUsd: unitCostUsd > 0 ? unitCostUsd : 0,
                        stockCount: addedCount,
                        totalCount: addedCount,
                        burnedCount: 0
                    };
                    AdminData.data.vault.push(newPoolObj);
                    AdminData.data.vaultMap[finalPoolId] = newPoolObj;
                }

                // 🔗 مزامنة مخزون وتوفر المنتجات المرتبطة بهذا الصندوق في الذاكرة المحلية لتطابق السيرفر فوراً
                const updatedVaultStock = Number(AdminData.data.vaultMap[finalPoolId]?.stockCount || 0);
                if (addedCount > 0 && Array.isArray(AdminData.data.prods)) {
                    let anyProdSynced = false;
                    AdminData.data.prods.forEach(p => {
                        if (!p) return;
                        const isFrozen = Boolean(p.isAutoFrozen || p.requiresAdminAttention || p.isManuallyPaused);
                        if (String(p.vaultPoolId || '') === finalPoolId) {
                            p.stockCount = updatedVaultStock;
                            if (!isFrozen && updatedVaultStock > 0) p.isAvailable = true;
                            anyProdSynced = true;
                        }
                        if (p.type === 'select' && Array.isArray(p.options)) {
                            let optModified = false;
                            p.options.forEach(opt => {
                                if (opt && String(opt.vaultPoolId || '') === finalPoolId) {
                                    opt.stockCount = updatedVaultStock;
                                    const optCost = Number(opt.costPrice ?? opt.cost_price ?? 0);
                                    if (!isFrozen && !opt.isManuallyPaused && opt.isActive !== false && optCost > 0 && updatedVaultStock > 0) {
                                        opt.isAvailable = true;
                                    }
                                    optModified = true;
                                }
                            });
                            if (optModified) {
                                if (!p.vaultPoolId && !isFrozen) {
                                    p.isAvailable = p.options.some(o => o && o.isActive !== false && o.isAvailable !== false);
                                }
                                anyProdSynced = true;
                            }
                        }
                    });
                    if (anyProdSynced) {
                        AdminData._buildSingleMap?.('prods');
                        AdminData._updateSnapshot?.('prods');
                    }
                }

                const codesInput = document.getElementById('v-codes');
                if (codesInput) codesInput.value = '';

                EventBus.emit('req-finish-action', {
                    renderEvent: 'req-render-vault',
                    modalId: 'vault',
                    logAction: id ? 'EDIT_VAULT' : 'ADD_VAULT',
                    logDetails: `صندوق أكواد: ${name} (+${addedCount})`,
                    toastMsg: result.message || `تم حفظ الصندوق بنجاح!`
                });
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
                    if (AdminData.data.vaultMap) delete AdminData.data.vaultMap[String(id)];
                    
                    if (AdminData.data.prods) {
                        AdminData.data.prods.forEach(p => {
                            if (String(p.vaultPoolId) === String(id)) {
                                p.vaultPoolId = null;
                                p.stockCount = 0;
                                p.isAvailable = false;
                            }
                            if (Array.isArray(p.options)) {
                                p.options.forEach(opt => {
                                    if (opt && String(opt.vaultPoolId) === String(id)) {
                                        opt.vaultPoolId = null;
                                        opt.stockCount = 0;
                                        opt.isAvailable = false;
                                    }
                                });
                            }
                        });
                        AdminData._buildSingleMap?.('prods');
                        AdminData._updateSnapshot?.('prods');
                    }

                    EventBus.emit('req-render-vault');
                    EventBus.emit('req-render-prods'); 
                    EventBus.emit('req-show-toast', { message: 'تم التدمير وفك ارتباط المنتجات بنجاح', type: 'success' });
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
        const pool = AdminData.data.vaultMap?.[poolId] || AdminData.data.vault?.find(v => String(v.id) === poolId);
        
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
