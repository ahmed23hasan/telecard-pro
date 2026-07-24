// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة الماسية المطلقة V7.0 💎
// 🎯 الوظيفة: استيراد المنتجات، حماية الذاكرة (OOM)، وبناء الجداول المركزية بأمان
// 🛡️ التحديث الأخير: التوافق التام مع (Queue Indexing)، الحذف الآمن (Soft Delete)، ومنع استنزاف التكلفة
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
    } catch (e) { console.error("Audit Log Error:", e); }
};

const logCloudError = async (action, error, supplierId = 'system') => {
    console.error(`🚨 [${action}] Supplier: ${supplierId}`, error);
    try {
        await db.collection('telecard_system_errors').add({
            action, supplierId, errorMsg: error.message, time: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) { }
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
    salla: async (baseUrl, token) => { return []; },
    zid: async (baseUrl, token) => { return []; },
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
// 🧠 النواة المركزية للمزامنة (Core Sync Engine) - Zero-Contention & Idempotent Aligned 🛡️
// ==========================================
const coreSyncLogic = async (supplierId) => {
    const suppRef = db.collection('telecard_suppliers').doc(String(supplierId));
    
    // 🛡️ Mutex Lock لمنع تكرار التنفيذ في نفس اللحظة
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
        if (!normalizedProducts || normalizedProducts.length === 0) {
            throw new Error('API المورد أرجع قائمة فارغة. تم إيقاف المزامنة لحماية المتجر.');
        }

        const existingProdsSnap = await db.collection('telecard_prods').where('supplierId', '==', supplierId).get();
        const existingProdsMap = new Map();
        existingProdsSnap.forEach(doc => existingProdsMap.set(doc.id, doc.data()));
        
        const fetchedIds = new Set();
        let importedCount = 0;
        const defaultMargin = FinancialEngine.extractNum(supplier.defaultMargin || 0);
        
        let currentBatch = db.batch();
        let operationCount = 0;
        
        const commitAndReset = async () => {
            if (operationCount > 0) {
                await currentBatch.commit();
                currentBatch = db.batch();
                operationCount = 0;
            }
        };
        
        for (const prod of normalizedProducts) {
            const safeId = `ext_${supplierId}_${prod.externalId}`;
            const vaultId = `vault_${safeId}`;
            fetchedIds.add(safeId);
            
            let rawCost = Math.min(FinancialEngine.extractNum(prod.cost), FinancialEngine.CONFIG.MAX_PRICE_LIMIT);
            const profitAdded = FinancialEngine.safeMul(rawCost, FinancialEngine.safeDiv(defaultMargin, 100));
            let calculatedFinalPrice = Math.min(FinancialEngine.safeAdd(rawCost, profitAdded), FinancialEngine.CONFIG.MAX_PRICE_LIMIT);

            const existingData = existingProdsMap.get(safeId);
            const isFixed = existingData ? (String(existingData.isFixedPrice).toLowerCase() === 'true') : false;
            let finalPrice = isFixed ? existingData.price : calculatedFinalPrice;
            
            const safeCodesArray = Array.isArray(prod.codes) ? prod.codes.slice(0, 5000) : [];
            const hasStock = Number(prod.stock) > 0 || safeCodesArray.length > 0;
            
            // 🛡️ [حماية التكلفة - Zero Cost Diffing]: تحديث المنتج فقط إذا تغير السعر أو المخزون
            let needsProductUpdate = false;
            if (!existingData) {
                needsProductUpdate = true;
            } else {
                if (existingData.price !== finalPrice || existingData.costPrice !== rawCost || existingData.isAvailable !== hasStock) {
                    needsProductUpdate = true;
                }
            }

            if (needsProductUpdate) {
                const prodRef = db.collection('telecard_prods').doc(safeId);
                const prodUpdatePayload = {
                    id: safeId, name: prod.name, costPrice: rawCost, price: finalPrice,
                    supplierId: supplierId, vaultPoolId: vaultId, isExternal: true, 
                    isAvailable: hasStock, lastSync: admin.firestore.FieldValue.serverTimestamp()
                };
                if (existingData && existingData.isFixedPrice !== undefined) prodUpdatePayload.isFixedPrice = existingData.isFixedPrice;
                
                currentBatch.set(prodRef, prodUpdatePayload, { merge: true });
                operationCount++;
                if (operationCount >= 400) await commitAndReset();
            }

            // ==========================================
            // 🛡️ نظام الصناديق المتوافق مع (Idempotency & Zero-Contention)
            // ==========================================
            if (safeCodesArray.length > 0) {
                const vaultRef = db.collection('telecard_vault').doc(vaultId);
                
                const cleanCodes = safeCodesArray.map(c => (typeof c === 'object' ? (c.text || c.code || '') : String(c)).replace(/\s+/g, '')).filter(c => c !== '');
                cleanCodes.sort(); 
                
                const masterHash = generateCodeHash(cleanCodes.join('||'));
                const vaultSnap = await vaultRef.get();
                const existingVaultData = vaultSnap.exists ? vaultSnap.data() : { totalAdded: 0, stockCount: 0 };

                if (existingVaultData.lastCodesHash !== masterHash) {
                    const incomingHashes = new Set(cleanCodes.map(c => generateCodeHash(c)));
                    
                    const keysCollectionRef = vaultRef.collection('keys');
                    const unsoldSnaps = await keysCollectionRef.where('isSold', '==', false).get();
                    
                    let dbUnsoldMap = new Map();
                    unsoldSnaps.forEach(doc => {
                        // استخراج الهاش من الـ ID أو توليده
                        dbUnsoldMap.set(doc.id.replace('key_', ''), doc);
                    });

                    let revokedCount = 0;
                    let addedCount = 0;
                    let currentTotalAdded = existingVaultData.totalAdded || 0;

                    // 1. (Soft Delete) للأكواد التي حذفها المورد
                    for (const [hash, docSnap] of dbUnsoldMap.entries()) {
                        if (!incomingHashes.has(hash)) {
                            // تغيير الحالة إلى مباع مسحوب لكي يتجاهله نظام البيع
                            currentBatch.update(docSnap.ref, { isSold: true, isRevoked: true, syncNote: 'تم سحبه من المورد' });
                            revokedCount++; operationCount++;
                            if (operationCount >= 400) await commitAndReset();
                        }
                    }

                    // 2. إضافة الأكواد الجديدة (استخدام الهاش كـ ID يمنع التكرار نهائياً عند فشل المزامنة)
                    for (const code of cleanCodes) {
                        const hash = generateCodeHash(code);
                        if (!dbUnsoldMap.has(hash)) {
                            currentTotalAdded++;
                            const keyDocRef = keysCollectionRef.doc(`key_${hash}`); // 💎 تم استخدام الهاش لمنع التصادم!
                            currentBatch.set(keyDocRef, {
                                codeText: code, isSold: false,
                                supplierId: supplierId, importedAt: admin.firestore.FieldValue.serverTimestamp()
                            }, { merge: true }); // Merge يحمينا من أخطاء إعادة التشغيل
                            addedCount++; operationCount++;
                            if (operationCount >= 400) await commitAndReset();
                        }
                    }

                    // 3. تحديث عدادات الصندوق بدون حقل nextSaleIndex القديم
                    const netStockChange = addedCount - revokedCount;
                    currentBatch.set(vaultRef, {
                        id: vaultId, supplierId: supplierId, name: `أكواد: ${prod.name}`,
                        totalAdded: currentTotalAdded, 
                        stockCount: Math.max(0, (existingVaultData.stockCount || 0) + netStockChange),
                        lastCodesHash: masterHash, lastSync: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    operationCount++;
                    if (operationCount >= 400) await commitAndReset();
                }
            }
            importedCount++;
        }
        
        // ==========================================
        // 🗑️ تعطيل المنتجات التي أزالها المورد بالكامل
        // ==========================================
        let deletedCount = 0;
        for (const [docId, docData] of existingProdsMap.entries()) {
            if (!fetchedIds.has(docId) && docData.isAvailable !== false) {
                currentBatch.update(db.collection('telecard_prods').doc(docId), { 
                    isAvailable: false, syncNote: 'تم حذفه أو إخفاؤه من المورد' 
                });
                operationCount++; deletedCount++;
                if (operationCount >= 400) await commitAndReset();
            }
        }
        
        currentBatch.update(suppRef, { lastSync: admin.firestore.FieldValue.serverTimestamp(), importedCount: importedCount });
        await commitAndReset();
        
        return { importedCount, deletedCount };

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
exports.syncSupplierData = onCall({ region: 'us-east1', memory: '1GiB', timeoutSeconds: 300, enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try {
        const result = await coreSyncLogic(request.data.supplierId);
        await logAdminAction(request.auth.uid, 'MANUAL_SYNC_SUPPLIER', `تم مزامنة المورد ${request.data.supplierId}. المستورد: ${result.importedCount}`);
        return { success: true, message: `تمت مزامنة ${result.importedCount} منتج. وتم تعطيل ${result.deletedCount} منتج محذوف من المورد.`, ...result };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

// ==========================================
// ⏱️ 2. المزامنة التلقائية (Cron Job) 
// ==========================================
exports.scheduledSupplierSync = onSchedule({ 
    schedule: '0 */12 * * *', // كل 12 ساعة
    timeZone: 'Asia/Riyadh', 
    region: 'us-east1', 
    memory: '1GiB', 
    timeoutSeconds: 540 
}, async (event) => {
    try {
        const suppliersSnap = await db.collection('telecard_suppliers').where('isActive', '==', true).where('autoSync', '==', true).get();
        if (suppliersSnap.empty) return null;

        const suppliers = suppliersSnap.docs;
        const CONCURRENCY_LIMIT = 2; 

        for (let i = 0; i < suppliers.length; i += CONCURRENCY_LIMIT) {
            const chunk = suppliers.slice(i, i + CONCURRENCY_LIMIT);
            const syncPromises = chunk.map(async (doc) => {
                try { await coreSyncLogic(doc.id); } 
                catch (e) { await logCloudError('AUTO_SYNC_SUPPLIER_FAILED', e, doc.id); }
            });
            await Promise.allSettled(syncPromises);
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
exports.secureSaveSupplier = onCall({ region: 'us-east1', enforceAppCheck: false }, async (request) => {
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
    } catch (error) { 
        await logCloudError('SAVE_SUPPLIER_ERROR', error, suppId);
        throw new HttpsError('internal', 'فشل حفظ بيانات المورد.'); 
    }
});