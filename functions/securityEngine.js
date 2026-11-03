// ============================================================================
// 🛡️ محرك الحماية والأدوات المركزية (Security & Utility Engine) - النسخة V14.7.0 💎
// 🎯 الوظيفة: درع الحماية ضد ثغرات (XSS, SSRF, IP Spoofing)، التشفير العسكري، الشبكات، وأدوات الإدارة.
// 🚀 التحديثات المعمارية (V14.7.0 - Anti-IP Spoofing & Stream Hardening Patch):
// 1. Trusted Client IP Extraction 🌍: إضافة extractClientIp لمنع تزوير X-Forwarded-For وتوحيد صيغة IPv4.
// 2. Unicode & Null-Byte Sanitizer Guard 🧹: تحصين sanitizeText ضد حقن الـ Null Bytes وأكواد الـ Unicode الخارجة عن النطاق.
// 3. Native Date Clone Preservation 📅: دعم استنساخ كائنات Date القياسية في safeClone دون تحويلها لكائن فارغ.
// 4. Resilient Gzip Fallback 📦: دعم فك ضغط Gzip/Deflate تلقائياً في secureHttpsRequest إذا فرضه سيرفر المورد.
// 5. Zero-Downtime Key Rotation 🔄: دعم مفتاح احتياطي اختياري (SYSTEM_AUDIT_SECRET_OLD) لفك تشفير الطلبات القديمة.
// ============================================================================

const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const https = require('https');
const zlib = require('zlib');

let _cachedAuditKey = null;
let _cachedSecretRaw = null;

let _cachedFallbackAuditKey = null;
let _cachedFallbackSecretRaw = null;

function getDerivedAuditKey() {
  const secret = process.env.SYSTEM_AUDIT_SECRET;
  if (!secret || String(secret).trim().length < 16) {
    throw new Error('MISSING_AUDIT_SECRET: مفتاح التشفير المحاسبي (SYSTEM_AUDIT_SECRET) مفقود أو قصير جداً في ملف .env على السيرفر!');
  }
  const cleanSecret = String(secret).trim();
  if (!_cachedAuditKey || _cachedSecretRaw !== cleanSecret) {
    _cachedAuditKey = crypto.createHash('sha256').update(cleanSecret).digest();
    _cachedSecretRaw = cleanSecret;
  }
  return _cachedAuditKey;
}

function getFallbackAuditKey() {
  const oldSecret = process.env.SYSTEM_AUDIT_SECRET_OLD;
  if (!oldSecret || String(oldSecret).trim().length < 16) return null;
  const cleanOldSecret = String(oldSecret).trim();
  if (!_cachedFallbackAuditKey || _cachedFallbackSecretRaw !== cleanOldSecret) {
    _cachedFallbackAuditKey = crypto.createHash('sha256').update(cleanOldSecret).digest();
    _cachedFallbackSecretRaw = cleanOldSecret;
  }
  return _cachedFallbackAuditKey;
}

function decryptAesGcmWithKey(key, ivBuf, tagBuf, encryptedHex) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(tagBuf);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

