// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة الماسية المطلقة V7.3 💎
// 🎯 الوظيفة: استيراد المنتجات، وبناء الجداول المركزية بأمان
// 🚀 التحديث الأخير: إزالة التمرد الجغرافي (us-east1) لضمان الخضوع للسيرفر المركزي.
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const crypto = require('crypto'); 
const FinancialEngine = require('./financialEngine.js'); 

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ==========================================
// 🛡️ دوال المساعدة، الأمان، وسجل الأخطاء السحابي
// ==========================================
const generateCodeHash = (codeString) => crypto.createHash('sha256').update(String(codeString).trim()).digest('hex');
const isMasterAdmin = (request) => request.auth?.token?.admin === true;

const logAdminAction = async (adminUid, action, details) => {
    try { 
        await db.collection('telecard_audit_logs').add({ 
            adminUid, action, details, timestamp: admin.firestore.FieldValue.serverTimestamp() 
        }); 
    } catch (e) {}
};

const logCloudError = async (action, error, supplierId = 'system') => {
    console.error(`🚨 [${action}] Supplier: ${supplierId}`, error);
    try { 
        await db.collection('telecard_system_errors').add({ 
            action, supplierId, errorMsg: error.message, time: admin.firestore.FieldValue.serverTimestamp() 
        }); 
    } catch(e) {}
};

const fetchWithTimeout = async (url, options, timeout = 15000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') throw new Error(`Timeout: لم يستجب سيرفر المورد.`);
        throw error;
    }
};

// ==========================================
// 🔌 محولات المنصات (Provider Adapters)
// ==========================================
const ProviderAdapters = {
    salla: async (baseUrl, token) => { return []; },
    zid: async (baseUrl, token) => { return []; },
    custom: async (baseUrl, token) => {
        const response = await fetchWithTimeout(`${baseUrl}/export-products`, { 
            headers: { 'x-api-key': token, 'Content-Type': 'application/json' } 
        }, 15000);
        
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        let data;
        try { data = await response.json(); } catch (e) { throw new Error('الاستجابة ليست بصيغة JSON صحيحة.'); }
        
        return (data.products || []).map(item => ({ 
            externalId: item.prodId, name: item.product, cost: item.price, stock: item.qty || 0, codes: item.vaultCodes || [] 
        }));
    }
};

