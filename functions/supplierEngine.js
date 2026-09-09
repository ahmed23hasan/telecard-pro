// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة الماسية V10.5.0 💎
// 🎯 الوظيفة: استيراد المنتجات، وبناء الجداول المركزية بأمان تام.
// 🚀 التحديثات المعمارية (V10.5.0 - The Ultimate Alignment):
// 1. Supplier Currency Shield 🛡️: تحويل تكلفة المورد للعملة الأساسية (USD) فورياً لمنع تضارب التسعير.
// 2. Atomic Vault Sync 🛡️: توحيد آلية تحديث مخزون الخزنة مع index.js لمنع الـ Desync نهائياً.
// 3. Sequential Cron Execution 🛡️: تنفيذ مهام المزامنة المجدولة بالتتالي لمنع اختناق الذاكرة.
// 4. Negative Increment Guard 🛡️: تقليل عداد المخزون ذرياً عند اكتشاف كود مسحوب أو ملغى من المورد.
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

        // 🛡️ التحديث الماسي: جلب أسعار الصرف لتطبيق "درع عملة المورد"
        const [existingProdsSnap, pricingCacheSnap, configCacheSnap] = await Promise.all([
            db.collection('telecard_prods').where('supplierId', '==', supplierId).get(),
            db.collection('telecard_system').doc('active_pricing').get(),
            db.collection('telecard_system').doc('active_configs').get()
        ]);
        
        const existingProdsMap = new Map();
        existingProdsSnap.forEach(doc => existingProdsMap.set(doc.id, doc.data()));

        let systemTiers = [];
        if (pricingCacheSnap.exists && Array.isArray(pricingCacheSnap.data().tiers)) {
            systemTiers = pricingCacheSnap.data().tiers;
        } else {
            const tiersSnap = await db.collection('telecard_tiers').get();
            systemTiers = tiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        // استخراج أسعار الصرف من الكاش
        let systemRates = [];
        if (configCacheSnap.exists && Array.isArray(configCacheSnap.data().rates)) {
            systemRates = configCacheSnap.data().rates;
        } else {
            const ratesSnap = await db.collection('telecard_rates').get();
            systemRates = ratesSnap.docs.map(d => d.data());
        }
        
        const suppCurrency = String(supplier.currency || 'USD').toUpperCase();
        const syncSessionId = Date.now();
        
        // 🛡️ صناعة مستوى وهمي افتراضي
        const defaultMargin = FinancialEngine.extractNum(supplier.defaultMargin || 0);
        const defaultVirtualTier = { id: 'virtual_default', profitPercent: defaultMargin, minProfitUsd: 0 };
        
        let currentBatch = db.batch();
        let operationCount = 0;
        let importedCount = 0;
        let revokedCount = 0;
        
        const commitAndReset = async () => {
            if (operationCount > 0) { 
                await currentBatch.commit(); 
                currentBatch = db.batch(); 
                operationCount = 0; 
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
            
            let rawCostLocal = FinancialEngine.extractNum(prod.cost);
            
            // 🛡️ درع عملة المورد (Supplier Currency Shield): تحويل التكلفة إلى USD فوراً
            let rawCost = rawCostLocal;
            if (suppCurrency !== 'USD') {
                try {
                    rawCost = FinancialEngine.convertViaUSDHelper(
                        rawCostLocal, 
                        suppCurrency, // من عملة المورد
                        'USD',        // إلى الدولار حصراً
                        systemRates, 
                        'ceil',       // تقريب للأعلى لحماية أرباحك
                        'pricing'
                    );
                } catch (err) {
                    console.error(`🚨 فشل تحويل عملة المنتج ${safeId}:`, err.message);
                    // في حال فشل التحويل، نعتمد التكلفة القديمة لتجنب الخسارة
                    rawCost = existingData ? FinancialEngine.extractNum(existingData.costPrice) : 0; 
                }
            }

            let isFreezeRequired = false;

            // 🛑 قاطع الدائرة المتقدم (Circuit Breaker)
            if (rawCost === 0 || (existingData && existingData.costPrice && rawCost < (existingData.costPrice * 0.2))) {
                console.warn(`[CIRCUIT BREAKER] السعر منخفض جداً للمنتج ${safeId}. تم التجميد.`);
                rawCost = existingData ? FinancialEngine.extractNum(existingData.costPrice) : 0;
                isFreezeRequired = true;
            }
            rawCost = Math.min(rawCost, FinancialEngine.CONFIG.MAX_PRICE_LIMIT);

            const isFixed = existingData ? (String(existingData.isFixedPrice).toLowerCase() === 'true') : false;
            
            // 🛡️ التسعير الآمن عبر المحرك المالي
            const virtualBaseProduct = { costPrice: rawCost, price: rawCost }; 
            const basePricing = FinancialEngine.calculatePrice({ 
                product: virtualBaseProduct, 
                costPrice: rawCost, 
                tier: defaultVirtualTier 
            });
            let calculatedFinalPrice = basePricing.finalPrice;
            let finalPrice = isFixed ? FinancialEngine.extractNum(existingData.price) : calculatedFinalPrice;

            let tierPrices = {};
            if (!isFixed && systemTiers.length > 0) {
                systemTiers.forEach(tier => {
                    try {
                        const tierPricing = FinancialEngine.calculatePrice({ 
                            product: virtualBaseProduct, 
                            costPrice: rawCost, 
                            tier: tier 
                        });
                        tierPrices[tier.id] = tierPricing.finalPrice;
                    } catch (e) {
                        tierPrices[tier.id] = FinancialEngine.safeAdd(rawCost, FinancialEngine.safeMul(rawCost, 0.05));
                    }
                });
            }

            const safeCodesArray = Array.isArray(prod.codes) ? prod.codes.slice(0, 5000) : [];
            const cleanCodes = [...new Set(safeCodesArray.map(c => (typeof c === 'object' ? (c.text || c.code || '') : String(c)).replace(/\s+/g, '')).filter(c => c !== ''))];
            
            // 🛡️ متغير لتتبع حالة المخزون للمنتج
            let finalAvailableStock = FinancialEngine.extractNum(prod.stock); 
            
            if (cleanCodes.length > 0) {
                const vaultRef = db.collection('telecard_vault').doc(vaultId);
                const keysCollectionRef = vaultRef.collection('keys');
                
                const allExistingKeysSnap = await keysCollectionRef.select('isSold').get();
                const keysMap = new Map();
                allExistingKeysSnap.docs.forEach(doc => keysMap.set(doc.id, doc.data().isSold));

                let addedCodesThisSession = 0;
                let removedCodesThisSession = 0;

                // معالجة الأكواد القادمة من المورد
                for (const code of cleanCodes) {
                    const hash = generateCodeHash(code);
                    const docId = `key_${hash}`; 

                    if (keysMap.has(docId)) {
                        currentBatch.update(keysCollectionRef.doc(docId), { syncSessionId: syncSessionId });
                        keysMap.delete(docId); 
                    } else {
                        // 💎 كود جديد! نضيفه للباتش
                        currentBatch.set(keysCollectionRef.doc(docId), {
                            codeText: code, isSold: false, supplierId: supplierId,
                            syncSessionId: syncSessionId, importedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        addedCodesThisSession++;
                    }
                    operationCount++;
                    if (operationCount >= 300) await commitAndReset(); 
                }

                // معالجة الأكواد القديمة (التي لم يرسلها المورد هذه المرة)
                for (const [docId, isSold] of keysMap.entries()) {
                    if (isSold === false) {
                        // 💎 الكود سُحب من المورد! نلغيه وننقصه من المخزون
                        currentBatch.update(keysCollectionRef.doc(docId), { isSold: true, isRevoked: true, syncNote: 'سحب من المورد' });
                        removedCodesThisSession++;
                        operationCount++; revokedCount++;
                        if (operationCount >= 300) await commitAndReset(); 
                    }
                }

                // 🛡️ التحديث الذري للمخزون (Atomic Vault Sync) 
                const netStockChange = addedCodesThisSession - removedCodesThisSession;
                
                currentBatch.set(vaultRef, {
                    id: vaultId, supplierId: supplierId, name: `أكواد: ${rawName}`,
                    lastSync: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                if (netStockChange !== 0) {
                    currentBatch.update(vaultRef, {
                        stockCount: admin.firestore.FieldValue.increment(netStockChange)
                    });
                }
                
                operationCount++;
                if (operationCount >= 300) await commitAndReset(); 
                
                finalAvailableStock = (allExistingKeysSnap.size - removedCodesThisSession) + addedCodesThisSession;
            }

            const hasStock = isFreezeRequired ? false : (finalAvailableStock > 0);
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
            if (operationCount >= 300) await commitAndReset(); 
        }
        
        // مسح المنتجات القديمة التي لم يعد يرسلها المورد
        let deletedCount = 0;
        const staleProdsSnap = await db.collection('telecard_prods')
            .where('supplierId', '==', supplierId)
            .where('isAvailable', '==', true)
            .where('syncSessionId', '<', syncSessionId).get();

        for (const doc of staleProdsSnap.docs) {
            currentBatch.update(doc.ref, { isAvailable: false, syncNote: 'محذوف من المورد' });
            operationCount++; deletedCount++;
            if (operationCount >= 300) await commitAndReset();
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
        
        // 🛡️ التحديث المعماري: التنفيذ المتتالي لحماية السيرفر من نفاذ الذاكرة (Memory Exhaustion)
        for (const doc of suppliersSnap.docs) {
            try {
                await coreSyncLogic(doc.id);
            } catch (e) {
                await logCloudError('AUTO_SYNC_FAILED', e, doc.id);
            }
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
    
    // 🛡️ إضافة عملة المورد هنا (currency)
    const { id, name, type, baseUrl, token, defaultMargin, autoSync, currency } = request.data;
    const suppId = id || 'supp_' + Date.now();
    const suppCurrency = String(currency || 'USD').toUpperCase();
    
    try {
        const batch = db.batch();
        const suppRef = db.collection('telecard_suppliers').doc(suppId);
        
        batch.set(suppRef, { 
            id: suppId, name, type, baseUrl, currency: suppCurrency,
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
