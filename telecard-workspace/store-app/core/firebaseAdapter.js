// ============================================================================
// ☁️ محول فايربيز المركزي (core/firebaseAdapter.js) - Enterprise V14.5 💎
// 🎯 الوظيفة: البوابة الذكية للمتجر، الاستقرار، التخزين المؤقت العميق
// 🚀 التحديث الأخير: إصلاح تضارب الـ Region، فصل الإعدادات أمنياً، وتوحيد خوارزمية الرفع.
// ============================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager, 
    collection, doc, getDoc, getDocs, getDocFromCache, getDocsFromCache,
    setDoc, addDoc, deleteDoc, onSnapshot, 
    query, where, orderBy, limit, startAfter 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, 
    EmailAuthProvider, multiFactor, TotpMultiFactorGenerator 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

// 🛡️ [إصلاح أمني]: استيراد الإعدادات من ملف الكونفيج بدلاً من فضحها هنا
import { firebaseConfig } from '../../config.js';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
let appCheck = null; 

const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const auth = getAuth(app);
const storage = getStorage(app);

// 🛡️ [إصلاح كارثي]: توحيد المنطقة الجغرافية مع السيرفر والإدارة لمنع الـ CORS و 404
const functions = getFunctions(app, 'us-east1');

export { auth, db, storage, functions, appCheck };

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
        console.debug("🧹 [Memory] All active Firestore listeners cleaned up safely.");
    },

    _sanitizeDocId: function(id) {
        return id ? String(id).replace(/[\/\\]/g, '_').trim() : '';
    },

    _withTimeout: function(promise, ms = 10000, context = '') {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                const err = new Error(`[Timeout] السيرفر لم يستجب لطلب: ${context}`);
                err.code = 'deadline-exceeded'; 
                reject(err);
            }, ms);
        });
        
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    },

    async getAll(collectionName, maxLimit = 1000, retryCount = 1) {
        try {
            const q = query(collection(db, collectionName), limit(maxLimit));
            const snapshot = await this._withTimeout(getDocs(q), 10000, `getAll -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            if (error.code === 'deadline-exceeded' && retryCount > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.getAll(collectionName, maxLimit, retryCount - 1); 
            }
            return [];
        }
    },

    async getCacheFirst(collectionName, docId) {
        const safeId = this._sanitizeDocId(docId);
        const docRef = doc(db, collectionName, safeId);
        try {
            const cachedSnap = await getDocFromCache(docRef);
            if (cachedSnap.exists()) return { id: cachedSnap.id, ...cachedSnap.data(), fromCache: true };
        } catch (e) { }
        
        try {
            const serverSnap = await this._withTimeout(getDoc(docRef), 10000);
            return serverSnap.exists() ? { id: serverSnap.id, ...serverSnap.data(), fromCache: false } : null;
        } catch (error) { return null; }
    },

    async getRecent(collectionName, limitCount = 50, orderByField = 'time') {
        try {
            const q = query(collection(db, collectionName), orderBy(orderByField, 'desc'), limit(limitCount));
            const snapshot = await this._withTimeout(getDocs(q), 10000);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) { return []; }
    },

    async getById(collectionName, docId) {
        try {
            const safeId = this._sanitizeDocId(docId);
            const docSnap = await this._withTimeout(getDoc(doc(db, collectionName, safeId)), 10000);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) { return null; }
    },

    async set(collectionName, docId, data, options = { merge: true }, retryCount = 1) {
        try {
            const safeId = this._sanitizeDocId(docId);
            await this._withTimeout(setDoc(doc(db, collectionName, safeId), data, options), 10000);
            return true;
        } catch (error) {
            const isTransientError = error.code === 'deadline-exceeded' || error.code === 'unavailable';
            if (isTransientError && retryCount > 0) {
                await new Promise(resolve => setTimeout(resolve, 1500));
                return this.set(collectionName, docId, data, options, retryCount - 1);
            }
            return false;
        }
    },

    async add(collectionName, data) {
        try {
            const docRef = await addDoc(collection(db, collectionName), data);
            return docRef.id;
        } catch (error) { return null; }
    },

    async delete(collectionName, docId) {
        try {
            await deleteDoc(doc(db, collectionName, this._sanitizeDocId(docId)));
            return true;
        } catch (error) { return false; }
    },

    listenCollection(collectionName, callback) {
        const key = `col_${collectionName}`;
        const unsub = onSnapshot(collection(db, collectionName), (snapshot) => {
            callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => console.error(`🚨 خطأ استماع [${collectionName}]:`, error.message));
        return this._registerListener(key, unsub);
    },

    listenDoc(collectionName, docId, callback) {
        const safeId = this._sanitizeDocId(docId);
        const key = `doc_${collectionName}_${safeId}`;
        const unsub = onSnapshot(doc(db, collectionName, safeId), (snapshot) => {
            callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        }, (error) => console.error(`🚨 خطأ استماع [${safeId}]:`, error.message));
        return this._registerListener(key, unsub);
    },

    listenQuery(collectionName, conditions, orderByField = 'time', limitCount = 30, callback) {
        try {
            const queryConstraints = [collection(db, collectionName)];
            if (conditions && conditions.length > 0) {
                if (Array.isArray(conditions[0])) {
                    conditions.forEach(cond => { if (cond.length === 3) queryConstraints.push(where(cond[0], cond[1], cond[2])); });
                } else if (conditions.length === 3) {
                    queryConstraints.push(where(conditions[0], conditions[1], conditions[2]));
                }
            }
            queryConstraints.push(orderBy(orderByField, 'desc'), limit(limitCount));
            
            const key = `query_${collectionName}_${JSON.stringify(conditions)}`;
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
            return () => {}; 
        }
    },
    
    async fetchMoreWithCursor(collectionName, conditions, orderByField = 'time', lastDocMarker, limitCount = 15) {
        try {
            if (!lastDocMarker) return { data: [], newLastDoc: null };
            const queryConstraints = [collection(db, collectionName)];
            
            if (conditions && conditions.length > 0) {
                if (Array.isArray(conditions[0])) {
                    conditions.forEach(cond => { if (cond.length === 3) queryConstraints.push(where(cond[0], cond[1], cond[2])); });
                } else if (conditions.length === 3) {
                    queryConstraints.push(where(conditions[0], conditions[1], conditions[2]));
                }
            }
            
            queryConstraints.push(orderBy(orderByField, 'desc'), startAfter(lastDocMarker), limit(limitCount));
            const snapshot = await this._withTimeout(getDocs(query(...queryConstraints)), 10000);
            
            return { 
                data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), 
                newLastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null 
            };
        } catch (error) { return { data: [], newLastDoc: null }; }
    },

    // 🛡️ [إصلاح أمني]: خوارزمية الرفع الهجينة الآمنة
    async uploadImage(file, folderName = 'general', customFileName = null, isAdmin = false) { 
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
            const safeFolder = String(folderName).replace(/[\/\\]|\.\./g, '').trim() || 'general'; 
            const originalExt = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'jpg'; 
            const safeFileName = file.name.replace(/[^a-zA-Z0-9\-_]/g, '').replace(/^\.+/, 'file'); 
            
            const uniqueId = Math.random().toString(36).substring(2, 9); 
            const safeCustomName = customFileName ? String(customFileName).replace(/[^a-zA-Z0-9\-_.]/g, '') : null; 
            
            const finalFileName = safeCustomName || `${Date.now()}_${uniqueId}_${safeFileName}.${originalExt}`; 
            const snapshot = await this._withTimeout( 
                uploadBytes(ref(storage, `${safeFolder}/${finalFileName}`), file, { contentType: file.type }), 60000, "رفع الصورة" 
            ); 
            return await getDownloadURL(snapshot.ref); 
        } catch (error) { 
            throw new Error(error.message || 'تعذر الرفع. تأكد من جودة الاتصال.'); 
        } 
    },

    async deleteImageByUrl(url) {
        if (!url || typeof url !== 'string' || !url.includes('firebasestorage')) return;
        try { await deleteObject(ref(storage, url)); } catch (e) {}
    },

    async sendResetEmail(email) {
        try {
            await sendPasswordResetEmail(auth, email);
            return { success: true };
        } catch (error) {
            let msg = 'تعذر إرسال الرابط.';
            if (error.code === 'auth/user-not-found') msg = 'بريد غير مسجل.';
            if (error.code === 'auth/too-many-requests') msg = 'محاولات كثيرة.';
            return { success: false, msg };
        }
    },

    async changeUserPassword(currentPassword, newPassword) {
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("auth/no-user");

            const hasPasswordProvider = user.providerData.some(p => p.providerId === 'password');
            if (!hasPasswordProvider) {
                return { success: false, msg: 'لا يمكن تغيير كلمة المرور للحسابات المسجلة عبر جوجل أو مزودات الطرف الثالث.' };
            }

            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
            await updatePassword(user, newPassword);
            return { success: true };
        } catch (error) {
            let msg = 'تعذر تحديث كلمة المرور.';
            if (error.code === 'auth/invalid-credential') msg = 'كلمة المرور الحالية خاطئة.';
            return { success: false, msg };
        }
    },

    async generateTOTPSecret() {
        try {
            const session = await multiFactor(auth.currentUser).getSession();
            return { success: true, secret: await TotpMultiFactorGenerator.generateSecret(session) };
        } catch (error) { return { success: false, msg: 'تعذر توليد المفتاح.' }; }
    },

    async enrollTOTP(tfaSecret, otpCode, displayName = "تطبيق المصدق") {
        try {
            await multiFactor(auth.currentUser).enroll(TotpMultiFactorGenerator.assertionForEnrollment(tfaSecret, otpCode), displayName);
            return { success: true };
        } catch (error) { return { success: false, msg: 'الكود غير صحيح.' }; }
    },

    async unenrollMFA() {
        try {
            const factors = multiFactor(auth.currentUser).enrolledFactors;
            if (factors.length > 0) await multiFactor(auth.currentUser).unenroll(factors[0].uid);
            return { success: true };
        } catch (error) { return { success: false, msg: 'تعذر الإيقاف.' }; }
    },

    async callFunction(functionName, payload = {}, retryCount = 1) { 
        try {
            const result = await this._withTimeout(httpsCallable(functions, functionName)(payload), 15000, `Cloud Function -> ${functionName}`);
            return result.data;
        } catch (error) {
            const isSensitiveFunction = ['createOrder', 'submitBalanceRequest'].includes(functionName);
            const isTransientError = error.code === 'deadline-exceeded' || error.code === 'unavailable';
            
            if (isTransientError && retryCount > 0 && !isSensitiveFunction) {
                console.warn(`⏳ خطأ شبكة. إعادة محاولة [${functionName}]...`);
                await new Promise(resolve => setTimeout(resolve, 1500));
                return this.callFunction(functionName, payload, retryCount - 1); 
            }
            
            const errObj = new Error(error.message || 'فشل الاتصال.');
            errObj.code = error.code || 'unknown';
            throw errObj;
        }
    }
};
