// ============================================================================
// ☁️ بوابة الـ API ومستقبل الـ Webhooks (functions/developerApi.js) - النسخة الماسية V9.0.0 💎
// 🎯 الوظيفة: معالجة طلبات التجار الخارجية، طابور الـ Webhooks، والتوقيع الرقمي
// 🚀 التحديثات (V9.0.0 - Master Core Alignment):
// 1. Phantom Tier Fix 🛡️: فصل خصم الرصيد (مباشر) عن ترقية مستوى التاجر (بعد التسليم فقط) لتطابق index.js.
// 2. Time-Machine Recovery 🛡️: استيراد آلية احتساب المستويات عبر الـ API عند اختفاء التقييم.
// 3. TIER_DEFAULT Unification 🛡️: إزالة القيمة العشوائية (1) واستبدالها بالمعرف الموحد.
// 4. Notifications Merge 🛡️: إضافة {merge: true} لإشعارات الـ API.
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const crypto = require('crypto'); 
const FinancialEngine = require('./financialEngine.js');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const SYSTEM_LIMITS = { MAX_QTY_PER_ORDER: 10000, MAX_VAULT_QTY_PER_ORDER: 200 };
const safeAdd = (a, b) => FinancialEngine.safeAdd(a, b);
const safeSub = (a, b) => Math.max(0, FinancialEngine.safeSub(a, b));
const sanitizeAmount = (amount) => Number(Math.round(amount + 'e4') + 'e-4');

const getStartOfUTCDay = (timestampMs) => {
    const d = new Date(timestampMs);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
};

function isSafeWebhookUrl(urlString) {
    try {
        const parsedUrl = new URL(urlString);
        if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') return false;
        const hostname = parsedUrl.hostname.toLowerCase();
        if (hostname.includes('[') || hostname.includes('::') || /^0\.0\.0\.0$/.test(hostname) || /^\d+$/.test(hostname)) return false;
        const blockedPatterns = [ /^localhost$/, /^127\.\d+\.\d+\.\d+$/, /^10\.\d+\.\d+\.\d+$/, /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/, /^192\.168\.\d+\.\d+$/, /^169\.254\.\d+\.\d+$/ ];
        return !blockedPatterns.some(pattern => pattern.test(hostname));
    } catch (e) { return false; }
}

async function logFailedWebhook(payload, webhookUrl, errorMsg, userId) {
    await db.collection('telecard_failed_webhooks').add({
        userId: userId, payload: payload, webhookUrl: webhookUrl, attempts: 1,
        status: 'failed', error: errorMsg || 'Unknown Connection Error', lastAttempt: admin.firestore.FieldValue.serverTimestamp()
    });
}

function generateHmacSignature(payload, secret) {
    if (!secret || String(secret).trim() === '') return null;
    return crypto.createHmac('sha256', String(secret)).update(JSON.stringify(payload)).digest('hex');
}

// ==========================================
// 🔔 1. مشغل إشعارات التجار (Webhooks)
// ==========================================
exports.orderStatusWebhook = onDocumentWritten({ document: 'telecard_orders/{orderId}' }, async (event) => {
    if (!event.data.after.exists) return null;
    const after = event.data.after.data();
    const before = event.data.before.exists ? event.data.before.data() : null;
    if (before && before.status === after.status) return null;
    
    const webhookUrl = after.merchantData?.webhookUrl;
    const webhookSecret = after.merchantData?.webhookSecret;
    if (!webhookUrl || !isSafeWebhookUrl(webhookUrl)) return null; 
    
    try {
        const payload = {
            eventId: event.id, event: before ? 'order_status_changed' : 'order_created',
            orderId: after.displayId || after.id, productId: after.prodId, productName: after.product, 
            status: after.status, pricePaid: after.price, qty: after.qty,
            deliveredCode: after.deliveredCode || null, timestamp: new Date().toISOString()
        };
        
        const signature = generateHmacSignature(payload, webhookSecret);
        const headers = { 
            'Content-Type': 'application/json', 
            'User-Agent': 'Telecard-Cloud-Engine/4.0' 
        };
        
        if (signature) headers['X-Telecard-Signature'] = signature;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const response = await fetch(webhookUrl, { method: 'POST', headers: headers, body: JSON.stringify(payload), signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) await logFailedWebhook(payload, webhookUrl, `HTTP Error: ${response.status}`, after.userId);
            return true;
        } catch (fetchErr) {
            clearTimeout(timeoutId);
            await logFailedWebhook(payload, webhookUrl, fetchErr.name === 'AbortError' ? 'Connection Timeout' : fetchErr.message, after.userId);
            return null;
        }
    } catch (error) { return null; }
});

