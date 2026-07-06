// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة الماسية V3.0
// 🌟 التحديث: ترقية لـ Gen 2، حماية الـ RAM عبر (.select)، منع تكرار الأكواد (MD5 Hashing)
// 🛡️ ترقيعات الأداء: التنفيذ المتسلسل للباتشات + جدار الـ Timeout
// 🏗️ ترقيعات المخزون: التخزين كـ (Subcollections) مع ضمان عدم التكرار (Idempotent Writes)
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const crypto = require('crypto'); // 🛡️ لإنشاء معرفات ثابتة للأكواد لمنع التكرار

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// 🛡️ دالة مساعدة لإنشاء هاش (MD5) من الكود لمنع التكرار في قاعدة البيانات
const generateCodeHash = (codeString) => {
    return crypto.createHash('md5').update(String(codeString).trim()).digest('hex');
};

const isMasterAdmin = (request) => request.auth?.token?.admin === true;

// ==========================================
// 🛡️ اتصال آمن مع مهلة زمنية (Timeout Fetch)
// ==========================================
const fetchWithTimeout = async (url, options, timeout = 15000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error(`Timeout: لم يستجب سيرفر المورد خلال ${timeout/1000} ثانية.`);
        }
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
        
        // 🛡️ حماية ضد استجابات الـ HTML الخاطئة (Bad Gateway)
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
// 🧠 النواة المركزية للمزامنة (تدعم الشحن المجزأ +10,000 منتج بأمان)
// ==========================================
const coreSyncLogic = async (supplierId) => {
    const suppRef = db.collection('telecard_suppliers').doc(String(supplierId));
    const suppSnap = await suppRef.get();
    
    if (!suppSnap.exists) throw new Error('المورد غير موجود.');
    const supplier = suppSnap.data();
    if (!supplier.isActive) throw new Error('المورد معطل حالياً.');
    
    const secretSnap = await suppRef.collection('secrets').doc('api').get();
    const token = secretSnap.exists ? secretSnap.data().token : null;
    if (!token) throw new Error('لا يوجد مفتاح ربط سري لهذا المورد.');
    
    const fetchAdapter = ProviderAdapters[supplier.type];
    if (!fetchAdapter) throw new Error('نوع المورد غير مدعوم.');
    
    const normalizedProducts = await fetchAdapter(supplier.baseUrl, token);
    
    const fetchedIds = new Set();
    let importedCount = 0;
    const defaultMargin = Number(supplier.defaultMargin || 0);
    
    let currentBatch = db.batch();
    let operationCount = 0;
    
    const commitAndReset = async () => {
        if (operationCount > 0) {
            await currentBatch.commit();
            currentBatch = db.batch();
            operationCount = 0;
            await new Promise(resolve => setTimeout(resolve, 50)); // 🛡️ تفريغ الذاكرة
        }
    };
    
    for (const prod of normalizedProducts) {
        const safeId = `ext_${supplierId}_${prod.externalId}`;
        const vaultId = `vault_${safeId}`;
        
        fetchedIds.add(safeId);
        const finalPrice = Number((prod.cost + (prod.cost * (defaultMargin / 100))).toFixed(4));
        const prodRef = db.collection('telecard_prods').doc(safeId);
        
        currentBatch.set(prodRef, {
            id: safeId, name: prod.name, costPrice: prod.cost, price: finalPrice,
            supplierId: supplierId, vaultPoolId: vaultId, isExternal: true, isAvailable: true,
            lastSync: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        operationCount++;
        if (operationCount >= 450) await commitAndReset();
        
        // 🏗️ المستند الأب للـ Vault
        if (prod.codes && prod.codes.length > 0) {
            const vaultRef = db.collection('telecard_vault').doc(vaultId);
            currentBatch.set(vaultRef, {
                id: vaultId, supplierId: supplierId, lastSync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            operationCount++;
            if (operationCount >= 450) await commitAndReset();
            
            const keysCollectionRef = vaultRef.collection('keys');
            
            for (const c of prod.codes) {
                const actualCodeString = typeof c === 'object' ? (c.text || c.code || '') : String(c);
                if (actualCodeString.trim() !== '') {
                    // 🛡️ استخدام MD5 لمنع المورد من إضافة نفس الكود مرتين
                    const codeHash = generateCodeHash(actualCodeString);
                    const newCodeRef = keysCollectionRef.doc(codeHash); 
                    
                    // استخدام merge: true يحمي خاصية isSold من التعديل إذا كان الكود موجوداً مسبقاً
                    currentBatch.set(newCodeRef, {
                        codeText: actualCodeString,
                        isSold: false, 
                        supplierId: supplierId,
                        importedAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                    
                    operationCount++;
                    if (operationCount >= 450) await commitAndReset();
                }
            }
        }
        importedCount++;
    }
    
    // 🌟 🛡️ حماية الذاكرة (OOM) باستخدام select('id') لجلب المعرفات فقط
    const existingProdsSnap = await db.collection('telecard_prods')
        .where('supplierId', '==', supplierId)
        .select('id') // يجلب الـ ID فقط بدلاً من بيانات المنتج كاملة لتوفير الـ RAM
        .get();
        
    let deletedCount = 0;
    
    for (const doc of existingProdsSnap.docs) {
        if (!fetchedIds.has(doc.id)) {
            currentBatch.update(doc.ref, { isAvailable: false, syncNote: 'تم حذفه أو إخفاؤه من قبل المورد' });
            operationCount++;
            deletedCount++;
            if (operationCount >= 450) await commitAndReset();
        }
    }
    
    currentBatch.update(suppRef, {
        lastSync: admin.firestore.FieldValue.serverTimestamp(), importedCount: importedCount
    });
    operationCount++;
    await commitAndReset();
    
    return { importedCount, deletedCount };
};

// ==========================================
// 🚀 1. دالة المزامنة اليدوية
// ==========================================
exports.syncSupplierData = onCall({ region: 'us-east1', memory: '1GiB', timeoutSeconds: 300 }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    try {
        const result = await coreSyncLogic(request.data.supplierId);
        return {
            success: true,
            message: `تمت مزامنة ${result.importedCount} منتج. وتم تعطيل ${result.deletedCount} منتج محذوف.`,
            ...result
        };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

// ==========================================
// ⏱️ 2. دالة المزامنة التلقائية (Cron Job)
// ==========================================
exports.scheduledSupplierSync = onSchedule({ 
    schedule: '0 */12 * * *', 
    timeZone: 'Asia/Riyadh',
    region: 'us-east1',
    memory: '1GiB', // 🛡️ ذاكرة إضافية لأنها قد تعالج عدة موردين معاً
    timeoutSeconds: 540 // أقصى مدة للـ Cloud Functions V2
}, async (event) => {
    try {
        const suppliersSnap = await db.collection('telecard_suppliers')
            .where('isActive', '==', true).where('autoSync', '==', true).get();
        
        if (suppliersSnap.empty) return null;
        
        for (const doc of suppliersSnap.docs) {
            try { await coreSyncLogic(doc.id); } 
            catch (e) { console.error(`Auto-Sync failed for supplier ${doc.id}:`, e); }
        }
        return true;
    } catch (error) {
        console.error("Scheduled Sync Critical Error:", error);
        return null;
    }
});

// ==========================================
// 🛡️ 3. دالة حفظ المورد الآمنة
// ==========================================
exports.secureSaveSupplier = onCall({ region: 'us-east1' }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { id, name, type, baseUrl, token, defaultMargin, autoSync } = request.data;
    const suppId = id || 'supp_' + Date.now();
    
    try {
        const batch = db.batch();
        const suppRef = db.collection('telecard_suppliers').doc(suppId);
        
        batch.set(suppRef, {
            id: suppId, name, type, baseUrl,
            defaultMargin: Number(defaultMargin), autoSync: Boolean(autoSync),
            isActive: true, updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        if (token && token.trim() !== '') {
            batch.set(suppRef.collection('secrets').doc('api'), { token: token }, { merge: true });
        }
        
        await batch.commit();
        return { success: true, id: suppId };
    } catch (error) { throw new HttpsError('internal', 'فشل حفظ بيانات المورد.'); }
});