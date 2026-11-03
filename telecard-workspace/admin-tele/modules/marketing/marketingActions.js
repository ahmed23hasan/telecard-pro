// ============================================================================
// 🗺️ خريطة مسارات التسويق (Marketing Actions Router) - Cloud-Native V20.1 💎
// 🚀 التحديثات المعمارية (V20.1 - Direct UI Routing & Live Ticker Preview): 
// 1. Alert Toggles Routing 🔔: توجيه مسارات التنبيهات المنبثقة مباشرة لـ MarketingUI.
// 2. Live Ticker Preview 📜: تفعيل التحديث اللحظي لمعاينة الشريط الإخباري أثناء الكتابة.
// 3. Complete Action Coverage 🔌: ضمان تغطية كافة أزرار الكوبونات والعروض والبنرات.
// 4. Quick Select Action ⚡: إضافة أوامر تحديد/إلغاء الكل بدون أخطاء OnClick.
// ============================================================================

import { MarketingController } from './marketingController.js';
import { AdminUI } from '../../adminUI.js';
import { EventBus } from '../../adminUtils.js';

export const MarketingActions = {
    // 🚀 إضافة أكشن تحديد/إلغاء الكل الآمن والسريع (O(N) Complexity)
    'toggle-tree-all': (data) => {
        const container = document.getElementById(data.target);
        if (!container) return;
        const cbs = Array.from(container.querySelectorAll('input[type="checkbox"]'));
        if (cbs.length === 0) return;
        
        const shouldCheck = !cbs.every(cb => cb.checked);
        cbs.forEach(cb => {
            cb.checked = shouldCheck;
            cb.indeterminate = false;
        });
        
        // تحديث شجرة القصة إذا كنا نعدل قسم المنتجات في العروض
        if (data.target === 'offer-target-prods' && AdminUI?.MarketingUI?.visualConfig?.storyEnabled) {
            AdminUI.MarketingUI.renderStoryProductsTree?.();
        }
    },

    // --- 1. إدارة العروض (Offers & Visual Builder) ---
    'open-offer-modal': (data) => AdminUI?.MarketingUI?.openOfferModal?.(data.id),
    'save-offer': () => MarketingController.saveOffer?.(),
    'toggle-offer-status': (data) => MarketingController.toggleOfferStatus?.(data.id, data.element.checked),
    'delete-offer': (data) => MarketingController.deleteOffer?.(data.id),
    
    'switch-promo-tab': (data) => AdminUI?.MarketingUI?.switchPromoTab?.(data.tab, data.element),
    'toggle-offer-fields': () => AdminUI?.MarketingUI?.toggleOfferFields?.(),
    'render-grid-preview': () => AdminUI?.MarketingUI?.renderGridPreview?.(),
    'toggle-story-builder': () => AdminUI?.MarketingUI?.toggleStoryBuilder?.(),
    'builder-tab': (data) => AdminUI?.MarketingUI?.switchBuilderTab?.(data.tab, data.originalEvent),
    'set-grid-style': (data) => AdminUI?.MarketingUI?.setGridStyle?.(data.type, data.val, data.element),
    'set-grid-color': (data) => AdminUI?.MarketingUI?.setGridColor?.(data.element),
    'set-grid-pos': (data) => AdminUI?.MarketingUI?.setGridPos?.(data.type, data.element),
    'update-story-shape': (data) => AdminUI?.MarketingUI?.updateStoryConfig?.('shape', data.val, data.element),
    
    // --- 2. إدارة الكوبونات (Coupons) ---
    'open-coupon-modal': (data) => AdminUI?.MarketingUI?.openCouponModal?.(data.id),
    'save-coupon': () => MarketingController.saveCoupon?.(),
    'toggle-coupon-status': (data) => MarketingController.toggleCouponStatus?.(data.id, data.element.checked),
    'gen-coupon': () => MarketingController.generateRandomCoupon?.(),
    
    // --- 3. إدارة الإشعارات الذكية (Alerts & Notifications) ---
    'open-alert-modal': () => AdminUI?.MarketingUI?.openAlertModal?.(),
    'send-alert': () => MarketingController.sendUnifiedAlert?.(),
    'delete-alert': (data) => MarketingController.deleteAlert?.(data.id),
    
    // 🚀 تصحيح التوجيه المباشر لـ MarketingUI لإظهار الحقول المتقدمة والاستهداف فوراً
    'toggle-alert-adv': () => AdminUI?.MarketingUI?.toggleAlertAdvancedFields?.(),
    'toggle-alert-tgt': () => AdminUI?.MarketingUI?.toggleAlertTargetFields?.(),
    'toggle-alert-type': () => AdminUI?.MarketingUI?.toggleAlertTypeFields?.(),
    'scroll-to-alerts': () => AdminUI?.scrollToAlerts?.(),
    
    // --- 4. إدارة الإعلانات والبانرات (Ads & Branding) ---
    'open-banner-modal': () => AdminUI?.MarketingUI?.openBannerModal?.(),
    'save-banner': () => MarketingController.saveBanner?.(),
    'delete-banner': (data) => MarketingController.deleteBanner?.(data.id),
    'save-ads-settings': () => MarketingController.autoSaveSettings?.(),
    
    // 🌟 مسار حفظ هوية المتجر الموحد
    'save-store-identity': () => MarketingController.saveStoreIdentity?.(),
    
    // 🌟 تشغيل المعاينة اللحظية للشريط الإخباري مباشرة عند الكتابة
    'update-ticker-preview': (data) => {
        const val = data?.val !== undefined ? data.val : document.getElementById('promo-text')?.value;
        const preview = document.getElementById('preview-ticker');
        if (preview) {
            preview.innerText = val && String(val).trim() !== '' ? String(val).trim() : 'معاينة النص...';
        }
    },
    
    'update-brand': () => {
        if (AdminUI?.updateBrandPreview) AdminUI.updateBrandPreview();
    },
    'update-brand-size': () => {
        if (AdminUI?.updateBrandPreview) AdminUI.updateBrandPreview();
    },
    'toggle-color-type': () => {
        if (AdminUI?.toggleColorType) AdminUI.toggleColorType();
        if (AdminUI?.updateBrandPreview) AdminUI.updateBrandPreview();
    }
};
