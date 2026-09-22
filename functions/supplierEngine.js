// ============================================================================
// ☁️ محرك الموردين السحابي (functions/supplierEngine.js) - النسخة الماسية V12.14.1 💎
// 🎯 الوظيفة: استيراد المنتجات، وبناء الجداول المركزية بأمان تام.
// 🚀 التحديثات المعمارية (V12.14.1 - Strict FX Conversion & Sync Patch):
// 1. Strict FX Conversion 🛡️: إجبار تكلفة المنتج على 0 عند فشل التحويل لتجميده آلياً مع الحفاظ على مزامنة الخزنة.
// 2. Transactional Revocation 🔒: استبدال الـ Batch بالـ Transaction عند سحب الأكواد لمنع بيعها أثناء الحذف.
// 3. Centralized Security 🛡️: إزالة دوال التشفير وفحص النطاقات وتفويضها لـ SecurityEngine.
// 4. DNS Rebinding Prevention 🛡️: استخدام الـ IP الموثق من محرك الحماية مباشرة في الاتصال.
// 5. Zero-Trust Memory Guard 🛡️: قطع الاتصال إذا تجاوزت بيانات المورد 20MB لمنع (OOM DoS).
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onMessagePublished } = require("firebase-functions/v2/pubsub"); 
const { PubSub } = require('@google-cloud/pubsub'); 
const admin = require('firebase-admin');
const https = require('https'); 
const FinancialEngine = require('./financialEngine.js');
const SecurityEngine = require('./securityEngine.js'); 

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const pubsub = new PubSub();

// ==========================================
// 🛡️ دوال المساعدة الإدارية
// ==========================================

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