// ==========================================
// 🧠 النواة المركزية للمزامنة (Core Sync Engine) 
// ==========================================
const coreSyncLogic = async (supplierId) => {
    const suppRef = db.collection('telecard_suppliers').doc(String(supplierId));
    
    // 🛡️ Mutex Lock لمنع تكرار التنفيذ في نفس اللحظة
    const supplier = await db.runTransaction(async (transaction) => {
        const suppSnap = await transaction.get(suppRef);
        if (!suppSnap.exists) throw new Error('المورد غير موجود.');
        const suppData = suppSnap.data();
        
        const isStaleLock = suppData.isSyncing && suppData.lastSyncAttempt && (Date.now() - suppData.lastSyncAttempt.toMillis()) > 15 * 60 * 1000;
        if (suppData.isSyncing && !isStaleLock) throw new Error('توجد عملية مزامنة قيد التنفيذ حالياً.');
        if (!suppData.isActive) throw new Error('المورد معطل حالياً.');
        
        transaction.update(suppRef, { isSyncing: true, lastSyncAttempt: admin.firestore.FieldValue.serverTimestamp() });
        return suppData;
    });
    
    try {
        const secretSnap = await suppRef.collection('secrets').doc('api').get();
        const token = secretSnap.exists ? secretSnap.data().token : null;
        if (!token) throw new Error('لا يوجد مفتاح ربط سري.');
        
        const fetchAdapter = ProviderAdapters[supplier.type];
        if (!fetchAdapter) throw new Error('نوع المورد غير مدعوم.');
        
        const normalizedProducts = await fetchAdapter(supplier.baseUrl, token);
        if (!normalizedProducts || normalizedProducts.length === 0) throw new Error('API المورد أرجع قائمة فارغة.');

        // 🛡️ استرجاع المنتجات الحالية (آمن جداً على الذاكرة) لحماية التسعير اليدوي
        const existingProdsSnap = await db.collection('telecard_prods').where('supplierId', '==', supplierId).get();
        const existingProdsMap = new Map();
        existingProdsSnap.forEach(doc => existingProdsMap.set(doc.id, doc.data()));

        // 1. إنشاء الختم الزمني للمزامنة الحالية (Sync Session ID)
        const syncSessionId = Date.now();
        const defaultMargin = FinancialEngine.extractNum(supplier.defaultMargin || 0);
        
        let currentBatch = db.batch();
        let operationCount = 0;
        let importedCount = 0;
        let revokedCount = 0;
        
        const commitAndReset = async () => {
            if (operationCount > 0) { await currentBatch.commit(); currentBatch = db.batch(); operationCount = 0; }
        };

        // 2. تحديث المنتجات والأكواد مع الختم
        for (const prod of normalizedProducts) {
            const safeId = `ext_${supplierId}_${prod.externalId}`;
            const vaultId = `vault_${safeId}`;
            
            let rawCost = Math.min(FinancialEngine.extractNum(prod.cost), FinancialEngine.CONFIG.MAX_PRICE_LIMIT);
            const profitAdded = FinancialEngine.safeMul(rawCost, FinancialEngine.safeDiv(defaultMargin, 100));
            let calculatedFinalPrice = Math.min(FinancialEngine.safeAdd(rawCost, profitAdded), FinancialEngine.CONFIG.MAX_PRICE_LIMIT);
            
            // 🛡️ حماية تسعيرة الإدارة اليدوية
            const existingData = existingProdsMap.get(safeId);
            const isFixed = existingData ? (String(existingData.isFixedPrice).toLowerCase() === 'true') : false;
            let finalPrice = isFixed ? existingData.price : calculatedFinalPrice;

            const safeCodesArray = Array.isArray(prod.codes) ? prod.codes.slice(0, 5000) : [];
            const hasStock = Number(prod.stock) > 0 || safeCodesArray.length > 0;
            
            const prodRef = db.collection('telecard_prods').doc(safeId);
            currentBatch.set(prodRef, {
                id: safeId, name: prod.name, costPrice: rawCost, price: finalPrice, supplierId: supplierId, 
                vaultPoolId: vaultId, isExternal: true, isAvailable: hasStock, 
                syncSessionId: syncSessionId, lastSync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            operationCount++;
            if (operationCount >= 400) await commitAndReset();

            // معالجة الصناديق والأكواد
            if (safeCodesArray.length > 0) {
                const vaultRef = db.collection('telecard_vault').doc(vaultId);
                const cleanCodes = safeCodesArray.map(c => (typeof c === 'object' ? (c.text || c.code || '') : String(c)).replace(/\s+/g, '')).filter(c => c !== '');
                cleanCodes.sort(); 
                
                const masterHash = generateCodeHash(cleanCodes.join('||'));
                const vaultSnap = await vaultRef.get();
                const existingVaultData = vaultSnap.exists ? vaultSnap.data() : null;

                // 🛡️ معالجة الأكواد (فقط إذا تغير الهاش)
                if (!existingVaultData || existingVaultData.lastCodesHash !== masterHash) {
                    const keysCollectionRef = vaultRef.collection('keys');
                    
                    for (const code of cleanCodes) {
                        const hash = generateCodeHash(code);
                        const keyDocRef = keysCollectionRef.doc(`key_${hash}`); 
                        currentBatch.set(keyDocRef, {
                            codeText: code, isSold: false, supplierId: supplierId, 
                            syncSessionId: syncSessionId, importedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true }); 
                        
                        operationCount++;
                        if (operationCount >= 400) await commitAndReset();
                    }

                    // 🗑️ التنظيف المحلي (Local GC): سحب الأكواد التي حذفها المورد من هذا الصندوق تحديداً
                    const staleKeysSnap = await keysCollectionRef
                        .where('isSold', '==', false)
                        .where('syncSessionId', '<', syncSessionId).get();
                    
                    for (const doc of staleKeysSnap.docs) {
                        currentBatch.update(doc.ref, { isSold: true, isRevoked: true, syncNote: 'تم سحبه من المورد' });
                        operationCount++; revokedCount++;
                        if (operationCount >= 400) await commitAndReset();
                    }

                    // حفظ الـ Hash الجديد للصندوق
                    currentBatch.set(vaultRef, {
                        id: vaultId, supplierId: supplierId, name: `أكواد: ${prod.name}`,
                        lastCodesHash: masterHash, lastSync: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    operationCount++;
                    if (operationCount >= 400) await commitAndReset();
                }
            }
            importedCount++;
        }
        await commitAndReset();
        
        // ==========================================
        // 🗑️ مرحلة التنظيف العالمي للمنتجات فقط (Global GC for Products)
        // ==========================================
        let deletedCount = 0;
        const staleProdsSnap = await db.collection('telecard_prods')
            .where('supplierId', '==', supplierId)
            .where('isAvailable', '==', true)
            .where('syncSessionId', '<', syncSessionId).get();

        for (const doc of staleProdsSnap.docs) {
            currentBatch.update(doc.ref, { isAvailable: false, syncNote: 'محذوف من المورد' });
            operationCount++; deletedCount++;
            if (operationCount >= 400) await commitAndReset();
        }
        await commitAndReset();

        // ==========================================
        // 📊 حساب المخزون الحي باستخدام (Aggregation) 
        // ==========================================
        for (const prod of normalizedProducts) {
            const vaultId = `vault_ext_${supplierId}_${prod.externalId}`;
            const vaultRef = db.collection('telecard_vault').doc(vaultId);
            const stockAgg = await vaultRef.collection('keys').where('isSold', '==', false).count().get();
            await vaultRef.update({ stockCount: stockAgg.data().count });
        }

        await suppRef.update({ lastSync: admin.firestore.FieldValue.serverTimestamp(), importedCount: importedCount });
        return { importedCount, deletedCount, revokedCount };

    } catch (error) {
        await logCloudError('SUPPLIER_SYNC_LOGIC_ERROR', error, supplierId);
        throw error;
    } finally {
        await suppRef.update({ isSyncing: false }).catch(() => {});
    }
};

// ==========================================
// 🚀 1. المزامنة اليدوية (من لوحة تحكم الإدارة)
// ==========================================
// 🛡️ التحديث: إزالة `region` ليخضع للسيرفر المركزي
exports.syncSupplierData = onCall({ memory: '1GiB', timeoutSeconds: 540, enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try {
        const result = await coreSyncLogic(request.data.supplierId);
        await logAdminAction(request.auth.uid, 'MANUAL_SYNC_SUPPLIER', `مزامنة ${request.data.supplierId}`);
        return { success: true, message: `تمت مزامنة ${result.importedCount} منتج. تعطيل ${result.deletedCount}. سحب ${result.revokedCount} كود.`, ...result };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

// ==========================================
// ⏱️ 2. المزامنة التلقائية (Cron Job) 
// ==========================================
// 🛡️ التحديث: إزالة `region` 
exports.scheduledSupplierSync = onSchedule({ 
    schedule: '0 */12 * * *', 
    timeZone: 'Asia/Riyadh', 
    memory: '1GiB', 
    timeoutSeconds: 540 
}, async (event) => {
    try {
        const suppliersSnap = await db.collection('telecard_suppliers').where('isActive', '==', true).where('autoSync', '==', true).get();
        if (suppliersSnap.empty) return null;
        
        // معالجة الموردين بحذر لتجنب اختناق الخادم (Concurrency Limit)
        for (let i = 0; i < suppliersSnap.docs.length; i += 2) {
            const chunk = suppliersSnap.docs.slice(i, i + 2);
            await Promise.allSettled(chunk.map(async (doc) => { 
                try { await coreSyncLogic(doc.id); } catch (e) { await logCloudError('AUTO_SYNC_FAILED', e, doc.id); } 
            }));
        }
        return true;
    } catch (error) { 
        await logCloudError('SCHEDULED_SYNC_CRASH', error); 
        return null; 
    }
});

// ==========================================
// 🛡️ 3. حفظ بيانات المورد من الإدارة
// ==========================================
// 🛡️ التحديث: إزالة `region`
exports.secureSaveSupplier = onCall({ enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { id, name, type, baseUrl, token, defaultMargin, autoSync } = request.data;
    const suppId = id || 'supp_' + Date.now();
    
    try {
        const batch = db.batch();
        const suppRef = db.collection('telecard_suppliers').doc(suppId);
        
        batch.set(suppRef, { 
            id: suppId, name, type, baseUrl, 
            defaultMargin: FinancialEngine.extractNum(defaultMargin), 
            autoSync: Boolean(autoSync), isActive: true, 
            updatedAt: admin.firestore.FieldValue.serverTimestamp(), isSyncing: false 
        }, { merge: true });
        
        if (token && token.trim() !== '') {
            batch.set(suppRef.collection('secrets').doc('api'), { token: token }, { merge: true });
        }
        
        await batch.commit();
        await logAdminAction(request.auth.uid, 'SAVE_SUPPLIER', `تم حفظ المورد: ${name}`);
        
        return { success: true, id: suppId };
    } catch (error) { 
        throw new HttpsError('internal', 'فشل حفظ بيانات المورد.'); 
    }
});