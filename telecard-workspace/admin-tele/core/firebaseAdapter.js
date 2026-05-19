// ============================================================================
// ☁️ محول فايربيز (core/firebaseAdapter.js) - The Cloud Gateway
// 🎯 الوظيفة: الاتصال بقاعدة بيانات Firestore والتعامل مع المجموعات والمستندات والـ Auth
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, query, where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// 🌟 استيراد محرك التحقق من الهوية الرسمي
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

// تصدير كائن الـ auth لكي تتمكن ملفات الإقلاع من قراءته فوراً
export { auth, db };

export const FirebaseAdapter = {
    db: db,

    // 📥 1. جلب كل البيانات من مجموعة معينة
    async getAll(collectionName) {
        try {
            if (!collectionName) throw new Error("اسم المجموعة (Collection Name) غير معرّف!");
            const snapshot = await getDocs(collection(db, collectionName));
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.log(`🚨 خطأ في جلب مجموعة [${collectionName}]: ${error.message}`);
            return [];
        }
    },

    // 📄 2. جلب مستند واحد محدد
    async getById(collectionName, docId) {
        try {
            if (!collectionName || !docId) throw new Error("اسم المجموعة أو الـ ID غير معرّف!");
            const docRef = doc(db, collectionName, String(docId));
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) {
            console.log(`🚨 خطأ في جلب المستند [${docId}]: ${error.message}`);
            return null;
        }
    },

    // 💾 3. حفظ أو تحديث مستند بـ ID محدد
    async set(collectionName, docId, data) {
        try {
            if (!collectionName || !docId) throw new Error("اسم المجموعة أو الـ ID غير معرّف!");
            const docRef = doc(db, collectionName, String(docId));
            await setDoc(docRef, data, { merge: true });
            return true;
        } catch (error) {
            console.log(`🚨 خطأ في حفظ المستند [${docId}]: ${error.message}`);
            return false;
        }
    },

    // ➕ 4. إضافة مستند جديد
    async add(collectionName, data) {
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const docRef = await addDoc(collection(db, collectionName), data);
            return docRef.id;
        } catch (error) {
            console.log(`🚨 خطأ في الإضافة للمجموعة [${collectionName}]: ${error.message}`);
            return null;
        }
    },

    // 🗑️ 5. حذف مستند
    async delete(collectionName, docId) {
        try {
            if (!collectionName || !docId) throw new Error("اسم المجموعة أو الـ ID غير معرّف!");
            await deleteDoc(doc(db, collectionName, String(docId)));
            return true;
        } catch (error) {
            console.log(`🚨 خطأ في حذف المستند [${docId}]: ${error.message}`);
            return false;
        }
    },

    // 📡 6. الاستماع الحي (Real-time) للمجموعة بالكامل
    listenCollection(collectionName, callback) {
        return onSnapshot(collection(db, collectionName), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    // 📡 7. الاستماع الحي لمستند واحد فقط (ضرورية لملف العميل)
    listenDoc(collectionName, docId, callback) {
        return onSnapshot(doc(db, collectionName, String(docId)), (snapshot) => {
            if (snapshot.exists()) {
                callback({ id: snapshot.id, ...snapshot.data() });
            } else {
                callback(null);
            }
        });
    },

    // 📡 8. الاستماع الحي بفلتر ذكي (ضرورية لطلبات وإيداعات العميل فقط)
    listenQuery(collectionName, condition, callback) {
        try {
            const q = query(collection(db, collectionName), where(condition[0], condition[1], condition[2]));
            return onSnapshot(q, (snapshot) => {
                const arr = [];
                snapshot.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
                callback(arr);
            });
        } catch (error) {
            console.log(`🚨 خطأ في الاستماع المشروط للمجموعة [${collectionName}]: ${error.message}`);
            return () => {}; // إرجاع دالة فارغة لتجنب الأخطاء عند إيقاف الاستماع
        }
    }
};
