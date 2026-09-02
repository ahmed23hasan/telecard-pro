// ============================================================================
// ☁️ محول فايربيز المركزي (admin-tele/core/firebaseAdapter.js) - Admin Enterprise V15.8 💎
// 🎯 الوظيفة: بوابة البيانات الآمنة للوحة الإدارة، إدارة الذاكرة، حماية الفواتير.
// 🚀 التحديث الأقصى (V15.8): 
// 1. FCM Integration: دمج مكتبة الإشعارات وتوليد مفاتيح الربط (Tokens) لغرفة عمليات الإدارة.
// 2. Transparent Errors: رمي الأخطاء الصريحة لعمليات الكتابة.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

// 🚀 [إضافة معمارية]: استيراد مكتبة الإشعارات السحابية لتفعيل الرادار
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

import { firebaseConfig } from '../adminConfig.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); 
const functions = getFunctions(app);

export { auth, db, storage, functions };

export const FirebaseAdapter = {
    db: db,
    storage: storage,
    functions: functions,

    _activeListeners: new Map(),

    _registerListener: function(baseKey, unsubscribeFn) {
        const uniqueListenerId = `${baseKey}_${Math.random().toString(36).substr(2, 9)}`;
        this._activeListeners.set(uniqueListenerId, unsubscribeFn);
        
        return () => {
            if (this._activeListeners.has(uniqueListenerId)) {
                this._activeListeners.get(uniqueListenerId)();
                this._activeListeners.delete(uniqueListenerId);
            }
        };
    },

    killAllListeners: function() {
        this._activeListeners.forEach((unsubscribeFn) => {
            try { unsubscribeFn(); } catch(e){}
        });
        this._activeListeners.clear();
        console.debug("🧹 [Admin Memory] تم تنظيف كافة المستمعات الشبحية بنجاح. ذاكرة المتصفح بأمان.");
    },

    // 🚀 [الرادار السحابي]: دالة طلب صلاحية الإشعارات وتوليد مفتاح الجهاز
    async requestFCMToken(vapidKey) {
        try {
            const messaging = getMessaging(app);
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                return await getToken(messaging, { vapidKey: vapidKey });
            }
            return null;
        } catch (error) {
            console.error("🚨 [FirebaseAdapter] فشل توليد توكن الإشعارات:", error.message);
            return null;
        }
    },

    _sanitizeDocId: function(id) {
        if (!id) return '';
        return String(id).replace(/[\/\\]/g, '_').trim(); 
    },

    _withTimeout: function(promise, ms = 10000, context = '', isWriteOperation = false) {
        if (isWriteOperation) return promise; 
        
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                const err = new Error(`[Timeout] السيرفر لم يستجب لطلب (Read): ${context} خلال ${ms/1000} ثوانٍ`);
                err.code = 'deadline-exceeded'; 
                reject(err);
            }, ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    },

    async getAll(collectionName, maxLimit = 3000, retryCount = 1) { 
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const q = query(collection(db, collectionName), limit(maxLimit));
            const snapshot = await this._withTimeout(getDocs(q), 15000, `getAll -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            const isNetworkTimeout = error.code === 'deadline-exceeded' || error.message.includes('Timeout');
            if (isNetworkTimeout && retryCount > 0) {
                console.warn(`⏳ اختناق في الشبكة لمجموعة [${collectionName}]. جاري إعادة المحاولة...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.getAll(collectionName, maxLimit, retryCount - 1); 
            }
            console.error(`🚨 خطأ نهائي في جلب مجموعة [${collectionName}]: ${error.message}`);
            return [];
        }
    },

    async getRecent(collectionName, limitCount = 50, orderByField = 'time') {
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const q = query(collection(db, collectionName), orderBy(orderByField, 'desc'), limit(limitCount));
            const snapshot = await this._withTimeout(getDocs(q), 10000, `getRecent -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) { return []; }
    },

    async getById(collectionName, docId) {
        try {
            if (!collectionName || !docId) throw new Error("بيانات مفقودة!");
            const safeId = this._sanitizeDocId(docId);
            const docSnap = await this._withTimeout(getDoc(doc(db, collectionName, safeId)), 10000);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) { return null; }
    },

    async set(collectionName, docId, data) {
        try {
            const safeId = this._sanitizeDocId(docId);
            await this._withTimeout(setDoc(doc(db, collectionName, safeId), data, { merge: true }), 10000, 'set', true);
            return true;
        } catch (error) { 
            console.error(`🚨 [FirebaseAdapter] رفض التحديث في ${collectionName}:`, error.message);
            throw error; 
        }
    },

    async add(collectionName, data) {
        try {
            const docRef = await this._withTimeout(addDoc(collection(db, collectionName), data), 10000, 'add', true);
            return docRef.id;
        } catch (error) { 
            console.error(`🚨 [FirebaseAdapter] رفض الإضافة في ${collectionName}:`, error.message);
            throw error; 
        }
    },

    async delete(collectionName, docId) {
        try {
            const safeId = this._sanitizeDocId(docId);
            await this._withTimeout(deleteDoc(doc(db, collectionName, safeId)), 10000, 'delete', true);
            return true;
        } catch (error) { 
            console.error(`🚨 [FirebaseAdapter] رفض الحذف في ${collectionName}:`, error.message);
            throw error; 
        }
    },

    listenCollection(collectionName, callback) {
        const key = `admin_col_${collectionName}`;
        const unsub = onSnapshot(collection(db, collectionName), (snapshot) => {
            callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return this._registerListener(key, unsub); 
    },

    listenDoc(collectionName, docId, callback) {
        const safeId = this._sanitizeDocId(docId);
        const key = `admin_doc_${collectionName}_${safeId}`;
        const unsub = onSnapshot(doc(db, collectionName, safeId), (snapshot) => {
            callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        });
        return this._registerListener(key, unsub);
    },

    listenQuery(collectionName, conditions, orderByField = 'time', limitCount = 50, callback) {
        try {
            const queryConstraints = [collection(db, collectionName)];
            if (conditions && Array.isArray(conditions) && conditions.length > 0) {
                if (Array.isArray(conditions[0])) {
                    conditions.forEach(cond => { if (cond.length === 3) queryConstraints.push(where(cond[0], cond[1], cond[2])); });
                } else if (conditions.length === 3) {
                    queryConstraints.push(where(conditions[0], conditions[1], conditions[2]));
                }
            }
            queryConstraints.push(orderBy(orderByField, 'desc'), limit(limitCount));
            
            const key = `admin_query_${collectionName}`;
            let cleanupFn = () => {};

            const unsub = onSnapshot(query(...queryConstraints), (snapshot) => {
                const arr = [];
                snapshot.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
                callback(arr, snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null);
            }, (error) => {
                console.error(`🚨 خطأ استماع [${collectionName}]:`, error.message);
                cleanupFn();
            });

            cleanupFn = this._registerListener(key, unsub);
            return cleanupFn;
        } catch (error) { return () => {}; }
    },

    async fetchMoreWithCursor(collectionName, conditions, orderByField = 'time', lastDocMarker, limitCount = 25) {
        try {
            if (!lastDocMarker) return { data: [], newLastDoc: null };
            const queryConstraints = [collection(db, collectionName)];
            
            if (conditions && Array.isArray(conditions) && conditions.length > 0) {
                if (Array.isArray(conditions[0])) {
                    conditions.forEach(cond => { if (cond.length === 3) queryConstraints.push(where(cond[0], cond[1], cond[2])); });
                } else if (conditions.length === 3) {
                    queryConstraints.push(where(conditions[0], conditions[1], conditions[2]));
                }
            }
            
            queryConstraints.push(orderBy(orderByField, 'desc'), startAfter(lastDocMarker), limit(limitCount));
            const snapshot = await this._withTimeout(getDocs(query(...queryConstraints)), 15000);
            
            return { 
                data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), 
                newLastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null 
            };
        } catch (error) { return { data: [], newLastDoc: null }; }
    },

    async uploadImage(file, folderName = 'general', customFileName = null, isAdmin = true) {
        if (!file) return '';
        
        const allowedTypes = isAdmin ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'] : ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            throw new Error(`نوع الملف غير مدعوم. مسموح بالصور فقط.`);
        }

        const MAX_FILE_SIZE_MB = isAdmin ? 10 : 5;
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            throw new Error(`حجم الملف كبير جداً. الحد الأقصى هو ${MAX_FILE_SIZE_MB} ميجابايت.`);
        }

        try {
            const safeFolder = String(folderName).replace(/\.\./g, '').replace(/\\/g, '/').replace(/\/+/g, '/').trim() || 'general';
            const originalExt = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'jpg';
            const safeFileName = file.name.replace(/[^a-zA-Z0-9\-_]/g, '').replace(/^\.+/, 'file');
            
            const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 9);
            const safeCustomName = customFileName ? String(customFileName).replace(/[^a-zA-Z0-9\-_.]/g, '') : null;
            
            const finalFileName = safeCustomName || `${Date.now()}_${uniqueId}_${safeFileName}.${originalExt}`;
            
            const snapshot = await this._withTimeout(
                uploadBytes(ref(storage, `${safeFolder}/${finalFileName}`), file, { contentType: file.type }), 60000, "رفع الصورة", true
            );
            return await getDownloadURL(snapshot.ref);
        } catch (error) { 
            throw new Error(error.message || 'تعذر الرفع. تأكد من جودة الاتصال.'); 
        }
    },

    async deleteImageByUrl(url) {
        if (!url || typeof url !== 'string' || !url.includes('firebasestorage')) return;
        try { 
            await this._withTimeout(deleteObject(ref(storage, url)), 10000, 'deleteImage', true);
        } catch (error) { }
    },

    async callFunction(functionName, payload = {}) {
        try {
            const targetFunction = httpsCallable(functions, functionName);
            const result = await this._withTimeout(targetFunction(payload), 60000, `Function -> ${functionName}`, true);
            return result.data;
        } catch (error) {
            throw new Error(error.message || 'فشل الاتصال بالسيرفر.');
        }
    },

    async getCustomerFullHistory(userId, limitPerCollection = 25) {
        if (!userId) return [];
        try {
            const safeUserId = String(userId);
            const ordersQuery = query(collection(db, 'telecard_orders'), where('userId', '==', safeUserId), orderBy('time', 'desc'), limit(limitPerCollection));
            const depositsQuery = query(collection(db, 'telecard_deposits'), where('userId', '==', safeUserId), orderBy('time', 'desc'), limit(limitPerCollection));
            
            const [ordersSnap, depositsSnap] = await this._withTimeout(
                Promise.all([getDocs(ordersQuery), getDocs(depositsQuery)]), 15000
            );
            
            const activities = [];
            ordersSnap.forEach(doc => { activities.push({ id: doc.id, txType: 'order', ...doc.data() }); });
            depositsSnap.forEach(doc => { activities.push({ id: doc.id, txType: 'deposit', ...doc.data() }); });
            
            const parseTimeSafe = (t) => {
                if (!t) return 0;
                if (typeof t.toMillis === 'function') return t.toMillis();
                if (typeof t === 'number') return t;
                if (typeof t === 'string') {
                    let safeString = t;
                    if (!t.includes('T')) {
                        safeString = t.replace(/-/g, '/');
                    }
                    const parsed = new Date(safeString).getTime();
                    return isNaN(parsed) ? 0 : parsed;
                }
                return isNaN(new Date(t).getTime()) ? 0 : new Date(t).getTime();
            };
            
            activities.sort((a, b) => parseTimeSafe(b.time || b.date || b.createdAt) - parseTimeSafe(a.time || a.date || a.createdAt));
            return activities;
        } catch (error) { 
            console.error("🚨 خطأ في جلب السجل المالي:", error.message);
            return []; 
        }
    }
};
