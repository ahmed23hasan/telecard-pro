// ============================================================================
// 📦 خريطة مسارات الكتالوج (Catalog Actions Router) - Pure Router 🚦
// 🌟 التحديث: تفريغ الموجه من أي تعديل مباشر على البيانات أو الـ DOM
// ============================================================================

import { CatalogController } from './catalogController.js';
import { AppController } from '../../core/appController.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { AdminData } from '../../adminData.js';

export const CatalogActions = {
  'enter-folder': (data) => AppController.enter?.(data.enter || data.id),
  'cat-back': () => AppController.back?.(),
  
  'open-cat-modal': (data) => AdminUI?.CatalogUI?.openCategoryModal?.(data.id),
  'open-prod-modal': (data) => CatalogController.openProductModal?.(data.id),
  
  'save-cat': () => CatalogController.saveCat?.(),
  'save-prod': () => CatalogController.saveProd?.(),
  
  'render-prod-config': () => {
    AppController.updateState({ tempPackages: [] });
    AdminRender?.renderProdConfig?.();
  },
  'add-package': () => CatalogController.addPackage?.(),
  'remove-pkg': (data) => CatalogController.removePkg?.(Number(data.index)),
  
  'change-grid-layout': (data) => CatalogController.changeGridLayout?.(data.val),
  
  'toggle-mock-edit': (data) => AdminUI?.CatalogUI?.toggleMockEdit?.(data.val),
  'toggle-drag-edit': (data) => AdminUI?.CatalogUI?.toggleDragEditMode?.(data.originalEvent),
  
  // 🌟 تم نقل المنطق إلى Controller و UI
  'toggle-grid-sync': (data) => CatalogController.toggleGridSync?.(data.element.checked),
  'toggle-simple-qty': (data) => AdminUI?.CatalogUI?.toggleSimpleQty?.(data.element.checked),
  
  'select-icon': (data) => AdminUI?.CatalogUI?.selectIcon?.(data.element),
  'select-animation': (data) => AdminUI?.CatalogUI?.selectAnimation?.(data.element),
  'toggle-tree-node': (data) => AdminUI?.CatalogUI?.toggleTreeNode?.(data.element),
  'tree-parent-check': (data) => AdminUI?.CatalogUI?.handleTreeParentCheck?.(data.element),
  'tree-child-check': (data) => AdminUI?.CatalogUI?.handleTreeChildCheck?.(data.element),
  
  // 🌟 تم نقل منطق تحديد الشجرة للواجهة (UI)
  'toggle-all-tree': (data) => AdminUI?.CatalogUI?.toggleAllTree?.(data.target),
  
  'open-country-modal': (data) => AdminUI?.CatalogUI?.openCountryModal?.(data.id),
  'save-country': () => CatalogController.saveCountry?.(),
  
  'detect-country': (data) => AdminUI?.detectCountryAutoFill?.(data.val, AdminData.data.countries),
  
  'open-vault-modal': (data) => AdminUI?.CatalogUI?.openVaultModal?.(data.id),
  'save-vault': () => CatalogController.saveVaultPool?.(),
  'view-defective-codes': (data) => CatalogController.viewDefectiveCodes?.(data.id),
  'close-defective-modal': () => AdminUI?.CatalogUI?.closeDefectiveModalUI?.()
};
