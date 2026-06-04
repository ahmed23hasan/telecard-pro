// ============================================================================
// ☁️ محول فايربيز المركزي الموحد (core/firebaseAdapter.js) - Pro Version
// 🎯 الوظيفة: البوابة المشتركة للمتجر للاتصال بـ Firestore & Storage & Auth
// 🌟 التحديث: تفعيل الاتصال السريع + إرسال روابط التعيين + التشفير الأمني لكلمات المرور
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 🌟 استيراد دوال المصادقة، وإرسال الروابط، وإعادة المصادقة الأمنية
import { 
    getAuth, 
    sendPasswordResetEmail, 
    updatePassword, 
    reauthenticateWithCredential, 
    EmailAuthProvider 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

// 🌟 تفعيل الاتصال
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); 

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
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const snapshot = await this._withTimeout(getDocs(collection(db, collectionName)), 10000, `getAll -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`🚨 خطأ في جلب مجموعة [${collectionName}]: ${error.message}`);
            return [];
        }
    },

    // 📥 2. جلب أحدث البيانات بحد معين (Pagination)
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

    // ==========================================
    // 🛡️ 9. المستمع الحي بفلتر ذكي (مُرقّى لحماية الفاتورة)
    // ==========================================
    listenQuery(collectionName, condition, orderByField = 'time', limitCount = 30, callback) {
        try {
            const q = query(
                collection(db, collectionName), 
                where(condition[0], condition[1], condition[2]),
                orderBy(orderByField, 'desc'),
                limit(limitCount) // 🎯 تقييد القراءات لخفض الفاتورة 90%
            );
            
            return onSnapshot(q, (snapshot) => {
                const arr = [];
                // استخراج آخر مستند لاستخدامه كمؤشر (Cursor) للتحميل المستقبلي
                const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
                
                snapshot.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
                callback(arr, lastDoc); // إرسال الداتا + المؤشر
            }, (error) => {
                console.error(`🚨 تم رفض الاستماع للمجموعة [${collectionName}]:`, error.message);
            });
        } catch (error) {
            console.error(`🚨 خطأ في بناء استعلام المجموعة [${collectionName}]: ${error.message}`);
            return () => {}; 
        }
    },

    // ==========================================
    // 🪄 10. جلب الأرشيف القديم (Cursor Pagination) 
    // تعمل مرة واحدة فقط عند الضغط على "عرض المزيد"
    // ==========================================
    async fetchMoreWithCursor(collectionName, condition, orderByField = 'time', lastDocMarker, limitCount = 15) {
        try {
            if (!lastDocMarker) return { data: [], newLastDoc: null };
            
            const q = query(
                collection(db, collectionName),
                where(condition[0], condition[1], condition[2]),
                orderBy(orderByField, 'desc'),
                startAfter(lastDocMarker), // 🎯 يبدأ البحث من حيث توقفنا في المرة السابقة
                limit(limitCount)
            );
            
            const snapshot = await this._withTimeout(getDocs(q), 10000, `fetchMore -> ${collectionName}`);
            
            const arr = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const newLastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
            
            return { data: arr, newLastDoc: newLastDoc };
        } catch (error) {
            console.error(`🚨 خطأ في جلب الأرشيف القديم [${collectionName}]: ${error.message}`);
            return { data: [], newLastDoc: null };
        }
    },

    // ==========================================
    // ☁️ 11. محرك رفع الصور والملفات (Storage Engine)
    // ==========================================
    async uploadImage(file, folderName = 'general', customFileName = null, oldImageUrl = null) {
        if (!file) return '';
        try {
            if (oldImageUrl && oldImageUrl.includes('firebasestorage')) {
                try {
                    const oldImageRef = ref(storage, oldImageUrl);
                    await deleteObject(oldImageRef);
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
    // 🧹 12. دالة الحذف المباشر (Direct Delete) 
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
    // 🔑 13. إرسال رابط إعادة تعيين كلمة المرور (Password Reset) 
    // ==========================================
    async sendResetEmail(email) {
        try {
            await sendPasswordResetEmail(auth, email);
            return { success: true };
        } catch (error) {
            console.error("Firebase Reset Error:", error);
            let errorMsg = 'تعذر إرسال الرابط، يرجى المحاولة لاحقاً.';
            if (error.code === 'auth/user-not-found') errorMsg = 'هذا البريد غير مسجل لدينا.';
            if (error.code === 'auth/too-many-requests') errorMsg = 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً لحماية حسابك.';
            if (error.code === 'auth/invalid-email') errorMsg = 'صيغة البريد الإلكتروني غير صحيحة.';
            
            return { success: false, msg: errorMsg };
        }
    },

    // ==========================================
    // 🔒 14. تغيير كلمة المرور بأمان تام (مع إعادة المصادقة)
    // ==========================================
    async changeUserPassword(currentPassword, newPassword) {
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("auth/no-user");

            // 1. إعادة المصادقة (إثبات هوية العميل) بالكلمة القديمة
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);

            // 2. إذا طابقت الكلمة القديمة، نقوم بتحديث كلمة المرور في سيرفرات فايربيز المشفرة
            await updatePassword(user, newPassword);
            return { success: true };
            
        } catch (error) {
            console.error("Firebase Password Change Error:", error);
            let errorMsg = 'تعذر تحديث كلمة المرور بسبب خطأ في الخادم.';
            
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                errorMsg = 'كلمة المرور الحالية التي أدخلتها غير صحيحة.';
            } else if (error.code === 'auth/weak-password') {
                errorMsg = 'كلمة المرور الجديدة ضعيفة جداً (يجب أن تكون 6 أحرف على الأقل).';
            } else if (error.code === 'auth/too-many-requests') {
                errorMsg = 'محاولات خاطئة كثيرة، تم حظر الإجراء مؤقتاً لحمايتك.';
            } else if (error.code === 'auth/network-request-failed') {
                errorMsg = 'خطأ في الاتصال بالإنترنت.';
            }
            
            return { success: false, msg: errorMsg };
        }
    }
};