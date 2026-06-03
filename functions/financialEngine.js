// ============================================================================
// 💰 المحرك المالي المركزي (Cloud Version - Node.js) - Master Engine
// 🎯 الوظيفة: حساب الأسعار بأمان تام داخل بيئة السيرفر بنظام Integer Math
// 🌟 التحديث الأقصى: تطبيق الرياضيات الآمنة (x10000) لمنع أخطاء الفواصل العشرية
// ============================================================================

var FinancialEngineDef = {

  // 🛡️ دوال الرياضيات الآمنة الداخلية (Integer Math)
  safeAdd: function(a, b) {
    return Math.round(Number(a) * 10000 + Number(b) * 10000) / 10000;
  },
  
  safeSub: function(a, b) {
    return Math.round(Number(a) * 10000 - Number(b) * 10000) / 10000;
  },
  
  safeMul: function(a, b) {
    return Math.round(Number(a) * Number(b) * 10000) / 10000;
  },

  normalizeRates: function(raw) {
    var rates = Array.isArray(raw) ? raw : [];
    var hasBase = false;
    for (var i = 0; i < rates.length; i++) {
      if (rates[i].isBase) {
        hasBase = true;
        break;
      }
    }
    if (!hasBase) {
      rates.unshift({ code: 'USD', symbol: '$', name: 'دولار أمريكي', priceRate: 1, depRate: 1, isBase: true });
    }
    return rates;
  },

  convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel) {
    var ch = channel || 'pricing';
    var rates = this.normalizeRates(ratesArray);
    var amt = Number(amount) || 0;
    if (!fromCode || !toCode || fromCode === toCode) return amt;
    
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
    
    // استخدام التحويل المباشر مع التقريب الآمن لـ 4 خانات
    var inUSD = amt / (fromRate || 1);
    var finalAmount = this.safeMul(inUSD, (toRate || 1));
    return finalAmount;
  },

  _getFirstValid: function() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined && arguments[i] !== null) {
        return arguments[i];
      }
    }
    return 0;
  },

  calculatePrice: function(params) {
    var p = params || {};
    var cost = Number(p.costPrice) || 0;
    var fixed = Number(p.fixedPrice) || 0;
    var tier = p.tier || null;
    var offer = p.offer || null;
    var coupon = p.coupon || null;
    
    var currentPrice = cost;
    var tierName = null;
    
    var extractNum = function(val) {
      if (val === undefined || val === null || val === '') return 0;
      var cleanStr = String(val).replace(/[^0-9.-]/g, '');
      var num = parseFloat(cleanStr);
      return isNaN(num) ? 0 : num;
    };
    
    if (fixed > 0) {
      currentPrice = fixed;
      tierName = "سعر ثابت";
    } else if (tier && typeof tier === 'object') {
      tierName = tier.nameAr || tier.name || tier.id || 'عضو';
      
      var profitPercent = extractNum(
        this._getFirstValid(
          tier.profitPercent, tier.profit_percent,
          tier.profitMargin, tier.profit_margin,
          tier.profit, tier.margin, tier.percentage
        )
      );
      
      var minProfitUsd = extractNum(
        this._getFirstValid(
          tier.minProfitUsd, tier.min_profit_usd,
          tier.minProfit, tier.min_profit, tier.minUsd
        )
      );
      
      if (profitPercent > 0 || minProfitUsd > 0) {
        // حساب الربح بطريقة آمنة
        var profitAdded = this.safeMul(cost, profitPercent / 100);
        if (profitAdded < minProfitUsd) {
          profitAdded = minProfitUsd;
        }
        currentPrice = this.safeAdd(currentPrice, profitAdded);
      }
    }
    
    var tierPrice = currentPrice;
    var originalPrice = tierPrice;
    
    var offerName = null;
    var offerDiscount = 0;
    if (offer && offer.type !== 'fake') {
      offerName = offer.name;
      var offerVal = extractNum(offer.value);
      if (offer.type === 'percentage') {
        offerDiscount = this.safeMul(originalPrice, offerVal / 100);
      } else if (offer.type === 'fixed' || offer.type === 'amount') {
        offerDiscount = offerVal;
      }
      currentPrice = Math.max(0, this.safeSub(currentPrice, offerDiscount));
    }
    
    var couponCode = null;
    var couponDiscount = 0;
    if (coupon) {
      couponCode = coupon.code;
      var couponVal = extractNum(coupon.value);
      if (coupon.type === 'percentage') {
        couponDiscount = this.safeMul(currentPrice, couponVal / 100);
      } else if (coupon.type === 'fixed' || coupon.type === 'amount') {
        couponDiscount = couponVal;
      }
      currentPrice = Math.max(0, this.safeSub(currentPrice, couponDiscount));
    }
    
    var isFirewallActive = false;
    // حماية الأرباح (Firewall) باستخدام الطرح الآمن
    if (currentPrice < cost) {
      isFirewallActive = true;
      currentPrice = cost;
      
      var maxAllowedDiscount = Math.max(0, this.safeSub(originalPrice, cost));
      var totalRequestedDiscount = this.safeAdd(offerDiscount, couponDiscount);
      
      if (totalRequestedDiscount > 0) {
        var ratio = maxAllowedDiscount / totalRequestedDiscount;
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
      isFirewallActive: isFirewallActive
    };
  }
};

exports.FinancialEngine = Object.freeze(FinancialEngineDef);
