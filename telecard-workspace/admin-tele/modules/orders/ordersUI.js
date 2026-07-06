// ============================================================================
// 📦 وحدة الطلبات (modules/orders/ordersUI.js) - النسخة الماسية V4.3 💎
// 🎯 الوظيفة: إدارة واجهات ونوافذ الطلبات (معزولة بالكامل عن باقي النظام)
// 🚀 التحديث الأقصى: القضاء على الـ 4 عمليات الخطية المسببة للبطء والتحول لـ O(1)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { UIService } from '../../core/uiService.js'; 
import { RenderHelpers } from '../../core/renderHelpers.js'; 

export const OrdersUI = {
    currentOrderId: null,

    openOrderDrawer: function(orderId) {
        if (window.innerWidth < 992 && typeof UIService.closeSidebar === 'function') {
            UIService.closeSidebar();
        }

        // ⚡ 1. جلب الطلب فورا بـ O(1) من خريطة الطلبات المركزية مع fallback آمن
        let order = null;
        if(AdminData && AdminData.data) {
            order = AdminData.data.ordersMap?.[orderId] || AdminData.data.orders.find(o => String(o.id) === String(orderId));
        }
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
            noteInput.onfocus = function() {
                const drawerContainer = document.querySelector('.order-drawer');
                if(drawerContainer) drawerContainer.classList.add('typing-mode');
                setTimeout(() => { this.scrollIntoView({ behavior: 'auto', block: 'nearest' }); }, 300); 
            };
            noteInput.onblur = function() {
                const drawerContainer = document.querySelector('.order-drawer');
                if(drawerContainer) drawerContainer.classList.remove('typing-mode');
            };

            const noteWrapper = noteInput.parentElement; 
            if (order.status === 'pending') noteWrapper.classList.remove('hide-element');
            else noteWrapper.classList.add('hide-element');
        }

        headerContent.innerHTML = AdminTemplates.orderDrawerHeader(order.id);
        
        // ⚡ 2. جلب تفاصيل العميل فورا بـ O(1) من خريطة العملاء
        const user = AdminData.data.usersMap?.[order.userId] || (AdminData.data.users || []).find(u => String(u.id) === String(order.userId)) || {};
        const displayUser = Utils.escapeHTML(user.fullName || user.name || user.username || 'مستخدم جديد');
        const firstLetter = displayUser.replace('@', '').charAt(0).toUpperCase();

        const avatarHtml = AdminTemplates.drawerAvatar(user.img ? Utils.escapeHTML(user.img) : null, firstLetter);

        // ⚡ 3. جلب تفاصيل المنتج الأصلي بـ O(1) من خريطة المنتجات
        const prod = AdminData.data.prodsMap?.[order.prodId] || (AdminData.data.prods || []).find(p => String(p.id) === String(order.prodId)) || {};
        const prodName = Utils.escapeHTML(order.product || prod.name || 'منتج');
        const qty = order.qty || 1;
        
        const cCode = (order.priceCurrency || 'USD').toUpperCase().replace('$', 'USD');
        const isUSD = (cCode === 'USD');

        let financialSnapshotHtml = '';
        let priceTxt = '';
        let exactPriceTxt = null;
        let unitCostTxt = '';
        let couponRowHtml = '';
        let originalPriceRowHtml = '';

        if (order.pricingSnapshot && AdminTemplates.financialSnapshotBlock) {
            financialSnapshotHtml = AdminTemplates.financialSnapshotBlock(order.pricingSnapshot, order.status);
        } else {
            const absPrice = Math.abs(order.price || 0);
            priceTxt = RenderHelpers.formatMoney(absPrice, cCode, 2);
            
            const unitCostUsd = Number(order.costPrice || order.unitCost || 0);
            const totalCostUsd = unitCostUsd * Number(qty);
            unitCostTxt = RenderHelpers.formatMoney(totalCostUsd, 'USD', 2); 

            const exactPriceUsd = Number(order.baseUsd || order.price || 0);
            const absExactPrice = Math.abs(exactPriceUsd);
            exactPriceTxt = isUSD ? null : RenderHelpers.formatMoney(absExactPrice, 'USD', 2);

            if (order.couponCode) {
                let originalUsd = exactPriceUsd;
                
                // ⚡ 4. جلب الكوبون فورا بـ O(1) باستخدام الرمز المشفر الموحد
                const coupon = AdminData.data.couponsMap?.[String(order.couponCode).toUpperCase()] || (AdminData.data.coupons || []).find(c => c.code === order.couponCode);
                
                if (coupon) {
                    if (coupon.type === 'percentage') originalUsd = exactPriceUsd / (1 - (coupon.value / 100));
                    else originalUsd = exactPriceUsd + coupon.value;
                } else if (order.discountValue) {
                    originalUsd = exactPriceUsd + Number(order.discountValue);
                }

                const origPriceTxt = RenderHelpers.formatMoney(Math.abs(originalUsd), 'USD', 2);
                
                if (AdminTemplates.orderReceiptRow) {
                    couponRowHtml = AdminTemplates.orderReceiptRow('fa-solid fa-tags text-primary', 'كوبون خصم مفعّل', `<b class="num-en text-primary">${Utils.escapeHTML(order.couponCode)}</b>`);
                    originalPriceRowHtml = AdminTemplates.orderReceiptRow('fa-solid fa-money-bill-trend-up text-muted', 'السعر قبل الكوبون', `<del class="num-en text-muted">${origPriceTxt}</del>`);
                }
            }
        }

        const dateTxt = RenderHelpers.formatSafeDate(order.time || order.createdAt);
        
        const statusDict = { pending:'قيد المراجعة', processing:'جاري التنفيذ', completed:'مكتمل', rejected:'مرفوض', refunded:'مسترجع', returned:'مسترجع' };
        const sText = statusDict[order.status] || order.status;
        const statusClass = order.status; 

        let durationHtml = '';
        const startTime = RenderHelpers.parseTime(order.time || order.createdAt);
        const endTime = RenderHelpers.parseTime(order.actionTime || order.updatedAt || order.completedAt); 

        if ((order.status === 'completed' || order.status === 'rejected' || order.status === 'refunded' || order.status === 'returned') && startTime && endTime) {
            const diffMs = endTime - startTime;
            if (diffMs >= 0) {
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMins / 60);
                const diffDays = Math.floor(diffHours / 24);
                let durationTxt = ''; 
                
                if (diffDays > 0) durationTxt = `${Utils.enNum(diffDays)} Day & ${Utils.enNum(diffHours % 24)} Hr`;
                else if (diffHours > 0) durationTxt = `${Utils.enNum(diffHours)} Hr & ${Utils.enNum(diffMins % 60)} Min`;
                else if (diffMins > 0) durationTxt = `${Utils.enNum(diffMins)} Min`;
                else durationTxt = `${Utils.enNum(Math.floor(diffMs / 1000))} Sec`; 
                
                durationHtml = AdminTemplates.orderDurationRow(durationTxt);
            }
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

        let codeHtml = '';
        const dCode = order.deliveredCode; 
        let codeText = '';
        if (Array.isArray(dCode)) codeText = dCode.map(c => (typeof c === 'object' && c !== null) ? (c.text || c.code || '') : c).join(' | ');
        else if (typeof dCode === 'object' && dCode !== null) codeText = dCode.text || dCode.code || '';
        else codeText = dCode || '';

        if (codeText) codeHtml = AdminTemplates.orderCodeCard(Utils.escapeHTML(codeText));

        let replyHtml = '';
        const adminManualReply = order.adminNote || ''; 
        if (adminManualReply && adminManualReply.trim() !== '') {
            replyHtml = AdminTemplates.adminReplyCard(Utils.escapeHTML(adminManualReply));
        }

        const imgHtml = AdminTemplates.drawerProdImg(prod.img ? Utils.escapeHTML(prod.img) : null);
        
        const baseCurrText = RenderHelpers.getCurrencySymbolText ? RenderHelpers.getCurrencySymbolText('USD') : 'USD';
        const fxRateStr = order.fxRate ? `1 ${baseCurrText} = ${RenderHelpers.formatMoney(order.fxRate, cCode, 4)}` : null;

        // ⚡ جلب الرقم القصير للعميل بـ O(1)
        const shortId = RenderHelpers.formatUserId(user) || RenderHelpers.formatUserId(order.userId);

        bodyContent.innerHTML = AdminTemplates.orderDrawerBody({
            userId: Utils.escapeHTML(order.userId || '--'),
            userDisplayId: Utils.escapeHTML(shortId), 
            displayUser, avatarHtml, imgHtml, prodName, 
            qty: Utils.enNum(qty), priceTxt, exactPriceTxt, unitCostTxt, statusClass, sText, dateTxt,
            durationHtml, fxRateStr, inputsCardHtml, codeHtml, replyHtml,
            couponRowHtml, originalPriceRowHtml,
            financialSnapshotHtml 
        });

        footerActions.innerHTML = AdminTemplates.orderDrawerFooter(order.status, order.id);

        const finalScrollArea = drawer.querySelector('.drawer-scroll-area');
        const drawerPanel = drawer.firstElementChild; 
        
        if(finalScrollArea) finalScrollArea.scrollTop = 0;
        if(drawerPanel) drawerPanel.scrollTop = 0;
        drawer.scrollTop = 0;

        drawer.classList.add('active');
    },
    closeOrderDrawer: function() {
        const drawer = document.getElementById('order-drawer-overlay');
        if(drawer) drawer.classList.remove('active');
        this.currentOrderId = null;
        EventBus.emit('order-drawer-closed');
    }
};