// ============================================================================
// 🗺️ خريطة مسارات الطلبات (Orders Actions Router) - النسخة الماسية V15.0 💎
// ============================================================================

import { OrdersController } from './ordersController.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { OrdersRender } from './ordersRender.js'; // 🛡️ استيراد محرك الرسم الخاص بالطلبات

export const OrdersActions = {
    'open-order-drawer': (data) => AdminUI?.OrdersUI?.openOrderDrawer?.(data.id),
    
    'submit-order': (data) => OrdersController.submitOrderAction?.(data.type, data.id),
    'request-order-refund': (data) => OrdersController.requestOrderRefund?.(data.id),
    
    'load-more-orders': () => AdminRender?.loadMoreOrders?.(),
    'filter-orders': (data) => AdminRender?.filterByTab?.('orders', data.val, data.element),
    
    // 🚀 [التصحيح المعماري]: مسار جديد لفلترة مصدر الطلبات (API, يدوي, آلي)
    'filter-orders-source': (data) => OrdersRender?.filterBySource?.(data.val),
    
    'nav-to-user-orders': (data) => OrdersController.navToUserOrders?.(data.id)
};
