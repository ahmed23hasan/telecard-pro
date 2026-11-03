// ============================================================================
// 👤 منشئ ملفات المستخدمين القياسي (utils/UserBuilder.js) - النسخة الماسية V16.1.0 💎
// 🎯 الوظيفة: توحيد بناء مستند العميل الجديد وحمايته من نقص الحقول والفهرسة.
// 🚀 التحديث (V16.1.0 - Causal Tier Climbs Schema & Firewall Alignment): 
// 1. حقن حقول الجدار الناري والتقييد (isRestricted, devicePrints, lastIp).
// 2. اعتماد دفتر الترقيات الزمني (tierClimbs) وإزالة الحقول الملغاة.
// 3. توحيد حقل الدولة في حقل قياسي واحد (country) لمنع ازدواجية البيانات والفهارس.
// ============================================================================

const admin = require('firebase-admin');

class UserBuilder {
  /**
   * بناء الهيكل القياسي الموحد للمستخدم الجديد
   * @param {Object} params بيانات إنشاء الحساب الأساسية
   * @returns {Object} كائن Firestore الجاهز للحفظ
   */
  static buildInitialProfile({ uid, email, name, tierId = 'TIER_DEFAULT', isApiMerchant = false }) {
    const safeUid = String(uid || '');
    const safeEmail = email ? String(email).trim().toLowerCase() : '';
    const emailPrefix = safeEmail ? safeEmail.split('@')[0] : 'user';
    const rawName = name ? String(name).replace(/[<>"']/g, '').trim().substring(0, 100) : emailPrefix || 'عميل جديد';
    const firstName = rawName.split(' ')[0] || 'عميل';
    
    // توليد اسم مستخدم احتياطي فريد (يدعم الأسماء العربية بالعودة لبادئة الإيميل)
    const latinBase = firstName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '') || emailPrefix.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10) || 'user';
    const fallbackUsername = latinBase + safeUid.substring(0, 4);
   // 🛡️ [توليد المعرف المختصر للبحث]: حرفان + 6 أرقام (8 خانات ثابتة مثل MK482915)
   
    let h1 = 2166136261, h2 = 5381;
    for (let i = 0; i < safeUid.length; i++) {
      const c = safeUid.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = (Math.imul(h2, 33) ^ c) >>> 0;
    }
    const displayId = `${String.fromCharCode(65 + (h1 % 26))}${String.fromCharCode(65 + ((h1 >>> 8) % 26))}${100000 + (h2 % 900000)}`;    const resolvedTierId = String(tierId || 'TIER_DEFAULT');
    
    return {
      id: safeUid,
      uid: safeUid,
      displayId: displayId,
      email: safeEmail,
      fullName: rawName,
      firstName: firstName,
      lastName: rawName.split(' ').slice(1).join(' ') || '',
      username: fallbackUsername,
      role: 'user',
      
      // المحفظة والأموال
      walletBalance: 0.0,
      totalSpent: 0.0,
      totalDeposit: 0.0,
      
      // 🛡️ المستويات ودفتر الترقيات الزمني (بدون أي تواريخ انتهاء أو هبوط زمني)
      tierId: resolvedTierId,
      cycleStartTierId: resolvedTierId,
      tierClimbs: [],
      tierCycleSpent: 0.0,
      manualTierOverride: false,
      
      // 🛡️ [إصلاح الفهرسة الحرج]: ضروري لظهور العميل في استعلام الترتيب حسب الطلبات (orders_all)
      totalOrdersCount: 0,
      usedCoupons: {},
      
      // 🛡️ الأمان، التقييد، والحظر (Firewall Ready)
      isBanned: false,
      isIpBanned: false,
      isRestricted: false,
      isDeleted: false,
      banReason: '',
      devicePrints: [], // تجهيز مصفوفة البصمات لرادار الحسابات المتعددة
      lastIp: '', // تجهيز حقل الـ IP للجدار الناري
      
      // العملة والتحقق (KYC) - حقل country موحد وقياسي
      baseCurrency: 'USD',
      country: '',
      phone: '',
      isVerified: false,
      kycStatus: 'none',
      
      // قنوات الـ API والنشاط
      isApiMerchant: Boolean(isApiMerchant),
      isDormant: false,
      
      // 🛡️ [إصلاح التدقيق المالي]: يضبط على 0 وليس اللحظة الحالية حتى لا يسرق فحص الحسابات النشطة
      lastOrderTime: 0,
      
      // الإشعارات
      fcmTokens: [],
      
      // التواريخ الزمنية (دورة تجميع العميل تبدأ فور التسجيل ولا تنتهي بهبوط أبداً)
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      tierCycleStartDate: admin.firestore.FieldValue.serverTimestamp(),
      tierStreakStartDate: admin.firestore.FieldValue.serverTimestamp()
    };
  }
}

module.exports = UserBuilder;