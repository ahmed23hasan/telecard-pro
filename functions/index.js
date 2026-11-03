// ============================================================================
// 🧠 المحرك الرئيسي وبوابة العميل (functions/index.js) لـ TeleCard - V38.2.0 👑
// 🎯 الوظيفة: النواة المركزية، إعدادات السحابة، عمليات العميل المباشرة، والموجه الذكي (Lazy Router).
// 🚀 التحديثات المعمارية (V38.2.0 - Storage Physical Verification & Zero-Read Identity Setup):
// 1. Physical Storage Verification 📁: فحص وجود ملف الإيصال في التخزين الفعلي قبل فتح المعاملة المالية.
// 2. Deposit Read Isolation ⚡: تمرير onlyConfigs لتوفير قراءة active_pricing بالكامل في طلبات الإيداع.
// 3. Lean Identity Firewall 🧱: الاكتفاء بكاش active_configs وإلغاء قراءة settings في توثيق الهوية.
// 4. Strict QTY Limits 📦: توحيد الحد الأقصى MAX_QTY_PER_ORDER إلى 100 لتطابق كامل المنصة.
// 5. Anti-Spoofing IP Firewall 🌍: اعتماد SecurityEngine.extractClientIp في الشراء والإيداع وتوثيق الهوية.
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

// 🌐 [السيادة الجغرافية والتحكم الذكي في الموارد - يطبق على كافة المحركات]
setGlobalOptions({
    region: 'us-east1',
    memory: '256MiB',
    maxInstances: 20,
    concurrency: 5
});
const admin = require('firebase-admin');
const functions = require('firebase-functions/v1');
const { FinancialSecurityError, ...FinancialEngine } = require('./financialEngine.js');
const SecurityEngine = require('./securityEngine.js'); 
const OrderService = require('./services/OrderService.js');
const UserBuilder = require('./utils/UserBuilder.js');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const SYSTEM_LIMITS = {
    MAX_QTY_PER_ORDER: 100, // 🛡️ تم التوحيد إلى 100 بدلاً من 200
    MAX_VAULT_QTY_PER_ORDER: 100, 
    MAX_SAFE_AMOUNT: 20000, 
    MAX_URL_LENGTH: 1000,
    MAX_NOTE_LENGTH: 500
};

const sanitizeAmount = (amount) => FinancialEngine.sanitizeAmount(amount);
const checkBanStatus = (request) => {
    if (request.auth?.token?.banned === true) {
        throw new HttpsError('permission-denied', 'عذراً، هذا الحساب محظور.');
    }
};

// ==========================================
// 🛡️ 0. إنشاء الحساب التلقائي (Auth Trigger)
// ==========================================
exports.onUserAuthCreated = functions
    .region('us-east1') 
    .runWith({ failurePolicy: true })
    .auth.user().onCreate(async (user) => {
        try {
            const userRef = db.collection('telecard_users').doc(user.uid);
            const initialTierId = 'TIER_DEFAULT'; 
            
            const initialProfile = UserBuilder.buildInitialProfile({
                uid: user.uid, email: user.email, name: user.displayName, tierId: initialTierId
            });
            
            try {
                await userRef.create(initialProfile);
            } catch (writeError) {
                if (writeError.code === 6 || String(writeError.message).includes('ALREADY_EXISTS')) {
                    // 🛡️ [إصلاح دمار الحسابات - Atomic Race Condition Guard]
                    await db.runTransaction(async (transaction) => {
                        const existingSnap = await transaction.get(userRef);
                        if (!existingSnap.exists) {
                            transaction.set(userRef, initialProfile);
                            return;
                        }
                        const existingData = existingSnap.data();
                        const forceUpdateFields = {};
                        
                        for (const key in initialProfile) {
                            if (existingData[key] === undefined) {
                                forceUpdateFields[key] = initialProfile[key];
                            }
                        }
                        
                        forceUpdateFields.role = 'user';
                        if (!existingData.bannedAt && existingData.isBanned !== true) {
                            forceUpdateFields.isBanned = false;
                        }
                        
                        if (!existingData.totalDeposit && !existingData.identityCompletedAt && existingData.isVerified !== true) {
                            forceUpdateFields.walletBalance = 0;
                        }

                        if ((!existingData.tierId || existingData.tierId === 'TIER_DEFAULT') && existingData.manualTierOverride !== true) {
                            forceUpdateFields.tierId = initialTierId;
                            forceUpdateFields.cycleStartTierId = initialTierId;
                            if (!existingData.totalSpent) {
                                forceUpdateFields.tierClimbs = [];
                            }
                        }                   
                        if (Object.keys(forceUpdateFields).length > 0) {
                            transaction.set(userRef, forceUpdateFields, { merge: true });
                        }
                    });
                } else { 
                    throw writeError; 
                }
            }
        } catch (error) { 
            console.error("Auth Trigger Error:", error); 
            throw error;
        }
    });

