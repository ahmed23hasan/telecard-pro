// ============================================================================
// 🧠 متحكم الربط والموردين (modules/integrations/integrationsController.js) - V20.2 💎
// 🎯 الوظيفة: معالجة سحب المنتجات، المزامنة السحابية، فحص الرصيد، وحذف الموردين
// 🚀 التحديثات المعمارية (V20.2 - Zero-Read Wipe & Selective Sync Patch): 
// 1. Zero-Read Delete Wipe ⚡: حذف ارتباط منتجات المورد في الذاكرة بـ 0 قراءات سحابية بدلاً من قراءة الكتالوج كاملاً.
// 2. Selective Sync Load 📉: قراءة وتحديث منتجات المورد الذي تمت مزامنته فقط من السحابة توفيراً لأكثر من 1,500 قراءة.
// 3. Live Balance Checker 💰: فحص رصيد حسابك المباشر لدى المورد عبر السيرفر لحظياً.
// 4. Cloud Delete Integration 🗑️: حذف المورد وفك ارتباط كافة منتجاته بأمان عبر adminDeleteSupplier.
// 5. Cloud Catalog Explorer 🔍: استعراض منتجات المورد المتاحة حياً عبر السيرفر دون مغادرة لوحة الإدارة.
// ============================================================================

import { AdminData } from '../../adminData.js';
import { AdminUI } from '../../adminUI.js';
import { EventBus, Utils } from '../../adminUtils.js';
import { FirebaseAdapter } from '../../core/firebaseAdapter.js';
import { RenderHelpers } from '../../core/renderHelpers.js';
import { IntegrationsUI } from './integrationsUI.js';
// 🚀 استيراد مكتبات الاستعلام لتوفير القراءات أثناء تحديث منتجات مورد معين فقط
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const IntegrationsController = {

    _actionLocks: new Set(), 

    // =========================================================
    // 💾 1. حفظ وتعديل بيانات المورد وتشفير المفتاح السري
    // =========================================================
    saveSupplier: async function(id = null) {
        if (this._actionLocks.has('save-supplier')) return;
        
        const name = Utils.getVal('supp-name').trim();
        const type = Utils.getVal('supp-type').trim() || 'standard_api';
        let baseUrl = Utils.getVal('supp-url').trim();
        let token = Utils.getVal('supp-token').trim();
        const margin = parseFloat(Utils.getVal('supp-margin')) || 0;
        
        const currency = (Utils.getVal('supp-currency') || 'USD').trim().toUpperCase();
        const autoSync = Utils.getCheck('supp-auto-sync');
        const syncIntervalMinutes = Math.max(10, parseInt(Utils.getVal('supp-sync-interval'), 10) || 120);
        
        if (!name || !baseUrl) {
            EventBus.emit('req-show-toast', { message: 'يرجى ملء البيانات الأساسية للمورد (الاسم والرابط)', type: 'error' });
            return;
        }
        if (!id && !token) {
            EventBus.emit('req-show-toast', { message: 'يرجى إدخال مفتاح الربط السري (API Key / Token) للمورد الجديد', type: 'error' });
            return;
        }
        
        if (!/^https?:\/\//i.test(baseUrl)) {
            baseUrl = 'https://' + baseUrl;
        }        
        
        this._actionLocks.add('save-supplier');
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري تشفير وحفظ بيانات المورد سحابياً...');

        try {
            const oldSupplier = id ? this.getSupplier(id) : null;
            let hasToken = false;
            
            if (id && token === '') {
                hasToken = oldSupplier ? (oldSupplier.hasToken !== false) : true;
            } else if (token !== '') {
                hasToken = true;
            }

            const result = await FirebaseAdapter.callFunction('secureSaveSupplier', { 
                id, name, type, baseUrl, token, defaultMargin: margin, autoSync, syncIntervalMinutes, currency 
            });
            
            if (result && result.success) {
                const finalId = result.id || id || 'supp_' + Date.now();

                const supplierData = { 
                    id: finalId, name, type, baseUrl, defaultMargin: margin, autoSync, syncIntervalMinutes,
                    isActive: oldSupplier ? oldSupplier.isActive : true,
                    currency,
                    importedCount: oldSupplier ? (oldSupplier.importedCount || oldSupplier.linkedProductsCount || 0) : 0,
                    lastSync: oldSupplier ? (oldSupplier.lastSync || null) : null,
                    hasToken: hasToken 
                };

                if (!AdminData.data.suppliers) AdminData.data.suppliers = [];

                if (id) {
                    const idx = AdminData.data.suppliers.findIndex(s => String(s.id) === String(id));
                    if (idx > -1) AdminData.data.suppliers[idx] = Object.assign(AdminData.data.suppliers[idx], supplierData);
                } else {
                    AdminData.data.suppliers.push(supplierData);
                }

                if (!AdminData.data.suppliersMap) AdminData.data.suppliersMap = {};
                AdminData.data.suppliersMap[finalId] = supplierData;

                EventBus.emit('req-finish-action', {
                    renderEvent: 'req-render-integrations',
                    modalId: 'supplier',
                    logAction: id ? 'UPDATE_SUPPLIER' : 'ADD_SUPPLIER',
                    logDetails: `تحديث المورد: ${name}`,
                    toastMsg: 'تم حفظ بيانات المورد بأمان تام'
                });
            } else {
                throw new Error(result?.message || 'رفض السيرفر العملية');
            }
        } catch (error) {
            console.error("Save Supplier Error:", error);
            EventBus.emit('req-show-toast', { message: `فشل الحفظ: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete('save-supplier');
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },
    // =========================================================
    // 🗑️ 2. حذف المورد وفك ارتباط المنتجات سحابياً (Zero-Read Local Wipe)
    // =========================================================
    deleteSupplier: async function(id) {
        if (!id || this._actionLocks.has(`del-supp-${id}`)) return;

        const supp = this.getSupplier(id);
        const name = supp ? supp.name : id;

        const confirmMsg = `⚠️ تحذير معماري شديد الأهمية:\nهل أنت متأكد من حذف المورد (${name}) نهائياً؟\nسيقوم السيرفر بالتأكد من عدم وجود طلبات معلقة وفك ارتباط جميع المنتجات التابعة له بأمان.`;
        if (AdminUI && !await AdminUI.showConfirm(confirmMsg, 'تأكيد حذف المورد')) return;

        this._actionLocks.add(`del-supp-${id}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري فحص الارتباطات وحذف المورد سحابياً...');

        try {
            const result = await FirebaseAdapter.callFunction('adminDeleteSupplier', { supplierId: String(id) });
            
            if (result && result.success) {
                const strSuppId = String(id);
                AdminData.data.suppliers = (AdminData.data.suppliers || []).filter(s => String(s.id) !== strSuppId);
                if (AdminData.data.suppliersMap) delete AdminData.data.suppliersMap[strSuppId];

                // ⚡ الإصلاح المعماري: فك ارتباط المنتجات التابعة للمورد في الذاكرة المحلية بـ 0 قراءات سحابية بدلاً من إعادة جلب 1500 منتج!
                if (Array.isArray(AdminData.data.prods)) {
                    AdminData.data.prods.forEach(p => {
                        if (p && String(p.supplierId) === strSuppId) {
                            p.supplierId = null;
                            p.externalId = null;
                            p.isExternal = false;
                            p.isAvailable = false;
                            p.syncNote = 'تنبيه أمني: تم حذف المورد المرتبط بهذا المنتج.';
                            if (Array.isArray(p.options)) {
                                p.options = p.options.map(opt => opt ? { ...opt, supplierId: null, externalId: null, isAvailable: false } : opt);
                            }
                        }
                    });
                    AdminData._buildSingleMap?.('prods');
                    AdminData._updateSnapshot?.('prods');
                }

                AdminUI?.closeModal?.('supplier');
                EventBus.emit('req-render-integrations');
                EventBus.emit('req-render-prods');

                const msg = `تم حذف المورد بنجاح وفك ارتباط ${result.unlinkedProductsCount || 0} منتج.`;
                if (AdminData.addLog) AdminData.addLog('DELETE_SUPPLIER', msg);
                EventBus.emit('req-show-toast', { message: msg, type: 'success' });
            } else {
                throw new Error(result?.message || 'تعذر إتمام عملية الحذف من السيرفر.');
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `فشل الحذف: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete(`del-supp-${id}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    // =========================================================
    // 💰 3. فحص رصيد حسابك المباشر لدى المورد (Live Balance)
    // =========================================================
    checkSupplierBalance: async function(id) {
        if (!id || this._actionLocks.has(`bal-supp-${id}`)) return;
        this._actionLocks.add(`bal-supp-${id}`);

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري فحص رصيد حسابك لدى المورد سحابياً...');

        try {
            const res = await FirebaseAdapter.callFunction('adminGetSupplierBalance', { supplierId: String(id) });
            if (res && res.success) {
                const balText = RenderHelpers.formatMoney(res.balanceUsd, 'USD', 2);
                const localBalText = res.currency !== 'USD' ? ` (${res.rawBalance} ${res.currency})` : '';
                const warnLow = res.isLowBalance ? '\n\n⚠️ تنبيه: رصيدك منخفض جداً، يرجى شحن الحساب لتجنب فشل الطلبات!' : '';

                await AdminUI.showAlert(
                    `<div class="text-center p-15">
                        <i class="fa-solid fa-wallet fa-3x text-success mb-10"></i>
                        <h4 class="fw-bold mb-5">رصيدك المتاح لدى (${Utils.escapeHTML(res.supplierName)}):</h4>
                        <div class="fs-22 text-gold fw-bold num-en font-numeric my-10" dir="ltr">${balText}${localBalText}</div>
                        ${res.accountEmail ? `<div class="fs-12 text-muted">حساب: ${Utils.escapeHTML(res.accountEmail)}</div>` : ''}
                        ${warnLow ? `<div class="alert alert-danger mt-10 p-10 fs-12">${warnLow}</div>` : ''}
                    </div>`,
                    'رصيد حساب المورد'
                );
            } else {
                throw new Error(res?.message || 'تعذر جلب الرصيد من سيرفر المورد.');
            }
        } catch (error) {
            EventBus.emit('req-show-toast', { message: `خطأ في فحص الرصيد: ${error.message}`, type: 'error' });
        } finally {
            this._actionLocks.delete(`bal-supp-${id}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
        }
    },

    // =========================================================
    // 🔍 4. استعراض كتالوج منتجات المورد وأسعارها حياً
    // =========================================================
    fetchSupplierCatalog: async function(id) {
    if (!id || this._actionLocks.has(`cat-supp-${id}`)) return;
    this._actionLocks.add(`cat-supp-${id}`);
    
    if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, 'جاري سحب كتالوج منتجات المورد وأسعارها حياً...');
    
    try {
        const res = await FirebaseAdapter.callFunction('adminFetchSupplierCatalog', { supplierId: String(id) });
        
        if (res && res.success && Array.isArray(res.items)) {
            const rowsHtml = res.items.map(item => {
                const rawCostUsd = Number(item.costUsd || 0);
                const costDecimals = (rawCostUsd > 0 && rawCostUsd < 0.001) ? 6 : ((rawCostUsd > 0 && rawCostUsd < 0.05) ? 4 : 3);
                return `
                    <div class="copy-row interactive-scale mb-5 p-10" data-action="copy-text" data-copy-text="${Utils.escapeHTML(item.externalId)}" title="اضغط لنسخ كود المنتج (ID)">
                        <div class="d-flex justify-content-between align-items-center w-100 gap-2">
                            <div class="text-truncate flex-1">
                                <span class="fw-bold fs-12">${Utils.escapeHTML(item.name)}</span>
                                <div class="fs-11 text-muted num-en font-numeric" dir="ltr">ID: <b class="text-info">#${Utils.escapeHTML(item.externalId)}</b> | التكلفة: <b class="text-gold">$${rawCostUsd.toFixed(costDecimals)}</b></div>
                            </div>
                            <span class="badge ${item.stock > 0 ? 'bg-success' : 'bg-danger'} num-en font-numeric" dir="ltr">${item.stock > 0 ? 'متوفر' : 'نافد'}</span>
                        </div>
                    </div>`;
            }).join('');
            
            await AdminUI.showAlert(
                `<div class="mb-10 fs-12 text-muted">إجمالي منتجات المورد (${Utils.escapeHTML(res.supplierName)}): <b>${res.totalItems}</b> منتج. اضغط على أي منتج لنسخ الـ ID الخاص به لربطه:</div>
                     <div class="custom-scrollbar" style="max-height: 400px; overflow-y: auto;">
                        ${rowsHtml || '<div class="text-center text-muted p-15">لا توجد منتجات</div>'}
                     </div>`,
                `كتالوج المورد: ${res.supplierName}`
            );
        } else {
            throw new Error(res?.message || 'تعذر جلب كتالوج المورد.');
        }
    } catch (error) {
        EventBus.emit('req-show-toast', { message: `فشل جلب الكتالوج: ${error.message}`, type: 'error' });
    } finally {
        this._actionLocks.delete(`cat-supp-${id}`);
        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
    }
},
    // =========================================================
    // ⚡ 5. تفعيل/تعطيل المورد
    // =========================================================
    toggleSupplier: async function(id, isChecked) {
        if (this._actionLocks.has(`toggle-${id}`)) return;
        
        const supp = this.getSupplier(id);
        if (!supp) return;

        this._actionLocks.add(`toggle-${id}`);

        try {
            await FirebaseAdapter.updateDocument('telecard_suppliers', String(id), { 
                isActive: isChecked, 
                updatedAt: Date.now() 
            });

            supp.isActive = isChecked;
            
            if (AdminData.addLog) {
                AdminData.addLog('TOGGLE_SUPPLIER', `تم ${isChecked ? 'تفعيل' : 'إيقاف'} المورد: ${supp.name}`);
            }

            EventBus.emit('req-show-toast', { 
                message: isChecked ? `تم تفعيل المورد (${supp.name}) بنجاح` : `تم إيقاف المورد (${supp.name}) مؤقتاً`, 
                type: 'success' 
            });

        } catch (error) {
            console.error("Toggle Supplier Error:", error);
            EventBus.emit('req-show-toast', { message: 'فشل تغيير حالة المورد، تأكد من الاتصال بالإنترنت.', type: 'error' });
            EventBus.emit('req-render-integrations'); 
        } finally {
            this._actionLocks.delete(`toggle-${id}`);
        }
    },

    // =========================================================
    // 🔄 6. المزامنة الانتقائية للمنتجات مع السيرفر (Selective Sync Read)
    // =========================================================
    syncSupplier: async function(id) {
        if (this._actionLocks.has(`sync-${id}`)) return;

        const supp = this.getSupplier(id);
        if (!supp) return;

        if (!supp.isActive) {
            EventBus.emit('req-show-toast', { message: 'لا يمكن مزامنة مورد وهو في حالة "متوقف". يرجى تفعيله أولاً.', type: 'warning' });
            return;
        }

        this._actionLocks.add(`sync-${id}`);
        
        const cardElementsToDisable = document.querySelectorAll(`[data-id="${id}"]`);
        cardElementsToDisable.forEach(el => {
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
                el.disabled = true;
                el.classList.add('opacity-50');
                el.style.pointerEvents = 'none';
            }
        });

        if (AdminUI?.toggleLoader) AdminUI.toggleLoader(true, `جاري مزامنة المنتجات من سيرفرات (${supp.name})، الرجاء عدم إغلاق النافذة...`);

        try {
            const result = await FirebaseAdapter.callFunction('syncSupplierData', { supplierId: id });

            if (result && result.success) {
                supp.lastSync = Date.now(); 
                supp.importedCount = result.linkedCount || result.importedCount || 0;
                supp.linkedProductsCount = supp.importedCount;
                supp.lastUpdatedProductsCount = result.updatedProductsCount || 0;
                
                // ⚡ الإصلاح المعماري: جلب منتجات هذا المورد المحددة فقط وتحديثها في الذاكرة بدلاً من إعادة قراءة 1500 منتج توفيراً للقراءات!
                if (Number(result.updatedProductsCount || 0) > 0) {
                    try {
                        const q = query(collection(FirebaseAdapter.db, 'telecard_prods'), where('supplierId', '==', String(id)));
                        const snap = await getDocs(q);
                        if (!snap.empty && Array.isArray(AdminData.data.prods)) {
                            const updatedMap = new Map();
                            snap.forEach(docSnap => {
                                const d = docSnap.data();
                                updatedMap.set(String(docSnap.id), {
                                    id: docSnap.id,
                                    ...d,
                                    costPrice: Number(d.costPrice || 0),
                                    price: Number(d.price || 0),
                                    isFixedPrice: !!d.isFixedPrice,
                                    requiresAdminAttention: !!d.requiresAdminAttention,
                                    syncNote: d.syncNote || ''
                                });
                            });
                            AdminData.data.prods = AdminData.data.prods.map(p => updatedMap.get(String(p.id)) || p);
                            AdminData._buildSingleMap?.('prods');
                            AdminData._updateSnapshot?.('prods');
                            EventBus.emit('req-render-prods'); // تحديث واجهة الكتالوج فوراً
                        }
                    } catch (syncReadErr) {
                        console.warn("⚠️ تعذر تحديث منتجات المورد محلياً بعد المزامنة:", syncReadErr);
                    }
                }                
                
                EventBus.emit('req-finish-action', {
                    renderEvent: 'req-render-integrations',
                    modalId: null,
                    logAction: 'SYNC_SUPPLIER',
                    logDetails: `مزامنة المورد: ${supp.name} (تم فحص ${supp.importedCount} منتج وتحديث ${supp.lastUpdatedProductsCount} منتج)`,
                    toastMsg: result.message || `تمت المزامنة بنجاح!`
                });
            } else {
                throw new Error(result?.message || 'فشلت عملية المزامنة السحابية.');
            }
        } catch (error) {
            console.error("Sync Failed:", error);
            let errorMsg = error.message || 'فشلت المزامنة. تأكد من صحة الرابط ومفتاح الـ API.';
            if (errorMsg.includes('Timeout')) errorMsg = `سيرفر المورد (${supp.name}) استغرق وقتاً طويلاً. لا تقلق، السيرفر لا يزال يعمل في الخلفية وسيتم تحديث المنتجات قريباً.`;
            
            EventBus.emit('req-show-toast', { message: errorMsg, type: 'error' });
        } finally {
            this._actionLocks.delete(`sync-${id}`);
            if (AdminUI?.toggleLoader) AdminUI.toggleLoader(false);
            
            cardElementsToDisable.forEach(el => {
                if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
                    el.disabled = false;
                    el.classList.remove('opacity-50');
                    el.style.pointerEvents = 'auto';
                }
            });
        }
    },

    // =========================================================
    // 🐛 7. سجل الأكواد التالفة للمطالبة بالتعويض
    // =========================================================
    defectsCursor: null,
    
    viewSupplierDefects: async function(supplierId, supplierName, isLoadMore = false) {
        const lockKey = isLoadMore ? 'load-defects' : 'view-defects';
        if (this._actionLocks.has(lockKey)) return;
        this._actionLocks.add(lockKey);
        
        if (!isLoadMore) this.defectsCursor = null;

        if (AdminUI?.toggleLoader && !isLoadMore) AdminUI.toggleLoader(true, 'جاري جلب السجل الجنائي للمورد من السحابة...');
        
        try {
            const result = await FirebaseAdapter.fetchMoreWithCursor(
                'telecard_supplier_defects', 
                [['supplierId', '==', String(supplierId)]], 
                'reportedAt', 
                this.defectsCursor, 
                200 
            );

            const defects = result.data || [];
            this.defectsCursor = result.newLastDoc;
            const hasMore = !!this.defectsCursor;

            IntegrationsUI.openDefectsModal(supplierId, supplierName, defects, isLoadMore, hasMore);
            
        } catch (error) {
            console.error("Failed to fetch supplier defects:", error);
            EventBus.emit('req-show-toast', { message: 'فشل جلب الأكواد التالفة للمورد', type: 'error' });
        } finally {
            this._actionLocks.delete(lockKey);
            if (AdminUI?.toggleLoader && !isLoadMore) AdminUI.toggleLoader(false);
        }
    },

    getSupplier: (id) => AdminData.data.suppliersMap?.[id] || (AdminData.data.suppliers || []).find(s => String(s.id) === String(id))
};
