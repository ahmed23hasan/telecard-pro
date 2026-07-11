// ============================================================================
// ☁️ محول فايربيز المركزي (admin-tele/core/firebaseAdapter.js) - Bank Grade 🏦
// 🎯 الوظيفة: بوابة البيانات المستقلة للتحقق الآمن من هوية المشرفين وإدارتهم
// 🌟 التحديث الأقصى (V5.2): الترقيع الصامت (Retry)، الاستعلام المتوازي، والـ Pagination
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

// 🌟 استيراد المفاتيح من المصدر الموحد (SSOT) 
import { firebaseConfig } from '../adminConfig.js';

// 🚀 تهيئة الاتصال بـ Firebase
const app = initializeApp(firebaseConfig);

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

    // 🛡️ [تعقيم المسارات]: منع ثغرات Path Traversal
    _sanitizeDocId: function(id) {
        if (!id) return '';
        return String(id).replace(/[\/\\]/g, '_').trim(); 
    },

    // 🛡️ [الدرع الثاني]: الحماية من التعليق الأبدي
    _withTimeout: function(promise, ms = 10000, context = '') {
        let timeoutId;
        promise.catch(() => {}); 
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                const err = new Error(`[Timeout] السيرفر لم يستجب لطلب: ${context} خلال ${ms/1000} ثوانٍ`);
                err.code = 'deadline-exceeded'; 
                reject(err);
            }, ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    },

    // 📥 1. جلب البيانات مع نظام المحاولة الصامتة (Enterprise Retry Pattern)
    async getAll(collectionName, retryCount = 1) {
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const snapshot = await this._withTimeout(getDocs(collection(db, collectionName)), 15000, `getAll -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            const isNetworkTimeout = error.code === 'deadline-exceeded' || error.message.includes('Timeout') || error.message.includes('backend');
            if (isNetworkTimeout && retryCount > 0) {
                console.warn(`⏳ اختناق في الشبكة لمجموعة [${collectionName}]. جاري إعادة المحاولة بصمت...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.getAll(collectionName, retryCount - 1); 
            }
            console.error(`🚨 خطأ نهائي في جلب مجموعة [${collectionName}]: ${error.message}`);
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
            const safeId = this._sanitizeDocId(docId);
            const docRef = doc(db, collectionName, safeId);
            const docSnap = await this._withTimeout(getDoc(docRef), 10000, `getById -> ${collectionName}/${safeId}`);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) {
            console.error(`🚨 خطأ في جلب المستند [${docId}]: ${error.message}`);
            return null;
        }
    },

    // 💾 4. حفظ أو تحديث مستند 
    async set(collectionName, docId, data) {
        try {
            if (!collectionName || !docId) throw new Error("اسم المجموعة أو الـ ID غير معرّف!");
            const safeId = this._sanitizeDocId(docId);
            const docRef = doc(db, collectionName, safeId);
            await this._withTimeout(setDoc(docRef, data, { merge: true }), 10000, `set -> ${collectionName}/${safeId}`);
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
            const docRef = await this._withTimeout(addDoc(collection(db, collectionName), data), 10000, `add -> ${collectionName}`);
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
            const safeId = this._sanitizeDocId(docId);
            await this._withTimeout(deleteDoc(doc(db, collectionName, safeId)), 10000, `delete -> ${collectionName}/${safeId}`);
            return true;
        } catch (error) {
            console.error(`🚨 خطأ في حذف المستند [${docId}]: ${error.message}`);
            return false;
        }
    },

    // 📡 7. الاستماع الحي للمجموعة 
    listenCollection(collectionName, callback) {
        return onSnapshot(collection(db, collectionName), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    },

    // 📡 8. الاستماع الحي لمستند واحد فقط
    listenDoc(collectionName, docId, callback) {
        const safeId = this._sanitizeDocId(docId);
        return onSnapshot(doc(db, collectionName, safeId), (snapshot) => {
            if (snapshot.exists()) {
                callback({ id: snapshot.id, ...snapshot.data() });
            } else {
                callback(null);
            }
        });
    },

    // 📡 9. الاستماع الحي المطور (يدعم فلاتر متعددة)
    listenQuery(collectionName, conditions, orderByField = 'time', limitCount = 50, callback) {
        try {
            const queryConstraints = [collection(db, collectionName)];
            
            if (conditions && Array.isArray(conditions) && conditions.length > 0) {
                if (Array.isArray(conditions[0])) {
                    conditions.forEach(cond => {
                        if (cond.length === 3) queryConstraints.push(where(cond[0], cond[1], cond[2]));
                    });
                } else if (conditions.length === 3) {
                    queryConstraints.push(where(conditions[0], conditions[1], conditions[2]));
                }
            }
            
            queryConstraints.push(orderBy(orderByField, 'desc'), limit(limitCount));
            const q = query(...queryConstraints);
            
            return onSnapshot(q, (snapshot) => {
                const arr = [];
                const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
                snapshot.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
                callback(arr, lastDoc);
            }, (error) => {
                console.error(`🚨 تم رفض الاستماع للمجموعة [${collectionName}]:`, error.message);
            });
        } catch (error) {
            console.error(`🚨 خطأ في بناء استعلام المجموعة [${collectionName}]: ${error.message}`);
            return () => {}; 
        }
    },

    // 🚀 10. نظام التصفح المجزأ للبيانات الضخمة (Cursor Pagination)
    async fetchMoreWithCursor(collectionName, conditions, orderByField = 'time', lastDocMarker, limitCount = 25) {
        try {
            if (!lastDocMarker) return { data: [], newLastDoc: null };
            
            const queryConstraints = [collection(db, collectionName)];
            
            if (conditions && Array.isArray(conditions) && conditions.length > 0) {
                if (Array.isArray(conditions[0])) {
                    conditions.forEach(cond => {
                        if (cond.length === 3) queryConstraints.push(where(cond[0], cond[1], cond[2]));
                    });
                } else if (conditions.length === 3) {
                    queryConstraints.push(where(conditions[0], conditions[1], conditions[2]));
                }
            }
            
            queryConstraints.push(orderBy(orderByField, 'desc'), startAfter(lastDocMarker), limit(limitCount));
            const q = query(...queryConstraints);
            
            const snapshot = await this._withTimeout(getDocs(q), 15000, `fetchMore -> ${collectionName}`);
            
            const arr = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const newLastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
            
            return { data: arr, newLastDoc: newLastDoc };
        } catch (error) {
            console.error(`🚨 خطأ في جلب الأرشيف القديم [${collectionName}]: ${error.message}`);
            return { data: [], newLastDoc: null };
        }
    },

    // ☁️ 11. محرك رفع الصور والملفات المطور (توفير الذاكرة RAM)
    async uploadImage(file, folderName = 'general', customFileName = null, oldImageUrl = null) {
        if (!file) return '';
        try {
            if (oldImageUrl && oldImageUrl.includes('firebasestorage')) {
                try {
                    const oldImageRef = ref(storage, oldImageUrl);
                    deleteObject(oldImageRef).catch(()=>{});
                } catch (delErr) { }
            }

            const safeFileName = file.name ? file.name.replace(/[^a-zA-Z0-9.-]/g, '_') : 'image.jpg';
            const finalFileName = customFileName ? customFileName : `${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${safeFileName}`;
            const storageRef = ref(storage, `${folderName}/${finalFileName}`);
            
            // 🛡️ التعديل: رفع الملف مباشرة دون تفكيكه لتوفير الذاكرة العشوائية للأدمن
            const snapshot = await this._withTimeout(
                uploadBytes(storageRef, file, { contentType: file.type }), 
                20000, 
                "عملية رفع الملف"
            );

            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;

        } catch (error) {
            console.error("🚨 خطأ في محرك التخزين السحابي:", error);
            throw new Error(error.message || 'تعذر الرفع، السيرفر لم يستجب.');
        }
    },

    // 🧹 12. دالة الحذف المباشر للصور
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

    // ⚡ 13. الموجه المركزي للاتصال بالسيرفر
    async callFunction(functionName, payload = {}) {
        try {
            console.log(`🚀 جاري الاتصال بالسيرفر لاستدعاء [${functionName}]...`);
            const targetFunction = httpsCallable(functions, functionName);
            
            const result = await this._withTimeout(
                targetFunction(payload), 
                20000, 
                `Cloud Function -> ${functionName}`
            );
            return result.data;
        } catch (error) {
            const errorMessage = error.message || 'فشل الاتصال بالسيرفر أو انتهت المهلة.';
            console.error(`🚨 خطأ في السيرفر أثناء استدعاء [${functionName}]:`, errorMessage);
            throw new Error(errorMessage);
        }
    },

    // 🔍 14. الاستعلامات المتوازية (السجل المالي الموحد للعميل)
    async getCustomerFullHistory(userId, limitPerCollection = 25) {
        if (!userId) return [];
        try {
            const safeUserId = String(userId);
            
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
            
            const [ordersSnap, depositsSnap] = await this._withTimeout(
                Promise.all([getDocs(ordersQuery), getDocs(depositsQuery)]),
                12000,
                `getCustomerFullHistory -> ${safeUserId}`
            );
            
            const activities = [];
            
            ordersSnap.forEach(doc => { activities.push({ id: doc.id, txType: 'order', ...doc.data() }); });
            depositsSnap.forEach(doc => { activities.push({ id: doc.id, txType: 'deposit', ...doc.data() }); });
            
            const parseTimeSafe = (t) => {
                if (!t) return 0;
                if (typeof t.toMillis === 'function') return t.toMillis();
                if (typeof t === 'number') return t;
                const parsed = new Date(t).getTime();
                return isNaN(parsed) ? 0 : parsed;
            };
            
            activities.sort((a, b) => {
                const timeA = parseTimeSafe(a.time || a.createdAt || a.date);
                const timeB = parseTimeSafe(b.time || b.createdAt || b.date);
                return timeB - timeA;
            });
            
            return activities;
            
        } catch (error) {
            console.error(`🚨 خطأ في جلب السجل الشامل للعميل [${userId}]: ${error.message}`);
            return []; 
        }
    }
};