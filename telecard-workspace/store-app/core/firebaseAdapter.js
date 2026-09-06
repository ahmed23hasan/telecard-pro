// ============================================================================
// ☁️ محول فايربيز المركزي (core/firebaseAdapter.js) - الإصدار المؤسسي V18.9.0 💎
// 🎯 الوظيفة: البوابة الذكية للمتجر، الاستقرار، التخزين المؤقت، والإشعارات الفورية
// 🚀 التحديثات المعمارية (V18.9.0 - Absolute Concurrency Guard):
// 1. Persistence Lock Crash Fix 🛡️: إزالة تنظيف الكاش المتزامن لمنع تحطم إقلاع المتجر (Fatal Crash).
// 2. Listener Overwrite Shield 🛡️: توليد مُعرّف فريد (UUID) لكل مستمع لمنع المكونات من قتل مستمعات بعضها.
// 3. Multi-Tab Persistence 🛡️: تفعيل مدير التبويبات المتعددة لمنع قفل IndexedDB (Error: failed-precondition).
// 4. Safe Config Import 🛡️: التوافق التام مع كائنات التجميد العميق (deepFreeze) في config.js.
// ============================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager, clearIndexedDbPersistence, 
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

import { firebaseConfig, DB_KEYS, CACHE_KEYS } from '../config.js';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ==========================================
// 🛡️ 1. تهيئة قاعدة البيانات مع السقوط الآمن (Fail-Safe Boot)
// ==========================================
let db;
try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
} catch (error) {
    console.warn("⚠️ [Firestore] تعذر تفعيل التخزين المحلي المتزامن، جاري التشغيل الآمن عبر الذاكرة العشوائية (Memory Cache)...");
    
    // 🛡️ الإصلاح المعماري: لا نستدعي clearIndexedDbPersistence هنا أبداً لتجنب انهيار التطبيق.
    // يتم تهيئة الذاكرة العشوائية فوراً لضمان إقلاع المتجر دون أخطاء قاتلة.
    db = initializeFirestore(app, {}); 
    
    // نعلم النظام بضرورة تنظيف الكاش في الزيارة القادمة (قبل التهيئة)
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('TELECARD_REQUIRE_DB_CLEAR', 'true');
    }
}

const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// 🛡️ تهيئة الإشعارات بأمان
let messaging = null;
try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
        messaging = getMessaging(app);
    }
} catch (error) {
    console.warn("[FCM] ميزة الإشعارات غير مدعومة في بيئة المتصفح الحالية.");
}

export { auth, db, storage, functions, messaging };

