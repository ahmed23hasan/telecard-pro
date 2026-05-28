// ============================================================================
// ☁️ محول فايربيز المركزي الموحد (core/firebaseAdapter.js) - The Ultimate Cloud Gateway
// 🎯 الوظيفة: البوابة المشتركة للمتجر والإدارة للاتصال بـ Firestore & Storage & Auth
// 🌟 المعمارية القصوى: Long Polling + Timeout Wrapper + ArrayBuffer + Anti-Leak + Debug Logs
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    initializeFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// 🔑 مفاتيح الربط الخاصة بمتجر Telecard 
const firebaseConfig = {
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78"
};

// 🚀 تهيئة الاتصال بـ Firebase
const app = initializeApp(firebaseConfig);

// 🌟 [الدرع الأول]: إجبار فايربيز على استخدام اتصال (Long Polling) المستقر 
// يمنع أخطاء (WebChannel Connection)، ويفك حظر الـ Websockets لضمان المزامنة الحية دائماً!
const db = initializeFirestore(app, { experimentalForceLongPolling: true });

const auth = getAuth(app);
const storage = getStorage(app); 

// تصدير الكائنات لكي تتمكن ملفات الإقلاع الأخرى من قراءتها فوراً
export { auth, db, storage };

export const FirebaseAdapter = {
    db: db,
    storage: storage,

    // ==========================================
    // 🛡️ [الدرع الثاني]: الحماية من التعليق الأبدي (Timeout Wrapper)
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
            if (!collectionName) throw new Error("اسم المجموعة (Collection Name) غير معرّف!");
            // 🌟 تطبيق المؤقت هنا لمنع الفشل الصامت
            const snapshot = await this._withTimeout(getDocs(collection(db, collectionName)), 10000, `getAll -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`🚨 خطأ في جلب مجموعة [${collectionName}]: ${error.message}`);
            return []; // إرجاع مصفوفة فارغة لمنع انهيار النظام
        }
    },

    // 📥 2. جلب أحدث البيانات بحد معين (Pagination)
    async getRecent(collectionName, limitCount = 50, orderByField = 'time') {
        try {
            if (!collectionName) throw new Error("اسم المجموعة (Collection Name) غير معرّف!");
            
            const q = query(
                collection(db, collectionName), 
                orderBy(orderByField, 'desc'), 
                limit(limitCount)
            );
            
            // 🌟 تطبيق المؤقت هنا لمنع الفشل الصامت
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
            // 🌟 تطبيق المؤقت هنا لمنع الفشل الصامت
            const docSnap = await this._withTimeout(getDoc(docRef), 10000, `getById -> ${collectionName}/${docId}`);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) {
            console.error(`🚨 خطأ في جلب المستند [${docId}]: ${error.message}`);
            return null;
        }
    },

    // 💾 4. حفظ أو تحديث مستند بـ ID محدد
    async set(collectionName, docId, data) {
        try {
            if (!collectionName || !docId) throw new Error("اسم المجموعة أو الـ ID غير معرّف!");
            const docRef = doc(db, collectionName, String(docId));
            await setDoc(docRef, data, { merge: true });
            return true;
        } catch (error) {
            console.error(`🚨 خطأ في حفظ المستند [${docId}]: ${error.message}`);
            return false;
        }
    },

    // ➕ 5. إضافة مستند جديد
    async add(collectionName, data) {
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const docRef = await addDoc(collection(db, collectionName), data);
            return docRef.id;
        } catch (error) {
            console.error(`🚨 خطأ في الإضافة للمجموعة [${collectionName}]: ${error.message}`);
            return null;
        }
    },

    // 🗑️ 6. حذف مستند
    async delete(collectionName, docId) {
        try {
            if (!collectionName || !docId) throw new Error("اسم المجموعة أو الـ ID غير معرّف!");
            await deleteDoc(doc(db, collectionName, String(docId)));
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

    // 📡 8. الاستماع الحي لمستند واحد فقط (ضرورية لملف العميل)
    listenDoc(collectionName, docId, callback) {
        return onSnapshot(doc(db, collectionName, String(docId)), (snapshot) => {
            if (snapshot.exists()) {
                callback({ id: snapshot.id, ...snapshot.data() });
            } else {
                callback(null);
            }
        });
    },

    // 📡 9. الاستماع الحي بفلتر ذكي (ضرورية لطلبات وإيداعات العميل فقط)
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
    // ☁️ 10. محرك رفع الصور والملفات (Storage Engine - Pro Version)
    // ==========================================
    async uploadImage(file, folderName = 'general', customFileName = null, oldImageUrl = null) {
        if (!file) return '';
        try {
            // 🧹 التنظيف الذكي للصورة القديمة
            if (oldImageUrl && oldImageUrl.includes('firebasestorage')) {
                try {
                    const oldImageRef = ref(storage, oldImageUrl);
                    await deleteObject(oldImageRef);
                } catch (delErr) { /* تجاهل خطأ المسح لو كانت الصورة غير موجودة أصلاً */ }
            }
            
            const safeFileName = file.name ? file.name.replace(/[^a-zA-Z0-9.-]/g, '_') : 'image.jpg';
            const finalFileName = customFileName ? customFileName : `${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${safeFileName}`;
            const storageRef = ref(storage, `${folderName}/${finalFileName}`);
            
            console.log("⏳ جاري بدء الرفع السحابي لـ:", finalFileName);
            
            // 🌟 [الدرع الثالث: العلاج السحري للتجمد]: تحويل الملف إلى ArrayBuffer قبل الرفع
            // هذا السطر يمنع الـ (Silent Hang Bug) في Firebase بشكل قاطع!
            const fileBuffer = await file.arrayBuffer();
            
            // 🌟 [الضربة القاضية]: تغليف الرفع بجدار الحماية لمنع التعليق الأبدي (12 ثانية كحد أقصى)
            const snapshot = await this._withTimeout(
                uploadBytes(storageRef, fileBuffer, { contentType: file.type }),
                12000,
                "عملية رفع الصورة"
            );
            
            console.log("✅ اكتمل الرفع بالسحابة، جاري سحب الرابط...");
            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;
            
        } catch (error) {
            console.error("🚨 خطأ في محرك التخزين السحابي:", error);
            // 🌟 تمرير رسالة الخطأ للأعلى ليراها المستخدم
            throw new Error(error.message || 'تعذر الرفع، السيرفر لم يستجب.');
        }
    },

    // ==========================================
    // 🧹 11. دالة الحذف المباشر (Direct Delete) - [لحماية المساحة السحابية من التسريب]
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
    }
};
