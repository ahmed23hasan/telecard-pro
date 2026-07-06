// ============================================================================
// 💰 المحرك المالي المركزي (Cloud Version - Node.js) - Master Engine V10.1 (Max Security)
// 🎯 الوظيفة: حساب الأسعار بأمان تام، حماية الأرباح، منع الخصم العكسي، وحماية الكميات
// 🌟 التحديث الأقصى: تطبيق معقم التكلفة، ودرع الكمية (Qty Shield) لحساب الفواتير الكلية
// ============================================================================

const FinancialEngineDef = {
  
  // 🛡️ دوال الرياضيات الآمنة الداخلية (محصنة ضد NaN و Infinity وثغرات الفواصل)
  safeAdd: function(a, b) {
    return Math.round((Number(a) || 0) * 10000 + (Number(b) || 0) * 10000) / 10000;
  },
  
  safeSub: function(a, b) {
    return Math.round((Number(a) || 0) * 10000 - (Number(b) || 0) * 10000) / 10000;
  },
  
  safeMul: function(a, b) {
    return Math.round((Number(a) || 0) * (Number(b) || 0) * 10000) / 10000;
  },
  
  safeDiv: function(a, b) {
    const numA = Number(a) || 0;
    let numB = Number(b);
    if (isNaN(numB) || numB === 0) numB = 1; // منع قطعي للقسمة على صفر (تمنع ثغرة Crash السيرفر)
    return Math.round((numA / numB) * 10000) / 10000;
  },
  
  // 🛡️ استخراج الأرقام بقواعد رياضية صارمة (Absolute Math) لمنع الحقن السالب
  extractNum: function(val) {
    if (val === undefined || val === null || val === '') return 0;
    const num = Number(val);
    // إذا أرسل الهاكر نصاً (NaN) نرجع 0، وإذا أرسل سالباً نرجعه موجباً إجبارياً
    return isNaN(num) ? 0 : Math.abs(num);
  },
  
  // 🛡️ نسخ المصفوفة قبل التعديل عليها (منع Memory Leak و Prototype Pollution)
  normalizeRates: function(raw) {
    var rates = Array.isArray(raw) ? [...raw] : [];
    var hasBase = false;
    for (var i = 0; i < rates.length; i++) {
      if (rates[i].isBase) {
        hasBase = true;
        break;
      }
    }
    if (!hasBase) {
      rates.unshift({ code: 'USD', symbol: '$', name: 'US Dollar', priceRate: 1, depRate: 1, isBase: true });
    }
    return rates;
  },
  
  convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel) {
    var ch = channel || 'pricing';
    var rates = this.normalizeRates(ratesArray);
    var amt = Number(amount) || 0;
    
    // إذا كان المبلغ 0 أو العملات متطابقة، لا ترهق السيرفر بالعمليات
    if (amt === 0 || !fromCode || !toCode || String(fromCode).toUpperCase() === String(toCode).toUpperCase()) return amt;
    
    var fromCurr = { priceRate: 1, depRate: 1 };
    var toCurr = { priceRate: 1, depRate: 1 };
    
    for (var i = 0; i < rates.length; i++) {
      if (String(rates[i].code).toUpperCase() === String(fromCode).toUpperCase()) {
        fromCurr = rates[i];
      }
      if (String(rates[i].code).toUpperCase() === String(toCode).toUpperCase()) {
        toCurr = rates[i];
      }
    }
    
    var fromRate = ch === 'deposit' ? fromCurr.depRate : fromCurr.priceRate;
    var toRate = ch === 'deposit' ? toCurr.depRate : toCurr.priceRate;
    
    var inUSD = this.safeDiv(amt, fromRate);
    var finalAmount = this.safeMul(inUSD, toRate || 1);
    
    return finalAmount;
  },
  
  // ==========================================
  // 🚀 المحرك المالي الذكي لحساب "القطعة الواحدة" (Unit Price)
  // ==========================================
  calculatePrice: function(params) {
    var p = params || {};
    var product = p.product || {};
    var tier = p.tier || null;
    var offer = p.offer || null;
    var coupon = p.coupon || null;
    var optIdx = p.optIdx !== undefined ? p.optIdx : null;
    
    // 🛡️ [تحديث أمني]: استخدام extractNum لمنع أخطاء الإدارة (مثلاً وضع تكلفة بالسالب بالخطأ)
    var cost = this.extractNum(product.costPrice || product.cost_price || 0);
    var isFixed = (product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true');
    var activeOption = null;
    
    // دعم نظام الباقات (Options) بأمان
    if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null && product.options[optIdx]) {
      activeOption = product.options[optIdx];
      cost = this.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
      if (activeOption.isFixedPrice !== undefined) {
        isFixed = (activeOption.isFixedPrice === true || String(activeOption.isFixedPrice).toLowerCase() === 'true');
      }
    }
    
    var baseSellingPrice = 0;
    
    if (isFixed) {
      baseSellingPrice = activeOption ? this.extractNum(activeOption.fixedPriceUsd || activeOption.price || 0) : this.extractNum(product.fixedPriceUsd || product.fixed_price_usd || 0);
    } else if (tier && typeof tier === 'object') {
      if (activeOption && activeOption.tierPrices && activeOption.tierPrices[tier.id]) {
        baseSellingPrice = this.extractNum(activeOption.tierPrices[tier.id]);
      } else if (!activeOption && product.tierPrices && product.tierPrices[tier.id]) {
        baseSellingPrice = this.extractNum(product.tierPrices[tier.id]);
      } else {
        var basePriceForMath = activeOption ? this.extractNum(activeOption.price || 0) : this.extractNum(product.price || 0);
        
        // 🛡️ [تحديث أمني]: منع هوامش الربح السالبة
        var profitPercent = this.extractNum(tier.profitPercent || tier.profit_percent || tier.profitMargin || 0);
        var minProfitUsd = this.extractNum(tier.minProfitUsd || tier.min_profit_usd || tier.minProfit || 0);
        
        if (profitPercent > 0 || minProfitUsd > 0) {
          var profitAdded = this.safeMul(cost, profitPercent / 100);
          if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
          baseSellingPrice = this.safeAdd(cost, profitAdded);
        } else {
          baseSellingPrice = basePriceForMath;
        }
      }
    } else {
      baseSellingPrice = activeOption ? this.extractNum(activeOption.price || 0) : this.extractNum(product.price || 0);
    }
    
    var tierPrice = Number(baseSellingPrice) || 0;
    var currentPrice = tierPrice;
    var originalPrice = tierPrice;
    var tierName = tier ? (tier.nameAr || tier.name || tier.id || 'عضو') : (isFixed ? 'سعر ثابت' : null);
    
    // 2. تطبيق خصومات العروض النشطة
    var offerName = null;
    var offerDiscount = 0;
    if (offer && offer.type !== 'fake') {
      offerName = offer.name;
      var offerVal = this.extractNum(offer.value);
      if (offer.type === 'percentage') {
        offerDiscount = this.safeMul(originalPrice, offerVal / 100);
      } else if (offer.type === 'fixed' || offer.type === 'amount') {
        offerDiscount = offerVal;
      }
      currentPrice = Math.max(0, this.safeSub(currentPrice, offerDiscount));
    }
    
    // 3. تطبيق خصومات الكوبونات
    var couponCode = null;
    var couponDiscount = 0;
    var isFirewallActive = false;
    var isFirewallViolated = false; // 🚩 مؤشر أمني لرفض العمليات المشبوهة
    
    if (product.disableCoupons === true || isFixed) {
      isFirewallActive = true;
    } else if (coupon) {
      couponCode = coupon.code;
      var couponVal = this.extractNum(coupon.value);
      if (coupon.type === 'percentage') {
        couponDiscount = this.safeMul(currentPrice, couponVal / 100);
      } else if (coupon.type === 'fixed' || coupon.type === 'amount') {
        couponDiscount = couponVal;
      }
      currentPrice = Math.max(0, this.safeSub(currentPrice, couponDiscount));
    }
    
    // 🛡️ الجدار الناري المتقدم (Profit Protection Firewall)
    if (currentPrice < cost) {
      isFirewallActive = true;
      isFirewallViolated = true; // 🚨 إشارة للدالة الأم للتعامل مع العملية الخبيثة!
      
      currentPrice = cost; // التعديل الآمن
      
      var maxAllowedDiscount = Math.max(0, this.safeSub(originalPrice, cost));
      var totalRequestedDiscount = this.safeAdd(offerDiscount, couponDiscount);
      
      if (totalRequestedDiscount > 0) {
        var ratio = this.safeDiv(maxAllowedDiscount, totalRequestedDiscount);
        offerDiscount = this.safeMul(offerDiscount, ratio);
        couponDiscount = this.safeMul(couponDiscount, ratio);
      }
    }
    
    var finalPrice = currentPrice;
    var totalDiscountVal = this.safeAdd(offerDiscount, couponDiscount);
    var profit = Math.max(0, this.safeSub(finalPrice, cost));
    var marginPct = cost > 0 ? (profit / cost) * 100 : 0;
    
    return {
      cost: cost,
      tierPrice: tierPrice,
      originalPrice: originalPrice,
      finalPrice: finalPrice,
      tierName: tierName,
      offerName: offerName,
      offerDiscount: offerDiscount,
      couponCode: couponCode,
      couponDiscount: couponDiscount,
      totalDiscountVal: totalDiscountVal,
      profit: profit,
      marginPct: Number(marginPct.toFixed(2)),
      isFirewallActive: isFirewallActive,
      isFirewallViolated: isFirewallViolated
    };
  },
  
  // ==========================================
  // 🛡️ [الدرع الجديد]: الدالة التي يجب استدعاؤها لحساب إجمالي الفاتورة
  // ==========================================
  calculateOrderTotal: function(params, rawQty) {
    // 1. فلترة الكمية (الكسور، الصفر، السوالب مرفوضة تماماً)
    // أمثلة: (0.5 => 1)، (-5 => 1)، ("abc" => 1)، (5 => 5)
    const safeQty = Math.max(1, Math.floor(Number(rawQty) || 1));
    
    // 2. حساب سعر القطعة الواحدة
    const unitMath = this.calculatePrice(params);
    
    // 3. إرجاع النتيجة مضروبة في الكمية بأمان
    return {
      ...unitMath, // تفاصيل القطعة الواحدة (للأرشفة)
      qty: safeQty, // الكمية المعتمدة (يجب حفظها في الداتابيز)
      
      // الإجماليات (Totals)
      totalCost: this.safeMul(unitMath.cost, safeQty),
      totalOriginalPrice: this.safeMul(unitMath.originalPrice, safeQty),
      totalFinalPrice: this.safeMul(unitMath.finalPrice, safeQty),
      totalProfit: this.safeMul(unitMath.profit, safeQty),
      totalDiscountVal: this.safeMul(unitMath.totalDiscountVal, safeQty)
    };
  }
};

// إغلاق الكائن لمنع ثغرات تعديل النماذج في بيئة Node.js (Prototype Pollution)
exports.FinancialEngine = Object.freeze(FinancialEngineDef);