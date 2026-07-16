// ============================================================================
// ☁️ محول فايربيز المركزي الموحد (core/firebaseAdapter.js) - Enterprise Version 💎
// 🎯 الوظيفة: البوابة المشتركة للمتجر للاتصال بـ Firestore & Storage & Auth & Functions
// 🌟 التحديث الأخير: تفعيل نظام App Check (reCAPTCHA v3) مع دعم وضع التطوير المحلي
// ============================================================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
// ✅ 1. استيراد App Check باحترافية
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getAuth, sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, multiFactor, TotpMultiFactorGenerator 
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

// ✅ 2. الهندسة الاحترافية: تفعيل وضع التطوير (Debug Mode) تلقائياً عند العمل محلياً
if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
        // 👈 نضع الرمز كنص ثابت لكي لا يتغير أبداً
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = "c2fe92a0-dbcb-4dd4-8cf6-9d8b542f6f91";
        console.warn("🛠️ App Check: يعمل في وضع التطوير المحلي (Debug Mode).");
    }
}
// ✅ 3. تشغيل درع الحماية (App Check)
const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6LdzvUQtAAAAAIqefitRy_PV9A9Efyb33HoicX8z'),
    isTokenAutoRefreshEnabled: true // تحديث التوكن تلقائياً في الخلفية لضمان عدم توقف عمليات العميل
});
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app); 
const functions = getFunctions(app, 'us-east1');

// تصدير appCheck مع باقي الوحدات في حال احتجنا للوصول إليه لاحقاً
export { auth, db, storage, functions, appCheck };

