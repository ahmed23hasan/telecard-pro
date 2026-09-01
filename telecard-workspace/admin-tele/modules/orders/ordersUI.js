// ============================================================================
// 📦 وحدة الطلبات (modules/orders/ordersUI.js) - النسخة الماسية V16.2 💎
// 🎯 الوظيفة: إدارة واجهات ونوافذ الطلبات (معزولة بالكامل عن باقي النظام)
// 🚀 التحديث: 
// 1. Wrong Drawer Fix: استخدام المعرف (ID) المباشر لمنع تحريك درج الإيداعات بالخطأ.
// 2. Forensic Tracing: ضخ بيانات التتبع العميقة وحماية كيبورد الجوال.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { UIService } from '../../core/uiService.js'; 
import { RenderHelpers } from '../../core/renderHelpers.js'; 
import { FinancialEngine } from '../../core/financialEngine.js'; 

export const OrdersUI = {
    currentOrderId: null,

    openOrderDrawer: function(orderId) {
        if (window.innerWidth < 992 && typeof UIService.closeSidebar === 'function') {
            UIService.closeSidebar();
        }

        const order = AdminData.data.ordersMap?.[orderId] || (AdminData.data.orders || []).find(o => String(o.id) === String(orderId));
        if(!order) return;

        this.currentOrderId = order.id;
        EventBus.emit('order-drawer-opened', order.id);

        const drawer = document.getElementById('order-drawer-overlay');
        const headerContent = drawer ? drawer.querySelector('.drawer-header') : null;
        const bodyContent = document.getElementById('drawer-body-content');
        const footerActions = document.getElementById('drawer-footer-actions');
        const noteInput = document.getElementById('order-modal-note');

        if(!drawer || !bodyContent || !headerContent) return;
        
        const scrollArea = drawer.querySelector('.drawer-scroll-area');
        if(scrollArea) scrollArea.scrollTop = 0;

        if(noteInput) {
            noteInput.value = ''; 
            
            if (!noteInput.hasAttribute('data-events-bound')) {
                noteInput.setAttribute('data-events-bound', 'true');
                
                noteInput.addEventListener('focus', function() {
                    // 🛡️ [إصلاح ה-Wrong Drawer]: استخدام المعرف الدقيق لدرج الطلبات
                    const drawerContainer = document.getElementById('order-drawer');
                    if(drawerContainer) drawerContainer.classList.add('typing-mode');
                });
                
                noteInput.addEventListener('blur', function() {
                    // 🛡️ [إصلاح ה-Wrong Drawer]: استخدام المعرف الدقيق لدرج الطلبات
                    const drawerContainer = document.getElementById('order-drawer');
                    if(drawerContainer) drawerContainer.classList.remove('typing-mode');
                });
            }

            const noteWrapper = noteInput.parentElement; 
            if (order.status === 'pending' || order.status === 'processing') {
                noteWrapper.classList.remove('hide-element');
            } else {
                noteWrapper.classList.add('hide-element');
            }
        }

        headerContent.innerHTML = AdminTemplates.orderDrawerHeader(order.id);
        
        const user = AdminData.data.usersMap?.[order.userId] || {};
        const displayUser = Utils.escapeHTML(user.fullName || user.name || user.username || 'مستخدم جديد');
        const firstLetter = displayUser.replace('@', '').charAt(0).toUpperCase();
        const avatarHtml = AdminTemplates.drawerAvatar(user.img ? Utils.escapeHTML(user.img) : null, firstLetter);

        const prod = AdminData.data.prodsMap?.[order.prodId] || {};
        const prodName = Utils.escapeHTML(order.product || prod.name || 'منتج غير معرف');
        const qty = order.qty || 1;
        
        const cCode = (order.priceCurrency || 'USD').toUpperCase().replace('$', 'USD');

        let financialSnapshotHtml = '';
        let priceTxt = '';
        let exactPriceTxt = null;
        let unitCostTxt = '';
        let couponRowHtml = '';
        let originalPriceRowHtml = '';

        if (order.pricingSnapshot && AdminTemplates.financialSnapshotBlock) {
            financialSnapshotHtml = AdminTemplates.financialSnapshotBlock(order.pricingSnapshot, order.status);
        } else {
            const exactPriceUsd = FinancialEngine.extractNum(order.baseUsd || order.price);
            priceTxt = RenderHelpers.formatMoney(exactPriceUsd, 'USD', 2);
            
            const totalCostUsd = FinancialEngine.safeMul(FinancialEngine.extractNum(order.costPrice || order.unitCost), qty);
            unitCostTxt = RenderHelpers.formatMoney(totalCostUsd, 'USD', 2); 

            if (order.couponCode) {
                let originalUsd = exactPriceUsd;
                const coupon = (AdminData.data.coupons || []).find(c => String(c.code).toUpperCase() === String(order.couponCode).toUpperCase());
                
                if (coupon) {
                    if (coupon.type === 'percentage') {
                        const ratio = FinancialEngine.safeSub(1, FinancialEngine.safeDiv(coupon.value, 100));
                        originalUsd = FinancialEngine.safeDiv(exactPriceUsd, ratio);
                    } else {
                        originalUsd = FinancialEngine.safeAdd(exactPriceUsd, coupon.value);
                    }

                    const origPriceTxt = RenderHelpers.formatMoney(originalUsd, 'USD', 2);
                    if (AdminTemplates && AdminTemplates.orderReceiptRow) {
                        couponRowHtml = AdminTemplates.orderReceiptRow('fa-solid fa-tags text-primary', 'كوبون خصم مفعّل', `<b class="num-en text-primary">${Utils.escapeHTML(order.couponCode)}</b>`);
                        originalPriceRowHtml = AdminTemplates.orderReceiptRow('fa-solid fa-money-bill-trend-up text-muted', 'السعر قبل الكوبون', `<del class="num-en text-muted">${origPriceTxt}</del>`);
                    }
                } else {
                    console.warn("[OrdersUI] الكوبون المستخدم في هذا الطلب تم حذفه من النظام مسبقاً.");
                }
            }
        }

        const dateTxt = RenderHelpers.formatSafeDate(order.time || order.createdAt);
        const statusDict = { pending:'قيد المراجعة', processing:'جاري التنفيذ', completed:'مكتمل', rejected:'مرفوض', refunded:'مسترجع' };
        const sText = statusDict[order.status] || order.status;

        const isApi = (order.isApi === true || order.source === 'api');
        const isAuto = (!isApi && order.deliveredCode && order.deliveredCode.length > 0);
        
        let sourceBadgeHtml = '';
        if (isApi) {
            sourceBadgeHtml = `<span class="badge-tag fs-10 ms-2" style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-robot"></i> طلب API</span>`;
        } else if (isAuto) {
            sourceBadgeHtml = `<span class="badge-tag fs-10 ms-2" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-bolt"></i> تسليم آلي</span>`;
        } else {
            sourceBadgeHtml = `<span class="badge-tag fs-10 ms-2" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-hand-paper"></i> تنفيذ يدوي</span>`;
        }

        let apiTrackingRowHtml = '';
        const externalId = order.externalOrderId || order.referenceId || order.apiOrderId || (order.apiData && order.apiData.orderId);
        if (isApi && externalId) {
            apiTrackingRowHtml = `<div class="dr-receipt-row"><span class="dr-receipt-lbl"><i class="fa-solid fa-link text-info"></i> رقم الطلب بمتجر العميل</span><span class="dr-receipt-val num-en text-info copyable-admin" dir="ltr" data-action="copy-text" data-copy-text="${Utils.escapeHTML(externalId)}">${Utils.escapeHTML(externalId)}</span></div>`;
        }

        let executionTimeRowHtml = '';
        let durationHtml = '';
        const startTime = RenderHelpers.parseTime(order.time || order.createdAt);
        const endTime = RenderHelpers.parseTime(order.actionTime || order.updatedAt); 

        if (endTime && order.status !== 'pending' && order.status !== 'processing') {
            const execDateTxt = RenderHelpers.formatSafeDate(endTime);
            executionTimeRowHtml = `<div class="dr-receipt-row"><span class="dr-receipt-lbl"><i class="fa-solid fa-calendar-check text-success"></i> وقت التنفيذ / الإغلاق</span><span class="dr-receipt-val num-en text-success" dir="ltr">${execDateTxt}</span></div>`;
        }

        if (startTime && endTime && startTime < endTime && order.status !== 'pending') {
            const diffMs = endTime - startTime;
            const diffMins = Math.floor(diffMs / 60000);
            let dTxt = diffMins > 60 ? `${Math.floor(diffMins/60)} Hr & ${diffMins%60} Min` : `${diffMins} Min`;
            if (diffMins === 0) dTxt = "لحظي ⚡";
            
            if (AdminTemplates && typeof AdminTemplates.orderDurationRow === 'function') {
                durationHtml = AdminTemplates.orderDurationRow(dTxt);
            }
        }

        let extraMetaHtml = '';
        if (order.ip || order.clientIp) {
            extraMetaHtml += `<div class="dr-receipt-row"><span class="dr-receipt-lbl"><i class="fa-solid fa-network-wired text-muted"></i> عنوان IP للمشتري</span><span class="dr-receipt-val num-en text-muted copyable-admin" dir="ltr" data-action="copy-text" data-copy-text="${Utils.escapeHTML(order.ip || order.clientIp)}">${Utils.escapeHTML(order.ip || order.clientIp)}</span></div>`;
        }
        if (order.supplierName || order.supplierId) {
            extraMetaHtml += `<div class="dr-receipt-row"><span class="dr-receipt-lbl"><i class="fa-solid fa-truck-fast text-primary"></i> المورد (التنفيذ الخارجي)</span><span class="dr-receipt-val fw-bold text-primary">${Utils.escapeHTML(order.supplierName || order.supplierId)}</span></div>`;
        }

        const rawInputs = (order.input || '').trim().split('|').map(p=>p.trim()).filter(Boolean);
        let inputsCardHtml = ''; 
        if (rawInputs.length > 0) {
            const parsedInputs = rawInputs.map(p => {
                const segs = p.split(':');
                if(segs.length > 1) return { label: Utils.escapeHTML(segs.shift().trim()), value: Utils.escapeHTML(segs.join(':').trim()) };
                return { label: 'بيانات', value: Utils.escapeHTML(p) };
            });
            inputsCardHtml = AdminTemplates.orderInputsCard(parsedInputs);
        }

        const codeText = Array.isArray(order.deliveredCode) ? order.deliveredCode.join(' | ') : (order.deliveredCode || '');
        const codeHtml = codeText ? AdminTemplates.orderCodeCard(Utils.escapeHTML(codeText)) : '';

        const replyHtml = (order.adminNote) ? AdminTemplates.adminReplyCard(Utils.escapeHTML(order.adminNote)) : '';
        const imgHtml = AdminTemplates.drawerProdImg(prod.img ? Utils.escapeHTML(prod.img) : null);
        
        const shortId = RenderHelpers.formatUserId(user) || '--';

        bodyContent.innerHTML = AdminTemplates.orderDrawerBody({
            userId: Utils.escapeHTML(order.userId || '--'),
            userDisplayId: Utils.escapeHTML(shortId), 
            displayUser, avatarHtml, imgHtml, prodName, 
            qty: Utils.enNum(qty), priceTxt, exactPriceTxt, unitCostTxt, 
            statusClass: order.status, sText, dateTxt,
            sourceBadgeHtml,
            apiTrackingRowHtml,
            executionTimeRowHtml,
            durationHtml,
            extraMetaHtml,
            fxRateStr: order.fxRate ? `1 USD = ${order.fxRate} ${cCode}` : null, 
            inputsCardHtml, codeHtml, replyHtml,
            couponRowHtml, originalPriceRowHtml,
            financialSnapshotHtml 
        });

        // 🛡️ [إصلاح ה-API Override Shield]: إرسال حالة ה-API לקالب الأزرار لمنع التخطي الخاطئ
        footerActions.innerHTML = AdminTemplates.orderDrawerFooter(order.status, order.id, isApi);
        drawer.classList.add('active');
    },

    closeOrderDrawer: function() {
        const drawer = document.getElementById('order-drawer-overlay');
        if(drawer) drawer.classList.remove('active');
        this.currentOrderId = null;
        EventBus.emit('order-drawer-closed');
    }
};
