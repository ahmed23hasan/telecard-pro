// ============================================================================
// ☁️ محول فايربيز المركزي (core/firebaseAdapter.js) - الإصدار المؤسسي V21.0.0 💎
// 🎯 الوظيفة: البوابة الحصرية الوحيدة للاتصال بخدمات Firebase (Firestore, Auth, Storage, Functions, FCM).
// 🚀 التحديثات المعمارية (V21.0.0 - Exclusive Gateway & Zero-Collision Cache):
// 1. Exclusive Firebase Gateway 🏛️: ضم دوال (onAuthChange, signOutUser, refreshUserToken, is2FAEnabled) لمنع تسرب مكتبات فايربيز لملفات الواجهة.
// 2. Zero-Collision Cache Guard 🛡️: إيقاف الكتابة المتضاربة على SERVER_VERSION وترك إدارتها المركزية لـ DataManager.
// 3. Fast-Path Server Fetch ⚡: تخطي قراءة IndexedDB غير الضرورية عندما يكون forceServer=true لتقليل استهلاك المعالج والذاكرة للنصف.
// 4. Unified Service Worker & Storage Parity 🔒: ربط FCM بعامل الخدمة النشط ومطابقة شروط رفع الملفات مع storage.rules.
// ============================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager, 
    collection, doc, getDoc, getDocs, getDocFromCache, getDocsFromCache, 
    setDoc, addDoc, deleteDoc, onSnapshot, 
    query, where, orderBy, limit, startAfter 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, signOut, sendPasswordResetEmail, updatePassword, 
    reauthenticateWithCredential, EmailAuthProvider, multiFactor, TotpMultiFactorGenerator 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

import { firebaseConfig } from '../config.js';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let db;
try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
} catch (error) {
    console.warn("⚠️ [Firestore] تعذر تفعيل التخزين المحلي، جاري التشغيل الآمن عبر الذاكرة العشوائية...");
    db = initializeFirestore(app, {}); 
    if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem('TELECARD_REQUIRE_DB_CLEAR', 'true'); } catch (e) {}
    }
}

const auth = getAuth(app);
auth.languageCode = 'ar';

const storage = getStorage(app);
// 🛡️ توحيد الإقليم الجغرافي مع السيرفر (us-east1)
const functions = getFunctions(app, 'us-east1');

let messaging = null;
try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
        messaging = getMessaging(app);
    }
} catch (error) {
    console.warn("[FCM] ميزة الإشعارات غير مدعومة في هذه البيئة.");
}

export { auth, db, storage, functions, messaging };

const translateFirebaseError = (errorCode, defaultMsg = 'حدث خطأ في النظام') => {
    const errorMap = {
        'auth/user-not-found': 'هذا البريد غير مسجل لدينا.',
        'auth/wrong-password': 'كلمة المرور غير صحيحة.',
        'auth/invalid-credential': 'بيانات الدخول غير صالحة.',
        'auth/email-already-in-use': 'هذا البريد مستخدم بحساب آخر.',
        'auth/too-many-requests': 'محاولات كثيرة، يرجى المحاولة لاحقاً.',
        'auth/network-request-failed': 'تأكد من اتصالك بالإنترنت.',
        'auth/requires-recent-login': 'يرجى إعادة تسجيل الدخول لتنفيذ هذا الإجراء الحساس.',
        'permission-denied': 'عذراً، لا تملك صلاحية لتنفيذ هذا الإجراء.',
        'deadline-exceeded': 'انتهى وقت الطلب، الشبكة ضعيفة.',
        'resource-exhausted': 'يوجد ضغط شديد حالياً، يرجى المحاولة بعد قليل.'
    };
    return errorMap[errorCode] || defaultMsg;
};

