import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';
import { FinancialEngine } from '../../core/financialEngine.js';
// 🚀 [التحديث المعماري]: استيراد محرك الرسم للوصول للشارات الوهمية
import { AdminRender } from '../../adminRender.js'; 

export const OrdersController = {
    
    _actionLocks: new Set(),
    
        submitOrderAction: async function(action, orderId) {
        if (this._actionLocks.has(orderId)) return;
        
        const o = AdminData.data.ordersMap?.[orderId] || AdminData.data.orders.find(x => String(x.id) === String(orderId));
        if (!o) return;
        
        this._actionLocks.add(orderId);
        
        try {
            const note = Utils.escapeHTML(Utils.getVal('order-modal-note'));
            
            let mappedAction = 'completed';
            if (action === 'reject') mappedAction = 'rejected';
            if (action === 'refund') mappedAction = 'refunded';
            
            const priceVal = Number(o.price || 0).toFixed(2);
            const prodName = o.product || 'المنتج';
            const cCode = (o.priceCurrency || 'USD').toUpperCase().replace('$', 'USD');
            
            let customMessage = '';
            if (mappedAction === 'completed') {
                customMessage = `تم قبول طلب شراء (${prodName}) بقيمة ${priceVal} ${cCode}`;
            } else if (mappedAction === 'rejected') {
                customMessage = `تم رفض طلب (${prodName}) وإعادة ${priceVal} ${cCode} للمحفظة`;
            } else if (mappedAction === 'refunded') {
                customMessage = `تم استرجاع طلب (${prodName}) وإعادة ${priceVal} ${cCode} للمحفظة`;
            }
            
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري توثيق الطلب سحابياً...');
            
            const result = await FirebaseAdapter.callFunction('adminProcessOrder', {
                orderId: String(o.id),
                action: mappedAction,
                adminNote: note
            });
            
            if (result && result.success) {
                
                const freshOrder = await FirebaseAdapter.getById('telecard_orders', String(o.id));
                if (freshOrder) {
                    Object.assign(o, freshOrder);
                } else {
                    o.status = mappedAction;
                }
                
                // 🚀 1. التوجيه المباشر للإغلاق (Facade Pattern)
                if (AdminUI?.closeOrderDrawer) AdminUI.closeOrderDrawer();
                
                // 🚀 2. إنقاص العداد الأحمر محلياً لراحة الإدارة (Optimistic UI)
                if (AdminRender?.decrementLocalBadge && (mappedAction === 'completed' || mappedAction === 'rejected')) {
                    AdminRender.decrementLocalBadge('order');
                }

                // 🚀 3. الاعتماد المطلق على السيرفر (Server-Side Truth)
                // تم إزالة الحسابات اليدوية (safeAdd/safeSub) واستبدالها بجلب أرصدة العملاء الحقيقية
                EventBus.emit('req-render-orders');
                EventBus.emit('req-refresh', { type: 'users' });
                
                // 🚀 4. تحديث نافذة العميل الشاملة لحظياً (Omnipresent UI Sync)
                // لكي يرى المدير الرصيد الجديد مباشرة إذا كان يراجع الطلب من داخل ملف العميل
                setTimeout(() => {
                    const modalDetail = document.getElementById('m-user-detail');
                    if (modalDetail && modalDetail.classList.contains('active')) {
                        const currentEditedUserId = AdminRender?.UsersRender?.state?.currentEditUserId;
                        if (currentEditedUserId === o.userId) {
                            EventBus.emit('action-triggered', { action: 'view-user', id: o.userId, preventModalOpen: true });
                        }
                    }
                }, 500);
                
                if (AdminData?.addLog) {
                    const logName = o.userDataSnapshot?.fullName || o.userName || o.userId;
                    AdminData.addLog(`ORDER_${mappedAction.toUpperCase()}`, `${customMessage} للعميل ${logName}`);
                }
                
                EventBus.emit('req-show-toast', { message: customMessage, type: 'success' });
            } else {
                throw new Error(result?.message || 'رفض السيرفر العملية');
            }
            
        } catch (error) {
            console.error("Order Processing Error:", error);
            EventBus.emit('req-show-toast', { message: `فشل السيرفر: ${error.message}`, type: 'error' });
            
        } finally {
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            this._actionLocks.delete(orderId);
        }
    },
    rejectAllPendingOrders: async function() {
        if (this._actionLocks.has('bulk-reject')) return;
        
        const allPending = (AdminData.data.orders || []).filter(o => o.status === 'pending');
        
        if (allPending.length === 0) {
            return EventBus.emit('req-show-toast', { message: 'لا توجد طلبات معلقة لرفضها.', type: 'info' });
        }
        
        const manualPending = allPending.filter(o => !(o.isApi === true || o.source === 'api'));
        const apiPendingCount = allPending.length - manualPending.length;
        
        if (manualPending.length === 0) {
            return EventBus.emit('req-show-toast', { message: 'الطلبات المعلقة الحالية تابعة للـ API. لا يمكن رفضها جماعياً لحمايتك المالية.', type: 'warning' });
        }
        
        let confirmMsg = `هل أنت متأكد من رفض (${manualPending.length}) طلباً يدوياً معلقاً وإعادة الأموال لعملائك دفعة واحدة؟`;
        if (apiPendingCount > 0) {
            confirmMsg += `\n\n⚠️ ملاحظة حماية: تم استبعاد (${apiPendingCount}) طلب API معلق لمنع خسارتك. يجب مراجعتها يدوياً.`;
        }
        
        if (AdminUI && await AdminUI.showConfirm(confirmMsg, 'الرفض الجماعي للطلبات')) {
            this._actionLocks.add('bulk-reject');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري معالجة الرفض الجماعي سحابياً...');
            
            let successCount = 0;
            let failCount = 0;
            
            try {
                // 🚀 [التحديث المعماري]: المعالجة التسلسلية (Sequential) لمنع حظر المتصفح لطلبات الـ HTTP
                for (const order of manualPending) {
                    try {
                        const res = await FirebaseAdapter.callFunction('adminProcessOrder', {
                            orderId: String(order.id),
                            action: 'rejected',
                            adminNote: 'تم الرفض إدارياً من قبل النظام (رفض جماعي)'
                        });
                        
                        if (res && res.success) {
                            order.status = 'rejected';
                            successCount++;
                            // إنقاص العداد الوهمي لكل طلب ينجح
                            if (AdminRender?.decrementLocalBadge) AdminRender.decrementLocalBadge('order');
                        } else {
                            failCount++;
                        }
                    } catch (err) {
                        failCount++;
                    }
                }
                
                EventBus.emit('req-render-orders');
                EventBus.emit('req-refresh', { type: 'users' });
                
                if (AdminData?.addLog) {
                    AdminData.addLog('BULK_REJECT', `تم رفض ${successCount} طلب يدوياً بنجاح عبر أداة الرفض الجماعي.`);
                }
                
                if (failCount === 0) {
                    EventBus.emit('req-show-toast', { message: `تم رفض ${successCount} طلب وإعادة الأموال بنجاح!`, type: 'success' });
                } else {
                    EventBus.emit('req-show-toast', { message: `تم رفض ${successCount} طلب، وفشل ${failCount} طلب.`, type: 'warning' });
                }
                
            } catch (error) {
                console.error("Bulk Reject Error:", error);
                EventBus.emit('req-show-toast', { message: 'حدث خطأ غير متوقع أثناء الرفض الجماعي.', type: 'error' });
            } finally {
                if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
                this._actionLocks.delete('bulk-reject');
            }
        }
    },
    
    requestOrderRefund: async function(id) {
        if (AdminUI && await AdminUI.showConfirm('هذا الطلب تم قبوله بالفعل، هل أنت متأكد من إجراء عملية استرجاع وإلغاء الطلب وإعادة المال لمحفظة العميل؟')) {
            await this.submitOrderAction('refund', id);
        }
    },
    
    navToUserOrders: function(userId) {
        const currentFilters = AdminData.filters || {};
        if (!currentFilters.orders) currentFilters.orders = {};
        currentFilters.orders.search = userId;
        
        EventBus.emit('req-update-state', { filters: currentFilters });
        
        setTimeout(() => {
            const searchInput = document.getElementById('search-orders');
            if (searchInput) searchInput.value = userId;
        }, 150);
        
        EventBus.emit('req-navigate', { page: 'orders', btnEl: null });
        
        if (AdminUI?.closeModal) AdminUI.closeModal();
    }
};
