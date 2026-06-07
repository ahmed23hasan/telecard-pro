// ============================================================================
// ☁️ محول فايربيز المركزي (admin-tele/core/firebaseAdapter.js) - Bank Grade 🏦
// 🎯 الوظيفة: بوابة البيانات المستقلة للتحقق الآمن من هوية المشرفين وإدارتهم
// 🌟 التحديث: إضافة الاستعلام المتوازي (Parallel Queries) للسجل المالي الموحد
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

// 🌟 الإصلاح 1: استيراد المفاتيح من المصدر الموحد (SSOT) لسهولة الصيانة مستقبلاً
import { firebaseConfig } from '../adminConfig.js';

// 🚀 تهيئة الاتصال بـ Firebase
const app = initializeApp(firebaseConfig);

// 🌟 تفعيل الاتصال السريع المباشر (WebSockets) للوحة الإدارة
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); 

// 🌟 توجيه كل الاتصالات إلى سيرفر us-east1 لحل مشكلة CORS نهائياً
const functions = getFunctions(app, 'us-east1');

export { auth, db, storage, functions };

export const FirebaseAdapter = {
    db: db,
    storage: storage,
    functions: functions,

    // ==========================================
    // 🛡️ [الدرع الثاني]: الحماية من التعليق الأبدي
    // ==========================================
    _withTimeout: function(promise, ms = 10000, context = '') {
        return Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`[Timeout] السيرفر لم يستجب لطلب: ${context} خلال ${ms/1000} ثوانٍ`)), ms)
            )
        ]);
    },

    // 📥 1. جلب كل البيانات من مجموعة معينة
    async getAll(collectionName) {
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const snapshot = await this._withTimeout(getDocs(collection(db, collectionName)), 10000, `getAll -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`🚨 خطأ في جلب مجموعة [${collectionName}]: ${error.message}`);
            return [];
        }
    },

    // 📥 2. جلب أحدث البيانات بحد معين 
    async getRecent(collectionName, limitCount = 50, orderByField = 'time') {
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const q = query(collection(db, collectionName), orderBy(orderByField, 'desc'), limit(limitCount));
            const snapshot = await this._withTimeout(getDocs(q), 10000, `getRecent -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`🚨 خطأ في جلب أحدث بيانات [${collectionName}]: ${error.message}`);
            return [];
        }
    },

    // 📄 3. جلب مستند واحد محدد
    async getById(collectionName, docId) {
        try {
            if (!collectionName || !docId) throw new Error("اسم المجموعة أو الـ ID غير معرّف!");
            const docRef = doc(db, collectionName, String(docId));
            const docSnap = await this._withTimeout(getDoc(docRef), 10000, `getById -> ${collectionName}/${docId}`);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) {
            console.error(`🚨 خطأ في جلب المستند [${docId}]: ${error.message}`);
            return null;
        }
    },

    // 💾 4. حفظ أو تحديث مستند (🌟 محمي بـ Timeout الآن)
    async set(collectionName, docId, data) {
        try {
            if (!collectionName || !docId) throw new Error("اسم المجموعة أو الـ ID غير معرّف!");
            const docRef = doc(db, collectionName, String(docId));
            // 🌟 الإصلاح 2: منع التعليق الأبدي عند انقطاع الإنترنت أثناء الحفظ
            await this._withTimeout(setDoc(docRef, data, { merge: true }), 10000, `set -> ${collectionName}/${docId}`);
            return true;
        } catch (error) {
            console.error(`🚨 خطأ في حفظ المستند [${docId}]: ${error.message}`);
            return false;
        }
    },

    // ➕ 5. إضافة مستند جديد (🌟 محمي بـ Timeout الآن)
    async add(collectionName, data) {
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            // 🌟 منع التعليق الأبدي
            const docRef = await this._withTimeout(addDoc(collection(db, collectionName), data), 10000, `add -> ${collectionName}`);
            return docRef.id;
        } catch (error) {
            console.error(`🚨 خطأ في الإضافة للمجموعة [${collectionName}]: ${error.message}`);
            return null;
        }
    },

    // 🗑️ 6. حذف مستند (🌟 محمي بـ Timeout الآن)
    async delete(collectionName, docId) {
        try {
            if (!collectionName || !docId) throw new Error("اسم المجموعة أو الـ ID غير معرّف!");
            // 🌟 منع التعليق الأبدي
            await this._withTimeout(deleteDoc(doc(db, collectionName, String(docId))), 10000, `delete -> ${collectionName}/${docId}`);
            return true;
        } catch (error) {
            console.error(`🚨 خطأ في حذف المستند [${docId}]: ${error.message}`);
            return false;
        }
    },

    // 📡 7. الاستماع الحي (Real-time) للمجموعة بالكامل
    listenCollection(collectionName, callback) {
        return onSnapshot(collection(db, collectionName), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    // 📡 8. الاستماع الحي لمستند واحد فقط
    listenDoc(collectionName, docId, callback) {
        return onSnapshot(doc(db, collectionName, String(docId)), (snapshot) => {
            if (snapshot.exists()) {
                callback({ id: snapshot.id, ...snapshot.data() });
            } else {
                callback(null);
            }
        });
    },

    // 📡 9. الاستماع الحي بفلتر ذكي 
    listenQuery(collectionName, condition, callback) {
        try {
            const q = query(collection(db, collectionName), where(condition[0], condition[1], condition[2]));
            return onSnapshot(q, (snapshot) => {
                const arr = [];
                snapshot.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
                callback(arr);
            }, (error) => {
                console.error(`🚨 تم رفض أو فشل الاستماع للمجموعة [${collectionName}]:`, error.message);
            });
        } catch (error) {
            console.error(`🚨 خطأ في بناء استعلام المجموعة [${collectionName}]: ${error.message}`);
            return () => {}; 
        }
    },

    // ==========================================
    // ☁️ 10. محرك رفع الصور والملفات 
    // ==========================================
    async uploadImage(file, folderName = 'general', customFileName = null, oldImageUrl = null) {
        if (!file) return '';
        try {
            if (oldImageUrl && oldImageUrl.includes('firebasestorage')) {
                try {
                    const oldImageRef = ref(storage, oldImageUrl);
                    // تنظيف الخلفية بصمت
                    deleteObject(oldImageRef).catch(()=>{});
                } catch (delErr) { }
            }

            const safeFileName = file.name ? file.name.replace(/[^a-zA-Z0-9.-]/g, '_') : 'image.jpg';
            const finalFileName = customFileName ? customFileName : `${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${safeFileName}`;
            const storageRef = ref(storage, `${folderName}/${finalFileName}`);
            
            const fileBuffer = await file.arrayBuffer();

            const snapshot = await this._withTimeout(
                uploadBytes(storageRef, fileBuffer, { contentType: file.type }), 
                15000, 
                "عملية رفع الصورة"
            );

            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;

        } catch (error) {
            console.error("🚨 خطأ في محرك التخزين السحابي:", error);
            throw new Error(error.message || 'تعذر الرفع، السيرفر لم يستجب.');
        }
    },

    // ==========================================
    // 🧹 11. دالة الحذف المباشر
    // ==========================================
    async deleteImageByUrl(url) {
        if (!url || typeof url !== 'string' || !url.includes('firebasestorage')) return;
        try {
            const imgRef = ref(storage, url);
            await deleteObject(imgRef);
            console.log(`🗑️ تم تنظيف السحابة: مسح الصورة نهائياً (${url})`);
        } catch (error) {
            console.warn("⚠️ تنظيف السحابة: الصورة المراد حذفها لم تعد موجودة", error.message);
        }
    },

    // ==========================================
    // ⚡ 12. الموجه المركزي للاتصال بالسيرفر (Cloud Functions Gateway)
    // ==========================================
    async callFunction(functionName, payload = {}) {
        try {
            console.log(`🚀 جاري الاتصال بالسيرفر لاستدعاء [${functionName}]...`);
            const targetFunction = httpsCallable(functions, functionName);
            
            const result = await this._withTimeout(
                targetFunction(payload), 
                15000, 
                `Cloud Function -> ${functionName}`
            );
            return result.data;
        } catch (error) {
            const errorMessage = error.message || 'فشل الاتصال بالسيرفر أو انتهت المهلة.';
            console.error(`🚨 خطأ في السيرفر أثناء استدعاء [${functionName}]:`, errorMessage);
            throw new Error(errorMessage);
        }
    },

    // ==========================================
    // 🔍 13. الاستعلامات المركبة والمخصصة (Complex Queries)
    // ==========================================
    
    // جلب السجل المالي الشامل للعميل (إيداعات + مشتريات) بتكلفة منخفضة جداً مع حماية Timeout
// جلب السجل المالي الشامل للعميل (إيداعات + مشتريات) بتكلفة منخفضة جداً مع حماية Timeout
async getCustomerFullHistory(userId, limitPerCollection = 25) {
    if (!userId) return [];
    try {
        const safeUserId = String(userId);
        
        // 🌟 الإصلاح: تعديل أسماء المجموعات لتطابق المجموعات الفعلية 'telecard_orders' و 'telecard_deposits'
        const ordersQuery = query(
            collection(db, 'telecard_orders'),
            where('userId', '==', safeUserId),
            orderBy('time', 'desc'),
            limit(limitPerCollection)
        );
        
        const depositsQuery = query(
            collection(db, 'telecard_deposits'),
            where('userId', '==', safeUserId),
            orderBy('time', 'desc'),
            limit(limitPerCollection)
        );
        
        // التنفيذ المتوازي (Parallel Execution) لاختصار نصف وقت الانتظار
        const [ordersSnap, depositsSnap] = await this._withTimeout(
            Promise.all([getDocs(ordersQuery), getDocs(depositsQuery)]),
            12000,
            `getCustomerFullHistory -> ${safeUserId}`
        );
        
        const activities = [];
        
        // دمج الطلبات مع ختم النوع
        ordersSnap.forEach(doc => {
            activities.push({ id: doc.id, txType: 'order', ...doc.data() });
        });
        
        // دمج الإيداعات مع ختم النوع
        depositsSnap.forEach(doc => {
            activities.push({ id: doc.id, txType: 'deposit', ...doc.data() });
        });
        
        // دالة مساعدة لتأمين قراءة التاريخ بغض النظر عن صيغته في قاعدة البيانات
        const parseTimeSafe = (t) => {
            if (!t) return 0;
            if (typeof t.toMillis === 'function') return t.toMillis();
            if (typeof t === 'number') return t;
            const parsed = new Date(t).getTime();
            return isNaN(parsed) ? 0 : parsed;
        };
        
        // ترتيب مدمج تنازلياً (الأحدث أولاً)
        activities.sort((a, b) => {
            const timeA = parseTimeSafe(a.time || a.createdAt || a.date);
            const timeB = parseTimeSafe(b.time || b.createdAt || b.date);
            return timeB - timeA;
        });
        
        return activities;
        
    } catch (error) {
        console.error(`🚨 خطأ في جلب السجل الشامل للعميل [${userId}]: ${error.message}`);
        return []; // إرجاع مصفوفة فارغة كي لا تنهار الواجهة
    }
}};
