// ============================================================================
// 📦 وحدة المنتجات والأقسام (modules/catalog/catalogUI.js)
// 🎯 الوظيفة: التعديل المباشر، شجرة الأقسام، وتهيئة نوافذ الكتالوج (DOM Isolation)
// ============================================================================

import { AdminData } from '../../adminData.js'; 
import { Utils, EventBus } from '../../adminUtils.js';
import { AdminTemplates } from '../../adminTemplates.js';
import { UIService } from '../../core/uiService.js';

export const CatalogUI = {
  dragEditMode: false,
  
  // =========================================================
  // 🪟 1. دوال فتح النوافذ المنبثقة (Modal Triggers)
  // =========================================================
  
  // =========================================================
// 🪟 1. دوال فتح النوافذ المنبثقة (Modal Triggers - O(1) Optimized)
// =========================================================

openCategoryModal: function(id = null) {
    EventBus.emit('set-temp-edit-id', id);
    // ⚡ جلب سريع جداً بـ O(1)
    const cat = id ? (AdminData.data.catsMap?.[id] || (AdminData.data.cats || []).find(c => String(c.id) === String(id))) : null;
    const isSubCat = window.AdminApp ? !!window.AdminApp.currFolder : false;
    this.setupCategoryModal(cat, isSubCat);
    EventBus.emit('req-open-modal', 'cat');
  },
  
  openProductModal: function(id = null) {
    EventBus.emit('set-temp-edit-id', id);
    // ⚡ جلب سريع جداً بـ O(1)
    const prod = id ? (AdminData.data.prodsMap?.[id] || (AdminData.data.prods || []).find(p => String(p.id) === String(id))) : null;
    const vaultData = AdminData.data.vault || [];
    this.setupProductModal(prod, vaultData);
    EventBus.emit('req-open-modal', 'prod');
  },
  
  openCountryModal: function(id = null) {
    EventBus.emit('set-temp-edit-id', id);
    // ⚡ جلب سريع جداً بـ O(1)
    const country = id ? (AdminData.data.countriesMap?.[id] || (AdminData.data.countries || []).find(c => String(c.id) === String(id))) : null;
    this.setupCountryModal(country);
    EventBus.emit('req-open-modal', 'country');
  },
  
  openVaultModal: function(id = null) {
    EventBus.emit('set-temp-edit-id', id);
    const pool = id ? (AdminData.data.vault || []).find(v => String(v.id) === String(id)) : null;
    this.setupVaultModal(pool);
    EventBus.emit('req-open-modal', 'vault');
  },  // =========================================================
  // 🎨 2. تهيئة النوافذ المنبثقة (Modal Setups) - DOM Isolation
  // =========================================================
  
  setupCategoryModal: function(cat, isSubCat) {
    const titleEl = document.getElementById('cat-modal-title');
    if (titleEl) titleEl.innerText = cat ? 'تعديل القسم' : (isSubCat ? 'إضافة قسم فرعي' : 'إضافة قسم');
    
    const nameInput = document.getElementById('c-name');
    if (nameInput) nameInput.value = cat ? cat.name : '';
    
    const imgEl = document.getElementById('c-img');
    const wrapEl = document.getElementById('c-img-wrap');
    if (cat && cat.img && imgEl && wrapEl) {
      imgEl.src = cat.img;
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
    const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
    const safeSetCheck = (elId, checked) => { const el = document.getElementById(elId); if (el) el.checked = checked; };
    
    const titleEl = document.getElementById('prod-modal-title');
    if (titleEl) titleEl.innerText = strId ? 'تعديل المنتج' : 'إضافة منتج';
    
    safeSetVal('pr-name', p ? p.name : '');
    safeSetVal('pr-desc', p ? p.description : '');
    safeSetVal('pr-type', p ? p.type : 'simple');
    safeSetVal('pr-cost', p ? (p.costPrice || p.unitCost || 0) : '');
    safeSetVal('pr-min', p ? (p.minQty || 1) : 1);
    safeSetVal('pr-max', p ? (p.maxQty || 1000) : 1000);
    safeSetCheck('pr-allow-qty', p ? (p.allowQty || false) : false);
    safeSetVal('pr-simple-max', p ? (p.simpleMax || 10) : 10);
    safeSetCheck('pr-hide-price', p ? (p.hideGridPrice === true) : false);
    safeSetVal('h-lbl1', p ? (p.input1Label || '') : '');
    safeSetVal('h-lbl2', p ? (p.input2Label || '') : '');
    
    const vaultSelect = document.getElementById('pr-vault');
    if (vaultSelect) {
      let vHtml = '<option value="">-- بدون ربط (منتج يدوي) --</option>';
      (vaultData || []).forEach(v => {
        const count = v.codes ? v.codes.length : 0;
        vHtml += `<option value="${Utils.escapeHTML(v.id)}">${Utils.escapeHTML(v.name)} (${count} كود متاح)</option>`;
      });
      vaultSelect.innerHTML = vHtml;
      vaultSelect.value = p ? (p.vaultPoolId || '') : '';
    }
    
    const imgEl = document.getElementById('pr-img');
    const wrapEl = document.getElementById('pr-img-wrap');
    if (p && p.img && imgEl && wrapEl) {
      imgEl.src = p.img;
      imgEl.classList.remove('hide-element');
      wrapEl.classList.add('has-img');
        } else if (imgEl && wrapEl) {
      imgEl.removeAttribute('src');
      imgEl.classList.add('hide-element');
      wrapEl.classList.remove('has-img');
    }

  },
  
  setupCountryModal: function(country) {
    const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
    const safeSetCheck = (elId, checked) => { const el = document.getElementById(elId); if (el) el.checked = checked; };
    
    const titleEl = document.getElementById('country-modal-title');
    if (titleEl) titleEl.innerHTML = country ? '<i class="fa-solid fa-globe"></i> تعديل دولة' : '<i class="fa-solid fa-plus"></i> إضافة دولة جديدة';
    
    safeSetVal('country-edit-id', country ? country.id : '');
    safeSetVal('country-name', country ? (country.name || country.nameAr) : '');
    safeSetVal('country-code', country ? (country.code || country.id) : '');
    safeSetVal('country-flag', country ? (country.flag || country.flagEmoji) : '');
    safeSetVal('country-dial', country ? country.dialCode : '');
    safeSetVal('country-phone-len', country ? country.phoneLen : '');
    
    const codeInput = document.getElementById('country-code');
    if (codeInput) codeInput.disabled = !!country;
    
    safeSetCheck('country-active', country ? country.isActive !== false : true);
    safeSetCheck('country-banned', country ? country.isBanned : false);
  },

  setupVaultModal: function(pool) {
    const isEdit = !!pool;
    const safeSetVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
    
    safeSetVal('v-pool-id', pool ? pool.id : '');
    safeSetVal('v-name', pool ? pool.name : '');
    safeSetVal('v-alert-limit', pool ? (pool.alertLimit || 5) : 5);
    
    let availableCodesText = '';
    if (pool && pool.codes) {
      const avail = pool.codes.filter(c => typeof c === 'string' || c.status === 'available');
      availableCodesText = avail.map(c => typeof c === 'string' ? c : c.text).join('\n');
    }
    safeSetVal('v-codes', availableCodesText);
    
    const titleEl = document.getElementById('vault-modal-title');
    if (titleEl) titleEl.innerHTML = isEdit ? '<i class="fa-solid fa-box-open"></i> تعديل الصندوق' : '<i class="fa-solid fa-plus"></i> إنشاء صندوق جديد';
  },
  
  // =========================================================
  // ⚙️ 3. التعديلات المباشرة وأدوات المساعدة (Helpers)
  // =========================================================
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
        editModeBtn.innerHTML = AdminTemplates.dragEditBtnContent(true);
        UIService.showToast('وضع الترتيب مفعّل - اسحب العناصر بحرية', 'info');
      } else {
        editModeBtn.classList.remove('active');
        editModeBtn.innerHTML = AdminTemplates.dragEditBtnContent(false);
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
      const currentVal = Utils.escapeHTML(txtEl.innerText);
      txtEl.innerHTML = AdminTemplates.mockEditInput(num, currentVal);
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
      const n = document.getElementById('pkg-name');
      const p = document.getElementById('pkg-price');
      if(n) n.value = '';
      if(p) p.value = '';
  },

  updateGridCssCols: function(cols) {
      document.querySelectorAll('.cats-grid,.prods-grid,.prod-grid-stack, #prod-grid').forEach(el => {
          el.style.setProperty('--layout-cols', cols);
      });
  },

  // 🌟 إضافة منطق الحقول المنقول من الموجه
  toggleSimpleQty: function(isChecked) {
    const limitBox = document.getElementById('simple-qty-limit-box');
    if (limitBox) limitBox.classList.toggle('hide-element', !isChecked);
  },

  // 🌟 دالة المعاينة النظيفة بالكلاسات الجديدة
  renderPricePreview: function(type, cost, tiers, pkgs, TelecardPricingEngine) {
      const previewContainer = document.getElementById('universal-price-preview');
      if (!previewContainer) return;
      
      let html = '<div class="fs-12 fw-bold text-primary mb-10"><i class="fa-solid fa-eye"></i> المعاينة الحية لأسعار المستويات:</div>';
      
      if (type !== 'select') {
          if (cost <= 0) { 
              previewContainer.innerHTML = '<div class="preview-mini-empty text-muted fs-11 mt-10 text-center"><i class="fa-solid fa-calculator"></i> أدخل تكلفة المنتج لرؤية أسعار البيع للعملاء</div>'; 
              return; 
          }
          
          html += '<div class="preview-tiers-grid">';
          tiers.forEach(tier => {
              const pricing = TelecardPricingEngine.calculate({ costPrice: cost, tier: tier });
              html += `
                  <div class="preview-tier-card text-center">
                      <div class="fs-11 fw-bold text-main mb-10">
                          <i class="fa-solid ${Utils.escapeHTML(tier.icon || 'fa-user')} text-gold"></i> ${Utils.escapeHTML(tier.name)}
                      </div>
                      <div class="num-en text-success fw-bold" dir="ltr">${pricing.finalPrice} $</div>
                      <div class="num-en text-muted fs-9" dir="ltr">ربحك: <span class="text-success">+${pricing.profit}</span> $</div>
                  </div>`;
          });
          html += '</div>';
          
      } else {
          if (pkgs.length === 0) { 
              previewContainer.innerHTML = '<div class="preview-mini-empty text-muted fs-11 mt-10 text-center"><i class="fa-solid fa-layer-group"></i> أضف باقات بالأسفل لرؤية تسعير كل باقة على حدة</div>'; 
              return; 
          }
          
          html += '<div class="preview-pkg-list">';
          pkgs.forEach((pkg) => {
              const pkgCost = parseFloat(pkg.price) || 0; 
              let pkgHtml = `
                  <div class="preview-pkg-card">
                      <div class="preview-pkg-header">
                          <span class="fw-bold fs-12"><i class="fa-solid fa-box text-info"></i> ${Utils.escapeHTML(pkg.name)}</span>
                          <span class="num-en text-danger fs-11" dir="ltr">التكلفة: ${pkgCost}$</span>
                      </div>
                      <div class="preview-mini-grid">`;
              
              tiers.forEach(tier => {
                  const pricing = TelecardPricingEngine.calculate({ costPrice: pkgCost, tier: tier });
                  pkgHtml += `
                          <div class="preview-micro-card text-center">
                              <div class="fs-10 text-main mb-10">
                                  <i class="fa-solid ${Utils.escapeHTML(tier.icon || 'fa-user')} text-gold"></i> ${Utils.escapeHTML(tier.name)}
                              </div>
                              <div class="num-en text-success fw-bold fs-12" dir="ltr">${pricing.finalPrice}$</div>
                          </div>`;
              });
              
              pkgHtml += `</div></div>`; 
              html += pkgHtml;
          });
          html += '</div>';
      }
      
      previewContainer.innerHTML = html;
  },
  
  // =========================================================
  // 🌳 4. تفاعلات الشجرة الذكية (Smart Tree UI Interactions)
  // =========================================================
  toggleTreeNode: function(element) {
    const node = element.closest('.tree-node');
    if (node) node.classList.toggle('is-expanded');
  },
  
  handleTreeParentCheck: function(parentCheckbox) {
    const node = parentCheckbox.closest('.tree-node');
    if (!node) return;
    const isChecked = parentCheckbox.checked;
    const childCheckboxes = node.querySelectorAll('.tree-child-cb');
    childCheckboxes.forEach(cb => cb.checked = isChecked);
    parentCheckbox.indeterminate = false;
  },
  
  handleTreeChildCheck: function(childCheckbox) {
    const node = childCheckbox.closest('.tree-node');
    if (!node) return;
    const parentCheckbox = node.querySelector('.tree-parent-cb');
    if (!parentCheckbox) return;
    
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
  },

  // 🌟 إضافة منطق الشجرة المنقول من الموجه
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

  // =========================================================
  // 🎟️ 5. الأكواد التالفة (Defective Codes)
  // =========================================================
  renderDefectiveCodesModal: function(poolName, defectiveCodes) {
      const oldOverlay = document.getElementById('defective-codes-overlay'); 
      if (oldOverlay) oldOverlay.remove();
      
      const html = AdminTemplates.defectiveModal(poolName, defectiveCodes); 
      document.body.insertAdjacentHTML('beforeend', html);
      
      const overlay = document.getElementById('defective-codes-overlay');
      if (overlay) { 
          overlay.style.display = 'flex'; 
          setTimeout(() => { overlay.classList.add('active'); }, 10); 
      }
  },

  closeDefectiveModalUI: function() {
      const overlay = document.getElementById('defective-codes-overlay');
      if (overlay) { 
          overlay.classList.remove('active'); 
          setTimeout(() => { overlay.remove(); }, 300); 
      }
  }
};
