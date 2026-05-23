// ============================================================================
// 🧠 متحكم التسويق (modules/marketing/marketingController.js)
// الوظيفة: معالجة العمليات المنطقية للكوبونات، العروض، الإشعارات، وإعدادات البنرات.
// 🌟 التحديث: ربط البنرات وهوية المتجر بمحرك الرفع السحابي (Firebase Storage)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';
// 🌟 استدعاء محول السحابة لرفع الصور
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const MarketingController = {

    // =========================================================
    // 🛍️ 1. إدارة العروض المركزية (Offers)
    // =========================================================
    openOfferModal: function(id = null) {
        let strId = id ? String(id) : null;
        AppController.updateState({ tempEditId: strId });
        const offer = strId ? (AdminData.data.offers || []).find(o => String(o.id) === strId) : null;
        AdminUI?.MarketingUI?.setupOfferModal?.(offer);
        
        if (AdminRender?.populateSmartTreeTargets) {
            AdminRender.populateSmartTreeTargets('offer-target', offer ? (offer.targetTiers || []) : [], offer ? (offer.targetProds || []) : []);
        }
        EventBus.emit('req-open-modal', 'offer');
    },

    _showBatchCollisionResolver: function(collisions) {
        return new Promise((resolve) => {
            AdminUI?.MarketingUI?.showBatchCollisionResolverUI?.(collisions, resolve);
        });
    },

    _checkOfferCollisions: async function(newOffer) {
        const targetProds = newOffer.targetProds || [];
        if (!targetProds.length) return true;
        
        const otherActiveOffers = (AdminData.data.offers || []).filter(o => String(o.id) !== String(newOffer.id) && o.isActive !== false && (!o.expiryDate || o.expiryDate > Date.now()));
        const collisions = [];
        
        for (const prodId of targetProds) {
            for (const oldOffer of otherActiveOffers) {
                if (oldOffer.targetProds && oldOffer.targetProds.includes(String(prodId))) {
                    const prodObj = (AdminData.data.prods || []).find(p => String(p.id) === String(prodId));
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
            EventBus.emit('req-show-toast', { message: 'تم إفراغ العرض الجديد من المنتجات بعد استبعاد التضاربات. تم إلغاء الحفظ.', type: 'error' });
            return false;
        }
        
        return true;
    },

    _checkStoryShapeSync: async function(newOffer) {
        if (!newOffer.visualConfig || !newOffer.visualConfig.storyEnabled || !newOffer.visualConfig.storyProducts.length) return true;
        
        const newShape = newOffer.visualConfig.storyShape;
        const prods = AdminData.data.prods || [];
        const targetCatIds = new Set();
        
        newOffer.visualConfig.storyProducts.forEach(pId => {
            const p = prods.find(x => String(x.id) === String(pId));
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
                    const p = prods.find(x => String(x.id) === String(pId));
                    return p && p.catId && targetCatIds.has(String(p.catId));
                });
                if (hasSharedCat) {
                    needsSync = true;
                    conflictingOffers.push(oldOffer);
                }
            }
        }
        
        if (needsSync) {
            const msg = `⚠️ تنبيه التناسق البصري للقسم!\n\nهناك عروض أخرى (قصص) تظهر حالياً في نفس هذه الأقسام، ولكنها تستخدم شكلاً مختلفاً عن الشكل الذي اخترته الآن.\n\nلتجنب التشوه البصري في المتجر، هل توافق على توحيد كافة أشكال القصص في هذه الأقسام لتصبح متطابقة؟`;
            if (AdminUI && await AdminUI.showConfirm(msg, 'مُزامن الهوية البصرية')) {
                conflictingOffers.forEach(o => {
                    o.visualConfig.storyShape = newShape;
                });
                return true;
            } else {
                return false;
            }
        }
        
        return true;
    },

    saveOffer: async function() {
        const name = Utils.escapeHTML(Utils.getVal('offer-name'));
        const type = Utils.getVal('offer-type') || 'real';
        const value = Number(Utils.getVal('offer-value')) || 0;
        const isActive = Utils.getCheck('offer-active');
        const expiryVal = Utils.getVal('offer-expiry');
        const expiryDate = expiryVal ? Number(expiryVal) : null;

        if (!name) {
            EventBus.emit('req-show-toast', { message: 'يرجى إدخال اسم الحملة', type: 'error' });
            return;
        }

        if (value <= 0 && type !== 'badge_only') {
            EventBus.emit('req-show-toast', { message: 'قيمة الخصم يجب أن تكون أكبر من صفر', type: 'error' });
            return;
        }

        const selectedTiers = AdminUI?.MarketingUI?.getSelectedTiers?.() || [];
        const selectedProds = AdminUI?.MarketingUI?.getSelectedProds?.() || [];

        if (selectedTiers.length === 0) {
            EventBus.emit('req-show-toast', { message: 'يجب تحديد مستوى واحد على الأقل', type: 'error' });
            return;
        }

        if (selectedProds.length === 0) {
            EventBus.emit('req-show-toast', { message: 'يجب تحديد منتج أو قسم واحد على الأقل', type: 'error' });
            return;
        }

        const currentVisualConfig = AdminUI?.MarketingUI?.visualConfig ? JSON.parse(JSON.stringify(AdminUI.MarketingUI.visualConfig)) : { storyEnabled: false };
        
        if (currentVisualConfig.storyEnabled) {
            const selectedStoryProds = AdminUI?.MarketingUI?.getSelectedStoryProds?.() || [];
            if (selectedStoryProds.length === 0) {
                EventBus.emit('req-show-toast', { message: 'لقد قمت بتفعيل الإبراز في القصص، يرجى اختيار منتج واحد على الأقل من شجرة القصص', type: 'warning' });
                return;
            }
            currentVisualConfig.storyProducts = selectedStoryProds;
        } else {
            currentVisualConfig.storyProducts = [];
        }

        if (!AdminData.data.offers) AdminData.data.offers = [];
        const isEdit = !!AppController.tempEditId;
        const oIdx = isEdit ? AdminData.data.offers.findIndex(o => String(o.id) === String(AppController.tempEditId)) : -1;
        
        const offerData = {
            id: isEdit ? AppController.tempEditId : 'off_' + Date.now(),
            name, type, value, isActive, expiryDate, targetTiers: selectedTiers, targetProds: selectedProds, visualConfig: currentVisualConfig
        };

        const passedCollision = await this._checkOfferCollisions(offerData);
        if (!passedCollision) return;

        const passedShapeSync = await this._checkStoryShapeSync(offerData);
        if (!passedShapeSync) return;

        if (isEdit && oIdx !== -1) {
            AdminData.data.offers[oIdx] = offerData;
        } else {
            AdminData.data.offers.push(offerData);
        }

        await AdminData?.saveOffers?.();
        AppController.finishAction('req-render-offers', 'offer', isEdit ? 'EDIT_OFFER' : 'ADD_OFFER', `تم ${isEdit ? 'تعديل' : 'إضافة'} حملة تخفيض: ${name}`, isEdit ? 'تم تعديل الحملة بنجاح' : 'تم إضافة الحملة بنجاح');
    },

    deleteOffer: async function(id) {
        if (!AdminData.data.offers) return;
        const offer = AdminData.data.offers.find(o => String(o.id) === String(id));
        AdminData.data.offers = AdminData.data.offers.filter(o => String(o.id) !== String(id));
        await AdminData?.saveOffers?.();
        if (offer) AdminData?.addLog?.('DELETE_OFFER', `تم حذف حملة التخفيض: ${offer.name}`);
        EventBus.emit('req-render-offers');
        EventBus.emit('req-show-toast', {message:'تم حذف الحملة نهائياً', type:'success'});
    },

    toggleOfferStatus: async function(id, isActive) {
        const offer = AdminData.data.offers.find(o => String(o.id) === String(id));
        if (offer) {
            offer.isActive = isActive;
            await AdminData?.saveOffers?.();
            AdminData?.addLog?.('TOGGLE_OFFER', `تم ${isActive ? 'تفعيل' : 'إيقاف'} العرض: ${offer.name}`);
            EventBus.emit('req-render-offers');
            EventBus.emit('req-show-toast', { message: isActive ? 'تم تفعيل العرض' : 'تم إيقاف العرض مؤقتاً', type: isActive ? 'success' : 'warning' });
        }
    },

    // =========================================================
    // 🎟️ 2. إدارة الكوبونات (Coupons)
    // =========================================================
    openCouponModal: function(id = null) {
        AppController.updateState({ tempEditId: id });
        const isEdit = !!id;
        const coupon = isEdit ? AdminData.data.coupons.find(c => String(c.id) === String(id)) : null;
        
        AdminUI?.MarketingUI?.setupCouponModal?.(coupon, isEdit);
        AdminRender?.populateSmartTreeTargets?.('coupon-target', coupon ? (coupon.targetTiers||[]) : [], coupon ? (coupon.targetProds||[]) : []);
        EventBus.emit('req-open-modal', 'coupon');
    },

    generateRandomCoupon: function() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        AdminUI?.MarketingUI?.applyGeneratedCoupon?.(code);
    },

    saveCoupon: async function() {
        const code = Utils.escapeHTML(Utils.getVal('coupon-code')).toUpperCase();
        const type = Utils.getVal('coupon-type') || 'percentage';
        const value = Number(Utils.getVal('coupon-value')) || 0;
        const minOrder = Number(Utils.getVal('coupon-min-order')) || 0;
        const maxUses = Number(Utils.getVal('coupon-max-uses')) || 0;
        const isActive = Utils.getCheck('coupon-active');
        const expiryVal = Utils.getVal('coupon-expiry');
        const expiryDate = expiryVal ? Number(expiryVal) : null;

        if (!code) {
            EventBus.emit('req-show-toast', { message: 'يرجى إدخال كود الكوبون', type: 'error' });
            return;
        }

        if (value <= 0) {
            EventBus.emit('req-show-toast', { message: 'قيمة الخصم يجب أن تكون أكبر من صفر', type: 'error' });
            return;
        }

        const maxPerUser = Number(Utils.getVal('coupon-max-per-user')) || 0;
        const allowedUsersStr = Utils.getVal('coupon-allowed-users');
        const allowedUsers = allowedUsersStr ? allowedUsersStr.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0) : [];

        const selectedTiers = AdminUI?.MarketingUI?.getCouponSelectedTiers?.() || [];
        const selectedProds = AdminUI?.MarketingUI?.getCouponSelectedProds?.() || [];

        if (selectedTiers.length === 0) {
            EventBus.emit('req-show-toast', { message: 'يجب تحديد مستوى واحد على الأقل', type: 'error' });
            return;
        }

        if (selectedProds.length === 0) {
            EventBus.emit('req-show-toast', { message: 'يجب تحديد منتج أو قسم واحد على الأقل', type: 'error' });
            return;
        }

        if (!AdminData.data.coupons) AdminData.data.coupons = [];
        
        const isEdit = !!AppController.tempEditId;
        const cIdx = isEdit ? AdminData.data.coupons.findIndex(c => String(c.id) === String(AppController.tempEditId)) : -1;
        
        if (!isEdit && AdminData.data.coupons.find(c => c.code === code)) {
            EventBus.emit('req-show-toast', { message: 'هذا الكود مستخدم مسبقاً', type: 'error' });
            return;
        }

        const couponData = {
            id: isEdit ? AppController.tempEditId : Date.now(),
            code, type, value, minOrder, maxUses, isActive, expiryDate, maxPerUser, allowedUsers,
            targetTiers: selectedTiers,
            targetProds: selectedProds,
            usageHistory: (isEdit && cIdx > -1 && AdminData.data.coupons[cIdx].usageHistory) ? AdminData.data.coupons[cIdx].usageHistory : {},
            usedCount: (isEdit && cIdx > -1) ? (AdminData.data.coupons[cIdx].usedCount || 0) : 0
        };

        if (isEdit && cIdx !== -1) {
            AdminData.data.coupons[cIdx] = couponData;
        } else {
            AdminData.data.coupons.push(couponData);
        }

        await AdminData?.saveCoupons?.();
        AppController.finishAction('req-render-coupons', 'coupon', isEdit ? 'EDIT_COUPON' : 'ADD_COUPON', `تم ${isEdit ? 'تعديل' : 'إضافة'} كوبون: ${code}`, isEdit ? 'تم تعديل الكوبون بنجاح' : 'تم إضافة الكوبون بنجاح');
    },

    deleteCoupon: async function(id) {
        if (AdminUI?.showConfirm && !await AdminUI.showConfirm('هل أنت متأكد من حذف هذا الكوبون نهائياً؟')) return;
        if (!AdminData.data.coupons) return;
        
        const coupon = AdminData.data.coupons.find(c => String(c.id) === String(id));
        AdminData.data.coupons = AdminData.data.coupons.filter(c => String(c.id) !== String(id));
        await AdminData?.saveCoupons?.();
        
        if (coupon) AdminData?.addLog?.('DELETE_COUPON', `تم حذف الكوبون: ${coupon.code}`);
        EventBus.emit('req-show-toast', { message: 'تم حذف الكوبون', type: 'success' });
        EventBus.emit('req-render-coupons');
    },

    toggleCouponStatus: async function(id, isActive) {
        const coupon = AdminData.data.coupons.find(c => String(c.id) === String(id));
        if (coupon) {
            coupon.isActive = isActive;
            await AdminData?.saveCoupons?.();
            AdminData?.addLog?.('TOGGLE_COUPON', `تم ${isActive ? 'تفعيل' : 'إيقاف'} الكوبون: ${coupon.code}`);
            EventBus.emit('req-render-coupons');
            EventBus.emit('req-show-toast', { message: isActive ? 'تم تفعيل الكوبون' : 'تم إيقاف الكوبون مؤقتاً', type: isActive ? 'success' : 'warning' });
        }
    },

    // =========================================================
    // 🔔 3. إدارة التنبيهات (Alerts)
    // =========================================================
    openAlertModal: function() {
        AdminUI?.MarketingUI?.setupAlertModal?.(AdminData.data.tiers || []);
        EventBus.emit('req-open-modal', 'alert');
    },

    sendUnifiedAlert: async function() {
        const title = Utils.escapeHTML(Utils.getVal('alert-title'));
        const body = Utils.escapeHTML(Utils.getVal('alert-body'));
        const type = Utils.getVal('alert-type', 'notification');
        const targetType = Utils.getVal('alert-target-type', 'all');
        const expiryInput = Utils.getVal('alert-expiry');

        if (!body) {
            EventBus.emit('req-show-toast', { message: 'يرجى كتابة نص الرسالة', type: 'error' });
            return;
        }

                let targetId = null;
        if (targetType === 'tier') {
            targetId = Utils.getVal('alert-target-tier');
        } else if (targetType === 'user') {
            const inputVal = Utils.escapeHTML(Utils.getVal('alert-target-user'));
            if (!inputVal) {
                EventBus.emit('req-show-toast', { message: 'يرجى إدخال رقم العميل', type: 'error' });
                return;
            }
            // 🌟 البحث الذكي بالرقم القصير أو الطويل
            const userExists = (AdminData.data.users || []).find(u => String(u.id) === String(inputVal) || String(u.displayId) === String(inputVal));
            
            if (!userExists) {
                EventBus.emit('req-show-toast', { message: 'العميل غير موجود في قاعدة البيانات', type: 'error' });
                return;
            }
            targetId = userExists.id; // 🌟 حفظ الرقم الطويل حصراً لضمان سلامة قاعدة البيانات
        }
        

        const isPopup = (type === 'popup');
        const maxViewsInput = Utils.getVal('alert-max-views', '3');
        const actionLinkInput = Utils.getVal('alert-action-link');
        const couponInput = Utils.getVal('alert-coupon-code');

        const newAlert = {
            id: 'ALT_' + Date.now(),
            type: type,
            isPopup: isPopup,
            targetType: targetType,
            targetId: targetId,
            title: title,
            message: body,
            createdAt: Date.now(),
            expiresAt: expiryInput ? parseInt(expiryInput) : null,
            maxViews: isPopup ? parseInt(maxViewsInput || 3) : null,
            actionLink: isPopup && actionLinkInput ? Utils.escapeHTML(actionLinkInput) : '',
            couponCode: isPopup && couponInput ? Utils.escapeHTML(couponInput) : ''
        };

        if (targetType === 'user') {
            const users = AdminData.data.users || [];
            const userIndex = users.findIndex(u => String(u.id) === String(targetId));
            if (userIndex !== -1) {
                if (!users[userIndex].inbox) users[userIndex].inbox = [];
                users[userIndex].inbox.push(newAlert);
                await AdminData.saveUsers();
                if(AdminData.addLog) AdminData.addLog('SEND_ALERT', `إرسال ${isPopup ? 'رسالة منبثقة' : 'إشعار'} لعميل محدد (#${targetId})`);
            }
        } else {
            if (!AdminData.data.alerts) AdminData.data.alerts = [];
            AdminData.data.alerts.push(newAlert);
            await AdminData.saveAlerts();
            if(AdminData.addLog) AdminData.addLog('SEND_ALERT', `إرسال ${isPopup ? 'رسالة منبثقة' : 'إشعار'} باستهداف: ${targetType === 'all' ? 'الجميع' : 'مستوى ' + targetId}`);
        }

        AppController.finishAction('req-render-alerts', null, null, null, 'تم إرسال التنبيه بنجاح!');
    },

    deleteAlert: async function(id) {
        if (!AdminData) return;
        let isDeleted = false;
        
        if (AdminData.data.alerts) {
            const initialLength = AdminData.data.alerts.length;
            AdminData.data.alerts = AdminData.data.alerts.filter(a => a.id !== id);
            if (AdminData.data.alerts.length !== initialLength) {
                await AdminData.saveAlerts();
                isDeleted = true;
            }
        }
        
        if (!isDeleted && AdminData.data.users) {
            let userUpdated = false;
            AdminData.data.users.forEach(u => {
                if (u.inbox && u.inbox.some(a => a.id === id)) {
                    u.inbox = u.inbox.filter(a => a.id !== id);
                    userUpdated = true;
                }
            });
            if (userUpdated) {
                await AdminData.saveUsers();
                isDeleted = true;
            }
        }
        
        if (isDeleted) {
            if(AdminData.addLog) AdminData.addLog('DELETE_ALERT', `تم حذف التنبيه: ${id}`);
            EventBus.emit('req-show-toast', { message: 'تم حذف التنبيه بنجاح', type: 'success' });
            EventBus.emit('req-render-alerts');
        }
    },

    // =========================================================
    // 🎨 4. إعدادات الإعلانات والهوية (Ads & Brand)
    // =========================================================
    saveBanner: async function() {
        // 🌟 فحص ما إذا كان هناك ملف صورة حقيقي تم اختياره
        if (AdminUI?.tempFile || AppController.tempImg) {
            EventBus.emit('req-show-loader', true); // إظهار التحميل لأن الرفع قد يستغرق ثواني
            
            try {
                let finalImgUrl = '';
                
                // 🌟 الرفع السحابي النظيف للبنر الإعلاني
                if (AdminUI?.tempFile) {
                    EventBus.emit('req-show-toast', {message: 'جاري رفع البنر الإعلاني للسحابة...', type: 'info'});
                    finalImgUrl = await FirebaseAdapter.uploadImage(AdminUI.tempFile, 'banners');
                } else {
                    // كخيار احتياطي إذا كان هناك خطأ في الواجهة وأرسلت Base64
                    finalImgUrl = AppController.tempImg; 
                }

                if(!AdminData.data.banners) AdminData.data.banners = [];
                AdminData.data.banners.push({
                    id: String(Date.now()),
                    img: finalImgUrl, // 👈 تخزين الرابط السحابي
                    link: Utils.escapeHTML(Utils.getVal('ban-link'))
                });
                
                await AdminData?.saveBanners?.();
                AppController.finishAction('req-render-banners', null, 'ADD_BANNER', 'تم إضافة بانر إعلاني جديد', null);
                
            } catch (error) {
                console.error("Save Banner Error:", error);
                EventBus.emit('req-show-toast', {message: 'حدث خطأ أثناء رفع البنر', type: 'error'});
            } finally {
                EventBus.emit('req-show-loader', false);
            }
        }
    },
    
        saveStoreIdentity: async function() {
        // 🌟 الإصلاح الجذري: توجيه البيانات إلى (settings) بدلاً من (system)
        if (!AdminData?.data?.settings) AdminData.data.settings = {};
        const sys = AdminData.data.settings; // 👈 التعديل السحري هنا
        
        // جمع النصوص والإعدادات
        sys.storeName = Utils.escapeHTML(Utils.getVal('store-name-input'));
        sys.logoSize = Utils.getVal('store-logo-size', 36);
        sys.nameWeight = Utils.getVal('store-name-weight', '900');
        sys.nameColorType = Utils.getVal('store-color-type', 'solid');
        sys.nameColor1 = Utils.getVal('store-color-1', '#ffffff');
        sys.nameColor2 = Utils.getVal('store-color-2', '#FFD700');
        sys.nameShadow = Utils.getCheck('store-name-shadow');

        // دالة مساعدة متقدمة للتعامل مع الرفع السحابي المتعدد لهوية المتجر
        const processBrandImage = async (inputId, currentUrl) => {
            const inputEl = document.getElementById(inputId);
            const wrapEl = document.getElementById(`${inputId}-wrap`);
            
            if (wrapEl && !wrapEl.classList.contains('has-img')) return '';
            
            if (inputEl && inputEl.files && inputEl.files.length > 0) {
                const file = inputEl.files[0];
                return await FirebaseAdapter.uploadImage(file, 'brand');
            }
            
            return currentUrl || '';
        };

        EventBus.emit('req-show-loader', true);

        try {
            EventBus.emit('req-show-toast', {message: 'جاري تحديث هوية المتجر...', type: 'info'});
            
            // رفع الصور الثلاث على التوازي لتسريع العملية
            const [newLogo, newLogoLight, newFavicon] = await Promise.all([
                processBrandImage('store-logo', sys.storeLogo),
                processBrandImage('store-logo-light', sys.storeLogoLight),
                processBrandImage('store-favicon', sys.storeFavicon)
            ]);

            // تخزين الروابط السحابية النظيفة
            sys.storeLogo = newLogo;
            sys.storeLogoLight = newLogoLight;
            sys.storeFavicon = newFavicon;

            // الحفظ في قاعدة البيانات (هذه الدالة تحفظ settings و system معاً بأمان)
            if (AdminData?.saveSystemSettings) {
                await AdminData.saveSystemSettings();
            }

            // تسجيل النشاط وإشعار المستخدم
            if (AdminData?.addLog) AdminData.addLog('UPDATE_BRAND', 'تم تحديث الهوية البصرية للمتجر بنجاح');
            EventBus.emit('req-show-toast', { message: 'تم حفظ هوية المتجر واعتمادها بنجاح', type: 'success' });
            
        } catch (error) {
            console.error("Save Brand Error:", error);
            EventBus.emit('req-show-toast', {message: 'حدث خطأ أثناء رفع صور الهوية', type: 'error'});
        } finally {
            EventBus.emit('req-show-loader', false);
        }
    },


    autoSaveSettings: async function() {
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
        
        if (AdminData?.saveSystemSettings) {
            await AdminData.saveSystemSettings();
        }
        
        EventBus.emit('req-update-preview');
        EventBus.emit('req-show-toast', { message: 'تم حفظ الإعدادات بنجاح', type: 'success' });
    }
};
