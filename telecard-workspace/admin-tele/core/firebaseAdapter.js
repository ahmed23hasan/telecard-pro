// ============================================================================
// ☁️ محول فايربيز المركزي (admin-tele/core/firebaseAdapter.js) - Admin Enterprise V14.3 💎
// 🎯 الوظيفة: بوابة البيانات الآمنة للوحة الإدارة، إدارة الذاكرة، حماية الفواتير.
// 🚀 التحديثات:
// 1. Zombie Listeners Shield: نظام تتبع وتنظيف المستمعات لمنع تسرب الذاكرة واستهلاك القراءات.
// 2. Billing Firewall: إجبار الـ Limit على جلب البيانات الشاملة لمنع الانهيار.
// 3. Storage Gateway: حماية لوحة الإدارة من رفع الملفات الخبيثة والأحجام العملاقة.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

import { firebaseConfig } from '../adminConfig.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); 
const functions = getFunctions(app, 'us-east1');

export { auth, db, storage, functions };

export const FirebaseAdapter = {
    db: db,
    storage: storage,
    functions: functions,

    // ==========================================
    // 🧠 1. إدارة الذاكرة وحماية الفواتير (Memory & Billing Shield)
    // ==========================================
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

    // 🧹 [هام جداً]: يجب استدعاء هذه الدالة في ملف admin.js عند تغيير القائمة (Navigation)
    killAllListeners: function() {
        this._activeListeners.forEach((unsubscribeFn) => {
            try { unsubscribeFn(); } catch(e){}
        });
        this._activeListeners.clear();
        console.debug("🧹 [Admin Memory] تم تنظيف كافة المستمعات الشبحية بنجاح. فاتورتك بأمان.");
    },

    _sanitizeDocId: function(id) {
        if (!id) return '';
        return String(id).replace(/[\/\\]/g, '_').trim(); 
    },

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

    // ==========================================
    // 📥 2. جلب البيانات (مع درع حماية الفواتير)
    // ==========================================
    async getAll(collectionName, maxLimit = 3000, retryCount = 1) { // 🛡️ تم وضع حد 3000 لحماية المتصفح والفاتورة
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
            await this._withTimeout(setDoc(doc(db, collectionName, safeId), data, { merge: true }), 10000);
            return true;
        } catch (error) { return false; }
    },

    async add(collectionName, data) {
        try {
            const docRef = await this._withTimeout(addDoc(collection(db, collectionName), data), 10000);
            return docRef.id;
        } catch (error) { return null; }
    },

    async delete(collectionName, docId) {
        try {
            const safeId = this._sanitizeDocId(docId);
            await this._withTimeout(deleteDoc(doc(db, collectionName, safeId)), 10000);
            return true;
        } catch (error) { return false; }
    },

    // ==========================================
    // 🎧 3. الاستماع اللحظي (محمي بالذاكرة الذكية)
    // ==========================================
    listenCollection(collectionName, callback) {
        const key = `admin_col_${collectionName}`;
        const unsub = onSnapshot(collection(db, collectionName), (snapshot) => {
            callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return this._registerListener(key, unsub); // 🛡️ تسجيل المستمع للتنظيف التلقائي
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

    // ==========================================
    // 📁 4. الجدار الناري للتخزين السحابي (Storage Firewall)
    // ==========================================
    async uploadImage(file, folderName = 'general', customFileName = null) {
        if (!file) return '';
        
        // 🛡️ درع الامتدادات (السماح لـ SVG في لوحة الإدارة للشعارات)
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
        if (!allowedTypes.includes(file.type)) throw new Error('مسموح بالصور فقط (JPG, PNG, WEBP, SVG).');

        // 🛡️ درع الحجم (10 ميجابايت للوحة الإدارة)
        const MAX_FILE_SIZE_MB = 10;
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) throw new Error(`حجم الملف يتجاوز ${MAX_FILE_SIZE_MB} ميجابايت.`);

        try {
            const safeFolder = String(folderName).replace(/[\/\\]|\.\./g, '').trim() || 'general';
            const safeFileName = file.name ? file.name.replace(/[^a-zA-Z0-9.-]/g, '_') : 'image.jpg';
            const safeCustomName = customFileName ? String(customFileName).replace(/[^a-zA-Z0-9\-_.]/g, '') : null;
            
            const finalFileName = safeCustomName || `${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${safeFileName}`;
            const storageRef = ref(storage, `${safeFolder}/${finalFileName}`);
            
            const snapshot = await this._withTimeout(uploadBytes(storageRef, file, { contentType: file.type }), 60000, "رفع الصورة");
            return await getDownloadURL(snapshot.ref);
        } catch (error) { throw new Error(error.message || 'تعذر الرفع.'); }
    },

    async deleteImageByUrl(url) {
        if (!url || typeof url !== 'string' || !url.includes('firebasestorage')) return;
        try { await deleteObject(ref(storage, url)); } catch (error) { }
    },

    // ==========================================
    // ⚡ 5. الموجه المركزي للـ Cloud Functions
    // ==========================================
    async callFunction(functionName, payload = {}) {
        try {
            const targetFunction = httpsCallable(functions, functionName);
            const result = await this._withTimeout(targetFunction(payload), 60000, `Function -> ${functionName}`);
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
                return isNaN(new Date(t).getTime()) ? 0 : new Date(t).getTime();
            };
            
            activities.sort((a, b) => parseTimeSafe(b.time || b.createdAt) - parseTimeSafe(a.time || a.createdAt));
            return activities;
        } catch (error) { return []; }
    }
};