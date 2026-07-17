// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة V5.1 💎
// 🎯 الوظيفة: استيراد المنتجات، حماية الذاكرة، وبناء الجداول المركزية بأمان
// 🌟 التحديث الأخير: التزامن الدقيق (Diffing)، حماية من المسح الخاطئ، والبصمة الذكية
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
// 🧠 النواة المركزية للمزامنة (Core Sync Engine)
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
        
        // جلب المنتجات من المورد
        const normalizedProducts = await fetchAdapter(supplier.baseUrl, token);
        
        // 🛡️ [Sanity Check]: حماية المتجر من مسح المنتجات بالخطأ إذا تعطل سيرفر المورد وأرجع مصفوفة فارغة
        if (!normalizedProducts || normalizedProducts.length === 0) {
            throw new Error('API المورد أرجع قائمة فارغة. تم إيقاف المزامنة لحماية منتجاتك الحالية من المسح.');
        }
        
        const fetchedIds = new Set();
        let importedCount = 0;
        const defaultMargin = FinancialEngine.extractNum(supplier.defaultMargin || 0);
        
        let currentBatch = db.batch();
        let operationCount = 0;
        
        // دالة مساعدة لتنفيذ الـ Batch عندما يصل للحد الأقصى (450)
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
            
            // 🛡️ حماية الأسعار باستخدام حدود المحرك المالي
            let rawCost = FinancialEngine.extractNum(prod.cost);
            if (rawCost > FinancialEngine.CONFIG.MAX_PRICE_LIMIT) rawCost = FinancialEngine.CONFIG.MAX_PRICE_LIMIT;
            
            const profitAdded = FinancialEngine.safeMul(rawCost, FinancialEngine.safeDiv(defaultMargin, 100));
            let finalPrice = FinancialEngine.safeAdd(rawCost, profitAdded);
            if (finalPrice > FinancialEngine.CONFIG.MAX_PRICE_LIMIT) finalPrice = FinancialEngine.CONFIG.MAX_PRICE_LIMIT;
            
            const safeCodesArray = Array.isArray(prod.codes) ? prod.codes.slice(0, 5000) : [];
            const hasStock = Number(prod.stock) > 0 || safeCodesArray.length > 0;
            const prodRef = db.collection('telecard_prods').doc(safeId);
            
            currentBatch.set(prodRef, {
                id: safeId, name: prod.name, costPrice: rawCost, price: finalPrice,
                supplierId: supplierId, vaultPoolId: vaultId, isExternal: true, 
                isAvailable: hasStock, 
                lastSync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            operationCount++;
            if (operationCount >= 450) await commitAndReset();
            
            // ==========================================
            // 🛡️ نظام البصمة الذكية (Master Hash) والـ Diffing
            // ==========================================
            if (safeCodesArray.length > 0) {
                const vaultRef = db.collection('telecard_vault').doc(vaultId);
                
                // 1. تنظيف الأكواد وترتيبها أبجدياً لتوحيد البصمة
                const cleanCodes = safeCodesArray.map(c => {
                    return (typeof c === 'object' ? (c.text || c.code || '') : String(c)).replace(/\s+/g, '');
                }).filter(c => c !== '');
                cleanCodes.sort(); 
                
                // 2. توليد بصمة الحزمة القادمة من المورد
                const masterHash = crypto.createHash('sha256').update(cleanCodes.join('||')).digest('hex');

                // 3. قراءة البصمة الحالية من المتجر
                const vaultSnap = await vaultRef.get();
                const existingVaultData = vaultSnap.exists ? vaultSnap.data() : null;

                if (existingVaultData && existingVaultData.lastCodesHash === masterHash) {
                    // 🎉 البصمة متطابقة (لم يتغير شيء عند المورد) -> وفر فواتير الكتابة في Firestore!
                    currentBatch.update(vaultRef, { lastSync: admin.firestore.FieldValue.serverTimestamp() });
                    operationCount++;
                    if (operationCount >= 450) await commitAndReset();
                } else {
                    // ⚠️ توجد تغييرات! سنقوم بعملية المطابقة (Diffing) لمسح الأكواد الأشباح وإضافة الجديدة
                    const keysCollectionRef = vaultRef.collection('keys');
                    const incomingCodesSet = new Set(cleanCodes);
                    
                    // أ. جلب الأكواد الموجودة لدينا (والتي لم تُبَع للعملاء بعد)
                    const currentUnsoldSnap = await keysCollectionRef.where('isSold', '==', false).get();
                    
                    // ب. مسح الأكواد الأشباح (الموجودة لدينا ولكن المورد قام بسحبها أو بيعها لديه)
                    currentUnsoldSnap.forEach(doc => {
                        if (!incomingCodesSet.has(doc.data().codeText)) {
                            currentBatch.delete(doc.ref);
                            operationCount++;
                        }
                    });
                    if (operationCount >= 450) await commitAndReset();

                    // ج. إضافة الأكواد القادمة من المورد (باستخدام merge:true لعدم تدمير الأكواد المباعة مسبقاً إن وجدت)
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

                    // د. تحديث الخزنة مع حفظ المخزون الحقيقي والبصمة الجديدة
                    currentBatch.set(vaultRef, {
                        id: vaultId, 
                        supplierId: supplierId, 
                        name: `أكواد: ${prod.name}`, 
                        stockCount: cleanCodes.length, // العدد الدقيق الفعلي من المورد
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
        // 🗑️ تنظيف المنتجات التي أزالها المورد بالكامل من منصته
        // ==========================================
        const existingProdsSnap = await db.collection('telecard_prods').where('supplierId', '==', supplierId).select('id').get();
        let deletedCount = 0;
        
        for (const doc of existingProdsSnap.docs) {
            if (!fetchedIds.has(doc.id)) {
                currentBatch.update(doc.ref, { isAvailable: false, syncNote: 'تم حذفه أو إخفاؤه من المورد' });
                operationCount++; deletedCount++;
                if (operationCount >= 450) await commitAndReset();
            }
        }
        
        // إغلاق قفل التزامن وتحديث الإحصائيات
        currentBatch.update(suppRef, { lastSync: admin.firestore.FieldValue.serverTimestamp(), importedCount: importedCount });
        await commitAndReset();
        
        return { importedCount, deletedCount };

    } catch (error) {
        await logCloudError('SUPPLIER_SYNC_LOGIC_ERROR', error, supplierId);
        throw error;
    } finally {
        // تحرير القفل (Mutex) بشكل نهائي ليتمكن من العمل في المرة القادمة
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
// ⏱️ 2. المزامنة التلقائية (Cron Job) - التنفيذ المتوازي المُنظم (Chunking)
// ==========================================
exports.scheduledSupplierSync = onSchedule({ 
    schedule: '0 */12 * * *', // يعمل كل 12 ساعة
    timeZone: 'Asia/Riyadh', 
    region: 'us-east1', 
    memory: '1GiB', 
    timeoutSeconds: 540 
}, async (event) => {
    try {
        const suppliersSnap = await db.collection('telecard_suppliers').where('isActive', '==', true).where('autoSync', '==', true).get();
        if (suppliersSnap.empty) return null;

        const suppliers = suppliersSnap.docs;
        const CONCURRENCY_LIMIT = 2; // 🛡️ معالجة 2 موردين فقط في نفس اللحظة لحماية الـ RAM والـ API Limits

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
        
        // 🛡️ عزل الأسرار في Document منفصل لعدم تسريبه للواجهة
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