// ==========================================
// 🔄 2. نظام المحاولات الذاتي (Retry Cron)
// ==========================================
exports.cronRetryWebhooks = onSchedule({ 
    schedule: 'every 15 minutes', 
    timeZone: 'Asia/Riyadh',
    maxInstances: 1, 
    concurrency: 1   
}, async (event) => {
    const failedSnaps = await db.collection('telecard_failed_webhooks').where('status', '==', 'failed').where('attempts', '<', 5).limit(300).get();
    if (failedSnaps.empty) return null;
    
    const promises = failedSnaps.docs.map(async (doc) => {
        const data = doc.data(); const currentAttempt = data.attempts + 1; const isLastAttempt = currentAttempt >= 5;
        const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(data.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Telecard-Cloud-Engine-Retry/4.0' }, body: JSON.stringify(data.payload), signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) return doc.ref.update({ status: 'success', attempts: currentAttempt, lastAttempt: admin.firestore.FieldValue.serverTimestamp() });
            else return doc.ref.update({ status: isLastAttempt ? 'permanently_failed' : 'failed', attempts: currentAttempt, error: `HTTP ${response.status}`, lastAttempt: admin.firestore.FieldValue.serverTimestamp() });
        } catch (err) {
            clearTimeout(timeoutId);
            return doc.ref.update({ status: isLastAttempt ? 'permanently_failed' : 'failed', attempts: currentAttempt, error: err.name === 'AbortError' ? 'Connection Timeout' : err.message, lastAttempt: admin.firestore.FieldValue.serverTimestamp() });
        }
    });
    await Promise.allSettled(promises);
    return true;
});

