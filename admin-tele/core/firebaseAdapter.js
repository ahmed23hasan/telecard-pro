// ============================================================================
// ☁️ محول فايربيز (core/firebaseAdapter.js) - The Cloud Gateway
// 🎯 الوظيفة: الاتصال بقاعدة بيانات Firestore والتعامل مع المجموعات والمستندات
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const db = getFirestore(app);

export const FirebaseAdapter = {
    db: db,

    // 📥 1. جلب كل البيانات من مجموعة معينة (مثل: جلب كل الطلبات)
    async getAll(collectionName) {
        try {
            const snapshot = await getDocs(collection(db, collectionName));
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error fetching collection ${collectionName}:`, error);
            return [];
        }
    },

    // 📄 2. جلب مستند واحد محدد (مثل: جلب بيانات عميل برقم الـ ID الخاص به)
    async getById(collectionName, docId) {
        try {
            const docRef = doc(db, collectionName, String(docId));
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) {
            console.error(`Error fetching document ${docId}:`, error);
            return null;
        }
    },

    // 💾 3. حفظ أو تحديث مستند بـ ID محدد (مثل: تحديث إعدادات النظام أو حفظ عميل)
    // نستخدم { merge: true } لكي نقوم بتحديث البيانات بدون مسح الحقول القديمة
    async set(collectionName, docId, data) {
        try {
            const docRef = doc(db, collectionName, String(docId));
            await setDoc(docRef, data, { merge: true });
            return true;
        } catch (error) {
            console.error(`Error saving document ${docId}:`, error);
            return false;
        }
    },

    // ➕ 4. إضافة مستند جديد (الفايربيز سيقوم بتوليد ID معقد وآمن تلقائياً)
    async add(collectionName, data) {
        try {
            const docRef = await addDoc(collection(db, collectionName), data);
            return docRef.id;
        } catch (error) {
            console.error(`Error adding to ${collectionName}:`, error);
            return null;
        }
    },

    // 🗑️ 5. حذف مستند
    async delete(collectionName, docId) {
        try {
            await deleteDoc(doc(db, collectionName, String(docId)));
            return true;
        } catch (error) {
            console.error(`Error deleting ${docId}:`, error);
            return false;
        }
    },

    // 📡 6. الاستماع الحي (Real-time) للمجموعة - ستستخدم لتحديث الرصيد والإشعارات فوراً
    listenCollection(collectionName, callback) {
        return onSnapshot(collection(db, collectionName), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    }
};
