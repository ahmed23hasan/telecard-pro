// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة V4.0 💎
// 🎯 الوظيفة: استيراد المنتجات، حماية الذاكرة، وبناء الجداول المركزية بأمان
// 🌟 التحديث الأقصى: 
// 1. [Financial Guard]: إخضاع تسعير الموردين للمحرك المالي السيادي (MAX_PRICE_LIMIT).
// 2. [App Check & Audit]: تفعيل درع السكربتات وتسجيل النشاطات الجنائية.
// 3. [Accurate Stock]: تحديث عداد الـ Subcollections الحقيقي ليعمل الرادار بامتياز.
// 4. [Atomic Lock & OOM]: الحفاظ على قفل المزامنة الذري وحماية الذاكرة (select ID).
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const crypto = require('crypto'); 
const { FinancialEngine } = require('./financialEngine.js'); // 🛡️ استيراد المحرك المالي

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ==========================================
// 🛡️ دوال المساعدة والأمان
// ==========================================
const generateCodeHash = (codeString) => crypto.createHash('md5').update(String(codeString).trim()).digest('hex');

const isMasterAdmin = (request) => request.auth?.token?.admin === true;

const logAdminAction = async (adminUid, action, details) => {
    try {
        await db.collection('telecard_audit_logs').add({
            adminUid, action, details, timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.error("Audit Log Error:", e); }
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
        if (error.name === 'AbortError') throw new Error(`Timeout: لم يستجب سيرفر المورد خلال ${timeout/1000} ثانية.`);
        throw error;
    }
};

// ==========================================
// 🔌 محولات المنصات (Provider Adapters)
// ==========================================
const ProviderAdapters = {
    salla: async (baseUrl, token) => { /* ... كود منصة سلة ... */ return []; },
    zid: async (baseUrl, token) => { /* ... كود منصة زد ... */ return []; },
    custom: async (baseUrl, token) => {
        const response = await fetchWithTimeout(`${baseUrl}/export-products`, {
            headers: { 'x-api-key': token, 'Content-Type': 'application/json' }
        }, 15000);
        
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        let data;
        try { data = await response.json(); } 
        catch (e) { throw new Error('الاستجابة من المورد ليست بصيغة JSON صحيحة.'); }
        
        return (data.products || []).map(item => ({
            externalId: item.prodId, name: item.product, cost: item.price,
            stock: item.qty || 0, codes: item.vaultCodes || []
        }));
    }
};

// ==========================================
// 🧠 النواة المركزية للمزامنة (محمية بالكامل)
// ==========================================
const coreSyncLogic = async (supplierId) => {
    const suppRef = db.collection('telecard_suppliers').doc(String(supplierId));
    
    // 🛡️ 1. قفل المزامنة المنيع (Atomic Lock with Deadlock Prevention)
    const supplier = await db.runTransaction(async (transaction) => {
        const suppSnap = await transaction.get(suppRef);
        if (!suppSnap.exists) throw new Error('المورد غير موجود.');
        
        const suppData = suppSnap.data();
        const isStaleLock = suppData.isSyncing && suppData.lastSyncAttempt && 
                            (Date.now() - suppData.lastSyncAttempt.toMillis()) > 15 * 60 * 1000;
        
        if (suppData.isSyncing && !isStaleLock) throw new Error('توجد عملية مزامنة قيد التنفيذ حالياً.');
        if (!suppData.isActive) throw new Error('المورد معطل حالياً.');
        
        transaction.update(suppRef, { isSyncing: true, lastSyncAttempt: admin.firestore.FieldValue.serverTimestamp() });
        return suppData;
    });
    
    try {
        const secretSnap = await suppRef.collection('secrets').doc('api').get();
        const token = secretSnap.exists ? secretSnap.data().token : null;
        if (!token) throw new Error('لا يوجد مفتاح ربط سري لهذا المورد.');
        
        const fetchAdapter = ProviderAdapters[supplier.type];
        if (!fetchAdapter) throw new Error('نوع المورد غير مدعوم.');
        
        const normalizedProducts = await fetchAdapter(supplier.baseUrl, token);
        
        const fetchedIds = new Set();
        let importedCount = 0;
        const defaultMargin = FinancialEngine.extractNum(supplier.defaultMargin || 0); // 🛡️ تعقيم الهامش
        
        let currentBatch = db.batch();
        let operationCount = 0;
        let vaultsToCount = new Set(); // لتحديث المخزون الفعلي لاحقاً
        
        const commitAndReset = async () => {
            if (operationCount > 0) {
                await currentBatch.commit();
                currentBatch = db.batch();
                operationCount = 0;
                await new Promise(resolve => setTimeout(resolve, 50)); 
            }
        };
        
        for (const prod of normalizedProducts) {
            const safeId = `ext_${supplierId}_${prod.externalId}`;
            const vaultId = `vault_${safeId}`;
            fetchedIds.add(safeId);
            
            // 🛡️ 2. إخضاع التسعير للمحرك المالي السيادي وحماية النظام من الأرقام الفلكية
            let rawCost = FinancialEngine.extractNum(prod.cost);
            if (rawCost > FinancialEngine.CONFIG.MAX_PRICE_LIMIT) rawCost = FinancialEngine.CONFIG.MAX_PRICE_LIMIT;
            
            const profitAdded = FinancialEngine.safeMul(rawCost, FinancialEngine.safeDiv(defaultMargin, 100));
            let finalPrice = FinancialEngine.safeAdd(rawCost, profitAdded);
            if (finalPrice > FinancialEngine.CONFIG.MAX_PRICE_LIMIT) finalPrice = FinancialEngine.CONFIG.MAX_PRICE_LIMIT;
            
            const hasStock = Number(prod.stock) > 0 || (prod.codes && prod.codes.length > 0);
            const prodRef = db.collection('telecard_prods').doc(safeId);
            
            currentBatch.set(prodRef, {
                id: safeId, name: prod.name, costPrice: rawCost, price: finalPrice,
                supplierId: supplierId, vaultPoolId: vaultId, isExternal: true, 
                isAvailable: hasStock, 
                lastSync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            operationCount++;
            if (operationCount >= 450) await commitAndReset();
            
            if (prod.codes && prod.codes.length > 0) {
                const vaultRef = db.collection('telecard_vault').doc(vaultId);
                vaultsToCount.add(vaultId); // إضافة الخزنة لقائمة الجرد لاحقاً
                
                currentBatch.set(vaultRef, {
                    id: vaultId, supplierId: supplierId, name: `أكواد: ${prod.name}`, lastSync: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                
                operationCount++;
                if (operationCount >= 450) await commitAndReset();
                
                const keysCollectionRef = vaultRef.collection('keys');
                for (const c of prod.codes) {
                    const actualCodeString = typeof c === 'object' ? (c.text || c.code || '') : String(c);
                    if (actualCodeString.trim() !== '') {
                        const codeHash = generateCodeHash(actualCodeString);
                        currentBatch.set(keysCollectionRef.doc(codeHash), {
                            codeText: actualCodeString, isSold: false, supplierId: supplierId, importedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true }); // Merge true تمنع مضاعفة الأكواد
                        
                        operationCount++;
                        if (operationCount >= 450) await commitAndReset();
                    }
                }
            }
            importedCount++;
        }
        
        // 🌟 3. حماية الذاكرة (OOM Protection) وإيقاف المنتجات المحذوفة
        const existingProdsSnap = await db.collection('telecard_prods').where('supplierId', '==', supplierId).select('id').get();
        let deletedCount = 0;
        
        for (const doc of existingProdsSnap.docs) {
            if (!fetchedIds.has(doc.id)) {
                currentBatch.update(doc.ref, { isAvailable: false, syncNote: 'تم حذفه أو إخفاؤه من المورد' });
                operationCount++; deletedCount++;
                if (operationCount >= 450) await commitAndReset();
            }
        }
        
        currentBatch.update(suppRef, { lastSync: admin.firestore.FieldValue.serverTimestamp(), importedCount: importedCount });
        operationCount++;
        await commitAndReset();

        // 🌟 4. تحديث العداد الحقيقي للأكواد (Stock Radar Fix)
        // هذا يضمن أن الداشبورد يعرض تنبيهات نفاذ الكمية بدقة 100%
        for (const vId of vaultsToCount) {
            try {
                const countSnap = await db.collection('telecard_vault').doc(vId).collection('keys').where('isSold', '==', false).count().get();
                await db.collection('telecard_vault').doc(vId).update({ stockCount: countSnap.data().count });
            } catch(e) { console.error(`Failed to update count for vault ${vId}`); }
        }
        
        return { importedCount, deletedCount };

    } catch (error) {
        console.error(`[TeleCard] Sync Logic Error for supplier ${supplierId}:`, error);
        throw error;
    } finally {
        await suppRef.update({ isSyncing: false }).catch(() => {});
    }
};

// ==========================================
// 🚀 1. المزامنة اليدوية (محمية بـ App Check)
// ==========================================
exports.syncSupplierData = onCall({ region: 'us-east1', memory: '1GiB', timeoutSeconds: 300, enforceAppCheck: true }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    try {
        const result = await coreSyncLogic(request.data.supplierId);
        await logAdminAction(request.auth.uid, 'MANUAL_SYNC_SUPPLIER', `تم مزامنة المورد ${request.data.supplierId}. المستورد: ${result.importedCount}`);
        return { success: true, message: `تمت مزامنة ${result.importedCount} منتج. وتم تعطيل ${result.deletedCount} منتج محذوف.`, ...result };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

// ==========================================
// ⏱️ 2. المزامنة التلقائية (Cron Job)
// ==========================================
exports.scheduledSupplierSync = onSchedule({ schedule: '0 */12 * * *', timeZone: 'Asia/Riyadh', region: 'us-east1', memory: '1GiB', timeoutSeconds: 540 }, async (event) => {
    try {
        const suppliersSnap = await db.collection('telecard_suppliers').where('isActive', '==', true).where('autoSync', '==', true).get();
        if (suppliersSnap.empty) return null;
        for (const doc of suppliersSnap.docs) {
            try { await coreSyncLogic(doc.id); } catch (e) { console.error(`[TeleCard] Auto-Sync failed for supplier ${doc.id}:`, e); }
        }
        return true;
    } catch (error) { console.error("[TeleCard] Scheduled Sync Critical Error:", error); return null; }
});

// ==========================================
// 🛡️ 3. حفظ بيانات المورد (محمية بـ App Check)
// ==========================================
exports.secureSaveSupplier = onCall({ region: 'us-east1', enforceAppCheck: true }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { id, name, type, baseUrl, token, defaultMargin, autoSync } = request.data;
    const suppId = id || 'supp_' + Date.now();
    
    try {
        const batch = db.batch();
        const suppRef = db.collection('telecard_suppliers').doc(suppId);
        
        batch.set(suppRef, {
            id: suppId, name, type, baseUrl,
            defaultMargin: FinancialEngine.extractNum(defaultMargin), 
            autoSync: Boolean(autoSync),
            isActive: true, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            isSyncing: false 
        }, { merge: true });
        
        if (token && token.trim() !== '') {
            batch.set(suppRef.collection('secrets').doc('api'), { token: token }, { merge: true });
        }
        
        await batch.commit();
        await logAdminAction(request.auth.uid, 'SAVE_SUPPLIER', `تم إضافة/تعديل المورد: ${name} (${suppId})`);
        
        return { success: true, id: suppId };
    } catch (error) { throw new HttpsError('internal', 'فشل حفظ بيانات المورد.'); }
});