// ==========================================
// 🛒 1. إنشاء الطلبات للعملاء (Storefront Order Creation)
// ==========================================
exports.createOrder = onCall({ memory: '512MiB', timeoutSeconds: 120, enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    checkBanStatus(request);
    // 🚀 [إصلاح أمني]: التقاط الـ IP الحقيقي للعميل عبر المحرك المركزي المقاوم للتزوير
    const clientIp = SecurityEngine.extractClientIp(request);
    return await OrderService.processNewOrder(request.auth.uid, request.data, db, request.auth.token, { isApi: false, clientIp });
});

// ==========================================
// 💰 2. إرسال طلبات الإيداع للعملاء (Deposit Submission)
// ==========================================
exports.submitBalanceRequest = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    checkBanStatus(request);

    const uid = request.auth.uid;
    const data = request.data || {};
    const amount = Number(data.amount);
    const paymentMethodName = String(data.paymentMethodName || '').trim();
    const payCurr = String(data.payCurr || 'USD').toUpperCase();
    
    if (data.idempotencyKey && String(data.idempotencyKey).length > 200) throw new HttpsError('invalid-argument', 'المفتاح طويل جداً.');
    const idempotencyKey = data.idempotencyKey ? String(data.idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50) : null;
    
    if (isNaN(amount) || amount <= 0) throw new HttpsError('out-of-range', 'المبلغ المدخل غير صالح.');
    const receiptUrl = data.receiptUrl ? String(data.receiptUrl).trim() : null;
    if (!receiptUrl) throw new HttpsError('invalid-argument', 'يرجى إرفاق صورة إيصال الدفع.');
    let cleanReceiptPath = null;

    if (receiptUrl.length > SYSTEM_LIMITS.MAX_URL_LENGTH) throw new HttpsError('invalid-argument', 'الرابط طويل جداً.');
    if (!receiptUrl.startsWith('https://firebasestorage.googleapis.com/')) throw new HttpsError('invalid-argument', 'رابط الإيصال غير صالح.');
    const expectedBucket = admin.storage().bucket().name;
    try {
        const parsedReceiptUrl = new URL(receiptUrl);
        if (
            !expectedBucket ||
            parsedReceiptUrl.origin !== 'https://firebasestorage.googleapis.com' ||
            !parsedReceiptUrl.pathname.startsWith(`/v0/b/${expectedBucket}/o/`)
        ) {
            throw new HttpsError('permission-denied', 'رابط الإيصال لا ينتمي لخوادم المتجر.');
        }
        const pathParts = parsedReceiptUrl.pathname.split('/o/');
        if (pathParts.length < 2) throw new Error('Invalid Storage Path');
        cleanReceiptPath = decodeURIComponent(pathParts[1].split('?')[0]);
    } catch (e) {
        if (e instanceof HttpsError) throw e;
        throw new HttpsError('invalid-argument', 'صيغة رابط الإيصال غير صالحة.');
    }

    if (!cleanReceiptPath || !cleanReceiptPath.startsWith(`receipts/${uid}_`)) {
    throw new HttpsError('permission-denied', 'إيصال الدفع لا يخص هذا الحساب.');
}

try {
    const [receiptMeta] = await admin.storage().bucket().file(cleanReceiptPath).getMetadata();
    if (!receiptMeta || Number(receiptMeta.size || 0) <= 0) {
        throw new HttpsError('invalid-argument', 'ملف إيصال الدفع فارغ أو تالف.');
    }
} catch (storageErr) {
    if (storageErr instanceof HttpsError) throw storageErr;
    throw new HttpsError('not-found', 'ملف إيصال الدفع غير موجود على الخادم، يرجى إعادة رفع الإيصال.');
}

