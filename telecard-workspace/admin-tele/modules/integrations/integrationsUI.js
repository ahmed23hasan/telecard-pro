// ============================================================================
// 🔌 واجهة الربط التفاعلية (modules/integrations/integrationsUI.js) - V20.0 💎
// 🎯 الوظيفة: إدارة نوافذ الموردين وتوليد القوائم الديناميكية
// 🚀 التحديثات المعمارية (V20.0 - Dynamic Rates & Zero Jitter):
// 1. Dynamic Rates Injection 💱: تمرير أسعار الصرف الحية للقالب لتوليد قائمة العملات ديناميكياً.
// 2. Lazy DOM Injection 📦: توليد نوافذ الموردين والتالف من العدم لتخفيف الذاكرة.
// 3. Smart Garbage Collector 🧹: إضافة ختم (dynamic-auto-destroy) لتدمير النوافذ ذاتياً بعد الإغلاق.
// 4. Zero Jitter Shield 🛡️: إجبار المتصفح على حساب الأبعاد (offsetWidth) لمنع التمدد.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { IntegrationsTemplates } from './integrationsTemplates.js';
import { EventBus } from '../../adminUtils.js';

export const IntegrationsUI = {
    openSupplierModal: function(id = null) {
        try {
            const supplier = id ? (AdminData.data.suppliersMap?.[id] || (AdminData.data.suppliers || []).find(s => String(s.id) === String(id))) : null;
            // 🚀 جلب العملات الحية المعتمدة في المتجر لتمريرها للقالب
            const rates = AdminData.data.rates || [];
            
            let modal = document.getElementById('m-supplier');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'm-supplier';
                modal.className = 'modal-overlay dynamic-auto-destroy';
                document.body.appendChild(modal);
            }
            
            modal.innerHTML = IntegrationsTemplates.supplierModal(supplier, rates);
            
            void modal.offsetWidth; // 🛡️ منع الرجفة
            
            requestAnimationFrame(() => {
                modal.classList.add('active');
            });
            
            EventBus.emit('req-open-modal', 'supplier');
            
        } catch (error) {
            console.error("🚨 خطأ في فتح نافذة المورد:", error);
            EventBus.emit('req-show-toast', { message: 'حدث خطأ أثناء تهيئة نافذة المورد.', type: 'error' });
        }
    },
    
    openDefectsModal: function(supplierId, supplierName, defects, isLoadMore = false, hasMore = false) {
        if (isLoadMore) {
            const tbody = document.getElementById('supplier-defects-tbody');
            const loadMoreBtn = document.getElementById('btn-load-more-supp-defects');
            
            if (tbody) {
                tbody.insertAdjacentHTML('beforeend', IntegrationsTemplates.supplierDefectsRows(defects));
            }
            
            if (!hasMore && loadMoreBtn) loadMoreBtn.remove();
            
        } else {
            let overlay = document.getElementById('supplier-defects-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'supplier-defects-overlay';
                overlay.className = 'modal-overlay dynamic-auto-destroy';
                document.body.appendChild(overlay);
            }
            
            overlay.innerHTML = IntegrationsTemplates.supplierDefectsModal(supplierId, supplierName, defects, hasMore);
            
            void overlay.offsetWidth; // 🛡️ منع الرجفة
            
            requestAnimationFrame(() => {
                overlay.classList.add('active');
            });
        }
    },
    
    closeDefectsModal: function() {
        if (window.AdminUI && window.AdminUI.closeModal) {
            window.AdminUI.closeModal('supplier-defects-overlay');
        }
    }
};