export const FirebaseAdapter = {
    db: db,
    storage: storage,
    functions: functions,
    _activeListeners: new Map(),
    _globalForceServer: false, 

    // ==========================================
    // 🔔 2. محرك الإشعارات الفورية (FCM Engine)
    // ==========================================
    async requestFCMToken() {
        if (!messaging || typeof window === 'undefined' || !('Notification' in window)) return null;
        
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.warn('[FCM] العميل رفض صلاحية الإشعارات.');
                return null;
            }
            
            const token = await getToken(messaging, { 
                vapidKey: firebaseConfig.vapidKey 
            });
            
            return token;
        } catch (error) {
            console.warn('[FCM] تعذر جلب توكن الإشعارات:', error);
            return null;
        }
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
                    console.log(`🔄 تم اكتشاف تحديث جديد من الإدارة (V${serverVersion}). تجاوز الكاش مفعّل.`);
                    this._globalForceServer = true; 
                    localStorage.setItem(CACHE_KEYS.SERVER_VERSION, serverVersion);
                } else {
                    this._globalForceServer = false;
                }
            }
        } catch (error) { 
            console.warn("تعذر التحقق من نسخة الكاش العالمي، سيتم الاعتماد على الكاش المحلي."); 
        }
    },

    // 🛡️ إدارة المستمعات المركزية
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
        const cleanId = id ? String(id).replace(/[\/\\]/g, '_').trim() : '';
        if (!cleanId) throw new Error("معرف المستند (ID) غير صالح.");
        return cleanId;
    },

    _withTimeout: function(promise, ms = 10000, context = '', isWriteOperation = false) {
        if (isWriteOperation) return promise; // عمليات الكتابة لا تتأثر بالـ Timeout ليقوم فايربيز بمزامنتها عند عودة النت
        
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                const err = new Error(`[Timeout] السيرفر لم يستجب لطلب: ${context}. يرجى التحقق من اتصالك.`);
                err.code = 'deadline-exceeded'; 
                reject(err);
            }, ms);
        });
        
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    },

    // ==========================================
    // 🗄️ 4. محرك قواعد البيانات المتقدم (DB Engine)
    // ==========================================
    async getById(collectionName, docId) {
        try {
            const safeId = this._sanitizeDocId(docId);
            const docSnap = await this._withTimeout(getDoc(doc(db, collectionName, safeId)), 10000, `getById -> ${collectionName}`);
            return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
        } catch (error) { 
            console.error(`[DB Error] getById (${collectionName}):`, error.message);
            throw error; 
        }
    },

    async getAll(collectionName, maxLimit = 1000) {
        try {
            const q = query(collection(db, collectionName), limit(maxLimit));
            const snapshot = await this._withTimeout(getDocs(q), 10000, `getAll -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) { 
            console.error(`[DB Error] getAll (${collectionName}):`, error.message);
            throw error;
        }
    },

    async query(collectionName, field, op, value, maxLimit = 50) {
        try {
            const q = query(collection(db, collectionName), where(field, op, value), limit(maxLimit));
            const snapshot = await this._withTimeout(getDocs(q), 10000, `query -> ${collectionName}`);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) { 
            console.error(`[DB Error] query (${collectionName}):`, error.message);
            throw error; 
        }
    },

    async fetchMoreWithCursor(collectionName, whereCondition, orderField, cursorDoc, limitCount = 15) {
        try {
            let constraints = [];
            let primaryOrderField = orderField;

            if (whereCondition && Array.isArray(whereCondition) && whereCondition.length === 3) {
                const isInequalityFilter = ['<', '<=', '>', '>=', '!='].includes(whereCondition[1]);
                primaryOrderField = isInequalityFilter ? whereCondition[0] : orderField;
                
                constraints.push(where(whereCondition[0], whereCondition[1], whereCondition[2]));
                constraints.push(orderBy(primaryOrderField, "desc"));

                if (isInequalityFilter && orderField !== primaryOrderField) {
                    constraints.push(orderBy(orderField, "desc"));
                }
            } else {
                constraints.push(orderBy(primaryOrderField, "desc"));
            }

            constraints.push(startAfter(cursorDoc), limit(limitCount));
            const q = query(collection(db, collectionName), ...constraints);
            
            const snapshot = await this._withTimeout(getDocs(q), 15000, `fetchMore -> ${collectionName}`);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return {
                data: data,
                newLastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null
            };
        } catch (error) { 
            console.error(`[DB Error] fetchMoreWithCursor (${collectionName}):`, error.message);
            throw error; 
        }
    },
    
    async getCacheFirst(collectionName, docId) {
        let cachedData = null;
        try {
            const safeId = this._sanitizeDocId(docId);
            const docRef = doc(db, collectionName, safeId);
            const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
            
            try {
                const cachedSnap = await this._withTimeout(getDocFromCache(docRef), 3000, 'getDocFromCache');
                if (cachedSnap.exists()) cachedData = { id: cachedSnap.id, ...cachedSnap.data(), fromCache: true };
            } catch (e) {}
            
            if (isOffline || (cachedData && !this._globalForceServer)) {
                return cachedData;
            }
            
            try {
                const serverSnap = await this._withTimeout(getDoc(docRef), 8000, `getCacheFirst -> ${collectionName}`);
                return serverSnap.exists() ? { id: serverSnap.id, ...serverSnap.data(), fromCache: false } : null;
            } catch (error) {
                if (cachedData) {
                    console.warn(`⏳ تأخر السيرفر في جلب (${collectionName}). تم استخدام الكاش.`);
                    return cachedData;
                }
                throw error;
            }
        } catch (error) {
            console.error(`[DB Error] getCacheFirst (${collectionName}):`, error.message);
            return cachedData || null;
        }
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
                const cachedSnapshot = await this._withTimeout(getDocsFromCache(q), 4000, 'getDocsFromCache');
                if (!cachedSnapshot.empty) {
                    cachedDocs = cachedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), fromCache: true }));
                    if (!needsServer || isOffline) return cachedDocs;
                }
            } catch (cacheError) {}
            
            const serverSnapshot = await this._withTimeout(getDocs(q), 10000, `queryCacheFirst -> ${collectionName}`);
            return serverSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), fromCache: false }));
            
        } catch (error) {
            console.error(`🚨 [DB Error] فشل الاتصال بالسيرفر لـ (${collectionName}):`, error.message);
            
            if (cachedDocs && cachedDocs.length > 0) {
                console.warn(`⚠️ تم استخدام بيانات الكاش لـ ${collectionName} لإنقاذ إقلاع المتجر.`);
                return cachedDocs;
            }
            console.warn(`⚠️ إرجاع بيانات فارغة لـ ${collectionName} لضمان استمرار إقلاع المتجر وعدم التعليق.`);
            return []; 
        }
    },
    
    listenQueryWithCache(collectionName, filtersArray, orderField, limitCount, callback) {
        return this.listenQuery(collectionName, filtersArray, orderField, limitCount, callback);
    },   

    async set(collectionName, docId, data, options = { merge: true }) {
        try {
            const safeId = this._sanitizeDocId(docId);
            await this._withTimeout(setDoc(doc(db, collectionName, safeId), data, options), 10000, 'set', true);
            return true;
        } catch (error) { 
            console.error(`[DB Error] set (${collectionName}):`, error.message);
            throw error; 
        }
    },
            
    async add(collectionName, data) {
        try {
            const docRef = await this._withTimeout(addDoc(collection(db, collectionName), data), 10000, 'add', true);
            return docRef.id;
        } catch (error) { 
            console.error(`[DB Error] add (${collectionName}):`, error.message);
            throw error; 
        }
    },
                
    async delete(collectionName, docId) {
        try {
            await this._withTimeout(deleteDoc(doc(db, collectionName, this._sanitizeDocId(docId))), 10000, 'delete', true);
            return true;
        } catch (error) { 
            console.error(`[DB Error] delete (${collectionName}):`, error.message);
            throw error; 
        }
    },

    listenDoc(collectionName, docId, callback) {
        try {
            const safeId = this._sanitizeDocId(docId);
            const unsubscribe = onSnapshot(doc(db, collectionName, safeId),
                (docSnap) => { 
                    try { callback(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null); }
                    catch (cbErr) { console.error(`[UI Error] Callback failed for ${collectionName}:`, cbErr); }
                },
                (error) => { console.warn(`Listen Error (${collectionName}):`, error?.message); }
            );
            
            // 🛡️ الإصلاح المعماري: إضافة UUID لضمان عدم تعارض المستمعات إذا طلبت مكونات مختلفة نفس المستند
            const uniqueStamp = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 9);
            return this._registerListener(`doc_${collectionName}_${safeId}_${uniqueStamp}`, unsubscribe);
        } catch (error) {
            console.error(`[DB Error] listenDoc failed setup:`, error.message);
            return () => {};
        }
    },
    
    listenQuery(collectionName, filtersArray, orderField, limitCount, callback) {
        let constraints = [];
        filtersArray.forEach(f => constraints.push(where(f[0], f[1], f[2])));
        if (orderField) constraints.push(orderBy(orderField, "desc"));
        if (limitCount) constraints.push(limit(limitCount));
        
        const q = query(collection(db, collectionName), ...constraints);
        const unsubscribe = onSnapshot(q,
            (snapshot) => { 
                try { callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))); }
                catch (cbErr) { console.error(`[UI Error] Query Callback failed for ${collectionName}:`, cbErr); }
            },
            (error) => { console.warn(`Listen Query Error (${collectionName}):`, error?.message); }
        );
        
        const filterStr = JSON.stringify(filtersArray);
        // 🛡️ الإصلاح المعماري: إضافة UUID لمنع الكتابة الفوقية (Overwrite) للمستمعات المتزامنة
        const uniqueStamp = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 9);
        const safeKey = `query_${collectionName}_${filterStr}_${orderField||'none'}_${limitCount||'all'}_${uniqueStamp}`;
        
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
                httpsCallable(functions, functionName)(payload), 
                15000, 
                `Function -> ${functionName}`, 
                false
            );
            return result.data;
        } catch (error) {
            const isSensitiveFunction = ['createOrder', 'submitBalanceRequest', 'adminAdjustBalance'].includes(functionName);
            const isTransientError = error.code === 'deadline-exceeded' || error.code === 'unavailable';
            
            if (isTransientError && retryCount > 0 && !isSensitiveFunction) {
                console.warn(`⏳ تأخير في الشبكة. إعادة محاولة [${functionName}]...`);
                await new Promise(resolve => setTimeout(resolve, 1500));
                return this.callFunction(functionName, payload, retryCount - 1); 
            }
            
            let errorMsg = error.message || 'فشل الاتصال بالخادم.';
            const sensitiveKeywords = ['رأس المال', 'الربح', 'تكلفة', 'يكسر حاجز', 'خسارة', 'السعر النهائي', 'cost', 'profit', 'margin', 'division by zero'];
            const isSensitiveError = sensitiveKeywords.some(keyword => errorMsg.includes(keyword));
            
            if (isSensitiveError) {
                errorMsg = 'عذراً، لا يمكن تنفيذ الطلب حالياً بسبب تحديثات في أسعار المزود. يرجى المحاولة لاحقاً.';
                console.warn("🛡️ [Security] تم التقاط رسالة سيرفر حساسة وإخفاؤها عن العميل بنجاح.");
            }

            const errObj = new Error(errorMsg);
            errObj.code = error.code || 'unknown';
            throw errObj;
        }
    },
    
    async uploadImage(file, folderName = 'general', customFileName = null, isAdmin = false) { 
        if (!file) return ''; 
        
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf']; 
        if (!allowedTypes.includes(file.type)) throw new Error(`نوع الملف غير مدعوم.`); 
        
        const MAX_FILE_SIZE_MB = 10; 
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) throw new Error(`حجم الملف كبير جداً. الحد الأقصى ${MAX_FILE_SIZE_MB} ميجابايت.`); 
        
        try { 
            const safeFolder = String(folderName).replace(/[\/\\]|\.\./g, '').trim() || 'general'; 
            
            // 🛡️ استخراج آمن للامتداد لمنع التحايل
            const originalExt = (file.name || '').includes('.') ? file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') : (file.type === 'application/pdf' ? 'pdf' : 'jpg'); 
            const finalExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'pdf'].includes(originalExt) ? originalExt : 'bin';

            const safeFileName = (file.name || 'file').replace(/[^\w\s\u0600-\u06FF\-_]/g, '').trim().replace(/\s+/g, '_') || 'file';
            const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Math.random().toString(36).substring(2, 9); 
            
            const safeCustomName = customFileName ? String(customFileName).replace(/[^a-zA-Z0-9\-_.]/g, '') : null; 
            const finalFileName = safeCustomName || `${Date.now()}_${uniqueId}_${safeFileName}.${finalExt}`; 
            
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
        try { 
            await deleteObject(ref(storage, url)); 
        } catch (e) {
            console.error('[Storage Error] Failed to delete image:', e.message);
        }
    },

    // ==========================================
    // 🔐 6. محرك المصادقة والأمان (Auth Engine)
    // ==========================================
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
                return { success: false, msg: 'لا يمكن تغيير كلمة المرور للحسابات المسجلة عبر منصات أخرى.' };
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

// 🛡️ تشغيل فحص الختم العالمي عند تحميل المتجر
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => FirebaseAdapter.initGlobalCacheVersioning());
    FirebaseAdapter.initGlobalCacheVersioning();
}