export const FirebaseAdapter = {
    db: db,
    storage: storage,
    functions: functions,

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
        
        return Promise.race([promise, timeoutPromise]).finally(() => {
            clearTimeout(timeoutId); 
        });
    },

    async getAll(collectionName, retryCount = 1) {
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const snapshot = await this._withTimeout(getDocs(collection(db, collectionName)), 10000, `getAll -> ${collectionName}`);
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

    async set(collectionName, docId, data, options = { merge: true }) {
        try {
            if (!collectionName || !docId) throw new Error("اسم المجموعة أو الـ ID غير معرّف!");
            const safeId = this._sanitizeDocId(docId);
            const docRef = doc(db, collectionName, safeId);
            await setDoc(docRef, data, options);
            return true;
        } catch (error) {
            console.error(`🚨 خطأ في حفظ المستند [${docId}]: ${error.message}`);
            return false;
        }
    },

    async add(collectionName, data) {
        try {
            if (!collectionName) throw new Error("اسم المجموعة غير معرّف!");
            const docRef = await addDoc(collection(db, collectionName), data);
            return docRef.id;
        } catch (error) {
            console.error(`🚨 خطأ في الإضافة للمجموعة [${collectionName}]: ${error.message}`);
            return null;
        }
    },

    async delete(collectionName, docId) {
        try {
            if (!collectionName || !docId) throw new Error("اسم المجموعة أو الـ ID غير معرّف!");
            const safeId = this._sanitizeDocId(docId);
            await deleteDoc(doc(db, collectionName, safeId));
            return true;
        } catch (error) {
            console.error(`🚨 خطأ في حذف المستند [${docId}]: ${error.message}`);
            return false;
        }
    },

    listenCollection(collectionName, callback) {
        return onSnapshot(collection(db, collectionName), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        }, (error) => {
            console.error(`🚨 خطأ في المستمع للمجموعة [${collectionName}]:`, error.message);
        });
    },

    listenDoc(collectionName, docId, callback) {
        const safeId = this._sanitizeDocId(docId);
        return onSnapshot(doc(db, collectionName, safeId), (snapshot) => {
            if (snapshot.exists()) {
                callback({ id: snapshot.id, ...snapshot.data() });
            } else {
                callback(null);
            }
        }, (error) => {
            console.error(`🚨 خطأ في المستمع للمستند [${safeId}]:`, error.message);
        });
    },

    listenQuery(collectionName, conditions, orderByField = 'time', limitCount = 30, callback) {
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
    
    async fetchMoreWithCursor(collectionName, conditions, orderByField = 'time', lastDocMarker, limitCount = 15) {
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
            
            const snapshot = await this._withTimeout(getDocs(q), 10000, `fetchMore -> ${collectionName}`);
            
            const arr = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const newLastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
            
            return { data: arr, newLastDoc: newLastDoc };
        } catch (error) {
            console.error(`🚨 خطأ في جلب الأرشيف القديم [${collectionName}]: ${error.message}`);
            return { data: [], newLastDoc: null };
        }
    },

    async uploadImage(file, folderName = 'general', customFileName = null) {
        if (!file) return '';
        try {
            const safeFolder = String(folderName).replace(/[\/\\]|\.\./g, '').trim() || 'general';

            let ext = '.jpg';
            if (file.type === 'application/pdf') ext = '.pdf';
            else if (file.type === 'image/png') ext = '.png';
            else if (file.type === 'image/webp') ext = '.webp';

            const safeFileName = file.name ? file.name.replace(/[^a-zA-Z0-9.-]/g, '_') : `upload${ext}`;
            const finalFileName = customFileName ? customFileName : `${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${safeFileName}`;
            const storageRef = ref(storage, `${safeFolder}/${finalFileName}`);
            
            const snapshot = await this._withTimeout(
                uploadBytes(storageRef, file, { contentType: file.type }),
                60000,
                "عملية رفع الصورة"
            );
            
            return await getDownloadURL(snapshot.ref);

        } catch (error) {
            console.error("🚨 خطأ في محرك التخزين السحابي:", error);
            throw new Error(error.message || 'تعذر الرفع، السيرفر لم يستجب.');
        }
    },

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

    async sendResetEmail(email) {
        try {
            await sendPasswordResetEmail(auth, email);
            return { success: true };
        } catch (error) {
            let errorMsg = 'تعذر إرسال الرابط، يرجى المحاولة لاحقاً.';
            if (error.code === 'auth/user-not-found') errorMsg = 'هذا البريد غير مسجل لدينا.';
            if (error.code === 'auth/too-many-requests') errorMsg = 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً لحماية حسابك.';
            if (error.code === 'auth/invalid-email') errorMsg = 'صيغة البريد الإلكتروني غير صحيحة.';
            return { success: false, msg: errorMsg };
        }
    },

    async changeUserPassword(currentPassword, newPassword) {
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("auth/no-user");

            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);

            await updatePassword(user, newPassword);
            return { success: true };
            
        } catch (error) {
            let errorMsg = 'تعذر تحديث كلمة المرور بسبب خطأ في الخادم.';
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') errorMsg = 'كلمة المرور الحالية غير صحيحة.';
            else if (error.code === 'auth/weak-password') errorMsg = 'كلمة المرور الجديدة ضعيفة جداً.';
            else if (error.code === 'auth/too-many-requests') errorMsg = 'محاولات خاطئة كثيرة، تم حظر الإجراء مؤقتاً.';
            else if (error.code === 'auth/network-request-failed') errorMsg = 'خطأ في الاتصال بالإنترنت.';
            return { success: false, msg: errorMsg };
        }
    },

    async generateTOTPSecret() {
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("لا يوجد مستخدم مسجل");

            const multiFactorSession = await multiFactor(user).getSession();
            const tfaSecret = await TotpMultiFactorGenerator.generateSecret(multiFactorSession);
            return { success: true, secret: tfaSecret };
        } catch (error) {
            console.error("Generate 2FA Error:", error);
            return { success: false, msg: 'تعذر توليد المفتاح الأمني. تأكد من تفعيل الميزة في لوحة التحكم.' };
        }
    },

    async enrollTOTP(tfaSecret, otpCode, displayName = "تطبيق المصدق") {
        try {
            const user = auth.currentUser;
            const assertion = TotpMultiFactorGenerator.assertionForEnrollment(tfaSecret, otpCode);
            await multiFactor(user).enroll(assertion, displayName);
            return { success: true };
        } catch (error) {
            console.error("Enroll 2FA Error:", error);
            let msg = 'تعذر تفعيل المصادقة.';
            if (error.code === 'auth/invalid-verification-code') msg = 'الكود غير صحيح أو منتهي الصلاحية.';
            return { success: false, msg: msg };
        }
    },

    async unenrollMFA() {
        try {
            const user = auth.currentUser;
            const enrolledFactors = multiFactor(user).enrolledFactors;
            
            if (enrolledFactors.length > 0) {
                await multiFactor(user).unenroll(enrolledFactors[0].uid);
            }
            return { success: true };
        } catch (error) {
            console.error("Unenroll 2FA Error:", error);
            return { success: false, msg: 'تعذر إيقاف المصادقة.' };
        }
    },

    async callFunction(functionName, payload = {}) {
        try {
            console.log(`🚀 جاري الاتصال بالسيرفر لاستدعاء [${functionName}]...`);
            const targetFunction = httpsCallable(functions, functionName);
            
            const result = await this._withTimeout(
                targetFunction(payload), 
                15000, 
                `Cloud Function -> ${functionName}`
            );
            return result.data;
        } catch (error) {
            const errorMessage = error.message || 'فشل الاتصال بالسيرفر أو انتهت المهلة.';
            const errObj = new Error(errorMessage);
            errObj.code = error.code || 'unknown'; 
            
            console.error(`🚨 خطأ في السيرفر أثناء استدعاء [${functionName}]: [${errObj.code}] ${errorMessage}`);
            throw errObj;
        }
    } 
};