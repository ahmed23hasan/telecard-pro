// ============================================================================
// 🧠 متحكم الطلبات (modules/orders/ordersController.js)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { AppController } from '../../core/appController.js';

export const OrdersController = {
  
  // 🛡️ قفل برمجي لمنع النقر المزدوج (Race Condition)
  _isProcessing: false,

  submitOrderAction: async function(action, orderId) {
    // 1. التحقق من القفل لمنع تكرار العملية
    if (this._isProcessing) return;
    
    const o = AdminData.data.orders.find(x => String(x.id) === String(orderId));
    if (!o) return;

    // 2. تفعيل القفل وإظهار شاشة التحميل
    this._isProcessing = true;
    EventBus.emit('req-show-loader', true);

    try {
        const note = Utils.escapeHTML(Utils.getVal('order-modal-note'));
        const user = AdminData.data.users.find(u => String(u.id) === String(o.userId));
        const prevStatus = o.status;
        
        o.actionTime = Date.now();
        o.updatedAt = Date.now();
        
        const exactPriceUsd = Number(o.baseUsd || o.price || 0);
        let profit = 0;
        
        if (o.pricingSnapshot) {
          profit = Number(o.pricingSnapshot.netProfitUsd || o.pricingSnapshot.profit || 0);
        } else {
          profit = exactPriceUsd - (Number(o.costPrice || o.unitCost || 0) * Number(o.qty || 1));
        }
        
        const orderDateObj = new Date(o.time || o.date || Date.now());
        const dayKey = `${orderDateObj.getFullYear()}-${String(orderDateObj.getMonth()+1).padStart(2,'0')}-${String(orderDateObj.getDate()).padStart(2,'0')}`;
        const monthKey = `${orderDateObj.getFullYear()}-${String(orderDateObj.getMonth() + 1).padStart(2, '0')}`;
        
        if (action === 'accept') {
          o.status = 'completed';
          
          if (AdminData.data.system && AdminData.data.system.globalStats) {
            const gs = AdminData.data.system.globalStats;
            gs.orders.completed++;
            gs.orders.revenue += exactPriceUsd;
            gs.orders.profit += profit;
            
            if (!gs.daily[dayKey]) gs.daily[dayKey] = { revenue: 0, profit: 0 };
            gs.daily[dayKey].revenue += exactPriceUsd;
            gs.daily[dayKey].profit += profit;
          }
          
          if (user) {
            user.totalSpent = (Number(user.totalSpent) || 0) + exactPriceUsd;
            user.totalOrdersCount = (Number(user.totalOrdersCount) || 0) + 1;
            user.tierCycleSpent = (Number(user.tierCycleSpent) || 0) + exactPriceUsd;
            
            if (!user.monthlySpent) user.monthlySpent = {};
            if (!user.monthlyOrders) user.monthlyOrders = {};
            
            user.monthlySpent[monthKey] = (Number(user.monthlySpent[monthKey]) || 0) + exactPriceUsd;
            user.monthlyOrders[monthKey] = (Number(user.monthlyOrders[monthKey]) || 0) + 1;
          }
        }
        else if (action === 'reject' || action === 'refund') {
          o.status = action === 'reject' ? 'rejected' : 'refunded';
          
          if (AdminData.data.system && AdminData.data.system.globalStats) {
            const gs = AdminData.data.system.globalStats;
            if (action === 'reject') gs.orders.rejected++;
            if (action === 'refund') gs.orders.refunded++;
            
            if (action === 'refund' && prevStatus === 'completed') {
              gs.orders.completed = Math.max(0, gs.orders.completed - 1);
              gs.orders.revenue = Math.max(0, gs.orders.revenue - exactPriceUsd);
              gs.orders.profit -= profit;
              
              if (gs.daily[dayKey]) {
                gs.daily[dayKey].revenue = Math.max(0, gs.daily[dayKey].revenue - exactPriceUsd);
                gs.daily[dayKey].profit -= profit;
              }
            }
          }
          
          if (user) {
            user.walletBalance = (Number(user.walletBalance) || 0) + exactPriceUsd;
            user.balance = user.walletBalance;
            
            if (action === 'refund' && prevStatus === 'completed') {
              user.totalSpent = Math.max(0, (Number(user.totalSpent) || 0) - exactPriceUsd);
              user.totalOrdersCount = Math.max(0, (Number(user.totalOrdersCount) || 0) - 1);
              user.tierCycleSpent = Math.max(0, (Number(user.tierCycleSpent) || 0) - exactPriceUsd);
              
              if (user.monthlySpent && user.monthlySpent[monthKey])
                user.monthlySpent[monthKey] = Math.max(0, user.monthlySpent[monthKey] - exactPriceUsd);
              if (user.monthlyOrders && user.monthlyOrders[monthKey])
                user.monthlyOrders[monthKey] = Math.max(0, user.monthlyOrders[monthKey] - 1);
            }
          }
          
          if (o.couponCode) {
            const coupon = (AdminData.data.coupons || []).find(c => c.code === o.couponCode);
            if (coupon && coupon.usedCount > 0) coupon.usedCount -= 1;
            await AdminData?.saveCoupons?.();
          }
          
          if (o.deliveredCode) {
            const prod = (AdminData.data.prods || []).find(p => String(p.id) === String(o.prodId));
            if (prod && prod.vaultPoolId) {
              const pool = (AdminData.data.vault || []).find(v => String(v.id) === String(prod.vaultPoolId));
              if (pool && pool.codes) {
                const deliveredTexts = Array.isArray(o.deliveredCode) ?
                  o.deliveredCode.map(c => typeof c === 'object' ? c.text : c) :
                  [(typeof o.deliveredCode === 'object' ? o.deliveredCode.text : o.deliveredCode)];
                
                deliveredTexts.forEach(dText => {
                  const codeObj = pool.codes.find(c => c.text === dText && c.status === 'sold');
                  if (codeObj) {
                    codeObj.status = 'defective';
                    codeObj.refundedAt = Date.now();
                  }
                });
                await AdminData?.saveVault?.();
              }
            }
          }
        }
        
        o.response = note;
        o.adminNote = note;
        
        if (user) {
          let notifTitle = action === 'accept' ? 'اكتمل طلبك بنجاح ✅' : (action === 'reject' ? 'تم رفض الطلب ❌' : 'تم استرجاع الطلب 🔄');
          let notifMsg = '';
          
          if (action === 'accept') notifMsg = `تم تسليم طلبك لـ "${o.product}". انقر لعرض التفاصيل.`;
          else if (action === 'reject') notifMsg = `تم رفض طلبك لـ "${o.product}". ${note ? 'السبب: ' + note : 'انقر لمعرفة التفاصيل.'}`;
          else if (action === 'refund') notifMsg = `تم استرجاع طلبك لـ "${o.product}" وإعادة المبلغ لمحفظتك.`;
          
          const autoAlert = {
            id: 'sys_ord_' + Date.now(),
            title: notifTitle,
            message: notifMsg,
            createdAt: Date.now(),
            type: 'notification',
            targetType: 'user',
            targetId: user.id,
            jumpTarget: 'order',
            jumpId: o.id
          };
          user.inbox = user.inbox || [];
          user.inbox.push(autoAlert);
        }
        
        await AdminData?.saveOrders?.();
        if (user) await AdminData?.saveUsers?.();
        await AdminData?.saveSystemSettings?.();
        
        AdminUI?.OrdersUI?.closeOrderDrawer?.();
        
        let successMsg = action === 'accept' ? 'تم قبول الطلب بنجاح' : (action === 'reject' ? 'تم رفض الطلب' : 'تم استرجاع الطلب وإعادة المال، وتصنيف الأكواد كتالفة');
        AppController.finishAction('req-render-orders', null, `ORDER_${action.toUpperCase()}`, `الطلب رقم #${o.id} للعميل ${o.userName} - ${action === 'accept' ? 'تم القبول' : (action === 'reject' ? 'تم الرفض' : 'تم الاسترجاع')}`, successMsg);

    } catch (error) {
        console.error("Error processing order:", error);
        EventBus.emit('req-show-toast', { message: 'حدث خطأ أثناء معالجة الطلب', type: 'error' });
    } finally {
        // 3. فك القفل البرمجي وإخفاء التحميل مهما كانت النتيجة
        this._isProcessing = false;
        EventBus.emit('req-show-loader', false);
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
