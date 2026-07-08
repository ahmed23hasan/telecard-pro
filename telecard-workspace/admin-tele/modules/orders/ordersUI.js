// ============================================================================
// 📦 وحدة الطلبات (modules/orders/ordersUI.js) - النسخة الماسية V4.4 💎
// 🎯 الوظيفة: إدارة واجهات ونوافذ الطلبات (معزولة بالكامل عن باقي النظام)
// 🚀 التحديث الأقصى: إصلاح تضارب خرائط الكوبونات وتوحيد الدقة المالية O(1)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { UIService } from '../../core/uiService.js'; 
import { RenderHelpers } from '../../core/renderHelpers.js'; 
import { FinancialEngine } from '../../core/financialEngine.js'; // 🛡️ استيراد المحرك المالي

export const OrdersUI = {
    currentOrderId: null,

    openOrderDrawer: function(orderId) {
        if (window.innerWidth < 992 && typeof UIService.closeSidebar === 'function') {
            UIService.closeSidebar();
        }

        // ⚡ 1. جلب الطلب فورا بـ O(1)
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
        
        // تصفير شريط التمرير
        const scrollArea = drawer.querySelector('.drawer-scroll-area');
        if(scrollArea) scrollArea.scrollTop = 0;

        // تهيئة حقل الملاحظات
        if(noteInput) {
            noteInput.value = ''; 
            noteInput.onfocus = function() {
                const drawerContainer = document.querySelector('.order-drawer');
                if(drawerContainer) drawerContainer.classList.add('typing-mode');
            };
            noteInput.onblur = function() {
                const drawerContainer = document.querySelector('.order-drawer');
                if(drawerContainer) drawerContainer.classList.remove('typing-mode');
            };

            const noteWrapper = noteInput.parentElement; 
            if (order.status === 'pending' || order.status === 'processing') noteWrapper.classList.remove('hide-element');
            else noteWrapper.classList.add('hide-element');
        }

        headerContent.innerHTML = AdminTemplates.orderDrawerHeader(order.id);
        
        // ⚡ 2. جلب العميل فورا بـ O(1)
        const user = AdminData.data.usersMap?.[order.userId] || {};
        const displayUser = Utils.escapeHTML(user.fullName || user.name || user.username || 'مستخدم جديد');
        const firstLetter = displayUser.replace('@', '').charAt(0).toUpperCase();
        const avatarHtml = AdminTemplates.drawerAvatar(user.img ? Utils.escapeHTML(user.img) : null, firstLetter);

        // ⚡ 3. جلب المنتج فورا بـ O(1)
        const prod = AdminData.data.prodsMap?.[order.prodId] || {};
        const prodName = Utils.escapeHTML(order.product || prod.name || 'منتج غير معرف');
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
            // 🛡️ حسابات Fallback للطلبات القديمة باستخدام المحرك المالي
            const exactPriceUsd = FinancialEngine.extractNum(order.baseUsd || order.price);
            priceTxt = RenderHelpers.formatMoney(exactPriceUsd, 'USD', 2);
            
            const totalCostUsd = FinancialEngine.safeMul(FinancialEngine.extractNum(order.costPrice || order.unitCost), qty);
            unitCostTxt = RenderHelpers.formatMoney(totalCostUsd, 'USD', 2); 

            if (order.couponCode) {
                let originalUsd = exactPriceUsd;
                // ⚡ 4. [إصلاح جراحي]: البحث عن الكوبون بالرمز (Code) وليس الـ ID من المصفوفة مباشرة
                const coupon = (AdminData.data.coupons || []).find(c => String(c.code).toUpperCase() === String(order.couponCode).toUpperCase());
                
                if (coupon) {
                    if (coupon.type === 'percentage') {
                        const ratio = FinancialEngine.safeSub(1, FinancialEngine.safeDiv(coupon.value, 100));
                        originalUsd = FinancialEngine.safeDiv(exactPriceUsd, ratio);
                    } else {
                        originalUsd = FinancialEngine.safeAdd(exactPriceUsd, coupon.value);
                    }
                }

                const origPriceTxt = RenderHelpers.formatMoney(originalUsd, 'USD', 2);
                if (AdminTemplates.orderReceiptRow) {
                    couponRowHtml = AdminTemplates.orderReceiptRow('fa-solid fa-tags text-primary', 'كوبون خصم مفعّل', `<b class="num-en text-primary">${Utils.escapeHTML(order.couponCode)}</b>`);
                    originalPriceRowHtml = AdminTemplates.orderReceiptRow('fa-solid fa-money-bill-trend-up text-muted', 'السعر قبل الكوبون', `<del class="num-en text-muted">${origPriceTxt}</del>`);
                }
            }
        }

        const dateTxt = RenderHelpers.formatSafeDate(order.time || order.createdAt);
        const statusDict = { pending:'قيد المراجعة', processing:'جاري التنفيذ', completed:'مكتمل', rejected:'مرفوض', refunded:'مسترجع' };
        const sText = statusDict[order.status] || order.status;

        // حساب مدة التنفيذ
        let durationHtml = '';
        const startTime = RenderHelpers.parseTime(order.time || order.createdAt);
        const endTime = RenderHelpers.parseTime(order.actionTime || order.updatedAt); 

        if (startTime && endTime && startTime < endTime) {
            const diffMs = endTime - startTime;
            const diffMins = Math.floor(diffMs / 60000);
            let dTxt = diffMins > 60 ? `${Math.floor(diffMins/60)} Hr & ${diffMins%60} Min` : `${diffMins} Min`;
            if (diffMins === 0) dTxt = "لحظي ⚡";
            durationHtml = AdminTemplates.orderDurationRow(dTxt);
        }

        // معالجة المدخلات (Labels & Values)
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
        
        // جلب الرقم القصير للعميل
        const shortId = RenderHelpers.formatUserId(user) || '--';

        bodyContent.innerHTML = AdminTemplates.orderDrawerBody({
            userId: Utils.escapeHTML(order.userId || '--'),
            userDisplayId: Utils.escapeHTML(shortId), 
            displayUser, avatarHtml, imgHtml, prodName, 
            qty: Utils.enNum(qty), priceTxt, exactPriceTxt, unitCostTxt, 
            statusClass: order.status, sText, dateTxt,
            durationHtml, fxRateStr: order.fxRate ? `1 USD = ${order.fxRate} ${cCode}` : null, 
            inputsCardHtml, codeHtml, replyHtml,
            couponRowHtml, originalPriceRowHtml,
            financialSnapshotHtml 
        });

        footerActions.innerHTML = AdminTemplates.orderDrawerFooter(order.status, order.id);
        drawer.classList.add('active');
    },

    closeOrderDrawer: function() {
        const drawer = document.getElementById('order-drawer-overlay');
        if(drawer) drawer.classList.remove('active');
        this.currentOrderId = null;
        EventBus.emit('order-drawer-closed');
    }
};