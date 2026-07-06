// ============================================================================
// 💰 المحرك المالي المركزي (Cloud Version - Node.js) - Master Engine V10.2 (Max Security)
// 🎯 الوظيفة: حساب الأسعار بأمان تام، حماية الأرباح، منع الخصم العكسي، وحماية الكميات
// 🌟 التحديث الأقصى: تطبيق معقم التكلفة (Strict Extract)، وتسريع البحث O(1)، واعتماد ES6
// ============================================================================

const FinancialEngineDef = {
  
  // 🛡️ دوال الرياضيات الآمنة الداخلية
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
    if (isNaN(numB) || numB === 0) numB = 1; 
    return Math.round((numA / numB) * 10000) / 10000;
  },
  
  // 🛡️ [تحديث أمني]: معقم الأرقام الصارم (Strict Number Sanitizer)
  extractNum: function(val) {
    if (val === undefined || val === null || val === '') return 0;
    const num = Number(val);
    if (isNaN(num)) return 0;
    if (num < 0) {
        // 🚨 إطلاق إنذار في سجلات السيرفر عند رصد قيمة سالبة مجهولة المصدر
        console.warn(`[SECURITY WARNING] Attempted negative value injection blocked: ${num}`);
        return 0; 
    }
    return num;
  },
  
  // 🛡️ [تحديث الأداء]: تحويل المصفوفة إلى Dictionary لسرعة O(1)
  normalizeRates: function(raw) {
    const ratesArray = Array.isArray(raw) ? raw : [];
    const ratesMap = {};
    let hasBase = false;
    
    for (const rate of ratesArray) {
        if (rate && rate.code) {
            ratesMap[String(rate.code).toUpperCase()] = rate;
            if (rate.isBase) hasBase = true;
        }
    }
    
    if (!hasBase) {
        ratesMap['USD'] = { code: 'USD', symbol: '$', name: 'US Dollar', priceRate: 1, depRate: 1, isBase: true };
    }
    return ratesMap;
  },
  
  convertViaUSD: function(amount, fromCode, toCode, ratesArray, channel = 'pricing') {
    const amt = Number(amount) || 0;
    
    if (amt === 0 || !fromCode || !toCode || String(fromCode).toUpperCase() === String(toCode).toUpperCase()) return amt;
    
    const ratesMap = this.normalizeRates(ratesArray);
    
    const fromCurr = ratesMap[String(fromCode).toUpperCase()] || { priceRate: 1, depRate: 1 };
    const toCurr = ratesMap[String(toCode).toUpperCase()] || { priceRate: 1, depRate: 1 };
    
    const fromRate = channel === 'deposit' ? fromCurr.depRate : fromCurr.priceRate;
    const toRate = channel === 'deposit' ? toCurr.depRate : toCurr.priceRate;
    
    const inUSD = this.safeDiv(amt, fromRate);
    return this.safeMul(inUSD, toRate || 1);
  },
  
  calculatePrice: function(params = {}) {
    const product = params.product || {};
    const tier = params.tier || null;
    const offer = params.offer || null;
    const coupon = params.coupon || null;
    const optIdx = params.optIdx !== undefined ? params.optIdx : null;
    
    let cost = this.extractNum(product.costPrice || product.cost_price || 0);
    let isFixed = (product.isFixedPrice === true || String(product.isFixedPrice).toLowerCase() === 'true');
    let activeOption = null;
    
    if (product.type === 'select' && Array.isArray(product.options) && optIdx !== null && product.options[optIdx]) {
      activeOption = product.options[optIdx];
      cost = this.extractNum(activeOption.costPrice || activeOption.cost_price || cost);
      if (activeOption.isFixedPrice !== undefined) {
        isFixed = (activeOption.isFixedPrice === true || String(activeOption.isFixedPrice).toLowerCase() === 'true');
      }
    }
    
    let baseSellingPrice = 0;
    
    if (isFixed) {
      baseSellingPrice = activeOption ? this.extractNum(activeOption.fixedPriceUsd || activeOption.price || 0) : this.extractNum(product.fixedPriceUsd || product.fixed_price_usd || 0);
    } else if (tier && typeof tier === 'object') {
      if (activeOption && activeOption.tierPrices && activeOption.tierPrices[tier.id]) {
        baseSellingPrice = this.extractNum(activeOption.tierPrices[tier.id]);
      } else if (!activeOption && product.tierPrices && product.tierPrices[tier.id]) {
        baseSellingPrice = this.extractNum(product.tierPrices[tier.id]);
      } else {
        const basePriceForMath = activeOption ? this.extractNum(activeOption.price || 0) : this.extractNum(product.price || 0);
        
        const profitPercent = this.extractNum(tier.profitPercent || tier.profit_percent || tier.profitMargin || 0);
        const minProfitUsd = this.extractNum(tier.minProfitUsd || tier.min_profit_usd || tier.minProfit || 0);
        
        if (profitPercent > 0 || minProfitUsd > 0) {
          let profitAdded = this.safeMul(cost, profitPercent / 100);
          if (profitAdded < minProfitUsd) profitAdded = minProfitUsd;
          baseSellingPrice = this.safeAdd(cost, profitAdded);
        } else {
          baseSellingPrice = basePriceForMath;
        }
      }
    } else {
      baseSellingPrice = activeOption ? this.extractNum(activeOption.price || 0) : this.extractNum(product.price || 0);
    }
    
    const tierPrice = Number(baseSellingPrice) || 0;
    let currentPrice = tierPrice;
    const originalPrice = tierPrice;
    const tierName = tier ? (tier.nameAr || tier.name || tier.id || 'عضو') : (isFixed ? 'سعر ثابت' : null);
    
    let offerName = null;
    let offerDiscount = 0;
    if (offer && offer.type !== 'fake') {
      offerName = offer.name;
      const offerVal = this.extractNum(offer.value);
      if (offer.type === 'percentage') {
        offerDiscount = this.safeMul(originalPrice, offerVal / 100);
      } else if (offer.type === 'fixed' || offer.type === 'amount') {
        offerDiscount = offerVal;
      }
      currentPrice = Math.max(0, this.safeSub(currentPrice, offerDiscount));
    }
    
    let couponCode = null;
    let couponDiscount = 0;
    let isFirewallActive = false;
    let isFirewallViolated = false; 
    
    if (product.disableCoupons === true || isFixed) {
      isFirewallActive = true;
    } else if (coupon) {
      couponCode = coupon.code;
      const couponVal = this.extractNum(coupon.value);
      if (coupon.type === 'percentage') {
        couponDiscount = this.safeMul(currentPrice, couponVal / 100);
      } else if (coupon.type === 'fixed' || coupon.type === 'amount') {
        couponDiscount = couponVal;
      }
      currentPrice = Math.max(0, this.safeSub(currentPrice, couponDiscount));
    }
    
    if (currentPrice < cost) {
      isFirewallActive = true;
      isFirewallViolated = true; 
      
      currentPrice = cost; 
      
      const maxAllowedDiscount = Math.max(0, this.safeSub(originalPrice, cost));
      const totalRequestedDiscount = this.safeAdd(offerDiscount, couponDiscount);
      
      if (totalRequestedDiscount > 0) {
        const ratio = this.safeDiv(maxAllowedDiscount, totalRequestedDiscount);
        offerDiscount = this.safeMul(offerDiscount, ratio);
        couponDiscount = this.safeMul(couponDiscount, ratio);
      }
    }
    
    const finalPrice = currentPrice;
    const totalDiscountVal = this.safeAdd(offerDiscount, couponDiscount);
    const profit = Math.max(0, this.safeSub(finalPrice, cost));
    const marginPct = cost > 0 ? (profit / cost) * 100 : 0;
    
    return {
      cost,
      tierPrice,
      originalPrice,
      finalPrice,
      tierName,
      offerName,
      offerDiscount,
      couponCode,
      couponDiscount,
      totalDiscountVal,
      profit,
      marginPct: Number(marginPct.toFixed(2)),
      isFirewallActive,
      isFirewallViolated
    };
  },
  
  calculateOrderTotal: function(params, rawQty) {
    const safeQty = Math.max(1, Math.floor(Number(rawQty) || 1));
    const unitMath = this.calculatePrice(params);
    
    return {
      ...unitMath, 
      qty: safeQty, 
      totalCost: this.safeMul(unitMath.cost, safeQty),
      totalOriginalPrice: this.safeMul(unitMath.originalPrice, safeQty),
      totalFinalPrice: this.safeMul(unitMath.finalPrice, safeQty),
      totalProfit: this.safeMul(unitMath.profit, safeQty),
      totalDiscountVal: this.safeMul(unitMath.totalDiscountVal, safeQty)
    };
  }
};

exports.FinancialEngine = Object.freeze(FinancialEngineDef);
