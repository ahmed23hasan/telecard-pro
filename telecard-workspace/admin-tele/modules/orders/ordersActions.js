// ============================================================================
// 🗺️ خريطة مسارات الطلبات (Orders Actions Router) - النسخة V4.2 💎
// 💡 الوظيفة: استلام أحداث الطلبات من EventBus وتوجيهها للمتحكم المختص
// 🚀 التحديث المعماري: كسر الارتباط الدائري الميت وفصل الموديول كلياً عن العقل المركزي
// ============================================================================

import { OrdersController } from './ordersController.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';

export const OrdersActions = {
    // 1. فتح نافذة الطلب الجانبية
    'open-order-drawer': (data) => AdminUI?.OrdersUI?.openOrderDrawer?.(data.id),
    
    // 2. 🔗 قبول أو رفض الطلب (موجه للمتحكم المطور بـ O(1))
    'submit-order': (data) => OrdersController.submitOrderAction?.(data.type, data.id),
    
    // 3. 🔗 طلب استرجاع (Refund) بعد القبول
    'request-order-refund': (data) => OrdersController.requestOrderRefund?.(data.id),
    
    // 4. تحميل المزيد من الطلبات (Pagination)
    'load-more-orders': () => AdminRender?.loadMoreOrders?.(),
    
    // 5. فلترة الطلبات عبر التبويبات (مكتمل، معلق، الخ)
    'filter-orders': (data) => AdminRender?.filterByTab?.('orders', data.val, data.element),
    
    // 6. 🔗 الانتقال لعرض طلبات عميل محدد (مفكك الارتباط بالكامل)
    'nav-to-user-orders': (data) => OrdersController.navToUserOrders?.(data.id)
};