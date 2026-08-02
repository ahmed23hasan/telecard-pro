// ============================================================================
// ☁️ محول فايربيز المركزي (core/firebaseAdapter.js) - Enterprise V16.0 💎
// 🎯 الوظيفة: البوابة الذكية للمتجر، الاستقرار، التخزين المؤقت العميق، والاستعلامات
// 🚀 التحديثات المعمارية (V16.0):
// 1. Offline-First Resilience: تعديل `getCacheFirst` ليعرض بيانات الكاش فوراً إذا كان السيرفر بطيئاً جداً.
// 2. UX Network Check: التحقق من الاتصال قبل مناداة الـ Cloud Functions.
// 3. Listener Keys Fix: منع تداخل المفاتيح في الاستعلامات المتشابهة لتوفير الذاكرة.
// ============================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager, 
    collection, doc, getDoc, getDocs, getDocFromCache, 
    setDoc, addDoc, deleteDoc, onSnapshot, 
    query, where, orderBy, limit, startAfter 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, 
    EmailAuthProvider, multiFactor, TotpMultiFactorGenerator 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";

import { firebaseConfig } from '../config.js';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Placeholder for future AppCheck implementation
let appCheck = null; 

const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app);

export { auth, db, storage, functions, appCheck };

export const FirebaseAdapter = {
    db: db,
    storage: storage,
    functions: functions,
    _activeListeners: new Map(),

    // 🛡️ حماية صارمة ضد الـ Ghost Listeners
    _registerListener: function(uniqueKey, unsubscribeFn) {
        if (this._activeListeners.has(uniqueKey)) {
            this._activeListeners.get(uniqueKey)(); 
        }
        
        this._activeListeners.set(uniqueKey, unsubscribeFn);
        return () => {
            if (this._activeListeners.has(uniqueKey)) {
                this._activeListeners.get(uniqueKey)();
                this._activeListeners.delete(uniqueKey);
            }
        };
    },

    killAllListeners: function() {
        this._activeListeners.forEach((unsubscribeFn) => { try { unsubscribeFn(); } catch(e){} });
        this._activeListeners.clear();
    },

    _sanitizeDocId: function(id) {
        return id ? String(id).replace(/[\/\\]/g, '_').trim() : '';
    },

    // 🛡️ حماية العمليات من التعليق بسبب سوء الشبكة
    _withTimeout: function(promise, ms = 10000, context = '', isWriteOperation = false) {
        if (isWriteOperation) return promise; 
        
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

    async getById(collectionName, docId) {
        const safeId = this._sanitizeDocId(docId);
        try {
            const docSnap = await this._withTimeout(getDoc(doc(db, collectionName, safeId)), 10000, `getById -> ${collectionName}`);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) { return null; }
    },

    async getAll(collectionName, maxLimit = 1000) {
        try {
            const q = query(collection(db, collectionName), limit(maxLimit));
            const snapshot = await this._withTimeout(getDocs(q), 10000, `getAll -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) { return []; }
    },

    async query(collectionName, field, op, value, maxLimit = 50) {
        try {
            const q = query(collection(db, collectionName), where(field, op, value), limit(maxLimit));
            const snapshot = await this._withTimeout(getDocs(q), 10000, `query -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) { return []; }
    },

async fetchMoreWithCursor(collectionName, whereCondition, orderField, cursorDoc, limitCount = 15) {
        try {
            let q = query(
                collection(db, collectionName),
                where(whereCondition[0], whereCondition[1], whereCondition[2]),
                orderBy(orderField, "desc"),
                startAfter(cursorDoc),
                limit(limitCount)
            );
            const snapshot = await this._withTimeout(getDocs(q), 15000, `fetchMore -> ${collectionName}`);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return {
                data: data,
                newLastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null
            };
        } catch (error) { return { data: [], newLastDoc: null }; }
    },
    
    // 🛡️ [الإصلاح الماسي 1]: هندسة Offline-First (الكاش كشبكة أمان مع مهلة متوازنة)
    async getCacheFirst(collectionName, docId) {
            const safeId = this._sanitizeDocId(docId);
            const docRef = doc(db, collectionName, safeId);
            
            let cachedData = null;
            try {
                // 1. محاولة جلب البيانات من الذاكرة المحلية أولاً (بشكل صامت)
                const cachedSnap = await getDocFromCache(docRef);
                if (cachedSnap.exists()) cachedData = { id: cachedSnap.id, ...cachedSnap.data(), fromCache: true };
            } catch (e) {}
            
            // 2. إذا كان المتصفح غير متصل بالإنترنت فعلياً، أعد الكاش فوراً ولا تحاول
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                return cachedData;
            }
            
            try {
                // 3. انتظار رد السيرفر لمدة 8 ثوانٍ (التوازن المثالي للشبكات البطيئة)
                const serverSnap = await this._withTimeout(getDoc(docRef), 8000, `getCacheFirst -> ${collectionName}`);
                return serverSnap.exists() ? { id: serverSnap.id, ...serverSnap.data(), fromCache: false } : null;
            } catch (error) {
                // 4. إذا انقضت الـ 8 ثوانٍ ولم يستجب السيرفر، أنقذ الموقف واعرض الكاش بدلاً من شاشة بيضاء
                if (cachedData) {
                    console.warn(`⏳ تأخر السيرفر في جلب (${collectionName}). تم استخدام الكاش لحماية تجربة المستخدم.`);
                    return cachedData;
                }
                return null;
            }
        },
        
        async set(collectionName, docId, data, options = { merge: true }) {
                try {
                    const safeId = this._sanitizeDocId(docId);
                    await this._withTimeout(setDoc(doc(db, collectionName, safeId), data, options), 10000, 'set', true);
                    return true;
                } catch (error) { return false; }
            },
            
            async add(collectionName, data) {
                    try {
                        const docRef = await this._withTimeout(addDoc(collection(db, collectionName), data), 10000, 'add', true);
                        return docRef.id;
                    } catch (error) { return null; }
                },
                
                async delete(collectionName, docId) {
                    try {
                        await this._withTimeout(deleteDoc(doc(db, collectionName, this._sanitizeDocId(docId))), 10000, 'delete', true);
                        return true;
                    } catch (error) { return false; }
                },
    listenDoc(collectionName, docId, callback) {
        const safeId = this._sanitizeDocId(docId);
        const unsubscribe = onSnapshot(doc(db, collectionName, safeId),
            (docSnap) => { callback(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null); },
            (error) => {
                // 🛡️ الإصلاح: تمرير رسالة نصية فقط لمنع الانهيار الدائري في الـ DevTools
                console.warn(`Listen Error (${collectionName}):`, error?.message || 'Network stream error');
            }
        );
        return this._registerListener(`doc_${collectionName}_${safeId}`, unsubscribe);
    },
    
    listenQuery(collectionName, filtersArray, orderField, limitCount, callback) {
        let constraints = [];
        filtersArray.forEach(f => constraints.push(where(f[0], f[1], f[2])));
        if (orderField) constraints.push(orderBy(orderField, "desc"));
        if (limitCount) constraints.push(limit(limitCount));
        
        const q = query(collection(db, collectionName), ...constraints);
        const unsubscribe = onSnapshot(q,
            (snapshot) => { callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))); },
            (error) => {
                // 🛡️ الإصلاح: تنظيف الكائن الدائري
                console.warn(`Listen Query Error (${collectionName}):`, error?.message || 'Network stream error');
            }
        );
        
        const filterStr = filtersArray.map(f => f.join('_')).join('|') + `_ord:${orderField||'none'}_lim:${limitCount||'all'}`;
        return this._registerListener(`query_${collectionName}_${filterStr}`, unsubscribe);
    },        // 🛡️ [الإصلاح الماسي 3]: مفتاح استعلام فريد ومستقر لا يتداخل
        const filterStr = filtersArray.map(f => f.join('_')).join('|') + `_ord:${orderField||'none'}_lim:${limitCount||'all'}`;
        return this._registerListener(`query_${collectionName}_${filterStr}`, unsubscribe);
    },

    // 🛡️ [الإصلاح الماسي 2]: التحقق من الاتصال قبل إرهاق السيرفر
    async callFunction(functionName, payload = {}, retryCount = 1) { 
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            const err = new Error('لا يوجد اتصال بالإنترنت.');
            err.code = 'network-offline';
            throw err;
        }

        try {
            const result = await this._withTimeout(httpsCallable(functions, functionName)(payload), 15000, `Function -> ${functionName}`, true);
            return result.data;
        } catch (error) {
            const isSensitiveFunction = ['createOrder', 'submitBalanceRequest'].includes(functionName);
            const isTransientError = error.code === 'deadline-exceeded' || error.code === 'unavailable';
            
            if (isTransientError && retryCount > 0 && !isSensitiveFunction) {
                console.warn(`⏳ تأخير في الشبكة. إعادة محاولة [${functionName}]...`);
                await new Promise(resolve => setTimeout(resolve, 1500));
                return this.callFunction(functionName, payload, retryCount - 1); 
            }
            
            const errObj = new Error(error.message || 'فشل الاتصال بالخادم.');
            errObj.code = error.code || 'unknown';
            throw errObj;
        }
    },

    async uploadImage(file, folderName = 'general', customFileName = null, isAdmin = false) { 
        if (!file) return ''; 
        
        const allowedTypes = isAdmin ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf'] : ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']; 
        if (!allowedTypes.includes(file.type)) throw new Error(`نوع الملف غير مدعوم.`); 
        
        const MAX_FILE_SIZE_MB = isAdmin ? 10 : 5; 
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) throw new Error(`حجم الملف كبير جداً.`); 
        
        try { 
            const safeFolder = String(folderName).replace(/[\/\\]|\.\./g, '').trim() || 'general'; 
            const originalExt = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : (file.type === 'application/pdf' ? 'pdf' : 'jpg'); 
            
            // دعم الأسماء العربية والرموز بأمان
            const safeFileName = file.name.replace(/[^\w\s\u0600-\u06FF\-_]/g, '').trim().replace(/\s+/g, '_') || 'file';
            
            const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 9); 
            const safeCustomName = customFileName ? String(customFileName).replace(/[^a-zA-Z0-9\-_.]/g, '') : null; 
            
            const finalFileName = safeCustomName || `${Date.now()}_${uniqueId}_${safeFileName}.${originalExt}`; 
            
            const snapshot = await this._withTimeout( 
                uploadBytes(ref(storage, `${safeFolder}/${finalFileName}`), file, { contentType: file.type }), 60000, "رفع المرفق", true 
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
                return { success: false, msg: 'لا يمكن تغيير كلمة المرور للحسابات المسجلة عبر جوجل.' };
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
    }
};