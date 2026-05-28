// ============================================================================
// 🧠 متحكم الطلبات (modules/orders/ordersController.js) - Cloud Secured ☁️
// 🌟 التحديث: التحديث المتفائل (Optimistic UI) + توجيه (US-EAST1) أسوة بالنظام المالي
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';

import { getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

export const OrdersController = {
  
  // 🛡️ قفل برمجي لمنع النقر المزدوج السريع جداً
  _isProcessing: false,

  submitOrderAction: async function(action, orderId) {
    if (this._isProcessing) return;
    
    const o = AdminData.data.orders.find(x => String(x.id) === String(orderId));
    if (!o) return;

    this._isProcessing = true;

    try {
        const note = Utils.escapeHTML(Utils.getVal('order-modal-note'));
        
        let mappedAction = 'completed';
        if (action === 'reject') mappedAction = 'rejected';
        if (action === 'refund') mappedAction = 'refunded';

        // 🌟 1. التحديث المتفائل (Optimistic UI) - استجابة في 0 ثانية
        const oldStatus = o.status;
        o.status = mappedAction;

        // إغلاق الدرج وتحديث الشاشة فوراً
        if (AdminUI?.OrdersUI?.closeOrderDrawer) AdminUI.OrdersUI.closeOrderDrawer();
        else if (AdminUI?.closeOrderDrawer) AdminUI.closeOrderDrawer(); // Fallback
        
        EventBus.emit('req-render-orders');
        EventBus.emit('req-show-toast', { message: 'جاري تسجيل حالة الطلب سحابياً (US-East1)...', type: 'info' });

        // 🚀 2. توجيه الأمر للسيرفر السريع في الخلفية
        const app = getApp();
        const functions = getFunctions(app, 'us-east1');
        const processOrderFn = httpsCallable(functions, 'adminProcessOrder');

        const result = await processOrderFn({
            orderId: String(o.id),
            action: mappedAction,
            adminNote: note
        });

        // 🌟 3. تسجيل النشاط وإشعار النجاح بعد انتهاء السيرفر بصمت
        let successMsg = action === 'accept' ? 'تم قبول الطلب بنجاح' : (action === 'reject' ? 'تم رفض الطلب وإرجاع الرصيد' : 'تم استرجاع الطلب وإعادة المال');
        
        if (AdminData?.addLog) {
            AdminData.addLog(`ORDER_${mappedAction.toUpperCase()}`, `الطلب رقم #${o.id} للعميل ${o.userName || o.userId} - ${action === 'accept' ? 'تم القبول' : (action === 'reject' ? 'تم الرفض' : 'تم الاسترجاع')}`);
        }

        EventBus.emit('req-show-toast', { message: result.data?.message || successMsg, type: 'success' });

    } catch (error) {
        console.error("Cloud Function Error:", error);
        
        // 🌟 4. التراجع (Rollback) في حال فشل السيرفر لضمان موثوقية الواجهة
        o.status = oldStatus;
        EventBus.emit('req-render-orders');
        EventBus.emit('req-show-toast', { message: error.message || 'حدث خطأ أثناء معالجة الطلب سحابياً. تم التراجع.', type: 'error' });
        
    } finally {
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
    AppController.nav('orders');
    AdminUI?.closeModal?.();
  }
};
