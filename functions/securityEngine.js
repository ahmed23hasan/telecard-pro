// ============================================================================
// 🛡️ محرك الحماية والأدوات المركزية (Security & Utility Engine) - النسخة V1.1.0 💎
// 🎯 الوظيفة: درع الحماية ضد ثغرات (XSS, SSRF)، التشفير، وإدارة التزامن العالي.
// 🚀 التحديثات المعمارية (V1.1.0 - IPv6 Compatibility & SSRF Patch):
// 1. IPv6 Support 🌐: دعم كامل لاتصالات IPv6 الشرعية مع حظر النطاقات الداخلية الخاصة بها.
// 2. Native Net Module 🛡️: استبدال الـ Regex بمكتبة net المدمجة لفحص العناوين بدقة وموثوقية أعلى.
// ============================================================================

const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net'); // 🛡️ استدعاء مكتبة الشبكات المدمجة للتحقق الدقيق من الـ IP

const SecurityEngineDef = {
  
  // ========================================================================
  // 🧹 القسم الأول: تعقيم البيانات (Data Sanitization & Cloning)
  // ========================================================================
  
  /**
   * تنظيف النصوص من أكواد HTML/JS لمنع ثغرات (XSS)
   * @param {string} text النص المراد تنظيفه
   * @param {number} maxLength الحد الأقصى للنص (لمنع هجمات استنزاف الذاكرة)
   */
  sanitizeText: function(text, maxLength = null) {
    if (!text || typeof text !== 'string') return '';
    let cleanText = text.replace(/[<&>"']/g, function(c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;' } [c];
    }).trim();
    
    if (maxLength && cleanText.length > maxLength) {
      cleanText = cleanText.substring(0, maxLength);
    }
    return cleanText;
  },
  
  /**
   * استنساخ الكائنات بأمان (Deep Clone) لمنع تعديل المراجع الأصلية (Prototype Pollution)
   * متوافق مع كائنات Firestore (Timestamp, GeoPoint)
   */
  safeClone: function(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    
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
  // 🌐 القسم الثاني: حماية الشبكات والاتصالات (SSRF Protection)
  // ========================================================================
  
  /**
   * فحص عنوان IP للتأكد من أنه ليس عنواناً داخلياً (يدعم IPv4 و IPv6)
   */
  isPrivateIP: function(ip) {
    if (!net.isIP(ip)) return true; // إذا لم يكن IP صالحاً، نعتبره غير آمن

    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map(Number);
      if (parts[0] === 0) return true; // 0.0.0.0/8 (Local / Any)
      if (parts[0] === 10) return true; // Class A
      if (parts[0] === 127) return true; // Loopback
      if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // Carrier-Grade NAT (GCP/AWS internal)
      if (parts[0] === 169 && parts[1] === 254) return true; // Link-local (Cloud Metadata APIs)
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // Class B
      if (parts[0] === 192 && parts[1] === 168) return true; // Class C
      if (parts[0] >= 224) return true; // Multicast & Reserved
      return false;
    }

    if (net.isIPv6(ip)) {
      const lowerIp = ip.toLowerCase();
      if (lowerIp === '::1') return true; // Loopback
      // Unique Local Addresses (fc00::/7)
      if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return true; 
      // Link-local (fe80::/10)
      if (lowerIp.startsWith('fe8') || lowerIp.startsWith('fe9') || lowerIp.startsWith('fea') || lowerIp.startsWith('feb')) return true; 
      // IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1)
      if (lowerIp.startsWith('::ffff:')) {
        const v4Part = lowerIp.split('::ffff:')[1];
        if (net.isIPv4(v4Part)) return SecurityEngineDef.isPrivateIP(v4Part);
      }
      return false;
    }

    return true; 
  },

  /**
   * الفحص الأمني الشامل للروابط الخارجية (Webhooks & Suppliers)
   */
  isSafeUrlAsync: async function(urlString) {
    try {
      const parsedUrl = new URL(urlString);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return { isSafe: false, reason: 'Unsupported protocol', ip: null };
      }
      
      const hostname = parsedUrl.hostname.toLowerCase();
      
      // حظر أسماء النطاقات الداخلية الصريحة
      if (hostname.includes('localhost') || hostname.includes('internal')) {
        return { isSafe: false, reason: 'Suspicious internal hostname', ip: null };
      }
      
      // 🛡️ السماح بحل العناوين لـ IPv4 و IPv6 عبر family: 0
      const lookupRes = await dns.lookup(hostname, { family: 0 });
      const resolvedIp = lookupRes.address;
      
      if (SecurityEngineDef.isPrivateIP(resolvedIp)) {
        return { isSafe: false, reason: 'Resolves to private/internal IP', ip: null };
      }
      
      return { isSafe: true, ip: resolvedIp, parsedUrl: parsedUrl };
    } catch (e) {
      return { isSafe: false, reason: 'Invalid URL or DNS failure', ip: null };
    }
  },
  
  // ========================================================================
  // 🔐 القسم الثالث: التشفير والمعرفات (Cryptography & IDs)
  // ========================================================================
  
  /**
   * توليد Hash أحادي الاتجاه (SHA-256)
   */
  generateSha256Hash: function(data) {
    const stringData = typeof data === 'object' ? JSON.stringify(data) : String(data).trim();
    return crypto.createHash('sha256').update(stringData).digest('hex');
  },
  
  /**
   * توليد توقيع رقمي (HMAC-SHA256) لحماية الـ Webhooks
   */
  generateHmacSignature: function(payload, secret) {
    if (!secret || String(secret).trim() === '') return null;
    const dataString = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
    return crypto.createHmac('sha256', String(secret)).update(dataString).digest('hex');
  },
  
  /**
   * توليد معرفات فريدة آمنة وموزعة زمنياً (تمنع التكرار)
   */
  generateUniqueId: function(prefix = 'TC') {
    const timeBase36 = Date.now().toString(36).toUpperCase();
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${timeBase36}-${randomHex}`;
  },
  
  // ========================================================================
  // 🔄 القسم الرابع: إدارة التزامن والضغط (Concurrency Management)
  // ========================================================================
  
  /**
   * مغلف آمن (Wrapper) لإعادة المحاولة عند تضارب العمليات الشرائية (Flash Sales)
   */
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
          (error.message && error.message.includes('Aborted due to cross-transaction'));
        
        if (isContention) {
          if (attempt >= maxAttempts) {
            throw new Error(`HIGH_TRAFFIC_COLLISION:${operationName}`);
          }
          // Exponential Backoff: تأخير زمني يتضاعف تدريجياً لفك الاختناق (Jitter)
          const backoffTime = Math.floor(Math.random() * 150) + (attempt * 150);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        } else {
          throw error;
        }
      }
    }
    return result;
  }
};

module.exports = Object.freeze(SecurityEngineDef);
