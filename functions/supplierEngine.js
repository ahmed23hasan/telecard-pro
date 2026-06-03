// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة الاحترافية (Turbo & Safe)
// 🌟 التحديث: سد ثغرة الصلاحيات + حماية الذاكرة (Sequential) + جدار الـ Timeout للاتصالات
// ============================================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// تهيئة أدمن فايربيز إذا لم يتم تهيئته مسبقاً
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// 🛡️ جدار الحماية للتحقق من صلاحيات المدير (الاعتماد على Custom Claims)
const isMasterAdmin = (context) => {
    if (!context.auth || !context.auth.token) return false;
    return context.auth.token.admin === true; 
};

// ==========================================
// 🛡️ دالة مساعدة: اتصال آمن مع مهلة زمنية (Timeout Fetch)
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
    salla: async (baseUrl, token) => {
        /* ... كود منصة سلة ... */
        return [];
    },
    zid: async (baseUrl, token) => {
        /* ... كود منصة زد ... */
        return [];
    },
    custom: async (baseUrl, token) => {
        // 🌟 استخدام الاتصال المحمي بمهلة 15 ثانية لمنع تعليق السيرفر
        const response = await fetchWithTimeout(`${baseUrl}/export-products`, {
            headers: {
                'x-api-key': token,
                'Content-Type': 'application/json'
            }
        }, 15000); 

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await response.json();
        
        return data.products.map(item => ({
            externalId: item.prodId,
            name: item.product,
            cost: item.price,
            stock: item.qty || 0,
            codes: item.vaultCodes || []
        }));
    }
};

// ==========================================
// 🧠 النواة المركزية للمزامنة (تدعم الشحن المجزأ +500 منتج)
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
    
    // 🌟 مصفوفة الدفعات الضخمة (Batches Array) لمنع اصطدام حاجز الـ 500 عملية لفايربيز
    let batches = [];
    let currentBatch = db.batch();
    let operationCount = 0;
    
    const commitAndReset = () => {
        batches.push(currentBatch.commit());
        currentBatch = db.batch();
        operationCount = 0;
    };
    
    normalizedProducts.forEach(prod => {
        const safeId = `ext_${supplierId}_${prod.externalId}`;
        const vaultId = `vault_${safeId}`;
        
        fetchedIds.add(safeId);
        
        const finalPrice = Number((prod.cost + (prod.cost * (defaultMargin / 100))).toFixed(4));
        const prodRef = db.collection('telecard_prods').doc(safeId);
        
        currentBatch.set(prodRef, {
            id: safeId,
            name: prod.name,
            costPrice: prod.cost,
            price: finalPrice,
            supplierId: supplierId,
            vaultPoolId: vaultId,
            isExternal: true,
            isAvailable: true,
            lastSync: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        operationCount++;
        if (operationCount >= 450) commitAndReset(); // أمان أعلى لعدم تخطي سقف 500
        
        if (prod.codes && prod.codes.length > 0) {
            const vaultRef = db.collection('telecard_vault').doc(vaultId);
            currentBatch.set(vaultRef, {
                id: vaultId,
                supplierId: supplierId,
                codes: prod.codes,
                lastSync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            operationCount++;
            if (operationCount >= 450) commitAndReset();
        }
        
        importedCount++;
    });
    
    // 🌟 البحث عن المنتجات التي تم حذفها من جهة المورد لتعطيلها في متجرنا
    const existingProdsSnap = await db.collection('telecard_prods').where('supplierId', '==', supplierId).get();
    let deletedCount = 0;
    
    existingProdsSnap.forEach(doc => {
        if (!fetchedIds.has(doc.id)) {
            currentBatch.update(doc.ref, {
                isAvailable: false,
                syncNote: 'تم حذفه أو إخفاؤه من قبل المورد'
            });
            operationCount++;
            deletedCount++;
            if (operationCount >= 450) commitAndReset();
        }
    });
    
    // تحديث إحصائيات المورد
    currentBatch.update(suppRef, {
        lastSync: admin.firestore.FieldValue.serverTimestamp(),
        importedCount: importedCount
    });
    
    batches.push(currentBatch.commit());
    await Promise.all(batches); // تنفيذ كافة الدفعات بشكل تزامني صاروخي
    
    return { importedCount, deletedCount };
};

// ==========================================
// 🚀 1. دالة المزامنة اليدوية (من زر لوحة التحكم)
// ==========================================
exports.syncSupplierData = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح.');
    
    try {
        const result = await coreSyncLogic(data.supplierId);
        return { 
            success: true, 
            message: `تمت مزامنة ${result.importedCount} منتج. وتم تعطيل ${result.deletedCount} منتج محذوف.`,
            importedCount: result.importedCount,
            deletedCount: result.deletedCount
        };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ==========================================
// ⏱️ 2. دالة المزامنة التلقائية (المجدولة) - Cron Job
// ==========================================
exports.scheduledSupplierSync = functions.region('us-east1').pubsub.schedule('0 */12 * * *')
    .timeZone('Asia/Riyadh')
    .onRun(async (context) => {
        try {
            const suppliersSnap = await db.collection('telecard_suppliers')
                .where('isActive', '==', true)
                .where('autoSync', '==', true)
                .get();
                
            if (suppliersSnap.empty) {
                console.log("No active auto-sync suppliers found.");
                return null;
            }

            // 🌟 معالجة متسلسلة (Sequential Processing) لحماية ذاكرة السيرفر (RAM) 
            // ينهي السيرفر مزامنة المورد الأول، يفرغ الذاكرة، ثم ينتقل للثاني
            for (const doc of suppliersSnap.docs) {
                try {
                    console.log(`Starting Auto-Sync for supplier: ${doc.id}`);
                    await coreSyncLogic(doc.id);
                    console.log(`Successfully synced supplier: ${doc.id}`);
                } catch (e) {
                    console.error(`Auto-Sync failed for supplier ${doc.id}:`, e);
                }
            }

            console.log("Auto-Sync completed successfully.");
            return true;
        } catch (error) {
            console.error("Scheduled Sync Critical Error:", error);
            return null;
        }
    });

// ==========================================
// 🛡️ 3. دالة حفظ المورد الآمنة (تفصل المفتاح عن البيانات)
// ==========================================
exports.secureSaveSupplier = functions.region('us-east1').https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح.');
    
    const { id, name, type, baseUrl, token, defaultMargin, autoSync } = data;
    const suppId = id || 'supp_' + Date.now();
    
    try {
        const batch = db.batch();
        const suppRef = db.collection('telecard_suppliers').doc(suppId);
        const secretRef = suppRef.collection('secrets').doc('api');
        
        // حفظ البيانات العادية (للعرض في لوحة التحكم)
        batch.set(suppRef, {
            id: suppId,
            name,
            type,
            baseUrl,
            defaultMargin: Number(defaultMargin),
            autoSync: Boolean(autoSync),
            isActive: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // حفظ المفتاح السري في الغرفة المعزولة 
        if (token && token.trim() !== '') {
            batch.set(secretRef, { token: token }, { merge: true });
        }
        
        await batch.commit();
        return { success: true, id: suppId };
    } catch (error) {
        throw new functions.https.HttpsError('internal', 'فشل حفظ بيانات المورد.');
    }
});