// ==========================================
// 🔌 3. نقطة الدخول للتجار (B2B API Endpoint)
// ==========================================
exports.externalCreateOrder = onRequest(async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });

    const apiKeyHeader = req.headers['x-api-key'] || req.headers['authorization'];
    if (!apiKeyHeader) return res.status(401).json({ success: false, error: 'Unauthorized: API Key is missing.' });

    const idempotencyKey = req.headers['idempotency-key'];
    const cleanKey = apiKeyHeader.replace('Bearer ', '').trim();
    if (cleanKey.length < 20) return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key format.' });

    try {
        const usersQuery = await db.collection('telecard_users').where('apiKey', '==', cleanKey).limit(1).get();
        if (usersQuery.empty) return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API Key.' });

        const userDoc = usersQuery.docs[0];
        const uid = userDoc.id;
        
        const { productId, qty, inputStr, optIdx } = req.body;
        
        // 🛡️ استقبال السعر المتوقع لحماية التاجر (Price Slippage Guard)
        const expectedPriceRaw = Number(req.body.expectedPrice);
        const expectedPrice = isNaN(expectedPriceRaw) ? null : expectedPriceRaw;

        if (!productId) return res.status(400).json({ success: false, error: 'Bad Request: productId is required.' });

        const finalQty = Math.max(1, Math.floor(Number(qty) || 1));
        if (finalQty > SYSTEM_LIMITS.MAX_QTY_PER_ORDER) return res.status(400).json({ success: false, error: `Quantity limit exceeded.` });

        let parsedOptIdx = null;
        if (optIdx !== undefined && optIdx !== null) {
            parsedOptIdx = Number(optIdx);
            if (Number.isNaN(parsedOptIdx) || parsedOptIdx < 0) return res.status(400).json({ success: false, error: 'Invalid option index.' });
        }

        let resultData = null;
        const cleanOrderId = 'TC-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
        const requestPayload = JSON.stringify({ productId, finalQty, inputStr, parsedOptIdx });
        const requestHash = crypto.createHash('sha256').update(requestPayload).digest('hex');
        const serverNow = admin.firestore.Timestamp.now().toMillis();

        let attempt = 0;
        let success = false;
        
        while (attempt < 5 && !success) {
            attempt++;
            try {
                const productRef = db.collection('telecard_prods').doc(String(productId));
                const productSnap = await productRef.get();
                if (!productSnap.exists) throw new Error('Product not found.');
                const productOut = productSnap.data();

                if (productOut.vaultPoolId && finalQty > SYSTEM_LIMITS.MAX_VAULT_QTY_PER_ORDER) throw new Error(`Vault limit exceeded.`);
                
                let candidateKeyDocs = [];
                let vaultRef = null;

                if (productOut.vaultPoolId) {
                    vaultRef = db.collection('telecard_vault').doc(String(productOut.vaultPoolId));
                    const poolLimit = Math.max(finalQty * 3, Math.min(finalQty * 10, 500)); 
                    const keysQuerySnap = await vaultRef.collection('keys').where('isSold', '==', false).limit(poolLimit).get();
                    
                    if (keysQuerySnap.size < finalQty) throw new Error('Out of stock.');
                    
                    const shuffledDocs = keysQuerySnap.docs.sort(() => 0.5 - Math.random());
                    candidateKeyDocs = shuffledDocs.slice(0, finalQty);
                }

                await db.runTransaction(async (transaction) => {
                    let idempotencyRef = null;
                    if (idempotencyKey) {
                        idempotencyRef = db.collection('telecard_idempotency_keys').doc(`${uid}_${idempotencyKey}`);
                        const existingReq = await transaction.get(idempotencyRef);
                        
                        if (existingReq.exists) {
                            const expMs = existingReq.data().expiresAt?.toMillis ? existingReq.data().expiresAt.toMillis() : 0;
                            if (expMs > serverNow) {
                                if (existingReq.data().requestHash !== requestHash) throw new Error('Idempotency Conflict');
                                resultData = existingReq.data().resultData;
                                return; 
                            }
                        }      
                    }

                    const latestUserSnap = await transaction.get(userDoc.ref);
                    const userData = latestUserSnap.data();
                    if (userData.isBanned || userData.isIpBanned) throw new Error('Unauthorized: Account Banned');

                    const liveProdSnap = await transaction.get(productRef);
                    if (!liveProdSnap.exists) throw new Error('Product not found.');
                    const liveProduct = liveProdSnap.data();
                    if (liveProduct.isActive === false || String(liveProduct.isAvailable) === 'false') throw new Error('Product is currently disabled.');

                    let verifiedKeyDocs = [];
                    if (vaultRef && candidateKeyDocs.length > 0) {
                        const keyRefs = candidateKeyDocs.map(doc => doc.ref);
                        const keySnaps = await transaction.getAll(...keyRefs); 
                        
                        const hasCollision = keySnaps.some(k => !k.exists || k.data().isSold === true);
                        if (hasCollision) throw new Error('CONTENTION_COLLISION_RETRY');
                        
                        verifiedKeyDocs = keySnaps;
                    }

                    const allTiersSnap = await transaction.get(db.collection('telecard_tiers'));
                    const allTiers = allTiersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                    // 🛡️ التحديث المعماري: الاسترداد الذكي للمستويات لضمان عدم حدوث Crash (Time-Machine)
                    const assignedTierId = String(userData.tierId || userData.tier || 'TIER_DEFAULT');
                    let activeTierObj = allTiers.find(t => String(t.id) === assignedTierId);
                    let userUpdateObj = {};

                    if (!activeTierObj) {
                        const getThresh = (t) => Number(t.threshold || t.condition_amount || 0);
                        const sortedTiers = [...allTiers].filter(t => t.autoAdvance !== false).sort((a, b) => getThresh(b) - getThresh(a));
                        
                        let qualifiedTier = null;
                        let calculatedCycleSpent = 0;

                        for (const tier of sortedTiers) {
                            const threshold = getThresh(tier);
                            const durationDays = Number(tier.durationDays || 30);
                            const timeWindowMs = serverNow - (durationDays * 24 * 60 * 60 * 1000);

                            const ordersSnap = await transaction.get(
                                db.collection('telecard_orders')
                                  .where('userId', '==', uid)
                                  .where('status', 'in', ['completed', 'pending', 'processing'])
                                  .where('createdAt', '>=', new Date(timeWindowMs))
                            );

                            let spentInWindow = 0;
                            ordersSnap.forEach(doc => { spentInWindow += Number(doc.data().price || 0); });

                            if (spentInWindow >= threshold) {
                                qualifiedTier = tier;
                                calculatedCycleSpent = spentInWindow; 
                                break; 
                            }
                        }

                        if (!qualifiedTier) {
    let fallbackTier = allTiers.find(t => t.isDefault) || allTiers.find(t => String(t.id) === 'TIER_DEFAULT');
    if (!fallbackTier) {
        // 🛡️ التحديث الماسي: الفرز العادل لمنع إعطاء VIP عشوائي للتاجر
        const getT = (t) => Number(t.threshold || t.condition_amount || 0);
        const sortedBySafety = [...allTiers].sort((a, b) => getT(a) - getT(b));
        fallbackTier = sortedBySafety[0];
    }
    qualifiedTier = fallbackTier;
    calculatedCycleSpent = 0;
}

                        if (!qualifiedTier) throw new Error('System Configuration Error: No Tiers found.');

                        activeTierObj = qualifiedTier;
                        userUpdateObj.tierId = activeTierObj.id;
                        userUpdateObj.tierCycleSpent = sanitizeAmount(calculatedCycleSpent);
                        userUpdateObj.tierCycleStartDate = admin.firestore.FieldValue.serverTimestamp();
                        
                        userData.tierId = activeTierObj.id;
                        userData.tierCycleSpent = sanitizeAmount(calculatedCycleSpent);
                    }
                    
                    let currentCycleSpent = Number(userData.tierCycleSpent || 0);
                    const cycleStartMs = userData.tierCycleStartDate?.toMillis ? userData.tierCycleStartDate.toMillis() : serverNow;
                    const cycleStartDay = getStartOfUTCDay(cycleStartMs);
                    const todayDay = getStartOfUTCDay(serverNow);
                    const daysPassed = (todayDay - cycleStartDay) / (24 * 60 * 60 * 1000);
                    const isCycleExpired = daysPassed > Number(activeTierObj?.durationDays || 30);

                    if (isCycleExpired) { 
                        currentCycleSpent = 0; 
                        if (userData.manualTierOverride !== true) { 
                            activeTierObj = allTiers.find(t => t.isDefault) || activeTierObj; 
                            userUpdateObj.tierId = activeTierObj.id; 
                        }
                    }

                    const pricingSnapshot = FinancialEngine.calculateOrderTotal({ 
                        product: liveProduct, 
                        tier: activeTierObj,
                        optIdx: parsedOptIdx
                    }, finalQty); 

                    if (pricingSnapshot.isFirewallViolated) throw new Error('Firewall Violation');
                    const exactPrice = pricingSnapshot.totalFinalPrice;

                    // 🛡️ حماية التاجر من الانزلاق السعري
                    if (expectedPrice !== null && exactPrice > (expectedPrice + 0.05)) {
                        throw new Error('Price Slippage: Product price has increased. Please fetch the latest prices.');
                    }

                    const currentBalance = Number(userData.walletBalance || 0);
                    if (exactPrice < 0 || currentBalance < exactPrice) throw new Error('Insufficient balance.');

                    let deliveredCodeText = null, isAutoDelivered = false;

                    if (vaultRef && verifiedKeyDocs.length > 0) {
                        verifiedKeyDocs.forEach(docSnap => {
                            transaction.update(docSnap.ref, { isSold: true, soldAt: admin.firestore.FieldValue.serverTimestamp(), orderId: cleanOrderId, userId: uid });
                        });
                        transaction.update(vaultRef, { stockCount: admin.firestore.FieldValue.increment(-finalQty), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                        deliveredCodeText = verifiedKeyDocs.map(d => d.data().codeText).join(' | ');
                        isAutoDelivered = true;
                    }

                    // 🛡️ التحديث المعماري (Phantom Tier Fix): خصم الرصيد فوراً، وإضافة المشتريات فقط بعد التسليم
                    const newBalance = sanitizeAmount(safeSub(currentBalance, exactPrice));
                    userUpdateObj.walletBalance = newBalance;
                    userUpdateObj.lastOrderTime = serverNow;

                    if (isAutoDelivered) {
                        const newTotalSpent = sanitizeAmount(safeAdd(userData.totalSpent || 0, exactPrice));
                        const newTierCycleSpent = sanitizeAmount(safeAdd(currentCycleSpent, exactPrice));

                        let finalTierId = activeTierObj.id;
                        if (userData.manualTierOverride !== true && activeTierObj?.autoAdvance !== false) {
                            const getThreshold = (t) => Number(t.threshold || t.condition_amount || 0);
                            const earnedTiers = allTiers
                                .filter(t => (t.autoAdvance !== false) && getThreshold(t) <= newTierCycleSpent && getThreshold(t) > getThreshold(activeTierObj))
                                .sort((a, b) => getThreshold(b) - getThreshold(a));
                            
                            if (earnedTiers.length > 0) { finalTierId = earnedTiers[0].id; }
                        }

                        userUpdateObj.totalSpent = newTotalSpent;
                        userUpdateObj.tierCycleSpent = newTierCycleSpent;
                        userUpdateObj.tierId = finalTierId;
                        
                        if (isCycleExpired || finalTierId !== activeTierObj.id || userUpdateObj.tierId) { 
                            userUpdateObj.tierCycleStartDate = admin.firestore.FieldValue.serverTimestamp(); 
                        }
                    }

                    const newOrder = {
                        id: cleanOrderId, displayId: cleanOrderId, userId: uid, prodId: productId, product: liveProduct.name,
                        price: sanitizeAmount(exactPrice), qty: finalQty, input: inputStr || 'API Request',
                        status: isAutoDelivered ? 'completed' : 'pending', deliveredCode: deliveredCodeText, balanceAfter: newBalance,
                        merchantData: { webhookUrl: userData.webhookUrl || null, webhookSecret: userData.webhookSecret || null },
                        pricingSnapshot: { costUsd: pricingSnapshot.totalCostUsd || 0, netProfitUsd: pricingSnapshot.totalNetProfitUsd || 0 },
                        time: admin.firestore.FieldValue.serverTimestamp(), isApiOrder: true
                    };

                    resultData = { orderId: cleanOrderId, status: newOrder.status, pricePaid: exactPrice, deliveredCode: deliveredCodeText };
                    
                    transaction.update(userDoc.ref, userUpdateObj);
                    transaction.set(db.collection('telecard_orders').doc(cleanOrderId), newOrder);
                    
                    if (isAutoDelivered) {
                        const notifId = `notif_api_${cleanOrderId}`;
                        // 🛡️ حماية الكتابة المزدوجة {merge: true}
                        transaction.set(userDoc.ref.collection('notifications').doc(notifId), { id: notifId, title: "🔌 تسليم API بنجاح", message: `تم تسليم ( ${liveProduct.name} ).`, type: 'notification', jumpTarget: 'order', createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                    }
                    
                    if (idempotencyRef) {
                        transaction.set(idempotencyRef, { 
                            createdAt: admin.firestore.FieldValue.serverTimestamp(), 
                            expiresAt: admin.firestore.Timestamp.fromDate(new Date(serverNow + 48 * 60 * 60 * 1000)),
                            resultData: resultData, orderId: cleanOrderId, requestHash: requestHash 
                        });        
                    }
                });
                success = true;

            } catch (err) {
                if (err.message && err.message.includes('[SECURITY]')) {
                    throw new Error(`SECURITY_REJECT: ${err.message.replace('[SECURITY] ', '')}`);
                }
                
                if (err.message === 'CONTENTION_COLLISION_RETRY') {
                    if (attempt >= 5) throw new Error('High Traffic Collision');
                    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 500) + 100));
                } else {
                    throw err; 
                }
            }
        }

        if (!success && !resultData) throw new Error('System Overloaded');
        return res.status(200).json({ success: true, data: resultData });

    } catch (error) {
        if (error.message.startsWith('SECURITY_REJECT:')) return res.status(400).json({ success: false, error: error.message.replace('SECURITY_REJECT: ', '') });
        if (error.message === 'Unauthorized: Account Banned') return res.status(403).json({ success: false, error: 'Account is banned.' });
        if (error.message === 'Insufficient balance.') return res.status(402).json({ success: false, error: 'Insufficient balance.' });
        if (error.message === 'Out of stock.') return res.status(409).json({ success: false, error: 'Product out of stock.' });
        if (error.message === 'Product not found.' || error.message === 'Product is currently disabled.') return res.status(404).json({ success: false, error: 'Product not found or disabled.' });
        if (error.message === 'High Traffic Collision' || error.message === 'System Overloaded') return res.status(503).json({ success: false, error: 'System is highly loaded, please try again in a few seconds.' });
        if (error.message.includes('Vault limit exceeded')) return res.status(400).json({ success: false, error: error.message });
        if (error.message.includes('Firewall Violation')) return res.status(400).json({ success: false, error: 'Order rejected by security policy.' });
        if (error.message.includes('Idempotency Conflict')) return res.status(409).json({ success: false, error: 'Conflict: Please retry the request with the same idempotency key.' });
        if (error.message.includes('Price Slippage')) return res.status(409).json({ success: false, error: error.message });
        
        console.error('API Error:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});