let idempotencyRef = null;
if (idempotencyKey) idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
    try {
        return await db.runTransaction(async (transaction) => {
            const serverNow = admin.firestore.Timestamp.now().toMillis();
            
            if (idempotencyRef) {
                const idempSnap = await transaction.get(idempotencyRef);
                if (idempSnap.exists) throw new HttpsError('already-exists', 'تم إرسال الطلب مسبقاً.');
            }

            if (cleanReceiptPath) {
                const [dupByPathSnap, dupByUrlSnap, pendingDepsSnap] = await Promise.all([
                    transaction.get(db.collection('telecard_deposits').where('receiptPath', '==', cleanReceiptPath).limit(1)),
                    transaction.get(db.collection('telecard_deposits').where('receipt', '==', receiptUrl).limit(1)),
                    transaction.get(db.collection('telecard_deposits').where('userId', '==', uid).where('status', '==', 'pending').limit(3))
                ]);
                if (!dupByPathSnap.empty || !dupByUrlSnap.empty) {
                    throw new HttpsError('already-exists', 'تم إرسال هذا الإيصال مسبقاً.');
                }
                if (pendingDepsSnap.size >= 3) {
                    throw new HttpsError('resource-exhausted', 'لديك 3 طلبات إيداع قيد المراجعة حالياً. يرجى انتظار معالجتها أولاً.');
                }
            }

            const userRef = db.collection('telecard_users').doc(uid);
            const userSnap = await transaction.get(userRef);
            
            let userData = userSnap.exists ? userSnap.data() : UserBuilder.buildInitialProfile({
                uid: uid, email: request.auth.token.email || '', name: request.auth.token.name || 'عميل جديد'
            });

            if (userData.lastDepositReqTime && serverNow - userData.lastDepositReqTime < 60000) {
                throw new HttpsError('resource-exhausted', 'يرجى الانتظار دقيقة على الأقل.');
            }

            // 🚀 [الجدار الناري وأمان السيرفر]: قراءة إعدادات النظام بـ 0 قراءات إضافية عبر دمجها في active_configs
            const settingsRef = db.collection('telecard_settings').doc('singleton');
            const sysRef = db.collection('telecard_system').doc('singleton');
            const [settingsSnap, sysSnap] = await Promise.all([
                transaction.get(settingsRef),
                transaction.get(sysRef)
            ]);

            // 🛡️ [تعديل 2]: تمرير onlyConfigs لتوفير قراءة active_pricing بالكامل في طلبات الإيداع
            const { ratesData, paymentsData, bannedIps: cachedBannedIps, bannedDevices: cachedBannedDevices } = await FinancialEngine.fetchSystemData(transaction, db, { onlyConfigs: true });

            const sysState = sysSnap.exists ? sysSnap.data() : {};
            if (sysState.maint === true) throw new HttpsError('unavailable', sysState.msg || 'المتجر في وضع الصيانة حالياً.');
            if (sysState.freeze === true) throw new HttpsError('failed-precondition', sysState.freezeMsg || 'العمليات المالية مجمدة مؤقتاً.');

            const globalSettings = settingsSnap.exists ? settingsSnap.data() : {};
            const clientIp = SecurityEngine.extractClientIp(request);
            const effectiveIp = clientIp || userData.lastIp || '';
            const bannedIps = cachedBannedIps?.length > 0 ? cachedBannedIps : (Array.isArray(globalSettings.bannedIps) ? globalSettings.bannedIps : []);
            const bannedDevices = cachedBannedDevices?.length > 0 ? cachedBannedDevices : (Array.isArray(globalSettings.bannedDevices) ? globalSettings.bannedDevices : []);
            const userDevices = Array.isArray(userData.devicePrints) ? userData.devicePrints : [];

            if (
                userData.isBanned === true ||
                userData.isIpBanned === true ||
                userData.isRestricted === true ||
                (effectiveIp && bannedIps.includes(effectiveIp)) ||
                userDevices.some(dev => bannedDevices.includes(dev))
            ) {
                throw new HttpsError('permission-denied', 'العملية مرفوضة: الحساب مقيد أو محظور.');
            }

            if (userData.isVerified !== true) throw new HttpsError('failed-precondition', 'يجب استكمال إعداد حسابك أولاً.');

            // 🚀 [فرض الـ KYC]: فحص حالة التوثيق الإلزامية قبل قبول الإيداع
            const kycConfig = globalSettings.kycConfig || { mode: 'off', targetedTiers: [] };
            const userTierIdStr = String(userData.tierId || 'TIER_DEFAULT');
            const isKycRequired = kycConfig.mode === 'all' ||
                ((kycConfig.mode === 'specific' || kycConfig.mode === 'spec') &&
                 Array.isArray(kycConfig.targetedTiers) &&
                 kycConfig.targetedTiers.map(String).includes(userTierIdStr));

            if (isKycRequired && userData.kycStatus !== 'approved' && userData.kycStatus !== 'verified') {
                throw new HttpsError('failed-precondition', 'يرجى توثيق هويتك (KYC) أولاً لإتمام عملية الإيداع.');
            }

            const paymentMethod = paymentsData.find(p => p.name === paymentMethodName && p.isActive !== false);
            if (!paymentMethod) throw new HttpsError('not-found', 'طريقة الدفع غير متوفرة أو معطلة حالياً.');
            
            const targetWalletCurrency = String(userData.baseCurrency || 'USD').toUpperCase();
            
            const depositValidation = FinancialEngine.calculateDepositFee(amount, paymentMethod, payCurr, targetWalletCurrency, ratesData, globalSettings);
            if (!depositValidation.isValid) throw new HttpsError('out-of-range', depositValidation.msg);
            
            const safeNetLocal = depositValidation.netBase; 
            const netPayCurrTemp = depositValidation.netPayCurr;
            const calculatedFeeAmount = depositValidation.feeAmount;
            
            let fxRateUsed = 1;
            let safeNetBaseUsd = payCurr === 'USD'
                ? sanitizeAmount(netPayCurrTemp)
                : FinancialEngine.convertViaUSDHelper(netPayCurrTemp, payCurr, 'USD', ratesData, 'round', 'deposit');

            if (payCurr !== targetWalletCurrency && netPayCurrTemp > 0) fxRateUsed = FinancialEngine.safeDiv(safeNetLocal, netPayCurrTemp);

            const cleanId = SecurityEngine.generateUniqueId(); 

            // 🚀 [حفظ البصمة]: تحديث بيانات العميل مع الـ IP الحقيقي للإيداع
            if (userSnap.exists) {
                transaction.update(userRef, { 
                    lastDepositReqTime: serverNow,
                    ...(clientIp && { lastIp: clientIp })
                });
            } else {
                transaction.set(userRef, { 
                    ...userData, 
                    lastDepositReqTime: serverNow,
                    ...(clientIp && { lastIp: clientIp })
                });
            }
            
            transaction.set(db.collection('telecard_deposits').doc(cleanId), {
                id: cleanId, displayId: cleanId, userId: uid, method: paymentMethodName, amount, currency: payCurr, 
                creditedAmount: sanitizeAmount(safeNetLocal), creditedBaseUsd: sanitizeAmount(safeNetBaseUsd), 
                feeAmount: sanitizeAmount(calculatedFeeAmount),
                feePct: depositValidation.feePct, feeType: depositValidation.feeType, feeUnit: depositValidation.feeUnit,
                targetCurrency: targetWalletCurrency, fxRate: fxRateUsed, status: 'pending', 
                time: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp(), 
                receipt: receiptUrl,
                receiptPath: cleanReceiptPath,
                userDataSnapshot: { fullName: userData.fullName || '', email: userData.email || '', phone: userData.phone || '' }
            });

            if (idempotencyRef) {
                transaction.set(idempotencyRef, { 
                    createdAt: admin.firestore.FieldValue.serverTimestamp(), 
                    expiresAt: admin.firestore.Timestamp.fromDate(new Date(serverNow + 48 * 60 * 60 * 1000)), 
                    depositId: cleanId 
                });
            }

            if (cleanReceiptPath) {
                const uploadedFileName = cleanReceiptPath.split('/').pop();
                if (uploadedFileName) {
                    transaction.delete(db.collection('telecard_pending_uploads').doc(uploadedFileName));
                }
            }
            
            return { success: true, message: 'تم إرسال طلب الإيداع بنجاح' };
        });
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        if (error instanceof FinancialSecurityError) {
            throw new HttpsError('failed-precondition', error.message.replace(/\[SECURITY\]\s*/g, ''));
        }
        throw new HttpsError('internal', 'تعذر إرسال الطلب في الوقت الحالي.');
    }
});

