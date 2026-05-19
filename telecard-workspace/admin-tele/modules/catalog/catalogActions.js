// ============================================================================
// 📦 خريطة مسارات الكتالوج (Catalog Actions Router)
// 🌟 التحديث: سد ثغرة مسار فتح الأقسام (enter-folder)
// ============================================================================

import { CatalogController } from './catalogController.js';
import { AppController } from '../../core/appController.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { AdminData } from '../../adminData.js';

export const CatalogActions = {
  // 🌟 تمت إضافة هذا المسار لفتح القسم عند النقر عليه
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
  
  'toggle-grid-sync': (data) => {
    if (!AdminData.data.settings) AdminData.data.settings = {};
    AdminData.data.settings.syncGridLayout = data.element.checked;
    AdminData.saveSystemSettings();
    if (data.element.checked) {
      AdminUI?.showToast?.('تم التفعيل: سيتم تطبيق التخطيط على المتجر', 'success');
    } else {
      AdminUI?.showToast?.('تم الإيقاف: سيعود المتجر للشكل الافتراضي', 'info');
    }
  },
  'toggle-simple-qty': (data) => {
    const limitBox = document.getElementById('simple-qty-limit-box');
    if (limitBox) limitBox.classList.toggle('hide-element', !data.element.checked);
  },
  
  'select-icon': (data) => AdminUI?.CatalogUI?.selectIcon?.(data.element),
  'select-animation': (data) => AdminUI?.CatalogUI?.selectAnimation?.(data.element),
  'toggle-tree-node': (data) => AdminUI?.CatalogUI?.toggleTreeNode?.(data.element),
  'tree-parent-check': (data) => AdminUI?.CatalogUI?.handleTreeParentCheck?.(data.element),
  'tree-child-check': (data) => AdminUI?.CatalogUI?.handleTreeChildCheck?.(data.element),
  'toggle-all-tree': (data) => {
    const cbs = document.querySelectorAll(`#${data.target} .tree-parent-cb, #${data.target} .tree-child-cb`);
    if (cbs.length > 0) {
      const state = !cbs[0].checked;
      cbs.forEach(cb => { cb.checked = state;
        cb.indeterminate = false; });
    }
  },
  
  'open-country-modal': (data) => AdminUI?.CatalogUI?.openCountryModal?.(data.id),
  'save-country': () => CatalogController.saveCountry?.(),
  'detect-country': (data) => AdminUI?.detectCountryAutoFill?.(data.val),
  
  'open-vault-modal': (data) => AdminUI?.CatalogUI?.openVaultModal?.(data.id),
  'save-vault': () => CatalogController.saveVaultPool?.(),
  'view-defective-codes': (data) => CatalogController.viewDefectiveCodes?.(data.id),
  'close-defective-modal': () => AdminUI?.CatalogUI?.closeDefectiveModalUI?.()
};