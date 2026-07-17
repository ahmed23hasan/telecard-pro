// ============================================================================
// ☁️ محول فايربيز المركزي الموحد (core/firebaseAdapter.js) - Enterprise V12.3 💎
// 🎯 الوظيفة: البوابة الذكية للمتجر للاتصال بـ Firestore & Storage & Auth & Functions
// 🚀 التحديث الأقصى: معالجة ذكية لتذبذب الشبكة، منع تصادم الملفات، والمستمعات الآمنة
// 👑 الهوية المعتمدة: Telecard Store
// ============================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager, 
    collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, 
    query, where, orderBy, limit, startAfter 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, 
    EmailAuthProvider, multiFactor, TotpMultiFactorGenerator 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

// 🔑 مفاتيح الربط الخاصة بمتجر Telecard 
const firebaseConfig = {
    apiKey: "AIzaSyAKcMFLGday4sqp4wrbAIN3OEzH-kmhGK0",
    authDomain: "telecard-1.firebaseapp.com",
    projectId: "telecard-1",
    storageBucket: "telecard-1.firebasestorage.app",
    messagingSenderId: "698672838633",
    appId: "1:698672838633:web:743c8809615bd8308bfd78"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// 🛑 تم إيقاف نظام الحماية App Check بناءً على المتطلبات الحالية للتطوير والاختبار
let appCheck = null;
console.warn("⚠️ درع App Check معطل حالياً لتسهيل عمليات التطوير والاختبار السريع.");

// 📦 [توفير التكاليف]: تهيئة Firestore مع كاش محلي متزامن بين النوافذ (Tabs)
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'us-east1');

export { auth, db, storage, functions, appCheck };

export const FirebaseAdapter = {
    db: db,
    storage: storage,
    functions: functions,
    
    // 🧠 سجل إدارة الذاكرة (لمنع WebSockets المفتوحة المتكررة)
    _activeListeners: {},

    _registerListener: function(key, unsubscribeFn) {
        if (this._activeListeners[key]) {
            try { this._activeListeners[key](); } catch (e) {}
        }
        this._activeListeners[key] = unsubscribeFn;
        return unsubscribeFn;
    },

    killAllListeners: function() {
        Object.keys(this._activeListeners).forEach(key => {
            try { this._activeListeners[key](); } catch(e){}
            delete this._activeListeners[key];
        });
        console.debug("🧹 [Memory] All active Firestore listeners cleaned up.");
    },

    _sanitizeDocId: function(id) {
        if (!id) return '';
        return String(id).replace(/[\/\\]/g, '_').trim(); 
    },

    _withTimeout: function(promise, ms = 10000, context = '') {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                const err = new Error(`[Timeout] السيرفر لم يستجب لطلب: ${context} خلال ${ms/1000} ثوانٍ`);
                err.code = 'deadline-exceeded'; 
                reject(err);
            }, ms);
        });
        
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    },

    async getAll(collectionName, retryCount = 1) {
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const snapshot = await this._withTimeout(getDocs(collection(db, collectionName)), 10000, `getAll -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            if (error.code === 'deadline-exceeded' && retryCount > 0) {
                console.warn(`⏳ جاري إعادة المحاولة بصمت لمجموعة [${collectionName}]...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.getAll(collectionName, retryCount - 1); 
            }
            return [];
        }
    },

    async getRecent(collectionName, limitCount = 50, orderByField = 'time') {
        try {
            const q = query(collection(db, collectionName), orderBy(orderByField, 'desc'), limit(limitCount));
            const snapshot = await this._withTimeout(getDocs(q), 10000, `getRecent -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) { return []; }
    },

    async getById(collectionName, docId) {
        try {
            const safeId = this._sanitizeDocId(docId);
            const docSnap = await this._withTimeout(getDoc(doc(db, collectionName, safeId)), 10000, `getById -> ${safeId}`);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) { return null; }
    },

    // 🛡️ [تحديث أمان واستقرار الشبكة]: حفظ مستندات مع ميزة المزامنة وإعادة المحاولة التلقائية
    async set(collectionName, docId, data, options = { merge: true }, retryCount = 1) {
        try {
            const safeId = this._sanitizeDocId(docId);
            await this._withTimeout(setDoc(doc(db, collectionName, safeId), data, options), 10000, `set -> ${collectionName}/${safeId}`);
            return true;
        } catch (error) {
            const isTransientError = error.code === 'deadline-exceeded' || error.code === 'unavailable' || error.message?.includes('Timeout');
            if (isTransientError && retryCount > 0) {
                console.warn(`⏳ تذبذب في الشبكة أثناء الحفظ في [${collectionName}]. جاري إعادة المحاولة...`);
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
            const unsub = onSnapshot(query(...queryConstraints), (snapshot) => {
                const arr = [];
                snapshot.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
                const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
                callback(arr, lastDoc);
            });
            return this._registerListener(key, unsub);
        } catch (error) { return () => {}; }
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

    // 🛡️ [تحديث الاستقرار]: توليد أسماء عشوائية معقدة عبر UUID لمنع تصادم الملفات المرفوعة متزامناً
    async uploadImage(file, folderName = 'general', customFileName = null) {
        if (!file) return '';
        try {
            const safeFolder = String(folderName).replace(/[\/\\]|\.\./g, '').trim() || 'general';
            let ext = file.type === 'application/pdf' ? '.pdf' : (file.type === 'image/webp' ? '.webp' : '.png');
            
            const uniqueId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
            const finalFileName = customFileName || `${Date.now()}_${uniqueId}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            
            const snapshot = await this._withTimeout(
                uploadBytes(ref(storage, `${safeFolder}/${finalFileName}`), file, { contentType: file.type }), 60000
            );
            return await getDownloadURL(snapshot.ref);
        } catch (error) { throw new Error('تعذر رفع الملف.'); }
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

// 🛡️ [تحديث أمان واستقرار السيرفر]: اتصال مرن بالخادم مع آلية مقاومة انقطاع طلبات الشراء المفاجئ
async callFunction(functionName, payload = {}, retryCount = 1) { // 👈 تمت إضافة retryCount هنا للحماية
    try {
        const result = await this._withTimeout(httpsCallable(functions, functionName)(payload), 15000, `Cloud Function -> ${functionName}`);
        return result.data;
    } catch (error) {
        const isTransientError = error.code === 'deadline-exceeded' || error.code === 'unavailable' || error.message?.includes('Timeout');
        
        // 🛡️ التحقق من وجود محاولات متبقية لمنع تجميد المتصفح (Infinite Loop)
        if (isTransientError && retryCount > 0) {
            console.warn(`⏳ خطأ شبكة أثناء استدعاء الوظيفة السحابية [${functionName}]. جاري إعادة المحاولة...`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            return this.callFunction(functionName, payload, retryCount - 1); // إنقاص العداد والمحاولة مرة أخيرة
        }
        
        const errObj = new Error(error.message || 'فشل الاتصال.');
        errObj.code = error.code || 'unknown';
        throw errObj;
    }
}
};