// ==========================================
// 🪪 3. استكمال بيانات الحساب والعملة للعميل (KYC Identity Setup)
// ==========================================
exports.completeUserIdentity = onCall({ enforceAppCheck: false }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
    checkBanStatus(request);
    
    const uid = request.auth.uid;
    const { country, phone, currency } = request.data || {};
    const safeCountry = SecurityEngine.sanitizeText(String(country || ''), 100);
    const cleanCurrency = SecurityEngine.sanitizeText(String(currency || ''), 10).toUpperCase();
    
    // 🛡️ توحيد صارم لرقم الهاتف (إزالة المسافات والـ + والـ 00 البادئة ثم اعتماد صيغة + القياسية)
    const rawPhoneDigits = String(phone || '').trim().replace(/[\s()-]/g, '').replace(/^(\+|00)/, '');
    if (!/^[1-9][0-9]{6,14}$/.test(rawPhoneDigits)) {
        throw new HttpsError('invalid-argument', 'رقم الهاتف غير صالح.');
    }
    const safePhone = `+${rawPhoneDigits}`;
    
    const clientIp = SecurityEngine.extractClientIp(request);
    let duplicateIpUser = null;

    try {
        const txResult = await db.runTransaction(async (transaction) => {
            const userRef = db.collection('telecard_users').doc(uid);
const configCacheRef = db.collection('telecard_system').doc('active_configs');
const settingsRef = db.collection('telecard_settings').doc('singleton');
const phoneQuery = db.collection('telecard_users').where('phone', '==', safePhone).limit(2);
const ipQuery = clientIp ? db.collection('telecard_users').where('lastIp', '==', clientIp).limit(3) : null;

const [userSnap, configCache, settingsSnap, phoneDupSnap, ipDupSnap] = await Promise.all([
    transaction.get(userRef),
    transaction.get(configCacheRef),
    transaction.get(settingsRef),
    transaction.get(phoneQuery),
    ipQuery ? transaction.get(ipQuery) : Promise.resolve(null)
]);

// 🛡️ 1. فحص الجدار الناري المعزول في active_configs لمنع التسجيل من IP محظور (بـ 0 قراءات إضافية)
const globalSettings = settingsSnap.exists ? settingsSnap.data() : {};
const configData = configCache.exists ? configCache.data() : {};
const bannedIps = Array.isArray(configData.bannedIps) ? configData.bannedIps : (Array.isArray(globalSettings.bannedIps) ? globalSettings.bannedIps : []);
const bannedDevices = Array.isArray(configData.bannedDevices) ? configData.bannedDevices : (Array.isArray(globalSettings.bannedDevices) ? globalSettings.bannedDevices : []);            const existingDevices = userSnap.exists && Array.isArray(userSnap.data().devicePrints) ? userSnap.data().devicePrints : [];

            if (
                (clientIp && bannedIps.includes(clientIp)) ||
                existingDevices.some(dev => bannedDevices.includes(dev)) ||
                (userSnap.exists && (userSnap.data().isBanned === true || userSnap.data().isIpBanned === true || userSnap.data().isRestricted === true))
            ) {
                throw new HttpsError('permission-denied', 'العملية مرفوضة: الحساب أو الشبكة محظورة أمنياً.');
            }
            
            let isValidCurr = cleanCurrency === 'USD';
            if (!isValidCurr) {
                if (configCache.exists && configData.rates) {
                    isValidCurr = configData.rates.some(r => r.code === cleanCurrency);
                } else {
                    const ratesSnap = await transaction.get(db.collection('telecard_rates'));
                    isValidCurr = ratesSnap.docs.some(d => d.data().code === cleanCurrency);
                }
            }
            if (!isValidCurr) throw new HttpsError('invalid-argument', 'العملة المدخلة غير مدعومة في النظام.');
            
            const hasActiveDuplicatePhone = !phoneDupSnap.empty && phoneDupSnap.docs.some(d => d.id !== uid && d.data().isDeleted !== true);
            if (hasActiveDuplicatePhone) {
                throw new HttpsError('already-exists', 'رقم الهاتف المدخل مرتبط بحساب آخر مسبقاً.');
            }

            let userData = userSnap.exists ? userSnap.data() : UserBuilder.buildInitialProfile({ 
                uid: uid, email: request.auth.token.email, name: request.auth.token.name
            });
            
            if (
                userData.isVerified === true || 
                Boolean(userData.identityCompletedAt) || 
                Number(userData.walletBalance || 0) > 0 || 
                Number(userData.totalDeposit || 0) > 0
            ) {
                throw new HttpsError('permission-denied', 'تم إعداد المحفظة والعملة مسبقاً ولا يمكن تغييرها.');
            }

            // 🕵️ 2. رصد تعدد الحسابات من نفس الـ IP لإشعار جرس الإدارة
            if (ipDupSnap && !ipDupSnap.empty) {
                const otherDoc = ipDupSnap.docs.find(d => d.id !== uid && d.data().isDeleted !== true);
                if (otherDoc) {
                    const od = otherDoc.data();
                    duplicateIpUser = {
                        otherId: otherDoc.id,
                        otherName: od.fullName || od.username || otherDoc.id.substring(0, 8),
                        isOtherBanned: Boolean(od.isBanned || od.isIpBanned || od.isRestricted),
                        newName: userData.fullName || request.auth.token.name || uid.substring(0, 8)
                    };
                }
            }

            const payload = { 
                country: safeCountry, 
                phone: safePhone, 
                baseCurrency: cleanCurrency, 
                isVerified: true, 
                ...(clientIp && { lastIp: clientIp }),
                identityCompletedAt: admin.firestore.FieldValue.serverTimestamp() 
            };

            if (userSnap.exists) transaction.update(userRef, payload);
            else transaction.set(userRef, { ...userData, ...payload });
            
            return { success: true, lockedCurrency: cleanCurrency };
        });

        // 🔔 3. إرسال تنبيه أمني لجرس الإدارة إذا تم اكتشاف تعدد حسابات بنفس الـ IP
        if (duplicateIpUser) {
            const alertTitle = duplicateIpUser.isOtherBanned
                ? '🚨 محاولة التفاف على الحظر (حساب جديد بنفس الـ IP)!'
                : '🕵️ رادار الحسابات: تسجيل حساب متعدد من نفس الـ IP';
            const alertBody = `العميل الجديد (${duplicateIpUser.newName}) أكمل التسجيل من نفس شبكة الـ IP (${clientIp}) المرتبطة بالحساب ${duplicateIpUser.isOtherBanned ? 'المحظور ' : ''}(${duplicateIpUser.otherName}).`;
            await SecurityEngine.sendFCMToAdmin(db, admin, 'system_alerts', alertTitle, alertBody, {
                action: 'MULTI_ACCOUNT_IP_DETECTED',
                target: 'users',
                userId: uid
            }).catch(() => {});
        }

        return txResult;
    } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('internal', error.message); }
});

