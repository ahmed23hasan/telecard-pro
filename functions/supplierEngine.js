// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة المطلقة V6.0 💎
// 🎯 الوظيفة: استيراد المنتجات، حماية الذاكرة (OOM)، وبناء الجداول المركزية بأمان
// 🛡️ التحديث الأخير: حماية التسعيرة اليدوية (Fixed Prices) + تنظيف الأكواد بدون استنزاف للذاكرة
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
// 🛡️ استخدام SHA-256 لتشفير كل كود بشكل فردي (يمنع تكرار الأكواد عالمياً)
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
            action,
            supplierId,
            errorMsg: error.message,
            stack: error.stack,
            time: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) { console.error("Failed to log cloud error:", e); }
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
    salla: async (baseUrl, token) => { /* ... كود منصة سلة المستقبلي ... */ return []; },
    zid: async (baseUrl, token) => { /* ... كود منصة زد المستقبلي ... */ return []; },
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
// 🧠 النواة المركزية للمزامنة (Core Sync Engine) - OOM Protected 🛡️
// ==========================================
const coreSyncLogic = async (supplierId) => {
    const suppRef = db.collection('telecard_suppliers').doc(String(supplierId));
    
    // 🛡️ [قفل التزامن - Mutex Lock]: منع تنفيذ المزامنة مرتين في نفس الوقت لنفس المورد
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
        
        // 🛡️ [Sanity Check]: حماية المتجر
        if (!normalizedProducts || normalizedProducts.length === 0) {
            throw new Error('API المورد أرجع قائمة فارغة. تم إيقاف المزامنة لحماية منتجاتك الحالية من المسح.');
        }

        // 🛡️ [إصلاح أمني وتجاري]: جلب المنتجات الحالية للحفاظ على الأسعار المخصصة يدوياً (Fixed Prices)
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
                try {
                    await currentBatch.commit();
                } catch (batchErr) {
                    throw new Error(`فشل حفظ الدفعة: ${batchErr.message}`);
                }
                currentBatch = db.batch();
                operationCount = 0;
            }
        };
        
        for (const prod of normalizedProducts) {
            const safeId = `ext_${supplierId}_${prod.externalId}`;
            const vaultId = `vault_${safeId}`;
            fetchedIds.add(safeId);
            
            // 🛡️ حماية الأسعار وتطبيق هامش الربح
            let rawCost = FinancialEngine.extractNum(prod.cost);
            if (rawCost > FinancialEngine.CONFIG.MAX_PRICE_LIMIT) rawCost = FinancialEngine.CONFIG.MAX_PRICE_LIMIT;
            
            const profitAdded = FinancialEngine.safeMul(rawCost, FinancialEngine.safeDiv(defaultMargin, 100));
            let calculatedFinalPrice = FinancialEngine.safeAdd(rawCost, profitAdded);
            if (calculatedFinalPrice > FinancialEngine.CONFIG.MAX_PRICE_LIMIT) calculatedFinalPrice = FinancialEngine.CONFIG.MAX_PRICE_LIMIT;

            // 🚀 [الإصلاح الماسي]: احترام تسعيرة الإدارة اليدوية
            const existingData = existingProdsMap.get(safeId);
            const isFixed = existingData ? (String(existingData.isFixedPrice).toLowerCase() === 'true') : false;
            let finalPrice = isFixed ? existingData.price : calculatedFinalPrice;
            
            const safeCodesArray = Array.isArray(prod.codes) ? prod.codes.slice(0, 5000) : [];
            const hasStock = Number(prod.stock) > 0 || safeCodesArray.length > 0;
            const prodRef = db.collection('telecard_prods').doc(safeId);
            
            const prodUpdatePayload = {
                id: safeId, name: prod.name, costPrice: rawCost, price: finalPrice,
                supplierId: supplierId, vaultPoolId: vaultId, isExternal: true, 
                isAvailable: hasStock, 
                lastSync: admin.firestore.FieldValue.serverTimestamp()
            };

            // الحفاظ على حالة السعر الثابت لكي لا تضيع
            if (existingData && existingData.isFixedPrice !== undefined) {
                prodUpdatePayload.isFixedPrice = existingData.isFixedPrice;
            }
            
            currentBatch.set(prodRef, prodUpdatePayload, { merge: true });
            
            operationCount++;
            if (operationCount >= 450) await commitAndReset();
            
            // ==========================================
            // 🛡️ نظام البصمة الذكية (Master Hash) والـ Diffing
            // ==========================================
            if (safeCodesArray.length > 0) {
                const vaultRef = db.collection('telecard_vault').doc(vaultId);
                
                const cleanCodes = safeCodesArray.map(c => {
                    return (typeof c === 'object' ? (c.text || c.code || '') : String(c)).replace(/\s+/g, '');
                }).filter(c => c !== '');
                cleanCodes.sort(); 
                
                const masterHash = crypto.createHash('sha256').update(cleanCodes.join('||')).digest('hex');

                const vaultSnap = await vaultRef.get();
                const existingVaultData = vaultSnap.exists ? vaultSnap.data() : null;

                if (existingVaultData && existingVaultData.lastCodesHash === masterHash) {
                    currentBatch.update(vaultRef, { lastSync: admin.firestore.FieldValue.serverTimestamp() });
                    operationCount++;
                    if (operationCount >= 450) await commitAndReset();
                } else {
                    const keysCollectionRef = vaultRef.collection('keys');
                    const incomingCodesSet = new Set(cleanCodes);
                    
                    // 🛡️ [إصلاح OOM]: استخدام select لجلب حقل codeText فقط وتخفيض limit إلى 1000
                    let lastDoc = null;
                    let hasMoreUnsold = true;
                    
                    while (hasMoreUnsold) {
                        let query = keysCollectionRef.where('isSold', '==', false).select('codeText').limit(1000);
                        if (lastDoc) query = query.startAfter(lastDoc);
                        
                        const chunkSnap = await query.get();
                        if (chunkSnap.empty) {
                            hasMoreUnsold = false;
                            break;
                        }
                        
                        lastDoc = chunkSnap.docs[chunkSnap.docs.length - 1];
                        
                        chunkSnap.forEach(doc => {
                            const codeData = doc.data();
                            if (!incomingCodesSet.has(codeData.codeText)) {
                                currentBatch.delete(doc.ref);
                                operationCount++;
                            }
                        });
                        
                        if (operationCount >= 450) await commitAndReset();
                    }

                    for (const actualCodeString of cleanCodes) {
                        const codeHash = generateCodeHash(actualCodeString);
                        currentBatch.set(keysCollectionRef.doc(codeHash), {
                            codeText: actualCodeString, 
                            isSold: false, 
                            supplierId: supplierId, 
                            importedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        
                        operationCount++;
                        if (operationCount >= 450) await commitAndReset();
                    }

                    currentBatch.set(vaultRef, {
                        id: vaultId, 
                        supplierId: supplierId, 
                        name: `أكواد: ${prod.name}`, 
                        stockCount: cleanCodes.length, 
                        lastCodesHash: masterHash, 
                        lastSync: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    operationCount++;
                    if (operationCount >= 450) await commitAndReset();
                }
            }
            importedCount++;
        }
        
        // ==========================================
        // 🗑️ تنظيف المنتجات التي أزالها المورد بالكامل
        // ==========================================
        let deletedCount = 0;
        for (const [docId, docData] of existingProdsMap.entries()) {
            if (!fetchedIds.has(docId)) {
                currentBatch.update(db.collection('telecard_prods').doc(docId), { 
                    isAvailable: false, 
                    syncNote: 'تم حذفه أو إخفاؤه من المورد' 
                });
                operationCount++; deletedCount++;
                if (operationCount >= 450) await commitAndReset();
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
        const CONCURRENCY_LIMIT = 2; // 🛡️ معالجة 2 موردين فقط لمنع انهيار الـ RAM

        for (let i = 0; i < suppliers.length; i += CONCURRENCY_LIMIT) {
            const chunk = suppliers.slice(i, i + CONCURRENCY_LIMIT);
            const syncPromises = chunk.map(async (doc) => {
                try {
                    await coreSyncLogic(doc.id);
                } catch (e) {
                    await logCloudError('AUTO_SYNC_SUPPLIER_FAILED', e, doc.id);
                }
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