// ==========================================
// 🌐 الاتصال الآمن بالموردين
// ==========================================
async function secureSupplierFetch(urlString, token) {
    const urlCheck = await SecurityEngine.isSafeUrlAsync(urlString);
    if (!urlCheck.isSafe) {
        throw new Error(`تم حظر النطاق لأسباب أمنية: ${urlCheck.reason}`);
    }

    const { parsedUrl, ip: resolvedIp } = urlCheck;

    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`, 
            'x-api-key': token,                 
            'Accept': 'application/json',
            'Accept-Encoding': 'identity', 
            'User-Agent': 'Telecard-Cloud-Engine/6.1'
        },
        lookup: (host, opts, cb) => cb(null, resolvedIp, 4), 
        timeout: 15000 
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
                if (data.length > 20 * 1024 * 1024) { 
                    req.destroy();
                    reject(new Error('حجم الاستجابة من المورد يتجاوز الحد المسموح (20MB). تم قطع الاتصال لحماية الذاكرة.'));
                }
            });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } 
                    catch(e) { reject(new Error('استجابة المورد ليست بصيغة JSON صحيحة.')); }
                } else {
                    reject(new Error(`API Error: فشل الاتصال بالمورد (كود الخطأ: ${res.statusCode})`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout: لم يستجب سيرفر المورد.'));
        });

        req.end();
    });
}

// ==========================================
// 🔌 محولات المنصات (Provider Adapters)
// ==========================================
const ProviderAdapters = {
    salla: async (baseUrl, token) => { return []; }, 
    zid: async (baseUrl, token) => { return []; },   
    
    custom_b2b: async (baseUrl, token) => {
        const cleanUrl = baseUrl.trim(); 
        const cleanToken = String(token || '').replace(/[\r\n]/g, '').trim();
        
        const data = await secureSupplierFetch(cleanUrl, cleanToken);
        const rawProducts = data.data || data.items || data.products || data;
        
        if (!Array.isArray(rawProducts)) {
            throw new Error('فشل جلب المنتجات: استجابة المورد لا تحتوي على مصفوفة بيانات صالحة.');
        }

        return rawProducts.map(item => ({ 
            externalId: String(item.id || item.product_id || item.item_id || ''), 
            name: String(item.name || item.title || item.product_name || 'منتج بدون اسم'), 
            cost: FinancialEngine.extractNum(item.wholesale_price || item.cost || item.price), 
            stock: FinancialEngine.extractNum(item.quantity || item.available_quantity || item.stock || item.qty), 
            codes: Array.isArray(item.keys) ? item.keys : (Array.isArray(item.codes) ? item.codes : []) 
        }));
    },

    standard_api: async (baseUrl, token) => {
        const cleanUrl = baseUrl.trim(); 
        const cleanToken = String(token || '').replace(/[\r\n]/g, '').trim();
        
        const data = await secureSupplierFetch(cleanUrl, cleanToken);
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

// ============================================================================
// ⚠️ تحذير معماري شديد الأهمية (Architecture Manifesto - Revocation Race Condition):
// يُمنع منعاً باتاً استخدام `db.batch()` أو القراءة خارج الـ Transaction عند "سحب الأكواد" (Revocation).
// استخدام Batch يعني قراءة حالة الكود (هل هو مباع؟) في الذاكرة، ثم الانتظار لتنفيذ أمر الحذف لاحقاً.
// في أوقات الذروة، يمكن لعميل شراء الكود في اللحظة الفاصلة بين القراءة والتنفيذ، مما يؤدي إلى
// كارثة بيع كود تالف/مسحوب للعميل.
// ✅ التصميم الهندسي الصحيح (المنفذ هنا):
// وضع عملية التحقق من الكود (isAlreadySold) وتحديث حالته إلى (isRevoked) حصرياً 
// داخل `db.runTransaction()`. هذا يضمن تطبيق قفل (Read Lock) على الكود؛ فإذا حاول العميل
// شراءه في نفس اللحظة، سيجبر Firestore إحدى العمليتين على الانتظار، مانعاً التضارب بشكل قطعي.
// ============================================================================

// ==========================================
// 🧠 النواة المركزية للمزامنة (Core Sync Engine) 
// ==========================================
const coreSyncLogic = async (supplierId) => {
    const suppRef = db.collection('telecard_suppliers').doc(String(supplierId));
    
    const supplier = await db.runTransaction(async (transaction) => {
        const suppSnap = await transaction.get(suppRef);
        if (!suppSnap.exists) throw new Error('المورد غير موجود.');
        const suppData = suppSnap.data();
        
        const isStaleLock = suppData.isSyncing && suppData.lastSyncAttempt && (Date.now() - suppData.lastSyncAttempt.toMillis()) > 10 * 60 * 1000;
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

        const dummyReadOnlyTx = { get: (ref) => ref.get() };
        const { ratesData, tiersData } = await FinancialEngine.fetchSystemData(dummyReadOnlyTx, db);

        const existingProdsSnap = await db.collection('telecard_prods').where('supplierId', '==', supplierId).get();
        const existingProdsMap = new Map();
        existingProdsSnap.forEach(doc => existingProdsMap.set(doc.id, doc.data()));
        
        const suppCurrency = String(supplier.currency || 'USD').toUpperCase();
        const syncSessionId = Date.now();
        const defaultMargin = FinancialEngine.extractNum(supplier.defaultMargin || 0);
        const defaultVirtualTier = { id: 'virtual_default', profitPercent: defaultMargin, minProfitUsd: 0 };
        
        let currentBatch = db.batch();
        let operationCount = 0;
        let importedCount = 0;
        let revokedCount = 0;
        
        const productsToFinalizeHashes = [];
        
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
            
            const rawName = SecurityEngine.sanitizeText(String(prod.name || ''), 200);
            if (!rawName) continue;

            const safeId = `ext_${supplierId}_${prod.externalId}`;
            const vaultId = `vault_${safeId}`;
            const existingData = existingProdsMap.get(safeId);
            
            let rawCostLocal = FinancialEngine.extractNum(prod.cost);
            let rawCost = rawCostLocal;
            
            if (suppCurrency !== 'USD') {
                try {
                    rawCost = FinancialEngine.convertViaUSDHelper(rawCostLocal, suppCurrency, 'USD', ratesData, 'ceil', 'pricing');
                } catch (err) {
                    // 🛡️ [إصلاح التشوه المالي]: إجبار التكلفة على 0 لتفعيل التجميد الآلي
                    // مع الاستمرار في الدالة لمزامنة الأكواد والمخزون بشكل طبيعي
                    console.warn(`[SECURITY] FX Rate missing for ${suppCurrency}. Auto-freezing product: ${safeId}`);
                    
                    // 🚨 التعديل الاحترافي: تسجيل الخطأ بقاعدة البيانات لعدم التجاهل الصامت
                    logCloudError('FX_RATE_MISSING_FREEZE', new Error(`فشل تحويل العملة للمنتج ${safeId} (${suppCurrency})`), supplierId);
                    
                    rawCost = 0; 
                }
            }

            let isFreezeRequired = false;
            if (rawCost === 0 || (existingData && existingData.costPrice && rawCost < (existingData.costPrice * 0.2))) {
                rawCost = existingData ? FinancialEngine.extractNum(existingData.costPrice) : 0;
                isFreezeRequired = true;
            }
            rawCost = Math.min(rawCost, FinancialEngine.CONFIG.MAX_PRICE_LIMIT);

            const isFixed = existingData ? (String(existingData.isFixedPrice).toLowerCase() === 'true') : false;
            const virtualBaseProduct = { costPrice: rawCost, price: rawCost }; 
            
            let calculatedFinalPrice;
            try {
                const basePricing = FinancialEngine.calculatePrice({ product: virtualBaseProduct, costPrice: rawCost, tier: defaultVirtualTier });
                calculatedFinalPrice = basePricing.finalPrice;
            } catch (e) {
                calculatedFinalPrice = FinancialEngine.safeAdd(rawCost, FinancialEngine.safeMul(rawCost, 0.05));
            }
            
            let finalPrice = isFixed ? FinancialEngine.extractNum(existingData.price) : calculatedFinalPrice;

            let tierPrices = {};
            if (!isFixed && tiersData.length > 0) {
                tiersData.forEach(tier => {
                    try { tierPrices[tier.id] = FinancialEngine.calculatePrice({ product: virtualBaseProduct, costPrice: rawCost, tier: tier }).finalPrice; } 
                    catch (e) { tierPrices[tier.id] = FinancialEngine.safeAdd(rawCost, FinancialEngine.safeMul(rawCost, 0.05)); }
                });
            }

            let rawCodesArray = Array.isArray(prod.codes) ? prod.codes : [];
            const MAX_ALLOWED_CODES_PER_PRODUCT = 20000;
            if (rawCodesArray.length > MAX_ALLOWED_CODES_PER_PRODUCT) {
                rawCodesArray = rawCodesArray.slice(0, MAX_ALLOWED_CODES_PER_PRODUCT);
            }

            const cleanCodes = [...new Set(rawCodesArray.map(c => (typeof c === 'object' ? (c.text || c.code || '') : String(c)).replace(/\s+/g, '')).filter(c => c !== ''))];
            
            let payloadHashToSave = null;
            let netStockChange = 0; 
            
            const isVaultProduct = cleanCodes.length > 0 || (existingData && existingData.vaultPoolId);
            
            if (isVaultProduct) {
                const vaultRef = db.collection('telecard_vault').doc(vaultId);
                const keysCollectionRef = vaultRef.collection('keys');
                const manifestRef = db.collection('telecard_vault_manifest').doc(vaultId);
                
                const payloadString = [...cleanCodes].sort().join('|');
                const currentPayloadHash = SecurityEngine.generateSha256Hash(payloadString);
                payloadHashToSave = currentPayloadHash;
                
                const savedHash = existingData ? existingData.lastPayloadHash : null;

                if (savedHash !== currentPayloadHash) {
                    const chunksSnap = await manifestRef.collection('chunks').get();
                    let existingHashes = [];
                    let previousChunkCount = chunksSnap.size;
                    
                    chunksSnap.forEach(doc => { existingHashes.push(...(doc.data().hashes || [])); });
                    const existingHashesSet = new Set(existingHashes);
                    
                    const newCodesSet = new Set();
                    const newCodesToInsert = [];
                    const currentPayloadHashes = [];
                    
                    const MAX_NEW_INSERTIONS = 2000;

                    for (const code of cleanCodes) {
                        const hash = SecurityEngine.generateSha256Hash(code);
                        newCodesSet.add(hash); 
                        
                        if (!existingHashesSet.has(hash)) {
                            if (newCodesToInsert.length < MAX_NEW_INSERTIONS) {
                                newCodesToInsert.push({ code, hash });
                                currentPayloadHashes.push(hash); 
                            }
                        } else {
                            currentPayloadHashes.push(hash); 
                        }
                    }

                    const removedHashes = existingHashes.filter(h => !newCodesSet.has(h));
                    netStockChange = newCodesToInsert.length;
                    
                    if (removedHashes.length > 0) {
                        const chunks = [];
                        for (let i = 0; i < removedHashes.length; i += 100) chunks.push(removedHashes.slice(i, i + 100));
                        
                        for (const chunk of chunks) {
                            const docRefs = chunk.map(h => keysCollectionRef.doc(`key_${h}`));
                            
                            // 🛡️ تطبيق القفل المعماري (Read Lock) عبر Transaction لمنع بيع الكود أثناء سحبه
                            const chunkRevokedCount = await db.runTransaction(async (transaction) => {
                                const snapshots = await transaction.getAll(...docRefs);
                                let localRevoked = 0;
                                
                                snapshots.forEach(snap => {
                                    if (snap.exists) {
                                        const isAlreadySold = snap.data().isSold === true;
                                        if (!isAlreadySold) {
                                            transaction.set(snap.ref, { 
                                                isSold: true, 
                                                isRevoked: true, 
                                                syncNote: 'سحب من المورد',
                                                revokedReason: 'Supplier removed code', 
                                                syncSessionId: syncSessionId 
                                            }, { merge: true });
                                            localRevoked++; 
                                        }
                                    }
                                });
                                return localRevoked;
                            });
                            
                            revokedCount += chunkRevokedCount; 
                            netStockChange -= chunkRevokedCount; 
                        }
                    }

                    for (const item of newCodesToInsert) {
                        const docId = `key_${item.hash}`;
                        currentBatch.set(keysCollectionRef.doc(docId), {
                            codeText: item.code, isSold: false, supplierId: supplierId,
                            syncSessionId: syncSessionId, importedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true }); 
                        
                        operationCount++;
                        if (operationCount >= 300) await commitAndReset();
                    }

                    const CHUNK_SIZE = 2000;
                    const newChunks = [];
                    for (let i = 0; i < currentPayloadHashes.length; i += CHUNK_SIZE) {
                        newChunks.push(currentPayloadHashes.slice(i, i + CHUNK_SIZE));
                    }

                    for (let i = 0; i < newChunks.length; i++) {
                        currentBatch.set(manifestRef.collection('chunks').doc(`chunk_${i}`), { hashes: newChunks[i] });
                        operationCount++;
                        if (operationCount >= 300) await commitAndReset();
                    }

                    for (let i = newChunks.length; i < previousChunkCount; i++) {
                        currentBatch.delete(manifestRef.collection('chunks').doc(`chunk_${i}`));
                        operationCount++;
                        if (operationCount >= 300) await commitAndReset();
                    }

                    let vaultUpdatePayload = {
                        id: vaultId, supplierId: supplierId, name: `أكواد: ${rawName}`,
                        lastSync: admin.firestore.FieldValue.serverTimestamp()
                    };

                    if (netStockChange !== 0) {
                        vaultUpdatePayload.stockCount = admin.firestore.FieldValue.increment(netStockChange);
                    }

                    currentBatch.set(vaultRef, vaultUpdatePayload, { merge: true });
                    currentBatch.set(manifestRef, { totalHashes: currentPayloadHashes.length, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                    
                    operationCount += 2;
                    if (operationCount >= 300) await commitAndReset(); 
                }
            }

            const statusNote = isFreezeRequired ? 'مجمد آلياً بسبب خطأ بالتسعير' : '';
            
            let isProductAvailable = false;
if (!isFreezeRequired) {
    // الشرط الجديد: إذا كان السعر ثابتاً والتكلفة أعلى من أو تساوي سعر البيع
    if (isFixed && rawCost >= finalPrice) {
        isProductAvailable = false;
        isFreezeRequired = true; // لكي يظهر حقل requiresAdminAttention للإدارة
    } else if (isVaultProduct) {
        isProductAvailable = cleanCodes.length > 0;
    } else {
        isProductAvailable = prod.stock > 0;
    }
}

            const prodRef = db.collection('telecard_prods').doc(safeId);
            
            // 💡 [ملاحظة للمطور - ربط واجهة الإدارة]: 
            // تم إضافة حقل (requiresAdminAttention) هنا. 
            // يجب تعديل واجهة الإدارة (Admin Panel) لاحقاً لقراءة هذا الحقل وإعطاء إشعار/شارة حمراء 
            // بأن هذا المنتج متوقف ويحتاج لتدخل يدوي لإصلاح أسعار الصرف.
            let prodPayload = {
                id: safeId, name: rawName, costPrice: rawCost, price: finalPrice, 
                tierPrices: Object.keys(tierPrices).length > 0 ? tierPrices : null, 
                supplierId: supplierId, 
                vaultPoolId: isVaultProduct ? vaultId : null, 
                isExternal: true, 
                isAvailable: isProductAvailable, 
                syncNote: statusNote,
                requiresAdminAttention: isFreezeRequired, // 🔴 الحقل الأمني الجديد المضاف
                syncSessionId: syncSessionId, lastSync: admin.firestore.FieldValue.serverTimestamp()
            };

            if (isVaultProduct) {
                if (netStockChange !== 0) {
                    prodPayload.stockCount = admin.firestore.FieldValue.increment(netStockChange);
                }
            } else {
                prodPayload.stockCount = prod.stock; 
            }

            currentBatch.set(prodRef, prodPayload, { merge: true });
            
            if (payloadHashToSave) {
                productsToFinalizeHashes.push({ ref: prodRef, hash: payloadHashToSave });
            }
            
            operationCount++; importedCount++;
            if (operationCount >= 300) await commitAndReset(); 
        }
        
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
        
        for (const item of productsToFinalizeHashes) {
            currentBatch.update(item.ref, { lastPayloadHash: item.hash });
            operationCount++;
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
exports.syncSupplierData = onCall({ region: 'us-east1', memory: '1GiB', timeoutSeconds: 540, enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    try {
        const result = await coreSyncLogic(request.data.supplierId);
        await logAdminAction(request.auth.uid, 'MANUAL_SYNC_SUPPLIER', `مزامنة ${request.data.supplierId}`);
        return { success: true, message: `تمت مزامنة ${result.importedCount} منتج. تعطيل ${result.deletedCount}. سحب ${result.revokedCount} كود.`, ...result };
    } catch (error) { throw new HttpsError('internal', error.message); }
});

// ==========================================
// ⏱️ 2. المزامنة التلقائية (موزع المهام Pub/Sub)
// ==========================================
exports.scheduledSupplierSync = onSchedule({ 
    region: 'us-east1',
    schedule: '0 */12 * * *', 
    timeZone: 'Asia/Riyadh', 
    memory: '256MiB', 
    timeoutSeconds: 60 
}, async (event) => {
    try {
        const suppliersSnap = await db.collection('telecard_suppliers').where('isActive', '==', true).where('autoSync', '==', true).get();
        if (suppliersSnap.empty) return null;
        
        const TOPIC_NAME = 'telecard-sync-supplier-topic';
        
        const promises = suppliersSnap.docs.map(doc => 
            pubsub.topic(TOPIC_NAME).publishMessage({ json: { supplierId: doc.id } })
        );
        
        await Promise.allSettled(promises);
        return true;
    } catch (error) { 
        await logCloudError('SCHEDULED_SYNC_DISPATCHER_CRASH', error); 
        return null; 
    }
});

exports.onSupplierSyncWorker = onMessagePublished({
    region: 'us-east1',
    topic: 'telecard-sync-supplier-topic',
    memory: '1GiB',
    timeoutSeconds: 540
}, async (event) => {
    const supplierId = event.data.message.json.supplierId;
    if (!supplierId) return;

    try {
        await coreSyncLogic(supplierId);
    } catch (e) {
        await logCloudError('AUTO_SYNC_WORKER_FAILED', e, supplierId);
    }
});

// ==========================================
// 🛡️ 3. حفظ بيانات المورد من الإدارة
// ==========================================
exports.secureSaveSupplier = onCall({ region: 'us-east1', enforceAppCheck: false }, async (request) => {
    if (!isMasterAdmin(request)) throw new HttpsError('permission-denied', 'غير مصرح.');
    
    const { id, name, type, baseUrl, token, defaultMargin, autoSync, currency } = request.data;
    
    const urlCheck = await SecurityEngine.isSafeUrlAsync(baseUrl);
    if (!baseUrl || !urlCheck.isSafe) {
        throw new HttpsError('invalid-argument', 'رابط المورد غير صالح أو غير آمن.');
    }

    const suppId = id || SecurityEngine.generateUniqueId('supp');
    const suppCurrency = String(currency || 'USD').toUpperCase();
    
    const safeName = SecurityEngine.sanitizeText(String(name || ''), 100);

    try {
        const batch = db.batch();
        const suppRef = db.collection('telecard_suppliers').doc(suppId);
        
        batch.set(suppRef, { 
            id: suppId, name: safeName, type, baseUrl, currency: suppCurrency,
            defaultMargin: FinancialEngine.extractNum(defaultMargin), 
            autoSync: Boolean(autoSync), isActive: true, 
            updatedAt: admin.firestore.FieldValue.serverTimestamp(), isSyncing: false 
        }, { merge: true });
        
        if (token && token.trim() !== '') {
            batch.set(suppRef.collection('secrets').doc('api'), { token: token }, { merge: true });
        }
        
        await batch.commit();
        await logAdminAction(request.auth.uid, 'SAVE_SUPPLIER', `تم حفظ المورد: ${safeName}`);
        
        return { success: true, id: suppId };
    } catch (error) { 
        throw new HttpsError('internal', 'فشل حفظ بيانات المورد.'); 
    }
});