// ==========================================
// ⏱️ 4. جلب توقيت السيرفر المركزي
// ==========================================
exports.getServerTime = onCall({ enforceAppCheck: false }, async (request) => {
    const serverTime = admin.firestore.Timestamp.now().toMillis();
    const rawCode = request.data?.couponCode ? String(request.data.couponCode).trim().toUpperCase() : '';
    
    if (rawCode && request.auth) {
        try {
            const snap = await db.collection('telecard_coupons')
                .where('code', '==', rawCode)
                .where('isActive', '==', true)
                .limit(1)
                .get();
            
            if (!snap.empty) {
                const cpDoc = snap.docs[0];
                const cp = cpDoc.data();
                const uid = String(request.auth.uid);
                return {
                    success: true,
                    serverTime,
                    coupon: {
                        id: cpDoc.id,
                        code: cp.code,
                        type: cp.type,
                        value: cp.value,
                        maxDiscount: cp.maxDiscount || null,
                        minOrder: cp.minOrder || 0,
                        maxUses: cp.maxUses || 0,
                        maxPerUser: cp.maxPerUser || 0,
                        usedCount: cp.usedCount || 0,
                        startDate: cp.startDate || null,
                        expiryDate: cp.expiryDate || null,
                        targetProds: Array.isArray(cp.targetProds) ? cp.targetProds : [],
                        targetCategories: Array.isArray(cp.targetCategories) ? cp.targetCategories : [],
                        targetTiers: Array.isArray(cp.targetTiers) ? cp.targetTiers : [],
                        allowedUsers: Array.isArray(cp.allowedUsers) && cp.allowedUsers.length > 0 ?
                            (cp.allowedUsers.map(String).includes(uid) ? [uid] : ['__RESTRICTED__']) :
                            [],
                        isActive: Boolean(cp.isActive)
                    }
                };
            }
        } catch (e) {}
        return { success: true, serverTime, coupon: null };
    }
    
    return { success: true, serverTime };
});

