rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ==========================================
    // 🛠️ دوال التحقق الأساسية (النسخة المعززة بالشارات الأمنية)
    // ==========================================
    function isMasterAdmin() {
      // 🌟 تحقق فوري ومجاني وآمن من شارة الإدارة المشفرة داخل توكن تسجيل الدخول
      return request.auth != null && request.auth.token.admin == true;
    }

    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // ==========================================
    // 👥 إدارة المستخدمين (تمت حماية الأرصدة)
    // ==========================================
    match /telecard_users/{userId} {
      allow read: if isOwner(userId) || isMasterAdmin();
      
      allow update: if (isOwner(userId) 
                    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['walletBalance', 'balance', 'totalSpent', 'totalDeposit', 'tierId', 'tierCycleSpent'])) 
                    || isMasterAdmin();
                    
      allow create: if isOwner(userId) 
                    && request.resource.data.get('walletBalance', 0) == 0 
                    && request.resource.data.get('balance', 0) == 0;
                    
      allow delete: if isMasterAdmin();
    }

    // ==========================================
    // 🌐 المجموعات العامة (للعرض فقط)
    // ==========================================
    match /telecard_tiers/{docId} { allow read: if true; allow write: if isMasterAdmin(); }
    match /telecard_cats/{docId} { allow read: if true; allow write: if isMasterAdmin(); }
    match /telecard_settings/{docId} { allow read: if true; allow write: if isMasterAdmin(); }
    match /telecard_alerts/{docId} { allow read: if true; allow write: if isMasterAdmin(); }
    match /telecard_payments/{docId} { allow read: if true; allow write: if isMasterAdmin(); }
    match /telecard_banners/{docId} { allow read: if true; allow write: if isMasterAdmin(); }
    match /telecard_rates/{docId} { allow read: if true; allow write: if isMasterAdmin(); }
    match /telecard_countries/{docId} { allow read: if true; allow write: if isMasterAdmin(); }
    match /telecard_offers/{docId} { allow read: if true; allow write: if isMasterAdmin(); }

    // المجموعة العامة للمنتجات (النسخة المطهرة والآمنة التي لا تحتوي على التكلفة)
    match /telecard_prods_public/{docId} { allow read: if true; allow write: if isMasterAdmin(); }

    // ==========================================
    // 🔒 مجموعة المنتجات الأصلية (تحتوي على التكلفة)
    // ==========================================
    match /telecard_prods/{docId} {
      allow read, write: if isMasterAdmin();
    }

    // ==========================================
    // 🛒 الطلبات والإيداعات (مؤمنة بالكامل ضد التلاعب)
    // ==========================================
    match /telecard_orders/{docId} {
      // العميل يرى طلباته فقط، والأدمن يرى كل شيء
      allow read: if isOwner(resource.data.userId) || isMasterAdmin();
      
      // 🌟 [الدرع الأمني]: الخادم السحابي (Cloud Function) هو الوحيد المسموح له بإنشاء وتعديل الطلبات
      // هذا يمنع أي هكر من استخدام المتصفح لإنشاء طلبات بأسعار وهمية أو تخطي فحص الرصيد!
      allow write: if false; 
    }
    
    match /telecard_deposits/{docId} {
      allow read: if isOwner(resource.data.userId) || isMasterAdmin();
      
      // 🌟 [الدرع الأمني]: الخادم السحابي فقط مسموح له بإنشاء طلبات الإيداع عبر دالة submitBalanceRequest
      allow write: if false; 
    }
    
    match /telecard_coupons/{docId} {
      allow read: if true;
      allow write: if isMasterAdmin();
    }

    // ==========================================
    // 🔒 المجموعات شديدة الحساسية
    // ==========================================
    match /telecard_vault/{docId} { allow read, write: if isMasterAdmin(); }
    match /telecard_admin/{docId} { allow read, write: if isMasterAdmin(); }
    match /telecard_system/{docId} { allow read, write: if isMasterAdmin(); }
    match /telecard_logs/{docId} { allow read, write: if isMasterAdmin(); }
    
    match /telecard_kyc/{docId} {
       allow read: if isOwner(resource.data.userId) || isMasterAdmin();
       allow create: if isOwner(request.resource.data.userId);
       allow update, delete: if isMasterAdmin();
    }
    
    // ==========================================
    // 🔌 إدارة الموردين والمفاتيح السرية
    // ==========================================
    match /telecard_suppliers/{docId} {
      allow read, write: if isMasterAdmin();
      
      match /secrets/{secretId} {
         allow read: if false; 
         allow write: if isMasterAdmin(); 
      }
    }

    // ==========================================
    // 🛑 القاعدة الجدارية (Catch-all)
    // ==========================================
    match /{document=**} {
      allow read, write: if isMasterAdmin();
    }
    
  }
}