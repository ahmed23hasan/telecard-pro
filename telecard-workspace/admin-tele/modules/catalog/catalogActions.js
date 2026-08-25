// ============================================================================
// 📦 خريطة مسارات الكتالوج (Catalog Actions Router) - النسخة الماسية V14.8 💎
// 🌟 التحديث الأقصى: 
// 1. [Storage Fix]: توجيه الملاحة بـ EventBus نقي.
// 2. [Lazy Loading]: جلب الأكواد التالفة من السحابة مباشرة لتخفيف الضغط.
// 3. [Syntax Patch]: إغلاق ثغرة الاستيراد وفصل السطور برمجياً.
// ============================================================================

import { CatalogController } from './catalogController.js';
import { AdminUI } from '../../adminUI.js';
import { AdminRender } from '../../adminRender.js';
import { AdminData } from '../../adminData.js';
import { EventBus } from '../../adminUtils.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';

export const CatalogActions = {
  // ==========================================
  // 📁 1. الملاحة بين الأقسام
  // ==========================================
  'enter-folder': (data) => {
    EventBus.emit('req-update-state', { currFolder: data.enter || data.id });
    EventBus.emit('req-render-prods');
  },
  'cat-back': () => EventBus.emit('req-go-back'),
  
  // ==========================================
  // 🪟 2. النوافذ المنبثقة
  // ==========================================
  'open-cat-modal': (data) => AdminUI?.CatalogUI?.openCategoryModal?.(data.id),
  'open-prod-modal': (data) => CatalogController.openProductModal?.(data.id),
  'open-country-modal': (data) => AdminUI?.CatalogUI?.openCountryModal?.(data.id),
  'open-vault-modal': (data) => AdminUI?.CatalogUI?.openVaultModal?.(data.id),
  
  // ==========================================
  // 💾 3. عمليات الحفظ والحذف
  // ==========================================
  'save-cat': () => CatalogController.saveCat?.(),
  'save-prod': () => CatalogController.saveProd?.(),
  'save-country': () => CatalogController.saveCountry?.(),
  'save-vault': () => CatalogController.saveVaultPool?.(),
  
  // ==========================================
  // ⚙️ 4. تفاعلات بناء المنتجات
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
  // 🎨 5. تفاعلات الواجهة والأشجار
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
  'save-order': (data) => CatalogController.saveNewOrder?.(data.orderArray),
  
  // ==========================================
  // 🏦 6. إدارة الأكواد التالفة (Defective Vault)
  // ==========================================
  'view-defective-codes': async (data) => {
    const poolId = String(data.id);
    const pool = AdminData.data.vault?.find(v => String(v.id) === poolId);
    
    if (!pool) return EventBus.emit('req-show-toast', { message: 'الصندوق غير موجود', type: 'error' });
    
    if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري جلب الأكواد التالفة من السحابة...');
    try {
      const defectiveCodes = await FirebaseAdapter.getAll('telecard_vault_returned', 100, 1);
      const filteredCodes = defectiveCodes.filter(c => String(c.originalPoolId) === poolId);
      
      AdminUI?.CatalogUI?.renderDefectiveCodesModal?.(pool.name, filteredCodes);
    } catch (e) {
      EventBus.emit('req-show-toast', { message: 'فشل جلب السجلات من السحابة', type: 'error' });
    } finally {
      if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
    }
  },
  
  'close-defective-modal': () => AdminUI?.CatalogUI?.closeDefectiveModalUI?.()
  
}; // نهاية الملف