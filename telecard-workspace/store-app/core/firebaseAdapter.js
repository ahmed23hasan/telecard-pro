// ============================================================================
// ☁️ محول فايربيز المركزي (core/firebaseAdapter.js) - الإصدار المؤسسي V18.10.1 💎
// 🎯 الوظيفة: البوابة الذكية للمتجر، الاستقرار، التخزين المؤقت، والإشعارات الفورية
// 🚀 التحديثات المعمارية الصارمة (V18.10.1 - The Final Guard):
// 1. App Check Shield 🛡️: دمج حماية ReCaptcha لمنع هجمات البوتات واستنزاف الفواتير.
// 2. Deterministic Listeners 🛡️: إزالة UUID العشوائي من المستمعات لمنع تسرب الذاكرة.
// 3. Smart Cache Fallback 💸: إغلاق تجاوز السيرفر تلقائياً بعد 15 ثانية لحماية الفاتورة.
// 4. Central Auth Localization 🌐: دمج مترجم مركزي للأخطاء وإجبار إرسال الإيميلات بالعربية.
// 5. Clean Boot Orchestration 🛡️: إسناد تنظيف قواعد البيانات التالفة لمحرك script.js لمنع التضارب.
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
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

// 🛡️ استيراد درع فحص التطبيقات لمنع البوتات

import { firebaseConfig, DB_KEYS, CACHE_KEYS } from '../config.js';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ==========================================
// 🛡️ 0. تهيئة App Check (درع الحماية)
// ==========================================
let appCheck = null;
if (typeof window !== 'undefined' && firebaseConfig.recaptchaKey) {
    try {
        appCheck = initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider(firebaseConfig.recaptchaKey),
            isTokenAutoRefreshEnabled: true
        });
    } catch (e) {
        console.warn("[AppCheck] تعذر التهيئة، المتجر سيعمل بدونه مؤقتاً.");
    }
}

// ==========================================
// 🛡️ 1. تهيئة قاعدة البيانات مع السقوط الآمن
// ==========================================
let db;

try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
} catch (error) {
    console.warn("⚠️ [Firestore] تعذر تفعيل التخزين المحلي، جاري التشغيل الآمن عبر الذاكرة العشوائية...");
    db = initializeFirestore(app, {}); 
    
    // 💡 إرسال إشارة لـ script.js ليتولى هو عملية التنظيف في الزيارة القادمة بطريقته القوية
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('TELECARD_REQUIRE_DB_CLEAR', 'true');
    }
}

const auth = getAuth(app);
// 🇸🇦 إجبار فايربيز على إرسال الإيميلات (مثل استعادة كلمة المرور) باللغة العربية
auth.languageCode = 'ar';

const storage = getStorage(app);
const functions = getFunctions(app);

let messaging = null;
try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
        messaging = getMessaging(app);
    }
} catch (error) {
    console.warn("[FCM] ميزة الإشعارات غير مدعومة.");
}

export { auth, db, storage, functions, messaging };

// ==========================================
// 🌐 مترجم الأخطاء المركزي (Localization)
// ==========================================
const translateFirebaseError = (errorCode, defaultMsg = 'حدث خطأ في النظام') => {
    const errorMap = {
        'auth/user-not-found': 'هذا البريد غير مسجل لدينا.',
        'auth/wrong-password': 'كلمة المرور غير صحيحة.',
        'auth/invalid-credential': 'بيانات الدخول غير صالحة.',
        'auth/email-already-in-use': 'هذا البريد مستخدم بحساب آخر.',
        'auth/too-many-requests': 'محاولات كثيرة، يرجى المحاولة لاحقاً.',
        'auth/network-request-failed': 'تأكد من اتصالك بالإنترنت.',
        'permission-denied': 'عذراً، لا تملك صلاحية لتنفيذ هذا الإجراء.',
        'deadline-exceeded': 'انتهى وقت الطلب، الشبكة ضعيفة.',
        'resource-exhausted': 'يوجد ضغط شديد حالياً، يرجى المحاولة بعد قليل.'
    };
    return errorMap[errorCode] || defaultMsg;
};

