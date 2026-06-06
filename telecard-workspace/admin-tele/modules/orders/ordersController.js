// ============================================================================
// 🧠 متحكم الطلبات (modules/orders/ordersController.js) - Bank Grade 🏦
// 🎯 الوظيفة: معالجة الطلبات، استرجاع الأموال، وإدارة واجهة الطلبات بصرامة
// 🌟 التحديث: أمان مالي (Pessimistic UI) + إشعار نهائي واحد مخصص ودقيق بالأسعار
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';
// 🌟 استيراد البوابة الآمنة الموحدة
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

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
      
      // 🌟 1. تجهيز تفاصيل الرسالة الدقيقة (المبلغ واسم المنتج)
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
      
      // 🌟 2. تشغيل شاشة التحميل الاحترافية للأمان المالي (تمنع النقر المزدوج)
      if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري توثيق الطلب سحابياً...');
      
      // 🚀 3. توجيه الأمر للسيرفر السريع عبر البوابة المركزية (Adapter)
      const result = await FirebaseAdapter.callFunction('adminProcessOrder', {
        orderId: String(o.id),
        action: mappedAction,
        adminNote: note
      });
      
      if (result && result.success) {
        // 🌟 4. تحديث الذاكرة المحلية والواجهة فقط بعد تأكيد السيرفر
        o.status = mappedAction;
        
        if (AdminUI?.OrdersUI?.closeOrderDrawer) AdminUI.OrdersUI.closeOrderDrawer();
        else if (AdminUI?.closeOrderDrawer) AdminUI.closeOrderDrawer();
        
        EventBus.emit('req-render-orders');
        
        // 5. تسجيل النشاط الدقيق في السجلات
        if (AdminData?.addLog) {
          AdminData.addLog(`ORDER_${mappedAction.toUpperCase()}`, `${customMessage} للعميل ${o.userName || o.userId}`);
        }
        
        // 🌟 6. إشعار النجاح النهائي والوحيد والدقيق!
        EventBus.emit('req-show-toast', { message: customMessage, type: 'success' });
      }
      
    } catch (error) {
      console.error("Order Processing Error:", error);
      // إشعار الخطأ الوحيد في حال فشل السيرفر
      EventBus.emit('req-show-toast', { message: `فشل السيرفر: ${error.message}`, type: 'error' });
      
    } finally {
      // 🌟 7. إخفاء شاشة التحميل وفتح القفل البرمجي دائماً
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
    AppController.nav('orders');
    if (AdminUI?.closeModal) AdminUI.closeModal();
  }
};