// ============================================================================
// ☁️ محول فايربيز المركزي (admin-tele/core/firebaseAdapter.js) - Admin Enterprise V16.8 💎
// 🎯 الوظيفة: بوابة البيانات الآمنة للوحة الإدارة، إدارة الذاكرة، وحماية الفواتير.
// 🚀 التحديثات المعمارية (V16.8 - Backend Alignment Patch): 
// 1. Timeout Synchronization ⏱️: رفع سقف الـ Timeout لـ 540 ثانية ليطابق دوال السيرفر الثقيلة (Sync & Sweep) لمنع الانهيار المزدوج.
// 2. Silent Truncation Shield 🛡️: إطلاق تحذيرات للمدير عند بلوغ سقف استعلامات الجداول.
// 3. Memory Leak Fix 🧠: تنظيف مستمعات onSnapshot بشكل آمن لحماية الذاكرة العشوائية.
// 4. Safe Time Sorting 🕒: توحيد آلية فرز سجلات العملاء لتطابق المحرك المالي.
// 5. Radar Live Engine 📡: اعتراض الإشعارات اللحظية أثناء فتح اللوحة (Foreground Push) لكسر قفل الشارات.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, 
    updateDoc, writeBatch, deleteField, 
    onSnapshot, query, where, orderBy, limit, startAfter,
    getAggregateFromServer, sum, count, average 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js"; // 👈 استيراد onMessage