export const FirebaseAdapter = {
    db: db,
    auth: auth,
    storage: storage,
    functions: functions,
    _activeListeners: new Map(),
    _globalForceServer: false,

    // ========================================================================
    // 🔐 1. بوابة المصادقة والجلسات الموحدة (Unified Auth Gateway)
    // ========================================================================
    onAuthChange(callback) {
        if (!auth || typeof callback !== 'function') return () => {};
        return onAuthStateChanged(auth, callback);
    },

    async signOutUser() {
        if (!auth) return true;
        try {
            await signOut(auth);
            return true;
        } catch (e) {
            console.warn("⚠️ [Auth] تعذر تسجيل الخروج السحابي:", e);
            return false;
        }
    },

    async refreshUserToken() {
        try {
            if (auth && auth.currentUser) {
                return await auth.currentUser.getIdToken(true);
            }
        } catch (e) {
            console.warn("⚠️ [Auth] تعذر تحديث رمز الجلسة:", e);
        }
        return null;
    },

    is2FAEnabled() {
        return Boolean(auth?.currentUser?.multiFactor?.enrolledFactors?.length > 0);
    },

    async sendResetEmail(email) {
        try {
            await sendPasswordResetEmail(auth, email);
            return { success: true };
        } catch (error) {
            return { success: false, msg: translateFirebaseError(error.code, 'تعذر إرسال الرابط.') };
        }
    },

    async changeUserPassword(currentPassword, newPassword) {
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("auth/user-not-found");

            const hasPasswordProvider = user.providerData.some(p => p.providerId === 'password');
            if (!hasPasswordProvider) return { success: false, msg: 'لا يمكن تغيير كلمة المرور للحسابات المسجلة عبر منصات أخرى.' };

            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
            await updatePassword(user, newPassword);
            return { success: true };
        } catch (error) {
            return { success: false, msg: translateFirebaseError(error.code, 'تعذر تحديث كلمة المرور.') };
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

    // ========================================================================
    // 🔔 2. بوابة الإشعارات الفورية (FCM Token Gateway)
    // ========================================================================
    async requestFCMToken() {
        if (!messaging || typeof window === 'undefined' || !('Notification' in window)) return null;
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return null;

            let swReg = null;
            if ('serviceWorker' in navigator) {
                swReg = await navigator.serviceWorker.getRegistration('./sw.js').catch(() => null);
                if (!swReg) {
                    swReg = await navigator.serviceWorker.ready.catch(() => null);
                }
            }

            return await getToken(messaging, { 
                vapidKey: firebaseConfig.vapidKey,
                ...(swReg ? { serviceWorkerRegistration: swReg } : {})
            });
        } catch (error) { return null; }
    },

    // ========================================================================
    // 🗄️ 3. إدارة الكاش والمستمعات الحية (Cache & Listeners Management)
    // ========================================================================
    setForceServer: function(force = false) {
        this._globalForceServer = Boolean(force);
    },

    // 🛡️ متروكة للتوافق المرجعي دون الكتابة المتضاربة على CACHE_KEYS.SERVER_VERSION
    initGlobalCacheVersioning: async function() {
        return true;
    },

    _registerListener: function(uniqueKey, unsubscribeFn) {
        if (this._activeListeners.has(uniqueKey)) {
            try { this._activeListeners.get(uniqueKey)(); } catch (e) {}
        }
        this._activeListeners.set(uniqueKey, unsubscribeFn);
        return () => {
            if (this._activeListeners.has(uniqueKey)) {
                try { this._activeListeners.get(uniqueKey)(); } catch (e) {}
                this._activeListeners.delete(uniqueKey);
            }
        };
    },

    killAllListeners: function() {
        this._activeListeners.forEach((unsubscribeFn) => { try { unsubscribeFn(); } catch(e){} });
        this._activeListeners.clear();
    },

    _sanitizeDocId: function(id) {
        const cleanId = id ? String(id).replace(/[\/\\]/g, '_').trim() : '';
        if (!cleanId) throw new Error("معرف المستند (ID) غير صالح.");
        return cleanId;
    },

    _withTimeout: function(promise, ms = 10000, context = '', isWriteOperation = false) {
        if (isWriteOperation) return promise; 
        
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                const err = new Error(`[Timeout] السيرفر لم يستجب لطلب: ${context}.`);
                err.code = 'deadline-exceeded'; 
                reject(err);
            }, ms);
        });
        
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    },

    // ========================================================================
    // 📄 4. عمليات القراءة والكتابة والاستعلام (Firestore CRUD & Queries)
    // ========================================================================
    async getById(collectionName, docId) {
        const safeId = this._sanitizeDocId(docId);
        const docSnap = await this._withTimeout(getDoc(doc(db, collectionName, safeId)), 10000);
        return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    },

    async getAll(collectionName, maxLimit = 1000) {
        const q = query(collection(db, collectionName), limit(maxLimit));
        const snapshot = await this._withTimeout(getDocs(q), 10000);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async query(collectionName, field, op, value, maxLimit = 50) {
        const q = query(collection(db, collectionName), where(field, op, value), limit(maxLimit));
        const snapshot = await this._withTimeout(getDocs(q), 10000);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async fetchMoreWithCursor(collectionName, whereCondition, orderField, cursorDoc, limitCount = 15) {
        let constraints = [];
        let primaryOrderField = orderField;

        if (whereCondition && Array.isArray(whereCondition) && whereCondition.length === 3) {
            const isInequalityFilter = ['<', '<=', '>', '>=', '!='].includes(whereCondition[1]);
            primaryOrderField = isInequalityFilter ? whereCondition[0] : orderField;
            
            constraints.push(where(whereCondition[0], whereCondition[1], whereCondition[2]));
            constraints.push(orderBy(primaryOrderField, "desc"));

            if (isInequalityFilter && orderField !== primaryOrderField) constraints.push(orderBy(orderField, "desc"));
        } else {
            constraints.push(orderBy(primaryOrderField, "desc"));
        }

        constraints.push(startAfter(cursorDoc), limit(limitCount));
        const q = query(collection(db, collectionName), ...constraints);
        
        const snapshot = await this._withTimeout(getDocs(q), 15000);
        return {
            data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            newLastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null
        };
    },
    
    async getCacheFirst(collectionName, docId, forceServer = false) {
        let cachedData = null;
        const safeId = this._sanitizeDocId(docId);
        const docRef = doc(db, collectionName, safeId);
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const needsServer = forceServer || this._globalForceServer;

        try {
            // ⚡ إذا لم يكن التحديث الإجباري مطلوباً، نقرأ من الكاش المحلي أولاً بسرعة 0ms
            if (!needsServer || isOffline) {
                try {
                    const cachedSnap = await this._withTimeout(getDocFromCache(docRef), 3000);
                    if (cachedSnap.exists()) {
                        cachedData = { id: cachedSnap.id, ...cachedSnap.data(), fromCache: true };
                        return cachedData;
                    }
                } catch (e) {}
            }

            if (isOffline) return cachedData;

            const serverSnap = await this._withTimeout(getDoc(docRef), 8000);
            return serverSnap.exists() ? { id: serverSnap.id, ...serverSnap.data(), fromCache: false } : null;
        } catch (error) {
            if (!cachedData) {
                try {
                    const fallbackSnap = await this._withTimeout(getDocFromCache(docRef), 2000);
                    if (fallbackSnap.exists()) return { id: fallbackSnap.id, ...fallbackSnap.data(), fromCache: true };
                } catch (e) {}
            }
            return cachedData || null;
        }
    },

    async queryCacheFirst(collectionName, filtersArray = [], orderField = null, limitCount = 50, forceServer = false) {
        let constraints = [];
        filtersArray.forEach(f => constraints.push(where(f[0], f[1], f[2])));
        if (orderField) constraints.push(orderBy(orderField, "desc"));
        if (limitCount) constraints.push(limit(limitCount));
        
        const q = query(collection(db, collectionName), ...constraints);
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const needsServer = forceServer || this._globalForceServer;

        try {
            // ⚡ المسار السريع: إذا كان الكاش صالحاً (أو لا يوجد إنترنت)، نقرأ من IndexedDB فوراً دون لمس السيرفر
            if (!needsServer || isOffline) {
                try {
                    const cachedSnapshot = await this._withTimeout(getDocsFromCache(q), 4000);
                    if (!cachedSnapshot.empty) {
                        return cachedSnapshot.docs.map(d => ({ id: d.id, ...d.data(), fromCache: true }));
                    }
                } catch (cacheError) {}
            }

            if (isOffline) return [];

            // 📡 جلب البيانات المحدثة من السيرفر مباشرة
            const serverSnapshot = await this._withTimeout(getDocs(q), 10000);
            return serverSnapshot.docs.map(d => ({ id: d.id, ...d.data(), fromCache: false }));
            
        } catch (error) {
            // 🛡️ خط الدفاع الاحتياطي: في حال فشل السيرفر أثناء forceServer، نعود للكاش المحلي إن وجد
            try {
                const fallbackSnapshot = await this._withTimeout(getDocsFromCache(q), 3000);
                if (!fallbackSnapshot.empty) {
                    return fallbackSnapshot.docs.map(d => ({ id: d.id, ...d.data(), fromCache: true }));
                }
            } catch (e) {}
            return []; 
        }
    },
    
    listenQueryWithCache(collectionName, filtersArray, orderField, limitCount, callback) {
        return this.listenQuery(collectionName, filtersArray, orderField, limitCount, callback);
    },   

    async set(collectionName, docId, data, options = { merge: true }) {
        const safeId = this._sanitizeDocId(docId);
        await this._withTimeout(setDoc(doc(db, collectionName, safeId), data, options), 10000, 'set', true);
        return true;
    },
            
    async add(collectionName, data) {
        const docRef = await this._withTimeout(addDoc(collection(db, collectionName), data), 10000, 'add', true);
        return docRef.id;
    },
                
    async delete(collectionName, docId) {
        await this._withTimeout(deleteDoc(doc(db, collectionName, this._sanitizeDocId(docId))), 10000, 'delete', true);
        return true;
    },

    listenDoc(collectionName, docId, callback) {
        const safeId = this._sanitizeDocId(docId);
        const safeKey = `doc_${collectionName}_${safeId}`;
        const unsubscribe = onSnapshot(doc(db, collectionName, safeId),
            (docSnap) => { callback(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null); },
            (err) => { console.warn(`⚠️ [Firestore ListenDoc] (${collectionName}/${safeId}):`, err?.code || err?.message); }
        );
        return this._registerListener(safeKey, unsubscribe);
    },
    
    listenQuery(collectionName, filtersArray, orderField, limitCount, callback) {
        let constraints = [];
        filtersArray.forEach(f => constraints.push(where(f[0], f[1], f[2])));
        if (orderField) constraints.push(orderBy(orderField, "desc"));
        if (limitCount) constraints.push(limit(limitCount));
        
        const filterStr = JSON.stringify(filtersArray);
        const safeKey = `query_${collectionName}_${filterStr}_${orderField||'none'}_${limitCount||'all'}`;

        const q = query(collection(db, collectionName), ...constraints);
        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const docsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
                callback(docsData, lastDoc);
            },
            (err) => { console.warn(`⚠️ [Firestore ListenQuery] (${collectionName}):`, err?.code || err?.message); }
        );
        
        return this._registerListener(safeKey, unsubscribe);
    },

    // ========================================================================
    // ⚡ 5. استدعاء الدوال السحابية والرفع للتخزين (Cloud Functions & Storage)
    // ========================================================================
    async callFunction(functionName, payload = {}, retryCount = 1) { 
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            const err = new Error('لا يوجد اتصال بالإنترنت. يرجى التحقق من الشبكة.');
            err.code = 'network-offline';
            throw err;
        }

        try {
            const isOrderCreation = functionName === 'createOrder';
            const executionTimeoutMs = isOrderCreation ? 120000 : 25000;
            const result = await this._withTimeout(
                httpsCallable(functions, functionName, { timeout: executionTimeoutMs })(payload), executionTimeoutMs, `Function -> ${functionName}`, false
            );
            return result.data;
        } catch (error) {
            const isSensitiveFunction = ['createOrder', 'submitBalanceRequest', 'adminAdjustBalance'].includes(functionName);
            const isTransientError = error.code === 'deadline-exceeded' || error.code === 'unavailable';
            
            if (isTransientError && retryCount > 0 && !isSensitiveFunction) {
                await new Promise(resolve => setTimeout(resolve, 1500));
                return this.callFunction(functionName, payload, retryCount - 1); 
            }
            
            let errorMsg = error.message || 'فشل الاتصال بالخادم.';
            
            const sensitiveKeywords = ['SECURITY_REJECT', '[SECURITY]', 'رأس المال', 'الربح', 'تكلفة', 'يكسر حاجز', 'خسارة', 'السعر النهائي', 'cost', 'profit', 'margin', 'division by zero'];
            const isSensitiveError = sensitiveKeywords.some(keyword => errorMsg.includes(keyword));
            
            if (isSensitiveError) {
                errorMsg = 'عذراً، لا يمكن تنفيذ الطلب حالياً. يرجى تحديث الصفحة أو المحاولة لاحقاً.';
                console.warn("🛡️ [Security Guard] تم التقاط رسالة سيرفر حساسة وإخفاؤها عن العميل بنجاح.");
            } else if (error.code) {
                errorMsg = translateFirebaseError(error.code, errorMsg);
            }

            const errObj = new Error(errorMsg);
            errObj.code = error.code || 'unknown';
            throw errObj;
        }
    },
    
    async uploadImage(file, folderName = 'general', customFileName = null) { 
        if (!file) return ''; 
        
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']; 
        if (!allowedTypes.includes(file.type)) throw new Error(`نوع الملف غير مدعوم. مسموح فقط بصور (JPG, PNG, WEBP) أو ملف PDF.`); 
        
        const MAX_FILE_SIZE_MB = folderName === 'avatars' ? 5 : 10; 
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) throw new Error(`حجم الملف كبير جداً. الحد الأقصى ${MAX_FILE_SIZE_MB} ميجابايت.`); 
        
        try { 
            const safeFolder = String(folderName).replace(/[\/\\]|\.\./g, '').trim() || 'general'; 
            
            const mimeExtMap = {
                'image/jpeg': 'jpg',
                'image/jpg': 'jpg',
                'image/png': 'png',
                'image/webp': 'webp',
                'application/pdf': 'pdf'
            };
            const fallbackExt = mimeExtMap[file.type] || 'jpg';
            const rawExt = (file.name || '').includes('.') ? file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') : fallbackExt; 
            const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
            const originalExt = validExtensions.includes(rawExt) ? rawExt : fallbackExt;

            if (file.type === 'application/pdf' && originalExt !== 'pdf') {
                throw new Error('امتداد الملف غير متوافق مع محتواه. تم الرفض لأسباب أمنية.');
            }

            const safeFileName = (file.name || 'file').replace(/[^\w\s\u0600-\u06FF\-_]/g, '').trim().replace(/\s+/g, '_') || 'file';
            const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 9); 
            
            const safeCustomName = customFileName ? String(customFileName).replace(/[^a-zA-Z0-9\-_.]/g, '') : null; 
            const hasValidExt = safeCustomName && /\.(jpg|jpeg|png|webp|pdf)$/i.test(safeCustomName);
            const finalFileName = safeCustomName
                ? (hasValidExt ? safeCustomName : `${safeCustomName}.${originalExt}`)
                : `${Date.now()}_${uniqueId}_${safeFileName}.${originalExt}`; 
            
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
    }
};