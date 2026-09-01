// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة الماسية V10.2.0 💎
// 🎯 الوظيفة: استيراد المنتجات، وبناء الجداول المركزية بأمان تام.
// 🚀 التحديثات المعمارية:
// 1. Fallback Pricing: تأمين حساب الأرباح في حال غياب الكاش.
// 2. Strict Circuit Breaker: تجميد المنتجات ذات التكلفة الصفرية لحماية الأرباح.
// 3. Batch Safe-Lock: تأمين الـ commitAndReset لمنع تداخل عمليات الدفعات.
// 4. Hash Sync: ضمان توافق توليد أسعار المورد مع نظام الخزنة في index.js.
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const crypto = require('crypto'); 
const FinancialEngine = require('./financialEngine.js'); 

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ==========================================
// 🛡️ دوال المساعدة والأمان
// ==========================================
const generateCodeHash = (codeString) => crypto.createHash('sha256').update(String(codeString).trim()).digest('hex');
const isMasterAdmin = (request) => request.auth?.token?.admin === true;

const logAdminAction = async (adminUid, action, details) => {
    try { await db.collection('telecard_audit_logs').add({ adminUid, action, details, timestamp: admin.firestore.FieldValue.serverTimestamp() }); } 
    catch (e) {}
};

const logCloudError = async (action, error, supplierId = 'system') => {
    console.error(`🚨 [${action}] Supplier: ${supplierId}`, error);
    try { await db.collection('telecard_system_errors').add({ action, supplierId, errorMsg: error.message, time: admin.firestore.FieldValue.serverTimestamp() }); } 
    catch(e) {}
};

const fetchWithTimeout = async (url, options, timeout = 15000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') throw new Error(`Timeout: لم يستجب سيرفر المورد.`);
        throw error;
    }
};

