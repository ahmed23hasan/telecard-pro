// ============================================================================
// 📦 واجهة وتفاعلات الطلبات (modules/orders/ordersUI.js) - النسخة الماسية V16.1 💎
// 🎯 الوظيفة: إدارة الدرج الجانبي الجنائي للطلبات وعرض التحليل المالي والتتبع.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { OrdersTemplates } from './ordersTemplates.js'; 
import { Utils, EventBus } from '../../adminUtils.js';
import { UIService } from '../../core/uiService.js'; 
import { RenderHelpers } from '../../core/renderHelpers.js'; 
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const OrdersUI = {
    currentOrderId: null,

    openOrderDrawer: async function(orderId, isSilentRefresh = false) {
        if (!isSilentRefresh && window.innerWidth < 992 && typeof UIService.closeSidebar === 'function') {
            UIService.closeSidebar();
        }

        const strId = String(orderId);
        let order = AdminData.data.ordersMap?.[strId] || (AdminData.data.orders || []).find(o => String(o.id) === strId);

        if (!order) {
            if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(true, 'جاري جلب تفاصيل الطلب سحابياً...');
            try {
                const res = await FirebaseAdapter.callFunction('adminGetOrdersList', { limit: 1, searchQuery: strId });
                if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
                    order = res.data[0];
                } else {
                    order = await FirebaseAdapter.getById('telecard_orders', strId);
                }
                if (order) {
                    if (!AdminData.data.ordersMap) AdminData.data.ordersMap = {};
                    AdminData.data.ordersMap[String(order.id)] = order;
                }
            } catch (e) {
                console.error("OpenOrderDrawer Cloud Fetch Error:", e);
            } finally {
                if (window.AdminUI?.toggleLoader) window.AdminUI.toggleLoader(false);
            }
        }

        if(!order) {
            UIService?.showToast?.('تعذر العثور على تفاصيل هذا الطلب.', 'error');
            return;
        }

        this.currentOrderId = order.id;
        if (!isSilentRefresh) {
            EventBus.emit('order-drawer-opened', order.id);
        }

        // 🚀 إصلاح النقر خارج الدرج للإغلاق بإضافة data-action و data-type
        let drawer = document.getElementById('order-drawer-overlay');
        if (!drawer) {
            drawer = document.createElement('div');
            drawer.id = 'order-drawer-overlay';
            drawer.className = 'drawer-overlay dynamic-auto-destroy';
            drawer.dataset.action = 'close-drawer';
            drawer.dataset.type = 'order';
            document.body.appendChild(drawer);
        }

        const previousNoteVal = isSilentRefresh ? (document.getElementById('order-modal-note')?.value || '') : '';
        const previousCodeVal = isSilentRefresh ? (document.getElementById('order-modal-delivered-code')?.value || '') : '';

        drawer.innerHTML = OrdersTemplates.orderDrawerModal();

        const headerContent = document.getElementById('drawer-header-content');
        const bodyContent = document.getElementById('drawer-body-content');
        const footerActions = document.getElementById('drawer-footer-actions');
        const noteInput = document.getElementById('order-modal-note');
        const codeInput = document.getElementById('order-modal-delivered-code');
        const codeGroup = document.getElementById('order-delivered-code-group');

        if (!drawer || !bodyContent || !headerContent) return;

        const scrollArea = drawer.querySelector('.drawer-scroll-area');
        if (scrollArea && !isSilentRefresh) {
            scrollArea.classList.add('overflow-y-hidden');
            scrollArea.scrollTop = 0;
            scrollArea.classList.remove('overflow-y-hidden');
        }

        if (noteInput) {
            noteInput.value = previousNoteVal;
            if (codeInput) codeInput.value = previousCodeVal;
            
            const bindTypingMode = (el) => {
                if (!el || el.hasAttribute('data-events-bound')) return;
                el.setAttribute('data-events-bound', 'true');
                el.addEventListener('focus', function() {
                    document.getElementById('order-drawer')?.classList.add('typing-mode');
                });
                el.addEventListener('blur', function() {
                    document.getElementById('order-drawer')?.classList.remove('typing-mode');
                });
            };
            bindTypingMode(noteInput);
            bindTypingMode(codeInput);
            
            const noteWrapper = document.getElementById('order-note-wrapper');
            if (noteWrapper) {
                const isActionable = (order.status === 'pending' || order.status === 'processing');
                noteWrapper.classList.toggle('hide-element', !isActionable);
                
                if (codeGroup) {
                    const isAutomatedVault = Boolean(order.vaultPoolId && !order.supplierId);
                    codeGroup.classList.toggle('hide-element', isAutomatedVault);
                }
            }
        }

        headerContent.innerHTML = OrdersTemplates.orderDrawerHeader(order);
        
        let user = AdminData.data.usersMap?.[order.userId];
        if (!user) {
            user = { 
                id: order.userId, 
                displayId: order.userDataSnapshot?.displayId || String(order.userId).substring(0, 8),
                fullName: order.userDataSnapshot?.fullName || order.userName || 'مستخدم'
            };
        }
        
        const displayUser = String(order.userDataSnapshot?.fullName || order.userName || user.fullName || user.name || user.username || 'مستخدم جديد');
        const firstLetter = displayUser.replace('@', '').charAt(0).toUpperCase();
        const userAvatarSrc = user.profileImage || user.img;
        const avatarHtml = OrdersTemplates.drawerAvatar(userAvatarSrc || null, firstLetter);

        const prod = AdminData.data.prodsMap?.[order.prodId] || {};
        const prodName = String(order.product || prod.name || 'منتج غير معرف');
        const qty = order.qty || 1;
        const cCode = (order.priceCurrency || 'USD').toUpperCase().replace('$', 'USD');

        let financialSnapshotHtml = '';
        if (OrdersTemplates.financialSnapshotBlock) {
            financialSnapshotHtml = OrdersTemplates.financialSnapshotBlock(order.pricingSnapshot || {}, order.status, order);
        }

        const dateTxt = RenderHelpers.formatSafeDate(order.time || order.createdAt);
        const statusDict = { pending:'قيد المراجعة', processing:'جاري التنفيذ', completed:'مكتمل', rejected:'مرفوض', refunded:'مسترجع', returned:'مرتجع' };
        const sText = statusDict[order.status] || order.status;

        const isApi = (order.isApi === true || order.source === 'api');
        const isSupplier = Boolean(order.supplierId);
        const isAuto = (!isApi && !isSupplier && Boolean(order.vaultPoolId || order.isAutoDelivered));
        let sourceBadgeHtml = '';
        if (isApi) {
            sourceBadgeHtml = `<span class="badge-source-api fs-10 ms-1"><i class="fa-solid fa-code me-1"></i> طلب API</span>`;
        } else if (isSupplier) {
            sourceBadgeHtml = `<span class="badge-source-supplier fs-10 ms-1"><i class="fa-solid fa-plug me-1"></i> مورد خارجي</span>`;
        } else if (isAuto) {
            sourceBadgeHtml = `<span class="badge-source-auto fs-10 ms-1"><i class="fa-solid fa-bolt me-1"></i> تسليم آلي</span>`;
        } else {
            sourceBadgeHtml = `<span class="badge-source-manual fs-10 ms-1"><i class="fa-solid fa-hand-paper me-1"></i> تنفيذ يدوي</span>`;
        }

        let apiTrackingRowHtml = '';
        const externalId = order.externalOrderId || order.referenceId || order.apiOrderId || (order.apiData && order.apiData.orderId);
        if (externalId) {
            const extLabel = isSupplier ? 'رقم الطلب لدى المورد' : 'رقم الطلب المرجعي';
            apiTrackingRowHtml = `<div class="dr-receipt-row"><span class="dr-receipt-lbl"><i class="fa-solid fa-link text-info me-1"></i> ${extLabel}</span><span class="dr-receipt-val num-en text-info copyable-admin font-numeric" dir="ltr" lang="en" data-action="copy-text" data-copy-text="${Utils.escapeHTML(externalId)}">#${Utils.escapeHTML(externalId)}</span></div>`;
        }

        let executionTimeRowHtml = '';
        let durationHtml = '';
        const startTime = RenderHelpers.parseTime(order.time || order.createdAt);
        const endTime = RenderHelpers.parseTime(order.completedAt || order.actionTime || order.updatedAt); 

        if (endTime && order.status !== 'pending' && order.status !== 'processing') {
            const execDateTxt = RenderHelpers.formatSafeDate(endTime);
            executionTimeRowHtml = `<div class="dr-receipt-row"><span class="dr-receipt-lbl"><i class="fa-solid fa-calendar-check text-success me-1"></i> وقت التنفيذ / الإغلاق</span><span class="dr-receipt-val num-en text-success font-numeric" dir="ltr" lang="en">${execDateTxt}</span></div>`;
        }

        if (startTime && endTime && startTime < endTime && order.status !== 'pending') {
            const diffMs = endTime - startTime;
            const diffMins = Math.floor(diffMs / 60000);
            let dTxt = diffMins > 60 ? `${Math.floor(diffMins/60)} Hr & ${diffMins%60} Min` : `${diffMins} Min`;
            if (diffMins === 0) dTxt = "لحظي ⚡";
            
            if (OrdersTemplates && typeof OrdersTemplates.orderDurationRow === 'function') {
                durationHtml = OrdersTemplates.orderDurationRow(dTxt);
            }
        }

        let extraMetaHtml = '';
        if (order.ip || order.clientIp) {
            extraMetaHtml += `<div class="dr-receipt-row"><span class="dr-receipt-lbl"><i class="fa-solid fa-network-wired text-muted me-1"></i> عنوان IP للمشتري</span><span class="dr-receipt-val num-en text-muted copyable-admin font-numeric" dir="ltr" lang="en" data-action="copy-text" data-copy-text="${Utils.escapeHTML(order.ip || order.clientIp)}">${Utils.escapeHTML(order.ip || order.clientIp)}</span></div>`;
        }
        if (order.supplierName || order.supplierId) {
            const suppObj = AdminData.data.suppliersMap?.[order.supplierId];
            const suppDisplayName = order.supplierName || suppObj?.name || order.supplierId;
            extraMetaHtml += `<div class="dr-receipt-row"><span class="dr-receipt-lbl"><i class="fa-solid fa-truck-fast text-primary me-1"></i> المورد (التنفيذ الخارجي)</span><span class="dr-receipt-val fw-bold text-primary">${Utils.escapeHTML(suppDisplayName)}</span></div>`;
        }

        const rawInputs = (order.input || '').trim().split('|').map(p => p.trim()).filter(Boolean);
        let inputsCardHtml = ''; 
        if (rawInputs.length <= 1 && order.playerInputs && typeof order.playerInputs === 'object') {
            const parsedFromObj = Array.isArray(order.playerInputs)
                ? order.playerInputs.map((val, idx) => ({ label: idx === 0 ? (prod.input1Label || 'حقل 1') : (prod.input2Label || `حقل ${idx + 1}`), value: String(val) }))
                : Object.entries(order.playerInputs).map(([k, v]) => ({ label: k, value: String(v) }));
            if (parsedFromObj.length > 0) {
                inputsCardHtml = OrdersTemplates.orderInputsCard(parsedFromObj);
            }
        } else if (rawInputs.length > 0 && order.input !== '---') {
            const parsedInputs = rawInputs.map(p => {
                const segs = p.split(':');
                if(segs.length > 1) return { label: segs.shift().trim(), value: segs.join(':').trim() };
                return { label: prod.input1Label || 'بيانات', value: p };
            });
            inputsCardHtml = OrdersTemplates.orderInputsCard(parsedInputs);
        }

        const codeText = Array.isArray(order.deliveredCode) ? order.deliveredCode.join(' | ') : (order.deliveredCode || '');
        let codeHtml = codeText ? OrdersTemplates.orderCodeCard(codeText) : '';
        if (order.lateSupplierCode) {
            codeHtml += OrdersTemplates.adminReplyCard(order.lateSupplierCode, '🚨 كود متأخر وصل من المورد بعد رفض الطلب (خاص بالإدمن فقط)');
        }

        const replyHtml = (order.adminNote) ? OrdersTemplates.adminReplyCard(order.adminNote) : '';
        const imgHtml = OrdersTemplates.drawerProdImg((prod.image || prod.img) || null);
        
        const shortId = RenderHelpers.formatUserId(user) || '--';

        bodyContent.innerHTML = OrdersTemplates.orderDrawerBody({
            userId: String(order.userId || '--'),
            userDisplayId: shortId, 
            displayUser, avatarHtml, imgHtml, prodName, 
            qty: Utils.enNum(qty), 
            statusClass: order.status, sText, dateTxt,
            sourceBadgeHtml,
            apiTrackingRowHtml,
            executionTimeRowHtml,
            durationHtml,
            extraMetaHtml,
            fxRateStr: order.fxRate ? `1 USD = ${order.fxRate} ${cCode}` : null, 
            inputsCardHtml, codeHtml, replyHtml,
            financialSnapshotHtml 
        });

        footerActions.innerHTML = OrdersTemplates.orderDrawerFooter(order.status, order.id, isApi || isSupplier);
        
        if (!isSilentRefresh) {
            void drawer.offsetWidth;
            requestAnimationFrame(() => drawer.classList.add('active'));
        }

        if (!isSilentRefresh && order._auditToken && order.pricingSnapshot?.costUsd === undefined) {
            this._hydrateEncryptedAuditIfNeeded(order.id);
        }
    },

    _hydrateEncryptedAuditIfNeeded: async function(orderId) {
    try {
        const res = await FirebaseAdapter.callFunction('adminGetOrdersList', { limit: 1, searchQuery: String(orderId) });
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
            const decryptedOrd = res.data[0];
            if (!AdminData.data.ordersMap) AdminData.data.ordersMap = {};
            AdminData.data.ordersMap[String(orderId)] = decryptedOrd;
            const ordIdx = (AdminData.data.orders || []).findIndex(o => String(o.id) === String(orderId));
            if (ordIdx > -1) AdminData.data.orders[ordIdx] = decryptedOrd;
            
            const drawerEl = document.getElementById('order-drawer-overlay');
            if (String(this.currentOrderId) === String(orderId) && drawerEl?.classList.contains('active')) {
                this.openOrderDrawer(orderId, true);
            }
        }
    } catch (e) {}
},    closeOrderDrawer: function() {
        if (window.AdminUI && window.AdminUI.closeModal) {
            window.AdminUI.closeModal('order-drawer-overlay');
        }
        
        this.currentOrderId = null;
        EventBus.emit('order-drawer-closed');
    }
};
