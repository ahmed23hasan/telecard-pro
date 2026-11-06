// ============================================================================
// 🧠 متحكم التسويق (modules/marketing/marketingController.js) - Cloud-Native V20.5 🛡️
// 🚀 التحديثات المعمارية:
// 1. Single-Pass Image Upload 🖼️: استخدام الصور المضغوطة الجاهزة في saveBanner و saveStoreIdentity دون إعادة ضغطها أو إخفاء اللودر بالخطأ.
// 2. Strict Selection Validation 🌳: قراءة التحديد الفعلي للمستويات والمنتجات والستوري مباشرة بعد ضبط ترتيب بناء الشجرة.
// 3. Advanced Pricing Shield 🛡️: دالة _validatePromoSafetyLocal لحماية رأس المال في العروض والكوبونات.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';
import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { FinancialEngine } from '../../core/financialEngine.js';

export const MarketingController = {

    _actionLocks: new Set(), 

    _validatePromoSafetyLocal: function(promoData, isCoupon = false) {
        if (!promoData || promoData.isActive === false) return { isSafe: true };
        if (!isCoupon && (promoData.type === 'fake' || promoData.type === 'badge_only')) return { isSafe: true };

        const targetTiers = Array.isArray(promoData.targetTiers) ? promoData.targetTiers.filter(Boolean).map(String) : [];
        const targetProds = Array.isArray(promoData.targetProds) ? promoData.targetProds.filter(Boolean).map(String) : [];
        const targetCats = Array.isArray(promoData.targetCategories) ? promoData.targetCategories.filter(Boolean).map(String) : [];
        const hasProds = targetProds.length > 0;
        const hasCats = targetCats.length > 0;

        if (targetTiers.length === 0 || (!hasProds && !hasCats)) {
            return {
                isSafe: false,
                reason: 'لا يمكن تفعيل هذا العرض/الكوبون لأنه غير مرتبط بمنتجات أو أقسام أو مستويات محددة (ربما تم حذف المنتج المرتبط به سابقاً). يرجى تعديله وتحديد الأهداف أولاً.'
            };
        }

        const allTiers = (AdminData.data.tiers || []).filter(t => t && t.type !== 'api' && targetTiers.includes(String(t.id)));
        const allProds = (AdminData.data.prods || []).filter(p => {
            if (!p || p.isActive === false) return false;
            const pCats = [].concat(p.categoryId, p.categoryIds, p.catId).filter(Boolean).map(String);
            const isProdMatch = hasProds && targetProds.includes(String(p.id));
            const isCatMatch = hasCats && pCats.some(cid => targetCats.includes(String(cid)));
            return isProdMatch || isCatMatch;
        });

        const nowMs = Date.now();

        for (const prod of allProds) {
            if (isCoupon && (prod.disableCoupons === true || String(prod.disableCoupons).toLowerCase() === 'true')) continue;
            const optIndices = (prod.type === 'select' && Array.isArray(prod.options) && prod.options.length > 0)
                ? prod.options.map((o, idx) => (o && o.isActive !== false ? idx : -1)).filter(idx => idx >= 0)
                : [null];

            for (const optIdx of optIndices) {
                const activeOpt = optIdx !== null ? prod.options[optIdx] : null;
                const isFixed = activeOpt && activeOpt.isFixedPrice !== undefined
                    ? (String(activeOpt.isFixedPrice).toLowerCase() === 'true')
                    : (String(prod.isFixedPrice).toLowerCase() === 'true' || prod.is_fixed_price === true);
                if (isFixed) continue;

                for (const tier of allTiers) {
                    const targetPricingObj = activeOpt || prod;
                    const rawOverride = targetPricingObj.tierPrices?.[tier.id];
                    if (rawOverride !== undefined && rawOverride !== null && rawOverride !== '') {
                        const ovPrice = typeof rawOverride === 'object' ? FinancialEngine.extractNum(rawOverride.price) : FinancialEngine.extractNum(rawOverride);
                        const ovExp = (typeof rawOverride === 'object' && rawOverride.expiresAt) ? FinancialEngine.parseSafeTime(rawOverride.expiresAt) : 0;
                        if (ovPrice > 0 && (ovExp === 0 || ovExp > nowMs)) continue;
                    }

                    const baseCalc = FinancialEngine.calculatePrice({ product: prod, tier: tier, optIdx: optIdx, allowDefaultOption: optIdx === null });
                    if (baseCalc.isFirewallViolated || baseCalc.finalPrice <= 0) continue;

                    let testQty = prod.type === 'select' ? 1 : Math.max(1, Number(prod.minQty) || 1);
                    const defaultMaxQty = prod.type === 'select' ? 1 : (prod.type === 'counter' ? 5000000 : 100);
                    const rawProdMax = Number(prod.type === 'simple' ? (prod.simpleMax || prod.maxQty) : prod.maxQty) || 0;
                    const prodMaxQty = prod.type === 'select' ? 1 : Math.min(defaultMaxQty, rawProdMax > 0 ? rawProdMax : defaultMaxQty);
                    
                    if (prod.type === 'counter' && baseCalc.finalPrice < 0.02) {
                        testQty = Math.min(prodMaxQty, Math.max(testQty, Math.ceil(1 / baseCalc.finalPrice)));
                    }
                    if (isCoupon && Number(promoData.minOrder) > 0) {
                        const neededQty = Math.ceil(Number(promoData.minOrder) / baseCalc.finalPrice);
                        if (neededQty > prodMaxQty) continue;
                        testQty = Math.max(testQty, neededQty);
                    }

                    const promoCalc = FinancialEngine.calculateOrderTotal({
                        product: prod,
                        tier: tier,
                        offer: isCoupon ? null : promoData,
                        coupon: isCoupon ? promoData : null,
                        optIdx: optIdx,
                        allowDefaultOption: optIdx === null
                    }, testQty);

                    if (promoCalc.isFirewallViolated) {
                        const optLabel = activeOpt ? ` (${activeOpt.name})` : '';
                        return {
                            isSafe: false,
                            reason: `يكسر رأس المال للمنتج [${prod.name}${optLabel}] عند مستوى [${tier.nameAr || tier.name}] (السعر بعد الخصم ${promoCalc.totalFinalPrice}$ أقل من التكلفة الآمنة).`
                        };
                    }
                }
            }
        }
        return { isSafe: true };
    },

    _showBatchCollisionResolver: function(collisions) {
        return new Promise((resolve) => { AdminUI?.MarketingUI?.showBatchCollisionResolverUI?.(collisions, resolve); });
    },

    _checkOfferCollisions: async function(newOffer) {
        const targetProds = newOffer.targetProds || [];
        if (!targetProds.length) return true;
        
        const otherActiveOffers = (AdminData.data.offers || []).filter(o => String(o.id) !== String(newOffer.id) && o.isActive !== false && (!o.expiryDate || o.expiryDate > Date.now()));
        const collisions = [];
        
        for (const prodId of targetProds) {
            for (const oldOffer of otherActiveOffers) {
                if (oldOffer.targetProds && oldOffer.targetProds.includes(String(prodId))) {
                    const prodObj = AdminData.data.prodsMap?.[prodId] || (AdminData.data.prods || []).find(p => String(p.id) === String(prodId));
                    collisions.push({
                        prodId: String(prodId),
                        prodName: prodObj ? prodObj.name : `المنتج #${prodId}`,
                        oldOfferId: oldOffer.id,
                        oldOfferName: oldOffer.name,
                        oldOfferRef: oldOffer 
                    });
                    break;
                }
            }
        }
        
        if (collisions.length === 0) return true;
        
        const resolvedIds = await this._showBatchCollisionResolver(collisions);
        if (resolvedIds === null) return false;
        
        collisions.forEach(col => {
            if (resolvedIds.includes(col.prodId)) {
                col.oldOfferRef.targetProds = col.oldOfferRef.targetProds.filter(id => String(id) !== col.prodId);
                if (col.oldOfferRef.visualConfig && col.oldOfferRef.visualConfig.storyProducts) {
                    col.oldOfferRef.visualConfig.storyProducts = col.oldOfferRef.visualConfig.storyProducts.filter(id => String(id) !== col.prodId);
                }
                const remainingProds = Array.isArray(col.oldOfferRef.targetProds) ? col.oldOfferRef.targetProds.length : 0;
                const remainingCats = Array.isArray(col.oldOfferRef.targetCategories) ? col.oldOfferRef.targetCategories.length : 0;
                if (remainingProds === 0 && remainingCats === 0) {
                    col.oldOfferRef.isActive = false;
                }
            } else {
                newOffer.targetProds = newOffer.targetProds.filter(id => String(id) !== col.prodId);
                if (newOffer.visualConfig && newOffer.visualConfig.storyProducts) {
                    newOffer.visualConfig.storyProducts = newOffer.visualConfig.storyProducts.filter(id => String(id) !== col.prodId);
                }
            }
        });
        
        if (newOffer.targetProds.length === 0) {
            EventBus.emit('req-show-toast', { message: 'تم إفراغ العرض الجديد بعد استبعاد التضاربات. تم إلغاء الحفظ.', type: 'error' });
            return false;
        }
        return true;
    },

    _checkStoryShapeSync: async function(newOffer) {
        if (!newOffer.visualConfig || !newOffer.visualConfig.storyEnabled || !newOffer.visualConfig.storyProducts.length) return true;
        
        const newShape = newOffer.visualConfig.storyShape;
        const targetCatIds = new Set();
        
        newOffer.visualConfig.storyProducts.forEach(pId => {
            const p = AdminData.data.prodsMap?.[pId] || (AdminData.data.prods || []).find(x => String(x.id) === String(pId));
            if (p) {
                const pCats = [].concat(p.categoryId, p.categoryIds, p.catId).filter(Boolean).map(String);
                pCats.forEach(c => targetCatIds.add(c));
            }
        });

        const otherActiveStoryOffers = (AdminData.data.offers || []).filter(o => String(o.id) !== String(newOffer.id) && o.isActive !== false && (!o.expiryDate || o.expiryDate > Date.now()) && o.visualConfig && o.visualConfig.storyEnabled);

        let needsSync = false;
        let conflictingOffers = [];

        for (const oldOffer of otherActiveStoryOffers) {
            const oldShape = oldOffer.visualConfig.storyShape;
            if (oldShape !== newShape) {
                const oldStoryProds = oldOffer.visualConfig.storyProducts || [];
                const hasSharedCat = oldStoryProds.some(pId => {
                    const p = AdminData.data.prodsMap?.[pId] || (AdminData.data.prods || []).find(x => String(x.id) === String(pId));
                    if (!p) return false;
                    const pCats = [].concat(p.categoryId, p.categoryIds, p.catId).filter(Boolean).map(String);
                    return pCats.some(c => targetCatIds.has(c));
                });
                if (hasSharedCat) {
                    needsSync = true;
                    conflictingOffers.push(oldOffer);
                }
            }
        }
        
        if (needsSync) {
            const msg = `⚠️ تنبيه التناسق البصري!\nهناك عروض تظهر في نفس القسم وتستخدم شكلاً مختلفاً.\nهل توافق على توحيد كافة الأشكال لتصبح متطابقة؟`;
            if (AdminUI && await AdminUI.showConfirm(msg, 'مُزامن الهوية البصرية')) {
                conflictingOffers.forEach(o => { o.visualConfig.storyShape = newShape; });
                return true;
            } else { return false; }
        }
        return true;
    },

    saveOffer: async function() {
        if (this._actionLocks.has('save-offer')) return;
        
        const editId = AdminData.tempEditId ? String(AdminData.tempEditId) : null;
        const isEdit = !!editId;

        const name = Utils.getVal('offer-name').trim();
        const type = Utils.getVal('offer-type') || 'real';
        const value = Number(Utils.getVal('offer-value')) || 0;
        const isActive = Utils.getCheck('offer-active');
        const expiryVal = Utils.getVal('offer-expiry');
        const expiryDate = expiryVal ? Number(expiryVal) : null;
        
        if (!name) {
            AdminUI?.MarketingUI?.switchBuilderTab?.('data');
            setTimeout(() => document.getElementById('offer-name')?.focus(), 50);
            return EventBus.emit('req-show-toast', { message: '⚠️ حقل مطلوب: يرجى إدخال اسم الحملة أولاً', type: 'error' });
        }
        if (value <= 0 && type !== 'badge_only') {
            AdminUI?.MarketingUI?.switchBuilderTab?.('data');
            setTimeout(() => document.getElementById('offer-value')?.focus(), 50);
            return EventBus.emit('req-show-toast', { message: '⚠️ حقل مطلوب: قيمة الخصم يجب أن تكون أكبر من صفر', type: 'error' });
        }
        
        if ((type === 'real' || type === 'fake') && value > 95) {
            AdminUI?.MarketingUI?.switchBuilderTab?.('data');
            setTimeout(() => document.getElementById('offer-value')?.focus(), 50);
            return EventBus.emit('req-show-toast', { message: 'إجراء أمني: أقصى نسبة خصم مسموحة هي 95%', type: 'error' });
        }
        
        const selectedTiers = AdminUI?.MarketingUI?.getSelectedTiers?.() || [];
        const selectedProds = AdminUI?.MarketingUI?.getSelectedProds?.() || [];
        
        if (selectedTiers.length === 0) {
            AdminUI?.MarketingUI?.switchBuilderTab?.('data');
            return EventBus.emit('req-show-toast', { message: '⚠️ يجب تحديد مستوى واحد على الأقل في التبويب الأول', type: 'error' });
        }
        if (selectedProds.length === 0) {
            AdminUI?.MarketingUI?.switchBuilderTab?.('data');
            return EventBus.emit('req-show-toast', { message: '⚠️ يجب تحديد منتج واحد على الأقل في التبويب الأول', type: 'error' });
        }
        
        const liveBadgeInput = document.getElementById('grid-badge-text');
        if (liveBadgeInput && AdminUI?.MarketingUI?.visualConfig?.grid) {
            AdminUI.MarketingUI.visualConfig.grid.badgeText = liveBadgeInput.value.trim();
        }

        const currentVisualConfig = AdminUI?.MarketingUI?.visualConfig ? JSON.parse(JSON.stringify(AdminUI.MarketingUI.visualConfig)) : { storyEnabled: false };
        if (currentVisualConfig.storyEnabled) {
            const selectedStoryProds = (AdminUI?.MarketingUI?.getSelectedStoryProds?.() || [])
                .filter(id => selectedProds.includes(String(id)));
            if (selectedStoryProds.length === 0) {
                AdminUI?.MarketingUI?.switchBuilderTab?.('story');
                return EventBus.emit('req-show-toast', { message: '⚠️ يرجى اختيار منتج واحد على الأقل من شجرة القصص (الستوري)', type: 'error' });
            }
            currentVisualConfig.storyProducts = selectedStoryProds;
        } else {
            currentVisualConfig.storyProducts = [];
        }
        
        const offerData = {
            id: isEdit ? editId : 'off_' + Date.now(),
            name, type, value, isActive, expiryDate,
            targetTiers: selectedTiers, targetProds: selectedProds,
            visualConfig: currentVisualConfig,
            requiresAdminAttention: false,
            syncNote: null
        };

        if (isActive) {
            const safetyCheck = this._validatePromoSafetyLocal(offerData, false);
            if (!safetyCheck.isSafe) {
                return EventBus.emit('req-show-toast', { message: `⛔ مرفوض لحماية رأس المال: ${safetyCheck.reason}`, type: 'error' });
            }
        }

        const passedCollision = await this._checkOfferCollisions(offerData);
        if (!passedCollision) return;
        
        const passedShapeSync = await this._checkStoryShapeSync(offerData);
        if (!passedShapeSync) return;
        
        this._actionLocks.add('save-offer');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الحفظ سحابياً...');
        
        try {
            if (!AdminData.data.offers) AdminData.data.offers = [];
            const oIdx = isEdit ? AdminData.data.offers.findIndex(o => String(o.id) === editId) : -1;
            
            if (isEdit && oIdx !== -1) AdminData.data.offers[oIdx] = offerData;
            else AdminData.data.offers.push(offerData);
            
            if (!AdminData.data.offersMap) AdminData.data.offersMap = {};
            AdminData.data.offersMap[offerData.id] = offerData;
            
            await AdminData?.saveOffers?.();
            
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-offers',
                modalId: 'offer',
                logAction: isEdit ? 'EDIT_OFFER' : 'ADD_OFFER',
                logDetails: `حملة تخفيض: ${name}`,
                toastMsg: isEdit ? 'تم التعديل بنجاح' : 'تمت الإضافة بنجاح'
            });
        } catch (error) {
            EventBus.emit('req-show-toast', { message: error.message || 'خطأ أثناء الحفظ', type: 'warning' });
        } finally {
            this._actionLocks.delete('save-offer');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    deleteOffer: async function(id) {
        if (!AdminData.data.offers || this._actionLocks.has('del-offer')) return;
        if (AdminUI?.showConfirm && !await AdminUI.showConfirm('هل أنت متأكد من حذف العرض نهائياً؟')) return;
        
        this._actionLocks.add('del-offer');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الحذف سحابياً...');
        
        const offer = AdminData.data.offersMap?.[id] || AdminData.data.offers.find(o => String(o.id) === String(id));
        const offersBackup = [...AdminData.data.offers]; 
        
        try {
            AdminData.data.offers = AdminData.data.offers.filter(o => String(o.id) !== String(id));
            if(AdminData.data.offersMap) delete AdminData.data.offersMap[id]; 

            await AdminData?.saveOffers?.();
            
            EventBus.emit('req-render-offers'); 
            if (offer) AdminData?.addLog?.('DELETE_OFFER', `حذف حملة: ${offer.name}`);
            EventBus.emit('req-show-toast', {message:'تم الحذف بنجاح', type:'success'});
        } catch(e) { 
            AdminData.data.offers = offersBackup; 
            if(offer && AdminData.data.offersMap) AdminData.data.offersMap[id] = offer;
            EventBus.emit('req-render-offers'); 
            EventBus.emit('req-show-toast', {message:'فشل الحذف، حدث خطأ سحابي', type:'error'});
        } finally {
            this._actionLocks.delete('del-offer');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    toggleOfferStatus: async function(id, isActive) {
        if (this._actionLocks.has(`tog-off-${id}`)) return;
        this._actionLocks.add(`tog-off-${id}`);

        const offer = AdminData.data.offersMap?.[id] || AdminData.data.offers.find(o => String(o.id) === String(id));
        if (offer) {
            if (isActive) {
                const safetyCheck = this._validatePromoSafetyLocal({ ...offer, isActive: true }, false);
                if (!safetyCheck.isSafe) {
                    EventBus.emit('req-render-offers');
                    EventBus.emit('req-show-toast', { message: `⛔ ${safetyCheck.reason}`, type: 'error' });
                    this._actionLocks.delete(`tog-off-${id}`);
                    return;
                }
                offer.requiresAdminAttention = false;
                offer.syncNote = null;
            }
            offer.isActive = isActive; 
            EventBus.emit('req-render-offers');
            try {
                await AdminData?.saveOffers?.();
                EventBus.emit('req-show-toast', { message: isActive ? 'تم تفعيل العرض' : 'تم الإيقاف', type: 'success' });
            } catch(e) { 
                offer.isActive = !isActive; 
                EventBus.emit('req-render-offers'); 
            } finally {
                this._actionLocks.delete(`tog-off-${id}`);
            }
        } else {
            this._actionLocks.delete(`tog-off-${id}`);
        }
    },

    generateRandomCoupon: function() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let code = '';
        for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        AdminUI?.MarketingUI?.applyGeneratedCoupon?.(code);
    },

    saveCoupon: async function() {
        if (this._actionLocks.has('save-coupon')) return;

        const editId = AdminData.tempEditId ? String(AdminData.tempEditId) : null;
        const isEdit = !!editId;

        const code = Utils.getVal('coupon-code').trim().toUpperCase();
        if (!code) return EventBus.emit('req-show-toast', { message: 'أدخل كود الكوبون', type: 'error' });
        
        const type = Utils.getVal('coupon-type') || 'percentage';
        const value = Number(Utils.getVal('coupon-value')) || 0;
        if (value <= 0) return EventBus.emit('req-show-toast', { message: 'قيمة الخصم يجب أن تكون أعلى من صفر', type: 'error' });

        if (type === 'percentage' && value > 95) {
            return EventBus.emit('req-show-toast', { message: 'إجراء أمني: نسبة خصم الكوبون لا يمكن أن تتجاوز 95%', type: 'error' });
        }

        const selectedTiers = AdminUI?.MarketingUI?.getCouponSelectedTiers?.() || [];
        const selectedProds = AdminUI?.MarketingUI?.getCouponSelectedProds?.() || [];

        if (selectedTiers.length === 0 || selectedProds.length === 0) {
            return EventBus.emit('req-show-toast', { message: 'يجب تحديد مستوى ومنتج واحد على الأقل', type: 'error' });
        }

        const cIdx = isEdit ? AdminData.data.coupons.findIndex(c => String(c.id) === editId) : -1;
        
        const isCodeDuplicate = (AdminData.data.coupons || []).some(c => 
            String(c.code).toUpperCase() === code && (!isEdit || String(c.id) !== editId)
        );

        if (isCodeDuplicate) {
            return EventBus.emit('req-show-toast', { message: 'هذا الكود مستخدم مسبقاً في متجرنا', type: 'error' });
        }

        const expiryVal = Utils.getVal('coupon-expiry');
        const allowedUsersStr = Utils.getVal('coupon-allowed-users');
        const rawUsers = allowedUsersStr ? allowedUsersStr.split(',').map(s => String(s).trim()).filter(s => s.length > 0) : [];
        
        const allowedUsers = rawUsers.map(identifier => {
            const upperId = identifier.toUpperCase();
            const u = (AdminData.data.users || []).find(user => 
                user.id === identifier || 
                (user.displayId && user.displayId.toUpperCase() === upperId) ||
                (user.displayId && `USR-${user.displayId.toUpperCase()}` === upperId) ||
                (user.email && user.email.toUpperCase() === upperId)
            );
            return u ? u.id : identifier;
        });
            
        const maxDiscount = Number(Utils.getVal('coupon-max-discount')) || 0;

        const couponData = {
            id: isEdit ? editId : 'coup_' + Date.now(), 
            code, type, value, maxDiscount, 
            minOrder: Number(Utils.getVal('coupon-min-order')) || 0,
            maxUses: Number(Utils.getVal('coupon-max-uses')) || 0,
            maxPerUser: Number(Utils.getVal('coupon-max-per-user')) || 0,
            isActive: Utils.getCheck('coupon-active'),
            expiryDate: expiryVal ? Number(expiryVal) : null,
            allowedUsers, targetTiers: selectedTiers, targetProds: selectedProds,
            usageHistory: (isEdit && cIdx > -1 && AdminData.data.coupons[cIdx].usageHistory) ? AdminData.data.coupons[cIdx].usageHistory : {},
            usedCount: (isEdit && cIdx > -1) ? (AdminData.data.coupons[cIdx].usedCount || 0) : 0,
            requiresAdminAttention: false,
            syncNote: null
        };

        if (couponData.isActive) {
            const safetyCheck = this._validatePromoSafetyLocal(couponData, true);
            if (!safetyCheck.isSafe) {
                return EventBus.emit('req-show-toast', { message: `⛔ مرفوض لحماية رأس المال: ${safetyCheck.reason}`, type: 'error' });
            }
        }

        this._actionLocks.add('save-coupon');

        try {
            if (isEdit && cIdx !== -1) AdminData.data.coupons[cIdx] = couponData;
            else AdminData.data.coupons.push(couponData);

            if (!AdminData.data.couponsMap) AdminData.data.couponsMap = {};
            AdminData.data.couponsMap[couponData.id] = couponData;

            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الحفظ...');
            
            await AdminData?.saveCoupons?.();
            
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-coupons',
                modalId: 'coupon',
                logAction: isEdit ? 'EDIT_COUPON' : 'ADD_COUPON',
                logDetails: `كوبون: ${code}`,
                toastMsg: 'تم حفظ الكوبون بنجاح'
            });
        } finally { 
            this._actionLocks.delete('save-coupon');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
        }
    },
    
    deleteCoupon: async function(id) {
        if (!AdminData.data.coupons || this._actionLocks.has('del-coup')) return;
        if (AdminUI?.showConfirm && !await AdminUI.showConfirm('هل أنت متأكد من الحذف؟')) return;
        
        this._actionLocks.add('del-coup');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الحذف سحابياً...');
        
        const coupon = AdminData.data.couponsMap?.[id] || AdminData.data.coupons.find(c => String(c.id) === String(id));
        const couponsBackup = [...AdminData.data.coupons]; 
        
        try {
            AdminData.data.coupons = AdminData.data.coupons.filter(c => String(c.id) !== String(id));
            if(AdminData.data.couponsMap) delete AdminData.data.couponsMap[id];

            await AdminData?.saveCoupons?.();
            
            EventBus.emit('req-render-coupons'); 
            if (coupon) AdminData?.addLog?.('DELETE_COUPON', `حذف الكوبون: ${coupon.code}`);
            EventBus.emit('req-show-toast', { message: 'تم الحذف', type: 'success' });
        } catch(e) { 
            AdminData.data.coupons = couponsBackup; 
            if(coupon && AdminData.data.couponsMap) AdminData.data.couponsMap[id] = coupon;
            EventBus.emit('req-render-coupons'); 
        } finally {
            this._actionLocks.delete('del-coup');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    toggleCouponStatus: async function(id, isActive) {
        if (this._actionLocks.has(`tog-coup-${id}`)) return;
        this._actionLocks.add(`tog-coup-${id}`);

        const coupon = AdminData.data.couponsMap?.[id] || AdminData.data.coupons.find(c => String(c.id) === String(id));
        if (coupon) {
            if (isActive) {
                const safetyCheck = this._validatePromoSafetyLocal({ ...coupon, isActive: true }, true);
                if (!safetyCheck.isSafe) {
                    EventBus.emit('req-render-coupons');
                    EventBus.emit('req-show-toast', { message: `⛔ ${safetyCheck.reason}`, type: 'error' });
                    this._actionLocks.delete(`tog-coup-${id}`);
                    return;
                }
                coupon.requiresAdminAttention = false;
                coupon.syncNote = null;
            }
            coupon.isActive = isActive; 
            EventBus.emit('req-render-coupons');
            try { 
                await AdminData?.saveCoupons?.(); 
                EventBus.emit('req-show-toast', { message: isActive ? 'تم تفعيل الكوبون' : 'تم الإيقاف', type: 'success' });
            } 
            catch(e) { coupon.isActive = !isActive; EventBus.emit('req-render-coupons'); }
            finally { this._actionLocks.delete(`tog-coup-${id}`); }
        } else {
            this._actionLocks.delete(`tog-coup-${id}`);
        }
    },

    sendUnifiedAlert: async function() {
        if (this._actionLocks.has('send-alert')) return;

        const title = Utils.getVal('alert-title').trim();
        const body = Utils.getVal('alert-body').trim();
        if (!title) {
            document.getElementById('alert-title')?.focus();
            return EventBus.emit('req-show-toast', { message: '⚠️ حقل مطلوب: يرجى إدخال عنوان الرسالة أولاً', type: 'warning' });
        }
        if (!body) {
            document.getElementById('alert-body')?.focus();
            return EventBus.emit('req-show-toast', { message: '⚠️ حقل مطلوب: يرجى كتابة نص الرسالة', type: 'error' });
        }

        const targetType = Utils.getVal('alert-target-type', 'all');
        let targetId = null;
        let targetUser = null;

        this._actionLocks.add('send-alert');

        try {
            if (targetType === 'user') {
                const rawInputVal = Utils.getVal('alert-target-user').trim();
                const inputVal = rawInputVal.replace(/^(#|USR-)\s*/i, '').trim();
                if (!inputVal) {
                    document.getElementById('alert-target-user')?.focus();
                    EventBus.emit('req-show-toast', { message: '⚠️ حقل مطلوب: يرجى إدخال رقم العميل (ID) المستهدف', type: 'warning' });
                    return;
                }
                
                targetUser = AdminData.data.usersMap?.[rawInputVal] || AdminData.data.usersMap?.[inputVal] || (AdminData.data.users || []).find(u => String(u.id) === String(rawInputVal) || String(u.id) === String(inputVal) || String(u.displayId).toUpperCase() === inputVal.toUpperCase());
                
                if (!targetUser) {
                    if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري البحث عن العميل سحابياً...');
                    try {
                        const res = await FirebaseAdapter.callFunction('adminGetUsersList', { searchQuery: inputVal, limit: 1 });
                        if (res && res.success && res.data && res.data.length > 0) {
                            targetUser = res.data[0];
                        }
                    } catch (e) { console.warn(e); }
                }
                
                if (!targetUser) {
                    document.getElementById('alert-target-user')?.focus();
                    EventBus.emit('req-show-toast', { message: 'العميل غير موجود في متجرنا، تأكد من صحة المعرف (ID)', type: 'error' });
                    return;
                }
                targetId = targetUser.id;                
            } else if (targetType === 'tier') {
                targetId = Utils.getVal('alert-target-tier');
                if (!targetId) {
                    EventBus.emit('req-show-toast', { message: 'يرجى اختيار المستوى المستهدف', type: 'error' });
                    return;
                }
            }
            
            const type = Utils.getVal('alert-type', 'notification');
            const isPopup = (type === 'popup');
            const expiryInput = Utils.getVal('alert-expiry');

            const rawActionLink = isPopup ? Utils.getVal('alert-action-link').trim() : '';
            const safeActionLink = (rawActionLink && /^https?:\/\//i.test(rawActionLink)) ? rawActionLink : '';

            const newAlert = {
                id: 'ALT_' + Date.now(), type: type, isPopup: isPopup, targetType: targetType, targetId: targetId,
                title: title, message: body, 
                time: Date.now(),
                createdAt: Date.now(), 
                expiresAt: expiryInput ? parseInt(expiryInput) : null,
                maxViews: isPopup ? parseInt(Utils.getVal('alert-max-views', '3')) : null,
                actionLink: safeActionLink,
                couponCode: isPopup ? Utils.getVal('alert-coupon-code').trim().toUpperCase() : ''
            };

            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الإرسال...');
            if (targetType === 'user') {
                await Promise.all([
                    FirebaseAdapter.set(`telecard_users/${targetId}/notifications`, newAlert.id, {
                        ...newAlert,
                        targetType: 'notification',
                        targetId: newAlert.id,
                        createdAt: serverTimestamp()
                    }),
                    FirebaseAdapter.set('telecard_alerts', newAlert.id, newAlert)
                ]);          
                if (!AdminData.data.alerts) AdminData.data.alerts = [];
                AdminData.data.alerts.push(newAlert);
                
                if (AdminData?.addLog) AdminData.addLog('SEND_DIRECT_ALERT', `إرسال تنبيه خاص للعميل: ${targetUser.fullName || targetUser.name || targetId}`);
            } else {
                await FirebaseAdapter.set('telecard_alerts', newAlert.id, newAlert);
                if (!AdminData.data.alerts) AdminData.data.alerts = [];
                AdminData.data.alerts.push(newAlert);
                if (AdminData?.addLog) AdminData.addLog('SEND_GLOBAL_ALERT', `إرسال إشعار للجميع`);
            }
            
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-alerts',
                modalId: 'alert', 
                logAction: null, logDetails: null, toastMsg: 'تم الإرسال بنجاح!'
            });
        } catch(e) {
            EventBus.emit('req-show-toast', { message: 'تعذر الإرسال السحابي', type: 'error' });
        } finally { 
            this._actionLocks.delete('send-alert');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
        }
    },

    deleteAlert: async function(id) {
        if (!AdminData.data.alerts || this._actionLocks.has('del-alert')) return;
        if (AdminUI?.showConfirm && !await AdminUI.showConfirm('هل أنت متأكد من مسح الإشعار؟')) return;

        this._actionLocks.add('del-alert');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري مسح الإشعار...');
        
        const alertObj = AdminData.data.alerts.find(a => a.id === id);
        
        try {
            if (alertObj && alertObj.targetType === 'user' && alertObj.targetId) {
                await Promise.all([
                    FirebaseAdapter.delete(`telecard_users/${alertObj.targetId}/notifications`, id),
                    FirebaseAdapter.delete('telecard_alerts', id)
                ]);
                if (AdminData?.addLog) AdminData.addLog('DELETE_ALERT', `تم مسح إشعار مخصص للعميل`);
            } else {
                await FirebaseAdapter.delete('telecard_alerts', id);
                if (AdminData?.addLog) AdminData.addLog('DELETE_ALERT', `تم مسح إشعار عام من السيرفر`);
            }
            
            AdminData.data.alerts = AdminData.data.alerts.filter(a => a.id !== id);
            EventBus.emit('req-render-alerts');
            EventBus.emit('req-show-toast', { message: 'تم الحذف بنجاح', type: 'success' });
            
        } catch(e) { 
            EventBus.emit('req-show-toast', { message: 'فشل الحذف. تأكد من الاتصال', type: 'error' });
        } finally {
            this._actionLocks.delete('del-alert');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    saveBanner: async function() {
        if (this._actionLocks.has('save-banner')) return;

        const fileInput = document.getElementById('ban-img-input');
        const rawFile = fileInput?.files?.[0];
        const readyBase64 = (AdminUI?.tempImg && AdminUI.tempImg.startsWith('data:image'))
            ? AdminUI.tempImg
            : null;
        if (!readyBase64 && !rawFile) {
            return EventBus.emit('req-show-toast', { message: 'اختر صورة للبنر', type: 'warning' });
        }

        this._actionLocks.add('save-banner');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري رفع البانر الإعلاني للسحابة...'); 
        
        try {
            let fileForUpload = rawFile;
            if (readyBase64 && typeof AdminUI?.base64ToBlob === 'function') {
                const mimeMatch = readyBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
                const mimeType = mimeMatch ? mimeMatch[1] : (rawFile?.type || 'image/jpeg');
                const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
                const blob = AdminUI.base64ToBlob(readyBase64, mimeType);
                if (blob) {
                    fileForUpload = new File([blob], rawFile?.name || `banner_${Date.now()}.${ext}`, { type: mimeType });
                }
            }

            const finalImgUrl = await FirebaseAdapter.uploadImage(fileForUpload, 'banners');
            
            const rawBanLink = Utils.getVal('ban-link').trim();
            const cleanBanLink = (rawBanLink && /^https?:\/\//i.test(rawBanLink)) ? rawBanLink : '';
            
            if(!AdminData.data.banners) AdminData.data.banners = [];
            AdminData.data.banners.push({ id: String(Date.now()), img: finalImgUrl, link: cleanBanLink });
            await AdminData?.saveBanners?.();
            
            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-banners',
                modalId: 'banner', 
                logAction: 'ADD_BANNER',
                logDetails: 'إضافة بانر جديد في المتجر',
                toastMsg: 'تم إضافة بانر بنجاح'
            });
        } catch (error) { 
            EventBus.emit('req-show-toast', {message: 'خطأ أثناء الرفع', type: 'error'}); 
        } finally { 
            this._actionLocks.delete('save-banner');
            if (fileInput) fileInput.value = '';
            if (AdminUI) {
                AdminUI.tempImg = null;
                AdminUI.tempFile = null;
            }
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
        }
    },
    
    deleteBanner: async function(id) {
        if (this._actionLocks.has('del-banner')) return;

        if (AdminUI?.showConfirm && !await AdminUI.showConfirm('حذف البانر الإعلاني؟')) return;

        this._actionLocks.add('del-banner');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الحذف...');
        
        try {
            const bnr = AdminData.data.banners.find(x => String(x.id) === String(id));
            if (bnr && bnr.img && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
                try { await FirebaseAdapter.deleteImageByUrl(bnr.img); } catch(e){ console.warn("تعذر تنظيف صورة البنر"); }
            }
            AdminData.data.banners = AdminData.data.banners.filter(x => String(x.id) !== String(id));
            await AdminData.saveBanners();
            
            EventBus.emit('req-render-banners');
            EventBus.emit('req-show-toast', {message: 'تم الحذف', type: 'success'});
        } finally {
            this._actionLocks.delete('del-banner');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    saveStoreIdentity: async function() {
        if (this._actionLocks.has('save-brand')) return;

        if (!AdminData?.data?.settings) AdminData.data.settings = {};
        
        const settingsBackup = JSON.parse(JSON.stringify(AdminData.data.settings)); 
        const sys = AdminData.data.settings; 
        
        sys.storeName = Utils.getVal('store-name-input').trim();
        sys.storeLogoSize = Number(Utils.getVal('store-logo-size', 36)) || 36;
        sys.storeNameWeight = Utils.getVal('store-name-weight', '900');
        sys.storeColorType = Utils.getVal('store-color-type', 'solid');
        sys.storeColor1 = Utils.getVal('store-color-1', '#ffffff');
        sys.storeColor2 = Utils.getVal('store-color-2', '#FFD700');
        sys.storeNameShadow = Utils.getCheck('store-name-shadow');
        
        const processBrandImage = async (baseId, currentUrl) => {
            const inputEl = document.getElementById(`${baseId}-input`) || document.getElementById(baseId);
            const wrapEl = document.getElementById(`${baseId}-wrap`);
            const previewEl = document.getElementById(`${baseId}-preview`);
            
            if (wrapEl && !wrapEl.classList.contains('has-img')) {
                if (currentUrl) await FirebaseAdapter.deleteImageByUrl(currentUrl).catch(() => {});
                return '';
            }
            
            const rawFile = inputEl?.files?.[0];
            const readyBase64 = (previewEl?.src && previewEl.src.startsWith('data:image'))
                ? previewEl.src
                : null;

            if (readyBase64 || rawFile) {
                if (currentUrl) await FirebaseAdapter.deleteImageByUrl(currentUrl).catch(() => {});
                let fileForUpload = rawFile;
                if (readyBase64 && typeof AdminUI?.base64ToBlob === 'function') {
                    const mimeMatch = readyBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
                    const mimeType = mimeMatch ? mimeMatch[1] : (rawFile?.type || 'image/png');
                    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
                    const blob = AdminUI.base64ToBlob(readyBase64, mimeType);
                    if (blob) {
                        fileForUpload = new File([blob], rawFile?.name || `${baseId}_${Date.now()}.${ext}`, { type: mimeType });
                    }
                }
                
                const uploadedUrl = await FirebaseAdapter.uploadImage(fileForUpload, 'brand');
                if (inputEl) inputEl.value = '';
                return uploadedUrl;
            }
            
            return currentUrl || '';
        };

        this._actionLocks.add('save-brand');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري رفع وتحديث هوية المتجر السحابية...');
        
        try {
            const [newLogo, newLogoLight, newFavicon] = await Promise.all([
                processBrandImage('store-logo', sys.storeLogo),
                processBrandImage('store-logo-light', sys.storeLogoLight),
                processBrandImage('store-favicon', sys.storeFavicon)
            ]);

            sys.storeLogo = newLogo;
            sys.storeLogoLight = newLogoLight;
            sys.storeFavicon = newFavicon;

            if (AdminData?.saveSystemSettings) await AdminData.saveSystemSettings();
            EventBus.emit('req-show-toast', { message: 'تم حفظ هوية المتجر بنجاح وتحديث السحاب', type: 'success' });
        } catch (error) { 
            AdminData.data.settings = settingsBackup; 
            EventBus.emit('req-update-preview'); 
            EventBus.emit('req-show-toast', {message: 'خطأ أثناء الرفع، تم التراجع عن التغييرات', type: 'error'}); 
        } finally { 
            this._actionLocks.delete('save-brand');
            if (AdminUI) {
                AdminUI.tempImg = null;
                AdminUI.tempFile = null;
            }
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
        }
    },

    autoSaveSettings: async function() {
        if (this._actionLocks.has('auto-save-settings')) return;
        this._actionLocks.add('auto-save-settings');
        
        try {
            if (!AdminData?.data?.settings) AdminData.data.settings = {};
            const s = AdminData.data.settings;
            
            const isAdsViewActive = document.getElementById('view-ads')?.classList.contains('active');
            if (isAdsViewActive) {
                const cleanTicker = Utils.getVal('promo-text', '').trim();
                const cleanSliderTime = Number(Utils.getVal('slider-time', 3)) || 3;
                const cleanTransition = Utils.getVal('slider-transition', 'fade');
                const cleanSpeed = Utils.getVal('promo-speed', 'horizontal-normal');
                
                s.tickerText = cleanTicker;
                s.promoText = cleanTicker;
                s.sliderTime = cleanSliderTime;
                s.sliderDuration = cleanSliderTime;
                s.sliderTransition = cleanTransition;
                s.tickerSpeed = cleanSpeed;
                s.promoAnim = cleanSpeed;
            }
            
            if (document.getElementById('view-rates')?.classList.contains('active')) {
                s.currencyDisplay = Utils.getVal('setting-curr-display', s.currencyDisplay || 'symbol');
                const syncToggle = document.getElementById('setting-sync-currency-store');
                if (syncToggle) {
                    s.syncCurrencyToStore = syncToggle.checked;
                    s.syncCurrencyStore = syncToggle.checked;
                    s.syncCurrencyDisplay = syncToggle.checked;
                }
                const currToggle = document.getElementById('setting-show-currency');
                if (currToggle) s.showCurrencyToggle = currToggle.checked;
            }
            
            if (document.getElementById('view-tiers')?.classList.contains('active')) {
                const tierMsg = document.getElementById('setting-tier-paused-msg');
                if (tierMsg) s.tierPausedMsg = tierMsg.value.trim();
            }
            
            if (AdminData?.saveSystemSettings) await AdminData.saveSystemSettings();
            
            EventBus.emit('req-update-preview');
            EventBus.emit('req-show-toast', { message: 'تم حفظ الإعدادات', type: 'success' });
        } catch (error) {
            EventBus.emit('req-show-toast', { message: 'فشل حفظ الإعدادات', type: 'error' });
        } finally {
            this._actionLocks.delete('auto-save-settings');
        }
    }
};