// ============================================================================
// 🧠 متحكم التسويق (modules/marketing/marketingController.js) - Cloud-Native V18.10 🛡️
// 🚀 التحديثات المعمارية (V18.10 - The Ultimate Routing Patch): 
// 1. Target Routing Fix 🔀: تصحيح مسار حذف الإشعارات ليشمل إشعارات العملاء المخصصة (Targeted Alerts).
// 2. DOM Shield 🛡️: حماية الاستهداف القديم من المسح العشوائي إذا لم يكتمل رسم واجهة الشجرة.
// 3. UID Coercion Fix 🐛: منع تحويل معرفات العملاء النصية في الكوبونات لضمان نجاح التخصيص.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';
import { UIService } from '../../core/uiService.js';

export const MarketingController = {

    _actionLocks: new Set(), 

    openOfferModal: function(id = null) {
        let strId = id ? String(id) : null;
        EventBus.emit('req-update-state', { tempEditId: strId });
        
        const offer = strId ? (AdminData.data.offersMap?.[strId] || (AdminData.data.offers || []).find(o => String(o.id) === strId)) : null;
        AdminUI?.MarketingUI?.setupOfferModal?.(offer);
        
        if (AdminRender?.populateSmartTreeTargets) {
            AdminRender.populateSmartTreeTargets('offer-target', offer ? (offer.targetTiers || []) : [], offer ? (offer.targetProds || []) : []);
        }
        EventBus.emit('req-open-modal', 'offer');
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
            if (p && p.catId) targetCatIds.add(String(p.catId));
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
                    return p && p.catId && targetCatIds.has(String(p.catId));
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

        const name = Utils.escapeHTML(Utils.getVal('offer-name'));
        const type = Utils.getVal('offer-type') || 'real';
        const value = Number(Utils.getVal('offer-value')) || 0;
        const isActive = Utils.getCheck('offer-active');
        const expiryVal = Utils.getVal('offer-expiry');
        const expiryDate = expiryVal ? Number(expiryVal) : null;

        if (!name) return EventBus.emit('req-show-toast', { message: 'يرجى إدخال اسم الحملة', type: 'error' });
        if (value <= 0 && type !== 'badge_only') return EventBus.emit('req-show-toast', { message: 'قيمة الخصم يجب أن تكون أكبر من صفر', type: 'error' });

        // 🚀 [درع الـ DOM]: جلب البيانات من الذاكرة إذا كان التحديد فارغاً (لتجنب مسح الاستهداف القديم)
        const isEdit = !!AdminData.tempEditId;
        const oldOffer = isEdit ? AdminData.data.offersMap?.[AdminData.tempEditId] : null;

        let selectedTiers = AdminUI?.MarketingUI?.getSelectedTiers?.() || [];
        let selectedProds = AdminUI?.MarketingUI?.getSelectedProds?.() || [];

        if (isEdit && selectedTiers.length === 0 && selectedProds.length === 0 && oldOffer) {
            selectedTiers = oldOffer.targetTiers || [];
            selectedProds = oldOffer.targetProds || [];
        }

        if (selectedTiers.length === 0) return EventBus.emit('req-show-toast', { message: 'يجب تحديد مستوى واحد على الأقل', type: 'error' });
        if (selectedProds.length === 0) return EventBus.emit('req-show-toast', { message: 'يجب تحديد منتج واحد على الأقل', type: 'error' });

        this._actionLocks.add('save-offer');

        try {
            const currentVisualConfig = AdminUI?.MarketingUI?.visualConfig ? JSON.parse(JSON.stringify(AdminUI.MarketingUI.visualConfig)) : { storyEnabled: false };
            if (currentVisualConfig.storyEnabled) {
                let selectedStoryProds = AdminUI?.MarketingUI?.getSelectedStoryProds?.() || [];
                if (isEdit && selectedStoryProds.length === 0 && oldOffer?.visualConfig?.storyProducts) {
                    selectedStoryProds = oldOffer.visualConfig.storyProducts;
                }
                if (selectedStoryProds.length === 0) throw new Error('يرجى اختيار منتج واحد على الأقل من شجرة القصص');
                currentVisualConfig.storyProducts = selectedStoryProds;
            } else { currentVisualConfig.storyProducts = []; }

            if (!AdminData.data.offers) AdminData.data.offers = [];
            const oIdx = isEdit ? AdminData.data.offers.findIndex(o => String(o.id) === String(AdminData.tempEditId)) : -1;
            
            const offerData = { id: isEdit ? AdminData.tempEditId : 'off_' + Date.now(), name, type, value, isActive, expiryDate, targetTiers: selectedTiers, targetProds: selectedProds, visualConfig: currentVisualConfig };

            const passedCollision = await this._checkOfferCollisions(offerData);
            if (!passedCollision) return;

            const passedShapeSync = await this._checkStoryShapeSync(offerData);
            if (!passedShapeSync) return;

            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الحفظ سحابياً...');

            if (isEdit && oIdx !== -1) AdminData.data.offers[oIdx] = offerData;
            else AdminData.data.offers.push(offerData);

            if (!AdminData.data.offersMap) AdminData.data.offersMap = {};
            AdminData.data.offersMap[offerData.id] = offerData;

            await AdminData?.saveOffers?.();
            
            if (typeof FirebaseAdapter !== 'undefined' && typeof FirebaseAdapter.callFunction === 'function') {
                FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
            }

            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-offers',
                modalId: 'offer',
                logAction: isEdit ? 'EDIT_OFFER' : 'ADD_OFFER',
                logDetails: `حملة تخفيض: ${name}`,
                toastMsg: isEdit ? 'تم التعديل ومزامنة الأسعار بنجاح' : 'تمت الإضافة ومزامنة الأسعار بنجاح'
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
            
            if (typeof FirebaseAdapter !== 'undefined' && typeof FirebaseAdapter.callFunction === 'function') {
                FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
            }

            EventBus.emit('req-render-offers'); 
            if (offer) AdminData?.addLog?.('DELETE_OFFER', `حذف حملة: ${offer.name}`);
            EventBus.emit('req-show-toast', {message:'تم الحذف وتحديث المتجر بنجاح', type:'success'});
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
            offer.isActive = isActive; 
            EventBus.emit('req-render-offers');
            try {
                await AdminData?.saveOffers?.();
                if (typeof FirebaseAdapter !== 'undefined' && typeof FirebaseAdapter.callFunction === 'function') {
                    FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
                }
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

    openCouponModal: function(id = null) {
        EventBus.emit('req-update-state', { tempEditId: id });
        const isEdit = !!id;
        
        const coupon = isEdit ? (AdminData.data.couponsMap?.[id] || AdminData.data.coupons.find(c => String(c.id) === String(id))) : null;
        AdminUI?.MarketingUI?.setupCouponModal?.(coupon, isEdit);
        AdminRender?.populateSmartTreeTargets?.('coupon-target', coupon ? (coupon.targetTiers||[]) : [], coupon ? (coupon.targetProds||[]) : []);
        EventBus.emit('req-open-modal', 'coupon');
    },

    generateRandomCoupon: function() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let code = '';
        for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        AdminUI?.MarketingUI?.applyGeneratedCoupon?.(code);
    },

    saveCoupon: async function() {
        if (this._actionLocks.has('save-coupon')) return;

        const code = Utils.escapeHTML(Utils.getVal('coupon-code')).toUpperCase();
        if (!code) return EventBus.emit('req-show-toast', { message: 'أدخل كود الكوبون', type: 'error' });
        
        const type = Utils.getVal('coupon-type') || 'percentage';
        const value = Number(Utils.getVal('coupon-value')) || 0;
        if (value <= 0) return EventBus.emit('req-show-toast', { message: 'قيمة الخصم يجب أن تكون أعلى من صفر', type: 'error' });

        const isEdit = !!AdminData.tempEditId;
        const oldCoupon = isEdit ? AdminData.data.couponsMap?.[AdminData.tempEditId] : null;

        let selectedTiers = AdminUI?.MarketingUI?.getCouponSelectedTiers?.() || [];
        let selectedProds = AdminUI?.MarketingUI?.getCouponSelectedProds?.() || [];

        // 🚀 [درع الـ DOM]: حماية الاستهداف للكوبونات أيضاً
        if (isEdit && selectedTiers.length === 0 && selectedProds.length === 0 && oldCoupon) {
            selectedTiers = oldCoupon.targetTiers || [];
            selectedProds = oldCoupon.targetProds || [];
        }

        if (selectedTiers.length === 0 || selectedProds.length === 0) {
            return EventBus.emit('req-show-toast', { message: 'يجب تحديد مستوى ومنتج واحد على الأقل', type: 'error' });
        }

        const cIdx = isEdit ? AdminData.data.coupons.findIndex(c => String(c.id) === String(AdminData.tempEditId)) : -1;
        
        const isCodeDuplicate = (AdminData.data.coupons || []).some(c => 
            String(c.code).toUpperCase() === code && (!isEdit || String(c.id) !== String(AdminData.tempEditId))
        );

        if (isCodeDuplicate) {
            return EventBus.emit('req-show-toast', { message: 'هذا الكود مستخدم مسبقاً في متجرنا', type: 'error' });
        }

        this._actionLocks.add('save-coupon');

        try {
            const expiryVal = Utils.getVal('coupon-expiry');
            const allowedUsersStr = Utils.getVal('coupon-allowed-users');
            
            const allowedUsers = allowedUsersStr 
                ? allowedUsersStr.split(',').map(s => String(s).trim()).filter(s => s.length > 0) 
                : [];
                
            const maxDiscount = Number(Utils.getVal('coupon-max-discount')) || 0;

            const couponData = {
                id: isEdit ? AdminData.tempEditId : 'coup_' + Date.now(), 
                code, type, value, maxDiscount, 
                minOrder: Number(Utils.getVal('coupon-min-order')) || 0,
                maxUses: Number(Utils.getVal('coupon-max-uses')) || 0,
                maxPerUser: Number(Utils.getVal('coupon-max-per-user')) || 0,
                isActive: Utils.getCheck('coupon-active'),
                expiryDate: expiryVal ? Number(expiryVal) : null,
                allowedUsers, targetTiers: selectedTiers, targetProds: selectedProds,
                usageHistory: (isEdit && cIdx > -1 && AdminData.data.coupons[cIdx].usageHistory) ? AdminData.data.coupons[cIdx].usageHistory : {},
                usedCount: (isEdit && cIdx > -1) ? (AdminData.data.coupons[cIdx].usedCount || 0) : 0
            };

            if (isEdit && cIdx !== -1) AdminData.data.coupons[cIdx] = couponData;
            else AdminData.data.coupons.push(couponData);

            if (!AdminData.data.couponsMap) AdminData.data.couponsMap = {};
            AdminData.data.couponsMap[couponData.id] = couponData;

            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الحفظ...');
            
            await AdminData?.saveCoupons?.();
            
            if (typeof FirebaseAdapter !== 'undefined' && typeof FirebaseAdapter.callFunction === 'function') {
                FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
            }

            EventBus.emit('req-finish-action', {
                renderEvent: 'req-render-coupons',
                modalId: 'coupon',
                logAction: isEdit ? 'EDIT_COUPON' : 'ADD_COUPON',
                logDetails: `كوبون: ${code}`,
                toastMsg: 'تم حفظ الكوبون وتحديث المتجر بنجاح'
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
            
            if (typeof FirebaseAdapter !== 'undefined' && typeof FirebaseAdapter.callFunction === 'function') {
                FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
            }

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
            coupon.isActive = isActive; 
            EventBus.emit('req-render-coupons');
            try { 
                await AdminData?.saveCoupons?.(); 
                if (typeof FirebaseAdapter !== 'undefined' && typeof FirebaseAdapter.callFunction === 'function') {
                    FirebaseAdapter.callFunction('adminForceSyncPricing', {}).catch(() => {});
                }
            } 
            catch(e) { coupon.isActive = !isActive; EventBus.emit('req-render-coupons'); }
            finally { this._actionLocks.delete(`tog-coup-${id}`); }
        } else {
            this._actionLocks.delete(`tog-coup-${id}`);
        }
    },

    openAlertModal: function() {
        AdminUI?.MarketingUI?.setupAlertModal?.(AdminData.data.tiers || []);
        EventBus.emit('req-open-modal', 'alert');
    },

    sendUnifiedAlert: async function() {
        if (this._actionLocks.has('send-alert')) return;

        const title = Utils.escapeHTML(Utils.getVal('alert-title'));
        const body = Utils.escapeHTML(Utils.getVal('alert-body'));
        if (!body) return EventBus.emit('req-show-toast', { message: 'يرجى كتابة الرسالة', type: 'error' });

        const targetType = Utils.getVal('alert-target-type', 'all');
        let targetId = null;
        let targetUser = null; 
        
        this._actionLocks.add('send-alert');

        try {
            if (targetType === 'user') {
                const inputVal = Utils.escapeHTML(Utils.getVal('alert-target-user'));
                
                targetUser = AdminData.data.usersMap?.[inputVal] || (AdminData.data.users || []).find(u => String(u.id) === String(inputVal) || String(u.displayId) === String(inputVal));
                
                if (!targetUser) {
                    if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري البحث عن العميل سحابياً...');
                    try {
                        targetUser = await FirebaseAdapter.getById('telecard_users', inputVal); 
                        if (!targetUser) {
                            const result = await FirebaseAdapter.fetchMoreWithCursor('telecard_users', [['displayId', '==', inputVal]], 'createdAt', null, 1);
                            if (result && result.data && result.data.length > 0) targetUser = result.data[0];
                        }
                    } catch(e) { console.warn(e); }
                }

                if (!targetUser) {
                    EventBus.emit('req-show-toast', { message: 'العميل غير موجود في متجرنا', type: 'error' });
                    return; 
                }
                targetId = targetUser.id; 
            }
            
            const type = Utils.getVal('alert-type', 'notification');
            const isPopup = (type === 'popup');
            const expiryInput = Utils.getVal('alert-expiry');

            const newAlert = {
                id: 'ALT_' + Date.now(), type: type, isPopup: isPopup, targetType: targetType, targetId: targetId,
                title: title, message: body, createdAt: Date.now(),
                expiresAt: expiryInput ? parseInt(expiryInput) : null,
                maxViews: isPopup ? parseInt(Utils.getVal('alert-max-views', '3')) : null,
                actionLink: isPopup ? Utils.escapeHTML(Utils.getVal('alert-action-link')) : '',
                couponCode: isPopup ? Utils.escapeHTML(Utils.getVal('alert-coupon-code')) : ''
            };

            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الإرسال...');
            
            if (targetType === 'user') {
                await FirebaseAdapter.set(`telecard_users/${targetId}/notifications`, newAlert.id, newAlert);
                
                // 🚀 محاكاة للإضافة للذاكرة المحلية لكي تظهر فوراً في واجهة العميل عند المدير
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
        const alertBackup = [...AdminData.data.alerts];
        
        AdminData.data.alerts = AdminData.data.alerts.filter(a => a.id !== id);
        EventBus.emit('req-render-alerts');
        
        try {
            // 🚀 [التصحيح المعماري الأهم]: مسح الإشعار المخصص من ملف العميل أو العام
            if (alertObj && alertObj.targetType === 'user' && alertObj.targetId) {
                await FirebaseAdapter.delete(`telecard_users/${alertObj.targetId}/notifications`, id);
                if (AdminData?.addLog) AdminData.addLog('DELETE_ALERT', `تم مسح إشعار مخصص للعميل`);
            } else {
                await FirebaseAdapter.delete('telecard_alerts', id);
                if (AdminData?.addLog) AdminData.addLog('DELETE_ALERT', `تم مسح إشعار عام من السيرفر`);
            }
            
            EventBus.emit('req-show-toast', { message: 'تم الحذف بنجاح', type: 'success' });
        } catch(e) { 
            AdminData.data.alerts = alertBackup; 
            EventBus.emit('req-render-alerts'); 
            EventBus.emit('req-show-toast', { message: 'فشل الحذف. تأكد من الاتصال', type: 'error' });
        } finally {
            this._actionLocks.delete('del-alert');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    saveBanner: async function() {
        if (this._actionLocks.has('save-banner')) return;

        const fileInput = document.getElementById('ban-img-input');
        const fileToUpload = fileInput?.files?.[0];
        if (!fileToUpload) return EventBus.emit('req-show-toast', {message: 'اختر صورة للبنر', type: 'warning'});

        this._actionLocks.add('save-banner');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري ضغط ورفع البانر الإعلاني...'); 
        
        try {
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

            const finalImgUrl = await FirebaseAdapter.uploadImage(fileForUpload, 'banners');
            
            if(!AdminData.data.banners) AdminData.data.banners = [];
            AdminData.data.banners.push({ id: String(Date.now()), img: finalImgUrl, link: Utils.escapeHTML(Utils.getVal('ban-link')) });
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
        
        sys.storeName = Utils.escapeHTML(Utils.getVal('store-name-input'));
        sys.logoSize = Utils.getVal('store-logo-size', 36);
        sys.nameWeight = Utils.getVal('store-name-weight', '900');
        sys.nameColorType = Utils.getVal('store-color-type', 'solid');
        sys.nameColor1 = Utils.getVal('store-color-1', '#ffffff');
        sys.nameColor2 = Utils.getVal('store-color-2', '#FFD700');
        sys.nameShadow = Utils.getCheck('store-name-shadow');

        const processBrandImage = async (baseId, currentUrl) => {
            const inputEl = document.getElementById(`${baseId}-input`) || document.getElementById(baseId);
            const wrapEl = document.getElementById(`${baseId}-wrap`);
            
            if (wrapEl && !wrapEl.classList.contains('has-img')) {
                if (currentUrl) await FirebaseAdapter.deleteImageByUrl(currentUrl).catch(()=>{});
                return '';
            }
            
            if (inputEl && inputEl.files && inputEl.files.length > 0) {
                if (currentUrl) await FirebaseAdapter.deleteImageByUrl(currentUrl).catch(()=>{});
                const fileToUpload = inputEl.files[0];
                
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
                return await FirebaseAdapter.uploadImage(fileForUpload, 'brand');
            }
            
            return currentUrl || '';
        };

        this._actionLocks.add('save-brand');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري ضغط وتحديث هوية المتجر السحابية...');
        
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
            this._actionLocks.add('save-brand');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); 
        }
    },

    autoSaveSettings: async function() {
        if (this._actionLocks.has('auto-save-settings')) return;
        this._actionLocks.add('auto-save-settings');

        try {
            if (!AdminData?.data?.settings) AdminData.data.settings = {};
            const s = AdminData.data.settings;
            
            s.promoText = Utils.escapeHTML(Utils.getVal('promo-text', ''));
            s.sliderDuration = Utils.getVal('slider-time', 3);
            s.sliderTransition = Utils.getVal('slider-transition', 'fade');
            s.promoAnim = Utils.getVal('promo-speed', 'vertical-normal');
            s.currencyDisplay = Utils.getVal('setting-curr-display', 'symbol');
            
            const syncToggle = document.getElementById('setting-sync-currency-store');
            if (syncToggle) s.syncCurrencyDisplay = syncToggle.checked;
            
            const currToggle = document.getElementById('setting-show-currency');
            if (currToggle) s.showCurrencyToggle = currToggle.checked;
            
            const tierMsg = document.getElementById('setting-tier-paused-msg');
            if (tierMsg) s.tierPausedMsg = Utils.escapeHTML(tierMsg.value);
            
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
