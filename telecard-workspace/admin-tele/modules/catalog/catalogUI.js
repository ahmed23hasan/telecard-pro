// ============================================================================
// 📦 وحدة المنتجات والأقسام (modules/catalog/catalogUI.js) - Cloud-Native V20.2 💎
// 🚀 التحديثات المعمارية (V20.2 - Visibility Control, Pricing Sync & Live Preview):
// 1. Visibility UI Sync 👁️: ربط حالة pr-available و pr-active مع حالة المنتج عند الفتح.
// 2. Single-Supplier Enforcement 🔒: قفل ربط المنتج وباقاته بمورد واحد فقط مع تنبيه فوري.
// 3. Sub-Package Editor & Vault Selector 📦: دعم ربط الخزنة أو كود المورد والسعر الثابت لكل باقة فرعية.
// 4. Vault Accountant UI 💰: دعم عرض وتعبئة تكلفة الكود الواحد وحساب الأصول المجمدة.
// 5. Sub-Cent Pricing Preview ⚡: تمرير نوع المنتج (type) لمحرك التسعير لضمان المعاينة الدقيقة.
// 6. Tree Check Sync 🌳: إصلاح استهداف .tree-group لتحديد الأقسام المتداخلة.
// 7. Zero Double-Escaping 🛡️: منع التشفير المزدوج عند تعديل تسمية حقول المنتج.
// ============================================================================

import { AdminData } from '../../adminData.js'; 
import { CatalogTemplates } from './catalogTemplates.js';
import { Utils, EventBus } from '../../adminUtils.js';
import { UIService } from '../../core/uiService.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { FinancialEngine } from '../../core/financialEngine.js';

