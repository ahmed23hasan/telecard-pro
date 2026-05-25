// ============================================================================
// 🧠 متحكم الطلبات (modules/orders/ordersController.js) - Cloud Secured ☁️
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';

// 🌟 استيراد أدوات الاتصال بالسحابة
import { getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

export const OrdersController = {
  
  // 🛡️ قفل برمجي لمنع النقر المزدوج (Race Condition)
  _isProcessing: false,

  submitOrderAction: async function(action, orderId) {
    // 1. التحقق من القفل لمنع تكرار العملية
    if (this._isProcessing) return;
    
    const o = AdminData.data.orders.find(x => String(x.id) === String(orderId));
    if (!o) return;

    // 2. تفعيل القفل وإظهار شاشة التحميل السحابية
    this._isProcessing = true;
    if (AdminUI && AdminUI.toggleLoader) AdminUI.toggleLoader(true, 'جاري معالجة الطلب سحابياً...');

    try {
        const note = Utils.escapeHTML(Utils.getVal('order-modal-note'));
        
        // 🌟 توحيد الحالات بين الواجهة الأمامية وقواعد البيانات
        let mappedAction = 'completed';
        if (action === 'reject') mappedAction = 'rejected';
        if (action === 'refund') mappedAction = 'refunded';

        // 🚀 توجيه الأمر للسيرفر للتكفل بالخصم والإرجاع وحفظ السجلات
        const app = getApp();
        const functions = getFunctions(app);
        const processOrderFn = httpsCallable(functions, 'adminProcessOrder');

        const result = await processOrderFn({
            orderId: String(o.id),
            action: mappedAction,
            adminNote: note
        });

        // 🌟 الإصلاح الجذري (Optimistic Update): تحديث الحالة محلياً في الذاكرة فوراً
        o.status = mappedAction;

        // 3. إنهاء العملية وتحديث الواجهة بعد نجاح السيرفر
        if (AdminUI && AdminUI.toggleLoader) AdminUI.toggleLoader(false);
        AdminUI?.OrdersUI?.closeOrderDrawer?.();
        
        let successMsg = action === 'accept' ? 'تم قبول الطلب بنجاح' : (action === 'reject' ? 'تم رفض الطلب وإرجاع الرصيد' : 'تم استرجاع الطلب وإعادة المال');
        
        AppController.finishAction(
            'req-render-orders', 
            null, 
            `ORDER_${mappedAction.toUpperCase()}`, 
            `الطلب رقم #${o.id} للعميل ${o.userName} - ${action === 'accept' ? 'تم القبول' : (action === 'reject' ? 'تم الرفض' : 'تم الاسترجاع')}`, 
            result.data.message || successMsg
        );

    } catch (error) {
        console.error("Cloud Function Error:", error);
        if (AdminUI && AdminUI.toggleLoader) AdminUI.toggleLoader(false);
        EventBus.emit('req-show-toast', { message: error.message || 'حدث خطأ أثناء معالجة الطلب سحابياً', type: 'error' });
    } finally {
        // 4. فك القفل البرمجي دائماً
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
