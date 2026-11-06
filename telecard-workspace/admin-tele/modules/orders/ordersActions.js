// ============================================================================
// 🗺️ خريطة مسارات الطلبات (Orders Actions Router) - النسخة الماسية V15.2 💎
// ============================================================================

import { OrdersController } from './ordersController.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { OrdersRender } from './ordersRender.js';

export const OrdersActions = {
    'ignore-click': () => {},
    'open-order-drawer': (data) => AdminUI?.OrdersUI?.openOrderDrawer?.(data.id),
       
    'submit-order': (data) => OrdersController.submitOrderAction?.(data.type, data.id),
    'request-order-refund': (data) => OrdersController.requestOrderRefund?.(data.id),
    
    // 🚀 [المحرك الجديد]: رفض كافة الطلبات المعلقة بأمان
    'reject-all-pending': () => OrdersController.rejectAllPendingOrders?.(),
    
    'load-more-orders': () => AdminRender?.loadMoreOrders?.(),
    'filter-orders': (data) => AdminRender?.filterByTab?.('orders', data.val, data.element),
    
    'filter-orders-source': (data) => OrdersRender?.filterBySource?.(data.val),
    
    'nav-to-user-orders': (data) => OrdersController.navToUserOrders?.(data.id)
};