// ==========================================
// 🔌 5. الموجه الذكي للمحركات الفرعية (Zero-Overhead Lazy Router)
// يقوم بتحميل كل محرك عند استدعائه فقط لتسريع الـ Cold Start وحماية أسماء الدوال 100%
// ==========================================
const bindLazyExports = (modulePath, exportNames) => {
    exportNames.forEach((fnName) => {
        Object.defineProperty(exports, fnName, {
            enumerable: true,
            get: () => require(modulePath)[fnName]
        });
    });
};

// 👑 أولاً: محرك الإدارة والـ BI والتدقيق المالي (18 دالة)
bindLazyExports('./adminEngine.js', [
    'adminUpdateUserTier',
    'adminProcessOrder',
    'adminBulkRejectOrders',
    'adminProcessDeposit',
    'adminAdjustBalance',
    'grantAdminRole',
    'adminDeleteTier',
    'adminGetWalletsLiquidity',
    'adminGetSalesBI',
    'adminGetDashboardStats',
    'adminGetOrdersList',
    'dailyStoreMaintenance', // 🆓 المهمة المجدولة المجانية (1 من 3) - الصيانة الليلية الشاملة للمتجر
    'adminToggleUserBan',
    'adminDeleteUserData',
    'adminGetDepositsList',
    'adminAuditUserWallet',
    'adminGetUsersList',
    'adminGetLogsList',
    'adminUpdateUserProfile'
]);

