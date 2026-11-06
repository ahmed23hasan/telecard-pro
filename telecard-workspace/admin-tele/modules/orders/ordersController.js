// ============================================================================
// 🧠 متحكم الطلبات (modules/orders/ordersController.js) - النسخة الماسية V16.5 💎
// 🎯 الوظيفة: معالجة قرارات الطلبات (قبول، رفض، استرجاع، رفض جماعي) بسلطة السيرفر الكاملة.
// 🌟 التحديثات المعمارية:
// 1. Server-Driven User Sync ☁️: جلب وثيقة العميل المحدثة من السيرفر بدلاً من جمع الرصيد يدوياً في المتصفح.
// 2. Live History Sync 🔄: تحديث حالة الطلب فوراً داخل سجل نافذة العميل المفتوحة (tempUserHistory).
// 3. Zero Wasted Reads ⚡: تحديث العملاء الموجودين في الذاكرة فقط عند الرفض الجماعي.
// 4. Supplier Protection 🛡️: استثناء طلبات الموردين والـ API من الرفض الجماعي لمنع الخسائر المالية.
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
        
        const isAutomatedOrder = Boolean(o.isApi === true || o.source === 'api' || o.supplierId);
        if (action === 'reject') {
            const rejectMsg = isAutomatedOrder ?
                `⚠️ تنبيه هام: هذا الطلب مرتبط بمورد خارجي أو API!\nهل أنت متأكد من رفضه يدوياً وإعادة المبلغ لمحفظة العميل؟` :
                `هل أنت متأكد من رفض هذا الطلب وإعادة المبلغ لمحفظة العميل؟`;
            if (AdminUI && !await AdminUI.showConfirm(rejectMsg, 'تأكيد رفض الطلب')) return;
        } else if (action === 'accept' && isAutomatedOrder) {
            if (AdminUI && !await AdminUI.showConfirm('⚠️ تنبيه: هذا الطلب مرتبط بمورد (API).\nإكماله يدوياً الآن سيتخطى المورد ويعتبر الطلب مكتملاً عند العميل.\n\nهل تريد المتابعة؟', 'تأكيد الإكمال اليدوي')) return;
        }
        
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
                if (AdminData.data.ordersMap) {
                    AdminData.data.ordersMap[String(o.id)] = o;
                }
                
                if (OrdersRender?.adjustTabCountersOnStatusChange) {
                    OrdersRender.adjustTabCountersOnStatusChange(previousStatus, o.status);
                }
                
                if (AdminUI?.closeOrderDrawer) AdminUI.closeOrderDrawer();
                
                if (AdminRender?.decrementLocalBadge && (previousStatus === 'pending' || previousStatus === 'processing') && (o.status === 'completed' || o.status === 'rejected')) {
                    AdminRender.decrementLocalBadge('order');
                }
                
                if (o.vaultPoolId && previousStatus === 'completed' && ['rejected', 'refunded', 'returned'].includes(o.status)) {
                    const targetPool = AdminData.data.vaultMap?.[String(o.vaultPoolId)] || (AdminData.data.vault || []).find(v => String(v.id) === String(o.vaultPoolId));
                    if (targetPool) {
                        const orderQty = Number(o.qty || 1);
                        targetPool.burnedCount = Number(targetPool.burnedCount || 0) + orderQty;
                    }
                }
                
                EventBus.emit('req-render-orders');
                
                const targetUidStr = String(o.userId || '');
                const modalDetail = document.getElementById('m-user-detail');
                const isUserModalOpenForThisUser = Boolean(
                    modalDetail?.classList.contains('active') &&
                    modalDetail.querySelector(`.ud-header-flex [data-action="open-user-edit"][data-id="${targetUidStr}"]`)
                );
                
                if (targetUidStr && (AdminData.data.usersMap?.[targetUidStr] || isUserModalOpenForThisUser)) {
                    const updatedUser = await FirebaseAdapter.getById('telecard_users', targetUidStr);
                    if (updatedUser) {
                        if (!AdminData.data.usersMap) AdminData.data.usersMap = {};
                        AdminData.data.usersMap[targetUidStr] = updatedUser;
                        const uIdx = (AdminData.data.users || []).findIndex(u => String(u.id) === targetUidStr);
                        if (uIdx > -1) AdminData.data.users[uIdx] = updatedUser;
                    }
                }
                
                if (Array.isArray(AdminData.tempUserHistory?.all)) {
                    const histIdx = AdminData.tempUserHistory.all.findIndex(tx => tx.txType === 'order' && String(tx.id) === String(o.id));
                    if (histIdx > -1) {
                        AdminData.tempUserHistory.all[histIdx] = { ...o, txType: 'order' };
                    }
                }
                
                if (isUserModalOpenForThisUser) {
                    EventBus.emit('action-triggered', { action: 'view-user', id: targetUidStr, preventModalOpen: true });
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
    },
    
    rejectAllPendingOrders: async function() {
        if (this._actionLocks.has('bulk-reject')) return;
        
        const allPending = (AdminData.data.orders || []).filter(o => o.status === 'pending' || o.status === 'processing');
        
        if (allPending.length === 0) {
            return EventBus.emit('req-show-toast', { message: 'لا توجد طلبات معلقة لرفضها.', type: 'info' });
        }
        
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
                    
                    const modalDetail = document.getElementById('m-user-detail');
                    const currentOpenUid = AdminRender?.UsersRender?.state?.currentEditUserId;
                    const cachedUidsToRefresh = affectedUserIds.filter(uid =>
                        Boolean(AdminData.data.usersMap?.[String(uid)] || String(uid) === String(currentOpenUid))
                    );
                    
                    if (cachedUidsToRefresh.length > 0) {
                        const CHUNK_SIZE = 20;
                        for (let i = 0; i < cachedUidsToRefresh.length; i += CHUNK_SIZE) {
                            const chunk = cachedUidsToRefresh.slice(i, i + CHUNK_SIZE);
                            const updatedUsers = await Promise.allSettled(
                                chunk.map(uid => FirebaseAdapter.getById('telecard_users', String(uid)))
                            );
                            
                            updatedUsers.forEach(result => {
                                if (result.status === 'fulfilled' && result.value) {
                                    const freshU = result.value;
                                    if (!AdminData.data.usersMap) AdminData.data.usersMap = {};
                                    AdminData.data.usersMap[String(freshU.id)] = freshU;
                                    const uIdx = (AdminData.data.users || []).findIndex(u => String(u.id) === String(freshU.id));
                                    if (uIdx > -1) AdminData.data.users[uIdx] = freshU;
                                }
                            });
                        }
                        
                        if (modalDetail && modalDetail.classList.contains('active') && currentOpenUid && affectedUserIds.map(String).includes(String(currentOpenUid))) {
                            if (AdminRender?.UsersRender?.state) {
                                AdminRender.UsersRender.state._loadedHistoryForUid = null;
                            }
                            EventBus.emit('action-triggered', { action: 'view-user', id: currentOpenUid, preventModalOpen: true });
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
            
            const searchInput = document.getElementById('search-orders');
            if (searchInput) searchInput.value = targetUid;
            
            if (OrdersRender) {
                OrdersRender.filters = { ...currentFilters.orders };
                OrdersRender.triggerCloudFilterReload();
            }
        }, 150);
    }
};