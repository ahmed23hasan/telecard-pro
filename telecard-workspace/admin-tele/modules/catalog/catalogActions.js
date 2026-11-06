// ============================================================================
// 📦 خريطة مسارات الكتالوج (Catalog Actions Router) - Enterprise V20.3 💎
// 🚀 التحديثات المعمارية (V20.3 - Two-Tabs Clean Architecture):
// 1. Switch Prod Tab Route 🔀: إضافة مسار التبديل لتبويبات نافذة المنتج.
// 2. Pause Sub-Package Route ⏸️: دعم إيقاف/تفعيل الباقات الفرعية.
// 3. Edit Sub-Package Route ✏️: دعم تعديل الباقات الفرعية مباشرة.
// 4. Safe Config State 🛡️: حماية التكوين عند تبديل شكل الحقول.
// ============================================================================

import { CatalogController } from './catalogController.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { AdminData } from '../../adminData.js';
import { EventBus } from '../../adminUtils.js';

export const CatalogActions = {
// ==========================================
// 📁 1. الملاحة بين الأقسام
// ==========================================
'enter-folder': (data) => {
  if (AdminUI?.dragEditMode) return;
  EventBus.emit('req-update-state', { currFolder: data.enter || data.id });
  EventBus.emit('req-render-prods');
},
'cat-back': (data) => {
  if (AdminUI?.dragEditMode) AdminUI.toggleDragEditMode(data?.originalEvent);
  EventBus.emit('req-go-back');
},

// ==========================================
// 🪟 2. النوافذ المنبثقة
// ==========================================
'open-cat-modal': (data) => AdminUI?.CatalogUI?.openCategoryModal?.(data.id),
  'open-prod-modal': (data) => {
    if (AdminUI?.dragEditMode && data.element?.classList?.contains('item-box')) return;
    CatalogController.openProductModal?.(data.id);
  },  'open-country-modal': (data) => AdminUI?.CatalogUI?.openCountryModal?.(data.id),
  'open-vault-modal': (data) => AdminUI?.CatalogUI?.openVaultModal?.(data.id),
  'switch-prod-tab': (data) => AdminUI?.CatalogUI?.switchProdTab?.(data.tab),
  
  // ==========================================
  // 💾 3. عمليات الحفظ والحذف
  // ==========================================
  'save-cat': () => CatalogController.saveCat?.(),
  'save-prod': () => CatalogController.saveProd?.(),
  'save-country': () => CatalogController.saveCountry?.(),
  'save-vault': () => CatalogController.saveVaultPool?.(),
  
  // ==========================================
  // ⚙️ 4. تفاعلات بناء المنتجات والباقات الفرعية
  // ==========================================
  'render-prod-config': () => {
    AdminRender?.renderProdConfig?.();
  },
  'add-package': () => CatalogController.addPackage?.(),
  'edit-pkg': (data) => CatalogController.editPackage?.(Number(data.index)),
  'remove-pkg': (data) => CatalogController.removePkg?.(Number(data.index)),
  'toggle-pkg-avail': (data) => CatalogController.togglePackageAvailability?.(Number(data.index)),
  'toggle-mock-edit': (data) => AdminUI?.CatalogUI?.toggleMockEdit?.(data.val),
  'toggle-simple-qty': (data) => AdminUI?.CatalogUI?.toggleSimpleQty?.(data.element.checked),
  'toggle-supplier-link': (data) => AdminUI?.CatalogUI?.toggleSupplierLink?.(data.element),
  
  // ==========================================
  // 🎨 5. تفاعلات الواجهة والأشجار
  // ==========================================
  'change-grid-layout': (data) => CatalogController.changeGridLayout?.(data.val),
  'toggle-drag-edit': (data) => AdminUI?.CatalogUI?.toggleDragEditMode?.(data.originalEvent),
  'toggle-grid-sync': (data) => CatalogController.toggleGridSync?.(data.element.checked),
  'select-icon': (data) => AdminUI?.CatalogUI?.selectIcon?.(data.element),
  'select-animation': (data) => AdminUI?.CatalogUI?.selectAnimation?.(data.element),
  
  // 🚀 [الإصلاح المعماري]: توحيد أحداث شجرة الأقسام (تحديد الأبناء/الآباء)
  'toggle-tree-node': (data) => AdminUI?.CatalogUI?.toggleTreeNode?.(data.element),
  'toggleTreeNode': (data) => AdminUI?.CatalogUI?.toggleTreeNode?.(data.element),
  
  'tree-parent-check': (data) => AdminUI?.CatalogUI?.handleTreeParentCheck?.(data.element),
  'handleTreeParentCheck': (data) => AdminUI?.CatalogUI?.handleTreeParentCheck?.(data.element),
  
  'tree-child-check': (data) => AdminUI?.CatalogUI?.handleTreeChildCheck?.(data.element),
  'handleTreeChildCheck': (data) => AdminUI?.CatalogUI?.handleTreeChildCheck?.(data.element),
  
  'toggle-all-tree': (data) => AdminUI?.CatalogUI?.toggleAllTree?.(data.target),
  'detect-country': (data) => AdminUI?.detectCountryAutoFill?.(data.val, AdminData.data.countries),
  'save-sort-order': (data) => CatalogController.saveNewOrder?.(data.orderArray),
  
  // ==========================================
  // 🏦 6. إدارة الأكواد التالفة (Defective Vault)
  // ==========================================
  'view-defective-codes': (data) => CatalogController.viewDefectiveCodes?.(data.id),
  'load-more-defective': () => { if (window._loadMoreDefective) window._loadMoreDefective(); },
  'close-defective-modal': () => AdminUI?.CatalogUI?.closeDefectiveModalUI?.()
};