// ⚡ ثانياً: محرك الكتالوج والخزنة والتريجرات الذكية والتخزين (20 دالة)
bindLazyExports('./triggersEngine.js', [
    'aggregateDailyStats',
    'adminSaveVaultCodes',
    'trackNewStorageUploads',
    'onSettingsUpdate',
    'onRateUpdate',
    'onPaymentUpdate',
    'onOfferUpdate',
    'onCouponUpdate',
    'onTierUpdate',
    'secureProductSync',
    'onProductDeletedCleanup',
    'onCategoryDeletedCleanup',
    'autoNotifyOrderStatus',
    'autoNotifyDepositStatus',
    'autoNotifyVaultStatus',
    'autoNotifyComplaints',
    'onKycStatusChange',
    'adminForceSyncPricing',
    'adminForceSyncCatalog',
    'adminDeleteVaultPool'
]);

// 🌐 ثالثاً: محرك بوابة التجار والـ Webhooks (3 دوال)
bindLazyExports('./developerApi.js', [
    'orderStatusWebhook',
    'cronRetryWebhooks', // 🆓 المهمة المجدولة المجانية (2 من 3)
    'externalCreateOrder'
]);

// 🔗 رابعاً: محرك الموردين المباشر والمزامنة الانتقائية (8 دوال)
bindLazyExports('./supplierEngine.js', [
    'syncSupplierData',
    'scheduledSupplierSync', // 🆓 المهمة المجدولة المجانية (3 من 3) - تشمل فحص الطلبات المعلقة ومزامنة الأسعار
    'secureSaveSupplier',
    'onSupplierSyncWorker',
    'adminFetchSupplierCatalog',
    'adminGetSupplierBalance',
    'adminDeleteSupplier',
    'supplierOrderWebhook'
]);