const SecurityEngineDef = {
  
  // ========================================================================
  // 🧹 القسم الأول: تعقيم البيانات (Data Sanitization & Cloning)
  // ========================================================================
  
  sanitizeText: function(text, maxLength = null) {
    if (!text || typeof text !== 'string') return '';

    // 1. فك الكيانات النصية والرقمية السابقة أولاً لمنع التشفير المزدوج أو التهريب الرقمي
    let safeString = text
      .replace(/&#(\d+);?/g, (_, dec) => {
        const code = parseInt(dec, 10);
        return (Number.isInteger(code) && code > 0 && code <= 0x10FFFF) ? String.fromCodePoint(code) : '';
      })
      .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) => {
        const code = parseInt(hex, 16);
        return (Number.isInteger(code) && code > 0 && code <= 0x10FFFF) ? String.fromCodePoint(code) : '';
      })
      .replace(/\x26#x27;/g, '\x27')
      .replace(/\x26quot;/g, '\x22')
      .replace(/\x26gt;/g, '\x3e')
      .replace(/\x26lt;/g, '\x3c')
      .replace(/\x26amp;/g, '\x26')
      // إزالة المحارف الصفرية (Null Bytes) ومحارف التحكم غير المرئية
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim();

    if (maxLength && safeString.length > maxLength) {
      safeString = safeString.substring(0, maxLength);
    }

    // 2. تحويل الرموز الخطيرة إلى كيانات آمنة
    const entityMap = {
      '\x3c': '\x26lt;',
      '\x3e': '\x26gt;',
      '\x26': '\x26amp;',
      '\x22': '\x26quot;',
      '\x27': '\x26#x27;'
    };
    let cleanText = safeString.replace(/[\x3c\x26\x3e\x22\x27]/g, function(c) {
      return entityMap[c];
    }).trim();

    // 3. ضمان عدم تجاوز الطول الأقصى
    if (maxLength && cleanText.length > maxLength) {
      cleanText = cleanText.substring(0, maxLength).replace(/\x26[^;]*$/, '').trim();
    }

    return cleanText;
  },

  safeClone: function(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    
    if (obj instanceof Date) return new Date(obj.getTime());
    if (typeof obj.toDate === 'function') return obj; 
    if (obj.latitude !== undefined && obj.longitude !== undefined) return obj; 
    
    if (Array.isArray(obj)) return obj.map(SecurityEngineDef.safeClone);
    
    const cloned = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = SecurityEngineDef.safeClone(obj[key]);
      }
    }
    return cloned;
  },
  
  // ========================================================================
  // 🌐 القسم الثاني: حماية الشبكات والاتصال الموحد (SSRF, IP Guard & HTTPS)
  // ========================================================================

  /**
   * 🛡️ استخراج عنوان الـ IP الحقيقي للعميل بأمان ومنع ثغرة تزوير X-Forwarded-For
   */
  extractClientIp: function(reqOrRequest) {
    if (!reqOrRequest) return '';
    const rawReq = reqOrRequest.rawRequest || reqOrRequest;
    const headers = rawReq.headers || {};

    const normalizeCandidateIp = (rawIp) => {
      if (!rawIp || typeof rawIp !== 'string') return '';
      let cleaned = rawIp.trim().replace(/^::ffff:/i, '');
      return net.isIP(cleaned) ? cleaned : '';
    };
// 1. في حال وجود X-Forwarded-For، موازن أحمال جوجل (GFE) يلحق الـ IP الحقيقي للاتصال في نهاية السلسلة دائماً
const xff = String(headers['x-forwarded-for'] || '');
if (xff) {
  const parts = xff.split(',').map(s => normalizeCandidateIp(s)).filter(Boolean);
  if (parts.length > 0) {
    const fastlyIp = normalizeCandidateIp(headers['fastly-client-ip']);
    // لا نعتمد fastly-client-ip إلا إذا مر الطلب عبر Firebase Hosting وكان مسجلاً في القفزة قبل الأخيرة لـ XFF
    if (fastlyIp && headers['x-fh-requested-host'] && parts.length >= 2 && parts[parts.length - 2] === fastlyIp) {
      return fastlyIp;
    }
    return parts[parts.length - 1];
  }
}

// 2. احتياطي بيئة Google AppEngine / Cloud Functions المباشر
const appEngineIp = normalizeCandidateIp(headers['x-appengine-user-ip']);
if (appEngineIp) return appEngineIp;
    return normalizeCandidateIp(rawReq.ip);
  },
  
  isPrivateIP: function(ip) {
    if (!net.isIP(ip)) return true;

    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map(Number);
      if (parts[0] === 0) return true; 
      if (parts[0] === 10) return true; 
      if (parts[0] === 127) return true; 
      if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; 
      if (parts[0] === 169 && parts[1] === 254) return true; 
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; 
      if (parts[0] === 192 && parts[1] === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
      if (parts[0] === 192 && parts[1] === 168) return true; 
      if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
      if (parts[0] >= 224) return true; 
      return false;
    }

    if (net.isIPv6(ip)) {
      const lowerIp = ip.toLowerCase();
      if (lowerIp === '::' || lowerIp === '::1') return true;
      if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return true; 
      if (lowerIp.startsWith('fe8') || lowerIp.startsWith('fe9') || lowerIp.startsWith('fea') || lowerIp.startsWith('feb')) return true; 
      
      const ipv4Match = lowerIp.match(/(?::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
      if (ipv4Match && net.isIPv4(ipv4Match[1])) {
        return SecurityEngineDef.isPrivateIP(ipv4Match[1]);
      }
      if (lowerIp.includes(':7f00:') || lowerIp.includes(':0a00:') || lowerIp.includes(':c0a8:')) {
        return true;
      }
      return false;
    }

    return true; 
  },

  isSafeUrlAsync: async function(urlString) {
    try {
      const parsedUrl = new URL(urlString);
      
      if (parsedUrl.protocol !== 'https:') {
        return { isSafe: false, reason: 'Unsupported protocol. HTTPS is strictly required.', ip: null };
      }
      
      const hostname = parsedUrl.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.internal') ||
        hostname.endsWith('.local') ||
        hostname === 'metadata.google.internal'
      ) {
        return { isSafe: false, reason: 'Suspicious internal hostname', ip: null };
      }
      
      const lookupRes = await dns.lookup(hostname, { family: 4 });
      const resolvedIp = lookupRes.address;
      
      if (SecurityEngineDef.isPrivateIP(resolvedIp)) {
        return { isSafe: false, reason: 'Resolves to private/internal IP', ip: null };
      }
      
      return { isSafe: true, ip: resolvedIp, parsedUrl: parsedUrl };
    } catch (e) {
      return { isSafe: false, reason: 'Invalid URL or DNS failure', ip: null };
    }
  },

  /**
   * 🛡️ محرك الاتصال الشبكي الآمن الموحد (Webhooks & Suppliers)
   */
  secureHttpsRequest: async function(urlString, config = {}) {
    const {
      method = 'GET',
      headers = {},
      body = null,
      timeout = 15000,
      maxResponseBytes = 10 * 1024 * 1024,
      parseJson = false
    } = config;

    const urlCheck = await SecurityEngineDef.isSafeUrlAsync(urlString);
    if (!urlCheck.isSafe) {
      throw new Error(`Security Block: ${urlCheck.reason}`);
    }

    const { parsedUrl, ip: resolvedIp } = urlCheck;
    const bodyString = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

    const requestHeaders = {
      'Accept-Encoding': 'identity',
      'User-Agent': 'Telecard-Cloud-Engine/6.5',
      ...headers
    };

    if (bodyString) {
      requestHeaders['Content-Length'] = Buffer.byteLength(bodyString);
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: requestHeaders,
      lookup: (host, opts, cb) => {
        const callback = typeof opts === 'function' ? opts : cb;
        const lookupOpts = typeof opts === 'object' ? opts : {};

        if (String(resolvedIp).includes('[')) {
          return callback(new Error('IPv6 format is strictly blocked by Security Architecture.'), null, null);
        }
        if (lookupOpts.all) {
          return callback(null, [{ address: resolvedIp, family: 4 }]);
        }
        return callback(null, resolvedIp, 4);
      },
      timeout: timeout
    };

    return new Promise((resolve, reject) => {
      let isSettled = false;
      let req = null;

      const hardTimer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          if (req) req.destroy();
          reject(new Error('Connection Timeout'));
        }
      }, timeout);

      const safeResolve = (val) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(hardTimer);
          resolve(val);
        }
      };

      const safeReject = (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(hardTimer);
          reject(err);
        }
      };

      req = https.request(options, (res) => {
        const chunks = [];
        let totalLength = 0;

        res.on('data', (chunk) => {
          totalLength += chunk.length;
          if (totalLength > maxResponseBytes) {
            req.destroy();
            return safeReject(new Error(`Response size exceeded maximum limit (${maxResponseBytes} bytes).`));
          }
          if (parseJson) chunks.push(chunk);
        });

        res.on('end', () => {
          const isOk = res.statusCode >= 200 && res.statusCode < 300;
          if (!parseJson) {
            return safeResolve({ ok: isOk, status: res.statusCode });
          }

          let rawBuffer = Buffer.concat(chunks);
          const contentEncoding = String(res.headers['content-encoding'] || '').toLowerCase();

          try {
            if (contentEncoding === 'gzip') {
              rawBuffer = zlib.gunzipSync(rawBuffer, { maxOutputLength: maxResponseBytes });
            } else if (contentEncoding === 'deflate') {
              rawBuffer = zlib.inflateSync(rawBuffer, { maxOutputLength: maxResponseBytes });
            }
          } catch (decompressErr) {
            return safeReject(new Error('Failed to decompress response stream safely.'));
          }

          const rawData = rawBuffer.toString('utf8');
          if (isOk) {
            try {
              return safeResolve({ ok: true, status: res.statusCode, data: JSON.parse(rawData) });
            } catch (e) {
              return safeReject(new Error('Invalid JSON response from remote server.'));
            }
          } else {
            // 🛡️ إرفاق كود الحالة ومحتوى الـ JSON مع الخطأ ليتمكن محلل المورد من قراءة رسائل الرفض الصريحة (400/422)
            const httpErr = new Error(`HTTP Error: ${res.statusCode}`);
            httpErr.httpStatus = res.statusCode;
            if (rawData) {
              try { httpErr.responseJson = JSON.parse(rawData); } catch (e) {}
            }
            return safeReject(httpErr);
          }
        });
      });

      req.on('error', (e) => safeReject(e));
      req.on('timeout', () => {
        req.destroy();
        safeReject(new Error('Connection Timeout'));
      });

      if (bodyString) req.write(bodyString);
      req.end();
    });
  },
  
  // ========================================================================
  // 🔐 القسم الثالث: التشفير والمعرفات (Cryptography & IDs)
  // ========================================================================
  
  generateSha256Hash: function(data) {
    const stringData = typeof data === 'object' ? JSON.stringify(data) : String(data).trim();
    return crypto.createHash('sha256').update(stringData).digest('hex');
  },
  
  generateHmacSignature: function(payload, secret) {
    if (!secret || String(secret).trim() === '') return null;
    const dataString = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
    return crypto.createHmac('sha256', String(secret)).update(dataString).digest('hex');
  },
  
  generateUniqueId: function(prefix = 'TC') {
  const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
  const timeBase36 = Date.now().toString(36).toUpperCase();
  return `${prefix}-${randomHex}-${timeBase36}`;
},
  encryptOrderAudit: function(auditData) {
    const key = getDerivedAuditKey();
    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      
      const payloadString = JSON.stringify(auditData || {});
      let encrypted = cipher.update(payloadString, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const tag = cipher.getAuthTag().toString('hex');
      
      return `${iv.toString('hex')}:${tag}:${encrypted}`;
    } catch (e) {
      console.error("Order Audit Encryption Error:", e);
      return null;
    }
  },

  decryptOrderAudit: function(token) {
    if (!token || typeof token !== 'string' || !token.includes(':')) return {};
    try {
      const parts = token.split(':');
      if (parts.length !== 3) return {};
      const [ivHex, tagHex, encryptedHex] = parts;
      if (ivHex.length !== 24 || tagHex.length !== 32 || !encryptedHex) return {};
      
      const ivBuf = Buffer.from(ivHex, 'hex');
      const tagBuf = Buffer.from(tagHex, 'hex');
      const primaryKey = getDerivedAuditKey();

      try {
        return decryptAesGcmWithKey(primaryKey, ivBuf, tagBuf, encryptedHex);
      } catch (primaryErr) {
        const fallbackKey = getFallbackAuditKey();
        if (fallbackKey) {
          return decryptAesGcmWithKey(fallbackKey, ivBuf, tagBuf, encryptedHex);
        }
        throw primaryErr;
      }
    } catch (e) {
      console.error("Order Audit Decryption Error:", e.message);
      return {};
    }
  },
  
  // ========================================================================
  // 🔄 القسم الرابع: إدارة التزامن والضغط (Concurrency Management)
  // ========================================================================
  
  withCollisionRetry: async function(maxAttempts, operationName, asyncOperation) {
    let attempt = 0;
    let success = false;
    let result = null;
    
    while (attempt < maxAttempts && !success) {
      attempt++;
      try {
        result = await asyncOperation();
        success = true; 
      } catch (error) {
        const isContention = error.message === 'CONTENTION_COLLISION_RETRY' ||
          (error.message && (error.message.includes('Aborted due to cross-transaction') || error.message.includes('too much contention')));
        
        if (isContention) {
          if (attempt >= maxAttempts) {
            throw new Error(`HIGH_TRAFFIC_COLLISION:${operationName}`);
          }
          const backoffTime = Math.floor(Math.random() * 150) + (attempt * 150);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        } else {
          throw error;
        }
      }
    }
    return result;
  },

  // ========================================================================
  // 🚀 القسم الخامس: أدوات قواعد البيانات والإدارة الموحدة (DB & Admin Tools)
  // ========================================================================

  processInBatches: async function(db, itemsArray, operationCallback, batchSize = 400) {
    if (!Array.isArray(itemsArray) || itemsArray.length === 0) return 0;
    
    const chunks = [];
    for (let i = 0; i < itemsArray.length; i += batchSize) {
        chunks.push(itemsArray.slice(i, i + batchSize));
    }
    
    let totalProcessed = 0;
    for (const chunk of chunks) {
        const batch = db.batch();
        for (const item of chunk) {
            await operationCallback(batch, item);
        }
        await batch.commit();
        totalProcessed += chunk.length;
        await new Promise(resolve => setTimeout(resolve, 30)); 
    }
    return totalProcessed;
  },

  paginateFirestore: async function(baseQuery, fetchLimit) {
    const snapshot = await baseQuery.limit(fetchLimit).get();
    const docs = snapshot.docs;
    const hasMore = docs.length === fetchLimit;
    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;
    return { snapshot, docs, hasMore, lastDoc };
  },

  isMasterAdmin: function(request) {
    return request?.auth?.token?.admin === true;
  },

  logAdminAction: async function(db, admin, adminUid, action, details) {
    try {
      const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
      await db.collection('telecard_audit_logs').add({
        adminUid,
        action,
        details,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + ONE_YEAR_MS)
      });
    } catch (e) {
      console.error("Audit Log Error:", e);
    }
  },

  sendFCMToAdmin: async function(db, admin, alertType, title, body, payloadData = {}) {
  try {
    // 🛡️ توثيق كافة الإنذارات الأمنية والمالية الحرجة تلقائياً في سجل أخطاء النظام ليقرأها جرس الإدارة وسجل النشاطات
    if (alertType === 'system_alerts' && payloadData?.skipErrorLog !== true) {
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      await db.collection('telecard_system_errors').add({
        action: payloadData?.action || 'SYSTEM_SECURITY_ALERT',
        title: String(title || 'تنبيه نظام حرج'),
        details: String(body || ''),
        target: payloadData?.target || null,
        orderId: payloadData?.orderId || null,
        prodId: payloadData?.prodId || null,
        userId: payloadData?.userId || null,
        time: admin.firestore.FieldValue.serverTimestamp(),
        expireAt: admin.firestore.Timestamp.fromMillis(Date.now() + THIRTY_DAYS_MS)
      }).catch(() => {});
    }
    
    const adminsSnap = await db.collection('telecard_admin').get();
    if (adminsSnap.empty) return;
    
    let allValidTokens = [];
    const adminDocsToClean = [];
    
    adminsSnap.forEach(docSnap => {
      const adminData = docSnap.data();
      if ((adminData.pushPrefs || {})[alertType] !== false) {
        const tokens = adminData.fcmTokens || [];
        if (Array.isArray(tokens) && tokens.length > 0) {
          allValidTokens.push(...tokens);
          adminDocsToClean.push({ ref: docSnap.ref, currentTokens: tokens });
        }
      }
    });
    
    allValidTokens = [...new Set(allValidTokens)];
    if (allValidTokens.length === 0) return;
    if (allValidTokens.length > 500) allValidTokens = allValidTokens.slice(0, 500);
    
    const safeDataPayload = {};
    if (payloadData && typeof payloadData === 'object') {
      for (const [k, v] of Object.entries(payloadData)) {
        if (v !== undefined && v !== null) safeDataPayload[k] = String(v);
      }
    }
    
    const response = await admin.messaging().sendEachForMulticast({
      notification: { title, body },
      data: safeDataPayload,
      tokens: allValidTokens
    });
    
    if (response.failureCount > 0) {
      const failedTokens = response.responses
        .map((r, i) => (!r.success && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(r.error?.code)) ? allValidTokens[i] : null)
        .filter(Boolean);
      
      if (failedTokens.length > 0) {
        const batch = db.batch();
        let hasCleanup = false;
        adminDocsToClean.forEach(adminDoc => {
          const tokensToRemove = adminDoc.currentTokens.filter(t => failedTokens.includes(t));
          if (tokensToRemove.length > 0) {
            batch.update(adminDoc.ref, { fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove) });
            hasCleanup = true;
          }
        });
        if (hasCleanup) await batch.commit().catch(() => {});
      }
    }
  } catch (e) {
    console.error("Admin FCM Dispatch Error:", e);
  }
}
};

module.exports = Object.freeze(SecurityEngineDef);