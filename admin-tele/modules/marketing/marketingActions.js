// ============================================================================
// 🗺️ خريطة مسارات التسويق (Marketing Actions Router)
// ============================================================================

import { MarketingController } from './marketingController.js'; 
import { AdminUI } from '../../adminUI.js';
import { EventBus } from '../../adminUtils.js'; // 🆕 استيراد ناقل الأحداث الضروري للمعاينة الحية

export const MarketingActions = {
    // --- 1. إدارة العروض (Offers & Visual Builder) ---
    'open-offer-modal': (data) => MarketingController.openOfferModal?.(data.id),
    'save-offer': () => MarketingController.saveOffer?.(),
    'toggle-offer-status': (data) => MarketingController.toggleOfferStatus?.(data.id, data.element.checked),
    
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
    'open-coupon-modal': (data) => MarketingController.openCouponModal?.(data.id),
    'save-coupon': () => MarketingController.saveCoupon?.(),
    'toggle-coupon-status': (data) => MarketingController.toggleCouponStatus?.(data.id, data.element.checked),
    'gen-coupon': () => MarketingController.generateRandomCoupon?.(),
    
    // --- 3. إدارة الإشعارات الذكية (Alerts & Notifications) ---
    'open-alert-modal': () => MarketingController.openAlertModal?.(),
    'send-alert': () => MarketingController.sendUnifiedAlert?.(),
    'toggle-alert-adv': () => AdminUI?.toggleAlertAdvancedFields?.(),
    'toggle-alert-tgt': () => AdminUI?.toggleAlertTargetFields?.(),
    'toggle-alert-type': () => AdminUI?.toggleAlertTypeFields?.(),
    'scroll-to-alerts': () => AdminUI?.scrollToAlerts?.(),
    
    // --- 4. إدارة الإعلانات والبانرات (Ads & Branding) ---
    'save-banner': () => MarketingController.saveBanner?.(),
    'save-ads-settings': () => MarketingController.autoSaveSettings?.(),
    
    // 🌟 مسار حفظ هوية المتجر
    'save-store-identity': () => MarketingController.saveStoreIdentity?.(),
    
    // 🌟 مسار المعاينة الحية للشريط الإخباري (يطلق حدث الرسم المركزي)
    'update-ticker-preview': () => EventBus.emit('req-update-preview'),
    
    'update-brand': () => AdminUI?.updateBrandPreview?.(),
    'update-brand-size': () => AdminUI?.updateBrandPreview?.(),
    'toggle-color-type': () => {
        AdminUI?.toggleColorType?.();
        AdminUI?.updateBrandPreview?.();
    }
};
