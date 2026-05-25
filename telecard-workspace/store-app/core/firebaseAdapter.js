// ============================================================================
// ☁️ محول فايربيز (core/firebaseAdapter.js) - The Unified Cloud Gateway
// 🎯 الوظيفة: الاتصال بقاعدة بيانات Firestore والتعامل مع المجموعات والمستندات والـ Auth والـ Storage
// 🌟 التحديث: دمج محرك الجلب الجزئي (Pagination) + رفع الصور بالأسماء المخصصة (Overwrite)
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// 🌟 استيراد محرك التحقق من الهوية الرسمي
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// 🌟 استيراد خدمات التخزين السحابي للصور والملفات
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// 🔑 مفاتيح الربط الخاصة بمتجر Telecard (مدمجة لتعمل على المتجر والإدارة معاً بدون مشاكل مسارات)
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
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); // ☁️ تهيئة محرك التخزين

// تصدير الكائنات لكي تتمكن ملفات الإقلاع الأخرى من قراءتها فوراً
export { auth, db, storage };

export const FirebaseAdapter = {
    db: db,
    storage: storage,

    // 📥 1. جلب كل البيانات من مجموعة معينة
    async getAll(collectionName) {
        try {
            if (!collectionName) throw new Error("اسم المجموعة (Collection Name) غير معرّف!");
            const snapshot = await getDocs(collection(db, collectionName));
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`🚨 خطأ في جلب مجموعة [${collectionName}]: ${error.message}`);
            return [];
        }
    },

    // 📥 2. [التحديث الاحترافي] جلب أحدث البيانات بحد معين (لخفض تكلفة فايربيز - Pagination)
    async getRecent(collectionName, limitCount = 50, orderByField = 'time') {
        try {
            if (!collectionName) throw new Error("اسم المجموعة (Collection Name) غير معرّف!");
            
            // إنشاء استعلام يجلب البيانات مرتبة تنازلياً ويقتطع العدد المطلوب فقط
            const q = query(
                collection(db, collectionName), 
                orderBy(orderByField, 'desc'), 
                limit(limitCount)
            );
            
            const snapshot = await getDocs(q);
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
            const docSnap = await getDoc(docRef);
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
            });
        } catch (error) {
            console.error(`🚨 خطأ في الاستماع المشروط للمجموعة [${collectionName}]: ${error.message}`);
            return () => {}; // إرجاع دالة فارغة لتجنب الأخطاء عند إيقاف الاستماع
        }
    },

    // ==========================================
    // ☁️ 10. محرك رفع الصور والملفات (Storage Engine)
    // ==========================================
    // ✅ تم دمج ميزة (customFileName) للكتابة فوق الملفات القديمة
    async uploadImage(file, folderName = 'general', customFileName = null) {
        if (!file) return '';
        try {
            // تنظيف اسم الملف من الرموز والمسافات لتجنب أخطاء تشفير الروابط (URL Encoding)
            const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            
            // إذا تم تمرير اسم مخصص نستخدمه، وإلا نولد اسماً عشوائياً فريداً
            const finalFileName = customFileName ? customFileName : `${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${safeFileName}`;
            
            const storageRef = ref(storage, `${folderName}/${finalFileName}`);
            
            // رفع الملف إلى السحابة
            const snapshot = await uploadBytes(storageRef, file);
            
            // استخراج الرابط المباشر (Download URL) لتخزينه في Firestore
            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;
        } catch (error) {
            console.error("🚨 خطأ في محرك التخزين السحابي (Storage):", error);
            throw new Error('فشل رفع الصورة إلى السحابة. تأكد من إعدادات Storage Rules.');
        }
    }
};
