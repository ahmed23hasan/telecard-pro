// ============================================================================
// 📦 وحدة الطلبات (modules/orders/ordersUI.js)
// 🎯 الوظيفة: إدارة واجهات ونوافذ الطلبات (معزولة بالكامل عن باقي النظام)
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { UIService } from '../../core/uiService.js'; // 🌟 النواة المرئية
import { RenderHelpers } from '../../core/renderHelpers.js'; // 🌟 تمت إضافة الاستدعاء هنا

export const OrdersUI = {
    currentOrderId: null,

    openOrderDrawer: function(orderId) {
        // إغلاق الشريط الجانبي في الشاشات الصغيرة عبر النواة
        if (window.innerWidth < 992 && typeof UIService.closeSidebar === 'function') {
            UIService.closeSidebar();
        }

        let order = null;
        if(AdminData && AdminData.data && AdminData.data.orders) {
            order = AdminData.data.orders.find(o => String(o.id) === String(orderId));
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
                // 🌟 الإصلاح الجذري: تغيير smooth إلى auto و block إلى nearest لمنع التضارب مع أنيميشن الكيبورد
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

        headerContent.innerHTML = AdminTemplates.orderDrawerHeader(Utils.escapeHTML(order.id));
        
        const user = (AdminData.data.users || []).find(u => String(u.id) === String(order.userId)) || {};
        const displayUser = Utils.escapeHTML(user.fullName || user.name || user.username || 'مستخدم');
        const firstLetter = displayUser.replace('@', '').charAt(0).toUpperCase();

        const avatarHtml = AdminTemplates.drawerAvatar(user.img ? Utils.escapeHTML(user.img) : null, firstLetter);

        const prods = AdminData.data.prods || [];
        const prod = prods.find(p => String(p.id) === String(order.prodId)) || {};
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
            // 🌟 تنظيف المبلغ من الإشارات، حيث سيتولى القالب الجديد مسؤولية وضع الـ (+ / -) بصرياً
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
                const coupon = (AdminData.data.coupons || []).find(c => c.code === order.couponCode);
                
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

        const dateObj = order.time ? new Date(order.time) : new Date();
        const dateTxt = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' | ' + dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        const statusDict = { pending:'قيد المراجعة', processing:'جاري التنفيذ', completed:'مكتمل', rejected:'مرفوض', refunded:'مسترجع' };
        const sText = statusDict[order.status] || order.status;
        const statusClass = order.status; 

        let durationHtml = '';
        const startTime = order.time || order.createdAt;
        const endTime = order.actionTime || order.updatedAt || order.completedAt; 

        if ((order.status === 'completed' || order.status === 'rejected' || order.status === 'refunded') && startTime && endTime) {
            const startObj = new Date(startTime);
            const endObj = new Date(endTime);
            if (!isNaN(startObj.getTime()) && !isNaN(endObj.getTime())) {
                const diffMs = endObj.getTime() - startObj.getTime();
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

        // 🌟 استخراج العميل والرقم القصير لتمريره للدرج
        const userRec = (AdminData.data.users || []).find(u => String(u.id) === String(order.userId)) || {};
        const shortId = userRec.displayId || (order.userId ? String(order.userId).substring(0, 6) : '---');

        bodyContent.innerHTML = AdminTemplates.orderDrawerBody({
            userId: Utils.escapeHTML(order.userId || '--'),
            userDisplayId: Utils.escapeHTML(shortId), // 🌟 تمرير الرقم القصير هنا
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