export const CatalogUI = {
  dragEditMode: false,
  currentEditPaymentId: null,
  _previousSupplierId: '',
  
  // ---------------------------------------------------------
  // 🗂️ 1. نافذة الأقسام (Categories)
  // ---------------------------------------------------------
  openCategoryModal: function(id = null) {
    const strId = id ? String(id) : null;
    AdminData.tempEditId = strId;
    EventBus.emit('set-temp-edit-id', strId);
    EventBus.emit('req-update-state', { tempEditId: strId, tempImg: null });
    const cat = strId ? (AdminData.data.catsMap?.[strId] || (AdminData.data.cats || []).find(c => String(c.id) === strId)) : null;
    const isSubCat = !!(AdminData.currFolder && AdminData.currFolder !== 'root');

    let modal = document.getElementById('m-cat');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'm-cat';
        modal.className = 'modal-overlay dynamic-auto-destroy';
        document.body.appendChild(modal);
    }

    modal.innerHTML = CatalogTemplates.catEditModal();
    this.setupCategoryModal(cat, isSubCat);
    
    void modal.offsetWidth;
    requestAnimationFrame(() => modal.classList.add('active'));
    
    EventBus.emit('req-open-modal', 'cat');
  },
  
  // ---------------------------------------------------------
  // 📦 2. نافذة المنتجات (Products)
  // ---------------------------------------------------------
  openProductModal: function(id = null) {
    const strId = id ? String(id) : null;
    AdminData.tempEditId = strId;
    EventBus.emit('set-temp-edit-id', strId);
    const prod = strId ? (AdminData.data.prodsMap?.[strId] || (AdminData.data.prods || []).find(p => String(p.id) === strId)) : null;
    const vaultData = AdminData.data.vault || [];

    let modal = document.getElementById('m-prod');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'm-prod';
        modal.className = 'modal-overlay dynamic-auto-destroy';
        document.body.appendChild(modal);
    }

    modal.innerHTML = CatalogTemplates.prodEditModal();
    this.setupProductModal(prod, vaultData);
    
    void modal.offsetWidth;
    requestAnimationFrame(() => modal.classList.add('active'));
    
    EventBus.emit('req-open-modal', 'prod');
  },
  
  // ---------------------------------------------------------
  // 🌍 3. نافذة الدول (Countries)
  // ---------------------------------------------------------
  openCountryModal: function(id = null) {
    const strId = id ? String(id) : null;
    AdminData.tempEditId = strId;
    EventBus.emit('set-temp-edit-id', strId);
    const country = strId ? (AdminData.data.countriesMap?.[strId] || (AdminData.data.countries || []).find(c => String(c.id) === strId)) : null;

    let modal = document.getElementById('m-country');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'm-country';
        modal.className = 'modal-overlay dynamic-auto-destroy';
        document.body.appendChild(modal);
    }

    modal.innerHTML = CatalogTemplates.countryEditModal();
    this.setupCountryModal(country);
    
    void modal.offsetWidth;
    requestAnimationFrame(() => modal.classList.add('active'));
    
    EventBus.emit('req-open-modal', 'country');
  },
  
  // ---------------------------------------------------------
  // 🏦 4. نافذة الخزنة وصناديق الأكواد (Vault)
  // ---------------------------------------------------------
  openVaultModal: function(id = null) {
    const strId = id ? String(id) : null;
    AdminData.tempEditId = strId;
    EventBus.emit('set-temp-edit-id', strId);
    const pool = strId ? (AdminData.data.vaultMap?.[strId] || (AdminData.data.vault || []).find(v => String(v.id) === strId)) : null;

    let modal = document.getElementById('m-vault');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'm-vault';
        modal.className = 'modal-overlay dynamic-auto-destroy';
        document.body.appendChild(modal);
    }

    modal.innerHTML = CatalogTemplates.vaultEditModal();
    this.setupVaultModal(pool);
    
    void modal.offsetWidth;
    requestAnimationFrame(() => modal.classList.add('active'));
    
    EventBus.emit('req-open-modal', 'vault');
  },  
  
  // ==========================================
  // ⚙️ إعدادات النوافذ (Setup Functions)
  // ==========================================
  
  setupCategoryModal: function(cat, isSubCat) {
    const titleEl = document.getElementById('cat-modal-title');
    if (titleEl) titleEl.innerHTML = cat ? '<i class="fa-solid fa-folder-pen me-1"></i> تعديل القسم' : (isSubCat ? '<i class="fa-solid fa-folder-plus me-1"></i> إضافة قسم فرعي' : '<i class="fa-solid fa-folder-plus me-1"></i> إضافة قسم رئيسي');
    
    const nameInput = document.getElementById('c-name');
    if (nameInput) nameInput.value = cat ? cat.name : '';
    
    const catImg = cat ? (cat.img || cat.image) : null;
    const imgEl = document.getElementById('c-img');
    const wrapEl = document.getElementById('c-img-wrap');
    if (catImg && imgEl && wrapEl) {
      imgEl.src = catImg;
      imgEl.classList.remove('hide-element');
      wrapEl.classList.add('has-img');
    } else if (imgEl && wrapEl) {
      imgEl.removeAttribute('src');
      imgEl.classList.add('hide-element');
      wrapEl.classList.remove('has-img');
    }
  },
  
  setupProductModal: function(p, vaultData) {
    const strId = p ? String(p.id) : null;
    const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val !== undefined && val !== null ? val : ''; };
    const safeSetCheck = (elId, checked) => { const el = document.getElementById(elId); if (el) el.checked = Boolean(checked); };
    
    const titleEl = document.getElementById('prod-modal-title');
    if (titleEl) titleEl.innerHTML = strId ? '<i class="fa-solid fa-box-open me-1"></i> تعديل المنتج' : '<i class="fa-solid fa-box-open me-1"></i> إضافة منتج';
    
    safeSetVal('pr-name', p ? p.name : '');
    safeSetVal('pr-desc', p ? (p.description || '') : '');
    safeSetVal('pr-type', p ? p.type : 'simple');
    
    const costInput = document.getElementById('pr-cost');
    if (costInput) {
        costInput.value = p && p.costPrice !== undefined ? p.costPrice : '';
        costInput.addEventListener('input', () => EventBus.emit('req-update-price-preview'));
    }

    const isFixedProd = p ? (p.isFixedPrice === true || String(p.isFixedPrice).toLowerCase() === 'true') : false;
    safeSetCheck('pr-fixed-price', isFixedProd);
    safeSetVal('pr-fixed-val', (p && isFixedProd) ? (p.fixedPriceUsd ?? p.price ?? '') : '');

    const fixedChk = document.getElementById('pr-fixed-price');
    const fixedInput = document.getElementById('pr-fixed-val');
    if (fixedChk) {
        fixedChk.addEventListener('change', () => EventBus.emit('req-update-price-preview'));
    }
    if (fixedInput) {
        fixedInput.addEventListener('input', () => EventBus.emit('req-update-price-preview'));
    }
    
    // 🚀 [الإصلاح المعماري]: تعبئة خيارات التوفر والإظهار
    safeSetVal('pr-min', p ? (p.minQty || 1) : 1);
    safeSetVal('pr-max', p ? (p.maxQty || 1000) : 1000);
    safeSetCheck('pr-allow-qty', p ? (p.allowQty || false) : false);
    safeSetVal('pr-simple-max', p ? (p.simpleMax || 10) : 10);
    safeSetCheck('pr-hide-price', p ? (p.hideGridPrice === true) : false);
    safeSetCheck('pr-available', p ? (p.isManuallyPaused !== true && p.isAvailable !== false) : true);
    safeSetCheck('pr-active', p ? (p.isActive !== false) : true);
    safeSetVal('h-lbl1', p ? (p.input1Label || '') : '');
    safeSetVal('h-lbl2', p ? (p.input2Label || '') : '');

    let vOptionsHtml = '';
    (vaultData || []).forEach(v => {
      const count = Number(v.stockCount || 0);
      vOptionsHtml += `<option value="${Utils.escapeHTML(v.id)}">${Utils.escapeHTML(v.name)} (${count} كود متاح)</option>`;
    });

    const vaultSelect = document.getElementById('pr-vault');
    if (vaultSelect) {
      vaultSelect.innerHTML = '<option value="">-- بدون ربط (منتج يدوي) --</option>' + vOptionsHtml;
      vaultSelect.value = p ? (p.vaultPoolId || '') : '';
    }

    const pkgVaultSelect = document.getElementById('pkg-vault');
    if (pkgVaultSelect) {
      pkgVaultSelect.innerHTML = '<option value="">-- بدون خزنة للباقة (يدوي / مورد) --</option>' + vOptionsHtml;
      pkgVaultSelect.value = '';
    }
    
    const supplierSelect = document.getElementById('pr-supplier');
    if (supplierSelect) {
        let suppHtml = '<option value="">-- بدون ربط (منتج محلي) --</option>';
        const suppliers = AdminData.data.suppliers || [];
        suppliers.forEach(s => {
            suppHtml += `<option value="${Utils.escapeHTML(s.id)}">${Utils.escapeHTML(s.name)}</option>`;
        });
        supplierSelect.innerHTML = suppHtml;
        
        const initialSuppId = p ? String(p.supplierId || '') : '';
        this._previousSupplierId = initialSuppId;
        safeSetVal('pr-supplier', initialSuppId);
        safeSetVal('pr-supplier-prod-id', p ? (p.externalId || '') : '');
        
        this.toggleSupplierLink(supplierSelect, true);
    }
    
    const prodImg = p ? (p.img || p.image) : null;
    const imgEl = document.getElementById('pr-img');
    const wrapEl = document.getElementById('pr-img-wrap');
    if (prodImg && imgEl && wrapEl) {
      imgEl.src = prodImg;
      imgEl.classList.remove('hide-element');
      wrapEl.classList.add('has-img');
    } else if (imgEl && wrapEl) {
      imgEl.removeAttribute('src');
      imgEl.classList.add('hide-element');
      wrapEl.classList.remove('has-img');
    }
  },

  toggleSupplierLink: async function(selectEl, isInitialSetup = false) {
    if (!selectEl) return;
    const newSuppId = String(selectEl.value || '').trim();

    if (!isInitialSetup && this._previousSupplierId && newSuppId !== this._previousSupplierId) {
      const hasLinkedPkgs = Array.isArray(AdminRender?.CatalogRender?.state?.tempPackages) &&
        AdminRender.CatalogRender.state.tempPackages.some(pkg => pkg && (pkg.externalId || pkg.supplierId));
      if (hasLinkedPkgs) {
        const msg = newSuppId
          ? `⚠️ تنبيه وحدة الموردين:\nالباقات الفرعية الحالية مربوطة بالمورد السابق.\nفي نظام الحماية، يجب أن يتبع المنتج الأب وجميع باقاته الفرعية نفس المورد فقط.\n\nهل تريد توحيد جميع الباقات تحت المورد الجديد؟`
          : `⚠️ تنبيه فك ارتباط المورد:\nإلغاء ربط المورد عن المنتج الأب سيقوم بتحويل المنتج وجميع باقاته إلى منتجات محلية.\n\nهل أنت متأكد؟`;
        const confirmed = await UIService.showConfirm(msg, 'حماية وحدة المورد للمنتج وباقاته');
        if (!confirmed) {
          selectEl.value = this._previousSupplierId;
          return;
        }
      }
    }
    this._previousSupplierId = newSuppId;

    const costInput = document.getElementById('pr-cost');
    const extIdInput = document.getElementById('pr-supplier-prod-id');
    const extWrap = document.getElementById('pr-supplier-ext-wrap') || extIdInput?.parentElement;
    const vaultSelect = document.getElementById('pr-vault');
    const pkgVaultSelect = document.getElementById('pkg-vault');
    const pkgExtInput = document.getElementById('pkg-ext-id');
    const prodType = document.getElementById('pr-type')?.value || 'simple';
    
    if (newSuppId !== '') {
      if (costInput) {
        costInput.readOnly = false;
        costInput.title = 'سيتم تحديث التكلفة آلياً عند مزامنة المورد، أو يمكنك إدخال تكلفة مبدئية';
      }
      if (extWrap) {
        extWrap.classList.toggle('hide-element', prodType === 'select');
      }
      if (vaultSelect) {
        vaultSelect.value = '';
        vaultSelect.disabled = true;
        vaultSelect.title = 'هذا المنتج مرتبط بمورد مباشر (لا يمكن ربطه بخزنة محلية في نفس الوقت)';
      }
      if (pkgVaultSelect) {
        pkgVaultSelect.value = '';
        pkgVaultSelect.disabled = true;
        pkgVaultSelect.title = 'المنتج مرتبط بمورد خارجي (استخدم كود الباقة عند المورد بدلاً من الخزنة المحلية)';
      }
      if (pkgExtInput) {
        pkgExtInput.disabled = false;
        pkgExtInput.classList.remove('hide-element');
      }
    } else {
      if (costInput) {
        costInput.readOnly = false;
        costInput.classList.remove('disabled-input');
        costInput.title = '';
      }
      if (extWrap) extWrap.classList.add('hide-element');
      if (vaultSelect) {
        vaultSelect.disabled = false;
        vaultSelect.title = '';
      }
      if (pkgVaultSelect) {
        pkgVaultSelect.disabled = false;
        pkgVaultSelect.title = '';
      }
      if (pkgExtInput) {
        pkgExtInput.value = '';
        pkgExtInput.disabled = true;
        pkgExtInput.classList.add('hide-element');
      }
    }
    
    EventBus.emit('req-update-price-preview');
  },

  populatePackageForEdit: function(pkg, index) {
    if (!pkg) return;
    const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val !== undefined && val !== null ? val : ''; };

    safeSetVal('pkg-edit-index', index);
    safeSetVal('pkg-name', pkg.name || '');
    safeSetVal('pkg-price', pkg.costPrice ?? pkg.cost_price ?? pkg.price ?? '');
    const isFixed = Boolean(pkg.isFixedPrice === true || String(pkg.isFixedPrice).toLowerCase() === 'true');
    safeSetVal('pkg-fixed-price', isFixed ? (pkg.fixedPriceUsd ?? pkg.price ?? '') : '');
    safeSetVal('pkg-vault', pkg.vaultPoolId || '');
    safeSetVal('pkg-ext-id', pkg.externalId || '');

    const addBtn = document.getElementById('btn-add-pkg');
    if (addBtn) {
      addBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
      addBtn.classList.remove('btn-success');
      addBtn.classList.add('btn-primary');
      addBtn.title = 'حفظ تعديل الباقة';
    }
    document.getElementById('pkg-name')?.focus();
  },

  setupCountryModal: function(country) {
    const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val !== undefined && val !== null ? val : ''; };
    const safeSetCheck = (elId, checked) => { const el = document.getElementById(elId); if (el) el.checked = Boolean(checked); };
    
    const titleEl = document.getElementById('country-modal-title');
    if (titleEl) titleEl.innerHTML = country ? '<i class="fa-solid fa-globe"></i> تعديل دولة' : '<i class="fa-solid fa-plus"></i> إضافة دولة جديدة';
    
    safeSetVal('country-edit-id', country ? country.id : '');
    safeSetVal('country-name', country ? country.name : '');
    safeSetVal('country-code', country ? country.code : '');
    safeSetVal('country-flag', country ? country.flag : '');
    safeSetVal('country-dial', country ? country.dialCode : '');
    safeSetVal('country-phone-len', country ? country.phoneLen : '');
    
    const codeInput = document.getElementById('country-code');
    if (codeInput) codeInput.disabled = !!country;
    
    safeSetCheck('country-active', country ? country.isActive !== false : true);
    safeSetCheck('country-banned', country ? country.isBanned : false);
  },

  setupVaultModal: function(pool) {
    const isEdit = !!pool;
    const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val !== undefined && val !== null ? val : ''; };
    
    safeSetVal('v-pool-id', pool ? pool.id : '');
    safeSetVal('v-name', pool ? pool.name : '');
    safeSetVal('v-unit-cost', pool ? (pool.unitCostUsd ?? pool.costPrice ?? '') : '');
    safeSetVal('v-alert-limit', pool ? (pool.alertLimit || 5) : 5);
    safeSetVal('v-codes', '');
    
    const titleEl = document.getElementById('vault-modal-title');
    if (titleEl) titleEl.innerHTML = isEdit ? '<i class="fa-solid fa-box-open"></i> إدارة وإضافة أكواد للصندوق' : '<i class="fa-solid fa-plus"></i> إنشاء صندوق جديد';
    
    const statsArea = document.getElementById('v-stats-area');
    if (statsArea) {
      if (isEdit) {
        const availCount = Number(pool.stockCount || 0);
        const defectCount = Number(pool.burnedCount || 0);
        const totalAdded = Number(pool.totalCount || availCount);
        const unitCost = Number(pool.unitCostUsd ?? pool.costPrice ?? 0);
        const frozenUsd = availCount > 0 && unitCost > 0 ? (availCount * unitCost) : 0;
        
        let soldCount = Math.max(0, totalAdded - availCount - defectCount);
        
        const availEl = document.getElementById('v-stat-avail');
        const soldEl = document.getElementById('v-stat-sold');
        const frozenEl = document.getElementById('v-stat-frozen');
        if (availEl) availEl.innerText = availCount;
        if (soldEl) soldEl.innerText = soldCount;
        if (frozenEl) frozenEl.innerHTML = RenderHelpers.formatMoney(frozenUsd, 'USD', 2);

        const costInput = document.getElementById('v-unit-cost');
        if (costInput && frozenEl) {
          costInput.addEventListener('input', () => {
            const liveCost = parseFloat(costInput.value) || 0;
            frozenEl.innerHTML = RenderHelpers.formatMoney(availCount * Math.max(0, liveCost), 'USD', 2);
          });
        }
        
        let financialBox = document.getElementById('v-financial-stats');
        if (!financialBox) {
          financialBox = document.createElement('div');
          financialBox.id = 'v-financial-stats';
          financialBox.className = 'mt-10 p-10 vault-financial-box';
          statsArea.appendChild(financialBox);
        }
        
        financialBox.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-success"></i> <span class="text-muted">جاري حساب أرباح هذا الصندوق من السيرفر...</span>`;
        statsArea.classList.remove('hide-element');
        
        import('./catalogController.js').then(({ CatalogController }) => {
          CatalogController.fetchVaultFinancials(pool.id).then(financials => {
            const currentModalId = document.getElementById('v-pool-id')?.value;
            if (currentModalId === pool.id) {
              const profitHtml = RenderHelpers.formatMoney(financials.profit, 'USD', 2);
              const revenueHtml = RenderHelpers.formatMoney(financials.revenue, 'USD', 2);
              financialBox.innerHTML = `
                  <div class="flex-between align-items-center mb-5">
                      <span class="fw-bold text-success"><i class="fa-solid fa-sack-dollar"></i> صافي الأرباح المحققة:</span>
                      <span class="num-en fw-bold text-success" dir="ltr">${profitHtml}</span>
                  </div>
                  <div class="flex-between align-items-center">
                      <span class="text-muted"><i class="fa-solid fa-chart-line"></i> إجمالي المبيعات:</span>
                      <span class="num-en text-muted" dir="ltr">${revenueHtml}</span>
                  </div>`;
            }
          });
        });
      } else {
        statsArea.classList.add('hide-element');
        const financialBox = document.getElementById('v-financial-stats');
        if (financialBox) financialBox.remove();
      }
    }
  },

  // ==========================================
  // 🛠️ تفاعلات واجهة المستخدم العامة
  // ==========================================

  toggleDragEditMode: function(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    this.dragEditMode = !this.dragEditMode;
    if (this.dragEditMode) document.body.classList.add('drag-edit-active');
    else document.body.classList.remove('drag-edit-active');
    
    const allContainers = document.querySelectorAll('.sortable-container,.cats-grid,.prods-grid, #banner-grid');
    allContainers.forEach(c => {
      if (c.sortableInstance) c.sortableInstance.option('disabled', !this.dragEditMode);
    });
    
    const editModeBtn = document.getElementById('drag-edit-mode-btn');
    if (editModeBtn) {
        if (this.dragEditMode) {
          editModeBtn.classList.add('active');
          editModeBtn.innerHTML = CatalogTemplates.dragEditBtnContent(true);
          UIService.showToast('وضع الترتيب مفعّل - اسحب العناصر بحرية', 'info');
        } else {
          editModeBtn.classList.remove('active');
          editModeBtn.innerHTML = CatalogTemplates.dragEditBtnContent(false);
          UIService.showToast('تم إغلاق القفل وحفظ الترتيب بنجاح', 'success');
        }
    }
    
    document.querySelectorAll('.item-box,.banner-item').forEach(card => {
      if (this.dragEditMode) card.classList.add('drag-enabled');
      else card.classList.remove('drag-enabled');
    });
    
    if (!this.dragEditMode) {
      if (document.getElementById('view-ads') && document.getElementById('view-ads').classList.contains('active')) {
        EventBus.emit('req-render-banners');
      } else {
        EventBus.emit('req-render-prods');
      }
    }
    return false;
  },

  toggleMockEdit: function(num) {
    const txtEl = document.getElementById(`mock-txt-${num}`);
    const iconEl = document.getElementById(`mock-icon-${num}`);
    if (!txtEl || !iconEl) return;
    
    if (iconEl.classList.contains('fa-pen')) {
      const currentVal = txtEl.innerText;
      txtEl.innerHTML = CatalogTemplates.mockEditInput(num, currentVal);
      iconEl.className = 'fa-solid fa-check text-success';
      
      setTimeout(() => {
        const inp = document.getElementById(`mock-input-${num}`);
        if (inp) {
          inp.focus();
          inp.onclick = (e) => e.stopPropagation();
          inp.onkeypress = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const triggerBtn = document.querySelector(`[data-action="toggle-mock-edit"][data-val="${num}"]`);
              if (triggerBtn) triggerBtn.click();
            }
          };
        }
      }, 50);
    } else {
      const inputEl = document.getElementById(`mock-input-${num}`);
      const newVal = inputEl ? inputEl.value.trim() : '';
      txtEl.innerText = newVal || 'حقل إدخال';
      iconEl.className = 'fa-solid fa-pen';
      const hiddenLbl = document.getElementById(`h-lbl${num}`);
      if (hiddenLbl) hiddenLbl.value = newVal;
    }
  },

  toggleSimpleQty: function(isChecked) {
    const maxInput = document.getElementById('pr-simple-max');
    if (maxInput) {
        const wrapper = maxInput.closest('.form-group');
        if (wrapper) {
            if (isChecked) wrapper.classList.remove('hide-element');
            else wrapper.classList.add('hide-element');
        }
    }
  },

  selectIcon: function(el) {
    if (!el) return;
    document.querySelectorAll('.is-opt').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
  },
  
  selectAnimation: function(el) {
    if (!el) return;
    document.querySelectorAll('.anim-opt').forEach(a => a.classList.remove('active'));
    el.classList.add('active');
  },

  hasImage: function(wrapperId) {
      const wrap = document.getElementById(wrapperId);
      return wrap ? wrap.classList.contains('has-img') : false;
  },

  clearPackageInputs: function() {
      const idxEl = document.getElementById('pkg-edit-index');
      const n = document.getElementById('pkg-name');
      const p = document.getElementById('pkg-price');
      const fp = document.getElementById('pkg-fixed-price');
      const v = document.getElementById('pkg-vault');
      const ext = document.getElementById('pkg-ext-id');
      if (idxEl) idxEl.value = '-1';
      if (n) n.value = '';
      if (p) p.value = '';
      if (fp) fp.value = '';
      if (v) v.value = '';
      if (ext) ext.value = '';

      const addBtn = document.getElementById('btn-add-pkg');
      if (addBtn) {
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        addBtn.classList.remove('btn-primary');
        addBtn.classList.add('btn-success');
        addBtn.title = 'إضافة الباقة';
      }
  },

  updateGridCssCols: function(cols) {
      document.querySelectorAll('.cats-grid,.prods-grid,.prod-grid-stack, #prod-grid').forEach(el => {
          el.style.setProperty('--layout-cols', cols);
      });
  },

  renderPricePreview: function(type, cost, tiers, pkgs, EngineRef) {
      const previewContainer = document.getElementById('universal-price-preview');
      if (!previewContainer) return;
      
      const safeEngine = EngineRef || window.FinancialEngine || FinancialEngine;
      if (!safeEngine) return;
      
      const isFixed = document.getElementById('pr-fixed-price')?.checked || false;
      const fixedVal = parseFloat(Utils.getVal('pr-fixed-val', cost)) || cost;
      const supplierId = document.getElementById('pr-supplier')?.value;

      let html = '<div class="fs-12 fw-bold text-primary mb-10"><i class="fa-solid fa-eye"></i> المعاينة الحية لأسعار المستويات:</div>';

      if (type !== 'select') {
          if (cost <= 0 && !isFixed) {
              if (supplierId) {
                  previewContainer.innerHTML = '<div class="preview-mini-empty api-preview-box text-info fs-11 mt-10 text-center p-15"><i class="fa-solid fa-robot fa-2x mb-10 text-info"></i><br><b>تسعير آلي (API)</b><br>سيتم جلب تكلفة المنتج آلياً من المورد وحساب أسعار المستويات بناءً عليها فور حفظ المنتج أو مزامنة المورد.</div>';
              } else {
                  previewContainer.innerHTML = '<div class="preview-mini-empty text-muted fs-11 mt-10 text-center"><i class="fa-solid fa-calculator"></i> أدخل تكلفة المنتج بالأعلى لرؤية أسعار البيع للعملاء</div>';
              }
              return; 
          }
          
          html += '<div class="preview-tiers-grid">';
          tiers.forEach(tier => {
              try {
                  const dummyProduct = { type: type, costPrice: cost, isFixedPrice: isFixed, price: fixedVal, fixedPriceUsd: isFixed ? fixedVal : 0 };
                  const pricing = safeEngine.calculatePrice({ product: dummyProduct, tier: tier });
                  const isViolated = pricing.isFirewallViolated;
                  html += `
                      <div class="preview-tier-card text-center ${isViolated ? 'border-danger' : ''}">
                          <div class="fs-11 fw-bold text-main mb-10">
                              <i class="fa-solid ${Utils.escapeHTML(tier.icon || 'fa-user')} text-gold"></i> ${Utils.escapeHTML(tier.name)}
                          </div>
                          <div class="num-en ${isViolated ? 'text-danger' : 'text-success'} fw-bold" dir="ltr">${pricing.finalPrice} $</div>
                          <div class="num-en text-muted fs-9" dir="ltr">${isViolated ? '<span class="text-danger">أقل من التكلفة!</span>' : `ربحك: <span class="text-success">+${pricing.netProfitUsd}</span> $`}</div>
                      </div>`;
              } catch (e) {}
          });
          html += '</div>';
          
      } else {
          if (pkgs.length === 0) { 
              previewContainer.innerHTML = '<div class="preview-mini-empty text-muted fs-11 mt-10 text-center"><i class="fa-solid fa-layer-group"></i> أضف باقات بالأسفل لرؤية تسعير كل باقة على حدة</div>'; 
              return; 
          }
          
          html += '<div class="preview-pkg-list">';
          (pkgs || []).forEach((pkg) => {
              const pkgCost = parseFloat(pkg.costPrice ?? pkg.cost_price ?? pkg.price) || 0; 
              const pkgIsFixed = Boolean(pkg.isFixedPrice === true || String(pkg.isFixedPrice).toLowerCase() === 'true');
              const pkgFixedVal = pkgIsFixed ? (parseFloat(pkg.fixedPriceUsd ?? pkg.price) || pkgCost) : pkgCost;

              let pkgHtml = `
                  <div class="preview-pkg-card">
                      <div class="preview-pkg-header">
                          <span class="fw-bold fs-12"><i class="fa-solid fa-box text-info"></i> ${Utils.escapeHTML(pkg.name)}</span>
                          <span class="num-en text-danger fs-11" dir="ltr">التكلفة: ${pkgCost}$</span>
                      </div>
                      <div class="preview-mini-grid">`;
              
              tiers.forEach(tier => {
                  try {
                      const dummyOptProd = { type: type, costPrice: pkgCost, isFixedPrice: pkgIsFixed, price: pkgFixedVal, fixedPriceUsd: pkgIsFixed ? pkgFixedVal : 0 };
                      const pricing = safeEngine.calculatePrice({ product: dummyOptProd, tier: tier });
                      const isViolated = pricing.isFirewallViolated;
                      pkgHtml += `
                              <div class="preview-micro-card text-center ${isViolated ? 'border-danger' : ''}">
                                  <div class="fs-10 text-main mb-10">
                                      <i class="fa-solid ${Utils.escapeHTML(tier.icon || 'fa-user')} text-gold"></i> ${Utils.escapeHTML(tier.name)}
                                  </div>
                                  <div class="num-en ${isViolated ? 'text-danger' : 'text-success'} fw-bold fs-12" dir="ltr">${pricing.finalPrice}$</div>
                                  <div class="num-en text-muted fs-9" dir="ltr">${isViolated ? '<span class="text-danger">خاسر!</span>' : `ربحك: <span class="text-success">+${pricing.netProfitUsd}</span> $`}</div>
                              </div>`;
                  } catch (e) {}
              });
              
              pkgHtml += `</div></div>`; 
              html += pkgHtml;
          });
          html += '</div>';
      }
      
      previewContainer.innerHTML = html;
  },
  
  toggleTreeNode: function(element) {
    const node = element?.closest('.tree-node, .tree-group');
    if (node) node.classList.toggle('is-expanded');
  },
  
  handleTreeParentCheck: function(parentCheckbox) {
    const node = parentCheckbox?.closest('.tree-node, .tree-group');
    if (!node) return;
    const isChecked = parentCheckbox.checked;
    const childCheckboxes = node.querySelectorAll('.tree-child-cb');
    childCheckboxes.forEach(cb => { cb.checked = isChecked; });
    parentCheckbox.indeterminate = false;
    
    if (window.AdminUI?.MarketingUI?.visualConfig?.storyEnabled) {
      window.AdminUI.MarketingUI.renderStoryProductsTree?.();
    }
  },
  
  handleTreeChildCheck: function(childCheckbox) {
    const node = childCheckbox?.closest('.tree-node, .tree-group');
    if (!node) return;
    const parentCheckbox = node.querySelector('.tree-parent-cb');
    if (parentCheckbox) {
      const allChildren = Array.from(node.querySelectorAll('.tree-child-cb'));
      const checkedChildren = allChildren.filter(cb => cb.checked).length;
      const totalChildren = allChildren.length;
      
      if (checkedChildren === 0) {
        parentCheckbox.checked = false;
        parentCheckbox.indeterminate = false;
      } else if (checkedChildren === totalChildren) {
        parentCheckbox.checked = true;
        parentCheckbox.indeterminate = false;
      } else {
        parentCheckbox.checked = false;
        parentCheckbox.indeterminate = true;
      }
    }
    
    if (window.AdminUI?.MarketingUI?.visualConfig?.storyEnabled) {
      window.AdminUI.MarketingUI.renderStoryProductsTree?.();
    }
  },

  toggleAllTree: function(targetId) {
    const cbs = document.querySelectorAll(`#${targetId} .tree-parent-cb, #${targetId} .tree-child-cb`);
    if (cbs.length > 0) {
      const state = !cbs[0].checked;
      cbs.forEach(cb => { 
        cb.checked = state;
        cb.indeterminate = false; 
      });
    }
  },

  // ==========================================
  // 🐛 نوافذ الأكواد التالفة (Defective Vault)
  // ==========================================
  renderDefectiveCodesModal: function(poolName, defectiveCodes, isLoadMore = false, hasMore = false, poolId = null) {
      const codesHtml = CatalogTemplates.defectiveCodesList(defectiveCodes);

      if (isLoadMore) {
          const listContainer = document.getElementById('defective-codes-list');
          if (listContainer) listContainer.insertAdjacentHTML('beforeend', codesHtml);

          const btn = document.getElementById('btn-load-more-defective');
          if (!hasMore && btn) btn.remove();
      } else {
          const oldOverlay = document.getElementById('defective-codes-overlay');
          if (oldOverlay) oldOverlay.remove();
          
          const html = CatalogTemplates.defectiveModal(poolName, codesHtml, hasMore);
          document.body.insertAdjacentHTML('beforeend', html);
          
          const overlay = document.getElementById('defective-codes-overlay');
          if (overlay) {
            overlay.classList.add('dynamic-auto-destroy');
            overlay.style.display = 'flex';
            setTimeout(() => { overlay.classList.add('active'); }, 10);
          }
      }
  },
  
  closeDefectiveModalUI: function() {
    if (window.AdminUI && window.AdminUI.closeModal) {
        window.AdminUI.closeModal('defective-codes-overlay');
    }
    if (window._loadMoreDefective) delete window._loadMoreDefective;
  }, 
  
  // ==========================================
  // 🛡️ حماية الذاكرة العشوائية (RAM Shield)
  // ==========================================
  _activeSortables: {},
  
  initSortableEngine: function(container, type) {
  if (!window.Sortable) {
    console.warn("🚨 مكتبة SortableJS غير موجودة! يرجى إضافتها في admin.html");
    return;
  }
  
  const containerId = container.id || `sortable_${type || 'default'}`;
  if (this._activeSortables[containerId]) {
    this._activeSortables[containerId].destroy();
    delete this._activeSortables[containerId];
  }
  
  const isBannerGrid = (type === 'banner' || containerId === 'banner-grid');
  
  const instance = new window.Sortable(container, {
    animation: 200,
    disabled: isBannerGrid ? false : !this.dragEditMode,
    ...(isBannerGrid ? { handle: '.banner-drag-handle' } : {}),
    ghostClass: 'sortable-ghost',
    delay: window.innerWidth < 992 ? 150 : 0,
    delayOnTouchOnly: true,
    
    onEnd: (evt) => {
      const items = Array.from(container.children);
      const orderArray = items.map((item, index) => ({
        id: item.getAttribute('data-id'),
        type: item.getAttribute('data-type') || type,
        order: index
      }));
      
      EventBus.emit('action-triggered', { action: 'save-sort-order', orderArray });
      if (window.ClientSystem && window.ClientSystem.sfx) window.ClientSystem.sfx('success');
    }
  });
  
  this._activeSortables[containerId] = instance;
}
};
