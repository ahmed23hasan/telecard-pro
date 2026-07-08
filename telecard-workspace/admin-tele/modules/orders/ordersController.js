// ============================================================================
// 🧠 متحكم الطلبات (modules/orders/ordersController.js) - النسخة الماسية V4.3 💎
// 🎯 الوظيفة: معالجة الطلبات، استرجاع الأموال، وإدارة واجهة الطلبات بصرامة
// 🚀 التحديث الأقصى: ترقية سرعة جلب الطلب إلى O(1) باستخدام الخريطة المركزية
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { Utils, EventBus } from '../../adminUtils.js';

import { FirebaseAdapter } from '../../core/firebaseAdapter.js';
import { FinancialEngine } from '../../core/financialEngine.js';

export const OrdersController = {
  
  _isProcessing: false,
  
  submitOrderAction: async function(action, orderId) {
    if (this._isProcessing) return;
    
    // ⚡ التحديث الفائق: جلب الطلب بـ O(1) من الخريطة مباشرة مع fallback آمن
    const o = AdminData.data.ordersMap?.[orderId] || AdminData.data.orders.find(x => String(x.id) === String(orderId));
    if (!o) return;
    
    this._isProcessing = true;
    
    try {
      const note = Utils.escapeHTML(Utils.getVal('order-modal-note'));
      
      let mappedAction = 'completed';
      if (action === 'reject') mappedAction = 'rejected';
      if (action === 'refund') mappedAction = 'refunded';
      
      const priceVal = Number(o.price || 0).toFixed(2);
      const prodName = o.product || 'المنتج';
      
      let customMessage = '';
      if (mappedAction === 'completed') {
        customMessage = `تم قبول طلب شراء (${prodName}) بقيمة ${priceVal}$`;
      } else if (mappedAction === 'rejected') {
        customMessage = `تم رفض طلب (${prodName}) وإعادة ${priceVal}$ للمحفظة`;
      } else if (mappedAction === 'refunded') {
        customMessage = `تم استرجاع طلب (${prodName}) وإعادة ${priceVal}$ للمحفظة`;
      }
      
      if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري توثيق الطلب سحابياً...');
      
      const result = await FirebaseAdapter.callFunction('adminProcessOrder', {
        orderId: String(o.id),
        action: mappedAction,
        adminNote: note
      });
      
      if (result && result.success) {
        o.status = mappedAction;
        
        if (AdminUI?.OrdersUI?.closeOrderDrawer) AdminUI.OrdersUI.closeOrderDrawer();
        else if (AdminUI?.closeOrderDrawer) AdminUI.closeOrderDrawer();
        
        EventBus.emit('req-render-orders');
        
        if (AdminData?.addLog) {
          AdminData.addLog(`ORDER_${mappedAction.toUpperCase()}`, `${customMessage} للعميل ${o.userName || o.userId}`);
        }
        
        EventBus.emit('req-show-toast', { message: customMessage, type: 'success' });
      }
      
    } catch (error) {
      console.error("Order Processing Error:", error);
      EventBus.emit('req-show-toast', { message: `فشل السيرفر: ${error.message}`, type: 'error' });
      
    } finally {
      if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
      this._isProcessing = false;
    }
  },
  
  requestOrderRefund: async function(id) {
    if (AdminUI && await AdminUI.showConfirm('هذا الطلب تم قبوله بالفعل، هل أنت متأكد من إجراء عملية استرجاع وإلغاء الطلب وإعادة المال لمحفظة العميل؟')) {
      await this.submitOrderAction('refund', id);
    }
  },
  
  navToUserOrders: function(userId) {
    if (!AdminData.filters.orders) AdminData.filters.orders = {};
    AdminData.filters.orders.search = userId;
    
    // 🛡️ التحديث المعماري: كسر الارتباط الدائري الميت عبر إطلاق حدث ملاحة سحابي بدلاً من استدعاء الكنترولر مباشرة
    EventBus.emit('req-navigate', { page: 'orders', btnEl: null });
    
    if (AdminUI?.closeModal) AdminUI.closeModal();
  }
};