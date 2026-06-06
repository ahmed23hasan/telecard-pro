// ============================================================================
// 🧠 متحكم التسويق (modules/marketing/marketingController.js) - Pro Version 🚀
// الوظيفة: الكوبونات، العروض، الإشعارات، وإعدادات البنرات (الهوية البصرية).
// 🌟 التحديث: سحب الصور من DOM + التنظيف التلقائي للسحابة (Storage GC) + الأمان
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';
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
            EventBus.emit('req-show-toast', { message: 'تم إفراغ العرض الجديد بعد استبعاد التضاربات. تم إلغاء الحفظ.', type: 'error' });
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
            const msg = `⚠️ تنبيه التناسق البصري!\nهناك عروض تظهر في نفس القسم وتستخدم شكلاً مختلفاً.\nهل توافق على توحيد كافة الأشكال لتصبح متطابقة؟`;
            if (AdminUI && await AdminUI.showConfirm(msg, 'مُزامن الهوية البصرية')) {
                conflictingOffers.forEach(o => { o.visualConfig.storyShape = newShape; });
                return true;
            } else { return false; }
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

        if (!name) return EventBus.emit('req-show-toast', { message: 'يرجى إدخال اسم الحملة', type: 'error' });
        if (value <= 0 && type !== 'badge_only') return EventBus.emit('req-show-toast', { message: 'قيمة الخصم يجب أن تكون أكبر من صفر', type: 'error' });

        const selectedTiers = AdminUI?.MarketingUI?.getSelectedTiers?.() || [];
        const selectedProds = AdminUI?.MarketingUI?.getSelectedProds?.() || [];

        if (selectedTiers.length === 0) return EventBus.emit('req-show-toast', { message: 'يجب تحديد مستوى واحد على الأقل', type: 'error' });
        if (selectedProds.length === 0) return EventBus.emit('req-show-toast', { message: 'يجب تحديد منتج واحد على الأقل', type: 'error' });

        const currentVisualConfig = AdminUI?.MarketingUI?.visualConfig ? JSON.parse(JSON.stringify(AdminUI.MarketingUI.visualConfig)) : { storyEnabled: false };
        if (currentVisualConfig.storyEnabled) {
            const selectedStoryProds = AdminUI?.MarketingUI?.getSelectedStoryProds?.() || [];
            if (selectedStoryProds.length === 0) return EventBus.emit('req-show-toast', { message: 'يرجى اختيار منتج واحد على الأقل من شجرة القصص', type: 'warning' });
            currentVisualConfig.storyProducts = selectedStoryProds;
        } else { currentVisualConfig.storyProducts = []; }

        if (!AdminData.data.offers) AdminData.data.offers = [];
        const isEdit = !!AppController.tempEditId;
        const oIdx = isEdit ? AdminData.data.offers.findIndex(o => String(o.id) === String(AppController.tempEditId)) : -1;
        
        const offerData = { id: isEdit ? AppController.tempEditId : 'off_' + Date.now(), name, type, value, isActive, expiryDate, targetTiers: selectedTiers, targetProds: selectedProds, visualConfig: currentVisualConfig };

        const passedCollision = await this._checkOfferCollisions(offerData);
        if (!passedCollision) return;

        const passedShapeSync = await this._checkStoryShapeSync(offerData);
        if (!passedShapeSync) return;

        if (isEdit && oIdx !== -1) AdminData.data.offers[oIdx] = offerData;
        else AdminData.data.offers.push(offerData);

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الحفظ سحابياً...');
        try {
            await AdminData?.saveOffers?.();
            AppController.finishAction('req-render-offers', 'offer', isEdit ? 'EDIT_OFFER' : 'ADD_OFFER', `حملة تخفيض: ${name}`, isEdit ? 'تم التعديل بنجاح' : 'تمت الإضافة بنجاح');
        } finally { if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); }
    },

    deleteOffer: async function(id) {
        if (!AdminData.data.offers) return;
        if (AdminUI?.showConfirm && !await AdminUI.showConfirm('هل أنت متأكد من حذف العرض نهائياً؟')) return;
        const offer = AdminData.data.offers.find(o => String(o.id) === String(id));
        
        AdminData.data.offers = AdminData.data.offers.filter(o => String(o.id) !== String(id));
        EventBus.emit('req-render-offers'); EventBus.emit('req-show-toast', {message:'جاري الحذف...', type:'info'});
        try {
            await AdminData?.saveOffers?.();
            if (offer) AdminData?.addLog?.('DELETE_OFFER', `حذف حملة: ${offer.name}`);
            EventBus.emit('req-show-toast', {message:'تم الحذف بنجاح', type:'success'});
        } catch(e) { AdminData.data.offers.push(offer); EventBus.emit('req-render-offers'); }
    },

    toggleOfferStatus: async function(id, isActive) {
        const offer = AdminData.data.offers.find(o => String(o.id) === String(id));
        if (offer) {
            offer.isActive = isActive; EventBus.emit('req-render-offers');
            try {
                await AdminData?.saveOffers?.();
                EventBus.emit('req-show-toast', { message: isActive ? 'تم تفعيل العرض' : 'تم الإيقاف', type: 'success' });
            } catch(e) { offer.isActive = !isActive; EventBus.emit('req-render-offers'); }
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
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let code = '';
        for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        AdminUI?.MarketingUI?.applyGeneratedCoupon?.(code);
    },

    saveCoupon: async function() {
        const code = Utils.escapeHTML(Utils.getVal('coupon-code')).toUpperCase();
        if (!code) return EventBus.emit('req-show-toast', { message: 'أدخل كود الكوبون', type: 'error' });
        
        const type = Utils.getVal('coupon-type') || 'percentage';
        const value = Number(Utils.getVal('coupon-value')) || 0;
        if (value <= 0) return EventBus.emit('req-show-toast', { message: 'قيمة الخصم يجب أن تكون أعلى من صفر', type: 'error' });

        const selectedTiers = AdminUI?.MarketingUI?.getCouponSelectedTiers?.() || [];
        const selectedProds = AdminUI?.MarketingUI?.getCouponSelectedProds?.() || [];

        if (selectedTiers.length === 0 || selectedProds.length === 0) {
            return EventBus.emit('req-show-toast', { message: 'يجب تحديد مستوى ومنتج واحد على الأقل', type: 'error' });
        }

        const isEdit = !!AppController.tempEditId;
        const cIdx = isEdit ? AdminData.data.coupons.findIndex(c => String(c.id) === String(AppController.tempEditId)) : -1;
        
        if (!isEdit && AdminData.data.coupons.find(c => c.code === code)) {
            return EventBus.emit('req-show-toast', { message: 'هذا الكود مستخدم مسبقاً', type: 'error' });
        }

        const expiryVal = Utils.getVal('coupon-expiry');
        const allowedUsersStr = Utils.getVal('coupon-allowed-users');
        const allowedUsers = allowedUsersStr ? allowedUsersStr.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0) : [];

        const couponData = {
            id: isEdit ? AppController.tempEditId : Date.now(),
            code, type, value,
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

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الحفظ...');
        try {
            await AdminData?.saveCoupons?.();
            AppController.finishAction('req-render-coupons', 'coupon', isEdit ? 'EDIT_COUPON' : 'ADD_COUPON', `كوبون: ${code}`, 'تم حفظ الكوبون بنجاح');
        } finally { if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); }
    },

    deleteCoupon: async function(id) {
        if (!AdminData.data.coupons) return;
        if (AdminUI?.showConfirm && !await AdminUI.showConfirm('هل أنت متأكد من الحذف؟')) return;
        const coupon = AdminData.data.coupons.find(c => String(c.id) === String(id));
        AdminData.data.coupons = AdminData.data.coupons.filter(c => String(c.id) !== String(id));
        EventBus.emit('req-render-coupons'); EventBus.emit('req-show-toast', { message: 'جاري الحذف...', type: 'info' });
        try {
            await AdminData?.saveCoupons?.();
            if (coupon) AdminData?.addLog?.('DELETE_COUPON', `حذف الكوبون: ${coupon.code}`);
            EventBus.emit('req-show-toast', { message: 'تم الحذف', type: 'success' });
        } catch(e) { AdminData.data.coupons.push(coupon); EventBus.emit('req-render-coupons'); }
    },

    toggleCouponStatus: async function(id, isActive) {
        const coupon = AdminData.data.coupons.find(c => String(c.id) === String(id));
        if (coupon) {
            coupon.isActive = isActive; EventBus.emit('req-render-coupons');
            try { await AdminData?.saveCoupons?.(); } catch(e) { coupon.isActive = !isActive; EventBus.emit('req-render-coupons'); }
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
        if (!body) return EventBus.emit('req-show-toast', { message: 'يرجى كتابة الرسالة', type: 'error' });

        const targetType = Utils.getVal('alert-target-type', 'all');
        let targetId = null;
        if (targetType === 'tier') targetId = Utils.getVal('alert-target-tier');
        else if (targetType === 'user') {
            const inputVal = Utils.escapeHTML(Utils.getVal('alert-target-user'));
            const userExists = (AdminData.data.users || []).find(u => String(u.id) === String(inputVal) || String(u.displayId) === String(inputVal));
            if (!userExists) return EventBus.emit('req-show-toast', { message: 'العميل غير موجود', type: 'error' });
            targetId = userExists.id; 
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
        try {
            if (targetType === 'user') {
                const userIndex = (AdminData.data.users || []).findIndex(u => String(u.id) === String(targetId));
                if (userIndex !== -1) {
                    if (!AdminData.data.users[userIndex].inbox) AdminData.data.users[userIndex].inbox = [];
                    AdminData.data.users[userIndex].inbox.push(newAlert);
                    await AdminData.saveUsers();
                }
            } else {
                if (!AdminData.data.alerts) AdminData.data.alerts = [];
                AdminData.data.alerts.push(newAlert);
                await AdminData.saveAlerts();
            }
            AppController.finishAction('req-render-alerts', null, null, null, 'تم الإرسال بنجاح!');
        } finally { if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); }
    },

    deleteAlert: async function(id) {
        if (!AdminData.data.alerts) return;
        let alertBackup = [...AdminData.data.alerts];
        AdminData.data.alerts = AdminData.data.alerts.filter(a => a.id !== id);
        EventBus.emit('req-render-alerts');
        try {
            await AdminData.saveAlerts();
            if (AdminData.data.users) {
                let userUpdated = false;
                AdminData.data.users.forEach(u => {
                    if (u.inbox && u.inbox.some(a => a.id === id)) { u.inbox = u.inbox.filter(a => a.id !== id); userUpdated = true; }
                });
                if (userUpdated) await AdminData.saveUsers();
            }
            EventBus.emit('req-show-toast', { message: 'تم الحذف', type: 'success' });
        } catch(e) { AdminData.data.alerts = alertBackup; EventBus.emit('req-render-alerts'); }
    },

    // =========================================================
    // 🎨 4. إعدادات الإعلانات والهوية + 🌟 (التنظيف التلقائي للسحابة)
    // =========================================================
    saveBanner: async function() {
        const fileInput = document.getElementById('ban-img-input');
        const fileToUpload = fileInput?.files?.[0];
        if (!fileToUpload) return EventBus.emit('req-show-toast', {message: 'اختر صورة للبنر', type: 'warning'});

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري الرفع السحابي...'); 
        try {
            const finalImgUrl = await FirebaseAdapter.uploadImage(fileToUpload, 'banners');
            if(!AdminData.data.banners) AdminData.data.banners = [];
            AdminData.data.banners.push({ id: String(Date.now()), img: finalImgUrl, link: Utils.escapeHTML(Utils.getVal('ban-link')) });
            await AdminData?.saveBanners?.();
            AppController.finishAction('req-render-banners', null, 'ADD_BANNER', 'إضافة بانر', 'تم إضافة بانر بنجاح');
        } catch (error) { EventBus.emit('req-show-toast', {message: 'خطأ أثناء الرفع', type: 'error'}); } 
        finally { if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); }
    },
    
    deleteBanner: async function(id) {
        const bnr = AdminData.data.banners.find(x => String(x.id) === String(id));
        if (bnr && bnr.img && typeof FirebaseAdapter.deleteImageByUrl === 'function') {
            // 🌟 تنظيف السحابة من الصورة القديمة لتوفير المساحة والمال
            try { await FirebaseAdapter.deleteImageByUrl(bnr.img); } catch(e){ console.warn("تعذر تنظيف صورة البنر"); }
        }
        AdminData.data.banners = AdminData.data.banners.filter(x => String(x.id) !== String(id));
        await AdminData.saveBanners();
        EventBus.emit('req-render-banners');
        EventBus.emit('req-show-toast', {message: 'تم الحذف', type: 'success'});
    },

    saveStoreIdentity: async function() {
        if (!AdminData?.data?.settings) AdminData.data.settings = {};
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
            
            // 🌟 تنظيف السحابة: إذا مسح الأدمن الصورة، نمسحها من السيرفر
            if (wrapEl && !wrapEl.classList.contains('has-img')) {
                if (currentUrl) await FirebaseAdapter.deleteImageByUrl(currentUrl).catch(()=>{});
                return '';
            }
            
            if (inputEl && inputEl.files && inputEl.files.length > 0) {
                // 🌟 تنظيف السحابة: إذا رفع صورة جديدة، نمسح القديمة
                if (currentUrl) await FirebaseAdapter.deleteImageByUrl(currentUrl).catch(()=>{});
                const file = inputEl.files[0];
                return await FirebaseAdapter.uploadImage(file, 'brand');
            }
            
            return currentUrl || '';
        };

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث هوية المتجر...');
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
            EventBus.emit('req-show-toast', { message: 'تم حفظ هوية المتجر', type: 'success' });
        } catch (error) { EventBus.emit('req-show-toast', {message: 'خطأ أثناء رفع الهوية', type: 'error'}); } 
        finally { if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false); }
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
        
        if (AdminData?.saveSystemSettings) await AdminData.saveSystemSettings();
        
        EventBus.emit('req-update-preview');
        EventBus.emit('req-show-toast', { message: 'تم حفظ الإعدادات', type: 'success' });
    }
};