import { firebaseConfig } from '../adminConfig.js';
import { EventBus } from '../adminUtils.js';

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
    deleteField: deleteField,
    _messagingInstance: null,
    _foregroundMessageListener: null,

    getBatch: function() {
        return writeBatch(db);
    },

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
        
        if (this._foregroundMessageListener) {
            try { this._foregroundMessageListener(); } catch(e){}
            this._foregroundMessageListener = null;
        }
        console.debug("🧹 [Admin Memory] تم تنظيف كافة المستمعات الشبحية بنجاح. ذاكرة المتصفح بأمان.");
    },

    async requestFCMToken(vapidKey) {
        try {
            if (!this._messagingInstance) {
                this._messagingInstance = getMessaging(app);
            }
            
            const permission = await Notification.requestPermission();
            
            if (permission === 'granted') {
                let swReg = null;
if ('serviceWorker' in navigator) {
    swReg = await navigator.serviceWorker.register('./firebase-messaging-sw.js').catch(() => null);
}
const token = await getToken(this._messagingInstance, {
    vapidKey: vapidKey,
    ...(swReg ? { serviceWorkerRegistration: swReg } : {})
});
                
                // 🚀 [إصلاح متوسط 8]: تفعيل مستمع الإشعارات أثناء فتح اللوحة (Foreground) لكسر قفل الشارات
                if (token && !this._foregroundMessageListener) {
                    this._foregroundMessageListener = onMessage(this._messagingInstance, (payload) => {
                        console.log('📡 [Live Radar] إشعار حي واللوحة مفتوحة:', payload);
                        
                        // تلميح: يتم إرسال نبضة للمتصفح لتحديث الشارات بالقوة متجاوزاً مهلة הـ 3 دقائق
                        if (window.AdminRender && typeof window.AdminRender.updateBadges === 'function') {
                            window.AdminRender.updateBadges(true);
                        }
                        
                        // عرض الإشعار كـ Toast داخل اللوحة أيضاً
                        const title = payload.notification?.title || payload.data?.title || 'إشعار جديد';
const body = payload.notification?.body || payload.data?.body || '';                        EventBus.emit('req-show-toast', { message: `${title}: ${body}`, type: 'info' });
                    });
                }
                
                return token;
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
                const err = new Error(`[Timeout] السيرفر لم يستجب لطلب: ${context} خلال ${ms/1000} ثوانٍ. يرجى الانتظار فقد تكون العملية قيد التنفيذ في الخلفية.`);
                err.code = 'deadline-exceeded'; 
                reject(err);
            }, ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    },

    async getAggregatedStats(collectionName, conditions = [], aggregations = {}) {
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const queryConstraints = [collection(db, collectionName)];

            if (conditions && Array.isArray(conditions) && conditions.length > 0) {
                if (Array.isArray(conditions[0])) {
                    conditions.forEach(cond => { if (cond.length === 3) queryConstraints.push(where(cond[0], cond[1], cond[2])); });
                } else if (conditions.length === 3) {
                    queryConstraints.push(where(conditions[0], conditions[1], conditions[2]));
                }
            }

            const q = query(...queryConstraints);

            const aggSpec = {};
            for (const [key, config] of Object.entries(aggregations)) {
                if (config.type === 'count') aggSpec[key] = count();
                else if (config.type === 'sum' && config.field) aggSpec[key] = sum(config.field);
                else if (config.type === 'average' && config.field) aggSpec[key] = average(config.field);
            }

            const snapshot = await this._withTimeout(getAggregateFromServer(q, aggSpec), 15000, `Aggregate -> ${collectionName}`);
            return snapshot.data();
            
        } catch (error) {
            console.error(`🚨 خطأ في جلب إحصائيات [${collectionName}]:`, error.message);
            return null;
        }
    },

    async getAll(collectionName, maxLimit = 3000, retryCount = 1) { 
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const q = query(collection(db, collectionName), limit(maxLimit));
            const snapshot = await this._withTimeout(getDocs(q), 15000, `getAll -> ${collectionName}`);
            
            if (snapshot.docs.length >= maxLimit) {
                console.warn(`🚨 تحذير أمان البيانات: جدول [${collectionName}] وصل للحد الأقصى المسموح للجلب (${maxLimit}). بعض البيانات في نهاية الجدول لن تظهر في لوحة الإدارة!`);
                
                setTimeout(() => {
                    EventBus.emit('req-show-toast', { 
                        message: `تحذير: جدول (${collectionName}) امتلأ ووصل لسقف ${maxLimit} سجل. يرجى أرشفة البيانات القديمة لضمان ظهور البيانات الجديدة!`, 
                        type: 'warning' 
                    });
                }, 2000);
            }
            
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            const isNetworkTimeout = error.code === 'deadline-exceeded' || error.message.includes('Timeout');
            if (isNetworkTimeout && retryCount > 0) {
                console.warn(`⏳ اختناق في الشبكة لمجموعة [${collectionName}]. جاري إعادة المحاولة...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.getAll(collectionName, maxLimit, retryCount - 1); 
            }
            console.error(`🚨 خطأ نهائي في جلب مجموعة [${collectionName}]:`, error);
            return [];
        }
    },

    async getRecent(collectionName, limitCount = 50, orderByField = 'time') {
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const q = query(collection(db, collectionName), orderBy(orderByField, 'desc'), limit(limitCount));
            const snapshot = await this._withTimeout(getDocs(q), 10000, `getRecent -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) { 
            console.error(`🚨 خطأ فايربيز في getRecent [${collectionName}]:`, error); 
            return []; 
        }
    },

    async getById(collectionName, docId) {
        try {
            if (!collectionName || !docId) throw new Error("بيانات مفقودة!");
            const safeId = this._sanitizeDocId(docId);
            const docSnap = await this._withTimeout(getDoc(doc(db, collectionName, safeId)), 10000);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) { 
            console.error(`🚨 خطأ فايربيز في getById [${collectionName}]:`, error); 
            return null; 
        }
    },

    async set(collectionName, docId, data) {
        try {
            const safeId = this._sanitizeDocId(docId);
            await this._withTimeout(setDoc(doc(db, collectionName, safeId), data, { merge: true }), 10000, 'set', true);
            return true;
        } catch (error) { 
            console.error(`🚨 [FirebaseAdapter] رفض الإحلال في ${collectionName}:`, error.message);
            throw error; 
        }
    },

    async updateDocument(collectionName, docId, data) {
        try {
            if (!collectionName || !docId) throw new Error("بيانات التحديث مفقودة!");
            const safeId = this._sanitizeDocId(docId);
            const docRef = doc(db, collectionName, safeId);
            await this._withTimeout(updateDoc(docRef, data), 10000, 'update', true);
            return true;
        } catch (error) {
            console.error(`🚨 [FirebaseAdapter] رفض التحديث الجزئي في ${collectionName}:`, error.message);
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
        let cleanupFn = () => {};
        const unsub = onSnapshot(collection(db, collectionName), (snapshot) => {
            callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
            console.warn(`⚠️ [Admin Listener] توقف مستمع المجموعة [${collectionName}]:`, error.message);
            cleanupFn();
        });
        cleanupFn = this._registerListener(key, unsub);
        return cleanupFn;
    },
    
    listenDoc(collectionName, docId, callback) {
        const safeId = this._sanitizeDocId(docId);
        const key = `admin_doc_${collectionName}_${safeId}`;
        let cleanupFn = () => {};
        const unsub = onSnapshot(doc(db, collectionName, safeId), (snapshot) => {
            callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        }, (error) => {
            console.warn(`⚠️ [Admin Listener] توقف مستمع الوثيقة [${collectionName}/${safeId}]:`, error.message);
            cleanupFn();
        });
        cleanupFn = this._registerListener(key, unsub);
        return cleanupFn;
    },    listenQuery(collectionName, conditions, orderByField = 'time', limitCount = 50, callback) {
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
        } catch (error) { 
            console.error(`🚨 خطأ في إعداد listenQuery [${collectionName}]:`, error);
            return () => {}; 
        }
    },

    async fetchMoreWithCursor(collectionName, conditions, orderByField = 'time', lastDocMarker, limitCount = 25) {
        try {
            const queryConstraints = [collection(db, collectionName)];

            if (conditions && Array.isArray(conditions) && conditions.length > 0) {
                if (Array.isArray(conditions[0])) {
                    conditions.forEach(cond => { if (cond.length === 3) queryConstraints.push(where(cond[0], cond[1], cond[2])); });
                } else if (conditions.length === 3) {
                    queryConstraints.push(where(conditions[0], conditions[1], conditions[2]));
                }
            }
            
            if (lastDocMarker) {
                queryConstraints.push(orderBy(orderByField, 'desc'), startAfter(lastDocMarker), limit(limitCount));
            } else {
                queryConstraints.push(orderBy(orderByField, 'desc'), limit(limitCount));
            }

            const snapshot = await this._withTimeout(getDocs(query(...queryConstraints)), 15000);
            
            return { 
                data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), 
                newLastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null 
            };
        } catch (error) { 
            console.error(`🚨 خطأ فايربيز في fetchMoreWithCursor [${collectionName}]:`, error); 
            return { data: [], newLastDoc: null }; 
        }
    },

    async uploadImage(file, folderName = 'general', customFileName = null, isAdmin = true) {
        if (!file) return '';
        
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
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
                uploadBytes(ref(storage, `${safeFolder}/${finalFileName}`), file, { contentType: file.type }), 
                60000, "رفع الصورة", false 
            );
            return await getDownloadURL(snapshot.ref);
        } catch (error) { 
            throw new Error(error.message || 'تعذر الرفع. تأكد من جودة الاتصال.'); 
        }
    },

    async deleteImageByUrl(url) {
        if (!url || typeof url !== 'string' || !url.includes('firebasestorage')) return;
        try { 
            await this._withTimeout(deleteObject(ref(storage, url)), 10000, 'deleteImage', false);
        } catch (error) { }
    },

    async callFunction(functionName, payload = {}, timeoutMs = 540000) {
        try {
            const targetFunction = httpsCallable(functions, functionName, { timeout: timeoutMs });
            
            const result = await this._withTimeout(
                targetFunction(payload),
                timeoutMs, 
                `Function -> ${functionName}`,
                false
            );
            return result.data;
        } catch (error) {
            if (error.code === 'deadline-exceeded' || error.message.includes('Timeout')) {
                throw new Error('العملية تستغرق وقتاً أطول من المعتاد. قد يكون السيرفر لا يزال ينفذها في الخلفية، يرجى تحديث الصفحة بعد قليل للتحقق.');
            }
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
            
            const parseTimeSafe = (val) => {
                if (val === null || val === undefined || val === '') return 0;
                if (typeof val === 'number') return val;
                if (typeof val.toMillis === 'function') return val.toMillis();
                if (val.seconds !== undefined) return val.seconds * 1000;
                if (val._seconds !== undefined) return val._seconds * 1000;
                if (val instanceof Date) return val.getTime();
                if (typeof val === 'string') {
                    const parsed = new Date(val.includes('T') ? val : val.replace(/-/g, '/')).getTime();
                    return isNaN(parsed) ? 0 : parsed;
                }
                return 0;
            };
            
            activities.sort((a, b) => parseTimeSafe(b.time || b.date || b.createdAt) - parseTimeSafe(a.time || a.date || a.createdAt));
            return activities;
        } catch (error) { 
            console.error("🚨 خطأ في جلب السجل المالي:", error.message);
            return []; 
        }
    }
};
