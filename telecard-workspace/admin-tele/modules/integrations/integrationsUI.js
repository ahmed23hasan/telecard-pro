// ============================================================================
// 🔌 واجهة الربط التفاعلية (modules/integrations/integrationsUI.js) - V20.5 💎
// 🎯 الوظيفة: إدارة نوافذ الموردين، البحث الفوري في الكتالوج، وتوليد القوائم الديناميكية
// ============================================================================

import { AdminData } from '../../adminData.js';
import { IntegrationsTemplates } from './integrationsTemplates.js';
import { EventBus } from '../../adminUtils.js';

export const IntegrationsUI = {
    openSupplierModal: function(id = null) {
        try {
            const supplier = id ? (AdminData.data.suppliersMap?.[id] || (AdminData.data.suppliers || []).find(s => String(s.id) === String(id))) : null;
            const rates = AdminData.data.rates || [];
            
            let modal = document.getElementById('m-supplier');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'm-supplier';
                modal.className = 'modal-overlay dynamic-auto-destroy';
                document.body.appendChild(modal);
            }
            
            modal.innerHTML = IntegrationsTemplates.supplierModal(supplier, rates);
            
            void modal.offsetWidth;
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
            
            void overlay.offsetWidth;
            EventBus.emit('req-open-modal', 'supplier-defects-overlay');
        }
    },
    
    closeDefectsModal: function() {
        if (window.AdminUI && window.AdminUI.closeModal) {
            window.AdminUI.closeModal('supplier-defects-overlay');
        }
    },
    
    filterSupplierCatalogModal: function(searchTerm = '') {
        const listContainer = document.getElementById('supp-catalog-items-list');
        if (!listContainer) return;
        
        const term = String(searchTerm || '').toLowerCase().trim();
        const rows = listContainer.querySelectorAll('.supp-cat-item-row');
        let visibleCount = 0;
        
        rows.forEach(row => {
            const text = row.innerText.toLowerCase();
            if (!term || text.includes(term)) {
                row.classList.remove('hide-element');
                visibleCount++;
            } else {
                row.classList.add('hide-element');
            }
        });
        
        let emptyEl = document.getElementById('supp-cat-empty-search');
        if (visibleCount === 0 && rows.length > 0 && term !== '') {
            if (!emptyEl) {
                emptyEl = document.createElement('div');
                emptyEl.id = 'supp-cat-empty-search';
                emptyEl.className = 'empty-state mt-10';
                emptyEl.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i><span>لا توجد منتجات تطابق بحثك...</span>`;
                listContainer.appendChild(emptyEl);
            }
        } else if (emptyEl) {
            emptyEl.remove();
        }
    }
};