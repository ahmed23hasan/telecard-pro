// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة المتقدمة
// ============================================================================

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const isMasterAdmin = (context) => {
    if (!context.auth) return false;
    return context.auth.token.email === 'admin@telecard.pro' || context.auth.uid === 'e064MQJyn6dhU9mNXZvXItc7VYg2';
};

// 🔌 محولات المنصات (Provider Adapters)
const ProviderAdapters = {
    salla: async (baseUrl, token) => { /* ... كود سلة (كما في السابق) ... */ return []; },
    zid: async (baseUrl, token) => { /* ... كود زد (كما في السابق) ... */ return []; },
    custom: async (baseUrl, token) => {
        const response = await fetch(`${baseUrl}/export-products`, {
            headers: { 'x-api-key': token, 'Content-Type': 'application/json' }
        });
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
// 🧠 النواة المركزية للمزامنة (تُستخدم يدوياً وآلياً)
// ==========================================
const coreSyncLogic = async (supplierId) => {
    const suppRef = db.collection('telecard_suppliers').doc(String(supplierId));
    const suppSnap = await suppRef.get();
    
    if (!suppSnap.exists) throw new Error('المورد غير موجود.');
    const supplier = suppSnap.data();
    
    if (!supplier.isActive) throw new Error('المورد معطل حالياً.');

    // 🛡️ الأمان: جلب المفتاح السري من المسار المعزول
    const secretSnap = await suppRef.collection('secrets').doc('api').get();
    const token = secretSnap.exists ? secretSnap.data().token : null;
    if (!token) throw new Error('لا يوجد مفتاح ربط سري لهذا المورد.');

    const fetchAdapter = ProviderAdapters[supplier.type];
    if (!fetchAdapter) throw new Error('نوع المورد غير مدعوم.');

    // جلب البيانات من المورد
    const normalizedProducts = await fetchAdapter(supplier.baseUrl, token);
    const batch = db.batch();
    
    const fetchedIds = new Set();
    let importedCount = 0;
    const defaultMargin = Number(supplier.defaultMargin || 0);

    // 1. معالجة المنتجات القادمة وتحديثها
    normalizedProducts.forEach(prod => {
        const safeId = `ext_${supplierId}_${prod.externalId}`;
        const vaultId = `vault_${safeId}`;
        fetchedIds.add(safeId);
        
        const finalPrice = Number((prod.cost + (prod.cost * (defaultMargin / 100))).toFixed(4));

        const prodRef = db.collection('telecard_prods').doc(safeId);
        batch.set(prodRef, {
            id: safeId,
            name: prod.name,
            costPrice: prod.cost,
            price: finalPrice,
            supplierId: supplierId,
            vaultPoolId: vaultId,
            isExternal: true,
            isAvailable: true, // إعادة تفعيله إذا كان محذوفاً وعاد
            lastSync: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        if (prod.codes && prod.codes.length > 0) {
            const vaultRef = db.collection('telecard_vault').doc(vaultId);
            batch.set(vaultRef, {
                id: vaultId,
                supplierId: supplierId,
                codes: prod.codes,
                lastSync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        importedCount++;
    });

    // 2. 🗑️ معالجة المنتجات المحذوفة (Orphan Handling)
    // البحث عن كل منتجات هذا المورد في متجرنا
    const existingProdsSnap = await db.collection('telecard_prods').where('supplierId', '==', supplierId).get();
    let deletedCount = 0;

    existingProdsSnap.forEach(doc => {
        if (!fetchedIds.has(doc.id)) {
            // هذا المنتج لم يعد يأتي من المورد، يجب تعطيله
            batch.update(doc.ref, { 
                isAvailable: false, 
                syncNote: 'تم حذفه أو إخفاؤه من قبل المورد' 
            });
            deletedCount++;
        }
    });

    // تحديث إحصائيات المورد
    batch.update(suppRef, { 
        lastSync: admin.firestore.FieldValue.serverTimestamp(),
        importedCount: importedCount 
    });

    await batch.commit();
    return { importedCount, deletedCount };
};

// ==========================================
// 🚀 1. دالة المزامنة اليدوية (من زر لوحة التحكم)
// ==========================================
exports.syncSupplierData = functions.https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح.');
    try {
        const result = await coreSyncLogic(data.supplierId);
        return { success: true, message: `تم مزامنة ${result.importedCount} منتج. وتم تعطيل ${result.deletedCount} منتج محذوف.` };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ==========================================
// ⏱️ 2. دالة المزامنة التلقائية (المجدولة) - Cron Job
// تعمل كل 12 ساعة بتوقيت مكة المكرمة
// ==========================================
exports.scheduledSupplierSync = functions.pubsub.schedule('0 */12 * * *')
    .timeZone('Asia/Riyadh')
    .onRun(async (context) => {
        try {
            // جلب كل الموردين المفعلين والذين يدعمون المزامنة التلقائية
            const suppliersSnap = await db.collection('telecard_suppliers')
                .where('isActive', '==', true)
                .where('autoSync', '==', true)
                .get();

            if (suppliersSnap.empty) {
                console.log("No active auto-sync suppliers found.");
                return null;
            }

            // تشغيل المزامنة لكل مورد (بشكل متزامن Parallel)
            const syncPromises = suppliersSnap.docs.map(doc => coreSyncLogic(doc.id).catch(e => {
                console.error(`Auto-Sync failed for supplier ${doc.id}:`, e);
            }));

            await Promise.all(syncPromises);
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
exports.secureSaveSupplier = functions.https.onCall(async (data, context) => {
    if (!isMasterAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'غير مصرح.');
    
    const { id, name, type, baseUrl, token, defaultMargin, autoSync } = data;
    const suppId = id || 'supp_' + Date.now();

    try {
        const batch = db.batch();
        const suppRef = db.collection('telecard_suppliers').doc(suppId);
        const secretRef = suppRef.collection('secrets').doc('api');

        // حفظ البيانات العادية (للعرض في لوحة التحكم)
        batch.set(suppRef, {
            id: suppId, name, type, baseUrl, 
            defaultMargin: Number(defaultMargin), 
            autoSync: Boolean(autoSync),
            isActive: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // حفظ المفتاح السري في الغرفة المعزولة (فقط إذا تم تمريره لتجنب مسح المفتاح القديم بالخطأ)
        if (token && token.trim() !== '') {
            batch.set(secretRef, { token: token }, { merge: true });
        }

        await batch.commit();
        return { success: true, id: suppId };
    } catch (error) {
        throw new functions.https.HttpsError('internal', 'فشل حفظ بيانات المورد.');
    }
});