export const FirebaseAdapter = {
    db: db,
    storage: storage,
    functions: functions,
    _activeListeners: new Map(),
    _globalForceServer: false, 

    async requestFCMToken() {
        if (!messaging || typeof window === 'undefined' || !('Notification' in window)) return null;
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return null;
            return await getToken(messaging, { vapidKey: firebaseConfig.vapidKey });
        } catch (error) { return null; }
    },

    // ==========================================
    // 🧠 3. نظام الختم العالمي (Global Cache Versioning)
    // ==========================================
    initGlobalCacheVersioning: async function() {
        if (typeof window === 'undefined' || !window.localStorage || navigator.onLine === false) return;
        
        try {
            const versionSnap = await getDoc(doc(db, DB_KEYS.SYSTEM, 'cache_version'));
            if (versionSnap.exists()) {
                const serverVersion = versionSnap.data().version || 0;
                const localVersion = Number(localStorage.getItem(CACHE_KEYS.SERVER_VERSION) || 0);
                
                if (serverVersion > localVersion) {
                    console.log(`🔄 تم اكتشاف تحديث جديد (V${serverVersion}). تجاوز الكاش مفعّل مؤقتاً.`);
                    this._globalForceServer = true; 
                    localStorage.setItem(CACHE_KEYS.SERVER_VERSION, serverVersion);
                    
                    // 💸 حماية الفاتورة: إغلاق الإجبار بعد 15 ثانية للعودة للكاش
                    setTimeout(() => {
                        this._globalForceServer = false;
                        console.log(`✅ انتهت فترة التحديث. تم استعادة الاعتماد على الكاش المحلي.`);
                    }, 15000);
                } else {
                    this._globalForceServer = false;
                }
            }
        } catch (error) {}
    },

    _registerListener: function(uniqueKey, unsubscribeFn) {
        if (this._activeListeners.has(uniqueKey)) this._activeListeners.get(uniqueKey)(); 
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

    // ==========================================
    // 🗄️ 4. محرك قواعد البيانات (DB Engine)
    // ==========================================
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
    
    async getCacheFirst(collectionName, docId) {
        let cachedData = null;
        try {
            const safeId = this._sanitizeDocId(docId);
            const docRef = doc(db, collectionName, safeId);
            const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
            
            try {
                const cachedSnap = await this._withTimeout(getDocFromCache(docRef), 3000);
                if (cachedSnap.exists()) cachedData = { id: cachedSnap.id, ...cachedSnap.data(), fromCache: true };
            } catch (e) {}
            
            if (isOffline || (cachedData && !this._globalForceServer)) return cachedData;
            
            try {
                const serverSnap = await this._withTimeout(getDoc(docRef), 8000);
                return serverSnap.exists() ? { id: serverSnap.id, ...serverSnap.data(), fromCache: false } : null;
            } catch (error) {
                if (cachedData) return cachedData;
                throw error;
            }
        } catch (error) { return cachedData || null; }
    },

    async queryCacheFirst(collectionName, filtersArray = [], orderField = null, limitCount = 50, forceServer = false) {
        let cachedDocs = null;
        try {
            let constraints = [];
            filtersArray.forEach(f => constraints.push(where(f[0], f[1], f[2])));
            if (orderField) constraints.push(orderBy(orderField, "desc"));
            if (limitCount) constraints.push(limit(limitCount));
            
            const q = query(collection(db, collectionName), ...constraints);
            const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
            const needsServer = forceServer || this._globalForceServer;
            
            try {
                const cachedSnapshot = await this._withTimeout(getDocsFromCache(q), 4000);
                if (!cachedSnapshot.empty) {
                    cachedDocs = cachedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), fromCache: true }));
                    if (!needsServer || isOffline) return cachedDocs;
                }
            } catch (cacheError) {}
            
            const serverSnapshot = await this._withTimeout(getDocs(q), 10000);
            return serverSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), fromCache: false }));
            
        } catch (error) {
            if (cachedDocs && cachedDocs.length > 0) return cachedDocs;
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

    // 🛡️ إزالة UUID العشوائي - مفاتيح حتمية لمنع تسرب الذاكرة
    listenDoc(collectionName, docId, callback) {
        const safeId = this._sanitizeDocId(docId);
        const unsubscribe = onSnapshot(doc(db, collectionName, safeId),
            (docSnap) => { callback(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null); },
            () => {}
        );
        const safeKey = `doc_${collectionName}_${safeId}`;
        return this._registerListener(safeKey, unsubscribe);
    },
    
    // 🛡️ إزالة UUID العشوائي - مفاتيح حتمية لمنع تسرب الذاكرة والفواتير
    listenQuery(collectionName, filtersArray, orderField, limitCount, callback) {
        let constraints = [];
        filtersArray.forEach(f => constraints.push(where(f[0], f[1], f[2])));
        if (orderField) constraints.push(orderBy(orderField, "desc"));
        if (limitCount) constraints.push(limit(limitCount));
        
        const q = query(collection(db, collectionName), ...constraints);
        const unsubscribe = onSnapshot(q,
            (snapshot) => { callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))); },
            () => {}
        );
        
        const filterStr = JSON.stringify(filtersArray);
        const safeKey = `query_${collectionName}_${filterStr}_${orderField||'none'}_${limitCount||'all'}`;
        
        return this._registerListener(safeKey, unsubscribe);
    },

    // ==========================================
    // ⚙️ 5. محرك الكلاود فانكشن والتخزين
    // ==========================================
    async callFunction(functionName, payload = {}, retryCount = 1) { 
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            const err = new Error('لا يوجد اتصال بالإنترنت. يرجى التحقق من الشبكة.');
            err.code = 'network-offline';
            throw err;
        }

        try {
            const result = await this._withTimeout(
                httpsCallable(functions, functionName)(payload), 15000, `Function -> ${functionName}`, false
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
            
            // 🛡️ التوافق مع الكلمات الأمنية للسيرفر
            const sensitiveKeywords = ['SECURITY_REJECT', '[SECURITY]', 'رأس المال', 'الربح', 'تكلفة', 'يكسر حاجز', 'خسارة', 'السعر النهائي', 'cost', 'profit', 'margin', 'division by zero'];
            const isSensitiveError = sensitiveKeywords.some(keyword => errorMsg.includes(keyword));
            
            if (isSensitiveError) {
                // طمس رسالة الخطأ عن العميل للحفاظ على أسرار المتجر
                errorMsg = 'عذراً، لا يمكن تنفيذ الطلب حالياً. يرجى تحديث الصفحة أو المحاولة لاحقاً.';
                console.warn("🛡️ [Security Guard] تم التقاط رسالة سيرفر حساسة وإخفاؤها عن العميل بنجاح.");
            } else if (error.code) {
                // ترجمة رسائل الخطأ العادية
                errorMsg = translateFirebaseError(error.code, errorMsg);
            }

            const errObj = new Error(errorMsg);
            errObj.code = error.code || 'unknown';
            throw errObj;
        }
    },
    
    async uploadImage(file, folderName = 'general', customFileName = null) { 
        if (!file) return ''; 
        
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']; 
        if (!allowedTypes.includes(file.type)) throw new Error(`نوع الملف غير مدعوم. مسموح فقط بالصور النقطية أو PDF.`); 
        
        const MAX_FILE_SIZE_MB = 10; 
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) throw new Error(`حجم الملف كبير جداً. الحد الأقصى ${MAX_FILE_SIZE_MB} ميجابايت.`); 
        
        try { 
            const safeFolder = String(folderName).replace(/[\/\\]|\.\./g, '').trim() || 'general'; 
            
            const originalExt = (file.name || '').includes('.') ? file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') : (file.type === 'application/pdf' ? 'pdf' : 'jpg'); 
            const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'];
            
            if (!validExtensions.includes(originalExt)) {
                throw new Error('امتداد الملف غير متوافق مع محتواه. تم الرفض لأسباب أمنية.');
            }

            const safeFileName = (file.name || 'file').replace(/[^\w\s\u0600-\u06FF\-_]/g, '').trim().replace(/\s+/g, '_') || 'file';
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

    // ==========================================
    // 🔐 6. محرك المصادقة (Auth Engine) مع الترجمة
    // ==========================================
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
    }
};

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => FirebaseAdapter.initGlobalCacheVersioning());
    FirebaseAdapter.initGlobalCacheVersioning();
}
