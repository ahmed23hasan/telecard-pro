// ============================================================================
// 🧠 متحكم الطلبات (modules/orders/ordersController.js) - النسخة الماسية V16.0 💎
// 🎯 الوظيفة: معالجة قرارات الطلبات (قبول، رفض، استرجاع، رفض جماعي) والربط السحابي.
// 🚀 التحديث (V16.0 - Live Tab Counter Sync & Cloud User-Orders Navigation):
// 1. Live Tab Counter Sync 📊: تحديث عدادات التبويبات لحظياً عند تغيير حالة الطلب دون تصفيرها.
// 2. Cloud User-Orders Search 🔍: ربط navToUserOrders بالبحث السحابي المباشر لجلب كافة طلبات العميل.
// 3. Supplier & API Bulk-Reject Shield 🛡️: استثناء طلبات الموردين والـ API من الرفض الجماعي العشوائي.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';
import { AdminRender } from '../../adminRender.js';
import { OrdersRender } from './ordersRender.js';

export const OrdersController = {
    
    _actionLocks: new Set(),
    
    submitOrderAction: async function(action, orderId) {
    if (this._actionLocks.has(orderId)) return;
    
    const o = AdminData.data.ordersMap?.[orderId] || (AdminData.data.orders || []).find(x => String(x.id) === String(orderId));
    if (!o) return;
    
    this._actionLocks.add(orderId);
    const previousStatus = o.status || 'pending';
    
    try {
        const note = Utils.getVal('order-modal-note');
        const rawManualCode = Utils.getVal('order-modal-delivered-code').trim();
        const manualCode = rawManualCode !== '' ? rawManualCode : null;
        
        let mappedAction = 'completed';
        if (action === 'reject') mappedAction = 'rejected';
        if (action === 'refund') mappedAction = 'refunded';
        
        const exactPrice = Number(o.priceLocalDeducted ?? o.price ?? 0);
        const priceVal = exactPrice.toFixed(2);
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
            adminNote: note,
            ...(mappedAction === 'completed' && manualCode ? { deliveredCode: manualCode } : {})
        });
        
        if (result && result.success) {
            const preservedSnapshot = o.pricingSnapshot ? { ...o.pricingSnapshot } : null;
            const freshOrder = await FirebaseAdapter.getById('telecard_orders', String(o.id));
            if (freshOrder) {
                Object.assign(o, freshOrder);
                if (preservedSnapshot) {
                    o.pricingSnapshot = { ...preservedSnapshot, ...(freshOrder.pricingSnapshot || {}) };
                }
            } else {
                o.status = mappedAction;
            }
            
            if (OrdersRender?.adjustTabCountersOnStatusChange) {
                OrdersRender.adjustTabCountersOnStatusChange(previousStatus, o.status);
            }
            
            if (AdminUI?.closeOrderDrawer) AdminUI.closeOrderDrawer();
            
            if (AdminRender?.decrementLocalBadge && (previousStatus === 'pending' || previousStatus === 'processing') && (o.status === 'completed' || o.status === 'rejected')) {
                AdminRender.decrementLocalBadge('order');
            }
            
            // 🔗 تحديث عداد الأكواد التالفة في ذاكرة الخزنة إذا تم استرجاع طلب مكتمل مرتبط بخزنة
            if (o.vaultPoolId && previousStatus === 'completed' && ['rejected', 'refunded', 'returned'].includes(o.status)) {
                const targetPool = AdminData.data.vaultMap?.[String(o.vaultPoolId)] || (AdminData.data.vault || []).find(v => String(v.id) === String(o.vaultPoolId));
                if (targetPool) {
                    const orderQty = Number(o.qty || 1);
                    targetPool.burnedCount = Number(targetPool.burnedCount || 0) + orderQty;
                }
            }
            
            EventBus.emit('req-render-orders');
            
            const cachedUser = AdminData.data.usersMap?.[String(o.userId)];
            if (cachedUser && ['rejected', 'refunded', 'returned'].includes(o.status) && !['rejected', 'refunded', 'returned'].includes(previousStatus)) {
                cachedUser.walletBalance = Number((Number(cachedUser.walletBalance || 0) + exactPrice).toFixed(4));
            }
            
            const modalDetail = document.getElementById('m-user-detail');
            const editBtn = modalDetail?.classList.contains('active') ?
                modalDetail.querySelector(`.ud-header-clean [data-action="open-user-edit"][data-id="${o.userId}"]`) :
                null;
            if (editBtn) {
                const updatedUser = await FirebaseAdapter.getById('telecard_users', String(o.userId));
                if (updatedUser && AdminData.data.usersMap) {
                    AdminData.data.usersMap[String(o.userId)] = updatedUser;
                }
                EventBus.emit('action-triggered', { action: 'view-user', id: o.userId, preventModalOpen: true });
            }
            
            const finalToastMsg = (result.message && (result.message.includes('إنقاذ الطلب') || result.message.includes('تم التحقق من المورد'))) ? result.message : customMessage;
            if (AdminData?.addLog) {
                const logName = o.userDataSnapshot?.fullName || o.userName || o.userId;
                AdminData.addLog(`ORDER_${String(o.status || mappedAction).toUpperCase()}`, `${finalToastMsg} للعميل ${logName}`);
            }
            
            AdminUI?.showToast?.(finalToastMsg, 'success', 4500);
        } else {
            throw new Error(result?.message || 'رفض السيرفر العملية');
        }
        
    } catch (error) {
        console.error("Order Processing Error:", error);
        const isSupplierWarn = String(error.message || '').includes('تنبيه للإدمن');
        AdminUI?.showToast?.(isSupplierWarn ? error.message : `فشل السيرفر: ${error.message}`, isSupplierWarn ? 'warning' : 'error', isSupplierWarn ? 8000 : 4000);
    } finally {
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        this._actionLocks.delete(orderId);
    }
},    rejectAllPendingOrders: async function() {
        if (this._actionLocks.has('bulk-reject')) return;
        
        const allPending = (AdminData.data.orders || []).filter(o => o.status === 'pending' || o.status === 'processing');
        
        if (allPending.length === 0) {
            return EventBus.emit('req-show-toast', { message: 'لا توجد طلبات معلقة لرفضها.', type: 'info' });
        }
        
        // 🛡️ عزل طلبات الـ API والموردين لمنع رفضها جماعياً دون فحص المورد
        const manualPending = allPending.filter(o => !(o.isApi === true || o.source === 'api' || o.supplierId || o.isPendingSupplierCheck === true));
        const excludedCount = allPending.length - manualPending.length;
        
        if (manualPending.length === 0) {
            return EventBus.emit('req-show-toast', { message: 'الطلبات المعلقة الحالية تابعة للموردين أو الـ API. لا يمكن رفضها جماعياً لحمايتك المالية.', type: 'warning' });
        }
        
        let confirmMsg = `هل أنت متأكد من رفض (${manualPending.length}) طلباً يدوياً معلقاً وإعادة الأموال والمخزون لعملائك دفعة واحدة؟`;
        if (excludedCount > 0) {
            confirmMsg += `\n\n⚠️ ملاحظة حماية: تم استبعاد (${excludedCount}) طلب مرتبط بمورد أو API لمنع خسارتك. يجب مراجعتها فردياً.`;
        }
        
        if (AdminUI && await AdminUI.showConfirm(confirmMsg, 'الرفض الجماعي للطلبات')) {
            this._actionLocks.add('bulk-reject');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري إرسال حزمة الرفض للسيرفر ليعالجها دفعة واحدة...');
            
            try {
                const targetOrderIds = manualPending.map(o => String(o.id));
                
                const res = await FirebaseAdapter.callFunction('adminBulkRejectOrders', {
                    orderIds: targetOrderIds
                });
                
                if (res && res.success) {
                    const processedCount = res.processedCount || 0;
                    const affectedUserIds = res.affectedUserIds || [];
                    
                    manualPending.forEach(o => {
                        const prevSt = o.status || 'pending';
                        o.status = 'rejected';
                        if (OrdersRender?.adjustTabCountersOnStatusChange) {
                            OrdersRender.adjustTabCountersOnStatusChange(prevSt, 'rejected');
                        }
                    });
                    EventBus.emit('req-render-orders');
                    
                    if (AdminRender?.updateBadges) {
                        AdminRender.updateBadges(true);
                    }
                    
                    if (affectedUserIds.length > 0) {
                        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تحديث أرصدة العملاء المتأثرين محلياً...');
                        
                        const CHUNK_SIZE = 20;
                        for (let i = 0; i < affectedUserIds.length; i += CHUNK_SIZE) {
                            const chunk = affectedUserIds.slice(i, i + CHUNK_SIZE);
                            const userFetchPromises = chunk.map(uid => FirebaseAdapter.getById('telecard_users', uid));
                            
                            const updatedUsers = await Promise.allSettled(userFetchPromises);
                            
                            updatedUsers.forEach(result => {
                                if (result.status === 'fulfilled' && result.value && AdminData.data.usersMap) {
                                    AdminData.data.usersMap[String(result.value.id)] = result.value;
                                }
                            });
                        }
                        
                        const modalDetail = document.getElementById('m-user-detail');
                        if (modalDetail && modalDetail.classList.contains('active')) {
                            affectedUserIds.forEach(uid => {
                                const editBtn = document.querySelector(`.ud-header-clean [data-action="open-user-edit"][data-id="${uid}"]`);
                                if (editBtn) {
                                    EventBus.emit('action-triggered', { action: 'view-user', id: uid, preventModalOpen: true });
                                }
                            });
                        }
                    }
                    
                    if (AdminData?.addLog) {
                        AdminData.addLog('BULK_REJECT', `تم رفض ${processedCount} طلب يدوياً بنجاح عبر أداة الرفض الجماعي سحابياً.`);
                    }
                    
                    EventBus.emit('req-show-toast', { message: `تم رفض ${processedCount} طلب وإعادة الأموال والمخزون بنجاح!`, type: 'success' });
                } else {
                    throw new Error(res?.message || "لم يستجب السيرفر بشكل صحيح.");
                }
                
            } catch (error) {
                console.error("Bulk Reject Error:", error);
                EventBus.emit('req-show-toast', { message: `حدث خطأ غير متوقع: ${error.message}`, type: 'error' });
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
        const targetUid = String(userId || '').trim();
        if (AdminUI?.closeModal) AdminUI.closeModal();
        EventBus.emit('req-navigate', { page: 'orders', btnEl: null });
        
        setTimeout(() => {
            const currentFilters = AdminData.filters || {};
            if (!currentFilters.orders) currentFilters.orders = { search: '', start: null, end: null };
            currentFilters.orders.search = targetUid;
            EventBus.emit('req-update-state', { filters: currentFilters });

            const searchInput = document.getElementById('search-orders');
            if (searchInput) searchInput.value = targetUid;
            if (OrdersRender?.triggerCloudFilterReload) {
                OrdersRender.triggerCloudFilterReload();
            }
        }, 150);
    }
};
