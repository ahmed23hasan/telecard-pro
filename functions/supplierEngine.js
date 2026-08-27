// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة الماسية V9.0 💎
// 🎯 الوظيفة: استيراد المنتجات، وبناء الجداول المركزية بأمان
// 🚀 التحديثات (V9.0 - Cloud Native Edition):
// 1. Sequential Batching: إرسال الدفعات بالتسلسل (await commit) لمنع خنق السيرفر (429 Error).
// 2. Zero-Cost Stock: حساب المخزون في الذاكرة (In-Memory) لحذف تكلفة قراءات count() نهائياً.
// 3. API Sanitization: جدار حماية يرفض المنتجات المعطوبة (بدون ID) من واجهات الموردين.
// 4. Session-Based Upsert: إلغاء الـ Master Hash والاعتماد على syncSessionId لحذف الأكواد المباعة.
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
// نستخدم الـ Hash فقط لتوليد ID آمن لوثائق الأكواد (Document ID) لتجنب الحروف الممنوعة في Firestore
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
// ============================================================================
// 🔌 محولات المنصات (Provider Adapters)
// ==========================================
const ProviderAdapters = {
    salla: async (baseUrl, token) => { return []; }, // محول سلة (للمستقبل)
    zid: async (baseUrl, token) => { return []; },   // محول زد (للمستقبل)
    
    // 🌐 المحول العام (Standard API) - يدعم Star Store وأي متجر يستخدم نفس نظامهم
    standard_api: async (baseUrl, token) => {
        // 1. تنظيف الرابط لتجنب الأخطاء المطبعية من الأدمن (مثل وضع / في النهاية)
        const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        
        // 2. طلب البيانات (مع افتراض أن مسار المنتجات هو /api/products أو المشابه له)
        // ملاحظة: تأكد من المسار النهائي من توثيقهم (API Docs)
        const response = await fetchWithTimeout(`${cleanUrl}/products`, { 
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`, // بعض المتاجر تستخدم Bearer
                'x-api-key': token,                 // والبعض يستخدم x-api-key (نرسل الاثنين للأمان)
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            } 
        }, 15000);
        
        if (!response.ok) throw new Error(`API Error: فشل الاتصال بالمورد (كود الخطأ: ${response.status})`);
        
        let data;
        try { data = await response.json(); } catch (e) { throw new Error('استجابة المورد ليست بصيغة JSON صحيحة.'); }
        
        // 3. مرونة قراءة المصفوفة (بعض المتاجر تضعها داخل data وبعضها داخل products)
        const rawProducts = data.data || data.products || data;
        if (!Array.isArray(rawProducts)) throw new Error('البيانات المستلمة من المورد لا تحتوي على قائمة منتجات.');

        // 4. التوحيد المعياري (Data Normalization) - مرونة عالية في أسماء الحقول
        return rawProducts.map(item => ({ 
            externalId: String(item.id || item.prodId || item.product_id || ''), 
            name: String(item.name || item.product || item.title || 'منتج بدون اسم'), 
            cost: FinancialEngine.extractNum(item.price || item.cost || item.wholesale_price), 
            stock: FinancialEngine.extractNum(item.qty || item.stock || item.quantity), 
            codes: Array.isArray(item.codes) ? item.codes : (Array.isArray(item.vaultCodes) ? item.vaultCodes : []) 
        }));
    }
};
// ==========================================
// 🧠 النواة المركزية للمزامنة (Core Sync Engine - Zero Cost & Sequential) 
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

        const existingProdsSnap = await db.collection('telecard_prods').where('supplierId', '==', supplierId).get();
        const existingProdsMap = new Map();
        existingProdsSnap.forEach(doc => existingProdsMap.set(doc.id, doc.data()));

        const syncSessionId = Date.now();
        const defaultMargin = FinancialEngine.extractNum(supplier.defaultMargin || 0);
        
        // 🚀 معمارية (Sequential Batching) لحماية الذاكرة والهروب من خطأ 429
        let currentBatch = db.batch();
        let operationCount = 0;
        let importedCount = 0;
        let revokedCount = 0;
        
        const commitAndReset = async () => {
            if (operationCount > 0) { 
                await currentBatch.commit(); // 👈 التنفيذ المتسلسل المباشر
                currentBatch = db.batch(); 
                operationCount = 0; 
            }
        };

        for (const prod of normalizedProducts) {
            // 🛑 1. جدار الحماية (Sanitization): رفض البيانات الفاسدة من المورد
            if (!prod.externalId || String(prod.externalId).trim() === '') {
                console.warn(`[API WARNING] تخطي منتج بدون معرف خارجي (ID) من المورد: ${supplierId}`);
                continue; 
            }
            const rawName = String(prod.name || '').trim();
            if (!rawName) continue;

            const safeId = `ext_${supplierId}_${prod.externalId}`;
            const vaultId = `vault_${safeId}`;
            
            // 🧮 2. المعالجة المالية
            let rawCost = Math.min(FinancialEngine.extractNum(prod.cost), FinancialEngine.CONFIG.MAX_PRICE_LIMIT);
            const profitAdded = FinancialEngine.safeMul(rawCost, FinancialEngine.safeDiv(defaultMargin, 100));
            let calculatedFinalPrice = Math.min(FinancialEngine.safeAdd(rawCost, profitAdded), FinancialEngine.CONFIG.MAX_PRICE_LIMIT);
            
            const existingData = existingProdsMap.get(safeId);
            const isFixed = existingData ? (String(existingData.isFixedPrice).toLowerCase() === 'true') : false;
            let finalPrice = isFixed ? FinancialEngine.extractNum(existingData.price) : calculatedFinalPrice;

            // 📦 3. تنظيف الأكواد وحساب المخزون في الذاكرة (In-Memory Stock)
            const safeCodesArray = Array.isArray(prod.codes) ? prod.codes.slice(0, 5000) : [];
            const cleanCodes = [...new Set(safeCodesArray.map(c => (typeof c === 'object' ? (c.text || c.code || '') : String(c)).replace(/\s+/g, '')).filter(c => c !== ''))];
            
            // حساب المخزون فورياً بدون استعلامات Database!
            let inMemoryStockCount = cleanCodes.length > 0 ? cleanCodes.length : FinancialEngine.extractNum(prod.stock);
            const hasStock = inMemoryStockCount > 0;
            
            // حفظ المنتج
            const prodRef = db.collection('telecard_prods').doc(safeId);
            currentBatch.set(prodRef, {
                id: safeId, name: rawName, costPrice: rawCost, price: finalPrice, supplierId: supplierId, 
                vaultPoolId: cleanCodes.length > 0 ? vaultId : null, 
                isExternal: true, isAvailable: hasStock, 
                syncSessionId: syncSessionId, lastSync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            operationCount++;
            if (operationCount >= 400) await commitAndReset(); 

            // 🔐 4. معالجة الخزنة بطريقة (Upsert & Prune) الموفرة
            if (cleanCodes.length > 0) {
                const vaultRef = db.collection('telecard_vault').doc(vaultId);
                const keysCollectionRef = vaultRef.collection('keys');
                
                // إدخال الأكواد الواردة وتحديث جلستها
                for (const code of cleanCodes) {
                    const hash = generateCodeHash(code); // معرف وثيقة آمن
                    const keyDocRef = keysCollectionRef.doc(`key_${hash}`); 
                    currentBatch.set(keyDocRef, {
                        codeText: code, isSold: false, supplierId: supplierId, 
                        syncSessionId: syncSessionId, importedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true }); 
                    
                    operationCount++;
                    if (operationCount >= 400) await commitAndReset(); 
                }

                // سحب الأكواد القديمة (التي لم يرسلها المورد في هذه الجلسة لأنها بيعت)
                const staleKeysSnap = await keysCollectionRef.where('isSold', '==', false).where('syncSessionId', '<', syncSessionId).get();
                for (const doc of staleKeysSnap.docs) {
                    currentBatch.update(doc.ref, { isSold: true, isRevoked: true, syncNote: 'تم سحبه من المورد' });
                    operationCount++; revokedCount++;
                    if (operationCount >= 400) await commitAndReset(); 
                }

                // تحديث الخزنة بالرقم المحسوب في الذاكرة (0 تكلفة قراءة!)
                currentBatch.set(vaultRef, {
                    id: vaultId, supplierId: supplierId, name: `أكواد: ${rawName}`,
                    stockCount: inMemoryStockCount, lastSync: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                
                operationCount++;
                if (operationCount >= 400) await commitAndReset(); 
            }
            importedCount++;
        }
        
        // 🗑️ مرحلة التنظيف العالمي للمنتجات المحذوفة من المورد
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
        
        // تنفيذ الدفعة الأخيرة
        await commitAndReset(); 

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
exports.scheduledSupplierSync = onSchedule({ 
    schedule: '0 */12 * * *', 
    timeZone: 'Asia/Riyadh', 
    memory: '1GiB', 
    timeoutSeconds: 540 
}, async (event) => {
    try {
        const suppliersSnap = await db.collection('telecard_suppliers').where('isActive', '==', true).where('autoSync', '==', true).get();
        if (suppliersSnap.empty) return null;
        
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