// ==========================================
// 🔌 محولات المنصات (Provider Adapters)
// ==========================================
const ProviderAdapters = {
    salla: async (baseUrl, token) => { return []; }, 
    zid: async (baseUrl, token) => { return []; },   
    
    standard_api: async (baseUrl, token) => {
        const cleanUrl = baseUrl.trim(); 
        
        const response = await fetchWithTimeout(cleanUrl, { 
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`, 
                'x-api-key': token,                 
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            } 
        }, 15000);
        
        if (!response.ok) throw new Error(`API Error: فشل الاتصال بالمورد (كود الخطأ: ${response.status})`);
        
        let data;
        try { data = await response.json(); } catch (e) { throw new Error('استجابة المورد ليست بصيغة JSON صحيحة.'); }
        
        const rawProducts = data.data || data.products || data;
        if (!Array.isArray(rawProducts)) throw new Error('البيانات المستلمة من المورد لا تحتوي على قائمة منتجات.');

        return rawProducts.map(item => ({ 
            externalId: String(item.id || item.prodId || item.product_id || ''), 
            name: String(item.name || item.product || item.title || 'منتج بدون اسم'), 
            cost: FinancialEngine.extractNum(item.price || item.cost || item.wholesale_price), 
            stock: FinancialEngine.extractNum(item.qty || item.stock || item.quantity), 
            codes: Array.isArray(item.codes) ? item.codes : (Array.isArray(item.vaultCodes) ? item.vaultCodes : []) 
        }));
    }
};

// ==========================================
// 🧠 النواة المركزية للمزامنة (Core Sync Engine) 
// ==========================================
const coreSyncLogic = async (supplierId) => {
    const suppRef = db.collection('telecard_suppliers').doc(String(supplierId));
    
    const supplier = await db.runTransaction(async (transaction) => {
        const suppSnap = await transaction.get(suppRef);
        if (!suppSnap.exists) throw new Error('المورد غير موجود.');
        const suppData = suppSnap.data();
        
        const isStaleLock = suppData.isSyncing && suppData.lastSyncAttempt && (Date.now() - suppData.lastSyncAttempt.toMillis()) > 15 * 60 * 1000;
        if (suppData.isSyncing && !isStaleLock) throw new Error('توجد عملية مزامنة قيد التنفيذ حالياً.');
        if (!suppData.isActive) throw new Error('المورد معطل حالياً.');
        
        transaction.update(suppRef, { isSyncing: true, lastSyncAttempt: admin.firestore.FieldValue.serverTimestamp() });
        return suppData;
    });
    
    try {
        const secretSnap = await suppRef.collection('secrets').doc('api').get();
        const token = secretSnap.exists ? secretSnap.data().token : null;
        if (!token) throw new Error('لا يوجد مفتاح ربط سري.');
        
        const fetchAdapter = ProviderAdapters[supplier.type];
        if (!fetchAdapter) throw new Error('نوع المورد غير مدعوم.');
        
        const normalizedProducts = await fetchAdapter(supplier.baseUrl, token);
        if (!normalizedProducts || normalizedProducts.length === 0) throw new Error('API المورد أرجع قائمة فارغة.');

        const [existingProdsSnap, pricingCacheSnap] = await Promise.all([
            db.collection('telecard_prods').where('supplierId', '==', supplierId).get(),
            db.collection('telecard_system').doc('active_pricing').get()
        ]);
        
        const existingProdsMap = new Map();
        existingProdsSnap.forEach(doc => existingProdsMap.set(doc.id, doc.data()));

        // 🚀 Fallback لتأمين جلب المستويات لو كان الكاش مفقوداً
        let systemTiers = [];
        if (pricingCacheSnap.exists && Array.isArray(pricingCacheSnap.data().tiers)) {
            systemTiers = pricingCacheSnap.data().tiers;
        } else {
            const tiersSnap = await db.collection('telecard_tiers').get();
            systemTiers = tiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        const syncSessionId = Date.now();
        const defaultMargin = FinancialEngine.extractNum(supplier.defaultMargin || 0);
        
        let currentBatch = db.batch();
        let operationCount = 0;
        let importedCount = 0;
        let revokedCount = 0;
        
        const commitAndReset = async () => {
            if (operationCount > 0) { 
                await currentBatch.commit(); 
                currentBatch = db.batch(); 
                operationCount = 0; 
                // إعطاء فرصة للنظام لالتقاط الأنفاس ومنع التداخل
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        };

        for (const prod of normalizedProducts) {
            if (!prod.externalId || String(prod.externalId).trim() === '') continue; 
            const rawName = String(prod.name || '').trim();
            if (!rawName) continue;

            const safeId = `ext_${supplierId}_${prod.externalId}`;
            const vaultId = `vault_${safeId}`;
            const existingData = existingProdsMap.get(safeId);
            
            let rawCost = FinancialEngine.extractNum(prod.cost);
            let isFreezeRequired = false;

            // 🛑 قاطع الدائرة المتقدم (Strict Circuit Breaker)
            if (rawCost === 0 || (existingData && existingData.costPrice && rawCost < (existingData.costPrice * 0.2))) {
                console.warn(`[CIRCUIT BREAKER] سعر غير منطقي أو صفري للمنتج ${safeId}. تم تجميد المنتج.`);
                rawCost = existingData ? FinancialEngine.extractNum(existingData.costPrice) : 0;
                isFreezeRequired = true; // تعليق المنتج لحمايته
            }
            rawCost = Math.min(rawCost, FinancialEngine.CONFIG.MAX_PRICE_LIMIT);

            const profitAdded = FinancialEngine.safeMul(rawCost, FinancialEngine.safeDiv(defaultMargin, 100));
            let calculatedFinalPrice = Math.min(FinancialEngine.safeAdd(rawCost, profitAdded), FinancialEngine.CONFIG.MAX_PRICE_LIMIT);
            
            const isFixed = existingData ? (String(existingData.isFixedPrice).toLowerCase() === 'true') : false;
            let finalPrice = isFixed ? FinancialEngine.extractNum(existingData.price) : calculatedFinalPrice;

            let tierPrices = {};
            if (!isFixed && systemTiers.length > 0) {
                systemTiers.forEach(tier => {
                    const profitPercent = FinancialEngine.extractNum(tier.profitPercent || tier.profit_percent);
                    const minProfitUsd = FinancialEngine.extractNum(tier.minProfitUsd || tier.min_profit_usd);
                    let pAdded = FinancialEngine.safeMul(rawCost, FinancialEngine.safeDiv(profitPercent, 100));
                    tierPrices[tier.id] = FinancialEngine.safeAdd(rawCost, Math.max(pAdded, minProfitUsd));
                });
            }

            const safeCodesArray = Array.isArray(prod.codes) ? prod.codes.slice(0, 5000) : [];
            const cleanCodes = [...new Set(safeCodesArray.map(c => (typeof c === 'object' ? (c.text || c.code || '') : String(c)).replace(/\s+/g, '')).filter(c => c !== ''))];
            
            let inMemoryStockCount = FinancialEngine.extractNum(prod.stock); 
            
            if (cleanCodes.length > 0) {
                const vaultRef = db.collection('telecard_vault').doc(vaultId);
                const keysCollectionRef = vaultRef.collection('keys');
                
                const allExistingKeysSnap = await keysCollectionRef.select('isSold').get();
                const keysMap = new Map();
                allExistingKeysSnap.docs.forEach(doc => keysMap.set(doc.id, doc.data().isSold));

                let actualAvailableCodesCount = 0; 

                for (const code of cleanCodes) {
                    const hash = generateCodeHash(code);
                    const docId = `key_${hash}`; // 🚀 توحيد Hash الأكواد

                    if (keysMap.has(docId)) {
                        const isAlreadySold = keysMap.get(docId);
                        currentBatch.update(keysCollectionRef.doc(docId), { syncSessionId: syncSessionId });
                        if (!isAlreadySold) actualAvailableCodesCount++;
                        keysMap.delete(docId); 
                    } else {
                        currentBatch.set(keysCollectionRef.doc(docId), {
                            codeText: code, isSold: false, supplierId: supplierId,
                            syncSessionId: syncSessionId, importedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        actualAvailableCodesCount++;
                    }
                    operationCount++;
                    if (operationCount >= 400) await commitAndReset(); 
                }

                for (const [docId, isSold] of keysMap.entries()) {
                    if (isSold === false) {
                        currentBatch.update(keysCollectionRef.doc(docId), { isSold: true, isRevoked: true, syncNote: 'تم سحبه من المورد' });
                        operationCount++; revokedCount++;
                        if (operationCount >= 400) await commitAndReset(); 
                    }
                }

                inMemoryStockCount = actualAvailableCodesCount; 

                currentBatch.set(vaultRef, {
                    id: vaultId, supplierId: supplierId, name: `أكواد: ${rawName}`,
                    stockCount: inMemoryStockCount, lastSync: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                
                operationCount++;
                if (operationCount >= 400) await commitAndReset(); 
            }

            // إذا فُعّل قاطع الدائرة، يتم جعل المتوفر = 0 
            const hasStock = isFreezeRequired ? false : (inMemoryStockCount > 0);
            const statusNote = isFreezeRequired ? 'مجمد آلياً بسبب خطأ بالتسعير' : '';

            const prodRef = db.collection('telecard_prods').doc(safeId);
            currentBatch.set(prodRef, {
                id: safeId, name: rawName, costPrice: rawCost, price: finalPrice, 
                tierPrices: Object.keys(tierPrices).length > 0 ? tierPrices : null, 
                supplierId: supplierId, vaultPoolId: cleanCodes.length > 0 ? vaultId : null, 
                isExternal: true, isAvailable: hasStock, syncNote: statusNote,
                syncSessionId: syncSessionId, lastSync: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            operationCount++; importedCount++;
            if (operationCount >= 400) await commitAndReset(); 
        }
        
        let deletedCount = 0;
        const staleProdsSnap = await db.collection('telecard_prods')
            .where('supplierId', '==', supplierId)
            .where('isAvailable', '==', true)
            .where('syncSessionId', '<', syncSessionId).get();

        for (const doc of staleProdsSnap.docs) {
            currentBatch.update(doc.ref, { isAvailable: false, syncNote: 'محذوف من المورد' });
            operationCount++; deletedCount++;
            if (operationCount >= 400) await commitAndReset();
        }
        
        await commitAndReset(); 

        await suppRef.update({ lastSync: admin.firestore.FieldValue.serverTimestamp(), importedCount: importedCount });
        return { importedCount, deletedCount, revokedCount };

    } catch (error) {
        await logCloudError('SUPPLIER_SYNC_LOGIC_ERROR', error, supplierId);
        throw error;
    } finally {
        await suppRef.update({ isSyncing: false }).catch(() => {});
    }
};

// ==========================================
// 🚀 1. المزامنة اليدوية (من لوحة الإدارة)
// ==========================================
exports.syncSupplierData = onCall({ memory: '1GiB', timeoutSeconds: 540, enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try {
        const result = await coreSyncLogic(request.data.supplierId);
        await logAdminAction(request.auth.uid, 'MANUAL_SYNC_SUPPLIER', `مزامنة ${request.data.supplierId}`);
        return { success: true, message: `تمت مزامنة ${result.importedCount} منتج. تعطيل ${result.deletedCount}. سحب ${result.revokedCount} كود.`, ...result };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

// ==========================================
// ⏱️ 2. المزامنة التلقائية (Cron Job) 
// ==========================================
exports.scheduledSupplierSync = onSchedule({ 
    schedule: '0 */12 * * *', 
    timeZone: 'Asia/Riyadh', 
    memory: '1GiB', 
    timeoutSeconds: 540 
}, async (event) => {
    try {
        const suppliersSnap = await db.collection('telecard_suppliers').where('isActive', '==', true).where('autoSync', '==', true).get();
        if (suppliersSnap.empty) return null;
        
        for (let i = 0; i < suppliersSnap.docs.length; i += 2) {
            const chunk = suppliersSnap.docs.slice(i, i + 2);
            await Promise.allSettled(chunk.map(async (doc) => { 
                try { await coreSyncLogic(doc.id); } catch (e) { await logCloudError('AUTO_SYNC_FAILED', e, doc.id); } 
            }));
        }
        return true;
    } catch (error) { 
        await logCloudError('SCHEDULED_SYNC_CRASH', error); 
        return null; 
    }
});

// ==========================================
// 🛡️ 3. حفظ بيانات المورد من الإدارة
// ==========================================
exports.secureSaveSupplier = onCall({ enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { id, name, type, baseUrl, token, defaultMargin, autoSync } = request.data;
    const suppId = id || 'supp_' + Date.now();
    
    try {
        const batch = db.batch();
        const suppRef = db.collection('telecard_suppliers').doc(suppId);
        
        batch.set(suppRef, { 
            id: suppId, name, type, baseUrl, 
            defaultMargin: FinancialEngine.extractNum(defaultMargin), 
            autoSync: Boolean(autoSync), isActive: true, 
            updatedAt: admin.firestore.FieldValue.serverTimestamp(), isSyncing: false 
        }, { merge: true });
        
        if (token && token.trim() !== '') {
            batch.set(suppRef.collection('secrets').doc('api'), { token: token }, { merge: true });
        }
        
        await batch.commit();
        await logAdminAction(request.auth.uid, 'SAVE_SUPPLIER', `تم حفظ المورد: ${name}`);
        
        return { success: true, id: suppId };
    } catch (error) { 
        throw new HttpsError('internal', 'فشل حفظ بيانات المورد.'); 
    }
});
 