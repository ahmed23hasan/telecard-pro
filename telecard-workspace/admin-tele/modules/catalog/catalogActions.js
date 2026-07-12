// ============================================================================
// 📦 خريطة مسارات الكتالوج (Catalog Actions Router) - النسخة الماسية V10.4 💎
// 🌟 التحديث الأقصى: 
// 1. [Decoupling]: إزالة الارتباط الدائري بـ AppController تماماً.
// 2. [State Management]: توجيه الملاحة (enter/back) عبر EventBus النقي.
// 3. [Ghost Bug Fix]: بناء الجسر المفقود لعرض الأكواد التالفة (Defective Codes).
// ============================================================================

import { CatalogController } from './catalogController.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { AdminData } from '../../adminData.js';
import { EventBus } from '../../adminUtils.js';

export const CatalogActions = {
  // ==========================================
  // 📁 1. الملاحة بين الأقسام (Navigation) - O(1)
  // ==========================================
  'enter-folder': (data) => {
    EventBus.emit('req-update-state', { currFolder: data.enter || data.id });
    EventBus.emit('req-render-prods');
  },
  
  'cat-back': () => {
    const currId = AdminData.currFolder;
    if (currId) {
      const curr = AdminData.data.catsMap?.[currId] || AdminData.data.cats.find(x => String(x.id) === String(currId));
      const parent = (curr && curr.parentId !== 'null' && curr.parentId !== '') ? String(curr.parentId) : null;
      EventBus.emit('req-update-state', { currFolder: parent });
      EventBus.emit('req-render-prods');
    }
  },
  
  // ==========================================
  // 🪟 2. النوافذ المنبثقة (Modals)
  // ==========================================
  'open-cat-modal': (data) => AdminUI?.CatalogUI?.openCategoryModal?.(data.id),
  'open-prod-modal': (data) => CatalogController.openProductModal?.(data.id),
  'open-country-modal': (data) => AdminUI?.CatalogUI?.openCountryModal?.(data.id),
  'open-vault-modal': (data) => AdminUI?.CatalogUI?.openVaultModal?.(data.id),
  
  // ==========================================
  // 💾 3. عمليات الحفظ والحذف (Controllers)
  // ==========================================
  'save-cat': () => CatalogController.saveCat?.(),
  'save-prod': () => CatalogController.saveProd?.(),
  'save-country': () => CatalogController.saveCountry?.(),
  'save-vault': () => CatalogController.saveVaultPool?.(),
  
  // ==========================================
  // ⚙️ 4. تفاعلات بناء المنتجات (Product Builder)
  // ==========================================
  'render-prod-config': () => {
    EventBus.emit('req-update-state', { tempPackages: [] });
    AdminRender?.renderProdConfig?.();
  },
  'add-package': () => CatalogController.addPackage?.(),
  'remove-pkg': (data) => CatalogController.removePkg?.(Number(data.index)),
  'toggle-mock-edit': (data) => AdminUI?.CatalogUI?.toggleMockEdit?.(data.val),
  'toggle-simple-qty': (data) => AdminUI?.CatalogUI?.toggleSimpleQty?.(data.element.checked),
  
  // ==========================================
  // 🎨 5. تفاعلات الواجهة والأشجار (UI & Trees)
  // ==========================================
  'change-grid-layout': (data) => CatalogController.changeGridLayout?.(data.val),
  'toggle-drag-edit': (data) => AdminUI?.CatalogUI?.toggleDragEditMode?.(data.originalEvent),
  'toggle-grid-sync': (data) => CatalogController.toggleGridSync?.(data.element.checked),
  'select-icon': (data) => AdminUI?.CatalogUI?.selectIcon?.(data.element),
  'select-animation': (data) => AdminUI?.CatalogUI?.selectAnimation?.(data.element),
  'toggle-tree-node': (data) => AdminUI?.CatalogUI?.toggleTreeNode?.(data.element),
  'tree-parent-check': (data) => AdminUI?.CatalogUI?.handleTreeParentCheck?.(data.element),
  'tree-child-check': (data) => AdminUI?.CatalogUI?.handleTreeChildCheck?.(data.element),
  'toggle-all-tree': (data) => AdminUI?.CatalogUI?.toggleAllTree?.(data.target),
  'detect-country': (data) => AdminUI?.detectCountryAutoFill?.(data.val, AdminData.data.countries),
  // 🛡️ [مسار مفقود]: التقاط حدث حفظ الترتيب من الواجهة وإرساله للمتحكم
'save-order': (data) => CatalogController.saveNewOrder?.(data.orderArray),
  // ==========================================
  // 🏦 6. إدارة الأكواد التالفة (Defective Vault)
  // ==========================================
  'view-defective-codes': (data) => {
    // 🛡️ بناء الجسر المفقود: استخراج الأكواد التالفة من الخزنة وإرسالها للواجهة
    const pool = AdminData.data.vault?.find(v => String(v.id) === String(data.id));
    if (pool) {
      const defectiveCodes = (pool.codes || []).filter(c => typeof c === 'object' && (c.status === 'defective' || c.status === 'refunded'));
      AdminUI?.CatalogUI?.renderDefectiveCodesModal?.(pool.name, defectiveCodes);
    } else {
      EventBus.emit('req-show-toast', { message: 'تعذر العثور على الصندوق المالي.', type: 'error' });
    }
  },
  'close-defective-modal': () => AdminUI?.CatalogUI?.closeDefectiveModalUI?.()
};